import { createHash } from "node:crypto";
import { q } from "@/db";

/**
 * LES PLAYLISTS DE L'ECRAN D'ACCUEIL.
 *
 * Une PLAYLIST est une campagne : « Promo rentree », « Soiree du samedi ». Elle
 * porte ce qui vaut pour l'ensemble — ou ca passe, a partir de quand, jusqu'a
 * quand, et si ca tourne. Les MEDIAS qu'elle contient ne portent que leur duree
 * et leur rang.
 *
 * Ce decoupage vient de l'usage : on ne choisit pas des bornes et des dates
 * douze fois pour douze photos de la meme operation. On les choisit une fois,
 * pour l'operation.
 *
 * Une regle traverse ce fichier : ON NE LIT JAMAIS `octets` DANS UNE LISTE. Une
 * page qui affiche dix playlists tirerait des centaines de megaoctets de la base
 * pour n'en montrer que les noms. Les octets ne sortent que par la route qui
 * sert un fichier, un a la fois.
 */

/** Au-dela, on refuse. La base n'est pas un entrepot de fichiers, et une borne
 *  au bout d'une 4G de cave ne telechargera jamais cent megaoctets. */
export const TAILLE_MAX = 20 * 1024 * 1024;

export const TYPES: Record<string, "image" | "video"> = {
  "image/jpeg": "image", "image/png": "image", "image/webp": "image",
  "video/mp4": "video", "video/webm": "video",
};

export type Media = {
  id: number; nom: string; genre: "image" | "video"; type_mime: string;
  taille: number; empreinte: string; duree_s: number; ordre: number;
};

export type Playlist = {
  id: number; nom: string; ordre: number;
  actif: boolean; partout: boolean;
  debut_le: Date | null; fin_le: Date | null; cree_le: Date;
  bornes: number[];        // vide si `partout`
  medias: Media[];
  taille: number;          // le poids total, pour dire ce qu'une borne telechargera
  duree_s: number;         // la duree d'un tour complet
  diffuse: boolean;        // active ET dans sa periode, aujourd'hui
};

export async function playlistsDe(compte_id: number): Promise<Playlist[]> {
  const [listes, medias] = await Promise.all([
    q<Omit<Playlist, "medias" | "taille" | "duree_s">>(`
      SELECT p.id, p.nom, p.ordre, p.actif, p.partout, p.debut_le, p.fin_le, p.cree_le,
             COALESCE((SELECT array_agg(pb.borne_id ORDER BY pb.borne_id)
                         FROM playlist_borne pb WHERE pb.playlist_id = p.id), '{}')::bigint[] AS bornes,
             (p.actif
              AND (p.debut_le IS NULL OR p.debut_le <= current_date)
              AND (p.fin_le   IS NULL OR p.fin_le   >= current_date)) AS diffuse
        FROM playlist p
       WHERE p.compte_id = $1
       ORDER BY p.ordre, p.id`, [compte_id]),

    q<Media & { playlist_id: number }>(`
      SELECT v.id, v.nom, v.genre, v.type_mime, v.taille, v.empreinte,
             v.duree_s, v.ordre, v.playlist_id
        FROM visuel v JOIN playlist p ON p.id = v.playlist_id
       WHERE p.compte_id = $1
       ORDER BY v.ordre, v.id`, [compte_id]),
  ]);

  return listes.map((l) => {
    const siens = medias.filter((m) => Number(m.playlist_id) === Number(l.id));
    return {
      ...l,
      medias: siens,
      taille: siens.reduce((s, m) => s + m.taille, 0),
      duree_s: siens.reduce((s, m) => s + m.duree_s, 0),
    };
  });
}

/** Ce qu'une borne donnee doit jouer aujourd'hui : les medias, a plat, dans
 *  l'ordre des playlists puis l'ordre interne. Sans les octets. */
export type VisuelBorne = {
  id: number; nom: string; genre: "image" | "video"; type_mime: string;
  empreinte: string; duree_s: number; taille: number; ordre: number;
};

export async function visuelsPour(compte_id: number, borne_id: number): Promise<VisuelBorne[]> {
  return q<VisuelBorne>(`
    SELECT v.id, v.nom, v.genre, v.type_mime, v.empreinte, v.duree_s, v.taille, v.ordre
      FROM visuel v JOIN playlist p ON p.id = v.playlist_id
     WHERE p.compte_id = $1
       AND p.actif
       AND (p.debut_le IS NULL OR p.debut_le <= current_date)
       AND (p.fin_le   IS NULL OR p.fin_le   >= current_date)
       AND (p.partout OR EXISTS (SELECT 1 FROM playlist_borne pb
                                  WHERE pb.playlist_id = p.id AND pb.borne_id = $2))
     ORDER BY p.ordre, p.id, v.ordre, v.id`, [compte_id, borne_id]);
}

/**
 * L'empreinte de ce qui passe sur une borne.
 *
 * Elle change quand un media entre, sort, change d'ordre ou de duree — donc
 * aussi le jour ou une periode de diffusion se termine, sans que personne n'ait
 * rien touche. C'est voulu : la borne doit s'en apercevoir toute seule.
 */
export function empreintePub(liste: VisuelBorne[]): string {
  return createHash("sha256")
    .update(JSON.stringify(liste.map((v, i) => [v.id, v.empreinte, v.duree_s, i])))
    .digest("hex").slice(0, 16);
}

/** Le compte n'a-t-il RIEN a dicter ? Alors la borne proposera ce qu'elle porte. */
export async function pubVide(compte_id: number): Promise<boolean> {
  const r = await q<{ n: number }>(
    "SELECT COUNT(*)::int n FROM playlist WHERE compte_id = $1", [compte_id]);
  return r[0].n === 0;
}

export function poids(octets: number): string {
  return octets >= 1024 * 1024
    ? `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`
    : `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

export function duree(secondes: number): string {
  if (secondes < 60) return `${secondes} s`;
  const m = Math.floor(secondes / 60), s = secondes % 60;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}
