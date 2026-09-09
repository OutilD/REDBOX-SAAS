import { q, q1 } from "@/db";
import { DOMAINE } from "./invente";

/**
 * LA COMMUNAUTE : GRADES, BADGES, POINTS.
 *
 * Exploiter des distributeurs est un metier solitaire — une machine dans un
 * bar, une autre a l'autre bout de la ville, et personne pour dire « moi
 * aussi ». La communaute donne a chacun un profil que les autres voient, un
 * grade qui dit la taille de son parc, des badges pour ce qu'il a traverse,
 * et des points pour le tout. Ce n'est pas un jeu : c'est une facon de se
 * reconnaitre entre gens qui font la meme chose.
 *
 * Trois regles :
 *
 *  1. LE GRADE, C'EST LE PARC — le nombre de VRAIES bornes en service. Les
 *     bornes de la demo ne comptent pas : on ne devient pas Redboxer en
 *     ouvrant un compte.
 *
 *  2. UN BADGE NE SE PERD PAS. Les regles vivent ici, en code ; la table ne
 *     garde que ce qui a ete obtenu, et quand. Une regle qui cesse d'etre
 *     vraie — une borne desappairee — ne reprend rien.
 *
 *  3. TOUT SE RECALCULE DEPUIS LES FAITS. Pas de compteur de points range
 *     quelque part : les bornes, les messages, l'anciennete et les badges se
 *     lisent, et les points s'en deduisent. Comme le stock.
 */

// ------------------------------------------------------------------ grades

export type Grade = { cle: string; nom: string; des: number; quoi: string };

/** Du plus petit parc au plus grand. `des` est le nombre de bornes qu'il faut. */
export const GRADES: Grade[] = [
  { cle: "curieux",    nom: "Curieux",          des: 0,  quoi: "Pas encore de borne : on regarde, on essaie" },
  { cle: "redboxer",   nom: "Redboxer",         des: 1,  quoi: "Une première borne en service" },
  { cle: "exploitant", nom: "Exploitant",       des: 2,  quoi: "Deux bornes ou plus" },
  { cle: "chef",       nom: "Chef de parc",     des: 5,  quoi: "Cinq bornes ou plus" },
  { cle: "baron",      nom: "Baron du réseau",  des: 10, quoi: "Dix bornes ou plus" },
];

export function gradeDe(bornes: number): Grade {
  let g = GRADES[0];
  for (const x of GRADES) if (bornes >= x.des) g = x;
  return g;
}

/** Le grade d'apres, et ce qui manque pour l'atteindre. Nul au sommet. */
export function prochainGrade(bornes: number): { grade: Grade; manque: number } | null {
  const suivant = GRADES.find((x) => x.des > bornes);
  return suivant ? { grade: suivant, manque: suivant.des - bornes } : null;
}

// ------------------------------------------------------------------ badges

export type Forme = "couronne" | "borne" | "sablier" | "medaille" | "bulle" | "eclair" | "etoile" | "coeur";
export type Badge = { cle: string; nom: string; quoi: string; forme: Forme; points: number };

/** Dans l'ordre ou la page les montre. */
export const BADGES: Badge[] = [
  { cle: "pionnier",    nom: "Pionnier",           quoi: "Parmi les dix premiers redboxers",                    forme: "couronne", points: 500 },
  { cle: "premiere",    nom: "Première borne",     quoi: "Une première machine appairée",                       forme: "borne",    points: 200 },
  { cle: "parc",        nom: "Parc",               quoi: "Trois bornes en service",                             forme: "borne",    points: 300 },
  { cle: "reseau",      nom: "Réseau",             quoi: "Dix bornes en service",                               forme: "couronne", points: 1000 },
  { cle: "mois",        nom: "Premier mois",       quoi: "Un mois de RedBox",                                   forme: "sablier",  points: 50 },
  { cle: "semestre",    nom: "Six mois",           quoi: "Six mois de RedBox",                                  forme: "sablier",  points: 150 },
  { cle: "an",          nom: "Un an",              quoi: "Un an de RedBox",                                     forme: "medaille", points: 400 },
  { cle: "voix",        nom: "Première voix",      quoi: "Un premier message dans un salon",                    forme: "bulle",    points: 20 },
  { cle: "pilier",      nom: "Pilier de comptoir", quoi: "Cent messages",                                       forme: "bulle",    points: 150 },
  { cle: "noctambule",  nom: "Noctambule",         quoi: "Une vente entre trois et cinq heures du matin",       forme: "eclair",   points: 80 },
  { cle: "centaine",    nom: "La centaine",        quoi: "Cent ventes distribuées",                             forme: "etoile",   points: 200 },
  { cle: "millier",     nom: "Le millier",         quoi: "Mille ventes distribuées",                            forme: "etoile",   points: 600 },
  { cle: "ambassadeur", nom: "Ambassadeur",        quoi: "Quelqu’un a rejoint le compte sur votre invitation", forme: "coeur",    points: 120 },
  { cle: "equipe",      nom: "Équipe RedBox",      quoi: "Membre de l’éditeur",                                 forme: "medaille", points: 0 },
];

const BADGE_PAR_CLE = new Map(BADGES.map((b) => [b.cle, b]));

/**
 * Ce qu'on sait d'une personne, et dont tout le reste se deduit. Les
 * messages ecrits dans les salons d'un compte en demo ne comptent pas : la
 * conversation y est inventee, et une premiere voix ne se gagne pas en
 * ouvrant un compte.
 */
type Faits = {
  bornes: number; jours: number; messages: number; ventes: number;
  pionnier: boolean; noctambule: boolean; ambassadeur: boolean; equipe: boolean;
};

/** Les vraies bornes de tous les comptes ou la personne est membre. */
const SQL_BORNES = `
  (SELECT COUNT(DISTINCT b.id)::int FROM borne b
     JOIN membre m ON m.compte_id = b.compte_id AND m.utilisateur_id = u.id
    WHERE b.jeton IS NOT NULL AND b.jeton NOT LIKE 'demo\\_%')`;

const SQL_FAITS = `
  SELECT
    ${SQL_BORNES} AS bornes,
    GREATEST(0, EXTRACT(EPOCH FROM (now() - u.cree_le)) / 86400)::int AS jours,
    (SELECT COUNT(*)::int FROM message x
       JOIN salon sx ON sx.id = x.salon_id LEFT JOIN compte kx ON kx.id = sx.compte_id
      WHERE x.utilisateur_id = u.id AND x.supprime_le IS NULL AND NOT COALESCE(kx.demo, false)) AS messages,
    (SELECT COUNT(*)::int FROM vente v JOIN borne b ON b.id = v.borne_id
       JOIN membre m ON m.compte_id = b.compte_id AND m.utilisateur_id = u.id
      WHERE v.statut = 'distribue' AND b.jeton IS NOT NULL AND b.jeton NOT LIKE 'demo\\_%') AS ventes,
    -- Les dix premiers, hors personnes inventees par la demo.
    ((SELECT COUNT(*) FROM utilisateur x
       WHERE x.email NOT LIKE '%@' || $2 AND (x.cree_le, x.id) < (u.cree_le, u.id)) < 10) AS pionnier,
    EXISTS (SELECT 1 FROM vente v JOIN borne b ON b.id = v.borne_id
              JOIN membre m ON m.compte_id = b.compte_id AND m.utilisateur_id = u.id
             WHERE v.statut = 'distribue' AND b.jeton IS NOT NULL AND b.jeton NOT LIKE 'demo\\_%'
               AND EXTRACT(HOUR FROM v.faite_le AT TIME ZONE 'Europe/Paris') BETWEEN 3 AND 4) AS noctambule,
    EXISTS (SELECT 1 FROM invitation i WHERE i.par = u.email AND i.utilisee_le IS NOT NULL) AS ambassadeur,
    EXISTS (SELECT 1 FROM membre m JOIN compte c ON c.id = m.compte_id
             WHERE m.utilisateur_id = u.id AND c.editeur) AS equipe
  FROM utilisateur u WHERE u.id = $1`;

/** Les badges que ces faits meritent. */
function meritesPar(f: Faits): string[] {
  const out: string[] = [];
  if (f.pionnier) out.push("pionnier");
  if (f.bornes >= 1) out.push("premiere");
  if (f.bornes >= 3) out.push("parc");
  if (f.bornes >= 10) out.push("reseau");
  if (f.jours >= 30) out.push("mois");
  if (f.jours >= 182) out.push("semestre");
  if (f.jours >= 365) out.push("an");
  if (f.messages >= 1) out.push("voix");
  if (f.messages >= 100) out.push("pilier");
  if (f.noctambule) out.push("noctambule");
  if (f.ventes >= 100) out.push("centaine");
  if (f.ventes >= 1000) out.push("millier");
  if (f.ambassadeur) out.push("ambassadeur");
  if (f.equipe) out.push("equipe");
  return out;
}

/**
 * Reevalue les badges d'une personne et pose ceux qui manquent. Rend les
 * nouveaux — c'est ce que la page annonce. A appeler quand on ouvre la
 * communaute ou son profil : deux lectures, une ecriture s'il y a lieu.
 */
export async function evaluerBadges(utilisateur_id: number): Promise<Badge[]> {
  const f = await q1<Faits>(SQL_FAITS, [utilisateur_id, DOMAINE]);
  if (!f) return [];
  const merites = meritesPar(f);
  if (merites.length === 0) return [];
  const neufs = await q<{ badge: string }>(`
    INSERT INTO badge_obtenu (utilisateur_id, badge)
    SELECT $1, b FROM unnest($2::text[]) AS b
    ON CONFLICT DO NOTHING RETURNING badge`, [utilisateur_id, merites]);
  return neufs.map((n) => BADGE_PAR_CLE.get(n.badge)!).filter(Boolean);
}

// ------------------------------------------------------------------ points

/**
 * Les points : cent par borne, les badges pour ce qu'ils valent, deux par
 * message jusqu'a cinq cents, un par jour d'anciennete jusqu'a un an. Le
 * niveau monte tous les deux cent cinquante.
 */
export function pointsDe(f: { bornes: number; messages: number; jours: number }, badges: string[]): number {
  return f.bornes * 100
       + badges.reduce((s, b) => s + (BADGE_PAR_CLE.get(b)?.points ?? 0), 0)
       + Math.min(f.messages, 500) * 2
       + Math.min(f.jours, 365);
}

export const PAS_NIVEAU = 250;
export const niveauDe = (points: number) => 1 + Math.floor(points / PAS_NIVEAU);

// ------------------------------------------------------------------ profils

export type BadgeObtenu = Badge & { obtenu_le: Date; nouveau: boolean };

export type Profil = {
  id: number; pseudo: string; nom: string | null; image_id: number | null;
  compte: string; ville: string | null; bio: string | null; couleur: string | null;
  cree_le: Date; public: boolean; editeur: boolean; moi: boolean;
  bornes: number; grade: Grade; points: number; niveau: number;
  messages: number; ventes: number; jours: number;
  badges: BadgeObtenu[];
};

/** Les couleurs qu'un profil peut choisir : la marque, et sept autres qui se lisent sur sombre et sur clair. */
export const COULEURS = ["#d70005", "#7c3aed", "#2563eb", "#0d9488", "#ea580c", "#db2777", "#65a30d", "#475569"];

/** Le pseudo, sinon le nom, sinon le debut de l'adresse. */
export function pseudoDe(p: { pseudo?: string | null; nom?: string | null; email: string }): string {
  return (p.pseudo ?? "").trim() || (p.nom ?? "").trim() || p.email.split("@")[0];
}

/**
 * Le profil d'une personne tel que `spectateur` a le droit de le voir. Un
 * profil ferme ne montre que le pseudo, le grade et les badges — le reste
 * est a soi, et a l'editeur.
 */
export async function profilDe(id: number, spectateur: { id: number; editeur: boolean }): Promise<Profil | null> {
  const l = await q1<{
    id: number; pseudo: string | null; nom: string | null; email: string; image_id: number | null;
    compte: string; ville: string | null; bio: string | null; couleur: string | null;
    cree_le: Date; profil_public: boolean; editeur: boolean;
  }>(`
    SELECT u.id, u.pseudo, u.nom, u.email, u.image_id, c.nom AS compte, u.ville, u.bio, u.couleur,
           u.cree_le, u.profil_public, c.editeur
      FROM utilisateur u JOIN compte c ON c.id = u.compte_id
     WHERE u.id = $1 AND u.email NOT LIKE '%@' || $2`, [id, DOMAINE]);
  if (!l) return null;
  const f = (await q1<Faits>(SQL_FAITS, [id, DOMAINE]))!;
  const obtenus = await q<{ badge: string; obtenu_le: Date; vu_le: Date | null }>(
    "SELECT badge, obtenu_le, vu_le FROM badge_obtenu WHERE utilisateur_id = $1", [id]);
  const badges: BadgeObtenu[] = BADGES
    .map((b) => { const o = obtenus.find((x) => x.badge === b.cle); return o ? { ...b, obtenu_le: o.obtenu_le, nouveau: o.vu_le === null } : null; })
    .filter((b): b is BadgeObtenu => b !== null);
  const points = pointsDe(f, badges.map((b) => b.cle));
  const moi = spectateur.id === id;
  const ouvert = l.profil_public || moi || spectateur.editeur;
  return {
    id, pseudo: pseudoDe(l), nom: ouvert ? l.nom : null, image_id: l.image_id,
    compte: ouvert ? l.compte : "", ville: ouvert ? l.ville : null, bio: ouvert ? l.bio : null,
    couleur: l.couleur, cree_le: l.cree_le, public: l.profil_public, editeur: l.editeur, moi,
    bornes: f.bornes, grade: gradeDe(f.bornes), points, niveau: niveauDe(points),
    messages: ouvert ? f.messages : 0, ventes: ouvert ? f.ventes : 0, jours: f.jours,
    badges,
  };
}

/** Elle a vu ses nouveaux badges. */
export async function badgesVus(utilisateur_id: number): Promise<void> {
  await q("UPDATE badge_obtenu SET vu_le = now() WHERE utilisateur_id = $1 AND vu_le IS NULL", [utilisateur_id]);
}

export type Classe = {
  id: number; pseudo: string; image_id: number | null; compte: string; couleur: string | null;
  editeur: boolean; bornes: number; grade: Grade; points: number; niveau: number; badges: number;
};

/**
 * Le classement : tout le monde, par points. Calcule ici plutot qu'en base,
 * parce que la valeur d'un badge est dans le code — et qu'a l'echelle d'une
 * communaute d'exploitants, quelques centaines de lignes se trient en rien.
 */
export async function classement(limite = 20): Promise<Classe[]> {
  const gens = await q<{
    id: number; pseudo: string | null; nom: string | null; email: string; image_id: number | null;
    compte: string; couleur: string | null; editeur: boolean; profil_public: boolean;
    bornes: number; jours: number; messages: number; badges: string[];
  }>(`
    SELECT u.id, u.pseudo, u.nom, u.email, u.image_id, c.nom AS compte, u.couleur, c.editeur, u.profil_public,
           ${SQL_BORNES} AS bornes,
           GREATEST(0, EXTRACT(EPOCH FROM (now() - u.cree_le)) / 86400)::int AS jours,
           (SELECT COUNT(*)::int FROM message x
       JOIN salon sx ON sx.id = x.salon_id LEFT JOIN compte kx ON kx.id = sx.compte_id
      WHERE x.utilisateur_id = u.id AND x.supprime_le IS NULL AND NOT COALESCE(kx.demo, false)) AS messages,
           COALESCE((SELECT array_agg(o.badge) FROM badge_obtenu o WHERE o.utilisateur_id = u.id), '{}') AS badges
      FROM utilisateur u JOIN compte c ON c.id = u.compte_id
     WHERE u.email NOT LIKE '%@' || $1`, [DOMAINE]);
  return gens
    .map((g) => {
      const points = pointsDe(g, g.badges);
      return { id: g.id, pseudo: pseudoDe(g), image_id: g.image_id, compte: g.profil_public ? g.compte : "",
               couleur: g.couleur, editeur: g.editeur, bornes: g.bornes, grade: gradeDe(g.bornes),
               points, niveau: niveauDe(points), badges: g.badges.length };
    })
    .sort((a, z) => z.points - a.points || z.bornes - a.bornes || a.pseudo.localeCompare(z.pseudo, "fr"))
    .slice(0, limite);
}

/**
 * LE NIVEAU ET LE GRADE DE PLUSIEURS PERSONNES D'UN COUP — pour les messages
 * d'un fil, ou l'on veut savoir qui parle sans ouvrir son profil. Une seule
 * requete pour tous les auteurs, puis les points en code : la valeur d'un
 * badge n'est pas en base.
 */
export async function niveauxDe(ids: number[]): Promise<Map<number, { niveau: number; grade: string }>> {
  const out = new Map<number, { niveau: number; grade: string }>();
  const propres = [...new Set(ids)].filter((i) => Number.isInteger(i));
  if (propres.length === 0) return out;
  const gens = await q<{ id: number; bornes: number; jours: number; messages: number; badges: string[] }>(`
    SELECT u.id,
           ${SQL_BORNES} AS bornes,
           GREATEST(0, EXTRACT(EPOCH FROM (now() - u.cree_le)) / 86400)::int AS jours,
           (SELECT COUNT(*)::int FROM message x
              JOIN salon sx ON sx.id = x.salon_id LEFT JOIN compte kx ON kx.id = sx.compte_id
             WHERE x.utilisateur_id = u.id AND x.supprime_le IS NULL AND NOT COALESCE(kx.demo, false)) AS messages,
           COALESCE((SELECT array_agg(o.badge) FROM badge_obtenu o WHERE o.utilisateur_id = u.id), '{}') AS badges
      FROM utilisateur u WHERE u.id = ANY($1::bigint[])`, [propres]);
  for (const g of gens) {
    out.set(Number(g.id), { niveau: niveauDe(pointsDe(g, g.badges)), grade: gradeDe(g.bornes).nom });
  }
  return out;
}

/** Le groupe de communaute d'un compte : proprietaire d'au moins une vraie borne, ou prospect. */
export async function groupeDuCompte(compte_id: number): Promise<"proprietaires" | "prospects"> {
  const r = await q1<{ n: number }>(`
    SELECT COUNT(*)::int AS n FROM borne
     WHERE compte_id = $1 AND jeton IS NOT NULL AND jeton NOT LIKE 'demo\\_%'`, [compte_id]);
  return (r?.n ?? 0) > 0 ? "proprietaires" : "prospects";
}
