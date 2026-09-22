import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { q, q1 } from "@/db";
import { animerDemo } from "./demo";
import { hoteDes } from "./produits";

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

export type Appartenance = { compte_id: number; compte: string; role: string; demo: boolean; editeur: boolean };

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
  /** Son nom, s'il l'a donne, et sa photo. Ni l'un ni l'autre n'est obligatoire. */
  nom: string | null;
  /** Le nom sous lequel on la montre partout. Nul pour les comptes plus anciens que la question. */
  pseudo: string | null;
  image_id: number | null;
  /**
   * LE COMPTE ACTIF EST-IL ENCORE DANS SON BAC A SABLE ?
   *
   * Un compte neuf s'ouvre sur des donnees inventees — voir `lib/demo.ts`.
   * Tant que c'est vrai, chaque page porte le bandeau qui le dit, et on ne
   * rattache pas de vraie machine a ce parc-la.
   */
  demo: boolean;
  /**
   * MEMBRE DE L'EDITEUR. Le compte actif est celui qui fait RedBox : ses
   * membres ecrivent les annonces, voient la ligne directe de chaque compte,
   * et portent la marque dans la communaute.
   */
  editeur: boolean;
  /** Voit tout le parc et tous les comptes : une personne de l'editeur, pas un compte. */
  superAdmin: boolean;
};

const DUREE = 30 * 24 * 3600 * 1000;
export const BISCUIT = "rbx";

export const ROLES = [
  { cle: "gerant",   nom: "Gérant",              peut: "tout, sauf céder le compte" },
  { cle: "reassort", nom: "Réapprovisionnement", peut: "charger les RedBox, voir l’état" },
  { cle: "lecture",  nom: "Lecture seule",       peut: "regarder, rien d’autre" },
] as const;

export function nomDuRole(cle: string): string {
  if (cle === "proprietaire") return "Redboxer";
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

/**
 * LE BISCUIT DE SESSION. Avec `REDBOX_DOMAINE_BISCUIT` (« .exemple.com »), il
 * vaut sous tous les hotes du domaine : connecte dans la Gestion, on l'est dans
 * Connect (`lib/produits.ts`). Sans, il ne vaut que pour l'hote qui l'a pose.
 *
 * A LA DECONNEXION, LES DEUX FORMES S'EFFACENT : un navigateur connecte avant
 * le passage au domaine garde un biscuit d'hote, qu'un effacement « de domaine »
 * ne touche pas — il serait reste connecte apres avoir clique « Se deconnecter ».
 */
export function enTeteBiscuit(jeton: string | null): string[] {
  const commun = "Path=/; HttpOnly; SameSite=Lax";
  const domaine = (process.env.REDBOX_DOMAINE_BISCUIT ?? "").trim();
  const portee = domaine ? `; Domain=${domaine}` : "";
  if (jeton) return [`${BISCUIT}=${jeton}; ${commun}${portee}; Max-Age=${DUREE / 1000}`];
  const efface = `${BISCUIT}=; ${commun}; Max-Age=0`;
  return domaine ? [efface, `${BISCUIT}=; ${commun}${portee}; Max-Age=0`] : [efface];
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
                       actif: number | null; nom: string | null; pseudo: string | null; image_id: number | null;
                       super_admin: boolean }>(`
    SELECT u.id, u.email, u.compte_id AS origine, u.nom, u.pseudo, u.image_id, u.super_admin,
           s.expire_le, s.compte_id AS actif
      FROM session s
      JOIN utilisateur u ON u.id = s.utilisateur_id
     WHERE s.jeton = $1`, [jeton]);
  if (!l) return null;
  if (new Date(l.expire_le).getTime() < Date.now()) {
    await q("DELETE FROM session WHERE jeton = $1", [jeton]);
    return null;
  }

  const lire = () => q<Appartenance>(`
    SELECT m.compte_id, c.nom AS compte, m.role, c.demo, c.editeur
      FROM membre m JOIN compte c ON c.id = m.compte_id
     WHERE m.utilisateur_id = $1
     ORDER BY (m.compte_id = $2) DESC, c.nom`, [l.id, l.origine]);
  let comptes = await lire();

  // AUCUNE APPARTENANCE, ET POURTANT UN COMPTE QU'ON A FONDE : la ligne manque.
  //
  // L'inscription ne l'a pas ecrite pendant des semaines apres la migration
  // qui a cree `membre` — chaque compte ouvert dans l'intervalle ramenait a la
  // page de connexion a chaque page, sans un mot. La colonne `compte_id` de
  // l'utilisateur dit ce que l'appartenance aurait du dire ; on la pose ici,
  // une fois, plutot que d'exiger qu'on rejoue la migration.
  //
  // SEULEMENT POUR UN PROPRIETAIRE. Une personne retiree de son dernier compte
  // n'a plus de ligne non plus, et ce serait la lui rendre : la refaire depuis
  // le role d'origine rouvrirait la porte que l'exploitant vient de fermer. Le
  // proprietaire, lui, ne peut pas etre retire — s'il n'a pas de ligne, c'est
  // que l'inscription ne l'a pas ecrite, et rien d'autre.
  if (comptes.length === 0) {
    await q(`
      INSERT INTO membre (utilisateur_id, compte_id, role)
      SELECT u.id, u.compte_id, 'proprietaire' FROM utilisateur u
       WHERE u.id = $1 AND u.role = 'proprietaire'
         AND EXISTS (SELECT 1 FROM compte c WHERE c.id = u.compte_id)
      ON CONFLICT (utilisateur_id, compte_id) DO NOTHING`, [l.id]);
    comptes = await lire();
  }
  if (comptes.length === 0) return null;

  const choisi = comptes.find((a) => a.compte_id === l.actif) ?? comptes[0];

  // LES BORNES FICTIVES PASSENT QUAND ON OUVRE LA CONSOLE. C'est ici que
  // toute page commence, donc c'est ici qu'on les fait parler — mais SANS
  // ATTENDRE : la page qui a declenche le passage ne doit pas payer les dix
  // requetes qu'il coute, elle verra le resultat a la suivante, comme avec une
  // vraie machine qui se synchronise toutes les cinq minutes. Rien ne part si
  // elles sont passees il y a moins d'une minute, et un passage qui echoue ne
  // ferme pas la console : on le note.
  if (choisi.demo) {
    void animerDemo(choisi.compte_id)
      .catch((e) => console.error("bornes fictives :", e instanceof Error ? e.message : e));
  }

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
    nom: l.nom, pseudo: l.pseudo, image_id: l.image_id,
    demo: choisi.demo,
    editeur: choisi.editeur,
    superAdmin: l.super_admin,
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
/** L'editeur : tout le parc, tous les comptes, leurs chiffres. */
export function estSuperAdmin(u: Utilisateur): boolean {
  return u.superAdmin;
}

/** Retour a une page apres un formulaire : 303, donc rechargement en GET. */
export function versPage(req: Request, chemin: string, biscuit?: string | string[]): Response {
  // L'adresse se compose depuis l'hote que le client a tape, pas depuis
  // `req.url` : Next y met parfois le nom de la machine, et avec deux hotes pour
  // deux produits on sortirait de l'application ou l'on etait.
  const hote = hoteDes(req.headers);
  const local = !hote || hote.startsWith("localhost") || hote.includes(".localhost") || hote.startsWith("127.");
  const base = hote ? `${req.headers.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${hote}` : req.url;
  const entetes = new Headers({ Location: new URL(chemin, base).toString() });
  for (const b of biscuit === undefined ? [] : [biscuit].flat()) entetes.append("Set-Cookie", b);
  return new Response(null, { status: 303, headers: entetes });
}
