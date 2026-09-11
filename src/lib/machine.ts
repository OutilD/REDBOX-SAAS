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

/**
 * LA FACADE, TELLE QU'ON LA VOIT PORTE OUVERTE.
 *
 * Les ecrans du reassort dessinent les spirales a leur place : cinq plateaux de
 * deux, du premier au dernier. Une liste « 101, 102, 201… » obligeait a
 * traduire chaque ligne en une position dans sa tete ; la grille, elle, se
 * superpose a la machine qu'on a devant soi.
 *
 * Les dix positions sont toujours la, garnies ou non : une spirale sans produit
 * est une place a prendre, pas une ligne qui manque. Une spirale connue hors de
 * ces dix — une machine adoptee avant que la geometrie soit fixee — s'ajoute a
 * sa place au lieu de disparaitre.
 */
export type Position<T> = {
  lane: number; rangee: number; colonne: number; code: string;
  /** L'une des dix spires du materiel. */
  standard: boolean;
  /** Ce que le SaaS en sait — rien, pour une spirale jamais declaree. */
  item: T | null;
};

export function facade<T extends { lane: number; rangee: number; colonne: number }>(
  items: T[]): { rangs: Position<T>[][]; colonnes: number } {
  const colonnes = Math.max(COLONNES, ...items.map((i) => i.colonne));
  const rangees = Math.max(RANGEES, ...items.map((i) => i.rangee));
  const par = new Map(items.map((i) => [`${i.rangee}:${i.colonne}`, i]));

  const rangs: Position<T>[][] = [];
  for (let r = 1; r <= rangees; r++) {
    const rang: Position<T>[] = [];
    for (let c = 1; c <= colonnes; c++) {
      const item = par.get(`${r}:${c}`) ?? null;
      const standard = spireValide(r, c);
      if (!item && !standard) continue;
      rang.push({ lane: item?.lane ?? laneDe(r, c), rangee: r, colonne: c,
                  code: `${r}${String(c).padStart(2, "0")}`, standard, item });
    }
    if (rang.length > 0) rangs.push(rang);
  }
  return { rangs, colonnes };
}
