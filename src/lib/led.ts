/**
 * LE BANDEAU LUMINEUX DU CADRE (APK 5.27, voir Led.java).
 *
 * Le controleur ne connait que sept teintes, eteint et quelques effets : pas de
 * couleur libre. La route qui enregistre et la page qui propose lisent ces
 * memes listes ; la borne les traduit en octets.
 */
export const COULEURS = [
  { id: "rouge", nom: "Rouge", hex: "#ff2d2d" },
  { id: "jaune", nom: "Jaune", hex: "#ffd60a" },
  { id: "vert", nom: "Vert", hex: "#2ee65a" },
  { id: "bleu_clair", nom: "Bleu clair", hex: "#5ad8ff" },
  { id: "bleu", nom: "Bleu", hex: "#2f6bff" },
  { id: "rose", nom: "Rose", hex: "#ff5fc8" },
  { id: "blanc", nom: "Blanc", hex: "#ffffff" },
  { id: "eteint", nom: "Éteint", hex: "#2a2a30" },
] as const;

export const EFFETS = [
  { id: "fixe", nom: "Fixe" },
  { id: "respiration", nom: "Respiration" },
  { id: "multicolore", nom: "Multicolore" },
  { id: "coloree", nom: "Colorée" },
  { id: "defilement1", nom: "Défilement 1" },
  { id: "defilement2", nom: "Défilement 2" },
] as const;

export type Led = { couleur: string; effet: string; luminosite: number };

export const LED_DEFAUT: Led = { couleur: "blanc", effet: "fixe", luminosite: 200 };

/** Un reglage sur, ou null si un champ sort des listes. */
export function ledValide(v: { couleur?: unknown; effet?: unknown; luminosite?: unknown }): Led | null {
  const couleur = String(v.couleur ?? "");
  const effet = String(v.effet ?? "");
  const luminosite = Number(v.luminosite);
  if (!COULEURS.some(c => c.id === couleur) || !EFFETS.some(e => e.id === effet)) return null;
  if (!Number.isInteger(luminosite) || luminosite < 1 || luminosite > 255) return null;
  return { couleur, effet, luminosite };
}

/** La premiere application qui sait regler son bandeau. Sans import serveur : l'anneau le lit cote navigateur. */
export const VERSION_LED = "5.27";
