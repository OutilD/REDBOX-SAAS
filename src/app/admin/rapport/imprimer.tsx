"use client";

/** Le bouton du rapport : la boite d'impression du navigateur, qui sait « Enregistrer en PDF ». */
export function Imprimer() {
  return (
    <button type="button" className="bouton primaire petit" onClick={() => window.print()}>
      Télécharger en PDF
    </button>
  );
}
