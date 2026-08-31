import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { Repli } from "../../repli";
import { IcoReception } from "../../icones";
import { q, euros, leJour } from "@/db";
import { utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Bon = {
  cle: string; reference: string | null; fournisseur: string | null;
  par: string | null; fait_le: Date;
  refs: number; unites: number; total: number;
};
type LigneBon = {
  cle: string; nom: string; sku: string; categorie: string;
  quantite: number; prix_achat_c: number | null;
};

/**
 * L'historique des receptions.
 *
 * Range par livraison, pas par ligne : ce qu'on cherche ici, c'est « qu'est-ce
 * que j'ai recu le 12, et est-ce que ca correspond au bon ? ». Chaque bon
 * s'ouvre sur son detail — en <details> natif, donc sans JavaScript.
 */
export default async function Historique() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  const bons = await q<Bon>(`
    SELECT to_char(m.fait_le, 'YYYYMMDDHH24MISSMS') || COALESCE(m.reference, '') AS cle,
           m.reference, m.note AS fournisseur, m.par, m.fait_le,
           COUNT(*)::int AS refs,
           SUM(m.quantite)::int AS unites,
           COALESCE(SUM(m.quantite * m.prix_achat_c), 0)::int AS total
      FROM mouvement m
     WHERE m.compte_id = $1 AND m.motif = 'reception' AND m.annule_le IS NULL
     GROUP BY m.fait_le, m.reference, m.note, m.par
     ORDER BY m.fait_le DESC LIMIT 60`, [u.compte_id]);

  const lignes = await q<LigneBon>(`
    SELECT to_char(m.fait_le, 'YYYYMMDDHH24MISSMS') || COALESCE(m.reference, '') AS cle,
           p.nom, p.sku, COALESCE(cat.nom, 'sans catégorie') AS categorie,
           m.quantite, m.prix_achat_c
      FROM mouvement m
      JOIN produit p ON p.id = m.produit_id
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE m.compte_id = $1 AND m.motif = 'reception' AND m.annule_le IS NULL
     ORDER BY m.fait_le DESC, p.nom`, [u.compte_id]);

  const parBon = new Map<string, LigneBon[]>();
  for (const l of lignes) (parBon.get(l.cle) ?? parBon.set(l.cle, []).get(l.cle)!).push(l);

  const unites = bons.reduce((s, b) => s + b.unites, 0);
  const depense = bons.reduce((s, b) => s + b.total, 0);

  return (
    <>
      <Entete page="reception" />
      <main className="ecran">
        <div className="rangee" style={{ marginBottom: 4 }}>
          <Link href="/reception" className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>Historique des réceptions</h1></div>
        </div>
        <p className="sous">Tout ce qui est entré dans votre réserve, livraison par livraison.</p>

        {bons.length === 0 ? (
          <Repli icone={<IcoReception />} titre="Aucune réception enregistrée"
                 texte="Chaque livraison que vous saisissez entre dans votre réserve, avec son prix d’achat."
                 action={{ nom: "Enregistrer une réception", vers: "/reception" }} />
        ) : (
          <>
            <div className="bandeau quatre">
              <div><div className="stat">
                <span className="valeur num">{bons.length}</span>
                <span className="libelle">livraisons</span></div></div>
              <div><div className="stat">
                <span className="valeur num">{unites}</span>
                <span className="libelle">unités reçues</span></div></div>
              <div><div className="stat">
                <span className="valeur num petite">{euros(depense)}</span>
                <span className="libelle">dépensé à l’achat</span></div></div>
              <div><div className="stat">
                <span className="valeur num petite">
                  {euros(unites ? Math.round(depense / unites) : 0)}</span>
                <span className="libelle">coût moyen par unité</span></div></div>
            </div>

            <h2>Livraisons</h2>
            {bons.map((b) => (
              <details className="groupe" key={b.cle}>
                <summary>
                  <span className="chevron">▶</span>
                  <div className="pousse" style={{ minWidth: 0 }}>
                    <div className="titre">
                      {b.reference ?? <span className="faible">sans référence</span>}
                    </div>
                    <div className="resume">
                      {leJour(b.fait_le)} · {b.refs} référence{b.refs > 1 ? "s" : ""}
                      {b.fournisseur ? ` · ${b.fournisseur}` : ""}
                      {b.par ? ` · saisie par ${b.par}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div className="num" style={{ fontWeight: 750, fontSize: 18 }}>+{b.unites}</div>
                    <div className="faible num" style={{ fontSize: 11.5 }}>
                      {b.total ? euros(b.total) : "prix inconnu"}
                    </div>
                  </div>
                </summary>
                <div className="dedans">
                  <div className="carte plate" style={{ padding: 0 }}>
                    <div className="lignes">
                      {(parBon.get(b.cle) ?? []).map((l, i) => (
                        <div className="ligne" key={i}>
                          <div className="corps">
                            <div className="nom">{l.nom}</div>
                            <div className="meta">
                              {l.categorie} · <span className="mono">{l.sku}</span>
                              {l.prix_achat_c ? ` · ${euros(l.prix_achat_c)} l’unité` : ""}
                            </div>
                          </div>
                          <div className="fin">
                            <div className="num" style={{ fontWeight: 700 }}>+{l.quantite}</div>
                            {l.prix_achat_c ? (
                              <div className="faible num" style={{ fontSize: 12 }}>
                                {euros(l.quantite * l.prix_achat_c)}</div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </>
        )}
      </main>
      <NavBasse page="reception" />
    </>
  );
}
