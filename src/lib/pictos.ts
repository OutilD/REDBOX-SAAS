/**
 * LES PICTOGRAMMES DE LA BORNE.
 *
 * Ils vivent DEJA dans l'application, en vectoriel. On n'en televerse donc pas
 * une copie : on retient une cle, « vape » ou « batterie », et la machine dessine
 * le sien. Rien ne voyage sur le reseau, et le trait reste net a n'importe quelle
 * taille — ce qu'un PNG de 200 px ne fait pas sur une dalle de borne.
 *
 * Les traces sont ceux des drawables Android, recopies a l'identique. Ils sont la
 * pour que le SaaS montre EXACTEMENT ce que le client verra : un choix d'icone
 * fait sur une approximation ne vaudrait rien.
 *
 * Ajouter un pictogramme demande donc deux gestes : le vectoriel cote APK, et sa
 * cle ici. C'est le prix de ne rien faire transiter.
 */
export type Picto = { cle: string; nom: string; traces: { d: string; plein?: boolean }[] };

export const PICTOS: Picto[] = [
  { cle: "vape", nom: "Vape", traces: [
    { d: "M24,5 m-6,0 a6,6 0 0,1 12,0 v26 a6,6 0 0,1 -12,0 z" },
    { d: "M21,13 h6" },
    { d: "M24,38 m-2.4,0 a2.4,2.4 0 1,0 4.8,0 a2.4,2.4 0 1,0 -4.8,0", plein: true },
  ] },
  { cle: "popper", nom: "Poppers", traces: [
    { d: "M15,21 h18 v20 a2,2 0 0,1 -2,2 h-14 a2,2 0 0,1 -2,-2 z" },
    { d: "M20,7 h8 v10 h-8 z" },
    { d: "M15,28 h18" },
  ] },
  { cle: "batterie", nom: "Batterie", traces: [
    { d: "M11,15 h26 v26 a2,2 0 0,1 -2,2 h-22 a2,2 0 0,1 -2,-2 z" },
    { d: "M19,9 h10" },
    { d: "M26,20 l-5,9 h7 l-5,9" },
  ] },
  { cle: "hygiene", nom: "Hygiène", traces: [
    { d: "M24,6 c6,9 11,13 11,20 a11,11 0 0,1 -22,0 c0,-7 5,-11 11,-20 z" },
    { d: "M19,29 a5,5 0 0,0 5,5" },
  ] },
  { cle: "briquet", nom: "Briquet", traces: [
    { d: "M15,22 h18 v19 a2,2 0 0,1 -2,2 h-14 a2,2 0 0,1 -2,-2 z" },
    { d: "M24,20 c0,-6 -5,-6 -5,-11 0,-3 2,-5 5,-7 3,2 6,5 6,9 0,4 -4,5 -6,9 z" },
  ] },
  { cle: "cable", nom: "Câble", traces: [
    { d: "M16,30 v-14 a6,6 0 0,1 12,0 v16 a6,6 0 0,0 12,0 v-14" },
    { d: "M10,30 h12 v12 h-12 z" },
  ] },
];

export const CLES_PICTO = new Set(PICTOS.map((p) => p.cle));

/** La cle proposee quand rien n'est choisi, d'apres le prefixe du SKU. C'est la
 *  regle qu'appliquait la machine dans son coin ; on la rend visible. */
export function pictoParDefaut(sku: string): string {
  const s = (sku ?? "").toUpperCase();
  if (s.startsWith("VAPE")) return "vape";
  if (s.startsWith("POP"))  return "popper";
  if (s.startsWith("PWR"))  return "batterie";
  if (s.startsWith("HYG"))  return "hygiene";
  if (s.startsWith("BRQ"))  return "briquet";
  return "cable";
}
