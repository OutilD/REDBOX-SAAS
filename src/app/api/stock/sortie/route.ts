import { transaction } from "@/db";
import { peutCharger, utilisateurDe, versPage, estRestreint } from "@/lib/auth";
import { estMotifSortie } from "@/lib/sortie";

export const dynamic = "force-dynamic";

/**
 * Sort de la marchandise de la reserve, avec sa cause.
 *
 * ON NE SORT QUE CE QU'ON A. La quantite est verifiee contre le lieu choisi
 * DANS la transaction : lue avant, deux saisies simultanees passeraient toutes
 * les deux et le stock deviendrait negatif — un chiffre qu'aucun inventaire ne
 * rattrape.
 *
 * LA RESERVE ET LES BORNES SONT DEUX ENDROITS, et une casse arrive dans les
 * deux. Sortir d'une borne ne touche pas au compteur de la machine : celui-ci
 * vient de ses capteurs et repart a chaque synchronisation. Ce qu'on corrige
 * ici est NOTRE stock theorique — et l'ecart entre les deux chiffres reste
 * l'information que le systeme cherche a montrer, pas a lisser.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  // Le compte n'est pas le sien : une portee par borne ne donne pas la main
  // sur le catalogue, le depot ou le parc de l'exploitant.
  if (estRestreint(u)) return versPage(req, "/stock");
  if (!peutCharger(u)) return versPage(req, "/stock");

  const f = await req.formData();
  const produit = Number(f.get("produit"));
  // « 12 » pour la reserve, « 12:3 » pour la spire 3 de la borne posee en 12 :
  // en machine, c'est le compteur de la spirale qui doit baisser.
  const [lieuBrut, laneBrut] = String(f.get("lieu") ?? "").split(":");
  const lieu = Number(lieuBrut);
  const lane = laneBrut === undefined ? null : Number(laneBrut);
  const quantite = Number(f.get("quantite"));
  const motif = String(f.get("motif") ?? "");
  const note = String(f.get("note") ?? "").trim() || null;

  const retour = `/stock/${produit}/sortie`;
  if (!Number.isInteger(produit) || produit <= 0) return versPage(req, "/stock");
  if (!estMotifSortie(motif)) return versPage(req, `${retour}?e=motif`);
  if (!Number.isInteger(lieu) || lieu <= 0) return versPage(req, `${retour}?e=lieu`);
  if (lane !== null && (!Number.isInteger(lane) || lane <= 0)) {
    return versPage(req, `${retour}?e=lieu`);
  }
  if (!Number.isInteger(quantite) || quantite <= 0) return versPage(req, `${retour}?e=quantite`);
  // « Autre » sans explication ne vaut pas mieux qu'une ligne manquante : dans
  // six mois, personne ne saura ce qui est parti.
  if (motif === "autre" && !note) return versPage(req, `${retour}?e=note`);

  const bilan = await transaction(async (c) => {
    // Le produit doit appartenir au compte : sans ce controle, un identifiant
    // devine dans le formulaire ferait fondre le stock du voisin.
    const p = await c.query<{ id: number }>(
      "SELECT id FROM produit WHERE id = $1 AND compte_id = $2", [produit, u.compte_id]);
    if ((p.rowCount ?? 0) === 0) return { erreur: "produit" as const };

    // Le lieu doit etre du compte, et porter vraiment la marchandise : la borne
    // du voisin comme un lieu vide sont deux facons de creuser un stock negatif.
    // En machine on interroge LA SPIRE, pas le lieu : une casse dans la spirale
    // 3 ne se prend pas sur le stock de la spirale 7.
    const r = lane === null
      ? await c.query<{ quantite: number }>(`
          SELECT s.quantite::int
            FROM v_stock s JOIN lieu l ON l.id = s.lieu_id
           WHERE s.produit_id = $1 AND s.lieu_id = $2 AND l.compte_id = $3
             AND s.quantite > 0`, [produit, lieu, u.compte_id])
      : await c.query<{ quantite: number }>(`
          SELECT c.quantite::int
            FROM canal c JOIN borne b ON b.id = c.borne_id
           WHERE c.produit_id = $1 AND b.lieu_id = $2 AND b.compte_id = $3
             AND c.lane = $4 AND c.quantite > 0`, [produit, lieu, u.compte_id, lane]);

    const dispo = r.rows[0]?.quantite;
    if (dispo === undefined) return { erreur: "vide" as const };
    if (quantite > dispo) return { erreur: "trop" as const, dispo };

    await c.query(`
      INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, vers_lieu_id, quantite,
                             motif, lane, note, par, fait_le)
      VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, now())`,
      [u.compte_id, produit, lieu, quantite, motif, lane, note, u.email]);

    // Notre compteur de spire suit la sortie. Celui de la machine, non : il
    // vient de ses capteurs, et l'ecart qui apparait est justement ce qu'on
    // veut voir tant que le technicien n'a pas corrige la borne.
    if (lane !== null) {
      await c.query(`
        UPDATE canal SET quantite = GREATEST(0, quantite - $1)
          FROM borne b
         WHERE canal.borne_id = b.id AND b.lieu_id = $2 AND canal.lane = $3`,
        [quantite, lieu, lane]);
    }

    return { erreur: null, reste: dispo - quantite };
  });

  if (bilan.erreur === "produit") return versPage(req, "/stock");
  if (bilan.erreur === "vide")    return versPage(req, `${retour}?e=vide`);
  if (bilan.erreur === "trop")    return versPage(req, `${retour}?e=trop&dispo=${bilan.dispo}`);

  return versPage(req, `/stock/${produit}?sortie=${quantite}&motif=${motif}`);
}
