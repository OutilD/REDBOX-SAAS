import { q1 } from "@/db";
import { utilisateurDe } from "@/lib/auth";
import { salonDe } from "@/lib/salons";
import { servir } from "@/lib/servir";

export const dynamic = "force-dynamic";

/**
 * GET /api/messages/photo/<id du message>
 *
 * LA PHOTO D'UN MESSAGE SE LIT COMME LE MESSAGE. Pas par /api/image, qui
 * ouvre les images de son compte : une photo posee dans #redboxers vient d'un
 * autre compte, et une photo du SAV ne doit pas sortir parce qu'on a devine son
 * numero. On passe donc par le message, et par `salonDe`, qui ne rend le salon
 * qu'a qui peut le lire. Un message retire ne montre plus sa photo.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new Response(null, { status: 400 });

  const v = await q1<{ salon_id: number; octets: Buffer; type_mime: string; empreinte: string }>(
    `SELECT m.salon_id, i.octets, i.type_mime, i.empreinte
       FROM message m JOIN image i ON i.id = m.photo_id
      WHERE m.id = $1 AND m.supprime_le IS NULL`, [id]);
  if (!v || !(await salonDe(u, Number(v.salon_id)))) return new Response(null, { status: 404 });
  return servir(req, v);
}
