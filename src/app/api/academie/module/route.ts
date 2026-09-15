import { q, q1, transaction } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";
import { RESUME_MAX, TITRE_MAX, balayerFichiers, champ, deplacer, estIcone, peutEditer,
         rangSuivant } from "@/lib/academie";

export const dynamic = "force-dynamic";

/** POST /api/academie/module — creer, modifier, deplacer, supprimer un module. */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutEditer(u)) return versPage(req, "/academie");
  const f = await req.formData();
  const action = String(f.get("action") ?? "");
  const id = Number(f.get("id"));
  const titre = champ(f, "titre", TITRE_MAX);
  const resume = champ(f, "resume", RESUME_MAX);
  const icone = String(f.get("icone") ?? "");
  const acces = String(f.get("acces")) === "redboxers" ? "redboxers" : "tous";

  if (action === "creer") {
    if (!titre) return versPage(req, "/academie/editer?e=titre");
    const nouveau = await transaction(async (c) => {
      const ordre = await rangSuivant(c, "academie_module", null);
      const r = await c.query<{ id: number }>(`
        INSERT INTO academie_module (titre, resume, icone, acces, ordre)
        VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [titre, resume, estIcone(icone) ? icone : "borne", acces, ordre]);
      return r.rows[0].id;
    });
    return versPage(req, `/academie/editer/module/${nouveau}`);
  }

  if (!Number.isInteger(id) || !(await q1("SELECT 1 FROM academie_module WHERE id = $1", [id]))) {
    return versPage(req, "/academie/editer");
  }

  if (action === "maj") {
    if (!titre) return versPage(req, `/academie/editer/module/${id}?e=titre`);
    await q(`
      UPDATE academie_module
         SET titre = $2, resume = $3, icone = $4, acces = $5, publie = $6, modifie_le = now()
       WHERE id = $1`,
      [id, titre, resume, estIcone(icone) ? icone : "borne", acces, String(f.get("publie")) === "1"]);
    return versPage(req, `/academie/editer/module/${id}?ok=1`);
  }
  if (action === "publier") {
    await q("UPDATE academie_module SET publie = $2, modifie_le = now() WHERE id = $1",
            [id, String(f.get("publie")) === "1"]);
    return versPage(req, `/academie/editer#m${id}`);
  }
  if (action === "monter" || action === "descendre") {
    await deplacer("academie_module", id, action);
    return versPage(req, `/academie/editer#m${id}`);
  }
  if (action === "supprimer") {
    await transaction(async (c) => {
      await c.query("DELETE FROM academie_module WHERE id = $1", [id]);
      await balayerFichiers(c);
    });
    return versPage(req, "/academie/editer?ok=supprime");
  }
  return versPage(req, "/academie/editer");
}
