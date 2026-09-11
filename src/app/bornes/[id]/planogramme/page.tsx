import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q, q1, euros } from "@/db";
import { peutCharger, peutConfigurer, utilisateur, peutVoirBorne } from "@/lib/auth";
import { facade, type Position } from "@/lib/machine";
import { canauxDe, type LigneCanal } from "@/lib/stock";
import { Facade, Spire, Visuel, type Vue } from "../../../facade";
import Compteur from "../../../compteur";
import { IcoAlerte } from "../../../icones";

export const dynamic = "force-dynamic";

type Produit = {
  id: number; nom: string; prix_c: number; categorie: string;
  image: number | null; icone: string | null;
};

const VUES: { cle: Vue; nom: string }[] = [
  { cle: "grille", nom: "Grille" },
  { cle: "2d", nom: "2D" },
  { cle: "3d", nom: "3D" },
];

/**
 * LES EMPLACEMENTS : QUEL PRODUIT DANS QUELLE SPIRALE.
 *
 * C'etait une colonne de dix menus deroulants, chacun flanque de deux champs
 * nombres, plus un formulaire « rangee / colonne » pour declarer une spire —
 * qui acceptait des numeros que la machine n'a pas. On y cherchait sa spirale
 * par son code, sans jamais la voir.
 *
 * Les spirales sont maintenant a leur place. On touche une spirale, on regle
 * CELLE-LA — son produit, combien elle en tient, a partir de quand elle est
 * basse — et on enregistre. La grille est la vue ordinaire ; la machine se
 * dessine aussi en 2D, ou en 3D qu'on fait tourner, les produits dans leurs
 * spirales, a leur vrai nombre.
 *
 * LE NOM DE LA MACHINE EST PARTOUT OU L'ON PEUT SE PERDRE : en titre de la
 * page, sur la plaque du caisson, en tete du reglage — qui couvre la page sur
 * un telephone. Avec trois RedBox identiques, « Spirale 501 » seul ne dit pas
 * laquelle on est en train de changer.
 *
 * SUR UN TELEPHONE, LE REGLAGE MONTE DU BAS, et se ferme en touchant a cote.
 * La page ne saute plus en haut a chaque spirale touchee.
 *
 * Le reglage et la vue vivent dans l'adresse (`?s=203&vue=3d`) : ils s'ouvrent
 * sans JavaScript, et le bouton retour du telephone ferme ce qu'on vient
 * d'ouvrir.
 */
export default async function Emplacements({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string; e?: string; ok?: string; retire?: string; vue?: string }>;
}) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  // Une borne hors de sa portee n'existe pas pour lui : `notFound` plutot
  // qu'un refus, qui confirmerait au passage qu'elle existe.
  if (!peutVoirBorne(u, id)) notFound();
  const sp = await searchParams;
  if (!peutConfigurer(u)) redirect(`/bornes/${id}`);
  const vue: Vue = sp.vue === "2d" || sp.vue === "3d" ? sp.vue : "grille";

  // Le prix montre dans la liste est CELUI DE CETTE BORNE : on choisit ce
  // qu'une machine distribue, et lui rappeler un tarif qu'elle ne pratique pas
  // ferait poser le produit sur une idee fausse de ce qu'il rapporte.
  const [b, canaux, produits] = await Promise.all([
    q1<{ nom: string; adresse: string | null }>(
      "SELECT nom, adresse FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]),
    canauxDe(id, u.compte_id),
    q<Produit>(`
      SELECT p.id, p.nom, p.image_id AS image, p.icone,
             COALESCE(pb.prix_c, p.prix_vente_c) AS prix_c,
             COALESCE(cat.nom, 'sans catégorie') AS categorie
        FROM produit p
        LEFT JOIN categorie cat ON cat.id = p.categorie_id
        LEFT JOIN prix_borne pb ON pb.produit_id = p.id AND pb.borne_id = $2
       WHERE p.compte_id = $1 AND p.actif
       ORDER BY COALESCE(cat.ordre, 999), COALESCE(cat.nom, 'zzz'), p.nom`, [u.compte_id, id]),
  ]);
  if (!b) notFound();

  const { rangs, colonnes } = facade(canaux);
  const choisie = rangs.flat().find((p) => p.lane === Number(sp.s)) ?? null;
  const ok = rangs.flat().find((p) => p.lane === Number(sp.ok)) ?? null;

  // UN PRODUIT PEUT OCCUPER PLUSIEURS SPIRALES. Celui qui part vite se met sur
  // deux : la machine n'en montre qu'une carte, et sert l'une puis l'autre. On
  // le montre sur la case (« aussi en 102 ») et dans la liste (« deja en 101 »),
  // parce qu'un meme nom a deux endroits ressemble sinon a une erreur.
  const places = new Map<string, string[]>();
  for (const p of rangs.flat()) {
    if (p.item?.produit_id == null) continue;
    const k = String(p.item.produit_id);
    (places.get(k) ?? places.set(k, []).get(k)!).push(p.code);
  }
  const ailleurs = (produit: number | string | null, code: string) =>
    produit == null ? [] : (places.get(String(produit)) ?? []).filter((x) => x !== code);

  const parCategorie = [...produits.reduce((m, p) => {
    (m.get(p.categorie) ?? m.set(p.categorie, []).get(p.categorie)!).push(p);
    return m;
  }, new Map<string, Produit[]>())];

  // Toutes les adresses de la page gardent la vue choisie : changer de spirale
  // ne doit pas faire retomber sur la grille.
  const adresse = ({ s, v = vue }: { s?: number | null; v?: Vue }) => {
    const p = new URLSearchParams();
    if (s) p.set("s", String(s));
    if (v !== "grille") p.set("vue", v);
    const qs = p.toString();
    return `/bornes/${id}/planogramme${qs ? `?${qs}` : ""}`;
  };
  const ouvrir = (lane: number) => adresse({ s: lane });
  const fermer = adresse({});
  const action = `/api/bornes/${id}/planogramme`;
  // Pour vider une spirale avant de changer son produit : le reassort sait retirer.
  const reassort = peutCharger(u) ? `/bornes/${id}/charger` : null;

  const rendre = (p: Position<LigneCanal>) => {
    const c = p.item;
    const garnie = c !== null && c.produit_id !== null;
    const aussi = ailleurs(c?.produit_id ?? null, p.code);
    const actif = choisie?.lane === p.lane ? "true" : undefined;

    // LA GRILLE : la vue ordinaire, telle qu'elle etait.
    if (vue === "grille") {
      return (
        // `scroll={false}` : toucher la spirale 502 ne doit pas renvoyer en haut
        // de la page, loin de la spirale qu'on regardait.
        <Link href={ouvrir(p.lane)} scroll={false} className="spirale lien" aria-current={actif}
              data-etat={!c ? "absente" : c.produit_id === null ? "libre" : "garnie"}>
          <div className="tete">
            <span className="code mono">{p.code}</span>
            {aussi.length > 0 ? <span className="double">aussi en {aussi.join(", ")}</span> : null}
          </div>
          {garnie ? (
            <>
              <div className="produit">
                <Visuel image={c.image} icone={c.icone} nom={c.nom ?? ""} />
                <span className="nom">{c.nom}</span>
              </div>
              <div className="meta num">en tient {c.capacite}</div>
            </>
          ) : (
            <p className="rien">{c ? "Libre — choisir un produit" : "Non utilisée — l’activer"}</p>
          )}
        </Link>
      );
    }

    // LA MACHINE, 2D ou 3D : la spirale en fil rouge — autant de tours que de
    // places, autant de produits qu'en stock — dont la levre du plateau cache
    // le bas ; devant, l'etiquette posee sur la levre.
    const etat = !c ? "absente" : c.produit_id === null ? "libre"
               : c.quantite === 0 ? "vide" : c.quantite <= c.seuil_bas ? "bas" : "garnie";
    return (
      <Link href={ouvrir(p.lane)} scroll={false} className="spirale lien" data-etat={etat}
            aria-current={actif}>
        <div className="bobine">
          <Spire id={p.lane} capacite={c?.capacite ?? 10} quantite={garnie ? c.quantite : 0}
                 produit={garnie ? { image: c.image, icone: c.icone, nom: c.nom ?? "" } : null} />
        </div>
        <div className="etiquette-spirale">
          {garnie ? <Visuel image={c.image} icone={c.icone} nom={c.nom ?? ""} /> : null}
          <span className="dit">
            <span className="ligne1">
              <span className="code mono">{p.code}</span>
              {garnie ? <span className="compte num">{c.quantite}/{c.capacite}</span> : null}
              {etat === "vide" ? <b className="mot">vide</b> : etat === "bas" ? <b className="mot">basse</b> : null}
              {aussi.length > 0
                ? <span className="double" title={`Aussi en ${aussi.join(", ")}`}>+{aussi.join(", ")}</span>
                : null}
            </span>
            {garnie
              ? <span className="nom">{c.nom}</span>
              : <span className="rien">{c ? "Libre — choisir" : "Non utilisée — l’activer"}</span>}
          </span>
        </div>
      </Link>
    );
  };

  /**
   * LE PRODUIT : CELUI QUI Y EST, ET « CHANGER ».
   *
   * La liste ouverte d'office, avec « Aucun produit » en tete, se lisait comme
   * une question — alors qu'on ouvre le plus souvent une spirale pour sa
   * capacite. Le produit actuel tient sur une ligne ; la liste ne s'ouvre qu'au
   * bouton « Changer », et « laisser la spirale vide » vient en dernier.
   *
   * Une spirale encore libre ouvre la liste d'elle-meme : il n'y a rien d'autre
   * a faire. Ce sont de vrais boutons radio dans un `<details>` : ca s'ouvre et
   * ca part sans JavaScript.
   */
  const ChoixProduit = ({ nom, actuel, code }: { nom: string; actuel: string; code: string }) => {
    const present = produits.find((p) => String(p.id) === actuel) ?? null;
    return (
      <details className="changer-produit" open={!present}>
        <summary>
          {present
            ? <Visuel image={present.image} icone={present.icone} nom={present.nom} />
            : <span className="visuel sans-produit" aria-hidden>?</span>}
          <span className="quoi">
            <span className="etiq">Produit</span>
            <b>{present ? present.nom : "Aucun — choisissez-en un"}</b>
          </span>
          {present ? (
            <span className="changer">
              <span className="ferme">Changer</span><span className="ouvert">Fermer</span>
            </span>
          ) : null}
        </summary>
        <div className="liste-produits">
          {parCategorie.map(([cat, liste]) => (
            <div key={cat} className="groupe-produits" role="group" aria-label={cat}>
              <div className="cat">{cat}</div>
              {liste.map((p) => {
                const deja = ailleurs(p.id, code);
                const est = String(p.id) === actuel;
                return (
                  <label key={p.id} className="option-produit">
                    <input type="radio" name={nom} value={p.id} defaultChecked={est}
                           data-actuel={est ? "" : undefined} />
                    <Visuel image={p.image} icone={p.icone} nom={p.nom} />
                    <span className="quoi">
                      <b>{p.nom}</b>
                      <span>{euros(p.prix_c)}{deja.length ? ` · déjà en ${deja.join(", ")}` : ""}</span>
                    </span>
                    {est ? <span className="ici">actuel</span> : null}
                  </label>
                );
              })}
            </div>
          ))}
          {present ? (
            <label className="option-produit option-vider">
              <input type="radio" name={nom} value="" />
              <span className="visuel sans-produit" aria-hidden>∅</span>
              <span className="quoi"><b>Laisser la spirale vide</b><span>Plus aucun produit ici</span></span>
            </label>
          ) : null}
        </div>
      </details>
    );
  };

  // Le serveur y revient apres l'enregistrement : la vue choisie survit au formulaire.
  const champVue = vue !== "grille" ? <input type="hidden" name="vue" value={vue} /> : null;

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="tete-borne">
          <Link href={`/bornes/${id}`} className="bouton petit retour" aria-label="Retour à la RedBox">‹</Link>
          <div className="qui">
            <div className="surtitre">Emplacements</div>
            <h1>{b.nom}</h1>
            <div className="ou">{b.adresse ?? "lieu non renseigné"} · le produit de chaque spirale</div>
          </div>
        </div>

        {ok ? (
          <div className="avis reussi">
            <div className="dit">
              <div className="titre">{b.nom} : spirale {ok.code} enregistrée</div>
              <div className="texte">La RedBox la reçoit à sa prochaine synchronisation — dans la minute si elle est en ligne.</div>
            </div>
          </div>
        ) : null}
        {sp.retire ? <p className="avis-ok">Spirale retirée.</p> : null}
        {sp.e === "place" ? <p className="erreur">Cette position n’existe pas sur une RedBox : cinq plateaux de deux spirales.</p> : null}
        {sp.e === "deja" ? <p className="erreur">Cette spirale est déjà active.</p> : null}
        {sp.e === "pleine" ? (
          <p className="erreur">
            Elle contient encore des produits : retirez-les d’abord depuis le Réassort
            (un nombre négatif), sinon ils disparaîtraient des comptes.
          </p>
        ) : null}

        <div className="barre-vue">
          <p className="consigne-machine">Touchez une spirale pour la régler.</p>
          <nav className="periodes petites" aria-label="Affichage de la machine">
            {VUES.map((v) => (
              <Link key={v.cle} href={adresse({ s: choisie?.lane, v: v.cle })} scroll={false}
                    aria-current={v.cle === vue ? "true" : undefined}>{v.nom}</Link>
            ))}
          </nav>
        </div>

        <div className="emplacements">
          <Facade rangs={rangs} colonnes={colonnes} rendre={rendre} vue={vue} nom={b.nom}
                  legende={`Les spirales de ${b.nom}`} />

          {/* Sur un telephone, le voile derriere le panneau : le toucher ferme. */}
          {choisie ? (
            <Link href={fermer} scroll={false} className="voile-reglage" aria-label="Fermer le réglage" />
          ) : null}

          <section className="carte reglage" id="reglage" aria-live="polite"
                   data-ouvert={choisie ? "" : undefined}>
            {!choisie ? (
              <>
                <h2 className="titre-reglage">Touchez une spirale</h2>
                <p className="dit-faible">
                  Pour choisir son produit, combien elle en tient, et quand vous prévenir
                  qu’elle se vide.
                </p>
                <p className="dit-faible">
                  Un produit qui part vite peut occuper deux spirales : la machine n’en montre
                  qu’une carte et vide l’une, puis l’autre. Vous n’avez rien à décider.
                </p>
              </>
            ) : choisie.item ? (
              // LA CLE EST LA SPIRALE. Passer d'une spirale a l'autre ne recharge
              // pas la page : sans elle, React garderait le meme formulaire, et
              // ses champs — qui ne lisent leur valeur qu'a la creation —
              // afficheraient encore le produit de la premiere spirale ouverte.
              <Reglage key={choisie.lane} p={choisie} c={choisie.item} action={action} fermer={fermer}
                       champVue={champVue} reassort={reassort} borne={b.nom}
                       choix={<ChoixProduit nom={`p_${choisie.lane}`} code={choisie.code}
                                            actuel={choisie.item.produit_id === null ? "" : String(choisie.item.produit_id)} />} />
            ) : (
              <form key={choisie.lane} method="post" action={action}>
                <input type="hidden" name="action" value="ajouter" />
                <input type="hidden" name="rangee" value={choisie.rangee} />
                <input type="hidden" name="colonne" value={choisie.colonne} />
                {champVue}
                <TeteReglage p={choisie} fermer={fermer} borne={b.nom} />
                <p className="dit-faible" style={{ margin: "0 0 12px" }}>
                  Cette spirale n’est pas encore utilisée. Choisissez son produit pour
                  qu’elle entre dans la machine.
                </p>
                <ChoixProduit nom="produit_id" code={choisie.code} actuel="" />
                <div className="deux-champs">
                  <div className="champ-compteur">
                    <label htmlFor="capacite">Places dans la spirale</label>
                    <Compteur id="capacite" nom="capacite" defaut={10} min={1} max={60} />
                    <span className="aide">combien elle en tient, pleine</span>
                  </div>
                </div>
                <div className="actions-reglage">
                  <button className="bouton primaire">Activer la spirale {choisie.code}</button>
                  <Link href={fermer} scroll={false} className="bouton discret">Annuler</Link>
                </div>
              </form>
            )}
          </section>
        </div>
      </main>
      <NavBasse page="bornes" />
    </>
  );
}

/**
 * LAQUELLE, ET OU.
 *
 * Le nom de la RedBox d'abord — sur un telephone, le panneau couvre la page et
 * son titre —, puis la spirale et sa place dans la machine, en mots simples.
 */
function TeteReglage({ p, fermer, c, borne }: {
  p: Position<unknown>; fermer: string; c?: LigneCanal; borne: string;
}) {
  const cote = p.colonne === 1 ? "à gauche" : p.colonne === 2 ? "à droite" : `n° ${p.colonne}`;
  const garnie = c && c.produit_id !== null;
  return (
    <>
      <div className="borne-reglage">
        <span className="point" aria-hidden />
        <span className="nom-borne">{borne}</span>
        <Link href={fermer} scroll={false} className="bouton petit discret fermer-reglage" aria-label="Fermer">✕</Link>
      </div>
      <div className="tete-reglage">
        {garnie
          ? <Visuel image={c.image} icone={c.icone} nom={c.nom ?? ""} />
          : <span className="visuel sans-produit mono">{p.code}</span>}
        <div className="pousse" style={{ minWidth: 0 }}>
          <div className="titre-reglage">Spirale {p.code}</div>
          <div className="dit-faible">Étage {p.rangee}, {cote}</div>
        </div>
      </div>
    </>
  );
}

function Reglage({ p, c, action, fermer, choix, champVue, reassort, borne }: {
  p: Position<LigneCanal>; c: LigneCanal; action: string; fermer: string;
  choix: React.ReactNode; champVue: React.ReactNode; reassort: string | null; borne: string;
}) {
  const garnie = c.produit_id !== null;
  const etat = !garnie ? "libre" : c.quantite === 0 ? "vide" : c.quantite <= c.seuil_bas ? "bas" : "plein";
  const part = c.capacite > 0 ? Math.min(100, Math.round((c.quantite / c.capacite) * 100)) : 0;
  return (
    <>
      <form method="post" action={action}>
        {/* Un seul reglage part : le serveur ne touche qu'a cette spirale, et
            revient ici plutot que sur la fiche de la RedBox. */}
        <input type="hidden" name="lane" value={c.lane} />
        {champVue}
        <TeteReglage p={p} fermer={fermer} c={c} borne={borne} />

        {garnie ? (
          <div className="etat-spirale" data-etat={etat}>
            <span className="jauge-reglage"><span style={{ width: `${part}%` }} /></span>
            <span className="num"><b>{c.quantite}</b> dedans sur {c.capacite}</span>
            {etat === "vide" ? <b className="mot">vide</b> : etat === "bas" ? <b className="mot">presque vide</b> : null}
          </div>
        ) : null}

        {choix}

        {/* Il ne se montre que si l'on CHANGE de produit alors que la spirale
            en contient encore : le dire a chaque ouverture, c'etait crier pour
            rien neuf fois sur dix. */}
        {garnie && c.quantite > 0 ? (
          <div className="alerte-changement" role="note">
            <IcoAlerte size={16} />
            <span>
              Il reste <b>{c.quantite} × {c.nom}</b> dans cette spirale. Retirez-les avant
              de changer de produit, sinon le compte de la machine sera faux.
              {reassort ? <> <Link href={reassort}>Les retirer depuis le Réassort</Link></> : null}
            </span>
          </div>
        ) : null}

        <div className="deux-champs">
          <div className="champ-compteur">
            <label htmlFor="capacite">Places dans la spirale</label>
            <Compteur id="capacite" nom={`c_${c.lane}`} defaut={c.capacite} min={1} max={60} />
            <span className="aide">combien elle en tient, pleine</span>
          </div>
          <div className="champ-compteur">
            <label htmlFor="seuil">Me prévenir à</label>
            <Compteur id="seuil" nom={`s_${c.lane}`} defaut={c.seuil_bas} min={0} max={30} />
            <span className="aide">quand il en reste autant ou moins</span>
          </div>
        </div>

        <div className="actions-reglage">
          <button className="bouton primaire">Enregistrer</button>
          <Link href={fermer} scroll={false} className="bouton discret">Annuler</Link>
        </div>
      </form>

      {/* Une spirale hors des dix du materiel — reprise d'une ancienne machine —
          peut s'effacer, si elle est vide. Les dix vraies, elles, restent :
          elles existent, qu'on y mette quelque chose ou non. */}
      {!p.standard && c.quantite === 0 ? (
        <form method="post" action={action} style={{ marginTop: 12 }}>
          {champVue}
          <button name="oter" value={c.lane} className="bouton petit danger">
            Supprimer cette spirale
          </button>
        </form>
      ) : null}
    </>
  );
}
