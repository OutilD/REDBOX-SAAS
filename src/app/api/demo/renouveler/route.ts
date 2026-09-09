import { peutGererEquipe, utilisateurDe, versPage } from "@/lib/auth";
import { renouvelerDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo/renouveler — remettre la demo a neuf.
 *
 * Tout ce que le compte contient est efface et le parc invente est reseme :
 * c'est le moyen de revenir a un etat propre apres avoir tout essaye. Le
 * compte reste en demo.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!u.demo) return versPage(req, "/demo");
  if (!peutGererEquipe(u)) return versPage(req, "/demo?e=role");
  const f = await req.formData().catch(() => null);
  if (String(f?.get("sur") ?? "") !== "1") return versPage(req, "/demo?renouveler=1");
  await renouvelerDemo(u.compte_id, u.email);
  return versPage(req, "/?fait=demo_neuf");
}
