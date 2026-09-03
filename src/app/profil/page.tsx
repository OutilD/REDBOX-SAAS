import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { nomDuRole, utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * LA PAGE DE SON PROPRE COMPTE.
 *
 * Elle manquait : on pouvait changer le role des autres depuis l'equipe, et rien
 * de soi. Ni son nom — il n'existait pas —, ni sa photo, ni son mot de passe.
 *
 * TROIS BLOCS, ET C'EST DELIBERE. L'identite qu'on montre (nom, photo) ne se
 * valide pas comme l'identifiant de connexion (l'adresse), qui ne se valide pas
 * comme le mot de passe. Les melanger dans un seul pave aurait demande le mot de
 * passe actuel pour changer une photo.
 */
export default async function Profil({ searchParams }:
  { searchParams: Promise<{ e?: string; fait?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { e, fait } = await searchParams;

  const messages: Record<string, string> = {
    email: "Cette adresse n’est pas valide.",
    mdp: "Le nouveau mot de passe doit faire au moins huit caractères, et les deux saisies doivent être identiques.",
    actuel: "Mot de passe actuel incorrect.",
    adresse: "Adresse refusée.",
    photo: "Photo refusée : JPEG, PNG ou WebP, 2 Mo au plus. Le reste a été enregistré.",
  };

  return (
    <>
      <Entete page="profil" />
      <main className="ecran">
        <h1>Mon compte</h1>
        <p className="sous">
          Ce que voit votre équipe, et ce avec quoi vous vous connectez.
        </p>

        {fait ? <p className="avis-ok">Profil enregistré.</p> : null}
        {e ? <p className="erreur">{messages[e] ?? "Impossible."}</p> : null}

        <form method="post" action="/api/profil" encType="multipart/form-data">
          {/* ------------------------------------------------------ identite */}
          <div className="carte profil-tete">
            <div className="portrait">
              {u.image_id ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/image/${u.image_id}`} alt="" />
              ) : (
                <span className="jeton">{initiales(u.nom || u.email)}</span>
              )}
            </div>
            <div className="qui">
              <div className="nom">{u.nom || u.email.split("@")[0]}</div>
              <div className="meta">{nomDuRole(u.role)} · {u.compte}</div>
              <label className="fichier">
                <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
                <span>{u.image_id ? "Changer la photo" : "Choisir une photo"}</span>
              </label>
              {u.image_id ? (
                <label className="oter">
                  <input type="checkbox" name="oter" /> Retirer la photo
                </label>
              ) : null}
            </div>
          </div>

          {/* ------------------------------------------------------ le nom */}
          <div className="carte">
            <div className="champ">
              <label htmlFor="nom">Nom</label>
              <input id="nom" name="nom" defaultValue={u.nom ?? ""} maxLength={60}
                     placeholder="Comment votre équipe vous appelle" />
              <p className="faible" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
                Il remplace votre adresse partout où l’on vous nomme : la liste de
                l’équipe, et les traces de chargement.
              </p>
            </div>
          </div>

          {/* ------------------------------------- connexion : adresse et mot de passe */}
          <div className="carte">
            <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Connexion</h2>
            <p className="faible" style={{ fontSize: 13, margin: "0 0 14px" }}>
              Changer l’une de ces deux lignes demande votre mot de passe actuel.
              Un écran laissé ouvert deux minutes ne doit pas suffire à prendre le compte.
            </p>

            <div className="champ">
              <label htmlFor="email">Adresse</label>
              <input id="email" name="email" type="email" defaultValue={u.email}
                     inputMode="email" autoCapitalize="off" autoComplete="username" />
            </div>

            <div className="deux-colonnes">
              <div className="champ">
                <label htmlFor="neuf">Nouveau mot de passe</label>
                <input id="neuf" name="neuf" type="password" minLength={8}
                       autoComplete="new-password" placeholder="laisser vide pour ne pas changer" />
              </div>
              <div className="champ">
                <label htmlFor="neuf2">Le même</label>
                <input id="neuf2" name="neuf2" type="password" minLength={8}
                       autoComplete="new-password" />
              </div>
            </div>

            <div className="champ">
              <label htmlFor="actuel">Mot de passe actuel</label>
              <input id="actuel" name="actuel" type="password" autoComplete="current-password" />
            </div>
            <p className="faible" style={{ fontSize: 12.5, margin: 0 }}>
              Changer le mot de passe ferme vos autres sessions. Celle-ci reste ouverte.
            </p>
          </div>

          <button className="bouton primaire large">Enregistrer</button>
        </form>
      </main>
      <NavBasse page="profil" />
    </>
  );
}

/** Deux lettres, faute de photo. Le nom d'abord, l'adresse ensuite. */
function initiales(source: string): string {
  const mots = source.replace(/@.*/, "").split(/[.\s_-]+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "") + (mots[1]?.[0] ?? "")).toUpperCase() || "—";
}
