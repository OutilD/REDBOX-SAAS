import { q, q1, type PgClient } from "@/db";
import { jointurePrix } from "./prix";

/**
 * Les lectures de stock.
 *
 * Toutes reposent sur les vues `v_stock` et `v_en_route` : personne ne lit un
 * compteur range quelque part, tout se recalcule depuis le grand livre. A cette
 * echelle — quelques milliers de mouvements par an et par compte — c'est
 * instantane, et ca reste vrai le jour ou quelqu'un corrige une ligne d'il y a
 * trois semaines.
 */

export type LigneStock = {
  id: number; sku: string; nom: string;
  categorie_id: number | null; categorie: string; ordre: number;
  prix_vente_c: number; age_min: number;
  reserve: number; bornes: number; en_route: number;
  prix_achat_c: number | null;
};

export async function stockParProduit(compte_id: number): Promise<LigneStock[]> {
  return q<LigneStock>(`
    SELECT p.id, p.sku, p.nom, p.prix_vente_c, p.age_min,
           p.categorie_id, COALESCE(cat.nom, 'sans catégorie') AS categorie,
           COALESCE(cat.ordre, 999) AS ordre,
           COALESCE((SELECT SUM(s.quantite) FROM v_stock s JOIN lieu l ON l.id = s.lieu_id
                      WHERE s.produit_id = p.id AND l.genre = 'reserve'), 0)::int AS reserve,
           COALESCE((SELECT SUM(s.quantite) FROM v_stock s JOIN lieu l ON l.id = s.lieu_id
                      WHERE s.produit_id = p.id AND l.genre = 'borne'), 0)::int   AS bornes,
           COALESCE((SELECT SUM(r.quantite) FROM v_en_route r
                      WHERE r.produit_id = p.id), 0)::int                          AS en_route,
           (SELECT a.prix_achat_c FROM v_prix_achat a WHERE a.produit_id = p.id)   AS prix_achat_c
      FROM produit p
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE p.compte_id = $1 AND p.actif
     ORDER BY COALESCE(cat.ordre, 999), COALESCE(cat.nom, 'zzz'), p.nom`, [compte_id]);
}

/** Ce que vaut, a l'achat, tout ce qui n'est pas encore vendu. */
export function valeurImmobilisee(lignes: LigneStock[]): number {
  return lignes.reduce((s, l) =>
    s + (l.prix_achat_c ?? 0) * (l.reserve + l.bornes + l.en_route), 0);
}

/**
 * La reserve du compte.
 *
 * Creee a la volee : un compte a toujours au moins un endroit ou poser ce qu'il
 * achete, et demander a l'utilisateur de le declarer avant de pouvoir enregistrer
 * sa premiere livraison serait une porte fermee pour rien.
 */
export async function reserveDe(compte_id: number, c?: PgClient): Promise<number> {
  const lire = c
    ? async () => (await c.query<{ id: number }>(
        "SELECT id FROM lieu WHERE compte_id = $1 AND genre = 'reserve' ORDER BY id LIMIT 1",
        [compte_id])).rows[0] ?? null
    : async () => q1<{ id: number }>(
        "SELECT id FROM lieu WHERE compte_id = $1 AND genre = 'reserve' ORDER BY id LIMIT 1",
        [compte_id]);

  const deja = await lire();
  if (deja) return deja.id;

  const creer = "INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'reserve','Ma réserve') RETURNING id";
  const r = c ? (await c.query<{ id: number }>(creer, [compte_id])).rows[0]
              : await q1<{ id: number }>(creer, [compte_id]);
  return r!.id;
}

/** Le stock d'une borne, canal par canal, avec ce qui est en route vers elle. */
export type LigneCanal = {
  canal_id: number; lane: number; rangee: number; colonne: number;
  produit_id: number | null; sku: string | null; nom: string | null;
  categorie_id: number | null; categorie: string; ordre: number;
  /**
   * LE PRIX DU CATALOGUE — celui qui vaut partout ou rien n'a ete decide.
   * Il reste ici pour pouvoir dire de combien cette borne s'en ecarte ; ce
   * n'est pas ce qu'elle encaisse.
   */
  prix_vente_c: number | null;
  /**
   * CE QUE CETTE BORNE FAIT PAYER, et donc le seul chiffre a afficher sur une
   * page qui parle d'une machine. Egal au catalogue tant qu'aucun prix propre
   * n'a ete pose — ce qui est le cas ordinaire.
   */
  prix_c: number | null;
  /** Vrai quand ce prix vient d'une exception posee sur cette borne. */
  prix_propre: boolean;
  /** Notre compte, tenu par les evenements. C'est lui qui fait foi ici. */
  quantite: number;
  /** Ce que la machine dit porter. L'ecart avec le notre est l'information. */
  quantite_borne: number | null;
  capacite: number; seuil_bas: number;
  releve_le: Date | null; en_route: number; reserve: number;
};

export async function canauxDe(borne_id: number, compte_id: number): Promise<LigneCanal[]> {
  return q<LigneCanal>(`
    SELECT c.id AS canal_id, c.lane, c.rangee, c.colonne, c.produit_id,
           p.sku, p.nom, p.prix_vente_c,
           -- LE PRIX DE CETTE BORNE, pas celui du catalogue. Toutes les pages
           -- qui montrent un plateau passent par ici : la jointure est posee
           -- une fois, et aucune d'elles ne peut afficher un tarif que la
           -- machine ne pratique pas.
           COALESCE(pb.prix_c, p.prix_vente_c) AS prix_c,
           (pb.prix_c IS NOT NULL) AS prix_propre,
           p.categorie_id, COALESCE(cat.nom, 'sans catégorie') AS categorie,
           COALESCE(cat.ordre, 999) AS ordre,
           c.quantite, c.quantite_borne, c.capacite, c.seuil_bas, c.releve_le,
           COALESCE((SELECT SUM(m.quantite) FROM mouvement m
                      WHERE m.vers_lieu_id = b.lieu_id AND m.lane = c.lane
                        AND m.confirme_le IS NULL AND m.annule_le IS NULL), 0)::int AS en_route,
           COALESCE((SELECT SUM(s.quantite) FROM v_stock s JOIN lieu l ON l.id = s.lieu_id
                      WHERE s.produit_id = c.produit_id AND l.genre = 'reserve'
                        AND l.compte_id = $2), 0)::int AS reserve
      FROM canal c
      JOIN borne b ON b.id = c.borne_id
      LEFT JOIN produit p     ON p.id = c.produit_id
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
      ${jointurePrix("$1")}
     WHERE c.borne_id = $1 AND b.compte_id = $2
     ORDER BY c.lane`, [borne_id, compte_id]);
}

/**
 * Le stock rassemble par categorie.
 *
 * Onze produits a plat, c'est une liste qu'on parcourt sans rien voir. Groupes,
 * ce sont six sections dont on ouvre celle qui pose probleme — et le total par
 * categorie repond souvent tout seul a la question qu'on se posait.
 */
export type Groupe = {
  id: number | null; nom: string;
  lignes: LigneStock[];
  reserve: number; bornes: number; en_route: number;
  valeur: number; ruptures: number;
};

export function grouperParCategorie(lignes: LigneStock[]): Groupe[] {
  const par = new Map<string, Groupe>();
  for (const l of lignes) {
    const cle = String(l.categorie_id ?? "sans");
    let g = par.get(cle);
    if (!g) {
      g = { id: l.categorie_id, nom: l.categorie, lignes: [],
            reserve: 0, bornes: 0, en_route: 0, valeur: 0, ruptures: 0 };
      par.set(cle, g);
    }
    g.lignes.push(l);
    g.reserve += l.reserve;
    g.bornes += l.bornes;
    g.en_route += l.en_route;
    g.valeur += (l.prix_achat_c ?? 0) * (l.reserve + l.bornes + l.en_route);
    if (l.reserve === 0 && l.en_route === 0) g.ruptures++;
  }
  return [...par.values()];
}

/**
 * Les canaux d'une borne, rassembles par categorie.
 *
 * On remplit une machine avec un carton dans les mains, pas en marchant le long
 * des rangees : on fait tous les canaux de Puffs, puis on prend le carton
 * suivant. Le groupement suit ce geste-la. Le reperage physique reste lisible sur
 * chaque bloc — c'est le numero de canal qui dit ou poser la main.
 */
export type GroupeCanal = {
  id: number | null; nom: string;
  canaux: LigneCanal[];
  vides: number; bas: number; place: number; reserve: number;
};

export function grouperCanaux(canaux: LigneCanal[]): GroupeCanal[] {
  const par = new Map<string, GroupeCanal>();
  // Une meme reference peut occuper plusieurs canaux : sa reserve ne doit etre
  // comptee qu'une fois dans le total de la categorie.
  const vus = new Map<string, Set<number>>();

  for (const c of canaux) {
    const cle = String(c.categorie_id ?? "sans");
    let g = par.get(cle);
    if (!g) {
      g = { id: c.categorie_id, nom: c.categorie, canaux: [],
            vides: 0, bas: 0, place: 0, reserve: 0 };
      par.set(cle, g);
      vus.set(cle, new Set());
    }
    g.canaux.push(c);
    if (c.quantite === 0) g.vides++;
    else if (c.quantite <= c.seuil_bas) g.bas++;
    g.place += Math.max(0, c.capacite - c.quantite - c.en_route);
    if (c.produit_id !== null && !vus.get(cle)!.has(c.produit_id)) {
      vus.get(cle)!.add(c.produit_id);
      g.reserve += c.reserve;
    }
  }
  return [...par.values()].sort((a, b) => {
    const oa = a.canaux[0]?.ordre ?? 999, ob = b.canaux[0]?.ordre ?? 999;
    return oa - ob || a.nom.localeCompare(b.nom);
  });
}
