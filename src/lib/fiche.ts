/**
 * LA FICHE D'UN PRODUIT, TELLE QUE LA BORNE LA MONTRE.
 *
 * Un distributeur ne laisse pas retourner la boite pour lire l'etiquette. Le
 * client voit un nom, un prix, et doit decider. Ces deux textes remplacent
 * l'etiquette : la description, qui aide a choisir, et la mention legale, qui
 * n'est pas facultative sur des produits reglementes.
 *
 * LA MENTION EST ECRITE PAR L'EXPLOITANT, pas fabriquee par nous. Le libelle
 * exact engage sa responsabilite, il varie avec le produit et avec la loi ; une
 * phrase que nous aurions devinee serait fausse quelque part. La borne, elle,
 * ajoute d'office ce qu'elle SAIT — la restriction d'age, qu'elle applique deja.
 *
 * Les longueurs sont celles d'un ecran de borne lu debout : au-dela, personne
 * ne lit, et le texte deborde de la fiche.
 */
export const DESC_MAX = 300;
export const MENTION_MAX = 400;

/** Ce que la borne ajoute toute seule sous la mention de l'exploitant. */
export function mentionDAge(age_min: number): string | null {
  return age_min >= 18
    ? "Vente interdite aux mineurs. Une pièce d’identité est demandée avant le paiement."
    : null;
}
