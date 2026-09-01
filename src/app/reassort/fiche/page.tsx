import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { utilisateur } from "@/lib/auth";
import { planifier } from "@/lib/reassort";
import { Repli } from "../../repli";
import { IcoAlerte, IcoReassort } from "../../icones";
import Imprimer from "./imprimer";

export const dynamic = "force-dynamic";

/**
 * LA FICHE.
 *
 * Un document, pas un ecran de saisie : on le lit, on ne le remplit pas. Il tient
 * debout sur un telephone et sort proprement en A4, parce que le meme homme fait
 * les deux — il regarde son telephone dans la voiture et pose la feuille sur la
 * machine ouverte.
 *
 * Deux parties, dans l'ordre ou on s'en sert :
 *   1. LE CAMION. Ce qu'on sort de la reserve avant de partir, par produit. On
 *      le fait une fois, au depot.
 *   2. LES BORNES. Une page par machine, groupee par categorie — un carton dans
 *      les mains, on fait tous ses canaux, on prend le suivant.
 *
 * Chaque ligne porte une case a cocher. Sur du papier c'est un carre a la bille ;
 * a l'ecran ca coche vraiment. Rien n'est enregistre : la saisie de ce qu'on a
 * REELLEMENT pose se fait dans « Charger », qui bouge le stock. La fiche dit ce
 * qu'il faut faire, l'ecran de chargement dit ce qui a ete fait.
 */

function unites(n: number): string {
  return `${n} ${n > 1 ? "unités" : "unité"}`;
}

export default async function Fiche({
  searchParams,
}: { searchParams: Promise<{ b?: string | string[] }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  const brut = (await searchParams).b;
  const ids = [...new Set((Array.isArray(brut) ? brut : brut ? [brut] : [])
    .flatMap((v) => v.split(","))
    .map(Number).filter(Number.isInteger))];

  if (ids.length === 0) redirect("/reassort");

  const f = await planifier(u.compte_id, ids);
  const aujourdhui = new Date().toLocaleDateString("fr-FR",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const servies = f.bornes.filter((b) => b.total > 0);

  return (
    <>
      <Entete page="reassort" />
      <main className="ecran fiche">
        <div className="rangee sans-impression" style={{ marginTop: 18 }}>
          <Link href="/reassort" className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Fiche de réassort</h1></div>
          <Imprimer />
        </div>

        <header className="fiche-tete">
          <div>
            <div className="fiche-titre">Réassort — {u.compte}</div>
            <div className="fiche-date">{aujourdhui}</div>
          </div>
          <div className="fiche-chiffre">
            <b>{f.total}</b>
            <span>{f.total > 1 ? "unités" : "unité"} · {servies.length}
              {servies.length > 1 ? " bornes" : " borne"}</span>
          </div>
        </header>

        {f.total === 0 ? (
          <Repli icone={<IcoReassort />} titre="Rien à charger"
                 texte={f.manque > 0
                   ? "Les bornes ont besoin de marchandise, mais votre réserve est vide pour ces produits. Enregistrez une réception avant de partir."
                   : "Les bornes choisies sont pleines. Rien à emporter aujourd’hui."}
                 action={f.manque > 0
                   ? { nom: "Enregistrer une réception", vers: "/reception" }
                   : { nom: "Choisir d’autres bornes", vers: "/reassort" }} />
        ) : (
          <>
            {/* 1 — LE CAMION */}
            <section className="fiche-bloc">
              <h2 className="fiche-h2">1 · À sortir de la réserve</h2>
              <table className="tableau-fiche">
                <thead>
                  <tr>
                    <th className="case" />
                    <th>Produit</th>
                    <th className="ref">Réf.</th>
                    <th className="num">À prendre</th>
                    <th className="num pale">En réserve</th>
                  </tr>
                </thead>
                <tbody>
                  {f.camion.filter((l) => l.aPrendre > 0).map((l) => (
                    <tr key={l.produit_id}>
                      <td className="case"><input type="checkbox" aria-label={`${l.nom} chargé`} /></td>
                      <td><b>{l.nom}</b><span className="cat"> · {l.categorie}</span></td>
                      <td className="ref mono">{l.sku}</td>
                      <td className="num gros">{l.aPrendre}</td>
                      <td className="num pale">{l.reserve}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="case" /><td colSpan={2}>Total à charger</td>
                    <td className="num gros">{f.total}</td><td />
                  </tr>
                </tfoot>
              </table>
            </section>

            {/* Ce que la reserve ne couvre pas — une commande, pas une consigne */}
            {f.manque > 0 ? (
              <div className="avis">
                <IcoAlerte size={17} />
                <div className="dit">
                  <div className="titre">{unites(f.manque)} manquent en réserve</div>
                  <div className="texte">
                    Les quantités ci-dessus sont déjà plafonnées : la fiche ne demande
                    jamais ce que vous n’avez pas. Les bornes resteront partiellement
                    remplies sur&nbsp;
                    {f.camion.filter((l) => l.manque > 0)
                      .map((l) => `${l.nom} (−${l.manque})`).join(", ")}.
                  </div>
                </div>
                <Link href="/reception" className="bouton petit sans-impression">Réception</Link>
              </div>
            ) : null}

            {/* 2 — LES BORNES */}
            {servies.map((b, i) => (
              <section className={`fiche-bloc borne${i > 0 ? " saut-page" : ""}`} key={b.id}>
                <h2 className="fiche-h2">
                  {i + 2} · {b.nom}
                  <span className="fiche-h2-note">
                    {b.adresse ?? "lieu non renseigné"} · {unites(b.total)}
                    {b.vides > 0
                      ? ` · ${b.vides} ${b.vides > 1 ? "canaux vides" : "canal vide"}`
                      : ""}
                    {servies.length > 1 ? ` · borne ${i + 1} sur ${servies.length}` : ""}
                  </span>
                </h2>
                {/* Une seule table par borne. Repeter l'en-tete a chaque categorie
                    hachait la lecture et gaspillait une ligne sur trois : les
                    categories sont des separateurs dans le tableau, pas des
                    tableaux distincts. */}
                <table className="tableau-fiche">
                  <thead>
                    <tr>
                      <th className="case" />
                      <th className="canal">Canal</th>
                      <th>Produit</th>
                      <th className="num pale">Reste</th>
                      <th className="num">À mettre</th>
                    </tr>
                  </thead>
                  {b.groupes.map((g) => (
                    <tbody key={g.nom}>
                      <tr className="separateur">
                        <td colSpan={3}>{g.nom}</td>
                        <td className="num pale" colSpan={2}>{g.total} u.</td>
                      </tr>
                      {g.lignes.map((l) => (
                        <tr key={l.lane} className={l.quantite + l.en_route === 0 ? "vide" : ""}>
                          <td className="case"><input type="checkbox" aria-label={`canal ${l.code} fait`} /></td>
                          <td className="canal mono">{l.code}</td>
                          <td>
                            <b>{l.nom}</b>
                            {l.aMettre < l.souhaite
                              ? <span className="cat"> · {l.souhaite - l.aMettre} de moins que le plein</span>
                              : null}
                          </td>
                          <td className="num pale">
                            {l.quantite}<span className="sur">/{l.capacite}</span>
                            {l.en_route > 0 ? <span className="sur"> +{l.en_route}</span> : null}
                          </td>
                          <td className="num gros">{l.aMettre}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
                <div className="fiche-signature">
                  <div><span>Fait par</span></div>
                  <div><span>Heure</span></div>
                  <div className="large"><span>Remarques</span></div>
                </div>
                <Link href={`/bornes/${b.id}/charger`} className="bouton large sans-impression"
                      style={{ marginTop: 12 }}>
                  Saisir ce qui a été chargé sur {b.nom}
                </Link>
              </section>
            ))}
          </>
        )}
      </main>
      <NavBasse page="reassort" />
    </>
  );
}
