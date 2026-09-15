import type { Statut } from "./statuts";

/** Les cinq etats qu'une carte colore, et leur nom. Aucune dependance : le navigateur les lit aussi. */
export type EtatPoint = "ok" | "mal" | "hs" | "bientot" | "attente";

export const NOM_ETAT: Record<EtatPoint, string> = {
  ok: "en ligne", mal: "silencieuse", hs: "hors service",
  bientot: "bientôt installée", attente: "à appairer",
};

/** Ce qui prime quand plusieurs machines partagent un rond : le pire d'abord. */
export const GRAVITE: EtatPoint[] = ["mal", "hs", "bientot", "attente", "ok"];

/**
 * LE STADE COLORE LE CARRE, LA SANTE LA PASTILLE. Sans stade connu — la carte
 * d'un client ne le demande pas —, il se deduit de l'etat : promise, ou posee.
 */
export function stadeDuPoint(p: { stade?: Statut; etat: EtatPoint }): Statut {
  return p.stade ?? (p.etat === "bientot" ? "bientot" : "installee");
}

/** La sante ne se dit que d'une machine installee : les autres ne tournent pas encore. */
export function santeDuPoint(p: { stade?: Statut; etat: EtatPoint }): EtatPoint | null {
  return stadeDuPoint(p) === "installee" ? p.etat : null;
}

/** `euros` de `@/db`, sans tirer `pg` dans le navigateur. */
export function enEuros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function slug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
