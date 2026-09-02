import { q } from "@/db";
import { peutGererEquipe, ROLES, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * LE ROLE SE CHANGE SUR L'APPARTENANCE, PLUS SUR LA PERSONNE.
 *
 * Depuis qu'une meme adresse peut servir deux exploitants, « le role de
 * quelqu'un » ne veut plus rien dire tout seul : il n'a de sens que dans un
 * compte. Ecrire dans `utilisateur.role` aurait change son role PARTOUT, y
 * compris chez un exploitant qui n'a rien demande.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutGererEquipe(u)) return versPage(req, "/reglages");
  const f = await req.formData();
  const role = String(f.get("role") ?? "");
  if (!ROLES.some((r) => r.cle === role)) return versPage(req, "/reglages/equipe");
  // Ni soi-meme, ni le proprietaire : un compte sans proprietaire est un compte
  // que plus personne ne peut reprendre.
  await q(`UPDATE membre SET role = $1
            WHERE utilisateur_id = $2 AND compte_id = $3
              AND utilisateur_id <> $4 AND role <> 'proprietaire'`,
          [role, Number(f.get("id")), u.compte_id, u.id]);
  return versPage(req, "/reglages/equipe");
}
