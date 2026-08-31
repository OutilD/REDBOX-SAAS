import { q } from "@/db";
import { peutGererEquipe, ROLES, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutGererEquipe(u)) return versPage(req, "/reglages");
  const f = await req.formData();
  const role = String(f.get("role") ?? "");
  if (!ROLES.some((r) => r.cle === role)) return versPage(req, "/reglages/equipe");
  // Ni soi-meme, ni le proprietaire : un compte sans proprietaire est un compte
  // que plus personne ne peut reprendre.
  await q(`UPDATE utilisateur SET role = $1
            WHERE id = $2 AND compte_id = $3 AND id <> $4 AND role <> 'proprietaire'`,
          [role, Number(f.get("id")), u.compte_id, u.id]);
  return versPage(req, "/reglages/equipe");
}
