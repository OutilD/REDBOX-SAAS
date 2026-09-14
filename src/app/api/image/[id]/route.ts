import { q1 } from "@/db";
import { utilisateur } from "@/lib/auth";
import { servir } from "@/lib/servir";

export const dynamic = "force-dynamic";

/**
 * L'apercu dans le SaaS. L'image ne sort que pour son compte — SAUF UNE PHOTO
 * DE PROFIL.
 *
 * Celle-la est faite pour etre vue par les autres : sur les messages et les
 * fiches de la communaute, qui reunit des redboxers de comptes differents.
 * Bornee a son compte, elle revenait en 404 chez tous les autres, et le
 * navigateur posait son icone d'image cassee a la place du portrait. Une photo
 * de produit, de categorie ou de publicite reste, elle, fermee a son compte.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateur();
  if (!u) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new Response(null, { status: 400 });

  return servir(req, await q1<{ octets: Buffer; type_mime: string; empreinte: string }>(
    `SELECT i.octets, i.type_mime, i.empreinte FROM image i
      WHERE i.id = $1
        AND (i.compte_id = $2
             OR EXISTS (SELECT 1 FROM utilisateur x WHERE x.image_id = i.id))`,
    [id, u.compte_id]));
}
