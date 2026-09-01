import { q1 } from "@/db";
import { utilisateur } from "@/lib/auth";
import { servir } from "@/lib/servir";

export const dynamic = "force-dynamic";

/** L'apercu dans le SaaS. L'image ne sort que pour son compte. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateur();
  if (!u) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new Response(null, { status: 400 });

  return servir(req, await q1<{ octets: Buffer; type_mime: string; empreinte: string }>(
    "SELECT octets, type_mime, empreinte FROM image WHERE id = $1 AND compte_id = $2",
    [id, u.compte_id]));
}
