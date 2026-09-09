/**
 * LE FUSEAU DE L'APPLICATION — la definition. `@/db` le re-exporte, et c'est
 * de la que tout le code serveur le lit ; ce fichier n'existe a part que pour
 * que le navigateur puisse le lire aussi, sans embarquer le pilote Postgres
 * avec lui. La regle ne change pas : tout ce qui ecrit ou decoupe le temps
 * passe par cette constante, jamais par le fuseau de la machine.
 */
export const FUSEAU = "Europe/Paris";
