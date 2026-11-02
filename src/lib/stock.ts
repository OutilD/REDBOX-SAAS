import { q } from "@/db";
import { jointurePrix } from "./prix";

/**
 * Les lectures du stock des bornes. Chaque canal tient son compteur, et le
 * logiciel ne suit plus la marchandise avant qu'elle n'entre dans une machine.
 */

/** Le stock d'une borne, canal par canal, avec ce qui est en route vers elle. */
export type LigneCanal = {
  canal_id: number; lane: number; rangee: number; colonne: number;
  produit_id: number | null; sku: string | null; nom: string | null;
  categorie_id: number | null; categorie: string; ordre: number;
  /** L'image du produit — photo, sinon pictogramme de la borne. */
  image: number | null; icone: string | null;
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
  releve_le: Date | null; en_route: number;
};

export async function canauxDe(borne_id: number, compte_id: number): Promise<LigneCanal[]> {
  return q<LigneCanal>(`
    SELECT c.id AS canal_id, c.lane, c.rangee, c.colonne, c.produit_id,
           p.sku, p.nom, p.prix_vente_c, p.image_id AS image, p.icone,
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
                        AND m.confirme_le IS NULL AND m.annule_le IS NULL), 0)::int AS en_route
      FROM canal c
      JOIN borne b ON b.id = c.borne_id
      LEFT JOIN produit p     ON p.id = c.produit_id
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
      ${jointurePrix("$1")}
     WHERE c.borne_id = $1 AND b.compte_id = $2
     ORDER BY c.lane`, [borne_id, compte_id]);
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
  vides: number; bas: number; place: number;
};

export function grouperCanaux(canaux: LigneCanal[]): GroupeCanal[] {
  const par = new Map<string, GroupeCanal>();
  for (const c of canaux) {
    const cle = String(c.categorie_id ?? "sans");
    let g = par.get(cle);
    if (!g) {
      g = { id: c.categorie_id, nom: c.categorie, canaux: [],
            vides: 0, bas: 0, place: 0 };
      par.set(cle, g);
    }
    g.canaux.push(c);
    if (c.quantite === 0) g.vides++;
    else if (c.quantite <= c.seuil_bas) g.bas++;
    g.place += Math.max(0, c.capacite - c.quantite - c.en_route);
  }
  return [...par.values()].sort((a, b) => {
    const oa = a.canaux[0]?.ordre ?? 999, ob = b.canaux[0]?.ordre ?? 999;
    return oa - ob || a.nom.localeCompare(b.nom);
  });
}
