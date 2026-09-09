import { q } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";
import { COULEURS } from "@/lib/communaute";

export const dynamic = "force-dynamic";

/** POST /api/communaute/profil — pseudo, ville, bio, couleur, ouvert ou ferme. */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const f = await req.formData();
  const pseudo = String(f.get("pseudo") ?? "").trim();
  if (pseudo.length > 30) return versPage(req, "/communaute/moi?e=pseudo");
  const ville = String(f.get("ville") ?? "").trim().slice(0, 60);
  const bio = String(f.get("bio") ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 300);
  const couleur = String(f.get("couleur") ?? "");
  await q(`
    UPDATE utilisateur SET pseudo = $2, ville = $3, bio = $4, couleur = $5, profil_public = $6
     WHERE id = $1`,
    [u.id, pseudo || null, ville || null, bio || null, COULEURS.includes(couleur) ? couleur : null,
     f.get("public") === "on"]);
  return versPage(req, `/communaute/${u.id}?fait=enregistre`);
}
