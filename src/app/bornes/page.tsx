import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q, enLigne, depuis, pli } from "@/db";
import { utilisateur } from "@/lib/auth";
import { Repli } from "../repli";
import { IcoBorne, IcoLoupe } from "../icones";

export const dynamic = "force-dynamic";

type Ligne = {
  id: number; nom: string; adresse: string | null; vue_le: Date | null;
  jeton: string | null; version: string | null;
  canaux: number; affectes: number; vides: number; bas: number;
  unites: number; capacite: number; en_route: number;
};

/**
 * LES QUATRE FACONS DE REGARDER UN PARC.
 *
 * « Toutes » sert a retrouver une machine qu'on connait, dans l'ordre de son nom.
 * Les trois autres repondent a la question qu'on se posait en parcourant vingt
 * cartes des yeux : laquelle faut-il aller voir, et pourquoi.
 */
const VUES = [
  { cle: "", nom: "Toutes" },
  { cle: "charger", nom: "À charger" },
  { cle: "muettes", nom: "Hors ligne" },
  { cle: "appairer", nom: "À appairer" },
] as const;

/**
 * Le parc.
 *
 * LA QUESTION EST « LAQUELLE DOIS-JE ALLER VOIR ». Vingt cartes identiques rangees
 * par nom n'y repondent pas : il fallait lire chaque pilule, une par une, pour
 * trouver celle qui a huit canaux vides. Trois chiffres en tete disent l'etat du
 * parc d'un coup, trois filtres isolent ce qui demande un deplacement, et chaque
 * carte porte desormais son taux de remplissage — deux machines ne se comparent
 * pas sur « 3 canaux vides » sans savoir sur combien.
 *
 * L'ORDRE RESTE CELUI DES NOMS. Trier par urgence ferait danser la liste d'une
 * visite a l'autre, et on ouvre aussi cette page pour retrouver une machine dont
 * on connait le nom. Ce sont les filtres qui font remonter les problemes, pas le
 * tri.
 */
export default async function Bornes({ searchParams }:
  { searchParams: Promise<{ reveil?: string; q?: string; v?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const params = await searchParams;
  const reveil = params.reveil;
  const cherche = (params.q ?? "").trim();
  const vue = VUES.find((x) => x.cle === params.v)?.cle ?? "";

  const lien = (chg: { q?: string; v?: string }) => {
    const p = new URLSearchParams();
    const qq = chg.q ?? cherche;
    const vv = chg.v ?? vue;
    if (qq) p.set("q", qq);
    if (vv) p.set("v", vv);
    const s = p.toString();
    return s ? `/bornes?${s}` : "/bornes";
  };

  const bornes = await q<Ligne>(`
    SELECT b.id, b.nom, b.adresse, b.vue_le, b.jeton, b.version,
           COUNT(c.id)::int         AS canaux,
           COUNT(c.produit_id)::int AS affectes,
           -- UN CANAL SANS PRODUIT N'EST PAS UN CANAL VIDE. On comptait toutes
           -- les spires a zero : une machine dont six emplacements n'ont jamais
           -- ete affectes s'annoncait « 6 canaux vides », et on se deplacait pour
           -- un planogramme incomplet en croyant a une rupture.
           COALESCE(SUM(CASE WHEN c.produit_id IS NOT NULL AND c.quantite = 0
                             THEN 1 ELSE 0 END),0)::int                          AS vides,
           COALESCE(SUM(CASE WHEN c.produit_id IS NOT NULL AND c.quantite > 0
                              AND c.quantite <= c.seuil_bas THEN 1 ELSE 0 END),0)::int AS bas,
           COALESCE(SUM(c.quantite),0)::int                                      AS unites,
           COALESCE(SUM(CASE WHEN c.produit_id IS NOT NULL
                             THEN c.capacite ELSE 0 END),0)::int                 AS capacite,
           COALESCE((SELECT SUM(m.quantite)::int FROM mouvement m
                      WHERE m.vers_lieu_id = b.lieu_id AND m.motif = 'transfert'
                        AND m.confirme_le IS NULL AND m.annule_le IS NULL),0)    AS en_route
      FROM borne b LEFT JOIN canal c ON c.borne_id = b.id
     WHERE b.compte_id = $1
       -- LA PORTEE. Nul veut dire toutes les bornes du compte, et c'est le cas
       -- ordinaire ; une liste restreint a ce qu'on a ouvert a cette personne.
       AND ($2::bigint[] IS NULL OR b.id = ANY($2))
     GROUP BY b.id ORDER BY b.nom`, [u.compte_id, u.bornes]);

  // Les totaux portent sur TOUT le parc, jamais sur le filtre en cours : un
  // chiffre d'entete qui bouge quand on tape dans la recherche ne dit plus si le
  // parc va bien ou si l'on regarde trois machines sur vingt.
  const enLigneN = bornes.filter((b) => b.jeton && enLigne(b.vue_le)).length;
  const aAppairer = bornes.filter((b) => !b.jeton).length;
  const muettes = bornes.filter((b) => b.jeton && !enLigne(b.vue_le)).length;
  const vides = bornes.reduce((s, b) => s + b.vides, 0);
  const bas = bornes.reduce((s, b) => s + b.bas, 0);
  const unites = bornes.reduce((s, b) => s + b.unites, 0);
  const capacite = bornes.reduce((s, b) => s + b.capacite, 0);
  const aCharger = bornes.filter((b) => b.vides > 0 || b.bas > 0).length;

  const mots = pli(cherche);
  const visibles = bornes
    .filter((b) => vue === "" ? true
                 : vue === "charger" ? b.vides > 0 || b.bas > 0
                 : vue === "muettes" ? Boolean(b.jeton) && !enLigne(b.vue_le)
                 : !b.jeton)
    .filter((b) => !mots || pli(b.nom).includes(mots) || pli(b.adresse ?? "").includes(mots));

  const filtre = cherche !== "" || vue !== "";

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Bornes</h1>
            <p className="sous">
              {bornes.length === 0 ? "Aucune borne sur ce compte."
                : `${bornes.length} machine${bornes.length > 1 ? "s" : ""} sur ce compte.`}
            </p>
          </div>
          {bornes.length > 0 ? (
            <div className="rangee-actions">
              <Link href="/bornes/ajouter" className="bouton primaire">+ Ajouter une borne</Link>
              <form method="post" action="/api/bornes/reveiller">
                <input type="hidden" name="retour" value="/bornes" />
                <button className="bouton">Tout synchroniser</button>
              </form>
            </div>
          ) : null}
        </div>

        {reveil ? (
          <div className="avis reussi">
            <div className="dit">
              <div className="titre">
                {reveil} borne{Number(reveil) > 1 ? "s" : ""} réveillée{Number(reveil) > 1 ? "s" : ""}
              </div>
              <div className="texte">
                Celles qui sont en ligne synchronisent dans la seconde ; les autres le feront
                dès leur retour.
              </div>
            </div>
          </div>
        ) : null}

        {bornes.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucune borne sur ce compte"
                 texte="Sur la machine : Maintenance → SaaS → Demander l’appairage. Elle affiche un code de six caractères que vous saisissez ici."
                 action={{ nom: "Appairer une borne", vers: "/bornes/ajouter" }} />
        ) : (
          <>
            {/* L'etat du parc d'un coup : ce qui repond, et ce qui manque. */}
            <section className="chiffres-cle" aria-label="État du parc">
              <div className="phare colonne">
                <div className="txt">
                  <h2 className="etiquette">Machines en ligne</h2>
                  <div className="ligne-chiffre">
                    <span className="chiffre num">{enLigneN}</span>
                    <span className="sur-total num">/ {bornes.length}</span>
                  </div>
                  <p className="contre">
                    {muettes > 0
                      ? <><b className="num">{muettes}</b> silencieuse{muettes > 1 ? "s" : ""} depuis plus de quinze minutes</>
                      : <>tout le parc a donné signe de vie récemment</>}
                    {aAppairer > 0
                      ? <> · <b className="num">{aAppairer}</b> à appairer</>
                      : null}
                  </p>
                </div>
              </div>
              <div className="mesures">
                <div className="mesure">
                  <span className="etiquette">Canaux vides</span>
                  <span className="ligne-chiffre">
                    <span className={`chiffre num ${vides ? "mal" : ""}`}>{vides}</span>
                  </span>
                  <span className="dessous">
                    {bas > 0 ? `et ${bas} bientôt à sec` : "aucun canal à sec"}
                  </span>
                </div>
                <div className="mesure">
                  <span className="etiquette">Machines à charger</span>
                  <span className="ligne-chiffre">
                    <span className={`chiffre num ${aCharger ? "attention" : ""}`}>{aCharger}</span>
                  </span>
                  <span className="dessous">
                    {aCharger ? "un canal vide ou bas au moins" : "rien ne demande un déplacement"}
                  </span>
                </div>
                <div className="mesure">
                  <span className="etiquette">Unités en machine</span>
                  <span className="ligne-chiffre"><span className="chiffre num">{unites}</span></span>
                  <span className="dessous">
                    {capacite > 0
                      ? `${Math.round((unites / capacite) * 100)} % de la place occupée`
                      : "aucun planogramme défini"}
                  </span>
                </div>
              </div>
            </section>

            {/* Chercher et filtrer, comme sur « Mon stock » : le formulaire part
                en GET, les filtres sont des liens, tout tient dans l'adresse. */}
            <div className="barre-outils">
              <form method="get" action="/bornes" className="champ-recherche" role="search">
                <IcoLoupe size={17} />
                <input type="search" name="q" defaultValue={cherche} maxLength={60}
                       placeholder="Chercher une machine, une adresse…"
                       aria-label="Chercher une borne" />
                {vue ? <input type="hidden" name="v" value={vue} /> : null}
                <button type="submit" className="bouton petit">Chercher</button>
              </form>
              <nav className="periodes petites" aria-label="Filtrer le parc">
                {VUES.map((x) => {
                  const n = x.cle === "" ? bornes.length
                          : x.cle === "charger" ? aCharger
                          : x.cle === "muettes" ? muettes : aAppairer;
                  return (
                    <Link key={x.cle || "toutes"} href={lien({ v: x.cle })}
                          aria-current={x.cle === vue ? "true" : undefined}>
                      {x.nom} <span className="compte num">{n}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {visibles.length === 0 ? (
              <Repli icone={<IcoBorne />} titre="Aucune machine ne correspond"
                     texte={cherche
                       ? "Vérifiez l’orthographe, ou cherchez sur l’adresse plutôt que sur le nom."
                       : "C’est une bonne nouvelle : rien à faire de ce côté-là."}
                     action={{ nom: "Voir tout le parc", vers: "/bornes" }} dedans />
            ) : (
              <>
                {filtre ? (
                  <p className="note-lecture">
                    {visibles.length} machine{visibles.length > 1 ? "s" : ""} sur {bornes.length}
                    {cherche ? <> pour « {cherche} »</> : null}.{" "}
                    <Link href="/bornes" style={{ textDecoration: "underline" }}>Tout revoir</Link>
                  </p>
                ) : null}
                <div className="grille large" style={{ marginTop: 14 }}>
                  {visibles.map((b) => <CarteBorne key={b.id} b={b} />)}
                </div>
              </>
            )}
          </>
        )}
      </main>
      <NavBasse page="bornes" />
    </>
  );
}

/**
 * Une machine du parc.
 *
 * LE TAUX DE REMPLISSAGE PLUTOT QU'UN COMPTE SEUL. « 3 canaux vides » ne se
 * compare pas d'une machine a l'autre sans savoir sur combien ; la jauge donne
 * l'echelle avant qu'on lise le chiffre, et son etat est ecrit a cote — une
 * couleur qui porte seule ne dit rien a qui ne la voit pas.
 */
function CarteBorne({ b }: { b: Ligne }) {
  const vivante = enLigne(b.vue_le);
  const part = b.capacite > 0 ? Math.round((b.unites / b.capacite) * 100) : 0;
  const etat = b.vides > 0 ? "vide" : b.bas > 0 ? "bas" : "plein";

  return (
    <Link href={`/bornes/${b.id}`} className="carte-borne" data-etat={etat}>
      <div className="rangee">
        <div className="pousse" style={{ minWidth: 0 }}>
          <div className="nom">{b.nom}</div>
          <div className="ou">{b.adresse ?? "lieu non renseigné"}</div>
        </div>
        <span className="fleche" aria-hidden="true">›</span>
      </div>

      {b.affectes > 0 ? (
        <div className="remplissage">
          <div className="jauge" role="img"
               aria-label={`${part} % de la place occupée`}>
            <span style={{ width: `${part}%` }} />
          </div>
          <div className="dit">
            <b className="num">{part} %</b> · {b.unites} unité{b.unites > 1 ? "s" : ""} sur{" "}
            {b.affectes} canal{b.affectes > 1 ? "aux" : ""}
          </div>
        </div>
      ) : (
        <div className="remplissage">
          <div className="dit faible">Aucun canal affecté — le planogramme reste à définir.</div>
        </div>
      )}

      <div className="etats">
        <span className={`pilule ${!b.jeton ? "attente" : vivante ? "ok" : "mal"}`}>
          <i />{!b.jeton ? "à appairer" : vivante ? "en ligne" : `vue ${depuis(b.vue_le)}`}
        </span>
        {b.vides > 0
          ? <span className="pilule mal">
              <i />{b.vides} {b.vides > 1 ? "canaux vides" : "canal vide"}</span>
          : b.bas > 0
            ? <span className="pilule attente"><i />{b.bas} bas</span>
            : b.affectes > 0
              ? <span className="pilule ok"><i />bien garni</span>
              : null}
        {b.en_route > 0
          ? <span className="pilule attente"><i />{b.en_route} en route</span> : null}
      </div>
    </Link>
  );
}
