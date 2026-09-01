import { parJeton } from "@/lib/borne";
import { octetsIllustration } from "@/lib/illustration";
import { servir } from "@/lib/servir";

export const dynamic = "force-dynamic";

/** Le fichier, pour la machine. Meme jeton porteur que le reste du dialogue. */
export async function GET(req: Request, ctx: { params: Promise<{ ecran: string }> }) {
  const borne = await parJeton(req.headers);
  if (!borne || !borne.compte_id) return new Response(null, { status: 401 });
  return servir(req, await octetsIllustration(borne.compte_id, (await ctx.params).ecran));
}
