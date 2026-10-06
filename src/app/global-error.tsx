"use client";

import "./globals.css";

/** La mise en page elle-meme a echoue : ce fichier la remplace, <html> compris. */
export default function ErreurGlobale({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body>
        <main className="chantier">
          <div className="carte">
            <div className="sceau" aria-hidden="true">⚠️</div>
            <h1>Un souci est survenu</h1>
            <p>RedBox n’a pas pu s’afficher. Réessayez dans un instant.</p>
            <div className="portes">
              <button type="button" className="bouton large primaire" onClick={reset}>Réessayer</button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
