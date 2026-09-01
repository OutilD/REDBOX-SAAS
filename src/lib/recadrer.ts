/**
 * RECADRER AVANT D'ENVOYER.
 *
 * On normalise la photo dans le navigateur : rognee au centre au format de la
 * vignette, redimensionnee, reencodee. Trois raisons, dans cet ordre.
 *
 *  1. CE QU'ON VOIT EST CE QUE LA BORNE MONTRERA. L'apercu du SaaS affiche
 *     l'image deja recadree, pas l'originale : plus de surprise a la
 *     synchronisation.
 *  2. RIEN NE SE DEFORME. On rogne, on n'etire jamais — un flacon large ne
 *     devient pas un flacon gras.
 *  3. UNE PHOTO DE TELEPHONE PESE QUATRE MEGAOCTETS pour une vignette de
 *     quelques centaines de pixels. Ces fichiers partent sur CHAQUE borne, par
 *     la 4G d'une cave.
 *
 * Sans `canvas` — un navigateur exotique, une erreur de decodage — on renvoie le
 * fichier d'origine : le serveur l'accepte, et la machine recadre a l'affichage.
 * Le confort se perd, jamais la fonction.
 */

/** Le format du cadre sur la borne : la vignette produit est nettement plus
 *  large que haute. Trois pour deux s'en approche sans rogner de trop. */
export const RATIO = 3 / 2;
export const LARGEUR_MAX = 900;

export async function recadrer(fichier: File, ratio = RATIO): Promise<File> {
  try {
    const bitmap = await creerBitmap(fichier);
    if (!bitmap) return fichier;

    // La plus grande fenetre de ce format qui tienne dans l'original, centree.
    const large = bitmap.width / bitmap.height > ratio;
    const cw = large ? bitmap.height * ratio : bitmap.width;
    const ch = large ? bitmap.height : bitmap.width / ratio;
    const cx = (bitmap.width - cw) / 2;
    const cy = (bitmap.height - ch) / 2;

    const w = Math.min(LARGEUR_MAX, Math.round(cw));
    const h = Math.round(w / ratio);

    const toile = document.createElement("canvas");
    toile.width = w; toile.height = h;
    const ctx = toile.getContext("2d");
    if (!ctx) return fichier;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, cx, cy, cw, ch, 0, 0, w, h);
    if ("close" in bitmap) (bitmap as ImageBitmap).close();

    const blob = await new Promise<Blob | null>(
      (r) => toile.toBlob(r, "image/jpeg", 0.86));
    if (!blob || blob.size === 0) return fichier;

    const nom = fichier.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nom, { type: "image/jpeg" });
  } catch {
    return fichier;
  }
}

async function creerBitmap(f: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(f); } catch { /* on retombe plus bas */ }
  }
  return new Promise((resoudre) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resoudre(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resoudre(null); };
    img.src = url;
  });
}
