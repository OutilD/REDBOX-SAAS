import Image from "next/image";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { q } from "@/db";
import { estSuperAdmin, nomDuRole, peutCharger, peutConfigurer, peutGererEquipe, utilisateur,
         type Utilisateur } from "@/lib/auth";
import { nomAffiche } from "@/lib/personnes";
import { IcoAlerte, IcoAnalyses, IcoBulle, IcoCloche, IcoCommunaute, IcoFleche, IcoBorne, IcoCarte, IcoCatalogue, IcoCategories, IcoEquipe, IcoReception, IcoStock, IcoTableau, IcoVentes,
         IcoReglages, IcoReassort, IcoPub, IcoSav, IcoMenu, IcoAcademie, IcoCentrale } from "./icones";
import { BasculeRail, BasculeTheme } from "./bascules";
import { SelecteurBorne } from "./selecteur-borne";
import { nonLus } from "@/lib/salons";
import { clesVapid } from "@/lib/notifications";
import InviteNotifications from "./invite-notifications";
import { BISCUIT_PRODUIT, PRODUITS, adresse, hoteDes, produitDeLHote, type Produit } from "@/lib/produits";

export { PRODUITS, type Produit };

export type Page =
  | "tableau" | "analytiques" | "stock" | "reception" | "reassort" | "charger" | "centrale"
  | "bornes" | "carte" | "ventes" | "messages" | "communaute"
  | "reglages" | "catalogue" | "categories" | "equipe" | "pub" | "sav" | "notifications"
  | "profil" | "demo" | "menu"
  | "academie" | "academie_editer"
  | "admin" | "admin_parc" | "admin_comptes";

type Item = {
  cle: Page; nom: string; icone: React.ReactNode; vers: string;
  droit?: (u: Utilisateur) => boolean;
};

/**
 * DEUX PRODUITS DANS UNE CONSOLE.
 *
 * La GESTION sert les machines : chiffres, ventes, reassort, maintenance, ecran
 * d'accueil. CONNECT relie les gens : communaute, messages, academie, carte du
 * reseau. Meme connexion, meme base, memes comptes — comme Messenger et
 * Facebook —, mais chacun son menu, sa barre du pouce et son accueil : quelqu'un
 * qui n'a pas encore de machine vit dans Connect sans traverser un logiciel de
 * gestion, et qui gere ses machines n'a pas le chat dans son plan de travail.
 *
 * Le produit se deduit de la PAGE. Les rares pages qui servent les deux — le
 * menu, le compte, les notifications — prennent celui d'ou l'on vient, retenu
 * dans le biscuit `rbx_produit` que pose `middleware.ts`. Quand les deux produits
 * ont chacun leur adresse (`lib/produits.ts`), c'est l'hote qui le dit, et les
 * portes de l'un a l'autre deviennent des adresses completes.
 */
/** Les pages qui n'appartiennent a aucun des deux : elles gardent l'habillage d'ou l'on vient. */
const PARTAGEES: ReadonlySet<Page> = new Set<Page>(["menu", "profil", "notifications", "demo"]);

/**
 * Le plan de l'application.
 *
 * Le rail montre TOUT, y compris ce qui se visite rarement : c'est la difference
 * entre un menu qu'on parcourt et un plan qu'on lit. La barre du bas, elle, ne
 * garde que les cinq destinations qu'on atteint au pouce.
 */
const SECTIONS: { titre: string; produit: Produit; items: Item[] }[] = [
  {
    titre: "Exploitation", produit: "gestion",
    items: [
      // Le tableau de bord agrege tout le parc, et le depot appartient a
      // l'exploitant : une personne restreinte a une machine y serait renvoyee.
      // Autant ne pas lui montrer la porte.
      { cle: "tableau", nom: "Tableau de bord", icone: <IcoTableau />, vers: "/",
        droit: (u) => u.bornes === null },
      // Les graphes et les classements, sortis du tableau de bord pour qu'il
      // reste lisible d'un coup d'oeil. Meme portee que lui.
      { cle: "analytiques", nom: "Analytiques", icone: <IcoAnalyses />, vers: "/analytiques",
        droit: (u) => u.bornes === null },
      { cle: "ventes",  nom: "Ventes",  icone: <IcoVentes />, vers: "/ventes" },
      { cle: "bornes",  nom: "RedBox",  icone: <IcoBorne />,  vers: "/bornes" },
    ],
  },
  {
    // Ce qui relie aux autres redboxers et a l'equipe.
    titre: "Réseau", produit: "connect",
    items: [
      { cle: "communaute", nom: "Communauté", icone: <IcoCommunaute />, vers: "/communaute" },
      { cle: "messages", nom: "Messages", icone: <IcoBulle />, vers: "/messages" },
      // Le parc pose sur la carte de France : ou sont-elles, laquelle va mal.
      { cle: "carte",   nom: "Carte",   icone: <IcoCarte />,  vers: "/carte" },
    ],
  },
  {
    // La formation : la machine, le pitch, les contrats. Ouverte a tous — un
    // futur redboxer y apprend ce qu'il vendra —, plus large pour qui en a une.
    titre: "Formation", produit: "connect",
    items: [
      { cle: "academie",   nom: "Académie",   icone: <IcoAcademie />,   vers: "/academie" },
    ],
  },
  {
    // Ce qui sonne sur cet appareil vaut pour les deux produits : l'entree
    // existe aussi dans la Configuration de la gestion.
    titre: "Vous", produit: "connect",
    items: [
      { cle: "notifications", nom: "Notifications", icone: <IcoCloche />, vers: "/reglages/notifications" },
    ],
  },
  {
    titre: "Approvisionnement", produit: "gestion",
    items: [
      { cle: "stock",     nom: "Mon stock", icone: <IcoStock />,     vers: "/stock",
        droit: (u) => u.bornes === null },
      { cle: "reception", nom: "Réception", icone: <IcoReception />, vers: "/reception",
        droit: (u) => u.bornes === null },
      // Le reassort d'une machine : on choisit la RedBox, on est sur son ecran de
      // chargement. La fiche d'approvisionnement (plusieurs RedBox, a imprimer)
      // se rejoint depuis ce choix.
      { cle: "charger",   nom: "Réassort", icone: <IcoReassort />, vers: "/charger",
        droit: peutCharger },
      // Ou acheter : les fournisseurs et leurs prix, tenus par l'equipe RedBox.
      { cle: "centrale",  nom: "Centrale d’achat", icone: <IcoCentrale />, vers: "/centrale" },
    ],
  },
  {
    titre: "Configuration", produit: "gestion",
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
      // Personnel, pas propre au compte : chacun regle ses appareils.
      { cle: "notifications", nom: "Notifications", icone: <IcoCloche />, vers: "/reglages/notifications" },
    ],
  },
  {
    // L'editeur seul : le parc entier et tous les comptes. Une personne, pas un
    // compte — le drapeau est sur l'utilisateur.
    titre: "Plateforme", produit: "gestion",
    items: [
      { cle: "admin",         nom: "Tableau", icone: <IcoTableau />, vers: "/admin",
        droit: estSuperAdmin },
      { cle: "admin_parc",    nom: "Parc",    icone: <IcoBorne />,  vers: "/admin/parc",
        droit: estSuperAdmin },
      { cle: "admin_comptes", nom: "Comptes", icone: <IcoEquipe />, vers: "/admin/comptes",
        droit: estSuperAdmin },
    ],
  },
];

/**
 * LES PAGES QU'ON OUVRE DEPUIS LE NAVIGATEUR. Une page dynamique ne se
 * precharge pas d'elle-meme : un clic attendait le serveur. Celles-ci sont
 * demandees des que leur lien est a l'ecran, et gardees trente secondes
 * (`staleTimes`) : le clic les montre tout de suite. Pas tout le plan — une
 * page de plus a precharger, c'est un rendu de plus a chaque ouverture.
 */
const PRECHARGEES: ReadonlySet<Page> = new Set<Page>([
  "tableau", "bornes", "ventes", "stock", "charger", "communaute", "messages", "academie", "carte",
]);

/** Le plan, reduit a ce que cette personne a le droit d'ouvrir : le rail et la page Menu. */
export function planDe(u: Utilisateur, produit: Produit): { titre: string; items: Item[] }[] {
  return SECTIONS
    .filter((s) => s.produit === produit)
    .map((s) => ({ titre: s.titre, items: s.items.filter((i) => !i.droit || i.droit(u)) }))
    .filter((s) => s.items.length > 0);
}

/**
 * Le produit d'une page. Pour une page partagee : celui de l'hote quand chaque
 * produit a le sien, sinon celui que le biscuit a retenu.
 */
export function produitDe(page: Page, biscuit?: string | null, hote?: Produit | null): Produit {
  if (!PARTAGEES.has(page)) {
    if (page === "academie_editer") return "connect";
    for (const s of SECTIONS) if (s.items.some((i) => i.cle === page)) return s.produit;
    return "gestion";
  }
  return hote ?? (biscuit === "connect" ? "connect" : "gestion");
}

/** Le meme, pour une page qui n'a que ses biscuits et ses en-tetes sous la main ; et l'hote, pour les portes. */
export async function produitCourant(page: Page): Promise<{ produit: Produit; hote: string | null }> {
  const hote = hoteDes(await headers());
  return { produit: produitDe(page, (await cookies()).get(BISCUIT_PRODUIT)?.value, produitDeLHote(hote)), hote };
}

/**
 * LES CINQ DESTINATIONS DU POUCE.
 *
 * Sur un telephone, le rail n'existe pas : la Communaute n'etait joignable
 * qu'en devinant qu'il fallait toucher sa propre photo. Elle a maintenant son
 * onglet. Le cinquieme, « Menu », ouvre le plan complet — Stock, Reception,
 * Reassort, Messages, Analytiques, Reglages — c'est-a-dire le rail, en page :
 * rien de la console n'est plus a plus de deux gestes.
 */
type Onglet = { cle: Page | "bascule"; nom: string; icone: React.ReactNode; vers: string };

/**
 * Une barre par produit. Le quatrieme onglet passe a l'autre : sur un
 * telephone le rail n'existe pas, et c'est la seule bascule qu'on ait sous le
 * pouce. Les messages non lus, eux, restent sur la bulle de l'en-tete.
 */
const POUCE: Record<Produit, Onglet[]> = {
  gestion: [
    { cle: "tableau",    nom: "Tableau",    icone: <IcoTableau size={19} />,    vers: "/" },
    { cle: "bornes",     nom: "RedBox",     icone: <IcoBorne size={19} />,      vers: "/bornes" },
    { cle: "ventes",     nom: "Ventes",     icone: <IcoVentes size={19} />,     vers: "/ventes" },
    { cle: "bascule",    nom: "Connect",    icone: <IcoCommunaute size={19} />, vers: PRODUITS.connect.accueil },
    { cle: "menu",       nom: "Menu",       icone: <IcoMenu size={19} />,       vers: "/menu" },
  ],
  connect: [
    { cle: "communaute", nom: "Communauté", icone: <IcoCommunaute size={19} />, vers: "/communaute" },
    { cle: "messages",   nom: "Messages",   icone: <IcoBulle size={19} />,      vers: "/messages" },
    { cle: "academie",   nom: "Académie",   icone: <IcoAcademie size={19} />,   vers: "/academie" },
    { cle: "bascule",    nom: "Gestion",    icone: <IcoBorne size={19} />,      vers: PRODUITS.gestion.accueil },
    { cle: "menu",       nom: "Menu",       icone: <IcoMenu size={19} />,       vers: "/menu" },
  ],
};

/**
 * La page ouverte, ramenee a l'onglet du pouce qui la contient. Tout ce qui
 * n'a pas son onglet allume « Menu » : c'est par la qu'on y est venu, et par
 * la qu'on en repart.
 */
const FAMILLE: Partial<Record<Page, Page>> = {
  carte: "menu",
  analytiques: "tableau",
  stock: "menu", reception: "menu", reassort: "menu", charger: "menu", centrale: "menu",
  reglages: "menu", catalogue: "menu", categories: "menu", equipe: "menu", pub: "menu",
  sav: "menu", notifications: "menu", profil: "menu", demo: "menu",
  admin: "menu", admin_parc: "menu", admin_comptes: "menu",
  academie_editer: "academie",
};

const FIL: Record<Page, [string, string?]> = {
  tableau:    ["Tableau de bord"],
  analytiques: ["Analytiques"],
  ventes:     ["Ventes"],
  bornes:     ["RedBox"],
  carte:      ["Carte", "Connect"],
  messages:   ["Messages", "Connect"],
  communaute: ["Communauté", "Connect"],
  stock:      ["Mon stock", "Approvisionnement"],
  reception:  ["Réception", "Approvisionnement"],
  reassort:   ["Fiche d’approvisionnement", "Approvisionnement"],
  charger:    ["Réassort", "Approvisionnement"],
  centrale:   ["Centrale d’achat", "Approvisionnement"],
  reglages:   ["Réglages"],
  catalogue:  ["Catalogue", "Configuration"],
  categories: ["Catégories", "Configuration"],
  equipe:     ["Équipe", "Configuration"],
  pub:        ["Écran d’accueil", "Configuration"],
  sav:        ["Assistance", "Configuration"],
  notifications: ["Notifications", "Configuration"],
  profil:     ["Mon compte"],
  demo:       ["Mode démo", "Réglages"],
  menu:       ["Menu"],
  admin:      ["Tableau de bord", "Plateforme"],
  admin_parc: ["Parc", "Plateforme"],
  admin_comptes: ["Comptes", "Plateforme"],
  academie:   ["Académie", "Connect"],
  academie_editer: ["Édition", "Académie"],
};

/**
 * Deux lettres, tirees du nom s'il existe, de l'adresse sinon : « ali.b@… »
 * donne AB, « Marie Dupont » donne MD.
 */
function initiales(email: string): string {
  const local = email.split("@")[0] ?? "";
  const bouts = local.split(/[.\-_+]/).filter(Boolean);
  const deux = bouts.length > 1 ? bouts[0][0] + bouts[1][0] : local.slice(0, 2);
  return deux.toUpperCase();
}


/**
 * L'entete, et le selecteur de borne qu'elle porte.
 *
 * `borne` et la periode viennent de la PAGE : un composant d'entete ne lit pas
 * les parametres d'adresse, seule la page les a. Sans eux, choisir une borne
 * effacerait la fenetre de temps, et l'inverse.
 *
 * Deux formes pour la periode, parce que les deux pages qui filtrent n'ont pas
 * la meme : `fenetre` est la cle d'une fenetre toute faite — c'est tout ce que
 * connait l'ecran des ventes — et `periode` porte en plus les deux bornes d'une
 * saisie a la minute, que seul le tableau de bord sait produire.
 */
export async function Entete({ page, borne, fenetre, periode }:
  { page: Page; borne?: string; fenetre?: string;
    periode?: { cle: string; saisie: { du: string; au: string } } }) {
  const u = await utilisateur();
  const biscuits = await cookies();
  const theme = biscuits.get("rbx_theme")?.value ?? "dark";
  const rail = biscuits.get("rbx_rail")?.value ?? "";
  const hote = hoteDes(await headers());
  const produit = produitDe(page, biscuits.get(BISCUIT_PRODUIT)?.value, produitDeLHote(hote));
  // Les portes vers l'autre produit : un chemin ici, une adresse complete s'il a son hote.
  const vers = (p: Produit, chemin: string) => adresse(p, chemin, hote);
  const autre: Produit = produit === "gestion" ? "connect" : "gestion";
  const ici = cheminDe(page);
  const [titre, parent] = FIL[page] ?? ["RedBox"];

  // Le selecteur n'a de sens que la ou les chiffres se filtrent. Ailleurs il
  // serait un bouton qui ne fait rien, ce qui est pire qu'un bouton absent.
  const filtrable = page === "tableau" || page === "analytiques" || page === "ventes";
  // La page vers laquelle le selecteur renvoie : la sienne, avec le meme filtre.
  const baseFiltre = page === "ventes" ? "/ventes" : page === "analytiques" ? "/analytiques" : "/";

  // Ce que le selecteur doit remettre dans l'adresse pour ne pas perdre la
  // periode en cours. Une periode sur mesure gagne sur la fenetre : c'est elle
  // qui est affichee.
  const perso = periode?.cle === "perso" ? periode.saisie : null;
  const garde: Record<string, string> = perso
    ? { du: perso.du, au: perso.au }
    : (periode?.cle ?? fenetre) ? { f: (periode?.cle ?? fenetre)! } : {};
  // Ce qu'on n'a pas lu dans les salons : la pastille sur la bulle de l'en-tete
  // et sur l'entree du rail. Une lecture, comme les autres pastilles.
  const nonLusN = u ? await nonLus(u).catch(() => 0) : 0;
  const machines = u && filtrable
    ? await q<{ id: number; nom: string }>(
        `SELECT id, nom FROM borne
          WHERE compte_id = $1 AND ($2::bigint[] IS NULL OR id = ANY($2))
          ORDER BY nom`, [u.compte_id, u.bornes])
    : [];

  return (
    <>
      {/* LE RAIL EST A LA GESTION. Connect n'est pas un tableau de bord : ses
          destinations sont dans la barre du haut, comme sur un reseau. */}
      {produit === "gestion" ? (
      <aside className="rail">
        <Link href={PRODUITS[produit].accueil} className="logo">
          <Image src="/logo-redbox.png" alt="RedBox" width={232} height={150} priority />
        </Link>
        <nav>
          {SECTIONS.filter((s) => s.produit === produit).map((s) => {
            const items = s.items.filter((i) => !i.droit || (u && i.droit(u)));
            if (items.length === 0) return null;
            return (
              <div key={s.titre}>
                <div className="section">{s.titre}</div>
                {items.map((i) => (
                  <Link key={i.cle} href={i.vers} title={i.nom} prefetch={PRECHARGEES.has(i.cle)}
                        className={`item ${i.cle === page ? "actif" : ""}`}>
                    <span className="glyphe">{i.icone}</span>
                    {i.nom}
                    {i.cle === "messages" && nonLusN > 0
                      ? <span className="compte num">{nonLusN > 99 ? "99+" : nonLusN}</span> : null}
                  </Link>
                ))}
              </div>
            );
          })}
          {/* LA PORTE VERS L'AUTRE PRODUIT, en bas du plan, comme une entree
              de plus : « RedBox Connect » depuis la Gestion, « RedBox Gestion »
              depuis Connect. Les messages non lus s'y lisent depuis la Gestion. */}
          {u ? (
            <div>
              <div className="section">{autre === "connect" ? "Réseau" : "Machines"}</div>
              <Link href={vers(autre, PRODUITS[autre].accueil)} className="item produit-porte" data-vers={autre}
                    title={PRODUITS[autre].quoi}>
                <span className="glyphe">{autre === "connect" ? <IcoCommunaute /> : <IcoBorne />}</span>
                RedBox {PRODUITS[autre].nom}
                {autre === "connect" && nonLusN > 0
                  ? <span className="compte num">{nonLusN > 99 ? "99+" : nonLusN}</span>
                  : <IcoFleche size={13} />}
              </Link>
            </div>
          ) : null}
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
          <div className="pied">{u?.compte}{u?.demo ? " · démo" : ""}</div>
        )}
      </aside>
      ) : null}

      <header className="entete">
        <div className="dedans">
          <Link href={PRODUITS[produit].accueil} className="logo-mobile">
            <Image src="/logo-redbox.png" alt="RedBox" width={155} height={100} priority />
            {produit === "connect" ? <span className="produit-puce">connect</span> : null}
          </Link>
          {produit === "gestion"
            ? <BasculeRail depart={rail} retour={ici} focus={page === "academie" || page === "messages"} />
            : null}
          <div className="fil">
            {parent ? <span className="parent">{parent} · </span> : null}{titre}
          </div>
          {/* LES DESTINATIONS DE CONNECT, au milieu de la barre : communaute,
              messages, academie, carte — des onglets a icone, l'actif souligne
              de rouge, comme sur un reseau. Au telephone, c'est la barre du bas. */}
          {produit === "connect" && u ? (
            <nav className="connect-nav" aria-label="Connect">
              {([
                { cle: "communaute", nom: "Communauté", vers: "/communaute", icone: <IcoCommunaute size={22} /> },
                { cle: "messages",   nom: "Messages",   vers: "/messages",   icone: <IcoBulle size={22} /> },
                { cle: "academie",   nom: "Académie",   vers: "/academie",   icone: <IcoAcademie size={22} /> },
                { cle: "carte",      nom: "Carte",      vers: "/carte",      icone: <IcoCarte size={22} /> },
              ] as { cle: Page; nom: string; vers: string; icone: React.ReactNode }[]).map((o) => (
                <Link key={o.cle} href={o.vers} prefetch={true} title={o.nom} aria-label={o.nom}
                      className={o.cle === page || (o.cle === "academie" && page === "academie_editer") ? "actif" : ""}
                      aria-current={o.cle === page ? "page" : undefined}>
                  {o.icone}
                  <span>{o.nom}</span>
                  {o.cle === "messages" && nonLusN > 0 ? <b className="num">{nonLusN > 99 ? "99+" : nonLusN}</b> : null}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="droite">
            {machines.length > 0 ? (
              <>
                <SelecteurBorne machines={machines} borne={borne} garde={garde}
                                base={baseFiltre} />
                {/* Sans JavaScript, le vieux formulaire. Il recharge la page,
                    mais il choisit — et c'est tout ce qu'on lui demande. */}
                <noscript>
                  <form method="get" action={baseFiltre}
                        className="borne-chip nu">
                    {Object.entries(garde).map(([cle, v]) => (
                      <input key={cle} type="hidden" name={cle} value={v} />
                    ))}
                    <select name="b" defaultValue={borne ?? ""} aria-label="Filtrer par RedBox">
                      <option value="">Toutes les RedBox</option>
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>{m.nom}</option>
                      ))}
                    </select>
                    <button type="submit" aria-label="Appliquer le filtre">
                      <IcoFleche size={13} />
                    </button>
                  </form>
                </noscript>
              </>
            ) : null}

            {/* La messagerie a sa bulle dans l'en-tete : elle n'a pas de place
                dans la barre du pouce, et c'est ce qu'on regarde en arrivant. */}
            {u ? (
              <Link href={vers("connect", "/messages")} className="bouton icone bulle" title="Messages" aria-label="Messages"
                    data-actif={page === "messages" ? "" : undefined}>
                <IcoBulle size={17} />
                {nonLusN > 0 ? <span className="pastille-nombre num">{nonLusN > 99 ? "99+" : nonLusN}</span> : null}
              </Link>
            ) : null}

            <BasculeTheme depart={theme} retour={ici} />

            {produit === "connect" && u ? (
              <Link href={vers("gestion", PRODUITS.gestion.accueil)} className="bouton petit primaire vers-gestion" title={PRODUITS.gestion.quoi}>
                <IcoBorne size={15} /><span>Gestion</span>
              </Link>
            ) : null}

            <div className="compte-chip">
              {/* La pastille mene a SON PROFIL COMPLET — niveau, rang, badges,
                  objectifs —, d'ou « Mon compte » garde les reglages. C'est ce
                  qu'on attend en touchant son propre visage. La deconnexion
                  n'est plus ici : collee a la pastille, on la touchait en
                  voulant ouvrir son compte. Elle est au pied de « Mon compte »,
                  seule, en rouge. */}
              <Link href={u ? `/communaute/${u.id}` : "/connexion"} className="moi" title="Mon profil : niveau, badges">
                {u?.image_id ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/image/${u.image_id}`} alt="" className="jeton photo" />
                ) : (
                  <span className="jeton">{u ? initiales(nomAffiche(u)) : "—"}</span>
                )}
                <span className="qui">
                  <b>{u ? nomAffiche(u) : ""}</b>
                  <span>{u ? nomDuRole(u.role) : ""}</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
        {/*
          LE BANDEAU DE LA DEMO.

          Dans l'en-tete, donc sur chaque page et sous les yeux en permanence :
          un compte neuf est rempli de bornes et de ventes inventees, et rien
          ne doit laisser croire, meme une seconde, que ce chiffre d'affaires
          est le sien. Il ne s'efface qu'en quittant le mode — et c'est le lien
          qu'il porte. Ambre plutot que rouge : c'est un avertissement, pas
          une panne.
        */}
        {/* PAS ENCORE DE PSEUDO. Les comptes ouverts avant qu'on le demande a
            l'inscription s'affichaient sous le debut de leur adresse mail : on
            les invite a choisir le nom sous lequel tout le monde les verra,
            partout sauf sur la page ou on le choisit. */}
        {u && !(u.pseudo ?? "").trim() && page !== "communaute" ? (
          <div className="demo-bandeau" role="note">
            <IcoCommunaute size={18} />
            <div className="dit">
              <b>Choisissez votre pseudo.</b>{" "}
              <span className="entier">C’est le nom sous lequel l’équipe et tous les redboxers vous verront, à la place de votre adresse mail.</span>
              <span className="bref">À la place de votre adresse.</span>
            </div>
            <Link href="/communaute/moi" className="bouton petit">Choisir</Link>
          </div>
        ) : null}
        {u?.demo ? (
          <div className="demo-bandeau" role="note">
            <IcoAlerte size={18} />
            {/* Deux longueurs de phrase, et le CSS choisit : au telephone, le
                bandeau colle en haut de chaque page tient sur UNE rangee. */}
            <div className="dit">
              <b>Mode démo · données fictives.</b>{" "}
              <span className="entier">
                Les RedBox, les ventes, le stock et l’équipe affichés sont inventés pour
                vous faire découvrir la console. Vous pouvez tout manipuler — faire un
                réassort, traiter un litige, changer un prix : rien n’est réel, et tout
                sera effacé quand vous désactiverez ce mode.
              </span>
              <span className="bref">Rien n’est réel.</span>
            </div>
            {/* UN CLIC, ET ON SORT. Le bouton envoyait vers la page des reglages,
                ou il fallait confirmer : on ne quitte pas une demo en trois
                gestes. Ce qui s'efface est invente ; la route garde son verrou
                (`sur=1`) et refuse a qui n'est pas proprietaire. */}
            <form method="post" action="/api/demo/fin">
              <input type="hidden" name="sur" value="1" />
              <button className="bouton petit" aria-label="Désactiver le mode démo">
                <span className="entier">Désactiver le mode démo</span>
                <span className="bref">Quitter</span>
              </button>
            </form>
          </div>
        ) : null}
      </header>
      {/* L'INVITATION A INSTALLER ET AUX NOTIFICATIONS — une grande fenetre sur
          telephone, un bandeau sur ordinateur —, sur chaque page tant que cet appareil
          n'a jamais ete sollicite — sauf sur Reglages → Notifications, qui a
          deja son bouton. Le composant decide seul, dans le navigateur : la
          permission ne se lit pas depuis le serveur.

          HORS DE L'EN-TETE, et c'est voulu. Elle n'apparait qu'une fois la page
          chargee ; posee dans l'en-tete collant, elle poussait toute la page
          vers le bas au moment ou l'on visait un champ, et le clic tombait a
          cote. Elle flotte maintenant par-dessus — et le flou de l'en-tete
          (`backdrop-filter`) aurait accroche une carte fixe a lui, pas a
          l'ecran. */}
      {u && page !== "notifications"
        ? await clesVapid().then((k) => <InviteNotifications publique={k.publique} connect={produit === "connect"} />).catch(() => null)
        : null}
    </>
  );
}

function cheminDe(page: Page): string {
  for (const s of SECTIONS) for (const i of s.items) if (i.cle === page) return i.vers;
  // La fiche d'approvisionnement n'a plus d'entree au menu, mais une adresse.
  if (page === "reassort") return "/reassort";
  if (page === "academie_editer") return "/academie/editer";
  return "/reglages";
}

export async function NavBasse({ page }: { page: Page }) {
  const { produit, hote } = await produitCourant(page);
  const onglets = POUCE[produit];
  const autre: Produit = produit === "gestion" ? "connect" : "gestion";
  const actif = onglets.some((o) => o.cle === page) ? page : FAMILLE[page] ?? "menu";
  return (
    <nav className="nav-bas">
      {onglets.map((o) => (
        <Link key={o.cle} href={o.cle === "bascule" ? adresse(autre, o.vers, hote) : o.vers} prefetch={true}
              className={o.cle === actif ? "actif" : ""}
              data-bascule={o.cle === "bascule" ? "" : undefined}>
          <span className="glyphe">{o.icone}</span>
          {o.nom}
        </Link>
      ))}
    </nav>
  );
}
