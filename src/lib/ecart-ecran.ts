/**
 * DE COMBIEN DESCENDRE CE QUI EST FIXE EN BAS DE L'ECRAN.
 *
 * Ce qui est fixe se pose dans la fenetre de mise en page, haute de `fenetre`
 * (`innerHeight`). L'ecran, lui, montre la fenetre visible, qui commence
 * `decalage` plus bas (`visualViewport.offsetTop`). Le bas d'un element fixe
 * tombe donc a `fenetre - decalage` sur l'ecran, et il lui manque le reste
 * pour toucher le vrai bas.
 *
 * LE VRAI BAS, c'est la plus grande des deux hauteurs qu'on nous annonce : sur
 * iOS 26, apres le clavier, `visualViewport.height` reste a la hauteur
 * « clavier ouvert » alors qu'il est ferme. S'y fier donnait zero pile dans cet
 * etat (402 x 874, clavier de 333 : 541 + 333 - 874), et la barre restait au
 * milieu. `pleinEcran` vaut la hauteur de l'ecran dans l'application installee,
 * `innerHeight` ailleurs.
 */
export function ecartBas(m: { decalage: number; visible: number; pleinEcran: number; fenetre: number }): number {
  return Math.max(0, Math.round(m.decalage + Math.max(m.visible, m.pleinEcran) - m.fenetre));
}
