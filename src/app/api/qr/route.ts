import QRCode from "qrcode";

export const dynamic = "force-dynamic";

/**
 * GET /api/qr?d=<texte>&t=<taille>
 *
 * Un QR en PNG. Sert d'abord a la borne : elle n'a pas d'encodeur, et lui en
 * ajouter un pour une image affichee deux minutes dans sa vie serait dispropor-
 * tionne. Au moment ou elle a besoin du QR, elle vient justement de parler au
 * serveur — le reseau est donc la.
 *
 * Aucune authentification : on n'encode que ce qu'on nous donne, et le contenu
 * n'est utile qu'a celui qui le lit. Mais la taille est bornee, sinon la route
 * devient un moyen commode de faire travailler le serveur pour rien.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const texte = url.searchParams.get("d") ?? "";
  const taille = Math.min(720, Math.max(120, Number(url.searchParams.get("t")) || 420));
  if (!texte || texte.length > 512) {
    return new Response("d manquant ou trop long", { status: 400 });
  }

  const png = await QRCode.toBuffer(texte, {
    type: "png",
    width: taille,
    margin: 2,
    errorCorrectionLevel: "M",
    // Noir sur blanc : un QR blanc sur fond sombre n'est pas lu par tous les
    // appareils photo, et celui-ci sera photographie dans un bar mal eclaire.
    color: { dark: "#000000ff", light: "#ffffffff" },
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=600",
    },
  });
}
