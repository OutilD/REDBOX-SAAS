"use client";

import { useEffect, useRef, useState } from "react";
import { MOTIFS_SORTIE } from "@/lib/sortie";

/** Une ligne du formulaire dont le compteur est passe sous zero. */
type Retrait = { quoi: string; ou: string; combien: number };

/** Au-dela, la liste se replie sur un compte : quinze lignes ne se relisent pas
 *  debout devant une machine, et la question posee reste la meme. */
const A_VOIR = 5;

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
 * ELLE MONTRE DE QUOI ELLE PARLE. Elle posait la question sans jamais dire sur
 * quoi : on avait rempli quinze canaux, trois partaient en retrait, et il
 * fallait fermer la boite pour aller voir lesquels — puis la rouvrir, et
 * recommencer le choix. Les lignes concernees se relisent maintenant dedans,
 * reprises des champs eux-memes.
 *
 * C'EST UN VRAI `<dialog>`, comme le reste de l'application. Le piege a focus,
 * la touche Echap, le voile et le retour du curseur la ou on l'avait laisse
 * viennent du navigateur, corrects du premier coup ; le div maison qui tenait
 * ce role laissait la tabulation courir derriere le voile.
 *
 * SANS JAVASCRIPT, LES MEMES CHAMPS SONT VISIBLES. Un `<noscript>` les rend en
 * clair sous le bouton : plus laid, mais on peut valider un retrait. Leurs
 * contenus ne partent jamais en double — un navigateur qui execute le script
 * traite le contenu de `<noscript>` comme du texte, pas comme des champs.
 */
export default function RaisonSortie() {
  const [ouvert, setOuvert] = useState(false);
  const [retraits, setRetraits] = useState<Retrait[]>([]);
  const [motif, setMotif] = useState("");
  const [note, setNote] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [bilan, setBilan] = useState({ ajout: 0, retrait: 0, canaux: 0 });

  const cadre = useRef<HTMLDivElement>(null);
  const boite = useRef<HTMLDialogElement>(null);
  const premier = useRef<HTMLInputElement>(null);
  const champNote = useRef<HTMLInputElement>(null);

  const formulaire = () => cadre.current?.closest("form");

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
    const f = formulaire();
    if (!f) return;
    const sortants: Retrait[] = [...f.querySelectorAll<HTMLInputElement>('input[type="number"]')]
      .filter((i) => Number(i.value) < 0)
      .map((i) => ({
        quoi: i.dataset.etiquette || "Canal",
        ou: i.dataset.canal || "",
        combien: -Number(i.value),
      }));
    if (sortants.length === 0) { f.requestSubmit(); return; }

    setRetraits(sortants); setMotif(""); setNote(""); setEnvoi(false);
    setOuvert(true);
    boite.current?.showModal();
    // `showModal` pose le curseur sur la croix de fermeture, c'est-a-dire sur la
    // sortie. On le pose sur le premier motif : les fleches du clavier parcourent
    // alors le choix, qui est ce qu'on est venu faire. Sans deplacer la vue pour
    // autant — sur un petit ecran, le corps defilerait et la liste de ce qu'on
    // retire, que la boite vient d'afficher, sortirait aussitot par le haut.
    premier.current?.focus({ preventScroll: true });
  };

  const fermer = () => { boite.current?.close(); };

  const valider = () => {
    const f = formulaire();
    if (!f || manque || envoi) return;
    // Un double clic partirait deux fois : le premier envoi ne repeint rien
    // avant que le serveur reponde, et le bouton reste sous le doigt.
    setEnvoi(true);
    f.requestSubmit();
  };

  /**
   * CE QU'ON EST EN TRAIN DE COMPOSER, ECRIT AU-DESSUS DU BOUTON.
   *
   * On appuie trente fois sur « + » en descendant la machine, et rien nulle part
   * ne disait ce qu'on s'apprete a envoyer. Le compte se relisait dans sa tete,
   * ou pas du tout — et l'erreur ne se voyait qu'au recapitulatif de la boite de
   * sortie, quand il y en avait une.
   *
   * On lit les champs du formulaire, comme le bouton d'envoi le fait deja au
   * moment de partir : une seule facon de compter, donc jamais deux comptes qui
   * divergent. `pas-bouge` est l'evenement que les compteurs emettent apres
   * chaque clic — le navigateur, lui, n'en emet que pour ce qui est tape.
   */
  useEffect(() => {
    const f = formulaire();
    if (!f) return;
    const compter = () => {
      let ajout = 0, retrait = 0, canaux = 0;
      for (const i of f.querySelectorAll<HTMLInputElement>('input[type="number"]')) {
        const v = Number(i.value) || 0;
        if (v > 0) ajout += v;
        else if (v < 0) retrait -= v;
        if (v !== 0) canaux++;
      }
      setBilan({ ajout, retrait, canaux });
    };
    compter();
    f.addEventListener("input", compter);
    f.addEventListener("pas-bouge", compter);
    return () => {
      f.removeEventListener("input", compter);
      f.removeEventListener("pas-bouge", compter);
    };
  }, []);

  /**
   * LA PAGE NE DOIT PAS DEFILER DERRIERE LE VOILE. `showModal` pose le voile et
   * piege le focus, mais laisse le corps rouler sous le doigt : on ferme la
   * boite et on se retrouve trente canaux plus bas, sans savoir comment.
   */
  useEffect(() => {
    if (!ouvert) return;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = avant; };
  }, [ouvert]);

  const total = retraits.reduce((s, r) => s + r.combien, 0);
  const pluriel = total > 1 ? "s" : "";
  const caches = Math.max(0, retraits.length - A_VOIR);

  // Ce qui manque encore, en toutes lettres. Un bouton gris qui ne repond pas et
  // n'explique rien laisse chercher tout seul ce qu'on a oublie.
  const manque =
    !motif ? "Choisissez un motif pour continuer."
    : motif === "autre" && !note.trim() ? "Le motif « Autre » demande une note."
    : "";

  return (
    <div ref={cadre}>
      <input type="hidden" name="motif" value={motif} />
      <input type="hidden" name="note" value={note} />

      <div className="barre-envoi avec-script">
        <p className="bilan" role="status">
          {bilan.canaux === 0
            ? <span className="rien">Rien à envoyer pour l’instant — ajustez un canal.</span>
            : <>
                <b className="num">{bilan.ajout}</b> unité{bilan.ajout > 1 ? "s" : ""} à charger
                {bilan.retrait > 0
                  ? <> · <b className="num sort">{bilan.retrait}</b> à retirer</>
                  : null}
                {" "}sur <b className="num">{bilan.canaux}</b> canal{bilan.canaux > 1 ? "aux" : ""}
              </>}
        </p>
        <button type="button" className="bouton primaire large" onClick={surClic}
                disabled={bilan.canaux === 0}>
          Valider le chargement
        </button>
      </div>

      <dialog ref={boite} className="modale etroite" aria-labelledby="titre-raison"
              onClose={() => setOuvert(false)}
              onClick={(e) => { if (e.target === boite.current) fermer(); }}>
        <div className="modale-tete">
          <h2 id="titre-raison">Pourquoi cette sortie&nbsp;?</h2>
          <button type="button" className="bouton petit discret fermeture"
                  aria-label="Fermer" onClick={fermer}>✕</button>
        </div>

        <div className="modale-corps">
          <p className="sous" style={{ margin: "0 0 12px" }}>
            Vous retirez <b className="num">{total}</b> unité{pluriel} de la machine,
            sur {retraits.length} {retraits.length > 1 ? "canaux" : "canal"}.
          </p>

          <ul className="retraits">
            {retraits.slice(0, A_VOIR).map((r, i) => (
              <li key={i}>
                <span className="combien num">−{r.combien}</span>
                <span className="quoi">{r.quoi}</span>
                {r.ou ? <span className="ou">canal <b className="mono">{r.ou}</b></span> : null}
              </li>
            ))}
            {caches > 0 ? (
              <li className="reste">et {caches} autre{caches > 1 ? "s" : ""} ligne{caches > 1 ? "s" : ""}</li>
            ) : null}
          </ul>

          {/* Un `fieldset` de vrais boutons radio : ce sont les fleches du
              clavier d'un motif a l'autre, gratuitement et correctement. */}
          <fieldset className="groupe-motifs">
            <legend>Motif</legend>
            {/* La justification se tient contre le choix qu'elle motive, pas en
                tete de boite ou personne ne la relie a rien. */}
            <p className="dit-faible" style={{ margin: "0 2px 9px" }}>
              La cause est le sujet&nbsp;: « {total} cassé{pluriel} sur ce produit »
              se pilote, « {total} unité{pluriel} perdue{pluriel} » non.
            </p>
            <div className="choix-motifs">
              {Object.entries(MOTIFS_SORTIE).map(([cle, m], i) => (
                <label key={cle} className="choix">
                  <input type="radio" name="motif_choix" value={cle}
                         ref={i === 0 ? premier : undefined}
                         checked={motif === cle}
                         onChange={() => {
                           setMotif(cle);
                           // « Autre » ne veut rien dire seul : la note devient
                           // obligatoire, autant y poser le curseur tout de suite.
                           if (cle === "autre") champNote.current?.focus({ preventScroll: true });
                         }} />
                  <span>
                    <span className="titre">{m.nom}</span>
                    <span className="quoi">{m.quoi}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="champ" style={{ marginTop: 15 }}>
            <div className="tete-champ">
              <label htmlFor="note-sortie">
                Note{" "}
                {motif === "autre"
                  ? <b style={{ color: "var(--rouge-vif)" }}>obligatoire</b>
                  : <span className="faible">(facultative)</span>}
              </label>
              {note.length > 0 ? (
                <span className={`compte num ${note.length > 170 ? "plein" : ""}`}>
                  {note.length}/200
                </span>
              ) : null}
            </div>
            <input id="note-sortie" ref={champNote} value={note} maxLength={200}
                   aria-describedby="aide-note"
                   aria-invalid={motif === "autre" && !note.trim() ? true : undefined}
                   onChange={(e) => setNote(e.target.value)}
                   // Entree dans un champ texte envoie le formulaire qui l'entoure.
                   // Ici il l'enverrait par-dessus la boite, sans le controle.
                   onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); valider(); } }}
                   placeholder={motif === "autre" ? "Ce qui s’est passé" : "Numéro de lot, rappel fournisseur…"} />
            <p id="aide-note" className="dit-faible">
              Elle se relit dans le grand livre, à côté de la ligne.
            </p>
          </div>
        </div>

        <div className="modale-pied">
          <div className="rangee-actions">
            <button type="button" className="bouton primaire" onClick={valider}
                    disabled={!!manque || envoi}>
              {envoi ? "Enregistrement…" : "Enregistrer la sortie"}
            </button>
            <button type="button" className="bouton discret" onClick={fermer}
                    disabled={envoi}>Annuler</button>
          </div>
          {manque ? <p className="manque" role="status">{manque}</p> : null}
        </div>
      </dialog>

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
