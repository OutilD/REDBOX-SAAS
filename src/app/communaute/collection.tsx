import Link from "next/link";
import { NOM_RANG, RANGS } from "@/lib/communaute";
import { Badge } from "./badge";
import Revelation from "./revelation";
import type { VueBadge } from "./vues-badges";

const FILTRES = [
  { valeur: "tous", nom: "Tous" },
  { valeur: "debloques", nom: "Débloqués" },
  { valeur: "verrouilles", nom: "Verrouillés" },
] as const;

/**
 * LA COLLECTION : TOUS LES BADGES D'UN COUP D'OEIL.
 *
 * Une tuile par badge. Gagne, elle porte son metal, sa coche d'or et les pips
 * de son palier — un a cinq losanges ; le mythique y ajoute une bordure irisee
 * qui tourne. Pas encore, elle est un creux de plomb avec un cadenas. En tete,
 * le compte, et la legende des cinq paliers avec ce qu'on en a.
 *
 * TOUCHER UNE TUILE LA REVELE (`Revelation`) : la scene s'ouvre par-dessus la
 * page. Sans JavaScript, c'est un lien vers la fiche, comme avant. Au survol,
 * la bulle donne la devise et les chiffres ; la tuile s'incline sous la souris.
 *
 * LES FILTRES SONT DES BOUTONS RADIO, et `:has()` masque les tuiles : ca filtre
 * sans recharger la page.
 */
export default function Collection({ vues }: { vues: VueBadge[] }) {
  const total = vues.length;
  const n = vues.filter((v) => v.obtenu).length;
  const part = total ? Math.round((n / total) * 100) : 0;
  const comptes = { tous: total, debloques: n, verrouilles: total - n };
  const paliers = RANGS.map((r) => ({
    rang: r, nom: NOM_RANG[r],
    a: vues.filter((v) => v.rang === r && v.obtenu).length,
    sur: vues.filter((v) => v.rang === r).length,
  }));

  return (
    <section className="carte collection" aria-labelledby="titre-collection">
      <div className="collection-tete">
        <h2 id="titre-collection">Collection de badges</h2>
        <div className="collection-compte">
          <span className="num"><b>{n}</b> / {total}</span>
          <span className="mot">débloqués</span>
          <span className="piste-collection" aria-hidden><span style={{ width: `${part}%` }} /></span>
        </div>
        <div className="periodes petites filtres-collection" role="group" aria-label="Afficher les badges">
          {FILTRES.map((f) => (
            <label key={f.valeur}>
              <input type="radio" name="filtre-badges" value={f.valeur} defaultChecked={f.valeur === "tous"} />
              {f.nom}<span className="compte num">{comptes[f.valeur]}</span>
            </label>
          ))}
        </div>
        <ul className="collection-raretes" aria-label="Les cinq paliers">
          {paliers.map((p) => (
            <li key={p.rang} className={`rarete-puce ${p.rang}`}>
              <i aria-hidden />{p.nom}<span className="num">{p.a}/{p.sur}</span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="tuiles">
        {vues.map((v) => {
          const bulle = `bulle-${v.cle}`;
          return (
            <li key={v.cle} className={`tuile ${v.rang}`} data-etat={v.obtenu ? "debloque" : "verrouille"}>
              <Link href={`/communaute/badges/${v.cle}`} data-badge={v.cle}
                    className="tuile-lien" aria-describedby={bulle}>
                <span className="tuile-cadre">
                  <span className="tuile-foil" aria-hidden />
                  <Badge forme={v.forme} obtenu={v.obtenu} taille={58} rang={v.rang} />
                  <span className="tuile-pips" aria-hidden>
                    {Array.from({ length: v.palier }, (_, i) => <i key={i} />)}
                  </span>
                  {v.progres && v.progres.pct > 0 ? (
                    <span className="tuile-avance" aria-hidden><span style={{ width: `${v.progres.pct}%` }} /></span>
                  ) : null}
                  <span className="tuile-sceau" aria-hidden>{v.obtenu ? <Coche /> : <Cadenas />}</span>
                </span>
                <span className="tuile-nom">
                  {v.nom}<span className="masque"> — {v.nomRang}, {v.obtenu ? "débloqué" : "verrouillé"}</span>
                </span>
              </Link>
              <span role="tooltip" id={bulle} className="bulle-badge">
                <span className="bulle-tete">
                  <b>{v.nom}</b>
                  <span className={`etiquette rang ${v.rang}`}>{v.nomRang}</span>
                </span>
                <span className="bulle-devise">« {v.devise} »</span>
                <span className="bulle-quoi">{v.quoi}</span>
                <span className="bulle-pied num">
                  {v.points > 0 ? <span className="gain">+{v.points} pts</span> : null}
                  <span>
                    {v.obtenuLe ? `obtenu le ${v.obtenuLe}`
                      : v.progres && v.progres.pct > 0 ? `${v.progres.n} / ${v.progres.sur}` : "pas encore obtenu"}
                  </span>
                  <span>{v.rarete}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="collection-vide vide-debloques">Aucun badge débloqué pour l’instant.</p>
      <p className="collection-vide vide-verrouilles">Tout est débloqué. Chapeau.</p>

      <Revelation badges={vues} />
    </section>
  );
}

function Coche() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor"
         strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m2.6 6.3 2.2 2.2 4.6-5" />
    </svg>
  );
}

function Cadenas() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor"
         strokeWidth={1.5} strokeLinecap="round">
      <rect x="2.5" y="5.5" width="7" height="5" rx="1" fill="currentColor" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
    </svg>
  );
}
