import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { IcoBorne, IcoFleche, IcoVentes } from "../../../icones";
import { Delta, SerieTemps } from "../../../analyses";
import { Repli } from "../../../repli";
import { Portrait } from "../../../communaute/vignette-personne";
import { q, q1, depuis, enLigne, euros, leJour, FUSEAU } from "@/db";
import { estSuperAdmin, nomDuRole, utilisateur } from "@/lib/auth";
import { apprenants, genreDe, NOM_GENRE, temperature } from "@/lib/academie-suivi";
import { dansLeCadre } from "@/lib/geo";
import { DOMAINE } from "@/lib/invente";
import { STATUTS, nomDuStatut, type Statut } from "@/lib/parc";
import { nomAffiche } from "@/lib/personnes";
import type { Point as PointSerie } from "@/lib/tableau";
import { SQL_CHIFFRES, etatDe, grouper, lignesChiffres, type Chiffres, type Point } from "../../../carte/carte-france";
import { CarteMaps } from "../../../carte/carte-maps";
import { NOM_ETAT } from "@/lib/etats-carte";
import { pointsProspects } from "../../prospects";
import { Etincelle, Tuile } from "../../tuiles";

export const dynamic = "force-dynamic";

type Compte = { id: number; nom: string; cree_le: Date; demo: boolean; vitrine: boolean; editeur: boolean };
type Machine = {
  id: number; numero: string | null; nom: string; adresse: string | null; ville: string | null;
  statut: Statut; statut_le: Date; jeton: string | null; vue_le: Date | null; hors_service: boolean;
  latitude: number | null; longitude: number | null;
} & Chiffres;
type Argent = { ca: number; ca_avant: number; ventes: number; ventes_avant: number; premiere: Date | null };
type Produit = { nom: string; n: number; ca: number };
type Vente = { id: number; faite_le: Date; prix_c: number; produit: string | null; machine: string; statut: string };
type Membre = {
  id: number; email: string; pseudo: string | null; nom: string | null; image_id: number | null; couleur: string | null;
  role: string; super_admin: boolean; cree_le: Date; badges: number;
};

const s = (n: number, mot = "s") => (n > 1 ? mot : "");
const JOURS = 30;

/**
 * UN COMPTE, EN ENTIER, pour le super-admin : ce qu'il rapporte, ses machines
 * de l'usine au bar et leur sante, ou elles sont, ce qui s'y vend, et les
 * personnes du compte avec leur avancee a l'academie. Une vue de la
 * plateforme : on ne rentre pas dans sa console, on ne change rien d'ici —
 * les gestes restent sur le parc et la liste des comptes.
 */
export default async function FicheCompte({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!estSuperAdmin(u)) redirect("/");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  // Le mot de passe temporaire tout juste tire (api/admin/mot-de-passe) : lu ici
  // une fois, le biscuit s'efface seul en deux minutes.
  const [pourQui, temporaire] = ((await cookies()).get("rb_mdp_temp")?.value ?? "").split(".");

  const [compte, machines, argent, serie, produits, ventes, membres, formation] = await Promise.all([
    q1<Compte>("SELECT id, nom, cree_le, demo, vitrine, editeur FROM compte WHERE id = $1", [id]),
    q<Machine>(`
      SELECT b.id, b.numero, b.nom, b.adresse, b.ville, b.statut, b.statut_le, b.jeton, b.vue_le, b.hors_service,
             b.latitude, b.longitude, v.ventes_30, v.ca_30, v.ca_total, v.derniere_vente
        FROM borne b LEFT JOIN LATERAL (${SQL_CHIFFRES}) v ON true
       WHERE b.compte_id = $1 ORDER BY b.nom`, [id]),
    q1<Argent>(`
      SELECT COALESCE(SUM(v.prix_c) FILTER (WHERE v.faite_le >= now() - make_interval(days => $2::int)), 0)::int AS ca,
             COALESCE(SUM(v.prix_c) FILTER (WHERE v.faite_le <  now() - make_interval(days => $2::int)
                                              AND v.faite_le >= now() - make_interval(days => $2::int * 2)), 0)::int AS ca_avant,
             COUNT(*) FILTER (WHERE v.faite_le >= now() - make_interval(days => $2::int))::int AS ventes,
             COUNT(*) FILTER (WHERE v.faite_le <  now() - make_interval(days => $2::int)
                                AND v.faite_le >= now() - make_interval(days => $2::int * 2))::int AS ventes_avant,
             MIN(v.faite_le) AS premiere
        FROM vente v JOIN borne b ON b.id = v.borne_id
       WHERE v.statut = 'distribue' AND b.compte_id = $1`, [id, JOURS]),
    q<PointSerie>(`
      WITH serie AS (
        SELECT generate_series(date_trunc('day', now() AT TIME ZONE '${FUSEAU}') - make_interval(days => $2::int - 1),
                               date_trunc('day', now() AT TIME ZONE '${FUSEAU}'), interval '1 day') AS seau)
      SELECT to_char(s.seau, 'YYYY-MM-DD') AS cle, to_char(s.seau, 'DD/MM') AS etiquette,
             EXTRACT(ISODOW FROM s.seau) >= 6 AS weekend,
             COUNT(x.prix_c)::int AS n, COALESCE(SUM(x.prix_c), 0)::int AS ca
        FROM serie s
        LEFT JOIN (SELECT v.prix_c, date_trunc('day', v.faite_le AT TIME ZONE '${FUSEAU}') AS jour
                     FROM vente v JOIN borne b ON b.id = v.borne_id
                    WHERE v.statut = 'distribue' AND b.compte_id = $1
                      AND v.faite_le >= now() - make_interval(days => $2::int + 1)) x ON x.jour = s.seau
       GROUP BY s.seau ORDER BY s.seau`, [id, JOURS]),
    q<Produit>(`
      SELECT COALESCE(p.nom, 'Produit inconnu') AS nom, COUNT(*)::int AS n, COALESCE(SUM(v.prix_c), 0)::int AS ca
        FROM vente v JOIN borne b ON b.id = v.borne_id LEFT JOIN produit p ON p.id = v.produit_id
       WHERE v.statut = 'distribue' AND b.compte_id = $1 AND v.faite_le >= now() - make_interval(days => $2::int)
       GROUP BY p.nom ORDER BY ca DESC, n DESC LIMIT 6`, [id, JOURS]),
    q<Vente>(`
      SELECT v.id, v.faite_le, v.prix_c, p.nom AS produit, b.nom AS machine, v.statut
        FROM vente v JOIN borne b ON b.id = v.borne_id LEFT JOIN produit p ON p.id = v.produit_id
       WHERE b.compte_id = $1 ORDER BY v.faite_le DESC LIMIT 8`, [id]),
    q<Membre>(`
      SELECT u.id, u.email, u.pseudo, u.nom, u.image_id, u.couleur, m.role, u.super_admin, u.cree_le,
             (SELECT COUNT(*)::int FROM badge_obtenu o WHERE o.utilisateur_id = u.id) AS badges
        FROM membre m JOIN utilisateur u ON u.id = m.utilisateur_id
       WHERE m.compte_id = $1 AND u.email NOT LIKE '%@' || $2
       ORDER BY (m.role = 'proprietaire') DESC, u.cree_le`, [id, DOMAINE]),
    apprenants(id),
  ]);
  if (!compte) notFound();

  const a: Argent = argent ?? { ca: 0, ca_avant: 0, ventes: 0, ventes_avant: 0, premiere: null };
  const installees = machines.filter((b) => b.statut === "installee" && b.jeton !== null);
  const hs = installees.filter((b) => b.hors_service);
  const silencieuses = installees.filter((b) => !b.hors_service && !enLigne(b.vue_le));
  const enService = installees.length - hs.length - silencieuses.length;
  const aVenir = machines.filter((b) => b.statut === "production" || b.statut === "commandee" || b.statut === "bientot");
  const caTotal = machines.reduce((t, b) => t + b.ca_total, 0);
  const panier = a.ventes > 0 ? Math.round(a.ca / a.ventes) : 0;
  const redboxer = machines.some((b) => !b.jeton || !b.jeton.startsWith("demo_"));
  const parPersonne = new Map(formation.map((x) => [x.id, x]));
  const formes = formation.filter((x) => x.ouvertes > 0);
  const progression = formes.length > 0
    ? Math.round(formes.reduce((t, x) => t + Math.min(1, x.finies / x.ouvertes), 0) * 100 / formes.length) : 0;
  const ventesSerie = serie.reduce((t, x) => t + x.n, 0);
  const sommetProduit = Math.max(1, ...produits.map((p) => p.ca));

  const points: Point[] = machines
    .filter((b) => b.latitude !== null && b.longitude !== null && dansLeCadre(b.latitude, b.longitude))
    .map((b) => ({
      cle: b.id, href: `/admin/parc#m${b.id}`, nom: b.nom, etat: etatDe(b),
      ville: b.ville, adresse: b.adresse, sous: compte.nom,
      latitude: b.latitude!, longitude: b.longitude!, situer: `/carte/situer/${b.id}?r=admin`,
      stade: b.statut, ca30: b.jeton || b.ca_total > 0 ? b.ca_30 : undefined,
      details: [["Changé de stade", depuis(b.statut_le)], ...lignesChiffres(b)] as [string, string][],
    }));
  const groupes = grouper(points);
  const gens = pointsProspects(formation);

  return (
    <>
      <Entete page="admin_comptes" />
      <main className="ecran adm">
        <nav className="fil-retour"><Link href="/admin/comptes">← Tous les comptes</Link></nav>
        <div className="tete-tableau">
          <div className="quoi">
            <h1>
              {compte.nom}
              <span className="fiche-etiquettes">
                {compte.editeur ? <span className="pilule"><i />éditeur</span> : null}
                {compte.demo ? <span className="pilule"><i />démo</span> : null}
                {compte.vitrine ? <span className="pilule"><i />vitrine</span> : null}
                {!compte.editeur && !compte.demo && !compte.vitrine
                  ? <span className="pilule" data-temp={redboxer ? undefined : "tiede"} data-etat={redboxer ? "ok" : undefined}>
                      <i />{redboxer ? "redboxer" : "prospect"}
                    </span> : null}
              </span>
            </h1>
            <p className="sous">
              Compte créé le {leJour(compte.cree_le)} · {membres.length} personne{s(membres.length)} · {machines.length} machine{s(machines.length)}
              {a.premiere ? ` · première vente le ${leJour(a.premiere)}` : ""}
            </p>
          </div>
          <div className="rangee-actions">
            <Link href={`/admin/comptes#c${compte.id}`} className="bouton petit">Accès et badges</Link>
            <Link href="/admin/parc#col-libre" className="bouton primaire petit">Attribuer une RedBox</Link>
          </div>
        </div>

        <section className="adm-tuiles" aria-label="Le compte en chiffres">
          <Tuile titre="CA 30 jours" valeur={euros(a.ca)} delta={<Delta ici={a.ca} avant={a.ca_avant} />} accent
                 dessous={a.ca_avant > 0 ? `contre ${euros(a.ca_avant)} les 30 jours d’avant` : "rien les 30 jours d’avant"}>
            <Etincelle valeurs={serie.map((x) => x.ca)} />
          </Tuile>
          <Tuile titre="Ventes 30 jours" valeur={String(a.ventes)} delta={<Delta ici={a.ventes} avant={a.ventes_avant} />}
                 dessous={panier > 0 ? `panier moyen ${euros(panier)}` : "aucune vente"} />
          <Tuile titre="CA depuis le début" valeur={euros(caTotal)}
                 dessous={a.premiere ? `depuis le ${leJour(a.premiere)}` : "aucune vente encore"} />
          <Tuile titre="RedBox installées" valeur={String(installees.length)}
                 ton={silencieuses.length > 0 ? "mal" : hs.length > 0 ? "attention" : undefined}
                 dessous={`${enService} en ligne · ${silencieuses.length} silencieuse${s(silencieuses.length)} · ${hs.length} HS`}>
            {installees.length > 0 ? (
              <span className="adm-sante" role="img" aria-label={`${enService} en ligne, ${silencieuses.length} silencieuses, ${hs.length} hors service`}>
                <i data-etat="ok" style={{ flexGrow: enService }} />
                <i data-etat="mal" style={{ flexGrow: silencieuses.length }} />
                <i data-etat="hs" style={{ flexGrow: hs.length }} />
              </span>
            ) : null}
          </Tuile>
          <Tuile titre="À venir" valeur={String(aVenir.length)}
                 dessous={aVenir.length > 0 ? aVenir.map((b) => nomDuStatut(b.statut)).join(" · ") : "rien en commande"} />
          <Tuile titre="Académie" valeur={formes.length > 0 ? `${progression} %` : "—"}
                 dessous={formes.length > 0 ? `avancée moyenne de ${formes.length} personne${s(formes.length)}` : "personne n’a commencé"} />
        </section>

        <div className="adm-deux large-gauche">
          <section className="adm-bloc">
            <header>
              <h2>Chiffre d’affaires jour par jour</h2>
              <span className="faible num">{ventesSerie} vente{s(ventesSerie)} · 30 jours</span>
            </header>
            {ventesSerie === 0
              ? <Repli icone={<IcoVentes />} titre="Aucune vente sur 30 jours" dedans />
              : <SerieTemps points={serie} pas="day" />}
          </section>

          <section className="adm-bloc">
            <header><h2>Ce qui se vend</h2><span className="faible">30 jours</span></header>
            {produits.length === 0 ? <p className="adm-vide">Aucune vente sur 30 jours.</p> : (
              <ol className="adm-rang">
                {produits.map((p, i) => (
                  <li key={p.nom}>
                    <span className="rang num">{i + 1}</span>
                    <span className="dit">
                      <span className="haut"><span className="nom">{p.nom}</span><b className="num">{euros(p.ca)}</b></span>
                      <span className="piste" aria-hidden="true"><span style={{ width: `${(p.ca / sommetProduit) * 100}%` }} /></span>
                      <span className="bas">{p.n} vente{s(p.n)} · {Math.round((p.ca * 100) / Math.max(1, a.ca))} % du CA</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className="adm-bloc" style={{ marginTop: 22 }}>
          <header>
            <h2>Ses machines</h2>
            <Link href="/admin/parc" className="lien">Ouvrir le parc <IcoFleche size={12} /></Link>
          </header>
          {machines.length === 0 ? (
            <Repli icone={<IcoBorne />} titre="Aucune machine sur ce compte" dedans />
          ) : (
            <div className="tableau-enveloppe">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Machine</th><th>Stade</th><th>Santé</th><th>Ville</th>
                    <th className="num">Ventes 30 j</th><th className="num">CA 30 j</th><th className="num">CA total</th>
                    <th>Dernière vente</th><th>Vue</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((b) => {
                    const etat = b.statut === "installee" && b.jeton ? etatDe(b) : null;
                    return (
                      <tr key={b.id}>
                        <th><Link href={`/admin/parc#m${b.id}`}>{b.nom}</Link>{b.numero ? <span className="faible"> · {b.numero}</span> : null}</th>
                        <td><span className="pilule stade" data-stade={b.statut}><i />{STATUTS.find((x) => x.cle === b.statut)?.nom ?? b.statut}</span></td>
                        <td>{etat ? <span className="pilule" data-etat={etat}><i />{NOM_ETAT[etat]}</span> : <span className="faible">—</span>}</td>
                        <td>{b.ville ?? <span className="faible">—</span>}</td>
                        <td className="num">{b.ventes_30}</td>
                        <td className="num">{euros(b.ca_30)}</td>
                        <td className="num">{euros(b.ca_total)}</td>
                        <td>{b.derniere_vente ? depuis(b.derniere_vente) : "jamais"}</td>
                        <td>{b.jeton ? depuis(b.vue_le) : "pas appairée"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {points.length + gens.length > 0 ? (
          <>
            <div className="titre-section" style={{ marginTop: 22 }}>
              <h2>Sur la carte</h2>
              <span className="faible" style={{ fontSize: 12.5 }}>ses machines, et ses membres encore prospects</span>
            </div>
            <section className="carte-france"><CarteMaps groupes={groupes} lectures personnes={gens} /></section>
          </>
        ) : null}

        <div className="adm-deux">
          <section className="adm-bloc">
            <header><h2>Les personnes</h2><span className="faible num">{membres.length}</span></header>
            {membres.length === 0 ? <p className="adm-vide">Personne sur ce compte.</p> : (
              <ul className="aca-prospects">
                {membres.map((m) => {
                  const f = parPersonne.get(Number(m.id));
                  const nom = nomAffiche(m);
                  return (
                    <li key={m.id}>
                      <Portrait image_id={m.image_id} pseudo={nom} couleur={m.couleur} taille={38} />
                      <span className="dit">
                        <span className="haut">
                          <Link href={`/communaute/${m.id}`} className="nom">{nom}</Link>
                          {m.super_admin ? <span className="pilule ok"><i />super-admin</span> : null}
                          {f && !f.redboxer ? (
                            <span className="pilule" data-temp={temperature(f) === "chaud" ? "chaud" : genreDe(f) === "futur" ? "tiede" : "froid"}>
                              <i />{temperature(f) === "chaud" ? "chaud" : NOM_GENRE[genreDe(f)]}
                            </span>
                          ) : null}
                        </span>
                        {f && f.ouvertes > 0 ? (
                          <span className="piste" aria-hidden="true"><span style={{ width: `${Math.min(100, (f.finies * 100) / f.ouvertes)}%` }} /></span>
                        ) : null}
                        <span className="bas">
                          {nomDuRole(m.role)} · depuis {leJour(m.cree_le)}
                          {f ? ` · académie ${f.finies}/${f.ouvertes}${f.derniere ? `, vu ${depuis(f.derniere)}` : ""}` : ""}
                          {` · ${m.badges} badge${s(m.badges)}`}
                          {f?.ville ? ` · ${f.ville}` : ""}
                        </span>
                      </span>
                      <span className="gestes">
                        <Link href={`/admin/comptes/badges/${m.id}`} className="bouton petit">Badges</Link>
                        {m.id !== u.id ? (
                          <form method="post" action="/api/admin/mot-de-passe">
                            <input type="hidden" name="utilisateur_id" value={m.id} />
                            <input type="hidden" name="compte_id" value={id} />
                            <button className="bouton petit" title="Remplace son mot de passe par un mot de passe temporaire, à lui transmettre">
                              Nouveau mot de passe</button>
                          </form>
                        ) : null}
                      </span>
                      {temporaire && Number(pourQui) === Number(m.id) ? (
                        <p className="adm-mdp">Mot de passe temporaire : <b className="num">{temporaire}</b>.
                          Transmettez-le à {nom} : il ne s’affichera plus. À changer dans son profil.</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="adm-bloc">
            <header><h2>Dernières ventes</h2></header>
            {ventes.length === 0 ? <p className="adm-vide">Aucune vente.</p> : (
              <ol className="adm-fil">
                {ventes.map((v) => (
                  <li key={v.id} data-genre="vente">
                    <span className="icone" aria-hidden="true"><IcoVentes size={14} /></span>
                    <span className="dit">
                      <b>{v.produit ?? "Produit"}</b> · {euros(v.prix_c)}
                      <span className="faible"> · {v.machine}{v.statut !== "distribue" ? ` · ${v.statut.replace("_", " ")}` : ""}</span>
                    </span>
                    <time className="faible num" dateTime={new Date(v.faite_le).toISOString()}>{depuis(v.faite_le)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </main>
      <NavBasse page="admin_comptes" />
    </>
  );
}
