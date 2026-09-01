import { q1 } from "@/db";
import { parJeton } from "@/lib/borne";
import { servir } from "@/lib/servir";

export const dynamic = "force-dynamic";

/**
 * Le fichier, pour la borne.
 *
 * Meme jeton porteur que le reste du dialogue machine. La requete verifie que le
 * visuel appartient bien au compte de la borne ET qu'il la vise : une machine ne
 * telecharge pas une affiche qui ne passera jamais sur son ecran.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const borne = await parJeton(req.headers);
  if (!borne) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new Response(null, { status: 400 });

  const v = await q1<{ octets: Buffer; type_mime: string; empreinte: string }>(`
    SELECT v.octets, v.type_mime, v.empreinte
      FROM visuel v JOIN playlist p ON p.id = v.playlist_id
     WHERE v.id = $1 AND p.compte_id = $2
       AND (p.partout OR EXISTS (SELECT 1 FROM playlist_borne pb
                                  WHERE pb.playlist_id = p.id AND pb.borne_id = $3))`,
    [id, borne.compte_id, borne.id]);
  return servir(req, v);
}
