import { q, q1, transaction, type PgClient } from "@/db";
import type { Utilisateur } from "./auth";
import { groupeDuCompte } from "./communaute";

/**
 * LA REDBOX ACADEMY.
 *
 * Des modules, des lecons, des blocs. Le contenu est ecrit par l'equipe RedBox
 * depuis la console ; il se lit par tous ceux qui ont un compte, mais pas en
 * entier : ce qui fait gagner de l'argent a un redboxer — le contrat type, les
 * astuces de reassort — demande une vraie RedBox appairee. Le futur redboxer
 * voit ces lecons dans le programme, avec un cadenas : c'est la raison de
 * franchir le pas, comme #redboxers dans la messagerie.
 *
 * Toutes les lectures passent par un LECTEUR, calcule une fois par page : ce
 * qu'il est (redboxer ou non) et s'il edite. Aucune requete ne decide seule de
 * ce qui s'ouvre — `ouverte` le fait, au meme endroit pour les pages, les
 * telechargements et la reprise.
 */

export type Acces = "tous" | "redboxers";
export const ACCES: { cle: Acces; nom: string; quoi: string }[] = [
  { cle: "tous",      nom: "Ouvert à tous",   quoi: "Tout compte, avec ou sans RedBox" },
  { cle: "redboxers", nom: "Redboxers",       quoi: "Il faut une RedBox appairée" },
];

export type Genre = "texte" | "video" | "fichier" | "image" | "drive" | "astuce" | "attention" | "script" | "fiche";
export const GENRES: { cle: Genre; nom: string; quoi: string }[] = [
  { cle: "texte",     nom: "Texte",               quoi: "Paragraphes, intertitres, listes" },
  { cle: "video",     nom: "Vidéo",               quoi: "Un lien YouTube ou Vimeo" },
  { cle: "fichier",   nom: "Fichier à télécharger", quoi: "Certificat, contrat, plaquette…" },
  { cle: "image",     nom: "Image",               quoi: "Une photo ou un schéma, avec sa légende" },
  { cle: "drive",     nom: "Photos Drive",        quoi: "Un dossier ou une photo Google Drive, vus sur place" },
  { cle: "astuce",    nom: "Astuce terrain",      quoi: "Ce qui marche, dit en deux phrases" },
  { cle: "attention", nom: "Point d’attention",   quoi: "Ce qu’il ne faut pas rater" },
  { cle: "script",    nom: "Script à dire",       quoi: "Les mots exacts d’un pitch ou d’une réponse" },
  { cle: "fiche",     nom: "Fiche technique",     quoi: "Une ligne par mesure : « Hauteur : 1 800 mm »" },
];
export const estGenre = (g: string): g is Genre => GENRES.some((x) => x.cle === g);

/** Les icones qu'un module peut porter. Le dessin est dans `app/academie/vues.tsx`. */
export const ICONES = ["borne", "photos", "certificat", "contrat", "pitch", "astuce", "video",
                       "document", "chiffres", "communaute", "reassort"] as const;
export type Icone = (typeof ICONES)[number];
export const estIcone = (i: string): i is Icone => (ICONES as readonly string[]).includes(i);

export const TITRE_MAX = 120;
export const RESUME_MAX = 400;
export const TEXTE_MAX = 20_000;

/**
 * LES FICHIERS. Vingt megaoctets : un certificat scanne en couleur ou une
 * plaquette imprimable y tiennent, une video non — elle va sur YouTube, qui la
 * sert mieux que notre base.
 */
export const FICHIER_MAX = 20 * 1024 * 1024;
export const FICHIER_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.oasis.opendocument.text": "ODT",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP",
};
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Le navigateur ne donne pas toujours le type d'un .docx : on le deduit du nom. */
const PAR_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(FICHIER_TYPES).map(([mime, ext]) => [ext.toLowerCase(), mime]));
PAR_EXTENSION.jpeg = "image/jpeg";

export function typeDe(f: File): string | null {
  if (FICHIER_TYPES[f.type]) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return PAR_EXTENSION[ext] ?? null;
}

export function taille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

/* ------------------------------------------------------------------ lecteur */

export type Lecteur = {
  id: number;
  /** A une vraie RedBox appairee — ou fait partie de l'equipe RedBox. */
  redboxer: boolean;
  /** Ecrit l'academie : voit les brouillons et les portes fermees ouvertes. */
  editeur: boolean;
  /** L'editeur regarde l'academie avec les yeux d'un futur redboxer. */
  apercu: boolean;
};

export function peutEditer(u: Utilisateur): boolean {
  return u.editeur || u.superAdmin;
}

/** Le biscuit de l'apercu « prospect », pose par `/api/academie/apercu`. */
export const BISCUIT_APERCU = "rbx_aca";

/** Cote route : l'apercu lu dans l'en-tete Cookie. */
export function apercuDe(req: Request): string | null {
  for (const morceau of (req.headers.get("cookie") ?? "").split(";")) {
    const [nom, ...reste] = morceau.trim().split("=");
    if (nom === BISCUIT_APERCU) return reste.join("=") || null;
  }
  return null;
}

/** #futurs-redboxers : la ou l'on envoie qui bute sur un cadenas. */
export async function salonProspects(): Promise<number | null> {
  const r = await q1<{ id: number }>(
    "SELECT id FROM salon WHERE compte_id IS NULL AND nom = 'futurs-redboxers' AND archive_le IS NULL");
  return r ? Number(r.id) : null;
}

/**
 * QUI LIT. `apercu = "prospect"` n'a d'effet que pour l'editeur : il voit alors
 * exactement ce que voit un compte sans machine — brouillons caches, portes
 * fermees. C'est la seule facon honnete de relire ce qu'on ouvre aux autres.
 */
export async function lecteur(u: Utilisateur, apercu?: string | null): Promise<Lecteur> {
  const editeur = peutEditer(u);
  if (editeur && apercu === "prospect") return { id: u.id, redboxer: false, editeur: false, apercu: true };
  if (editeur) return { id: u.id, redboxer: true, editeur: true, apercu: false };
  // L'equipe RedBox est redboxer partout, depuis n'importe lequel de ses comptes.
  const redboxer = editeur || (await groupeDuCompte(u.compte_id)) === "proprietaires";
  return { id: u.id, redboxer, editeur: false, apercu: false };
}

/** La porte effective : la plus stricte des deux. */
export function ouverte(l: Lecteur, ...acces: Acces[]): boolean {
  return l.redboxer || acces.every((a) => a === "tous");
}

/* ----------------------------------------------------------------- lectures */

export type Module = {
  id: number; titre: string; resume: string | null; icone: Icone; acces: Acces;
  ordre: number; publie: boolean;
  lecons: number; minutes: number; reservees: number; finies: number;
  /** Les lecons que CE lecteur peut ouvrir, et combien il en a terminees. */
  ouvertes: number; finies_ouvertes: number;
};

/**
 * LE PROGRAMME. Un module et ses compteurs en une requete : le nombre de
 * lecons, leur duree, combien sont fermees a qui n'a pas de RedBox, combien ce
 * lecteur en a terminees. Les brouillons ne comptent que pour l'editeur.
 */
export async function modules(l: Lecteur): Promise<Module[]> {
  const lignes = await q<Omit<Module, "ouvertes" | "finies_ouvertes"> & { finies_tous: number }>(`
    SELECT m.id, m.titre, m.resume, m.icone, m.acces, m.ordre, m.publie,
           COUNT(le.id)::int AS lecons,
           COALESCE(SUM(le.duree), 0)::int AS minutes,
           COUNT(le.id) FILTER (WHERE le.acces = 'redboxers')::int AS reservees,
           COUNT(s.fini_le)::int AS finies,
           COUNT(s.fini_le) FILTER (WHERE le.acces = 'tous')::int AS finies_tous
      FROM academie_module m
      LEFT JOIN academie_lecon le ON le.module_id = m.id AND (le.publie OR $2::boolean)
      LEFT JOIN academie_suivi s ON s.lecon_id = le.id AND s.utilisateur_id = $1::bigint
     WHERE m.publie OR $2::boolean
     GROUP BY m.id
     ORDER BY m.ordre, m.id`, [l.id, l.editeur]);
  return lignes.map(({ finies_tous, ...m }) => {
    const toutOuvert = ouverte(l, m.acces);
    return {
      ...m,
      icone: estIcone(m.icone) ? m.icone : "borne",
      ouvertes: !toutOuvert ? 0 : l.redboxer ? m.lecons : m.lecons - m.reservees,
      finies_ouvertes: !toutOuvert ? 0 : l.redboxer ? m.finies : finies_tous,
    };
  });
}

export type LeconResume = {
  id: number; module_id: number; titre: string; resume: string | null; duree: number | null;
  acces: Acces; ordre: number; publie: boolean;
  fini: boolean; vu: boolean;
  /** Ce qu'elle contient, pour l'annoncer dans le programme. */
  videos: number; fichiers: number;
  ouverte: boolean;
};

export async function leconsDe(l: Lecteur, module: { id: number; acces: Acces }): Promise<LeconResume[]> {
  const lignes = await q<Omit<LeconResume, "ouverte">>(`
    SELECT le.id, le.module_id, le.titre, le.resume, le.duree, le.acces, le.ordre, le.publie,
           (s.fini_le IS NOT NULL) AS fini, (s.vu_le IS NOT NULL) AS vu,
           (SELECT COUNT(*)::int FROM academie_bloc b WHERE b.lecon_id = le.id AND b.genre = 'video') AS videos,
           (SELECT COUNT(*)::int FROM academie_bloc b WHERE b.lecon_id = le.id AND b.genre = 'fichier') AS fichiers
      FROM academie_lecon le
      LEFT JOIN academie_suivi s ON s.lecon_id = le.id AND s.utilisateur_id = $2::bigint
     WHERE le.module_id = $1 AND (le.publie OR $3::boolean)
     ORDER BY le.ordre, le.id`, [module.id, l.id, l.editeur]);
  return lignes.map((x) => ({ ...x, ouverte: ouverte(l, module.acces, x.acces) }));
}

export type LeconSommaire = LeconResume & { fini_le: Date | null };

/**
 * TOUTE LA FORMATION, LECON PAR LECON, EN UNE REQUETE : le sommaire de la
 * salle de cours, le temps qui reste et le certificat la lisent. Meme porte
 * que `leconsDe` — le module et la lecon, la plus stricte gagne.
 */
export async function sommaire(l: Lecteur): Promise<LeconSommaire[]> {
  const lignes = await q<Omit<LeconSommaire, "ouverte"> & { module_acces: Acces }>(`
    SELECT le.id, le.module_id, le.titre, le.resume, le.duree, le.acces, le.ordre, le.publie,
           (s.fini_le IS NOT NULL) AS fini, (s.vu_le IS NOT NULL) AS vu, s.fini_le,
           m.acces AS module_acces,
           (SELECT COUNT(*)::int FROM academie_bloc b WHERE b.lecon_id = le.id AND b.genre = 'video') AS videos,
           (SELECT COUNT(*)::int FROM academie_bloc b WHERE b.lecon_id = le.id AND b.genre = 'fichier') AS fichiers
      FROM academie_lecon le
      JOIN academie_module m ON m.id = le.module_id
      LEFT JOIN academie_suivi s ON s.lecon_id = le.id AND s.utilisateur_id = $1::bigint
     WHERE (le.publie AND m.publie) OR $2::boolean
     ORDER BY m.ordre, m.id, le.ordre, le.id`, [l.id, l.editeur]);
  return lignes.map(({ module_acces, ...x }) => ({ ...x, ouverte: ouverte(l, module_acces, x.acces) }));
}

export async function moduleDe(l: Lecteur, id: number): Promise<Module | null> {
  if (!Number.isInteger(id)) return null;
  return (await modules(l)).find((m) => m.id === id) ?? null;
}

export type Bloc = {
  id: number; lecon_id: number; genre: Genre; ordre: number;
  titre: string | null; texte: string | null; url: string | null;
  fichier_id: number | null; fichier_nom: string | null; fichier_type: string | null;
  fichier_taille: number | null;
};

export async function blocsDe(lecon_id: number): Promise<Bloc[]> {
  return q<Bloc>(`
    SELECT b.id, b.lecon_id, b.genre, b.ordre, b.titre, b.texte, b.url, b.fichier_id,
           f.nom AS fichier_nom, f.type_mime AS fichier_type, f.taille AS fichier_taille
      FROM academie_bloc b LEFT JOIN academie_fichier f ON f.id = b.fichier_id
     WHERE b.lecon_id = $1
     ORDER BY b.ordre, b.id`, [lecon_id]);
}

export type Lecon = {
  id: number; module_id: number; titre: string; resume: string | null; duree: number | null;
  acces: Acces; publie: boolean; module_acces: Acces; module_titre: string; module_publie: boolean;
};

/** Une lecon, et son module : la porte se calcule avec les deux. */
export async function leconDe(l: Lecteur, id: number): Promise<Lecon | null> {
  if (!Number.isInteger(id)) return null;
  return q1<Lecon>(`
    SELECT le.id, le.module_id, le.titre, le.resume, le.duree, le.acces, le.publie,
           m.acces AS module_acces, m.titre AS module_titre, m.publie AS module_publie
      FROM academie_lecon le JOIN academie_module m ON m.id = le.module_id
     WHERE le.id = $1 AND ((le.publie AND m.publie) OR $2::boolean)`, [id, l.editeur]);
}

/** Ouvrir une lecon la marque vue : c'est d'elle qu'on repartira. */
export async function marquerVue(l: Lecteur, lecon_id: number): Promise<void> {
  if (l.apercu) return;
  await q(`
    INSERT INTO academie_suivi (utilisateur_id, lecon_id) VALUES ($1, $2)
    ON CONFLICT (utilisateur_id, lecon_id) DO UPDATE SET vu_le = now()`, [l.id, lecon_id]);
}

export async function marquerFinie(utilisateur_id: number, lecon_id: number, fini: boolean): Promise<void> {
  await q(`
    INSERT INTO academie_suivi (utilisateur_id, lecon_id, fini_le)
    VALUES ($1, $2, CASE WHEN $3::boolean THEN now() END)
    ON CONFLICT (utilisateur_id, lecon_id)
      DO UPDATE SET fini_le = CASE WHEN $3::boolean THEN COALESCE(academie_suivi.fini_le, now()) END,
                    vu_le = now()`, [utilisateur_id, lecon_id, fini]);
}

export type Reprise = { lecon_id: number; titre: string; module_id: number; module_titre: string };

/**
 * REPRENDRE. La derniere lecon ouverte et pas terminee ; a defaut, la premiere
 * lecon ouverte qu'on n'a pas finie — celle par ou l'on commencerait. Nul si
 * tout ce qui est ouvert est termine.
 */
export async function reprise(l: Lecteur): Promise<Reprise | null> {
  const lignes = await q<Reprise & { module_acces: Acces; acces: Acces; vu_le: Date | null }>(`
    SELECT le.id AS lecon_id, le.titre, m.id AS module_id, m.titre AS module_titre,
           m.acces AS module_acces, le.acces, s.vu_le
      FROM academie_lecon le
      JOIN academie_module m ON m.id = le.module_id
      LEFT JOIN academie_suivi s ON s.lecon_id = le.id AND s.utilisateur_id = $1::bigint
     WHERE ((le.publie AND m.publie) OR $2::boolean) AND s.fini_le IS NULL
     ORDER BY s.vu_le DESC NULLS LAST, m.ordre, m.id, le.ordre, le.id`, [l.id, l.editeur]);
  const r = lignes.find((x) => ouverte(l, x.module_acces, x.acces));
  return r ? { lecon_id: r.lecon_id, titre: r.titre, module_id: r.module_id, module_titre: r.module_titre } : null;
}

export type Ressource = {
  id: number; titre: string; texte: string | null; url: string; icone: Icone; acces: Acces;
  ordre: number; ouverte: boolean;
};

/**
 * LES RESSOURCES : des boutons vers Google Drive, dans l'ordre choisi par
 * l'equipe. Le contenu vit sur Drive ; ici, seulement le nom et le lien.
 */
export async function ressources(l: Lecteur): Promise<Ressource[]> {
  const lignes = await q<Omit<Ressource, "ouverte">>(`
    SELECT id, titre, texte, url, icone, acces, ordre
      FROM academie_ressource ORDER BY ordre, id`);
  return lignes.map((r) => ({ ...r, icone: estIcone(r.icone) ? r.icone : "document", ouverte: ouverte(l, r.acces) }));
}

export async function ressourceDe(l: Lecteur, id: number): Promise<Ressource | null> {
  if (!Number.isInteger(id)) return null;
  return (await ressources(l)).find((r) => r.id === id) ?? null;
}

/**
 * UN FICHIER, S'IL S'OUVRE A CE LECTEUR. Un meme fichier peut etre pose dans
 * deux lecons ; il suffit que l'une d'elles soit ouverte.
 */
export async function fichierPour(l: Lecteur, id: number):
  Promise<{ nom: string; type_mime: string; octets: Buffer } | null> {
  if (!Number.isInteger(id)) return null;
  const portes = await q<{ module_acces: Acces; acces: Acces }>(`
    SELECT m.acces AS module_acces, le.acces
      FROM academie_bloc b
      JOIN academie_lecon le ON le.id = b.lecon_id
      JOIN academie_module m ON m.id = le.module_id
     WHERE b.fichier_id = $1 AND ((le.publie AND m.publie) OR $2::boolean)`, [id, l.editeur]);
  if (!portes.some((p) => ouverte(l, p.module_acces, p.acces))) return null;
  return q1("SELECT nom, type_mime, octets FROM academie_fichier WHERE id = $1", [id]);
}

/** Qui a termine quoi : ce que l'editeur regarde pour savoir si on le lit. */
export async function lecteursParLecon(): Promise<Map<number, number>> {
  const r = await q<{ lecon_id: number; n: number }>(`
    SELECT lecon_id, COUNT(*)::int AS n FROM academie_suivi WHERE fini_le IS NOT NULL GROUP BY lecon_id`);
  return new Map(r.map((x) => [Number(x.lecon_id), x.n]));
}

/* ------------------------------------------------------------------ videos */

export type Video = { fournisseur: "youtube" | "vimeo"; id: string; embed: string; vignette: string | null; lien: string };

/**
 * UN LIEN VIDEO, RECONNU OU REFUSE. On n'accepte que ce qu'on sait integrer :
 * YouTube (watch, youtu.be, shorts, live, embed) et Vimeo. Le lecteur YouTube
 * passe par youtube-nocookie : rien ne se depose chez le lecteur tant qu'il
 * n'a pas appuye sur lecture.
 */
export function videoDe(brut: string | null | undefined): Video | null {
  if (!brut) return null;
  let u: URL;
  try { u = new URL(brut.trim()); } catch { return null; }
  const hote = u.hostname.replace(/^www\.|^m\./, "");
  const debut = (() => {
    const t = u.searchParams.get("t") ?? u.searchParams.get("start");
    if (!t) return 0;
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    return m ? (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : 0;
  })();
  let yt: string | null = null;
  if (hote === "youtu.be") yt = u.pathname.slice(1).split("/")[0];
  else if (hote === "youtube.com" || hote === "youtube-nocookie.com") {
    if (u.pathname === "/watch") yt = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
      yt = m?.[1] ?? null;
    }
  }
  if (yt && /^[A-Za-z0-9_-]{11}$/.test(yt)) {
    return {
      fournisseur: "youtube", id: yt,
      embed: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0${debut ? `&start=${debut}` : ""}`,
      vignette: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      lien: `https://www.youtube.com/watch?v=${yt}${debut ? `&t=${debut}s` : ""}`,
    };
  }
  if (hote === "vimeo.com" || hote === "player.vimeo.com") {
    const m = u.pathname.match(/(\d{6,})/);
    if (m) {
      return {
        fournisseur: "vimeo", id: m[1],
        embed: `https://player.vimeo.com/video/${m[1]}?autoplay=1`,
        vignette: null, lien: `https://vimeo.com/${m[1]}`,
      };
    }
  }
  return null;
}

/* ---------------------------------------------------------------- ecriture */

type Table = "academie_module" | "academie_lecon" | "academie_bloc" | "academie_ressource";
const PARENT: Record<Table, string | null> = {
  academie_module: null, academie_lecon: "module_id", academie_bloc: "lecon_id", academie_ressource: null,
};

/** Le prochain rang dans sa liste : on ajoute a la fin. */
export async function rangSuivant(c: PgClient, table: Table, parent: number | null): Promise<number> {
  const col = PARENT[table];
  const r = await c.query<{ n: number }>(
    `SELECT COALESCE(MAX(ordre), 0)::int + 1 AS n FROM ${table} WHERE ${col ? `${col} = $1` : "$1::bigint IS NULL"}`,
    [parent]);
  return r.rows[0].n;
}

/**
 * MONTER OU DESCENDRE UN RANG. On relit la liste entiere, on echange avec le
 * voisin, et on renumerote tout : deux lignes au meme `ordre` — un reste
 * d'import, un ajout concurrent — ne bloquent plus jamais le deplacement.
 */
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

/**
 * Range un fichier televerse et rend son identifiant, ou la raison du refus.
 * `images` restreint aux photos, pour un bloc image.
 */
export async function rangerFichier(c: PgClient, f: File, images = false):
  Promise<{ id: number } | { refus: "type" | "lourd" | "vide" }> {
  const type = typeDe(f);
  if (!type || (images && !IMAGE_TYPES.includes(type))) return { refus: "type" };
  const octets = Buffer.from(await f.arrayBuffer());
  if (octets.length === 0) return { refus: "vide" };
  if (octets.length > FICHIER_MAX) return { refus: "lourd" };
  const nom = (f.name || "fichier").slice(0, 160);
  const r = await c.query<{ id: number }>(`
    INSERT INTO academie_fichier (nom, type_mime, octets, taille) VALUES ($1, $2, $3, $4) RETURNING id`,
    [nom, type, octets, octets.length]);
  return { id: Number(r.rows[0].id) };
}

/**
 * LES FICHIERS QUE PLUS AUCUN BLOC NE PORTE. Un fichier de l'academie n'a
 * qu'un seul porteur possible, le bloc : la garde ne peut pas oublier
 * quelqu'un, et un certificat de dix megaoctets ne reste pas en base apres
 * qu'on a efface sa lecon.
 */
export async function balayerFichiers(c: PgClient): Promise<void> {
  await c.query(`
    DELETE FROM academie_fichier f
     WHERE NOT EXISTS (SELECT 1 FROM academie_bloc b WHERE b.fichier_id = f.id)`);
}

/** Un texte de formulaire, coupe et nettoye ; vide devient nul. */
export function champ(f: FormData, nom: string, max: number): string | null {
  const v = String(f.get(nom) ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
  return v === "" ? null : v;
}
