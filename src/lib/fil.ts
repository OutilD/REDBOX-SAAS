/**
 * CE QUE LE FIL ET LE SERVEUR PARTAGENT — sans rien d'autre : le fil tourne
 * dans le navigateur et ne peut pas importer `lib/salons`, qui ouvre la base.
 */

/** Un lot de messages : ce qu'on charge d'un coup, a l'ouverture et en remontant. */
export const MESSAGES_PAR_LOT = 40;

/** Le sondage du fil : vif tant qu'il se passe quelque chose, calme apres deux minutes sans rien. */
export const CADENCE_VIVE_MS = 3000;
export const CADENCE_CALME_MS = 12000;
export const CALME_APRES_MS = 2 * 60_000;
