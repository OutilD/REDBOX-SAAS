import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q, q1, euros } from "@/db";
import { peutConfigurer, utilisateur, peutVoirBorne } from "@/lib/auth";
import { IcoAlerte, IcoCatalogue } from "../../../icones";
import { Repli } from "../../../repli";
import GrillePrix, { type Ligne } from "./grille";

export const dynamic = "force-dynamic";

/**
 * LE PRIX DE CETTE BORNE.
 *
 * Un catalogue, plusieurs tarifs. Le bar de nuit, la salle de sport et l'aire
 * d'autoroute vendent la meme puff : ils ne la vendent pas au meme prix, et
 * jusqu'ici l'exploitant n'avait le choix qu'entre aligner tout son parc sur le
 * moins cher et tenir un catalogue par machine.
 *
 * CETTE PAGE NE POSE QUE DES EXCEPTIONS. Un champ laisse vide veut dire « cette
 * borne suit le catalogue » — aujourd'hui, et le jour ou le catalogue changera.
 * C'est ce qui distingue ce reglage d'un second catalogue : le produit reste
 * unique, son nom, sa photo, sa fiche et son stock aussi ; seule la ligne du
 * prix se dedouble, la ou elle doit l'etre.
 *
 * ELLE VIT SUR LA BORNE, PAS DANS LES REGLAGES. C'est en regardant une machine
 * qu'on decide de son tarif — pas en parcourant un catalogue ou toutes se
 * ressemblent.
 */

type P = {
  id: number; sku: string; nom: string;
  catalogue_c: number; prix_c: number; propre: boolean;
  categorie_id: number | null; categorie: string; ordre: number;
  image: number | null; icone: string | null;
  canaux: number; masque: boolean; par: string | null;
};

export default async function Prix({
  params, searchParams,
}: { params: Promise<{ id: string }>;
     searchParams: Promise<{ fait?: string; n?: string; refuses?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  // Une borne hors de sa portee n'existe pas pour lui : `notFound` plutot
  // qu'un refus, qui confirmerait au passage qu'elle existe.
  if (!peutVoirBorne(u, id)) notFound();
  const { fait, n, refuses } = await searchParams;

  const b = await q1<{ id: number; nom: string; adresse: string | null }>(
    "SELECT id, nom, adresse FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!b) notFound();

  // LES DEUX LECTURES PARTENT ENSEMBLE : elles ne dependent pas l'une de
  // l'autre, et chaque aller-retour vers Neon coute un quart de seconde.
  const [produits, categories] = await Promise.all([
    q<P>(`
      SELECT p.id, p.sku, p.nom, p.image_id AS image, p.icone,
             p.prix_vente_c AS catalogue_c,
             COALESCE(pb.prix_c, p.prix_vente_c) AS prix_c,
             (pb.prix_c IS NOT NULL) AS propre,
             pb.par,
             p.categorie_id,
             COALESCE(cat.nom, 'sans catégorie') AS categorie,
             COALESCE(cat.ordre, 999) AS ordre,
             -- Sur combien de spires DE CETTE BORNE : un produit qui n'en
             -- occupe aucune ne se vend pas ici, et son prix n'y veut rien dire
             -- tant que le planogramme ne bouge pas. On le montre quand meme,
             -- en retrait — c'est souvent qu'on prepare la machine.
             (SELECT COUNT(*)::int FROM canal k
               WHERE k.borne_id = $2 AND k.produit_id = p.id) AS canaux,
             -- Masque sur cette borne, par lui-meme ou par sa categorie. Meme
             -- lecture que /api/borne/config : ce qui ne part pas a la machine
             -- ne doit pas se lire ici comme un produit en vente.
             EXISTS (SELECT 1 FROM borne_masque m
                      WHERE m.borne_id = $2
                        AND (m.produit_id = p.id OR m.categorie_id = p.categorie_id)) AS masque
        FROM produit p
        LEFT JOIN categorie cat ON cat.id = p.categorie_id
        LEFT JOIN prix_borne pb ON pb.produit_id = p.id AND pb.borne_id = $2
       WHERE p.compte_id = $1 AND p.actif
       ORDER BY COALESCE(cat.ordre, 999), p.ordre, p.nom`, [u.compte_id, id]),

    q<{ id: number; nom: string; ordre: number }>(
      "SELECT id, nom, ordre FROM categorie WHERE compte_id = $1 AND actif ORDER BY ordre, nom",
      [u.compte_id]),
  ]);

  const propres = produits.filter((p) => p.propre);
  const enVente = produits.filter((p) => p.canaux > 0 && !p.masque);

  // CE QUE CETTE BORNE ENCAISSERAIT SUR UN DE CHAQUE. Un total n'est pas un
  // prix, mais c'est la seule mesure qui dit d'un coup si le tarif de cette
  // machine s'ecarte du parc — et de combien.
  const ici = enVente.reduce((s, p) => s + p.prix_c, 0);
  const ailleurs = enVente.reduce((s, p) => s + p.catalogue_c, 0);
  const ecart = ailleurs > 0 ? Math.round(((ici - ailleurs) / ailleurs) * 100) : 0;

  const modifiable = peutConfigurer(u);

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href={`/bornes/${id}`} className="bouton petit">‹</Link>
          <div className="pousse">
            <h1 style={{ margin: 0, fontSize: 22 }}>Prix</h1>
            <div className="faible" style={{ fontSize: 13 }}>{b.nom}</div>
          </div>
        </div>

        <p className="sous" style={{ marginTop: 12 }}>
          Ce que <b>cette borne</b> fait payer. Un champ laissé vide suit le prix du{" "}
          <Link href="/reglages/catalogue" style={{ textDecoration: "underline" }}>
          catalogue</Link> — aujourd’hui, et le jour où il changera. Le produit reste
          le même partout : son nom, sa photo, sa fiche et son stock ne se dédoublent
          pas, seul le prix.
        </p>

        {fait === "ok" ? (
          <p className="avis-ok">
            Prix enregistrés{n && Number(n) > 0
              ? ` — ${n} prix propre${Number(n) > 1 ? "s" : ""} à cette borne`
              : " — cette borne suit le catalogue partout"}.
            La machine l’applique dès qu’elle répond.
          </p>
        ) : null}
        {fait === "aligne" ? (
          <p className="avis-ok">
            Tous les prix de cette borne sont revenus au catalogue.
          </p>
        ) : null}
        {refuses ? (
          <p className="erreur">
            {refuses} montant{Number(refuses) > 1 ? "s n’ont" : " n’a"} pas pu être
            {Number(refuses) > 1 ? " lus" : " lu"} et {Number(refuses) > 1 ? "sont" : "est"} resté
            {Number(refuses) > 1 ? "s" : ""} inchangé{Number(refuses) > 1 ? "s" : ""}.
            Un prix s’écrit « 4,50 », au plus 1 000 €. Rien n’a été ramené au
            catalogue par accident.
          </p>
        ) : null}

        <div className="bandeau">
          <div>
            <div className="valeur">{propres.length}</div>
            <div className="etiq">prix propres à cette borne</div>
          </div>
          <div>
            <div className="valeur">{enVente.length}</div>
            <div className="etiq">produits en vente ici</div>
          </div>
          <div>
            {/*
              L'ECART D'ENSEMBLE : ce que cette borne encaisserait sur un de
              chaque, compare au meme panier au prix du catalogue.

              C'EST LE NOMBRE D'EXCEPTIONS QUI DECIDE DU LIBELLE, PAS L'ECART.
              Une hausse sur un produit et une baisse sur un autre s'annulent :
              le pourcentage tombe a zero alors que deux prix ont bel et bien
              ete decides ici. Afficher « aligne sur le catalogue » dans ce cas
              serait faux, et faux la ou l'on vient justement verifier. On ne
              dit « aligne » que lorsqu'aucune exception n'existe.
            */}
            <div className="valeur">
              {propres.length === 0 ? "—"
                : ecart === 0 ? "±0 %"
                : `${ecart > 0 ? "+" : "−"}${Math.abs(ecart)} %`}
            </div>
            <div className="etiq">
              {propres.length === 0 ? "aligné sur le catalogue"
                : ecart === 0 ? "hausses et baisses se compensent"
                : "sur l’étal entier"}
            </div>
          </div>
        </div>

        {enVente.length === 0 ? (
          <div className="avis">
            <IcoAlerte size={17} />
            <div className="dit">
              <div className="titre">Cette borne ne vend rien pour l’instant</div>
              <div className="texte">
                Aucun produit affiché n’occupe de canal ici. Les prix se règlent quand
                même — ils s’appliqueront dès que le planogramme sera posé.
              </div>
            </div>
            <Link href={`/bornes/${id}/planogramme`} className="bouton petit">Planogramme</Link>
          </div>
        ) : null}

        {produits.length === 0 ? (
          <Repli icone={<IcoCatalogue />} titre="Catalogue vide"
                 texte="Il n’y a pas encore de produit à tarifer."
                 action={{ nom: "Ouvrir le catalogue", vers: "/reglages/catalogue" }} />
        ) : !modifiable ? (
          // LECTURE SEULE : on montre ce que la borne pratique, sans les champs.
          // Un formulaire desactive donne l'impression d'une panne ; une liste
          // dit simplement ce qui est.
          <div className="carte plate"><div className="lignes">
            {produits.map((p) => (
              <div className="ligne" key={p.id}>
                <div className="corps">
                  <div className="nom">{p.nom}</div>
                  <div className="meta">
                    <span className="mono">{p.sku}</span> · {p.categorie}
                    {p.propre ? ` · catalogue ${euros(p.catalogue_c)}` : " · prix du catalogue"}
                  </div>
                </div>
                <div className="fin">
                  <div className="num">{euros(p.prix_c)}</div>
                  {p.propre
                    ? <span className="pilule attente"><i />propre à cette borne</span>
                    : null}
                </div>
              </div>
            ))}
          </div></div>
        ) : (
          <form method="post" action={`/api/bornes/${id}/prix`}>
            <div className="ranger-duo">
              <GrillePrix
                lignes={produits.map<Ligne>((p) => ({
                  id: Number(p.id), sku: p.sku, nom: p.nom,
                  catalogue_c: Number(p.catalogue_c), prix_c: Number(p.prix_c),
                  propre: p.propre,
                  categorie_id: p.categorie_id === null ? null : Number(p.categorie_id),
                  categorie: p.categorie, ordre: Number(p.ordre),
                  image: p.image === null ? null : Number(p.image), icone: p.icone,
                  canaux: Number(p.canaux), masque: p.masque, par: p.par,
                }))}
                cats={categories.map((c) => ({
                  id: Number(c.id), nom: c.nom, ordre: Number(c.ordre),
                }))} />
            </div>
          </form>
        )}

        <p className="faible" style={{ fontSize: 12.5, marginTop: 18 }}>
          Les ventes déjà remontées gardent le prix auquel elles ont été encaissées :
          changer un tarif ici ne réécrit pas le chiffre d’affaires d’hier.
        </p>
      </main>
      <NavBasse page="bornes" />
    </>
  );
}
