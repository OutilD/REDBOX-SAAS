"use client";

import { useState } from "react";

/**
 * UN CHAMP DE FICHIER QUI DIT CE QU'ON A CHOISI.
 *
 * Le champ natif affiche « Choisir un fichier · Aucun fichier choisi » dans la
 * fonte du systeme, avec un bouton gris qui n'appartient a aucune interface. Le
 * motif `.fichier` du depot le deguise proprement, mais il cache l'INFORMATION
 * avec le champ : une fois le fichier pris, plus rien ne le nomme. Ailleurs cela
 * passe — on choisit une photo de profil et on l'envoie. Ici on selectionne
 * plusieurs visuels d'un coup pour former une playlist, et savoir COMBIEN on
 * emporte est la moitie du geste.
 *
 * LE CHAMP N'EST PAS ESCAMOTE, IL EST TRANSPARENT.
 *
 * Le cacher par `clip` — ce que fait `.fichier` — le sort du rendu, et un
 * navigateur refuse alors de pointer une erreur de validation sur un champ
 * `required` qu'il ne peut pas montrer : « An invalid form control is not
 * focusable », et le formulaire ne part plus sans qu'on sache pourquoi. Pose en
 * transparence par-dessus le bouton, il garde sa boite, son focus et sa bulle
 * d'erreur, et le bouton dessous n'est plus qu'un decor.
 *
 * SANS JAVASCRIPT, ON REND LA MAIN AU NAVIGATEUR. Le nom du fichier vient d'un
 * etat React ; sans script il resterait a « aucun fichier » quoi qu'on prenne,
 * ce qui est pire que le champ natif. Le `<noscript>` remet donc ce dernier en
 * place, laid et honnete.
 */
export default function ChoixFichier({
  id, name, accept, multiple = false, required = false, libelle,
}: {
  id?: string;
  name: string;
  accept: string;
  multiple?: boolean;
  required?: boolean;
  /** Ce qu'on lit sur le bouton. « Choisir des visuels », « Choisir une vidéo »… */
  libelle: string;
}) {
  const [noms, setNoms] = useState<string[]>([]);
  const [taille, setTaille] = useState(0);

  return (
    <div className="choix-fichier">
      <span className="declencheur-fichier">
        <input id={id} name={name} type="file" accept={accept}
               multiple={multiple} required={required}
               onChange={(e) => {
                 const pris = Array.from(e.target.files ?? []);
                 setNoms(pris.map((f) => f.name));
                 setTaille(pris.reduce((s, f) => s + f.size, 0));
               }} />
        <span className="faux-bouton">{libelle}</span>
      </span>

      {/* Ce qu'on emporte, en clair. Un seul fichier se nomme ; au-dela on
          compte — quinze noms de fichiers empiles ne se lisent pas, et ce qu'on
          verifie a ce moment-la est le nombre et le poids. */}
      <span className="dit">
        {noms.length === 0 ? (
          <span className="rien">Aucun fichier choisi</span>
        ) : noms.length === 1 ? (
          <><b className="nom-fichier">{noms[0]}</b> · {poidsCourt(taille)}</>
        ) : (
          <><b>{noms.length} fichiers</b> · {poidsCourt(taille)}</>
        )}
      </span>

      <noscript>
        <style>{`
          .choix-fichier .declencheur-fichier input[type="file"] {
            position: static; opacity: 1; width: auto; height: auto; cursor: auto;
          }
          .choix-fichier .faux-bouton, .choix-fichier .dit { display: none; }
        `}</style>
      </noscript>
    </div>
  );
}

/** Ko sous le mega-octet, Mo au-dela. Personne ne compte en octets. */
function poidsCourt(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} Ko`;
  const mo = n / 1024 / 1024;
  return `${mo < 10 ? mo.toFixed(1) : Math.round(mo)} Mo`;
}
