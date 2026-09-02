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

export type Appartenance = { compte_id: number; compte: string; role: string };

export type Utilisateur = {
  id: number; compte_id: number; email: string; role: string; compte: string;
  /**
   * LES BORNES QU'IL A LE DROIT DE VOIR, OU `null` POUR TOUTES.
   *
   * `null` n'est pas un oubli, c'est le cas ordinaire : un associe voit tout le
   * parc et n'a aucune ligne dans `acces_borne`. La liste ne se remplit que pour
   * quelqu'un invite sur une machine et une seule — le patron du bar qui
   * l'heberge, par exemple. Distinguer « aucune restriction » de « aucune
   * borne » est la seule chose a ne pas se tromper ici : confondre les deux
   * ferme le parc a tout le monde, ou l'ouvre a tout le monde.
   */
  bornes: number[] | null;
  /** Les comptes auxquels il appartient. Un seul, pour presque tout le monde. */
  comptes: Appartenance[];
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

/**
 * LA SESSION, LE COMPTE ACTIF, ET CE QU'IL DONNE A VOIR.
 *
 * Trois lectures au lieu d'une, et c'est ce qui permet a tout le reste du code
 * de ne pas bouger : `compte_id` et `role` gardent leur sens — le compte sur
 * lequel on travaille et ce qu'on y peut — mais ils ne viennent plus de la
 * colonne de l'utilisateur, ils viennent de son APPARTENANCE au compte actif.
 *
 * Le compte actif est celui que porte la session. Nul, ou devenu invalide parce
 * qu'on a retire la personne du compte, on retombe sur sa premiere
 * appartenance. Une personne sans aucune appartenance n'existe plus : sa session
 * ne vaut rien, et le dire tot evite de la promener sur des pages vides.
 */
async function parJeton(jeton: string | undefined | null): Promise<Utilisateur | null> {
  if (!jeton) return null;
  const l = await q1<{ id: number; email: string; origine: number; expire_le: Date;
                       actif: number | null }>(`
    SELECT u.id, u.email, u.compte_id AS origine, s.expire_le, s.compte_id AS actif
      FROM session s
      JOIN utilisateur u ON u.id = s.utilisateur_id
     WHERE s.jeton = $1`, [jeton]);
  if (!l) return null;
  if (new Date(l.expire_le).getTime() < Date.now()) {
    await q("DELETE FROM session WHERE jeton = $1", [jeton]);
    return null;
  }

  const comptes = await q<Appartenance>(`
    SELECT m.compte_id, c.nom AS compte, m.role
      FROM membre m JOIN compte c ON c.id = m.compte_id
     WHERE m.utilisateur_id = $1
     ORDER BY (m.compte_id = $2) DESC, c.nom`, [l.id, l.origine]);
  if (comptes.length === 0) return null;

  const choisi = comptes.find((a) => a.compte_id === l.actif) ?? comptes[0];

  // Les bornes autorisees, DANS LE COMPTE ACTIF seulement : une restriction
  // posee chez un exploitant ne dit rien de ce qu'on peut voir chez un autre.
  const restreint = await q<{ borne_id: number }>(`
    SELECT a.borne_id FROM acces_borne a
      JOIN borne b ON b.id = a.borne_id
     WHERE a.utilisateur_id = $1 AND b.compte_id = $2`, [l.id, choisi.compte_id]);

  return {
    id: l.id, email: l.email,
    compte_id: choisi.compte_id, compte: choisi.compte, role: choisi.role,
    bornes: restreint.length > 0 ? restreint.map((r) => r.borne_id) : null,
    comptes,
  };
}

/**
 * Le compte sur lequel la session travaille. Rend faux si la personne n'y
 * appartient pas — on ne change pas de compte en devinant un numero.
 */
export async function basculerCompte(jeton: string, utilisateur_id: number,
                                     compte_id: number): Promise<boolean> {
  const ok = await q1("SELECT 1 FROM membre WHERE utilisateur_id = $1 AND compte_id = $2",
                      [utilisateur_id, compte_id]);
  if (!ok) return false;
  await q("UPDATE session SET compte_id = $2 WHERE jeton = $1", [jeton, compte_id]);
  return true;
}

/**
 * EST-IL RESTREINT A CERTAINES BORNES ?
 *
 * Si oui, le COMPTE ne lui appartient pas : le catalogue, le depot, les affiches
 * et le parc lui-meme sont l'affaire de l'exploitant. Il peut avoir un role qui
 * l'autoriserait a les changer — on peut inviter un gerant sur une seule machine
 * — et c'est precisement pour ce cas que ce predicat existe : le role dit ce
 * qu'on sait faire, la portee dit sur quoi.
 */
export function estRestreint(u: Utilisateur): boolean {
  return u.bornes !== null;
}

/** Cette borne lui est-elle ouverte ? Le compte a deja ete verifie ailleurs. */
export function peutVoirBorne(u: Utilisateur, borne_id: number): boolean {
  return u.bornes === null || u.bornes.includes(borne_id);
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
