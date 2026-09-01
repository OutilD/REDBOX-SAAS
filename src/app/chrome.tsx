import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { nomDuRole, peutConfigurer, peutGererEquipe, utilisateur,
         type Utilisateur } from "@/lib/auth";
import { IcoBorne, IcoCatalogue, IcoCategories, IcoEquipe, IcoReception, IcoSortir, IcoStock, IcoTableau, IcoVentes,
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
      { cle: "tableau", nom: "Tableau de bord", icone: <IcoTableau />, vers: "/" },
      { cle: "ventes",  nom: "Ventes",  icone: <IcoVentes />, vers: "/ventes" },
      { cle: "bornes",  nom: "Bornes",  icone: <IcoBorne />,  vers: "/bornes" },
    ],
  },
  {
    titre: "Approvisionnement",
    items: [
      { cle: "stock",     nom: "Mon stock", icone: <IcoStock />,     vers: "/stock" },
      { cle: "reception", nom: "Réception", icone: <IcoReception />, vers: "/reception" },
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


export async function Entete({ page }: { page: Page }) {
  const u = await utilisateur();
  const biscuits = await cookies();
  const theme = biscuits.get("rbx_theme")?.value ?? "auto";
  const rail = biscuits.get("rbx_rail")?.value ?? "";
  const ici = cheminDe(page);
  const [titre, parent] = FIL[page] ?? ["RedBox"];

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
        <div className="pied">{u?.compte}</div>
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
