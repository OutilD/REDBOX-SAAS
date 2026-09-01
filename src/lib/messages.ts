/**
 * CE QU'ON DIT APRES UNE ACTION.
 *
 * Un enregistrement reussi rechargeait la page sans un mot : on ne savait pas si
 * le clic avait porte, et on recliquait. Chaque mutation repart donc avec une
 * cle — `?fait=enregistre` — que le bandeau traduit.
 *
 * DEUX METIERS DISTINCTS, et c'est pourquoi le message court et le message long
 * coexistent sans se repeter : le bandeau dit CE QUI S'EST PASSE et s'efface ;
 * le texte de la page dit POURQUOI et reste tant que ce n'est pas regle. « Échec
 * de l'enregistrement » d'un cote, « Ce SKU existe deja » de l'autre.
 */
export const FAIT: Record<string, string> = {
  enregistre: "Enregistré",
  ajoute:     "Ajouté",
  supprime:   "Supprimé",
  retire:     "Retiré",
  suspendu:   "Suspendu — plus diffusé sur les bornes",
  repris:     "Repris — de nouveau diffusé",
  appairee:   "Borne appairée",
  depairee:   "Borne désappairée",
  synchro:    "Synchronisation demandée",
  charge:     "Chargement enregistré",
  invite:     "Invitation envoyée",
  place:      "Produit ajouté et posé sur sa spire",
};

/** Le bandeau rouge. Le detail, lui, reste sur la page. */
export const ECHEC = "L’enregistrement n’a pas abouti";
