import { utilisateurDe } from "@/lib/auth";
import { salonDe } from "@/lib/salons";
import { autoriser, salonDuCanal } from "@/lib/temps-reel";

export const dynamic = "force-dynamic";

/**
 * POST /api/temps-reel/auth   (socket_id, channel_name — ce qu'envoie pusher-js)
 *
 * Un navigateur n'ecoute un salon que s'il peut le lire : la meme regle que
 * /api/messages, par `salonDe`.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return Response.json({ erreur: "non connecté" }, { status: 401 });
  const f = await req.formData();
  const socket_id = String(f.get("socket_id") ?? "");
  const canal = String(f.get("channel_name") ?? "");
  const salon_id = salonDuCanal(canal);
  if (!/^\d+\.\d+$/.test(socket_id) || salon_id === null) {
    return Response.json({ erreur: "paramètres" }, { status: 400 });
  }
  if (!(await salonDe(u, salon_id))) return Response.json({ erreur: "salon" }, { status: 403 });
  const a = autoriser(socket_id, canal);
  return a ? Response.json(a) : Response.json({ erreur: "temps réel inactif" }, { status: 404 });
}
