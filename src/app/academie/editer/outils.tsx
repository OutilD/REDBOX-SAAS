import { ACCES, ICONES, RESUME_MAX, TEXTE_MAX, TITRE_MAX,
         type Acces, type Bloc, type Genre, type Icone, type Ressource } from "@/lib/academie";
import { IcoBas, IcoCadenas, IcoCommunaute, IcoHaut } from "../../icones";
import { IconeModule, NOMS_ICONES } from "../vues";

/**
 * LES OUTILS DE L'EDITEUR. Des formulaires ordinaires, envoyes aux routes :
 * l'academie s'ecrit sans JavaScript, comme le reste de la console.
 */

export const ERREURS: Record<string, string> = {
  titre: "Donnez un titre.",
  texte: "Ce bloc a besoin d’un texte.",
  video: "Lien vidéo non reconnu : collez l’adresse d’une vidéo YouTube ou Vimeo.",
  drive: "Lien Drive non reconnu : collez l’adresse d’un dossier ou d’un fichier Google Drive.",
  fichier: "Choisissez un fichier.",
  fichier_type: "Format refusé : PDF, Word, Excel, PowerPoint, ODT ou image (JPG, PNG, WEBP) — une image pour un bloc image.",
  fichier_lourd: "Fichier trop lourd : 20 Mo au plus. Une vidéo se dépose sur YouTube.",
  fichier_vide: "Ce fichier est vide.",
};

const ACCEPTE = ".pdf,.doc,.docx,.odt,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp";

/** Monter, descendre. Deux formulaires, deux boutons ; aux bords, inactifs. */
export function Deplacer({ route, id, premier, dernier }: {
  route: "module" | "lecon" | "bloc" | "ressource"; id: number; premier: boolean; dernier: boolean;
}) {
  return (
    <span className="aca-deplacer">
      <form method="post" action={`/api/academie/${route}`}>
        <input type="hidden" name="action" value="monter" />
        <input type="hidden" name="id" value={id} />
        <button className="bouton petit carre" disabled={premier} aria-label="Monter" title="Monter">
          <IcoHaut size={16} />
        </button>
      </form>
      <form method="post" action={`/api/academie/${route}`}>
        <input type="hidden" name="action" value="descendre" />
        <input type="hidden" name="id" value={id} />
        <button className="bouton petit carre" disabled={dernier} aria-label="Descendre" title="Descendre">
          <IcoBas size={16} />
        </button>
      </form>
    </span>
  );
}

/** Publier ou retirer, sans ouvrir le formulaire complet. */
export function Publier({ route, id, publie }: { route: "module" | "lecon"; id: number; publie: boolean }) {
  return (
    <form method="post" action={`/api/academie/${route}`}>
      <input type="hidden" name="action" value="publier" />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="publie" value={publie ? "0" : "1"} />
      <button className={publie ? "bouton petit" : "bouton petit primaire"}>{publie ? "Dépublier" : "Publier"}</button>
    </form>
  );
}

export function EtatPublication({ publie }: { publie: boolean }) {
  return publie
    ? <span className="aca-tag" data-ton="fini">Publié</span>
    : <span className="aca-tag" data-ton="brouillon">Brouillon</span>;
}

export function EtiquetteAcces({ acces }: { acces: Acces }) {
  return acces === "redboxers"
    ? <span className="aca-tag" data-ton="redboxers"><IcoCadenas size={12} /> Redboxers</span>
    : <span className="aca-tag">Ouvert à tous</span>;
}

export function ChoixIcone({ valeur }: { valeur: Icone }) {
  return (
    <fieldset className="aca-groupe">
      <legend>Icône</legend>
      <div className="aca-choix">
        {ICONES.map((i) => (
          <label key={i}>
            <input type="radio" name="icone" value={i} defaultChecked={i === valeur} />
            <IconeModule icone={i} size={22} />
            <span>{NOMS_ICONES[i]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ChoixAcces({ valeur, note }: { valeur: Acces; note?: string }) {
  return (
    <fieldset className="aca-groupe">
      <legend>Qui peut l’ouvrir</legend>
      <div className="aca-choix deux">
        {ACCES.map((a) => (
          <label key={a.cle}>
            <input type="radio" name="acces" value={a.cle} defaultChecked={a.cle === valeur} />
            <span className="nom">
              {a.cle === "redboxers" ? <IcoCadenas size={16} /> : <IcoCommunaute size={16} />} {a.nom}
            </span>
            <span className="quoi">{a.quoi}</span>
          </label>
        ))}
      </div>
      {note ? <p className="aide">{note}</p> : null}
    </fieldset>
  );
}

export function CasePublie({ publie, quoi }: { publie: boolean; quoi: string }) {
  return (
    <label className="aca-coche">
      <input type="checkbox" name="publie" value="1" defaultChecked={publie} />
      <span>Publié{" "}<span className="faible">— {quoi}</span></span>
    </label>
  );
}

/** Le lien Drive, et ce qu'il faut pour que tout le monde le voie. */
export function ChampDrive({ p, valeur }: { p: string; valeur?: string | null }) {
  return (
    <div className="champ">
      <label htmlFor={`${p}-url`}>Lien Google Drive</label>
      <input id={`${p}-url`} name="url" type="url" required maxLength={500} inputMode="url"
             defaultValue={valeur ?? ""} placeholder="https://drive.google.com/drive/folders/…" />
      <p className="aide">
        Un dossier (ses photos et documents s’affichent) ou un seul fichier. Sur Drive : Partager →
        « Tous les utilisateurs disposant du lien », en lecture.
      </p>
    </div>
  );
}

/** Un bouton de la page Ressources : son nom, son lien Drive, son icone, sa porte. */
export function ChampsRessource({ r }: { r?: Ressource }) {
  const p = r ? `r${r.id}` : "r-n";
  return (
    <>
      <div className="champ">
        <label htmlFor={`${p}-titre`}>Nom du bouton</label>
        <input id={`${p}-titre`} name="titre" required maxLength={TITRE_MAX} defaultValue={r?.titre ?? ""}
               placeholder="Photos machines" />
      </div>
      <ChampDrive p={p} valeur={r?.url} />
      <div className="champ">
        <label htmlFor={`${p}-texte`}>Description <span className="faible">(facultatif)</span></label>
        <input id={`${p}-texte`} name="texte" maxLength={RESUME_MAX} defaultValue={r?.texte ?? ""}
               placeholder="Les RedBox installées, sous tous les angles" />
      </div>
      <ChoixIcone valeur={r?.icone ?? "document"} />
      <ChoixAcces valeur={r?.acces ?? "tous"} />
    </>
  );
}

function AideTexte() {
  return (
    <p className="aide">
      <code>## Intertitre</code> · <code>- élément de liste</code> · <code>1. étape</code> ·{" "}
      <code>**gras**</code> · <code>[texte du lien](https://…)</code>. Une ligne vide sépare deux paragraphes.
    </p>
  );
}

/**
 * LES CHAMPS D'UN BLOC, SELON SON GENRE. Chaque genre ne montre que ce qu'il
 * lit : un formulaire « video » n'a pas de zone de texte ou l'on se demande
 * ce qu'il faut ecrire.
 */
export function ChampsBloc({ genre, b }: { genre: Genre; b?: Bloc }) {
  const p = b ? `b${b.id}` : `n-${genre}`;
  switch (genre) {
    case "texte":
      return (
        <div className="champ">
          <label htmlFor={`${p}-texte`}>Texte</label>
          <textarea id={`${p}-texte`} name="texte" rows={10} required maxLength={TEXTE_MAX}
                    defaultValue={b?.texte ?? ""} />
          <AideTexte />
        </div>
      );
    case "astuce":
    case "attention":
    case "script":
      return (
        <>
          <div className="champ">
            <label htmlFor={`${p}-titre`}>
              {genre === "script" ? "La situation, ou l’objection" : "Titre"} <span className="faible">(facultatif)</span>
            </label>
            <input id={`${p}-titre`} name="titre" maxLength={TITRE_MAX} defaultValue={b?.titre ?? ""}
                   placeholder={genre === "script" ? "« Et si elle tombe en panne ? »" : genre === "astuce" ? "Astuce terrain" : "Point d’attention"} />
          </div>
          <div className="champ">
            <label htmlFor={`${p}-texte`}>{genre === "script" ? "Ce qu’on dit" : "Texte"}</label>
            <textarea id={`${p}-texte`} name="texte" rows={5} required maxLength={TEXTE_MAX}
                      defaultValue={b?.texte ?? ""} />
            <AideTexte />
          </div>
        </>
      );
    case "fiche":
      return (
        <>
          <div className="champ">
            <label htmlFor={`${p}-titre`}>Titre <span className="faible">(facultatif)</span></label>
            <input id={`${p}-titre`} name="titre" maxLength={TITRE_MAX} defaultValue={b?.titre ?? ""}
                   placeholder="RedBox — fiche technique" />
          </div>
          <div className="champ">
            <label htmlFor={`${p}-texte`}>Mesures</label>
            <textarea id={`${p}-texte`} name="texte" rows={10} required maxLength={TEXTE_MAX}
                      defaultValue={b?.texte ?? ""} placeholder={"Hauteur : …\nLargeur : …\nPoids : …"} />
            <p className="aide">
              Une mesure par ligne, le nom et la valeur séparés par deux-points. Une valeur
              « à compléter » s’affiche en ambre, pour qu’on la voie avant de publier.
            </p>
          </div>
        </>
      );
    case "video":
      return (
        <>
          <div className="champ">
            <label htmlFor={`${p}-url`}>Lien de la vidéo</label>
            <input id={`${p}-url`} name="url" type="url" required maxLength={500} inputMode="url"
                   defaultValue={b?.url ?? ""} placeholder="https://www.youtube.com/watch?v=…" />
            <p className="aide">
              YouTube (vidéo, Short, direct) ou Vimeo. Une vidéo « non répertoriée » sur YouTube
              fonctionne : seuls ceux qui ont le lien la voient.
            </p>
          </div>
          <div className="champ">
            <label htmlFor={`${p}-titre`}>Légende <span className="faible">(facultatif)</span></label>
            <input id={`${p}-titre`} name="titre" maxLength={TITRE_MAX} defaultValue={b?.titre ?? ""} />
          </div>
        </>
      );
    case "drive":
      return (
        <>
          <ChampDrive p={p} valeur={b?.url} />
          <div className="champ">
            <label htmlFor={`${p}-titre`}>Titre <span className="faible">(facultatif)</span></label>
            <input id={`${p}-titre`} name="titre" maxLength={TITRE_MAX} defaultValue={b?.titre ?? ""}
                   placeholder="La RedBox installée dans un bar" />
          </div>
        </>
      );
    case "fichier":
      return (
        <>
          <div className="champ">
            <label htmlFor={`${p}-fichier`}>
              {b ? "Remplacer le fichier" : "Fichier"} {b ? <span className="faible">(facultatif)</span> : null}
            </label>
            <input id={`${p}-fichier`} name="fichier" type="file" accept={ACCEPTE} required={!b} className="aca-fichier-champ" />
            <p className="aide">
              {b?.fichier_nom ? <>Actuel : <b>{b.fichier_nom}</b>. </> : null}
              PDF, Word, Excel, PowerPoint, ODT ou image — 20 Mo au plus.
            </p>
          </div>
          <div className="champ">
            <label htmlFor={`${p}-titre`}>Nom affiché <span className="faible">(facultatif)</span></label>
            <input id={`${p}-titre`} name="titre" maxLength={TITRE_MAX} defaultValue={b?.titre ?? ""}
                   placeholder="Certificat de conformité CE" />
          </div>
          <div className="champ">
            <label htmlFor={`${p}-texte`}>Description <span className="faible">(facultatif)</span></label>
            <textarea id={`${p}-texte`} name="texte" rows={2} maxLength={400} defaultValue={b?.texte ?? ""} />
          </div>
        </>
      );
    case "image":
      return (
        <>
          <div className="champ">
            <label htmlFor={`${p}-fichier`}>
              {b ? "Remplacer l’image" : "Image"} {b ? <span className="faible">(facultatif)</span> : null}
            </label>
            <input id={`${p}-fichier`} name="fichier" type="file" accept=".jpg,.jpeg,.png,.webp" required={!b}
                   className="aca-fichier-champ" />
            <p className="aide">JPG, PNG ou WEBP — 20 Mo au plus.</p>
          </div>
          <div className="champ">
            <label htmlFor={`${p}-texte`}>Légende <span className="faible">(elle sert aussi de description pour les lecteurs d’écran)</span></label>
            <input id={`${p}-texte`} name="texte" maxLength={400} defaultValue={b?.texte ?? ""} />
          </div>
        </>
      );
  }
}
