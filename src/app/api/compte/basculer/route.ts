import { BISCUIT, basculerCompte, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * CHANGER DE COMPTE SANS SE RECONNECTER.
 *
 * Le compte actif vit sur la SESSION, pas sur la personne : deux navigateurs
 * ouverts sur deux exploitants differents, c'est exactement ce que fait un
 * prestataire qui suit deux clients en meme temps. Le porter sur l'utilisateur
 * aurait fait sauter l'un quand il bascule dans l'autre.
 *
 * `basculerCompte` refuse un compte auquel il n'appartient pas : un numero, ca
 * se devine, et ce formulaire est visible dans la page.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");

  const brut = req.headers.get("cookie") ?? "";
  let jeton = "";
  for (const morceau of brut.split(";")) {
    const [nom, ...reste] = morceau.trim().split("=");
    if (nom === BISCUIT) jeton = decodeURIComponent(reste.join("="));
  }
  if (!jeton) return versPage(req, "/connexion");

  const vise = Number((await req.formData()).get("compte_id"));
  if (!Number.isInteger(vise)) return versPage(req, "/");
  await basculerCompte(jeton, u.id, vise);
  // Vers l'accueil, jamais vers la page d'ou l'on vient : elle parlait d'une
  // borne ou d'un produit de l'autre compte, qui n'existent plus ici.
  return versPage(req, "/");
}
