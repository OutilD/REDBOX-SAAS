import { BADGES, NOM_RANG, RANGS, progresDe, rangDe,
         type Forme, type Profil, type Rang, type rareteDesBadges } from "@/lib/communaute";

type Rarete = Awaited<ReturnType<typeof rareteDesBadges>>;

/**
 * CE QU'UN BADGE MONTRE, PRET A VOYAGER.
 *
 * La revelation est un composant client : elle ne peut ni lire la base ni
 * appeler `progresDe`. Le serveur prepare donc, pour chaque badge, tout ce
 * qu'elle affiche — palier, devise, progression, date — en texte deja mis en
 * forme, et la liste part avec la page.
 */
export type VueBadge = {
  cle: string; nom: string; quoi: string; devise: string; forme: Forme;
  rang: Rang; nomRang: string;
  /** 1 pour un commun, 5 pour un mythique : le nombre de pips. */
  palier: number;
  points: number;
  obtenu: boolean; obtenuLe: string | null;
  /** Gagne depuis la derniere visite : sa revelation se joue d'elle-meme. */
  nouveau: boolean;
  progres: { n: number; sur: number; pct: number } | null;
  rarete: string;
};

/** Dans l'ordre de la collection : la vitrine d'abord, les plus rares en tete. */
export function vuesBadges(moi: Profil, rarete: Rarete): VueBadge[] {
  const obtenus = new Map(moi.badges.map((b) => [b.cle, b]));
  return [...BADGES]
    .map((b) => {
      const a = obtenus.get(b.cle);
      const rang = rangDe(b);
      const p = a ? null : progresDe(moi.faits, b.cle);
      const combien = rarete.get(b.cle);
      return {
        cle: b.cle, nom: b.nom, quoi: b.quoi, devise: b.devise, forme: b.forme,
        rang, nomRang: NOM_RANG[rang], palier: RANGS.indexOf(rang) + 1, points: b.points,
        obtenu: Boolean(a),
        obtenuLe: a ? new Date(a.obtenu_le).toLocaleDateString("fr-FR",
          { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" }) : null,
        nouveau: Boolean(a?.nouveau),
        progres: p ? { n: p.n, sur: p.sur, pct: p.pct } : null,
        rarete: combien && combien.n > 0
          ? `${combien.pct > 0 ? `${combien.pct} %` : "moins de 1 %"} des redboxers`
          : "personne ne l’a encore",
      };
    })
    .sort((x, z) => Number(z.obtenu) - Number(x.obtenu) || z.palier - x.palier || z.points - x.points);
}
