// Une borne de papier : elle fait exactement ce que fait Saas.java, dans le meme
// ordre. Sert a eprouver le SaaS sans la machine.
const BASE = process.argv[2] ?? "http://127.0.0.1:4310";
const ACTION = process.argv[3] ?? "cycle";
const ARG = process.argv[4];

// Le plan de racks vit sur la MACHINE, comme dans KioskCatalogue : c'est elle qui
// l'apprend au SaaS au premier releve, pas l'inverse.
const RACKS = [
  [1, "VAPE-MEN", 4], [2, "VAPE-FRU", 3], [3, "VAPE-MAN", 2], [4, "VAPE-PAS", 0],
  [11, "POP-15", 5], [21, "PWR-5000", 3], [22, "PWR-10000", 2],
  [31, "HYG-PRE", 6], [32, "HYG-LIN", 8], [42, "BRQ-TEMP", 7], [51, "ACC-USBC", 4],
];
const etat = { jeton: process.env.JETON ?? "", canaux: new Map(), file: [] };
for (const [lane, sku, q] of RACKS) etat.canaux.set(lane, { lane, sku, quantite: q, capacite: 10 });

async function appairer(code) {
  const r = await fetch(BASE + "/api/borne/appairage", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, nom: "RedBox simulée", version: "4.4" }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error("appairage refusé : " + JSON.stringify(d));
  etat.jeton = d.jeton;
  console.log("appairée →", d.borne.nom, "| jeton", d.jeton.slice(0, 12) + "…");
  return d.jeton;
}

async function cycle() {
  const auth = { authorization: "Bearer " + etat.jeton };

  const conf = await (await fetch(BASE + "/api/borne/config", { headers: auth })).json();
  console.log("config :", conf.planogramme.length, "canaux,", conf.consignes.length, "consigne(s)");

  const appliquees = [];
  for (const g of conf.consignes) {
    const c = etat.canaux.get(g.lane);
    if (!c) continue;
    console.log("  consigne : canal", g.lane, c.quantite, "→", g.quantite);
    c.quantite = g.quantite;
    appliquees.push(g.id);
  }

  const rep = await fetch(BASE + "/api/borne/etat", {
    method: "POST", headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      version: "4.4",
      sante: { distributeur: "en_ligne", paiement: "pret", vend: true },
      canaux: [...etat.canaux.values()],
      ventes: etat.file,
      consignes_appliquees: appliquees,
    }),
  });
  const d = await rep.json();
  if (!rep.ok) throw new Error("relevé refusé : " + JSON.stringify(d));
  etat.file = [];
  console.log("relevé :", JSON.stringify(d));
}

if (ACTION === "appairer") await appairer(ARG);
else if (ACTION === "vendre") {
  // Une vente : le compteur baisse ET la ligne part en file. Dans cet ordre.
  const lane = Number(ARG ?? 1);
  const c = etat.canaux.get(lane);
  c.quantite = Math.max(0, c.quantite - 1);
  etat.file.push({ commande_id: "ORD-" + process.env.CMD, lane, sku: c.sku,
                   prix_centimes: 1290, statut: "distribue",
                   faite_le: new Date().toISOString().slice(0, 19).replace("T", " ") });
  await cycle();
} else if (ACTION === "cycle") await cycle();
