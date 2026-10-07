import { timingSafeEqual } from "node:crypto";
import { veiller } from "@/lib/veille";

export const dynamic = "force-dynamic";

/**
 * GET /api/ronde   (Bearer CRON_SECRET)
 *
 * La ronde des machines muettes, pour un planificateur exterieur. La minuterie
 * du serveur ne tourne pas sur une plateforme qui endort le processus entre
 * deux requetes, et la ronde faite au passage des releves suppose qu'une autre
 * machine parle encore : si tout le parc se tait — une seule machine, ou la
 * meme panne de reseau partout —, personne ne la fait. Le cron de `vercel.json`
 * l'appelle toutes les cinq minutes, largement assez pour un silence de quinze.
 * Rejouable sans risque : une machine n'est annoncee qu'une fois par silence.
 *
 * Sans `CRON_SECRET` dans l'environnement, la route n'existe pas.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const attendu = Buffer.from(`Bearer ${secret}`), recu = Buffer.from(req.headers.get("authorization") ?? "");
  if (!secret || recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) {
    return Response.json({ erreur: "introuvable" }, { status: 404 });
  }
  return Response.json({ ok: true, annoncees: await veiller() });
}
