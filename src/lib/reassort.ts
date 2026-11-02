import { codeCanal, q } from "@/db";
import { canauxDe } from "./stock";

/**
 * LA FICHE DE REASSORT.
 *
 * Le document qu'on emporte : ce qu'on charge dans le camion, puis borne par
 * borne, quel produit va dans quel canal et combien on en pose.
 *
 * Chaque canal demande ce qu'il faut pour faire le plein. On soustrait ce qui est
 * deja EN ROUTE : la marchandise saisie mais que la machine n'a pas encore
 * confirmee est comptee comme arrivee, sinon le meme carton serait charge deux
 * fois.
 */

export type LigneFiche = {
  lane: number; code: string;
  produit_id: number; sku: string; nom: string;
  categorie: string; ordre: number;
  quantite: number; capacite: number; en_route: number; seuil_bas: number;
  aMettre: number;
};

export type GroupeFiche = { nom: string; ordre: number; lignes: LigneFiche[]; total: number };

export type BorneFiche = {
  id: number; nom: string; adresse: string | null;
  groupes: GroupeFiche[];
  total: number; vides: number; sousSeuil: number;
};

export type LigneCamion = {
  produit_id: number; sku: string; nom: string; categorie: string; ordre: number;
  aPrendre: number;
};

export type Fiche = {
  bornes: BorneFiche[];
  camion: LigneCamion[];
  total: number;      // unites a charger
};

export async function planifier(compte_id: number, borne_ids: number[]): Promise<Fiche> {
  // On ne fait confiance qu'aux bornes du compte : un identifiant glisse dans
  // l'URL ne doit pas faire apparaitre la tournee du voisin.
  const identites = await q<{ id: number; nom: string; adresse: string | null }>(
    `SELECT id, nom, adresse FROM borne
      WHERE compte_id = $1 AND id = ANY($2::bigint[]) ORDER BY nom`,
    [compte_id, borne_ids]);

  const nommees = await Promise.all(
    identites.map(async (b) => ({ ...b, canaux: await canauxDe(b.id, compte_id) })));

  const parProduit = new Map<number, LigneCamion>();
  const bornes: BorneFiche[] = [];

  for (const { id, nom, adresse, canaux } of nommees) {
    // La fiche par borne, groupee par categorie — on remplit un carton a la fois,
    // pas en marchant le long des rangees. Un canal sans produit affecte n'a pas
    // de besoin, et un canal plein ne figure pas : rien a y faire.
    const groupes = new Map<string, GroupeFiche>();
    for (const c of canaux) {
      if (c.produit_id === null) continue;
      const aMettre = Math.max(0, c.capacite - c.quantite - c.en_route);
      if (aMettre === 0) continue;

      const g = groupes.get(c.categorie)
        ?? groupes.set(c.categorie, { nom: c.categorie, ordre: c.ordre, lignes: [], total: 0 })
                 .get(c.categorie)!;
      g.lignes.push({
        lane: c.lane, code: codeCanal(c.rangee, c.colonne),
        produit_id: c.produit_id, sku: c.sku!, nom: c.nom!,
        categorie: c.categorie, ordre: c.ordre,
        quantite: c.quantite, capacite: c.capacite, en_route: c.en_route,
        seuil_bas: c.seuil_bas, aMettre,
      });
      g.total += aMettre;

      // Le camion : le total par produit, toutes bornes confondues.
      const l = parProduit.get(c.produit_id)
        ?? parProduit.set(c.produit_id, {
             produit_id: c.produit_id, sku: c.sku!, nom: c.nom!,
             categorie: c.categorie, ordre: c.ordre, aPrendre: 0,
           }).get(c.produit_id)!;
      l.aPrendre += aMettre;
    }
    const liste = [...groupes.values()].sort((a, z) => a.ordre - z.ordre || a.nom.localeCompare(z.nom, "fr"));
    for (const g of liste) g.lignes.sort((a, z) => a.lane - z.lane);
    bornes.push({
      id, nom, adresse, groupes: liste,
      total: liste.reduce((s, g) => s + g.total, 0),
      vides: canaux.filter((c) => c.produit_id !== null && c.quantite + c.en_route === 0).length,
      sousSeuil: canaux.filter((c) =>
        c.produit_id !== null && c.quantite + c.en_route > 0
        && c.quantite + c.en_route <= c.seuil_bas).length,
    });
  }

  const camion = [...parProduit.values()]
    .sort((a, z) => a.ordre - z.ordre || a.nom.localeCompare(z.nom, "fr"));

  return { bornes, camion, total: camion.reduce((s, l) => s + l.aPrendre, 0) };
}
