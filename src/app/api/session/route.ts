import { q1 } from "@/db";
import { chiffrer, concorde, creerSession, enTeteBiscuit, ipDe, noterEchec, oublierEchecs, tropDEssais,
         versPage } from "@/lib/auth";
import { PRODUITS, adresse, hoteDes, produitDeLHote } from "@/lib/produits";

import { SQL_REDBOX_ATTRIBUEE } from "@/lib/communaute";

export const dynamic = "force-dynamic";

/**
 * UNE EMPREINTE FACTICE, pour qu'une adresse inconnue coute le meme calcul
 * qu'une vraie : sans elle, la reponse plus rapide disait quels comptes existent.
 */
let factice: string | null = null;
const empreinteFactice = () => (factice ??= chiffrer("pas-un-mot-de-passe"));

export async function POST(req: Request) {
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const mdp = String(f.get("mdp") ?? "");
  // Trop d'echecs recents pour cette adresse ou depuis cette IP : on ne verifie
  // meme pas, et l'on attend que la fenetre passe.
  const cles = ["mdp:" + email, "ip:" + ipDe(req)];
  if (await tropDEssais([[cles[0], 8], [cles[1], 30]])) return versPage(req, "/connexion?e=trop");
  const l = await q1<{ id: number; mdp: string }>(
    "SELECT id, mdp FROM utilisateur WHERE email = $1", [email]);
  // Meme reponse dans les deux cas, et meme temps : on ne dit pas quels comptes existent.
  const bon = concorde(mdp, l?.mdp ?? empreinteFactice());
  if (!l || !bon) {
    await noterEchec(cles);
    return versPage(req, "/connexion?e=1");
  }
  oublierEchecs([cles[0]]);
  // CHACUN ARRIVE DANS SON PRODUIT. Qui a une vraie machine — ou fait partie de
  // l'equipe RedBox — ouvre la gestion ; qui n'en a pas encore arrive dans
  // Connect, ou sont la communaute et l'academie. La gestion en demonstration
  // reste a un geste, par la bascule.
  const gere = await q1<{ oui: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM membre m JOIN compte k ON k.id = m.compte_id
       WHERE m.utilisateur_id = $1
         AND (k.editeur OR EXISTS (SELECT 1 FROM borne b WHERE b.compte_id = k.id
                                     AND ${SQL_REDBOX_ATTRIBUEE}))) AS oui`, [l.id]);
  // Deux hotes : on reste dans l'application ou l'on s'est connecte — qui ouvre
  // Connect veut Connect, meme avec dix machines. Seul un prospect qui se
  // connecte cote Gestion est conduit a Connect.
  const hote = hoteDes(req.headers), ici = produitDeLHote(hote);
  const produit = ici === "connect" || !gere?.oui ? "connect" : "gestion";
  return versPage(req, adresse(produit, PRODUITS[produit].accueil, hote), enTeteBiscuit(await creerSession(l.id), hote));
}
