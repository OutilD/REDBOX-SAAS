import { createHash } from "node:crypto";
import { q, q1, transaction } from "@/db";

/**
 * L'ILLUSTRATION D'UN ECRAN DE LA BORNE.
 *
 * Certains ecrans montrent un geste plutot qu'une phrase : la carte d'identite
 * qui descend vers la fente. C'est une animation dessinee, elle marche partout
 * et ne pese rien — mais elle ne montre pas VOTRE lecteur, sur VOTRE machine.
 * D'ou la possibilite d'y mettre une video tournee devant la vraie borne.
 *
 * L'ANIMATION RESTE LE DEFAUT, et ce n'est pas une valeur qu'on enregistre :
 * c'est l'absence de ligne. On ne peut donc pas se retrouver avec un compte
 * « configure pour ne rien montrer », ni avoir a deviner ce que veut dire un
 * champ vide.
 */
export const ECRANS = ["age"] as const;
export type Ecran = (typeof ECRANS)[number];

/** Court : elle passe en boucle sur un ecran ou le client attend deja. */
export const ILLU_MAX = 12 * 1024 * 1024;

export const ILLU_TYPES: Record<string, "video" | "image"> = {
  "video/mp4": "video", "video/webm": "video",
  "image/jpeg": "image", "image/png": "image", "image/webp": "image",
};

export type Illustration = {
  ecran: string; type_mime: string; taille: number; empreinte: string; cree_le: Date;
};

/** Sans les octets : les pages n'ont jamais besoin du fichier. */
export function illustrationsDe(compte_id: number): Promise<Illustration[]> {
  return q<Illustration>(
    "SELECT ecran, type_mime, taille, empreinte, cree_le FROM illustration WHERE compte_id = $1",
    [compte_id]);
}

export async function poserIllustration(
  compte_id: number, ecran: string, fichier: File,
): Promise<string | null> {
  if (!(ECRANS as readonly string[]).includes(ecran)) return "ecran";
  if (!ILLU_TYPES[fichier.type]) return "type";
  if (fichier.size === 0 || fichier.size > ILLU_MAX) return "poids";

  const octets = Buffer.from(await fichier.arrayBuffer());
  // La taille annoncee par le navigateur n'engage personne : on mesure.
  if (octets.length === 0 || octets.length > ILLU_MAX) return "poids";

  await transaction(async (c) => {
    await c.query(`
      INSERT INTO illustration (compte_id, ecran, type_mime, octets, taille, empreinte)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (compte_id, ecran) DO UPDATE
        SET type_mime = EXCLUDED.type_mime, octets = EXCLUDED.octets,
            taille = EXCLUDED.taille, empreinte = EXCLUDED.empreinte, cree_le = now()`,
      [compte_id, ecran, fichier.type, octets, octets.length,
       createHash("sha256").update(octets).digest("hex")]);
  });
  return null;
}

export async function oterIllustration(compte_id: number, ecran: string): Promise<void> {
  await q("DELETE FROM illustration WHERE compte_id = $1 AND ecran = $2", [compte_id, ecran]);
}

export function octetsIllustration(compte_id: number, ecran: string) {
  return q1<{ octets: Buffer; type_mime: string; empreinte: string }>(
    "SELECT octets, type_mime, empreinte FROM illustration WHERE compte_id = $1 AND ecran = $2",
    [compte_id, ecran]);
}
