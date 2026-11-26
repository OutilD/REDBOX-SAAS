// Les filtres de la page Ventes et de son export, contre une console qui tourne.
//
//   DATABASE_URL=postgresql://...@localhost/redbox_test node scripts/essai-ventes-filtres.mjs http://localhost:4399
//
// Il ecrit dans la base : il refuse tout ce qui n'est pas local. Il pose ses
// propres comptes (suffixe au hasard) et n'efface rien : on le rejoue tel quel.
//
// LA PORTEE D'ABORD. Deux exploitants portent le meme numero de commande : aucun
// filtre — recherche, borne, produit, statut, dates — ne doit faire voir a l'un
// la vente de l'autre, ni dans la page, ni dans le fichier.
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";

const base = process.argv[2] ?? "http://localhost:4310";
const url = process.env.DATABASE_URL ?? "";
if (!/@?(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("refusé : DATABASE_URL doit être une base locale.");
  process.exit(1);
}
const c = new pg.Client({ connectionString: url });
await c.connect();
const un = async (sql, p = []) => (await c.query(sql, p)).rows[0];
const x = randomBytes(3).toString("hex").toUpperCase();

// ------------------------------------------------------------------ le decor
async function exploitant(nom) {
  const compte = (await un("INSERT INTO compte (nom) VALUES ($1) RETURNING id", [`${nom} ${x}`])).id;
  const lieu = async () => (await un("INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'borne',$2) RETURNING id", [compte, nom])).id;
  const borne = async (n) => (await un("INSERT INTO borne (compte_id, lieu_id, nom) VALUES ($1,$2,$3) RETURNING id",
                                       [compte, await lieu(), `${n} ${x}`])).id;
  const produit = async (sku, n) => (await un("INSERT INTO produit (compte_id, sku, nom) VALUES ($1,$2,$3) RETURNING id",
                                              [compte, `${sku}-${x}`, `${n} ${x}`])).id;
  return { compte, borne, produit };
}
async function personne(compte, role, bornes = []) {
  const u = (await un("INSERT INTO utilisateur (compte_id, email, mdp, role) VALUES ($1,$2,'x',$3) RETURNING id",
                      [compte, `${role}-${randomBytes(4).toString("hex")}@essai.local`, role])).id;
  await c.query("INSERT INTO membre (utilisateur_id, compte_id, role) VALUES ($1,$2,$3)", [u, compte, role]);
  for (const b of bornes) await c.query("INSERT INTO acces_borne (utilisateur_id, borne_id) VALUES ($1,$2)", [u, b]);
  const jeton = "essai_" + randomBytes(16).toString("hex");
  await c.query("INSERT INTO session (jeton, utilisateur_id, expire_le, compte_id) VALUES ($1,$2, now() + interval '1 hour',$3)",
                [jeton, u, compte]);
  return `rbx=${jeton}`;
}
// `quand` : un intervalle avant maintenant, ou une heure de Paris.
async function vente(borne, commande, produit, statut, prix, quand = "1 hour") {
  const t = /^\d{4}-/.test(quand) ? `$6::timestamp AT TIME ZONE 'Europe/Paris'` : `now() - $6::interval`;
  await c.query(`INSERT INTO vente (borne_id, commande_id, lane, produit_id, prix_c, statut, faite_le)
                 VALUES ($1,$2,11,$3,$4,$5,${t})`, [borne, commande, produit, prix, statut, quand]);
}

const A = await exploitant("Alpha"), B = await exploitant("Bravo");
const a1 = await A.borne("Comptoir"), a2 = await A.borne("Terrasse"), b1 = await B.borne("Etranger");
const pa = await A.produit("COLA", "Cola"), pa2 = await A.produit("EAU", "Eau"), pb = await B.produit("COLA", "Cola B");
const C = (s) => `CMD-${s}-${x}`;
await vente(a1, C("A1"), pa, "distribue", 250);
await vente(a1, C("A1L"), pa2, "litige", 180, "2 hours");
await vente(a2, C("A2"), pa2, "distribue", 150, "3 hours");
await vente(a1, C("COMMUN"), pa, "distribue", 111, "4 hours");
await vente(b1, C("COMMUN"), pb, "distribue", 999, "4 hours");
await vente(b1, C("B1"), pb, "distribue", 777);
await vente(a1, C("JANV"), pa, "distribue", 300, "2026-01-15T10:00");   // pour les dates sur mesure

const moiA = await personne(A.compte, "proprietaire");
const restreint = await personne(A.compte, "lecture", [a1]);

// ---------------------------------------------------------------- les outils
const lire = (cookie, chemin) => fetch(base + chemin, { headers: { cookie }, redirect: "manual" });
/** Les numeros de commande du fichier, et leur ligne. */
async function exporter(cookie, params) {
  const r = await lire(cookie, `/api/ventes/export?${params}`);
  assert.equal(r.status, 200, `export ${params} : ${r.status}`);
  const lignes = (await r.text()).split("\r\n").slice(2).filter(Boolean).map((l) => l.split(";"));
  return new Map(lignes.map((l) => [l[9], l]));
}
async function page(cookie, params) {
  const r = await lire(cookie, `/ventes?${params}`);
  assert.equal(r.status, 200, `/ventes?${params} : ${r.status}`);
  return r.text();
}
const tout = [C("A1"), C("A1L"), C("A2"), C("COMMUN"), C("B1"), C("JANV")];
/** Les commandes du decor presentes dans la page. */
const dansPage = (html) => tout.filter((k) => html.includes(k));
/** Celles de la liste des transactions seulement : « À regarder » ne suit pas la periode. */
const transactions = (html) => {
  const i = html.indexOf('id="transactions"');
  assert.ok(i >= 0, "la page a une liste des transactions");
  const fin = html.indexOf("<h2", i);
  return dansPage(html.slice(i, fin < 0 ? undefined : fin));
};
const memes = (a, b, msg) => assert.deepEqual([...a].sort(), [...b].sort(), msg);

// ------------------------------------------------------------- la recherche
let e = await exporter(moiA, `f=30&q=${C("COMMUN")}`);
memes(e.keys(), [C("COMMUN")], "q : la commande commune");
assert.equal(e.get(C("COMMUN"))[1], `Comptoir ${x}`, "q : la vente d'Alpha, pas celle de Bravo");
assert.equal(e.get(C("COMMUN"))[5], "1,11", "q : le prix d'Alpha");
assert.ok(!(await page(moiA, `f=30&q=${C("COMMUN")}`)).includes("9,99"), "page : le prix de Bravo ne fuit pas");

memes((await exporter(moiA, `f=30&q=${C("B1")}`)).keys(), [], "q : une commande de Bravo ne se trouve pas chez Alpha");
memes((await exporter(moiA, `f=30&q=${C("A1").toLowerCase()}`)).keys(), [C("A1")], "q : sans tenir compte de la casse");
memes((await exporter(moiA, `f=30&q=${encodeURIComponent("%")}`)).keys(), [], "q : « % » est un caractère, pas un joker");

// ------------------------------------------------------------- la portee
memes((await exporter(moiA, `f=30&b=${b1}`)).keys(), [], "b : une borne de Bravo ne montre rien à Alpha");
memes((await exporter(moiA, `f=30&b=${b1}&q=${C("B1")}`)).keys(), [], "b + q : toujours rien");
memes((await exporter(moiA, `f=30&produit=${pb}`)).keys(), [], "produit : celui de Bravo ne montre rien à Alpha");
assert.deepEqual(dansPage(await page(moiA, `f=30&b=${b1}`)).filter((k) => k.includes("B1")), [], "page : rien de Bravo");
assert.deepEqual(dansPage(await page(moiA, `f=30&produit=${pb}`)), [], "page : produit étranger, rien");

memes((await exporter(restreint, "f=30")).keys(), [C("A1"), C("A1L"), C("COMMUN")], "restreint : sa borne seulement");
memes((await exporter(restreint, `f=30&b=${a2}`)).keys(), [], "restreint : pas la borne qu'on ne lui a pas ouverte");
assert.ok(!dansPage(await page(restreint, `f=30&b=${a2}`)).includes(C("A2")), "restreint : la page ne montre pas la terrasse");

// ------------------------------------------------------------- statut, produit
memes((await exporter(moiA, "f=30&statut=litige")).keys(), [C("A1L")], "statut : litige");
memes((await exporter(moiA, "f=30&statut=nimporte")).keys(), [C("A1"), C("A1L"), C("A2"), C("COMMUN")], "statut inconnu : ignoré");
memes((await exporter(moiA, `f=30&produit=${pa2}`)).keys(), [C("A1L"), C("A2")], "produit");

// ------------------------------------------------------------- dates sur mesure
memes((await exporter(moiA, "du=2026-01-15T09:00&au=2026-01-15T11:00")).keys(), [C("JANV")], "du/au : dans la période");
memes((await exporter(moiA, "du=2026-01-15T11:00&au=2026-01-15T09:00")).keys(), [C("JANV")], "du/au : à l'envers, remis à l'endroit");
memes((await exporter(moiA, "du=2026-01-15T10:01&au=2026-01-15T12:00")).keys(), [], "du/au : hors période");
assert.ok(!(await exporter(moiA, "f=30")).has(C("JANV")), "30 jours : la vente de janvier n'y est pas");

// ------------------------------------------------------------- page = export
for (const params of ["f=30", `f=30&produit=${pa2}`, "f=30&statut=litige", "f=30&q=CMD-A1",
                      "du=2026-01-15T09:00&au=2026-01-15T11:00"]) {
  memes(transactions(await page(moiA, params)), (await exporter(moiA, params)).keys(), `page et export : ${params}`);
}
// Les liens d'export de la page portent les filtres en cours.
assert.ok((await page(moiA, `f=7&statut=litige&produit=${pa2}`))
  .includes(`/api/ventes/export?f=7&amp;statut=litige&amp;produit=${pa2}`), "le lien d'export garde les filtres");

console.log("essai-ventes-filtres : tout est vert");
await c.end();
