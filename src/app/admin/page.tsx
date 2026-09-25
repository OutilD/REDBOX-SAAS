import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { IcoAlerte, IcoBorne, IcoEquipe, IcoFleche, IcoVentes } from "../icones";
import { Delta, SerieTemps } from "../analyses";
import { Repli } from "../repli";
import { q, q1, depuis, enLigne, euros, FUSEAU } from "@/db";
import { estSuperAdmin, utilisateur } from "@/lib/auth";
import { PREFIXE_JETON } from "@/lib/demo";
import { dansLeCadre, situerLesBornes } from "@/lib/geo";
import { SQL_VRAIE, STATUTS, compteurs, nomDuStatut, type Statut } from "@/lib/parc";
import type { Point as PointSerie } from "@/lib/tableau";
import {
  Legende, SQL_CHIFFRES, etatDe, grouper, lignesChiffres, type Chiffres, type Point,
} from "../carte/carte-france";
import { CarteMaps } from "../carte/carte-maps";

export const dynamic = "force-dynamic";

type Ligne = {
  id: number; numero: string | null; nom: string; adresse: string | null; ville: string | null;
  statut: Statut; statut_le: Date; note_editeur: string | null;
  jeton: string | null; vue_le: Date | null; hors_service: boolean;
  latitude: number | null; longitude: number | null; situee_pour: string | null;
  compte_id: number | null; compte: string | null;
} & Chiffres;

/** Ce que rapportent les vraies machines : la fenetre choisie, et la meme juste avant. */
type Argent = { ca: number; ca_avant: number; ventes: number; ventes_avant: number };
type Gens = { comptes: number; redboxers: number; nouveaux: number };
type Classee = { id: number; nom: string; compte: string | null; ville: string | null; n: number; ca: number; derniere: Date | null };
type CompteClasse = { id: number; nom: string; n: number; ca: number; machines: number };
type Evenement = { genre: "stade" | "compte"; quand: Date; id: number; nom: string; detail: string | null; compte: string | null };

/** Les fenetres qu'on compare. Trente jours par defaut : un mois de bar. */
const FENETRES = [
  { cle: "7", jours: 7, nom: "7 jours" },
  { cle: "30", jours: 30, nom: "30 jours" },
  { cle: "90", jours: 90, nom: "90 jours" },
] as const;

const s = (n: number, mot = "s") => (n > 1 ? mot : "");

/**
 * LE TABLEAU DE BORD DE LA PLATEFORME.
 *
 * Le pendant, pour l'editeur, du tableau de bord d'un client, en plus dense :
 * en tete six chiffres qui se lisent d'un coup d'oeil — l'argent et sa pente,
 * le parc et sa sante, les comptes —, puis le chiffre jour par jour a cote du
 * parc de l'usine au bar, ce qui demande une main, la carte, et les classements
 * de la fenetre choisie (7, 30 ou 90 jours).
 *
 * LE PARC SE REGLE AILLEURS. Attribuer une machine a un compte, changer son
 * stade, la placer sur la carte : trois gestes reserves au super-admin
 * (`/admin/parc`, `/carte/situer`). Un client voit sa carte, il ne la modifie pas.
 *
 * Les bornes de la demo n'en font pas partie : elles sont inventees.
 */
export default async function TableauPlateforme({ searchParams }:
  { searchParams: Promise<{ ok?: string; p?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!estSuperAdmin(u)) redirect("/");
  const { ok, p } = await searchParams;
  const fenetre = FENETRES.find((f) => f.cle === p) ?? FENETRES[1];
  const N = fenetre.jours;

  // Celles qui n'ont encore aucune place en recoivent une d'apres leur adresse,
  // par petit lot ; si le geocodeur ne repond pas, la page s'ouvre quand meme.
  await situerLesBornes(null).catch(() => {});

  const [nombres, lignes, argent, gens, serie, classees, comptesClasses, activite] = await Promise.all([
    compteurs(),
    q<Ligne>(`
      SELECT b.id, b.numero, b.nom, b.adresse, b.ville, b.statut, b.statut_le, b.note_editeur,
             b.jeton, b.vue_le, b.hors_service, b.latitude, b.longitude, b.situee_pour,
             b.compte_id, c.nom AS compte,
             v.ventes_30, v.ca_30, v.ca_total, v.derniere_vente
        FROM borne b LEFT JOIN compte c ON c.id = b.compte_id
        LEFT JOIN LATERAL (${SQL_CHIFFRES}) v ON true
       WHERE ${SQL_VRAIE}
       ORDER BY b.nom`),
    q1<Argent>(`
      SELECT COALESCE(SUM(v.prix_c) FILTER (WHERE v.faite_le >= now() - make_interval(days => $1::int)), 0)::int AS ca,
             COALESCE(SUM(v.prix_c) FILTER (WHERE v.faite_le <  now() - make_interval(days => $1::int)), 0)::int AS ca_avant,
             COUNT(*) FILTER (WHERE v.faite_le >= now() - make_interval(days => $1::int))::int AS ventes,
             COUNT(*) FILTER (WHERE v.faite_le <  now() - make_interval(days => $1::int))::int AS ventes_avant
        FROM vente v JOIN borne b ON b.id = v.borne_id
       WHERE v.statut = 'distribue' AND v.faite_le >= now() - make_interval(days => $1::int * 2) AND ${SQL_VRAIE}`, [N]),
    q1<Gens>(`
      SELECT COUNT(*)::int AS comptes,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM borne b WHERE b.compte_id = c.id
                                              AND b.jeton IS NOT NULL
                                              AND b.jeton NOT LIKE '${PREFIXE_JETON}%'))::int AS redboxers,
             COUNT(*) FILTER (WHERE c.cree_le >= now() - make_interval(days => $1::int))::int AS nouveaux
        FROM compte c WHERE NOT c.demo AND NOT c.vitrine`, [N]),
    // Jour par jour, heure de Paris ; un jour sans vente garde sa colonne.
    q<PointSerie>(`
      WITH serie AS (
        SELECT generate_series(date_trunc('day', now() AT TIME ZONE '${FUSEAU}') - make_interval(days => $1::int - 1),
                               date_trunc('day', now() AT TIME ZONE '${FUSEAU}'), interval '1 day') AS seau)
      SELECT to_char(s.seau, 'YYYY-MM-DD') AS cle, to_char(s.seau, 'DD/MM') AS etiquette,
             EXTRACT(ISODOW FROM s.seau) >= 6 AS weekend,
             COUNT(x.prix_c)::int AS n, COALESCE(SUM(x.prix_c), 0)::int AS ca
        FROM serie s
        LEFT JOIN (SELECT v.prix_c, date_trunc('day', v.faite_le AT TIME ZONE '${FUSEAU}') AS jour
                     FROM vente v JOIN borne b ON b.id = v.borne_id
                    WHERE v.statut = 'distribue' AND v.faite_le >= now() - make_interval(days => $1::int + 1)
                      AND ${SQL_VRAIE}) x ON x.jour = s.seau
       GROUP BY s.seau ORDER BY s.seau`, [N]),
    q<Classee>(`
      SELECT b.id, b.nom, c.nom AS compte, b.ville, COUNT(*)::int AS n,
             COALESCE(SUM(v.prix_c), 0)::int AS ca, MAX(v.faite_le) AS derniere
        FROM vente v JOIN borne b ON b.id = v.borne_id LEFT JOIN compte c ON c.id = b.compte_id
       WHERE v.statut = 'distribue' AND v.faite_le >= now() - make_interval(days => $1::int) AND ${SQL_VRAIE}
       GROUP BY b.id, c.nom ORDER BY ca DESC, n DESC LIMIT 8`, [N]),
    q<CompteClasse>(`
      SELECT c.id, c.nom, COUNT(*)::int AS n, COALESCE(SUM(v.prix_c), 0)::int AS ca,
             COUNT(DISTINCT b.id)::int AS machines
        FROM vente v JOIN borne b ON b.id = v.borne_id JOIN compte c ON c.id = b.compte_id
       WHERE v.statut = 'distribue' AND v.faite_le >= now() - make_interval(days => $1::int) AND ${SQL_VRAIE}
       GROUP BY c.id ORDER BY ca DESC, n DESC LIMIT 8`, [N]),
    q<Evenement>(`
      SELECT * FROM (
        (SELECT 'stade'::text AS genre, b.statut_le AS quand, b.id, b.nom, b.statut::text AS detail, c.nom AS compte
           FROM borne b LEFT JOIN compte c ON c.id = b.compte_id
          WHERE ${SQL_VRAIE} ORDER BY b.statut_le DESC LIMIT 8)
        UNION ALL
        (SELECT 'compte'::text, c.cree_le, c.id, c.nom, NULL::text, NULL::text
           FROM compte c WHERE NOT c.demo AND NOT c.vitrine ORDER BY c.cree_le DESC LIMIT 8)
      ) a ORDER BY quand DESC LIMIT 10`),
  ]);
  const a: Argent = argent ?? { ca: 0, ca_avant: 0, ventes: 0, ventes_avant: 0 };
  const g: Gens = gens ?? { comptes: 0, redboxers: 0, nouveaux: 0 };

  // ---------------------------------------------------------------- le parc
  const installees = lignes.filter((b) => b.statut === "installee" && b.jeton !== null);
  const hs = installees.filter((b) => b.hors_service);
  const silencieuses = installees.filter((b) => !b.hors_service && !enLigne(b.vue_le));
  const enService = installees.length - hs.length - silencieuses.length;
  const aVenir = nombres.production + nombres.commandee + nombres.bientot;
  const total = Object.values(nombres).reduce((t, n) => t + n, 0);
  const panier = a.ventes > 0 ? Math.round(a.ca / a.ventes) : 0;
  const panierAvant = a.ventes_avant > 0 ? Math.round(a.ca_avant / a.ventes_avant) : 0;

  const situee = (b: Ligne) =>
    b.latitude !== null && b.longitude !== null && dansLeCadre(b.latitude, b.longitude);
  // Posees, promises ou commandees : leur client les attend sur sa carte.
  const aPlacer = lignes.filter((b) =>
    (b.statut === "installee" || b.statut === "bientot" || b.statut === "commandee") && !situee(b));
  // Placees pour une adresse qui n'est plus la leur : le client l'a changee sur
  // sa fiche. La machine n'a pas bouge — c'est voulu —, mais il faut regarder.
  const deplacees = lignes.filter((b) =>
    situee(b) && (b.adresse ?? "").trim() !== "" && b.situee_pour !== b.adresse);

  const points: Point[] = lignes.filter(situee).map((b) => {
    const details: [string, string][] = [["Compte", b.compte ?? "sans compte"]];
    if (b.numero) details.push(["N° de série", b.numero]);
    details.push(["Changé de stade", depuis(b.statut_le)], ...lignesChiffres(b));
    if (b.jeton) details.push(["Vue", depuis(b.vue_le)]);
    if (b.note_editeur) details.push(["Note", b.note_editeur]);
    return {
      cle: b.id, href: `/admin/parc#m${b.id}`, nom: b.nom, etat: etatDe(b),
      ville: b.ville, adresse: b.adresse, sous: b.compte ?? "sans compte",
      latitude: b.latitude!, longitude: b.longitude!,
      situer: `/carte/situer/${b.id}?r=admin`,
      stade: b.statut, ca30: b.jeton || b.ca_total > 0 ? b.ca_30 : undefined,
      details,
    };
  });
  const groupes = grouper(points);
  const aSurveiller = [...silencieuses, ...hs];

  /**
   * CE QUI DEMANDE UNE MAIN, du plus grave au plus doux. La bande n'apparait
   * que s'il y a quelque chose dedans, comme sur le tableau de bord d'un client.
   */
  const aFaire = [
    silencieuses.length > 0 && {
      cle: "silence", niveau: "grave" as const, n: silencieuses.length,
      quoi: `RedBox installée${s(silencieuses.length)} sans signe de vie`,
      pourquoi: "plus de quinze minutes sans nouvelles : ses ventes ne remontent plus",
      vers: "#surveiller", faire: "Voir",
    },
    hs.length > 0 && {
      cle: "hs", niveau: "moyen" as const, n: hs.length,
      quoi: "RedBox hors service",
      pourquoi: "mise hors service par son compte : elle n’encaisse plus rien",
      vers: "#surveiller", faire: "Voir",
    },
    aPlacer.length > 0 && {
      cle: "placer", niveau: "moyen" as const, n: aPlacer.length,
      quoi: `machine${s(aPlacer.length)} à placer sur la carte`,
      pourquoi: "installée, promise ou commandée, mais absente de la carte de son client",
      vers: "#a-placer", faire: "Placer",
    },
    deplacees.length > 0 && {
      cle: "deplacees", niveau: "doux" as const, n: deplacees.length,
      quoi: `adresse${s(deplacees.length)} changée${s(deplacees.length)} depuis le placement`,
      pourquoi: "le client a modifié l’adresse de sa fiche ; la machine est restée où elle était",
      vers: "#a-placer", faire: "Vérifier",
    },
  ].filter(Boolean) as {
    cle: string; niveau: "grave" | "moyen" | "doux"; n: number;
    quoi: string; pourquoi: string; vers: string; faire: string;
  }[];

  const ventesSerie = serie.reduce((t, x) => t + x.n, 0);
  const sommetMachines = Math.max(1, ...classees.map((x) => x.ca));
  const sommetComptes = Math.max(1, ...comptesClasses.map((x) => x.ca));
  const vers = (f: string) => (f === "30" ? "/admin" : `/admin?p=${f}`);

  return (
    <>
      <Entete page="admin" />
      <main className="ecran adm">
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Plateforme</h1>
            <p className="sous">
              {total} machine{s(total)} · {g.comptes} compte{s(g.comptes)} · chiffres des {fenetre.nom} contre les {fenetre.nom} d’avant.
            </p>
          </div>
          <div className="rangee-actions">
            <nav className="periodes petites" aria-label="Fenêtre">
              {FENETRES.map((f) => (
                <Link key={f.cle} href={vers(f.cle)} aria-current={f.cle === fenetre.cle ? "page" : undefined}>{f.nom}</Link>
              ))}
            </nav>
            <Link href="/admin/parc#nouvelle" className="bouton primaire petit">+ Nouvelle machine</Link>
          </div>
        </div>

        {ok === "situee" ? (
          <div className="avis reussi" style={{ marginTop: 14 }}>
            <div className="dit"><div className="titre">Machine placée sur la carte.</div></div>
          </div>
        ) : null}

        {/* ------------------------------------------------------- les chiffres */}
        <section className="adm-tuiles" aria-label="La plateforme en chiffres">
          <Tuile titre="Chiffre d’affaires" valeur={euros(a.ca)} delta={<Delta ici={a.ca} avant={a.ca_avant} />}
                 dessous={a.ca_avant > 0 ? `contre ${euros(a.ca_avant)} avant` : "rien la fenêtre d’avant"}
                 accent>
            <Etincelle valeurs={serie.map((x) => x.ca)} />
          </Tuile>
          <Tuile titre="Ventes distribuées" valeur={String(a.ventes)} delta={<Delta ici={a.ventes} avant={a.ventes_avant} />}
                 dessous={panier > 0 ? `panier moyen ${euros(panier)}${panierAvant > 0 ? ` (avant ${euros(panierAvant)})` : ""}` : "aucune vente"} />
          <Tuile titre="RedBox installées" valeur={String(installees.length)} vers={aSurveiller.length > 0 ? "#surveiller" : undefined}
                 ton={silencieuses.length > 0 ? "mal" : hs.length > 0 ? "attention" : undefined}
                 dessous={`${enService} en ligne · ${silencieuses.length} silencieuse${s(silencieuses.length)} · ${hs.length} HS`}>
            {installees.length > 0 ? (
              <span className="adm-sante" role="img"
                    aria-label={`${enService} en ligne, ${silencieuses.length} silencieuses, ${hs.length} hors service`}>
                <i data-etat="ok" style={{ flexGrow: enService }} />
                <i data-etat="mal" style={{ flexGrow: silencieuses.length }} />
                <i data-etat="hs" style={{ flexGrow: hs.length }} />
              </span>
            ) : null}
          </Tuile>
          <Tuile titre="À venir" valeur={String(aVenir)} vers="/admin/parc#col-commandee"
                 dessous={`${nombres.production} en prod. · ${nombres.commandee} commandée${s(nombres.commandee)} · ${nombres.bientot} bientôt`} />
          <Tuile titre="En stock" valeur={String(nombres.libre)} vers="/admin/parc#col-libre" dessous="libres à l’achat" />
          <Tuile titre="Comptes" valeur={String(g.comptes)} vers="/admin/comptes"
                 dessous={`${g.redboxers} redboxer${s(g.redboxers)} · +${g.nouveaux} en ${fenetre.nom}`} />
        </section>

        {/* ---------------------------------------------------------- a faire */}
        {aFaire.length > 0 ? (
          <>
            <h2>À faire</h2>
            <ul className="a-traiter">
              {aFaire.map((x) => (
                <li key={x.cle} className={x.niveau}>
                  <a href={x.vers}>
                    <span className="pastille" aria-hidden="true" />
                    <span className="dit">
                      <span className="tete"><b className="num">{x.n}</b> {x.quoi}</span>
                      <span className="pourquoi">{x.pourquoi}</span>
                    </span>
                    <span className="faire">{x.faire} <IcoFleche size={13} /></span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {/* ------------------------------------------ l'argent, et le parc */}
        <div className="adm-deux large-gauche">
          <section className="adm-bloc">
            <header>
              <h2>Chiffre d’affaires jour par jour</h2>
              <span className="faible num">{ventesSerie} vente{s(ventesSerie)} · {fenetre.nom}</span>
            </header>
            {ventesSerie === 0 ? (
              <Repli icone={<IcoVentes />} titre={`Aucune vente sur ${fenetre.nom}`} dedans />
            ) : (
              <SerieTemps points={serie} pas="day" />
            )}
          </section>

          <section className="adm-bloc">
            <header>
              <h2>Le parc, de l’usine au bar</h2>
              <Link href="/admin/parc" className="lien">Ouvrir le parc <IcoFleche size={12} /></Link>
            </header>
            {total === 0 ? (
              <Repli icone={<IcoBorne />} titre="Aucune machine enregistrée" dedans />
            ) : (
              <>
                <div className="adm-stades" role="img" aria-label="Répartition du parc par stade">
                  {STATUTS.map((x) => nombres[x.cle] > 0 ? (
                    <i key={x.cle} data-stade={x.cle} style={{ flexGrow: nombres[x.cle] }} title={`${x.nom} : ${nombres[x.cle]}`} />
                  ) : null)}
                </div>
                <ul className="adm-stades-liste">
                  {STATUTS.map((x) => (
                    <li key={x.cle} data-stade={x.cle}>
                      <a href={`/admin/parc#col-${x.cle}`}>
                        <span className="point" data-stade={x.cle} aria-hidden="true" />
                        <span className="nom">{x.nom}</span>
                        <span className="part num">{Math.round((nombres[x.cle] * 100) / Math.max(1, total))} %</span>
                        <b className="num">{nombres[x.cle]}</b>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* ------------------------------------------------------------ carte */}
        <div className="titre-section" id="carte">
          <h2>Carte du parc</h2>
          <span className="faible" style={{ fontSize: 12.5 }}>survolez un carré pour son compte et son CA · touchez-le pour le re-situer</span>
        </div>
        <section className="carte-france"><CarteMaps groupes={groupes} /><Legende groupes={groupes} /></section>

        {aPlacer.length + deplacees.length > 0 ? (
          <section id="a-placer" className="carte a-situer ancre" style={{ marginTop: 14 }}>
            {aPlacer.length > 0 ? (
              <>
                <h3 style={{ marginTop: 0 }}>À placer : {aPlacer.length} machine{s(aPlacer.length)}</h3>
                <ul className="liste-a-situer">
                  {aPlacer.map((b) => (
                    <li key={b.id}>
                      <div className="pousse" style={{ minWidth: 0 }}>
                        <Link href={`/admin/parc#m${b.id}`} className="nom">{b.nom}</Link>
                        <div className="ou">
                          {b.compte ?? "sans compte"} · {nomDuStatut(b.statut)} · {!(b.adresse ?? "").trim() ? "sans adresse"
                            : b.situee_pour === b.adresse ? `« ${b.adresse} » introuvable` : "recherche en cours"}
                        </div>
                      </div>
                      <Link href={`/carte/situer/${b.id}?r=admin`} className="bouton petit primaire">Placer</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {deplacees.length > 0 ? (
              <>
                <h3 style={{ marginTop: aPlacer.length > 0 ? 18 : 0 }}>Adresse changée depuis le placement</h3>
                <ul className="liste-a-situer">
                  {deplacees.map((b) => (
                    <li key={b.id}>
                      <div className="pousse" style={{ minWidth: 0 }}>
                        <Link href={`/admin/parc#m${b.id}`} className="nom">{b.nom}</Link>
                        <div className="ou">
                          {b.compte ?? "sans compte"} · maintenant « {b.adresse} », placée pour « {b.situee_pour ?? "—"} »
                        </div>
                      </div>
                      <Link href={`/carte/situer/${b.id}?r=admin`} className="bouton petit">Re-situer</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}

        {/* ------------------------------------------------------ classements */}
        <div className="adm-deux">
          <section className="adm-bloc" id="meilleures">
            <header>
              <h2>Machines qui rapportent le plus</h2>
              <span className="faible">{fenetre.nom}</span>
            </header>
            {classees.length === 0 ? (
              <p className="adm-vide">Aucune vente sur la fenêtre.</p>
            ) : (
              <ol className="adm-rang">
                {classees.map((b, i) => (
                  <li key={b.id}>
                    <span className="rang num">{i + 1}</span>
                    <span className="dit">
                      <span className="haut">
                        <Link href={`/admin/parc#m${b.id}`} className="nom">{b.nom}</Link>
                        <b className="num">{euros(b.ca)}</b>
                      </span>
                      <span className="piste" aria-hidden="true"><span style={{ width: `${(b.ca / sommetMachines) * 100}%` }} /></span>
                      <span className="bas">
                        {b.compte ?? "sans compte"}{b.ville ? ` · ${b.ville}` : ""} · {b.n} vente{s(b.n)} · dernière {depuis(b.derniere)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="adm-bloc">
            <header>
              <h2>Comptes qui vendent le plus</h2>
              <Link href="/admin/comptes" className="lien">Tous les comptes <IcoFleche size={12} /></Link>
            </header>
            {comptesClasses.length === 0 ? (
              <p className="adm-vide">Aucune vente sur la fenêtre.</p>
            ) : (
              <ol className="adm-rang">
                {comptesClasses.map((c, i) => (
                  <li key={c.id}>
                    <span className="rang num">{i + 1}</span>
                    <span className="dit">
                      <span className="haut">
                        <Link href={`/admin/comptes#c${c.id}`} className="nom">{c.nom}</Link>
                        <b className="num">{euros(c.ca)}</b>
                      </span>
                      <span className="piste" aria-hidden="true"><span style={{ width: `${(c.ca / sommetComptes) * 100}%` }} /></span>
                      <span className="bas">
                        {Math.round((c.ca * 100) / Math.max(1, a.ca))} % du CA · {c.machines} machine{s(c.machines)} · {c.n} vente{s(c.n)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* -------------------------------------------- surveiller, et le fil */}
        <div className="adm-deux">
          <section className="adm-bloc ancre" id="surveiller">
            <header>
              <h2>À surveiller</h2>
              <span className="faible num">{aSurveiller.length}</span>
            </header>
            {aSurveiller.length === 0 ? (
              <p className="adm-vide adm-tout-va">Toutes les RedBox installées donnent signe de vie.</p>
            ) : (
              <ul className="adm-surveiller">
                {aSurveiller.map((b) => (
                  <li key={b.id}>
                    <IcoAlerte size={16} />
                    <span className="dit">
                      <Link href={`/admin/parc#m${b.id}`} className="nom">{b.nom}</Link>
                      <span className="bas">{b.compte ?? "—"}{b.ville ? ` · ${b.ville}` : ""} · vue {depuis(b.vue_le)}</span>
                    </span>
                    {b.hors_service
                      ? <span className="pilule" data-etat="hs"><i />hors service</span>
                      : <span className="pilule" data-etat="mal"><i />silencieuse</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="adm-bloc">
            <header><h2>Activité récente</h2></header>
            {activite.length === 0 ? (
              <p className="adm-vide">Rien pour l’instant.</p>
            ) : (
              <ol className="adm-fil">
                {activite.map((e) => (
                  <li key={`${e.genre}-${e.id}`} data-genre={e.genre}>
                    <span className="icone" data-stade={e.genre === "stade" ? e.detail ?? undefined : undefined} aria-hidden="true">
                      {e.genre === "compte" ? <IcoEquipe size={14} /> : <IcoBorne size={14} />}
                    </span>
                    <span className="dit">
                      {e.genre === "compte" ? (
                        <>Nouveau compte <Link href={`/admin/comptes#c${e.id}`}>{e.nom}</Link></>
                      ) : (
                        <>
                          <Link href={`/admin/parc#m${e.id}`}>{e.nom}</Link> passe <b>{nomDuStatut(e.detail ?? "")}</b>
                          {e.compte ? <span className="faible"> · {e.compte}</span> : null}
                        </>
                      )}
                    </span>
                    <time className="faible num" dateTime={new Date(e.quand).toISOString()}>{depuis(e.quand)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </main>
      <NavBasse page="admin" />
    </>
  );
}

/** Un chiffre, sa pente, sa ligne d'explication ; un lien quand il y a quelque chose derriere. */
function Tuile({ titre, valeur, dessous, delta, vers, ton, accent, children }: {
  titre: string; valeur: string; dessous: string; delta?: React.ReactNode; vers?: string;
  ton?: "mal" | "attention"; accent?: boolean; children?: React.ReactNode;
}) {
  const corps = (
    <>
      <span className="titre-tuile">{titre}</span>
      <span className="ligne"><b className="chiffre num" data-ton={ton}>{valeur}</b>{delta}</span>
      <span className="dessous">{dessous}</span>
      {children}
    </>
  );
  const classe = `adm-tuile${accent ? " accent" : ""}`;
  return vers
    ? <a href={vers} className={`${classe} menant`}>{corps}</a>
    : <div className={classe}>{corps}</div>;
}

/** La courbe du chiffre en miniature, sans axe : la forme de la fenetre, rien d'autre. */
function Etincelle({ valeurs }: { valeurs: number[] }) {
  if (valeurs.length < 2 || valeurs.every((v) => v === 0)) return null;
  const max = Math.max(...valeurs);
  const x = (i: number) => (i / (valeurs.length - 1)) * 100;
  const y = (v: number) => 28 - (v / max) * 26;
  const ligne = valeurs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <svg className="adm-etincelle" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path className="aire" d={`${ligne} L100,30 L0,30 Z`} />
      <path className="trait" d={ligne} />
    </svg>
  );
}
