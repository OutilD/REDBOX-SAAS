import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q, q1, euros, depuis } from "@/db";
import { peutCharger, utilisateur } from "@/lib/auth";
import { Repli } from "../repli";
import { IcoBorne, IcoVentes } from "../icones";

export const dynamic = "force-dynamic";

const FENETRES = [
  { cle: "1",  nom: "Aujourd’hui", jours: 1 },
  { cle: "7",  nom: "7 jours",     jours: 7 },
  { cle: "30", nom: "30 jours",    jours: 30 },
  { cle: "90", nom: "90 jours",    jours: 90 },
];

type Jour = { jour: string; n: number; total: number };
type ParProduit = { nom: string | null; n: number; total: number; marge: number | null };
type Souci = {
  id: number; borne_id: number; borne: string; commande_id: string;
  lane: number | null; nom: string | null; prix_c: number; statut: string; faite_le: Date;
};

export default async function Ventes(
  { searchParams }: { searchParams: Promise<{ f?: string; b?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { f, b } = await searchParams;
  // Nommee, pas prise au rang : ajouter « aujourd'hui » en tete aurait fait
  // glisser le defaut de trente jours a sept.
  const fen = FENETRES.find((x) => x.cle === f) ?? FENETRES.find((x) => x.cle === "30")!;
  /**
   * LA PORTEE VOYAGE AVEC LES PARAMETRES.
   *
   * Cette page joint `vente` a `borne` et ne filtrait que sur le compte : elle
   * montrait donc a quelqu'un invite sur une machine le chiffre de toutes les
   * autres. Le troisieme parametre est nul pour un associe — tout le parc, comme
   * avant — et porte la liste des bornes ouvertes sinon.
   */
  /**
   * LA BORNE CHOISIE DANS L'ENTETE.
   *
   * On ne la croit pas sur parole : le numero vient de l'adresse, et il se tape.
   * Elle doit etre du compte ET dans ce qui est ouvert a la personne, sinon le
   * filtre deviendrait une porte vers les ventes d'une machine qu'elle n'a pas
   * le droit de voir.
   */
  const choisie = b ? await q1<{ id: number }>(
    `SELECT id FROM borne
      WHERE id = $1 AND compte_id = $2 AND ($3::bigint[] IS NULL OR id = ANY($3))`,
    [Number(b), u.compte_id, u.bornes]) : null;
  const portee = choisie ? [choisie.id] : u.bornes;

  const p = [u.compte_id, `${fen.jours} days`, portee];
  const PORTEE = "AND ($3::bigint[] IS NULL OR b.id = ANY($3))";

  const total = await q1<{ n: number; total: number }>(`
    SELECT COUNT(*)::int n, COALESCE(SUM(v.prix_c),0)::int total
      FROM vente v JOIN borne b ON b.id = v.borne_id
     WHERE b.compte_id = $1 AND v.statut = 'distribue' ${PORTEE}
       AND v.faite_le >= date_trunc('day', now()) - $2::interval + interval '1 day'`, p);

  const jours = await q<Jour>(`
    SELECT to_char(date_trunc('day', v.faite_le), 'DD/MM') AS jour,
           COUNT(*)::int n, COALESCE(SUM(v.prix_c),0)::int total
      FROM vente v JOIN borne b ON b.id = v.borne_id
     WHERE b.compte_id = $1 AND v.statut = 'distribue' ${PORTEE}
       AND v.faite_le >= date_trunc('day', now()) - $2::interval + interval '1 day'
     GROUP BY date_trunc('day', v.faite_le) ORDER BY date_trunc('day', v.faite_le)`, p);

  // La marge se calcule au dernier prix d'achat connu. C'est le chiffre qui dit
  // quoi arreter de vendre.
  const parProduit = await q<ParProduit>(`
    SELECT pr.nom, COUNT(*)::int n, COALESCE(SUM(v.prix_c),0)::int total,
           SUM(v.prix_c - COALESCE(a.prix_achat_c, 0))::int AS marge
      FROM vente v
      JOIN borne b   ON b.id = v.borne_id
      LEFT JOIN produit pr ON pr.id = v.produit_id
      LEFT JOIN v_prix_achat a ON a.produit_id = v.produit_id
     WHERE b.compte_id = $1 AND v.statut = 'distribue' ${PORTEE}
       AND v.faite_le >= date_trunc('day', now()) - $2::interval + interval '1 day'
     GROUP BY pr.nom ORDER BY total DESC`, p);

  // Les soucis ne sont pas bornes a la fenetre : un probleme non traite reste un
  // probleme, meme vieux d'un mois.
  const soucis = await q<Souci>(`
    SELECT v.id, v.borne_id, b.nom AS borne, v.commande_id, v.lane, pr.nom,
           v.prix_c, v.statut, v.faite_le
      FROM vente v JOIN borne b ON b.id = v.borne_id
      LEFT JOIN produit pr ON pr.id = v.produit_id
     WHERE b.compte_id = $1 AND v.statut <> 'distribue' AND v.traite_le IS NULL
       AND ($2::bigint[] IS NULL OR b.id = ANY($2))
     ORDER BY v.faite_le DESC LIMIT 40`, [u.compte_id, portee]);

  const du = soucis.filter((s) => s.statut === "litige").reduce((s, x) => s + x.prix_c, 0);
  const sommet = Math.max(1, ...jours.map((j) => j.total));
  const marge = parProduit.reduce((s, x) => s + (x.marge ?? 0), 0);

  return (
    <>
      <Entete page="ventes" borne={choisie ? String(choisie.id) : ""} fenetre={fen.cle} />
      <main className="ecran">
        <h1>Ventes</h1>
        <p className="sous">
          Ce que les bornes ont remonté. Le SaaS n’encaisse rien : l’argent est chez Nayax.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {FENETRES.map((x) => (
            <Link key={x.cle}
                  href={choisie ? `/ventes?f=${x.cle}&b=${choisie.id}` : `/ventes?f=${x.cle}`}
                  className={`bouton petit ${x.cle === fen.cle ? "primaire" : ""}`}>{x.nom}</Link>
          ))}
        </div>

        <div className="bandeau quatre">
          <div><div className="stat">
            <span className="valeur num petite">{euros(total?.total ?? 0)}</span>
            <span className="libelle">encaissé sur {fen.nom.toLowerCase()}</span></div></div>
          <div><div className="stat">
            <span className="valeur num">{total?.n ?? 0}</span>
            <span className="libelle">articles distribués</span></div></div>
          <div><div className="stat">
            <span className="valeur num petite">{euros(marge)}</span>
            <span className="libelle">marge estimée</span></div></div>
          <div><div className={`stat ${soucis.length ? "alerte" : ""}`}>
            <span className="valeur num">{soucis.length}</span>
            <span className="libelle">à regarder</span></div></div>
        </div>

        {jours.length > 0 ? (
          <>
            <h2>Jour par jour</h2>
            <div className="carte">
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 130 }}>
                {jours.map((j) => (
                  <div key={j.jour} title={`${j.jour} · ${j.n} article(s) · ${euros(j.total)}`}
                       style={{ flex: 1, display: "flex", flexDirection: "column",
                                justifyContent: "flex-end", height: "100%" }}>
                    <div style={{ height: `${Math.max(4, (j.total / sommet) * 100)}%`,
                                  background: "var(--rouge)", borderRadius: "4px 4px 0 0" }} />
                  </div>
                ))}
              </div>
              <div className="rangee faible" style={{ fontSize: 12, marginTop: 8 }}>
                <span>{jours[0].jour}</span><span className="pousse" />
                <span>{jours[jours.length - 1].jour}</span>
              </div>
            </div>
          </>
        ) : (
          <Repli icone={<IcoVentes />} titre="Aucune vente sur cette période"
                 texte="Élargissez la fenêtre, ou vérifiez que vos bornes sont en ligne et remontent bien leurs ventes."
                 secondaire={{ nom: "Voir les bornes", vers: "/bornes" }} dedans />
        )}

        {parProduit.length > 0 ? (
          <>
            <h2>Par produit</h2>
            <div className="carte plate"><div className="lignes">
              {parProduit.map((x, i) => (
                <div className="ligne" key={i}>
                  <div className="corps">
                    <div className="nom">{x.nom ?? "produit inconnu"}</div>
                    <div className="meta">{x.n} vendus · marge {euros(x.marge ?? 0)}</div>
                    <div className="repartition" style={{ marginTop: 7, height: 6, maxWidth: 240 }}>
                      <span className="bornes" style={{ width: `${Math.round((x.total / Math.max(1, total?.total ?? 1)) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="fin num" style={{ fontWeight: 700 }}>{euros(x.total)}</div>
                </div>
              ))}
            </div></div>
          </>
        ) : null}

        <h2>À regarder{du > 0 ? ` — ${euros(du)} encaissés sans contrepartie` : ""}</h2>
        <div className="carte plate">
          <div className="lignes">
            {soucis.map((s) => (
              <div className="ligne" key={s.id}>
                <div className="corps">
                  <div className="nom">{s.nom ?? "produit inconnu"}</div>
                  <div className="meta">
                    <Link href={`/bornes/${s.borne_id}`}>{s.borne}</Link>
                    {s.lane ? ` · canal ${s.lane}` : ""} · {depuis(s.faite_le)}
                  </div>
                  <div style={{ marginTop: 7 }}>
                    <span className={`pilule ${s.statut === "litige" ? "mal" : ""}`}>
                      {s.statut === "litige" ? "payé, rien n’est tombé" : "non distribué, non payé"}
                    </span>
                  </div>
                </div>
                <div className="fin">
                  <div className="num" style={{ fontWeight: 700 }}>{euros(s.prix_c)}</div>
                  {peutCharger(u) ? (
                    <form method="post" action="/api/ventes/traiter" style={{ marginTop: 8 }}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="bouton petit">Traité</button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
            {soucis.length === 0 ? (
              <Repli titre="Rien à regarder"
                     texte="Tout ce qui a été payé est tombé." dedans />
            ) : null}
          </div>
        </div>
        {soucis.length > 0 ? (
          <p className="faible" style={{ fontSize: 13.5 }}>
            « Payé, rien n’est tombé » veut dire que la cellule optique n’a rien vu passer alors que
            le client a été débité. Le remboursement se fait chez Nayax. Marquer « traité » ne change
            pas ce que la borne a remonté — on note seulement que quelqu’un s’en est occupé.
          </p>
        ) : null}
      </main>
      <NavBasse page="ventes" />
    </>
  );
}
