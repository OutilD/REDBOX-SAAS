import Link from "next/link";
import { Entete, NavBasse } from "../chrome";
import { modules, ouverte, reprise, salonProspects, sommaire, type Module } from "@/lib/academie";
import { IcoAcademie, IcoCadenas, IcoChevron, IcoCoche, IcoDocument, IcoHorloge, IcoLecture, IcoTrophee } from "../icones";
import { lecteurDePage } from "./lecteur";
import { bilanDe } from "./salle";
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
  const [mods, suite, lecons] = await Promise.all([modules(l), reprise(l), sommaire(l)]);
  const bilan = bilanDe(lecons);
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
      <main className="ecran aca aca-focus">
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
                ? "La machine, ses certificats, le pitch, les chiffres et les astuces du terrain. À votre rythme, leçon par leçon."
                : "La machine, sa fiche technique, ses certificats et la façon d’en parler à un bar. Les redboxers ont en plus les astuces de vente et de réassort."}
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
                <div className="faible">leçons terminées{bilan.reste > 0 ? ` · ${duree(bilan.reste)} restantes` : ""}</div>
              </div>
              {toutFini ? (
                <Link href="/academie/certificat" className="aca-tag grand" data-ton="fini"><IcoTrophee size={14} /> Tout est terminé : voir mon certificat</Link>
              ) : null}
            </div>
          ) : null}
        </section>

        <OngletsAcademie actif="parcours" equipe={equipe} apercu={l.apercu} retour="/academie" />

        {!l.redboxer && fermees > 0 ? (
          <PorteFermee compacte salon={salon}
                       quoi={`${pluriel(fermees, "leçon réservée", "leçons réservées")} aux redboxers`} />
        ) : null}

        {suite ? (() => {
          const m = mods.find((x) => x.id === suite.module_id);
          const rang = mods.findIndex((x) => x.id === suite.module_id) + 1;
          const siennes = lecons.filter((x) => x.module_id === suite.module_id && x.ouverte);
          const j = lecons.filter((x) => x.module_id === suite.module_id).findIndex((x) => x.id === suite.lecon_id);
          const lecon = lecons.find((x) => x.id === suite.lecon_id);
          return (
            <Link href={`/academie/lecon/${suite.lecon_id}`} className="aca-continuer">
              <span className="aca-picto grand" aria-hidden="true">{m ? <IconeModule icone={m.icone} size={28} /> : <IcoLecture size={28} />}</span>
              <span className="dit">
                <span className="aca-surtitre num">
                  <span>{finies > 0 ? "Reprendre là où vous en étiez" : "Par où commencer"}</span>
                  <span>Module {rang}{j >= 0 ? ` · Leçon ${j + 1}` : ""}</span>
                  {lecon?.duree ? <span className="avec-icone"><IcoHorloge size={13} /> {duree(lecon.duree)}</span> : null}
                </span>
                <span className="titre">{suite.titre}</span>
                <span className="module">{suite.module_titre}</span>
                {siennes.length > 0 ? (
                  <span className="aca-avance">
                    <Piste n={siennes.filter((x) => x.fini).length} sur={siennes.length} label={`Progression : ${suite.module_titre}`} />
                    <span className="num">{siennes.filter((x) => x.fini).length}/{siennes.length}</span>
                  </span>
                ) : null}
              </span>
              <span className="bouton primaire">
                <IcoLecture size={18} /> {finies > 0 ? "Continuer" : "Commencer"}
              </span>
            </Link>
          );
        })() : null}

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
              <Link href="/academie/ressources" className="lien"><IcoDocument size={15} /> Ressources</Link>
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

            {ouvertes > 0 ? (
              <Link href="/academie/certificat" className="aca-certif-carte" data-pret={toutFini ? "" : undefined}>
                <span className="sceau" aria-hidden="true"><IcoTrophee size={26} /></span>
                <span className="dit">
                  <span className="titre">{toutFini ? "Votre certificat est prêt" : "Certificat de fin de formation"}</span>
                  <span className="quoi">
                    {toutFini
                      ? "Imprimez-le ou enregistrez-le en PDF : il atteste que vous avez suivi tout le parcours."
                      : `Terminez les ${ouvertes} leçons ouvertes pour le débloquer. Encore ${ouvertes - finies}${bilan.reste ? `, environ ${duree(bilan.reste)}` : ""}.`}
                  </span>
                </span>
                <span className="aller">{toutFini ? "Voir" : `${pct} %`} <IcoChevron size={15} /></span>
              </Link>
            ) : null}
          </>
        )}
      </main>
      <NavBasse page="academie" />
    </>
  );
}
