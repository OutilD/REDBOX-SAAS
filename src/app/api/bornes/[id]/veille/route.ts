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

  // LE DELAI NE SE TOUCHE QUE S'IL EST ENVOYE.
  //
  // Le formulaire d'affichage porte les deux reglages ; l'interrupteur de la
  // page Ecran d'accueil ne porte que le premier. Sans cette distinction, un
  // simple « couper » depuis la liste ramenait le delai a 90 s par defaut et
  // effacait sans le dire le reglage de l'exploitant.
  const champDelai = f.get("inactivite_s");
  const delai = champDelai === null ? null : inactiviteValide(champDelai);

  const b = await q1("SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!b) return versPage(req, "/bornes");

  if (delai === null) {
    await q1("UPDATE borne SET veille_active = $2 WHERE id = $1", [id, active]);
  } else {
    await q1("UPDATE borne SET veille_active = $2, inactivite_s = $3 WHERE id = $1",
             [id, active, delai]);
  }

  // Sans reveil, l'ordre attendrait le prochain appel — jusqu'a cinq minutes
  // devant une machine que l'exploitant regarde en attendant qu'elle change.
  await reveiller(id, active ? "écran d’accueil rétabli" : "écran d’accueil coupé");

  // ON REVIENT D'OU L'ON VIENT. Le reglage se prend depuis deux endroits — la
  // fiche d'affichage d'une borne, et la liste de la page Ecran d'accueil — et
  // renvoyer toujours vers la premiere sortait l'exploitant de sa page.
  // Un chemin interne seulement : une adresse venue du formulaire ne doit pas
  // pouvoir renvoyer ailleurs.
  const retour = String(f.get("retour") ?? "");
  const sur = retour.startsWith("/") && !retour.startsWith("//");
  return versPage(req, sur ? retour : `/bornes/${id}/affichage?veille=1`);
}
