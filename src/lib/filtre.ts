import { cookies } from "next/headers";

/**
 * LE FILTRE QU'ON A CHOISI LA DERNIERE FOIS.
 *
 * La periode et la RedBox se choisissent dans l'en-tete du tableau de bord,
 * des analytiques et des ventes. On les retenait dans l'adresse, donc on les
 * perdait au premier lien du menu : trente jours et tout le parc revenaient a
 * chaque page. Le navigateur les garde maintenant dans un biscuit (pose par
 * `app/occupe.tsx` a chaque changement), et une page qui n'en dit rien dans son
 * adresse repart de la.
 *
 * L'adresse gagne toujours : un lien qui porte `f` ou `b` dit ce qu'il veut.
 * `b` vide veut dire « toutes les RedBox », et c'est aussi ce qu'on retient.
 */
export const BISCUIT_FILTRE = "rbx_filtre";

export async function filtreRetenu(): Promise<{ f?: string; b?: string }> {
  const v = (await cookies()).get(BISCUIT_FILTRE)?.value;
  if (!v) return {};
  let brut = v;
  try { brut = decodeURIComponent(v); } catch { /* tel quel */ }
  const p = new URLSearchParams(brut);
  const f = p.get("f"), b = p.get("b");
  return { f: f && /^[a-z0-9]{1,8}$/.test(f) ? f : undefined, b: b !== null && /^\d{0,12}$/.test(b) ? b : undefined };
}
