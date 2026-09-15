import { q1, transaction } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";
import { peutEditer } from "@/lib/academie";
import { PLAN_TYPE } from "@/lib/academie-plan";

export const dynamic = "force-dynamic";

/**
 * POST /api/academie/plan-type — poser le plan de depart, en brouillon.
 *
 * Seulement sur une academie vide : relance, il doublerait tout. Trois
 * requetes, pas cinquante — Neon repond en un tiers de seconde depuis ici, et
 * une insertion par ligne ferait attendre vingt secondes devant un bouton.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutEditer(u)) return versPage(req, "/academie");
  if (await q1("SELECT 1 FROM academie_module LIMIT 1")) return versPage(req, "/academie/editer");

  await transaction(async (c) => {
    const mods = (await c.query<{ id: number; ordre: number }>(`
      INSERT INTO academie_module (titre, resume, icone, acces, ordre)
      SELECT titre, resume, icone, acces, ordre::int
        FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
             WITH ORDINALITY AS x(titre, resume, icone, acces, ordre)
      RETURNING id, ordre`,
      [PLAN_TYPE.map((m) => m.titre), PLAN_TYPE.map((m) => m.resume),
       PLAN_TYPE.map((m) => m.icone), PLAN_TYPE.map((m) => m.acces)])).rows;
    const idModule = new Map(mods.map((m) => [m.ordre, Number(m.id)]));

    // Une lecon se reconnait a son module et a son rang : RETURNING ne promet
    // pas l'ordre des lignes, ce couple-la est unique dans le plan.
    const lecons = PLAN_TYPE.flatMap((m, i) => m.lecons.map((l, j) => ({
      ...l, module_id: idModule.get(i + 1)!, ordre: j + 1,
    })));
    const lignes = (await c.query<{ id: number; module_id: number; ordre: number }>(`
      INSERT INTO academie_lecon (module_id, titre, resume, duree, acces, ordre)
      SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[], $4::int[], $5::text[], $6::int[])
      RETURNING id, module_id, ordre`,
      [lecons.map((l) => l.module_id), lecons.map((l) => l.titre), lecons.map((l) => l.resume),
       lecons.map((l) => l.duree), lecons.map((l) => l.acces), lecons.map((l) => l.ordre)])).rows;
    const idLecon = new Map(lignes.map((l) => [`${Number(l.module_id)}:${l.ordre}`, Number(l.id)]));

    const blocs = PLAN_TYPE.flatMap((m, i) => m.lecons.flatMap((l, j) => l.blocs.map((b, k) => ({
      ...b, lecon_id: idLecon.get(`${idModule.get(i + 1)}:${j + 1}`)!, ordre: k + 1,
    }))));
    await c.query(`
      INSERT INTO academie_bloc (lecon_id, genre, ordre, titre, texte, url)
      SELECT * FROM unnest($1::bigint[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[])`,
      [blocs.map((b) => b.lecon_id), blocs.map((b) => b.genre), blocs.map((b) => b.ordre),
       blocs.map((b) => b.titre ?? null), blocs.map((b) => b.texte ?? null), blocs.map((b) => b.url ?? null)]);
  });
  return versPage(req, "/academie/editer?ok=plan");
}
