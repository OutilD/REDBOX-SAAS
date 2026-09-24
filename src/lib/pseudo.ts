/**
 * Le biscuit qui reporte d'un mois le bandeau « choisissez votre pseudo ».
 * Defini ici, dans un module sans « use client » : une constante exportee par
 * un composant client arrive dans un composant serveur sous forme de
 * reference, pas de valeur — et `cookies().get(reference)` ne trouve rien.
 */
export const BISCUIT_PSEUDO_REPORTE = "rbx_pseudo_reporte";
