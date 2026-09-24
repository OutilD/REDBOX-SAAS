import { q } from "@/db";

/**
 * COMBIEN DE JOURS AVANT QU'UNE SPIRE SOIT VIDE.
 *
 * Le stock d'un produit, a l'echelle du compte, dit quand racheter
 * (`tableau.autonomie`). Ici c'est l'autre question, celle de la tournee : dans
 * QUELLE machine, quelle spire va tomber a zero, et quand. Une Puff Menthe
 * peut avoir dix jours devant elle au Duplex et un seul Chez Marcel.
 *
 * On divise ce qu'il reste dans la spire par sa cadence des quatorze derniers
 * jours — assez pour lisser un week-end, assez court pour suivre une machine
 * qui vient d'etre deplacee. Une spire qui n'a rien vendu n'a pas d'autonomie
 * calculable : null, pas un infini deguise en « tout va bien ».
 */
export const FENETRE_J = 14;
/** Sous ce nombre de jours, on previent : le temps de passer avant la rupture. */
export const SEUIL_J = 3;

export type AutonomieCanal = {
  borne_id: number; lane: number; produit_id: number; nom: string;
  quantite: number; vendus: number; par_jour: number; jours_restants: number | null;
};

const REQUETE = `
  WITH vendu AS (
    SELECT v.borne_id, v.lane, COUNT(*)::int AS n
      FROM vente v JOIN borne b ON b.id = v.borne_id
     WHERE b.compte_id = $1 AND ($2::bigint[] IS NULL OR v.borne_id = ANY($2))
       AND v.statut = 'distribue' AND v.lane IS NOT NULL
       AND v.faite_le >= now() - interval '${FENETRE_J} days'
     GROUP BY v.borne_id, v.lane)
  SELECT c.borne_id, c.lane, c.produit_id, p.nom, c.quantite,
         COALESCE(vendu.n, 0) AS vendus,
         ROUND(COALESCE(vendu.n, 0)::numeric / ${FENETRE_J}, 2)::float AS par_jour,
         CASE WHEN COALESCE(vendu.n, 0) = 0 THEN NULL
              ELSE FLOOR(c.quantite / (vendu.n::numeric / ${FENETRE_J}))::int END AS jours_restants
    FROM canal c
    JOIN borne b ON b.id = c.borne_id
    JOIN produit p ON p.id = c.produit_id
    LEFT JOIN vendu ON vendu.borne_id = c.borne_id AND vendu.lane = c.lane
   WHERE b.compte_id = $1 AND ($2::bigint[] IS NULL OR c.borne_id = ANY($2))`;

/** Chaque spire garnie des machines demandees (toutes si `bornes` est nul). */
export async function autonomieCanaux(compte_id: number, bornes: number[] | null = null): Promise<AutonomieCanal[]> {
  return (await q<AutonomieCanal>(`${REQUETE} ORDER BY c.borne_id, c.lane`, [compte_id, bornes]))
    .map((x) => ({ ...x, borne_id: Number(x.borne_id), produit_id: Number(x.produit_id) }));
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
      if (c.jours_restants <= SEUIL_J && c.quantite > 0) {
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
