import { peutGererEquipe, utilisateurDe, versPage } from "@/lib/auth";
import { quitterDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo/fin — quitter le mode demo.
 *
 * Seul le proprietaire, et seulement si le compte est encore en demo : rejoue
 * sur un compte qui en est sorti, cette route effacerait de vraies donnees.
 * Le formulaire porte une confirmation explicite (`sur=1`), parce qu'il n'y a
 * pas de retour en arriere.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!u.demo) return versPage(req, "/demo");
  if (!peutGererEquipe(u)) return versPage(req, "/demo?e=role");
  const f = await req.formData().catch(() => null);
  if (String(f?.get("sur") ?? "") !== "1") return versPage(req, "/demo?quitter=1");
  await quitterDemo(u.compte_id);
  return versPage(req, "/?fait=demo_fin");
}
