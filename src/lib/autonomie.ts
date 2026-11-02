import { q } from "@/db";

/**
 * COMBIEN DE JOURS AVANT QU'UNE SPIRE SOIT VIDE.
 *
 * Le seul calcul de rupture de la console : tableau de bord, analytiques,
 * tournee et notifications lisent tous ici. Il se fait par spire, pas par
 * produit : une Puff Menthe peut avoir dix jours devant elle au Duplex et un
 * seul Chez Marcel, et le stock d'une machine n'en depanne pas une autre.
 *
 * On divise ce qu'il reste dans la spire, et ce qui est en route vers elle, par
 * sa cadence des quatorze derniers jours — assez pour lisser un week-end, assez court pour suivre une machine
 * qui vient d'etre deplacee. Une spire qui n'a rien vendu n'a pas d'autonomie
 * calculable : null, pas un infini deguise en « tout va bien ».
 */
export const FENETRE_J = 14;
/** Sous ce nombre de jours, on previent : le temps de passer avant la rupture. */
export const SEUIL_J = 3;
/** Jusqu'ou l'on regarde pour preparer la semaine : au-dela, rien a faire encore. */
export const HORIZON_J = 7;

export type AutonomieCanal = {
  borne_id: number; borne: string; lane: number; rangee: number; colonne: number;
  produit_id: number; nom: string; categorie: string;
  quantite: number; en_route: number; vendus: number; par_jour: number; jours_restants: number | null;
};

const REQUETE = `
  WITH vendu AS (
    SELECT v.borne_id, v.lane, COUNT(*)::int AS n
      FROM vente v JOIN borne b ON b.id = v.borne_id
     WHERE b.compte_id = $1 AND ($2::bigint[] IS NULL OR v.borne_id = ANY($2))
       AND v.statut = 'distribue' AND v.lane IS NOT NULL
       AND v.faite_le >= now() - interval '${FENETRE_J} days'
     GROUP BY v.borne_id, v.lane),
  route AS (
    SELECT vers_lieu_id AS lieu_id, lane, SUM(quantite)::int AS n
      FROM mouvement
     WHERE compte_id = $1 AND motif = 'transfert' AND lane IS NOT NULL
       AND confirme_le IS NULL AND annule_le IS NULL
     GROUP BY vers_lieu_id, lane)
  SELECT c.borne_id, b.nom AS borne, c.lane, c.rangee, c.colonne, c.produit_id, p.nom,
         COALESCE(cat.nom, 'sans catégorie') AS categorie, c.quantite,
         COALESCE(route.n, 0) AS en_route,
         COALESCE(vendu.n, 0) AS vendus,
         ROUND(COALESCE(vendu.n, 0)::numeric / ${FENETRE_J}, 2)::float AS par_jour,
         CASE WHEN COALESCE(vendu.n, 0) = 0 THEN NULL
              ELSE FLOOR((c.quantite + COALESCE(route.n, 0)) / (vendu.n::numeric / ${FENETRE_J}))::int END AS jours_restants
    FROM canal c
    JOIN borne b ON b.id = c.borne_id
    JOIN produit p ON p.id = c.produit_id
    LEFT JOIN categorie cat ON cat.id = p.categorie_id
    LEFT JOIN vendu ON vendu.borne_id = c.borne_id AND vendu.lane = c.lane
    LEFT JOIN route ON route.lieu_id = b.lieu_id AND route.lane = c.lane
   WHERE b.compte_id = $1 AND ($2::bigint[] IS NULL OR c.borne_id = ANY($2)) AND p.actif`;

/** Chaque spire garnie des machines demandees (toutes si `bornes` est nul). */
export async function autonomieCanaux(compte_id: number, bornes: number[] | null = null): Promise<AutonomieCanal[]> {
  return (await q<AutonomieCanal>(`${REQUETE} ORDER BY c.borne_id, c.lane`, [compte_id, bornes]))
    .map((x) => ({ ...x, borne_id: Number(x.borne_id), produit_id: Number(x.produit_id) }));
}

/**
 * Ce qui va manquer d'ici `HORIZON_J`, le plus presse d'abord. Une spire deja
 * vide n'en est pas : le tableau de bord la compte a part, dans les canaux vides.
 */
export async function spiresARisque(compte_id: number, bornes: number[] | null = null): Promise<AutonomieCanal[]> {
  return (await autonomieCanaux(compte_id, bornes))
    .filter((c) => c.jours_restants !== null && c.jours_restants <= HORIZON_J && c.quantite + c.en_route > 0)
    .sort((a, b) => a.jours_restants! - b.jours_restants!);
}

export type UrgenceBorne = {
  /** La spire la plus pressee, en jours ; null si rien ne se vend. */
  jours_min: number | null;
  /** Combien de spires tombent sous le seuil. */
  pressees: number;
  /** Ce qui presse, pour le dire en une ligne. */
  detail: { lane: number; nom: string; jours: number; quantite: number }[];
};

/** Par machine : ce qui va manquer sous `SEUIL_J` jours. */
export async function urgencesParBorne(compte_id: number, bornes: number[] | null = null): Promise<Map<number, UrgenceBorne>> {
  const out = new Map<number, UrgenceBorne>();
  for (const c of await autonomieCanaux(compte_id, bornes)) {
    const u = out.get(c.borne_id) ?? { jours_min: null, pressees: 0, detail: [] };
    if (c.jours_restants !== null) {
      u.jours_min = u.jours_min === null ? c.jours_restants : Math.min(u.jours_min, c.jours_restants);
      if (c.jours_restants <= SEUIL_J && c.quantite + c.en_route > 0) {
        u.pressees++;
        u.detail.push({ lane: c.lane, nom: c.nom, jours: c.jours_restants, quantite: c.quantite });
      }
    }
    out.set(c.borne_id, u);
  }
  for (const u of out.values()) u.detail.sort((a, b) => a.jours - b.jours);
  return out;
}

/** « ≈ 2 j », « aujourd’hui », ou rien. */
export function joursTexte(j: number | null): string | null {
  if (j === null) return null;
  if (j <= 0) return "aujourd’hui";
  return `≈ ${j} j`;
}
