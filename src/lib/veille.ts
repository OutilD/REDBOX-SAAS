import { transaction } from "@/db";
import { signaler } from "./notifications";

/**
 * LA RONDE : QUELLE MACHINE S'EST TUE ?
 *
 * Une RedBox dit elle-meme ce qu'elle vit — sauf quand elle s'eteint. Une
 * coupure de courant, un routeur debranche : elle ne peut pas prevenir, par
 * definition. C'est donc la console qui s'en apercoit, en faisant une ronde :
 * toute machine appairee dont on n'a plus de nouvelles depuis SILENCE_MS est
 * annoncee dans son salon, et sur les telephones.
 *
 * LE MEME SEUIL QUE LA PASTILLE « EN LIGNE » (`enLigne`, quinze minutes) : une
 * machine ne doit jamais etre « en ligne » sur la page et « hors ligne » dans
 * le salon.
 *
 * UNE SEULE FOIS PAR SILENCE, SANS COLONNE DE PLUS. On n'annonce que si le
 * salon de la machine ne l'a pas deja dit depuis sa derniere nouvelle. Des
 * qu'elle reparle, son releve le dit (« De retour ») et le silence suivant
 * pourra etre annonce a son tour.
 *
 * Ni les bornes de demonstration, qui ne vivent que quand on regarde leur
 * compte, ni celles muettes depuis plus de deux jours : une machine rangee au
 * garage n'a pas a etre annoncee le jour ou cette ronde demarre.
 */
export const SILENCE_MS = 15 * 60 * 1000;

/** Fait une ronde. Rend le nombre de machines annoncees. */
export async function veiller(): Promise<number> {
  const tues = await transaction(async (c) => {
    // Un seul processus fait la ronde a la fois : deux rondes simultanees
    // annonceraient deux fois la meme machine.
    const verrou = await c.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock(4247001) AS ok");
    if (!verrou.rows[0]?.ok) return [];
    return (await c.query<{ id: number; nom: string; compte_id: number; vue_le: Date }>(`
      SELECT b.id, b.nom, b.compte_id, b.vue_le FROM borne b
       WHERE b.compte_id IS NOT NULL AND b.jeton IS NOT NULL AND b.jeton NOT LIKE 'demo\\_%'
         AND b.vue_le IS NOT NULL
         AND b.vue_le <  now() - ($1 || ' milliseconds')::interval
         AND b.vue_le >  now() - interval '2 days'
         AND NOT EXISTS (
           SELECT 1 FROM message m JOIN salon s ON s.id = m.salon_id
            WHERE s.borne_id = b.id AND m.utilisateur_id IS NULL
              AND m.cree_le > b.vue_le AND m.texte LIKE 'Hors ligne ·%')`,
      [String(SILENCE_MS)])).rows;
  });
  for (const b of tues) {
    await signaler(Number(b.compte_id), { id: Number(b.id), nom: b.nom },
                   [{ genre: "silence", depuis: b.vue_le }])
      .catch((e) => console.error("ronde :", e instanceof Error ? e.message : e));
  }
  return tues.length;
}

/**
 * Une ronde, si la derniere date d'au moins une minute. Appelee au passage par
 * les releves des autres machines : meme sans minuterie — une plateforme qui
 * endort le serveur entre deux requetes —, la ronde se fait tant qu'une borne
 * du parc parle encore.
 */
let derniere = 0;
export function veillerSiLeMoment(): void {
  if (Date.now() - derniere < 60_000) return;
  derniere = Date.now();
  void veiller().catch((e) => console.error("ronde :", e instanceof Error ? e.message : e));
}
