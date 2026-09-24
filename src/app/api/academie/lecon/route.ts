import { q, q1, transaction } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";
import { RESUME_MAX, TITRE_MAX, balayerFichiers, champ, deplacer, idsDe, ordonner, peutEditer,
         rangSuivant } from "@/lib/academie";

export const dynamic = "force-dynamic";

/** POST /api/academie/lecon — creer, modifier, deplacer, supprimer une lecon. */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutEditer(u)) return versPage(req, "/academie");
  const f = await req.formData();
  const action = String(f.get("action") ?? "");
  const titre = champ(f, "titre", TITRE_MAX);
  const resume = champ(f, "resume", RESUME_MAX);
  const acces = String(f.get("acces")) === "redboxers" ? "redboxers" : "tous";
  const d = Number(String(f.get("duree") ?? "").replace(",", "."));
  const duree = Number.isFinite(d) && d > 0 ? Math.min(600, Math.round(d)) : null;

  if (action === "creer") {
    const module_id = Number(f.get("module_id"));
    if (!Number.isInteger(module_id) || !(await q1("SELECT 1 FROM academie_module WHERE id = $1", [module_id]))) {
      return versPage(req, "/academie/editer");
    }
    if (!titre) return versPage(req, `/academie/editer/module/${module_id}?e=titre#lecons`);
    const nouvelle = await transaction(async (c) => {
      const ordre = await rangSuivant(c, "academie_lecon", module_id);
      const r = await c.query<{ id: number }>(`
        INSERT INTO academie_lecon (module_id, titre, resume, duree, acces, ordre)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [module_id, titre, resume, duree, acces, ordre]);
      return r.rows[0].id;
    });
    return versPage(req, `/academie/editer/lecon/${nouvelle}`);
  }

  if (action === "ordonner") {
    const ids = idsDe(f);
    const l = ids.length ? await q1<{ module_id: number }>("SELECT module_id FROM academie_lecon WHERE id = $1", [ids[0]]) : null;
    if (l) await ordonner("academie_lecon", ids);
    return versPage(req, l ? `/academie/editer/module/${l.module_id}#lecons` : "/academie/editer");
  }

  const id = Number(f.get("id"));
  const lecon = Number.isInteger(id)
    ? await q1<{ module_id: number }>("SELECT module_id FROM academie_lecon WHERE id = $1", [id])
    : null;
  if (!lecon) return versPage(req, "/academie/editer");
  const auModule = `/academie/editer/module/${lecon.module_id}`;

  if (action === "maj") {
    if (!titre) return versPage(req, `/academie/editer/lecon/${id}?e=titre`);
    await q(`
      UPDATE academie_lecon
         SET titre = $2, resume = $3, duree = $4, acces = $5, publie = $6, modifie_le = now()
       WHERE id = $1`, [id, titre, resume, duree, acces, String(f.get("publie")) === "1"]);
    return versPage(req, `/academie/editer/lecon/${id}?ok=1`);
  }
  if (action === "publier") {
    await q("UPDATE academie_lecon SET publie = $2, modifie_le = now() WHERE id = $1",
            [id, String(f.get("publie")) === "1"]);
    return versPage(req, `${auModule}#l${id}`);
  }
  if (action === "monter" || action === "descendre") {
    await deplacer("academie_lecon", id, action);
    return versPage(req, `${auModule}#l${id}`);
  }
  if (action === "supprimer") {
    await transaction(async (c) => {
      await c.query("DELETE FROM academie_lecon WHERE id = $1", [id]);
      await balayerFichiers(c);
    });
    return versPage(req, `${auModule}?ok=supprime#lecons`);
  }
  return versPage(req, auModule);
}
