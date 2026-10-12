// La barre du bas reste en bas : `node scripts/essai-ecart-ecran.mjs`
// Les etats sont ceux d'un iPhone de 402 x 874, clavier de 333.
import assert from "node:assert/strict";
import { ecartBas } from "../src/lib/ecart-ecran.ts";

const cas = [
  ["au repos",                                   { decalage: 0,   visible: 874, pleinEcran: 874, fenetre: 874 }, 0],
  // LA CAPTURE : clavier ferme, fenetre visible restee courte, page defilee
  // jusqu'en bas. L'ancienne formule (visible + decalage - fenetre) donnait 0.
  ["iOS 26, hauteur visible figee, bas de page", { decalage: 333, visible: 541, pleinEcran: 874, fenetre: 874 }, 333],
  ["le meme, a mi-course",                       { decalage: 120, visible: 541, pleinEcran: 874, fenetre: 874 }, 120],
  ["le meme, remonte en haut",                   { decalage: 0,   visible: 541, pleinEcran: 874, fenetre: 874 }, 0],
  ["le meme dans Safari (24 px)",                { decalage: 24,  visible: 716, pleinEcran: 740, fenetre: 740 }, 24],
  ["decalage seul, hauteur revenue",             { decalage: 333, visible: 874, pleinEcran: 874, fenetre: 874 }, 333],
  ["fenetre de mise en page restee courte",      { decalage: 0,   visible: 541, pleinEcran: 874, fenetre: 541 }, 333],
  ["hors iPhone : jamais negatif",               { decalage: 0,   visible: 700, pleinEcran: 800, fenetre: 800 }, 0],
  ["hauteurs a virgule",                         { decalage: 0,   visible: 873.67, pleinEcran: 874, fenetre: 874 }, 0],
];

for (const [nom, mesure, attendu] of cas) assert.equal(ecartBas(mesure), attendu, nom);
console.log(`ecart-ecran : ${cas.length} cas, tout est bon`);
