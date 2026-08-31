// Une borne, telle que l'APK 5.1 se comporte.
//
// Sert a eprouver le protocole sans machine : appairage, adoption du catalogue
// par un compte vierge, reception du catalogue du SaaS, application des
// transferts en ECART avec memoire des identifiants, ventes hors ligne remontees
// plus tard, et rejeu integral sans doublon.
//
//   node scripts/borne-simulee.mjs http://127.0.0.1:4310 <scenario>

const base = process.argv[2] ?? "http://127.0.0.1:4310";
const scenario = process.argv[3] ?? "tout";

const etat = {
  jeton: null,
  catalogue: null,          // ce que le SaaS a dicte
  compteurs: new Map(),     // lane -> quantite
  appliques: new Set(),     // transferts deja appliques
  aAcquitter: new Set(),    // appliques mais pas encore accuses
  file: [],                 // ventes non remontees
};

// Le catalogue d'usine de la machine, celui qu'elle proposera a un compte vierge.
const usine = {
  categories: [{ nom: "Vapes", ordre: 10 }, { nom: "Boissons", ordre: 20 }],
  produits: [
    { sku: "USINE-PUFF", nom: "Puff usine · Menthe", categorie: "Vapes",
      prix_centimes: 1190, age_min: 18, capteur_fiable: false },
    { sku: "USINE-COLA", nom: "Cola 33 cl", categorie: "Boissons",
      prix_centimes: 250, age_min: 0, capteur_fiable: true },
  ],
  planogramme: [
    { lane: 1, rangee: 1, colonne: 1, sku: "USINE-PUFF", quantite: 7, capacite: 10, seuil_bas: 2 },
    { lane: 11, rangee: 2, colonne: 1, sku: "USINE-COLA", quantite: 4, capacite: 12, seuil_bas: 3 },
  ],
};

const dit = (s) => console.log("  " + s);

async function appairer() {
  const d = await (await fetch(base + "/api/borne/demande", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modele: "RK3288", version: "5.1" }),
  })).json();
  dit(`code affiché par la borne : ${d.code}`);
  return d;
}

async function attendreJeton(secret) {
  const r = await (await fetch(`${base}/api/borne/demande?secret=${secret}`)).json();
  if (r.etat === "adoptee") { etat.jeton = r.jeton; return r; }
  return r;
}

async function config() {
  const r = await fetch(base + "/api/borne/config", {
    headers: { authorization: "Bearer " + etat.jeton },
  });
  return { code: r.status, corps: await r.json() };
}

async function releve(extra = {}) {
  const canaux = [...etat.compteurs].map(([lane, quantite]) => ({
    lane, sku: laneVersSku(lane), quantite, capacite: 12,
  }));
  const corps = {
    version: "5.1",
    sante: { paiement: "pret", dispenser: "pret" },
    catalogue_version: etat.catalogue?.version ?? "",
    canaux,
    ventes: etat.file,
    transferts_appliques: [...etat.aAcquitter],
    ...extra,
  };
  const r = await fetch(base + "/api/borne/etat", {
    method: "POST",
    headers: { authorization: "Bearer " + etat.jeton, "content-type": "application/json" },
    body: JSON.stringify(corps),
  });
  const rep = await r.json();
  if (r.status === 200) {           // le serveur a confirme : on peut oublier
    etat.file = [];
    etat.aAcquitter.clear();
  }
  return { code: r.status, corps: rep };
}

function laneVersSku(lane) {
  const p = etat.catalogue?.planogramme?.find((k) => k.lane === lane);
  if (p?.sku) return p.sku;
  return usine.planogramme.find((k) => k.lane === lane)?.sku ?? null;
}

/** Applique les transferts recus. Un ecart, jamais une valeur absolue. */
function appliquer(transferts) {
  let n = 0;
  for (const t of transferts ?? []) {
    if (etat.appliques.has(t.id)) continue;      // deja fait : on ne double pas
    etat.compteurs.set(t.lane, (etat.compteurs.get(t.lane) ?? 0) + t.quantite);
    etat.appliques.add(t.id);
    etat.aAcquitter.add(t.id);
    n++;
  }
  return n;
}

function vendre(lane, sku, prix) {
  const reste = etat.compteurs.get(lane) ?? 0;
  if (reste <= 0) return false;
  etat.compteurs.set(lane, reste - 1);
  etat.file.push({
    commande_id: "SIM-" + Math.random().toString(36).slice(2, 10).toUpperCase(),
    lane, sku, prix_centimes: prix, statut: "distribue",
    faite_le: new Date().toISOString(),
  });
  return true;
}

// ---------------------------------------------------------------- scenario
//
// Le tour complet, sans machine et sans navigateur : on ouvre une session
// humaine pour adopter la borne, puis on joue le comportement de l'APK.

async function session(email, mdp) {
  const r = await fetch(base + "/api/session", {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, mdp }),
  });
  const c = r.headers.get("set-cookie") ?? "";
  return c.split(";")[0];
}

async function adopter(biscuit, code, nom) {
  const r = await fetch(base + "/api/bornes/adopter", {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: biscuit },
    body: new URLSearchParams({ code, nom, adresse: "Banc d’essai" }),
  });
  return r.headers.get("location") ?? "";
}

const email = process.argv[4] ?? "marcel@barducoin.fr";
const mdp = process.argv[5] ?? "motdepasse1";

console.log("\n1. LA BORNE DEMANDE À ÊTRE ADOPTÉE");
const dem = await appairer();

console.log("\n2. LE PROPRIÉTAIRE L’ADOPTE DEPUIS SON TÉLÉPHONE");
const biscuit = await session(email, mdp);
if (!biscuit.startsWith("rbx=")) { console.error("  connexion refusée"); process.exit(1); }
const vers = await adopter(biscuit, dem.code, "RedBox — Banc d’essai");
dit("adoptée → " + vers);
const r1 = await attendreJeton(dem.secret);
dit("jeton reçu : " + (etat.jeton ? etat.jeton.slice(0, 12) + "…" : "AUCUN"));

console.log("\n3. PREMIÈRE CONFIG — LE COMPTE EST-IL VIERGE ?");
let c1 = await config();
dit(`catalogue vide côté SaaS : ${c1.corps.catalogue.vide}`);
dit(`produits connus du SaaS  : ${c1.corps.catalogue.produits.length}`);

if (c1.corps.catalogue.vide) {
  console.log("\n4. LA BORNE DONNE SON CATALOGUE AU SAAS");
  for (const k of usine.planogramme) etat.compteurs.set(k.lane, k.quantite);
  const rep = await releve({ catalogue_local: usine });
  dit(`réponse : ${rep.code} · ${rep.corps.catalogue_adopte} produit(s) adopté(s)`);
} else {
  console.log("\n4. LE COMPTE A DÉJÀ UN CATALOGUE — LA BORNE NE PROPOSE RIEN");
}

console.log("\n5. LA BORNE RELIT SA CONFIG — ELLE REÇOIT LE CATALOGUE");
c1 = await config();
etat.catalogue = c1.corps.catalogue;
dit(`version   : ${etat.catalogue.version}`);
dit(`catégories: ${etat.catalogue.categories.map((k) => `${k.nom}(${k.ordre})`).join(", ")}`);
dit(`produits  : ${etat.catalogue.produits.map((p) => p.sku).join(", ")}`);
dit(`canaux    : ${etat.catalogue.planogramme.map((k) => `${k.lane}→${k.sku}`).join(", ")}`);

console.log("\n6. VENTES HORS LIGNE");
const lane = etat.catalogue.planogramme[0].lane;
const sku = etat.catalogue.planogramme[0].sku;
const prix = etat.catalogue.produits.find((p) => p.sku === sku)?.prix_centimes ?? 0;
let vendues = 0;
for (let i = 0; i < 3; i++) if (vendre(lane, sku, prix)) vendues++;
dit(`${vendues} vente(s) en file, canal ${lane} à ${etat.compteurs.get(lane)}`);
dit("(aucun réseau n’a été touché)");

console.log("\n7. SYNCHRONISATION — LES VENTES REMONTENT");
const r7 = await releve();
dit(`réponse : ${r7.code} · ${r7.corps.ventes_retenues} vente(s) retenue(s)`);

console.log("\n8. REJEU DU MÊME LOT (le réseau avait coupé)");
etat.file = [
  { commande_id: "REJEU-1", lane, sku, prix_centimes: prix,
    statut: "distribue", faite_le: new Date().toISOString() },
];
const a = await releve();
etat.file = [
  { commande_id: "REJEU-1", lane, sku, prix_centimes: prix,
    statut: "distribue", faite_le: new Date().toISOString() },
];
const b2 = await releve();
dit(`premier envoi : ${a.corps.ventes_retenues} retenue(s) · rejeu : ${b2.corps.ventes_retenues} retenue(s)`);

console.log("\n9. UN TRANSFERT SAISI DANS LE SAAS");
console.log(JSON.stringify({ jeton: etat.jeton, borne: vers.split("/").pop(), biscuit, lane }));
