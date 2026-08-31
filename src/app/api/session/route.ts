import { q1 } from "@/db";
import { concorde, creerSession, enTeteBiscuit, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const mdp = String(f.get("mdp") ?? "");
  const l = await q1<{ id: number; mdp: string }>(
    "SELECT id, mdp FROM utilisateur WHERE email = $1", [email]);
  // Meme reponse dans les deux cas : on ne dit pas quels comptes existent.
  if (!l || !concorde(mdp, l.mdp)) return versPage(req, "/connexion?e=1");
  return versPage(req, "/", enTeteBiscuit(await creerSession(l.id)));
}
