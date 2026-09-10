import { PAS_NIVEAU, niveauProgres } from "@/lib/communaute";

/**
 * L'ANNEAU DU NIVEAU.
 *
 * Un chiffre seul — « niveau 5 » — ne dit pas si l'on vient d'y arriver ou si
 * l'on en sort. L'anneau montre les deux d'un coup : le rang au centre, et la
 * part parcourue depuis le precedent tout autour. C'est la meme information
 * que « 109 / 250 », en une forme qu'on lit sans lire.
 *
 * Trace, pas anime : une jauge qui se remplit a chaque chargement de page
 * amuse une fois et agace les suivantes.
 */
export function AnneauNiveau({ points, taille = 92, couleur }:
  { points: number; taille?: number; couleur?: string | null }) {
  const { niveau, dans, pct } = niveauProgres(points);
  const epaisseur = Math.max(4, Math.round(taille * 0.075));
  const r = (taille - epaisseur) / 2;
  const tour = 2 * Math.PI * r;
  return (
    <span className="anneau-niveau" style={{ width: taille, height: taille }}
          title={`Niveau ${niveau} — ${dans} points sur ${PAS_NIVEAU}`}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden>
        <circle className="piste" cx={taille / 2} cy={taille / 2} r={r} fill="none" strokeWidth={epaisseur} />
        <circle className="part" cx={taille / 2} cy={taille / 2} r={r} fill="none" strokeWidth={epaisseur}
                strokeLinecap="round" stroke={couleur ?? undefined}
                strokeDasharray={tour} strokeDashoffset={tour * (1 - pct / 100)}
                transform={`rotate(-90 ${taille / 2} ${taille / 2})`} />
      </svg>
      <span className="dedans">
        <b className="num" style={{ fontSize: Math.round(taille * 0.3) }}>{niveau}</b>
        <small>niveau</small>
      </span>
    </span>
  );
}

/**
 * LA BARRE VERS LE NIVEAU SUIVANT, avec ce qu'il reste a faire ecrit au bout.
 * « Encore 141 » repond a la seule question qu'on se pose devant un niveau.
 */
export function BarreNiveau({ points }: { points: number }) {
  const { niveau, dans, reste, pct } = niveauProgres(points);
  return (
    <div className="barre-niveau">
      <div className="piste"><span style={{ width: `${pct}%` }} /></div>
      <div className="dit">
        <span className="num"><b>{dans}</b> / {PAS_NIVEAU}</span>
        <span className="faible num">encore {reste} pour le niveau {niveau + 1}</span>
      </div>
    </div>
  );
}
