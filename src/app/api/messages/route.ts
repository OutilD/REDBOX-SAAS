import { utilisateurDe, versPage } from "@/lib/auth";
import { signalerMessage } from "@/lib/notifications";
import { deposer, marquerLu, messagesDe, peutEcrire, reactionsDes, salonDe, TEXTE_MAX } from "@/lib/salons";

export const dynamic = "force-dynamic";

/**
 * GET /api/messages?salon=&depuis=[&vus=1,2,3]
 *
 * Ce que le navigateur demande toutes les trois secondes quand le fil est
 * ouvert : les messages arrives apres `depuis`, et — si `vus` les nomme — les
 * reactions de ceux qui sont deja a l'ecran. Une reaction se pose sur un vieux
 * message, que `depuis` ne rendrait jamais ; sans cette seconde liste, un
 * pouce n'apparaitrait qu'au rechargement de la page.
 *
 * Il a lu jusque-la : on le note, la pastille en depend. Une lecture, un
 * compteur — la messagerie n'a pas de connexion ouverte a tenir, et elle
 * marche derriere n'importe quel hebergeur.
 */
export async function GET(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return Response.json({ erreur: "non connecté" }, { status: 401 });
  const url = new URL(req.url);
  const salon_id = Number(url.searchParams.get("salon"));
  const depuis = Number(url.searchParams.get("depuis") ?? 0);
  if (!Number.isInteger(salon_id) || !Number.isInteger(depuis)) {
    return Response.json({ erreur: "paramètres" }, { status: 400 });
  }
  const s = await salonDe(u, salon_id);
  if (!s) return Response.json({ erreur: "salon inconnu" }, { status: 404 });
  const vus = (url.searchParams.get("vus") ?? "").split(",").map(Number).filter(Number.isInteger);
  const [messages, reactions] = await Promise.all([
    messagesDe(salon_id, { depuis, limite: 200, moi: u.id }),
    vus.length > 0 ? reactionsDes(salon_id, vus, u.id) : Promise.resolve({}),
  ]);
  const dernier = messages.at(-1)?.id;
  if (dernier !== undefined) await marquerLu(u.id, salon_id, dernier);
  return Response.json({ messages, reactions });
}

/**
 * POST /api/messages   (formulaire : salon_id, texte — ou JSON)
 *
 * Le formulaire ordinaire revient au salon ; le JSON, que le navigateur
 * envoie quand il a du JavaScript, rend le message tel qu'il s'affiche, pour
 * qu'il apparaisse sans attendre le tour suivant. Dans les deux cas les
 * collegues sont prevenus sur leur telephone — apres, sans attendre.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  const json = (req.headers.get("content-type") ?? "").includes("application/json");
  if (!u) return json ? Response.json({ erreur: "non connecté" }, { status: 401 }) : versPage(req, "/connexion");

  let salon_id: number, texte: string;
  if (json) {
    const c = await req.json().catch(() => ({})) as { salon_id?: unknown; texte?: unknown };
    salon_id = Number(c.salon_id); texte = String(c.texte ?? "");
  } else {
    const f = await req.formData();
    salon_id = Number(f.get("salon_id")); texte = String(f.get("texte") ?? "");
  }
  texte = texte.replace(/\r\n?/g, "\n").trim();
  const refus = (code: number, e: string) =>
    json ? Response.json({ erreur: e }, { status: code })
         : versPage(req, Number.isInteger(salon_id) ? `/messages/${salon_id}?e=${e}` : "/messages");

  if (!Number.isInteger(salon_id)) return refus(400, "salon");
  if (!texte) return refus(400, "vide");
  if (texte.length > TEXTE_MAX) return refus(400, "long");
  const s = await salonDe(u, salon_id);
  if (!s) return refus(404, "salon");
  if (!peutEcrire(u, s)) return refus(403, "lecture");

  const m = await deposer(salon_id, u.id, texte);
  // Ses propres messages ne comptent jamais comme non lus : avancer le curseur
  // n'est pas urgent, et attendre la base pour le faire retardait la reponse.
  void marquerLu(u.id, salon_id, m.id)
    .catch((e) => console.error("lecture :", e instanceof Error ? e.message : e));
  void signalerMessage(s, m)
    .catch((e) => console.error("notifications :", e instanceof Error ? e.message : e));

  return json ? Response.json({ message: m }) : versPage(req, `/messages/${salon_id}#fin`);
}
