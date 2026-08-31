// Jeu d'essai. Efface tout et refait : la base de developpement doit pouvoir
// repartir a zero sans ceremonie.
import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
await c.connect();

const chiffrer = (mdp) => {
  const sel = randomBytes(16).toString("hex");
  return sel + ":" + scryptSync(mdp, sel, 64).toString("hex");
};
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = (n = 8) => {
  const o = randomBytes(n);
  let s = ""; for (let i = 0; i < n; i++) s += alphabet[o[i] % alphabet.length];
  return n === 8 ? s.slice(0, 4) + "-" + s.slice(4) : s;
};

const un = async (sql, p = []) => (await c.query(sql, p)).rows[0];

try {
  await c.query("BEGIN");
  await c.query("TRUNCATE mouvement, vente, canal, borne, lieu, produit, categorie, appairage, session, invitation, utilisateur, compte RESTART IDENTITY CASCADE");

  const MDP = "redbox";
  const compte = (await un("INSERT INTO compte (nom) VALUES ($1) RETURNING id", ["Outil Digital"])).id;
  for (const [email, role] of [["contact.outildigital@gmail.com", "proprietaire"],
                               ["reassort@exemple.fr", "reassort"]])
    await c.query("INSERT INTO utilisateur (compte_id, email, mdp, role) VALUES ($1,$2,$3,$4)",
                  [compte, email, chiffrer(MDP), role]);

  const reserve = (await un(
    "INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'reserve','Ma réserve') RETURNING id", [compte])).id;

  // L'ordre compte : c'est celui dans lequel la borne les presente au client.
  const cats = [["Vapes", 10], ["Poppers", 20], ["Batteries", 30],
                ["Hygiène", 40], ["Briquets", 50], ["Accessoires", 60]];
  const cid = {};
  for (const [nom, ordre] of cats)
    cid[nom] = (await un("INSERT INTO categorie (compte_id, nom, ordre) VALUES ($1,$2,$3) RETURNING id",
                         [compte, nom, ordre])).id;

  // sku, nom, categorie, prix de vente, age, prix d'achat, quantite achetee
  //
  // Les quantites varient : on n'achete pas autant de powerbanks a neuf euros
  // piece que de lingettes a quatre-vingt-dix centimes. Sans cette difference,
  // tous les produits ont la meme autonomie et le tableau de bord n'a plus rien
  // a dire.
  const produits = [
    ["VAPE-MEN",  "Puff 600 · Menthe",        "Vapes",       1290, 18, 410, 180],
    ["VAPE-FRU",  "Puff 600 · Fruits rouges", "Vapes",       1290, 18, 410, 180],
    ["VAPE-PAS",  "Puff 600 · Pastèque",      "Vapes",       1290, 18, 410, 120],
    ["VAPE-MAN",  "Puff 1500 · Mangue",       "Vapes",       1890, 18, 620, 70],
    ["POP-15",    "Poppers 15 ml",            "Poppers",     1490, 18, 480, 80],
    ["PWR-5000",  "Powerbank 5000 mAh",       "Batteries",   2490,  0, 890, 26],
    ["PWR-10000", "Powerbank 10000 mAh",      "Batteries",   3490,  0, 1290, 18],
    ["HYG-PRE",   "Préservatifs x3",          "Hygiène",      690,  0, 150, 120],
    ["HYG-LIN",   "Lingettes x10",            "Hygiène",      390,  0,  90, 80],
    ["BRQ-TEMP",  "Briquet tempête",          "Briquets",     490,  0, 120, 60],
    ["ACC-USBC",  "Câble USB-C 1 m",          "Accessoires",  990,  0, 260, 34],
  ];
  const id = {};
  for (const [sku, nom, cat, prix, age, achat, achete] of produits) {
    id[sku] = (await un(`INSERT INTO produit (compte_id, sku, nom, categorie_id, prix_vente_c, age_min)
                         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
                        [compte, sku, nom, cid[cat], prix, age])).id;
    // Une premiere livraison, il y a trois semaines.
    await c.query(`INSERT INTO mouvement (compte_id, produit_id, vers_lieu_id, quantite, motif,
                                          prix_achat_c, reference, par, fait_le, confirme_le)
                   VALUES ($1,$2,$3,$4,'reception',$5,'BL-2026-0114',$6,
                           now() - interval '21 days', now() - interval '21 days')`,
                  [compte, id[sku], reserve, achete, achat, "contact.outildigital@gmail.com"]);
  }

  // Borne 1 : appairee, elle parle.
  const lieu1 = (await un("INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'borne','Le Duplex') RETURNING id", [compte])).id;
  const jeton = "demo_" + randomBytes(12).toString("base64url");
  const b1 = (await un(`INSERT INTO borne (compte_id, lieu_id, nom, adresse, jeton, appairee_le, vue_le, version)
                        VALUES ($1,$2,'RedBox — Le Duplex','Paris 11e',$3, now(), now(), '5.0') RETURNING id`,
                       [compte, lieu1, jeton])).id;

  // Borne 2 : appairee elle aussi, mais dans un lieu moins passant.
  const lieu2 = (await un("INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'borne','Le Sous-Marin') RETURNING id", [compte])).id;
  const jeton2 = "demo_" + randomBytes(12).toString("base64url");
  const b2 = (await un(`INSERT INTO borne (compte_id, lieu_id, nom, adresse, jeton, appairee_le, vue_le, version)
                        VALUES ($1,$2,'RedBox — Le Sous-Marin','Montreuil',$3, now(), now(), '5.0') RETURNING id`,
                       [compte, lieu2, jeton2])).id;

  // Borne 3 : livree, pas encore branchee.
  const lieu3 = (await un("INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'borne','Chez Marcel') RETURNING id", [compte])).id;
  const c3 = code();
  await c.query(`INSERT INTO borne (compte_id, lieu_id, nom, adresse, code_appairage)
                 VALUES ($1,$2,'RedBox — Chez Marcel','Lyon 7e',$3)`, [compte, lieu3, c3]);

  // Planogramme de la borne 1, et le transfert qui l'a remplie.
  const plan = [
    [1, "VAPE-MEN", 10], [2, "VAPE-FRU", 10], [3, "VAPE-PAS", 10], [4, "VAPE-MAN", 10],
    [11, "POP-15", 10], [21, "PWR-5000", 6], [22, "PWR-10000", 4],
    [31, "HYG-PRE", 10], [32, "HYG-LIN", 10], [42, "BRQ-TEMP", 10], [51, "ACC-USBC", 10],
  ];
  // Les deux machines partagent le meme planogramme ; seule leur frequentation
  // differe. C'est le cas courant : un exploitant deploie la meme selection.
  const machines = [
    { borne: b1, lieu: lieu1, nom: "Le Duplex",    cadence: 1 },
    { borne: b2, lieu: lieu2, nom: "Le Sous-Marin", cadence: 0.55 },
  ];
  for (const m of machines) {
    for (const [lane, sku] of plan) {
      await c.query(`INSERT INTO canal (borne_id, lane, rangee, colonne, produit_id, quantite, capacite, seuil_bas, releve_le)
                     VALUES ($1,$2,$3,$4,$5,0,10,2, now())`,
                    [m.borne, lane, Math.ceil(lane / 10), ((lane - 1) % 10) + 1, id[sku]]);
    }
  }

  // Trois semaines d'exploitation : des ventes tous les jours, une tournee de
  // reassort chaque semaine.
  //
  // Tout est accumule en memoire puis insere en DEUX requetes. La base est a New
  // York : six cents allers-retours depuis Paris, c'est une minute d'attente pour
  // un jeu d'essai. `unnest` deplie un tableau de parametres en autant de lignes.
  let graine = 20260901;
  const tir = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;

  const maintenant = Date.now();
  const instant = (j, h) => new Date(maintenant - j * 86400e3)
    .toISOString().slice(0, 11) + String(h).padStart(2, "0") + ":00:00Z";

  // La reserve se suit ici aussi : on ne peut pas transferer ce qu'on n'a pas.
  // C'est la regle du vrai systeme ; un jeu d'essai qui s'en affranchit produit
  // des stocks negatifs et fait passer pour normal un etat impossible. Elle est
  // COMMUNE aux deux machines — c'est bien le meme carton qu'on partage.
  const enReserve = new Map(produits.map(([sku, , , , , , achete]) => [sku, achete]));

  const transferts = [];   // [produit_id, quantite, lane, iso, lieu]
  const ventes = [];       // [borne, commande, lane, produit_id, prix, statut, iso]
  let n = 0;

  for (const m of machines) {
    // Le chargement initial obeit a la meme regle que les tournees : on ne sort
    // de la reserve que ce qu'elle contient. Deux machines y puisent.
    const restant = new Map();
    for (const [lane, sku, charge] of plan) {
      const pris = Math.min(charge, enReserve.get(sku));
      enReserve.set(sku, enReserve.get(sku) - pris);
      restant.set(lane, pris);
      if (pris > 0) transferts.push([id[sku], pris, lane, instant(20, 9), m.lieu]);
    }

    for (let j = 20; j >= 0; j--) {
      // Tournee : on remet chaque canal a ras, et ca sort de la reserve.
      if (j % 7 === 0 && j !== 20) {
        for (const [lane, sku] of plan) {
          const manque = Math.min(10 - restant.get(lane), enReserve.get(sku));
          if (manque <= 0) continue;
          restant.set(lane, restant.get(lane) + manque);
          enReserve.set(sku, enReserve.get(sku) - manque);
          transferts.push([id[sku], manque, lane, instant(j, 9), m.lieu]);
        }
      }

      const weekend = j % 7 === 5 || j % 7 === 6;
      const brut = Math.floor(tir() * (weekend ? 16 : 9)) + (weekend ? 8 : 3);
      const combien = Math.max(1, Math.round(brut * m.cadence));
      for (let k = 0; k < combien; k++) {
        const i = Math.floor(tir() * plan.length);
        const [lane, sku] = plan[i];
        const de = tir();
        const statut = de < 0.03 ? "litige" : de < 0.05 ? "non_distribue" : "distribue";
        const heure = 10 + Math.floor(tir() * 13);
        const quand = instant(j, heure);
        if (new Date(quand).getTime() > maintenant) continue;
        // Canal vide : le client repart les mains vides, il n'y a pas de vente.
        if (statut === "distribue" && restant.get(lane) <= 0) continue;
        if (statut === "distribue") restant.set(lane, restant.get(lane) - 1);
        ventes.push([m.borne, "ORD-" + String(++n).padStart(4, "0"), lane, id[sku],
                     produits.find((p) => p[0] === sku)[3], statut, quand]);
      }
    }
  }

  const col = (i) => transferts.map((t) => t[i]);
  if (transferts.length > 0)
    await c.query(`
      INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, vers_lieu_id, quantite,
                             motif, lane, par, fait_le, confirme_le)
      SELECT $1, t.produit, $2, t.lieu, t.quantite, 'transfert', t.lane, $3, t.quand, t.quand
        FROM unnest($4::bigint[], $5::int[], $6::int[], $7::timestamptz[], $8::bigint[])
             AS t(produit, quantite, lane, quand, lieu)`,
      [compte, reserve, "reassort@exemple.fr", col(0), col(1), col(2), col(3), col(4)]);

  const cv = (i) => ventes.map((v) => v[i]);
  await c.query(`
    INSERT INTO vente (borne_id, commande_id, lane, produit_id, prix_c, statut, faite_le)
    SELECT v.borne, v.cmd, v.lane, v.produit, v.prix, v.statut, v.quand
      FROM unnest($1::bigint[], $2::text[], $3::int[], $4::bigint[], $5::int[], $6::text[], $7::timestamptz[])
           AS v(borne, cmd, lane, produit, prix, statut, quand)`,
    [cv(0), cv(1), cv(2), cv(3), cv(4), cv(5), cv(6)]);

  // Le mouvement de vente se deduit des ventes deja inserees : il est rattache a
  // chacune, donc jamais compte deux fois.
  await c.query(`
    INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, quantite, motif,
                           lane, par, fait_le, confirme_le, vente_id)
    SELECT $1, v.produit_id, b.lieu_id, 1, 'vente', v.lane, 'borne', v.faite_le, v.faite_le, v.id
      FROM vente v JOIN borne b ON b.id = v.borne_id
     WHERE b.compte_id = $1 AND v.statut = 'distribue' AND v.produit_id IS NOT NULL`,
    [compte]);

  // Les compteurs de la machine suivent ses ventes.
  // Le compteur de la machine, c'est tout ce qui lui a ete transfere moins tout
  // ce qu'elle a vendu. Il doit tomber exactement sur le stock theorique : c'est
  // le seul etat ou l'ecart machine/grand livre vaut zero.
  await c.query(`UPDATE canal c SET quantite = GREATEST(0,
                   COALESCE((SELECT SUM(m.quantite)::int FROM mouvement m
                               JOIN borne b ON b.lieu_id = m.vers_lieu_id
                              WHERE b.id = c.borne_id AND m.lane = c.lane
                                AND m.motif = 'transfert' AND m.confirme_le IS NOT NULL), 0)
                 - (SELECT COUNT(*)::int FROM vente v
                     WHERE v.borne_id = c.borne_id AND v.lane = c.lane AND v.statut = 'distribue'))
                 WHERE c.borne_id IN ($1, $2)`, [b1, b2]);

  // Un transfert saisi mais pas encore confirme : le cas qu'il ne faut jamais perdre de vue.
  await c.query(`INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, vers_lieu_id, quantite,
                                        motif, lane, par, fait_le)
                 VALUES ($1,$2,$3,$4,4,'transfert',3,$5, now() - interval '40 minutes')`,
                [compte, id["VAPE-PAS"], reserve, lieu1, "reassort@exemple.fr"]);

  await c.query("COMMIT");

  const s = await un(`SELECT
      (SELECT COUNT(*) FROM produit)::int   AS produits,
      (SELECT COUNT(*) FROM mouvement)::int AS mouvements,
      (SELECT COUNT(*) FROM vente)::int     AS ventes`);
  console.log("Base    :", (process.env.DATABASE_URL_UNPOOLED ?? "").split("@")[1]?.split("/")[0]);
  console.log("Compte  : contact.outildigital@gmail.com / " + MDP + "   (propriétaire)");
  console.log("          reassort@exemple.fr / " + MDP + "   (réassort)");
  // Un jeu d'essai qui laisse un stock negatif ne prouve rien : il ferait passer
  // pour normal un etat qui ne doit jamais arriver.
  const negatif = await un("SELECT COUNT(*)::int n FROM v_stock WHERE quantite < 0");
  if (negatif.n > 0) throw new Error(negatif.n + " stock(s) negatif(s) — le tirage est faux");

  console.log("Contenu :", s.produits, "produits,", s.mouvements, "mouvements,", s.ventes, "ventes");
  console.log("Borne 1 appairée (Le Duplex)      :", jeton);
  console.log("Borne 2 appairée (Le Sous-Marin)  :", jeton2);
  console.log("Borne 3 à appairer (Chez Marcel)  :", c3);
} catch (e) {
  await c.query("ROLLBACK");
  console.error("Jeu d'essai refusé :", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
