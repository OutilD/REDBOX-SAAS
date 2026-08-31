import { transaction } from "@/db";
import { peutGererEquipe, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutGererEquipe(u)) return versPage(req, "/reglages");
  const id = Number((await req.formData()).get("id"));
  await transaction(async (c) => {
    const cible = await c.query(`SELECT 1 FROM utilisateur
      WHERE id = $1 AND compte_id = $2 AND id <> $3 AND role <> 'proprietaire'`,
      [id, u.compte_id, u.id]);
    if ((cible.rowCount ?? 0) === 0) return;
    // Les sessions tombent avec le compte : retirer quelqu'un doit le faire
    // sortir tout de suite, pas a l'expiration de son biscuit.
    await c.query("DELETE FROM session WHERE utilisateur_id = $1", [id]);
    await c.query("DELETE FROM utilisateur WHERE id = $1", [id]);
  });
  return versPage(req, "/reglages/equipe");
}
