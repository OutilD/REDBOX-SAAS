"use client";

/**
 * MASQUER UN ENCART POUR UN TEMPS. Le bouton pose un biscuit que la page lit
 * avant de le montrer, et retire l'encart tout de suite — sans attendre la
 * page suivante. Le meme composant sert au bandeau du pseudo, a la checklist
 * de demarrage, a ce qui viendra.
 */
export default function Masquer({ biscuit, jours = 30, cible, children = "Masquer" }: {
  biscuit: string; jours?: number;
  /** Le selecteur de l'encart a retirer, cherche en remontant depuis le bouton. */
  cible: string; children?: React.ReactNode;
}) {
  return (
    <button type="button" className="bouton petit discret"
            onClick={(e) => {
              document.cookie = `${biscuit}=1; Path=/; Max-Age=${jours * 86400}; SameSite=Lax`;
              e.currentTarget.closest(cible)?.remove();
            }}>
      {children}
    </button>
  );
}
