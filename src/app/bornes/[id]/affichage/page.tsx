import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q, q1, euros, codeCanal } from "@/db";
import { peutConfigurer, utilisateur, peutVoirBorne } from "@/lib/auth";
import { INACTIVITE_MAX, INACTIVITE_MIN } from "@/lib/borne";
import { IcoAlerte } from "../../../icones";

export const dynamic = "force-dynamic";

/**
 * CE QUE CETTE BORNE AFFICHE.
 *
 * Un meme catalogue, des vitrines differentes. Le bar du coin ne veut pas des
 * memes rayons que la salle de sport, et on ne va pas tenir deux catalogues pour
 * autant.
 *
 * Decocher NE TOUCHE NI AU STOCK NI AU PLANOGRAMME : le canal garde son produit
 * et son compteur, il est simplement annonce libre a la machine. On peut donc
 * cacher un rayon le temps d'une soiree et le rendre le lendemain sans avoir
 * rien perdu.
 */

type Cat = { id: number; nom: string; ordre: number; masquee: boolean; produits: number };
type Prod = {
  id: number; sku: string; nom: string; prix_vente_c: number; prix_c: number;
  prix_propre: boolean;
  categorie_id: number | null; categorie: string; ordre: number;
  masque: boolean; cat_masquee: boolean;
  lanes: string | null;
};

/**
 * Un nombre de secondes, dit comme on le dirait a voix haute.
 *
 * « 90 » se lit vite et se comprend mal : personne ne pense son delai en
 * secondes au-dela de la minute. Le champ reste en secondes — c'est l'unite
 * qu'on regle — mais la phrase a cote dit ce que ca fait.
 */
function duree(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

export default async function Affichage({
  params, searchParams,
}: { params: Promise<{ id: string }>;
     searchParams: Promise<{ ok?: string; veille?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  // Une borne hors de sa portee n'existe pas pour lui : `notFound` plutot
  // qu'un refus, qui confirmerait au passage qu'elle existe.
  if (!peutVoirBorne(u, id)) notFound();
  const { ok, veille } = await searchParams;

  const b = await q1<{
    id: number; nom: string; adresse: string | null;
    veille_active: boolean; inactivite_s: number;
  }>(`SELECT id, nom, adresse, veille_active, inactivite_s
        FROM borne WHERE id = $1 AND compte_id = $2`, [id, u.compte_id]);
  if (!b) notFound();

  const [cats, prods] = await Promise.all([
    q<Cat>(`
      SELECT c.id, c.nom, c.ordre,
             EXISTS (SELECT 1 FROM borne_masque m
                      WHERE m.borne_id = $2 AND m.categorie_id = c.id) AS masquee,
             (SELECT COUNT(*)::int FROM produit p
               WHERE p.categorie_id = c.id AND p.actif) AS produits
        -- Une categorie retiree n'a plus a etre montree ni masquee : elle
        -- n'existe deja plus sur l'ecran de la machine.
        FROM categorie c WHERE c.compte_id = $1 AND c.actif
       ORDER BY c.ordre, c.nom`, [u.compte_id, id]),

    q<Prod>(`
      SELECT p.id, p.sku, p.nom, p.prix_vente_c, p.categorie_id,
             -- Ce que cette borne fait payer. La liste sert a decider ce qu'elle
             -- montre : y lire le prix d'une autre machine n'aiderait personne.
             COALESCE(pb.prix_c, p.prix_vente_c) AS prix_c,
             (pb.prix_c IS NOT NULL) AS prix_propre,
             COALESCE(cat.nom, 'sans catégorie') AS categorie,
             COALESCE(cat.ordre, 999) AS ordre,
             EXISTS (SELECT 1 FROM borne_masque m
                      WHERE m.borne_id = $2 AND m.produit_id = p.id) AS masque,
             EXISTS (SELECT 1 FROM borne_masque m
                      WHERE m.borne_id = $2 AND m.categorie_id = p.categorie_id) AS cat_masquee,
             (SELECT string_agg(k.rangee || lpad(k.colonne::text,2,'0'), ' · ' ORDER BY k.lane)
                FROM canal k WHERE k.borne_id = $2 AND k.produit_id = p.id) AS lanes
        FROM produit p
        LEFT JOIN categorie cat ON cat.id = p.categorie_id
        LEFT JOIN prix_borne pb ON pb.produit_id = p.id AND pb.borne_id = $2
       WHERE p.compte_id = $1 AND p.actif
       ORDER BY COALESCE(cat.ordre, 999), COALESCE(cat.nom, 'zzz'), p.nom`,
      [u.compte_id, id]),
  ]);

  const modifiable = peutConfigurer(u);
  const visibles = prods.filter((p) => !p.masque && !p.cat_masquee && p.lanes);
  const parCategorie = [...prods.reduce((m, p) => {
    (m.get(p.categorie) ?? m.set(p.categorie, []).get(p.categorie)!).push(p);
    return m;
  }, new Map<string, Prod[]>())];

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href={`/bornes/${id}`} className="bouton petit">‹</Link>
          <div className="pousse">
            <h1 style={{ margin: 0, fontSize: 22 }}>Affichage</h1>
            <div className="faible" style={{ fontSize: 13 }}>{b.nom}</div>
          </div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Décochez ce que <b>cette borne</b> ne doit pas montrer. Le stock et le
          planogramme ne bougent pas : le canal garde son produit et son compteur,
          la machine l’annonce simplement comme libre. On peut rendre un rayon le
          lendemain sans rien avoir perdu. Pour ce qu’elle fait payer,{" "}
          <Link href={`/bornes/${id}/prix`} style={{ textDecoration: "underline" }}>
          les prix de cette borne</Link>.
        </p>

        {ok ? <p className="faible" style={{ fontSize: 13.5 }}>
          Enregistré. La borne l’appliquera à sa prochaine synchronisation.
        </p> : null}

        {veille ? <p className="avis-ok">
          Écran d’accueil enregistré. La borne l’applique dès qu’elle répond —
          quelques secondes.
        </p> : null}

        {/*
          L'ECRAN D'ACCUEIL EN PREMIER, PARCE QU'IL DECIDE DU RESTE.

          Ce qu'on coche plus bas remplit l'etal ; ce reglage-ci dit si l'etal est
          ce qu'on voit, ou ce qu'on voit APRES avoir touche une fois. Le poser
          apres la liste des produits aurait demande de relire la page a l'envers.
        */}
        {!modifiable ? null : (
          <form method="post" action={`/api/bornes/${id}/veille`}
                className="carte" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong>Écran d’accueil</strong>
              <span className="faible" style={{ fontSize: 13.5 }}>
                Ce que la machine montre quand personne n’est devant.
              </span>
            </div>

            <label className="coche" style={{ marginTop: 10 }}>
              <input type="checkbox" name="veille" defaultChecked={b.veille_active} />
              <span>Afficher l’écran d’accueil au repos</span>
            </label>

            <p className="faible" style={{ margin: "2px 0 0", fontSize: 13 }}>
              Coché : le logo, l’invite « Touchez l’écran pour commencer » et les
              visuels publicitaires. Décoché : la machine reste <b>en permanence sur
              le catalogue</b>. Le client voit ce qui est en vente sans avoir à
              toucher une première fois — c’est ce qu’on veut sur une borne posée
              dans un passage. La publicité, elle, ne passe que sur l’écran
              d’accueil : la couper la coupe aussi.
            </p>

            <p className="faible" style={{ margin: "6px 0 0", fontSize: 13 }}>
              Un catalogue laissé en place jour et nuit marque la dalle à la
              longue — c’est ce que l’écran d’accueil, qui bouge lentement, évite.
              Sur une machine allumée en continu et peu fréquentée, gardez-le.
            </p>

            <label htmlFor="veille-delai" style={{ marginTop: 14 }}>
              Retour au repos après
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input id="veille-delai" name="inactivite_s" type="number"
                     min={INACTIVITE_MIN} max={INACTIVITE_MAX} step={5}
                     defaultValue={b.inactivite_s} style={{ width: 110 }} />
              <span className="faible" style={{ fontSize: 13.5 }}>
                secondes sans aucun geste — actuellement {duree(b.inactivite_s)}.
                Entre {duree(INACTIVITE_MIN)} et {duree(INACTIVITE_MAX)}.
              </span>
            </div>

            <p className="faible" style={{ margin: "10px 0 0", fontSize: 13 }}>
              À l’échéance, le panier est vidé et le filtre effacé : le client
              suivant arrive devant l’étal complet. On mesure le temps sans
              <b> aucun</b> geste, pas le temps passé sur une page — quelqu’un qui
              prend son temps à choisir ne perd rien tant qu’il touche l’écran.
              Une distribution en cours n’est jamais interrompue.
            </p>

            <div className="rangee-actions" style={{ marginTop: 12 }}>
              <button className="bouton">Enregistrer l’écran d’accueil</button>
            </div>
          </form>
        )}

        <div className="bandeau deux" style={{ marginTop: 4 }}>
          <div><div className="valeur">{visibles.length}</div>
               <div className="etiq">produits visibles</div></div>
          <div><div className="valeur">{cats.filter((c) => !c.masquee).length}</div>
               <div className="etiq">catégories sur {cats.length}</div></div>
        </div>

        {visibles.length === 0 ? (
          <div className="avis">
            <IcoAlerte size={17} />
            <div className="dit">
              <div className="titre">Cette borne n’afficherait plus rien</div>
              <div className="texte">
                Aucun produit visible et placé dans un canal : la machine
                retomberait sur sa vitrine de secours. Recochez au moins une
                catégorie.
              </div>
            </div>
          </div>
        ) : null}

        {!modifiable ? null : (
          <form method="post" action={`/api/bornes/${id}/affichage`}>
            <h2>Catégories</h2>
            <div className="carte plate"><div className="lignes">
              {cats.map((c) => (
                <label className="ligne choix" key={c.id}>
                  <input type="checkbox" name="categorie" value={c.id} defaultChecked={!c.masquee} />
                  <div className="corps">
                    <div className="nom">{c.nom}</div>
                    <div className="meta">
                      {c.produits} produit{c.produits > 1 ? "s" : ""} au catalogue
                    </div>
                  </div>
                  <div className="fin">
                    {c.produits === 0
                      ? <span className="faible" style={{ fontSize: 12 }}>vide</span>
                      : null}
                  </div>
                </label>
              ))}
            </div></div>

            <h2>Produits</h2>
            <p className="faible" style={{ fontSize: 13, marginTop: -6 }}>
              Un produit d’une catégorie décochée reste caché, même coché ici.
              Un produit sans canal sur cette borne n’apparaît de toute façon pas.
            </p>
            {parCategorie.map(([nom, liste]) => (
              <div className="carte plate" key={nom} style={{ marginBottom: 10 }}>
                <div className="fiche-cat" style={{ padding: "10px 14px 6px" }}>{nom}</div>
                <div className="lignes">
                  {liste.map((p) => (
                    <label className={`ligne choix${p.cat_masquee ? " dormant" : ""}`} key={p.id}>
                      <input type="checkbox" name="produit" value={p.id}
                             defaultChecked={!p.masque} disabled={p.cat_masquee} />
                      <div className="corps">
                        <div className="nom">{p.nom}</div>
                        <div className="meta">
                          <span className="mono">{p.sku}</span> · {euros(p.prix_c)}
                          {p.prix_propre ? (
                            <b className="prix-a-part"
                               title={`Prix propre à cette borne — le catalogue dit ${euros(p.prix_vente_c)}`}>
                              <span aria-hidden>∗</span>
                              <span className="hors-vue">
                                {` prix propre à cette borne, le catalogue dit ${euros(p.prix_vente_c)}`}
                              </span>
                            </b>
                          ) : null}
                          {p.lanes ? <> · canal <b className="mono">{p.lanes}</b></>
                                   : " · sur aucun canal ici"}
                        </div>
                      </div>
                      {p.cat_masquee ? (
                        <div className="fin">
                          <span className="pilule attente"><i />catégorie masquée</span>
                        </div>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <button className="bouton primaire large">Enregistrer l’affichage</button>
              <span className="faible" style={{ fontSize: 13 }}>
                La borne l’appliquera à sa prochaine synchronisation.
              </span>
            </div>
          </form>
        )}
      </main>
      <NavBasse page="bornes" />
    </>
  );
}
