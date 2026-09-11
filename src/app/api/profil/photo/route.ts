import { transaction } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";
import { balayerImages, rangerImage } from "@/lib/image";

export const dynamic = "force-dynamic";

/**
 * POST /api/profil/photo   (multipart : photo, ou oter ; retour)
 *
 * La photo seule, a part du reste du profil. La route du profil enregistre
 * aussi le nom : lui envoyer une photo sans le nom l'effacerait. Ici, rien
 * d'autre ne bouge.
 *
 * En JSON (le navigateur avec JavaScript, qui a deja reduit l'image) : l'etat,
 * pour que le portrait change sans recharger. Sans JavaScript : retour a la
 * page d'ou l'on vient.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  const json = (req.headers.get("accept") ?? "").includes("application/json");
  if (!u) return json ? Response.json({ erreur: "non connecté" }, { status: 401 }) : versPage(req, "/connexion");

  const f = await req.formData();
  const photo = f.get("photo");
  const oter = f.get("oter") !== null;
  const retour = String(f.get("retour") ?? "");
  const ici = retour.startsWith("/") && !retour.startsWith("//") ? retour : "/profil";

  let souci = false, image_id: number | null = null;
  await transaction(async (c) => {
    if (photo instanceof File && photo.size > 0) {
      const img = await rangerImage(c, u.compte_id, photo);
      if (img === null) { souci = true; return; }
      await c.query("UPDATE utilisateur SET image_id = $1 WHERE id = $2", [img, u.id]);
      image_id = img;
    } else if (oter) {
      await c.query("UPDATE utilisateur SET image_id = NULL WHERE id = $1", [u.id]);
    } else {
      souci = true; return;
    }
    await balayerImages(c, u.compte_id);
  });

  if (json) return souci ? Response.json({ erreur: "photo" }, { status: 400 }) : Response.json({ ok: true, image_id });
  return versPage(req, souci ? `${ici}${ici.includes("?") ? "&" : "?"}e=photo` : ici);
}
