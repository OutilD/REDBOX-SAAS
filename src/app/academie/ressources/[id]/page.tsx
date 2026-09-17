import Link from "next/link";
import { notFound } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { ressourceDe, salonProspects } from "@/lib/academie";
import { DOSSIER, contenuDrive, lienDrive, ouvrirDrive, type LienDrive } from "@/lib/drive";
import { ChampsRessource, ERREURS, EtiquetteAcces } from "../../editer/outils";
import { Drive } from "../../drive";
import { lecteurDePage } from "../../lecteur";
import { IconeModule, PorteFermee } from "../../vues";

export const dynamic = "force-dynamic";

/**
 * UNE RESSOURCE : LE CONTENU DE SON DOSSIER DRIVE, SUR PLACE.
 *
 * Les sous-dossiers s'ouvrent ici aussi. Le chemin parcouru est dans l'adresse
 * (`?d=id1,id2`) et chaque pas est verifie : un sous-dossier n'est suivi que
 * s'il est bien dans le dossier precedent — la page ne sert pas a lire
 * n'importe quel Drive.
 */
export default async function RessourcePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string; e?: string; ok?: string }>;
}) {
  const [{ l }, { id }, sp] = await Promise.all([lecteurDePage(), params, searchParams]);
  const r = await ressourceDe(l, Number(id));
  if (!r) notFound();
  const salon = r.ouverte ? null : await salonProspects();
  const erreur = sp.e ? ERREURS[sp.e] ?? "Impossible." : null;

  const chemin: { id: string; nom: string }[] = [];
  const racine = lienDrive(r.url);
  if (r.ouverte && racine && racine.genre !== "fichier" && sp.d) {
    let parent: LienDrive = racine;
    for (const pas of sp.d.split(",").slice(0, 10)) {
      const c = await contenuDrive(parent);
      const d = c.etat === "dossier" ? c.dossiers.find((x) => x.id === pas) : undefined;
      if (!d) break;
      chemin.push({ id: d.id, nom: d.nom });
      parent = { id: d.id, cle: null, genre: "dossier" };
    }
  }
  const ici = `/academie/ressources/${r.id}`;
  const vers = (n: number) => n === 0 ? ici : `${ici}?d=${chemin.slice(0, n).map((x) => x.id).join(",")}`;
  const dernier = chemin[chemin.length - 1];

  return (
    <>
      <Entete page="academie" />
      <main className="ecran aca aca-focus">
        <Link href={chemin.length ? vers(chemin.length - 1) : "/academie/ressources"} className="aca-retour">
          ‹ {chemin.length > 1 ? chemin[chemin.length - 2].nom : chemin.length ? r.titre : "Ressources"}
        </Link>
        <div className="aca-module-tete">
          <span className="aca-picto grand" aria-hidden="true"><IconeModule icone={r.icone} size={28} /></span>
          <div>
            {l.editeur ? <div className="aca-surtitre"><EtiquetteAcces acces={r.acces} /></div> : null}
            <h1>{dernier ? dernier.nom : r.titre}</h1>
            {chemin.length ? (
              <nav className="aca-drive-chemin" aria-label="Dossiers">
                <Link href={ici}>{r.titre}</Link>
                {chemin.slice(0, -1).map((x, n) => (
                  <span key={x.id}> › <Link href={vers(n + 1)}>{x.nom}</Link></span>
                ))}
              </nav>
            ) : r.texte ? <p className="aca-chapeau">{r.texte}</p> : null}
          </div>
        </div>

        {sp.ok === "1" ? <p className="aca-ok" role="status">Ressource enregistrée.</p> : null}

        {r.ouverte ? (
          <Drive key={dernier?.id ?? "racine"}
                 url={dernier ? ouvrirDrive({ id: dernier.id, type: DOSSIER }) : r.url}
                 sousDossier={(d) => `${ici}?d=${[...chemin.map((x) => x.id), d.id].join(",")}`}
                 editeur={l.editeur} />
        ) : (
          <PorteFermee salon={salon} />
        )}

        {l.editeur ? (
          <>
            <details className="aca-ed-modifier carte aca-ressource-modifier" id="modifier" open={Boolean(erreur)}>
              <summary>Modifier cette ressource</summary>
              <form method="post" action="/api/academie/ressource" className="formulaire">
                <input type="hidden" name="action" value="maj" />
                <input type="hidden" name="id" value={r.id} />
                {erreur ? <p className="erreur">{erreur}</p> : null}
                <ChampsRessource r={r} />
                <div className="aca-ed-bas">
                  <span />
                  <button className="bouton primaire">Enregistrer</button>
                </div>
              </form>
            </details>
            <details className="aca-danger">
              <summary>Retirer cette ressource</summary>
              <div className="dedans">
                <p>Le bouton disparaît de la page Ressources. Le dossier Drive, lui, n’est pas touché.</p>
                <form method="post" action="/api/academie/ressource">
                  <input type="hidden" name="action" value="supprimer" />
                  <input type="hidden" name="id" value={r.id} />
                  <button className="bouton danger">Retirer</button>
                </form>
              </div>
            </details>
          </>
        ) : null}
      </main>
      <NavBasse page="academie" />
    </>
  );
}
