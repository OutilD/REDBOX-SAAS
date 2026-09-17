/**
 * LES SIX REACTIONS.
 *
 * Pas de clavier a emojis : six gestes nommes, toujours les memes, qui se
 * comptent et se comparent d'un fil a l'autre. Un choix libre donne mille
 * symboles vus une fois chacun, et plus rien a lire.
 *
 * Ce module ne touche pas la base — c'est pour ca qu'il existe a part de
 * `salons.ts` : le fil est un composant client, et importer la liste depuis
 * une feuille qui ouvre une connexion Postgres tirerait `pg` dans le
 * navigateur. Meme raison que `fuseau.ts` et `personnes.ts`.
 */
export const EMOJIS = ["👍", "🔥", "💡", "🙌", "😂", "😮"] as const;

/**
 * `qui` : les AUTRES qui ont pose cet emoji, dans l'ordre ou ils l'ont fait.
 * La personne qui lit n'y est pas — `mien` le dit, et le fil ecrit « Vous » :
 * son appui s'affiche tout de suite, sans attendre que le serveur lui rende
 * son propre nom.
 */
export type Reaction = { emoji: string; n: number; mien: boolean; qui: string[] };

export const ESTAMPILLE: ReadonlySet<string> = new Set<string>(EMOJIS);
