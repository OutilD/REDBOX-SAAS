/**
 * LE PRIX, ET L'ENDROIT OU IL SE DECIDE.
 *
 * Un produit porte un prix de catalogue, valable partout ; une borne peut poser
 * le sien. Deux regles seulement, et elles tiennent en une phrase chacune :
 *
 *   1. Pas de ligne dans `prix_borne` → la borne vend au prix du catalogue.
 *   2. Une ligne → c'est elle qui gagne, sur cette borne et sur elle seule.
 *
 * Ce fichier existe pour que ces deux regles ne soient ecrites qu'une fois. Le
 * SaaS affiche des prix a six endroits — le plateau, l'ecran de chargement, le
 * planogramme, l'affichage, le catalogue, la page des prix — et la machine en
 * recoit un septieme. Une seule de ces lectures qui oublie la jointure, et
 * l'exploitant lit ici un chiffre que sa borne ne pratique pas : c'est la panne
 * la plus couteuse possible, parce qu'elle ne se voit qu'au relevé de caisse.
 */

/**
 * L'EXPRESSION SQL DU PRIX APPLIQUE.
 *
 * A utiliser avec `JOINTURE_PRIX` : les deux vont ensemble, l'alias `pb` les
 * relie. Ecrite ici plutot que recopiee sept fois — un `COALESCE` inverse dans
 * une copie ferait vendre le catalogue la ou la borne a decide autre chose.
 */
export const PRIX_APPLIQUE = "COALESCE(pb.prix_c, p.prix_vente_c)";

/** Vrai quand cette borne a pose son propre prix sur ce produit. */
export const PRIX_PROPRE = "(pb.prix_c IS NOT NULL)";

/**
 * La jointure qui va avec, pour une borne donnee.
 *
 * `$n` est le numero du parametre qui porte l'identifiant de la borne dans la
 * requete d'accueil — il varie d'une requete a l'autre, donc il se passe.
 * L'alias du produit est `p` partout dans ce code ; le fixer ici evite d'avoir
 * a le penser a chaque appel.
 */
export function jointurePrix(paramBorne: string): string {
  return `LEFT JOIN prix_borne pb ON pb.produit_id = p.id AND pb.borne_id = ${paramBorne}`;
}

/**
 * UN PRIX SAISI A LA MAIN, RAMENE EN CENTIMES.
 *
 * On tape « 4,50 », « 4.50 », « 4,50 € » ou « 4 » selon le clavier et l'humeur,
 * souvent d'une main devant une machine ouverte. Tout ce qui n'est pas un
 * chiffre, une virgule ou un point est donc jete avant lecture.
 *
 * `null` veut dire « ce champ ne dit rien » — vide, ou illisible. C'est
 * different de zero, qui est un prix (celui d'un produit offert), et l'appelant
 * doit pouvoir faire la difference : sur la page des prix par borne, « rien »
 * signifie « suis le catalogue » et ne doit surtout pas devenir « gratuit ».
 */
export function centimes(brut: string): number | null {
  const t = brut.trim().replace(/[^\d,.-]/g, "").replace(",", ".");
  if (!t) return null;
  const n = Math.round(parseFloat(t) * 100);
  return Number.isFinite(n) && n >= 0 && n <= PRIX_MAX ? n : null;
}

/**
 * LE PLAFOND.
 *
 * Mille euros pour une puff ou un briquet n'est jamais une intention, c'est une
 * virgule oubliee — et la machine, elle, encaisserait sans discuter. Le
 * paiement sans contact plafonne bien plus bas de toute facon ; refuser ici
 * coute un message, accepter coute un client.
 */
export const PRIX_MAX = 100_000;

/** Le prix tel qu'il s'ecrit dans un champ de saisie : « 4,50 ». */
export function enSaisie(centimes: number): string {
  return (centimes / 100).toFixed(2).replace(".", ",");
}

/**
 * L'ECART AVEC LE CATALOGUE, EN POURCENTAGE ENTIER.
 *
 * C'est la seule lecture qui dit quelque chose d'un coup d'oeil : « 5,50 » a
 * cote de « 5,00 » demande une soustraction, « +10 % » ne demande rien. On
 * arrondit — personne ne pilote une borne au dixieme de pourcent.
 *
 * Un catalogue a zero n'a pas de pourcentage : on rend `null` plutot qu'un
 * infini, et l'appelant montre l'ecart en euros.
 */
export function ecartPourcent(prix: number, reference: number): number | null {
  if (reference <= 0) return null;
  return Math.round(((prix - reference) / reference) * 100);
}
