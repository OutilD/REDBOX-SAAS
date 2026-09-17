import Link from "next/link";
import { cookies } from "next/headers";
import type { LeconSommaire, Module } from "@/lib/academie";
import { IcoAcademie, IcoCadenas, IcoCoche, IcoDocument, IcoPrecedent, IcoTrophee } from "../icones";
import { Piste, duree, etatLecon } from "./vues";

/** Le sommaire replie sur grand ecran : `salle-client.tsx` ecrit ce biscuit. */
export async function sommaireFerme(): Promise<boolean> {
  return (await cookies()).get("rbx_aca_sommaire")?.value === "ferme";
}

export type Bilan = {
  ouvertes: number; finies: number; pct: number;
  /** Les minutes des lecons ouvertes qu'il reste a terminer. */
  reste: number;
  toutFini: boolean;
};

export function bilanDe(lecons: LeconSommaire[]): Bilan {
  const ouvertes = lecons.filter((x) => x.ouverte);
  const finies = ouvertes.filter((x) => x.fini).length;
  return {
    ouvertes: ouvertes.length, finies,
    pct: ouvertes.length > 0 ? Math.round((finies * 100) / ouvertes.length) : 0,
    reste: ouvertes.filter((x) => !x.fini).reduce((t, x) => t + (x.duree ?? 0), 0),
    toutFini: ouvertes.length > 0 && finies === ouvertes.length,
  };
}

/**
 * LE SOMMAIRE DE LA SALLE DE COURS : toute la formation, module par module,
 * chaque lecon avec son etat. Le module de la lecon ouverte est deplie, les
 * autres se deplient d'un geste — on voit ou l'on est dans l'ensemble, pas
 * seulement dans son chapitre.
 *
 * Sur grand ecran, une colonne collee a gauche ; au telephone, un tiroir que
 * la case `#aca-tiroir` ouvre et ferme sans JavaScript.
 */
export function Sommaire({ mods, lecons, ici, bilan }: {
  mods: Module[]; lecons: LeconSommaire[]; ici?: number; bilan: Bilan;
}) {
  const moduleIci = lecons.find((x) => x.id === ici)?.module_id;
  return (
    <aside className="aca-sommaire" id="aca-sommaire" aria-label="Sommaire de la formation">
      <div className="tete">
        <div className="rangee-tete">
          <Link href="/academie" className="aca-marque"><IcoAcademie size={16} /> RedBox Academy</Link>
          <label htmlFor="aca-tiroir" className="bouton icone fermer-tiroir" aria-label="Fermer le sommaire">
            <IcoPrecedent size={16} />
          </label>
        </div>
        {bilan.ouvertes > 0 ? (
          <div className="global">
            <div className="chiffres">
              <b className="num">{bilan.pct} %</b>
              <span className="num">{bilan.finies}/{bilan.ouvertes} leçons{bilan.reste > 0 ? ` · ${duree(bilan.reste)} restantes` : ""}</span>
            </div>
            <Piste n={bilan.finies} sur={bilan.ouvertes} label="Progression dans la formation" />
          </div>
        ) : null}
      </div>

      <nav className="modules">
        {mods.map((m, i) => {
          const siennes = lecons.filter((x) => x.module_id === m.id);
          const ouvertes = siennes.filter((x) => x.ouverte);
          const finies = ouvertes.filter((x) => x.fini).length;
          const fini = ouvertes.length > 0 && finies === ouvertes.length;
          const ferme = ouvertes.length === 0 && siennes.length > 0;
          return (
            <details key={m.id} className="aca-chapitre" open={m.id === moduleIci || (moduleIci === undefined && i === 0)}
                     data-fini={fini ? "" : undefined} data-ferme={ferme ? "" : undefined}>
              <summary>
                <span className="rang num" aria-hidden="true">
                  {fini ? <IcoCoche size={13} /> : ferme ? <IcoCadenas size={12} /> : i + 1}
                </span>
                <span className="dit">
                  <span className="nom">{m.titre}</span>
                  <span className="meta num">
                    {ouvertes.length > 0 ? `${finies}/${ouvertes.length}` : `${siennes.length} leçon${siennes.length > 1 ? "s" : ""}`}
                    {m.minutes ? ` · ${duree(m.minutes)}` : ""}
                  </span>
                </span>
              </summary>
              {siennes.length === 0 ? (
                <p className="bientot">Leçons à venir.</p>
              ) : (
                <ol className="aca-mini">
                  {siennes.map((x, j) => {
                    const etat = etatLecon(x, ici);
                    return (
                      <li key={x.id} data-etat={etat}>
                        <Link href={`/academie/lecon/${x.id}`} aria-current={x.id === ici ? "page" : undefined}>
                          <span className="puce num" aria-hidden="true">
                            {etat === "fini" ? <IcoCoche size={12} /> : etat === "ferme" ? <IcoCadenas size={11} /> : j + 1}
                          </span>
                          <span className="nom">
                            {x.titre}
                            {etat === "fini" ? <span className="lecteur-seul"> (terminée)</span> : null}
                            {etat === "ferme" ? <span className="lecteur-seul"> (réservée aux redboxers)</span> : null}
                          </span>
                          <span className="duree num">{duree(x.duree)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </details>
          );
        })}
      </nav>

      <div className="pied">
        <Link href="/academie/ressources" className="lien-pied"><IcoDocument size={16} /> Ressources</Link>
        <Link href="/academie/certificat" className="lien-pied" data-pret={bilan.toutFini ? "" : undefined}>
          <IcoTrophee size={16} /> {bilan.toutFini ? "Mon certificat" : "Certificat de fin"}
        </Link>
      </div>
    </aside>
  );
}
