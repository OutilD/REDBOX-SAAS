import { randomInt } from "node:crypto";
import { q, q1, entier } from "@/db";
import { chiffrer, estSuperAdmin, oublierEchecs, utilisateurDe, versPage } from "@/lib/auth";
import { attributSecure, hoteDes } from "@/lib/produits";

export const dynamic = "force-dynamic";

/** Sans 0/O ni 1/l/I : il se dicte au telephone sans se tromper. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * POST /api/admin/mot-de-passe — un mot de passe temporaire, pose par l'equipe.
 *
 * Il n'y a pas d'email dans RedBox : un client qui avait oublie le sien restait
 * dehors, sans recours. Le super-admin en tire un nouveau, le lit une fois sur la
 * fiche du compte et le transmet ; le client le change ensuite dans son profil.
 *
 * LE MOT DE PASSE NE PASSE PAS PAR L'ADRESSE (historique, journaux) : il voyage
 * dans un biscuit de deux minutes, limite aux pages admin des comptes.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");
  const f = await req.formData();
  const id = entier(f.get("utilisateur_id"));
  const compte = entier(f.get("compte_id"));
  const retour = compte ? `/admin/comptes/${compte}` : "/admin/comptes";
  if (!id || id === u.id) return versPage(req, retour);

  const mdp = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const l = await q1<{ email: string }>(
    "UPDATE utilisateur SET mdp = $2 WHERE id = $1 RETURNING email", [id, chiffrer(mdp)]);
  if (!l) return versPage(req, retour);
  // Les sessions ouvertes avec l'ancien tombent, et les essais rates ne
  // bloquent pas la premiere connexion avec le nouveau.
  await q("DELETE FROM session WHERE utilisateur_id = $1", [id]);
  oublierEchecs(["mdp:" + l.email]);

  const biscuit = `rb_mdp_temp=${id}.${mdp}; Path=/admin/comptes; HttpOnly; SameSite=Strict; Max-Age=120${attributSecure(hoteDes(req.headers))}`;
  return versPage(req, `${retour}?fait=mot_de_passe`, biscuit);
}
