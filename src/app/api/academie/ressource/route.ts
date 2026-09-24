import { q, q1, transaction } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";
import { RESUME_MAX, TITRE_MAX, champ, deplacer, estIcone, idsDe, ordonner, peutEditer, rangSuivant } from "@/lib/academie";
import { lienDrive } from "@/lib/drive";

export const dynamic = "force-dynamic";

/** POST /api/academie/ressource — ajouter, modifier, deplacer, retirer un bouton Drive. */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutEditer(u)) return versPage(req, "/academie/ressources");
  const f = await req.formData();
  const action = String(f.get("action") ?? "");
  const id = Number(f.get("id"));
  const titre = champ(f, "titre", TITRE_MAX);
  const texte = champ(f, "texte", RESUME_MAX);
  const url = champ(f, "url", 500);
  const icone = String(f.get("icone") ?? "");
  const acces = String(f.get("acces")) === "redboxers" ? "redboxers" : "tous";

  if (action === "ordonner") {
    await ordonner("academie_ressource", idsDe(f));
    return versPage(req, "/academie/ressources");
  }
  if (action === "creer") {
    if (!titre) return versPage(req, "/academie/ressources?e=titre");
    if (!lienDrive(url)) return versPage(req, "/academie/ressources?e=drive");
    const nouveau = await transaction(async (c) => {
      const ordre = await rangSuivant(c, "academie_ressource", null);
      const r = await c.query<{ id: number }>(`
        INSERT INTO academie_ressource (titre, texte, url, icone, acces, ordre)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [titre, texte, url, estIcone(icone) ? icone : "document", acces, ordre]);
      return r.rows[0].id;
    });
    return versPage(req, `/academie/ressources?ok=1#r${nouveau}`);
  }

  if (!Number.isInteger(id) || !(await q1("SELECT 1 FROM academie_ressource WHERE id = $1", [id]))) {
    return versPage(req, "/academie/ressources");
  }
  const ici = `/academie/ressources/${id}`;

  if (action === "maj") {
    if (!titre) return versPage(req, `${ici}?e=titre#modifier`);
    if (!lienDrive(url)) return versPage(req, `${ici}?e=drive#modifier`);
    await q(`
      UPDATE academie_ressource
         SET titre = $2, texte = $3, url = $4, icone = $5, acces = $6, modifie_le = now()
       WHERE id = $1`,
      [id, titre, texte, url, estIcone(icone) ? icone : "document", acces]);
    return versPage(req, `${ici}?ok=1`);
  }
  if (action === "monter" || action === "descendre") {
    await deplacer("academie_ressource", id, action);
    return versPage(req, `/academie/ressources#r${id}`);
  }
  if (action === "supprimer") {
    await q("DELETE FROM academie_ressource WHERE id = $1", [id]);
    return versPage(req, "/academie/ressources?ok=supprime");
  }
  return versPage(req, ici);
}
