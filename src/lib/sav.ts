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
 * IL VIT SUR LE COMPTE : c'est le meme exploitant qui repond pour toutes ses
 * machines. Une borne peut pourtant porter le sien — le bar qui l'heberge
 * repond pour elle, un associe tient un quartier. Vide, elle prend celui du
 * compte : un exploitant a un seul numero n'a rien a regler machine par machine.
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

/**
 * Ce que CETTE borne affiche : son numero s'il en a un, sinon celui du compte.
 * La phrase suit la meme regle, champ par champ.
 */
export async function savDe(compte_id: number, borne_id?: number): Promise<Sav | null> {
  const r = await q1<{ sav_tel: string | null; sav_texte: string | null }>(
    `SELECT COALESCE(NULLIF(trim(b.sav_tel), ''), c.sav_tel)     AS sav_tel,
            COALESCE(NULLIF(trim(b.sav_texte), ''), c.sav_texte) AS sav_texte
       FROM compte c LEFT JOIN borne b ON b.id = $2 AND b.compte_id = c.id
      WHERE c.id = $1`, [compte_id, borne_id ?? null]);
  const tel = (r?.sav_tel ?? "").trim();
  if (!tel) return null;
  return { tel, texte: (r?.sav_texte ?? "").trim() || TEXTE_DEFAUT };
}
