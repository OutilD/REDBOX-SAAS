import { after } from "next/server";

/**
 * CE QUI SE FAIT APRES LA REPONSE, ET QUI DOIT QUAND MEME SE FAIRE.
 *
 * Prevenir les telephones, evaluer les badges, faire la ronde : on ne fait pas
 * attendre la borne ni le navigateur pour cela. Mais un `void promesse` ne
 * suffit pas sur une plateforme qui gele le processus des que la reponse est
 * partie : les envois lances en parallele s'arretaient au milieu — un telephone
 * sur deux recevait la notification, jamais le meme, et les autres comptaient
 * un echec. `after` dit a la plateforme d'attendre la fin de la tache.
 *
 * Hors d'une requete — la minuterie de la ronde, un script — `after` refuse :
 * le processus vit alors assez longtemps, et la tache part simplement.
 */
export function apres(quoi: string, tache: () => Promise<unknown>): void {
  const lancer = () => tache().catch((e) => console.error(`${quoi} :`, e instanceof Error ? e.message : e));
  try { after(lancer); }
  catch { void lancer(); }
}
