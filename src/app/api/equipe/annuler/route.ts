import { q } from "@/db";
import { peutGererEquipe, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutGererEquipe(u)) return versPage(req, "/reglages");
  await q("DELETE FROM invitation WHERE id = $1 AND compte_id = $2 AND utilisee_le IS NULL",
          [Number((await req.formData()).get("id")), u.compte_id]);
  return versPage(req, "/reglages/equipe");
}
