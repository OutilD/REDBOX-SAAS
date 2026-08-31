import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { euros } from "@/db";
import { peutCharger, utilisateur } from "@/lib/auth";
import { grouperParCategorie, stockParProduit, valeurImmobilisee,
         type Groupe, type LigneStock } from "@/lib/stock";
import { Repli } from "../repli";
import { IcoCatalogue, IcoChevron, IcoReception } from "../icones";

export const dynamic = "force-dynamic";

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
 */
export default async function Stock() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  const lignes = await stockParProduit(u.compte_id);
  const groupes = grouperParCategorie(lignes);
  const total = lignes.reduce((s, l) => s + l.reserve + l.bornes + l.en_route, 0);
  const valeur = valeurImmobilisee(lignes);
  const ruptures = lignes.filter((l) => l.reserve === 0 && l.en_route === 0).length;
  const enRoute = lignes.reduce((s, l) => s + l.en_route, 0);

  return (
    <>
      <Entete page="stock" />
      <main className="ecran">
        <h1>Mon stock</h1>
        <p className="sous">Ce que vous avez acheté, et où il se trouve aujourd’hui.</p>

        <div className="bandeau quatre">
          <div><div className="stat">
            <span className="valeur num">{total}</span>
            <span className="libelle">unités au total</span></div></div>
          <div><div className="stat">
            <span className="valeur num petite">{euros(valeur)}</span>
            <span className="libelle">immobilisés à l’achat</span></div></div>
          <div><div className={`stat ${ruptures ? "alerte" : ""}`}>
            <span className="valeur num">{ruptures}</span>
            <span className="libelle">
              {ruptures > 1 ? "produits épuisés chez vous" : "produit épuisé chez vous"}</span></div></div>
          {enRoute > 0 ? (
            <div className="carte"><div className="stat attention">
              <span className="valeur num">{enRoute}</span>
              <span className="libelle">unités en route</span></div></div>
          ) : null}
        </div>

        {peutCharger(u) ? (
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Link href="/reception" className="bouton primaire large">+ Réception</Link>
            <Link href="/bornes" className="bouton large">Charger une borne</Link>
          </div>
        ) : null}

        <p className="note-lecture">
          Pour chaque produit : ce qui est <b>chez vous</b>, ce qui est <b>en bornes</b>, et ce qui
          est <b>en route</b> — parti de votre réserve mais pas encore confirmé par la machine.
        </p>

        <h2>{groupes.length} catégories</h2>
        {groupes.length === 0 ? (
          <Repli icone={<IcoCatalogue />} titre="Aucun produit au catalogue"
                 texte="Le catalogue décrit ce que vendent vos bornes : nom, prix, âge minimum. Votre stock s’y adosse."
                 action={{ nom: "Ajouter un produit", vers: "/reglages/catalogue" }}
                 secondaire={{ nom: "Organiser les catégories", vers: "/reglages/categories" }} />
        ) : total === 0 ? (
          <Repli icone={<IcoReception />} titre="Votre réserve est vide"
                 texte="Vos produits existent, mais rien n’a encore été reçu. Une réception fait entrer la marchandise achetée dans la réserve."
                 action={{ nom: "Enregistrer une réception", vers: "/reception" }} />
        ) : groupes.map((g) => <Section key={String(g.id)} g={g} />)}

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
        <span className={`n ${en_route === 0 ? "vide" : ""}`}
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
 */
function LigneProduit({ l }: { l: LigneStock }) {
  const epuise = l.reserve === 0 && l.en_route === 0;
  return (
    <Link href={`/stock/${l.id}`} className={`produit-ligne ${epuise ? "epuise" : ""}`}>
      <div style={{ minWidth: 0 }}>
        <div className="nom">{l.nom}</div>
        <div className="meta">
          <span className="mono">{l.sku}</span> · {euros(l.prix_vente_c)}
          {l.prix_achat_c ? ` · achat ${euros(l.prix_achat_c)}` : ""}
        </div>
      </div>
      <Chiffres reserve={l.reserve} bornes={l.bornes} en_route={l.en_route} />
      <span className="fleche"><IcoChevron size={16} /></span>
    </Link>
  );
}
