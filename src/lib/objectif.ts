import { q, q1 } from "@/db";

/**
 * L'OBJECTIF DU MOIS. Un chiffre a atteindre, chaque mois, et la progression
 * du mois en cours a cote — pas la periode affichee, LE MOIS : c'est ainsi
 * qu'on se fixe un cap, et qu'un comptable le lit.
 */
export async function objectifDe(compte_id: number, borne_id: number | null): Promise<number | null> {
  const r = await q1<{ montant_c: number }>(
    "SELECT montant_c FROM objectif WHERE compte_id = $1 AND COALESCE(borne_id, 0) = COALESCE($2::bigint, 0)", [compte_id, borne_id]);
  return r ? Number(r.montant_c) : null;
}

export async function poserObjectif(compte_id: number, borne_id: number | null, montant_c: number | null): Promise<void> {
  if (montant_c === null || montant_c <= 0) {
    await q("DELETE FROM objectif WHERE compte_id = $1 AND COALESCE(borne_id, 0) = COALESCE($2::bigint, 0)", [compte_id, borne_id]);
    return;
  }
  await q(`
    INSERT INTO objectif (compte_id, borne_id, montant_c) VALUES ($1, $2, $3)
    ON CONFLICT (compte_id, COALESCE(borne_id, 0)) DO UPDATE SET montant_c = EXCLUDED.montant_c, modifie_le = now()`,
    [compte_id, borne_id, montant_c]);
}

export type Mois = { ca: number; jour: number; jours: number; nom: string };

/** Le chiffre du mois en cours (heure de Paris), et ou l'on en est dans le mois. */
export async function moisEnCours(compte_id: number, bornes: number[] | null): Promise<Mois> {
  const r = (await q1<{ ca: number; jour: number; jours: number; nom: string }>(`
    SELECT COALESCE((SELECT SUM(v.prix_c)::int FROM vente v JOIN borne b ON b.id = v.borne_id
                      WHERE b.compte_id = $1 AND ($2::bigint[] IS NULL OR b.id = ANY($2))
                        AND v.statut = 'distribue'
                        AND v.faite_le >= date_trunc('month', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris'), 0) AS ca,
           EXTRACT(DAY FROM now() AT TIME ZONE 'Europe/Paris')::int AS jour,
           EXTRACT(DAY FROM (date_trunc('month', now() AT TIME ZONE 'Europe/Paris') + interval '1 month - 1 day'))::int AS jours,
           '' AS nom`, [compte_id, bornes]))!;
  // Le nom du mois en francais vient d'ici, pas de la base : son horloge parle anglais.
  const nom = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });
  return { ...r, ca: Number(r.ca), nom: nom.charAt(0).toUpperCase() + nom.slice(1) };
}
