"use client";

import { useEffect, useRef, useState } from "react";
import { MOTIFS_SORTIE } from "@/lib/sortie";

/**
 * LA RAISON D'UN RETRAIT, DEMANDEE AU MOMENT DE VALIDER.
 *
 * Un nombre negatif sort de la marchandise de la machine. Sans cause, l'ecart se
 * retrouve au prochain inventaire sous la forme d'un chiffre faux, des mois plus
 * tard et sans explication — c'est pour ca que la page de sortie de stock exige
 * un motif, et il n'y a pas de raison de le demander moins ici.
 *
 * ON NE LA DEMANDE QUE S'IL Y EN A UN. Poser la question a chaque chargement
 * ferait un ecran de plus a fermer vingt fois par jour ; on lit donc les champs
 * du formulaire au moment de l'envoi, et on n'ouvre la boite que si l'un d'eux
 * est negatif.
 *
 * SANS JAVASCRIPT, LES MEMES CHAMPS SONT VISIBLES. Un `<noscript>` les rend en
 * clair sous le bouton : plus laid, mais on peut valider un retrait. Leurs
 * contenus ne partent jamais en double — un navigateur qui execute le script
 * traite le contenu de `<noscript>` comme du texte, pas comme des champs.
 */
export default function RaisonSortie() {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [note, setNote] = useState("");
  const cadre = useRef<HTMLDivElement>(null);

  /**
   * LE BOUTON EST A NOUS, ON N'INTERCEPTE PLUS RIEN.
   *
   * On ecoutait l'evenement `submit` du formulaire, pose dans un `useEffect` :
   * autrement dit apres l'hydratation. Cette page porte une trentaine de
   * compteurs, tous des composants clients — l'hydratation prend une seconde ou
   * deux sur un telephone. Un clic dans cet intervalle partait pour de vrai,
   * sans motif, et la page se rechargeait sur une erreur. C'est ce qu'on voyait :
   * « je ne peux choisir qu'une fois le chargement termine ».
   *
   * Le bouton visible est donc un bouton ORDINAIRE, qui ne fait rien avant que
   * le script soit la — ne rien faire vaut mieux qu'envoyer sans la raison — et
   * qui decide ensuite : ouvrir la boite s'il y a un retrait, envoyer sinon. Le
   * vrai bouton d'envoi ne subsiste que dans le `<noscript>`.
   */
  const surClic = () => {
    const form = cadre.current?.closest("form");
    if (!form) return;
    const negatif = [...form.querySelectorAll<HTMLInputElement>('input[type="number"]')]
      .some((i) => Number(i.value) < 0);
    if (negatif) { setMotif(""); setNote(""); setOuvert(true); return; }
    form.requestSubmit();
  };

  const valider = () => {
    const form = cadre.current?.closest("form");
    if (!form) return;
    if (!motif) return;
    if (motif === "autre" && !note.trim()) return;
    form.requestSubmit();
  };

  // La touche Echap ferme, comme partout ailleurs.
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [ouvert]);

  return (
    <div ref={cadre}>
      <input type="hidden" name="motif" value={motif} />
      <input type="hidden" name="note" value={note} />

      <button type="button" className="bouton primaire large avec-script" onClick={surClic}>
        Valider le chargement
      </button>

      {ouvert ? (
        <div className="voile-modale" role="dialog" aria-modal="true"
             aria-label="Raison de la sortie">
          <div className="modale">
            <div className="titre-modale">Pourquoi cette sortie&nbsp;?</div>
            <p className="faible" style={{ fontSize: 13, margin: "0 0 14px" }}>
              Vous retirez de la marchandise de la machine. La cause est le sujet :
              « douze cassées sur ce produit » se pilote, « douze unités perdues »
              non.
            </p>

            <div className="motifs">
              {Object.entries(MOTIFS_SORTIE).map(([cle, m]) => (
                <label key={cle} className={motif === cle ? "actif" : ""}>
                  <input type="radio" name="motif_choix" value={cle}
                         checked={motif === cle} onChange={() => setMotif(cle)} />
                  <span className="nom">{m.nom}</span>
                  <span className="quoi">{m.quoi}</span>
                </label>
              ))}
            </div>

            <div className="champ" style={{ marginTop: 12 }}>
              <label htmlFor="note-sortie">
                Note {motif === "autre" ? "" : <span className="faible">(facultative)</span>}
              </label>
              <input id="note-sortie" value={note} maxLength={200}
                     onChange={(e) => setNote(e.target.value)}
                     placeholder={motif === "autre" ? "Obligatoire pour « Autre »" : ""} />
            </div>

            <div className="rangee-actions" style={{ marginTop: 16 }}>
              <button type="button" className="bouton primaire" onClick={valider}
                      disabled={!motif || (motif === "autre" && !note.trim())}>
                Enregistrer la sortie
              </button>
              <button type="button" className="bouton discret"
                      onClick={() => setOuvert(false)}>Annuler</button>
            </div>
          </div>
        </div>
      ) : null}

      <noscript>
        <button className="bouton primaire large">Valider le chargement</button>
        <div className="carte" style={{ marginTop: 12 }}>
          <div className="champ">
            <label htmlFor="motif-nu">Raison, si vous retirez de la marchandise</label>
            <select id="motif-nu" name="motif" defaultValue="">
              <option value="">— aucun retrait —</option>
              {Object.entries(MOTIFS_SORTIE).map(([cle, m]) => (
                <option key={cle} value={cle}>{m.nom} — {m.quoi}</option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="note-nu">Note</label>
            <input id="note-nu" name="note" maxLength={200} />
          </div>
        </div>
      </noscript>
    </div>
  );
}
