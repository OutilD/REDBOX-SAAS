import { q1 } from "@/db";
import { concorde, creerSession, enTeteBiscuit, versPage } from "@/lib/auth";
import { PRODUITS, adresse, hoteDes, produitDeLHote } from "@/lib/produits";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const mdp = String(f.get("mdp") ?? "");
  const l = await q1<{ id: number; mdp: string }>(
    "SELECT id, mdp FROM utilisateur WHERE email = $1", [email]);
  // Meme reponse dans les deux cas : on ne dit pas quels comptes existent.
  if (!l || !concorde(mdp, l.mdp)) return versPage(req, "/connexion?e=1");
  // CHACUN ARRIVE DANS SON PRODUIT. Qui a une vraie machine — ou fait partie de
  // l'equipe RedBox — ouvre la gestion ; qui n'en a pas encore arrive dans
  // Connect, ou sont la communaute et l'academie. La gestion en demonstration
  // reste a un geste, par la bascule.
  const gere = await q1<{ oui: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM membre m JOIN compte k ON k.id = m.compte_id
       WHERE m.utilisateur_id = $1
         AND (k.editeur OR EXISTS (SELECT 1 FROM borne b WHERE b.compte_id = k.id
                                     AND b.jeton IS NOT NULL AND b.jeton NOT LIKE 'demo\\_%'))) AS oui`, [l.id]);
  // Deux hotes : on reste dans l'application ou l'on s'est connecte — qui ouvre
  // Connect veut Connect, meme avec dix machines. Seul un prospect qui se
  // connecte cote Gestion est conduit a Connect.
  const hote = hoteDes(req.headers), ici = produitDeLHote(hote);
  const produit = ici === "connect" || !gere?.oui ? "connect" : "gestion";
  return versPage(req, adresse(produit, PRODUITS[produit].accueil, hote), enTeteBiscuit(await creerSession(l.id)));
}
