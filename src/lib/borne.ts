import { createHash, randomBytes } from "node:crypto";
import { q, q1 } from "@/db";

export type Borne = {
  id: number; compte_id: number | null; lieu_id: number | null;
  nom: string; adresse: string | null;
  code_appairage: string | null; jeton: string | null;
  appairee_le: Date | null; vue_le: Date | null;
  version: string | null; catalogue_version: string | null; sante: unknown;
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

/**
 * L'adresse a laquelle le client a REELLEMENT joint ce serveur.
 *
 * `new URL(req.url).origin` ne convient pas : Next reconstruit cette adresse a
 * partir de ce que le serveur croit etre, et rend « localhost » meme quand la
 * requete est arrivee par l'adresse reseau. Un QR qui encode « localhost » est
 * inutilisable — sur le telephone qui le scanne, localhost, c'est le telephone.
 *
 * On lit donc l'en-tete Host, celui que le client a compose. Les en-tetes
 * `x-forwarded-*` passent devant : derriere un reverse proxy, ce sont eux qui
 * portent l'adresse publique.
 */
export function origineVue(req: Request): string {
  const h = req.headers;
  const hote = h.get("x-forwarded-host") ?? h.get("host");
  if (!hote) return new URL(req.url).origin;
  const protocole = h.get("x-forwarded-proto")
    ?? (hote.startsWith("localhost") || hote.startsWith("127.") ? "http" : "http");
  return `${protocole}://${hote}`;
}

/**
 * Reveille une ou plusieurs bornes.
 *
 * Poser ce drapeau suffit : la borne tient une question ouverte, le serveur lui
 * repond dans la seconde. On l'appelle des qu'un changement la concerne — un
 * chargement saisi, un catalogue modifie, un planogramme repris — et pas
 * seulement quand quelqu'un clique.
 */
export async function reveiller(borne_id: number, motif: string): Promise<void> {
  await q("UPDATE borne SET reveil_le = now(), reveil_motif = $2 WHERE id = $1",
          [borne_id, motif]);
}

/** Toutes les bornes d'un compte : un changement de catalogue les concerne toutes. */
export async function reveillerLeCompte(compte_id: number, motif: string): Promise<number> {
  const r = await q<{ id: number }>(
    "UPDATE borne SET reveil_le = now(), reveil_motif = $2 WHERE compte_id = $1 AND jeton IS NOT NULL RETURNING id",
    [compte_id, motif]);
  return r.length;
}

/**
 * L'EMPREINTE DU CATALOGUE — une seule definition, deux lecteurs.
 *
 * La route /api/borne/config la donne a la machine ; les pages s'en servent pour
 * dire si une borne detient encore une version perimee. Les deux DOIVENT calculer
 * le meme chiffre : c'est pour cela qu'il n'y a qu'un seul endroit ou il se
 * calcule. Deux copies de ce hash, et la moitie du parc semblerait perpetuellement
 * en retard.
 *
 * Elle depend de la borne, pas seulement du compte : le planogramme lui est propre.
 */
export type Catalogue = {
  categories: unknown[]; produits: unknown[]; planogramme: unknown[];
};

export async function catalogueDe(compte_id: number, borne_id: number): Promise<Catalogue> {
  const categories = await q(`
    SELECT id, nom, ordre FROM categorie
     WHERE compte_id = $1 ORDER BY ordre, nom`, [compte_id]);

  const produits = await q(`
    SELECT p.sku, p.nom, p.categorie_id, p.prix_vente_c AS prix_centimes,
           p.age_min, p.capteur_fiable
      FROM produit p
     WHERE p.compte_id = $1 AND p.actif
     ORDER BY p.nom`, [compte_id]);

  const planogramme = await q(`
    SELECT c.lane, c.rangee, c.colonne, c.capacite, c.seuil_bas, p.sku
      FROM canal c LEFT JOIN produit p ON p.id = c.produit_id
     WHERE c.borne_id = $1
     ORDER BY c.lane`, [borne_id]);

  return { categories, produits, planogramme };
}

export function empreinte(catalogue: Catalogue): string {
  return createHash("sha256").update(JSON.stringify(catalogue)).digest("hex").slice(0, 16);
}

export async function empreinteDe(compte_id: number, borne_id: number): Promise<string> {
  return empreinte(await catalogueDe(compte_id, borne_id));
}
