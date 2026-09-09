// Fabrique les images du parc de demonstration, et les range en base64 dans
// src/lib/demo-images.ts. A relancer quand on change un dessin :
//
//     node scripts/demo-images.mjs
//
// Les tuiles reprennent les pictogrammes de la machine (src/lib/pictos.ts),
// dessines comme elle les dessine, sur un fond de la couleur de la categorie.
// Elles sont rendues ICI, une fois, et embarquees dans le code : le semis d'un
// compte n'a besoin ni de sharp, ni d'une police, ni d'un dossier lisible sur
// le serveur — trois choses qui manquent volontiers a un hebergeur.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const racine = process.cwd();

// Les pictogrammes, lus dans le fichier TypeScript plutot que recopies : un
// trait qui change la-bas doit changer ici.
const pictos = {};
const src = readFileSync(join(racine, "src/lib/pictos.ts"), "utf8");
for (const m of src.matchAll(/cle:\s*"([^"]+)"[^[]*traces:\s*\[([\s\S]*?)\]\s*\}/g)) {
  const traces = [...m[2].matchAll(/d:\s*"([^"]+)"(,\s*plein:\s*true)?/g)]
    .map((t) => ({ d: t[1], plein: Boolean(t[2]) }));
  pictos[m[1]] = traces;
}

const POLICE = "Helvetica Neue, Helvetica, Arial, sans-serif";
const TUILE = 384;

const CATEGORIES = [
  { cle: "Vapes",       picto: "vape",     teinte: "#d70005" },
  { cle: "Poppers",     picto: "popper",   teinte: "#7c3aed" },
  { cle: "Batteries",   picto: "batterie", teinte: "#2563eb" },
  { cle: "Hygiène",     picto: "hygiene",  teinte: "#0d9488" },
  { cle: "Briquets",    picto: "briquet",  teinte: "#ea580c" },
  { cle: "Accessoires", picto: "cable",    teinte: "#475569" },
];

const PRODUITS = [
  { cle: "VAPE-MEN",  picto: "vape",     teinte: "#10b981", lignes: ["Puff 600", "Menthe"] },
  { cle: "VAPE-FRU",  picto: "vape",     teinte: "#e11d48", lignes: ["Puff 600", "Fruits rouges"] },
  { cle: "VAPE-PAS",  picto: "vape",     teinte: "#f43f5e", lignes: ["Puff 600", "Pastèque"] },
  { cle: "VAPE-MAN",  picto: "vape",     teinte: "#f59e0b", lignes: ["Puff 1500", "Mangue"] },
  { cle: "POP-15",    picto: "popper",   teinte: "#8b5cf6", lignes: ["Poppers", "15 ml"] },
  { cle: "PWR-5000",  picto: "batterie", teinte: "#3b82f6", lignes: ["Powerbank", "5000 mAh"] },
  { cle: "PWR-10000", picto: "batterie", teinte: "#1d4ed8", lignes: ["Powerbank", "10000 mAh"] },
  { cle: "HYG-PRE",   picto: "hygiene",  teinte: "#14b8a6", lignes: ["Préservatifs", "x3"] },
  { cle: "HYG-LIN",   picto: "hygiene",  teinte: "#06b6d4", lignes: ["Lingettes", "x10"] },
  { cle: "BRQ-TEMP",  picto: "briquet",  teinte: "#f97316", lignes: ["Briquet", "tempête"] },
  { cle: "ACC-USBC",  picto: "cable",    teinte: "#64748b", lignes: ["Câble USB-C", "1 m"] },
];

const AFFICHES = [
  { cle: "affiche-bienvenue", teinte: "#d70005",
    haut: ["Touchez", "l’écran"], bas: "pour commencer", pied: "Distributeur automatique · 24 h / 24" },
  { cle: "affiche-24h", teinte: "#2563eb",
    haut: ["Batteries,", "câbles,", "hygiène"], bas: "24 h / 24", pied: "Sans contact · paiement par carte" },
  { cle: "affiche-samedi", teinte: "#7c3aed",
    haut: ["Ce soir,", "jusqu’à 4 h"], bas: "on reste ouvert", pied: "RedBox · au fond à gauche" },
];

const echappe = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function tracePicto(cle, x, y, echelle, couleur) {
  const t = pictos[cle];
  if (!t) throw new Error("picto inconnu : " + cle);
  return `<g transform="translate(${x},${y}) scale(${echelle})" fill="none" stroke="${couleur}"
             stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    ${t.map((p) => `<path d="${p.d}"${p.plein ? ` fill="${couleur}"` : ""}/>`).join("\n    ")}
  </g>`;
}

/** Une tuile carree : fond sombre teinte, halo, pictogramme, une ou deux lignes. */
function tuile({ picto, teinte, lignes }) {
  const T = TUILE;
  const deux = lignes.length > 1;
  const echelle = T / 48 * 0.55;
  const taillePicto = 48 * echelle;
  const y = deux ? T * 0.12 : T * 0.16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}">
  <defs>
    <linearGradient id="fond" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#141416"/><stop offset="1" stop-color="${teinte}" stop-opacity=".55"/>
    </linearGradient>
    <radialGradient id="halo" cx=".5" cy=".42" r=".5">
      <stop offset="0" stop-color="${teinte}" stop-opacity=".5"/><stop offset="1" stop-color="${teinte}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${T}" height="${T}" fill="url(#fond)"/>
  <rect width="${T}" height="${T}" fill="url(#halo)"/>
  <circle cx="${T / 2}" cy="${y + taillePicto / 2}" r="${taillePicto * 0.62}" fill="${teinte}" opacity=".28"/>
  ${tracePicto(picto, (T - taillePicto) / 2, y, echelle, "#ffffff")}
  <text x="${T / 2}" y="${deux ? T * 0.80 : T * 0.86}" text-anchor="middle" font-family="${POLICE}"
        font-weight="700" font-size="${deux ? T * 0.095 : T * 0.11}" fill="#ffffff">${echappe(lignes[0])}</text>
  ${deux ? `<text x="${T / 2}" y="${T * 0.91}" text-anchor="middle" font-family="${POLICE}"
        font-weight="600" font-size="${T * 0.078}" fill="${teinte}" style="filter:brightness(1.35)">${echappe(lignes[1])}</text>` : ""}
</svg>`;
}

/** Une affiche portrait pour l'ecran d'accueil : la borne est en portrait. */
function affiche({ teinte, haut, bas, pied }) {
  const L = 720, H = 1280;
  const lignes = haut.map((t, i) =>
    `<text x="72" y="${430 + i * 118}" font-family="${POLICE}" font-weight="800" font-size="104"
           letter-spacing="-3" fill="#ffffff">${echappe(t)}</text>`).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">
  <defs>
    <linearGradient id="fond" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0a0b"/><stop offset="1" stop-color="#1c1c20"/>
    </linearGradient>
    <radialGradient id="halo" cx=".8" cy=".22" r=".6">
      <stop offset="0" stop-color="${teinte}" stop-opacity=".85"/><stop offset="1" stop-color="${teinte}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${L}" height="${H}" fill="url(#fond)"/>
  <rect width="${L}" height="${H}" fill="url(#halo)"/>
  <circle cx="600" cy="250" r="190" fill="${teinte}" opacity=".9"/>
  <circle cx="600" cy="250" r="118" fill="#0a0a0b" opacity=".85"/>
  <rect x="72" y="330" width="88" height="10" rx="5" fill="${teinte}"/>
  ${lignes}
  <text x="72" y="${430 + haut.length * 118 + 30}" font-family="${POLICE}" font-weight="500" font-size="54"
        fill="${teinte}" style="filter:brightness(1.4)">${echappe(bas)}</text>
  <text x="72" y="1130" font-family="${POLICE}" font-weight="800" font-size="60" letter-spacing="-2"
        fill="#ffffff">Red<tspan fill="${teinte}">Box</tspan></text>
  <text x="72" y="1185" font-family="${POLICE}" font-weight="500" font-size="28" fill="#a6a6ae">${echappe(pied)}</text>
</svg>`;
}

// Tout en JPEG : des degrades et du texte, quatre fois plus legers qu'en PNG,
// et un format que toute machine sait lire.
const jpeg = async (svg, quality) => ({
  type: "image/jpeg",
  b64: (await sharp(Buffer.from(svg)).jpeg({ quality, mozjpeg: true }).toBuffer()).toString("base64"),
});
const images = {};
for (const k of CATEGORIES) images[k.cle] = await jpeg(tuile({ ...k, lignes: [k.cle] }), 85);
for (const p of PRODUITS)   images[p.cle] = await jpeg(tuile(p), 85);
for (const a of AFFICHES)   images[a.cle] = await jpeg(affiche(a), 78);

let total = 0;
const lignes = Object.entries(images).map(([cle, v]) => {
  total += Buffer.from(v.b64, "base64").length;
  return `  ${JSON.stringify(cle)}: { type: ${JSON.stringify(v.type)}, b64:\n    ${JSON.stringify(v.b64)} },`;
});
writeFileSync(join(racine, "src/lib/demo-images.ts"), `// GENERE PAR scripts/demo-images.mjs — ne pas editer a la main.
//
// Les tuiles des categories et des produits du parc de demonstration, et les
// affiches de son ecran d'accueil, en base64. Dessinees une fois sur le poste
// de developpement, embarquees ici : le semis d'un compte n'a besoin de rien
// d'autre que ce fichier. Cle = nom de categorie, SKU, ou nom d'affiche.
export const IMAGES_DEMO: Record<string, { type: string; b64: string }> = {
${lignes.join("\n")}
};
`);
console.log(Object.keys(images).length, "images,", Math.round(total / 1024), "Ko");

// Un apercu sur le disque, pour regarder ce qu'on a dessine.
if (process.argv.includes("--apercu")) {
  const dossier = process.argv[process.argv.indexOf("--apercu") + 1] ?? "/tmp";
  for (const [cle, v] of Object.entries(images)) {
    writeFileSync(join(dossier, cle + ".jpg"), Buffer.from(v.b64, "base64"));
  }
}
