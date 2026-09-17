/**
 * GOOGLE DRIVE, LU DEPUIS L'ACADEMIE.
 *
 * Les photos des machines et les modeles de contrats vivent sur un Drive que
 * l'equipe met a jour sans passer par la console. L'academie ne garde que le
 * LIEN, et montre le contenu sur place : une galerie, un apercu — sans envoyer
 * personne sur Drive.
 *
 * Deux conditions. Le dossier est partage « Tous les utilisateurs disposant du
 * lien », et le serveur a une cle d'API Google (`REDBOX_GOOGLE_CLE_API`, API
 * Google Drive activee). Sans cle, on montre la vue integree de Drive : moins
 * belle, mais rien ne casse.
 *
 * Les listes sont gardees deux minutes en memoire : une lecon relue ne refait
 * pas trois appels a Google, et une photo ajoutee sur Drive apparait vite.
 */

export type LienDrive = {
  id: string;
  /** Les liens partages avant 2021 portent une cle de ressource. */
  cle: string | null;
  genre: "dossier" | "fichier" | "inconnu";
};

const ID = /^[A-Za-z0-9_-]{10,}$/;

/** Reconnait un lien Drive, Docs, Sheets ou Slides ; nul sinon. */
export function lienDrive(brut: string | null | undefined): LienDrive | null {
  if (!brut) return null;
  let u: URL;
  try { u = new URL(brut.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const hote = u.hostname.toLowerCase();
  if (hote !== "drive.google.com" && hote !== "docs.google.com") return null;
  const cle = u.searchParams.get("resourcekey");
  const avec = (id: string | null | undefined, genre: LienDrive["genre"]) =>
    id && ID.test(id) ? { id, cle, genre } : null;

  let m = u.pathname.match(/\/folders\/([^/?#]+)/);
  if (m) return avec(m[1], "dossier");
  if (/^\/(embeddedfolderview|folderview)$/.test(u.pathname)) return avec(u.searchParams.get("id"), "dossier");
  m = u.pathname.match(/^\/(?:file|document|spreadsheets|presentation|forms)(?:\/u\/\d+)?\/d\/([^/?#]+)/);
  if (m) return avec(m[1], "fichier");
  if (/^\/(uc|thumbnail)$/.test(u.pathname)) return avec(u.searchParams.get("id"), "fichier");
  if (u.pathname === "/open") return avec(u.searchParams.get("id"), "inconnu");
  return null;
}

export type ElementDrive = { id: string; nom: string; type: string; taille: number | null };

export type ContenuDrive =
  | { etat: "sans-cle" }
  | { etat: "introuvable" }
  | { etat: "erreur"; raison: string }
  | { etat: "fichier"; element: ElementDrive }
  | { etat: "dossier"; id: string; nom: string;
      dossiers: ElementDrive[]; images: ElementDrive[]; fichiers: ElementDrive[] };

export const DOSSIER = "application/vnd.google-apps.folder";
const RACCOURCI = "application/vnd.google-apps.shortcut";
const API = "https://www.googleapis.com/drive/v3/files";
const CHAMPS = "id,name,mimeType,size,shortcutDetails(targetId,targetMimeType)";

type Brut = { id: string; name: string; mimeType: string; size?: string;
              shortcutDetails?: { targetId: string; targetMimeType: string } };

/** Un raccourci Drive se montre comme ce vers quoi il pointe. */
function element(b: Brut): ElementDrive {
  const s = b.mimeType === RACCOURCI ? b.shortcutDetails : undefined;
  return { id: s?.targetId ?? b.id, nom: b.name, type: s?.targetMimeType ?? b.mimeType,
           taille: b.size ? Number(b.size) : null };
}

class ErreurDrive extends Error {
  constructor(readonly statut: number, message: string) { super(message); }
}

async function appel<T>(chemin: string, params: Record<string, string>, lien?: LienDrive): Promise<T> {
  const u = new URL(API + chemin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("supportsAllDrives", "true");
  u.searchParams.set("key", process.env.REDBOX_GOOGLE_CLE_API ?? "");
  const r = await fetch(u, {
    cache: "no-store",
    headers: lien?.cle ? { "X-Goog-Drive-Resource-Keys": `${lien.id}/${lien.cle}` } : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const corps = await r.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ErreurDrive(r.status, corps?.error?.message ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

const DUREE = 2 * 60_000;
const memoire = globalThis as unknown as { _rbxDrive?: Map<string, { t: number; v: ContenuDrive }> };

/** Ce que contient un lien : un dossier range par genre, ou un fichier seul. */
export async function contenuDrive(lien: LienDrive): Promise<ContenuDrive> {
  if (!process.env.REDBOX_GOOGLE_CLE_API) return { etat: "sans-cle" };
  const cache = (memoire._rbxDrive ??= new Map());
  const deja = cache.get(lien.id);
  if (deja && Date.now() - deja.t < DUREE) return deja.v;

  let v: ContenuDrive;
  try {
    const meta = element(await appel<Brut>(`/${lien.id}`, { fields: CHAMPS }, lien));
    if (meta.type !== DOSSIER) {
      v = { etat: "fichier", element: meta };
    } else {
      const tout: ElementDrive[] = [];
      let page: string | undefined;
      for (let n = 0; n < 5; n++) {
        const r = await appel<{ files: Brut[]; nextPageToken?: string }>("", {
          q: `'${meta.id}' in parents and trashed = false`,
          fields: `nextPageToken,files(${CHAMPS})`,
          orderBy: "folder,name_natural",
          pageSize: "1000",
          includeItemsFromAllDrives: "true",
          ...(page ? { pageToken: page } : {}),
        });
        tout.push(...r.files.map(element));
        page = r.nextPageToken;
        if (!page) break;
      }
      v = {
        etat: "dossier", id: meta.id, nom: meta.nom,
        dossiers: tout.filter((e) => e.type === DOSSIER),
        images: tout.filter((e) => e.type.startsWith("image/")),
        fichiers: tout.filter((e) => e.type !== DOSSIER && !e.type.startsWith("image/")),
      };
    }
  } catch (e) {
    // 404 : lien faux, ou dossier non partage. On ne garde pas l'echec : le
    // partage corrige, la page suivante doit le voir.
    if (e instanceof ErreurDrive && e.statut === 404) return { etat: "introuvable" };
    return { etat: "erreur", raison: e instanceof Error ? e.message : String(e) };
  }
  cache.set(lien.id, { t: Date.now(), v });
  return v;
}

/* ----------------------------------------------------------------- adresses */

/** La vignette que Google sert pour un fichier partage : `largeur` en pixels. */
export const vignetteDrive = (id: string, largeur: number) =>
  `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${largeur}`;

/** L'apercu Drive, a poser dans un cadre : PDF, Word, Docs, video… */
export const apercuDrive = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;

export const ouvrirDrive = (e: { id: string; type: string }) =>
  e.type === DOSSIER
    ? `https://drive.google.com/drive/folders/${encodeURIComponent(e.id)}`
    : `https://drive.google.com/file/d/${encodeURIComponent(e.id)}/view`;

/**
 * Le fichier a garder. Un Google Docs n'en a pas : on l'exporte au format
 * bureautique — un modele de contrat se telecharge en Word, pret a remplir.
 */
const EXPORTS: Record<string, string> = {
  "application/vnd.google-apps.document": "document/d/{id}/export?format=docx",
  "application/vnd.google-apps.spreadsheet": "spreadsheets/d/{id}/export?format=xlsx",
  "application/vnd.google-apps.presentation": "presentation/d/{id}/export/pptx",
};
export function telechargerDrive(e: { id: string; type: string }): string | null {
  const id = encodeURIComponent(e.id);
  if (EXPORTS[e.type]) return `https://docs.google.com/${EXPORTS[e.type].replace("{id}", id)}`;
  if (e.type.startsWith("application/vnd.google-apps.")) return null;
  return `https://drive.google.com/uc?export=download&id=${id}`;
}

/** Le cadre Drive d'un dossier, quand le serveur n'a pas de cle. */
export const cadreDossierDrive = (id: string) =>
  `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}#grid`;

const TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.google-apps.document": "DOCS",
  "application/vnd.google-apps.spreadsheet": "SHEETS",
  "application/vnd.google-apps.presentation": "SLIDES",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
};

export function extensionDrive(e: ElementDrive): string {
  if (TYPES[e.type]) return TYPES[e.type];
  if (e.type.startsWith("video/")) return "VIDÉO";
  const ext = e.nom.includes(".") ? e.nom.split(".").pop()!.toUpperCase() : "";
  return ext && ext.length <= 5 ? ext : "FICHIER";
}
