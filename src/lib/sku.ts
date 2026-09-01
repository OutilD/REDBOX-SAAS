/**
 * LE SKU AUTOMATIQUE.
 *
 * Une reference se compose du rayon et d'un rang : « BAT-003 ». Elle n'a pas a
 * etre belle, elle a a etre UNIQUE et RECONNAISSABLE — celui qui ouvre la
 * machine doit relier l'etiquette du carton a la ligne de sa fiche.
 *
 * On ne la derive PAS du nom du produit : « Puff 600 · Menthe » et
 * « Puff 600 · Menthe glaciale » donneraient la meme, et deux produits ne
 * peuvent pas partager une reference. Le rang, lui, ne se repete jamais.
 */
export function prefixeSku(categorie: string): string {
  const propre = categorie
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // « Hygiène » -> « Hygiene »
    .toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (propre.slice(0, 3) || "REF");
}
