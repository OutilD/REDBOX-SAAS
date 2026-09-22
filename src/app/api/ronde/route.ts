import { veiller } from "@/lib/veille";

export const dynamic = "force-dynamic";

/**
 * GET /api/ronde   (Bearer CRON_SECRET)
 *
 * La ronde des machines muettes, pour un planificateur exterieur. La minuterie
 * du serveur ne tourne pas sur une plateforme qui endort le processus entre
 * deux requetes, et la ronde faite au passage des releves suppose qu'une autre
 * machine parle encore : si tout le parc se tait — une seule machine, ou la
 * meme panne de reseau partout —, personne ne la fait. Un appel par minute ici
 * y remedie. Rejouable sans risque : une machine n'est annoncee qu'une fois par
 * silence.
 *
 * Sans `CRON_SECRET` dans l'environnement, la route n'existe pas.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ erreur: "introuvable" }, { status: 404 });
  }
  return Response.json({ ok: true, annoncees: await veiller() });
}
