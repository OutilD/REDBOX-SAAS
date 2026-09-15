import { enLigne, euros, depuis } from "@/db";
import { GRAVITE, NOM_ETAT, santeDuPoint, slug, stadeDuPoint, type EtatPoint } from "@/lib/etats-carte";
import { STATUTS, nomDuStatut, type Statut } from "@/lib/statuts";

export { NOM_ETAT, slug, type EtatPoint } from "@/lib/etats-carte";

/** Une machine a placer : sa ville decide du rond qu'elle rejoint. */
export type Point = {
  cle: number; href: string; nom: string; etat: EtatPoint;
  ville: string | null; adresse: string | null; sous?: string;
  latitude: number; longitude: number;
  /** La page pour la deplacer, si l'on en a le droit d'ici. */
  situer?: string;
  /** Son stade, qui donne sa couleur au carre. Sans lui : posee, ou promise. */
  stade?: Statut;
  /** Son CA des 30 derniers jours, en centimes : une ville en fait la somme. */
  ca30?: number;
  /** Ce que dit la bulle au survol, ligne par ligne, deja mis en mots. */
  details?: [string, string][];
};

export type Groupe = {
  cle: string; ville: string; etat: EtatPoint; machines: Point[];
  latitude: number; longitude: number;
};

/**
 * Ce qu'une machine a rapporte, pour la bulle de la carte. A joindre sur
 * `borne b` en `LEFT JOIN LATERAL (${SQL_CHIFFRES}) v ON true`. Les ventes
 * distribuees seules, comme sur la page des comptes.
 */
export const SQL_CHIFFRES = `
  SELECT COUNT(*) FILTER (WHERE v.faite_le >= now() - interval '30 days')::int AS ventes_30,
         COALESCE(SUM(v.prix_c) FILTER (WHERE v.faite_le >= now() - interval '30 days'), 0)::int AS ca_30,
         COALESCE(SUM(v.prix_c), 0)::int AS ca_total,
         MAX(v.faite_le) AS derniere_vente
    FROM vente v WHERE v.borne_id = b.id AND v.statut = 'distribue'`;

export type Chiffres = { ventes_30: number; ca_30: number; ca_total: number; derniere_vente: Date | null };

/** Les lignes d'argent de la bulle. Une machine qui n'a jamais tourne n'en a pas. */
export function lignesChiffres(b: Chiffres & { jeton: string | null }): [string, string][] {
  if (!b.jeton && b.ca_total === 0) return [];
  return [
    ["CA 30 j", `${euros(b.ca_30)} · ${b.ventes_30} vente${b.ventes_30 > 1 ? "s" : ""}`],
    ["CA total", euros(b.ca_total)],
    ["Dernière vente", depuis(b.derniere_vente)],
  ];
}

/**
 * L'etat d'une machine, tel que la carte le colore. Une machine attribuee mais
 * pas encore appairee est « bientot installee » ; depairee, elle est « a
 * appairer » ; appairee, c'est son silence ou sa mise hors service qui parlent.
 */
export function etatDe(b: { jeton: string | null; hors_service: boolean; statut: string;
                            vue_le: Date | string | null }): EtatPoint {
  if (!b.jeton) return b.statut === "bientot" || b.statut === "commandee" ? "bientot" : "attente";
  if (b.hors_service) return "hs";
  return enLigne(b.vue_le) ? "ok" : "mal";
}

/**
 * UNE VILLE, UN ROND. Deux machines a Bordeaux ne font pas deux ronds qui se
 * chevauchent : un seul, avec le chiffre dedans, au centre des machines, de la
 * couleur de la moins bien portante. Sans ville connue, la machine fait son
 * propre rond, sous son nom.
 */
export function grouper(points: Point[]): Groupe[] {
  const par = new Map<string, Point[]>();
  for (const p of points) {
    const k = p.ville ? `v-${slug(p.ville)}` : `m-${p.cle}`;
    par.set(k, [...(par.get(k) ?? []), p]);
  }
  const groupes = [...par.entries()].map(([cle, machines]) => ({
    cle,
    ville: machines[0].ville ?? machines[0].nom,
    etat: GRAVITE.find((e) => machines.some((m) => m.etat === e)) ?? "ok" as EtatPoint,
    machines,
    latitude: machines.reduce((s, m) => s + m.latitude, 0) / machines.length,
    longitude: machines.reduce((s, m) => s + m.longitude, 0) / machines.length,
  }));
  groupes.sort((a, b) => b.machines.length - a.machines.length || a.ville.localeCompare(b.ville, "fr"));
  return groupes;
}

/**
 * Sous la carte : ce que veulent dire les couleurs, et combien chacune compte.
 * D'abord les stades — la couleur du carre —, puis la sante des installees —
 * la pastille au coin.
 */
export function Legende({ groupes }: { groupes: Groupe[] }) {
  const machines = groupes.flatMap((g) => g.machines);
  if (machines.length === 0) return null;
  const stades = STATUTS.map((s) => ({ cle: s.cle, nom: s.nom, n: machines.filter((m) => stadeDuPoint(m) === s.cle).length }))
                        .filter((s) => s.n > 0);
  const santes = (Object.keys(NOM_ETAT) as EtatPoint[])
    .map((e) => ({ e, n: machines.filter((m) => santeDuPoint(m) === e).length }))
    .filter((x) => x.n > 0);
  return (
    <div className="legende-carte" aria-label="Légende">
      {stades.map((s) => (
        <span key={s.cle} className="pilule stade" data-stade={s.cle}>
          <i />{s.nom} <b className="num">{s.n}</b>
        </span>
      ))}
      {santes.length > 0 ? <span className="separe" aria-hidden /> : null}
      {santes.map(({ e, n }) => (
        <span key={e} className="pilule" data-etat={e}>
          <i />{NOM_ETAT[e]} <b className="num">{n}</b>
        </span>
      ))}
    </div>
  );
}

/** Sous la carte : ville par ville, les machines qui s'y trouvent. */
export function ParVille({ groupes }: { groupes: Groupe[] }) {
  const tri = [...groupes].sort((a, b) => a.ville.localeCompare(b.ville, "fr"));
  if (tri.length === 0) return null;
  return (
    <div className="par-ville">
      {tri.map((g) => (
        <section key={g.cle} id={`ville-${slug(g.ville)}`} className="carte ville">
          <h3>{g.ville} <span className="compte num">{g.machines.length}</span></h3>
          <ul className="liste-a-situer">
            {g.machines.map((m) => {
              const sante = santeDuPoint(m);
              const stade = stadeDuPoint(m);
              return (
                <li key={m.cle}>
                  <div className="pousse" style={{ minWidth: 0 }}>
                    <a href={m.href} className="nom">{m.nom}</a>
                    <div className="ou">{m.adresse ?? "adresse à préciser"}{m.sous ? ` · ${m.sous}` : ""}</div>
                  </div>
                  {sante
                    ? <span className="pilule" data-etat={sante}><i />{NOM_ETAT[sante]}</span>
                    : <span className="pilule stade" data-stade={stade}><i />{nomDuStatut(stade)}</span>}
                  {m.situer ? <a href={m.situer} className="bouton petit">Re-situer</a> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
