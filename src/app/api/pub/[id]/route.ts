import { q1 } from "@/db";
import { utilisateur } from "@/lib/auth";
import { servir } from "@/lib/servir";

export const dynamic = "force-dynamic";

/** L'apercu dans le SaaS. Le fichier ne sort que pour son proprietaire. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateur();
  if (!u) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new Response(null, { status: 400 });

  const v = await q1<{ octets: Buffer; type_mime: string; empreinte: string }>(
    "SELECT octets, type_mime, empreinte FROM visuel WHERE id = $1 AND compte_id = $2",
    [id, u.compte_id]);
  return servir(req, v);
}
