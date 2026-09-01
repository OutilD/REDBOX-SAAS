/**
 * LA GEOMETRIE DE LA MACHINE.
 *
 * Une RedBox porte DIX spires : cinq rangees de deux.
 *
 *     101  102
 *     201  202
 *     301  302
 *     401  402
 *     501  502
 *
 * Ce n'est pas un reglage, c'est le materiel. Le protocole CSM, lui, accepte
 * des rangees et des colonnes jusqu'a dix — mais annoncer 601 a une machine qui
 * n'a pas de sixieme rangee, c'est promettre une vente qui echouera a la
 * distribution, encaissee et sans marchandise.
 *
 * Le jour ou un autre modele arrive, cette constante devient une colonne de la
 * table `borne`, et rien d'autre ne bouge.
 */
export const RANGEES = 5;
export const COLONNES = 2;

/** L'adresse envoyee au moteur. Identique a `makeSendCmd` du SDK CSM. */
export function laneDe(rangee: number, colonne: number): number {
  return (rangee - 1) * 10 + colonne;
}

export function spireValide(rangee: number, colonne: number): boolean {
  return Number.isInteger(rangee) && Number.isInteger(colonne)
      && rangee >= 1 && rangee <= RANGEES
      && colonne >= 1 && colonne <= COLONNES;
}

/** Les dix adresses, dans l'ordre ou on les lit sur la facade. */
export function toutesLesSpires(): { lane: number; rangee: number; colonne: number; code: string }[] {
  const out = [];
  for (let r = 1; r <= RANGEES; r++) {
    for (let c = 1; c <= COLONNES; c++) {
      out.push({ lane: laneDe(r, c), rangee: r, colonne: c,
                 code: `${r}${String(c).padStart(2, "0")}` });
    }
  }
  return out;
}
