import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q, q1, euros, depuis, FUSEAU, entier } from "@/db";
import { peutCharger, utilisateur, type Utilisateur } from "@/lib/auth";
import { filtreRetenu } from "@/lib/filtre";
import { DEFAUT, FENETRES, NOM_PAS, pasDe, periodeDe, type Periode } from "@/lib/tableau";
import { Suspense } from "react";
import { SqBloc, Squelette } from "../squelette";
import { Repli } from "../repli";
import { IcoLoupe, IcoVentes } from "../icones";
import { AVORTEES, LIBELLES, NOMS, SQL_AVORTEE, SQL_A_REGARDER, STATUTS,
         filtresDe, sqlFiltres, type Filtres } from "@/lib/ventes";

export const dynamic = "force-dynamic";

/** L'etiquette d'un seau du graphe, selon son pas. */
const FORMAT = { hour: 'DD/MM HH24"h"', day: "DD/MM", week: '"sem. "DD/MM', month: "MM/YY" } as const;
/** Les transactions montrees ; au-dela, l'export. */
const LIGNES = 50;
/** Le nom d'un statut, dans la liste a choisir et sur la pilule d'une vente. */
const nomStatut = (s: string) => { const l = LIBELLES[s] ?? "vendue"; return l[0].toUpperCase() + l.slice(1); };

type Jour = { jour: string; n: number; total: number };
type ParProduit = { nom: string | null; n: number; total: number };
type Souci = {
  id: number; borne_id: number; borne: string; commande_id: string;
  lane: number | null; nom: string | null; prix_c: number; statut: string; faite_le: Date;
};
type Avortee = { statut: string; n: number; total: number };

export default async function Ventes(
  { searchParams }: { searchParams: Promise<{ f?: string; b?: string; du?: string; au?: string;
                                              q?: string; statut?: string; produit?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const sp = await searchParams;
  const retenu = await filtreRetenu();
  // Une periode sur mesure dans l'adresse gagne sur la fenetre retenue.
  const f = sp.f ?? (sp.du && sp.au ? undefined : retenu.f);
  const b = sp.b ?? retenu.b;
  // La meme periode que le tableau de bord et les analytiques : une fenetre
  // toute faite ou deux dates, resolues au meme endroit.
  const p = await periodeDe(f, sp.du, sp.au);
  const perso = p.cle === "perso";
  const fl = filtresDe(sp);
  /**
   * LA PORTEE VOYAGE AVEC LES PARAMETRES.
   *
   * Cette page joint `vente` a `borne` et ne filtrait que sur le compte : elle
   * montrait donc a quelqu'un invite sur une machine le chiffre de toutes les
   * autres. Le parametre de portee est nul pour un associe — tout le parc, comme
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
  const [choisie, produits] = await Promise.all([
    b ? q1<{ id: number }>(
      `SELECT id FROM borne
        WHERE id = $1 AND compte_id = $2 AND ($3::bigint[] IS NULL OR id = ANY($3))`,
      [entier(b), u.compte_id, u.bornes]) : null,
    q<{ id: number; nom: string }>(
      "SELECT id, nom FROM produit WHERE compte_id = $1 ORDER BY actif DESC, nom", [u.compte_id]),
  ]);
  const portee = choisie ? [choisie.id] : u.bornes;

  /**
   * TOUT TIENT DANS L'ADRESSE : la periode, la borne, la recherche. Un lien qui
   * change l'un garde les autres, et l'export recoit exactement ce que l'ecran
   * montre.
   */
  const lien = (chemin: string, chg: Record<string, string> = {}) => {
    const a = new URLSearchParams();
    const tout = { ...(perso ? { du: p.saisie.du, au: p.saisie.au } : { f: p.cle }),
                   b: choisie ? String(choisie.id) : "", q: fl.q ?? "", statut: fl.statut ?? "",
                   produit: fl.produit ? String(fl.produit) : "", ...chg };
    for (const [k, v] of Object.entries(tout)) if (v) a.set(k, v);
    return `${chemin}?${a}`;
  };
  const filtre = !!(fl.q || fl.statut || fl.produit);

  return (
    <>
      <Entete page="ventes" borne={choisie ? String(choisie.id) : ""} periode={p} />
      <main className="ecran">
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Ventes</h1>
            <p className="sous">
              Ce que les RedBox ont remonté{perso ? <>, <strong>{p.nom}</strong></> : null}. Le SaaS
              n’encaisse rien : l’argent est chez votre processeur de paiement.
            </p>
          </div>
          {/* Le meme segment que le tableau de bord, et le meme repli pour les
              dates precises. */}
          <div className="choix-periode">
            <nav className="periodes" aria-label="Période observée">
              {FENETRES.map((x) => (
                <Link key={x.cle} href={lien("/ventes", { f: x.cle, du: "", au: "" })}
                      aria-current={!perso && x.cle === p.cle ? "true" : undefined}>{x.nom}</Link>
              ))}
            </nav>
            <details className="periode-perso" open={perso}>
              <summary>Dates précises</summary>
              <form method="get" action="/ventes">
                <label>
                  <span>Du</span>
                  <input type="datetime-local" name="du" defaultValue={p.saisie.du} required />
                </label>
                <label>
                  <span>Au</span>
                  <input type="datetime-local" name="au" defaultValue={p.saisie.au} required />
                </label>
                {choisie ? <input type="hidden" name="b" value={String(choisie.id)} /> : null}
                {fl.q ? <input type="hidden" name="q" value={fl.q} /> : null}
                {fl.statut ? <input type="hidden" name="statut" value={fl.statut} /> : null}
                {fl.produit ? <input type="hidden" name="produit" value={String(fl.produit)} /> : null}
                <button className="bouton petit primaire">Afficher</button>
                {perso ? (
                  <Link href={lien("/ventes", { f: DEFAUT.cle, du: "", au: "" })} className="bouton petit discret">
                    Revenir aux {DEFAUT.nom}
                  </Link>
                ) : null}
              </form>
              <p className="faible">Heure de Paris, celle du bar où se trouve la machine.</p>
            </details>
          </div>
        </div>

        {/* RETROUVER UNE VENTE : son numero de commande, un statut, un produit.
            Un formulaire GET, comme la recherche du parc : l'adresse se
            partage, et l'export suit. */}
        <form method="get" action="/ventes" className="barre-outils" role="search" style={{ marginBottom: 12 }}>
          <div className="champ-recherche">
            <IcoLoupe size={17} />
            <input type="search" name="q" defaultValue={fl.q ?? ""} maxLength={64}
                   placeholder="N° de commande…" aria-label="Chercher un numéro de commande" />
          </div>
          <select name="statut" defaultValue={fl.statut ?? ""} aria-label="Statut"
                  style={{ flex: "1 1 170px", width: "auto", minWidth: 0 }}>
            <option value="">Tous les statuts</option>
            {STATUTS.map((s) => <option key={s} value={s}>{nomStatut(s)}</option>)}
          </select>
          <select name="produit" defaultValue={fl.produit ? String(fl.produit) : ""} aria-label="Produit"
                  style={{ flex: "1 1 170px", width: "auto", minWidth: 0 }}>
            <option value="">Tous les produits</option>
            {produits.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>
          {perso ? <>
            <input type="hidden" name="du" value={p.saisie.du} />
            <input type="hidden" name="au" value={p.saisie.au} />
          </> : <input type="hidden" name="f" value={p.cle} />}
          {choisie ? <input type="hidden" name="b" value={String(choisie.id)} /> : null}
          <button type="submit" className="bouton petit">Filtrer</button>
          {filtre ? (
            <Link href={lien("/ventes", { q: "", statut: "", produit: "" })} className="bouton petit discret">
              Effacer
            </Link>
          ) : null}
        </form>

        {/* L'EXPORT COMPTABLE : la periode ligne par ligne, avec les filtres
            en cours, ou les douze derniers mois en resume. Un fichier CSV pour
            Excel, pas une page. */}
        <div className="rangee-actions" style={{ marginBottom: 16 }}>
          <a href={lien("/api/ventes/export")} className="bouton petit" download>
            Exporter {filtre ? "la sélection" : "la période"} (CSV)
          </a>
          <a href={`/api/ventes/export?resume=1${choisie ? `&b=${choisie.id}` : ""}`} className="bouton petit" download>
            Résumé mensuel (CSV)
          </a>
        </div>

        <Suspense fallback={<SqueletteVentes />}>
          <Corps u={u} p={p} fl={fl} filtre={filtre} portee={portee} />
        </Suspense>
      </main>
      <NavBasse page="ventes" />
    </>
  );
}

function SqueletteVentes() {
  return (
    <Squelette>
      <SqBloc h={96} />
      <SqBloc h={190} />
      <SqBloc h={160} />
    </Squelette>
  );
}

/**
 * Tout ce qui lit la base — six lectures, lancees ENSEMBLE : a la suite, elles
 * coutaient six allers-retours vers la base, pres de deux secondes.
 */
async function Corps({ u, p, fl, filtre, portee }: {
  u: Utilisateur; p: Periode; fl: Filtres; filtre: boolean; portee: number[] | null;
}) {
  // $1 le compte, $2 et $3 la periode, $4 les bornes, $5 a $7 les filtres —
  // les memes rangs dans l'export.
  const prm = [u.compte_id, p.debut, p.fin, portee, fl.q, fl.statut, fl.produit];
  const OU = `b.compte_id = $1 AND ($4::bigint[] IS NULL OR b.id = ANY($4))
              AND v.faite_le >= $2 AND v.faite_le < $3 ${sqlFiltres(5)}`;
  // Le pas du graphe suit la duree, comme au tableau de bord : un an de barres
  // quotidiennes ne tiendrait pas dans un telephone.
  const pas = pasDe(p);
  const SEAU = (t: string) => `date_trunc('${pas}', ${t} AT TIME ZONE '${FUSEAU}')`;

  // Les soucis ne sont pas bornes a la periode : un probleme non traite reste un
  // probleme, meme vieux d'un mois.

  // Les ventes avortees, elles, se lisent sur la periode : ce n'est pas une
  // liste a vider, c'est un compteur. Un client reparti sans payer ne coute
  // rien a la caisse ; dix par soir disent que le terminal ou le lecteur
  // d'identite font fuir des clients.
  const [total, jours, parProduit, soucis, avortees, avorteesDetail, liste] = await Promise.all([
    q1<{ n: number; total: number }>(`
    SELECT COUNT(*)::int n, COALESCE(SUM(v.prix_c),0)::int total
      FROM vente v JOIN borne b ON b.id = v.borne_id
     WHERE ${OU} AND v.statut = 'distribue'`, prm),
    // Tous les seaux de la periode, vendus ou non : sans la serie, trois jours
    // de vente sur trente donnaient trois barres collees, comme une activite
    // continue.
    q<Jour>(`
    WITH serie AS (
      SELECT generate_series(${SEAU("$2::timestamptz")}, ${SEAU("$3::timestamptz")},
                             interval '1 ${pas}') AS jour)
    SELECT to_char(s.jour, '${FORMAT[pas]}') AS jour,
           COUNT(x.id)::int n, COALESCE(SUM(x.prix_c),0)::int total
      FROM serie s
      LEFT JOIN (SELECT v.id, v.prix_c, ${SEAU("v.faite_le")} AS jour
                   FROM vente v JOIN borne b ON b.id = v.borne_id
                  WHERE ${OU} AND v.statut = 'distribue') x ON x.jour = s.jour
     GROUP BY s.jour ORDER BY s.jour`, prm),
    q<ParProduit>(`
    SELECT pr.nom, COUNT(*)::int n, COALESCE(SUM(v.prix_c),0)::int total
      FROM vente v
      JOIN borne b   ON b.id = v.borne_id
      LEFT JOIN produit pr ON pr.id = v.produit_id
     WHERE ${OU} AND v.statut = 'distribue'
     GROUP BY pr.nom ORDER BY total DESC`, prm),
    q<Souci>(`
    SELECT v.id, v.borne_id, b.nom AS borne, v.commande_id, v.lane, pr.nom,
           v.prix_c, v.statut, v.faite_le
      FROM vente v JOIN borne b ON b.id = v.borne_id
      LEFT JOIN produit pr ON pr.id = v.produit_id
     WHERE b.compte_id = $1 AND ${SQL_A_REGARDER}
       AND ($2::bigint[] IS NULL OR b.id = ANY($2)) ${sqlFiltres(3)}
     ORDER BY v.faite_le DESC LIMIT 40`, [u.compte_id, portee, fl.q, fl.statut, fl.produit]),
    q<Avortee>(`
    SELECT v.statut, COUNT(*)::int n, COALESCE(SUM(v.prix_c),0)::int total
      FROM vente v JOIN borne b ON b.id = v.borne_id
     WHERE ${OU} AND ${SQL_AVORTEE}
     GROUP BY v.statut`, prm),
    q<Souci>(`
    SELECT v.id, v.borne_id, b.nom AS borne, v.commande_id, v.lane, pr.nom,
           v.prix_c, v.statut, v.faite_le
      FROM vente v JOIN borne b ON b.id = v.borne_id
      LEFT JOIN produit pr ON pr.id = v.produit_id
     WHERE ${OU} AND ${SQL_AVORTEE}
     ORDER BY v.faite_le DESC LIMIT 60`, prm),
    // LES TRANSACTIONS, toutes familles confondues : ce que la recherche
    // retrouve. Les plus recentes seulement ; l'export a le reste.
    q<Souci>(`
    SELECT v.id, v.borne_id, b.nom AS borne, v.commande_id, v.lane, pr.nom,
           v.prix_c, v.statut, v.faite_le
      FROM vente v JOIN borne b ON b.id = v.borne_id
      LEFT JOIN produit pr ON pr.id = v.produit_id
     WHERE ${OU}
     ORDER BY v.faite_le DESC, v.id DESC LIMIT ${LIGNES}`, prm),
  ]);
  const surQuoi = p.cle === "perso" ? p.nom : `sur ${p.nom.toLowerCase()}`;
  const nAvortees = avortees.reduce((s, x) => s + x.n, 0);
  // Dans l'ordre de la liste, pas dans l'ordre des chiffres : on retrouve un
  // motif a la meme ligne d'une semaine a l'autre.
  const parMotif = AVORTEES.map((st) => avortees.find((a) => a.statut === st))
                           .filter((a): a is Avortee => !!a);

  const du = soucis.filter((s) => s.statut === "litige").reduce((s, x) => s + x.prix_c, 0);
  const sommet = Math.max(1, ...jours.map((j) => j.total));
  const prixMoyen = total?.n ? Math.round(total.total / total.n) : 0;

  // UNE RECHERCHE MONTRE SON RESULTAT D'ABORD. Sans filtre, la liste vient
  // apres les chiffres : on ouvre la page pour la journee, pas pour une ligne.
  const transactions = (
    <>
      <h2 id="transactions">
        Transactions{liste.length === LIGNES ? ` — les ${LIGNES} plus récentes, l’export a le reste` : ""}
      </h2>
      <div className="carte plate">
        <div className="lignes">
          {liste.map((s) => (
            <div className="ligne" key={s.id}>
              <div className="corps">
                <div className="nom">{s.nom ?? "produit inconnu"}</div>
                <div className="meta">
                  <Link href={`/bornes/${s.borne_id}`}>{s.borne}</Link>
                  {s.lane ? ` · canal ${s.lane}` : ""} · {depuis(s.faite_le)}
                  {" · "}<Link href={`/bornes/${s.borne_id}/journal?c=${s.commande_id}`}
                               className="num" title="Le journal de la RedBox pour cette commande">{s.commande_id}</Link>
                </div>
                {s.statut !== "distribue" ? (
                  <div style={{ marginTop: 7 }}>
                    <span className={`pilule ${s.statut === "litige" ? "mal" : ""}`}>{nomStatut(s.statut)}</span>
                  </div>
                ) : null}
              </div>
              <div className="fin num" style={{ fontWeight: 700 }}>{euros(s.prix_c)}</div>
            </div>
          ))}
          {liste.length === 0 ? (
            <Repli titre="Aucune vente ne correspond"
                   texte={filtre ? "Vérifiez le numéro, ou élargissez la période et les filtres." : "Rien sur cette période."} dedans />
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <>
        <div className="bandeau quatre">
          <div><div className="stat">
            <span className="valeur num petite">{euros(total?.total ?? 0)}</span>
            <span className="libelle">encaissé {surQuoi}</span></div></div>
          <div><div className="stat">
            <span className="valeur num">{total?.n ?? 0}</span>
            <span className="libelle">articles distribués</span></div></div>
          <div><div className="stat">
            <span className="valeur num petite">{euros(prixMoyen)}</span>
            <span className="libelle">par article en moyenne</span></div></div>
          <div><div className={`stat ${soucis.length ? "alerte" : ""}`}>
            <span className="valeur num">{soucis.length}</span>
            <span className="libelle">à regarder</span></div></div>
        </div>

        {filtre ? transactions : null}

        {total && total.n > 0 ? (
          <>
            <h2>{NOM_PAS[pas]}</h2>
            <div className="carte">
              {/* Au-dela de quarante barres, un ecart de 3 px par barre ne
                  tiendrait plus dans un telephone. */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: jours.length > 40 ? 1 : 3, height: 130 }}>
                {jours.map((j) => (
                  <div key={j.jour} title={`${j.jour} · ${j.n} article(s) · ${euros(j.total)}`}
                       style={{ flex: 1, display: "flex", flexDirection: "column",
                                justifyContent: "flex-end", height: "100%" }}>
                    <div style={{ height: j.total > 0 ? `${Math.max(4, (j.total / sommet) * 100)}%` : 0,
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
                 texte="Élargissez la période ou les filtres, ou vérifiez que vos RedBox sont en ligne et remontent bien leurs ventes."
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
                    <div className="meta">{x.n} vendus</div>
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

        {filtre ? null : transactions}

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

        <h2>Ventes avortées {surQuoi}{nAvortees > 0 ? ` — ${nAvortees}` : ""}</h2>
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
    </>
  );
}
