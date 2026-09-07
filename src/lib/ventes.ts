/**
 * Les statuts qu'une borne remonte pour chaque article, et ce qu'on en fait.
 *
 * Une vente qui n'aboutit pas ne s'arrete pas toujours au meme endroit, et ce
 * n'est pas la meme personne qui doit s'en occuper. Trois familles :
 *
 *   distribue            la seule qui compte dans le chiffre d'affaires
 *   A_REGARDER           paye, rien n'est tombe : quelqu'un doit verifier l'argent
 *   AVORTEES             le client est reparti sans payer : une statistique, pas
 *                        un incident — on la regarde pour savoir si le terminal
 *                        ou le lecteur d'identite font fuir des clients
 *
 * Les mots sont ceux du CHECK de `vente.statut` et de `StatutVente` cote borne.
 * Ajouter un statut ici sans l'ajouter au schema ferait echouer tout releve de
 * la borne qui l'emploie — et sa file ne se viderait plus.
 */

export const A_REGARDER = ["litige", "chute_non_detectee", "non_distribue"] as const;
export const AVORTEES = ["age_refuse", "carte_absente", "carte_refusee",
                         "terminal_indisponible", "avortee"] as const;
export const STATUTS: readonly string[] = ["distribue", ...A_REGARDER, ...AVORTEES];

/** Ce que la pilule dit, pour chaque statut autre que distribue. */
export const LIBELLES: Record<string, string> = {
  litige:                "payé, rien n’est tombé, argent conservé",
  chute_non_detectee:    "payé, la spirale a tourné, chute non détectée",
  non_distribue:         "payé, la spirale n’a pas tourné",
  age_refuse:            "âge non vérifié",
  carte_absente:         "aucune carte présentée",
  carte_refusee:         "carte refusée",
  terminal_indisponible: "terminal indisponible",
  avortee:               "interrompue avant la spirale",
};

/** Un mot plus court, pour les compteurs. */
export const NOMS: Record<string, string> = {
  age_refuse:            "Âge non vérifié",
  carte_absente:         "Aucune carte présentée",
  carte_refusee:         "Carte refusée",
  terminal_indisponible: "Terminal indisponible",
  avortee:               "Interrompue avant la spirale",
};

function liste(l: readonly string[]): string {
  return l.map((s) => `'${s}'`).join(",");
}

/** Fragments SQL. `v` est l'alias de `vente`. */
export const SQL_A_REGARDER = `v.statut IN (${liste(A_REGARDER)}) AND v.traite_le IS NULL`;
export const SQL_AVORTEE = `v.statut IN (${liste(AVORTEES)})`;

/**
 * Les bornes jusqu'a la 5.12 ne distinguaient rien : tout ce qui s'arretait avant
 * la spirale arrivait en `non_distribue` sans canal. On le range a sa place a
 * l'arrivee, tant qu'il en reste une en service.
 */
export function statutRecu(version: string | null | undefined, statut: string,
                           lane: number | null | undefined): string {
  if (statut === "non_distribue" && (lane === null || lane === undefined)
      && anterieureA(version, 5, 13)) {
    return "avortee";
  }
  return statut;
}

function anterieureA(version: string | null | undefined, majeure: number, mineure: number): boolean {
  const m = /^(\d+)\.(\d+)/.exec(version ?? "");
  if (!m) return true;                      // pas de version : une vieille borne
  const a = Number(m[1]), b = Number(m[2]);
  return a < majeure || (a === majeure && b < mineure);
}

/**
 * La base a-t-elle recu la migration de la 5.13 ?
 *
 * Elle apporte les neuf statuts, la colonne `article` et la cle d'unicite a
 * quatre colonnes. Si `npm run migrate` n'a pas ete lance, un releve qui s'en
 * servirait echouerait : la transaction serait annulee, la borne recevrait un
 * 500, sa file ne se viderait plus. On verifie donc — une fois par minute, pas a
 * chaque appel — et la route ecrit comme avant tant que ce n'est pas fait.
 */
let verifieLe = 0;
let migree = false;

export async function baseMigree(
  query: (sql: string) => Promise<{ rows: { conname: string; def: string }[] }>): Promise<boolean> {
  if (Date.now() - verifieLe < 60_000) return migree;
  const r = await query(`
    SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'vente'::regclass AND conname IN ('vente_statut_check', 'vente_unicite')`);
  const statuts = r.rows.find((x) => x.conname === "vente_statut_check")?.def ?? "";
  const unicite = r.rows.find((x) => x.conname === "vente_unicite")?.def ?? "";
  migree = statuts.includes("avortee") && unicite.includes("article");
  verifieLe = Date.now();
  return migree;
}

/** Le statut d'avant la 5.13 qui ressemble le plus. */
export function rabattu(statut: string): string {
  if (statut === "distribue" || statut === "litige") return statut;
  return "non_distribue";
}
