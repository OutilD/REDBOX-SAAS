/**
 * L'en-tete que pose le navigateur quand c'est notre script qui envoie un
 * formulaire (voir `app/occupe.tsx`) : il veut l'adresse de retour en JSON,
 * pour y aller sans recharger la page, plutot qu'une redirection.
 *
 * A part, sans rien d'autre : le script tourne dans le navigateur, et
 * `lib/auth` ouvre une connexion a la base.
 */
export const ENTETE_ENVOI = "x-rbx-envoi";
