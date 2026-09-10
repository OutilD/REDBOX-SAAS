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

export type Reaction = { emoji: string; n: number; mien: boolean };

export const ESTAMPILLE: ReadonlySet<string> = new Set<string>(EMOJIS);
