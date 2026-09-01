import { q1 } from "@/db";
import { parJeton } from "@/lib/borne";
import { servir } from "@/lib/servir";

export const dynamic = "force-dynamic";

/**
 * L'image, pour la machine.
 *
 * Meme jeton porteur que le reste du dialogue. On ne verifie que le compte : une
 * image de categorie ou de produit concerne toutes les bornes du parc, a la
 * difference d'une affiche publicitaire qui, elle, peut ne viser qu'une machine.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const borne = await parJeton(req.headers);
  if (!borne || !borne.compte_id) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new Response(null, { status: 400 });

  return servir(req, await q1<{ octets: Buffer; type_mime: string; empreinte: string }>(
    "SELECT octets, type_mime, empreinte FROM image WHERE id = $1 AND compte_id = $2",
    [id, borne.compte_id]));
}
