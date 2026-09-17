import { q, q1, transaction, type PgClient } from "@/db";
import type { Utilisateur } from "./auth";

/**
 * LA CENTRALE D'ACHAT : LA BOUTIQUE DES REDBOXERS.
 *
 * Ce qu'on met dans une RedBox, ou l'acheter, a quel prix, et combien ca
 * rapporte : une boutique qui se parcourt comme un site de vente — recherche,
 * categories, tri, fiche produit —, sauf que l'achat lui-meme se fait chez le
 * fournisseur, par son lien. RedBox ne vend rien ici, elle montre ou acheter.
 *
 * C'est un catalogue de la PLATEFORME : les super-admins l'ecrivent, tous les
 * comptes le lisent. Rien a voir avec le catalogue d'un exploitant
 * (`produit`), qui est le sien et part sur ses machines.
 */

export const NOM_MAX = 120;
export const TEXTE_MAX = 2000;
export const URL_MAX = 500;

/** Qui ecrit la boutique : les super-admins seulement. */
export function peutEditerCentrale(u: Utilisateur): boolean {
  return u.superAdmin;
}

export type Categorie = { id: number; nom: string; ordre: number; produits: number };
export type Fournisseur = {
  id: number; nom: string; url: string | null; texte: string | null; image_id: number | null; ordre: number;
  produits: number;
};
export type Produit = {
  id: number; fournisseur_id: number; fournisseur: string; fournisseur_url: string | null;
  categorie_id: number | null; categorie: string | null;
  nom: string; texte: string | null; url: string | null;
  prix_achat_c: number | null; prix_conseille_c: number | null; image_id: number | null;
  disponible: boolean; ordre: number; cree_le: string;
};

export const TRIS = [
  { cle: "recents",   nom: "Nouveautés" },
  { cle: "prix-asc",  nom: "Prix d’achat croissant" },
  { cle: "prix-desc", nom: "Prix d’achat décroissant" },
  { cle: "marge",     nom: "Meilleure marge" },
  { cle: "nom",       nom: "Nom A → Z" },
] as const;
export type Tri = (typeof TRIS)[number]["cle"];
export const estTri = (t: string): t is Tri => TRIS.some((x) => x.cle === t);

export type Filtre = {
  categorie?: number | null; fournisseur?: number | null; q?: string | null; tri?: Tri; dispo?: boolean;
};

const COLONNES = `
  p.id, p.fournisseur_id, f.nom AS fournisseur, f.url AS fournisseur_url,
  p.categorie_id, c.nom AS categorie, p.nom, p.texte, p.url,
  p.prix_achat_c, p.prix_conseille_c, p.image_id, p.disponible, p.ordre,
  to_char(p.cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cree_le`;
const JOINTURES = `
  FROM centrale_produit p
  JOIN centrale_fournisseur f ON f.id = p.fournisseur_id
  LEFT JOIN centrale_categorie c ON c.id = p.categorie_id`;

const ORDRES: Record<Tri, string> = {
  recents: "p.cree_le DESC, p.id DESC",
  "prix-asc": "p.prix_achat_c ASC NULLS LAST, p.nom",
  "prix-desc": "p.prix_achat_c DESC NULLS LAST, p.nom",
  marge: "(CASE WHEN p.prix_achat_c > 0 AND p.prix_conseille_c > 0 THEN (p.prix_conseille_c - p.prix_achat_c)::float / p.prix_conseille_c END) DESC NULLS LAST, p.nom",
  nom: "p.nom, p.id",
};

function typer(p: Produit): Produit {
  return { ...p, id: Number(p.id), fournisseur_id: Number(p.fournisseur_id),
           categorie_id: p.categorie_id === null ? null : Number(p.categorie_id),
           image_id: p.image_id === null ? null : Number(p.image_id) };
}

/** Les produits qui repondent au filtre, dans l'ordre demande. */
export async function produits(f: Filtre = {}): Promise<Produit[]> {
  const ordre = f.tri && ORDRES[f.tri] ? ORDRES[f.tri] : "p.disponible DESC, f.ordre, p.ordre, p.id";
  const motif = f.q ? `%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const lignes = await q<Produit>(`
    SELECT ${COLONNES} ${JOINTURES}
     WHERE ($1::bigint IS NULL OR p.categorie_id = $1)
       AND ($2::bigint IS NULL OR p.fournisseur_id = $2)
       AND ($3::text IS NULL OR p.nom ILIKE $3 OR COALESCE(p.texte, '') ILIKE $3 OR f.nom ILIKE $3)
       AND (NOT $4::boolean OR p.disponible)
     ORDER BY ${ordre}`, [f.categorie ?? null, f.fournisseur ?? null, motif, Boolean(f.dispo)]);
  return lignes.map(typer);
}

export async function produitDe(id: number): Promise<Produit | null> {
  if (!Number.isInteger(id)) return null;
  const p = await q1<Produit>(`SELECT ${COLONNES} ${JOINTURES} WHERE p.id = $1`, [id]);
  return p ? typer(p) : null;
}

/** D'autres produits du meme rayon, les disponibles d'abord. */
export async function similaires(p: Produit, n = 4): Promise<Produit[]> {
  const lignes = await q<Produit>(`
    SELECT ${COLONNES} ${JOINTURES}
     WHERE p.id <> $1 AND (p.categorie_id = $2 OR ($2::bigint IS NULL AND p.fournisseur_id = $3))
     ORDER BY p.disponible DESC, (p.fournisseur_id = $3) DESC, p.ordre, p.id LIMIT $4`,
    [p.id, p.categorie_id, p.fournisseur_id, n]);
  return lignes.map(typer);
}

export async function categories(): Promise<Categorie[]> {
  return (await q<Categorie>(`
    SELECT c.id, c.nom, c.ordre,
           (SELECT COUNT(*)::int FROM centrale_produit p WHERE p.categorie_id = c.id) AS produits
      FROM centrale_categorie c ORDER BY c.ordre, c.id`)).map((c) => ({ ...c, id: Number(c.id) }));
}

export async function fournisseurs(): Promise<Fournisseur[]> {
  return (await q<Fournisseur>(`
    SELECT f.id, f.nom, f.url, f.texte, f.image_id, f.ordre,
           (SELECT COUNT(*)::int FROM centrale_produit p WHERE p.fournisseur_id = f.id) AS produits
      FROM centrale_fournisseur f ORDER BY f.ordre, f.id`))
    .map((f) => ({ ...f, id: Number(f.id), image_id: f.image_id === null ? null : Number(f.image_id) }));
}

/* ----------------------------------------------------------------- affichage */

export function euros(c: number | null | undefined): string {
  if (c === null || c === undefined) return "—";
  return `${(c / 100).toFixed(2).replace(".", ",")} €`;
}

/** La marge brute en pourcentage du prix de vente conseille, ou nulle si l'un manque. */
export function marge(achat: number | null, vente: number | null): number | null {
  if (!achat || !vente || vente <= 0) return null;
  return Math.round(((vente - achat) / vente) * 100);
}

/** Le coefficient : « ×3,1 » — ce qu'un euro d'achat devient a la vente. */
export function coefficient(achat: number | null, vente: number | null): string | null {
  if (!achat || !vente) return null;
  return `×${(vente / achat).toFixed(1).replace(".", ",")}`;
}

/** Ou acheter ce produit : sa page, a defaut le site du fournisseur. */
export const lienAchat = (p: Produit): string | null => p.url ?? p.fournisseur_url;

/** Nouveau : arrive depuis moins d'un mois. */
export const estNouveau = (p: Produit): boolean => Date.now() - new Date(p.cree_le).getTime() < 30 * 86_400_000;

/* ------------------------------------------------------------------- ecriture */

type Table = "centrale_categorie" | "centrale_fournisseur" | "centrale_produit";
const PARENT: Record<Table, string | null> = {
  centrale_categorie: null, centrale_fournisseur: null, centrale_produit: "fournisseur_id",
};

export async function rangSuivant(c: PgClient, table: Table, parent: number | null): Promise<number> {
  const col = PARENT[table];
  const r = await c.query<{ n: number }>(
    `SELECT COALESCE(MAX(ordre), 0)::int + 1 AS n FROM ${table} WHERE ${col ? `${col} = $1` : "$1::bigint IS NULL"}`,
    [parent]);
  return r.rows[0].n;
}

/** Monter ou descendre d'un rang, en renumerotant toute la liste. */
export async function deplacer(table: Table, id: number, sens: "monter" | "descendre"): Promise<void> {
  const col = PARENT[table];
  await transaction(async (c) => {
    const parent = col
      ? (await c.query<{ p: number }>(`SELECT ${col} AS p FROM ${table} WHERE id = $1`, [id])).rows[0]?.p
      : null;
    if (col && parent === undefined) return;
    const ids = (await c.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE ${col ? `${col} = $1` : "$1::bigint IS NULL"} ORDER BY ordre, id FOR UPDATE`,
      [parent])).rows.map((r) => Number(r.id));
    const i = ids.indexOf(id);
    const j = sens === "monter" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await c.query(`
      UPDATE ${table} t SET ordre = x.o FROM unnest($1::bigint[]) WITH ORDINALITY AS x(id, o)
       WHERE t.id = x.id`, [ids]);
  });
}

/** Un texte de formulaire, coupe et nettoye ; vide devient nul. */
export function champ(f: FormData, nom: string, max: number): string | null {
  const v = String(f.get(nom) ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
  return v === "" ? null : v;
}

/** Un lien http(s), ou nul. Vide est accepte ; illisible est refuse (`false`). */
export function lien(f: FormData, nom: string): string | null | false {
  const v = champ(f, nom, URL_MAX);
  if (v === null) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : false;
  } catch { return false; }
}
