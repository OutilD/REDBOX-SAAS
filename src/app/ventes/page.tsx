import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q, q1, euros, depuis, FUSEAU } from "@/db";
import { peutCharger, utilisateur } from "@/lib/auth";
import { Repli } from "../repli";
import { IcoBorne, IcoVentes } from "../icones";
import { AVORTEES, LIBELLES, NOMS, SQL_AVORTEE, SQL_A_REGARDER } from "@/lib/ventes";

export const dynamic = "force-dynamic";

const FENETRES = [
  { cle: "1",  nom: "Aujourd’hui", jours: 1 },
  { cle: "7",  nom: "7 jours",     jours: 7 },
  { cle: "30", nom: "30 jours",    jours: 30 },
  { cle: "90", nom: "90 jours",    jours: 90 },
];

/**
 * Le debut de la fenetre : minuit a Paris, recule d'autant de jours, ramene en
 * instant. La soustraction se fait sur l'heure murale, pas sur l'instant : une
 * fenetre de trente jours qui enjambe le changement d'heure commence quand meme
 * a minuit pile.
 */
const DEBUT = `(date_trunc('day', now() AT TIME ZONE '${FUSEAU}') - $2::interval + interval '1 day') AT TIME ZONE '${FUSEAU}'`;
/** La journee d'une vente, heure de Paris : une vente a 0 h 30 est de ce jour-la, pas de la veille. */
const JOUR = `date_trunc('day', v.faite_le AT TIME ZONE '${FUSEAU}')`;

type Jour = { jour: string; n: number; total: number };
type ParProduit = { nom: string | null; n: number; total: number; marge: number | null };
type Souci = {
  id: number; borne_id: number; borne: string; commande_id: string;
  lane: number | null; nom: string | null; prix_c: number; statut: string; faite_le: Date;
};
type Avortee = { statut: string; n: number; total: number };

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
       AND v.faite_le >= ${DEBUT}`, p);

  const jours = await q<Jour>(`
    SELECT to_char(${JOUR}, 'DD/MM') AS jour,
           COUNT(*)::int n, COALESCE(SUM(v.prix_c),0)::int total
      FROM vente v JOIN borne b ON b.id = v.borne_id
     WHERE b.compte_id = $1 AND v.statut = 'distribue' ${PORTEE}
       AND v.faite_le >= ${DEBUT}
     GROUP BY ${JOUR} ORDER BY ${JOUR}`, p);

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
       AND v.faite_le >= ${DEBUT}
     GROUP BY pr.nom ORDER BY total DESC`, p);

  // Les soucis ne sont pas bornes a la fenetre : un probleme non traite reste un
  // probleme, meme vieux d'un mois.
  const soucis = await q<Souci>(`
    SELECT v.id, v.borne_id, b.nom AS borne, v.commande_id, v.lane, pr.nom,
           v.prix_c, v.statut, v.faite_le
      FROM vente v JOIN borne b ON b.id = v.borne_id
      LEFT JOIN produit pr ON pr.id = v.produit_id
     WHERE b.compte_id = $1 AND ${SQL_A_REGARDER}
       AND ($2::bigint[] IS NULL OR b.id = ANY($2))
     ORDER BY v.faite_le DESC LIMIT 40`, [u.compte_id, portee]);

  // Les ventes avortees, elles, se lisent sur la fenetre : ce n'est pas une
  // liste a vider, c'est un compteur. Un client reparti sans payer ne coute
  // rien a la caisse ; dix par soir disent que le terminal ou le lecteur
  // d'identite font fuir des clients.
  const avortees = await q<Avortee>(`
    SELECT v.statut, COUNT(*)::int n, COALESCE(SUM(v.prix_c),0)::int total
      FROM vente v JOIN borne b ON b.id = v.borne_id
     WHERE b.compte_id = $1 AND ${SQL_AVORTEE} ${PORTEE}
       AND v.faite_le >= ${DEBUT}
     GROUP BY v.statut`, p);
  const avorteesDetail = await q<Souci>(`
    SELECT v.id, v.borne_id, b.nom AS borne, v.commande_id, v.lane, pr.nom,
           v.prix_c, v.statut, v.faite_le
      FROM vente v JOIN borne b ON b.id = v.borne_id
      LEFT JOIN produit pr ON pr.id = v.produit_id
     WHERE b.compte_id = $1 AND ${SQL_AVORTEE} ${PORTEE}
       AND v.faite_le >= ${DEBUT}
     ORDER BY v.faite_le DESC LIMIT 60`, p);
  const nAvortees = avortees.reduce((s, x) => s + x.n, 0);
  // Dans l'ordre de la liste, pas dans l'ordre des chiffres : on retrouve un
  // motif a la meme ligne d'une semaine a l'autre.
  const parMotif = AVORTEES.map((st) => avortees.find((a) => a.statut === st))
                           .filter((a): a is Avortee => !!a);

  const du = soucis.filter((s) => s.statut === "litige").reduce((s, x) => s + x.prix_c, 0);
  const sommet = Math.max(1, ...jours.map((j) => j.total));
  const marge = parProduit.reduce((s, x) => s + (x.marge ?? 0), 0);

  return (
    <>
      <Entete page="ventes" borne={choisie ? String(choisie.id) : ""} fenetre={fen.cle} />
      <main className="ecran">
        <h1>Ventes</h1>
        <p className="sous">
          Ce que les RedBox ont remonté. Le SaaS n’encaisse rien : l’argent est chez votre processeur de paiement.
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
                 texte="Élargissez la fenêtre, ou vérifiez que vos RedBox sont en ligne et remontent bien leurs ventes."
                 secondaire={{ nom: "Voir les RedBox", vers: "/bornes" }} dedans />
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
                    {" · "}<Link href={`/bornes/${s.borne_id}/journal?c=${s.commande_id}`}
                                 className="num" title="Le journal de la RedBox pour cette commande">{s.commande_id}</Link>
                  </div>
                  <div style={{ marginTop: 7 }}>
                    <span className={`pilule ${s.statut === "litige" ? "mal" : ""}`}>
                      {LIBELLES[s.statut] ?? s.statut}
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
            Dans les trois cas le client a été débité par le terminal. « Chute non détectée » : la
            spirale a tourné et la cellule optique n’a rien vu passer. « La spirale n’a pas tourné » :
            la carte à ressorts n’a pas répondu, ou plus aucun canal n’avait le produit. Dans ces deux
            cas la RedBox a demandé le remboursement au terminal ; « argent conservé » veut dire qu’elle
            ne l’a pas fait. Le remboursement se vérifie chez votre processeur de paiement. Marquer « traité » ne change pas
            ce que la RedBox a remonté — on note seulement que quelqu’un s’en est occupé.
          </p>
        ) : null}

        <h2>Ventes avortées sur {fen.nom.toLowerCase()}{nAvortees > 0 ? ` — ${nAvortees}` : ""}</h2>
        <div className="carte plate">
          <div className="lignes">
            {parMotif.map((a) => (
              <div className="ligne" key={a.statut}>
                <div className="corps">
                  <div className="nom">{NOMS[a.statut] ?? a.statut}</div>
                  <div className="meta">{a.n} {a.n > 1 ? "articles" : "article"} · {euros(a.total)} non encaissés</div>
                </div>
                <div className="fin num" style={{ fontWeight: 700 }}>{a.n}</div>
              </div>
            ))}
            {parMotif.length === 0 ? (
              <Repli titre="Aucune vente avortée"
                     texte="Personne n’est reparti sans payer sur cette période." dedans />
            ) : null}
          </div>
        </div>
        {avorteesDetail.length > 0 ? (
          <details className="carte plate" style={{ marginTop: 8 }}>
            <summary className="faible" style={{ cursor: "pointer", padding: "10px 14px" }}>
              Voir le détail ({avorteesDetail.length})
            </summary>
            <div className="lignes">
              {avorteesDetail.map((s) => (
                <div className="ligne" key={s.id}>
                  <div className="corps">
                    <div className="nom">{s.nom ?? "produit inconnu"}</div>
                    <div className="meta">
                      <Link href={`/bornes/${s.borne_id}`}>{s.borne}</Link>
                      {" · "}{depuis(s.faite_le)}{" · "}
                      <Link href={`/bornes/${s.borne_id}/journal?c=${s.commande_id}`}
                            className="num" title="Le journal de la RedBox pour cette commande">{s.commande_id}</Link>
                    </div>
                    <div style={{ marginTop: 7 }}>
                      <span className="pilule">{LIBELLES[s.statut] ?? s.statut}</span>
                    </div>
                  </div>
                  <div className="fin num">{euros(s.prix_c)}</div>
                </div>
              ))}
            </div>
          </details>
        ) : null}
        <p className="faible" style={{ fontSize: 13.5 }}>
          Une vente avortée ne coûte rien à la caisse : le client n’a pas été débité. « Âge non
          vérifié » : l’article a été retiré du panier avant le paiement. « Aucune carte présentée » :
          le client est parti ou a annulé. « Carte refusée » : le terminal a dit non. « Interrompue
          avant la spirale » : une RedBox d’avant la 5.13, qui ne précisait pas le motif.
        </p>
      </main>
      <NavBasse page="ventes" />
    </>
  );
}
