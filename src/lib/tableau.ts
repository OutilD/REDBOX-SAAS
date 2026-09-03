import { q, q1 } from "@/db";

/**
 * Les chiffres du tableau de bord.
 *
 * Une regle dans tout ce fichier : SEULE UNE VENTE DISTRIBUEE COMPTE. Un litige
 * est un probleme d'argent, pas un chiffre d'affaires ; le compter gonflerait
 * exactement du montant qu'il faudra rembourser.
 */

/** La periode, en jours pleins, bornee a hier inclus + aujourd'hui. */
export const FENETRES = [
  // « Aujourd'hui », c'est un jour plein depuis minuit : `DEPUIS` retranche un
  // jour puis en rajoute un, donc la fenetre a 1 commence a zero heure. C'est la
  // vue qu'on ouvre le soir pour savoir ce que la machine a fait dans la journee.
  { cle: "1",  nom: "Aujourd’hui", jours: 1 },
  { cle: "7",  nom: "7 jours",  jours: 7 },
  { cle: "30", nom: "30 jours", jours: 30 },
  { cle: "90", nom: "90 jours", jours: 90 },
] as const;

/**
 * La fenetre montree quand on n'a rien choisi.
 *
 * Nommee, pas prise au rang : elle etait `FENETRES[1]`, et ajouter
 * « aujourd'hui » en tete de liste l'aurait fait passer de trente jours a sept
 * sans que personne l'ait demande.
 */
export const DEFAUT = FENETRES.find((f) => f.cle === "30")!;

const DEPUIS = "date_trunc('day', now()) - ($2::text || ' days')::interval + interval '1 day'";

/**
 * LA PORTEE, ECRITE UNE FOIS.
 *
 * `null` veut dire tout le parc du compte : c'est le cas par defaut, celui d'un
 * exploitant qui n'a rien filtre. Une liste restreint aux bornes voulues — le
 * filtre de l'en-tete, ou les seules machines qu'un invite a le droit de voir.
 *
 * LES DEUX PASSENT PAR LE MEME CHEMIN, et c'est voulu : un filtre d'affichage et
 * une restriction d'acces qui auraient deux implementations finiraient par
 * diverger, et c'est la divergence qui montre le chiffre d'une autre machine.
 *
 * Repete a la main dans quinze sous-requetes, ce fragment aurait fini par
 * manquer dans une.
 */
const PORTEE = "AND ($3::bigint[] IS NULL OR b.id = ANY($3))";

export type Entete = {
  bornes: number; en_ligne: number; jamais_appairees: number;
  ventes: number; ca: number; marge: number;
  litiges: number; canaux_vides: number;
};

export async function entete(compte_id: number, jours: number,
                             bornes: number[] | null = null): Promise<Entete> {
  return (await q1<Entete>(`
    SELECT
      (SELECT COUNT(*)::int FROM borne b WHERE b.compte_id = $1 ${PORTEE})          AS bornes,
      (SELECT COUNT(*)::int FROM borne b WHERE b.compte_id = $1 ${PORTEE}
         AND b.vue_le > now() - interval '15 minutes')                              AS en_ligne,
      (SELECT COUNT(*)::int FROM borne b WHERE b.compte_id = $1 ${PORTEE}
         AND b.jeton IS NULL)                                                       AS jamais_appairees,
      (SELECT COUNT(*)::int FROM vente v JOIN borne b ON b.id = v.borne_id
        WHERE b.compte_id = $1 ${PORTEE}
          AND v.statut = 'distribue' AND v.faite_le >= ${DEPUIS})                   AS ventes,
      (SELECT COALESCE(SUM(v.prix_c),0)::int FROM vente v JOIN borne b ON b.id = v.borne_id
        WHERE b.compte_id = $1 ${PORTEE}
          AND v.statut = 'distribue' AND v.faite_le >= ${DEPUIS})                   AS ca,
      (SELECT COALESCE(SUM(v.prix_c - COALESCE(a.prix_achat_c,0)),0)::int
         FROM vente v JOIN borne b ON b.id = v.borne_id
         LEFT JOIN v_prix_achat a ON a.produit_id = v.produit_id
        WHERE b.compte_id = $1 ${PORTEE}
          AND v.statut = 'distribue' AND v.faite_le >= ${DEPUIS})                   AS marge,
      (SELECT COUNT(*)::int FROM vente v JOIN borne b ON b.id = v.borne_id
        WHERE b.compte_id = $1 ${PORTEE}
          AND v.statut <> 'distribue' AND v.traite_le IS NULL)                      AS litiges,
      (SELECT COUNT(*)::int FROM canal c JOIN borne b ON b.id = c.borne_id
        WHERE b.compte_id = $1 ${PORTEE}
          AND c.produit_id IS NOT NULL AND c.quantite = 0)                          AS canaux_vides
  `, [compte_id, String(jours), bornes]))!;
}

/**
 * LA MEME FENETRE, UN CRAN PLUS TOT.
 *
 * « 3 240 € » ne dit rien tout seul. C'est beaucoup ou c'est peu selon le mois
 * dernier, et c'est la seule question qu'on se pose en ouvrant cet ecran : est-ce
 * que ca monte. Un tableau de bord qui donne un niveau sans sa pente laisse son
 * lecteur faire la soustraction de tete, avec un chiffre qu'il n'a pas.
 *
 * ELLE S'ARRETE A LA MEME HEURE. La fenetre en cours contient un jour partiel —
 * aujourd'hui, jusqu'a maintenant. Comparee a trente jours PLEINS, elle serait en
 * baisse tous les matins et rattraperait le soir : la comparaison mesurerait
 * l'heure qu'il est, pas les ventes. La borne haute est donc `now()` recule
 * d'autant, ce qui laisse exactement la meme duree ecoulee des deux cotes.
 */
export type Comparaison = { ventes: number; ca: number; marge: number };

export async function comparaison(compte_id: number, jours: number,
                                  bornes: number[] | null = null): Promise<Comparaison> {
  return (await q1<Comparaison>(`
    SELECT COUNT(*)::int                                              AS ventes,
           COALESCE(SUM(v.prix_c),0)::int                             AS ca,
           COALESCE(SUM(v.prix_c - COALESCE(a.prix_achat_c,0)),0)::int AS marge
      FROM vente v
      JOIN borne b ON b.id = v.borne_id
      LEFT JOIN v_prix_achat a ON a.produit_id = v.produit_id
     WHERE b.compte_id = $1 ${PORTEE}
       AND v.statut = 'distribue'
       AND v.faite_le >= ${DEPUIS} - ($2::text || ' days')::interval
       AND v.faite_le <  now()     - ($2::text || ' days')::interval
  `, [compte_id, String(jours), bornes]))!;
}

export type Jour = { jour: string; etiquette: string; n: number; ca: number };

export async function parJour(compte_id: number, jours: number,
                              bornes: number[] | null = null): Promise<Jour[]> {
  // La serie est generee cote base : sans elle, un jour sans vente disparaitrait
  // du graphe et le creux se lirait comme une baisse douce au lieu d'un trou.
  return q<Jour>(`
    WITH serie AS (
      SELECT generate_series(
        date_trunc('day', now()) - ($2::text || ' days')::interval + interval '1 day',
        date_trunc('day', now()), interval '1 day') AS jour)
    SELECT to_char(s.jour, 'YYYY-MM-DD') AS jour,
           to_char(s.jour, 'DD/MM')      AS etiquette,
           COUNT(v.id)::int              AS n,
           COALESCE(SUM(v.prix_c),0)::int AS ca
      FROM serie s
      LEFT JOIN vente v ON date_trunc('day', v.faite_le) = s.jour
                       AND v.statut = 'distribue'
                       AND v.borne_id IN (SELECT b.id FROM borne b
                                           WHERE b.compte_id = $1 ${PORTEE})
     GROUP BY s.jour ORDER BY s.jour`, [compte_id, String(jours), bornes]);
}

export type ParBorne = {
  id: number; nom: string; adresse: string | null; vue_le: Date | null;
  n: number; ca: number; marge: number; canaux: number; vides: number;
  /** Le chiffre de la meme borne sur la fenetre precedente — voir `comparaison`. */
  ca_avant: number;
};

export async function parBorne(compte_id: number, jours: number,
                               bornes: number[] | null = null): Promise<ParBorne[]> {
  return q<ParBorne>(`
    SELECT b.id, b.nom, b.adresse, b.vue_le,
           COALESCE(x.n, 0)     AS n,
           COALESCE(x.ca, 0)    AS ca,
           COALESCE(x.marge, 0) AS marge,
           (SELECT COUNT(*)::int FROM canal c WHERE c.borne_id = b.id AND c.produit_id IS NOT NULL) AS canaux,
           (SELECT COUNT(*)::int FROM canal c WHERE c.borne_id = b.id AND c.produit_id IS NOT NULL
              AND c.quantite = 0) AS vides,
           COALESCE(y.ca, 0)    AS ca_avant
      FROM borne b
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int n, SUM(v.prix_c)::int ca,
               SUM(v.prix_c - COALESCE(a.prix_achat_c,0))::int marge
          FROM vente v LEFT JOIN v_prix_achat a ON a.produit_id = v.produit_id
         WHERE v.borne_id = b.id AND v.statut = 'distribue' AND v.faite_le >= ${DEPUIS}
      ) x ON true
      -- Une machine peut faire le plus gros chiffre du parc en s'effondrant :
      -- le classement seul ne le dit pas, la pente si.
      LEFT JOIN LATERAL (
        SELECT SUM(v.prix_c)::int ca
          FROM vente v
         WHERE v.borne_id = b.id AND v.statut = 'distribue'
           AND v.faite_le >= ${DEPUIS} - ($2::text || ' days')::interval
           AND v.faite_le <  now()     - ($2::text || ' days')::interval
      ) y ON true
     WHERE b.compte_id = $1 ${PORTEE}
     ORDER BY COALESCE(x.ca, 0) DESC, b.nom`, [compte_id, String(jours), bornes]);
}

export type Croisement = {
  categorie_id: number | null; categorie: string; ordre: number;
  borne_id: number; borne: string; n: number; ca: number;
};

/** Les ventes par categorie ET par borne : le croisement qu'on ne peut pas deviner. */
export async function parCategorieEtBorne(compte_id: number, jours: number): Promise<Croisement[]> {
  return q<Croisement>(`
    SELECT p.categorie_id, COALESCE(cat.nom, 'sans catégorie') AS categorie,
           COALESCE(cat.ordre, 999) AS ordre,
           b.id AS borne_id, b.nom AS borne,
           COUNT(*)::int n, SUM(v.prix_c)::int ca
      FROM vente v
      JOIN borne b   ON b.id = v.borne_id
      LEFT JOIN produit p     ON p.id = v.produit_id
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE b.compte_id = $1 AND v.statut = 'distribue' AND v.faite_le >= ${DEPUIS}
     GROUP BY p.categorie_id, cat.nom, cat.ordre, b.id, b.nom
     ORDER BY COALESCE(cat.ordre, 999), cat.nom, ca DESC`, [compte_id, String(jours)]);
}

export type ParProduit = {
  id: number | null; nom: string; sku: string | null;
  categorie: string; n: number; ca: number; marge: number | null;
};

/**
 * CE QUI SE VEND, ET CE QUE CA RAPPORTE.
 *
 * Le tableau de bord disait quelle BORNE marche le mieux, jamais quel PRODUIT.
 * Or c'est le produit qu'on rachete, qu'on arrete, ou qu'on monte en prix — la
 * borne, on ne la change pas.
 *
 * LA MARGE PLUTOT QUE LE CHIFFRE. Un produit qui fait le plus gros chiffre en
 * perdant de l'argent a chaque vente est le pire de tous, et il trone en tete
 * d'un classement au chiffre d'affaires. On garde les deux, on trie sur la
 * marge, et elle vaut null quand aucun prix d'achat n'est connu — dire « zero »
 * ferait passer une marge inconnue pour une marge nulle.
 */
export async function parProduit(compte_id: number, jours: number,
                                 bornes: number[] | null = null): Promise<ParProduit[]> {
  return q<ParProduit>(`
    SELECT pr.id, COALESCE(pr.nom, 'produit retiré') AS nom, pr.sku,
           COALESCE(cat.nom, 'sans catégorie') AS categorie,
           COUNT(*)::int n, COALESCE(SUM(v.prix_c),0)::int ca,
           CASE WHEN COUNT(a.prix_achat_c) = 0 THEN NULL
                ELSE SUM(v.prix_c - COALESCE(a.prix_achat_c,0))::int END AS marge
      FROM vente v
      JOIN borne b ON b.id = v.borne_id
      LEFT JOIN produit pr      ON pr.id = v.produit_id
      LEFT JOIN categorie cat   ON cat.id = pr.categorie_id
      LEFT JOIN v_prix_achat a  ON a.produit_id = v.produit_id
     WHERE b.compte_id = $1 ${PORTEE}
       AND v.statut = 'distribue' AND v.faite_le >= ${DEPUIS}
     GROUP BY pr.id, pr.nom, pr.sku, cat.nom
     ORDER BY ca DESC, n DESC`, [compte_id, String(jours), bornes]);
}

export type Autonomie = {
  id: number; nom: string; sku: string; categorie: string;
  stock: number; vendus: number; par_jour: number; jours_restants: number | null;
};

/**
 * Combien de jours avant la rupture.
 *
 * C'est le chiffre qui decide quand racheter. Un stock de 8 ne veut rien dire
 * seul : huit unites, c'est trois semaines pour un briquet et deux jours pour une
 * Puff. On divise donc le stock par la cadence constatee sur la periode.
 *
 * Un produit qui ne s'est pas vendu du tout n'a pas d'autonomie calculable — on
 * renvoie null plutot qu'un infini deguise en « tout va bien ».
 */
export async function autonomie(compte_id: number, jours: number): Promise<Autonomie[]> {
  return q<Autonomie>(`
    WITH vendu AS (
      SELECT v.produit_id, COUNT(*)::int n
        FROM vente v JOIN borne b ON b.id = v.borne_id
       WHERE b.compte_id = $1 AND v.statut = 'distribue' AND v.faite_le >= ${DEPUIS}
       GROUP BY v.produit_id)
    SELECT p.id, p.nom, p.sku, COALESCE(cat.nom, 'sans catégorie') AS categorie,
           COALESCE((SELECT SUM(s.quantite)::int FROM v_stock s WHERE s.produit_id = p.id), 0)
             + COALESCE((SELECT SUM(r.quantite)::int FROM v_en_route r WHERE r.produit_id = p.id), 0)
             AS stock,
           COALESCE(vendu.n, 0) AS vendus,
           ROUND(COALESCE(vendu.n, 0)::numeric / $2::numeric, 2) AS par_jour,
           CASE WHEN COALESCE(vendu.n, 0) = 0 THEN NULL
                ELSE FLOOR(
                  (COALESCE((SELECT SUM(s.quantite)::int FROM v_stock s WHERE s.produit_id = p.id), 0)
                 + COALESCE((SELECT SUM(r.quantite)::int FROM v_en_route r WHERE r.produit_id = p.id), 0))
                  / (vendu.n::numeric / $2::numeric)) END AS jours_restants
      FROM produit p
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
      LEFT JOIN vendu ON vendu.produit_id = p.id
     WHERE p.compte_id = $1 AND p.actif
     ORDER BY jours_restants ASC NULLS LAST, stock ASC`, [compte_id, String(jours)]);
}

export type PointCategorie = {
  seau: string; etiquette: string;
  categorie_id: number | null; categorie: string; ordre: number;
  n: number; ca: number;
};

/**
 * Les ventes par categorie DANS LE TEMPS.
 *
 * Regroupees par semaine des que la periode depasse la semaine : au jour le jour,
 * six categories a deux ou trois ventes quotidiennes donnent six lignes en dents
 * de scie ou l'on ne lit aucune tendance. La semaine lisse le bruit sans effacer
 * l'evolution, qui est ce qu'on vient chercher.
 */
export async function categoriesDansLeTemps(compte_id: number, jours: number,
                                            bornes: number[] | null = null) {
  const pas = jours <= 7 ? "day" : "week";
  const format = pas === "day" ? "DD/MM" : '"sem. "DD/MM';
  const points = await q<PointCategorie>(`
    SELECT to_char(date_trunc('${pas}', v.faite_le), 'YYYY-MM-DD') AS seau,
           to_char(date_trunc('${pas}', v.faite_le), '${format}')  AS etiquette,
           p.categorie_id, COALESCE(cat.nom, 'sans catégorie') AS categorie,
           COALESCE(cat.ordre, 999) AS ordre,
           COUNT(*)::int n, SUM(v.prix_c)::int ca
      FROM vente v
      JOIN borne b ON b.id = v.borne_id
      LEFT JOIN produit p     ON p.id = v.produit_id
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE b.compte_id = $1 ${PORTEE}
       AND v.statut = 'distribue' AND v.faite_le >= ${DEPUIS}
     GROUP BY 1, 2, p.categorie_id, cat.nom, cat.ordre
     ORDER BY 1`, [compte_id, String(jours), bornes]);

  // Les seaux vides sont completes ici : une categorie qui n'a rien vendu une
  // semaine doit passer par zero, pas sauter le point — sinon la ligne relie deux
  // sommets et invente une continuite qui n'existe pas.
  const seaux = [...new Set(points.map((p) => p.seau))].sort();
  const etiquettes = new Map(points.map((p) => [p.seau, p.etiquette]));
  const cats = [...new Map(points.map((p) =>
    [String(p.categorie_id ?? "sans"), { nom: p.categorie, ordre: p.ordre }])).entries()]
    .sort((a, b) => a[1].ordre - b[1].ordre || a[1].nom.localeCompare(b[1].nom));

  const par = new Map(points.map((p) => [`${p.seau}|${p.categorie_id ?? "sans"}`, p]));
  return {
    seaux: seaux.map((s) => ({ seau: s, etiquette: etiquettes.get(s) ?? s })),
    // `rang` fige la teinte sur la categorie, pas sur son classement : les barres
    // et les courbes de la meme page doivent parler des memes couleurs.
    series: cats.map(([cle, c], rang) => {
      const siennes = points.filter((p) => String(p.categorie_id ?? "sans") === cle);
      return {
        cle, nom: c.nom, rang,
        total: siennes.reduce((s, p) => s + p.ca, 0),
        unites: siennes.reduce((s, p) => s + p.n, 0),
        valeurs: seaux.map((s) => par.get(`${s}|${cle}`)?.ca ?? 0),
      };
    }),
  };
}

export type Avancement = {
  categories: number; produits: number; recu: number;
  bornes: number; appairees: number; chargees: number; ventes: number;
};

/**
 * Ou en est la mise en route du compte.
 *
 * Sert a distinguer « il n'y a rien parce que rien n'a encore ete fait » de
 * « il n'y a rien parce que rien ne s'est passe ». Ce ne sont pas les memes
 * ecrans : le premier appelle une marche a suivre, le second une explication.
 */
export async function avancement(compte_id: number): Promise<Avancement> {
  return (await q1<Avancement>(`
    SELECT
      (SELECT COUNT(*)::int FROM categorie WHERE compte_id = $1)                    AS categories,
      (SELECT COUNT(*)::int FROM produit WHERE compte_id = $1 AND actif)            AS produits,
      (SELECT COUNT(*)::int FROM mouvement WHERE compte_id = $1
         AND motif = 'reception' AND annule_le IS NULL)                             AS recu,
      (SELECT COUNT(*)::int FROM borne WHERE compte_id = $1)                        AS bornes,
      (SELECT COUNT(*)::int FROM borne WHERE compte_id = $1 AND jeton IS NOT NULL)  AS appairees,
      -- « Chargee » ne veut pas dire « on a saisi un transfert » : une borne
      -- adoptee arrive DEJA pleine, son stock entre par un inventaire. Ce qui
      -- compte, c'est qu'il y ait de la marchandise dans une machine.
      (SELECT COALESCE(SUM(c.quantite),0)::int FROM canal c
         JOIN borne b ON b.id = c.borne_id
        WHERE b.compte_id = $1 AND c.produit_id IS NOT NULL)                        AS chargees,
      (SELECT COUNT(*)::int FROM vente v JOIN borne b ON b.id = v.borne_id
        WHERE b.compte_id = $1)                                                     AS ventes
  `, [compte_id]))!;
}
