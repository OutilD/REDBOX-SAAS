/**
 * LES CINQ STADES D'UNE MACHINE, de l'usine au bar. Aucune dependance : ce
 * fichier se lit aussi dans le navigateur, pour le tableau de l'editeur.
 * L'ordre est celui de la vie d'une machine — c'est aussi celui des colonnes.
 */
export const STATUTS = [
  { cle: "production", nom: "En production",      court: "en production",
    quoi: "En cours de fabrication, pour un client ou pour le stock." },
  { cle: "libre",      nom: "Libres à l’achat",   court: "libre à l’achat",
    quoi: "En stock, sans client. Lui attribuer un compte la fait passer en commandée." },
  { cle: "commandee",  nom: "Commandées",         court: "commandée",
    quoi: "Un client l’a commandée. Elle attend une adresse et une date." },
  { cle: "bientot",    nom: "Bientôt installées", court: "bientôt installée",
    quoi: "Attribuée, adresse connue : elle est déjà sur la carte du client." },
  { cle: "installee",  nom: "Installées",         court: "installée",
    quoi: "Appairée et en service. Le client l’a adoptée depuis sa console." },
] as const;

export type Statut = (typeof STATUTS)[number]["cle"];

export const CLES: readonly string[] = STATUTS.map((s) => s.cle);

export function statutValide(s: unknown): s is Statut {
  return typeof s === "string" && CLES.includes(s);
}

export function nomDuStatut(cle: string): string {
  return STATUTS.find((s) => s.cle === cle)?.court ?? cle;
}
