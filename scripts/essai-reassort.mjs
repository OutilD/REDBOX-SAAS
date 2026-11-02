// Le reassort sans reserve, de bout en bout, contre une console qui tourne.
//
//   DATABASE_URL=postgresql://...@127.0.0.1/... node scripts/essai-reassort.mjs http://localhost:4399
//
// Il ecrit dans la base : il refuse tout ce qui n'est pas local. Il attend un
// compte issu de scripts/seed.mjs.
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";

const base = process.argv[2] ?? "http://localhost:4310";
const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("refusé : DATABASE_URL doit être une base locale.");
  process.exit(1);
}
const c = new pg.Client({ connectionString: url });
await c.connect();
const un = async (sql, p = []) => (await c.query(sql, p)).rows[0];

const moi = await un(`SELECT u.id, m.compte_id FROM utilisateur u JOIN membre m ON m.utilisateur_id = u.id
                       WHERE m.role = 'proprietaire' ORDER BY u.id LIMIT 1`);
const jeton = "essai_" + randomBytes(16).toString("hex");
await c.query("INSERT INTO session (jeton, utilisateur_id, expire_le, compte_id) VALUES ($1,$2, now() + interval '1 hour',$3)",
              [jeton, moi.id, moi.compte_id]);
const cookie = `rbx=${jeton}`;

const lire = (chemin) => fetch(base + chemin, { headers: { cookie }, redirect: "manual" });
const poster = (chemin, champs) => fetch(base + chemin, {
  method: "POST", redirect: "manual", headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(champs).toString(),
});

// ---------------------------------------------------------------- les pages
const borne = await un("SELECT id, jeton, lieu_id FROM borne WHERE compte_id = $1 AND jeton IS NOT NULL ORDER BY id LIMIT 1", [moi.compte_id]);
for (const p of ["/", "/analytiques", "/ventes", "/bornes", `/bornes/${borne.id}`, `/bornes/${borne.id}/charger`,
                 "/charger", "/reassort", `/reassort/fiche?b=${borne.id}`, "/reglages/catalogue",
                 "/reglages/categories", "/menu"]) {
  const r = await lire(p);
  assert.ok(r.status === 200 || r.status === 307, `${p} : ${r.status}`);
  if (r.status === 200) {
    const t = await r.text();
    for (const mot of ["Marge", "marge estimée", "chez moi", "Enregistrer une réception", "/reception", "/stock"]) {
      assert.ok(!t.includes(mot), `${p} contient encore « ${mot} »`);
    }
  }
}
for (const p of ["/stock", "/reception", "/reception/historique"]) {
  assert.equal((await lire(p)).status, 404, p);
}
for (const p of ["/api/ventes/export?f=30", "/api/ventes/export?resume=1"]) {
  const t = await (await lire(p)).text();
  assert.ok(!/marge|achat/i.test(t), `${p} parle encore de marge`);
}

// ------------------------------------------------------- on ajoute sans reserve
const lane = 1;
await c.query("UPDATE canal SET quantite = 3, capacite = 10 WHERE borne_id = $1 AND lane = $2", [borne.id, lane]);
await c.query("UPDATE mouvement SET annule_le = now() WHERE vers_lieu_id = $1 AND confirme_le IS NULL", [borne.lieu_id]);
const canal = async () => (await un("SELECT quantite FROM canal WHERE borne_id = $1 AND lane = $2", [borne.id, lane])).quantite;
const ouverts = () => c.query(`SELECT id, quantite, de_lieu_id FROM mouvement
  WHERE vers_lieu_id = $1 AND motif = 'transfert' AND confirme_le IS NULL AND annule_le IS NULL`, [borne.lieu_id]);

let r = await poster(`/api/bornes/${borne.id}/charger`, { [`q_${lane}`]: "100" });
assert.match(r.headers.get("location") ?? "", /charge=7&canaux=1&refuses=1/, "plafonne a la place libre");
let t = (await ouverts()).rows;
assert.equal(t.length, 1);
assert.equal(t[0].quantite, 7);
assert.equal(t[0].de_lieu_id, null, "aucun lieu d'origine");
assert.equal(await canal(), 3, "le canal attend la machine");

// Ce qui est en route compte : le canal est deja plein.
r = await poster(`/api/bornes/${borne.id}/charger`, { [`q_${lane}`]: "1" });
assert.match(r.headers.get("location") ?? "", /charge=0&canaux=0&refuses=1/, "plus de place");

// ------------------------------------------------------------- la machine confirme
const machine = { authorization: `Bearer ${borne.jeton}`, "content-type": "application/json" };
const config = await (await fetch(`${base}/api/borne/config`, { headers: machine })).json();
assert.ok(config.transferts.some((x) => x.id === Number(t[0].id) && x.quantite === 7), "transfert transmis a la machine");
const etat = (corps) => fetch(`${base}/api/borne/etat`, { method: "POST", headers: machine, body: JSON.stringify(corps) });
assert.equal((await etat({ transferts_appliques: [Number(t[0].id)] })).status, 200);
assert.equal(await canal(), 10, "confirme par la machine");

// ------------------------------------------------------------ retrait et vente
r = await poster(`/api/bornes/${borne.id}/charger`, { [`q_${lane}`]: "-2" });
assert.match(r.headers.get("location") ?? "", /e=motif/, "un retrait demande sa raison");
await poster(`/api/bornes/${borne.id}/charger`, { [`q_${lane}`]: "-2", motif: "casse" });
assert.equal(await canal(), 8);

const sku = (await un("SELECT p.sku FROM canal k JOIN produit p ON p.id = k.produit_id WHERE k.borne_id = $1 AND k.lane = $2", [borne.id, lane])).sku;
await etat({ ventes: [{ commande_id: "ESSAI-" + jeton.slice(-8), article: 0, lane, sku, prix_centimes: 500, statut: "distribue",
                        faite_le: new Date().toISOString().slice(0, 19).replace("T", " ") }] });
assert.equal(await canal(), 7, "la vente decompte le canal");

await c.query("DELETE FROM session WHERE jeton = $1", [jeton]);
await c.end();
console.log("ok : reassort sans reserve, confirmation machine, retrait et vente.");
