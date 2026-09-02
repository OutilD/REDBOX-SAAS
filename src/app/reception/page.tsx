import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import Lignes, { type Ligne } from "./lignes";
import { Repli } from "../repli";
import { IcoCatalogue, IcoFleche, IcoReception } from "../icones";
import { q, euros, leJour } from "@/db";
import { peutCharger, utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Recue = {
  id: number; reference: string | null; par: string | null; fait_le: Date;
  lignes: number; unites: number; total: number;
};

/**
 * Reception : ce que vous venez d'acheter entre dans la reserve.
 *
 * Une livraison porte plusieurs references a la fois : on saisit tout le carton,
 * on valide une fois, et l'entree porte un seul numero de bon. Le prix d'achat
 * est pre-rempli avec le dernier paye — c'est le seul moment ou on le connait, et
 * le redemander plus tard revient a ne jamais l'avoir.
 */
export default async function Reception({ searchParams }:
  { searchParams: Promise<{ e?: string; ok?: string; refs?: string; p?: string; q?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  // LE DEPOT EST L'AFFAIRE DE L'EXPLOITANT. Ce qui dort en reserve, ce qui a ete
  // recu, ce qui a ete paye : rien de tout cela ne regarde quelqu'un qu'on a
  // invite sur une machine. On le renvoie a ses bornes.
  if (u.bornes !== null) redirect("/bornes");
  if (!peutCharger(u)) redirect("/");
  const { e, ok, refs, p: cible, q: quantite } = await searchParams;

  const produits = await q<Ligne>(`
    SELECT p.id, p.sku, p.nom,
           COALESCE(cat.nom, 'sans catégorie') AS categorie,
           COALESCE((SELECT SUM(s.quantite)::int FROM v_stock s JOIN lieu l ON l.id = s.lieu_id
                      WHERE s.produit_id = p.id AND l.genre = 'reserve'), 0) AS reserve,
           (SELECT a.prix_achat_c FROM v_prix_achat a WHERE a.produit_id = p.id) AS prix_achat_c
      FROM produit p LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE p.compte_id = $1 AND p.actif
     ORDER BY COALESCE(cat.ordre, 999), COALESCE(cat.nom, 'zzz'), p.nom`, [u.compte_id]);

  // Une reception, c'est toutes les lignes saisies au meme instant sous la meme
  // reference : on les regroupe pour la relire comme un bon de livraison. Ici on
  // ne montre que la derniere — l'historique a sa page.
  const [derniere] = await q<Recue>(`
    SELECT MIN(m.id)::int AS id, m.reference, m.par, m.fait_le,
           COUNT(*)::int AS lignes,
           SUM(m.quantite)::int AS unites,
           COALESCE(SUM(m.quantite * m.prix_achat_c), 0)::int AS total
      FROM mouvement m
     WHERE m.compte_id = $1 AND m.motif = 'reception' AND m.annule_le IS NULL
     GROUP BY m.fait_le, m.reference, m.par
     ORDER BY m.fait_le DESC LIMIT 1`, [u.compte_id]);

  const prerempli = cible && Number(cible) > 0
    ? { id: Number(cible), q: Math.max(1, Number(quantite) || 1) } : undefined;

  return (
    <>
      <Entete page="reception" />
      <main className="ecran">
        <h1>Réception de stock</h1>
        <p className="sous">
          Saisissez tout ce que contient la livraison. Tout entre dans votre réserve,
          sous une seule référence.
        </p>

        {ok ? (
          <div className="carte" style={{ borderColor: "var(--vert)", marginBottom: 14 }}>
            <span className="pilule ok"><i />{ok} unités entrées en réserve
              {refs ? ` sur ${refs} référence${Number(refs) > 1 ? "s" : ""}` : ""}</span>
          </div>
        ) : null}
        {e === "rien" ? <p className="erreur">Aucune ligne saisie : indiquez au moins une quantité.</p> : null}

        {produits.length === 0 ? (
          <Repli icone={<IcoCatalogue />} titre="Aucun produit au catalogue"
                 texte="Une réception fait entrer de la marchandise dans votre réserve — encore faut-il savoir laquelle."
                 action={{ nom: "Remplir le catalogue", vers: "/reglages/catalogue" }} />
        ) : (
          <form method="post" action="/api/reception">
            <div className="carte" style={{ marginBottom: 12 }}>
              <div className="rangee" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 190 }}>
                  <label htmlFor="reference">Référence</label>
                  <input id="reference" name="reference"
                         placeholder="Bon de livraison, facture — facultatif" />
                </div>
                <div style={{ width: 180 }}>
                  <label htmlFor="fournisseur">Fournisseur</label>
                  <input id="fournisseur" name="fournisseur" placeholder="facultatif" />
                </div>
              </div>
            </div>

            <Lignes produits={produits} prerempli={prerempli} />
          </form>
        )}

        <div className="titre-section">
          <h2>Dernière réception</h2>
          <Link href="/reception/historique" className="lien">
            Tout l’historique <IcoFleche size={13} />
          </Link>
        </div>
        {derniere ? (
          <Link href="/reception/historique" className="carte" style={{ display: "block" }}>
            <div className="rangee">
              <div className="pousse">
                <div style={{ fontWeight: 650 }}>
                  {derniere.reference ?? <span className="faible">sans référence</span>}
                </div>
                <div className="faible" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {leJour(derniere.fait_le)} · {derniere.lignes} référence{derniere.lignes > 1 ? "s" : ""}
                  {derniere.par ? ` · ${derniere.par}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="num" style={{ fontWeight: 700 }}>+{derniere.unites}</div>
                <div className="faible num" style={{ fontSize: 12 }}>
                  {derniere.total ? euros(derniere.total) : "—"}
                </div>
              </div>
            </div>
          </Link>
        ) : (
          <Repli icone={<IcoReception />} titre="Aucune réception enregistrée"
                 texte="Chaque livraison saisie ici entre dans votre réserve, avec son prix d’achat."
                 dedans />
        )}

        <p className="faible" style={{ fontSize: 13 }}>
          Une réception n’envoie rien dans les bornes : elle remplit votre réserve.
          Le passage en machine se fait depuis{" "}
          <Link href="/bornes" style={{ textDecoration: "underline" }}>la fiche d’une borne</Link>.
        </p>
      </main>
      <NavBasse page="reception" />
    </>
  );
}
