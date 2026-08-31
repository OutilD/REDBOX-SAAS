import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { q, q1 } from "@/db";

/** scrypt : sel:empreinte. Pas de service tiers pour trois mots de passe. */
export function chiffrer(mdp: string): string {
  const sel = randomBytes(16).toString("hex");
  return sel + ":" + scryptSync(mdp, sel, 64).toString("hex");
}

export function concorde(mdp: string, stocke: string): boolean {
  const [sel, empreinte] = stocke.split(":");
  if (!sel || !empreinte) return false;
  const a = Buffer.from(empreinte, "hex");
  const b = scryptSync(mdp, sel, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Utilisateur = {
  id: number; compte_id: number; email: string; role: string; compte: string;
};

const DUREE = 30 * 24 * 3600 * 1000;
export const BISCUIT = "rbx";

export const ROLES = [
  { cle: "gerant",   nom: "Gérant",              peut: "tout, sauf céder le compte" },
  { cle: "reassort", nom: "Réapprovisionnement", peut: "charger les bornes, voir l’état" },
  { cle: "lecture",  nom: "Lecture seule",       peut: "regarder, rien d’autre" },
] as const;

export function nomDuRole(cle: string): string {
  if (cle === "proprietaire") return "Propriétaire";
  return ROLES.find((r) => r.cle === cle)?.nom ?? cle;
}

export async function creerSession(utilisateur_id: number): Promise<string> {
  const jeton = randomBytes(32).toString("base64url");
  await q("INSERT INTO session (jeton, utilisateur_id, expire_le) VALUES ($1,$2,$3)",
          [jeton, utilisateur_id, new Date(Date.now() + DUREE)]);
  return jeton;
}

export async function detruireSession(jeton: string): Promise<void> {
  await q("DELETE FROM session WHERE jeton = $1", [jeton]);
}

export function enTeteBiscuit(jeton: string | null): string {
  const commun = "Path=/; HttpOnly; SameSite=Lax";
  return jeton ? `${BISCUIT}=${jeton}; ${commun}; Max-Age=${DUREE / 1000}`
               : `${BISCUIT}=; ${commun}; Max-Age=0`;
}

async function parJeton(jeton: string | undefined | null): Promise<Utilisateur | null> {
  if (!jeton) return null;
  const l = await q1<Utilisateur & { expire_le: Date }>(`
    SELECT u.id, u.compte_id, u.email, u.role, c.nom AS compte, s.expire_le
      FROM session s
      JOIN utilisateur u ON u.id = s.utilisateur_id
      JOIN compte c      ON c.id = u.compte_id
     WHERE s.jeton = $1`, [jeton]);
  if (!l) return null;
  if (new Date(l.expire_le).getTime() < Date.now()) {
    await q("DELETE FROM session WHERE jeton = $1", [jeton]);
    return null;
  }
  return { id: l.id, compte_id: l.compte_id, email: l.email, role: l.role, compte: l.compte };
}

/** Cote page : le rendu a acces aux en-tetes de la requete. */
export async function utilisateur(): Promise<Utilisateur | null> {
  return parJeton((await cookies()).get(BISCUIT)?.value);
}

/**
 * Cote route : on lit l'en-tete Cookie de la requete elle-meme.
 *
 * Toutes les mutations passent par des formulaires HTML vers des gestionnaires
 * de route, parce que les Server Actions perdent le contexte de requete sur le
 * chemin sans JavaScript. Le detour a un benefice : la console marche sans
 * JavaScript, sur le telephone qu'on a en main dans un bar mal couvert.
 */
export async function utilisateurDe(req: Request): Promise<Utilisateur | null> {
  const brut = req.headers.get("cookie") ?? "";
  for (const morceau of brut.split(";")) {
    const [nom, ...reste] = morceau.trim().split("=");
    if (nom === BISCUIT) return parJeton(decodeURIComponent(reste.join("=")));
  }
  return null;
}

export function peutCharger(u: Utilisateur): boolean {
  return u.role !== "lecture";
}
export function peutConfigurer(u: Utilisateur): boolean {
  return u.role === "proprietaire" || u.role === "gerant";
}
export function peutGererEquipe(u: Utilisateur): boolean {
  return u.role === "proprietaire";
}

/** Retour a une page apres un formulaire : 303, donc rechargement en GET. */
export function versPage(req: Request, chemin: string, biscuit?: string): Response {
  const entetes = new Headers({ Location: new URL(chemin, req.url).toString() });
  if (biscuit !== undefined) entetes.set("Set-Cookie", biscuit);
  return new Response(null, { status: 303, headers: entetes });
}
