import { q, q1, transaction, type PgClient } from "@/db";
import type { Utilisateur } from "./auth";

/**
 * LES SALONS, ET CE QU'ON Y DIT.
 *
 * Un compte a un salon « general » et un salon par borne. Les premiers sont
 * pour l'equipe ; dans les seconds, la machine ecrit elle-meme ce qui lui
 * arrive — ventes, incidents, spires vides, chargements recus — et l'equipe
 * repond dessous. C'est la meme idee que le journal d'une borne, en lisible,
 * et avec des gens dedans.
 *
 * Deux regles :
 *
 *  1. ON VOIT LES SALONS DES BORNES QU'ON VOIT. Quelqu'un restreint a une
 *     machine ne lit ni n'ecrit ailleurs que dans « general » et dans le
 *     salon de sa machine. `Utilisateur.bornes` tranche, comme pour les pages.
 *
 *  2. RIEN NE S'EFFACE. Un message retire laisse sa place, avec « message
 *     retiré » dedans. Un fil ou des messages disparaissent fait douter de
 *     tous les autres.
 */

export type Salon = {
  id: number; nom: string; sujet: string | null; borne_id: number | null;
  borne: string | null; ordre: number;
  non_lus: number; dernier_le: Date | null;
};

export type Message = {
  id: number; salon_id: number; utilisateur_id: number | null;
  /** Le nom a afficher. Nul pour la machine : c'est le salon qui dit laquelle. */
  auteur: string | null; image_id: number | null;
  texte: string; cree_le: string; supprime: boolean;
};

export const TEXTE_MAX = 2000;
export const NOM_MAX = 40;

/** « RedBox — Le Duplex » → « le-duplex » : ce qu'on tape apres le diese. */
export function slug(nom: string): string {
  return nom
    .replace(/^\s*redbox\s*[—–-]\s*/i, "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, NOM_MAX) || "borne";
}

/** Le fragment SQL de ce que `u` a le droit de voir. `s` est l'alias de `salon`. */
const VISIBLE = `s.compte_id = $1 AND s.archive_le IS NULL
                 AND (s.borne_id IS NULL OR $2::bigint[] IS NULL OR s.borne_id = ANY($2))`;

/**
 * LE COMPTE A SES SALONS. « general » d'abord ; puis un par borne qui n'en a
 * pas encore, nomme d'apres elle. Deux bornes au meme nom : la seconde prend
 * son numero. Idempotent, appele a chaque ouverture de la messagerie — une
 * borne adoptee hier a son salon aujourd'hui sans que personne l'ait cree.
 */
export async function assurerSalons(compte_id: number): Promise<void> {
  await q(`
    INSERT INTO salon (compte_id, nom, sujet, ordre)
    VALUES ($1, 'general', 'Toute l’équipe, pour tout le reste', 0)
    ON CONFLICT (compte_id, nom) DO NOTHING`, [compte_id]);
  const sans = await q<{ id: number; nom: string }>(`
    SELECT b.id, b.nom FROM borne b
     WHERE b.compte_id = $1 AND NOT EXISTS (SELECT 1 FROM salon s WHERE s.borne_id = b.id)
     ORDER BY b.id`, [compte_id]);
  for (const b of sans) {
    const base = slug(b.nom);
    const r = await q(`
      INSERT INTO salon (compte_id, nom, sujet, borne_id, ordre)
      VALUES ($1, $2, $3, $4, 10)
      ON CONFLICT (compte_id, nom) DO NOTHING RETURNING id`,
      [compte_id, base, `Ce que vit ${b.nom}, et ce qu’on en dit`, b.id]);
    if (r.length === 0) {
      await q(`
        INSERT INTO salon (compte_id, nom, sujet, borne_id, ordre)
        VALUES ($1, $2, $3, $4, 10) ON CONFLICT DO NOTHING`,
        [compte_id, `${base}-${b.id}`, `Ce que vit ${b.nom}, et ce qu’on en dit`, b.id]);
    }
  }
}

/** Les salons que cette personne voit, avec ce qu'elle n'y a pas encore lu. */
export async function salonsDe(u: Utilisateur): Promise<Salon[]> {
  return q<Salon>(`
    SELECT s.id, s.nom, s.sujet, s.borne_id, b.nom AS borne, s.ordre,
           (SELECT COUNT(*)::int FROM message m
             WHERE m.salon_id = s.id AND m.supprime_le IS NULL
               AND m.id > COALESCE(l.dernier_id, 0)
               AND m.utilisateur_id IS DISTINCT FROM $3) AS non_lus,
           (SELECT MAX(m.cree_le) FROM message m WHERE m.salon_id = s.id) AS dernier_le
      FROM salon s
      LEFT JOIN borne b ON b.id = s.borne_id
      LEFT JOIN salon_lecture l ON l.salon_id = s.id AND l.utilisateur_id = $3
     WHERE ${VISIBLE}
     ORDER BY s.ordre, s.nom`, [u.compte_id, u.bornes, u.id]);
}

/** Un salon, s'il est a elle. */
export async function salonDe(u: Utilisateur, id: number): Promise<Salon | null> {
  return q1<Salon>(`
    SELECT s.id, s.nom, s.sujet, s.borne_id, b.nom AS borne, s.ordre, 0 AS non_lus, NULL AS dernier_le
      FROM salon s LEFT JOIN borne b ON b.id = s.borne_id
     WHERE ${VISIBLE} AND s.id = $3`, [u.compte_id, u.bornes, id]);
}

/** Ce que tout le monde n'a pas lu, tous salons confondus : la pastille de l'en-tete. */
export async function nonLus(u: Utilisateur): Promise<number> {
  const r = await q1<{ n: number }>(`
    SELECT COUNT(*)::int AS n
      FROM message m
      JOIN salon s ON s.id = m.salon_id
      LEFT JOIN salon_lecture l ON l.salon_id = s.id AND l.utilisateur_id = $3
     WHERE ${VISIBLE} AND m.supprime_le IS NULL
       AND m.id > COALESCE(l.dernier_id, 0)
       AND m.utilisateur_id IS DISTINCT FROM $3`, [u.compte_id, u.bornes, u.id]);
  return r?.n ?? 0;
}

const COLONNES = `
  m.id, m.salon_id, m.utilisateur_id,
  CASE WHEN m.utilisateur_id IS NULL THEN NULL
       ELSE COALESCE(NULLIF(TRIM(x.nom), ''), split_part(x.email, '@', 1)) END AS auteur,
  x.image_id,
  CASE WHEN m.supprime_le IS NULL THEN m.texte ELSE '' END AS texte,
  to_char(m.cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cree_le,
  (m.supprime_le IS NOT NULL) AS supprime`;

/**
 * Les messages d'un salon. `depuis` rend ce qui est arrive apres un
 * identifiant — c'est ce que le navigateur demande toutes les trois secondes
 * — ; `avant`, la page precedente quand on remonte le fil. Sans l'un ni
 * l'autre, les derniers. Toujours rendus du plus ancien au plus recent.
 */
export async function messagesDe(salon_id: number, o: { depuis?: number; avant?: number; limite?: number } = {}):
    Promise<Message[]> {
  const limite = Math.min(Math.max(o.limite ?? 60, 1), 200);
  if (o.depuis !== undefined) {
    return q<Message>(`
      SELECT ${COLONNES} FROM message m LEFT JOIN utilisateur x ON x.id = m.utilisateur_id
       WHERE m.salon_id = $1 AND m.id > $2 ORDER BY m.id LIMIT $3`, [salon_id, o.depuis, limite]);
  }
  const rows = await q<Message>(`
    SELECT ${COLONNES} FROM message m LEFT JOIN utilisateur x ON x.id = m.utilisateur_id
     WHERE m.salon_id = $1 AND ($2::bigint IS NULL OR m.id < $2)
     ORDER BY m.id DESC LIMIT $3`, [salon_id, o.avant ?? null, limite]);
  return rows.reverse();
}

/** Un message de plus, rendu tel qu'il s'affiche. */
export async function deposer(salon_id: number, utilisateur_id: number | null, texte: string,
                              c?: PgClient): Promise<Message> {
  const sql = `
    WITH n AS (INSERT INTO message (salon_id, utilisateur_id, texte) VALUES ($1, $2, $3) RETURNING *)
    SELECT ${COLONNES} FROM n m LEFT JOIN utilisateur x ON x.id = m.utilisateur_id`;
  const p = [salon_id, utilisateur_id, texte];
  const r = c ? (await c.query<Message>(sql, p)).rows[0] : await q1<Message>(sql, p);
  return r!;
}

/** Retire un de ses messages. Rend faux s'il n'est pas a elle. */
export async function retirer(id: number, utilisateur_id: number): Promise<boolean> {
  const r = await q(`
    UPDATE message SET supprime_le = now()
     WHERE id = $1 AND utilisateur_id = $2 AND supprime_le IS NULL RETURNING id`, [id, utilisateur_id]);
  return r.length > 0;
}

/** Elle a lu jusque-la. Ne recule jamais. */
export async function marquerLu(utilisateur_id: number, salon_id: number, dernier_id: number): Promise<void> {
  await q(`
    INSERT INTO salon_lecture (utilisateur_id, salon_id, dernier_id) VALUES ($1, $2, $3)
    ON CONFLICT (utilisateur_id, salon_id) DO UPDATE
      SET dernier_id = GREATEST(salon_lecture.dernier_id, EXCLUDED.dernier_id)`,
    [utilisateur_id, salon_id, dernier_id]);
}

/**
 * LA MACHINE ECRIT DANS SON SALON. Une ligne par sujet du releve : ce que la
 * notification dit, ecrit la ou l'equipe peut y repondre. Le salon est cree
 * s'il n'existe pas encore — une borne parle parfois avant qu'on ait ouvert
 * la messagerie.
 */
export async function deposerSysteme(compte_id: number, borne: { id: number; nom: string },
                                     lignes: string[]): Promise<void> {
  if (lignes.length === 0) return;
  await transaction(async (c) => {
    let s = (await c.query<{ id: number }>("SELECT id FROM salon WHERE borne_id = $1", [borne.id])).rows[0];
    if (!s) {
      const base = slug(borne.nom);
      s = (await c.query<{ id: number }>(`
        INSERT INTO salon (compte_id, nom, sujet, borne_id, ordre)
        VALUES ($1, $2, $3, $4, 10) ON CONFLICT (compte_id, nom) DO NOTHING RETURNING id`,
        [compte_id, base, `Ce que vit ${borne.nom}, et ce qu’on en dit`, borne.id])).rows[0]
        ?? (await c.query<{ id: number }>(`
        INSERT INTO salon (compte_id, nom, sujet, borne_id, ordre)
        VALUES ($1, $2, $3, $4, 10) RETURNING id`,
        [compte_id, `${base}-${borne.id}`, `Ce que vit ${borne.nom}, et ce qu’on en dit`, borne.id])).rows[0];
    }
    await c.query(`
      INSERT INTO message (salon_id, utilisateur_id, texte)
      SELECT $1, NULL, t FROM unnest($2::text[]) AS t`, [s.id, lignes]);
  });
}

/** Cree un salon d'equipe. Rend son identifiant, ou null si le nom est pris. */
export async function creerSalon(compte_id: number, nom: string, sujet: string | null): Promise<number | null> {
  const propre = slug(nom);
  if (!propre) return null;
  const r = await q1<{ id: number }>(`
    INSERT INTO salon (compte_id, nom, sujet, ordre) VALUES ($1, $2, $3, 50)
    ON CONFLICT (compte_id, nom) DO NOTHING RETURNING id`, [compte_id, propre, sujet]);
  return r?.id ?? null;
}
