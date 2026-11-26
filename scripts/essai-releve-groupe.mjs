// Le releve des ventes, lot entier, contre une console qui tourne.
//
//   DATABASE_URL=postgresql://...@localhost/redbox_test node scripts/essai-releve-groupe.mjs http://localhost:4399 [--ecrire f | --comparer f]
//
// Il ecrit dans la base : il refuse tout ce qui n'est pas local. Il pose son
// propre compte (une borne neuve a chaque passage) et n'efface rien.
//
// CE QU'IL PROUVE. Un lot comme en envoie une borne — doublon, vente illisible au
// milieu, statut inconnu, SKU inconnu, sans canal, une spire qui passe son seuil,
// une qui se vide — puis le MEME lot renvoye, comme apres une coupure reseau. Le
// second envoi ne doit rien ajouter. `--ecrire` garde l'etat obtenu (ventes,
// mouvements, canaux, messages du salon) ; `--comparer` exige le meme a la
// virgule pres : c'est ainsi qu'on montre qu'une reecriture de la route ne
// change rien a ce qu'elle laisse en base.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";

const base = process.argv[2] ?? "http://localhost:4310";
const [mode, fichier] = process.argv.slice(3);
const url = process.env.DATABASE_URL ?? "";
if (!/@?(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("refusé : DATABASE_URL doit être une base locale.");
  process.exit(1);
}
const c = new pg.Client({ connectionString: url });
await c.connect();
const un = async (sql, p = []) => (await c.query(sql, p)).rows[0];
const tous = async (sql, p = []) => (await c.query(sql, p)).rows;

// ------------------------------------------------------------------ le decor
const compte = (await un("INSERT INTO compte (nom) VALUES ('Essai relevé') RETURNING id")).id;
const lieu = (await un("INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'borne','Essai') RETURNING id", [compte])).id;
const jeton = "essai_" + randomBytes(16).toString("hex");
const borne = (await un(`INSERT INTO borne (compte_id, lieu_id, nom, jeton, appairee_le, version)
                         VALUES ($1,$2,'Essai relevé',$3, now(), '5.20') RETURNING id`, [compte, lieu, jeton])).id;
const produit = {};
for (const [sku, nom] of [["COLA", "Cola"], ["EAU", "Eau"], ["CHIPS", "Chips"]]) {
  produit[sku] = (await un("INSERT INTO produit (compte_id, sku, nom) VALUES ($1,$2,$3) RETURNING id", [compte, sku, nom])).id;
}
// 11 : 3 colas, seuil 2 — la premiere vente le franchit. 12 : 1 eau — videe,
// puis vendue encore a zero. 13 : 5 chips.
for (const [lane, sku, quantite] of [[11, "COLA", 3], [12, "EAU", 1], [13, "CHIPS", 5]]) {
  await c.query(`INSERT INTO canal (borne_id, lane, rangee, colonne, produit_id, quantite, capacite, seuil_bas)
                 VALUES ($1,$2,2,$3,$4,$5,10,2)`, [borne, lane, lane - 10, produit[sku], quantite]);
}

const h = (s) => `2026-11-20 10:00:${String(s).padStart(2, "0")}`;
const ventes = [
  { commande_id: "CMD1", article: 1, lane: 11, sku: "COLA", prix_centimes: 250, statut: "distribue", faite_le: h(1) },
  { commande_id: "CMD1", article: 2, lane: 11, sku: "COLA", prix_centimes: 250, statut: "distribue", faite_le: h(1) },
  { commande_id: "CMD2", article: 1, lane: 12, sku: "EAU", prix_centimes: 150, statut: "distribue", faite_le: h(2) },
  { commande_id: "CMDX", article: 1, lane: 12, sku: "EAU", prix_centimes: -5, statut: "distribue", faite_le: h(3) },  // illisible
  { commande_id: "CMD3", article: 1, lane: 12, sku: "EAU", prix_centimes: 150, statut: "distribue", faite_le: h(4) },
  { commande_id: "CMD4", article: 1, lane: 13, sku: "CHIPS", prix_centimes: 180, statut: "litige", faite_le: h(5) },
  { commande_id: "CMD5", article: 1, lane: null, sku: "COLA", prix_centimes: 250, statut: "carte_refusee", faite_le: h(6) },
  { commande_id: "CMD6", article: 1, lane: 13, sku: "INCONNU", prix_centimes: 99, statut: "distribue", faite_le: h(7) },
  { commande_id: "CMD7", article: 1, lane: 13, prix_centimes: 120, statut: "distribue", faite_le: h(8) },
  { commande_id: "CMD1", article: 1, lane: 11, sku: "COLA", prix_centimes: 250, statut: "distribue", faite_le: h(1) },  // doublon
  { commande_id: "CMD8", article: 1, lane: 13, sku: "CHIPS", prix_centimes: 180, statut: "bidon", faite_le: h(9) },
  { commande_id: "CMD9", lane: 13, sku: "CHIPS", prix_centimes: 180, statut: "distribue", faite_le: h(10) },
  { commande_id: "CMD10", article: 1, lane: 13, sku: "CHIPS", prix_centimes: 180, statut: "non_distribue", faite_le: h(11) },
];

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function envoyer() {
  const r = await fetch(`${base}/api/borne/etat`, {
    method: "POST", headers: { authorization: `Bearer ${jeton}`, "content-type": "application/json" },
    body: JSON.stringify({ version: "5.20", ventes }),
  });
  assert.equal(r.status, 200, `releve : ${r.status} ${await r.clone().text()}`);
  const j = await r.json();
  await attendre(1500);   // les messages du salon partent apres la reponse
  return j.ventes_retenues;
}

async function etat() {
  return {
    ventes: await tous(`
      SELECT v.commande_id, to_jsonb(v)->'article' AS article, v.lane, p.sku, v.prix_c, v.statut,
             to_char(v.faite_le AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS faite_le, v.traite_le
        FROM vente v LEFT JOIN produit p ON p.id = v.produit_id
       WHERE v.borne_id = $1 ORDER BY v.id`, [borne]),
    mouvements: await tous(`
      SELECT p.sku, m.de_lieu_id = $2 AS de_la_borne, m.vers_lieu_id, m.quantite, m.motif, m.lane, m.par,
             to_char(m.fait_le AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS fait_le,
             to_char(m.confirme_le AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS confirme_le,
             v.commande_id, to_jsonb(v)->'article' AS article
        FROM mouvement m JOIN produit p ON p.id = m.produit_id LEFT JOIN vente v ON v.id = m.vente_id
       WHERE m.compte_id = $1 ORDER BY m.id`, [compte, lieu]),
    canaux: await tous(`
      SELECT c.lane, p.sku, c.quantite, c.quantite_borne, c.capacite, c.seuil_bas
        FROM canal c LEFT JOIN produit p ON p.id = c.produit_id WHERE c.borne_id = $1 ORDER BY c.lane`, [borne]),
    messages: (await tous(`
      SELECT m.texte FROM message m JOIN salon s ON s.id = m.salon_id WHERE s.borne_id = $1 ORDER BY m.id`, [borne]))
      .map((m) => m.texte),
  };
}

// ------------------------------------------------------------------ le lot
const premier = await envoyer();
const apres1 = await etat();
const second = await envoyer();
const apres2 = await etat();

// Ce qui ne depend pas du code d'avant.
assert.ok(premier > 0, "le premier envoi retient des ventes");
// Une base d'avant la 5.13 (pas de colonne `article`) a une cle ou deux NULL
// different : la vente sans canal y rentre a chaque envoi. C'est le defaut que
// la migration corrige ; l'instantane le fige tel quel.
const migree = !!(await un(`SELECT 1 FROM information_schema.columns
                             WHERE table_name = 'vente' AND column_name = 'article'`));
if (migree) {
  assert.equal(second, 0, "le lot renvoyé ne retient rien");
  assert.deepEqual(apres2.ventes, apres1.ventes, "lot renvoyé : aucune vente en plus");
  assert.deepEqual(apres2.mouvements, apres1.mouvements, "lot renvoyé : aucun mouvement en plus");
  assert.deepEqual(apres2.canaux, apres1.canaux, "lot renvoyé : les canaux n'ont pas bougé");
}
assert.ok(!apres1.ventes.some((v) => v.commande_id === "CMDX"), "la vente illisible est écartée");
assert.ok(apres1.ventes.some((v) => v.commande_id === "CMD3"), "la vente d'après l'illisible est retenue");
assert.ok(!apres1.ventes.some((v) => v.commande_id === "CMD8"), "le statut inconnu est écarté");
assert.equal(apres1.ventes.length, premier, "ventes_retenues = lignes écrites");
const distribuees = apres1.ventes.filter((v) => v.statut === "distribue" && v.sku).length;
assert.equal(apres1.mouvements.length, distribuees, "un mouvement par vente distribuée d'un produit connu");

const resultat = { premier, second, apres1, apres2 };
if (mode === "--ecrire") {
  writeFileSync(fichier, JSON.stringify(resultat, null, 2));
  console.log(`essai-releve-groupe : état écrit dans ${fichier}`);
} else if (mode === "--comparer") {
  assert.deepEqual(resultat, JSON.parse(readFileSync(fichier, "utf8")), "même état que l'instantané");
  console.log(`essai-releve-groupe : identique à ${fichier}`);
}
console.log(`essai-releve-groupe : tout est vert (${premier} ventes retenues)`);
await c.end();
