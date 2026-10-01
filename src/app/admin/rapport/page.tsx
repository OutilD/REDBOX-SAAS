import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Delta, SerieTemps } from "../../analyses";
import { q, q1, enLigne, euros, FUSEAU } from "@/db";
import { estSuperAdmin, utilisateur } from "@/lib/auth";
import { SQL_GENS, apprenants, genreDe, temperature } from "@/lib/academie-suivi";
import { SQL_VRAIE, STATUTS, compteurs } from "@/lib/parc";
import { nomAffiche } from "@/lib/personnes";
import type { Point as PointSerie } from "@/lib/tableau";
import { Tuile } from "../tuiles";
import { Imprimer } from "./imprimer";

export const dynamic = "force-dynamic";

const s = (n: number, mot = "s") => (n > 1 ? mot : "");
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const nomMois = (cle: string) => { const [a, m] = cle.split("-").map(Number); return `${MOIS[m - 1]} ${a}`; };

/**
 * Les bornes du mois, heure de Paris, en tete de chaque requete. Un mois en
 * cours s'arrete a maintenant, et se compare a la MEME duree du mois d'avant :
 * le 12, on compare douze jours a douze jours, pas a un mois entier.
 *
 * Un mois TERMINE se compare au mois d'avant ENTIER : ajouter sa duree a
 * debut_avant faisait deborder mars sur trois jours d'avril (31 j apres le
 * 1er fevrier) et amputait janvier de trois jours face a fevrier. Un mois en
 * cours ne deborde jamais sur lui-meme : plafond a `debut`.
 */
const BORNES = `
  WITH bb AS (
    SELECT (($1::date)::timestamp AT TIME ZONE '${FUSEAU}') AS debut,
           ((($1::date) + interval '1 month')::timestamp AT TIME ZONE '${FUSEAU}') AS fin_mois,
           ((($1::date) - interval '1 month')::timestamp AT TIME ZONE '${FUSEAU}') AS debut_avant),
  b1 AS (SELECT debut, LEAST(now(), fin_mois) AS fin, fin_mois, debut_avant FROM bb),
  b2 AS (SELECT debut, fin, debut_avant,
                CASE WHEN fin >= fin_mois THEN debut
                     ELSE LEAST(debut_avant + (fin - debut), debut) END AS fin_avant
           FROM b1)`;

type Argent = { ca: number; ca_avant: number; ventes: number; ventes_avant: number; actives: number; actives_avant: number };
type Rang = { id: number; nom: string; sous: string | null; n: number; ca: number };
type Fait = {
  comptes: number; comptes_avant: number; installees: number; installees_avant: number;
  finies: number; finies_avant: number; formes: number; nouveaux_apprenants: number;
};

/**
 * LE RAPPORT DU MOIS, pour la direction. Une page qui s'imprime — et donc
 * s'enregistre en PDF depuis n'importe quel navigateur — sur fond blanc,
 * sans le rail ni l'en-tete : ce qu'on envoie, pas ce qu'on consulte.
 *
 * L'argent, la pente contre le mois d'avant, les meilleures machines et les
 * meilleurs comptes, ce qui se vend, le parc, l'academie et les prospects. Les
 * phrases du haut sont ecrites d'apres les chiffres, jamais a la main.
 *
 * Le parc et la sante sont ceux d'aujourd'hui : la console ne garde pas
 * l'etat de chaque machine jour par jour. C'est dit sur la page.
 */
export default async function Rapport({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!estSuperAdmin(u)) redirect("/");
  const { m } = await searchParams;

  // Les mois qu'on peut demander : du premier compte a aujourd'hui.
  const bornes = await q1<{ premier: string; courant: string }>(`
    SELECT to_char(date_trunc('month', MIN(cree_le) AT TIME ZONE '${FUSEAU}'), 'YYYY-MM') AS premier,
           to_char(date_trunc('month', now() AT TIME ZONE '${FUSEAU}'), 'YYYY-MM') AS courant
      FROM compte WHERE NOT demo AND NOT vitrine`);
  const courant = bornes?.courant ?? new Date().toISOString().slice(0, 7);
  const premier = bornes?.premier ?? courant;
  const mois: string[] = [];
  for (let [a, n] = courant.split("-").map(Number); ; n--) {
    if (n === 0) { a--; n = 12; }
    const cle = `${a}-${String(n).padStart(2, "0")}`;
    mois.push(cle);
    if (cle <= premier || mois.length >= 24) break;
  }
  const cle = m && mois.includes(m) ? m : courant;
  const enCours = cle === courant;
  const jour1 = `${cle}-01`;

  const [argent, serie, machines, comptes, produits, faits, nombres, sante, gens] = await Promise.all([
    q1<Argent>(`${BORNES}
      SELECT COALESCE(SUM(v.prix_c) FILTER (WHERE v.faite_le >= b2.debut AND v.faite_le < b2.fin), 0)::int AS ca,
             COALESCE(SUM(v.prix_c) FILTER (WHERE v.faite_le >= b2.debut_avant AND v.faite_le < b2.fin_avant), 0)::int AS ca_avant,
             COUNT(*) FILTER (WHERE v.faite_le >= b2.debut AND v.faite_le < b2.fin)::int AS ventes,
             COUNT(*) FILTER (WHERE v.faite_le >= b2.debut_avant AND v.faite_le < b2.fin_avant)::int AS ventes_avant,
             COUNT(DISTINCT v.borne_id) FILTER (WHERE v.faite_le >= b2.debut AND v.faite_le < b2.fin)::int AS actives,
             COUNT(DISTINCT v.borne_id) FILTER (WHERE v.faite_le >= b2.debut_avant AND v.faite_le < b2.fin_avant)::int AS actives_avant
        FROM b2, vente v JOIN borne b ON b.id = v.borne_id
       WHERE v.statut = 'distribue' AND v.faite_le >= b2.debut_avant AND ${SQL_VRAIE}`, [jour1]),
    q<PointSerie>(`
      WITH serie AS (
        SELECT generate_series(($1::date)::timestamp, (($1::date) + interval '1 month' - interval '1 day')::timestamp,
                               interval '1 day') AS seau)
      SELECT to_char(s.seau, 'YYYY-MM-DD') AS cle, to_char(s.seau, 'DD/MM') AS etiquette,
             EXTRACT(ISODOW FROM s.seau) >= 6 AS weekend,
             COUNT(x.prix_c)::int AS n, COALESCE(SUM(x.prix_c), 0)::int AS ca
        FROM serie s
        LEFT JOIN (SELECT v.prix_c, date_trunc('day', v.faite_le AT TIME ZONE '${FUSEAU}') AS jour
                     FROM vente v JOIN borne b ON b.id = v.borne_id
                    WHERE v.statut = 'distribue' AND ${SQL_VRAIE}
                      AND v.faite_le >= (($1::date)::timestamp AT TIME ZONE '${FUSEAU}') - interval '1 day'
                      AND v.faite_le <  ((($1::date) + interval '1 month')::timestamp AT TIME ZONE '${FUSEAU}') + interval '1 day'
                  ) x ON x.jour = s.seau
       GROUP BY s.seau ORDER BY s.seau`, [jour1]),
    q<Rang>(`${BORNES}
      SELECT b.id, b.nom, c.nom AS sous, COUNT(*)::int AS n, COALESCE(SUM(v.prix_c), 0)::int AS ca
        FROM b2, vente v JOIN borne b ON b.id = v.borne_id LEFT JOIN compte c ON c.id = b.compte_id
       WHERE v.statut = 'distribue' AND v.faite_le >= b2.debut AND v.faite_le < b2.fin AND ${SQL_VRAIE}
       GROUP BY b.id, c.nom ORDER BY ca DESC, n DESC LIMIT 6`, [jour1]),
    q<Rang>(`${BORNES}
      SELECT c.id, c.nom, (COUNT(DISTINCT b.id) || ' machine' || CASE WHEN COUNT(DISTINCT b.id) > 1 THEN 's' ELSE '' END) AS sous,
             COUNT(*)::int AS n, COALESCE(SUM(v.prix_c), 0)::int AS ca
        FROM b2, vente v JOIN borne b ON b.id = v.borne_id JOIN compte c ON c.id = b.compte_id
       WHERE v.statut = 'distribue' AND v.faite_le >= b2.debut AND v.faite_le < b2.fin AND ${SQL_VRAIE}
       GROUP BY c.id ORDER BY ca DESC, n DESC LIMIT 6`, [jour1]),
    q<Rang>(`${BORNES}
      SELECT 0 AS id, COALESCE(p.nom, 'Produit inconnu') AS nom, NULL AS sous, COUNT(*)::int AS n, COALESCE(SUM(v.prix_c), 0)::int AS ca
        FROM b2, vente v JOIN borne b ON b.id = v.borne_id LEFT JOIN produit p ON p.id = v.produit_id
       WHERE v.statut = 'distribue' AND v.faite_le >= b2.debut AND v.faite_le < b2.fin AND ${SQL_VRAIE}
       GROUP BY p.nom ORDER BY n DESC, ca DESC LIMIT 6`, [jour1]),
    q1<Fait>(`${BORNES}, gens AS (${SQL_GENS})
      SELECT (SELECT COUNT(*)::int FROM compte c WHERE NOT c.demo AND NOT c.vitrine AND c.cree_le >= b2.debut AND c.cree_le < b2.fin) AS comptes,
             (SELECT COUNT(*)::int FROM compte c WHERE NOT c.demo AND NOT c.vitrine AND c.cree_le >= b2.debut_avant AND c.cree_le < b2.fin_avant) AS comptes_avant,
             (SELECT COUNT(*)::int FROM borne b WHERE b.statut = 'installee' AND b.jeton IS NOT NULL AND ${SQL_VRAIE}
                AND b.statut_le >= b2.debut AND b.statut_le < b2.fin) AS installees,
             (SELECT COUNT(*)::int FROM borne b WHERE b.statut = 'installee' AND b.jeton IS NOT NULL AND ${SQL_VRAIE}
                AND b.statut_le >= b2.debut_avant AND b.statut_le < b2.fin_avant) AS installees_avant,
             (SELECT COUNT(*)::int FROM academie_suivi s WHERE s.utilisateur_id IN (SELECT id FROM gens) AND s.fini_le >= b2.debut AND s.fini_le < b2.fin) AS finies,
             (SELECT COUNT(*)::int FROM academie_suivi s WHERE s.utilisateur_id IN (SELECT id FROM gens) AND s.fini_le >= b2.debut_avant AND s.fini_le < b2.fin_avant) AS finies_avant,
             (SELECT COUNT(DISTINCT s.utilisateur_id)::int FROM academie_suivi s WHERE s.utilisateur_id IN (SELECT id FROM gens) AND s.fini_le >= b2.debut AND s.fini_le < b2.fin) AS formes,
             (SELECT COUNT(*)::int FROM (SELECT utilisateur_id FROM academie_suivi WHERE utilisateur_id IN (SELECT id FROM gens) GROUP BY utilisateur_id
                                          HAVING MIN(vu_le) >= (SELECT debut FROM b2) AND MIN(vu_le) < (SELECT fin FROM b2)) x) AS nouveaux_apprenants
        FROM b2`, [jour1]),
    compteurs(),
    q<{ jeton: string | null; vue_le: Date | null; hors_service: boolean }>(`
      SELECT b.jeton, b.vue_le, b.hors_service FROM borne b
       WHERE b.statut = 'installee' AND b.jeton IS NOT NULL AND ${SQL_VRAIE}`),
    apprenants(),
  ]);

  const a: Argent = argent ?? { ca: 0, ca_avant: 0, ventes: 0, ventes_avant: 0, actives: 0, actives_avant: 0 };
  const f: Fait = faits ?? { comptes: 0, comptes_avant: 0, installees: 0, installees_avant: 0, finies: 0, finies_avant: 0, formes: 0, nouveaux_apprenants: 0 };
  const panier = a.ventes > 0 ? Math.round(a.ca / a.ventes) : 0;
  const panierAvant = a.ventes_avant > 0 ? Math.round(a.ca_avant / a.ventes_avant) : 0;
  const parMachine = a.actives > 0 ? Math.round(a.ca / a.actives) : 0;
  const total = Object.values(nombres).reduce((t, n) => t + n, 0);
  const hs = sante.filter((b) => b.hors_service).length;
  const silencieuses = sante.filter((b) => !b.hors_service && !enLigne(b.vue_le)).length;
  const prospects = gens.filter((g) => !g.redboxer);
  const chauds = prospects.filter((g) => temperature(g) === "chaud");
  const futurs = prospects.filter((g) => genreDe(g) === "futur");
  const meilleurJour = serie.reduce((x, y) => (y.ca > x.ca ? y : x), serie[0]);
  const nomMoisAvant = nomMois(mois[mois.indexOf(cle) + 1] ?? (() => {
    const [an, n] = cle.split("-").map(Number);
    return n === 1 ? `${an - 1}-12` : `${an}-${String(n - 1).padStart(2, "0")}`;
  })());
  const pente = a.ca_avant > 0 ? Math.round(((a.ca - a.ca_avant) * 100) / a.ca_avant) : null;

  // Les phrases du haut : chacune n'existe que si son chiffre dit quelque chose.
  const faitsMarquants = [
    a.ca > 0 && (pente === null
      ? `${euros(a.ca)} de chiffre d’affaires sur ${a.actives} machine${s(a.actives)}.`
      : `${euros(a.ca)} de chiffre d’affaires, ${pente >= 0 ? "en hausse" : "en baisse"} de ${Math.abs(pente)} % par rapport à ${enCours ? "la même période de " : ""}${nomMoisAvant}.`),
    machines[0] && `Meilleure machine : ${machines[0].nom}${machines[0].sous ? ` (${machines[0].sous})` : ""}, ${euros(machines[0].ca)} en ${machines[0].n} vente${s(machines[0].n)}.`,
    meilleurJour && meilleurJour.ca > 0 && `Meilleur jour : le ${meilleurJour.etiquette}, ${euros(meilleurJour.ca)}.`,
    f.installees > 0 && `${f.installees} RedBox installée${s(f.installees)} ce mois-ci.`,
    f.comptes > 0 && `${f.comptes} nouveau${f.comptes > 1 ? "x" : ""} compte${s(f.comptes)} sur la plateforme.`,
    f.finies > 0 && `${f.finies} leçon${s(f.finies)} de l’Académie terminée${s(f.finies)} par ${f.formes} personne${s(f.formes)}.`,
    chauds.length > 0 && `${chauds.length} prospect${s(chauds.length)} chaud${s(chauds.length)} à contacter aujourd’hui.`,
  ].filter(Boolean) as string[];

  const sommetM = Math.max(1, ...machines.map((x) => x.ca));
  const sommetC = Math.max(1, ...comptes.map((x) => x.ca));
  const sommetP = Math.max(1, ...produits.map((x) => x.n));
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { timeZone: FUSEAU, day: "numeric", month: "long", year: "numeric" });

  return (
    <main className="rapport">
      <div className="rapport-barre">
        <Link href="/admin" className="bouton petit">← Plateforme</Link>
        <nav className="periodes petites" aria-label="Mois du rapport">
          {mois.slice(0, 6).map((x) => (
            <Link key={x} href={`/admin/rapport?m=${x}`} aria-current={x === cle ? "page" : undefined}>
              {nomMois(x).replace(/ \d+$/, "")}
            </Link>
          ))}
        </nav>
        <Imprimer />
      </div>

      <article className="rapport-feuille">
        <header className="rapport-tete">
          <Image src="/logo-redbox.png" alt="RedBox" width={116} height={75} priority />
          <div>
            <h1>Rapport mensuel · {nomMois(cle)}</h1>
            <p>
              {enCours ? `Mois en cours, arrêté au ${aujourdhui}` : `Mois complet`} · comparé à {enCours ? "la même période de " : ""}{nomMoisAvant} · édité le {aujourdhui}
            </p>
          </div>
        </header>

        {faitsMarquants.length > 0 ? (
          <section className="rapport-faits">
            <h2>L’essentiel</h2>
            <ul>{faitsMarquants.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
        ) : null}

        <section className="adm-tuiles rapport-tuiles" aria-label="Le mois en chiffres">
          <Tuile titre="Chiffre d’affaires" valeur={euros(a.ca)} delta={<Delta ici={a.ca} avant={a.ca_avant} />} accent
                 dessous={`contre ${euros(a.ca_avant)} en ${nomMoisAvant}`} />
          <Tuile titre="Ventes" valeur={String(a.ventes)} delta={<Delta ici={a.ventes} avant={a.ventes_avant} />}
                 dessous={`panier moyen ${euros(panier)}${panierAvant ? ` (avant ${euros(panierAvant)})` : ""}`} />
          <Tuile titre="CA par machine" valeur={euros(parMachine)}
                 dessous={`${a.actives} machine${s(a.actives)} ont vendu (avant ${a.actives_avant})`} />
          <Tuile titre="RedBox installées" valeur={String(nombres.installee)}
                 dessous={`+${f.installees} ce mois · ${nombres.production + nombres.commandee + nombres.bientot} à venir`} />
          <Tuile titre="Nouveaux comptes" valeur={String(f.comptes)} delta={<Delta ici={f.comptes} avant={f.comptes_avant} />}
                 dessous={`contre ${f.comptes_avant} en ${nomMoisAvant}`} />
          <Tuile titre="Leçons finies" valeur={String(f.finies)} delta={<Delta ici={f.finies} avant={f.finies_avant} />}
                 dessous={`${f.formes} personne${s(f.formes)} · ${f.nouveaux_apprenants} nouvel${f.nouveaux_apprenants > 1 ? "les" : "le"} en formation`} />
        </section>

        <section className="adm-bloc rapport-bloc">
          <header><h2>Chiffre d’affaires jour par jour</h2><span className="faible num">{a.ventes} vente{s(a.ventes)}</span></header>
          {a.ventes === 0 ? <p className="adm-vide">Aucune vente ce mois-ci.</p> : <SerieTemps points={serie} pas="day" />}
        </section>

        <div className="rapport-trois">
          <Classement titre="Machines" lignes={machines} sommet={sommetM} total={a.ca} />
          <Classement titre="Comptes" lignes={comptes} sommet={sommetC} total={a.ca} />
          <section className="adm-bloc rapport-bloc">
            <header><h2>Produits les plus vendus</h2></header>
            {produits.length === 0 ? <p className="adm-vide">Aucune vente.</p> : (
              <ol className="adm-rang">
                {produits.map((p, i) => (
                  <li key={p.nom}>
                    <span className="rang num">{i + 1}</span>
                    <span className="dit">
                      <span className="haut"><span className="nom">{p.nom}</span><b className="num">{p.n}</b></span>
                      <span className="piste" aria-hidden="true"><span style={{ width: `${(p.n / sommetP) * 100}%` }} /></span>
                      <span className="bas">{euros(p.ca)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="rapport-deux">
          <section className="adm-bloc rapport-bloc">
            <header><h2>Le parc</h2><span className="faible">au {aujourdhui}</span></header>
            <div className="adm-stades" role="img" aria-label="Répartition du parc par stade">
              {STATUTS.map((x) => nombres[x.cle] > 0 ? <i key={x.cle} data-stade={x.cle} style={{ flexGrow: nombres[x.cle] }} /> : null)}
            </div>
            <ul className="rapport-liste">
              {STATUTS.map((x) => (
                <li key={x.cle}><span className="point" data-stade={x.cle} aria-hidden="true" />{x.nom}<b className="num">{nombres[x.cle]}</b></li>
              ))}
              <li className="total">Total<b className="num">{total}</b></li>
            </ul>
            <p className="rapport-note">
              Santé des {sante.length} RedBox installées : {sante.length - hs - silencieuses} en ligne, {silencieuses} silencieuse{s(silencieuses)}, {hs} hors service.
            </p>
          </section>

          <section className="adm-bloc rapport-bloc">
            <header><h2>Académie et prospects</h2><span className="faible">au {aujourdhui}</span></header>
            <ul className="rapport-liste">
              <li>Leçons finies ce mois-ci<b className="num">{f.finies}</b></li>
              <li>Personnes formées ce mois-ci<b className="num">{f.formes}</b></li>
              <li>Prospects inscrits<b className="num">{prospects.length}</b></li>
              <li>dont futurs redboxers (une leçon finie ou plus)<b className="num">{futurs.length}</b></li>
              <li>dont prospects chauds<b className="num">{chauds.length}</b></li>
            </ul>
            {chauds.length > 0 ? (
              <p className="rapport-note">À contacter : {chauds.slice(0, 8).map((g) => `${nomAffiche(g)} (${g.finies}/${g.ouvertes} leçons)`).join(", ")}.</p>
            ) : null}
          </section>
        </div>

        <footer className="rapport-pied">
          RedBox · rapport généré par la console à partir des ventes distribuées des vraies machines (hors démo et vitrine).
          Le parc, la santé et les prospects sont l’état au jour de l’édition.
        </footer>
      </article>
    </main>
  );
}

function Classement({ titre, lignes, sommet, total }: { titre: string; lignes: Rang[]; sommet: number; total: number }) {
  return (
    <section className="adm-bloc rapport-bloc">
      <header><h2>{titre} qui rapportent le plus</h2></header>
      {lignes.length === 0 ? <p className="adm-vide">Aucune vente.</p> : (
        <ol className="adm-rang">
          {lignes.map((x, i) => (
            <li key={x.id}>
              <span className="rang num">{i + 1}</span>
              <span className="dit">
                <span className="haut"><span className="nom">{x.nom}</span><b className="num">{euros(x.ca)}</b></span>
                <span className="piste" aria-hidden="true"><span style={{ width: `${(x.ca / sommet) * 100}%` }} /></span>
                <span className="bas">{x.sous ? `${x.sous} · ` : ""}{x.n} vente{s(x.n)} · {Math.round((x.ca * 100) / Math.max(1, total))} %</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
