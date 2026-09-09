// Les icones de l'application installee, tirees de la marque. A relancer si
// la marque change :
//
//     node scripts/icones-pwa.mjs
//
// Un carre sombre avec la marque, en trois tailles : 192 et 512 pour Android
// et le manifeste, 180 pour l'ecran d'accueil d'iOS (qui arrondit lui-meme).
// La version « maskable » garde la marque dans le cercle central : Android la
// decoupe a sa guise, et une marque trop large se retrouverait tronquee. Le
// badge est la marque en blanc sur fond transparent, seule forme qu'Android
// accepte dans sa barre d'etat.
import sharp from "sharp";

const FOND = "#0a0a0b";
const marque = "public/marque-rouge.png";

async function carre(taille, part, sortie) {
  const largeur = Math.round(taille * part);
  const m = await sharp(marque).resize({ width: largeur }).toBuffer();
  const { height } = await sharp(m).metadata();
  await sharp({ create: { width: taille, height: taille, channels: 4, background: FOND } })
    .composite([{ input: m, left: Math.round((taille - largeur) / 2), top: Math.round((taille - height) / 2) }])
    .png().toFile(sortie);
}

await carre(192, 0.74, "public/icone-192.png");
await carre(512, 0.74, "public/icone-512.png");
await carre(512, 0.56, "public/icone-maskable-512.png");
await carre(180, 0.74, "public/apple-touch-icon.png");

// Le badge : la forme de la marque, peinte en blanc.
const alpha = await sharp(marque).resize({ width: 88 }).ensureAlpha().extractChannel("alpha").toBuffer();
const { width, height } = await sharp(alpha).metadata();
const blanc = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
  .joinChannel(alpha).png().toBuffer();
await sharp({ create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: blanc, left: Math.round((96 - width) / 2), top: Math.round((96 - height) / 2) }])
  .png().toFile("public/badge-96.png");

console.log("icones ecrites dans public/");
