import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, q1, euros, depuis, FUSEAU } from "@/db";
import { estSuperAdmin, utilisateur } from "@/lib/auth";
import { DOMAINE } from "@/lib/invente";
import { PREFIXE_JETON, PREFIXE_VITRINE } from "@/lib/demo";
import { JOURS_SEMAINE, MAX_BORNES, PARTS, REGLAGE_DEFAUT, reglageDe, type Reglage } from "@/lib/vitrine";
import { capaciteSoir, catalogueModele } from "@/lib/demo";
import { Choix } from "../../choix";
import Semaine from "./semaine";

export const dynamic = "force-dynamic";

/** Lundi d'abord, comme on lit une semaine ; les poids restent indexes dimanche d'abord. */
const ORDRE_JOURS = [1, 2, 3, 4, 5, 6, 0];

const ERREURS: Record<string, string> = {
  ca: "Indiquez un chiffre d’affaires supérieur à zéro.",
  jours: "Donnez un poids à au moins un soir de la semaine.",
  compte: "Choisissez un compte.",
  editeur: "Le compte de l’éditeur ne peut pas servir de vitrine.",
  machines: "Ce compte porte une vraie RedBox : il ne peut pas servir de vitrine, on effacerait sa machine.",
  autre: "Une autre vitrine existe déjà. Rendez-la ordinaire avant d’en choisir une nouvelle.",
};

type Vitrine = { id: number; nom: string; reglage: unknown; genere_le: Date | null; emails: string[] };
type Candidat = { id: number; nom: string; email: string | null; demo: boolean };
type Modele = { id: number; nom: string; produits: number; modele: boolean };

/**
 * LE COMPTE VITRINE, celui qu'on montre aux prospects (`lib/vitrine.ts`).
 *
 * On choisit un compte — un compte ordinaire, ouvert par l'inscription, avec
 * l'adresse qu'on donnera en rendez-vous —, on regle ce qu'il doit montrer, et
 * on genere. Rien, dans la console de ce compte, ne dit que ses chiffres sont
 * inventes. Ici seulement.
 */
export default async function VitrinePage({ searchParams }:
  { searchParams: Promise<{ e?: string; fait?: string; ca?: string; n?: string; manque?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!estSuperAdmin(u)) redirect("/");
  const sp = await searchParams;

  const [vitrine, candidats, modeles, catalogue] = await Promise.all([
    q1<Vitrine>(`
      SELECT k.id, k.nom, k.vitrine_reglage AS reglage, k.vitrine_le AS genere_le,
             COALESCE((SELECT array_agg(x.email ORDER BY (m.role = 'proprietaire') DESC, x.email)
                         FROM membre m JOIN utilisateur x ON x.id = m.utilisateur_id
                        WHERE m.compte_id = k.id AND x.email NOT LIKE '%@' || $1), '{}') AS emails
        FROM compte k WHERE k.vitrine LIMIT 1`, [DOMAINE]),
    q<Candidat>(`
      SELECT k.id, k.nom, k.demo,
             (SELECT x.email FROM membre m JOIN utilisateur x ON x.id = m.utilisateur_id
               WHERE m.compte_id = k.id AND m.role = 'proprietaire' ORDER BY x.id LIMIT 1) AS email
        FROM compte k
       WHERE NOT k.editeur AND NOT k.vitrine
         AND NOT EXISTS (SELECT 1 FROM borne b WHERE b.compte_id = k.id
                          AND (b.jeton IS NULL OR (b.jeton NOT LIKE '${PREFIXE_JETON}%'
                                                   AND b.jeton NOT LIKE '${PREFIXE_VITRINE}%')))
       ORDER BY k.cree_le DESC`),
    // Les comptes dont le catalogue peut servir aux demos : de vrais comptes, garnis.
    q<Modele>(`
      SELECT k.id, k.nom, k.catalogue_modele AS modele,
             (SELECT COUNT(*)::int FROM produit p WHERE p.compte_id = k.id AND p.actif) AS produits
        FROM compte k
       WHERE NOT k.demo AND NOT k.vitrine
         AND EXISTS (SELECT 1 FROM produit p WHERE p.compte_id = k.id AND p.actif)
       ORDER BY k.catalogue_modele DESC, k.nom`),
    catalogueModele(),
  ]);
  const modele = modeles.find((m) => m.modele) ?? null;

  // Ce que la vitrine montre vraiment : le total, et la part de chaque soir.
  // Une vente d'apres minuit appartient a la soiree de la veille.
  const [total, parSoir] = vitrine ? await Promise.all([
    q1<{ ca: number; n: number; bornes: number }>(`
      SELECT COALESCE(SUM(v.prix_c), 0)::int AS ca, COUNT(*)::int AS n,
             (SELECT COUNT(*)::int FROM borne WHERE compte_id = $1) AS bornes
        FROM vente v JOIN borne b ON b.id = v.borne_id
       WHERE b.compte_id = $1 AND v.statut = 'distribue'`, [vitrine.id]),
    q<{ dow: number; ca: number; soirs: number }>(`
      SELECT EXTRACT(DOW FROM (v.faite_le AT TIME ZONE '${FUSEAU}') - interval '8 hours')::int AS dow,
             COALESCE(SUM(v.prix_c), 0)::int AS ca,
             COUNT(DISTINCT ((v.faite_le AT TIME ZONE '${FUSEAU}') - interval '8 hours')::date)::int AS soirs
        FROM vente v JOIN borne b ON b.id = v.borne_id
       WHERE b.compte_id = $1 AND v.statut = 'distribue'
       GROUP BY 1`, [vitrine.id]),
  ]) : [null, []];

  const r: Reglage = vitrine ? reglageDe(vitrine.reglage) : REGLAGE_DEFAUT;
  const heures = Array.from({ length: 24 }, (_, h) => ({ valeur: String(h), nom: `${String(h).padStart(2, "0")} h` }));
  const erreur = sp.e ? ERREURS[sp.e] ?? "Ça n’a pas abouti." : null;
  const caTotal = total?.ca ?? 0;
  const soirs = ORDRE_JOURS.map((d) => ({ d, ...(parSoir.find((x) => x.dow === d) ?? { ca: 0, soirs: 0 }) }))
    .filter((x) => x.ca > 0);

  return (
    <>
      <Entete page="admin_vitrine" />
      <main className="ecran vitrine-ecran">
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Vitrine</h1>
            <p className="sous" style={{ maxWidth: 720 }}>
              Le compte qu’on ouvre devant un prospect. Il ressemble en tout à celui d’un exploitant — aucun
              bandeau, aucune mention de démonstration —, mais ses chiffres sont ceux que vous réglez ici.
            </p>
          </div>
          {vitrine ? (
            <div className="rangee-actions">
              <Link href={`/admin/comptes#c${vitrine.id}`} className="bouton">Le compte</Link>
            </div>
          ) : null}
        </div>

        {erreur ? <p className="erreur" style={{ marginTop: 14 }}>{erreur}</p> : null}
        {/* Lu sur `manque`, pas sur `fait` : le bandeau retire `fait` de l'adresse
            aussitot, et le message partait avec. Il reste jusqu'a la prochaine generation. */}
        {Number(sp.manque) > 0 ? (
          <p className="erreur" style={{ marginTop: 14 }}>
            Certains soirs demandaient plus que ce que les RedBox peuvent contenir : on les a ajustés au
            maximum de la box par soir. Résultat : {euros(Number(sp.ca))} au lieu de{" "}
            {euros(Number(sp.ca) + Number(sp.manque))}, soit {euros(Number(sp.manque))} de moins que demandé.
            Pour atteindre le montant, ajoutez une RedBox, allongez la période ou répartissez sur plus de soirs.
          </p>
        ) : null}

        {vitrine ? (
          <section className="carte vitrine-etat" aria-label="Ce que la vitrine montre">
            <div className="vitrine-qui">
              <span className="vitrine-pastille" aria-hidden>{vitrine.nom.slice(0, 2).toUpperCase()}</span>
              <div className="pousse">
                <div className="vitrine-nom">{vitrine.nom}</div>
                <div className="vitrine-connexion">
                  Se connecter avec <b>{vitrine.emails[0] ?? "—"}</b>
                </div>
              </div>
              <span className="pilule ok"><i />Générée {vitrine.genere_le ? depuis(vitrine.genere_le) : "—"}</span>
            </div>

            <div className="vitrine-chiffres">
              <div><span className="etiquette-bilan">Chiffre d’affaires</span><b className="num">{euros(caTotal)}</b></div>
              <div><span className="etiquette-bilan">Ventes</span><b className="num">{(total?.n ?? 0).toLocaleString("fr-FR")}</b></div>
              <div><span className="etiquette-bilan">Panier moyen</span><b className="num">{euros(total?.n ? Math.round(caTotal / total.n) : 0)}</b></div>
              <div><span className="etiquette-bilan">RedBox</span><b className="num">{total?.bornes ?? 0}</b></div>
            </div>

            {soirs.length > 0 ? (
              <div className="vitrine-repartition">
                <div className="repartition-barre" aria-hidden>
                  {soirs.map((x, i) => (
                    <span key={x.d} style={{ flexGrow: x.ca, opacity: 1 - i * (0.55 / Math.max(1, soirs.length)) }} />
                  ))}
                </div>
                <ul className="repartition-legende">
                  {soirs.map((x, i) => (
                    <li key={x.d}>
                      <i style={{ opacity: 1 - i * (0.55 / Math.max(1, soirs.length)) }} aria-hidden />
                      <span className="jour">{JOURS_SEMAINE[x.d]}</span>
                      <b className="num">{caTotal > 0 ? Math.round((x.ca / caTotal) * 100) : 0} %</b>
                      <span className="num faible">{euros(Math.round(x.ca / Math.max(1, x.soirs)))} / soir</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="vitrine-note">
              Les ventes s’arrêtent au moment de la génération : régénérez la veille d’un rendez-vous pour que la
              dernière soirée soit récente.
            </p>
          </section>
        ) : null}

        {!vitrine && candidats.length === 0 ? (
          <section className="carte vitrine-vide">
            <h2>Aucun compte disponible</h2>
            <p className="sous">
              Créez un compte par l’inscription, avec l’adresse que vous utiliserez en rendez-vous, puis revenez
              ici pour le transformer en vitrine.
            </p>
          </section>
        ) : (
          <form method="post" action="/api/admin/vitrine" className="carte vitrine-reglage">
            <h2>{vitrine ? "Réglages" : "Créer la vitrine"}</h2>

            {vitrine ? <input type="hidden" name="compte_id" value={vitrine.id} /> : (
              <fieldset className="vitrine-bloc">
                <legend>Le compte</legend>
                <div className="champ">
                  <label htmlFor="v-compte">Compte à transformer en vitrine</label>
                  <Choix id="v-compte" name="compte_id" requis invite="Choisir un compte…" recherche="Chercher un compte ou une adresse…"
                         options={candidats.map((c) => ({ valeur: String(c.id), nom: `${c.nom}${c.demo ? " (en démo)" : ""}`,
                                                          detail: c.email ?? undefined }))} />
                </div>
              </fieldset>
            )}

            <fieldset className="vitrine-bloc">
              <legend>Le chiffre</legend>
              <div className="vitrine-grille">
                <div className="champ">
                  <label htmlFor="v-ca">Chiffre d’affaires</label>
                  <div className="avec-unite">
                    <input id="v-ca" name="ca" type="number" min={1} step={1} required inputMode="numeric"
                           className="num" defaultValue={r.ca} />
                    <span aria-hidden>€</span>
                  </div>
                </div>
                <div className="champ">
                  <label htmlFor="v-mois">Période</label>
                  <div className="avec-unite">
                    <input id="v-mois" name="mois" type="number" min={1} max={24} step={1} required inputMode="numeric"
                           className="num" defaultValue={r.mois} />
                    <span aria-hidden>mois</span>
                  </div>
                </div>
                <div className="champ">
                  <label htmlFor="v-progression">Progression</label>
                  <div className="avec-unite">
                    <input id="v-progression" name="progression" type="number" min={-90} max={500} step={5}
                           className="num" defaultValue={r.progression} />
                    <span aria-hidden>%</span>
                  </div>
                </div>
              </div>
              <p className="vitrine-aide">La période finit aujourd’hui. La progression fait monter les soirs du premier au dernier.</p>
            </fieldset>

            <fieldset className="vitrine-bloc">
              <legend>Le parc et les horaires</legend>
              <div className="vitrine-grille">
                <div className="champ">
                  <label htmlFor="v-bornes">RedBox</label>
                  <div className="avec-unite">
                    <input id="v-bornes" name="bornes" type="number" min={1} max={MAX_BORNES} step={1} required
                           inputMode="numeric" className="num" defaultValue={r.bornes} />
                    <span aria-hidden>sur {MAX_BORNES}</span>
                  </div>
                </div>
                <div className="champ">
                  <label htmlFor="v-debut">Ouverture</label>
                  <Choix id="v-debut" name="debut" options={heures} defaut={r.debut} recherche="Chercher une heure…" />
                </div>
                <div className="champ">
                  <label htmlFor="v-fin">Fermeture</label>
                  <Choix id="v-fin" name="fin" options={heures} defaut={r.fin} recherche="Chercher une heure…" />
                </div>
              </div>
            </fieldset>

            <fieldset className="vitrine-bloc">
              <legend>La semaine</legend>
              <p className="vitrine-aide">
                Le poids de chaque soir : 0, on ne vend pas ; un soir à 2 vend deux fois plus qu’un soir à 1.
              </p>
              <Semaine poids={r.poids} parts={PARTS} capacite={capaciteSoir(catalogue)} />
            </fieldset>

            <div className="vitrine-pied">
              <button className="bouton primaire">{vitrine ? "Régénérer la vitrine" : "Créer la vitrine"}</button>
              <p className="vitrine-aide">
                Tout ce que le compte contient — RedBox, produits, ventes, stock, messages des machines — est effacé
                puis réinventé. Ses membres et leurs badges restent.
              </p>
            </div>
          </form>
        )}

        <section className="carte vitrine-catalogue">
          <div className="pousse">
            <h2>Catalogue des démos</h2>
            <p className="sous">
              {modele
                ? <>La démo de chaque inscription et la vitrine reprennent les produits, les prix, les photos et le
                    planogramme de <b>{modele.nom}</b> — {catalogue.produits.length} produits, {catalogue.plan.length} spires.</>
                : <>Aucun compte modèle : les démos utilisent le catalogue intégré. Choisissez un compte pour qu’elles
                    montrent ce que vous vendez vraiment.</>}
            </p>
            <p className="vitrine-aide">Les démos déjà ouvertes gardent leurs produits ; régénérez la vitrine pour l’appliquer.</p>
          </div>
          <form method="post" action="/api/admin/vitrine" className="vitrine-modele">
            <input type="hidden" name="action" value="modele" />
            <Choix name="modele_id" defaut={modele?.id} invite="Catalogue intégré" recherche="Chercher un compte…"
                   options={[{ valeur: "0", nom: "Catalogue intégré", detail: "11 produits dessinés" },
                             ...modeles.map((m) => ({ valeur: String(m.id), nom: m.nom, detail: `${m.produits} produits` }))]} />
            <button className="bouton">Utiliser</button>
          </form>
        </section>

        {vitrine ? (
          <section className="carte vitrine-danger">
            <div className="pousse">
              <h2>Rendre ce compte ordinaire</h2>
              <p className="sous">
                Le compte est vidé et retrouve les chiffres de la plateforme. Ses badges restent, et se gèrent depuis
                Comptes.
              </p>
            </div>
            <form method="post" action="/api/admin/vitrine">
              <input type="hidden" name="compte_id" value={vitrine.id} />
              <input type="hidden" name="action" value="quitter" />
              <button className="bouton danger">Vider et rendre ordinaire</button>
            </form>
          </section>
        ) : null}
      </main>
      <NavBasse page="admin_vitrine" />
    </>
  );
}
