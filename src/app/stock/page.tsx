import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { euros, pli } from "@/db";
import { peutCharger, utilisateur } from "@/lib/auth";
import { grouperParCategorie, stockParProduit, valeurImmobilisee,
         type Groupe, type LigneStock } from "@/lib/stock";
import { Repli } from "../repli";
import { IcoCatalogue, IcoChevron, IcoLoupe, IcoReception, IcoStock } from "../icones";

export const dynamic = "force-dynamic";

/**
 * LES TROIS FACONS DE REGARDER SON STOCK.
 *
 * « Tout » range par categorie et sert a se promener. Les deux autres repondent
 * a une question precise qu'on se posait jusqu'ici en ouvrant les six sections
 * une par une : qu'est-ce que je dois racheter, et qu'est-ce que j'attends.
 */
const VUES = [
  { cle: "", nom: "Tout" },
  { cle: "epuise", nom: "Épuisés" },
  { cle: "route", nom: "En route" },
] as const;

/**
 * Mon stock.
 *
 * La question a laquelle cet ecran repond, et la seule : « de quoi est-ce que je
 * dispose, et ou est-ce ? »
 *
 * Range par categorie, replie. Onze produits a plat, c'etait une liste qu'on
 * parcourt sans rien voir ; six sections dont on ouvre celle qui pose probleme,
 * ca se lit. Celles qui ont une rupture s'ouvrent seules : l'ecran s'ouvre sur ce
 * qui demande une decision.
 *
 * MAIS ON NE SE PROMENE PAS TOUJOURS. A cent references, retrouver une boite
 * precise voulait dire deplier six sections et parcourir des yeux — et savoir
 * quoi racheter voulait dire faire la meme chose en cherchant les zeros. Un champ
 * de recherche et deux filtres repondent a ces deux questions-la sans defiler.
 * Ils tiennent dans l'adresse, donc ils se partagent, se mettent en favori, et
 * marchent sans JavaScript : le formulaire part en GET, les filtres sont des
 * liens.
 */
export default async function Stock(
  { searchParams }: { searchParams: Promise<{ q?: string; v?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  // LE DEPOT EST L'AFFAIRE DE L'EXPLOITANT. Ce qui dort en reserve, ce qui a ete
  // recu, ce qui a ete paye : rien de tout cela ne regarde quelqu'un qu'on a
  // invite sur une machine. On le renvoie a ses bornes.
  if (u.bornes !== null) redirect("/bornes");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const vue = VUES.find((x) => x.cle === params.v)?.cle ?? "";

  const lien = (chg: { q?: string; v?: string }) => {
    const p = new URLSearchParams();
    const qq = chg.q ?? q;
    const vv = chg.v ?? vue;
    if (qq) p.set("q", qq);
    if (vv) p.set("v", vv);
    const s = p.toString();
    return s ? `/stock?${s}` : "/stock";
  };

  const lignes = await stockParProduit(u.compte_id);

  // Les totaux portent sur TOUT le stock, jamais sur le filtre en cours : un
  // chiffre d'entete qui bouge quand on tape dans la recherche ne veut plus rien
  // dire, et on ne sait plus s'il manque deux references ou deux cents.
  const total = lignes.reduce((s, l) => s + l.reserve + l.bornes + l.en_route, 0);
  const enReserve = lignes.reduce((s, l) => s + l.reserve, 0);
  const enBornes = lignes.reduce((s, l) => s + l.bornes, 0);
  const enRoute = lignes.reduce((s, l) => s + l.en_route, 0);
  const valeur = valeurImmobilisee(lignes);
  const epuises = lignes.filter((l) => l.reserve === 0 && l.en_route === 0);
  const attendus = lignes.filter((l) => l.en_route > 0);

  const cherche = q !== "" || vue !== "";
  const mots = pli(q);
  const trouves = lignes
    .filter((l) => vue === "" ? true
                 : vue === "epuise" ? l.reserve === 0 && l.en_route === 0
                 : l.en_route > 0)
    .filter((l) => !mots ||
      pli(l.nom).includes(mots) || pli(l.sku).includes(mots) || pli(l.categorie).includes(mots));

  const groupes = grouperParCategorie(lignes);
  const part = (n: number) => `${Math.max(0, (n / Math.max(1, total)) * 100)}%`;

  return (
    <>
      <Entete page="stock" />
      <main className="ecran">
        <h1>Mon stock</h1>
        <p className="sous">Ce que vous avez acheté, et où il se trouve aujourd’hui.</p>

        {/*
          LE TOTAL, ET OU IL EST.

          Quatre tuiles de meme taille laissaient l'oeil tomber sur la premiere
          plutot que sur la plus importante. Le nombre d'unites est le phare ;
          la barre dessous dit ou elles sont, ce qui est la question meme de
          l'ecran, et les trois mesures l'entourent.

          La barre a sa place ICI et nulle part ailleurs : a hauteur de compte, la
          question est bien une proportion — « ou est mon stock ». A hauteur de
          produit, la question est « combien », et trois nombres ecrits y
          repondent mieux qu'une part de barre.
        */}
        <section className="chiffres-cle" aria-label="Vue d’ensemble du stock">
          <div className="phare colonne">
            <div className="txt">
              <h2 className="etiquette">Unités en stock</h2>
              <div className="ligne-chiffre"><span className="chiffre num">{total}</span></div>
              <p className="contre">
                sur {lignes.length} référence{lignes.length > 1 ? "s" : ""} actives,
                réparties dans {groupes.length} catégorie{groupes.length > 1 ? "s" : ""}.
              </p>
            </div>
            {total > 0 ? (
              <div>
                <div className="repartition" role="img"
                     aria-label={`${enReserve} chez vous, ${enBornes} en bornes, ${enRoute} en route`}>
                  <span className="reserve" style={{ width: part(enReserve) }} />
                  <span className="bornes" style={{ width: part(enBornes) }} />
                  <span className="route" style={{ width: part(enRoute) }} />
                </div>
                <div className="legende">
                  <span className="reserve"><i />chez vous <b className="num">{enReserve}</b></span>
                  <span className="bornes"><i />en bornes <b className="num">{enBornes}</b></span>
                  <span className="route"><i />en route <b className="num">{enRoute}</b></span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mesures">
            <Mesure titre="Valeur immobilisée" valeur={euros(valeur)}
                    dessous="au dernier prix d’achat connu" />
            <Mesure titre="Épuisés chez vous" valeur={String(epuises.length)}
                    dessous={epuises.length > 0 ? "plus rien en réserve ni en route" : "tout est approvisionné"}
                    alarme={epuises.length > 0}
                    vers={epuises.length > 0 ? lien({ q: "", v: "epuise" }) : undefined} />
            <Mesure titre="En route" valeur={String(enRoute)}
                    dessous={attendus.length > 0
                      ? `sur ${attendus.length} référence${attendus.length > 1 ? "s" : ""}`
                      : "rien en transit vers les bornes"}
                    vers={attendus.length > 0 ? lien({ q: "", v: "route" }) : undefined} />
          </div>
        </section>

        {peutCharger(u) ? (
          <div className="rangee-actions" style={{ marginBottom: 18 }}>
            <Link href="/reception" className="bouton primaire">+ Réception</Link>
            <Link href="/bornes" className="bouton">Charger une borne</Link>
          </div>
        ) : null}

        {/*
          CHERCHER ET FILTRER, SANS JAVASCRIPT.

          Le formulaire part en GET : la touche Entree suffit, et le bouton est la
          pour le pouce. Les filtres sont des liens ordinaires qui gardent la
          recherche en cours — passer de « Tout » a « Épuisés » ne doit pas
          effacer ce qu'on venait de taper.
        */}
        <div className="barre-outils">
          <form method="get" action="/stock" className="champ-recherche" role="search">
            <IcoLoupe size={17} />
            <input type="search" name="q" defaultValue={q} maxLength={60}
                   placeholder="Chercher un produit, une référence…"
                   aria-label="Chercher dans le stock" />
            {vue ? <input type="hidden" name="v" value={vue} /> : null}
            <button type="submit" className="bouton petit">Chercher</button>
          </form>

          <nav className="periodes petites" aria-label="Filtrer le stock">
            {VUES.map((x) => {
              const n = x.cle === "" ? lignes.length
                      : x.cle === "epuise" ? epuises.length : attendus.length;
              return (
                <Link key={x.cle || "tout"} href={lien({ v: x.cle })}
                      aria-current={x.cle === vue ? "true" : undefined}>
                  {x.nom} <span className="compte num">{n}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <p className="note-lecture">
          Pour chaque produit : ce qui est <b>chez vous</b>, ce qui est <b>en bornes</b>, et ce qui
          est <b>en route</b> — parti de votre réserve mais pas encore confirmé par la machine.
        </p>

        {groupes.length === 0 ? (
          <Repli icone={<IcoCatalogue />} titre="Aucun produit au catalogue"
                 texte="Le catalogue décrit ce que vendent vos bornes : nom, prix, âge minimum. Votre stock s’y adosse."
                 action={{ nom: "Ajouter un produit", vers: "/reglages/catalogue" }}
                 secondaire={{ nom: "Organiser les catégories", vers: "/reglages/categories" }} />
        ) : total === 0 && !cherche ? (
          <Repli icone={<IcoReception />} titre="Votre réserve est vide"
                 texte="Vos produits existent, mais rien n’a encore été reçu. Une réception fait entrer la marchandise achetée dans la réserve."
                 action={{ nom: "Enregistrer une réception", vers: "/reception" }} />
        ) : cherche ? (
          /*
            DES QU'ON CHERCHE, LES CATEGORIES S'EFFACENT.

            Ranger trois resultats dans six sections repliees, c'est cacher ce
            qu'on vient de demander. La liste devient plate, et chaque ligne porte
            sa categorie puisque ce n'est plus l'entete qui la donne.
          */
          <>
            <div className="titre-section">
              <h2>
                {trouves.length} résultat{trouves.length > 1 ? "s" : ""}
                {q ? <> pour « {q} »</> : null}
              </h2>
              {cherche ? (
                <Link href="/stock" className="lien">Tout revoir</Link>
              ) : null}
            </div>
            {trouves.length === 0 ? (
              <Repli icone={<IcoStock />} titre="Rien ne correspond"
                     texte={q
                       ? "Vérifiez l’orthographe, ou cherchez sur la référence plutôt que sur le nom. Un produit désactivé au catalogue n’apparaît pas ici."
                       : "Aucun produit dans cet état pour le moment."}
                     action={{ nom: "Tout revoir", vers: "/stock" }} dedans />
            ) : (
              <div className="liste-produits">
                {trouves.map((l) => <LigneProduit key={l.id} l={l} avecCategorie />)}
              </div>
            )}
          </>
        ) : (
          groupes.map((g) => <Section key={String(g.id)} g={g} />)
        )}

        <p className="faible" style={{ fontSize: 13.5, textAlign: "center", marginTop: 18 }}>
          <Link href="/reglages/categories" style={{ textDecoration: "underline" }}>
            Organiser les catégories
          </Link>
        </p>
      </main>
      <NavBasse page="stock" />
    </>
  );
}

/**
 * Un chiffre secondaire de l'entete.
 *
 * Il devient un LIEN quand il y a quelque chose a aller voir : « 3 épuisés » sans
 * moyen de savoir lesquels oblige a refaire la recherche a la main, ce que
 * personne ne fait.
 */
function Mesure({ titre, valeur, dessous, vers, alarme }: {
  titre: string; valeur: string; dessous: string; vers?: string; alarme?: boolean;
}) {
  const dedans = (
    <>
      <span className="etiquette">{titre}</span>
      <span className="ligne-chiffre">
        <span className={`chiffre num ${alarme ? "mal" : ""}`}>{valeur}</span>
        {vers ? <span className="voir">voir <IcoChevron size={14} /></span> : null}
      </span>
      <span className="dessous">{dessous}</span>
    </>
  );
  return vers
    ? <Link href={vers} className="mesure menant">{dedans}</Link>
    : <div className="mesure">{dedans}</div>;
}

function Section({ g }: { g: Groupe }) {
  return (
    <details className="groupe" open={g.ruptures > 0}>
      <summary>
        <span className="chevron">▶</span>
        <div className="pousse" style={{ minWidth: 0 }}>
          <div className="titre">{g.nom}</div>
          <div className="resume">
            {g.lignes.length} produit{g.lignes.length > 1 ? "s" : ""} · {euros(g.valeur)} à l’achat
            {g.ruptures > 0
              ? ` · ${g.ruptures} épuisé${g.ruptures > 1 ? "s" : ""} chez vous` : ""}
          </div>
        </div>
        <Chiffres reserve={g.reserve} bornes={g.bornes} en_route={g.en_route} grands />
      </summary>
      <div className="dedans">
        <div className="sous-liste">
          {g.lignes.map((l) => <LigneProduit key={l.id} l={l} />)}
        </div>
      </div>
    </details>
  );
}

/**
 * Les trois nombres, toujours les memes, toujours aux memes largeurs.
 *
 * Les trois colonnes sont TOUJOURS presentes, meme a zero. J'avais d'abord
 * masque « en route » quand il n'y avait rien : les lignes n'avaient plus la
 * meme largeur, le total d'une categorie ne tombait plus au-dessus de ses
 * produits, et la colonne cessait de se lire de haut en bas. Un tiret discret
 * coute moins cher qu'un alignement perdu.
 */
function Chiffres({ reserve, bornes, en_route, grands = false }: {
  reserve: number; bornes: number; en_route: number; grands?: boolean;
}) {
  return (
    <div className={`chiffres ${grands ? "grands" : ""}`}>
      <span>
        <span className="n" style={reserve === 0 ? { color: "var(--rouge-vif)" } : undefined}>
          {reserve}</span>
        <span className="q">chez moi</span>
      </span>
      <span>
        <span className="n">{bornes}</span>
        <span className="q">en bornes</span>
      </span>
      <span>
        {/* `data-vide`, pas la classe `vide` : celle-ci est l'ecran vide
            generique, et son `text-align: center` ne tenait ici que par
            l'accident d'une regle voisine plus specifique. */}
        <span className="n" data-vide={en_route === 0 ? "" : undefined}
              style={en_route > 0 ? { color: "var(--ambre)" } : undefined}>
          {en_route || "—"}</span>
        <span className="q">en route</span>
      </span>
    </div>
  );
}

/**
 * Un produit dans sa categorie.
 *
 * Retrait, filet vertical, surface en creux et chevron de fin : quatre signaux
 * pour dire « ceci est un cran plus bas, et ca mene quelque part ». Un seul
 * n'aurait pas suffi — c'est precisement parce que les deux niveaux se
 * ressemblaient qu'on s'y perdait.
 *
 * EPUISE S'ECRIT. Le liseret rouge disait deja quelque chose, mais une couleur
 * qui porte seule ne dit rien a qui ne la voit pas, et rien du tout a l'impression.
 */
function LigneProduit({ l, avecCategorie = false }:
  { l: LigneStock; avecCategorie?: boolean }) {
  const epuise = l.reserve === 0 && l.en_route === 0;
  return (
    <Link href={`/stock/${l.id}`} className={`produit-ligne ${epuise ? "epuise" : ""}`}>
      <div style={{ minWidth: 0 }}>
        <div className="nom">{l.nom}</div>
        <div className="meta">
          <span className="mono">{l.sku}</span> · {euros(l.prix_vente_c)}
          {l.prix_achat_c ? ` · achat ${euros(l.prix_achat_c)}` : ""}
          {avecCategorie ? <> · {l.categorie}</> : null}
          {epuise ? <b className="dit-epuise">épuisé chez vous</b> : null}
        </div>
      </div>
      <Chiffres reserve={l.reserve} bornes={l.bornes} en_route={l.en_route} />
      <span className="fleche"><IcoChevron size={16} /></span>
    </Link>
  );
}
