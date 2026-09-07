import { q } from "@/db";
import { parJeton } from "@/lib/borne";
import { RETENTION_DIAGNOSTIC_JOURS, aujourdhuiDans, commandeDe, estSource,
         fuseauValide, quandDe } from "@/lib/journal";

export const dynamic = "force-dynamic";

type Paquet = {
  source?: unknown;
  lot?: unknown;
  tz?: unknown;
  lignes?: { p?: unknown; t?: unknown }[];
};

/** Au-dela, on coupe : une ligne de journal n'est pas un fichier. */
const LIGNE_MAX = 4000;
const LIGNES_MAX = 2000;

/**
 * POST /api/borne/journal   (Bearer jeton)
 *
 * La borne recopie ici ce qu'elle a ecrit dans l'un de ses deux journaux depuis
 * le dernier accuse. Un paquet = une source, un lot, des lignes avec leur
 * adresse dans le fichier.
 *
 * REJOUABLE : la cle (borne, source, lot, position) absorbe un paquet renvoye
 * parce que notre reponse s'etait perdue. On repond alors « recu » comme la
 * premiere fois, et la borne avance son curseur. Ce qui compte pour elle, c'est
 * que nous ayons la ligne, pas que nous l'ayons ecrite a l'instant.
 *
 * On n'ecrit rien d'autre : ni compteur, ni etat de la borne. Le releve
 * (/api/borne/etat) reste la seule voie qui touche au stock.
 */
export async function POST(req: Request) {
  const borne = await parJeton(req.headers);
  if (!borne) return Response.json({ erreur: "jeton invalide" }, { status: 401 });

  let p: Paquet;
  try { p = await req.json(); }
  catch { return Response.json({ erreur: "corps illisible" }, { status: 400 }); }

  if (!estSource(p.source)) return Response.json({ erreur: "source inconnue" }, { status: 400 });
  const source = p.source;
  const lot = typeof p.lot === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(p.lot) ? p.lot : null;
  if (!lot) return Response.json({ erreur: "lot manquant" }, { status: 400 });
  if (!Array.isArray(p.lignes)) return Response.json({ erreur: "lignes manquantes" }, { status: 400 });

  const tz = fuseauValide(p.tz);
  const jour = aujourdhuiDans(tz);

  const positions: number[] = [];
  const quands: (string | null)[] = [];
  const commandes: (string | null)[] = [];
  const textes: string[] = [];
  for (const l of p.lignes.slice(0, LIGNES_MAX)) {
    if (!Number.isInteger(l.p) || (l.p as number) < 0 || typeof l.t !== "string") continue;
    const t = l.t.length > LIGNE_MAX ? l.t.slice(0, LIGNE_MAX) + "…" : l.t;
    if (t.trim() === "") continue;                  // une ligne vide ne dit rien
    positions.push(l.p as number);
    quands.push(quandDe(source, t, jour));
    commandes.push(commandeDe(t));
    textes.push(t);
  }

  let recu = 0;
  if (positions.length > 0) {
    // L'instant se convertit dans la base : `to_timestamp` pour les millisecondes
    // des commandes, `AT TIME ZONE` pour l'heure locale du diagnostic. C'est elle
    // qui connait les fuseaux, pas nous.
    const quand = source === "commandes"
      ? "to_timestamp(q::bigint / 1000.0)"
      : "(q::timestamp AT TIME ZONE $8)";
    const params: unknown[] = [borne.id, source, lot, positions, quands, commandes, textes];
    if (source === "diagnostic") params.push(tz);
    const r = await q<{ id: number }>(`
      INSERT INTO journal_borne (borne_id, source, lot, position, horodatage, commande_id, ligne)
      SELECT $1, $2, $3, p, CASE WHEN q IS NULL THEN NULL ELSE ${quand} END, c, t
        FROM unnest($4::bigint[], $5::text[], $6::text[], $7::text[]) AS u(p, q, c, t)
      ON CONFLICT (borne_id, source, lot, position) DO NOTHING
      RETURNING id`, params);
    recu = r.length;
  }

  await purger();

  return Response.json({ ok: true, recu, deja: positions.length - recu });
}

/**
 * La trace technique ne vaut plus rien apres deux mois ; les commandes, si.
 * Une fois par heure et par processus suffit : ce n'est pas la borne qui doit
 * attendre notre menage.
 */
let purgeLe = 0;
async function purger() {
  if (Date.now() - purgeLe < 3_600_000) return;
  purgeLe = Date.now();
  try {
    await q(`DELETE FROM journal_borne
              WHERE source = 'diagnostic' AND recu_le < now() - ($1 || ' days')::interval`,
            [String(RETENTION_DIAGNOSTIC_JOURS)]);
  } catch { /* le menage attendra */ }
}
