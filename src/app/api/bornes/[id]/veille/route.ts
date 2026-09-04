import { q1 } from "@/db";
import { peutConfigurer, peutVoirBorne, utilisateurDe, versPage } from "@/lib/auth";
import { inactiviteValide, reveiller } from "@/lib/borne";

export const dynamic = "force-dynamic";

/**
 * L'ECRAN D'ACCUEIL D'UNE BORNE, ET SON DELAI D'ATTENTE.
 *
 * Deux reglages, un seul formulaire : ils ne se comprennent que l'un par
 * l'autre. Le delai ramene la machine « au repos », et ce que « repos » veut
 * dire est precisement ce que la premiere case decide — la veille, ou l'etal.
 * Les separer en deux ecrans aurait demande a l'exploitant de tenir la relation
 * de tete.
 *
 * C'est un reglage d'IMPLANTATION, pas de catalogue : il ne touche ni au stock,
 * ni au planogramme, ni a ce qui est en vente. Rien ici ne peut faire perdre une
 * unite.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return versPage(req, "/bornes");
  if (!peutConfigurer(u)) return versPage(req, `/bornes/${id}`);
  // CETTE BORNE LUI EST-ELLE OUVERTE ? Le compte ne suffit plus : quelqu'un
  // invite pour une seule machine appartient bien au compte, et pourrait
  // agir sur les autres en tapant leur numero dans l'adresse.
  if (!peutVoirBorne(u, id)) return versPage(req, "/bornes");

  const f = await req.formData();
  // Une case decochee n'est PAS envoyee : son absence vaut « non ». C'est
  // pourquoi on lit la presence du champ et non sa valeur.
  const active = f.get("veille") !== null;
  const delai = inactiviteValide(f.get("inactivite_s"));

  const b = await q1("SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!b) return versPage(req, "/bornes");

  await q1(`UPDATE borne SET veille_active = $2, inactivite_s = $3 WHERE id = $1`,
           [id, active, delai]);

  // Sans reveil, l'ordre attendrait le prochain appel — jusqu'a cinq minutes
  // devant une machine que l'exploitant regarde en attendant qu'elle change.
  await reveiller(id, active ? "écran d’accueil rétabli" : "écran d’accueil coupé");

  return versPage(req, `/bornes/${id}/affichage?veille=1`);
}
