import { q, q1 } from "@/db";

/**
 * Les chiffres du tableau de bord.
 *
 * Une regle dans tout ce fichier : SEULE UNE VENTE DISTRIBUEE COMPTE. Un litige
 * est un probleme d'argent, pas un chiffre d'affaires ; le compter gonflerait
 * exactement du montant qu'il faudra rembourser.
 */

/**
 * LE FUSEAU DES CHIFFRES.
 *
 * La base tourne en GMT et les machines sont en France : « aujourd'hui »
 * commencait donc a deux heures du matin, heure du bar. Invisible tant qu'on
 * comptait en jours pleins, faux des qu'on filtre a l'heure. Tout ce fichier
 * decoupe le temps dans CE fuseau — une heure saisie dans le tableau de bord est
 * l'heure qu'il est devant la machine, et la meme adresse donne les memes
 * chiffres a qui la lit d'ailleurs.
 */
export const FUSEAU = "Europe/Paris";

/** Les fenetres toutes faites. Elles s'arretent a maintenant, pas a minuit. */
export const FENETRES = [
  // « Aujourd'hui » commence a minuit, heure de Paris : la fenetre a 1 jour
  // retranche zero jour a la journee en cours. C'est la vue qu'on ouvre le soir
  // pour savoir ce que la machine a fait dans la journee.
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

/**
 * LA PERIODE OBSERVEE — deux instants, et rien d'autre.
 *
 * Toutes les requetes de ce fichier recoivent ces deux bornes en parametres. Une
 * fenetre toute faite et une saisie a la minute suivent donc exactement le meme
 * chemin : il n'y a pas un calcul « en jours » a cote d'un calcul « en heures »
 * qui finiraient par ne plus dire la meme chose.
 */
export type Periode = {
  debut: Date; fin: Date;
  /** La cle d'une fenetre toute faite, ou « perso ». */
  cle: string;
  nom: string;
  /** Ce que portent les deux champs de saisie, en heure de Paris. */
  saisie: { du: string; au: string };
  /** La duree en jours fractionnaires : les moyennes et l'autonomie divisent par elle. */
  jours: number;
};

/** Ce que rend un `<input type="datetime-local">`, secondes tolerees. */
const SAISIE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * Resout la periode demandee par l'adresse.
 *
 * LE CALCUL EST FAIT PAR POSTGRES, pas en JavaScript. Convertir une heure murale
 * de Paris en instant demande la base des fuseaux et la regle de l'heure d'ete ;
 * `Date` ne sait pas le faire sans bibliotheque, et un decalage ecrit en dur se
 * trompe deux fois par an.
 */
export async function periodeDe(cle?: string, du?: string, au?: string): Promise<Periode> {
  if (du && au && SAISIE.test(du) && SAISIE.test(au)) {
    const r = (await q1<{ debut: Date; fin: Date; du: string; au: string }>(`
      SELECT ($1::timestamp AT TIME ZONE $3)              AS debut,
             ($2::timestamp AT TIME ZONE $3)              AS fin,
             to_char($1::timestamp, 'YYYY-MM-DD"T"HH24:MI') AS du,
             to_char($2::timestamp, 'YYYY-MM-DD"T"HH24:MI') AS au`,
      [du, au, FUSEAU]))!;

    // DEUX BORNES A L'ENVERS NE SONT PAS UNE ERREUR A SIGNALER : c'est une saisie
    // qu'on remet a l'endroit. Refuser aurait renvoye quelqu'un a son formulaire
    // pour lui apprendre l'ordre des champs. Egales, on retombe sur la fenetre
    // par defaut — une duree nulle ne montre rien et divise par zero.
    const [d, f, sd, sf] = +r.fin >= +r.debut
      ? [r.debut, r.fin, r.du, r.au] : [r.fin, r.debut, r.au, r.du];
    if (+f > +d) {
      return { debut: d, fin: f, cle: "perso", nom: `du ${lisible(sd)} au ${lisible(sf)}`,
               saisie: { du: sd, au: sf }, jours: enJours(d, f) };
    }
  }

  const fen = FENETRES.find((x) => x.cle === cle) ?? DEFAUT;
  const r = (await q1<{ debut: Date; fin: Date; du: string; au: string }>(`
    WITH l AS (
      SELECT date_trunc('day', now() AT TIME ZONE $2)
               - make_interval(days => $1::int - 1) AS debut_l,
             now() AT TIME ZONE $2                  AS fin_l)
    SELECT (l.debut_l AT TIME ZONE $2)                AS debut,
           (l.fin_l   AT TIME ZONE $2)                AS fin,
           to_char(l.debut_l, 'YYYY-MM-DD"T"HH24:MI') AS du,
           to_char(l.fin_l,   'YYYY-MM-DD"T"HH24:MI') AS au
      FROM l`, [String(fen.jours), FUSEAU]))!;

  return { debut: r.debut, fin: r.fin, cle: fen.cle, nom: fen.nom,
           saisie: { du: r.du, au: r.au }, jours: enJours(r.debut, r.fin) };
}

/** Au moins une minute : ce qui divise ne doit jamais valoir zero. */
function enJours(debut: Date, fin: Date): number {
  return Math.max((+fin - +debut) / 86_400_000, 1 / 1440);
}

/** « 04/09/26 à 08:00 » — ce qu'on relit dans un sous-titre. */
function lisible(saisie: string): string {
  const [d, h] = saisie.split("T");
  const [a, m, j] = d.split("-");
  return `${j}/${m}/${a.slice(2)} à ${h.slice(0, 5)}`;
}

/**
 * LE DECOUPAGE DU GRAPHE SUIT LA DUREE, pas un reglage de plus.
 *
 * Une fenetre de quatre heures en barres quotidiennes donne une seule barre, et
 * trois mois en barres horaires en donnent deux mille. Personne ne veut choisir
 * ca a la main : la duree le dit toute seule.
 */
export type Pas = "hour" | "day" | "week" | "month";

export function pasDe(p: Periode): Pas {
  return p.jours <= 3 ? "hour"
       : p.jours <= 92 ? "day"
       // Deux ans en semaines font cent quarante barres larges d'un pixel : on
       // ne lit plus rien, et l'axe n'en nomme que six. Au-dela, le mois.
       : p.jours <= 730 ? "week" : "month";
}

/**
 * Le pas des courbes par categorie : UN CRAN PLUS GROSSIER, et c'est voulu.
 *
 * Six categories a deux ou trois ventes par seau donnent six lignes en dents de
 * scie ou l'on ne lit aucune tendance. Ecrit ici et pas dans la page, parce que
 * le titre de la section et le decoupage des donnees doivent dire la meme chose.
 */
export function pasCategories(p: Periode): Pas {
  return p.jours <= 2 ? "hour" : p.jours <= 7 ? "day"
       : p.jours <= 730 ? "week" : "month";
}

/** Le nom du pas, pour un titre de section. */
export const NOM_PAS: Record<Pas, string> = {
  hour: "Heure par heure", day: "Jour par jour",
  week: "Semaine par semaine", month: "Mois par mois",
};

/**
 * L'etiquette d'un seau. Dans une fenetre qui tient dans la journee, la date est
 * la meme partout : elle ne fait qu'user la place sous l'axe.
 */
function formatDe(p: Periode, pas: Pas): string {
  if (pas === "month") return "MM/YY";
  if (pas === "week") return '"sem. "DD/MM';
  if (pas === "day") return "DD/MM";
  return p.saisie.du.slice(0, 10) === p.saisie.au.slice(0, 10) ? 'HH24"h"' : 'DD/MM HH24"h"';
}

/**
 * LA FENETRE, ET LA MEME FENETRE JUSTE AVANT ELLE.
 *
 * La periode precedente n'est plus « moins N jours » mais « moins la duree
 * observee » : deux heures se comparent aux deux heures d'avant, et la regle vaut
 * aussi bien pour les fenetres toutes faites, ou elle donne le meme resultat
 * qu'avant.
 */
const DANS  = "v.faite_le >= $2::timestamptz AND v.faite_le < $3::timestamptz";
const AVANT = "v.faite_le >= $2::timestamptz - ($3::timestamptz - $2::timestamptz)"
            + " AND v.faite_le < $2::timestamptz";

/** La duree observee en jours, cote base : ce par quoi on divise une cadence. */
const DUREE_J = "GREATEST(EXTRACT(EPOCH FROM ($3::timestamptz - $2::timestamptz)) / 86400.0, 0.0007)";

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
const PORTEE = "AND ($4::bigint[] IS NULL OR b.id = ANY($4))";

export type Entete = {
  bornes: number; en_ligne: number; jamais_appairees: number;
  ventes: number; ca: number; marge: number;
  litiges: number; canaux_vides: number;
};

export async function entete(compte_id: number, p: Periode,
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
          AND v.statut = 'distribue' AND ${DANS})                   AS ventes,
      (SELECT COALESCE(SUM(v.prix_c),0)::int FROM vente v JOIN borne b ON b.id = v.borne_id
        WHERE b.compte_id = $1 ${PORTEE}
          AND v.statut = 'distribue' AND ${DANS})                   AS ca,
      (SELECT COALESCE(SUM(v.prix_c - COALESCE(a.prix_achat_c,0)),0)::int
         FROM vente v JOIN borne b ON b.id = v.borne_id
         LEFT JOIN v_prix_achat a ON a.produit_id = v.produit_id
        WHERE b.compte_id = $1 ${PORTEE}
          AND v.statut = 'distribue' AND ${DANS})                   AS marge,
      (SELECT COUNT(*)::int FROM vente v JOIN borne b ON b.id = v.borne_id
        WHERE b.compte_id = $1 ${PORTEE}
          AND v.statut <> 'distribue' AND v.traite_le IS NULL)                      AS litiges,
      (SELECT COUNT(*)::int FROM canal c JOIN borne b ON b.id = c.borne_id
        WHERE b.compte_id = $1 ${PORTEE}
          AND c.produit_id IS NOT NULL AND c.quantite = 0)                          AS canaux_vides
  `, [compte_id, p.debut, p.fin, bornes]))!;
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

export async function comparaison(compte_id: number, p: Periode,
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
       AND ${AVANT}
  `, [compte_id, p.debut, p.fin, bornes]))!;
}

/**
 * Un seau du graphe : une heure, un jour ou une semaine selon la duree observee.
 *
 * `weekend` est calcule EN BASE, dans le fuseau des chiffres. Il l'etait en
 * JavaScript, en relisant la date du seau comme si elle etait en UTC : juste
 * tant que les seaux etaient des jours entiers, faux des la premiere heure.
 */
export type Point = {
  cle: string; etiquette: string; n: number; ca: number; weekend: boolean;
};

export async function serie(compte_id: number, p: Periode,
                            bornes: number[] | null = null): Promise<Point[]> {
  const pas = pasDe(p);
  // La serie est generee cote base : sans elle, un seau sans vente disparaitrait
  // du graphe et le creux se lirait comme une baisse douce au lieu d'un trou.
  //
  // Le premier seau peut commencer AVANT le debut demande — une fenetre ouverte
  // a 08h30 tombe dans le seau de 08h. La jointure, elle, garde la borne exacte :
  // ce seau-la est partiel, il n'est pas faux.
  return q<Point>(`
    WITH l AS (
      SELECT $2::timestamptz AT TIME ZONE '${FUSEAU}' AS debut_l,
             $3::timestamptz AT TIME ZONE '${FUSEAU}' AS fin_l),
    serie AS (
      SELECT generate_series(date_trunc('${pas}', l.debut_l), l.fin_l,
                             interval '1 ${pas}') AS seau FROM l)
    SELECT to_char(s.seau, 'YYYY-MM-DD HH24:MI')   AS cle,
           to_char(s.seau, '${formatDe(p, pas)}')  AS etiquette,
           EXTRACT(ISODOW FROM s.seau) >= 6        AS weekend,
           COUNT(v.id)::int                        AS n,
           COALESCE(SUM(v.prix_c),0)::int          AS ca
      FROM serie s
      LEFT JOIN vente v
        ON date_trunc('${pas}', v.faite_le AT TIME ZONE '${FUSEAU}') = s.seau
       AND v.statut = 'distribue'
       AND ${DANS}
       AND v.borne_id IN (SELECT b.id FROM borne b
                           WHERE b.compte_id = $1 ${PORTEE})
     GROUP BY s.seau ORDER BY s.seau`, [compte_id, p.debut, p.fin, bornes]);
}

export type ParBorne = {
  id: number; nom: string; adresse: string | null; vue_le: Date | null;
  n: number; ca: number; marge: number; canaux: number; vides: number;
  /** Le chiffre de la meme borne sur la fenetre precedente — voir `comparaison`. */
  ca_avant: number;
};

export async function parBorne(compte_id: number, p: Periode,
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
         WHERE v.borne_id = b.id AND v.statut = 'distribue' AND ${DANS}
      ) x ON true
      -- Une machine peut faire le plus gros chiffre du parc en s'effondrant :
      -- le classement seul ne le dit pas, la pente si.
      LEFT JOIN LATERAL (
        SELECT SUM(v.prix_c)::int ca
          FROM vente v
         WHERE v.borne_id = b.id AND v.statut = 'distribue' AND ${AVANT}
      ) y ON true
     WHERE b.compte_id = $1 ${PORTEE}
     ORDER BY COALESCE(x.ca, 0) DESC, b.nom`, [compte_id, p.debut, p.fin, bornes]);
}

export type Croisement = {
  categorie_id: number | null; categorie: string; ordre: number;
  borne_id: number; borne: string; n: number; ca: number;
};

/** Les ventes par categorie ET par borne : le croisement qu'on ne peut pas deviner. */
export async function parCategorieEtBorne(compte_id: number, p: Periode,
                                          bornes: number[] | null = null): Promise<Croisement[]> {
  return q<Croisement>(`
    SELECT p.categorie_id, COALESCE(cat.nom, 'sans catégorie') AS categorie,
           COALESCE(cat.ordre, 999) AS ordre,
           b.id AS borne_id, b.nom AS borne,
           COUNT(*)::int n, SUM(v.prix_c)::int ca
      FROM vente v
      JOIN borne b   ON b.id = v.borne_id
      LEFT JOIN produit p     ON p.id = v.produit_id
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE b.compte_id = $1 ${PORTEE} AND v.statut = 'distribue' AND ${DANS}
     GROUP BY p.categorie_id, cat.nom, cat.ordre, b.id, b.nom
     ORDER BY COALESCE(cat.ordre, 999), cat.nom, ca DESC`, [compte_id, p.debut, p.fin, bornes]);
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
export async function parProduit(compte_id: number, p: Periode,
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
       AND v.statut = 'distribue' AND ${DANS}
     GROUP BY pr.id, pr.nom, pr.sku, cat.nom
     ORDER BY ca DESC, n DESC`, [compte_id, p.debut, p.fin, bornes]);
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
export async function autonomie(compte_id: number, p: Periode): Promise<Autonomie[]> {
  return q<Autonomie>(`
    WITH vendu AS (
      SELECT v.produit_id, COUNT(*)::int n
        FROM vente v JOIN borne b ON b.id = v.borne_id
       WHERE b.compte_id = $1 AND v.statut = 'distribue' AND ${DANS}
       GROUP BY v.produit_id)
    SELECT p.id, p.nom, p.sku, COALESCE(cat.nom, 'sans catégorie') AS categorie,
           COALESCE((SELECT SUM(s.quantite)::int FROM v_stock s WHERE s.produit_id = p.id), 0)
             + COALESCE((SELECT SUM(r.quantite)::int FROM v_en_route r WHERE r.produit_id = p.id), 0)
             AS stock,
           COALESCE(vendu.n, 0) AS vendus,
           ROUND(COALESCE(vendu.n, 0)::numeric / ${DUREE_J}, 2) AS par_jour,
           CASE WHEN COALESCE(vendu.n, 0) = 0 THEN NULL
                ELSE FLOOR(
                  (COALESCE((SELECT SUM(s.quantite)::int FROM v_stock s WHERE s.produit_id = p.id), 0)
                 + COALESCE((SELECT SUM(r.quantite)::int FROM v_en_route r WHERE r.produit_id = p.id), 0))
                  / (vendu.n::numeric / ${DUREE_J})) END AS jours_restants
      FROM produit p
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
      LEFT JOIN vendu ON vendu.produit_id = p.id
     WHERE p.compte_id = $1 AND p.actif
     ORDER BY jours_restants ASC NULLS LAST, stock ASC`, [compte_id, p.debut, p.fin]);
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
export async function categoriesDansLeTemps(compte_id: number, p: Periode,
                                            bornes: number[] | null = null) {
  const pas = pasCategories(p);
  const format = formatDe(p, pas);
  const seau = `date_trunc('${pas}', v.faite_le AT TIME ZONE '${FUSEAU}')`;
  const points = await q<PointCategorie>(`
    SELECT to_char(${seau}, 'YYYY-MM-DD HH24:MI') AS seau,
           to_char(${seau}, '${format}')          AS etiquette,
           p.categorie_id, COALESCE(cat.nom, 'sans catégorie') AS categorie,
           COALESCE(cat.ordre, 999) AS ordre,
           COUNT(*)::int n, SUM(v.prix_c)::int ca
      FROM vente v
      JOIN borne b ON b.id = v.borne_id
      LEFT JOIN produit p     ON p.id = v.produit_id
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE b.compte_id = $1 ${PORTEE}
       AND v.statut = 'distribue' AND ${DANS}
     GROUP BY 1, 2, p.categorie_id, cat.nom, cat.ordre
     ORDER BY 1`, [compte_id, p.debut, p.fin, bornes]);

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
