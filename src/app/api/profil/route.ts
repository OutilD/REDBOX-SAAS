import { transaction } from "@/db";
import { chiffrer, concorde, utilisateurDe, versPage } from "@/lib/auth";
import { balayerImages, rangerImage } from "@/lib/image";

export const dynamic = "force-dynamic";

/**
 * LE PROFIL : SON NOM, SA PHOTO, SON ADRESSE, SON MOT DE PASSE.
 *
 * Tout part dans le meme envoi, mais TOUT NE SE VALIDE PAS PAREIL. Le nom et la
 * photo n'engagent rien ; l'adresse est l'identifiant de connexion, et le mot de
 * passe est le mot de passe. Les deux derniers demandent donc le mot de passe
 * actuel — sinon un ecran laisse ouvert deux minutes dans un bar suffirait a
 * prendre le compte.
 *
 * ON NE DIT PAS QUE L'ADRESSE EST DEJA PRISE. « Cette adresse est deja utilisee »
 * dit a qui essaie qu'un compte existe derriere. On refuse, et on parle
 * d'adresse « refusee » — la personne qui la possede vraiment sait pourquoi.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");

  const f = await req.formData();
  const nom = String(f.get("nom") ?? "").trim();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const actuel = String(f.get("actuel") ?? "");
  const neuf = String(f.get("neuf") ?? "");
  const neuf2 = String(f.get("neuf2") ?? "");
  const photo = f.get("photo");
  const oter = f.get("oter") !== null;

  const changeEmail = email !== "" && email !== u.email;
  const changeMdp = neuf !== "";

  if (changeEmail && !email.includes("@")) return versPage(req, "/profil?e=email");
  if (changeMdp && (neuf.length < 8 || neuf !== neuf2)) return versPage(req, "/profil?e=mdp");

  let souci: string | null = null;
  await transaction(async (c) => {
    if (changeEmail || changeMdp) {
      const l = await c.query<{ mdp: string }>(
        "SELECT mdp FROM utilisateur WHERE id = $1", [u.id]);
      if (!l.rows[0] || !concorde(actuel, l.rows[0].mdp)) { souci = "actuel"; return; }
    }

    await c.query("UPDATE utilisateur SET nom = $1 WHERE id = $2", [nom || null, u.id]);

    if (changeEmail) {
      const pris = await c.query("SELECT 1 FROM utilisateur WHERE email = $1 AND id <> $2",
                                 [email, u.id]);
      if ((pris.rowCount ?? 0) > 0) { souci = "adresse"; return; }
      await c.query("UPDATE utilisateur SET email = $1 WHERE id = $2", [email, u.id]);
    }

    if (changeMdp) {
      await c.query("UPDATE utilisateur SET mdp = $1 WHERE id = $2", [chiffrer(neuf), u.id]);
      // Les autres sessions tombent : changer son mot de passe, c'est souvent
      // parce qu'on craint que quelqu'un l'ait. La sienne survit, elle est
      // identifiee par le biscuit qu'on vient de presenter.
      await c.query("DELETE FROM session WHERE utilisateur_id = $1 AND jeton <> $2",
                    [u.id, jetonDe(req)]);
    }

    if (photo instanceof File && photo.size > 0) {
      const img = await rangerImage(c, u.compte_id, photo);
      if (img === null) souci = "photo";
      else await c.query("UPDATE utilisateur SET image_id = $1 WHERE id = $2", [img, u.id]);
    } else if (oter) {
      await c.query("UPDATE utilisateur SET image_id = NULL WHERE id = $1", [u.id]);
    }

    await balayerImages(c, u.compte_id);
  });

  return versPage(req, souci ? `/profil?e=${souci}` : "/profil?fait=1");
}

/** Le jeton de la session en cours, pour ne pas se deconnecter soi-meme. */
function jetonDe(req: Request): string {
  const brut = req.headers.get("cookie") ?? "";
  for (const morceau of brut.split(";")) {
    const [nom, ...reste] = morceau.trim().split("=");
    if (nom === "rbx") return decodeURIComponent(reste.join("="));
  }
  return "";
}
