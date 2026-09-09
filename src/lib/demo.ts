import { createHash, randomBytes } from "node:crypto";
import { q1, transaction, FUSEAU, type PgClient } from "@/db";
import { empreinteDe } from "./borne";
import { IMAGES_DEMO } from "./demo-images";
import { DOMAINE } from "./invente";
import { signaler, type Evenement } from "./notifications";
import { slug } from "./salons";
import { laneDe } from "./machine";
import { reserveDe } from "./stock";
import { A_REGARDER } from "./ventes";

/**
 * LE MODE DEMO.
 *
 * Un compte qui vient de naitre ne contient rien, et une console vide n'apprend
 * rien : pas de borne, pas de vente, un tableau de bord a zero partout, et rien
 * a toucher pour comprendre ce que l'outil fait. Le compte s'ouvre donc sur un
 * parc INVENTE — trois bornes, onze produits, trois semaines de ventes, une
 * reserve, une equipe — que l'on manipule comme s'il etait vrai.
 *
 * Trois regles le gouvernent :
 *
 *  1. TOUT EST DU VRAI DANS LA BASE. Les bornes fictives sont des lignes de
 *     `borne`, les ventes des lignes de `vente`. Aucune page n'a a savoir
 *     qu'elle montre une demonstration : elle lit ce qu'elle lit toujours. Ce
 *     qui distingue une borne fictive, c'est son jeton, qui commence par
 *     `demo_` — un jeton qu'aucune machine ne presentera jamais.
 *
 *  2. LES BORNES FICTIVES VIVENT. Une machine reelle vend, confirme un
 *     chargement, repond au reveil. Les notres font pareil, a chaque fois que
 *     quelqu'un ouvre la console (`animerDemo`) : elles vendent quelques
 *     articles depuis la derniere visite, acquittent les transferts saisis, et
 *     se declarent en ligne. Sans cela, le parc paraitrait mort au bout d'un
 *     quart d'heure et un chargement resterait « en route » pour toujours.
 *
 *  3. ON SORT DE LA DEMO EN EFFACANT TOUT. Rien de ce qui a ete fait dans le
 *     bac a sable ne survit : ce que l'exploitant a cree pendant la demo s'est
 *     mele a ce qu'on a invente, et trier les deux reviendrait a garder des
 *     ventes fausses dans un chiffre d'affaires vrai. Le compte, ses membres et
 *     leurs photos restent ; le reste repart de zero.
 */

/** Ce que porte le jeton d'une borne fictive. `LIKE 'demo\_%'` en SQL. */
export const PREFIXE_JETON = "demo_";
const SQL_FICTIVE = "b.jeton LIKE 'demo\\_%'";

/** Les adresses inventees finissent la : `.invalid` ne se livre jamais. */
export { DOMAINE };

/** La personne inventee dans l'equipe, et l'invitation qui attend. Propres au
 *  compte, pour que deux demos ne se disputent pas la meme adresse. */
const adresseReassort = (compte_id: number) => `sami.reassort.${compte_id}@${DOMAINE}`;
const adresseInvitee  = (compte_id: number) => `lea.martin.${compte_id}@${DOMAINE}`;

const SAV_TEL = "06 12 34 56 78";
const SAV_TEXTE = "Un souci avec la machine ? Appelez-nous";

/** Combien de jours d'histoire on invente a l'ouverture. */
const JOURS = 21;

/**
 * Passe ce delai, un chargement saisi est « arrive » : la borne fictive le
 * confirme. Assez long pour qu'on voie l'etat « en route » exister, assez court
 * pour ne pas croire que la machine a perdu la marchandise.
 */
const CONFIRMATION_S = 90;

/** Entre deux passages des bornes fictives. Une page rendue plus tot ne fait rien. */
const PAUSE_S = 45;

// ------------------------------------------------------------- le catalogue

const CATEGORIES = [
  { nom: "Vapes",       ordre: 10, icone: "vape" },
  { nom: "Poppers",     ordre: 20, icone: "popper" },
  { nom: "Batteries",   ordre: 30, icone: "batterie" },
  { nom: "Hygiène",     ordre: 40, icone: "hygiene" },
  { nom: "Briquets",    ordre: 50, icone: "briquet" },
  { nom: "Accessoires", ordre: 60, icone: "cable" },
];

type Produit = {
  sku: string; nom: string; cat: string; prix: number; age: number;
  achat: number; achete: number; icone: string;
  description?: string; mention?: string;
};

const MENTION_VAPE = "Produit contenant de la nicotine, substance qui crée une forte dépendance. "
                   + "Vente interdite aux mineurs.";

/** sku, nom, categorie, prix de vente, age, prix d'achat, quantite achetee.
 *  Les quantites varient : on n'achete pas autant de powerbanks a neuf euros
 *  piece que de lingettes a quatre-vingt-dix centimes. Sans cette difference,
 *  tous les produits ont la meme autonomie et le tableau de bord n'a rien a dire. */
const PRODUITS: Produit[] = [
  { sku: "VAPE-MEN",  nom: "Puff 600 · Menthe",        cat: "Vapes",       prix: 1290, age: 18, achat: 410,  achete: 180, icone: "vape",
    description: "600 bouffées, 2 % de nicotine. Menthe glaciale, sans amertume.", mention: MENTION_VAPE },
  { sku: "VAPE-FRU",  nom: "Puff 600 · Fruits rouges", cat: "Vapes",       prix: 1290, age: 18, achat: 410,  achete: 180, icone: "vape",
    description: "600 bouffées, 2 % de nicotine. Fraise, framboise, cassis.", mention: MENTION_VAPE },
  { sku: "VAPE-PAS",  nom: "Puff 600 · Pastèque",      cat: "Vapes",       prix: 1290, age: 18, achat: 410,  achete: 120, icone: "vape",
    description: "600 bouffées, 2 % de nicotine. Pastèque fraîche.", mention: MENTION_VAPE },
  { sku: "VAPE-MAN",  nom: "Puff 1500 · Mangue",       cat: "Vapes",       prix: 1890, age: 18, achat: 620,  achete: 70,  icone: "vape",
    description: "1500 bouffées, 2 % de nicotine. Mangue mûre, légèrement glacée.", mention: MENTION_VAPE },
  { sku: "POP-15",    nom: "Poppers 15 ml",            cat: "Poppers",     prix: 1490, age: 18, achat: 480,  achete: 80,  icone: "popper",
    description: "Formule pentyle, flacon 15 ml.", mention: "Ne pas inhaler directement au flacon. Tenir hors de portée des enfants." },
  { sku: "PWR-5000",  nom: "Powerbank 5000 mAh",       cat: "Batteries",   prix: 2490, age: 0,  achat: 890,  achete: 40,  icone: "batterie",
    description: "Recharge un téléphone une fois. Câble USB-C fourni." },
  { sku: "PWR-10000", nom: "Powerbank 10000 mAh",      cat: "Batteries",   prix: 3490, age: 0,  achat: 1290, achete: 18,  icone: "batterie",
    description: "Deux recharges complètes. Deux sorties, câble USB-C fourni." },
  { sku: "HYG-PRE",   nom: "Préservatifs x3",          cat: "Hygiène",     prix: 690,  age: 0,  achat: 150,  achete: 120, icone: "hygiene",
    description: "Trois préservatifs lubrifiés, taille standard. Marquage CE." },
  { sku: "HYG-LIN",   nom: "Lingettes x10",            cat: "Hygiène",     prix: 390,  age: 0,  achat: 90,   achete: 80,  icone: "hygiene" },
  { sku: "BRQ-TEMP",  nom: "Briquet tempête",          cat: "Briquets",    prix: 490,  age: 0,  achat: 120,  achete: 60,  icone: "briquet",
    description: "Flamme torche, rechargeable." },
  { sku: "ACC-USBC",  nom: "Câble USB-C 1 m",          cat: "Accessoires", prix: 990,  age: 0,  achat: 260,  achete: 56,  icone: "cable",
    description: "USB-C vers USB-C, 60 W, tressé." },
];

/** La seconde livraison, une semaine avant aujourd'hui : on rachete ce qui part. */
const RELIVRAISON: Record<string, number> = { "VAPE-MEN": 120, "VAPE-FRU": 120, "POP-15": 60, "HYG-PRE": 60 };

/**
 * Le planogramme, sur les dix spires que porte une RedBox — cinq rangees de
 * deux. Le meme pour les trois machines : c'est le cas courant, un exploitant
 * deploie la meme selection. La powerbank 10000 reste en reserve, sans spire :
 * il y a toujours un produit qu'on a achete et pas encore place.
 */
const PLAN: { rangee: number; colonne: number; sku: string; capacite: number }[] = [
  { rangee: 1, colonne: 1, sku: "VAPE-MEN", capacite: 10 },
  { rangee: 1, colonne: 2, sku: "VAPE-FRU", capacite: 10 },
  { rangee: 2, colonne: 1, sku: "VAPE-PAS", capacite: 10 },
  { rangee: 2, colonne: 2, sku: "VAPE-MAN", capacite: 10 },
  { rangee: 3, colonne: 1, sku: "POP-15",   capacite: 10 },
  { rangee: 3, colonne: 2, sku: "PWR-5000", capacite: 6 },
  { rangee: 4, colonne: 1, sku: "HYG-PRE",  capacite: 10 },
  { rangee: 4, colonne: 2, sku: "HYG-LIN",  capacite: 10 },
  { rangee: 5, colonne: 1, sku: "BRQ-TEMP", capacite: 10 },
  { rangee: 5, colonne: 2, sku: "ACC-USBC", capacite: 8 },
];

/**
 * Les trois machines. La cadence est relative : un bar de nuit passant, un
 * bar de quartier, et un troisieme ferme pour travaux depuis deux jours — la
 * borne y est mise hors service, mais elle parle toujours.
 */
const MACHINES = [
  { nom: "RedBox — Le Duplex",     adresse: "Paris 11e", cadence: 1,
    description: "Au fond à gauche, derrière le flipper. Le patron ouvre à 17 h." },
  { nom: "RedBox — Le Sous-Marin", adresse: "Montreuil", cadence: 0.55,
    description: "Dans le couloir des toilettes. Prise derrière le comptoir." },
  { nom: "RedBox — Chez Marcel",   adresse: "Lyon 7e",   cadence: 0.4,
    description: "À droite de l’entrée. Fermé le lundi.",
    horsService: "Réouverture lundi — le bar est fermé pour travaux", fermeeDepuisJ: 2 },
];

/** La cadence d'une borne fictive, retrouvee par son rang dans le compte. */
function cadenceDe(rang: number): number {
  return MACHINES[rang % MACHINES.length].cadence;
}

/**
 * LA BASE EST LOIN. Chaque aller-retour coute un demi-tour de reseau, et une
 * transaction tient une connexion unique : rien ne s'y parallelise. Tout ce
 * fichier ecrit donc PAR LOTS — `unnest` deplie des tableaux en lignes, et des
 * CTE enchainent ce qui depend d'un identifiant tout juste cree. Le semis tient
 * en une quinzaine de requetes ; un passage des bornes, en une dizaine. Une
 * boucle d'INSERT aurait fait attendre l'inscription une demi-minute.
 */

// --------------------------------------------------------------- les images

/**
 * Une image embarquee, prete a entrer dans `image` : ses octets, son type et
 * son empreinte — la meme que `rangerImage` calcule, pour que la contrainte
 * (compte, empreinte) joue si on reseme deux fois.
 */
function imageDemo(cle: string): { cle: string; type: string; octets: Buffer; empreinte: string } | null {
  const i = IMAGES_DEMO[cle];
  if (!i) return null;
  const octets = Buffer.from(i.b64, "base64");
  return { cle, type: i.type, octets, empreinte: createHash("sha256").update(octets).digest("hex") };
}

// --------------------------------------------------------------- le hasard

/** Un tirage reproductible : la meme graine donne la meme histoire. */
function graine(n: number): () => number {
  let g = (20260901 + n * 7919) % 2147483648;
  return () => (g = (g * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/** Un numero de commande tel que la borne les ecrit : ORD- et huit hexadecimaux. */
function commande(tir: () => number): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += "0123456789ABCDEF"[Math.floor(tir() * 16)];
  return "ORD-" + s;
}

/** Le nombre d'evenements d'une heure ou l'on en attend `lambda` en moyenne. */
function poisson(lambda: number, tir: () => number): number {
  if (lambda <= 0) return 0;
  const seuil = Math.exp(-lambda);
  let n = 0, p = tir();
  while (p > seuil) { n++; p *= tir(); }
  return n;
}

/**
 * Le statut d'une vente, tire au sort. Neuf ventes sur dix aboutissent ; le
 * reste se repartit entre ce qu'il faut regarder — paye, rien n'est tombe — et
 * ce qui a tourne court avant la spirale. Un age refuse n'a de sens que sur un
 * produit qui demande un age.
 */
function statutAuSort(tir: () => number, age: number): string {
  const d = tir();
  if (d < 0.018) return "litige";
  if (d < 0.033) return "chute_non_detectee";
  if (d < 0.045) return "non_distribue";
  if (d < 0.085) return "carte_absente";
  if (d < 0.105) return "carte_refusee";
  if (d < 0.125 && age >= 18) return "age_refuse";
  return "distribue";
}

/**
 * Ce qu'une borne vend en une heure, en moyenne, selon l'heure et le jour. Un
 * bar : rien le matin, un peu l'apres-midi, l'essentiel le soir, davantage le
 * week-end.
 */
function tauxHoraire(heure: number, weekend: boolean): number {
  const base = heure < 11 ? 0.03 : heure < 18 ? 0.28 : heure < 24 ? 0.7 : 0.03;
  return base * (weekend ? 1.6 : 1);
}

// ------------------------------------------------------------------ le temps

/** L'heure murale de Paris d'un instant, en morceaux. */
function aParis(d: Date): { a: number; m: number; j: number; h: number; mi: number; s: number; dow: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSEAU, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { a: +p.year, m: +p.month, j: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, dow };
}

/** L'instant qui correspond a une heure murale de Paris. */
function deParis(a: number, m: number, j: number, h: number, mi: number, s = 0): Date {
  const devine = Date.UTC(a, m - 1, j, h, mi, s);
  const vu = aParis(new Date(devine));
  const local = Date.UTC(vu.a, vu.m - 1, vu.j, vu.h, vu.mi, vu.s);
  return new Date(devine - (local - devine));
}

/** « Il y a `jours` jours, a telle heure de Paris ». */
function instant(jours: number, h: number, mi: number, s = 0): Date {
  const ref = aParis(new Date(Date.now() - jours * 86400e3));
  return deParis(ref.a, ref.m, ref.j, h, mi, s);
}

function estWeekend(d: Date): boolean {
  const dow = aParis(d).dow;
  return dow === 5 || dow === 6;   // vendredi et samedi soir, pour un bar
}

// ---------------------------------------------------------------- le journal

type LigneJ = { borne: number; source: "commandes" | "diagnostic"; quand: Date; commande: string | null; ligne: string };

/** Le mot que la machine ecrit pour chaque issue de spirale. */
const ISSUE: Record<string, string> = {
  distribue: "DELIVERED", chute_non_detectee: "NO_DROP_DETECTED",
  non_distribue: "VEND_FAILED", litige: "NO_DROP_DETECTED",
};

/** Le mot du terminal pour chaque refus avant la spirale. */
const AUTORISATION: Record<string, string> = {
  carte_absente: "NO_CARD", carte_refusee: "DECLINED", terminal_indisponible: "UNAVAILABLE",
};

const MMDD = (d: Date) => {
  const p = aParis(d);
  return `${String(p.m).padStart(2, "0")}-${String(p.j).padStart(2, "0")} `
       + `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}:${String(p.s).padStart(2, "0")}.`
       + String(d.getTime() % 1000).padStart(3, "0");
};

/**
 * Ce que la borne aurait ecrit pour cette vente : le journal des commandes,
 * au format exact de `OrderJournal` — epoch|TYPE|cle=valeur —, et quelques
 * lignes de diagnostic autour. C'est ce que montre la page « Journal ».
 */
function journalDe(borne: number, cmd: string, quand: Date, sku: string, lane: number | null,
                   prix: number, statut: string): LigneJ[] {
  const t = (ms: number) => new Date(quand.getTime() + ms);
  const L = (ms: number, texte: string): LigneJ =>
    ({ borne, source: "commandes", quand: t(ms), commande: cmd, ligne: `${t(ms).getTime()}|${texte}` });
  const D = (ms: number, texte: string): LigneJ =>
    ({ borne, source: "diagnostic", quand: t(ms), commande: /ORD-/.test(texte) ? cmd : null,
       ligne: `${MMDD(t(ms))} ${texte}` });

  const out: LigneJ[] = [
    L(-9000, `ORDER_OPEN|order=${cmd}`),
    L(-8990, `ITEM|order=${cmd}|idx=0|sku=${sku}|price=${prix}`),
    D(-8900, `=== ${cmd} : demarrage ===`),
  ];
  if (statut === "age_refuse") {
    out.push(D(-6000, "AgeGate: verification demandee, piece refusee"));
    out.push(L(-5900, `ORDER_CLOSE|order=${cmd}|status=AGE_REFUSED|charged=0|refunded=0`));
    return out;
  }
  const txn = 30000 + (quand.getTime() % 9000);
  out.push(D(-7000, `commande ${cmd} <-> transaction ${txn}`));
  if (AUTORISATION[statut]) {
    out.push(D(-4000, `MDB <- VEND DENIED (${AUTORISATION[statut]})`));
    out.push(L(-3900, `PAY|order=${cmd}|txn=${txn}|auth=${AUTORISATION[statut]}|amount=${prix}`));
    out.push(L(-3800, `ORDER_CLOSE|order=${cmd}|status=PAYMENT_DECLINED|charged=0|refunded=0`));
    return out;
  }
  out.push(D(-4200, `MDB -> VEND REQUEST ${(prix / 100).toFixed(2)} EUR`));
  out.push(D(-4000, "MDB <- VEND APPROVED"));
  out.push(L(-3900, `PAY|order=${cmd}|txn=${txn}|auth=APPROVED|amount=${prix}`));
  if (lane !== null) {
    out.push(L(-3000, `VEND_START|order=${cmd}|idx=0|sku=${sku}|lane=${lane}|price=${prix}`));
    out.push(D(-2900, `Dispenser: spire ${lane} tourne`));
    const chute = statut === "distribue";
    out.push(D(-600, chute ? "Dispenser: chute detectee" : "Dispenser: aucune chute vue"));
    out.push(L(-500, `VEND_END|order=${cmd}|idx=0|outcome=${ISSUE[statut] ?? "VEND_FAILED"}|drop=${chute}`));
  }
  const ok = statut === "distribue";
  const rembourse = statut === "litige" ? 0 : ok ? 0 : prix;
  if (!ok && statut !== "litige") out.push(D(-300, `MDB -> VEND FAILURE (${(prix / 100).toFixed(2)} EUR)`));
  out.push(L(0, `ORDER_CLOSE|order=${cmd}|status=${ok ? "COMPLETED" : "FAILED"}|charged=${prix}|refunded=${rembourse}`));
  return out;
}

/**
 * Toutes les lignes d'un coup, pour toutes les bornes. L'adresse d'une ligne
 * est sa position dans le fichier de la machine : on reprend la ou le lot en
 * etait, et chaque ligne avance de sa longueur — la somme glissante le
 * calcule en base, borne par borne, dans l'ordre des lignes.
 */
async function ecrireJournal(c: PgClient, lignes: LigneJ[]): Promise<void> {
  if (lignes.length === 0) return;
  lignes.sort((a, z) => a.borne - z.borne || a.quand.getTime() - z.quand.getTime());
  await c.query(`
    WITH l AS (
      SELECT j.*, o,
             SUM(octet_length(j.ligne) + 1) OVER (PARTITION BY j.borne ORDER BY o) AS avance
        FROM unnest($1::bigint[], $2::text[], $3::timestamptz[], $4::text[], $5::text[])
             WITH ORDINALITY AS j(borne, source, quand, commande, ligne, o))
    INSERT INTO journal_borne (borne_id, source, lot, position, horodatage, commande_id, ligne)
    SELECT l.borne, l.source, 'demo',
           COALESCE((SELECT MAX(position) FROM journal_borne x
                      WHERE x.borne_id = l.borne AND x.lot = 'demo'), 0) + l.avance,
           l.quand, l.commande, l.ligne
      FROM l
    ON CONFLICT (borne_id, source, lot, position) DO NOTHING`,
    [lignes.map((l) => l.borne), lignes.map((l) => l.source), lignes.map((l) => l.quand),
     lignes.map((l) => l.commande), lignes.map((l) => l.ligne)]);
}

// ----------------------------------------------------------------- les ventes

type Vente = {
  borne: number; cmd: string; article: number; lane: number | null; produit: number;
  prix: number; statut: string; quand: Date; traite: Date | null; note: string | null;
};

/**
 * Les ventes d'un coup, et dans la meme requete le mouvement de chacune de
 * celles qui ont distribue — rattache a la vente, donc jamais compte deux
 * fois. `RETURNING` ne rend que ce qui est entre : un doublon ne fait rien.
 */
async function insererVentes(c: PgClient, compte_id: number, ventes: Vente[], par: string): Promise<void> {
  if (ventes.length === 0) return;
  await c.query(`
    WITH v AS (
      INSERT INTO vente (borne_id, commande_id, article, lane, produit_id, prix_c, statut, faite_le,
                         traite_le, traite_par, note)
      SELECT v.borne, v.cmd, v.article, v.lane, v.produit, v.prix, v.statut, v.quand,
             v.traite, CASE WHEN v.traite IS NULL THEN NULL ELSE $1 END, v.note
        FROM unnest($2::bigint[], $3::text[], $4::smallint[], $5::int[], $6::bigint[], $7::int[],
                    $8::text[], $9::timestamptz[], $10::timestamptz[], $11::text[])
             AS v(borne, cmd, article, lane, produit, prix, statut, quand, traite, note)
      ON CONFLICT (borne_id, commande_id, lane, article) DO NOTHING
      RETURNING id, borne_id, produit_id, lane, faite_le, statut)
    INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, quantite, motif,
                           lane, par, fait_le, confirme_le, vente_id)
    SELECT $12, v.produit_id, b.lieu_id, 1, 'vente', v.lane, 'borne', v.faite_le, v.faite_le, v.id
      FROM v JOIN borne b ON b.id = v.borne_id
     WHERE v.statut = 'distribue' AND v.produit_id IS NOT NULL`,
    [par, ventes.map((v) => v.borne), ventes.map((v) => v.cmd), ventes.map((v) => v.article),
     ventes.map((v) => v.lane), ventes.map((v) => v.produit), ventes.map((v) => v.prix),
     ventes.map((v) => v.statut), ventes.map((v) => v.quand), ventes.map((v) => v.traite),
     ventes.map((v) => v.note), compte_id]);
}

// ------------------------------------------------------------------ le semis

/**
 * REMPLIT UN COMPTE VIERGE.
 *
 * A appeler dans la transaction qui cree le compte, ou apres `viderDemo`. Le
 * compte doit avoir sa reserve — `reserveDe` la cree au besoin — et rien
 * d'autre : on ne verifie pas, on ajoute.
 *
 * `par` est l'adresse de la personne qui ouvre le compte : c'est elle qu'on
 * inscrit sur les receptions et les traitements, pour que « charge par » et
 * « traite par » disent un nom qu'elle reconnait.
 */
export async function semerDemo(c: PgClient, compte_id: number, par: string): Promise<void> {
  const tir = graine(compte_id);
  const reserve = await reserveDe(compte_id, c);

  // Les categories, puis les produits qui s'y rangent, en une requete.
  const produits = (await c.query<{ id: number; sku: string }>(`
    WITH k AS (
      INSERT INTO categorie (compte_id, nom, ordre, icone)
      SELECT $1, k.nom, k.ordre, k.icone
        FROM unnest($2::text[], $3::int[], $4::text[]) AS k(nom, ordre, icone)
      ON CONFLICT (compte_id, nom) DO UPDATE SET ordre = EXCLUDED.ordre
      RETURNING id, nom)
    INSERT INTO produit (compte_id, sku, nom, categorie_id, prix_vente_c, age_min, icone,
                         description, mention, ordre)
    SELECT $1, p.sku, p.nom, k.id, p.prix, p.age, p.icone, p.description, p.mention, p.o * 10
      FROM unnest($5::text[], $6::text[], $7::text[], $8::int[], $9::smallint[], $10::text[],
                  $11::text[], $12::text[]) WITH ORDINALITY
           AS p(sku, nom, cat, prix, age, icone, description, mention, o)
      JOIN k ON k.nom = p.cat
    ON CONFLICT (compte_id, sku) DO UPDATE SET nom = EXCLUDED.nom
    RETURNING id, sku`,
    [compte_id, CATEGORIES.map((k) => k.nom), CATEGORIES.map((k) => k.ordre), CATEGORIES.map((k) => k.icone),
     PRODUITS.map((p) => p.sku), PRODUITS.map((p) => p.nom), PRODUITS.map((p) => p.cat),
     PRODUITS.map((p) => p.prix), PRODUITS.map((p) => p.age), PRODUITS.map((p) => p.icone),
     PRODUITS.map((p) => p.description ?? null), PRODUITS.map((p) => p.mention ?? null)])).rows;
  const pid = new Map(produits.map((p) => [p.sku, p.id]));
  const prix = new Map(PRODUITS.map((p) => [p.sku, p.prix]));

  // Leurs images : une tuile par categorie et par produit, dessinees a partir
  // des pictogrammes de la machine. La borne les recevra comme des photos.
  // Une seule requete : les octets entrent, puis chaque cle — nom de categorie
  // ou SKU, ils ne se ressemblent pas — retrouve son identifiant par l'empreinte.
  const tuiles = [...CATEGORIES.map((k) => k.nom), ...PRODUITS.map((p) => p.sku)]
    .map(imageDemo).filter((i): i is NonNullable<typeof i> => i !== null);
  if (tuiles.length > 0) {
    await c.query(`
      WITH i AS (
        INSERT INTO image (compte_id, type_mime, octets, taille, empreinte)
        SELECT $1, x.type, x.octets, octet_length(x.octets), x.empreinte
          FROM unnest($2::text[], $3::bytea[], $4::text[]) AS x(type, octets, empreinte)
        ON CONFLICT (compte_id, empreinte) DO UPDATE SET type_mime = EXCLUDED.type_mime
        RETURNING id, empreinte),
      lien AS (
        SELECT x.cle, i.id FROM unnest($5::text[], $4::text[]) AS x(cle, empreinte)
        JOIN i ON i.empreinte = x.empreinte),
      k AS (
        UPDATE categorie k SET image_id = lien.id FROM lien
         WHERE k.compte_id = $1 AND k.nom = lien.cle)
      UPDATE produit p SET image_id = lien.id FROM lien
       WHERE p.compte_id = $1 AND p.sku = lien.cle`,
      [compte_id, tuiles.map((t) => t.type), tuiles.map((t) => t.octets),
       tuiles.map((t) => t.empreinte), tuiles.map((t) => t.cle)]);
  }
  const age = new Map(PRODUITS.map((p) => [p.sku, p.age]));
  const achat = new Map(PRODUITS.map((p) => [p.sku, p.achat]));

  // Deux livraisons : la premiere il y a trois semaines, la seconde la
  // semaine derniere, ou l'on a rachete ce qui partait.
  const receptions = [
    ...PRODUITS.map((p) => ({ sku: p.sku, n: p.achete, ref: "BL-2026-0114", quand: instant(JOURS, 10, 15) })),
    ...Object.entries(RELIVRAISON).map(([sku, n]) => ({ sku, n, ref: "BL-2026-0131", quand: instant(7, 8, 40) })),
  ];
  await c.query(`
    INSERT INTO mouvement (compte_id, produit_id, vers_lieu_id, quantite, motif,
                           prix_achat_c, reference, par, fait_le, confirme_le)
    SELECT $1, r.produit, $2, r.n, 'reception', r.achat, r.ref, $3, r.quand, r.quand
      FROM unnest($4::bigint[], $5::int[], $6::int[], $7::text[], $8::timestamptz[])
           AS r(produit, n, achat, ref, quand)`,
    [compte_id, reserve, par,
     receptions.map((r) => pid.get(r.sku)!), receptions.map((r) => r.n),
     receptions.map((r) => achat.get(r.sku)!), receptions.map((r) => r.ref), receptions.map((r) => r.quand)]);

  // Une personne de plus dans l'equipe, et une invitation qui attend.
  const reassort = adresseReassort(compte_id);
  await c.query(`
    WITH u AS (
      INSERT INTO utilisateur (compte_id, email, mdp, role, nom)
      VALUES ($1,$2,$3,'reassort','Sami (démo)') ON CONFLICT (email) DO NOTHING RETURNING id),
    m AS (
      INSERT INTO membre (utilisateur_id, compte_id, role) SELECT id, $1, 'reassort' FROM u
      ON CONFLICT DO NOTHING)
    INSERT INTO invitation (compte_id, email, role, code, par) VALUES ($1,$4,'gerant',$5,$6)`,
    [compte_id, reassort, "demo:" + randomBytes(32).toString("hex"),
     adresseInvitee(compte_id), randomBytes(9).toString("base64url"), par]);

  // Les lieux, les bornes qui s'y trouvent, et leurs dix spires — une requete.
  const sante = (fermee: boolean) => JSON.stringify({
    vend: !fermee, paiement: "pret", tarif_essai: false, distributeur: "en_ligne",
    paiement_port: "/dev/ttyS3", paiement_pertes: 0, lecteur_identite: "pret",
    reponses_intruses: 0, ventes_en_attente: 0,
  });
  const bornes = (await c.query<{ id: number; lieu: number; o: number }>(`
    WITH l AS (
      INSERT INTO lieu (compte_id, genre, nom)
      SELECT $1, 'borne', m.nom FROM unnest($2::text[]) AS m(nom)
      RETURNING id, nom),
    b AS (
      INSERT INTO borne (compte_id, lieu_id, nom, adresse, description, jeton, machine,
                         appairee_le, vue_le, version, sante,
                         maintenance_pin, maintenance_pin_le, maintenance_vu,
                         hors_service, hors_service_texte, hors_service_le)
      SELECT $1, l.id, m.nom, m.adresse, m.description, m.jeton, m.machine,
             $3, now(), '5.13', m.sante::jsonb, m.pin, now(), m.pin,
             m.hs IS NOT NULL, m.hs, m.hs_le
        FROM unnest($2::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
                    $9::text[], $10::text[], $11::timestamptz[]) WITH ORDINALITY
             AS m(nom, adresse, description, jeton, machine, sante, pin, hs, hs_le, o)
        JOIN l ON l.nom = m.nom
      RETURNING id, lieu_id, nom),
    k AS (
      INSERT INTO canal (borne_id, lane, rangee, colonne, produit_id, quantite, quantite_borne,
                         capacite, seuil_bas, releve_le, releve_borne_le)
      SELECT b.id, s.lane, s.rangee, s.colonne, p.id, 0, 0, s.capacite, 2, now(), now()
        FROM b
        CROSS JOIN unnest($12::int[], $13::smallint[], $14::smallint[], $15::text[], $16::int[])
                   AS s(lane, rangee, colonne, sku, capacite)
        JOIN produit p ON p.compte_id = $1 AND p.sku = s.sku)
    SELECT b.id, b.lieu_id AS lieu, m.o
      FROM b JOIN unnest($2::text[]) WITH ORDINALITY AS m(nom, o) ON m.nom = b.nom
     ORDER BY m.o`,
    [compte_id, MACHINES.map((m) => m.nom), instant(JOURS, 11, 0),
     MACHINES.map((m) => m.adresse), MACHINES.map((m) => m.description),
     MACHINES.map(() => PREFIXE_JETON + randomBytes(18).toString("base64url")),
     MACHINES.map((_, i) => `demo-${compte_id}-${i + 1}`),
     MACHINES.map((m) => sante(Boolean(m.horsService))),
     MACHINES.map(() => String(100000 + Math.floor(tir() * 900000))),
     MACHINES.map((m) => m.horsService ?? null),
     MACHINES.map((m) => (m.horsService ? instant(m.fermeeDepuisJ ?? 0, 18, 30) : null)),
     PLAN.map((s) => laneDe(s.rangee, s.colonne)), PLAN.map((s) => s.rangee), PLAN.map((s) => s.colonne),
     PLAN.map((s) => s.sku), PLAN.map((s) => s.capacite)])).rows
    .map((b, i) => ({ id: b.id, lieu: b.lieu, cadence: MACHINES[i].cadence,
                      fermeeDepuisJ: MACHINES[i].fermeeDepuisJ ?? -1 }));

  // La seconde borne vend les vapes un euro plus cher : un prix propre.
  const vapes = PRODUITS.filter((p) => p.cat === "Vapes").map((p) => p.sku);
  await c.query(`
    INSERT INTO prix_borne (borne_id, produit_id, prix_c, par, pose_le)
    SELECT $1, p.produit, p.prix, $2, $3 FROM unnest($4::bigint[], $5::int[]) AS p(produit, prix)`,
    [bornes[1].id, par, instant(JOURS, 11, 5),
     vapes.map((s) => pid.get(s)!), vapes.map((s) => prix.get(s)! + 100)]);
  const prixDe = (borne: number, sku: string) =>
    prix.get(sku)! + (borne === bornes[1].id && vapes.includes(sku) ? 100 : 0);

  // Trois semaines d'exploitation : des ventes tous les jours, une tournee
  // chaque semaine. Tout est accumule en memoire, puis insere en trois requetes.
  //
  // La reserve se suit ici aussi : on ne transfere pas ce qu'on n'a pas. C'est
  // la regle du vrai systeme ; un jeu d'essai qui s'en affranchit produit des
  // stocks negatifs et fait passer pour normal un etat impossible.
  const enReserve = new Map(PRODUITS.map((p) => [p.sku, p.achete]));
  const transferts: { produit: number; quantite: number; lane: number; quand: Date; lieu: number }[] = [];
  const ventes: Vente[] = [];
  const journal: LigneJ[] = [];
  const maintenant = Date.now();

  // Ce que porte chaque spire de la premiere borne a la fin : c'est la qu'on
  // pose le transfert encore en route, sur une spire qui a de la place.
  let placeDuplex = new Map<number, number>();

  for (const b of bornes) {
    const restant = new Map<number, number>();
    const charger = (jours: number, premiere: boolean) => {
      for (const s of PLAN) {
        const lane = laneDe(s.rangee, s.colonne);
        const manque = Math.min(s.capacite - (restant.get(lane) ?? 0), enReserve.get(s.sku)!);
        if (manque <= 0) continue;
        restant.set(lane, (restant.get(lane) ?? 0) + manque);
        enReserve.set(s.sku, enReserve.get(s.sku)! - manque);
        transferts.push({ produit: pid.get(s.sku)!, quantite: manque, lane,
                          quand: instant(jours, premiere ? 11 : 9, 30), lieu: b.lieu });
      }
    };
    charger(JOURS, true);

    for (let j = JOURS - 1; j >= 0; j--) {
      // La seconde livraison arrive avant la tournee de la semaine derniere.
      // La derniere tournee date de sept jours : les machines ont vendu depuis,
      // et la fiche de reassort a quelque chose a dire des l'ouverture.
      if (j === 7) for (const [sku, n] of Object.entries(RELIVRAISON)) enReserve.set(sku, enReserve.get(sku)! + n);
      if (j % 7 === 0 && j > 0) charger(j, false);
      if (j <= b.fermeeDepuisJ) continue;                       // fermee pour travaux

      for (let h = 10; h < 24; h++) {
        const debutHeure = instant(j, h, 0);
        if (debutHeure.getTime() > maintenant) break;
        const n = poisson(tauxHoraire(h, estWeekend(debutHeure)) * b.cadence, tir);
        for (let k = 0; k < n; k++) {
          const quand = instant(j, h, Math.floor(tir() * 60), Math.floor(tir() * 60));
          if (quand.getTime() > maintenant) continue;
          const cmd = commande(tir);
          const articles = tir() < 0.12 ? 2 : 1;
          for (let a = 0; a < articles; a++) {
            const s = PLAN[Math.floor(tir() * PLAN.length)];
            const lane = laneDe(s.rangee, s.colonne);
            const statut = statutAuSort(tir, age.get(s.sku)!);
            // Spirale vide : le client repart les mains vides, il n'y a pas de vente.
            if ((restant.get(lane) ?? 0) <= 0 && statut === "distribue") continue;
            if (statut === "distribue") restant.set(lane, restant.get(lane)! - 1);
            const aRegarder = (A_REGARDER as readonly string[]).includes(statut);
            const avantSpirale = !aRegarder && statut !== "distribue";
            // Ce qui a plus de cinq jours a ete regarde ; le reste attend.
            const traite = aRegarder && j > 5 ? new Date(quand.getTime() + 20 * 3600e3) : null;
            const p = prixDe(b.id, s.sku);
            ventes.push({
              borne: b.id, cmd, article: a, lane: avantSpirale ? null : lane, produit: pid.get(s.sku)!,
              prix: p, statut, quand: new Date(quand.getTime() + a * 12000), traite,
              note: !traite ? null : statut === "litige" ? "Remboursé chez Nayax"
                                                         : "Remboursement confirmé par le terminal",
            });
            // Le journal, pour les ventes recentes de la premiere borne : c'est
            // celle qu'on ouvre en premier, et cinq jours suffisent a lire.
            if (b === bornes[0] && j <= 5 && a === 0) {
              journal.push(...journalDe(b.id, cmd, quand, s.sku, avantSpirale ? null : lane, p, statut));
            }
          }
        }
      }
    }
    if (b === bornes[0]) placeDuplex = new Map(PLAN.map((s) => {
      const lane = laneDe(s.rangee, s.colonne);
      return [lane, Math.max(0, s.capacite - (restant.get(lane) ?? 0))];
    }));
  }

  // Les tournees, le transfert encore en route, et une casse en reserve — les
  // mouvements qui ne sont pas des ventes, en une requete.
  //
  // Le transfert en route va sur la spire la moins pleine de la premiere
  // borne, et n'y met que ce qui tient : la borne fictive le confirmera dans
  // quelques minutes, et un canal a quatorze sur dix ne se verrait nulle part
  // sur une vraie machine. Toutes pleines — ca n'arrive pas apres trois
  // semaines de ventes — et il n'y a rien en route.
  const spire = [...placeDuplex.entries()].sort((a, z) => z[1] - a[1])[0];
  const skuSpire = PLAN.find((s) => laneDe(s.rangee, s.colonne) === spire?.[0])?.sku ?? "VAPE-PAS";
  const enRoute = { produit: pid.get(skuSpire)!, quantite: Math.min(4, spire?.[1] ?? 0, enReserve.get(skuSpire) ?? 0),
                    lane: spire?.[0] ?? laneDe(2, 1), quand: new Date(maintenant - 40 * 60e3), lieu: bornes[0].lieu };
  await c.query(`
    INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, vers_lieu_id, quantite,
                           motif, lane, par, fait_le, confirme_le)
    SELECT $1::bigint, t.produit, $2::bigint, t.lieu, t.quantite, 'transfert'::text, t.lane,
           $3::text, t.quand, t.quand
      FROM unnest($4::bigint[], $5::int[], $6::int[], $7::timestamptz[], $8::bigint[])
           AS t(produit, quantite, lane, quand, lieu)
    UNION ALL
    SELECT $1::bigint, $9::bigint, $2::bigint, $10::bigint, $11::int, 'transfert', $12::int,
           $13::text, $14::timestamptz, NULL
     WHERE $11::int > 0
    UNION ALL
    SELECT $1::bigint, $15::bigint, $2::bigint, NULL, 3, 'casse', NULL, $13::text, $16::timestamptz, NULL`,
    [compte_id, reserve, reassort,
     transferts.map((t) => t.produit), transferts.map((t) => t.quantite),
     transferts.map((t) => t.lane), transferts.map((t) => t.quand), transferts.map((t) => t.lieu),
     enRoute.produit, enRoute.lieu, enRoute.quantite, enRoute.lane, par, enRoute.quand,
     pid.get("HYG-LIN")!, instant(5, 14, 20)]);
  // La casse porte sa raison.
  await c.query(`
    UPDATE mouvement SET note = 'Carton écrasé à la livraison'
     WHERE compte_id = $1 AND motif = 'casse' AND note IS NULL`, [compte_id]);

  await insererVentes(c, compte_id, ventes, par);
  await ecrireJournal(c, journal);
  await recompterCanaux(c, compte_id);
  await semerPub(c, compte_id, bornes[0].id);
  await semerSalons(c, compte_id, par, reassort, bornes.map((b, i) => ({ id: b.id, nom: MACHINES[i].nom })));

  // Le numero d'assistance — sans ecraser un vrai — et le drapeau.
  await c.query(`
    UPDATE compte SET demo = true, demo_vie = now(),
           sav_tel = COALESCE(sav_tel, $2), sav_texte = COALESCE(sav_texte, $3)
     WHERE id = $1`, [compte_id, SAV_TEL, SAV_TEXTE]);
}

/**
 * Les compteurs des canaux, recalcules depuis les evenements : ce qui est
 * entre par transfert confirme, moins ce qui a ete distribue. Le compteur de
 * la machine, lui, a aussi perdu les spirales qui ont tourne sans que rien ne
 * tombe — c'est l'ecart que la page du plateau sait montrer.
 */
async function recompterCanaux(c: PgClient, compte_id: number): Promise<void> {
  await c.query(`
    UPDATE canal c SET
      quantite       = GREATEST(0, t.entre - t.vendu),
      quantite_borne = GREATEST(0, t.entre - t.vendu - t.chute),
      releve_le = now(), releve_borne_le = now()
      FROM (
        SELECT c2.id,
          COALESCE((SELECT SUM(m.quantite) FROM mouvement m
                     WHERE m.vers_lieu_id = b2.lieu_id AND m.lane = c2.lane
                       AND m.motif = 'transfert' AND m.confirme_le IS NOT NULL AND m.annule_le IS NULL), 0)::int AS entre,
          (SELECT COUNT(*) FROM vente v WHERE v.borne_id = c2.borne_id AND v.lane = c2.lane
             AND v.statut = 'distribue')::int AS vendu,
          (SELECT COUNT(*) FROM vente v WHERE v.borne_id = c2.borne_id AND v.lane = c2.lane
             AND v.statut = 'chute_non_detectee')::int AS chute
          FROM canal c2 JOIN borne b2 ON b2.id = c2.borne_id
         WHERE b2.compte_id = $1
      ) t
     WHERE t.id = c.id`, [compte_id]);
}

/**
 * Deux playlists, et trois affiches dessinees pour elles — portrait, comme
 * l'ecran de la borne. Rien n'y vante les produits reglementes : la publicite
 * pour le vapotage est interdite en France, et une demo qui en montrerait une
 * apprendrait le mauvais geste.
 */
async function semerPub(c: PgClient, compte_id: number, borne_id: number): Promise<void> {
  // rang de playlist, image, nom, duree
  const voulus: [number, string, string, number][] = [
    [0, "affiche-bienvenue", "Touchez l’écran", 7],
    [0, "affiche-24h",       "24 h / 24",       6],
    [1, "affiche-samedi",    "Soirée du samedi", 8],
  ];
  const visuels = voulus
    .map(([pl, cle, nom, duree]) => ({ pl, nom, duree, image: imageDemo(cle) }))
    .filter((v): v is typeof v & { image: NonNullable<typeof v.image> } => v.image !== null);

  const jour = `(now() AT TIME ZONE '${FUSEAU}')::date`;
  await c.query(`
    WITH p AS (
      INSERT INTO playlist (compte_id, nom, ordre, actif, partout, debut_le, fin_le, cree_le)
      VALUES ($1, 'Promo rentrée',    0, true,  true,  ${jour} - 10, ${jour} + 20, now() - interval '10 days'),
             ($1, 'Soirée du samedi', 1, false, false, NULL, NULL, now() - interval '3 days')
      RETURNING id, ordre),
    pb AS (
      INSERT INTO playlist_borne (playlist_id, borne_id) SELECT p.id, $2 FROM p WHERE p.ordre = 1)
    INSERT INTO visuel (compte_id, playlist_id, nom, genre, type_mime, octets, taille, empreinte, duree_s, ordre)
    SELECT $1, p.id, v.nom, 'image', v.type, v.octets, octet_length(v.octets), v.empreinte, v.duree, v.o
      FROM unnest($3::int[], $4::text[], $5::text[], $6::bytea[], $7::text[], $8::int[]) WITH ORDINALITY
           AS v(pl, nom, type, octets, empreinte, duree, o)
      JOIN p ON p.ordre = v.pl`,
    [compte_id, borne_id, visuels.map((v) => v.pl), visuels.map((v) => v.nom),
     visuels.map((v) => v.image.type), visuels.map((v) => v.image.octets),
     visuels.map((v) => v.image.empreinte), visuels.map((v) => v.duree)]);
}

/**
 * La messagerie : « general », un salon par borne, et une conversation deja
 * commencee entre la personne qui s'inscrit et Sami, le reassortisseur
 * invente. Les machines y ont deja ecrit : c'est ainsi qu'on comprend, sans
 * qu'on l'explique, que le salon d'une borne est le sien.
 */
async function semerSalons(c: PgClient, compte_id: number, par: string, reassort: string,
                           bornes: { id: number; nom: string }[]): Promise<void> {
  const qui = (await c.query<{ id: number; email: string }>(
    "SELECT id, email FROM utilisateur WHERE email = ANY($1::text[])", [[par, reassort]])).rows;
  const moi = qui.find((x) => x.email === par)?.id ?? null;
  const sami = qui.find((x) => x.email === reassort)?.id ?? null;

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
  const general = salons.find((s) => s.borne_id === null)?.id;
  const duplex = salons.find((s) => s.borne_id === bornes[0]?.id)?.id;
  const sousMarin = salons.find((s) => s.borne_id === bornes[1]?.id)?.id;
  if (!general) return;

  const courtNom = (n: string) => n.replace(/^\s*redbox\s*[—–-]\s*/i, "").trim();
  const lignes: { salon: number; qui: number | null; texte: string; quand: Date }[] = [
    { salon: general, qui: moi, quand: instant(6, 9, 12),
      texte: "Bienvenue dans la messagerie. Ici on se dit ce qui concerne les machines ; chaque borne a son salon, où elle écrit elle-même ses ventes et ses soucis." },
    { salon: general, qui: sami, quand: instant(6, 9, 15),
      texte: "Reçu. Je fais la tournée du Duplex et du Sous-Marin jeudi." },
    { salon: general, qui: sami, quand: instant(3, 18, 40),
      texte: "Duplex rechargé. Il ne reste presque plus de câbles USB-C en réserve." },
    { salon: general, qui: moi, quand: instant(3, 18, 52), texte: "Je passe commande demain." },
    { salon: general, qui: sami, quand: instant(1, 22, 5),
      texte: "Chez Marcel est fermé pour travaux jusqu’à lundi, j’ai mis la borne hors service depuis la console." },
  ];
  if (duplex) {
    const b = courtNom(bornes[0].nom);
    lignes.push(
      { salon: duplex, qui: null, quand: instant(2, 23, 58),
        texte: `${b} · 11 ventes · 142,90 €\nPuff 600 · Menthe, Puff 600 · Fruits rouges, Poppers 15 ml, Briquet tempête et 7 autres` },
      { salon: duplex, qui: null, quand: instant(1, 21, 17),
        texte: `Incident · ${b}\n12,90 € · payé, la spirale a tourné, chute non détectée (spire 201)` },
      { salon: duplex, qui: sami, quand: instant(1, 21, 30),
        texte: "La spire 201 accroche un peu, je regarde jeudi." },
    );
  }
  if (sousMarin) {
    lignes.push({ salon: sousMarin, qui: null, quand: instant(1, 23, 40),
      texte: `${courtNom(bornes[1].nom)} · 6 ventes · 79,40 €\nPuff 600 · Pastèque, Préservatifs x3, Lingettes x10 et 3 autres` });
  }
  lignes.sort((a, z) => a.quand.getTime() - z.quand.getTime());
  await c.query(`
    INSERT INTO message (salon_id, utilisateur_id, texte, cree_le)
    SELECT m.salon, m.qui, m.texte, m.quand
      FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::timestamptz[]) AS m(salon, qui, texte, quand)`,
    [lignes.map((l) => l.salon), lignes.map((l) => l.qui), lignes.map((l) => l.texte), lignes.map((l) => l.quand)]);
}

// --------------------------------------------------------------- l'effacement

/**
 * VIDE LE COMPTE.
 *
 * Tout ce qui se rattache au compte disparait : bornes, ventes, mouvements,
 * lieux, produits, categories, playlists, images. Restent le compte lui-meme,
 * les personnes qui y appartiennent — sauf celle qu'on avait inventee —, leurs
 * photos, et les invitations adressees a de vraies adresses. Une reserve neuve
 * est recreee : sans elle, la premiere reception n'aurait nulle part ou entrer.
 *
 * L'ordre suit les cles etrangeres : `mouvement` retient `produit`, `produit`
 * retient `categorie`. Tout tient dans une seule requete, en CTE — chacune
 * s'execute dans l'ordre ou elle est ecrite.
 *
 * LES PERSONNES SE RETIRENT PAR ADRESSE EXACTE, jamais par motif : la seule
 * qu'on efface est celle qu'on a inventee. Un « LIKE » sur le domaine aurait
 * emporte quiconque s'est inscrit avec une adresse ressemblante — et avec lui
 * sa session, donc le compte entier, sans plus personne pour y revenir.
 */
export async function viderDemo(c: PgClient, compte_id: number): Promise<void> {
  await c.query(`
    WITH sa AS (DELETE FROM salon    WHERE compte_id = $1),
         b AS (DELETE FROM borne     WHERE compte_id = $1),
         m AS (DELETE FROM mouvement WHERE compte_id = $1),
         l AS (DELETE FROM lieu      WHERE compte_id = $1),
         p AS (DELETE FROM produit   WHERE compte_id = $1),
         k AS (DELETE FROM categorie WHERE compte_id = $1),
         pl AS (DELETE FROM playlist WHERE compte_id = $1),
         v AS (DELETE FROM visuel    WHERE compte_id = $1),
         il AS (DELETE FROM illustration WHERE compte_id = $1),
         im AS (DELETE FROM image    WHERE compte_id = $1
                  AND id NOT IN (SELECT image_id FROM utilisateur WHERE image_id IS NOT NULL)),
         inv AS (DELETE FROM invitation  WHERE compte_id = $1 AND email = $2),
         u AS (DELETE FROM utilisateur   WHERE compte_id = $1 AND email = $3),
         s AS (UPDATE compte SET sav_tel = NULL, sav_texte = NULL WHERE id = $1 AND sav_tel = $4)
    SELECT 1`, [compte_id, adresseInvitee(compte_id), adresseReassort(compte_id), SAV_TEL]);
  await c.query("INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'reserve','Ma réserve')", [compte_id]);
}

/** Quitte la demo : efface, et pose le drapeau. */
export async function quitterDemo(compte_id: number): Promise<void> {
  await transaction(async (c) => {
    await viderDemo(c, compte_id);
    await c.query("UPDATE compte SET demo = false, demo_vie = NULL WHERE id = $1", [compte_id]);
  });
}

/** Repart d'une demo neuve : efface, et reseme. */
export async function renouvelerDemo(compte_id: number, par: string): Promise<void> {
  await transaction(async (c) => {
    await viderDemo(c, compte_id);
    await semerDemo(c, compte_id, par);
  });
}

// ------------------------------------------------------------------- la vie

/**
 * LES BORNES FICTIVES PASSENT.
 *
 * A appeler quand quelqu'un ouvre la console. Une fois par minute au plus, et
 * une seule fois meme si deux pages se rendent en meme temps : la ligne du
 * compte est verrouillee le temps du passage, et la seconde lecture voit que
 * la premiere vient de passer. Quand rien n'est du, ca coute une lecture.
 *
 * Ce que fait un passage, dans l'ordre d'un vrai releve :
 *  1. les chargements saisis depuis plus d'une minute et demie sont confirmes,
 *     et le compteur du canal monte ; les corrections de compteur posees
 *     depuis la console sont appliquees ;
 *  2. les machines vendent ce qu'elles auraient vendu depuis le dernier
 *     passage — au rythme d'un bar, jamais plus que ce que la spirale porte —
 *     et l'ecrivent dans leur journal ;
 *  3. chaque borne se declare en ligne, a jour du catalogue, et du code de
 *     maintenance qu'on lui a delivre.
 */
export async function animerDemo(compte_id: number): Promise<void> {
  const fictives = await q1<{ ids: number[]; noms: string[] }>(`
    SELECT COALESCE(array_agg(b.id ORDER BY b.id), '{}') AS ids,
           COALESCE(array_agg(b.nom ORDER BY b.id), '{}') AS noms
      FROM borne b JOIN compte k ON k.id = b.compte_id
     WHERE b.compte_id = $1 AND k.demo AND ${SQL_FICTIVE}
       AND (k.demo_vie IS NULL OR k.demo_vie < now() - ($2 || ' seconds')::interval)`,
    [compte_id, String(PAUSE_S)]);
  if (!fictives || fictives.ids.length === 0) return;
  // Un tableau de bigint revient en chaines — le pilote ne convertit que les
  // colonnes simples. On le dit une fois, ici, ou la cle sert de jointure.
  const nomDe = new Map(fictives.ids.map((id, i) => [Number(id), fictives.noms[i]]));
  // Ce que chaque borne aura a dire aux telephones, une fois la transaction passee.
  const aSignaler = new Map<number, Evenement[]>();
  const signalerA = (borne_id: number, e: Evenement) =>
    (aSignaler.get(borne_id) ?? aSignaler.set(borne_id, []).get(borne_id)!).push(e);

  // Les empreintes se lisent hors transaction, toutes en meme temps : rien de
  // ce qui suit ne change le catalogue, et le pool a des connexions pour ca.
  const empreintes = await Promise.all(
    fictives.ids.map(async (id) => ({ id, empreinte: await empreinteDe(compte_id, id) })));

  await transaction(async (c) => {
    const k = (await c.query<{ demo: boolean; demo_vie: Date | null; tard: boolean }>(`
      SELECT demo, demo_vie,
             (demo_vie IS NULL OR demo_vie < now() - ($2 || ' seconds')::interval) AS tard
        FROM compte WHERE id = $1 FOR UPDATE`, [compte_id, String(PAUSE_S)])).rows[0];
    if (!k?.demo || !k.tard) return;
    const depuis = k.demo_vie ? new Date(k.demo_vie) : new Date(Date.now() - 3600e3);

    // 1. Ce qui est arrive dans les machines, et ce qu'on leur a fait corriger.
    const recus = await c.query<{ genre: string; borne_id: number; lane: number | null; quantite: number }>(`
      WITH t AS (
        UPDATE mouvement m SET confirme_le = now()
          FROM borne b
         WHERE b.lieu_id = m.vers_lieu_id AND b.compte_id = $1 AND ${SQL_FICTIVE}
           AND m.motif = 'transfert' AND m.confirme_le IS NULL AND m.annule_le IS NULL
           AND m.fait_le < now() - ($2 || ' seconds')::interval
         RETURNING b.id AS borne_id, m.lane, m.quantite),
      k AS (
        UPDATE correction_canal k SET applique_le = now()
          FROM borne b
         WHERE b.id = k.borne_id AND b.compte_id = $1 AND ${SQL_FICTIVE} AND k.applique_le IS NULL
         RETURNING k.borne_id, k.lane, k.quantite)
      SELECT 'transfert' AS genre, borne_id, lane, quantite FROM t
      UNION ALL
      SELECT 'correction', borne_id, lane, quantite FROM k`,
      [compte_id, String(CONFIRMATION_S)]);
    const arrives = recus.rows.filter((r) => r.genre === "transfert" && r.lane !== null);
    const corriges = recus.rows.filter((r) => r.genre === "correction");
    for (const borne_id of new Set(arrives.map((a) => a.borne_id))) {
      const siens = arrives.filter((a) => a.borne_id === borne_id);
      signalerA(borne_id, { genre: "chargements", unites: siens.reduce((s, a) => s + a.quantite, 0),
                            spires: new Set(siens.map((a) => a.lane)).size });
    }
    if (arrives.length > 0) {
      await c.query(`
        UPDATE canal c SET quantite = c.quantite + a.n,
                           quantite_borne = COALESCE(c.quantite_borne, c.quantite) + a.n,
                           releve_borne_le = now()
          FROM (SELECT borne, lane, SUM(n)::int AS n
                  FROM unnest($1::bigint[], $2::int[], $3::int[]) AS a(borne, lane, n)
                 GROUP BY borne, lane) a
         WHERE c.borne_id = a.borne AND c.lane = a.lane`,
        [arrives.map((a) => a.borne_id), arrives.map((a) => a.lane), arrives.map((a) => a.quantite)]);
    }
    if (corriges.length > 0) {
      await c.query(`
        UPDATE canal c SET quantite_borne = k.n, releve_borne_le = now()
          FROM unnest($1::bigint[], $2::int[], $3::int[]) AS k(borne, lane, n)
         WHERE c.borne_id = k.borne AND c.lane = k.lane`,
        [corriges.map((k) => k.borne_id), corriges.map((k) => k.lane), corriges.map((k) => k.quantite)]);
    }

    // 2. Ce qui s'est vendu depuis le dernier passage.
    const spires = await c.query<{
      borne_id: number; lane: number; produit_id: number; quantite: number;
      prix_c: number; age_min: number; sku: string; nom: string; rang: number;
    }>(`
      SELECT c.borne_id, c.lane, c.produit_id, c.quantite, p.age_min, p.sku, p.nom,
             COALESCE(pb.prix_c, p.prix_vente_c) AS prix_c,
             (SELECT COUNT(*) FROM borne b2 WHERE b2.compte_id = $1 AND b2.jeton LIKE 'demo\\_%'
                 AND b2.id < b.id)::int AS rang
        FROM canal c
        JOIN borne b ON b.id = c.borne_id
        JOIN produit p ON p.id = c.produit_id AND p.actif
        LEFT JOIN prix_borne pb ON pb.borne_id = b.id AND pb.produit_id = p.id
       WHERE b.compte_id = $1 AND ${SQL_FICTIVE} AND NOT b.hors_service
         AND c.quantite > 0
         AND NOT EXISTS (SELECT 1 FROM borne_masque bm
                          WHERE bm.borne_id = b.id
                            AND (bm.produit_id = p.id OR bm.categorie_id = p.categorie_id))`,
      [compte_id]);

    const parBorne = new Map<number, typeof spires.rows>();
    for (const s of spires.rows) (parBorne.get(s.borne_id) ?? parBorne.set(s.borne_id, []).get(s.borne_id)!).push(s);

    const tir = Math.random;
    const maintenant = Date.now();
    const debut = Math.max(depuis.getTime(), maintenant - 30 * 86400e3);
    const ventes: Vente[] = [];
    const journal: LigneJ[] = [];
    const baisses = new Map<string, { borne: number; lane: number; n: number; chutes: number }>();
    // Ce que chaque borne dira, range par sujet.
    const parSujet = <T,>() => {
      const m = new Map<number, T[]>();
      return (borne_id: number) => m.get(borne_id) ?? m.set(borne_id, []).get(borne_id)!;
    };
    const vendus = parSujet<{ nom: string; prix_c: number; lane: number }>();
    const incidents = parSujet<{ nom: string; prix_c: number; lane: number; statut: string }>();
    const videes = parSujet<{ lane: number; nom: string }>();

    for (let t = debut; t < maintenant; t += 3600e3) {
      const fin = Math.min(t + 3600e3, maintenant);
      const heure = aParis(new Date(t)).h;
      const we = estWeekend(new Date(t));
      for (const [borne_id, liste] of parBorne) {
        const lambda = tauxHoraire(heure, we) * cadenceDe(liste[0].rang) * ((fin - t) / 3600e3);
        const n = poisson(lambda, tir);
        for (let i = 0; i < n; i++) {
          const dispo = liste.filter((s) => s.quantite > 0);
          if (dispo.length === 0) break;
          const s = dispo[Math.floor(tir() * dispo.length)];
          const statut = statutAuSort(tir, s.age_min);
          const quand = new Date(t + tir() * (fin - t));
          const aRegarder = (A_REGARDER as readonly string[]).includes(statut);
          const avantSpirale = !aRegarder && statut !== "distribue";
          if (statut === "distribue") s.quantite--;
          if (statut === "distribue") {
            vendus(borne_id).push({ nom: s.nom, prix_c: s.prix_c, lane: s.lane });
            if (s.quantite === 0) videes(borne_id).push({ lane: s.lane, nom: s.nom });
          } else if (aRegarder) {
            incidents(borne_id).push({ nom: s.nom, prix_c: s.prix_c, lane: s.lane, statut });
          }
          const cle = `${borne_id}:${s.lane}`;
          const d = baisses.get(cle) ?? baisses.set(cle, { borne: borne_id, lane: s.lane, n: 0, chutes: 0 }).get(cle)!;
          if (statut === "distribue") d.n++;
          if (statut === "chute_non_detectee") d.chutes++;
          const cmd = commande(tir);
          const lane = avantSpirale ? null : s.lane;
          ventes.push({ borne: borne_id, cmd, article: 0, lane, produit: s.produit_id,
                        prix: s.prix_c, statut, quand, traite: null, note: null });
          journal.push(...journalDe(borne_id, cmd, quand, s.sku, lane, s.prix_c, statut));
        }
      }
    }

    if (ventes.length > 0) {
      ventes.sort((a, z) => a.quand.getTime() - z.quand.getTime());
      await insererVentes(c, compte_id, ventes, "borne");
      const d = [...baisses.values()];
      await c.query(`
        UPDATE canal c SET
          quantite       = GREATEST(0, c.quantite - d.n),
          quantite_borne = GREATEST(0, COALESCE(c.quantite_borne, c.quantite) - d.n - d.chutes),
          releve_borne_le = now()
          FROM unnest($1::bigint[], $2::int[], $3::int[], $4::int[]) AS d(borne, lane, n, chutes)
         WHERE c.borne_id = d.borne AND c.lane = d.lane`,
        [d.map((x) => x.borne), d.map((x) => x.lane), d.map((x) => x.n), d.map((x) => x.chutes)]);
      await ecrireJournal(c, journal);
      for (const borne_id of parBorne.keys()) {
        if (vendus(borne_id).length > 0)    signalerA(borne_id, { genre: "ventes", ventes: vendus(borne_id) });
        if (incidents(borne_id).length > 0) signalerA(borne_id, { genre: "incidents", incidents: incidents(borne_id) });
        if (videes(borne_id).length > 0)    signalerA(borne_id, { genre: "vides", canaux: videes(borne_id) });
      }
    }

    // 3. Chaque borne a parle, et le compte s'en souvient — une requete.
    await c.query(`
      WITH b AS (
        UPDATE borne b SET vue_le = now(), catalogue_version = e.empreinte,
               maintenance_vu = COALESCE(b.maintenance_pin, b.maintenance_vu),
               reveil_le = NULL, reveil_motif = NULL
          FROM unnest($2::bigint[], $3::text[]) AS e(id, empreinte)
         WHERE b.id = e.id AND b.compte_id = $1
         RETURNING b.id),
      k AS (UPDATE canal c SET releve_le = now() FROM b WHERE c.borne_id = b.id)
      UPDATE compte SET demo_vie = now() WHERE id = $1`,
      [compte_id, empreintes.map((e) => e.id), empreintes.map((e) => e.empreinte)]);
  });

  // Les telephones, une fois tout ecrit. Les bornes fictives previennent comme
  // les vraies : c'est ainsi qu'on voit les notifications marcher avant
  // d'avoir une machine.
  for (const [borne_id, evenements] of aSignaler) {
    void signaler(compte_id, { id: borne_id, nom: nomDe.get(borne_id) ?? "Borne" }, evenements)
      .catch((e) => console.error("notifications :", e instanceof Error ? e.message : e));
  }
}

// ------------------------------------------------------------------ l'etat

export type EtatDemo = {
  demo: boolean; bornes: number; produits: number; ventes: number; mouvements: number;
  membres: number; vide: boolean;
};

/** Ce que le compte contient, pour dire ce qu'on s'apprete a effacer. */
export async function etatDemo(compte_id: number): Promise<EtatDemo> {
  const r = (await q1<Omit<EtatDemo, "vide">>(`
    SELECT k.demo,
           (SELECT COUNT(*)::int FROM borne   WHERE compte_id = $1) AS bornes,
           (SELECT COUNT(*)::int FROM produit WHERE compte_id = $1) AS produits,
           (SELECT COUNT(*)::int FROM vente v JOIN borne b ON b.id = v.borne_id
             WHERE b.compte_id = $1) AS ventes,
           (SELECT COUNT(*)::int FROM mouvement WHERE compte_id = $1) AS mouvements,
           (SELECT COUNT(*)::int FROM membre WHERE compte_id = $1) AS membres
      FROM compte k WHERE k.id = $1`, [compte_id]))!;
  return { ...r, vide: r.bornes === 0 && r.produits === 0 && r.mouvements === 0 };
}
