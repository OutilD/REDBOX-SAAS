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

import { anterieureA } from "./borne";

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
 * LES FILTRES DE LA PAGE VENTES — ET DE SON EXPORT, QUI LIT LES MEMES.
 *
 * Ecrits une fois : un fichier qui ne contiendrait pas les lignes de l'ecran
 * dont on l'a tire ne servirait a rien a un comptable. Ce qui ne se lit pas est
 * ignore (un statut inconnu, un produit qui n'est pas un nombre) plutot que de
 * faire tomber la page.
 */
export type Filtres = { q: string | null; statut: string | null; produit: number | null };

export function filtresDe(p: { q?: string | null; statut?: string | null; produit?: string | null }): Filtres {
  const q = (p.q ?? "").trim().slice(0, 64);
  return {
    q: q || null,
    statut: p.statut && STATUTS.includes(p.statut) ? p.statut : null,
    produit: p.produit && /^\d{1,12}$/.test(p.produit) ? Number(p.produit) : null,
  };
}

/**
 * Le fragment SQL des filtres. `n` est le rang du premier de ses trois
 * parametres : q, statut, produit, dans cet ordre.
 *
 * IL NE FAIT QUE RETIRER DES LIGNES. La portee — le compte et les bornes
 * ouvertes — reste dans chaque requete qui l'emploie ; un produit d'un autre
 * compte ne ramene donc rien. `strpos` plutot que LIKE : « % » ou « _ » tapes
 * dans la recherche sont des caracteres, pas des jokers.
 */
export function sqlFiltres(n: number): string {
  return `AND ($${n}::text IS NULL OR strpos(upper(v.commande_id), upper($${n}::text)) > 0)
          AND ($${n + 1}::text IS NULL OR v.statut = $${n + 1}::text)
          AND ($${n + 2}::bigint IS NULL OR v.produit_id = $${n + 2}::bigint)`;
}

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
