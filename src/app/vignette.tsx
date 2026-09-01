"use client";

import { useRef, useState } from "react";
import { PICTOS } from "@/lib/pictos";

/** Le pictogramme, dessine comme la borne le dessine — meme trace, meme trait. */
export function Picto({ cle, taille = 26 }: { cle: string; taille?: number }) {
  const p = PICTOS.find((x) => x.cle === cle);
  if (!p) return null;
  return (
    <svg width={taille} height={taille} viewBox="0 0 48 48" aria-hidden
         fill="none" stroke="currentColor" strokeWidth={2.6}
         strokeLinecap="round" strokeLinejoin="round">
      {p.traces.map((t, i) =>
        <path key={i} d={t.d} fill={t.plein ? "currentColor" : "none"} />)}
    </svg>
  );
}

/**
 * L'IMAGE D'UNE LIGNE : une photo, ou l'un des pictogrammes de la machine.
 *
 * Les deux ne se valent pas, et c'est voulu. Un pictogramme est DEJA dans
 * l'application, en vectoriel : le choisir ne fait voyager qu'un mot, et le
 * trait reste net a n'importe quelle taille. Une photo, elle, doit etre
 * televersee, stockee, puis rapatriee sur chaque borne. Le pictogramme est donc
 * propose en premier — c'est le choix par defaut d'un catalogue qui n'a pas
 * encore de photos, et il n'a rien d'un pis-aller.
 *
 * La photo l'emporte quand les deux sont poses : on ne l'a pas mise pour rien.
 */
export default function Vignette({
  id, nom, image, icone, forme = "carre",
}: {
  id: number; nom: string; image: number | null; icone: string | null;
  forme?: "carre" | "rond";
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [apercu, poser] = useState<string | null>(null);
  const [choisi, choisir] = useState<string | null>(icone);
  const [ote, oter] = useState(false);
  const [ouvert, ouvrir] = useState(false);

  const photo = apercu ?? (image !== null && !ote ? `/api/image/${image}` : null);

  return (
    <div className={`vignette-item ${forme}`}>
      <button type="button" className="cadre" title={`Image de ${nom}`}
              aria-label={`Changer l’image de ${nom}`} aria-expanded={ouvert}
              onClick={() => ouvrir(!ouvert)}
              onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        {photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photo} alt="" />
          : choisi ? <span className="picto"><Picto cle={choisi} /></span>
                   : <span className="rien">＋</span>}
      </button>

      {ouvert ? (
        <div className="choix-image" role="dialog" aria-label={`Image de ${nom}`}>
          <div className="pictos">
            {PICTOS.map((p) => (
              <button type="button" key={p.cle} title={p.nom}
                      className={`picto-choix${choisi === p.cle && !photo ? " actif" : ""}`}
                      onClick={() => {
                        choisir(p.cle);
                        // Une photo posee cachait le pictogramme : la choisir
                        // maintenant, c'est demander a la retirer.
                        if (apercu) { URL.revokeObjectURL(apercu); poser(null); }
                        if (champ.current) champ.current.value = "";
                        if (image !== null) oter(true);
                        ouvrir(false);
                      }}>
                <Picto cle={p.cle} taille={22} />
              </button>
            ))}
          </div>
          <div className="choix-actions">
            <button type="button" className="bouton petit"
                    onClick={() => { champ.current?.click(); ouvrir(false); }}>
              Une photo…
            </button>
            {photo || choisi ? (
              <button type="button" className="bouton petit discret"
                      onClick={() => {
                        if (apercu) { URL.revokeObjectURL(apercu); poser(null); }
                        if (champ.current) champ.current.value = "";
                        choisir(null); oter(true); ouvrir(false);
                      }}>Rien</button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Ces champs ne partent que s'ils portent une decision : toujours
          presents, ils effaceraient l'image a chaque enregistrement. */}
      {ote && !apercu ? <input type="hidden" name={`imgoter_${id}`} value="1" /> : null}
      <input type="hidden" name={`icone_${id}`} value={choisi ?? ""} />

      <input ref={champ} type="file" name={`img_${id}`} className="fichier-cache"
             accept="image/jpeg,image/png,image/webp"
             onChange={async (e) => {
               const brut = e.target.files?.[0];
               if (apercu) URL.revokeObjectURL(apercu);
               if (!brut) { poser(null); return; }

               // LE FICHIER PART TEL QUEL. Il etait rogne au format du cadre
               // et reencode en JPEG : une photo verticale y perdait le haut et
               // le bas, et un visuel propre y gagnait du grain. On le laisse
               // intact, et c'est l'AFFICHAGE qui s'adapte — le cadre contient
               // l'image entiere au lieu de la remplir.
               poser(URL.createObjectURL(brut));
               oter(false);
             }} />
    </div>
  );
}
