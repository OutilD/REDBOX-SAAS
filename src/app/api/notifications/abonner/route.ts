import { q1 } from "@/db";
import { utilisateurDe } from "@/lib/auth";
import { origineDes } from "@/lib/borne";
import { GENRES, nomAppareil } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/abonner   (JSON, depuis le navigateur)
 *
 * Le navigateur vient de s'abonner au service de push et nous confie ce qu'il
 * en a recu : une adresse et deux cles. On les range sous la personne
 * connectee. La meme adresse qui revient — la page rechargee, un autre compte
 * ouvert dans le meme navigateur — remplace la ligne : un appareil n'est
 * qu'a une personne a la fois, la derniere qui s'est abonnee.
 *
 * C'est la seule route de la console qu'un formulaire HTML ne peut pas
 * appeler : l'abonnement n'existe que dans le navigateur, en JavaScript.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return Response.json({ erreur: "non connecté" }, { status: 401 });

  let corps: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try { corps = await req.json(); }
  catch { return Response.json({ erreur: "corps illisible" }, { status: 400 }); }

  const endpoint = typeof corps.endpoint === "string" ? corps.endpoint : "";
  const p256dh = typeof corps.keys?.p256dh === "string" ? corps.keys.p256dh : "";
  const auth = typeof corps.keys?.auth === "string" ? corps.keys.auth : "";
  if (!/^https:\/\/\S{10,}$/.test(endpoint) || endpoint.length > 2000 || !p256dh || !auth) {
    return Response.json({ erreur: "abonnement incomplet" }, { status: 400 });
  }

  // Les preferences ne bougent pas quand l'appareil se represente : il a peut
  // etre deja dit ce qu'il voulait. Elles partent a leurs valeurs par defaut
  // seulement a la premiere fois.
  const r = await q1<{ id: number }>(`
    INSERT INTO abonnement_push (utilisateur_id, endpoint, p256dh, auth, origine, appareil)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (endpoint) DO UPDATE
      SET utilisateur_id = EXCLUDED.utilisateur_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
          origine = EXCLUDED.origine, appareil = EXCLUDED.appareil, echecs = 0
    RETURNING id`,
    [u.id, endpoint, p256dh, auth, origineDes(req.headers), nomAppareil(req.headers.get("user-agent"))]);

  return Response.json({ ok: true, id: r!.id, genres: GENRES.map((g) => g.cle) });
}
