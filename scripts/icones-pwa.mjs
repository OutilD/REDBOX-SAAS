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
//
// DEUX APPLICATIONS, DEUX ICONES. RedBox Gestion : la marque rouge sur le noir
// de la borne. RedBox Connect (`public/connect/`) : la marque blanche sur le
// bleu nuit de Connect — cote a cote sur l'ecran d'accueil, on ne les confond
// pas.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const FOND = "#0a0a0b";
const marque = "public/marque-rouge.png";

/** La marque peinte d'une seule couleur, a la largeur voulue. */
async function peinte(largeur, couleur) {
  const alpha = await sharp(marque).resize({ width: largeur }).ensureAlpha().extractChannel("alpha").toBuffer();
  const { width, height } = await sharp(alpha).metadata();
  return sharp({ create: { width, height, channels: 3, background: couleur } }).joinChannel(alpha).png().toBuffer();
}

/** Le fond de Connect : un bleu nuit qui s'eclaircit vers le haut a gauche. */
const fondConnect = (taille) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}">
     <defs><linearGradient id="d" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0" stop-color="#2a4fa8"/><stop offset=".55" stop-color="#14265a"/><stop offset="1" stop-color="#0a1020"/>
     </linearGradient></defs>
     <rect width="100%" height="100%" fill="url(#d)"/>
   </svg>`);

async function carre(taille, part, sortie, connect = false) {
  const largeur = Math.round(taille * part);
  const m = connect ? await peinte(largeur, "#ffffff") : await sharp(marque).resize({ width: largeur }).toBuffer();
  const { height } = await sharp(m).metadata();
  const fond = connect ? sharp(fondConnect(taille)) : sharp({ create: { width: taille, height: taille, channels: 4, background: FOND } });
  await fond
    .composite([{ input: m, left: Math.round((taille - largeur) / 2), top: Math.round((taille - height) / 2) }])
    .png().toFile(sortie);
}

await carre(192, 0.74, "public/icone-192.png");
await carre(512, 0.74, "public/icone-512.png");
await carre(512, 0.56, "public/icone-maskable-512.png");
await carre(180, 0.74, "public/apple-touch-icon.png");

await mkdir("public/connect", { recursive: true });
await carre(192, 0.74, "public/connect/icone-192.png", true);
await carre(512, 0.74, "public/connect/icone-512.png", true);
await carre(512, 0.56, "public/connect/icone-maskable-512.png", true);
await carre(180, 0.74, "public/connect/apple-touch-icon.png", true);
await carre(64, 0.78, "public/connect/favicon.png", true);

// Le badge : la forme de la marque, peinte en blanc.
const alpha = await sharp(marque).resize({ width: 88 }).ensureAlpha().extractChannel("alpha").toBuffer();
const { width, height } = await sharp(alpha).metadata();
const blanc = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
  .joinChannel(alpha).png().toBuffer();
await sharp({ create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: blanc, left: Math.round((96 - width) / 2), top: Math.round((96 - height) / 2) }])
  .png().toFile("public/badge-96.png");

console.log("icones ecrites dans public/");
