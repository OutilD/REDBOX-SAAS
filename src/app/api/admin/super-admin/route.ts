import { q } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/admin/super-admin — donner ou retirer le drapeau, jamais a soi-meme. */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");
  const f = await req.formData();
  const id = Number(f.get("utilisateur_id"));
  const valeur = String(f.get("valeur")) === "1";
  if (!Number.isInteger(id)) return versPage(req, "/admin/comptes");
  if (id === u.id && !valeur) return versPage(req, "/admin/comptes?e=soi");
  await q("UPDATE utilisateur SET super_admin = $2 WHERE id = $1", [id, valeur]);
  return versPage(req, "/admin/comptes");
}
