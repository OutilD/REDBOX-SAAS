/**
 * DEUX PRODUITS, ET BIENTOT DEUX ADRESSES.
 *
 * RedBox Gestion sert les machines ; RedBox Connect relie les gens. Un seul
 * projet, une seule base, une seule connexion — comme Messenger et Facebook.
 * Ce fichier dit a quel produit appartient une ADRESSE de page, et, quand on
 * les a declarees, sous quel NOM D'HOTE chaque produit se sert :
 *
 *   REDBOX_HOTE_GESTION   gestion.exemple.com
 *   REDBOX_HOTE_CONNECT   connect.exemple.com
 *   REDBOX_DOMAINE_BISCUIT  .exemple.com   la session vaut sous les deux
 *
 * SANS CES VARIABLES, RIEN NE CHANGE : un seul hote sert les deux produits, et
 * l'on passe de l'un a l'autre par le menu. Avec elles, chaque hote ne montre
 * que son produit ; une page de l'autre y renvoie (`middleware.ts`). Un hote
 * qui n'est aucun des deux — l'ancienne adresse que les bornes appellent — se
 * comporte comme s'il n'y avait pas de variables.
 *
 * Rien d'autre que des chaines ici : ce fichier est lu par le middleware, qui
 * tourne en « edge » et n'a ni la base ni Node.
 */
export type Produit = "gestion" | "connect";

export const PRODUITS: Record<Produit, { nom: string; accueil: string; quoi: string }> = {
  gestion: { nom: "Gestion", accueil: "/",           quoi: "Vos machines : chiffres, réassort, réglages" },
  connect: { nom: "Connect", accueil: "/communaute", quoi: "Le réseau : communauté, messages, académie" },
};

export const BISCUIT_PRODUIT = "rbx_produit";
/** L'en-tete de requete que pose le middleware : le produit de la page servie. */
export const ENTETE_PRODUIT = "x-rbx-produit";

const CONNECT = ["/communaute", "/messages", "/academie", "/carte"];
const PARTAGEES = ["/menu", "/profil", "/reglages/notifications", "/demo",
                   "/connexion", "/inscription", "/rejoindre"];

const sous = (chemin: string, racines: string[]) =>
  racines.some((r) => chemin === r || chemin.startsWith(r + "/"));

/** Le produit d'une adresse de page ; null si elle sert les deux. */
export function produitDuChemin(chemin: string): Produit | null {
  if (sous(chemin, PARTAGEES)) return null;
  // Placer une machine sur la carte est un geste du parc, pas du reseau.
  return sous(chemin, CONNECT) && !chemin.startsWith("/carte/situer") ? "connect" : "gestion";
}

const propre = (h: string | undefined | null) => (h ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

/** Les deux hotes, ou null tant qu'ils ne sont pas declares TOUS LES DEUX. */
export function hotes(): Record<Produit, string> | null {
  const gestion = propre(process.env.REDBOX_HOTE_GESTION), connect = propre(process.env.REDBOX_HOTE_CONNECT);
  return gestion && connect && gestion !== connect ? { gestion, connect } : null;
}

/** Le produit que sert cet hote ; null s'il n'y a pas deux hotes, ou si ce n'est aucun des deux. */
export function produitDeLHote(hote: string | null | undefined): Produit | null {
  const h = hotes(), ici = propre(hote);
  if (!h || !ici) return null;
  return ici === h.gestion ? "gestion" : ici === h.connect ? "connect" : null;
}

/**
 * L'adresse d'une page de `produit`, vue depuis `hoteIci`. Un simple chemin
 * tant qu'on reste chez soi ; une adresse complete quand il faut changer d'hote.
 */
export function adresse(produit: Produit, chemin: string, hoteIci: string | null | undefined): string {
  const h = hotes();
  if (!h || produitDeLHote(hoteIci) === null || propre(hoteIci) === h[produit]) return chemin;
  const local = h[produit].startsWith("localhost") || h[produit].includes(".localhost") || h[produit].startsWith("127.");
  return `${local ? "http" : "https"}://${h[produit]}${chemin}`;
}

/** L'hote tel que le client l'a compose — derriere un proxy, `x-forwarded-host` passe devant. */
export function hoteDes(h: { get(nom: string): string | null }): string | null {
  return h.get("x-forwarded-host") ?? h.get("host");
}
