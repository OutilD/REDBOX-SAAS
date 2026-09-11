import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { q } from "@/db";
import { nomDuRole, peutCharger, peutConfigurer, peutGererEquipe, utilisateur,
         type Utilisateur } from "@/lib/auth";
import { IcoAlerte, IcoAnalyses, IcoBulle, IcoCloche, IcoCommunaute, IcoFleche, IcoBorne, IcoCatalogue, IcoCategories, IcoEquipe, IcoReception, IcoStock, IcoTableau, IcoVentes,
         IcoReglages, IcoReassort, IcoPub, IcoSav } from "./icones";
import { BasculeRail, BasculeTheme } from "./bascules";
import { SelecteurBorne } from "./selecteur-borne";
import { nonLus } from "@/lib/salons";
import { clesVapid } from "@/lib/notifications";
import InviteNotifications from "./invite-notifications";

export type Page =
  | "tableau" | "analytiques" | "stock" | "reception" | "reassort" | "charger"
  | "bornes" | "ventes" | "messages" | "communaute"
  | "reglages" | "catalogue" | "categories" | "equipe" | "pub" | "sav" | "notifications"
  | "profil" | "demo";

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
      // Les graphes et les classements, sortis du tableau de bord pour qu'il
      // reste lisible d'un coup d'oeil. Meme portee que lui.
      { cle: "analytiques", nom: "Analytiques", icone: <IcoAnalyses />, vers: "/analytiques",
        droit: (u) => u.bornes === null },
      { cle: "ventes",  nom: "Ventes",  icone: <IcoVentes />, vers: "/ventes" },
      { cle: "bornes",  nom: "RedBox",  icone: <IcoBorne />,  vers: "/bornes" },
      { cle: "messages", nom: "Messages", icone: <IcoBulle />, vers: "/messages" },
      { cle: "communaute", nom: "Communauté", icone: <IcoCommunaute />, vers: "/communaute" },
    ],
  },
  {
    titre: "Approvisionnement",
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
      // Personnel, pas propre au compte : chacun regle ses appareils.
      { cle: "notifications", nom: "Notifications", icone: <IcoCloche />, vers: "/reglages/notifications" },
    ],
  },
];

/** Les cinq destinations du pouce. Les autres se rejoignent depuis celles-ci. */
const POUCE: { cle: Page; nom: string; icone: React.ReactNode; vers: string }[] = [
  { cle: "tableau",  nom: "Tableau",  icone: <IcoTableau size={19} />,  vers: "/" },
  { cle: "stock",    nom: "Stock",    icone: <IcoStock size={19} />,    vers: "/stock" },
  { cle: "bornes",   nom: "RedBox",   icone: <IcoBorne size={19} />,    vers: "/bornes" },
  { cle: "ventes",   nom: "Ventes",   icone: <IcoVentes size={19} />,   vers: "/ventes" },
  { cle: "reglages", nom: "Réglages", icone: <IcoReglages size={19} />, vers: "/reglages" },
];

/** La page ouverte, ramenee a l'onglet du pouce qui la contient. */
const FAMILLE: Partial<Record<Page, Page>> = {
  analytiques: "tableau",
  reception: "stock", reassort: "stock", charger: "stock",
  catalogue: "reglages", categories: "reglages", equipe: "reglages", pub: "reglages",
  sav: "reglages", notifications: "reglages",
};

const FIL: Record<Page, [string, string?]> = {
  tableau:    ["Tableau de bord"],
  analytiques: ["Analytiques"],
  ventes:     ["Ventes"],
  bornes:     ["RedBox"],
  messages:   ["Messages"],
  communaute: ["Communauté"],
  stock:      ["Mon stock", "Approvisionnement"],
  reception:  ["Réception", "Approvisionnement"],
  reassort:   ["Fiche d’approvisionnement", "Approvisionnement"],
  charger:    ["Réassort", "Approvisionnement"],
  reglages:   ["Réglages"],
  catalogue:  ["Catalogue", "Configuration"],
  categories: ["Catégories", "Configuration"],
  equipe:     ["Équipe", "Configuration"],
  pub:        ["Écran d’accueil", "Configuration"],
  sav:        ["Assistance", "Configuration"],
  notifications: ["Notifications", "Configuration"],
  profil:     ["Mon compte"],
  demo:       ["Mode démo", "Réglages"],
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
                    {i.cle === "messages" && nonLusN > 0
                      ? <span className="compte num">{nonLusN > 99 ? "99+" : nonLusN}</span> : null}
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
          <div className="pied">{u?.compte}{u?.demo ? " · démo" : ""}</div>
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
              <Link href="/messages" className="bouton icone bulle" title="Messages" aria-label="Messages"
                    data-actif={page === "messages" ? "" : undefined}>
                <IcoBulle size={17} />
                {nonLusN > 0 ? <span className="pastille-nombre num">{nonLusN > 99 ? "99+" : nonLusN}</span> : null}
              </Link>
            ) : null}

            <BasculeTheme depart={theme} retour={ici} />

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
                  <span className="jeton">{u ? initiales(u.nom || u.email) : "—"}</span>
                )}
                <span className="qui">
                  <b>{u?.nom || u?.email.split("@")[0]}</b>
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
        {u?.demo ? (
          <div className="demo-bandeau" role="note">
            <IcoAlerte size={18} />
            <div className="dit">
              <b>Mode démo · données fictives.</b>{" "}
              Les RedBox, les ventes, le stock et l’équipe affichés sont inventés pour
              vous faire découvrir la console. Vous pouvez tout manipuler
              <span className="long"> — faire un réassort, traiter un litige, changer un prix</span> :
              rien n’est réel, et tout sera effacé quand vous désactiverez ce mode.
            </div>
            <Link href="/demo" className="bouton petit">Désactiver le mode démo</Link>
          </div>
        ) : null}
      </header>
      {/* L'INVITATION AUX NOTIFICATIONS, sur chaque page tant que cet appareil
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
        ? await clesVapid().then((k) => <InviteNotifications publique={k.publique} />).catch(() => null)
        : null}
    </>
  );
}

function cheminDe(page: Page): string {
  for (const s of SECTIONS) for (const i of s.items) if (i.cle === page) return i.vers;
  // La fiche d'approvisionnement n'a plus d'entree au menu, mais une adresse.
  if (page === "reassort") return "/reassort";
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
