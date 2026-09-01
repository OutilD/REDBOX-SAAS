import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, q1, euros, depuis, enLigne, codeCanal } from "@/db";
import { peutCharger, utilisateur } from "@/lib/auth";
import { canauxDe } from "@/lib/stock";
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
  maintenance_vu: string | null;
};

export default async function Detail({
  params, searchParams,
}: { params: Promise<{ id: string }>;
     searchParams: Promise<{ charge?: string; canaux?: string; refuses?: string;
                             reveil?: string; delier?: string; pin?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  const { charge, canaux: nCanaux, refuses, reveil, delier, pin } = await searchParams;

  const b = await q1<Borne>(
    `SELECT id, nom, adresse, vue_le, jeton, version, catalogue_version, sante,
            maintenance_pin, maintenance_pin_le, maintenance_vu
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
  const vides = canaux.filter((c) => c.quantite === 0 && c.produit_id).length;

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/bornes" className="bouton petit">‹</Link>
          <div className="pousse">
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-.03em" }}>{b.nom}</div>
            <div className="faible" style={{ fontSize: 13 }}>{b.adresse ?? "lieu non renseigné"}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0 4px" }}>
          <span className={`pilule ${!b.jeton ? "attente" : vivante ? "ok" : "mal"}`}>
            <i />{!b.jeton ? "à appairer" : vivante ? "en ligne" : `silencieuse, vue ${depuis(b.vue_le)}`}
          </span>
          {b.jeton && b.catalogue_version
            ? <span className={`pilule ${aJour ? "ok" : "attente"}`}>
                <i />{aJour ? "catalogue à jour" : "catalogue à synchroniser"}
              </span>
            : null}
          {b.version ? <span className="pilule">version {b.version}</span> : null}
          {soucis && soucis.n > 0
            ? <Link href="/ventes" className="pilule mal"><i />{soucis.n} à regarder</Link> : null}
        </div>

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

        {charge ? (
          <div className="carte" style={{ borderColor: "var(--vert)", marginTop: 14 }}>
            <span className="pilule ok"><i />{charge} unités envoyées sur {nCanaux} canaux</span>
            <p className="faible" style={{ margin: "10px 0 0", fontSize: 13.5 }}>
              Elles quittent votre réserve maintenant. La borne les inscrira à sa prochaine
              synchronisation — d’ici une trentaine de secondes si elle est en ligne.
              {Number(refuses) > 0
                ? ` ${refuses} ${Number(refuses) > 1 ? "canaux n’ont" : "canal n’a"} pas pu être servi en entier : place ou réserve insuffisante.`
                : ""}
            </p>
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

        <div className="bandeau quatre" style={{ marginTop: 14 }}>
          <div><div className="stat">
            <span className="valeur num petite">{euros(jour?.total ?? 0)}</span>
            <span className="libelle">encaissé aujourd’hui</span></div></div>
          <div><div className="stat">
            <span className="valeur num">{jour?.n ?? 0}</span>
            <span className="libelle">articles vendus</span></div></div>
          <div><div className="stat">
            <span className="valeur num">{unites}</span>
            <span className="libelle">unités en machine</span></div></div>
          <div><div className={`stat ${vides ? "alerte" : ""}`}>
            <span className="valeur num">{vides}</span>
            <span className="libelle">canaux vides</span></div></div>
        </div>

        {pin ? (
          <div className="carte" style={{ borderColor: "var(--vert)", marginTop: 14 }}>
            <span className="pilule ok"><i />Renouvellement demandé</span>
            <p className="faible" style={{ margin: "10px 0 0", fontSize: 13.5 }}>
              La borne a été réveillée : elle prend son nouveau code dans la seconde si
              elle est en ligne, à son retour sinon. D’ici là, l’ancien code fonctionne.
            </p>
          </div>
        ) : null}

        {reveil ? (
          <div className="carte" style={{ borderColor: "var(--vert)", marginTop: 14 }}>
            <span className="pilule ok"><i />Borne réveillée</span>
            <p className="faible" style={{ margin: "10px 0 0", fontSize: 13.5 }}>
              Elle tient une question ouverte en permanence : si elle est en ligne, elle
              synchronise dans la seconde. Sinon, elle le fera dès son retour.
            </p>
          </div>
        ) : null}

        {peutCharger(u) ? (
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <Link href={`/bornes/${id}/charger`} className="bouton primaire">Charger</Link>
            <Link href={`/reassort/fiche?b=${id}`} className="bouton">Fiche de réassort</Link>
            <Link href={`/bornes/${id}/planogramme`} className="bouton">Planogramme</Link>
            <Link href={`/bornes/${id}/affichage`} className="bouton">Affichage</Link>
            {b.jeton ? (
              <>
                <form method="post" action="/api/bornes/reveiller">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="retour" value={`/bornes/${id}`} />
                  <button className="bouton">Synchroniser maintenant</button>
                </form>
                <Link href={`/bornes/${id}?delier=1`} className="bouton discret">Désappairer…</Link>
              </>
            ) : null}
          </div>
        ) : null}

        {b.jeton && peutCharger(u) ? (
          <div className="carte" style={{ marginTop: 14 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong>Code de maintenance</strong>
              <span className="faible" style={{ fontSize: 13.5 }}>
                Pour ouvrir la console sur la machine.
              </span>
            </div>

            <div style={{ display: "flex", gap: 14, alignItems: "center",
                          marginTop: 10, flexWrap: "wrap" }}>
              <span className="num" style={{ fontSize: 30, fontWeight: 700,
                                             letterSpacing: "0.18em" }}>
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

        <h2>Canaux</h2>
        <div className="carte plate">
          <div className="lignes">
            {canaux.map((c) => {
              const part = c.capacite ? c.quantite / c.capacite : 0;
              const etat = c.quantite === 0 ? "mal" : c.quantite <= c.seuil_bas ? "attente" : "ok";
              return (
                <div className="ligne" key={c.canal_id}>
                  <span className="mono faible" style={{ width: 32 }}>{codeCanal(c.rangee, c.colonne)}</span>
                  <div className="corps">
                    <div className="nom">{c.nom ?? <span className="faible">canal libre</span>}</div>
                    <div className="meta">
                      {c.prix_vente_c !== null ? euros(c.prix_vente_c) : "—"}
                      {c.releve_le ? ` · relevé ${depuis(c.releve_le)}` : ""}
                    </div>
                    <div className="repartition" style={{ marginTop: 7, height: 6, maxWidth: 220 }}>
                      <span className={etat === "mal" ? "route" : "bornes"}
                            style={{ width: `${Math.round(part * 100)}%`,
                                     background: etat === "attente" ? "var(--ambre)"
                                               : etat === "mal" ? "var(--rouge)" : undefined }} />
                    </div>
                  </div>
                  <div className="fin">
                    <div className="num" style={{ fontWeight: 700 }}>
                      {c.quantite}
                      <span className="faible" style={{ fontWeight: 500 }}>/{c.capacite}</span>
                      {/*
                        L'ecart entre notre compte et celui de la machine. Il ne
                        se lisse pas : c'est le vol, la casse, le capteur muet ou
                        la saisie ratee, et c'est la seule facon de les voir.
                      */}
                      {c.quantite_borne !== null && c.quantite_borne !== c.quantite ? (
                        <span className="faible" style={{ fontWeight: 500, marginLeft: 6 }}
                              title={`La machine en compte ${c.quantite_borne}`}>
                          (borne&nbsp;{c.quantite_borne})
                        </span>
                      ) : null}
                    </div>
                    {c.en_route > 0 ? <div className="faible num" style={{ fontSize: 12, color: "var(--ambre)" }}>+{c.en_route}</div> : null}
                  </div>
                </div>
              );
            })}
            {canaux.length === 0 ? (
              <Repli titre="Aucun canal connu"
                     texte="Ils apparaissent au premier relevé de la machine." dedans />
            ) : null}
          </div>
        </div>

        {b.sante ? (
          <>
            <h2>Santé remontée</h2>
            <div className="carte plate">
              <div className="lignes">
                {Object.entries(b.sante).map(([k, v]) => (
                  <div className="ligne" key={k}>
                    <div className="corps"><div className="nom" style={{ fontWeight: 500 }}>{k.replace(/_/g, " ")}</div></div>
                    <div className="fin mono">{String(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </main>
      <NavBasse page="bornes" />
    </>
  );
}
