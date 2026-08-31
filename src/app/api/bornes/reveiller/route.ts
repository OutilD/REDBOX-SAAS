import { q1 } from "@/db";
import { peutCharger, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller, reveillerLeCompte } from "@/lib/borne";

export const dynamic = "force-dynamic";

/**
 * Reveiller une borne — ou toutes.
 *
 * On ne pousse rien : on leve un drapeau, et la borne, qui tient une question
 * ouverte, y repond dans la seconde. Le geste est le meme pour l'utilisateur,
 * la mecanique est celle qui fonctionne derriere un routeur de bar.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutCharger(u)) return versPage(req, "/bornes");

  const f = await req.formData();
  const retour = String(f.get("retour") ?? "/bornes");
  const id = Number(f.get("id"));

  if (Number.isInteger(id) && id > 0) {
    // La borne doit etre du compte : sans ce controle, un identifiant devine
    // ferait travailler la machine du voisin.
    const b = await q1("SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2 AND jeton IS NOT NULL",
                       [id, u.compte_id]);
    if (!b) return versPage(req, retour);
    await reveiller(id, "demande depuis le SaaS");
    return versPage(req, `${retour}?reveil=1`);
  }

  const n = await reveillerLeCompte(u.compte_id, "demande depuis le SaaS");
  return versPage(req, `${retour}?reveil=${n}`);
}
