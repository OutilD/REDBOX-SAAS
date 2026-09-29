import { q, q1 } from "@/db";
import { SQL_REDBOX_ATTRIBUEE } from "@/lib/communaute";

/**
 * CE QUE L'ACADEMIE DIT DE CEUX QUI LA SUIVENT, pour le super-admin.
 *
 * Qui compte : les personnes des vrais comptes. Pas l'equipe RedBox (le compte
 * editeur et les super-admins), pas les comptes en demo ni la vitrine, pas les
 * adresses `@redbox.invalid`. Un « redboxer » a une machine attribuee sur l'un
 * de ses comptes, comme pour #redboxers ; les autres sont des prospects.
 *
 * On ne compte que les lecons publiees de modules publies : un brouillon
 * ouvert par l'editeur ne fait pas partie du parcours.
 */

export const SQL_GENS = `
  SELECT u.id, u.pseudo, u.nom, u.email, u.image_id, u.couleur, u.cree_le, u.compte_id, c.nom AS compte,
         u.ville, u.latitude, u.longitude, u.situe_pour AS situe_ville,
         EXISTS (SELECT 1 FROM membre mb JOIN borne b ON b.compte_id = mb.compte_id
                  WHERE mb.utilisateur_id = u.id AND ${SQL_REDBOX_ATTRIBUEE}) AS redboxer
    FROM utilisateur u JOIN compte c ON c.id = u.compte_id
   WHERE NOT c.demo AND NOT c.vitrine AND NOT c.editeur AND NOT u.super_admin
     AND u.email NOT LIKE '%@redbox.invalid'`;

const SQL_PUBLIEES = `
  SELECT le.id, le.titre, le.ordre, le.module_id, m.titre AS module, m.ordre AS module_ordre,
         (le.acces = 'tous' AND m.acces = 'tous') AS ouverte_a_tous
    FROM academie_lecon le JOIN academie_module m ON m.id = le.module_id
   WHERE le.publie AND m.publie`;

export type Apprenant = {
  id: number; pseudo: string | null; nom: string | null; email: string;
  image_id: number | null; couleur: string | null; cree_le: Date;
  compte_id: number; compte: string; redboxer: boolean;
  ville: string | null; latitude: number | null; longitude: number | null; situe_ville: string | null;
  vues: number; finies: number; ouvertes: number;
  premier_module: boolean; debut: Date | null; derniere: Date | null;
};

export type LeconSuivie = {
  id: number; titre: string; module_id: number; module: string; ouverte_a_tous: boolean;
  vues: number; finies: number; vues_prospects: number; finies_prospects: number;
};

export type ModuleSuivi = {
  id: number; titre: string; lecons: number; ouvert_a_tous: boolean;
  commence: number; fini: number;
};

export type Rythme = { semaine: string; etiquette: string; finies: number; personnes: number };

export type Suivi = {
  apprenants: Apprenant[];
  lecons: LeconSuivie[];
  modules: ModuleSuivi[];
  rythme: Rythme[];
  finies30: number; finies30avant: number; inscrits: number; inscritsProspects: number;
};

/** Un prospect « chaud » : il a fini le premier module ou trois lecons, et il est revenu ces quatorze derniers jours. */
export const JOURS_CHAUD = 14;

export function temperature(a: Apprenant): "chaud" | "tiede" | "froid" {
  const recent = a.derniere !== null && Date.now() - new Date(a.derniere).getTime() < JOURS_CHAUD * 86_400_000;
  if ((a.premier_module || a.finies >= 3) && recent) return "chaud";
  if (a.finies > 0 || recent) return "tiede";
  return "froid";
}

/**
 * CHAQUE PERSONNE, ce qu'elle a ouvert et fini, et si elle a boucle le premier
 * module ouvert a tous — la porte d'entree du parcours. Filtre possible sur un
 * compte : la fiche d'un compte ne lit que ses membres.
 */
export async function apprenants(compte_id: number | null = null): Promise<Apprenant[]> {
  const r = await q<Apprenant>(`
    WITH gens AS (${SQL_GENS}),
         pub AS (${SQL_PUBLIEES}),
         premier AS (SELECT p.id FROM pub p WHERE p.module_id = (
                       SELECT module_id FROM pub WHERE ouverte_a_tous ORDER BY module_ordre, module_id LIMIT 1))
    SELECT g.*,
           COUNT(s.lecon_id)::int AS vues,
           COUNT(s.fini_le)::int AS finies,
           (SELECT COUNT(*)::int FROM pub p WHERE p.ouverte_a_tous OR g.redboxer) AS ouvertes,
           (EXISTS (SELECT 1 FROM premier)
            AND NOT EXISTS (SELECT 1 FROM premier pr WHERE NOT EXISTS (
              SELECT 1 FROM academie_suivi x WHERE x.utilisateur_id = g.id AND x.lecon_id = pr.id AND x.fini_le IS NOT NULL))
           ) AS premier_module,
           MIN(s.vu_le) AS debut,
           GREATEST(MAX(s.vu_le), MAX(s.fini_le)) AS derniere
      FROM gens g
      LEFT JOIN academie_suivi s ON s.utilisateur_id = g.id AND s.lecon_id IN (SELECT id FROM pub)
     WHERE $1::bigint IS NULL
        OR EXISTS (SELECT 1 FROM membre mb WHERE mb.utilisateur_id = g.id AND mb.compte_id = $1::bigint)
     GROUP BY g.id, g.pseudo, g.nom, g.email, g.image_id, g.couleur, g.cree_le, g.compte_id, g.compte, g.redboxer,
              g.ville, g.latitude, g.longitude, g.situe_ville`, [compte_id]);
  return r.map((a) => ({ ...a, id: Number(a.id), compte_id: Number(a.compte_id) }));
}

export async function suivi(): Promise<Suivi> {
  const [gens, lecons, modules, rythme, chiffres] = await Promise.all([
    apprenants(),
    // Lecon par lecon, dans l'ordre du parcours : ou l'on s'arrete.
    q<LeconSuivie>(`
      WITH gens AS (${SQL_GENS}), pub AS (${SQL_PUBLIEES})
      SELECT p.id, p.titre, p.module_id, p.module, p.ouverte_a_tous,
             COUNT(g.id)::int AS vues,
             COUNT(g.id) FILTER (WHERE s.fini_le IS NOT NULL)::int AS finies,
             COUNT(g.id) FILTER (WHERE NOT g.redboxer)::int AS vues_prospects,
             COUNT(g.id) FILTER (WHERE NOT g.redboxer AND s.fini_le IS NOT NULL)::int AS finies_prospects
        FROM pub p
        LEFT JOIN academie_suivi s ON s.lecon_id = p.id
        LEFT JOIN gens g ON g.id = s.utilisateur_id
       GROUP BY p.id, p.titre, p.module_id, p.module, p.ouverte_a_tous, p.module_ordre, p.ordre
       ORDER BY p.module_ordre, p.module_id, p.ordre, p.id`),
    // Module par module : commence (une lecon ouverte), fini (toutes finies).
    q<ModuleSuivi>(`
      WITH gens AS (${SQL_GENS}), pub AS (${SQL_PUBLIEES}),
           par AS (
             SELECT p.module_id, s.utilisateur_id, COUNT(*) AS vues, COUNT(s.fini_le) AS finies
               FROM pub p JOIN academie_suivi s ON s.lecon_id = p.id
              WHERE s.utilisateur_id IN (SELECT id FROM gens)
              GROUP BY p.module_id, s.utilisateur_id)
      SELECT m.id, m.titre, COUNT(DISTINCT p.id)::int AS lecons, bool_and(p.ouverte_a_tous) AS ouvert_a_tous,
             (SELECT COUNT(*)::int FROM par WHERE par.module_id = m.id) AS commence,
             (SELECT COUNT(*)::int FROM par WHERE par.module_id = m.id AND par.finies >= (
                SELECT COUNT(*) FROM pub p2 WHERE p2.module_id = m.id)) AS fini
        FROM academie_module m JOIN pub p ON p.module_id = m.id
       GROUP BY m.id, m.titre, m.ordre ORDER BY m.ordre, m.id`),
    // Douze semaines de lecons finies, une colonne par semaine, meme vide.
    q<Rythme>(`
      WITH gens AS (${SQL_GENS}),
           serie AS (SELECT generate_series(date_trunc('week', now()) - interval '11 weeks',
                                            date_trunc('week', now()), interval '1 week') AS seau)
      SELECT to_char(x.seau, 'YYYY-MM-DD') AS semaine, to_char(x.seau, 'DD/MM') AS etiquette,
             COUNT(s.fini_le)::int AS finies, COUNT(DISTINCT s.utilisateur_id)::int AS personnes
        FROM serie x
        LEFT JOIN academie_suivi s ON date_trunc('week', s.fini_le) = x.seau
                                  AND s.utilisateur_id IN (SELECT id FROM gens)
       GROUP BY x.seau ORDER BY x.seau`),
    q1<{ finies30: number; finies30avant: number; inscrits: number; inscrits_prospects: number }>(`
      WITH gens AS (${SQL_GENS})
      SELECT (SELECT COUNT(*)::int FROM academie_suivi s WHERE s.utilisateur_id IN (SELECT id FROM gens)
                AND s.fini_le >= now() - interval '30 days') AS finies30,
             (SELECT COUNT(*)::int FROM academie_suivi s WHERE s.utilisateur_id IN (SELECT id FROM gens)
                AND s.fini_le >= now() - interval '60 days' AND s.fini_le < now() - interval '30 days') AS finies30avant,
             (SELECT COUNT(*)::int FROM gens) AS inscrits,
             (SELECT COUNT(*)::int FROM gens WHERE NOT redboxer) AS inscrits_prospects`),
  ]);
  return {
    apprenants: gens,
    lecons, modules, rythme,
    finies30: chiffres?.finies30 ?? 0, finies30avant: chiffres?.finies30avant ?? 0,
    inscrits: chiffres?.inscrits ?? 0, inscritsProspects: chiffres?.inscrits_prospects ?? 0,
  };
}

/**
 * FUTUR REDBOXER OU CURIEUX. Un prospect qui a fini au moins une lecon s'est mis
 * au travail : c'est un futur redboxer. Celui qui s'est inscrit sans rien finir
 * est un curieux. Les redboxers n'en sont plus.
 */
export type Genre = "futur" | "curieux";
export const NOM_GENRE: Record<Genre, string> = { futur: "futur redboxer", curieux: "curieux" };
export function genreDe(a: Apprenant): Genre {
  return a.finies > 0 ? "futur" : "curieux";
}
