import { createHash, randomBytes } from "node:crypto";
import { q, q1 } from "@/db";
import { COLONNES, RANGEES } from "./machine";

export type Borne = {
  id: number; compte_id: number | null; lieu_id: number | null;
  nom: string; adresse: string | null;
  code_appairage: string | null; jeton: string | null;
  appairee_le: Date | null; vue_le: Date | null;
  version: string | null; catalogue_version: string | null; sante: unknown;
  hors_service: boolean; hors_service_texte: string | null;
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
  return origineDes(req.headers) ?? new URL(req.url).origin;
}

/**
 * La meme chose depuis des en-tetes seuls.
 *
 * Une page serveur n'a pas de `Request` sous la main — elle lit `headers()`. Or
 * elle en a besoin pour la meme raison qu'un QR : donner a quelqu'un une adresse
 * qu'il puisse taper ailleurs que sur cette machine.
 *
 * Le protocole se deduisait en « http » dans les deux branches d'un ternaire :
 * une coquille, sans consequence derriere un proxy qui pose `x-forwarded-proto`,
 * mais qui aurait rendu une adresse en clair sur un serveur en https direct.
 */
export function origineDes(h: Headers): string | null {
  const hote = h.get("x-forwarded-host") ?? h.get("host");
  if (!hote) return null;
  const local = hote.startsWith("localhost") || hote.startsWith("127.");
  const protocole = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
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
  // LES TROIS LECTURES PARTENT ENSEMBLE. Elles ne dependent pas les unes des
  // autres, et chaque aller-retour vers Neon coute un demi-tour de reseau. En
  // serie, la borne attendait une seconde et demie pour rien — sur une machine
  // en 4G de cave, c'est la difference entre une synchronisation et un delai
  // depasse. Le pool fournit une connexion par requete.
  const [categories, produits, planogramme] = await Promise.all([
    // CE QUE CETTE BORNE MASQUE ne sort pas de la base : on l'omet seulement de
    // ce qu'on lui envoie. Le canal garde son produit, son compteur et son
    // historique ; il est simplement annonce comme libre. Effacer l'affectation
    // pour cacher un article ferait perdre le stock qui dort dans la spirale.
    // `image` porte l'EMPREINTE, pas l'identifiant : c'est elle qui nomme le
    // fichier dans le cache de la machine. Reposer la meme photo ailleurs ne
    // fait donc rien retelecharger, et remplacer une photo change l'empreinte
    // donc le nom, donc le fichier — jamais d'ancienne image sous un nom neuf.
    q(`SELECT c.id, c.nom, c.ordre, c.icone, c.image_id AS image, i.empreinte AS image_e
         FROM categorie c LEFT JOIN image i ON i.id = c.image_id
        -- UNE CATEGORIE RETIREE NE PART PLUS A LA MACHINE. Elle est desactivee
        -- et non supprimee, pour que l'historique des ventes reste lisible ;
        -- sans ce filtre, la borne continuerait a l'afficher a l'ecran.
        WHERE c.compte_id = $1 AND c.actif
          AND c.id NOT IN (SELECT categorie_id FROM borne_masque
                            WHERE borne_id = $2 AND categorie_id IS NOT NULL)
        ORDER BY c.ordre, c.nom`, [compte_id, borne_id]),

    // L'ordre de cette liste EST celui que le client voit dans chaque rayon :
    // la machine la parcourt telle quelle. Ce qu'on veut vendre passe devant.
    q(`SELECT p.sku, p.nom, p.categorie_id, p.prix_vente_c AS prix_centimes,
              p.age_min, p.capteur_fiable, p.icone,
              -- LE « I » DE LA CARTE VOYAGE AVEC LE PRODUIT, pas dans un reglage
              -- a part : c'est une propriete de l'article — a-t-il quelque chose
              -- a dire — et non un mode de la machine. Une borne d'une version
              -- anterieure ignore simplement le champ et garde son bouton.
              p.description, p.mention, p.fiche_visible,
              p.image_id AS image, i.empreinte AS image_e
         FROM produit p LEFT JOIN image i ON i.id = p.image_id
        WHERE p.compte_id = $1 AND p.actif
        ORDER BY p.ordre, p.nom`, [compte_id]),

    // Un canal masque part avec sku = NULL : la machine le traite alors comme
    // un canal libre, chemin qu'elle connait deja par coeur. Rien de neuf a
    // apprendre cote borne pour une fonction entierement nouvelle cote SaaS.
    // EXISTS, surtout pas une jointure : masquer a la fois le produit ET sa
    // categorie appariait DEUX lignes de masque pour un seul canal, et le canal
    // sortait en double. Onze spirales en annoncaient vingt, la machine s'en
    // serait fait une idee tres personnelle.
    // ET SEULEMENT LES SPIRES QUI EXISTENT. Une adresse hors geometrie —
    // heritee d'une vitrine de demonstration fautive — resterait en base avec
    // son stock, mais la machine ne doit jamais la proposer : une vente y serait
    // encaissee sans que rien ne tombe. On ne l'efface pas pour autant : c'est a
    // l'exploitant de dire ou cette marchandise se trouve vraiment.
    q(`SELECT c.lane, c.rangee, c.colonne, c.capacite, c.seuil_bas,
              -- Suspendu vaut masque : un produit retire de la vente ne doit pas
              -- laisser derriere lui un canal servi dont la machine ne connait
              -- plus le prix. Meme chemin, meme resultat — le canal est libre.
              CASE WHEN NOT p.actif OR EXISTS (
                     SELECT 1 FROM borne_masque m
                      WHERE m.borne_id = c.borne_id
                        AND (m.produit_id = p.id OR m.categorie_id = p.categorie_id))
                   THEN NULL ELSE p.sku END AS sku
         FROM canal c
         LEFT JOIN produit p ON p.id = c.produit_id
        WHERE c.borne_id = $1
          AND c.rangee BETWEEN 1 AND $2 AND c.colonne BETWEEN 1 AND $3
        ORDER BY c.lane`, [borne_id, RANGEES, COLONNES]),
  ]);

  return { categories, produits, planogramme };
}

export function empreinte(catalogue: Catalogue): string {
  return createHash("sha256").update(JSON.stringify(catalogue)).digest("hex").slice(0, 16);
}

export async function empreinteDe(compte_id: number, borne_id: number): Promise<string> {
  return empreinte(await catalogueDe(compte_id, borne_id));
}
