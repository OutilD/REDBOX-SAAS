import { transaction } from "@/db";
import { peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller } from "@/lib/borne";

export const dynamic = "force-dynamic";

/**
 * Ce que cette borne montre au client.
 *
 * On enregistre les EXCEPTIONS : tout ce qui n'est pas coche part au masque. La
 * table est donc reecrite d'un bloc pour cette borne — c'est le formulaire
 * entier qui fait foi, pas une accumulation de clics dont personne ne saurait
 * dire l'etat.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const id = Number((await ctx.params).id);
  if (!peutConfigurer(u)) return versPage(req, `/bornes/${id}`);

  const f = await req.formData();
  const vues = (prefixe: string) =>
    [...new Set(f.getAll(prefixe).map((v) => Number(v)).filter(Number.isInteger))];

  await transaction(async (c) => {
    const mienne = await c.query(
      "SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
    if ((mienne.rowCount ?? 0) === 0) return;

    await c.query("DELETE FROM borne_masque WHERE borne_id = $1", [id]);

    // Masque = tout ce qui appartient au compte et n'a pas ete coche. On part
    // de la base plutot que d'un champ cache : une categorie creee entre
    // l'affichage de la page et son envoi doit rester visible, pas disparaitre.
    await c.query(`
      INSERT INTO borne_masque (borne_id, categorie_id)
      SELECT $1, id FROM categorie
       WHERE compte_id = $2 AND NOT (id = ANY($3::bigint[]))`,
      [id, u.compte_id, vues("categorie")]);

    await c.query(`
      INSERT INTO borne_masque (borne_id, produit_id)
      SELECT $1, id FROM produit
       WHERE compte_id = $2 AND actif AND NOT (id = ANY($3::bigint[]))`,
      [id, u.compte_id, vues("produit")]);
  });

  await reveiller(id, "affichage modifié");
  return versPage(req, `/bornes/${id}/affichage?ok=1`);
}
