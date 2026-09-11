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
  { cle: "curieux",    nom: "Curieux",          des: 0,  quoi: "Pas encore de RedBox : on regarde, on essaie" },
  { cle: "redboxer",   nom: "Redboxer",         des: 1,  quoi: "Une première RedBox en service" },
  { cle: "exploitant", nom: "Exploitant",       des: 2,  quoi: "Deux RedBox ou plus" },
  { cle: "chef",       nom: "Chef de parc",     des: 5,  quoi: "Cinq RedBox ou plus" },
  { cle: "baron",      nom: "Baron du réseau",  des: 10, quoi: "Dix RedBox ou plus" },
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

/**
 * `quoi` tient sur une ligne, sous le nom, dans une grille de dix-sept.
 * `comment` est ce qu'on lit quand on ouvre le badge : la manoeuvre, en
 * clair, avec l'endroit ou elle se fait. « Cent messages » n'apprend rien a
 * qui cherche par ou commencer.
 */
export type Badge = {
  cle: string; nom: string; quoi: string; comment: string;
  forme: Forme; points: number;
  /** Vrai pour ce qui ne se decide pas : l'anciennete, un tirage ferme. */
  patience?: boolean;
};

/** Dans l'ordre ou la page les montre. */
export const BADGES: Badge[] = [
  { cle: "pionnier", nom: "Pionnier", quoi: "Parmi les dix premiers redboxers", forme: "couronne", points: 500,
    patience: true,
    comment: "Il ne se gagne plus : il revient aux dix premiers comptes ouverts sur la console, et ces dix places sont prises. Si vous l’avez, vous étiez là au début — c’est tout ce qu’il dit, et c’est pour ça qu’il vaut cher." },
  { cle: "premiere", nom: "Première RedBox", quoi: "Une première machine appairée", forme: "borne", points: 200,
    comment: "Sur la machine : Maintenance → SaaS → Demander l’appairage. Elle affiche un code de six caractères. Dans la console, RedBox → Ajouter une RedBox, saisissez ce code. Le badge tombe à l’ouverture suivante de la communauté." },
  { cle: "parc", nom: "Parc", quoi: "Trois RedBox en service", forme: "borne", points: 300,
    comment: "Trois machines appairées et vivantes sur le même compte, comptées ensemble. Les RedBox de la démonstration ne comptent pas : on ne devient pas exploitant en ouvrant un compte d’essai." },
  { cle: "reseau", nom: "Réseau", quoi: "Dix RedBox en service", forme: "couronne", points: 1000,
    comment: "Dix machines appairées sur le compte. C’est le badge le plus cher de la console, et le seul qui donne le grade de Baron du réseau." },
  { cle: "mois", nom: "Premier mois", quoi: "Un mois de RedBox", forme: "sablier", points: 50, patience: true,
    comment: "Trente jours après l’ouverture de votre compte. Rien à faire : il arrive tout seul." },
  { cle: "semestre", nom: "Six mois", quoi: "Six mois de RedBox", forme: "sablier", points: 150, patience: true,
    comment: "Cent quatre-vingt-deux jours après l’ouverture de votre compte. Rien à faire non plus — sinon rester." },
  { cle: "an", nom: "Un an", quoi: "Un an de RedBox", forme: "medaille", points: 400, patience: true,
    comment: "Trois cent soixante-cinq jours de compte. Le seul badge que personne ne peut accélérer." },
  { cle: "voix", nom: "Premier pas", quoi: "Un premier message dans un salon", forme: "bulle", points: 20,
    comment: "Écrivez une fois, n’importe où : #futurs-redboxers pour vous présenter, #general pour votre équipe, ou votre #sav avec l’équipe RedBox. Les salons d’un compte de démonstration ne comptent pas." },
  { cle: "bavard", nom: "Bavard", quoi: "Cent messages", forme: "bulle", points: 150,
    comment: "Cent messages écrits, tous salons confondus. Il vient vite à qui répond aux questions des autres dans #futurs-redboxers." },
  { cle: "actif", nom: "Actif", quoi: "Cinq cents messages", forme: "bulle", points: 300,
    comment: "Cinq cents messages. À ce stade on ne découvre plus la communauté : on la fait vivre." },
  { cle: "pilier_commu", nom: "Pilier de la commu", quoi: "Deux mille messages", forme: "bulle", points: 700,
    comment: "Deux mille messages. Le badge des gens qu’on finit par reconnaître à leur façon d’écrire — il n’y en a jamais beaucoup." },
  { cle: "noctambule", nom: "Noctambule", quoi: "Une vente entre trois et cinq heures du matin", forme: "eclair", points: 80,
    comment: "Une seule vente distribuée entre 3 h et 5 h, heure de Paris. Il ne se force pas : il récompense un emplacement qui vit la nuit — une boîte, un hôpital, une gare." },
  { cle: "dizaine", nom: "Première dizaine", quoi: "Dix ventes distribuées", forme: "etoile", points: 30,
    comment: "Dix produits réellement tombés dans le bac, sur l’ensemble de vos machines. Le premier signe qu’un emplacement fonctionne." },
  { cle: "cinquantaine", nom: "Cinquantaine", quoi: "Cinquante ventes distribuées", forme: "etoile", points: 80,
    comment: "Cinquante produits distribués. Ce n’est plus un coup de chance : c’est une clientèle." },
  { cle: "centaine", nom: "La centaine", quoi: "Cent ventes distribuées", forme: "etoile", points: 200,
    comment: "Cent produits réellement tombés dans le bac, sur l’ensemble de vos machines. Les ventes encaissées mais non distribuées ne comptent pas — c’est le produit livré qui fait la vente." },
  { cle: "rode", nom: "Rodé", quoi: "Deux cent cinquante ventes distribuées", forme: "etoile", points: 300,
    comment: "Deux cent cinquante produits distribués. L’emplacement est trouvé et le réassort suit : la machine tourne." },
  { cle: "cinq_cents", nom: "Grand débit", quoi: "Cinq cents ventes distribuées", forme: "etoile", points: 450,
    comment: "Cinq cents produits distribués. Un seul très bon emplacement y arrive ; plusieurs bons, plus vite." },
  { cle: "millier", nom: "Le millier", quoi: "Mille ventes distribuées", forme: "etoile", points: 600,
    comment: "Mille produits distribués. Un bon emplacement y arrive en quelques mois ; deux bons emplacements, plus vite." },
  { cle: "ambassadeur", nom: "Ambassadeur", quoi: "Quelqu’un a rejoint le compte sur votre invitation", forme: "coeur", points: 120,
    comment: "Équipe → Inviter quelqu’un, envoyez le lien, et attendez qu’il s’en serve. Le badge tombe quand l’invitation est utilisée, pas quand elle est envoyée." },
  { cle: "applaudi", nom: "Applaudi", quoi: "Vingt-cinq réactions reçues sur vos messages", forme: "etoile", points: 250,
    comment: "Vingt-cinq réactions posées par d’autres sur ce que vous avez écrit. Il ne s’achète pas : les vôtres sur vos propres messages sont refusées. Le moyen le plus sûr est d’écrire des choses utiles dans #redboxers." },
  { cle: "genereux", nom: "Généreux", quoi: "Cinquante réactions offertes aux autres", forme: "coeur", points: 100,
    comment: "Cinquante réactions posées sur les messages des autres. Passez sur une bulle, appuyez sur le rond souriant, choisissez. C’est le badge le plus facile de la console, et le seul qui ne demande qu’à lire." },
  { cle: "habitue", nom: "Habitué", quoi: "Trente journées différentes à prendre la parole", forme: "sablier", points: 200,
    comment: "Trente journées DIFFÉRENTES où vous avez écrit au moins un message. Trente messages le même jour ne valent qu’une journée : ce badge récompense le fait de revenir, pas de parler." },
  { cle: "equipe", nom: "Équipe RedBox", quoi: "Membre de l’éditeur", forme: "medaille", points: 0, patience: true,
    comment: "Il appartient aux comptes de l’éditeur. Il ne rapporte aucun point — on ne se recrute pas — et c’est pourtant le plus rare de tous." },
];

// ------------------------------------------------------------------ rarete

/**
 * LA RARETE D'UN BADGE SE LIT DANS CE QU'IL VAUT. Pas de champ a tenir a jour
 * en plus des points : un badge cher est un badge rare, c'est la meme phrase.
 * Une exception, `equipe` : on ne se recrute pas, il ne vaut aucun point, et
 * c'est pourtant le plus rare de tous.
 */
export type Rang = "commun" | "rare" | "epique" | "legendaire";

export function rangDe(b: Badge): Rang {
  if (b.cle === "equipe") return "legendaire";
  return b.points >= 500 ? "legendaire"
       : b.points >= 250 ? "epique"
       : b.points >= 100 ? "rare" : "commun";
}

export const NOM_RANG: Record<Rang, string> = {
  commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire",
};

const BADGE_PAR_CLE = new Map(BADGES.map((b) => [b.cle, b]));

/**
 * Ce qu'on sait d'une personne, et dont tout le reste se deduit. Les
 * messages ecrits dans les salons d'un compte en demo ne comptent pas : la
 * conversation y est inventee, et une premiere voix ne se gagne pas en
 * ouvrant un compte.
 */
export type Faits = {
  bornes: number; jours: number; messages: number; ventes: number;
  /** Recues sur ses messages, offertes aux autres. Les siennes ne comptent pas. */
  reactions: number; reactions_donnees: number;
  /** Le nombre de journees DIFFERENTES ou elle a pris la parole. */
  jours_actifs: number;
  pionnier: boolean; noctambule: boolean; ambassadeur: boolean; equipe: boolean;
};

/** Les vraies bornes de tous les comptes ou la personne est membre. */
const SQL_BORNES = `
  (SELECT COUNT(DISTINCT b.id)::int FROM borne b
     JOIN membre m ON m.compte_id = b.compte_id AND m.utilisateur_id = u.id
    WHERE b.jeton IS NOT NULL AND b.jeton NOT LIKE 'demo\\_%')`;

/**
 * Ce qui se compte a partir des messages. Les salons d'un compte en demo sont
 * exclus partout : la conversation y est inventee, et on ne devient pas Pilier
 * de comptoir en ouvrant un compte d'essai.
 *
 * Ces trois fragments servent au profil, au classement et aux niveaux d'un fil
 * — ecrits une fois, pour que les points d'une personne soient les memes
 * partout ou on les affiche.
 */
const VRAIS_SALONS = `
  JOIN salon sx ON sx.id = x.salon_id LEFT JOIN compte kx ON kx.id = sx.compte_id`;

const SQL_MESSAGES = `
  (SELECT COUNT(*)::int FROM message x ${VRAIS_SALONS}
    WHERE x.utilisateur_id = u.id AND x.supprime_le IS NULL AND NOT COALESCE(kx.demo, false))`;

/** Les reactions posees sur ses messages par quelqu'un d'autre qu'elle. */
const SQL_REACTIONS = `
  (SELECT COUNT(*)::int FROM reaction r JOIN message x ON x.id = r.message_id ${VRAIS_SALONS}
    WHERE x.utilisateur_id = u.id AND x.supprime_le IS NULL
      AND r.utilisateur_id <> u.id AND NOT COALESCE(kx.demo, false))`;

const SQL_REACTIONS_DONNEES = `
  (SELECT COUNT(*)::int FROM reaction r JOIN message x ON x.id = r.message_id ${VRAIS_SALONS}
    WHERE r.utilisateur_id = u.id AND x.utilisateur_id IS DISTINCT FROM u.id
      AND NOT COALESCE(kx.demo, false))`;

const SQL_JOURS_ACTIFS = `
  (SELECT COUNT(DISTINCT (x.cree_le AT TIME ZONE 'Europe/Paris')::date)::int
     FROM message x ${VRAIS_SALONS}
    WHERE x.utilisateur_id = u.id AND x.supprime_le IS NULL AND NOT COALESCE(kx.demo, false))`;

const SQL_ANCIENNETE = `GREATEST(0, EXTRACT(EPOCH FROM (now() - u.cree_le)) / 86400)::int`;

/** Les quatre colonnes dont les points se deduisent, pour toute requete sur `utilisateur u`. */
const SQL_COMPTES = `
  ${SQL_BORNES} AS bornes,
  ${SQL_ANCIENNETE} AS jours,
  ${SQL_MESSAGES} AS messages,
  ${SQL_REACTIONS} AS reactions`;

const SQL_FAITS = `
  SELECT
    ${SQL_COMPTES},
    ${SQL_REACTIONS_DONNEES} AS reactions_donnees,
    ${SQL_JOURS_ACTIFS} AS jours_actifs,
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
  if (f.messages >= 100) out.push("bavard");
  if (f.messages >= 500) out.push("actif");
  if (f.messages >= 2000) out.push("pilier_commu");
  if (f.noctambule) out.push("noctambule");
  if (f.ventes >= 10) out.push("dizaine");
  if (f.ventes >= 50) out.push("cinquantaine");
  if (f.ventes >= 100) out.push("centaine");
  if (f.ventes >= 250) out.push("rode");
  if (f.ventes >= 500) out.push("cinq_cents");
  if (f.ventes >= 1000) out.push("millier");
  if (f.ambassadeur) out.push("ambassadeur");
  if (f.reactions >= 25) out.push("applaudi");
  if (f.reactions_donnees >= 50) out.push("genereux");
  if (f.jours_actifs >= 30) out.push("habitue");
  if (f.equipe) out.push("equipe");
  return out;
}

// -------------------------------------------------------------- progression

/**
 * OU EN EST-ON D'UN BADGE QU'ON N'A PAS. « Cent messages » quand on en a
 * quarante-trois ne dit rien ; « 43 / 100 » dit qu'il est a portee, et c'est
 * la difference entre une liste de recompenses et une liste d'objectifs.
 *
 * Les badges absents de cette table se gagnent d'un coup — on est parmi les
 * dix premiers ou on ne l'est pas — et n'ont pas de demi-chemin a montrer.
 */
const PROGRES: Record<string, (f: Faits) => { n: number; sur: number }> = {
  premiere: (f) => ({ n: f.bornes, sur: 1 }),
  parc:     (f) => ({ n: f.bornes, sur: 3 }),
  reseau:   (f) => ({ n: f.bornes, sur: 10 }),
  mois:     (f) => ({ n: f.jours, sur: 30 }),
  semestre: (f) => ({ n: f.jours, sur: 182 }),
  an:       (f) => ({ n: f.jours, sur: 365 }),
  voix:     (f) => ({ n: f.messages, sur: 1 }),
  bavard:       (f) => ({ n: f.messages, sur: 100 }),
  actif:        (f) => ({ n: f.messages, sur: 500 }),
  pilier_commu: (f) => ({ n: f.messages, sur: 2000 }),
  dizaine:      (f) => ({ n: f.ventes, sur: 10 }),
  cinquantaine: (f) => ({ n: f.ventes, sur: 50 }),
  centaine: (f) => ({ n: f.ventes, sur: 100 }),
  rode:         (f) => ({ n: f.ventes, sur: 250 }),
  cinq_cents:   (f) => ({ n: f.ventes, sur: 500 }),
  millier:  (f) => ({ n: f.ventes, sur: 1000 }),
  applaudi: (f) => ({ n: f.reactions, sur: 25 }),
  genereux: (f) => ({ n: f.reactions_donnees, sur: 50 }),
  habitue:  (f) => ({ n: f.jours_actifs, sur: 30 }),
};

export type Progres = { n: number; sur: number; pct: number };

export function progresDe(f: Faits, cle: string): Progres | null {
  const r = PROGRES[cle]?.(f);
  if (!r) return null;
  return { n: Math.min(r.n, r.sur), sur: r.sur, pct: Math.min(100, Math.round((r.n / r.sur) * 100)) };
}

/**
 * LES PROCHAINS OBJECTIFS : les badges qu'on n'a pas, les plus proches
 * d'abord. Trois suffisent — une liste de quinze choses a faire ne se lit pas
 * comme un but, elle se lit comme une corvee. A pourcentage egal, le plus cher
 * passe devant : autant viser ce qui rapporte.
 */
export function objectifs(f: Faits, obtenus: string[], combien = 3): (Badge & { progres: Progres })[] {
  const a = new Set(obtenus);
  return BADGES
    .filter((b) => !a.has(b.cle) && PROGRES[b.cle])
    .map((b) => ({ ...b, progres: progresDe(f, b.cle)! }))
    .filter((b) => b.progres.pct < 100)
    .sort((x, z) => z.progres.pct - x.progres.pct || z.points - x.points)
    .slice(0, combien);
}

/**
 * COMBIEN DE GENS ONT CHAQUE BADGE. « Obtenu par 4 % des redboxers » vaut
 * toutes les etiquettes de rarete : c'est la rarete reelle, pas celle qu'on a
 * decretee. Une requete pour toute la grille.
 */
export async function rareteDesBadges(): Promise<Map<string, { n: number; pct: number }>> {
  const [gens, par] = await Promise.all([
    q1<{ n: number }>("SELECT COUNT(*)::int AS n FROM utilisateur WHERE email NOT LIKE '%@' || $1", [DOMAINE]),
    q<{ badge: string; n: number }>(`
      SELECT o.badge, COUNT(*)::int AS n FROM badge_obtenu o
        JOIN utilisateur u ON u.id = o.utilisateur_id
       WHERE u.email NOT LIKE '%@' || $1 GROUP BY o.badge`, [DOMAINE]),
  ]);
  const total = Math.max(1, gens?.n ?? 1);
  return new Map(par.map((r) => [r.badge, { n: r.n, pct: Math.round((r.n / total) * 100) }]));
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
 * message jusqu'a cinq cents, cinq par reaction RECUE jusqu'a soixante, un par
 * jour d'anciennete jusqu'a un an. Le niveau monte tous les deux cent
 * cinquante.
 *
 * Une reaction recue vaut plus qu'un message ecrit, et c'est voulu : on choisit
 * ce qu'on ecrit, pas ce qui plait. Les plafonds sont la pour la meme raison —
 * sans eux, le classement recompenserait le volume, et le volume s'obtient en
 * parlant pour ne rien dire.
 */
export function pointsDe(f: { bornes: number; messages: number; jours: number; reactions?: number },
                         badges: string[]): number {
  return f.bornes * 100
       + badges.reduce((s, b) => s + (BADGE_PAR_CLE.get(b)?.points ?? 0), 0)
       + Math.min(f.messages, 500) * 2
       + Math.min(f.reactions ?? 0, 60) * 5
       + Math.min(f.jours, 365);
}

export const PAS_NIVEAU = 250;
export const niveauDe = (points: number) => 1 + Math.floor(points / PAS_NIVEAU);

/** Ou l'on en est DANS son niveau : ce qu'on a fait depuis le dernier, ce qui reste. */
export function niveauProgres(points: number): { niveau: number; dans: number; reste: number; pct: number } {
  const dans = points % PAS_NIVEAU;
  return { niveau: niveauDe(points), dans, reste: PAS_NIVEAU - dans,
           pct: Math.round((dans / PAS_NIVEAU) * 100) };
}

/** Un badge par sa cle, ou rien si la cle n'existe pas. */
export function badgeDe(cle: string): Badge | null {
  return BADGE_PAR_CLE.get(cle) ?? null;
}

export type Porteur = {
  id: number; pseudo: string; image_id: number | null; couleur: string | null;
  editeur: boolean; obtenu_le: Date;
};

/**
 * QUI PORTE CE BADGE, les premiers a l'avoir eu d'abord. Un badge sans visage
 * est une regle ; avec trois visages, c'est quelque chose que des gens ont
 * fait — et l'un d'eux repondra si on lui demande comment.
 */
export async function porteursDe(cle: string, limite = 12): Promise<Porteur[]> {
  const r = await q<{
    id: number; pseudo: string | null; nom: string | null; email: string;
    image_id: number | null; couleur: string | null; editeur: boolean; obtenu_le: Date;
  }>(`
    SELECT u.id, u.pseudo, u.nom, u.email, u.image_id, u.couleur, c.editeur, o.obtenu_le
      FROM badge_obtenu o
      JOIN utilisateur u ON u.id = o.utilisateur_id
      JOIN compte c ON c.id = u.compte_id
     WHERE o.badge = $1 AND u.email NOT LIKE '%@' || $2
     ORDER BY o.obtenu_le, u.id LIMIT $3`, [cle, DOMAINE, limite]);
  return r.map((x) => ({ id: x.id, pseudo: pseudoDe(x), image_id: x.image_id,
                         couleur: x.couleur, editeur: x.editeur, obtenu_le: x.obtenu_le }));
}

// ------------------------------------------------------------------ profils

export type BadgeObtenu = Badge & { obtenu_le: Date; nouveau: boolean };

export type Profil = {
  id: number; pseudo: string; nom: string | null; image_id: number | null;
  compte: string; ville: string | null; bio: string | null; couleur: string | null;
  cree_le: Date; public: boolean; editeur: boolean; moi: boolean;
  bornes: number; grade: Grade; points: number; niveau: number;
  messages: number; ventes: number; jours: number; reactions: number;
  badges: BadgeObtenu[];
  /** De quoi montrer ou l'on en est des badges qu'on n'a pas encore. */
  faits: Faits;
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
    reactions: ouvert ? f.reactions : 0,
    badges, faits: f,
  };
}

/** Elle a vu ses nouveaux badges. */
export async function badgesVus(utilisateur_id: number): Promise<void> {
  await q("UPDATE badge_obtenu SET vu_le = now() WHERE utilisateur_id = $1 AND vu_le IS NULL", [utilisateur_id]);
}

export type Classe = {
  id: number; pseudo: string; image_id: number | null; compte: string; couleur: string | null;
  editeur: boolean; bornes: number; grade: Grade; points: number; niveau: number;
  /** Combien de badges, et le plus rare d'entre eux — celui qu'on montre. */
  badges: number; meilleur: Badge | null;
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
    bornes: number; jours: number; messages: number; reactions: number; badges: string[];
  }>(`
    SELECT u.id, u.pseudo, u.nom, u.email, u.image_id, c.nom AS compte, u.couleur, c.editeur, u.profil_public,
           ${SQL_COMPTES},
           COALESCE((SELECT array_agg(o.badge) FROM badge_obtenu o WHERE o.utilisateur_id = u.id), '{}') AS badges
      FROM utilisateur u JOIN compte c ON c.id = u.compte_id
     WHERE u.email NOT LIKE '%@' || $1`, [DOMAINE]);
  return gens
    .map((g) => {
      const points = pointsDe(g, g.badges);
      const meilleur = g.badges
        .map((b) => BADGE_PAR_CLE.get(b)).filter((b): b is Badge => Boolean(b))
        .sort((x, z) => z.points - x.points)[0] ?? null;
      return { id: g.id, pseudo: pseudoDe(g), image_id: g.image_id, compte: g.profil_public ? g.compte : "",
               couleur: g.couleur, editeur: g.editeur, bornes: g.bornes, grade: gradeDe(g.bornes),
               points, niveau: niveauDe(points), badges: g.badges.length, meilleur };
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
/** Le badge le plus rare porte SON PALIER avec lui : le fil est un composant
 *  client, il ne peut pas appeler `rangDe` sans tirer la base dans le
 *  navigateur. On le calcule ici, une fois, et il voyage avec le message. */
export type BadgeMontre = Badge & { rang: Rang };
export type Signature = { niveau: number; grade: string; meilleur: BadgeMontre | null };

export async function niveauxDe(ids: number[]): Promise<Map<number, Signature>> {
  const out = new Map<number, Signature>();
  const propres = [...new Set(ids)].filter((i) => Number.isInteger(i));
  if (propres.length === 0) return out;
  const gens = await q<{ id: number; bornes: number; jours: number; messages: number; reactions: number; badges: string[] }>(`
    SELECT u.id, ${SQL_COMPTES},
           COALESCE((SELECT array_agg(o.badge) FROM badge_obtenu o WHERE o.utilisateur_id = u.id), '{}') AS badges
      FROM utilisateur u WHERE u.id = ANY($1::bigint[])`, [propres]);
  for (const g of gens) {
    // Le badge le plus cher qu'elle porte : c'est celui qu'on montre a cote de
    // son nom, parce qu'un seul se lit et que quinze ne se lisent pas.
    const haut = g.badges
      .map((b) => BADGE_PAR_CLE.get(b)).filter((b): b is Badge => Boolean(b))
      .sort((x, z) => z.points - x.points)[0];
    const meilleur = haut ? { ...haut, rang: rangDe(haut) } : null;
    out.set(Number(g.id), { niveau: niveauDe(pointsDe(g, g.badges)), grade: gradeDe(g.bornes).nom, meilleur });
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
