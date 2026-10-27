/**
 * LE CRM DE PROSPECTION. Les etablissements qu'un compte demarche, une carte
 * par lieu, rangee dans la colonne de son etape. Rien de plus : un nom, une
 * ville, un contact, une note. C'est le tableau dont parle le parcours
 * « Trouver ses emplacements » de l'academie.
 *
 * Sans acces a la base : le tableau, dans le navigateur, lit ces listes.
 */
export type Etape = "a_contacter" | "contacte" | "rdv" | "negociation" | "signe" | "refuse";
export const ETAPES: { cle: Etape; nom: string; quoi: string }[] = [
  { cle: "a_contacter", nom: "À contacter",  quoi: "Repéré, pas encore approché" },
  { cle: "contacte",    nom: "Contacté",     quoi: "Passé ou appelé" },
  { cle: "rdv",         nom: "Rendez-vous",  quoi: "Une date avec qui décide" },
  { cle: "negociation", nom: "Négociation",  quoi: "Il réfléchit, l’essai est proposé" },
  { cle: "signe",       nom: "Signé",        quoi: "La machine va s’installer" },
  { cle: "refuse",      nom: "Refusé",       quoi: "Pas maintenant : à relancer" },
];
export const estEtape = (e: string): e is Etape => ETAPES.some((x) => x.cle === e);

export const NOM_MAX = 120;
export const VILLE_MAX = 80;
export const CONTACT_MAX = 160;
export const NOTE_MAX = 2000;
