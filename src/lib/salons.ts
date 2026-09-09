import { q, q1, transaction, type PgClient } from "@/db";
import type { Utilisateur } from "./auth";
import { gradeDe, groupeDuCompte } from "./communaute";

/**
 * LES SALONS, ET CE QU'ON Y DIT.
 *
 * Un compte a un salon « general » et un salon par borne. Les premiers sont
 * pour l'equipe ; dans les seconds, la machine ecrit elle-meme ce qui lui
 * arrive — ventes, incidents, spires vides, chargements recus — et l'equipe
 * repond dessous. C'est la meme idee que le journal d'une borne, en lisible,
 * et avec des gens dedans.
 *
 * Et au-dela du compte, la communaute : les ANNONCES de l'editeur, que tout
 * le monde lit ; les salons de COMMUNAUTE, par groupe — tous, proprietaires
 * d'au moins une vraie borne, prospects ; et le SUPPORT, un salon par compte
 * entre lui et l'editeur.
 *
 * Trois regles :
 *
 *  1. ON VOIT LES SALONS DES BORNES QU'ON VOIT. Quelqu'un restreint a une
 *     machine ne lit ni n'ecrit ailleurs que dans « general » et dans le
 *     salon de sa machine. `Utilisateur.bornes` tranche, comme pour les pages.
 *
 *  2. L'EDITEUR VOIT TOUT CE QUI LE CONCERNE : chaque salon de support, et
 *     tous les groupes de la communaute. Lui seul ecrit dans les annonces.
 *
 *  3. RIEN NE S'EFFACE. Un message retire laisse sa place, avec « message
 *     retiré » dedans. Un fil ou des messages disparaissent fait douter de
 *     tous les autres.
 */

export type Portee = "compte" | "support" | "annonces" | "communaute";
export type Groupe = "tous" | "proprietaires" | "prospects";

export type Salon = {
  id: number; nom: string; sujet: string | null; borne_id: number | null;
  borne: string | null; ordre: number;
  portee: Portee; groupe: Groupe | null; compte_id: number | null;
  /** Le nom du compte, pour un salon de support vu par l'editeur. */
  compte: string | null;
  non_lus: number; dernier_le: Date | null;
};

export type Message = {
  id: number; salon_id: number; utilisateur_id: number | null;
  /** Le nom a afficher. Nul pour la machine : c'est le salon qui dit laquelle. */
  auteur: string | null; image_id: number | null;
  /** D'ou parle l'auteur, pour les salons qui traversent les comptes. */
  compte: string | null; grade: string | null; editeur: boolean; couleur: string | null;
  texte: string; cree_le: string; supprime: boolean;
};

/** Ce que l'editeur dit a tout le monde, et ou les gens se retrouvent. */
const PLATEFORME: { nom: string; sujet: string; portee: Portee; groupe: Groupe | null; ordre: number }[] = [
  { nom: "annonces", portee: "annonces", groupe: null, ordre: 0,
    sujet: "Les nouveautés de la console et des bornes, par l’équipe RedBox" },
  { nom: "entrepreneurs", portee: "communaute", groupe: "tous", ordre: 1,
    sujet: "Tous ceux qui font tourner des RedBox — et ceux qui y pensent" },
  { nom: "proprietaires", portee: "communaute", groupe: "proprietaires", ordre: 2,
    sujet: "Entre exploitants : ce qui marche, ce qui casse, ce qui se vend" },
  { nom: "prospects", portee: "communaute", groupe: "prospects", ordre: 3,
    sujet: "Pas encore de borne ? Posez vos questions ici" },
];

export const SUPPORT = { nom: "equipe-redbox", sujet: "Votre ligne directe avec l’équipe RedBox" };

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

/**
 * Le fragment SQL de ce que `u` a le droit de voir. `s` est l'alias de
 * `salon` ; $1 le compte, $2 ses bornes (nul = toutes), $3 si elle est de
 * l'editeur, $4 le groupe de son compte. Chaque parametre est lu au moins
 * une fois : Postgres refuse un parametre dont il ne peut pas deviner le type.
 */
const VISIBLE = `s.archive_le IS NULL AND (
     (s.portee = 'compte' AND s.compte_id = $1
        AND (s.borne_id IS NULL OR $2::bigint[] IS NULL OR s.borne_id = ANY($2)))
  OR (s.portee = 'support' AND (s.compte_id = $1 OR $3::boolean))
  OR  s.portee = 'annonces'
  OR (s.portee = 'communaute' AND (s.groupe = 'tous' OR s.groupe = $4::text OR $3::boolean)))`;

/** Les quatre parametres de VISIBLE, dans l'ordre. */
async function portee(u: Utilisateur): Promise<unknown[]> {
  return [u.compte_id, u.bornes, u.editeur, await groupeDuCompte(u.compte_id)];
}

/** Peut-elle ecrire la ? Les annonces sont a l'editeur ; le reste, a qui n'est pas en lecture seule. */
export function peutEcrire(u: Utilisateur, s: Salon): boolean {
  if (u.role === "lecture") return false;
  if (s.portee === "annonces") return u.editeur;
  return true;
}

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
  // La ligne directe avec l'editeur, et les salons de la plateforme.
  await q(`
    INSERT INTO salon (compte_id, nom, sujet, portee, ordre)
    SELECT $1, $2, $3, 'support', 90
     WHERE NOT EXISTS (SELECT 1 FROM salon WHERE compte_id = $1 AND portee = 'support')
    ON CONFLICT (compte_id, nom) DO NOTHING`, [compte_id, SUPPORT.nom, SUPPORT.sujet]);
  await q(`
    INSERT INTO salon (compte_id, nom, sujet, portee, groupe, ordre)
    SELECT NULL, p.nom, p.sujet, p.portee, p.groupe, p.ordre
      FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[]) AS p(nom, sujet, portee, groupe, ordre)
    ON CONFLICT (nom) WHERE compte_id IS NULL DO NOTHING`,
    [PLATEFORME.map((p) => p.nom), PLATEFORME.map((p) => p.sujet), PLATEFORME.map((p) => p.portee),
     PLATEFORME.map((p) => p.groupe), PLATEFORME.map((p) => p.ordre)]);
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
const COLONNES_SALON = `
  s.id, s.nom, s.sujet, s.borne_id, b.nom AS borne, s.ordre,
  s.portee, s.groupe, s.compte_id, k.nom AS compte`;

export async function salonsDe(u: Utilisateur): Promise<Salon[]> {
  return q<Salon>(`
    SELECT ${COLONNES_SALON},
           (SELECT COUNT(*)::int FROM message m
             WHERE m.salon_id = s.id AND m.supprime_le IS NULL
               AND m.id > COALESCE(l.dernier_id, 0)
               AND m.utilisateur_id IS DISTINCT FROM $5::bigint) AS non_lus,
           (SELECT MAX(m.cree_le) FROM message m WHERE m.salon_id = s.id) AS dernier_le
      FROM salon s
      LEFT JOIN borne b ON b.id = s.borne_id
      LEFT JOIN compte k ON k.id = s.compte_id
      LEFT JOIN salon_lecture l ON l.salon_id = s.id AND l.utilisateur_id = $5::bigint
     WHERE ${VISIBLE}
     ORDER BY (s.compte_id IS DISTINCT FROM $1), s.ordre, s.nom`, [...await portee(u), u.id]);
}

/** Un salon, s'il est a elle. */
export async function salonDe(u: Utilisateur, id: number): Promise<Salon | null> {
  return q1<Salon>(`
    SELECT ${COLONNES_SALON}, 0 AS non_lus, NULL AS dernier_le
      FROM salon s LEFT JOIN borne b ON b.id = s.borne_id LEFT JOIN compte k ON k.id = s.compte_id
     WHERE ${VISIBLE} AND s.id = $5`, [...await portee(u), id]);
}

/** Ce que tout le monde n'a pas lu, tous salons confondus : la pastille de l'en-tete. */
export async function nonLus(u: Utilisateur): Promise<number> {
  const r = await q1<{ n: number }>(`
    SELECT COUNT(*)::int AS n
      FROM message m
      JOIN salon s ON s.id = m.salon_id
      LEFT JOIN salon_lecture l ON l.salon_id = s.id AND l.utilisateur_id = $5::bigint
     WHERE ${VISIBLE} AND m.supprime_le IS NULL
       AND m.id > COALESCE(l.dernier_id, 0)
       AND m.utilisateur_id IS DISTINCT FROM $5::bigint`, [...await portee(u), u.id]);
  return r?.n ?? 0;
}

/**
 * Les colonnes d'un message. L'auteur est nomme par son pseudo dans la
 * communaute, par son nom dans son equipe ; les deux se resolvent ici, et la
 * page choisit. Le grade se lit sur les vraies bornes de ses comptes.
 */
const COLONNES = `
  m.id, m.salon_id, m.utilisateur_id,
  CASE WHEN m.utilisateur_id IS NULL THEN NULL
       ELSE COALESCE(NULLIF(TRIM(x.pseudo), ''), NULLIF(TRIM(x.nom), ''), split_part(x.email, '@', 1)) END AS auteur,
  x.image_id, x.couleur, kx.nom AS compte, COALESCE(kx.editeur, false) AS editeur,
  CASE WHEN m.utilisateur_id IS NULL THEN NULL ELSE
    (SELECT COUNT(DISTINCT b.id)::int FROM borne b
       JOIN membre mb ON mb.compte_id = b.compte_id AND mb.utilisateur_id = x.id
      WHERE b.jeton IS NOT NULL AND b.jeton NOT LIKE 'demo\\_%') END AS bornes,
  CASE WHEN m.supprime_le IS NULL THEN m.texte ELSE '' END AS texte,
  to_char(m.cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cree_le,
  (m.supprime_le IS NOT NULL) AS supprime`;
const JOINTURES = `LEFT JOIN utilisateur x ON x.id = m.utilisateur_id LEFT JOIN compte kx ON kx.id = x.compte_id`;

/** Le grade se calcule ici, pas en base : la table des grades est dans le code. */
type Brut = Omit<Message, "grade"> & { bornes: number | null };
function grader(rows: Brut[]): Message[] {
  return rows.map(({ bornes, ...r }) => ({ ...r, grade: bornes === null ? null : gradeDe(bornes).nom }));
}

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
    return grader(await q<Brut>(`
      SELECT ${COLONNES} FROM message m ${JOINTURES}
       WHERE m.salon_id = $1 AND m.id > $2 ORDER BY m.id LIMIT $3`, [salon_id, o.depuis, limite]));
  }
  const rows = await q<Brut>(`
    SELECT ${COLONNES} FROM message m ${JOINTURES}
     WHERE m.salon_id = $1 AND ($2::bigint IS NULL OR m.id < $2)
     ORDER BY m.id DESC LIMIT $3`, [salon_id, o.avant ?? null, limite]);
  return grader(rows.reverse());
}

/** Un message de plus, rendu tel qu'il s'affiche. */
export async function deposer(salon_id: number, utilisateur_id: number | null, texte: string,
                              c?: PgClient): Promise<Message> {
  const sql = `
    WITH n AS (INSERT INTO message (salon_id, utilisateur_id, texte) VALUES ($1, $2, $3) RETURNING *)
    SELECT ${COLONNES} FROM n m ${JOINTURES}`;
  const p = [salon_id, utilisateur_id, texte];
  const r = c ? (await c.query<Brut>(sql, p)).rows[0] : await q1<Brut>(sql, p);
  return grader([r!])[0];
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
