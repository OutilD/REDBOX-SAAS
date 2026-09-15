/**
 * Ou revenir apres avoir situe une machine. `r` vient de l'adresse de la page :
 * on ne suit qu'un chemin connu, jamais ce qu'on y a ecrit.
 */
export function retourDe(r: string | null | undefined, id: number, admin: boolean): string {
  if (r === "fiche") return `/bornes/${id}/fiche`;
  if (r === "borne") return `/bornes/${id}`;
  if (r === "admin") return `/admin#m${id}`;
  if (r === "carte") return "/carte";
  return admin ? `/admin#m${id}` : "/carte";
}
