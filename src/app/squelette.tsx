/**
 * LES SQUELETTES : la forme d'une page avant ses chiffres.
 *
 * La base est de l'autre cote de l'Atlantique : une page met une bonne demi-
 * seconde a reunir ses lectures. Plutot qu'un ecran figé, on montre tout de
 * suite ce qui ne depend de rien — le titre, les onglets — et, a la place de
 * ce qui arrive, des blocs gris de la meme taille. La page ne saute pas quand
 * les vrais chiffres prennent leur place.
 *
 * Des briques, pas un squelette par page ecrit a la main : une ligne, un bloc,
 * une grille. Chaque page compose le sien en trois lignes.
 */

export function SqLigne({ l = "60%", h = 14 }: { l?: string | number; h?: number }) {
  return <span className="sq sq-ligne" style={{ width: l, height: h }} aria-hidden="true" />;
}

export function SqBloc({ h = 120, className = "" }: { h?: number; className?: string }) {
  return <div className={`sq sq-bloc ${className}`} style={{ height: h }} aria-hidden="true" />;
}

/** Une carte : quelques lignes de texte sur une surface. */
export function SqCarte({ lignes = 3, h }: { lignes?: number; h?: number }) {
  return (
    <div className="sq-carte" style={h ? { minHeight: h } : undefined} aria-hidden="true">
      {Array.from({ length: lignes }, (_, i) => (
        <SqLigne key={i} l={i === 0 ? "40%" : i === lignes - 1 ? "55%" : "85%"} h={i === 0 ? 18 : 13} />
      ))}
    </div>
  );
}

/** Une grille de cartes, comme une liste de machines ou de produits. */
export function SqGrille({ n = 6, h = 140, colonnes = "repeat(auto-fill, minmax(240px, 1fr))" }:
  { n?: number; h?: number; colonnes?: string }) {
  return (
    <div className="sq-grille" style={{ gridTemplateColumns: colonnes }} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <SqCarte key={i} h={h} />)}
    </div>
  );
}

/** L'enveloppe : elle dit aux lecteurs d'ecran que ca charge, une fois. */
export function Squelette({ children }: { children: React.ReactNode }) {
  return <div className="squelette" role="status" aria-busy="true" aria-label="Chargement">{children}</div>;
}
