/**
 * CETTE PAGE TOURNE-T-ELLE DANS SA PROPRE APPLICATION INSTALLEE ?
 *
 * Deux applications, deux adresses : « RedBox Gestion » et « RedBox Connect ».
 * Depuis la Gestion installee, le bouton « Connect » mene a l'autre adresse.
 * Le telephone l'ouvre alors DANS la fenetre de la Gestion, avec une barre de
 * navigateur par-dessus — et il repond encore « application installee »
 * (`navigator.standalone` sur iPhone, `display-mode: standalone` sur Android).
 * Connect se croyait donc chez elle :
 *
 *   - elle retenait « deja installee » et ne proposait plus jamais de
 *     s'installer, alors que seule la Gestion l'etait ;
 *   - elle compensait une fenetre plein ecran qu'elle n'avait pas
 *     (`hauteur-ecran.tsx`) : la barre du bas partait sous la barre du
 *     navigateur, ou hors de l'ecran.
 *
 * Ce qui la trahit : on y est ARRIVE D'UNE AUTRE ADRESSE. Une application
 * ouverte depuis son icone, ou par une notification, n'a pas de provenance.
 * La provenance tient au document : une navigation dans la page la garde, un
 * retour a l'adresse d'origine (la fenetre redevient l'application) la perd.
 */

/** Le telephone dit « application » — vrai aussi pour la vue navigateur d'une AUTRE application. */
function pleinEcranAnnonce(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia("(display-mode: standalone)").matches
    || document.referrer.startsWith("android-app://");
}

/** Arrivee depuis une autre adresse : un lien suivi depuis l'autre application. */
function venueDAilleurs(): boolean {
  const r = document.referrer;
  if (!r || r.startsWith("android-app://")) return false;
  try { return new URL(r).origin !== location.origin; } catch { return false; }
}

/** Vraiment dans l'application de cette adresse. */
export function dansLApplication(): boolean {
  return pleinEcranAnnonce() && !venueDAilleurs();
}

/** Dans la vue navigateur que l'autre application a ouverte par-dessus elle. */
export function chezLAutreApplication(): boolean {
  return pleinEcranAnnonce() && venueDAilleurs();
}
