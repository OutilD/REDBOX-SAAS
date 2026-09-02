import { transaction } from "@/db";
import { chiffrer, creerSession, enTeteBiscuit, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * L'INVITE ENTRE, QU'IL AIT DEJA UN ACCES OU NON.
 *
 * Deux chemins, et c'est l'adresse portee par l'invitation qui decide :
 *
 *  - ELLE EST INCONNUE. Le formulaire cree l'acces : le code porte l'adresse et
 *    le role, il ne manquait qu'un mot de passe. C'est le cas ordinaire.
 *
 *  - ELLE EXISTE DEJA. On n'y touche pas et on ne la recree pas : on ajoute une
 *    APPARTENANCE au compte qui invite. Mais il faut alors etre connecte comme
 *    cette personne — sans quoi n'importe qui, code en main, ajouterait un
 *    inconnu chez un exploitant.
 *
 * Le code est consomme dans la meme transaction : deux personnes ne peuvent pas
 * entrer avec le meme.
 */
export async function POST(req: Request) {
  const f = await req.formData();
  const code = String(f.get("code") ?? "").trim().toUpperCase();
  const mdp = String(f.get("mdp") ?? "");
  const mdp2 = String(f.get("mdp2") ?? "");
  const vers = (e: string) => versPage(req, `/rejoindre?e=${e}&code=${encodeURIComponent(code)}`);

  const connecte = await utilisateurDe(req);

  const issue = await transaction<{ souci: string | null; id: number; neuf: boolean }>(async (c) => {
    const inv = (await c.query<{ id: number; compte_id: number; email: string;
                                 role: string; borne_id: number | null }>(
      `SELECT id, compte_id, email, role, borne_id
         FROM invitation WHERE code = $1 AND utilisee_le IS NULL`, [code])).rows[0];
    if (!inv) return { souci: "code", id: 0, neuf: false };

    const existant = (await c.query<{ id: number }>(
      "SELECT id FROM utilisateur WHERE email = $1", [inv.email])).rows[0];

    let id: number;
    let neuf: boolean;
    if (existant) {
      // C'est bien lui ? Le code ne suffit pas a parler au nom d'une adresse
      // qui a deja un mot de passe.
      if (!connecte || connecte.id !== existant.id) {
        return { souci: "connexion", id: 0, neuf: false };
      }
      id = existant.id;
      neuf = false;
    } else {
      if (mdp.length < 8 || mdp !== mdp2) return { souci: "mdp", id: 0, neuf: false };
      id = (await c.query<{ id: number }>(
        "INSERT INTO utilisateur (compte_id, email, mdp, role) VALUES ($1,$2,$3,$4) RETURNING id",
        [inv.compte_id, inv.email, chiffrer(mdp), inv.role])).rows[0].id;
      neuf = true;
    }

    await c.query(`INSERT INTO membre (utilisateur_id, compte_id, role) VALUES ($1,$2,$3)
                   ON CONFLICT (utilisateur_id, compte_id) DO UPDATE SET role = EXCLUDED.role`,
                  [id, inv.compte_id, inv.role]);
    if (inv.borne_id !== null) {
      await c.query(`INSERT INTO acces_borne (utilisateur_id, borne_id) VALUES ($1,$2)
                     ON CONFLICT DO NOTHING`, [id, inv.borne_id]);
    }
    await c.query("UPDATE invitation SET utilisee_le = now() WHERE id = $1", [inv.id]);

    // On l'amene sur le compte qu'il vient de rejoindre, pas sur un autre.
    if (!neuf) {
      await c.query(`UPDATE session SET compte_id = $2 WHERE utilisateur_id = $1`,
                    [id, inv.compte_id]);
    }
    return { souci: null, id, neuf };
  });

  if (issue.souci) return vers(issue.souci);
  if (!issue.neuf) return versPage(req, "/");
  return versPage(req, "/", enTeteBiscuit(await creerSession(issue.id)));
}
