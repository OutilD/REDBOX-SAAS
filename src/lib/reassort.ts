import { codeCanal, q } from "@/db";
import { canauxDe, stockParProduit, type LigneCanal } from "./stock";

/**
 * LA FICHE DE REASSORT.
 *
 * Le document qu'on emporte : ce qu'on charge dans le camion, puis borne par
 * borne, quel produit va dans quel canal et combien on en pose.
 *
 * Une regle gouverne tout le calcul : ON N'ECRIT JAMAIS UN CHIFFRE QU'ON NE PEUT
 * PAS SERVIR. Une fiche qui reclame vingt Puffs quand il en reste huit en reserve
 * envoie quelqu'un se cogner a un carton vide, et lui fait perdre sa tournee. On
 * plafonne donc chaque ligne par la reserve reelle, et ce qui manque est dit a
 * part — c'est une commande a passer, pas une consigne de reassort.
 *
 * Quand la reserve ne suffit pas pour tout le monde, LES CANAUX LES PLUS VIDES
 * PASSENT D'ABORD : un canal a zero ne vend rien, un canal a moitie plein vend
 * encore. Servir dans l'ordre des rangees repartirait la penurie sur les canaux
 * qui n'en avaient pas besoin.
 *
 * On soustrait aussi ce qui est deja EN ROUTE. La marchandise partie de la
 * reserve mais que la machine n'a pas encore confirmee est comptee comme arrivee :
 * sans cela, le meme carton serait charge deux fois.
 */

export type LigneFiche = {
  lane: number; code: string;
  produit_id: number; sku: string; nom: string;
  categorie: string; ordre: number;
  quantite: number; capacite: number; en_route: number; seuil_bas: number;
  souhaite: number;   // ce qu'il faudrait pour faire le plein
  aMettre: number;    // ce qu'on pose vraiment, reserve deduite
};

export type GroupeFiche = { nom: string; ordre: number; lignes: LigneFiche[]; total: number };

export type BorneFiche = {
  id: number; nom: string; adresse: string | null;
  groupes: GroupeFiche[];
  total: number; vides: number; sousSeuil: number;
};

export type LigneCamion = {
  produit_id: number; sku: string; nom: string; categorie: string; ordre: number;
  aPrendre: number; reserve: number; souhaite: number; manque: number;
};

export type Fiche = {
  bornes: BorneFiche[];
  camion: LigneCamion[];
  total: number;      // unites a charger
  manque: number;     // unites souhaitees qu'aucune reserve ne couvre
};

type Besoin = { borne_id: number; canal: LigneCanal; souhaite: number; accorde: number };

export async function planifier(compte_id: number, borne_ids: number[]): Promise<Fiche> {
  const stock = await stockParProduit(compte_id);
  const reserve = new Map(stock.map((s) => [s.id, s.reserve]));

  // On ne fait confiance qu'aux bornes du compte : un identifiant glisse dans
  // l'URL ne doit pas faire apparaitre la tournee du voisin.
  const identites = await q<{ id: number; nom: string; adresse: string | null }>(
    `SELECT id, nom, adresse FROM borne
      WHERE compte_id = $1 AND id = ANY($2::bigint[]) ORDER BY nom`,
    [compte_id, borne_ids]);

  const nommees = await Promise.all(
    identites.map(async (b) => ({ ...b, canaux: await canauxDe(b.id, compte_id) })));

  // 1. Le besoin brut, canal par canal. Un canal sans produit affecte n'a pas de
  //    besoin : on ne devine pas ce qu'on y mettrait.
  const besoins: Besoin[] = [];
  for (const { id, canaux } of nommees) {
    for (const c of canaux) {
      if (c.produit_id === null) continue;
      const souhaite = Math.max(0, c.capacite - c.quantite - c.en_route);
      if (souhaite > 0) besoins.push({ borne_id: id, canal: c, souhaite, accorde: 0 });
    }
  }

  // 2. Le partage, produit par produit. Les plus vides d'abord.
  const parProduit = new Map<number, Besoin[]>();
  for (const b of besoins) {
    const k = b.canal.produit_id!;
    (parProduit.get(k) ?? parProduit.set(k, []).get(k)!).push(b);
  }
  for (const [produit_id, liste] of parProduit) {
    liste.sort((a, z) =>
      (a.canal.quantite + a.canal.en_route) - (z.canal.quantite + z.canal.en_route)
      || a.canal.lane - z.canal.lane);
    let reste = reserve.get(produit_id) ?? 0;
    for (const b of liste) {
      b.accorde = Math.min(b.souhaite, Math.max(0, reste));
      reste -= b.accorde;
    }
  }

  // 3. La fiche par borne, groupee par categorie — on remplit un carton a la
  //    fois, pas en marchant le long des rangees. Meme raisonnement que l'ecran
  //    « charger ». Un canal servi a zero ne figure pas : rien a y faire.
  const bornes: BorneFiche[] = [];
  for (const { id, nom, adresse, canaux } of nommees) {
    const mien = besoins.filter((b) => b.borne_id === id && b.accorde > 0);
    const groupes = new Map<string, GroupeFiche>();
    for (const b of mien) {
      const c = b.canal;
      const g = groupes.get(c.categorie)
        ?? groupes.set(c.categorie, { nom: c.categorie, ordre: c.ordre, lignes: [], total: 0 })
                 .get(c.categorie)!;
      g.lignes.push({
        lane: c.lane, code: codeCanal(c.rangee, c.colonne),
        produit_id: c.produit_id!, sku: c.sku!, nom: c.nom!,
        categorie: c.categorie, ordre: c.ordre,
        quantite: c.quantite, capacite: c.capacite, en_route: c.en_route,
        seuil_bas: c.seuil_bas, souhaite: b.souhaite, aMettre: b.accorde,
      });
      g.total += b.accorde;
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

  // 4. Le camion : le total par produit, toutes bornes confondues. C'est ce
  //    qu'on sort de la reserve avant de partir.
  const camion: LigneCamion[] = [];
  for (const [produit_id, liste] of parProduit) {
    const aPrendre = liste.reduce((s, b) => s + b.accorde, 0);
    const souhaite = liste.reduce((s, b) => s + b.souhaite, 0);
    if (aPrendre === 0 && souhaite === 0) continue;
    const p = liste[0].canal;
    camion.push({
      produit_id, sku: p.sku!, nom: p.nom!, categorie: p.categorie, ordre: p.ordre,
      aPrendre, reserve: reserve.get(produit_id) ?? 0, souhaite,
      manque: Math.max(0, souhaite - aPrendre),
    });
  }
  camion.sort((a, z) => a.ordre - z.ordre || a.nom.localeCompare(z.nom, "fr"));

  return {
    bornes, camion,
    total: camion.reduce((s, l) => s + l.aPrendre, 0),
    manque: camion.reduce((s, l) => s + l.manque, 0),
  };
}
