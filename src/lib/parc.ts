import { q } from "@/db";
import { PREFIXE_JETON } from "./demo";
import { STATUTS, type Statut } from "./statuts";

export { STATUTS, CLES, statutValide, nomDuStatut, type Statut } from "./statuts";

/** Les machines de la demo et de la vitrine ne sont pas des machines : on les ecarte de tout compte. */
export const SQL_VRAIE = `(b.jeton IS NULL OR b.jeton NOT LIKE '${PREFIXE_JETON}%')
       AND NOT EXISTS (SELECT 1 FROM compte cd WHERE cd.id = b.compte_id AND (cd.demo OR cd.vitrine))`;

/** Combien de machines a chaque stade, sur tout le parc. */
export async function compteurs(): Promise<Record<Statut, number>> {
  const l = await q<{ statut: Statut; n: number }>(`
    SELECT b.statut, COUNT(*)::int AS n FROM borne b
     WHERE ${SQL_VRAIE}
     GROUP BY b.statut`);
  const r = Object.fromEntries(STATUTS.map((s) => [s.cle, 0])) as Record<Statut, number>;
  for (const x of l) r[x.statut] = x.n;
  return r;
}

/**
 * Le statut qui suit une attribution. Une machine libre qui recoit un compte
 * est commandee ; une machine commandee ou promise qui perd son compte
 * redevient libre. Les autres stades ne bougent pas : c'est l'editeur qui les
 * fait avancer, a la main.
 */
export function statutApresAttribution(statut: Statut, compte_id: number | null): Statut {
  if (compte_id !== null && statut === "libre") return "commandee";
  if (compte_id === null && (statut === "commandee" || statut === "bientot")) return "libre";
  return statut;
}
