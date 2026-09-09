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

/** Le nom qu'on affiche : le sien, sinon le debut de son adresse. */
export function nomAffiche(p: { nom: string | null; email: string }): string {
  return (p.nom ?? "").trim() || p.email.split("@")[0];
}
