import { utilisateurDe, versPage } from "@/lib/auth";
import { peutEcrire, reagir, salonDe } from "@/lib/salons";

export const dynamic = "force-dynamic";

/**
 * POST /api/messages/reaction   (message_id, salon_id, emoji)
 *
 * Poser ou retirer une reaction : le meme appel fait les deux, parce que c'est
 * le meme geste. Rend l'etat complet de la barre du message plutot qu'un
 * increment — deux personnes qui applaudissent en meme temps ne doivent pas
 * finir avec deux comptes differents a l'ecran.
 *
 * Reagir demande le droit d'ecrire : dans les annonces, ou l'editeur seul
 * parle, personne ne repond par un pouce non plus.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  const json = (req.headers.get("content-type") ?? "").includes("application/json");
  if (!u) return json ? Response.json({ erreur: "non connecté" }, { status: 401 }) : versPage(req, "/connexion");

  let message_id: number, salon_id: number, emoji: string;
  if (json) {
    const c = await req.json().catch(() => ({})) as { message_id?: unknown; salon_id?: unknown; emoji?: unknown };
    message_id = Number(c.message_id); salon_id = Number(c.salon_id); emoji = String(c.emoji ?? "");
  } else {
    const f = await req.formData();
    message_id = Number(f.get("message_id")); salon_id = Number(f.get("salon_id")); emoji = String(f.get("emoji") ?? "");
  }
  const refus = (code: number, e: string) =>
    json ? Response.json({ erreur: e }, { status: code })
         : versPage(req, Number.isInteger(salon_id) ? `/messages/${salon_id}` : "/messages");

  if (!Number.isInteger(message_id) || !Number.isInteger(salon_id)) return refus(400, "paramètres");
  const s = await salonDe(u, salon_id);
  if (!s) return refus(404, "salon");
  if (!peutEcrire(u, s)) return refus(403, "lecture");

  const reactions = await reagir(message_id, u.id, emoji);
  if (reactions === null) return refus(400, "réaction");
  return json ? Response.json({ reactions }) : versPage(req, `/messages/${salon_id}`);
}
