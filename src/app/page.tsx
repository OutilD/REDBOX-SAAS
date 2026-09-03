import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "./chrome";
import { BarresClassees, Courbes, teinte } from "./graphes";
import { IcoAlerte, IcoFleche, IcoHorloge } from "./icones";
import { q, euros, depuis, enLigne } from "@/db";
import { utilisateur } from "@/lib/auth";
import { autonomie, avancement, categoriesDansLeTemps, entete, FENETRES, parBorne,
         parJour, parProduit, type Autonomie, type Avancement, type ParBorne,
         type ParProduit, DEFAUT } from "@/lib/tableau";
import { Repli } from "./repli";
import { IcoBorne, IcoReception, IcoStock, IcoVentes } from "./icones";

export const dynamic = "force-dynamic";

/**
 * Le tableau de bord.
 *
 * Quatre questions, dans cet ordre : est-ce que ca tourne, combien ca rapporte,
 * quelle borne marche le mieux, et qu'est-ce qui va me manquer.
 */
export default async function Tableau(
  { searchParams }: { searchParams: Promise<{ f?: string; b?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  const { f, b } = await searchParams;
  const fen = FENETRES.find((x) => x.cle === f) ?? DEFAUT;
  const j = fen.jours;

  /**
   * LA PORTEE DU TABLEAU : LE FILTRE, OU CE QU'ON A LE DROIT DE VOIR.
   *
   * Les deux se combinent au lieu de se remplacer. Une personne invitee sur une
   * machine ne peut pas en choisir une autre : on ne retient son choix que s'il
   * tombe dans ce qui lui est ouvert. Sans quoi le filtre, qui n'est qu'un
   * confort d'affichage, serait devenu une porte.
   */
  const machines = await q<{ id: number; nom: string }>(
    `SELECT id, nom FROM borne
      WHERE compte_id = $1 AND ($2::bigint[] IS NULL OR id = ANY($2))
      ORDER BY nom`, [u.compte_id, u.bornes]);
  const choisie = machines.find((m) => String(m.id) === b) ?? null;
  const portee = choisie ? [choisie.id] : u.bornes;

  // Le depot et la mise en route sont l'affaire de l'exploitant : ni l'un ni
  // l'autre ne veut dire quoi que ce soit pour qui n'a qu'une machine.
  const sienDuCompte = u.bornes === null;

  const [avance, tete, jours, bornes, categories, stocks, produits] = await Promise.all([
    sienDuCompte ? avancement(u.compte_id) : null,
    entete(u.compte_id, j, portee),
    parJour(u.compte_id, j, portee),
    parBorne(u.compte_id, j, portee),
    categoriesDansLeTemps(u.compte_id, j, portee),
    sienDuCompte ? autonomie(u.compte_id, j) : [],
    parProduit(u.compte_id, j, portee),
  ]);

  const sommet = Math.max(1, ...jours.map((x) => x.ca));
  const meilleur = jours.reduce((a, b) => (b.ca > a.ca ? b : a), jours[0]);
  const parJourMoyen = jours.length ? Math.round(tete.ca / jours.length) : 0;
  const classees = [...categories.series].sort((a, b) => b.total - a.total);

  const risques = stocks.filter((s) => s.jours_restants !== null && s.jours_restants <= 21);
  const dormants = stocks.filter((s) => s.vendus === 0 && s.stock > 0);

  // La mise en route ne s'affiche que tant qu'elle n'est PAS FINIE.
  //
  // Je la declenchais sur « aucune vente », et c'etait faux : une borne qu'on
  // vient d'appairer a deja son catalogue et son stock, mais elle n'a pas encore
  // vendu. Son proprietaire voyait donc un ecran de bienvenue a la place de ses
  // donnees — et pouvait croire que rien n'etait remonte. Ce qui compte, c'est
  // qu'il y ait un catalogue ET une machine appairee.
  //
  // L'ecran de bienvenue est une marche a suivre pour l'exploitant : creer un
  // catalogue, appairer une machine. Quelqu'un invite sur une borne n'a aucune
  // de ces mains-la, et la lui montrer serait lui demander de faire un travail
  // qu'il ne peut pas faire. `avance` est nul pour lui, et on passe.
  const enRoute = avance !== null && (avance.produits === 0 || avance.appairees === 0);
  if (enRoute && avance) {
    return (
      <>
        <Entete page="tableau" />
        <main className="ecran">
          <h1>Bienvenue</h1>
          <p className="sous">
            Compte {u.compte} — voici ce qu’il reste à faire pour que vos bornes se mettent
            à vendre.
          </p>
          <PremiersPas a={avance} />
        </main>
        <NavBasse page="tableau" />
      </>
    );
  }

  return (
    <>
      <Entete page="tableau" />
      <main className="ecran">
        <h1>Tableau de bord</h1>
        <p className="sous">
          Compte {u.compte} — {choisie ? <>borne <strong>{choisie.nom}</strong></> : "toutes les bornes"},
          sur {fen.cle === "1" ? "la journée" : `les ${fen.nom}`}.
        </p>

        {/*
          LES DEUX FILTRES, COTE A COTE.

          Chacun garde l'autre dans son lien : passer de sept a trente jours ne
          doit pas relacher la borne qu'on venait de choisir, et l'inverse non
          plus. C'est le genre de detail qui fait qu'on refait deux fois le meme
          geste sans comprendre pourquoi.
        */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap",
                      alignItems: "center" }}>
          {FENETRES.map((x) => (
            <Link key={x.cle} href={choisie ? `/?f=${x.cle}&b=${choisie.id}` : `/?f=${x.cle}`}
                  className={`bouton petit ${x.cle === fen.cle ? "primaire" : ""}`}>{x.nom}</Link>
          ))}

          {machines.length > 1 ? (
            // Un formulaire GET plutot qu'un envoi au changement : la console
            // doit marcher sans JavaScript, sur le telephone qu'on a en main
            // dans un bar mal couvert.
            <form method="get" action="/" style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              <input type="hidden" name="f" value={fen.cle} />
              <select name="b" defaultValue={choisie ? String(choisie.id) : ""}
                      aria-label="Borne" style={{ minHeight: 34, fontSize: 13 }}>
                <option value="">Toutes les bornes</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>{m.nom}</option>
                ))}
              </select>
              <button className="bouton petit">Filtrer</button>
            </form>
          ) : null}
        </div>

        <div className="bandeau">
          <div><div className="stat">
            <span className="valeur num petite">{euros(tete.ca)}</span>
            <span className="libelle">encaissé · {euros(parJourMoyen)} par jour</span></div></div>
          <div><div className="stat">
            <span className="valeur num petite">{euros(tete.marge)}</span>
            <span className="libelle">marge estimée</span></div></div>
          <div><div className="stat">
            <span className="valeur num">{tete.ventes}</span>
            <span className="libelle">articles vendus</span></div></div>
          <div><div className="stat">
            <span className="valeur num">{tete.bornes}</span>
            <span className="libelle">
              {tete.en_ligne} en ligne{tete.jamais_appairees ? ` · ${tete.jamais_appairees} à appairer` : ""}
            </span></div></div>
          <div><div className={`stat ${tete.canaux_vides ? "attention" : ""}`}>
            <span className="valeur num">{tete.canaux_vides}</span>
            <span className="libelle">canaux vides</span></div></div>
          <div><div className={`stat ${tete.litiges ? "alerte" : ""}`}>
            <span className="valeur num">{tete.litiges}</span>
            <span className="libelle">
              {tete.litiges ? <Link href="/ventes" style={{ textDecoration: "underline" }}>à regarder</Link>
                            : "à regarder"}</span></div></div>
        </div>

        {/*
          Les deux gestes qu'on vient faire, atteignables sans chercher. Le
          reassort est un aller-retour permanent entre « je rachete » et « je
          charge » ; les enfouir dans un menu les rend penibles a repeter.
        */}
        <div className="actions-cle">
          <Link href="/reception" className="forte">
            <span className="rond"><IcoReception /></span>
            <span>
              <span className="titre">Réception de stock</span>
              <span className="quoi">
                {risques.length > 0
                  ? `${risques.length} référence${risques.length > 1 ? "s" : ""} à racheter`
                  : "Enregistrer une livraison entière"}
              </span>
            </span>
            <span className="fleche"><IcoFleche /></span>
          </Link>
          <Link href="/bornes">
            <span className="rond"><IcoBorne /></span>
            <span>
              <span className="titre">Charger une borne</span>
              <span className="quoi">
                {tete.canaux_vides > 0
                  ? `${tete.canaux_vides} canaux vides à remplir`
                  : "Passer du stock en machine"}
              </span>
            </span>
            <span className="fleche"><IcoFleche /></span>
          </Link>
        </div>

        {/* ------------------------------------------------------- jour par jour */}
        <h2>Jour par jour</h2>
        <div className="carte">
          {tete.ventes === 0 ? (
            <Repli icone={<IcoVentes />} titre="Aucune vente sur cette période" dedans />
          ) : (
            <>
              <div className="graphe">
                {jours.map((x) => (
                  <div key={x.jour}
                       className={`barre ${x.ca === 0 ? "creux" : x.ca === sommet ? "pointe" : ""}`}
                       title={`${x.etiquette} · ${x.n} article${x.n > 1 ? "s" : ""} · ${euros(x.ca)}`}>
                    <span style={{ height: `${Math.max(x.ca === 0 ? 3 : 8, (x.ca / sommet) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="axe">
                <span>{jours[0]?.etiquette}</span>
                <span>meilleur jour : {meilleur?.etiquette} · {euros(meilleur?.ca ?? 0)}</span>
                <span>{jours.at(-1)?.etiquette}</span>
              </div>
            </>
          )}
        </div>

        {/* ------------------------------------------------------------- bornes */}
        <div className="titre-section">
          <h2>Quelle borne marche le mieux</h2>
          <Link href="/bornes" className="lien">Voir tout <IcoFleche size={13} /></Link>
        </div>
        {bornes.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucune borne sur ce compte"
                 texte="Une borne se rattache à votre compte en lisant le code qu’elle affiche dans sa console de maintenance."
                 action={{ nom: "Ajouter une borne", vers: "/bornes/ajouter" }} />
        ) : (
          <>
            <Estrade bornes={bornes.slice(0, 3)} jours={j} />
            {bornes.length > 3 ? (
              <div className="rangee-cartes">
                {bornes.slice(3).map((b, i) =>
                  <CarteBorne key={b.id} b={b} rang={i + 4} jours={j} />)}
              </div>
            ) : null}
          </>
        )}

        {/* ------------------------------------------------- ventes par categorie */}
        <h2>Ventes par catégorie</h2>
        {classees.length === 0 ? (
          <Repli icone={<IcoVentes />} titre="Aucune vente sur cette période"
                 texte="Élargissez la fenêtre, ou vérifiez que les bornes remontent bien leurs ventes."
                 dedans />
        ) : (
          <div className="duo viz">
            <section>
              <h3>Répartition</h3>
              <BarresClassees series={classees} />
            </section>
            <section>
              <h3>Évolution {j <= 7 ? "jour par jour" : "semaine par semaine"}</h3>
              {categories.seaux.length >= 2
                ? <Courbes seaux={categories.seaux} series={categories.series} />
                : <Repli titre="Pas encore d’évolution"
                         texte="Il faut au moins deux périodes de ventes pour dessiner une tendance." dedans />}
            </section>
          </div>
        )}

        {/* ------------------------------------------------- ce qui se vend */}
        {/*
          QUEL PRODUIT, ET PAS SEULEMENT QUELLE BORNE.

          On savait quelle machine marchait le mieux, jamais quel article. Or
          c'est l'article qu'on rachete, qu'on arrete ou qu'on monte en prix — la
          borne, on ne la change pas.

          La marge est a cote du chiffre, et c'est elle qui compte : un produit
          qui fait le plus gros chiffre en perdant de l'argent a chaque vente
          trone en tete d'un classement au chiffre d'affaires. Elle est vide
          quand aucun prix d'achat n'est connu — un tiret vaut mieux qu'un zero,
          qui ferait passer une marge inconnue pour une marge nulle.
        */}
        <div className="titre-section">
          <h2>Ce qui se vend</h2>
          <Link href="/ventes" className="lien">Voir les ventes <IcoFleche size={13} /></Link>
        </div>
        {produits.length === 0 ? (
          <Repli icone={<IcoVentes />} titre="Aucune vente sur cette période"
                 texte="Rien ne s’est vendu sur la fenêtre choisie." dedans />
        ) : (
          <div className="carte plate"><div className="lignes">
            {produits.slice(0, 12).map((pr, i) => (
              <div className="ligne" key={`${pr.id ?? "x"}-${i}`}>
                <div className="corps">
                  <div className="nom">{pr.nom}</div>
                  <div className="meta">
                    {pr.categorie}{pr.sku ? ` · ${pr.sku}` : ""} · {pr.n} vendu{pr.n > 1 ? "s" : ""}
                  </div>
                </div>
                <div className="fin" style={{ textAlign: "right" }}>
                  <div className="num">{euros(pr.ca)}</div>
                  <div className="meta">
                    {pr.marge === null ? "marge —" : `marge ${euros(pr.marge)}`}
                  </div>
                </div>
              </div>
            ))}
          </div></div>
        )}

        {/* ------------------------------------------------- ce qui va manquer */}
        {sienDuCompte ? (
        <>
        <div className="titre-section">
          <h2>Ce qui va manquer</h2>
          <Link href="/reception" className="lien">Enregistrer une réception <IcoFleche size={13} /></Link>
        </div>
        {risques.length === 0 ? (
          <Repli icone={<IcoStock />} titre="Rien ne manquera d’ici trois semaines"
                 texte="Au rythme de vente constaté sur la période, tous vos produits tiennent."
                 dedans />
        ) : (
          <>
            <div className="risque viz">
              {risques.map((s) => <FicheRisque key={s.id} s={s} />)}
            </div>
            <p className="faible" style={{ fontSize: 13, marginTop: 12 }}>
              L’autonomie divise le stock total — réserve, bornes et en route — par la cadence
              de vente de la période. La quantité proposée est celle qui vous ramène à trente
              jours d’avance.
            </p>
          </>
        )}

        {dormants.length > 0 ? (
          <>
            <h2>Ce qui ne bouge pas</h2>
            <div className="carte plate">
              <div className="lignes">
                {dormants.map((s) => (
                  <div className="ligne" key={s.id}>
                    <div className="corps">
                      <div className="nom">{s.nom}</div>
                      <div className="meta">{s.categorie} · aucune vente sur la période</div>
                    </div>
                    <div className="fin num" style={{ fontWeight: 700 }}>{s.stock}</div>
                  </div>
                ))}
              </div>
              <p className="faible" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
                Du stock immobilisé qui ne rapporte rien. Vérifiez qu’ils sont bien affectés à un
                canal avant d’en conclure qu’ils ne se vendent pas.
              </p>
            </div>
          </>
        ) : null}
        </>
        ) : null}
      </main>
      <NavBasse page="tableau" />
    </>
  );
}

/**
 * L'estrade.
 *
 * Deuxieme a gauche, PREMIER AU MILIEU, troisieme a droite : la disposition
 * olympique se lit sans legende, et la hauteur du socle dit le rang avant meme
 * qu'on lise le chiffre.
 *
 * Les trois marches sont TOUJOURS dressees, meme quand la troisieme place n'est
 * pas prise. Une estrade a deux marches n'est plus une estrade — et la marche
 * vide dit quelque chose : il y a de la place pour une borne de plus.
 *
 * L'ordre du DOM reste 1, 2, 3 — c'est le classement reel, et c'est celui qu'un
 * lecteur d'ecran annonce. Seules les colonnes de grille sont permutees.
 */
function Estrade({ bornes, jours }: { bornes: ParBorne[]; jours: number }) {
  const places: (ParBorne | null)[] = [bornes[0] ?? null, bornes[1] ?? null, bornes[2] ?? null];
  return (
    <div className="podium trois">
      {places.map((b, i) => {
        const rang = i + 1;
        if (!b) return <MarcheVide key={`vide-${rang}`} rang={rang} />;
        const vivante = enLigne(b.vue_le);
        return (
          <Link key={b.id} href={`/bornes/${b.id}`} className={`place r${rang}`}>
            <div className="fiche">
              <span className="rang-mobile">{rang}</span>
              <div className="txt">
                <div className="nom">{b.nom}</div>
                <div className="lieu">{b.adresse ?? "lieu non renseigné"}</div>
                <div className="ca num">{euros(b.ca)}</div>
                <div className="detail">
                  {b.n} vendus · {euros(Math.round(b.ca / Math.max(1, jours)))} par jour
                </div>
                <div className="detail">marge {euros(b.marge)}</div>
                <div className="etats">
                  <span className={`pilule ${vivante ? "ok" : "mal"}`}>
                    <i />{vivante ? "en ligne" : `vue ${depuis(b.vue_le)}`}</span>
                  {b.vides > 0 ? <span className="pilule attente"><i />{b.vides} vides</span> : null}
                </div>
              </div>
            </div>
            <div className="socle">{rang}</div>
          </Link>
        );
      })}
    </div>
  );
}

/** Une marche que personne n'occupe encore. Elle garde sa place et invite. */
function MarcheVide({ rang }: { rang: number }) {
  return (
    <Link href="/bornes/ajouter" className={`place r${rang} libre`}>
      <div className="fiche">
        <span className="rang-mobile">{rang}</span>
        <div className="txt">
          <div className="nom">Place libre</div>
          <div className="lieu">aucune {rang}<sup>e</sup> borne</div>
          <div className="ca num">—</div>
          <div className="detail">Ajouter une borne</div>
        </div>
      </div>
      <div className="socle">{rang}</div>
    </Link>
  );
}

function CarteBorne({ b, rang, jours }: { b: ParBorne; rang: number; jours: number }) {
  const vivante = enLigne(b.vue_le);
  return (
    <Link href={`/bornes/${b.id}`} className="carte" style={{ display: "block" }}>
      <div className="rangee" style={{ alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, flex: "none",
                       background: rang === 1 ? "var(--rouge)" : "var(--surface-3)",
                       color: rang === 1 ? "#fff" : "var(--texte-2)",
                       display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800 }}>
          {rang}
        </span>
        <div className="pousse" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-.02em",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {b.nom}
          </div>
          <div className="faible" style={{ fontSize: 12 }}>{b.adresse ?? "lieu non renseigné"}</div>
        </div>
      </div>

      <div className="num" style={{ fontWeight: 750, fontSize: 22, letterSpacing: "-.035em" }}>
        {euros(b.ca)}
      </div>
      <div className="faible" style={{ fontSize: 12 }}>
        {b.n} vendus · {euros(Math.round(b.ca / Math.max(1, jours)))} par jour
        {b.n > 0 ? ` · panier ${euros(Math.round(b.ca / b.n))}` : ""}
      </div>
      <div className="faible num" style={{ fontSize: 12, marginTop: 2 }}>
        marge {euros(b.marge)}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        <span className={`pilule ${vivante ? "ok" : "mal"}`}>
          <i />{vivante ? "en ligne" : `vue ${depuis(b.vue_le)}`}</span>
        {b.vides > 0 ? <span className="pilule attente"><i />{b.vides} vides</span> : null}
      </div>
    </Link>
  );
}

/**
 * Une reference en risque de rupture.
 *
 * Trois choses en un coup d'oeil : dans combien de jours, ou en est le stock sur
 * une piste COMMUNE de trente jours — deux barres ne se comparent que si elles
 * partagent leur echelle —, et surtout COMBIEN COMMANDER. C'est la seule ligne
 * qui se transforme en action ; sans elle, la liste ne fait que decrire.
 *
 * La couleur ne porte jamais seule : chaque etat porte son icone et son mot.
 */
function FicheRisque({ s }: { s: Autonomie }) {
  const jours = s.jours_restants ?? 0;
  const etat = jours <= 3 ? { cle: "critique", mot: "rupture imminente", couleur: "var(--critique)" }
             : jours <= 7 ? { cle: "serieux",  mot: "à commander",       couleur: "var(--serieux)" }
             :              { cle: "alerte",   mot: "à surveiller",      couleur: "var(--alerte)" };
  // Ramener a trente jours d'avance : c'est ce qu'on va chercher chez le
  // fournisseur, arrondi a la dizaine parce qu'on n'achete pas a l'unite.
  const cible = Math.ceil(Number(s.par_jour) * 30);
  const commander = Math.max(0, Math.ceil((cible - s.stock) / 10) * 10);

  return (
    <div className={`fiche ${etat.cle === "critique" ? "critique" : ""}`}>
      <div className="haut">
        <div style={{ minWidth: 0 }}>
          <div className="nom">{s.nom}</div>
          <div className="cat">{s.categorie} · {s.par_jour} par jour · {s.stock} en stock</div>
        </div>
        <div className="jours">
          <b style={{ color: etat.couleur }}>{jours}</b>
          <span>jours</span>
        </div>
      </div>

      <div className="piste" title="échelle commune : trente jours">
        <span style={{ width: `${Math.min(100, (jours / 30) * 100)}%`, background: etat.couleur }} />
      </div>

      <div className="pied">
        <span className="etat" style={{ color: etat.couleur }}>
          {jours <= 3 ? <IcoAlerte /> : <IcoHorloge />}{etat.mot}
        </span>
        {/* Le conseil devient un geste : la reception s'ouvre sur ce produit, la
            quantite deja posee. Un chiffre qu'il faut re-saisir ailleurs n'est
            qu'a moitie utile. */}
        {commander > 0 ? (
          <Link href={`/reception?p=${s.id}&q=${commander}`} className="commander lien-commander">
            commander ~{commander}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * La mise en route, dans l'ordre ou elle se fait.
 *
 * Chaque etape faite s'efface au profit de la suivante, et une seule est mise en
 * avant a la fois : une liste ou tout crie egalement ne dit pas par ou commencer.
 */
function PremiersPas({ a }: { a: Avancement }) {
  const etapes = [
    { fait: a.categories > 0, nom: "Créer vos catégories",
      quoi: "Elles rangent votre stock et fixent l’ordre dans lequel il se présente.",
      cta: "Créer une catégorie", vers: "/reglages/categories" },
    { fait: a.produits > 0, nom: "Remplir le catalogue",
      quoi: "Ce que vendent vos bornes : nom, prix, âge minimum.",
      cta: "Ajouter un produit", vers: "/reglages/catalogue" },
    { fait: a.recu > 0, nom: "Enregistrer une réception",
      quoi: "La marchandise que vous avez achetée entre dans votre réserve.",
      cta: "Enregistrer", vers: "/reception" },
    { fait: a.bornes > 0 && a.appairees > 0, nom: "Appairer une borne",
      quoi: "La machine affiche un code ; vous le portez ici depuis votre téléphone.",
      cta: "Appairer", vers: "/bornes/ajouter" },
    { fait: a.chargees > 0, nom: "Charger la borne",
      quoi: "Vous indiquez ce que vous ajoutez ; la machine confirme à sa prochaine synchro.",
      cta: "Charger", vers: "/bornes" },
  ];
  const suivante = etapes.findIndex((e) => !e.fait);

  return (
    <>
      <div className="carte">
        <div className="pas-a-pas">
          {etapes.map((e, i) => (
            <div key={e.nom}
                 className={`etape ${e.fait ? "faite" : i === suivante ? "suivante" : ""}`}>
              <span className="puce">{e.fait ? "✓" : i + 1}</span>
              <div className="corps">
                <div className="nom">{e.nom}</div>
                {!e.fait ? <div className="quoi">{e.quoi}</div> : null}
              </div>
              {!e.fait ? (
                <div className="fin">
                  <Link href={e.vers}
                        className={`bouton petit ${i === suivante ? "primaire" : ""}`}>
                    {e.cta}
                  </Link>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <p className="faible" style={{ fontSize: 13, marginTop: 14 }}>
        Dès la première vente remontée, cet écran laisse place au tableau de bord.
      </p>
    </>
  );
}
