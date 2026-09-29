import { q, q1 } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";
import { situerPersonne } from "@/lib/geo";

export const dynamic = "force-dynamic";

/** Les pages ou l'on revient apres avoir pose une ville. */
const RETOURS: Record<string, string> = {
  academie: "/admin/academie", admin: "/admin",
};

/**
 * POST /api/admin/personne — le super-admin donne sa ville a une personne qui
 * ne l'a pas ecrite, pour la poser sur la carte des prospects. C'est la ville
 * de son profil : elle la voit et peut la changer. On la cherche tout de suite.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");
  const f = await req.formData();
  const id = Number(f.get("id"));
  const ville = String(f.get("ville") ?? "").trim().slice(0, 60) || null;
  const r = String(f.get("r") ?? "");
  const retour = /^compte-\d+$/.test(r) ? `/admin/comptes/${r.slice(7)}` : RETOURS[r] ?? "/admin/academie";
  if (!Number.isInteger(id)) return versPage(req, retour);
  await q("UPDATE utilisateur SET ville = $2 WHERE id = $1", [id, ville]);
  await situerPersonne(id);
  const x = await q1<{ latitude: number | null }>("SELECT latitude FROM utilisateur WHERE id = $1", [id]);
  const ok = !ville || (x?.latitude !== null && x?.latitude !== undefined);
  return versPage(req, `${retour}${retour.includes("?") ? "&" : "?"}${ok ? "ok=ville" : "e=ville"}#carte-prospects`);
}
