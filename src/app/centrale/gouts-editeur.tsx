"use client";

import { useState } from "react";
import { ETIQUETTES, GOUTS_MAX, GOUT_MAX, type Gout } from "@/lib/gouts";
import { IcoCorbeille, IcoImage, IcoPlus } from "../icones";

const IMAGES = ".jpg,.jpeg,.png,.webp";

/**
 * L'EDITEUR DES GOUTS D'UN PRODUIT. Une ligne par gout : son nom, et son
 * etiquette — aucune, best-seller ou nouveau — en trois boutons radio, parce
 * qu'un gout n'en porte qu'une. Chaque ligne peut porter une photo
 * (`gout_image_N` ; l'ancienne survit par `gout_image_id_N` tant qu'on n'en
 * envoie pas une autre). Les lignes sont des champs ordinaires
 * (`gout_nom_N`, `gout_etq_N`) : le formulaire part sans JavaScript, avec
 * les trois lignes vides du depart ; avec, « Ajouter un goût » en donne
 * d'autres et la corbeille en retire.
 *
 * Sous les lignes, un bloc pour COLLER UNE LISTE d'un coup — celle du
 * fournisseur, ou celle qu'on avait mise dans la description. « - BEST
 * SELLER » ou « - NOUVEAU » en fin de ligne pose l'etiquette.
 */
type Ligne = { cle: number; nom: string; etiquette: Gout["etiquette"]; image_id: number | null };

export default function GoutsEditeur({ gouts }: { gouts: Gout[] }) {
  const [lignes, poser] = useState<Ligne[]>(() => {
    const l: Ligne[] = gouts.map((g, i) => ({ cle: i, ...g }));
    for (let i = 0; i < 3 && l.length < GOUTS_MAX; i++) l.push({ cle: l.length, nom: "", etiquette: null, image_id: null });
    return l;
  });
  const ajouter = () => poser((l) => l.length >= GOUTS_MAX ? l
    : [...l, { cle: (l.at(-1)?.cle ?? -1) + 1, nom: "", etiquette: null, image_id: null }]);
  const retirer = (cle: number) => poser((l) => l.length > 1 ? l.filter((x) => x.cle !== cle) : l);
  const changer = (cle: number, quoi: Partial<Ligne>) =>
    poser((l) => l.map((x) => x.cle === cle ? { ...x, ...quoi } : x));

  return (
    <div className="ctr-gouts-editeur">
      <div className="lignes">
        {lignes.map((l, i) => (
          <div className="ligne" key={l.cle}>
            {/* La photo : la vignette de celle qu'il a, et le champ pour la remplacer. */}
            <label className="vignette" title={l.image_id ? "Remplacer la photo" : "Ajouter une photo"}>
              {l.image_id
                ? <img src={`/api/image/${l.image_id}`} alt="" />  // eslint-disable-line @next/next/no-img-element
                : <IcoImage size={16} />}
              <input type="file" name={`gout_image_${i}`} accept={IMAGES} aria-label={`Photo du goût ${i + 1}`} />
              <input type="hidden" name={`gout_image_id_${i}`} value={l.image_id ?? ""} />
            </label>
            <input name={`gout_nom_${i}`} value={l.nom} maxLength={GOUT_MAX} aria-label={`Goût ${i + 1}`}
                   placeholder={i === 0 && gouts.length === 0 ? "Black Dragon Ice" : "Nom du goût"}
                   onChange={(e) => changer(l.cle, { nom: e.target.value })} />
            <span className="etiquettes" role="radiogroup" aria-label={`Étiquette du goût ${i + 1}`}>
              <label data-choisi={l.etiquette === null ? "" : undefined}>
                <input type="radio" name={`gout_etq_${i}`} value="" checked={l.etiquette === null}
                       onChange={() => changer(l.cle, { etiquette: null })} />
                <span>—</span>
              </label>
              {ETIQUETTES.map((e) => (
                <label key={e.cle} data-choisi={l.etiquette === e.cle ? "" : undefined} data-etq={e.cle}>
                  <input type="radio" name={`gout_etq_${i}`} value={e.cle} checked={l.etiquette === e.cle}
                         onChange={() => changer(l.cle, { etiquette: e.cle })} />
                  <span>{e.nom}</span>
                </label>
              ))}
            </span>
            <button type="button" className="bouton petit carre avec-script" aria-label="Retirer ce goût"
                    title="Retirer" onClick={() => retirer(l.cle)}>
              <IcoCorbeille size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="bouton petit avec-script" onClick={ajouter} disabled={lignes.length >= GOUTS_MAX}>
        <IcoPlus size={14} /> Ajouter un goût
      </button>

      <details className="ctr-gouts-coller">
        <summary>Coller une liste de goûts</summary>
        <textarea name="gouts_liste" rows={5} maxLength={GOUTS_MAX * (GOUT_MAX + 20)}
                  placeholder={"Un goût par ligne. Ajoutez « - BEST SELLER » ou « - NOUVEAU » à la fin d’une ligne :\nBlack Dragon Ice - BEST SELLER\nCherry Ice\nGolden Dragon Ice - NOUVEAU"} />
        <p className="faible">Ils s’ajoutent à la suite des goûts ci-dessus. Un goût déjà présent n’est pas ajouté deux fois.</p>
      </details>
    </div>
  );
}
