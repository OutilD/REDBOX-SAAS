import { dansLeCadre } from "@/lib/geo";
import { genreDe, temperature, type Apprenant } from "@/lib/academie-suivi";
import { nomAffiche } from "@/lib/personnes";
import type { PointPersonne } from "../carte/carte-maps";

/** Les prospects situes, prets pour la carte : futurs redboxers et curieux. */
export function pointsProspects(gens: Apprenant[]): PointPersonne[] {
  return gens.flatMap((a) => {
    if (a.redboxer || a.latitude === null || a.longitude === null || !dansLeCadre(a.latitude, a.longitude)) return [];
    const genre = genreDe(a);
    return [{
      cle: a.id, nom: nomAffiche(a), href: `/admin/comptes/${a.compte_id}`, genre,
      chaud: temperature(a) === "chaud", ville: a.situe_ville ?? a.ville ?? "",
      latitude: a.latitude, longitude: a.longitude,
      sous: `${a.finies}/${a.ouvertes} leçon${a.ouvertes > 1 ? "s" : ""} finie${a.finies > 1 ? "s" : ""} · compte ${a.compte}`,
    }];
  });
}
