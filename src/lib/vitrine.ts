import { q1, transaction, euros, type PgClient } from "@/db";
import { reserveDe } from "./stock";
import { laneDe } from "./machine";
import { slug } from "./salons";
import { A_REGARDER } from "./ventes";
import {
  PREFIXE_JETON, PREFIXE_VITRINE, SAV_TEL, SAV_TEXTE, catalogueModele,
  aParis, deParis, commande, graine, statutAuSort, journalDe, ecrireJournal, insererVentes,
  recompterCanaux, semerBornes, semerCatalogue, semerPub, viderDemo,
  type LigneJ, type MachineSemee, type Vente,
} from "./demo";

/**
 * LE COMPTE VITRINE.
 *
 * Celui qu'on ouvre devant un prospect. Il ressemble en tout a un compte
 * d'exploitant : pas de bandeau, pas de « démo » a cote du nom, des bornes en
 * ligne, des ventes, une reserve, un journal. La difference est ailleurs : son
 * histoire est INVENTEE D'APRES UN REGLAGE que le super-admin choisit — « trois
 * mille euros sur trois mois, le jeudi, le vendredi et le samedi soir, plus le
 * week-end » — et re-inventee a chaque fois qu'on le change.
 *
 * Comme la demo (`lib/demo.ts`, dont il reprend le catalogue, les bornes, le
 * journal et l'ecran d'accueil), tout y est vrai dans la base : aucune page n'a
 * a savoir ce qu'elle montre. Ses bornes portent un jeton `vitrine_` qu'aucune
 * machine ne presentera ; la plateforme l'ecarte de ses chiffres (`compte.vitrine`).
 *
 * Ce qui change par rapport a la demo :
 *  - le chiffre d'affaires est celui qu'on a demande, a quelques euros pres ;
 *  - les ventes tombent seulement les soirs choisis, et le poids de chaque
 *    soir dit lequel vend le plus ;
 *  - les bornes ne vendent pas toutes seules entre deux visites : le chiffre
 *    montre doit rester celui qu'on a regle. Elles restent en ligne et
 *    confirment les chargements (`animerDemo`) ;
 *  - aucune machine fermee, aucune personne inventee dans l'equipe : on
 *    montre un exploitant qui tourne bien.
 */

/** Ce qu'on regle depuis /admin/vitrine. */
export type Reglage = {
  /** Le chiffre d'affaires distribue sur toute la periode, en euros. */
  ca: number;
  /** La periode, en mois, qui finit aujourd'hui. */
  mois: number;
  /** Le poids de chaque soir, dimanche d'abord (comme `getDay`). 0 : on ne vend pas. */
  poids: number[];
  /** L'heure d'ouverture, et celle de fermeture (exclue) — plus petite : apres minuit. */
  debut: number; fin: number;
  /** Combien de RedBox, de 1 a `MAX_BORNES`. */
  bornes: number;
  /** De combien le dernier soir pese de plus que le premier, en pour cent. */
  progression: number;
};

export const JOURS_SEMAINE = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/** Jeudi, vendredi et samedi soir ; le vendredi et le samedi vendent davantage. */
export const REGLAGE_DEFAUT: Reglage = {
  ca: 3000, mois: 3, poids: [0, 0, 0, 0, 1, 1.6, 1.9], debut: 19, fin: 2, bornes: 1, progression: 15,
};

/**
 * Les emplacements, dans l'ordre ou on les ajoute. `part` : ce que chacun vend,
 * relativement — un parc a toujours son meilleur emplacement, et d'autres qui
 * suivent. Des noms de bar ordinaires, dans des villes ou un prospect se
 * reconnait.
 */
const EMPLACEMENTS: (MachineSemee & { part: number })[] = [
  { nom: "RedBox — Le Duplex", adresse: "Paris 11e", lat: 48.859, lng: 2.380, ville: "Paris", part: 1,
    description: "Au fond à gauche, derrière le flipper. Le patron ouvre à 17 h." },
  { nom: "RedBox — Le Sous-Marin", adresse: "Montreuil", lat: 48.861, lng: 2.443, ville: "Montreuil", part: 0.6,
    description: "Dans le couloir des toilettes. Prise derrière le comptoir." },
  { nom: "RedBox — Chez Marcel", adresse: "Lyon 7e", lat: 45.745, lng: 4.842, ville: "Lyon", part: 0.45,
    description: "À droite de l’entrée. Fermé le lundi." },
  { nom: "RedBox — Le Comptoir", adresse: "Paris 18e", lat: 48.892, lng: 2.345, ville: "Paris", part: 0.85,
    description: "Près du vestiaire, à côté du distributeur de billets." },
  { nom: "RedBox — La Cale", adresse: "Bordeaux", lat: 44.848, lng: -0.570, ville: "Bordeaux", part: 0.7,
    description: "En bas de l’escalier, face au bar." },
  { nom: "RedBox — L’Entrepôt", adresse: "Lille", lat: 50.633, lng: 3.060, ville: "Lille", part: 0.9,
    description: "Dans le couloir entre la piste et les toilettes." },
  { nom: "RedBox — Le Phare", adresse: "Marseille 6e", lat: 43.290, lng: 5.380, ville: "Marseille", part: 0.75,
    description: "Sous l’écran géant, prise au pied du mur." },
  { nom: "RedBox — La Guinguette", adresse: "Nantes", lat: 47.213, lng: -1.556, ville: "Nantes", part: 0.5,
    description: "Sous l’auvent, à l’abri de la pluie." },
  { nom: "RedBox — Le Zinc", adresse: "Toulouse", lat: 43.604, lng: 1.444, ville: "Toulouse", part: 0.65,
    description: "À gauche du comptoir, visible depuis la terrasse." },
  { nom: "RedBox — Le Hangar", adresse: "Strasbourg", lat: 48.580, lng: 7.750, ville: "Strasbourg", part: 0.55,
    description: "Près de la sortie de secours, bien éclairé." },
  { nom: "RedBox — Le Belvédère", adresse: "Nice", lat: 43.700, lng: 7.268, ville: "Nice", part: 0.6,
    description: "Dans le hall, entre les deux salles." },
  { nom: "RedBox — Le Tonneau", adresse: "Montpellier", lat: 43.611, lng: 3.877, ville: "Montpellier", part: 0.5,
    description: "Contre le pilier, face aux toilettes." },
  { nom: "RedBox — La Péniche", adresse: "Paris 13e", lat: 48.835, lng: 2.377, ville: "Paris", part: 0.8,
    description: "Sur le pont, à côté du vestiaire." },
  { nom: "RedBox — Le Refuge", adresse: "Grenoble", lat: 45.188, lng: 5.724, ville: "Grenoble", part: 0.45,
    description: "Dans l’entrée, sous le panneau des concerts." },
  { nom: "RedBox — L’Atelier", adresse: "Rennes", lat: 48.111, lng: -1.680, ville: "Rennes", part: 0.55,
    description: "Au fond de la salle, près du baby-foot." },
  { nom: "RedBox — Le Kiosque", adresse: "Villeurbanne", lat: 45.771, lng: 4.880, ville: "Villeurbanne", part: 0.4,
    description: "Derrière la porte d’entrée, côté fumoir." },
  { nom: "RedBox — La Réserve", adresse: "Reims", lat: 49.258, lng: 4.032, ville: "Reims", part: 0.45,
    description: "Face au bar, à côté du juke-box." },
  { nom: "RedBox — Le Quai", adresse: "Rouen", lat: 49.443, lng: 1.099, ville: "Rouen", part: 0.5,
    description: "Dans le couloir des toilettes, prise au plafond." },
  { nom: "RedBox — Le Carré", adresse: "Dijon", lat: 47.322, lng: 5.041, ville: "Dijon", part: 0.4,
    description: "En haut de l’escalier, sur le palier." },
  { nom: "RedBox — La Forge", adresse: "Saint-Étienne", lat: 45.439, lng: 4.387, ville: "Saint-Étienne", part: 0.4,
    description: "À droite de la scène, derrière la barrière." },
];

export const MAX_BORNES = EMPLACEMENTS.length;

/** Ce que chaque emplacement vend, relativement, dans l'ordre : l'apercu du reglage en a besoin. */
export const PARTS = EMPLACEMENTS.map((e) => e.part);

const borner = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** Un reglage lu en base, complete de ce qui manque. */
export function reglageDe(brut: unknown): Reglage {
  const r = { ...REGLAGE_DEFAUT, ...(brut && typeof brut === "object" ? brut as Partial<Reglage> : {}) };
  const poids = Array.isArray(r.poids) && r.poids.length === 7 ? r.poids.map((x) => borner(Number(x) || 0, 0, 10))
                                                                : REGLAGE_DEFAUT.poids;
  return {
    ca: borner(Number(r.ca) || 0, 0, 10_000_000), mois: borner(Math.round(Number(r.mois)) || 1, 1, 24),
    poids, debut: borner(Math.round(Number(r.debut)) || 0, 0, 23), fin: borner(Math.round(Number(r.fin)) || 0, 0, 23),
    bornes: borner(Math.round(Number(r.bornes)) || 1, 1, MAX_BORNES),
    progression: borner(Number(r.progression) || 0, -90, 500),
  };
}

/** Le reglage d'un formulaire, ou la raison pour laquelle il ne tient pas. */
export function reglageDuFormulaire(f: FormData): Reglage | string {
  const n = (cle: string) => Number(String(f.get(cle) ?? "").replace(",", ".").replace(/\s/g, ""));
  const r = reglageDe({
    ca: n("ca"), mois: n("mois"), debut: n("debut"), fin: n("fin"), bornes: n("bornes"),
    progression: n("progression"), poids: JOURS_SEMAINE.map((_, i) => n(`poids_${i}`)),
  });
  if (!(r.ca > 0)) return "ca";
  if (r.poids.every((p) => p === 0)) return "jours";
  return r;
}

/** Les heures d'ouverture d'un soir, et si elles tombent le lendemain. */
function heuresDe(r: Reglage): { h: number; lendemain: boolean; poids: number }[] {
  const out: { h: number; lendemain: boolean; poids: number }[] = [];
  let h = r.debut, lendemain = false;
  do {
    out.push({ h, lendemain, poids: 0 });
    h = (h + 1) % 24;
    if (h === 0) lendemain = true;
  } while (h !== r.fin && out.length < 24);
  // Le monde arrive doucement, culmine aux deux tiers de la soiree, puis repart.
  out.forEach((x, i) => {
    const t = (i + 0.5) / out.length;
    x.poids = 0.35 + (t < 0.65 ? t / 0.65 : (1 - t) / 0.35);
  });
  return out;
}

/** Une date du calendrier, decalee de `n` jours, en morceaux. */
function jourPlus(a: number, m: number, j: number, n: number): { a: number; m: number; j: number; dow: number } {
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, j: d.getUTCDate(), dow: d.getUTCDay() };
}

// ------------------------------------------------------------------- droits

/**
 * Un compte peut-il devenir la vitrine ? Pas celui de l'editeur, pas un compte
 * qui porte une vraie machine — le vider l'effacerait —, et pas si une autre
 * vitrine existe deja. Rend la raison du refus, ou rien.
 */
export async function refusVitrine(compte_id: number, c?: PgClient): Promise<string | null> {
  const sql = `
    SELECT k.editeur, k.vitrine,
           EXISTS (SELECT 1 FROM compte x WHERE x.vitrine AND x.id <> k.id) AS autre,
           (SELECT COUNT(*)::int FROM borne b WHERE b.compte_id = k.id
             AND (b.jeton IS NULL OR (b.jeton NOT LIKE '${PREFIXE_JETON}%' AND b.jeton NOT LIKE '${PREFIXE_VITRINE}%'))) AS vraies
      FROM compte k WHERE k.id = $1`;
  const k = c ? (await c.query<{ editeur: boolean; vitrine: boolean; autre: boolean; vraies: number }>(sql, [compte_id])).rows[0]
              : await q1<{ editeur: boolean; vitrine: boolean; autre: boolean; vraies: number }>(sql, [compte_id]);
  if (!k) return "compte";
  if (k.editeur) return "editeur";
  if (k.vraies > 0) return "machines";
  if (k.autre) return "autre";
  return null;
}

// -------------------------------------------------------------------- semis

export type Resultat = { ca_c: number; ventes: number; manque_c: number };

/**
 * FAIT DU COMPTE LA VITRINE, OU LA REINVENTE : tout ce qu'il contenait est
 * efface (`viderDemo`), puis le catalogue, les bornes et l'histoire renaissent
 * d'apres le reglage. Le compte et ses membres restent. Une seule transaction :
 * si quoi que ce soit echoue, la vitrine d'avant reste en place.
 */
export async function appliquerVitrine(compte_id: number, r: Reglage, par: string): Promise<Resultat> {
  return transaction(async (c) => {
    const refus = await refusVitrine(compte_id, c);
    if (refus) throw new Error(`vitrine refusee : ${refus}`);
    await viderDemo(c, compte_id);
    const res = await semerVitrine(c, compte_id, r, par);
    await c.query(`
      UPDATE compte SET demo = false, demo_vie = now(), vitrine = true, vitrine_reglage = $2::jsonb, vitrine_le = now(),
             sav_tel = COALESCE(sav_tel, $3), sav_texte = COALESCE(sav_texte, $4)
       WHERE id = $1`, [compte_id, JSON.stringify(r), SAV_TEL, SAV_TEXTE]);
    return res;
  });
}

/** Rend le compte ordinaire, et vide : on ne garde pas des ventes inventees. */
export async function quitterVitrine(compte_id: number): Promise<void> {
  await transaction(async (c) => {
    const k = (await c.query<{ vitrine: boolean }>("SELECT vitrine FROM compte WHERE id = $1 FOR UPDATE", [compte_id])).rows[0];
    if (!k?.vitrine) return;
    await viderDemo(c, compte_id);
    await c.query(`UPDATE compte SET vitrine = false, vitrine_reglage = NULL, vitrine_le = NULL, demo_vie = NULL
                    WHERE id = $1`, [compte_id]);
  });
}

async function semerVitrine(c: PgClient, compte_id: number, r: Reglage, par: string): Promise<Resultat> {
  const tir = graine(compte_id);
  const reserve = await reserveDe(compte_id, c);
  // Le catalogue du compte modele (lib/demo.ts) : ce qu'on vend vraiment.
  const cat = await catalogueModele(c);
  const PRODUITS = cat.produits;
  const PLAN = cat.plan;
  const pid = await semerCatalogue(c, compte_id, cat);
  const prixDe = new Map(PRODUITS.map((p) => [p.sku, p.prix]));
  const ageDe = new Map(PRODUITS.map((p) => [p.sku, p.age]));
  const achatDe = new Map(PRODUITS.map((p) => [p.sku, p.achat]));

  // --- Le calendrier : du meme jour, `mois` mois plus tot, a aujourd'hui.
  const maintenant = Date.now();
  const auj = aParis(new Date(maintenant));
  const premier = jourPlus(auj.a, auj.m - r.mois, auj.j, 0);
  const nbJours = Math.round((Date.UTC(auj.a, auj.m - 1, auj.j) - Date.UTC(premier.a, premier.m - 1, premier.j)) / 86400e3);
  const heures = heuresDe(r);
  const instantDe = (d: { a: number; m: number; j: number }, h: number, lendemain: boolean, mi = 0, s = 0) => {
    const x = jourPlus(d.a, d.m, d.j, lendemain ? 1 : 0);
    return deParis(x.a, x.m, x.j, h, mi, s);
  };

  // --- Les soirs, et ce que chacun doit rapporter. Un soir commence n'a droit
  // qu'a la part des heures deja passees : le chiffre est tout entier derriere nous.
  type Soir = { jour: { a: number; m: number; j: number }; poids: number;
                heures: { debut: number; fin: number; poids: number }[] };
  const soirs: Soir[] = [];
  for (let n = 0; n <= nbJours; n++) {
    const d = jourPlus(premier.a, premier.m, premier.j, n);
    const p = r.poids[d.dow];
    if (!(p > 0)) continue;
    const hs = heures.map((h) => {
      const debut = instantDe(d, h.h, h.lendemain).getTime();
      const passe = borner((maintenant - debut) / 3600e3, 0, 1);
      return { debut, fin: debut + passe * 3600e3, poids: h.poids * passe };
    }).filter((h) => h.poids > 0);
    if (hs.length === 0) continue;
    const entame = hs.reduce((s, h) => s + h.poids, 0) / heures.reduce((s, h) => s + h.poids, 0);
    const tendance = 1 + (r.progression / 100) * (nbJours > 0 ? n / nbJours : 1);
    soirs.push({ jour: d, heures: hs, poids: p * Math.max(0.05, tendance) * (0.8 + 0.4 * tir()) * entame });
  }
  const total = soirs.reduce((s, x) => s + x.poids, 0);
  const cible = Math.round(r.ca * 100);

  // --- Les bornes, appairees quelques jours avant le premier soir.
  const emplacements = EMPLACEMENTS.slice(0, r.bornes);
  const bornes = (await semerBornes(c, compte_id, emplacements, {
    prefixe: PREFIXE_VITRINE, appairee_le: instantDe(jourPlus(premier.a, premier.m, premier.j, -3), 11, false),
    serie: (i) => `RBX-${String(compte_id).padStart(3, "0")}-${String(i + 1).padStart(2, "0")}`, tir, plan: PLAN,
  })).map((b, i) => ({ ...b, part: emplacements[i].part, restant: new Map<number, number>(), report: 0 }));
  const partTotale = bornes.reduce((s, b) => s + b.part, 0);

  // --- La reserve : une premiere livraison, puis ce qu'il faut quand il le faut.
  const enReserve = new Map(PRODUITS.map((p) => [p.sku, p.achete]));
  const receptions: { sku: string; n: number; quand: Date; ref: string }[] = PRODUITS.map((p) => ({
    sku: p.sku, n: p.achete, ref: `BL-${premier.a}-0001`,
    quand: instantDe(jourPlus(premier.a, premier.m, premier.j, -4), 10, false, 15),
  }));
  const carton = (sku: string) => Math.max(20, Math.ceil((PRODUITS.find((p) => p.sku === sku)!.achete / 3) / 10) * 10);
  const transferts: { produit: number; quantite: number; lane: number; quand: Date; lieu: number }[] = [];
  const ventes: Vente[] = [];
  const journal: LigneJ[] = [];
  const commandes = new Set<string>();
  const dernierSoir = new Map<number, { quand: Date; ventes: { nom: string; prix: number }[] }>();
  const heureTournee = borner(r.debut - 2, 8, 18);
  const recent = maintenant - 5 * 86400e3;
  let ca = 0, manque = 0;

  for (const soir of soirs) {
    const budget = (cible * soir.poids) / total;
    const tournee = instantDe(soir.jour, heureTournee, false, 30);
    const livraison = instantDe(soir.jour, 10, false, 15);
    for (const b of bornes) {
      // La tournee de l'apres-midi, si une spire est a moitie vide.
      if (PLAN.some((s) => (b.restant.get(laneDe(s.rangee, s.colonne)) ?? 0) <= s.capacite / 2)) {
        for (const s of PLAN) {
          const lane = laneDe(s.rangee, s.colonne);
          const manquant = s.capacite - (b.restant.get(lane) ?? 0);
          if (manquant <= 0) continue;
          if (enReserve.get(s.sku)! < manquant) {
            const n = Math.ceil((manquant - enReserve.get(s.sku)! + carton(s.sku)) / 10) * 10;
            enReserve.set(s.sku, enReserve.get(s.sku)! + n);
            const mmjj = `${String(soir.jour.m).padStart(2, "0")}${String(soir.jour.j).padStart(2, "0")}`;
            receptions.push({ sku: s.sku, n, quand: livraison, ref: `BL-${soir.jour.a}-${mmjj}` });
          }
          enReserve.set(s.sku, enReserve.get(s.sku)! - manquant);
          b.restant.set(lane, s.capacite);
          transferts.push({ produit: pid.get(s.sku)!, quantite: manquant, lane, quand: tournee, lieu: b.lieu });
        }
      }

      // La soiree : des ventes jusqu'a ce que la part de cette borne soit faite.
      // Ce qui reste en dessous du prix d'un article passe au soir suivant.
      const part = (budget * b.part) / partTotale;
      const objectif = part + b.report;
      let fait = 0;
      const siennes: { nom: string; prix: number }[] = [];
      let derniere = 0;
      for (let garde = 0; garde < 5000; garde++) {
        const reste = objectif - fait;
        const dispo = PLAN.filter((s) => (b.restant.get(laneDe(s.rangee, s.colonne)) ?? 0) > 0
                                         && prixDe.get(s.sku)! <= reste + 50);
        if (dispo.length === 0) break;
        const s = dispo[Math.floor(tir() * dispo.length)];
        const lane = laneDe(s.rangee, s.colonne);
        const prix = prixDe.get(s.sku)!;
        const statut = statutAuSort(tir, ageDe.get(s.sku)!);
        // L'heure, tiree selon l'affluence de la soiree.
        let u = tir() * soir.heures.reduce((x, h) => x + h.poids, 0);
        const h = soir.heures.find((x) => (u -= x.poids) <= 0) ?? soir.heures[soir.heures.length - 1];
        const quand = new Date(h.debut + tir() * (h.fin - h.debut));
        const aRegarder = (A_REGARDER as readonly string[]).includes(statut);
        const avantSpirale = !aRegarder && statut !== "distribue";
        if (statut === "distribue") {
          b.restant.set(lane, b.restant.get(lane)! - 1);
          fait += prix;
          siennes.push({ nom: PRODUITS.find((p) => p.sku === s.sku)!.nom, prix });
        }
        const traite = aRegarder && quand.getTime() < recent ? new Date(quand.getTime() + 20 * 3600e3) : null;
        // Un numero deja pris ferait ecarter la vente a l'insertion : on en tire un autre.
        let cmd = commande(tir);
        while (commandes.has(cmd)) cmd = commande(tir);
        commandes.add(cmd);
        ventes.push({
          borne: b.id, cmd, article: 0, lane: avantSpirale ? null : lane, produit: pid.get(s.sku)!,
          prix, statut, quand, traite,
          note: !traite ? null : statut === "litige" ? "Remboursé chez votre processeur de paiement"
                                                     : "Remboursement confirmé par le terminal",
        });
        if (b === bornes[0] && quand.getTime() >= recent) {
          journal.push(...journalDe(b.id, cmd, quand, s.sku, avantSpirale ? null : lane, prix, statut));
        }
        derniere = Math.max(derniere, quand.getTime());
      }
      // Toutes les spires vides avant la fin : ce qui manque ne se rattrape pas.
      const vides = PLAN.every((s) => (b.restant.get(laneDe(s.rangee, s.colonne)) ?? 0) === 0);
      if (vides) manque += Math.max(0, objectif - fait);
      b.report = vides ? 0 : objectif - fait;
      ca += fait;
      if (siennes.length > 0) dernierSoir.set(b.id, { quand: new Date(derniere + 7 * 60e3), ventes: siennes });
    }
  }

  // --- Tout en base, par lots.
  receptions.sort((x, z) => x.quand.getTime() - z.quand.getTime());
  await c.query(`
    INSERT INTO mouvement (compte_id, produit_id, vers_lieu_id, quantite, motif,
                           prix_achat_c, reference, par, fait_le, confirme_le)
    SELECT $1, r.produit, $2, r.n, 'reception', r.achat, r.ref, $3, r.quand, r.quand
      FROM unnest($4::bigint[], $5::int[], $6::int[], $7::text[], $8::timestamptz[])
           AS r(produit, n, achat, ref, quand)`,
    [compte_id, reserve, par,
     receptions.map((x) => pid.get(x.sku)!), receptions.map((x) => x.n),
     receptions.map((x) => achatDe.get(x.sku)!), receptions.map((x) => x.ref), receptions.map((x) => x.quand)]);
  if (transferts.length > 0) {
    await c.query(`
      INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, vers_lieu_id, quantite,
                             motif, lane, par, fait_le, confirme_le)
      SELECT $1, t.produit, $2, t.lieu, t.quantite, 'transfert', t.lane, $3, t.quand, t.quand
        FROM unnest($4::bigint[], $5::int[], $6::int[], $7::timestamptz[], $8::bigint[])
             AS t(produit, quantite, lane, quand, lieu)`,
      [compte_id, reserve, par,
       transferts.map((t) => t.produit), transferts.map((t) => t.quantite),
       transferts.map((t) => t.lane), transferts.map((t) => t.quand), transferts.map((t) => t.lieu)]);
  }
  ventes.sort((x, z) => x.quand.getTime() - z.quand.getTime());
  await insererVentes(c, compte_id, ventes, par);
  await ecrireJournal(c, journal);
  await recompterCanaux(c, compte_id);
  await semerPub(c, compte_id, bornes[0].id);
  await semerSalons(c, compte_id, bornes.map((b, i) => ({ id: b.id, nom: emplacements[i].nom, soir: dernierSoir.get(b.id) })));

  return { ca_c: ca, ventes: ventes.filter((v) => v.statut === "distribue").length, manque_c: Math.round(manque) };
}

/**
 * « general », et un salon par borne ou la machine a ecrit le bilan de sa
 * derniere soiree — le vrai, calcule sur les ventes qu'on vient d'inventer.
 */
async function semerSalons(c: PgClient, compte_id: number,
                           bornes: { id: number; nom: string; soir?: { quand: Date; ventes: { nom: string; prix: number }[] } }[]): Promise<void> {
  const salons = (await c.query<{ id: number; borne_id: number | null }>(`
    INSERT INTO salon (compte_id, nom, sujet, borne_id, ordre)
    SELECT $1, s.nom, s.sujet, s.borne, s.ordre
      FROM unnest($2::text[], $3::text[], $4::bigint[], $5::int[]) AS s(nom, sujet, borne, ordre)
    ON CONFLICT (compte_id, nom) DO NOTHING
    RETURNING id, borne_id`,
    [compte_id,
     ["general", ...bornes.map((b) => slug(b.nom))],
     ["Toute l’équipe, pour tout le reste", ...bornes.map((b) => `Ce que vit ${b.nom}, et ce qu’on en dit`)],
     [null, ...bornes.map((b) => b.id)],
     [0, ...bornes.map(() => 10)]])).rows;

  const courtNom = (n: string) => n.replace(/^\s*redbox\s*[—–-]\s*/i, "").trim();
  const lignes = bornes.flatMap((b) => {
    const salon = salons.find((s) => Number(s.borne_id) === Number(b.id));
    if (!salon || !b.soir) return [];
    const parNom = new Map<string, number>();
    for (const v of b.soir.ventes) parNom.set(v.nom, (parNom.get(v.nom) ?? 0) + 1);
    const noms = [...parNom.entries()].sort((x, z) => z[1] - x[1]).map(([n]) => n);
    const somme = b.soir.ventes.reduce((s, v) => s + v.prix, 0);
    const n = b.soir.ventes.length;
    const liste = noms.length > 4 ? `${noms.slice(0, 4).join(", ")} et ${noms.length - 4} autre${noms.length - 4 > 1 ? "s" : ""}`
                                  : noms.join(", ");
    return [{ salon: salon.id, quand: b.soir.quand,
              texte: `${courtNom(b.nom)} · ${n} vente${n > 1 ? "s" : ""} · ${euros(somme)}\n${liste}` }];
  });
  if (lignes.length === 0) return;
  await c.query(`
    INSERT INTO message (salon_id, utilisateur_id, texte, cree_le)
    SELECT m.salon, NULL, m.texte, m.quand
      FROM unnest($1::bigint[], $2::text[], $3::timestamptz[]) AS m(salon, texte, quand)`,
    [lignes.map((l) => l.salon), lignes.map((l) => l.texte), lignes.map((l) => l.quand)]);
}
