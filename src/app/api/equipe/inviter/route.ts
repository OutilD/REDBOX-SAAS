import { q, q1 } from "@/db";
import { peutGererEquipe, ROLES, utilisateurDe, versPage } from "@/lib/auth";
import { nouveauCode } from "@/lib/borne";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutGererEquipe(u)) return versPage(req, "/reglages");
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const role = String(f.get("role") ?? "");
  if (!email.includes("@") || !ROLES.some((r) => r.cle === role))
    return versPage(req, "/reglages/equipe?e=email");
  if (await q1("SELECT 1 FROM utilisateur WHERE compte_id = $1 AND email = $2", [u.compte_id, email]))
    return versPage(req, "/reglages/equipe?e=email");

  // Une invitation par adresse : reinviter remplace, elle ne s'empile pas.
  await q("DELETE FROM invitation WHERE compte_id = $1 AND email = $2 AND utilisee_le IS NULL",
          [u.compte_id, email]);
  await q("INSERT INTO invitation (compte_id, email, role, code, par) VALUES ($1,$2,$3,$4,$5)",
          [u.compte_id, email, role, nouveauCode(8), u.email]);
  return versPage(req, "/reglages/equipe");
}
