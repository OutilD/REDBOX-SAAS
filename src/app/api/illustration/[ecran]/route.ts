import { utilisateur } from "@/lib/auth";
import { octetsIllustration } from "@/lib/illustration";
import { servir } from "@/lib/servir";

export const dynamic = "force-dynamic";

/** L'apercu dans le SaaS. */
export async function GET(req: Request, ctx: { params: Promise<{ ecran: string }> }) {
  const u = await utilisateur();
  if (!u) return new Response(null, { status: 401 });
  return servir(req, await octetsIllustration(u.compte_id, (await ctx.params).ecran));
}
