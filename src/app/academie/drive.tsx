import Link from "next/link";
import { Suspense } from "react";
import { taille } from "@/lib/academie";
import { apercuDrive, cadreDossierDrive, contenuDrive, extensionDrive, lienDrive, ouvrirDrive,
         telechargerDrive, vignetteDrive, type ElementDrive } from "@/lib/drive";
import { IcoAlerte, IcoDocument, IcoDossier, IcoTelecharger } from "../icones";
import { Apercu, Photos, type Photo } from "./drive-client";

type Props = {
  url: string;
  /** L'adresse d'un sous-dossier dans l'academie ; sans elle, il s'ouvre sur Drive. */
  sousDossier?: (d: ElementDrive) => string;
  /** L'equipe lit la vraie raison d'un echec ; les autres, une phrase. */
  editeur?: boolean;
};

/**
 * LE CONTENU D'UN LIEN DRIVE : sous-dossiers, photos, documents.
 *
 * Google repond en quelques centaines de millisecondes : la page s'affiche
 * sans l'attendre, et la galerie arrive a sa place.
 */
export function Drive(props: Props) {
  return (
    <Suspense fallback={<div className="aca-drive-attente" aria-busy="true">Chargement du dossier…</div>}>
      <Contenu {...props} />
    </Suspense>
  );
}

const photo = (e: ElementDrive): Photo => ({
  id: e.id, nom: e.nom,
  petite: vignetteDrive(e.id, 640), grande: vignetteDrive(e.id, 2000),
  telecharger: telechargerDrive(e) ?? ouvrirDrive(e),
});

async function Contenu({ url, sousDossier, editeur }: Props) {
  const lien = lienDrive(url);
  const indisponible = "Ce contenu n’est pas disponible pour le moment.";
  if (!lien) return <Souci>{editeur ? "Lien Drive non reconnu." : indisponible}</Souci>;
  const c = await contenuDrive(lien);

  switch (c.etat) {
    case "sans-cle":
      return (
        <div className="aca-drive">
          {editeur ? (
            <p className="aide">
              Vue simple de Drive. La galerie intégrée s’active avec une clé d’API Google
              (<code>REDBOX_GOOGLE_CLE_API</code>) sur le serveur.
            </p>
          ) : null}
          <iframe className="aca-drive-cadre" title="Google Drive"
                  src={lien.genre === "dossier" ? cadreDossierDrive(lien.id) : apercuDrive(lien.id)} />
        </div>
      );
    case "introuvable":
      return (
        <Souci>
          {editeur
            ? "Drive ne trouve pas ce lien. Vérifiez qu’il est partagé « Tous les utilisateurs disposant du lien »."
            : indisponible}
        </Souci>
      );
    case "erreur":
      return <Souci>{editeur ? `Drive a refusé la lecture : ${c.raison}` : indisponible}</Souci>;
    case "fichier":
      return c.element.type.startsWith("image/")
        ? <Photos photos={[photo(c.element)]} />
        : <div className="aca-fichiers"><FichierDrive e={c.element} /></div>;
    case "dossier": {
      const vide = !c.dossiers.length && !c.images.length && !c.fichiers.length;
      return (
        <div className="aca-drive">
          {c.dossiers.length ? (
            <div className="aca-drive-dossiers">
              {c.dossiers.map((d) => sousDossier ? (
                <Link key={d.id} href={sousDossier(d)} className="aca-drive-dossier">
                  <IcoDossier size={18} /> <span>{d.nom}</span>
                </Link>
              ) : (
                <a key={d.id} href={ouvrirDrive(d)} target="_blank" rel="noopener noreferrer" className="aca-drive-dossier">
                  <IcoDossier size={18} /> <span>{d.nom}</span>
                </a>
              ))}
            </div>
          ) : null}
          {c.images.length ? <Photos photos={c.images.map(photo)} /> : null}
          {c.fichiers.length ? (
            <div className="aca-fichiers">{c.fichiers.map((e) => <FichierDrive key={e.id} e={e} />)}</div>
          ) : null}
          {vide ? <p className="vide">Ce dossier est vide pour l’instant.</p> : null}
        </div>
      );
    }
  }
}

function FichierDrive({ e }: { e: ElementDrive }) {
  const ext = extensionDrive(e);
  const garder = telechargerDrive(e);
  return (
    <div className="aca-fichier">
      <span className="doc" aria-hidden="true">
        <IcoDocument size={20} />
        <span className="ext">{ext}</span>
      </span>
      <div className="dit">
        <div className="nom">{e.nom}</div>
        <div className="meta"><span className="num">{ext}{e.taille ? ` · ${taille(e.taille)}` : ""}</span></div>
      </div>
      <div className="actions">
        <Apercu nom={e.nom} cadre={apercuDrive(e.id)} />
        {garder ? (
          <a className="bouton petit primaire" href={garder}>
            <IcoTelecharger size={16} /> Télécharger
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Souci({ children }: { children: React.ReactNode }) {
  return <p className="aca-drive-souci"><IcoAlerte size={16} /> {children}</p>;
}
