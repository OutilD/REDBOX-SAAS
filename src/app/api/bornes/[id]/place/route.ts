import { q, q1 } from "@/db";
import { estSuperAdmin, peutConfigurer, peutVoirBorne, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller } from "@/lib/borne";
import { dansLeCadre } from "@/lib/geo";
import { retourDe } from "@/app/carte/situer/retour";

export const dynamic = "force-dynamic";

/**
 * POST /api/bornes/[id]/place — la place d'une machine, choisie a la main :
 * une adresse prise dans les suggestions, un point touche ou glisse sur la
 * carte.
 *
 * LA PLACE CHOISIE NE SE REGEOCODE PAS. `situee_pour` recoit l'adresse : tant
 * qu'elle ne change pas, `situerBorne` n'y touche plus — sinon le point pose au
 * fond de la galerie marchande repartirait au centre de la rue a la prochaine
 * ouverture de la fiche. Une adresse modifiee plus tard, elle, se recherche de
 * nouveau : c'est une autre place.
 *
 * Qui peut : ceux qui configurent les machines de leur compte, et le
 * super-admin pour tout le parc. Si l'adresse change, la machine est reveillee
 * — elle l'affiche sur son ecran d'assistance, comme depuis la fiche.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return versPage(req, "/carte");

  const b = await q1<{ compte_id: number | null; adresse: string | null; jeton: string | null }>(
    "SELECT compte_id, adresse, jeton FROM borne WHERE id = $1", [id]);
  if (!b) return versPage(req, "/carte");
  const sienne = b.compte_id !== null && Number(b.compte_id) === Number(u.compte_id) && peutVoirBorne(u, id);
  if (!estSuperAdmin(u) && !(sienne && peutConfigurer(u))) return versPage(req, "/carte");

  const f = await req.formData();
  const r = String(f.get("r") ?? "");
  const ici = `/carte/situer/${id}?r=${encodeURIComponent(r)}`;
  const adresse = String(f.get("adresse") ?? "").trim().slice(0, 160);
  const ville = String(f.get("ville") ?? "").trim().slice(0, 80) || null;
  // Un champ vide donnerait 0 : hors du cadre, donc refuse comme il se doit.
  const latitude = Number(f.get("latitude") || NaN);
  const longitude = Number(f.get("longitude") || NaN);

  // Sans adresse, la prochaine fiche enregistree effacerait la place : la
  // machine n'aurait plus rien a afficher, et `situerBorne` viderait tout.
  if (!adresse) return versPage(req, `${ici}&e=adresse`);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !dansLeCadre(latitude, longitude)) {
    return versPage(req, `${ici}&e=place`);
  }

  await q(`
    UPDATE borne SET adresse = $2, situee_pour = $2, latitude = $3, longitude = $4,
                     ville = COALESCE($5::text, ville)
     WHERE id = $1`, [id, adresse, latitude, longitude, ville]);
  if (b.jeton && (b.adresse ?? "").trim() !== adresse) await reveiller(id, "adresse modifiée");

  const retour = retourDe(r, id, !sienne);
  return versPage(req, retour.startsWith("/admin") ? `/admin?ok=situee#m${id}` : retour);
}
