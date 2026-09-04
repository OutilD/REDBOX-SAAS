import { randomInt } from "node:crypto";
import { q, q1 } from "@/db";

/**
 * LE MOT DE PASSE DE LA CONSOLE DE MAINTENANCE.
 *
 * Six chiffres, parce que la machine n'a qu'un pave numerique sous la main.
 *
 * IL TOURNE TOUTES LES TRENTE MINUTES. Un code lu une fois ne sert donc qu'une
 * demi-heure — c'est ce qu'on veut d'un code d'acces a la console d'une machine
 * qui encaisse. En contrepartie, celui qu'on note depuis le bureau peut avoir
 * change avant l'arrivee devant la borne : on releve le code au moment de
 * partir, pas la veille.
 *
 * LE PLANCHER, C'EST LE RYTHME DE SYNCHRONISATION. Le code n'est renouvele
 * qu'au moment ou la machine vient le chercher (voir `pinLivrable`), toutes les
 * RYTHME_CALME secondes — cinq minutes. Descendre la rotation sous ce rythme ne
 * la rendrait pas plus rapide, seulement irreguliere.
 *
 * LA MACHINE EN ACCEPTE DEUX, ET C'EST LE CONTRAT DE CE FICHIER. Le code part
 * dans la reponse de `/api/borne/config` ; le SaaS n'apprend qu'a la remontee
 * suivante — plus loin dans le meme echange, apres le catalogue et les images —
 * que la borne l'a bien pris. Pendant tout ce temps la fiche affiche l'AVANT-
 * DERNIER. La borne ouvre donc avec le code courant comme avec celui qu'il vient
 * de remplacer (`Saas.codeMaintenanceAccepte`, cote APK), et cette page ne peut
 * plus montrer un code que la porte refuse.
 *
 * Ce filet ne couvre qu'UN cran : tout ce qui suit doit garantir que le SaaS
 * n'a jamais deux rotations d'avance sur ce qu'il affiche.
 */
export const ROTATION_MIN = 30;

/** Six chiffres tires au hasard, zeros de tete compris. */
function nouveauPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Le code que la borne doit porter, renouvele s'il a fait son temps.
 *
 * A N'APPELER QU'A LA LIVRAISON, c'est-a-dire quand la machine vient chercher
 * sa configuration. Renouveler ailleurs — a l'affichage d'une page, sur une
 * minuterie — ferait diverger ce que le SaaS montre de ce que la machine
 * accepte, et c'est exactement le moment ou l'ecart coute cher : une borne
 * hors ligne depuis trois jours doit continuer d'ouvrir avec le code affiche.
 */
export async function pinLivrable(borne_id: number): Promise<string | null> {
  const b = await q1<{ pin: string | null; vu: string | null; perime: boolean }>(
    `SELECT maintenance_pin AS pin, maintenance_vu AS vu,
            (maintenance_pin_le IS NULL
             OR maintenance_pin_le < now() - ($2 || ' minutes')::interval) AS perime
       FROM borne WHERE id = $1`,
    [borne_id, String(ROTATION_MIN)]);

  // Une borne qui n'annonce pas le code qu'elle porte tourne sur une version
  // anterieure a cette fonction : elle ignorerait celui qu'on lui enverrait, et
  // le SaaS afficherait un code que la porte refuse. On n'en fabrique donc pas
  // — la machine reste au code d'usine, et la page le dit.
  if (b?.vu == null) return null;

  if (b.pin && !b.perime) return b.pin;

  // ON NE FAIT PAS TOURNER UN CODE QUI N'A PAS ETE ACCUSE.
  //
  // La machine accepte le code courant ET celui qu'il vient de remplacer — sans
  // quoi elle refuserait, le temps d'un echange, celui que cette page affiche.
  // Ce filet ne couvre qu'UN cran. Si la configuration passe mais que le releve
  // qui la suit echoue, `maintenance_vu` reste en arriere ; faire tourner quand
  // meme mettrait la machine deux crans plus loin que ce qu'on affiche, et la
  // porte se refermerait pour de bon.
  //
  // Tant que la borne n'a pas confirme le dernier delivre, on lui redonne donc
  // le meme. Une machine dont la remontee est cassee garde un code fige : c'est
  // le bon echec — la fiche le dit (« un code attend d'etre repris »), et on
  // prefere un code qui vieillit a un technicien enferme dehors.
  if (b.pin && b.vu !== b.pin) return b.pin;

  const pin = nouveauPin();
  await q("UPDATE borne SET maintenance_pin = $2, maintenance_pin_le = now() WHERE id = $1",
          [borne_id, pin]);
  return pin;
}

/**
 * Demande un renouvellement immediat.
 *
 * On perime le code au lieu d'en poser un nouveau : la borne recevra le sien au
 * prochain appel, et jusque-la elle ouvre encore avec l'ancien — que la page
 * continue d'afficher, puisqu'il est confirme. Poser le nouveau tout de suite
 * aurait affiche un code que la machine n'a pas.
 *
 * Ce bouton reveille la borne dans la foulee (voir la route). Elle prend donc le
 * nouveau code pendant qu'on lit encore l'ancien sur la page qui suit la
 * redirection. La fiche passe alors au chargement — elle n'affiche plus rien
 * tant que la machine n'a pas confirme — et se refait seule jusqu'a ce que le
 * code revienne. C'etait la panne la plus visible de ce bouton : il livrait a
 * tous les coups un code que la porte venait de refuser.
 */
export async function renouvelerPin(borne_id: number, compte_id: number): Promise<void> {
  await q("UPDATE borne SET maintenance_pin_le = NULL WHERE id = $1 AND compte_id = $2",
          [borne_id, compte_id]);
}
