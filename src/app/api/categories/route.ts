import { transaction } from "@/db";
import { peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

const RETOUR = "/reglages/categories";

export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutConfigurer(u)) return versPage(req, "/reglages");
  const f = await req.formData();

  // Le bouton « Supprimer » porte son identifiant : un seul formulaire, pas un
  // par ligne, et rien ne se supprime par accident en validant l'ensemble.
  const aSupprimer = Number(f.get("supprimer"));
  if (Number.isInteger(aSupprimer) && aSupprimer > 0) {
    const issue = await transaction(async (c) => {
      const n = (await c.query<{ n: number }>(
        "SELECT COUNT(*)::int n FROM produit WHERE categorie_id = $1", [aSupprimer])).rows[0].n;
      if (n > 0) return "pleine";
      await c.query("DELETE FROM categorie WHERE id = $1 AND compte_id = $2",
                    [aSupprimer, u.compte_id]);
      return null;
    });
    return versPage(req, issue ? `${RETOUR}?e=${issue}` : RETOUR);
  }

  if (f.get("action") === "ajouter") {
    const nom = String(f.get("nom") ?? "").trim();
    if (!nom) return versPage(req, `${RETOUR}?e=nom`);
    const ordre = Number(f.get("ordre"));
    const r = await transaction(async (c) => c.query(
      "INSERT INTO categorie (compte_id, nom, ordre) VALUES ($1,$2,$3) ON CONFLICT (compte_id, nom) DO NOTHING",
      [u.compte_id, nom, Number.isInteger(ordre) && ordre > 0 ? ordre : 100]));
    return versPage(req, r.rowCount === 0 ? `${RETOUR}?e=nom` : RETOUR);
  }

  // Renommage et reordonnancement en une passe.
  const souci = await transaction<string | null>(async (c) => {
    for (const [cle, valeur] of f.entries()) {
      const id = Number(cle.slice(2));
      if (!Number.isInteger(id) || id <= 0) continue;
      if (cle.startsWith("n_")) {
        const nom = String(valeur).trim();
        if (!nom) return "nom";
        // On verifie AVANT d'ecrire. Dans une transaction Postgres, une erreur
        // n'est pas rattrapable : elle abandonne toute la transaction, et les
        // requetes suivantes echouent en cascade. Un `catch` autour d'un UPDATE
        // ne sauve rien, il masque juste ou ca a casse.
        const pris = await c.query(
          "SELECT 1 FROM categorie WHERE compte_id = $1 AND lower(nom) = lower($2) AND id <> $3",
          [u.compte_id, nom, id]);
        if ((pris.rowCount ?? 0) > 0) return "nom";
        await c.query("UPDATE categorie SET nom = $1 WHERE id = $2 AND compte_id = $3",
                      [nom, id, u.compte_id]);
      } else if (cle.startsWith("o_")) {
        const n = Number(valeur);
        if (Number.isInteger(n) && n >= 1 && n <= 999)
          await c.query("UPDATE categorie SET ordre = $1 WHERE id = $2 AND compte_id = $3",
                        [n, id, u.compte_id]);
      }
    }
    return null;
  });
  return versPage(req, souci ? `${RETOUR}?e=${souci}` : RETOUR);
}
