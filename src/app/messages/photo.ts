/**
 * LA PHOTO D'UN MESSAGE, REDUITE DANS LE NAVIGATEUR AVANT DE PARTIR.
 *
 * Une photo de telephone pese trois a six megaoctets : lente a monter depuis
 * une cave en 4G, et coupee par l'hebergeur au-dela de quatre et demi. On garde
 * l'image entiere — pas de rognage, c'est une panne qu'on montre, pas un
 * portrait —, son plus grand cote ramene a 1600 px, en JPEG : deux a quatre
 * cents kilooctets, et bien assez pour lire une etiquette.
 *
 * `createImageBitmap` respecte l'orientation EXIF ; a defaut, une <img> aussi.
 */
const COTE_MAX = 1600;

async function reduire(fichier: File): Promise<Blob> {
  let source: CanvasImageSource, w: number, h: number;
  try {
    const bmp = await createImageBitmap(fichier, { imageOrientation: "from-image" });
    source = bmp; w = bmp.width; h = bmp.height;
  } catch {
    const url = URL.createObjectURL(fichier);
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url;
    });
    source = img; w = img.naturalWidth; h = img.naturalHeight;
  }
  if (!w || !h) throw new Error("illisible");
  const k = Math.min(1, COTE_MAX / Math.max(w, h));
  const toile = document.createElement("canvas");
  toile.width = Math.round(w * k); toile.height = Math.round(h * k);
  const ctx = toile.getContext("2d");
  if (!ctx) throw new Error("toile");
  // Un PNG transparent deviendrait noir en JPEG : fond blanc d'abord.
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, toile.width, toile.height);
  ctx.drawImage(source, 0, 0, toile.width, toile.height);
  return new Promise((ok, ko) => toile.toBlob((b) => (b ? ok(b) : ko(new Error("jpeg"))), "image/jpeg", 0.85));
}

/**
 * La reduction est un bonus : si le navigateur n'y arrive pas, ou s'y attarde,
 * on envoie l'original — que le serveur refusera s'il est trop lourd, et la
 * bulle le dira.
 */
export async function preparerPhoto(fichier: File, delaiMs = 8000): Promise<Blob> {
  const attente = new Promise<null>((ok) => setTimeout(() => ok(null), delaiMs));
  const reduite = await Promise.race([reduire(fichier).catch(() => null), attente]);
  return reduite ?? fichier;
}
