// Les lecons de l'Academie qui parlaient encore de la reserve et de la marge.
// Celles qui ne parlaient que de ca (Reception, Mon stock) sont depubliees, pas effacees.
//
//   node --env-file=.env.local scripts/academie-sans-stock.mjs               montre, n'ecrit rien
//   node --env-file=.env.local scripts/academie-sans-stock.mjs --appliquer   ecrit
//
// A appliquer au deploiement de la console sans stock, pas avant : le texte
// decrit les nouveaux ecrans. Chaque passage doit se trouver tel quel une seule
// fois, sinon rien n'est ecrit : une lecon retouchee entre-temps n'est pas ecrasee.
import pg from "pg";

const appliquer = process.argv.includes("--appliquer");

const BLOCS = [
  // 12 · Reassort : ne jamais tomber en rupture
  [83, `1. **Réception** : vous enregistrez une livraison, votre stock au dépôt monte.
2. **Réassort** : devant la machine, vous chargez chaque spirale — le dépôt descend d’autant.`,
       `1. **Fiche d’approvisionnement** : avant de partir, elle dit quoi emporter pour remplir chaque RedBox.
2. **Réassort** : devant la machine, vous indiquez ce que vous ajoutez dans chaque spirale. La RedBox le confirme à sa prochaine synchronisation, et son stock monte d’autant.`],

  // 22 · Se reperer
  [106, `**Mon stock**, **Réception**, **Réassort**.`, `**Réassort**, **Centrale d’achat**.`],

  // 25 · Le tableau de bord
  [131, `- **Panier moyen** : le prix moyen d’un article distribué.`,
        `- **Panier moyen** : ce que rapporte une commande en moyenne.`],
  [131, `- **Marge estimée** : ce qu’il reste une fois vos prix d’achat déduits, et sa part du chiffre.`,
        `- **Commandes** : le nombre de commandes servies sur la période. Une commande peut porter plusieurs articles.`],
  [133, `## La bande « À traiter »`, `## La bande « À faire aujourd’hui »`],
  [133, `- **Racheter** · références en rupture sous trois jours. Ouvre **Réception** : commandez chez votre fournisseur, et enregistrez la livraison à son arrivée.`,
        `- **Remplir** · références en rupture sous trois jours. Ouvre **Réassort** : choisissez la machine et chargez-la.`],
  [133, `- **Voir** · références à racheter d’ici trois semaines. Ouvre **Analytiques**, à **Ce qui va manquer**, avec la quantité conseillée.`,
        `- **Voir** · références à remplir cette semaine. Ouvre **Analytiques**, à **Ce qui va manquer**.`],
  [134, `la bande À traiter`, `la bande À faire aujourd’hui`],
  [138, `une mise en route en cinq étapes : **Créer vos catégories**, **Remplir le catalogue**, **Enregistrer une réception**, **Appairer une RedBox**`,
        `une mise en route en quatre étapes : **Créer vos catégories**, **Remplir le catalogue**, **Appairer une RedBox**`],

  // 26 · Suivre ses ventes et les analytiques
  [139, `la **marge estimée**, et combien`, `le prix moyen **par article**, et combien`],
  [139, `avec le nombre vendu et la marge.`, `avec le nombre vendu.`],
  [145, `les articles vendus, la marge et leur part du chiffre.`, `les articles vendus et leur part du chiffre.`],
  [145, `(**Produit**, **Catégorie**, **Vendus**, **Chiffre**, **Marge**) ou en **Graphique**. Une marge « — » veut dire prix d’achat inconnu, pas marge nulle.`,
        `(**Produit**, **Catégorie**, **Vendus**, **Chiffre**) ou en **Graphique**.`],
  [145, `chaque produit qui sera épuisé d’ici trois semaines au rythme actuel, marqué « rupture imminente », « à commander » ou « à surveiller ». Touchez **commander ~** : la **Réception** s’ouvre sur ce produit, quantité déjà remplie.`,
        `chaque produit dont le stock dans les RedBox sera épuisé d’ici une semaine au rythme actuel, marqué « rupture imminente » ou « à remplir ». Touchez **remplir** : le **Réassort** s’ouvre, choisissez la machine.`],

  // 30 · La fiche d'approvisionnement
  [175, `se prépare au dépôt, avant de partir.`, `se prépare avant de partir.`],
  [178, `**1 · À sortir de la réserve.** Ce que vous chargez dans la voiture, produit par produit : **À prendre**, et à côté ce que vous avez **En réserve**. Le`,
        `**1 · À emporter.** Ce que vous chargez dans la voiture, produit par produit : **À prendre**. Le`],
  [179, `« À sortir de la réserve »`, `« À emporter »`],
  [180, `- **Elle ne demande jamais ce que vous n’avez pas.** Chaque quantité est plafonnée par votre réserve. Si la réserve ne suffit pas, un encadré indique combien d’unités **manquent en réserve** et sur quels produits, avec un bouton **Réception**.
- **Les canaux les plus vides passent en premier** quand il n’y a pas assez pour tout le monde. Une ligne peut alors indiquer « … de moins que le plein ».
`, `- **Elle vise le plein.** Chaque quantité est ce qu’il faut pour remplir le canal jusqu’à sa capacité. La console ne connaît pas ce que vous avez chez vous : si vous en avez moins, posez ce que vous avez et saisissez-le dans le **Réassort**.
`],

  // 31 · Le reassort devant la machine
  [184, `c’est cette saisie qui fait passer le stock de votre réserve à la machine.`,
        `la RedBox le confirme à sa prochaine synchronisation.`],
  [186, `indique ses canaux, ses places libres, et en gros ce qu’il vous reste **chez moi**.`,
        `indique ses canaux et ses places libres.`],
  [186, `
- à droite, ce qu’il reste **chez moi**.`, ``],
  [188, `jusqu’au plein, sans dépasser ce que vous avez en réserve.`, `jusqu’au plein.`],
  [190, `- **Votre réserve baisse tout de suite** : la marchandise est dans vos mains.
`, ``],
  [190, `On ne peut jamais poser plus que la place libre ni plus que la réserve.`,
        `On ne peut jamais poser plus que la place libre.`],
  [193, `L’écart est inscrit comme un inventaire dans l’historique du produit, et la RedBox reçoit`,
        `La RedBox reçoit`],

  // 32 · Les emplacements
  [206, `le cycle réception → stock → fiche → réassort repart`, `le cycle fiche → réassort repart`],

  // 34 · Catalogue et categories
  [229, `- **Recevoir** et **Approvisionner** mènent directement à la réception et à la **Fiche d’approvisionnement** de ce produit.`,
        `- **Approvisionner** mène directement à la **Fiche d’approvisionnement** de ce produit.`],
  [233, `(ni réception, ni vente)`, `(ni réassort, ni vente)`],
];

const RESUMES = [
  [30, `quoi sortir de la réserve, puis`, `quoi emporter, puis`],
];

const MODULES = [
  [7, `De la livraison reçue à la spirale remplie : réception, stock, fiche d’approvisionnement, réassort et emplacements.`,
      `De la tournée préparée à la spirale remplie : fiche d’approvisionnement, réassort et emplacements.`],
];

const A_DEPUBLIER = [28, 29]; // Reception d'une livraison, Mon stock

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN");
if (!appliquer) await c.query("SET TRANSACTION READ ONLY");

let erreurs = 0;
async function remplacer(table, colonne, id, avant, apres) {
  const { rows } = await c.query(`SELECT ${colonne} AS t FROM ${table} WHERE id = $1${appliquer ? " FOR UPDATE" : ""}`, [id]);
  const n = (rows[0]?.t ?? "").split(avant).length - 1;
  if (n !== 1) {
    console.error(`INTROUVABLE (${n} fois) · ${table} ${id} : ${avant.slice(0, 70)}`);
    erreurs++;
    return null;
  }
  console.log(`\n### ${table} ${id}\n- ${avant.trim()}\n+ ${apres.trim()}`);
  if (appliquer) await c.query(`UPDATE ${table} SET ${colonne} = $2 WHERE id = $1`, [id, rows[0].t.replace(avant, () => apres)]);
}

try {
  for (const [id, avant, apres] of BLOCS) await remplacer("academie_bloc", "texte", id, avant, apres);
  for (const [id, avant, apres] of RESUMES) await remplacer("academie_lecon", "resume", id, avant, apres);
  for (const [id, avant, apres] of MODULES) await remplacer("academie_module", "resume", id, avant, apres);
  if (erreurs) throw new Error(`${erreurs} passage(s) introuvable(s), rien n'est écrit.`);
  if (appliquer) {
    await c.query(`UPDATE academie_lecon SET modifie_le = now() WHERE id = ANY($1::bigint[])`, [[12, 22, 25, 26, 30, 31, 32, 34]]);
    await c.query(`UPDATE academie_lecon SET publie = false, modifie_le = now() WHERE id = ANY($1::bigint[])`, [A_DEPUBLIER]);
    await c.query("COMMIT");
    console.log(`\nÉcrit : ${BLOCS.length + RESUMES.length + MODULES.length} passages, leçons ${A_DEPUBLIER} dépubliées.`);
  } else {
    await c.query("ROLLBACK");
    console.log(`\nRien n'est écrit : ${BLOCS.length + RESUMES.length + MODULES.length} passages trouvés. --appliquer pour écrire.`);
  }
} catch (e) {
  await c.query("ROLLBACK");
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
