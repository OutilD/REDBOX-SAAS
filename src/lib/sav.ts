import { q1 } from "@/db";

/**
 * L'ASSISTANCE : UN NUMERO A APPELER, AFFICHE SUR LA BORNE.
 *
 * Une machine est seule dans un bar, la nuit. Quand elle refuse une carte,
 * avale un paiement ou ne fait pas descendre un produit, le client n'a personne
 * a qui le dire : il s'en va. L'exploitant apprend la panne trois jours plus
 * tard, par le chiffre qui a baisse, et ne saura jamais combien de clients il a
 * perdus avec.
 *
 * Un numero affiche coute une ligne de texte et rattrape les deux.
 *
 * IL VIT SUR LE COMPTE, PAS SUR LA BORNE : c'est le meme exploitant qui repond
 * pour toutes ses machines. Une borne qui aurait besoin du sien pourra en
 * recevoir un plus tard sans defaire celui-ci.
 */

export type Sav = { tel: string; texte: string };

/** Ce qu'on affiche quand l'exploitant n'a pas ecrit sa propre phrase. */
export const TEXTE_DEFAUT = "Une question ou un problème ?";

/** Assez de place pour « 06 12 34 56 78 » et pour un international. */
export const TEL_MAX = 24;
export const TEXTE_MAX = 60;

/**
 * Nettoie un numero sans le reformater.
 *
 * On ne devine pas le pays, on ne regroupe pas les chiffres : l'exploitant sait
 * mieux que nous comment son numero se lit, et un « 0 800 » reformate en
 * « 08 00 » deviendrait faux a l'oeil. On se contente d'oter ce qui ne peut pas
 * appartenir a un numero et de ramener les espaces a un seul.
 */
export function normaliserTel(brut: string): string {
  return brut
    .replace(/[^0-9+()./\- ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TEL_MAX);
}

/** Y a-t-il de quoi appeler ? Un numero, c'est au moins quelques chiffres. */
export function telPlausible(tel: string): boolean {
  return (tel.match(/[0-9]/g) ?? []).length >= 6;
}

export async function savDe(compte_id: number): Promise<Sav | null> {
  const r = await q1<{ sav_tel: string | null; sav_texte: string | null }>(
    "SELECT sav_tel, sav_texte FROM compte WHERE id = $1", [compte_id]);
  const tel = (r?.sav_tel ?? "").trim();
  if (!tel) return null;
  return { tel, texte: (r?.sav_texte ?? "").trim() || TEXTE_DEFAUT };
}
