import { utilisateurDe } from "@/lib/auth";
import { apercusDe, salonsDe } from "@/lib/salons";

export const dynamic = "force-dynamic";

/**
 * GET /api/salons/apercus — le dernier lot de messages de chaque salon visible.
 *
 * Le navigateur le demande une fois la page de la messagerie posee, au repos,
 * et garde tout en memoire : ouvrir un salon n'attend plus le serveur, le fil
 * est deja la. Le sondage du salon ouvert, lui, continue de le rafraichir.
 */
export async function GET(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return Response.json({ erreur: "non connecté" }, { status: 401 });
  const salons = await salonsDe(u);
  const apercus = await apercusDe(salons.map((s) => s.id), u.id);
  return Response.json({ apercus }, { headers: { "cache-control": "no-store" } });
}
