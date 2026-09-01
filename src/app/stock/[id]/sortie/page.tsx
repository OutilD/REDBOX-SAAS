import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q, q1 } from "@/db";
import { peutCharger, utilisateur } from "@/lib/auth";
import { MOTIFS_SORTIE } from "@/lib/sortie";

export const dynamic = "force-dynamic";

const ERREURS: Record<string, string> = {
  motif: "Choisissez une cause.",
  quantite: "Indiquez une quantité d’au moins une unité.",
  note: "« Autre » demande une note : sans elle, personne ne saura de quoi il s’agissait.",
  vide: "Il n’y a rien à sortir : ce produit n’est nulle part.",
  trop: "Vous ne pouvez pas sortir plus que ce que contient l’endroit choisi.",
  lieu: "Choisissez d’où la marchandise sort.",
};

/**
 * Sortir de la marchandise de la reserve.
 *
 * Un ecran a part, et non un champ discret sur la fiche : une sortie ne se
 * corrige pas d'un clic, elle s'ecrit au grand livre et fait baisser le stock
 * pour de bon. Autant que le geste ait la place de se lire.
 */
export default async function Sortie({
  params, searchParams,
}: { params: Promise<{ id: string }>;
     searchParams: Promise<{ e?: string; dispo?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  const { e, dispo } = await searchParams;
  if (!peutCharger(u)) redirect(`/stock/${id}`);

  const p = await q1<{ id: number; nom: string; sku: string }>(
    "SELECT id, nom, sku FROM produit WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!p) notFound();

  // D'ou la marchandise peut sortir : la reserve, et CHAQUE SPIRE qui en porte.
  // Une casse arrive aussi bien dans un carton que dans un tiroir de machine, et
  // en machine elle arrive dans une spirale precise — c'est son compteur a elle
  // qui doit baisser, sinon le canal continuerait d'annoncer ce qu'il n'a plus.
  const lieux = await q<{
    lieu_id: number; lane: number | null; nom: string; genre: string; quantite: number;
  }>(`
    SELECT s.lieu_id, NULL::int AS lane, l.nom, l.genre, s.quantite::int
      FROM v_stock s JOIN lieu l ON l.id = s.lieu_id
     WHERE s.produit_id = $1 AND l.compte_id = $2 AND l.genre = 'reserve' AND s.quantite > 0
    UNION ALL
    SELECT b.lieu_id, c.lane, b.nom, 'borne' AS genre, c.quantite::int
      FROM canal c JOIN borne b ON b.id = c.borne_id
     WHERE c.produit_id = $1 AND b.compte_id = $2 AND c.quantite > 0
       AND b.lieu_id IS NOT NULL
     ORDER BY (genre = 'reserve') DESC, quantite DESC`, [id, u.compte_id]);

  const total = lieux.reduce((n, l) => n + l.quantite, 0);
  const maximum = Math.max(...lieux.map((l) => l.quantite), 0);

  return (
    <>
      <Entete page="stock" />
      <main className="ecran">
        <h1>{p.nom}</h1>
        <p className="faible" style={{ margin: "6px 0 0", fontSize: 14 }}>
          {p.sku} · <b>{total}</b> {total > 1 ? "unités" : "unité"} en tout
        </p>

        {e ? (
          <div className="carte chaude" style={{ marginTop: 14 }}>
            <strong>{ERREURS[e] ?? "Saisie refusée."}</strong>
            {e === "trop" && dispo ? (
              <p className="faible" style={{ margin: "8px 0 0", fontSize: 13.5 }}>
                La réserve n’en contient que {dispo}.
              </p>
            ) : null}
          </div>
        ) : null}

        {lieux.length === 0 ? (
          <div className="carte" style={{ marginTop: 14 }}>
            <strong>Rien à sortir.</strong>
            <p className="faible" style={{ margin: "8px 0 14px", fontSize: 14 }}>
              Ce produit n’est ni en réserve ni en machine.
            </p>
            <Link href={`/stock/${id}`} className="bouton">Retour à la fiche</Link>
          </div>
        ) : (
          <form method="post" action="/api/stock/sortie" className="carte" style={{ marginTop: 14 }}>
            <input type="hidden" name="produit" value={id} />

            {/*
              D'ou elle sort. La reserve et les machines sont deux endroits
              differents : sortir d'une borne rapproche notre stock theorique de
              ce que la machine compte vraiment, sortir de la reserve constate
              une perte avant meme le chargement.
            */}
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>D’où</p>
            <div className="choix-motifs">
              {lieux.map((l, i) => (
                <label key={`${l.lieu_id}:${l.lane ?? ""}`} className="choix">
                  <input type="radio" name="lieu"
                         value={l.lane === null ? String(l.lieu_id) : `${l.lieu_id}:${l.lane}`}
                         defaultChecked={i === 0} required />
                  <span>
                    <span className="titre">
                      {l.genre === "reserve" ? "Ma réserve" : l.nom}
                      {l.lane !== null ? (
                        <span className="faible"> · spire {l.lane}</span>
                      ) : null}
                    </span>
                    <span className="quoi">
                      {l.quantite} {l.quantite > 1 ? "unités" : "unité"}
                      {l.genre === "reserve" ? " chez vous" : " dans la spirale"}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <label htmlFor="quantite" style={{ marginTop: 18 }}>Combien</label>
            <input id="quantite" name="quantite" type="number" inputMode="numeric"
                   min={1} max={maximum} defaultValue={1} required
                   style={{ maxWidth: 140 }} />

            <p style={{ margin: "18px 0 8px", fontWeight: 600 }}>Pourquoi</p>
            {/*
              Des choix visibles d'un coup et non une liste deroulante : la cause
              est le sujet de cet ecran, et c'est elle qu'on relira en statistique.
            */}
            <div className="choix-motifs">
              {Object.entries(MOTIFS_SORTIE).map(([cle, m], i) => (
                <label key={cle} className="choix">
                  <input type="radio" name="motif" value={cle} defaultChecked={i === 0} required />
                  <span>
                    <span className="titre">{m.nom}</span>
                    <span className="quoi">{m.quoi}</span>
                  </span>
                </label>
              ))}
            </div>

            <label htmlFor="note" style={{ marginTop: 18 }}>
              Note — obligatoire pour « Autre »
            </label>
            <textarea id="note" name="note" rows={2}
                      placeholder="Palette tombée au déchargement, lot n° 3412…" />

            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button className="bouton primaire">Sortir du stock</button>
              <Link href={`/stock/${id}`} className="bouton">Annuler</Link>
            </div>

            <p className="faible" style={{ margin: "14px 0 0", fontSize: 13 }}>
              La sortie s’inscrit au grand livre à votre nom et fait baisser le stock
              immédiatement. Sortie d’une machine, elle ne touche pas au compteur de
              celle-ci : il vient de ses capteurs, et se corrige sur la machine.
            </p>
          </form>
        )}
      </main>
      <NavBasse page="stock" />
    </>
  );
}
