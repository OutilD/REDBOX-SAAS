import { q, q1 } from "@/db";
import { DOMAINE } from "./invente";
import type { Forme, Rang } from "./communaute";
import { pseudoDe } from "./communaute";

/**
 * LES DEFIS DU MOIS (tables `defi`, `defi_reussi`).
 *
 * Un badge dit ce qu'on a fait un jour ; un defi donne a tout le monde le
 * meme but au meme moment, et un classement a part. L'editeur les pose
 * depuis /communaute/defis. La mesure se compte dans la fenetre du defi,
 * heure de Paris, avec les memes exclusions que les badges : ni bornes de
 * demo, ni salons de demo, ni personnes inventees.
 *
 * Reussi, il reste acquis — un badge ne se perd pas — et ses points
 * s'ajoutent (`SQL_POINTS_DEFIS`, dans lib/communaute).
 */
export type Mesure = "ventes" | "ca" | "ventes_nuit" | "messages" | "jours_actifs" | "reactions";

export const MESURES: Record<Mesure, { nom: string; unite: [string, string] }> = {
  ventes:       { nom: "Ventes distribuées",              unite: ["vente", "ventes"] },
  ca:           { nom: "Chiffre d’affaires (€)",          unite: ["€", "€"] },
  ventes_nuit:  { nom: "Ventes entre 3 h et 5 h",         unite: ["vente de nuit", "ventes de nuit"] },
  messages:     { nom: "Messages écrits",                 unite: ["message", "messages"] },
  jours_actifs: { nom: "Journées où l’on a écrit",        unite: ["journée", "journées"] },
  reactions:    { nom: "Réactions offertes aux autres",   unite: ["réaction", "réactions"] },
};

// hasOwn, pas `in` : « toString » ou « constructor » ne sont pas des mesures.
export const mesureValide = (m: unknown): m is Mesure => typeof m === "string" && Object.hasOwn(MESURES, m);

/** Les dessins proposes pour un defi : ceux des badges qui disent un effort. */
export const FORMES_DEFI: Forme[] = ["trophee", "cible", "flamme", "eclair", "etoile", "medaille", "drapeau"];

export type Defi = {
  id: number; titre: string; mesure: Mesure; objectif: number;
  debut: string; fin: string; forme: Forme; points: number;
  /** Combien l'ont reussi. */
  reussis: number;
};

/** Le palier d'un defi, pour le metal de sa piece : les memes seuils que les badges. */
export function rangDefi(points: number): Rang {
  return points >= 400 ? "legendaire" : points >= 250 ? "epique" : points >= 100 ? "rare" : "commun";
}

const AUJOURDHUI = "(now() AT TIME ZONE 'Europe/Paris')::date";
const DANS = (col: string) =>
  `${col} >= (d.debut::timestamp AT TIME ZONE 'Europe/Paris')
   AND ${col} < ((d.fin + 1)::timestamp AT TIME ZONE 'Europe/Paris')`;
const VRAIE_BORNE = "b.jeton IS NOT NULL AND b.jeton NOT LIKE 'demo\\_%'";
const VRAI_SALON = "JOIN salon sx ON sx.id = x.salon_id LEFT JOIN compte kx ON kx.id = sx.compte_id";

/**
 * (utilisateur_id, n) pour un defi. $1 = defi, $2 = une personne ou null.
 * Une ligne par personne qui a au moins un point.
 */
const SQL_MESURE: Record<Mesure, string> = {
  ventes: `
    SELECT m.utilisateur_id, COUNT(*)::int AS n
      FROM defi d JOIN vente v ON ${DANS("v.faite_le")}
      JOIN borne b ON b.id = v.borne_id JOIN membre m ON m.compte_id = b.compte_id
     WHERE d.id = $1 AND v.statut = 'distribue' AND ${VRAIE_BORNE}
       AND ($2::bigint IS NULL OR m.utilisateur_id = $2)
     GROUP BY m.utilisateur_id`,
  ca: `
    SELECT m.utilisateur_id, (SUM(v.prix_c) / 100)::int AS n
      FROM defi d JOIN vente v ON ${DANS("v.faite_le")}
      JOIN borne b ON b.id = v.borne_id JOIN membre m ON m.compte_id = b.compte_id
     WHERE d.id = $1 AND v.statut = 'distribue' AND ${VRAIE_BORNE}
       AND ($2::bigint IS NULL OR m.utilisateur_id = $2)
     GROUP BY m.utilisateur_id`,
  ventes_nuit: `
    SELECT m.utilisateur_id, COUNT(*)::int AS n
      FROM defi d JOIN vente v ON ${DANS("v.faite_le")}
      JOIN borne b ON b.id = v.borne_id JOIN membre m ON m.compte_id = b.compte_id
     WHERE d.id = $1 AND v.statut = 'distribue' AND ${VRAIE_BORNE}
       AND EXTRACT(HOUR FROM v.faite_le AT TIME ZONE 'Europe/Paris') BETWEEN 3 AND 4
       AND ($2::bigint IS NULL OR m.utilisateur_id = $2)
     GROUP BY m.utilisateur_id`,
  messages: `
    SELECT x.utilisateur_id, COUNT(*)::int AS n
      FROM defi d JOIN message x ON ${DANS("x.cree_le")} ${VRAI_SALON}
     WHERE d.id = $1 AND x.utilisateur_id IS NOT NULL AND x.supprime_le IS NULL
       AND NOT COALESCE(kx.demo, false) AND ($2::bigint IS NULL OR x.utilisateur_id = $2)
     GROUP BY x.utilisateur_id`,
  jours_actifs: `
    SELECT x.utilisateur_id, COUNT(DISTINCT (x.cree_le AT TIME ZONE 'Europe/Paris')::date)::int AS n
      FROM defi d JOIN message x ON ${DANS("x.cree_le")} ${VRAI_SALON}
     WHERE d.id = $1 AND x.utilisateur_id IS NOT NULL AND x.supprime_le IS NULL
       AND NOT COALESCE(kx.demo, false) AND ($2::bigint IS NULL OR x.utilisateur_id = $2)
     GROUP BY x.utilisateur_id`,
  reactions: `
    SELECT r.utilisateur_id, COUNT(*)::int AS n
      FROM defi d JOIN reaction r ON ${DANS("r.cree_le")}
      JOIN message x ON x.id = r.message_id ${VRAI_SALON}
     WHERE d.id = $1 AND x.utilisateur_id IS DISTINCT FROM r.utilisateur_id
       AND NOT COALESCE(kx.demo, false) AND ($2::bigint IS NULL OR r.utilisateur_id = $2)
     GROUP BY r.utilisateur_id`,
};

const COLONNES_DEFI = `
  d.id, d.titre, d.mesure, d.objectif, to_char(d.debut, 'YYYY-MM-DD') AS debut,
  to_char(d.fin, 'YYYY-MM-DD') AS fin, d.forme, d.points,
  (SELECT COUNT(*)::int FROM defi_reussi r JOIN utilisateur u ON u.id = r.utilisateur_id
    WHERE r.defi_id = d.id AND u.email NOT LIKE '%@' || $1) AS reussis`;

/** Les defis en cours, a venir, et les derniers termines. */
export async function lesDefis(): Promise<{ enCours: Defi[]; aVenir: Defi[]; passes: Defi[] }> {
  const tous = await q<Defi & { etat: "en_cours" | "a_venir" | "passe" }>(`
    SELECT ${COLONNES_DEFI},
           CASE WHEN d.debut > ${AUJOURDHUI} THEN 'a_venir'
                WHEN d.fin < ${AUJOURDHUI} THEN 'passe' ELSE 'en_cours' END AS etat
      FROM defi d
     WHERE d.fin >= ${AUJOURDHUI} - 400
     ORDER BY d.fin DESC, d.id DESC`, [DOMAINE]);
  return {
    enCours: tous.filter((d) => d.etat === "en_cours").reverse(),
    aVenir: tous.filter((d) => d.etat === "a_venir").reverse(),
    passes: tous.filter((d) => d.etat === "passe").slice(0, 12),
  };
}

export type Participant = {
  id: number; pseudo: string; image_id: number | null; couleur: string | null;
  editeur: boolean; n: number; reussi: boolean;
};

/** Le classement d'un defi : qui en est ou, le plus avance d'abord. */
export async function classementDefi(d: Defi, limite = 50): Promise<Participant[]> {
  const r = await q<{ id: number; pseudo: string | null; nom: string | null; email: string;
                      image_id: number | null; couleur: string | null; editeur: boolean; n: number; reussi: boolean }>(`
    WITH m AS (${SQL_MESURE[d.mesure]})
    SELECT u.id, u.pseudo, u.nom, u.email, u.image_id, u.couleur, c.editeur, m.n,
           EXISTS (SELECT 1 FROM defi_reussi r WHERE r.defi_id = $1 AND r.utilisateur_id = u.id) AS reussi
      FROM m JOIN utilisateur u ON u.id = m.utilisateur_id JOIN compte c ON c.id = u.compte_id
     WHERE u.email NOT LIKE '%@' || $3
     ORDER BY m.n DESC, u.id LIMIT $4`, [d.id, null, DOMAINE, limite]);
  return r.map((x) => ({ id: Number(x.id), pseudo: pseudoDe(x), image_id: x.image_id, couleur: x.couleur,
                         editeur: x.editeur, n: x.n, reussi: x.reussi }));
}

/** Ou en est une personne d'un defi. */
export async function avancement(d: Defi, utilisateur_id: number): Promise<number> {
  const r = await q1<{ n: number }>(SQL_MESURE[d.mesure], [d.id, utilisateur_id]);
  return r?.n ?? 0;
}

/**
 * Pose les defis qu'une personne vient de reussir, et les rend. Seulement
 * ceux commences et termines depuis moins de 45 jours : la mesure se compte
 * dans la fenetre du defi, un releve de ventes en retard peut encore faire
 * reussir celui du mois dernier.
 */
export async function evaluerDefis(utilisateur_id: number): Promise<Defi[]> {
  const ouverts = await q<Defi>(`
    SELECT ${COLONNES_DEFI} FROM defi d
     WHERE d.debut <= ${AUJOURDHUI} AND d.fin >= ${AUJOURDHUI} - 45
       AND NOT EXISTS (SELECT 1 FROM defi_reussi r WHERE r.defi_id = d.id AND r.utilisateur_id = $2)`,
    [DOMAINE, utilisateur_id]);
  // Chaque defi se mesure de son cote : en parallele, pas un aller-retour
  // apres l'autre. L'ordre de `ouverts` est garde dans le resultat.
  const poses = await Promise.all(ouverts.map(async (d) => {
    if ((await avancement(d, utilisateur_id)) < d.objectif) return null;
    const pose = await q(`
      INSERT INTO defi_reussi (defi_id, utilisateur_id) VALUES ($1, $2)
      ON CONFLICT DO NOTHING RETURNING defi_id`, [d.id, utilisateur_id]);
    return pose.length > 0 ? d : null;
  }));
  return poses.filter((d): d is Defi => d !== null);
}

export type DefiReussi = Defi & { reussi_le: Date };

/** Les defis qu'une personne a reussis, le plus recent d'abord : sa vitrine de trophees. */
export function defisReussisDe(utilisateur_id: number): Promise<DefiReussi[]> {
  return q<DefiReussi>(`
    SELECT ${COLONNES_DEFI}, r.reussi_le
      FROM defi_reussi r JOIN defi d ON d.id = r.defi_id
     WHERE r.utilisateur_id = $2 ORDER BY r.reussi_le DESC`, [DOMAINE, utilisateur_id]);
}

/** « du 1er au 31 octobre 2026 » */
export function periode(d: { debut: string; fin: string }): string {
  const f = (s: string, annee: boolean) => {
    const [a, m, j] = s.split("-").map(Number);
    const mois = new Date(Date.UTC(a, m - 1, j)).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
    return `${j === 1 ? "1er" : j} ${mois}${annee ? ` ${a}` : ""}`;
  };
  return `du ${f(d.debut, d.debut.slice(0, 4) !== d.fin.slice(0, 4))} au ${f(d.fin, true)}`;
}

/** Jours restants, aujourd'hui compris (heure de Paris). */
export function joursRestants(fin: string): number {
  const ici = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const ms = Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${ici}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}
