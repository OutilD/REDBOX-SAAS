import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { nomDuRole, utilisateur } from "@/lib/auth";
import { BADGES, profilDe, rangDe } from "@/lib/communaute";
import { Badge } from "../communaute/badge";
import { AnneauNiveau, BarreNiveau } from "../communaute/niveau";
import { IcoSortir } from "../icones";

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
  const moi = await profilDe(u.id, u);

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

        {/* MES BADGES, EN TETE. C'est ici qu'on arrive en touchant sa pastille
            en haut a droite ; les badges n'etaient accessibles que par la page
            Communaute, qu'on ne pense pas a ouvrir pour se regarder soi. */}
        {moi ? (
          <section className="carte profil-jeu" aria-label="Mon niveau et mes badges">
            <div className="tete-jeu">
              <AnneauNiveau points={moi.points} taille={64} couleur={moi.couleur} />
              <div className="pousse" style={{ minWidth: 200 }}>
                <div className="rangee" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="etiquette grade grand">{moi.grade.nom}</span>
                  <span className="faible num" style={{ fontSize: 13 }}>
                    {moi.points} pts · {moi.badges.length} badge{moi.badges.length > 1 ? "s" : ""} sur {BADGES.length}
                  </span>
                </div>
                <BarreNiveau points={moi.points} />
              </div>
              <Link href="/communaute" className="bouton petit">Tous les badges ›</Link>
            </div>
            {moi.badges.length > 0 ? (
              <div className="badges-rangee" style={{ marginTop: 14 }}>
                {moi.badges.map((b) => (
                  <Link key={b.cle} href={`/communaute/badges/${b.cle}`}
                        className="badge-item" title={`${b.nom} — ${b.quoi}`}>
                    <Badge forme={b.forme} taille={34} rang={rangDe(b)} />
                    <span>{b.nom}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="faible" style={{ margin: "12px 0 0", fontSize: 13 }}>
                Pas encore de badge. <Link href="/communaute">Voir comment en gagner ›</Link>
              </p>
            )}
          </section>
        ) : null}

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

        {/* LA DECONNEXION, AU PIED DE LA PAGE. Dans l'en-tete, collee a la
            pastille du compte, on la touchait en voulant ouvrir son compte.
            Ici elle est seule, en rouge, loin de ce qu'on vient faire sur
            cette page — et c'est un formulaire a part : elle ne peut jamais
            partir avec « Enregistrer ». */}
        <form method="post" action="/api/session/fin" className="fin-de-session">
          <button className="bouton danger large">
            <IcoSortir size={17} /> Se déconnecter
          </button>
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
