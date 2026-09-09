import { utilisateurDe, versPage } from "@/lib/auth";
import { essayer } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/essai
 *
 * Un message vers tous les appareils de la personne. C'est la seule facon de
 * savoir que la chaine marche de bout en bout — le navigateur peut avoir
 * accepte l'abonnement et le telephone, lui, avoir coupe les notifications
 * de l'application.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const n = await essayer(u.id);
  return versPage(req, n > 0 ? "/reglages/notifications?fait=essai" : "/reglages/notifications?e=aucun");
}
