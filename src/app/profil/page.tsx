import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { nomDuRole, utilisateur } from "@/lib/auth";
import { classement, evaluerBadges, profilDe, rareteDesBadges } from "@/lib/communaute";
import CarteMoi from "../communaute/carte-moi";
import Revelation from "../communaute/revelation";
import { vuesBadges } from "../communaute/vues-badges";
import { IcoSortir } from "../icones";
import ChangerPhoto from "./changer-photo";

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
  // Les badges sont reevalues ici aussi : c'est la page ou l'on se regarde, un
  // badge gagne depuis la derniere visite a la Communaute doit s'y voir. Leur
  // annonce « Nouveau badge ! » reste a la Communaute.
  await evaluerBadges(u.id);
  const [moi, tous, rarete] = await Promise.all([profilDe(u.id, u), classement(1000), rareteDesBadges()]);
  // Toucher un badge de la carte le revele ici aussi. L'annonce des nouveaux
  // reste a la Communaute, qui les marque vus : ici, elle se rejouerait a chaque visite.
  const vues = moi ? vuesBadges(moi, rarete).map((v) => ({ ...v, nouveau: false })) : [];
  const monRang = tous.findIndex((c) => c.id === u.id) + 1;
  const ecart = monRang > 1 ? tous[monRang - 2].points - tous[monRang - 1].points : 0;

  const messages: Record<string, string> = {
    email: "Cette adresse n’est pas valide.",
    mdp: "Le nouveau mot de passe doit faire au moins huit caractères, et les deux saisies doivent être identiques.",
    actuel: "Mot de passe actuel incorrect.",
    adresse: "Adresse refusée.",
    photo: "Photo refusée : il faut une image JPEG, PNG ou WebP de 8 Mo au plus.",
  };

  return (
    <>
      <Entete page="profil" />
      <main className="ecran">
        <h1>Mon compte</h1>
        <p className="sous">
          Ce que voit votre équipe, et ce avec quoi vous vous connectez.
        </p>

        {/* MON NIVEAU ET MES BADGES, EN TETE. C'est ici qu'on arrive en touchant
            sa pastille en haut a droite. La petite carte d'avant, anneau de 64 px
            et badges en ligne, se lisait mal au telephone : on allait chercher
            la grande sur la Communaute. C'est maintenant la meme. */}
        {moi ? (
          <div style={{ marginBottom: 14 }}>
            <CarteMoi moi={moi} id={u.id} monRang={monRang} ecart={ecart} lienBadges />
            <Revelation badges={vues} />
          </div>
        ) : null}

        {fait ? <p className="avis-ok">Profil enregistré.</p> : null}
        {e ? <p className="erreur">{messages[e] ?? "Impossible."}</p> : null}

        {/* ------------------------------------------------------ identite
            La photo a son propre formulaire, hors de celui du bas : la choisir
            l'enregistre aussitot. Dans le grand formulaire, il fallait ensuite
            descendre jusqu'a « Enregistrer », sous le mot de passe, et rien ne
            changeait a l'ecran en attendant — on croyait qu'elle n'etait pas
            passee. */}
        <div className="carte">
          <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: "-.02em" }}>{u.nom || u.email.split("@")[0]}</div>
          <div className="faible" style={{ fontSize: 13, margin: "2px 0 14px" }}>{nomDuRole(u.role)} · {u.compte}</div>
          <ChangerPhoto imageId={u.image_id} initiales={initiales(u.nom || u.email)}
                        couleur={moi?.couleur ?? null} retour="/profil" taille={72} />
        </div>

        <form method="post" action="/api/profil">

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
