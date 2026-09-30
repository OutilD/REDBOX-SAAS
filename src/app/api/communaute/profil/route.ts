import { q } from "@/db";
import { apres } from "@/lib/apres";
import { utilisateurDe, versPage } from "@/lib/auth";
import { situerPersonne } from "@/lib/geo";
import { COULEURS, PSEUDO_MAX, VEDETTES_MAX } from "@/lib/communaute";

export const dynamic = "force-dynamic";

/** POST /api/communaute/profil — pseudo, ville, bio, couleur, ouvert ou ferme, vitrine (vedette x3). */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const f = await req.formData();
  const pseudo = String(f.get("pseudo") ?? "").trim();
  if (pseudo.length > PSEUDO_MAX) return versPage(req, "/communaute/moi?e=pseudo");
  const ville = String(f.get("ville") ?? "").trim().slice(0, 60);
  const bio = String(f.get("bio") ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 300);
  const couleur = String(f.get("couleur") ?? "");
  const vedettes = [...new Set(f.getAll("vedette").map(String))];
  if (vedettes.length > VEDETTES_MAX) return versPage(req, "/communaute/moi?e=vitrine#vitrine");
  // Seulement des badges obtenus : on ne met pas en vitrine ce qu'on n'a pas.
  await q(`
    UPDATE utilisateur SET pseudo = $2, ville = $3, bio = $4, couleur = $5, profil_public = $6,
           badges_vedettes = ARRAY(SELECT v FROM unnest($7::text[]) WITH ORDINALITY AS t(v, i)
                                    WHERE EXISTS (SELECT 1 FROM badge_obtenu o WHERE o.utilisateur_id = $1 AND o.badge = v)
                                    ORDER BY i)
     WHERE id = $1`,
    [u.id, pseudo || null, ville || null, bio || null, COULEURS.includes(couleur) ? couleur : null,
     f.get("public") === "on", vedettes]);
  // Sa ville la pose sur la carte de la plateforme ; le geocodeur ne la fait pas attendre.
  apres("situer la personne", () => situerPersonne(u.id));
  return versPage(req, `/communaute/${u.id}?fait=enregistre`);
}
