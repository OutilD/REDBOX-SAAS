import { randomBytes } from "node:crypto";
import { q1 } from "@/db";

export type Borne = {
  id: number; compte_id: number | null; lieu_id: number | null;
  nom: string; adresse: string | null;
  code_appairage: string | null; jeton: string | null;
  appairee_le: Date | null; vue_le: Date | null;
  version: string | null; sante: unknown;
};

/**
 * Authentification MACHINE — sans rapport avec les sessions humaines.
 *
 * La borne presente un jeton porteur. Il est emis une seule fois, a l'appairage,
 * et ne circule jamais autrement.
 */
export async function parJeton(entetes: Headers): Promise<Borne | null> {
  const brut = entetes.get("authorization") ?? "";
  const jeton = brut.startsWith("Bearer ") ? brut.slice(7).trim() : "";
  if (!jeton) return null;
  return q1<Borne>("SELECT * FROM borne WHERE jeton = $1", [jeton]);
}

export function nouveauJeton(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Code lisible a voix haute : ni 0/O ni 1/I.
 *
 * Il se recopie a la main ou se dit au telephone, et une confusion coute un
 * deplacement.
 */
export function nouveauCode(longueur = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const o = randomBytes(longueur);
  let s = "";
  for (let i = 0; i < longueur; i++) s += alphabet[o[i] % alphabet.length];
  return longueur > 6 ? s.slice(0, 4) + "-" + s.slice(4) : s;
}

/**
 * Le rythme d'appel de la borne.
 *
 * Elle s'accelere quand il y a quelque chose a prendre. Cinq minutes, c'est long
 * quand on vient de saisir un chargement et qu'on attend devant la machine ;
 * trente secondes en permanence, c'est du bruit pour rien.
 */
export const RYTHME_VIF = 30;
export const RYTHME_CALME = 300;
