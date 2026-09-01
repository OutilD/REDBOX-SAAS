/**
 * LES SORTIES DE STOCK QUI NE SONT PAS DES VENTES.
 *
 * De la marchandise disparait sans passer par une machine : une bouteille
 * tombe, un carton part avec quelqu'un, une date limite passe. Sans un endroit
 * pour l'ecrire, l'ecart se retrouve au prochain inventaire sous la forme d'un
 * chiffre faux, des mois plus tard, et sans explication.
 *
 * LA CAUSE EST LE SUJET, pas la quantite. « J'ai perdu douze unites » ne se
 * pilote pas ; « douze casses ce mois-ci sur ce produit » se pilote, et « douze
 * vols » appelle une tout autre reponse. D'ou des motifs separes plutot qu'une
 * seule ligne de perte avec une note libre — une note ne se compte pas.
 */
export const MOTIFS_SORTIE = {
  casse:      { nom: "Casse",       quoi: "Tombé, écrasé, emballage percé" },
  vol:        { nom: "Vol",         quoi: "Disparu, effraction, démarque" },
  peremption: { nom: "Périmé",      quoi: "Date limite dépassée" },
  perte:      { nom: "Perte",       quoi: "Introuvable, sans explication" },
  autre:      { nom: "Autre",       quoi: "À préciser dans la note" },
} as const;

export type MotifSortie = keyof typeof MOTIFS_SORTIE;

export function estMotifSortie(v: string): v is MotifSortie {
  return Object.prototype.hasOwnProperty.call(MOTIFS_SORTIE, v);
}

/** Les sorties se lisent au passe dans le grand livre : « 3 cassés ». */
export const PARTICIPE: Record<MotifSortie, string> = {
  casse: "cassé", vol: "volé", peremption: "périmé",
  perte: "perdu", autre: "sorti",
};
