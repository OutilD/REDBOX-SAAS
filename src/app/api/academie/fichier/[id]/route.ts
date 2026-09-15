import { utilisateurDe } from "@/lib/auth";
import { apercuDe, fichierPour, lecteur } from "@/lib/academie";

export const dynamic = "force-dynamic";

/**
 * GET /api/academie/fichier/:id — un certificat, un contrat, une image.
 *
 * La porte est celle de la lecon qui le porte : un contrat reserve aux
 * redboxers ne se telecharge pas en devinant son numero. Un PDF ou une image
 * s'ouvre dans le navigateur, le reste se telecharge ; `?telecharger` force
 * le telechargement.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  const f = await fichierPour(await lecteur(u, apercuDe(req)), id);
  if (!f) return new Response(null, { status: 404 });

  const lisible = f.type_mime === "application/pdf" || f.type_mime.startsWith("image/");
  const force = new URL(req.url).searchParams.has("telecharger");
  const nom = f.nom.replace(/["\\\r\n]/g, "");
  const ascii = nom.normalize("NFD").replace(/[^\x20-\x7e]/g, "");
  return new Response(new Uint8Array(f.octets), {
    headers: {
      "content-type": f.type_mime,
      "content-length": String(f.octets.length),
      "content-disposition":
        `${lisible && !force ? "inline" : "attachment"}; filename="${ascii || "fichier"}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
