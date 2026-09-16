/**
 * Deux lettres, tirees du nom s'il existe, de l'adresse sinon : « ali.b@… »
 * donne AB, « Marie Dupont » donne MD. C'est ce qu'on met dans une pastille
 * quand il n'y a pas de photo — partout ou une personne apparait.
 */
export function initiales(nomOuEmail: string): string {
  const local = nomOuEmail.split("@")[0] ?? "";
  const bouts = local.split(/[.\-_+\s]/).filter(Boolean);
  const deux = bouts.length > 1 ? bouts[0][0] + bouts[1][0] : local.slice(0, 2);
  return deux.toUpperCase();
}

/**
 * LE NOM QU'ON AFFICHE : LE PSEUDO. On identifie une personne par le nom
 * qu'elle a choisi, pas par son adresse — la meme regle dans la console et dans
 * la communaute. A defaut, son nom ; le debut de l'adresse n'est qu'un dernier
 * recours, pour les comptes ouverts avant que le pseudo soit demande.
 */
export function nomAffiche(p: { pseudo?: string | null; nom: string | null; email: string }): string {
  return (p.pseudo ?? "").trim() || (p.nom ?? "").trim() || p.email.split("@")[0];
}
