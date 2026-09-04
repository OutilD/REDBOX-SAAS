import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, euros } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { Repli } from "../../repli";
import { IcoAlerte, IcoCatalogue, IcoCategories } from "../../icones";
import RangerProduits from "./ranger";
import Modale from "../../modale";
import Ajout from "./ajout";
import { prefixeSku } from "@/lib/sku";

export const dynamic = "force-dynamic";

type P = {
  id: number; sku: string; nom: string;
  categorie_id: number | null; categorie: string;
  prix_vente_c: number; age_min: number; prix_achat_c: number | null;
  description: string | null; mention: string | null; fiche_visible: boolean;
  canaux: number; actif: boolean; ordre: number; bouge: number; image: number | null; icone: string | null;
};
type Cat = { id: number; nom: string; ordre: number };

export default async function Catalogue({
  searchParams,
}: { searchParams: Promise<{ e?: string; cat?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { e, cat: filtre } = await searchParams;
  const rayonSeul = Number(filtre) || 0;

  // LES CINQ LECTURES PARTENT ENSEMBLE.
  //
  // Elles ne dependent pas les unes des autres, et chaque aller-retour vers
  // Neon coute 263 ms mesures. En serie, la page attendait plus d'une seconde
  // pour rien — et comme un clic de navigation affiche une roue pendant ce
  // temps, l'application donnait l'impression de ramer.
  const [produits, bornes, libres, rangs, categories] = await Promise.all([
    q<P>(`
      SELECT p.id, p.sku, p.nom, p.prix_vente_c, p.age_min, p.categorie_id,
             p.actif, p.ordre, p.image_id AS image, p.icone,
             p.description, p.mention, p.fiche_visible,
             COALESCE(cat.nom, 'sans catégorie') AS categorie,
             (SELECT a.prix_achat_c FROM v_prix_achat a WHERE a.produit_id = p.id) AS prix_achat_c,
             (SELECT COUNT(*)::int FROM canal c WHERE c.produit_id = p.id)         AS canaux,
             (SELECT COUNT(*)::int FROM mouvement m WHERE m.produit_id = p.id)     AS bouge
        FROM produit p LEFT JOIN categorie cat ON cat.id = p.categorie_id
       WHERE p.compte_id = $1
       ORDER BY COALESCE(cat.ordre, 999), p.ordre, p.nom`, [u.compte_id]),
    // Ou peut-on poser ce produit tout de suite ? Les spires libres, par borne —
    // et la possibilite d'en declarer une nouvelle quand il n'en reste aucune,
    // ce qui est le cas ordinaire d'une machine bien remplie.
    q<{ id: number; nom: string }>(
      "SELECT id, nom FROM borne WHERE compte_id = $1 ORDER BY nom", [u.compte_id]),
    q<{ id: number; borne_id: number; code: string }>(`
      SELECT c.id, c.borne_id, c.rangee || lpad(c.colonne::text, 2, '0') AS code
        FROM canal c JOIN borne b ON b.id = c.borne_id
       WHERE b.compte_id = $1 AND c.produit_id IS NULL
       ORDER BY c.borne_id, c.lane`, [u.compte_id]),
    // Le prochain rang libre par prefixe : c'est ce que le formulaire propose
    // quand on laisse le SKU vide. Le serveur avancera tout seul si le numero a
    // ete pris entre-temps — le chiffre affiche est une promesse, pas un contrat.
    q<{ prefixe: string; n: number }>(`
      SELECT substring(sku from '^[A-Z0-9]+') AS prefixe,
             MAX(substring(sku from '[0-9]+$')::int) + 1 AS n
        FROM produit
       WHERE compte_id = $1 AND sku ~ '^[A-Z0-9]+-[0-9]+$'
       GROUP BY 1`, [u.compte_id]),
    q<Cat>(
      "SELECT id, nom, ordre FROM categorie WHERE compte_id = $1 AND actif ORDER BY ordre, nom", [u.compte_id]),
  ]);

  const suites: Record<string, number> = {};
  for (const r of rangs) suites[r.prefixe] = Number(r.n);

  // Un produit sans canal existe dans le catalogue et part bien sur les bornes,
  // mais aucune machine ne peut le distribuer : il n'a pas de tiroir. C'est la
  // panne la plus sournoise du systeme — tout marche, et rien n'apparait. On le
  // dit ici, une bonne fois.
  const orphelins = produits.filter((p) => p.canaux === 0);

  // Vu depuis une categorie, on ne veut que SON rayon. Le formulaire n'envoie
  // alors que ces produits-la — les autres ne sont pas touches, la route ne met
  // a jour que les champs qu'elle recoit.
  const vus = rayonSeul ? produits.filter((p) => Number(p.categorie_id) === rayonSeul) : produits;
  const catsVues = rayonSeul ? categories.filter((c) => Number(c.id) === rayonSeul) : categories;
  const nomRayon = categories.find((c) => Number(c.id) === rayonSeul)?.nom;

  // L'empreinte de ce que le serveur vient d'envoyer. Tant qu'elle ne bouge pas,
  // le composant garde ses modifications en cours ; des qu'elle change — un
  // filtre, un enregistrement, un produit ajoute — il repart de la verite.
  const signature = `${rayonSeul}|${vus.map((p) => `${p.id}:${p.ordre}:${p.categorie_id}`).join()}`;

  return (
    <>
      <Entete page="catalogue" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/reglages" className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Catalogue</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Les prix valent pour toutes vos bornes. Les machines les relisent à chaque
          synchronisation. <Link href="/reglages/categories" style={{ textDecoration: "underline" }}>
          Organiser les catégories</Link>.
        </p>
        {orphelins.length > 0 ? (
          <div className="avis">
            <IcoAlerte size={17} />
            <div className="dit">
              <div className="titre">
                {orphelins.length === 1
                  ? `${orphelins[0].nom} n’est sur aucune borne`
                  : `${orphelins.length} produits ne sont sur aucune borne`}
              </div>
              <div className="texte">
                {orphelins.length === 1
                  ? "Il est bien envoyé aux machines, mais aucun canal ne lui est affecté : la borne n’a pas de tiroir d’où le sortir, donc elle ne l’affiche pas. Affectez-lui un canal dans le planogramme."
                  : "Ils sont bien envoyés aux machines, mais aucun canal ne leur est affecté : la borne n’a pas de tiroir d’où les sortir, donc elle ne les affiche pas. Affectez-leur un canal dans le planogramme."}
              </div>
            </div>
            <Link href="/bornes" className="bouton petit">Choisir une borne</Link>
          </div>
        ) : null}
        {e === "sku" ? <p className="erreur">Ce SKU existe déjà, ou le nom est vide.</p> : null}
        {e === "place" ? <p className="erreur">
          Pour déclarer une nouvelle spire, donnez sa rangée et sa colonne (1 à 10).
          Le produit a bien été créé, mais il n’est posé nulle part.
        </p> : null}
        {e === "vecu" ? <p className="erreur">
          Ce produit a déjà bougé — réceptions, transferts ou ventes. Il ne peut pas
          être supprimé sans trouer le grand livre du stock. Suspendez-le : il
          disparaît des bornes et garde son histoire.
        </p> : null}
        {e === "cat" ? <p className="erreur">
          Aucune catégorie. <Link href="/reglages/categories" style={{ textDecoration: "underline" }}>
          Créez-en une d’abord.</Link></p> : null}

        {peutConfigurer(u) ? (
        <Modale titre="Nouveau produit" ouvrir="＋ Ajouter un produit">
          <Ajout
            categories={categories.map((c) => ({ id: Number(c.id), nom: c.nom }))}
            bornes={bornes.map((b) => ({ id: Number(b.id), nom: b.nom }))}
            libres={libres.map((c) => ({
              id: Number(c.id), borne_id: Number(c.borne_id), code: c.code,
            }))}
            connus={produits.map((p) => ({ sku: p.sku, nom: p.nom }))}
            suites={suites}
          />
        </Modale>
        ) : null}

        {rayonSeul && nomRayon ? (
          <div className="rangee" style={{ marginTop: 18, gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{nomRayon}</h2>
            <span className="pilule"><i />{vus.length} produit{vus.length > 1 ? "s" : ""}</span>
            <div className="pousse" />
            <Link href="/reglages/catalogue" className="bouton petit">Voir tout le catalogue</Link>
          </div>
        ) : (
          <h2>{produits.length} produit{produits.length > 1 ? "s" : ""}</h2>
        )}
        {vus.length === 0 ? (
          categories.length === 0 ? (
            <Repli icone={<IcoCategories />} titre="Commencez par une catégorie"
                   texte="Un produit se range dans une catégorie : elle fixe aussi l’ordre dans lequel il apparaît."
                   action={{ nom: "Créer une catégorie", vers: "/reglages/categories" }} />
          ) : (
            <Repli icone={<IcoCatalogue />} titre="Catalogue vide"
                   texte="Ajoutez vos références ci-dessus : nom, prix de vente, âge minimum." />
          )
        ) : (
          <form method="post" action="/api/catalogue" encType="multipart/form-data">
            <input type="hidden" name="action" value="prix" />
            <div className="ranger-duo">
              {/* LA CLE FORCE UN REMONTAGE quand on change de filtre.

                  « Voir tout le catalogue » est un <Link> : Next fait une
                  navigation douce et React garde la meme instance du composant.
                  Or son etat naît d'un `useState(initiaux)`, qui ne lit sa
                  valeur qu'au premier montage — on revenait donc sur tout le
                  catalogue avec, en memoire, les seuls produits du rayon qu'on
                  quittait. Les six autres categories s'affichaient vides.

                  La cle change avec le filtre : React jette l'ancien etat et
                  repart des donnees du serveur. */}
              <RangerProduits key={signature} initiaux={vus.map((p) => ({
                id: Number(p.id), sku: p.sku, nom: p.nom, prix_vente_c: p.prix_vente_c,
                categorie_id: p.categorie_id === null ? null : Number(p.categorie_id),
                actif: p.actif, ordre: p.ordre, canaux: p.canaux, bouge: p.bouge,
                image: p.image === null ? null : Number(p.image), icone: p.icone,
                age_min: Number(p.age_min ?? 0), description: p.description, mention: p.mention,
                fiche_visible: p.fiche_visible,
              }))} cats={catsVues.map((c) => ({
                id: Number(c.id), nom: c.nom, ordre: Number(c.ordre),
              }))} />
            </div>
          </form>
        )}
      </main>
      <NavBasse page="catalogue" />
    </>
  );
}
