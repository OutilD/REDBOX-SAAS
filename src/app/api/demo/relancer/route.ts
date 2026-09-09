import { transaction } from "@/db";
import { peutGererEquipe, utilisateurDe, versPage } from "@/lib/auth";
import { etatDemo, semerDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo/relancer — rouvrir la demo sur un compte VIDE.
 *
 * Pour qui a quitte la demo trop tot. La condition est stricte : aucune
 * borne, aucun produit, aucun mouvement. Un compte qui a commence a vivre ne
 * doit jamais se voir meler des ventes inventees.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (u.demo) return versPage(req, "/demo");
  if (!peutGererEquipe(u)) return versPage(req, "/demo?e=role");
  const etat = await etatDemo(u.compte_id);
  if (!etat.vide) return versPage(req, "/demo?e=plein");
  await transaction((c) => semerDemo(c, u.compte_id, u.email));
  return versPage(req, "/?fait=demo_on");
}
