import { transaction } from "@/db";
import { peutCharger, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller } from "@/lib/borne";

export const dynamic = "force-dynamic";

/**
 * Met d'accord notre compteur et celui de la machine, sur une spire.
 *
 * L'utilisateur declare la verite — celle de la borne, la notre, ou celle qu'il
 * vient de compter devant la vitrine. Les deux cotes s'y rangent :
 *
 *  - NOS LIVRES par un mouvement d'inventaire, pour que l'ecart soit ecrit
 *    quelque part. Poser le chiffre directement dans `canal.quantite` aurait
 *    fait mentir le grand livre : le stock d'un lieu se deduit des mouvements,
 *    et sept unites apparues sans ligne sont sept unites que personne ne peut
 *    expliquer trois mois plus tard.
 *  - LA MACHINE par une correction en attente, qu'elle applique a son prochain
 *    appel. On ne peut pas la joindre autrement : c'est elle qui vient.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return versPage(req, "/bornes");
  if (!peutCharger(u)) return versPage(req, `/bornes/${id}`);

  const f = await req.formData();
  const lane = Number(f.get("lane"));
  const valeur = Number(f.get("valeur"));
  const retour = `/bornes/${id}/canal/${lane}/reconcilier`;

  if (!Number.isInteger(lane) || lane <= 0) return versPage(req, `/bornes/${id}`);
  if (!Number.isInteger(valeur) || valeur < 0 || valeur > 999) {
    return versPage(req, `${retour}?e=valeur`);
  }

  const fait = await transaction(async (c) => {
    const b = await c.query<{ lieu_id: number | null; compte_id: number | null }>(
      "SELECT lieu_id, compte_id FROM borne WHERE id = $1 AND compte_id = $2",
      [id, u.compte_id]);
    const borne = b.rows[0];
    if (!borne?.lieu_id) return null;

    const k = await c.query<{ quantite: number; produit_id: number | null }>(
      "SELECT quantite, produit_id FROM canal WHERE borne_id = $1 AND lane = $2", [id, lane]);
    const canal = k.rows[0];
    if (!canal) return null;

    const ecart = valeur - canal.quantite;

    // Le mouvement d'inventaire ne s'ecrit que si nos livres bougent, et qu'un
    // produit est affecte : un ecart sur une spire vide n'a rien a mouvementer.
    if (ecart !== 0 && canal.produit_id) {
      await c.query(`
        INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, vers_lieu_id, quantite,
                               motif, lane, note, par, fait_le, confirme_le)
        VALUES ($1, $2, $3, $4, $5, 'inventaire', $6, $7, $8, now(), now())`,
        [u.compte_id, canal.produit_id,
         ecart < 0 ? borne.lieu_id : null,
         ecart > 0 ? borne.lieu_id : null,
         Math.abs(ecart), lane,
         `réconciliation : ${canal.quantite} → ${valeur}`, u.email]);
    }

    await c.query("UPDATE canal SET quantite = $1 WHERE borne_id = $2 AND lane = $3",
                  [valeur, id, lane]);

    // Une seule correction vivante par spire : la derniere annule les
    // precedentes, sinon la machine appliquerait une suite de valeurs perimees.
    await c.query(`
      UPDATE correction_canal SET applique_le = now()
       WHERE borne_id = $1 AND lane = $2 AND applique_le IS NULL`, [id, lane]);
    await c.query(`
      INSERT INTO correction_canal (borne_id, lane, quantite, par)
      VALUES ($1, $2, $3, $4)`, [id, lane, valeur, u.email]);

    return true;
  });

  if (!fait) return versPage(req, `/bornes/${id}`);
  await reveiller(id, "réconciliation d’un canal");
  return versPage(req, `/bornes/${id}?reconcilie=${lane}`);
}
