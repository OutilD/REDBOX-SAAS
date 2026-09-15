import Link from "next/link";
import { Entete, NavBasse } from "../chrome";
import { modules, ouverte, reprise, salonProspects, type Module } from "@/lib/academie";
import { IcoAcademie, IcoCadenas, IcoCoche, IcoDocument, IcoLecture } from "../icones";
import { lecteurDePage } from "./lecteur";
import { Anneau, IconeModule, OngletsAcademie, Piste, PorteFermee, duree, pluriel } from "./vues";

export const dynamic = "force-dynamic";

/**
 * LA REDBOX ACADEMY.
 *
 * Une page de formation, pas un tableau de bord : on vient y apprendre, on
 * doit savoir en un regard ou l'on en est et par ou continuer. En haut, le
 * bilan et le bouton « Reprendre » ; dessous, les modules dans l'ordre ou il
 * faut les suivre, chacun avec sa progression.
 *
 * Le futur redboxer voit TOUT le programme, cadenas compris. Cacher ce qui lui
 * est ferme, ce serait lui cacher la moitie de la raison de s'equiper.
 */
export default async function Academie() {
  const { l, equipe } = await lecteurDePage();
  const [mods, suite] = await Promise.all([modules(l), reprise(l)]);
  const somme = (f: (m: Module) => number) => mods.reduce((s, m) => s + f(m), 0);
  const ouvertes = somme((m) => m.ouvertes);
  const finies = somme((m) => m.finies_ouvertes);
  const fermees = somme((m) => m.lecons) - ouvertes;
  const minutes = somme((m) => m.minutes);
  const pct = ouvertes > 0 ? Math.round((finies * 100) / ouvertes) : 0;
  const toutFini = ouvertes > 0 && finies === ouvertes;
  const salon = !l.redboxer && fermees > 0 ? await salonProspects() : null;

  return (
    <>
      <Entete page="academie" />
      <main className="ecran aca">
        <section className="aca-tete">
          <div className="dit">
            <div className="aca-marque"><IcoAcademie size={18} /> RedBox Academy</div>
            <h1>
              {l.redboxer
                ? "Tout pour installer, vendre et faire tourner vos RedBox"
                : "Tout savoir sur la RedBox avant de vous lancer"}
            </h1>
            <p className="sous">
              {l.redboxer
                ? "La machine, ses certificats, le contrat type, le pitch et les astuces du terrain. À votre rythme, leçon par leçon."
                : "La machine, sa fiche technique, ses certificats et la façon d’en parler à un bar. Les redboxers ont en plus le contrat type et les astuces de vente."}
            </p>
            {mods.length > 0 ? (
              <div className="aca-chiffres num">
                <span><b>{mods.length}</b> module{mods.length > 1 ? "s" : ""}</span>
                <span><b>{ouvertes}</b> leçon{ouvertes > 1 ? "s" : ""} ouverte{ouvertes > 1 ? "s" : ""}</span>
                {minutes > 0 ? <span><b>{duree(minutes)}</b> de contenu</span> : null}
              </div>
            ) : null}
          </div>

          {ouvertes > 0 ? (
            <div className="aca-bilan">
              <Anneau pct={pct} />
              <div className="dit">
                <div className="grand num">{finies} / {ouvertes}</div>
                <div className="faible">leçons terminées</div>
              </div>
              {suite ? (
                <Link href={`/academie/lecon/${suite.lecon_id}`} className="bouton primaire large aca-reprendre">
                  <IcoLecture size={18} />
                  <span className="dit">
                    <span>{finies > 0 ? "Reprendre" : "Commencer la formation"}</span>
                    <span className="ou">{suite.titre}</span>
                  </span>
                </Link>
              ) : toutFini ? (
                <div className="aca-tag grand" data-ton="fini"><IcoCoche size={14} /> Tout ce qui est ouvert est terminé</div>
              ) : null}
            </div>
          ) : null}
        </section>

        <OngletsAcademie actif="parcours" equipe={equipe} apercu={l.apercu} retour="/academie" />

        {!l.redboxer && fermees > 0 ? (
          <PorteFermee compacte salon={salon}
                       quoi={`${pluriel(fermees, "leçon réservée", "leçons réservées")} aux redboxers`} />
        ) : null}

        {mods.length === 0 ? (
          <div className="vide">
            <span className="grand" aria-hidden="true"><IcoAcademie size={40} /></span>
            L’académie ouvre bientôt.
            {equipe ? (
              <div style={{ marginTop: 14 }}>
                <Link href="/academie/editer" className="bouton primaire petit">Préparer l’académie</Link>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="titre-section">
              <h2>Les modules</h2>
              <span className="faible" style={{ fontSize: 12.5 }}>dans l’ordre conseillé</span>
              <Link href="/academie/ressources" className="lien"><IcoDocument size={15} /> Tous les documents</Link>
            </div>
            <div className="aca-modules">
              {mods.map((m, i) => {
                const ferme = !ouverte(l, m.acces);
                const fini = !ferme && m.ouvertes > 0 && m.finies_ouvertes === m.ouvertes;
                return (
                  <Link key={m.id} href={`/academie/module/${m.id}`} className="aca-module"
                        style={{ "--i": i } as React.CSSProperties}
                        data-ferme={ferme ? "" : undefined} data-fini={fini ? "" : undefined}>
                    <span className="haut">
                      <span className="aca-picto"><IconeModule icone={m.icone} /></span>
                      <span className="numero num">Module {String(i + 1).padStart(2, "0")}</span>
                    </span>
                    <span className="titre">{m.titre}</span>
                    {m.resume ? <span className="resume">{m.resume}</span> : null}
                    <span className="meta">
                      <span className="num">{pluriel(m.lecons, "leçon", "leçons")}{m.minutes ? ` · ${duree(m.minutes)}` : ""}</span>
                      {!m.publie ? <span className="aca-tag" data-ton="brouillon">Brouillon</span> : null}
                      {l.redboxer && m.acces === "redboxers" ? <span className="aca-tag" data-ton="redboxers">Redboxers</span> : null}
                      {!ferme && !l.redboxer && m.reservees > 0 ? (
                        <span className="aca-tag" data-ton="ferme"><IcoCadenas size={12} /> {m.reservees} réservée{m.reservees > 1 ? "s" : ""}</span>
                      ) : null}
                    </span>
                    <span className="pied">
                      {ferme ? (
                        <span className="aca-tag" data-ton="ferme"><IcoCadenas size={12} /> Réservé aux redboxers</span>
                      ) : m.ouvertes > 0 ? (
                        <>
                          <Piste n={m.finies_ouvertes} sur={m.ouvertes} label={`Progression : ${m.titre}`} />
                          <span className="compte num">
                            {fini ? <><IcoCoche size={13} /> Terminé</> : `${m.finies_ouvertes}/${m.ouvertes}`}
                          </span>
                        </>
                      ) : (
                        <span className="faible">Bientôt</span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>
      <NavBasse page="academie" />
    </>
  );
}
