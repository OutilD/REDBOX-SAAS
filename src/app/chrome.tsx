import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { q } from "@/db";
import { nomDuRole, peutConfigurer, peutGererEquipe, utilisateur,
         type Utilisateur } from "@/lib/auth";
import { IcoFleche, IcoBorne, IcoCatalogue, IcoCategories, IcoEquipe, IcoReception, IcoSortir, IcoStock, IcoTableau, IcoVentes,
         IcoReglages, IcoReassort, IcoPub, IcoSav } from "./icones";
import { BasculeRail, BasculeTheme } from "./bascules";

export type Page =
  | "tableau" | "stock" | "reception" | "reassort"
  | "bornes" | "ventes"
  | "reglages" | "catalogue" | "categories" | "equipe" | "pub" | "sav";

type Item = {
  cle: Page; nom: string; icone: React.ReactNode; vers: string;
  droit?: (u: Utilisateur) => boolean;
};

/**
 * Le plan de l'application.
 *
 * Le rail montre TOUT, y compris ce qui se visite rarement : c'est la difference
 * entre un menu qu'on parcourt et un plan qu'on lit. La barre du bas, elle, ne
 * garde que les cinq destinations qu'on atteint au pouce.
 */
const SECTIONS: { titre: string; items: Item[] }[] = [
  {
    titre: "Exploitation",
    items: [
      // Le tableau de bord agrege tout le parc, et le depot appartient a
      // l'exploitant : une personne restreinte a une machine y serait renvoyee.
      // Autant ne pas lui montrer la porte.
      { cle: "tableau", nom: "Tableau de bord", icone: <IcoTableau />, vers: "/",
        droit: (u) => u.bornes === null },
      { cle: "ventes",  nom: "Ventes",  icone: <IcoVentes />, vers: "/ventes" },
      { cle: "bornes",  nom: "Bornes",  icone: <IcoBorne />,  vers: "/bornes" },
    ],
  },
  {
    titre: "Approvisionnement",
    items: [
      { cle: "stock",     nom: "Mon stock", icone: <IcoStock />,     vers: "/stock",
        droit: (u) => u.bornes === null },
      { cle: "reception", nom: "Réception", icone: <IcoReception />, vers: "/reception",
        droit: (u) => u.bornes === null },
      { cle: "reassort",  nom: "Réassort",  icone: <IcoReassort />,  vers: "/reassort" },
    ],
  },
  {
    titre: "Configuration",
    items: [
      // L'ordre du travail reel : on cree une categorie, on y range des produits,
      // puis on decide de ce qui defile sur l'ecran. Un menu qui suit la
      // chronologie s'apprend une fois et ne se cherche plus.
      { cle: "categories", nom: "Catégories", icone: <IcoCategories />, vers: "/reglages/categories",
        droit: peutConfigurer },
      { cle: "catalogue",  nom: "Catalogue",  icone: <IcoCatalogue />,  vers: "/reglages/catalogue" },
      { cle: "pub",        nom: "Écran d’accueil", icone: <IcoPub />, vers: "/reglages/pub" },
      { cle: "sav",        nom: "Assistance", icone: <IcoSav />, vers: "/reglages/sav",
        droit: peutConfigurer },
      { cle: "equipe",     nom: "Équipe",     icone: <IcoEquipe />,     vers: "/reglages/equipe",
        droit: peutGererEquipe },
    ],
  },
];

/** Les cinq destinations du pouce. Les autres se rejoignent depuis celles-ci. */
const POUCE: { cle: Page; nom: string; icone: React.ReactNode; vers: string }[] = [
  { cle: "tableau",  nom: "Tableau",  icone: <IcoTableau size={19} />,  vers: "/" },
  { cle: "stock",    nom: "Stock",    icone: <IcoStock size={19} />,    vers: "/stock" },
  { cle: "bornes",   nom: "Bornes",   icone: <IcoBorne size={19} />,    vers: "/bornes" },
  { cle: "ventes",   nom: "Ventes",   icone: <IcoVentes size={19} />,   vers: "/ventes" },
  { cle: "reglages", nom: "Réglages", icone: <IcoReglages size={19} />, vers: "/reglages" },
];

/** La page ouverte, ramenee a l'onglet du pouce qui la contient. */
const FAMILLE: Partial<Record<Page, Page>> = {
  reception: "stock", reassort: "stock",
  catalogue: "reglages", categories: "reglages", equipe: "reglages", pub: "reglages",
  sav: "reglages",
};

const FIL: Record<Page, [string, string?]> = {
  tableau:    ["Tableau de bord"],
  ventes:     ["Ventes"],
  bornes:     ["Bornes"],
  stock:      ["Mon stock", "Approvisionnement"],
  reception:  ["Réception", "Approvisionnement"],
  reassort:   ["Réassort", "Approvisionnement"],
  reglages:   ["Réglages"],
  catalogue:  ["Catalogue", "Configuration"],
  categories: ["Catégories", "Configuration"],
  equipe:     ["Équipe", "Configuration"],
  pub:        ["Écran d’accueil", "Configuration"],
  sav:        ["Assistance", "Configuration"],
};

/** Deux lettres tirees de l'adresse : « ali.b@… » donne AB, « marc@… » donne MA. */
function initiales(email: string): string {
  const local = email.split("@")[0] ?? "";
  const bouts = local.split(/[.\-_+]/).filter(Boolean);
  const deux = bouts.length > 1 ? bouts[0][0] + bouts[1][0] : local.slice(0, 2);
  return deux.toUpperCase();
}


/**
 * L'entete, et le selecteur de borne qu'elle porte.
 *
 * `borne` et `fenetre` viennent de la PAGE : un composant d'entete ne lit pas
 * les parametres d'adresse, seule la page les a. Sans eux, choisir une borne
 * effacerait la fenetre de temps, et l'inverse.
 */
export async function Entete({ page, borne, fenetre }:
  { page: Page; borne?: string; fenetre?: string }) {
  const u = await utilisateur();
  const biscuits = await cookies();
  const theme = biscuits.get("rbx_theme")?.value ?? "dark";
  const rail = biscuits.get("rbx_rail")?.value ?? "";
  const ici = cheminDe(page);
  const [titre, parent] = FIL[page] ?? ["RedBox"];

  // Le selecteur n'a de sens que la ou les chiffres se filtrent. Ailleurs il
  // serait un bouton qui ne fait rien, ce qui est pire qu'un bouton absent.
  const filtrable = page === "tableau" || page === "ventes";
  const machines = u && filtrable
    ? await q<{ id: number; nom: string }>(
        `SELECT id, nom FROM borne
          WHERE compte_id = $1 AND ($2::bigint[] IS NULL OR id = ANY($2))
          ORDER BY nom`, [u.compte_id, u.bornes])
    : [];

  return (
    <>
      <aside className="rail">
        <Link href="/" className="logo">
          <Image src="/logo-redbox.png" alt="RedBox" width={232} height={150} priority />
        </Link>
        <nav>
          {SECTIONS.map((s) => {
            const items = s.items.filter((i) => !i.droit || (u && i.droit(u)));
            if (items.length === 0) return null;
            return (
              <div key={s.titre}>
                <div className="section">{s.titre}</div>
                {items.map((i) => (
                  <Link key={i.cle} href={i.vers} title={i.nom}
                        className={`item ${i.cle === page ? "actif" : ""}`}>
                    <span className="glyphe">{i.icone}</span>
                    {i.nom}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        {/*
          LE COMPTE, ET LE MOYEN D'EN CHANGER.

          Une seule appartenance — le cas de presque tout le monde — et c'est un
          simple nom, comme avant. Plusieurs, et il faut pouvoir passer de l'une a
          l'autre : sans ce selecteur, un reassortisseur qui sert deux exploitants
          restait bloque sur celui de son inscription.

          Un bouton plutot qu'un envoi automatique au changement : la console doit
          marcher sans JavaScript, sur le telephone qu'on a en main dans un bar
          mal couvert.
        */}
        {u && u.comptes.length > 1 ? (
          <form method="post" action="/api/compte/basculer" className="pied pied-comptes">
            <select name="compte_id" defaultValue={u.compte_id} aria-label="Compte">
              {u.comptes.map((a) => (
                <option key={a.compte_id} value={a.compte_id}>{a.compte}</option>
              ))}
            </select>
            <button className="bouton petit">Aller</button>
          </form>
        ) : (
          <div className="pied">{u?.compte}</div>
        )}
      </aside>

      <header className="entete">
        <div className="dedans">
          <Link href="/" className="logo-mobile">
            <Image src="/logo-redbox.png" alt="RedBox" width={155} height={100} priority />
          </Link>
          <BasculeRail depart={rail} retour={ici} />
          <div className="fil">
            {parent ? <span className="parent">{parent} · </span> : null}{titre}
          </div>

          <div className="droite">
            {machines.length > 0 ? (
              // Formulaire GET : la console marche sans JavaScript. Le bouton
              // est une fleche plutot qu'un mot — dans une pastille de la taille
              // d'un jeton de compte, « Filtrer » prendrait toute la place.
              <form method="get" action={page === "ventes" ? "/ventes" : "/"}
                    className="borne-chip" role="search">
                {fenetre ? <input type="hidden" name="f" value={fenetre} /> : null}
                <span className="glyphe" aria-hidden="true"><IcoBorne size={15} /></span>
                <select name="b" defaultValue={borne ?? ""} aria-label="Filtrer par borne">
                  <option value="">Toutes les bornes</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>{m.nom}</option>
                  ))}
                </select>
                <button type="submit" aria-label="Appliquer le filtre" title="Appliquer">
                  <IcoFleche size={13} />
                </button>
              </form>
            ) : null}

            <BasculeTheme depart={theme} retour={ici} />

            <div className="compte-chip">
              <span className="jeton">{u ? initiales(u.email) : "—"}</span>
              <span className="qui">
                <b>{u?.email.split("@")[0]}</b>
                <span>{u ? nomDuRole(u.role) : ""}</span>
              </span>
              <form method="post" action="/api/session/fin">
                <button className="bouton icone" title="Se déconnecter" aria-label="Se déconnecter"
                        style={{ width: 30, minHeight: 30, border: "none", background: "none" }}>
                  <IcoSortir size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

function cheminDe(page: Page): string {
  for (const s of SECTIONS) for (const i of s.items) if (i.cle === page) return i.vers;
  return "/reglages";
}

export function NavBasse({ page }: { page: Page }) {
  const actif = FAMILLE[page] ?? page;
  return (
    <nav className="nav-bas">
      {POUCE.map((o) => (
        <Link key={o.cle} href={o.vers} className={o.cle === actif ? "actif" : ""}>
          <span className="glyphe">{o.icone}</span>
          {o.nom}
        </Link>
      ))}
    </nav>
  );
}
