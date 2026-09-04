import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q1 } from "@/db";
import { nomDuRole, peutConfigurer, peutGererEquipe, utilisateur } from "@/lib/auth";
import { IcoCatalogue, IcoCategories, IcoEquipe, IcoPub, IcoSav } from "../icones";

export const dynamic = "force-dynamic";

type Compte = {
  categories: number; produits: number; membres: number;
  visuels: number; playlists: number; sav_tel: string | null;
};

type Rubrique = {
  cle: string; vers: string; icone: React.ReactNode;
  nom: string; quoi: string; etat: string; alerte: boolean;
};

/**
 * Les reglages.
 *
 * C'ETAIT UN SOMMAIRE INCOMPLET. La page ne listait que deux rubriques sur cinq
 * — catalogue et equipe. Les categories, l'ecran d'accueil et l'assistance
 * n'existaient que dans le rail de gauche, c'est-a-dire nulle part pour qui
 * travaille au telephone : la barre du pouce mene ici, et d'ici on ne pouvait
 * pas les atteindre.
 *
 * CHAQUE RUBRIQUE PORTE SON ETAT. « Assistance › » ne dit pas s'il y a un numero
 * dedans ; il faut ouvrir pour savoir, et refermer pour rien neuf fois sur dix.
 * Le compte est donc affiche a cote du nom — et quand il vaut zero LA OU CA
 * COMPTE, il le dit en ambre plutot que d'annoncer un zero tranquille.
 *
 * MOBILE D'ABORD. Une colonne de rangees hautes, l'icone a gauche pour reperer
 * sans lire, l'etat a droite ou tombe le regard quand on descend la liste, et
 * toute la rangee cliquable — on ne vise pas un mot de quatre lettres avec un
 * pouce. Les deux colonnes de l'ecran large ne viennent qu'apres, quand il y a
 * la place.
 */
export default async function Reglages() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  const n = await q1<Compte>(`
    SELECT (SELECT COUNT(*)::int FROM categorie   WHERE compte_id = $1 AND actif) AS categories,
           (SELECT COUNT(*)::int FROM produit     WHERE compte_id = $1 AND actif) AS produits,
           (SELECT COUNT(*)::int FROM utilisateur WHERE compte_id = $1)           AS membres,
           (SELECT COUNT(*)::int FROM visuel v JOIN playlist p ON p.id = v.playlist_id
             WHERE p.compte_id = $1)                                              AS visuels,
           (SELECT COUNT(*)::int FROM playlist    WHERE compte_id = $1 AND actif) AS playlists,
           (SELECT sav_tel FROM compte WHERE id = $1)                             AS sav_tel`,
    [u.compte_id]);

  const categories = n?.categories ?? 0;
  const produits = n?.produits ?? 0;
  const membres = n?.membres ?? 0;
  const visuels = n?.visuels ?? 0;
  const playlists = n?.playlists ?? 0;
  const tel = (n?.sav_tel ?? "").trim();

  /**
   * L'ORDRE EST CELUI DU TRAVAIL REEL, comme dans le rail : on cree une
   * categorie, on y range des produits, puis on decide de ce qui defile entre
   * deux ventes. Un sommaire qui suit la chronologie s'apprend une fois et ne se
   * cherche plus.
   */
  const machine = [
    peutConfigurer(u) && {
      cle: "categories", vers: "/reglages/categories", icone: <IcoCategories />,
      nom: "Catégories", quoi: "Les rayons que le client voit sur l’écran",
      etat: categories > 0 ? String(categories) : "à créer", alerte: categories === 0,
    },
    {
      cle: "catalogue", vers: "/reglages/catalogue", icone: <IcoCatalogue />,
      nom: "Catalogue", quoi: "Ce que vendent vos bornes — nom, prix, âge minimum",
      etat: produits > 0 ? String(produits) : "à remplir", alerte: produits === 0,
    },
    {
      cle: "pub", vers: "/reglages/pub", icone: <IcoPub />,
      nom: "Écran d’accueil",
      quoi: playlists > 0
        ? `Ce qui défile entre deux ventes · ${playlists} playlist${playlists > 1 ? "s" : ""}`
        : "Ce qui défile entre deux ventes",
      // Zero visuel n'est PAS une faute : la borne garde alors les siens, et
      // c'est un repli voulu. On le dit, on ne l'alarme pas.
      etat: visuels > 0 ? String(visuels) : "les siens", alerte: false,
    },
  ].filter(Boolean) as Rubrique[];

  const compte = [
    peutGererEquipe(u) && {
      cle: "equipe", vers: "/reglages/equipe", icone: <IcoEquipe />,
      nom: "Équipe", quoi: "Qui a accès à ce compte, et jusqu’où",
      etat: String(membres), alerte: false,
    },
    peutConfigurer(u) && {
      cle: "sav", vers: "/reglages/sav", icone: <IcoSav />,
      nom: "Assistance", quoi: "Le numéro que la borne affiche quand elle coince",
      // Une machine sans numero laisse un client devant un ecran muet : c'est le
      // seul zero de cette page qui coute quelque chose tout de suite.
      etat: tel || "à renseigner", alerte: !tel,
    },
  ].filter(Boolean) as Rubrique[];

  return (
    <>
      <Entete page="reglages" />
      <main className="ecran">
        <h1>Réglages</h1>
        <p className="sous">Compte {u.compte} — vous y êtes {nomDuRole(u.role).toLowerCase()}.</p>

        {machine.length > 0 ? (
          <>
            <h2>Ce que la machine montre</h2>
            <div className="rubriques">
              {machine.map((r) => <Rangee key={r.cle} r={r} />)}
            </div>
          </>
        ) : null}

        {compte.length > 0 ? (
          <>
            <h2>Le compte</h2>
            <div className="rubriques">
              {compte.map((r) => <Rangee key={r.cle} r={r} />)}
            </div>
          </>
        ) : null}

        <h2>Cette session</h2>
        <div className="carte plate">
          <div className="lignes">
            <div className="ligne">
              <div className="corps">
                <div className="nom" style={{ fontWeight: 500 }}>Connecté</div>
                <div className="meta">{u.email}</div>
              </div>
              <div className="fin faible" style={{ fontSize: 13 }}>{nomDuRole(u.role)}</div>
            </div>
          </div>
        </div>
      </main>
      <NavBasse page="reglages" />
    </>
  );
}

/**
 * Une rangee de reglage.
 *
 * TOUTE LA RANGEE EST LA CIBLE, pas le titre : on ne vise pas un mot de quatre
 * lettres avec un pouce, dans un bar, une main sur un carton. Soixante-huit
 * pixels de haut, l'icone a gauche pour reperer sans lire, et l'etat a droite.
 */
function Rangee({ r }: { r: Rubrique }) {
  return (
    <Link href={r.vers} className="rubrique" data-alerte={r.alerte ? "" : undefined}>
      <span className="rond" aria-hidden="true">{r.icone}</span>
      <span className="dit">
        <span className="nom">{r.nom}</span>
        <span className="quoi">{r.quoi}</span>
      </span>
      <span className="etat num">{r.etat}</span>
      <span className="fleche" aria-hidden="true">›</span>
    </Link>
  );
}
