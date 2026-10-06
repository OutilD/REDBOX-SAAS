"use client";

/**
 * UNE PAGE A ECHOUE. On le dit, sans la trace du serveur, et l'on propose de
 * recommencer : la base qui a decroche une seconde repond souvent a la suivante.
 */
export default function Erreur({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="chantier">
      <div className="carte">
        <div className="sceau" aria-hidden="true">⚠️</div>
        <h1>Un souci est survenu</h1>
        <p>La page n’a pas pu s’afficher. Réessayez ; si cela recommence, revenez dans un moment.</p>
        <div className="portes">
          <button type="button" className="bouton large primaire" onClick={reset}>Réessayer</button>
          <a href="/" className="bouton large">Accueil</a>
        </div>
      </div>
    </main>
  );
}
