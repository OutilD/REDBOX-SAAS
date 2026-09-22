/**
 * LES GOUTS D'UN PRODUIT DE LA CENTRALE — la partie lisible cote client.
 * L'editeur des gouts tourne dans le navigateur : il ne peut pas importer
 * `lib/centrale`, qui ouvre la base. Ce qu'il lui faut est ici, sans rien
 * d'autre que des types et des constantes.
 */

/** Un gout : son nom, et le nombre de gouts qu'un produit peut porter. */
export const GOUT_MAX = 60;
export const GOUTS_MAX = 80;

/** « best » : best-seller ; « nouveau » : vient d'arriver. Une seule etiquette par gout. */
export type Etiquette = "best" | "nouveau";
/** `image_id` : sa photo, servie par /api/image/[id] ; nulle pour un gout sans image. */
export type Gout = { nom: string; etiquette: Etiquette | null; image_id: number | null };
export const ETIQUETTES: { cle: Etiquette; nom: string; court: string }[] = [
  { cle: "best",    nom: "Best-seller", court: "Best" },
  { cle: "nouveau", nom: "Nouveau",     court: "New" },
];
