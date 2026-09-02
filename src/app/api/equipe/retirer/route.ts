import { transaction } from "@/db";
import { peutGererEquipe, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * RETIRER QUELQU'UN D'UN COMPTE, PAS DE REDBOX.
 *
 * On effacait la personne. C'etait tenable tant qu'elle n'appartenait qu'a un
 * compte ; ca ne l'est plus — le reassortisseur qu'un exploitant remercie garde
 * ses deux autres clients, et son mot de passe avec.
 *
 * On retire donc l'APPARTENANCE, et les restrictions de bornes qui allaient
 * avec. Sa session ne tombe pas : elle est simplement renvoyee vers un autre de
 * ses comptes, et vers rien du tout s'il ne lui en reste aucun — auquel cas
 * `parJeton` la refuse d'elle-meme, et la personne se retrouve dehors.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutGererEquipe(u)) return versPage(req, "/reglages");
  const id = Number((await req.formData()).get("id"));
  await transaction(async (c) => {
    const cible = await c.query(`SELECT 1 FROM membre
      WHERE utilisateur_id = $1 AND compte_id = $2 AND utilisateur_id <> $3
        AND role <> 'proprietaire'`, [id, u.compte_id, u.id]);
    if ((cible.rowCount ?? 0) === 0) return;

    await c.query(`DELETE FROM acces_borne
       WHERE utilisateur_id = $1
         AND borne_id IN (SELECT id FROM borne WHERE compte_id = $2)`, [id, u.compte_id]);
    await c.query("DELETE FROM membre WHERE utilisateur_id = $1 AND compte_id = $2",
                  [id, u.compte_id]);
    // La session qui travaillait sur ce compte doit repartir d'ailleurs.
    await c.query("UPDATE session SET compte_id = NULL WHERE utilisateur_id = $1 AND compte_id = $2",
                  [id, u.compte_id]);
  });
  return versPage(req, "/reglages/equipe");
}
