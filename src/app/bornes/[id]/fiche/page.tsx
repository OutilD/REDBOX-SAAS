import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q1 } from "@/db";
import { peutConfigurer, peutVoirBorne, utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Borne = {
  id: number; nom: string; adresse: string | null;
  description: string | null; image_id: number | null;
};

/**
 * LA FICHE D'UNE BORNE, SUR SA PROPRE PAGE.
 *
 * Elle vivait dans un volet replie au milieu de la page de la machine, entre les
 * boutons de chargement et la mise hors service. Deux choses n'allaient pas :
 * on ne la trouvait pas, et une fois ouverte elle poussait tout le reste de la
 * page vers le bas — on modifiait un nom en ayant perdu de vue l'etat de la
 * borne qu'on etait venu regarder.
 *
 * Elle a donc une adresse a elle. On y va, on ecrit, on revient.
 */
export default async function FicheBorne({ params, searchParams }:
  { params: Promise<{ id: string }>;
    searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  if (!peutVoirBorne(u, id)) notFound();
  const { e } = await searchParams;

  const b = await q1<Borne>(
    `SELECT id, nom, adresse, description, image_id
       FROM borne WHERE id = $1 AND compte_id = $2`, [id, u.compte_id]);
  if (!b) notFound();
  // Regarder ne suffit pas pour ecrire : la page elle-meme se refuse, sans quoi
  // on remplirait un formulaire que la route rejetterait a l'envoi.
  if (!peutConfigurer(u)) redirect(`/bornes/${id}`);

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href={`/bornes/${id}`} className="bouton petit">‹</Link>
          <div className="pousse">
            <h1 style={{ margin: 0, fontSize: 22 }}>Fiche de la borne</h1>
            <div className="faible" style={{ fontSize: 13 }}>{b.nom}</div>
          </div>
        </div>

        {e === "nom" ? <p className="erreur">Le nom ne peut pas être vide.</p> : null}

        <form method="post" action={`/api/bornes/${id}/fiche`} encType="multipart/form-data">
          {/*
            LA PHOTO D'ABORD, EN GRAND.

            C'est elle qu'on reconnait avant de lire, et c'est donc elle qui doit
            etre visible avant les champs. Un aperçu vide dit tout autant : cette
            machine n'a pas encore de repere.
          */}
          <div className="carte fiche-tete">
            <div className="apercu">
              {b.image_id ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/image/${b.image_id}`} alt="" />
              ) : (
                <span className="vide">Aucune photo</span>
              )}
            </div>
            <div className="quoi">
              <div className="titre">Photo de la machine</div>
              <p className="faible" style={{ fontSize: 13, margin: "4px 0 10px" }}>
                Une vue du bar, de la devanture, de la borne en place. C’est ce qui
                permet de la reconnaître d’un coup d’œil dans une tournée.
              </p>
              <label className="fichier">
                <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
                <span>{b.image_id ? "Changer la photo" : "Choisir une photo"}</span>
              </label>
              {b.image_id ? (
                <label className="oter">
                  <input type="checkbox" name="oter" /> Retirer la photo
                </label>
              ) : null}
            </div>
          </div>

          <div className="carte">
            <div className="champ">
              <label htmlFor="nom">Nom</label>
              <input id="nom" name="nom" required defaultValue={b.nom} maxLength={80} />
              <p className="faible" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
                Il apparaît partout : la liste des bornes, le sélecteur, et les
                mouvements de stock.
              </p>
            </div>

            <div className="champ">
              <label htmlFor="adresse">Adresse</label>
              <input id="adresse" name="adresse" defaultValue={b.adresse ?? ""}
                     maxLength={160} placeholder="12 rue des Lilas, Paris 11ᵉ" />
              <p className="faible" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
                La machine l’affiche sur son écran d’assistance : c’est ce que lit un
                client qui vous appelle.
              </p>
            </div>

            <div className="champ">
              <label htmlFor="description">Description</label>
              <textarea id="description" name="description" rows={4} maxLength={400}
                        defaultValue={b.description ?? ""}
                        placeholder="Au fond à gauche, derrière le flipper. Le patron ouvre à 17 h. Prise derrière le comptoir." />
              <p className="faible" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
                Ce qu’aucun champ ne dira : où elle est dans le bar, à qui parler, ce
                qui coince. C’est ce que lit le réassortisseur avant de partir.
              </p>
            </div>
          </div>

          <div className="rangee-actions">
            <button className="bouton primaire">Enregistrer la fiche</button>
            <Link href={`/bornes/${id}`} className="bouton discret">Annuler</Link>
          </div>
        </form>
      </main>
      <NavBasse page="bornes" />
    </>
  );
}
