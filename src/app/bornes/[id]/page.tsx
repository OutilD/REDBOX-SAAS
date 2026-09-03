import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, q1, euros, depuis, enLigne, codeCanal } from "@/db";
import { peutCharger, utilisateur, peutVoirBorne, peutConfigurer } from "@/lib/auth";
import { canauxDe, type LigneCanal } from "@/lib/stock";
import { empreinteDe } from "@/lib/borne";
import { ROTATION_MIN } from "@/lib/maintenance";
import { Repli } from "../../repli";
import { IcoAlerte } from "../../icones";

export const dynamic = "force-dynamic";

type Borne = {
  id: number; nom: string; adresse: string | null; vue_le: Date | null;
  jeton: string | null; version: string | null; catalogue_version: string | null;
  sante: Record<string, unknown> | null;
  maintenance_pin: string | null; maintenance_pin_le: Date | null;
  hors_service: boolean; hors_service_texte: string | null; hors_service_le: Date | null;
  maintenance_vu: string | null;
  description: string | null; image_id: number | null;
};

/**
 * LES QUATRE FACONS DE REGARDER UN PLATEAU.
 *
 * « Tous » sert a se promener, dans l'ordre physique de la machine. Les trois
 * autres repondent a une question qu'on se posait en parcourant soixante lignes
 * des yeux : qu'est-ce qui est vide, qu'est-ce qui va l'etre, et ou nos livres
 * ne disent pas la meme chose que la machine.
 */
const FILTRES = [
  { cle: "", nom: "Tous" },
  { cle: "vides", nom: "Vides" },
  { cle: "bas", nom: "Bas" },
  { cle: "ecart", nom: "Écarts" },
] as const;

/**
 * La fiche d'une borne.
 *
 * TROIS QUESTIONS, DANS CET ORDRE : est-ce qu'elle tourne, qu'est-ce qu'elle a
 * dans le ventre, et qu'est-ce qu'il faut aller y faire.
 *
 * LES CANAUX SONT LE SUJET, ILS REMONTENT. Ils etaient tout en bas, sous le
 * formulaire de mise hors service et la carte du code de maintenance : deux
 * reglages qu'on touche trois fois par an poussaient hors de l'ecran la seule
 * chose qu'on vient lire tous les jours. Ils passent au-dessus, et les reglages
 * s'en vont dans un volet replie.
 *
 * ET ILS SE RANGENT PAR PLATEAU. Soixante lignes a plat, c'est une liste qu'on
 * parcourt sans rien voir. Le technicien, lui, ouvre un plateau a la fois — c'est
 * ce decoupage-la qu'il a sous les mains, et le numero de canal le dit deja.
 */
export default async function Detail({
  params, searchParams,
}: { params: Promise<{ id: string }>;
     searchParams: Promise<{ charge?: string; canaux?: string; refuses?: string;
                             reveil?: string; delier?: string; pin?: string;
                             reconcilie?: string; hs?: string; fiche?: string; e?: string;
                             c?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  // Une borne hors de sa portee n'existe pas pour lui : `notFound` plutot
  // qu'un refus, qui confirmerait au passage qu'elle existe.
  if (!peutVoirBorne(u, id)) notFound();
  const { charge, canaux: nCanaux, refuses, reveil, delier, pin, reconcilie, hs, fiche,
          c: filtre } = await searchParams;

  const b = await q1<Borne>(
    `SELECT id, nom, adresse, vue_le, jeton, version, catalogue_version, sante,
            maintenance_pin, maintenance_pin_le, maintenance_vu,
            hors_service, hors_service_texte, hors_service_le,
            description, image_id
       FROM borne WHERE id = $1 AND compte_id = $2`,
    [id, u.compte_id]);
  if (!b) notFound();

  const canaux = await canauxDe(id, u.compte_id);
  const jour = await q1<{ n: number; total: number }>(`
    SELECT COUNT(*)::int n, COALESCE(SUM(prix_c),0)::int total FROM vente
     WHERE borne_id = $1 AND statut = 'distribue' AND faite_le >= date_trunc('day', now())`, [id]);
  const soucis = await q1<{ n: number }>(`
    SELECT COUNT(*)::int n FROM vente
     WHERE borne_id = $1 AND statut <> 'distribue' AND traite_le IS NULL`, [id]);

  const enRoute = await q<{ lane: number; nom: string; quantite: number; fait_le: Date; par: string | null }>(`
    SELECT m.lane, p.nom, m.quantite, m.fait_le, m.par
      FROM mouvement m JOIN produit p ON p.id = m.produit_id
      JOIN borne b ON b.lieu_id = m.vers_lieu_id
     WHERE b.id = $1 AND m.motif = 'transfert' AND m.confirme_le IS NULL AND m.annule_le IS NULL
     ORDER BY m.fait_le`, [id]);

  // Le catalogue que la machine detient est-il celui d'aujourd'hui ? On compare
  // son empreinte a celle calculee maintenant. Sans ce reperage, une categorie
  // renommee ou un prix change peut dormir des heures sans qu'on le sache.
  const attendue = await empreinteDe(u.compte_id, id);
  const aJour = b.catalogue_version === attendue;

  // Un renouvellement demande se reconnait au code encore present dont la date
  // a ete effacee : le SaaS attend que la machine vienne prendre le suivant.
  const renouvellementDemande = Boolean(b.maintenance_pin) && !b.maintenance_pin_le;
  // Une borne qui n'annonce pas son code tourne sur une version anterieure :
  // elle reste au code d'usine et rien ne sert de lui en delivrer un.
  const codeGere = b.maintenance_vu !== null;
  // Delivre mais pas encore repris : le technicien doit savoir lequel emporter.
  const enRetard = codeGere && Boolean(b.maintenance_pin)
                   && b.maintenance_vu !== b.maintenance_pin;
  const peutRenouveler = peutCharger(u) && codeGere;

  const vivante = enLigne(b.vue_le);
  const unites = canaux.reduce((s, c) => s + c.quantite, 0);
  const affectes = canaux.filter((c) => c.produit_id !== null);
  const vides = affectes.filter((c) => c.quantite === 0).length;
  const bas = affectes.filter((c) => c.quantite > 0 && c.quantite <= c.seuil_bas).length;
  const ecarts = canaux.filter(
    (c) => c.quantite_borne !== null && c.quantite_borne !== c.quantite).length;
  const place = affectes.reduce((s, c) => s + Math.max(0, c.capacite - c.quantite), 0);

  const vue = FILTRES.find((f) => f.cle === filtre)?.cle ?? "";
  const visibles = canaux.filter((c) =>
    vue === "" ? true
    : vue === "vides" ? c.produit_id !== null && c.quantite === 0
    : vue === "bas" ? c.produit_id !== null && c.quantite > 0 && c.quantite <= c.seuil_bas
    : c.quantite_borne !== null && c.quantite_borne !== c.quantite);

  // Les plateaux, dans l'ordre ou ils sont empiles dans la machine.
  const plateaux = [...visibles.reduce((m, c) => {
    (m.get(c.rangee) ?? m.set(c.rangee, []).get(c.rangee)!).push(c);
    return m;
  }, new Map<number, LigneCanal[]>())].sort((a, b) => a[0] - b[0]);

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        {/*
          L'ENTETE : QUI ELLE EST, ET COMMENT ELLE VA.

          La photo se reconnait avant d'etre lue : c'est elle qui dit « celle du
          fond, derriere le flipper » plus vite qu'aucune phrase. Les pilules
          d'etat lui sont collees plutot que posees deux blocs plus bas — « en
          ligne » repond a la premiere question qu'on se pose sur une machine.
        */}
        <div className="tete-borne">
          <Link href="/bornes" className="bouton petit retour" aria-label="Retour aux bornes">‹</Link>
          {b.image_id ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/image/${b.image_id}`} alt="" className="photo-borne" />
          ) : null}
          <div className="qui">
            <h1>{b.nom}</h1>
            <div className="ou">{b.adresse ?? "lieu non renseigné"}</div>
            {b.description ? <p className="quoi">{b.description}</p> : null}
            <div className="etats">
              <span className={`pilule ${!b.jeton ? "attente" : vivante ? "ok" : "mal"}`}>
                <i />{!b.jeton ? "à appairer" : vivante ? "en ligne" : `silencieuse, vue ${depuis(b.vue_le)}`}
              </span>
              {b.hors_service ? <span className="pilule mal"><i />hors service</span> : null}
              {b.jeton && b.catalogue_version
                ? <span className={`pilule ${aJour ? "ok" : "attente"}`}>
                    <i />{aJour ? "catalogue à jour" : "catalogue à synchroniser"}
                  </span>
                : null}
              {b.version ? <span className="pilule">version {b.version}</span> : null}
              {soucis && soucis.n > 0
                ? <Link href="/ventes" className="pilule mal"><i />{soucis.n} à regarder</Link> : null}
            </div>
          </div>
        </div>

        {/* Les accuses de reception, tous au meme endroit et de la meme forme.
            Ils etaient cinq cartes presque identiques semees dans la page. */}
        {charge ? (
          <Avis titre={`${charge} unités envoyées sur ${nCanaux} canaux`}>
            Elles quittent votre réserve maintenant. La borne les inscrira à sa prochaine
            synchronisation — d’ici une trentaine de secondes si elle est en ligne.
            {Number(refuses) > 0
              ? ` ${refuses} ${Number(refuses) > 1 ? "canaux n’ont" : "canal n’a"} pas pu être servi en entier : place ou réserve insuffisante.`
              : ""}
          </Avis>
        ) : null}
        {hs !== undefined ? (
          <Avis titre={hs === "1" ? "Borne mise hors service" : "Borne remise en service"}>
            Elle a été réveillée : l’écran change dans la seconde si elle est en ligne,
            à son retour sinon.
          </Avis>
        ) : null}
        {pin ? (
          <Avis titre="Renouvellement demandé">
            La borne a été réveillée : elle prend son nouveau code dans la seconde si
            elle est en ligne, à son retour sinon. D’ici là, l’ancien code fonctionne.
          </Avis>
        ) : null}
        {reconcilie ? (
          <Avis titre={`Spire ${reconcilie} réconciliée`}>
            Nos livres sont à jour et la correction part vers la machine : elle la
            pose sur son compteur à sa prochaine synchronisation. L’écart affiché
            disparaîtra à ce moment-là, pas avant.
          </Avis>
        ) : null}
        {reveil ? (
          <Avis titre="Borne réveillée">
            Elle tient une question ouverte en permanence : si elle est en ligne, elle
            synchronise dans la seconde. Sinon, elle le fera dès son retour.
          </Avis>
        ) : null}
        {fiche === "ok" ? <p className="avis-ok">Fiche enregistrée.</p> : null}
        {fiche === "refus" ? (
          <p className="erreur">
            Photo refusée : JPEG, PNG ou WebP, 2 Mo au plus. Le reste de la fiche a
            bien été enregistré.
          </p>
        ) : null}

        {/* Delier n'efface rien de l'historique, mais rend la machine a quelqu'un
            d'autre : cela merite une question, pas un clic. */}
        {delier && b.jeton ? (
          <div className="avis" style={{ borderLeftColor: "var(--rouge)" }}>
            <IcoAlerte size={17} />
            <div className="dit">
              <div className="titre">Désappairer « {b.nom} » ?</div>
              <div className="texte">
                La machine cessera de répondre à ce compte et réaffichera un code
                d’appairage. Vos ventes et votre historique restent ici — ils vous
                appartiennent. La borne, elle, garde son catalogue et ses visuels :
                le compte qui l’adoptera ensuite les reprendra tels quels.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flex: "none", alignItems: "center" }}>
              <Link href={`/bornes/${id}`} className="bouton petit">Annuler</Link>
              <form method="post" action={`/api/bornes/${id}/desapparier`}>
                <button className="bouton petit danger">Désappairer</button>
              </form>
            </div>
          </div>
        ) : null}

        {b.hors_service ? (
          <div className="carte chaude" style={{ marginTop: 14 }}>
            <strong>Cette borne est hors service.</strong>
            <p className="faible" style={{ margin: "8px 0 14px", fontSize: 14 }}>
              Elle n’encaisse plus rien et affiche l’écran d’indisponibilité
              {b.hors_service_texte ? ` : « ${b.hors_service_texte} »` : ""}.
              {b.hors_service_le ? ` Depuis ${depuis(b.hors_service_le)}.` : ""}
              {" "}Elle continue de se synchroniser : ses ventes remontent et l’ordre
              inverse la joindra.
            </p>
            {peutCharger(u) ? (
              <form method="post" action={`/api/bornes/${id}/hors-service`}>
                <input type="hidden" name="actif" value="0" />
                <button className="bouton large">Remettre en service</button>
              </form>
            ) : null}
          </div>
        ) : null}

        {!b.jeton ? (
          <div className="carte chaude" style={{ marginTop: 14 }}>
            <strong>Cette borne n’est pas encore appairée.</strong>
            <p className="faible" style={{ margin: "8px 0 14px", fontSize: 14 }}>
              Sur la machine : Maintenance → SaaS. Elle affiche un code et un QR à porter ici.
            </p>
            <Link href="/bornes/ajouter" className="bouton large">Appairer une borne</Link>
          </div>
        ) : null}

        {/* Le chiffre du jour est le phare ; ce que la machine porte l'entoure.
            Quatre tuiles de meme taille laissaient l'oeil tomber sur la premiere. */}
        <section className="chiffres-cle" aria-label="La borne aujourd’hui">
          <div className="phare">
            <div className="txt">
              <h2 className="etiquette">Encaissé aujourd’hui</h2>
              <div className="ligne-chiffre">
                <span className="chiffre num">{euros(jour?.total ?? 0)}</span>
              </div>
              <p className="contre">
                <b className="num">{jour?.n ?? 0}</b> article{(jour?.n ?? 0) > 1 ? "s" : ""} distribué
                {(jour?.n ?? 0) > 1 ? "s" : ""} depuis minuit.
              </p>
            </div>
          </div>
          <div className="mesures">
            <div className="mesure">
              <span className="etiquette">Unités en machine</span>
              <span className="ligne-chiffre"><span className="chiffre num">{unites}</span></span>
              <span className="dessous">{place} places libres</span>
            </div>
            <div className="mesure">
              <span className="etiquette">Canaux vides</span>
              <span className="ligne-chiffre">
                <span className={`chiffre num ${vides ? "mal" : ""}`}>{vides}</span>
              </span>
              <span className="dessous">
                sur {affectes.length} canal{affectes.length > 1 ? "aux" : ""} affecté{affectes.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="mesure">
              <span className="etiquette">Écarts machine</span>
              <span className="ligne-chiffre">
                <span className={`chiffre num ${ecarts ? "attention" : ""}`}>{ecarts}</span>
              </span>
              <span className="dessous">
                {ecarts ? "nos livres et la machine divergent" : "nos livres et la machine s’accordent"}
              </span>
            </div>
          </div>
        </section>

        {/*
          UNE ACTION EN AVANT, LES AUTRES DERRIERE.

          Les six boutons avaient le meme poids : « Charger », qu'on fait chaque
          semaine devant la machine ouverte, se lisait comme « Affichage », qu'on
          regle une fois. Le geste du jour prend le rouge ; le reste suit.
        */}
        {peutCharger(u) ? (
          <div className="rangee-actions" style={{ margin: "16px 0 4px" }}>
            <Link href={`/bornes/${id}/charger`} className="bouton primaire">Charger</Link>
            <Link href={`/reassort/fiche?b=${id}`} className="bouton">Fiche de réassort</Link>
            <Link href={`/bornes/${id}/planogramme`} className="bouton">Planogramme</Link>
            <Link href={`/bornes/${id}/affichage`} className="bouton">Affichage</Link>
            {peutConfigurer(u)
              ? <Link href={`/bornes/${id}/fiche`} className="bouton">Modifier la fiche</Link>
              : null}
            {b.jeton ? (
              <form method="post" action="/api/bornes/reveiller">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="retour" value={`/bornes/${id}`} />
                <button className="bouton">Synchroniser</button>
              </form>
            ) : null}
          </div>
        ) : null}

        {enRoute.length > 0 ? (
          <>
            <h2>En route vers cette borne</h2>
            <div className="carte plate">
              <div className="lignes">
                {enRoute.map((m, i) => (
                  <div className="ligne" key={i}>
                    <span className="pilule attente"><i /></span>
                    <div className="corps">
                      <div className="nom">{m.nom}</div>
                      <div className="meta">canal {m.lane} · saisi {depuis(m.fait_le)}{m.par ? ` par ${m.par}` : ""}</div>
                    </div>
                    <div className="fin num" style={{ fontWeight: 700 }}>+{m.quantite}</div>
                  </div>
                ))}
              </div>
              <p className="faible" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
                Tant que la machine n’a pas confirmé, ces unités ne comptent pas dans son stock.
              </p>
            </div>
          </>
        ) : null}

        {/* ---------------------------------------------------------- canaux */}
        <div className="titre-section">
          <h2>Canaux</h2>
          <nav className="periodes petites" aria-label="Filtrer les canaux">
            {FILTRES.map((f) => {
              const n = f.cle === "" ? canaux.length
                      : f.cle === "vides" ? vides
                      : f.cle === "bas" ? bas : ecarts;
              return (
                <Link key={f.cle || "tous"} href={f.cle ? `/bornes/${id}?c=${f.cle}` : `/bornes/${id}`}
                      aria-current={f.cle === vue ? "true" : undefined}>
                  {f.nom} <span className="compte num">{n}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {canaux.length === 0 ? (
          <Repli titre="Aucun canal connu"
                 texte="Ils apparaissent au premier relevé de la machine." dedans />
        ) : visibles.length === 0 ? (
          <Repli titre="Aucun canal dans cet état"
                 texte="C’est une bonne nouvelle : rien à faire de ce côté-là."
                 action={{ nom: "Voir tous les canaux", vers: `/bornes/${id}` }} dedans />
        ) : (
          plateaux.map(([rangee, liste]) => (
            <div className="plateau" key={rangee}>
              <div className="tete-plateau">
                <span className="nom">Plateau {rangee}</span>
                <span className="resume">
                  {liste.length} canal{liste.length > 1 ? "aux" : ""} ·{" "}
                  {liste.reduce((s, c) => s + c.quantite, 0)} unités
                </span>
              </div>
              <div className="lignes">
                {liste.map((c) => (
                  <Canal key={c.canal_id} c={c} borne={id} peut={peutCharger(u)} />
                ))}
              </div>
            </div>
          ))
        )}

        {/*
          LES REGLAGES SE REPLIENT.

          Le code de maintenance et la mise hors service se touchent trois fois
          par an ; ils occupaient deux cartes pleines entre les boutons et les
          canaux, et poussaient hors de l'ecran la seule chose qu'on vient lire
          tous les jours. `<details>` est du HTML : ca s'ouvre sans JavaScript,
          au clavier comme au doigt.
        */}
        {b.jeton && peutCharger(u) ? (
          <details className="groupe" style={{ marginTop: 22 }}>
            <summary>
              <span className="chevron">▶</span>
              <div className="pousse" style={{ minWidth: 0 }}>
                <div className="titre">Maintenance et réglages</div>
                <div className="resume">
                  Code de la console, mise hors service, désappairage
                  {enRetard ? " · un code attend d’être repris" : ""}
                </div>
              </div>
            </summary>
            <div className="dedans" style={{ padding: 14 }}>
              <div className="carte">
                <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <strong>Code de maintenance</strong>
                  <span className="faible" style={{ fontSize: 13.5 }}>
                    Pour ouvrir la console sur la machine.
                  </span>
                </div>

                <div style={{ display: "flex", gap: 14, alignItems: "center",
                              marginTop: 10, flexWrap: "wrap" }}>
                  <span className="num code-maintenance">
                    {!codeGere ? "123450" : (b.maintenance_vu || b.maintenance_pin || "······")}
                  </span>
                  {peutRenouveler ? (
                    <form method="post" action={`/api/bornes/${id}/maintenance`}>
                      <button className="bouton petit">Renouveler</button>
                    </form>
                  ) : null}
                </div>

                {/*
                  Ce qui compte n'est pas la date du code, c'est de savoir si la
                  machine le porte. Un renouvellement demande laisse l'ancien code
                  actif jusqu'a la synchronisation : le dire evite le deplacement
                  d'un technicien avec un code que la borne refuse.
                */}
                <p className="faible" style={{ margin: "10px 0 0", fontSize: 13.5 }}>
                  {!codeGere
                    ? "Cette borne tourne encore sur une version qui ne reçoit pas de code : elle ouvre avec le code d’usine. Mettez son application à jour pour qu’elle prenne un code propre."
                    : enRetard
                      ? "Un nouveau code est prêt mais la machine ne l’a pas encore repris. Emportez celui affiché — c’est celui qu’elle accepte."
                      : renouvellementDemande
                        ? "Renouvellement demandé. La machine ouvre encore avec le code ci-dessus jusqu’à sa prochaine synchronisation."
                        : `Délivré ${depuis(b.maintenance_pin_le)}. Il est renouvelé toutes les ${ROTATION_MIN} min, au moment où la machine vient le chercher.`}
                </p>
              </div>

              {!b.hors_service ? (
                <form method="post" action={`/api/bornes/${id}/hors-service`}
                      className="carte" style={{ marginTop: 12 }}>
                  <input type="hidden" name="actif" value="1" />
                  <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                    <strong>Mettre hors service</strong>
                    <span className="faible" style={{ fontSize: 13.5 }}>
                      Arrête la vente sans couper la machine.
                    </span>
                  </div>

                  <label htmlFor="hs-texte" style={{ marginTop: 10 }}>
                    Ce que le client lira sur l’écran
                  </label>
                  <input id="hs-texte" name="texte" maxLength={90}
                         placeholder="Réouverture lundi · Maintenance en cours" />

                  <div className="rangee-actions" style={{ marginTop: 12 }}>
                    <button className="bouton">Mettre hors service</button>
                  </div>

                  <p className="faible" style={{ margin: "10px 0 0", fontSize: 13 }}>
                    La borne garde sa liaison : elle remonte ses ventes, reçoit ses
                    transferts, et se rouvre d’ici sans déplacement. Une vente en cours va
                    à son terme — on ne coupe pas une distribution commencée.
                  </p>
                </form>
              ) : null}

              <div className="carte" style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <strong>Désappairer</strong>
                  <span className="faible" style={{ fontSize: 13.5 }}>
                    Rendre la machine à un autre compte.
                  </span>
                </div>
                <p className="faible" style={{ margin: "8px 0 12px", fontSize: 13 }}>
                  Vos ventes et votre historique restent ici — ils vous appartiennent.
                </p>
                <Link href={`/bornes/${id}?delier=1`} className="bouton danger">Désappairer…</Link>
              </div>

              {b.sante ? (
                <div className="carte plate" style={{ marginTop: 12 }}>
                  <strong style={{ fontSize: 14 }}>Santé remontée</strong>
                  <div className="lignes" style={{ marginTop: 4 }}>
                    {Object.entries(b.sante).map(([k, v]) => (
                      <div className="ligne" key={k}>
                        <div className="corps">
                          <div className="nom" style={{ fontWeight: 500 }}>{k.replace(/_/g, " ")}</div>
                        </div>
                        <div className="fin mono">{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </main>
      <NavBasse page="bornes" />
    </>
  );
}

/** Un accuse de reception : ce qui vient de se passer, et ce qui va suivre. */
function Avis({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="avis reussi">
      <div className="dit">
        <div className="titre">{titre}</div>
        <div className="texte">{children}</div>
      </div>
    </div>
  );
}

/**
 * UN CANAL.
 *
 * La jauge dit d'un coup d'oeil ce qu'il reste, et son etat est ECRIT a cote :
 * une couleur qui porte seule ne dit rien a qui ne la voit pas, ni sur une fiche
 * imprimee qu'on emporte devant la machine.
 *
 * L'ECART SE LIT COMME UN ECART, pas comme un second total. « borne 10 » se
 * lisait « borne numero 10 » — le mot designe la machine partout ailleurs, et il
 * tombait ici a cote d'un autre nombre. On montre donc la difference signee, en
 * ambre : ce n'est pas une information neutre, c'est du stock qui manque ou qui
 * apparait sans raison. Et il MENE quelque part : le voir sans pouvoir le regler
 * laisse l'exploitant devant un chiffre qu'il sait faux et qu'il ne peut
 * qu'attendre.
 */
function Canal({ c, borne, peut }: { c: LigneCanal; borne: number; peut: boolean }) {
  const part = c.capacite ? Math.round((c.quantite / c.capacite) * 100) : 0;
  const etat = c.produit_id === null ? "libre"
             : c.quantite === 0 ? "vide"
             : c.quantite <= c.seuil_bas ? "bas" : "plein";
  const mot = etat === "vide" ? "vide" : etat === "bas" ? "bas" : "";
  const ecart = c.quantite_borne !== null && c.quantite_borne !== c.quantite
    ? c.quantite_borne - c.quantite : null;

  return (
    <div className="ligne canal" data-etat={etat}>
      <span className="code mono">{codeCanal(c.rangee, c.colonne)}</span>
      <div className="corps">
        <div className="nom">{c.nom ?? <span className="faible">canal libre</span>}</div>
        <div className="meta">
          {c.prix_vente_c !== null ? euros(c.prix_vente_c) : "—"}
          {c.releve_le ? ` · relevé ${depuis(c.releve_le)}` : ""}
          {mot ? <b className="mot-etat">{mot}</b> : null}
        </div>
        {c.produit_id !== null ? (
          <div className="jauge" data-etat={etat} title={`${c.quantite} sur ${c.capacite}`}>
            <span style={{ width: `${part}%` }} />
          </div>
        ) : null}
      </div>
      <div className="fin">
        <div className="num compteur">
          {c.quantite}<span className="sur">/{c.capacite}</span>
        </div>
        {ecart !== null ? (
          <Link href={`/bornes/${borne}/canal/${c.lane}/reconcilier`} className="ecart"
                title={`La machine en compte ${c.quantite_borne}, nous ${c.quantite} — réconcilier`}>
            {ecart > 0 ? "+" : "−"}{Math.abs(ecart)} machine
          </Link>
        ) : peut && c.produit_id ? (
          <Link href={`/bornes/${borne}/canal/${c.lane}/reconcilier`} className="corriger"
                title="Corriger le compteur de cette spire">corriger</Link>
        ) : null}
        {c.en_route > 0 ? <div className="arrive num">+{c.en_route} en route</div> : null}
      </div>
    </div>
  );
}
