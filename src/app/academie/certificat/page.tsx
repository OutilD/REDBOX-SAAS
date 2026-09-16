import Image from "next/image";
import Link from "next/link";
import { Entete, NavBasse } from "../../chrome";
import { modules, sommaire } from "@/lib/academie";
import { nomAffiche } from "@/lib/personnes";
import { IcoAcademie, IcoCadenas, IcoCoche, IcoLecture, IcoTrophee } from "../../icones";
import { lecteurDePage } from "../lecteur";
import { Piste, duree, pluriel } from "../vues";
import { bilanDe } from "../salle";
import { Imprimer } from "../salle-client";

export const dynamic = "force-dynamic";

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/**
 * LE CERTIFICAT DE FIN DE FORMATION.
 *
 * Il se gagne en terminant TOUT ce qui est ouvert a la personne : le parcours
 * « Découverte » pour un futur redboxer, le parcours « Redboxer » pour qui a
 * une machine. Date : la derniere lecon terminee. Le numero se recalcule a
 * l'identique a chaque visite — rien a stocker, rien a falsifier cote client.
 *
 * Pas encore gagne : ce qui reste, module par module, et le bouton pour
 * reprendre. S'imprime sur une page A4 paysage, sans la console autour.
 */
export default async function Certificat() {
  const { u, l } = await lecteurDePage();
  const [mods, lecons] = await Promise.all([modules(l), sommaire(l)]);
  const bilan = bilanDe(lecons);
  const ouvertes = lecons.filter((x) => x.ouverte);
  const finLe = ouvertes.reduce<Date | null>((d, x) => (x.fini_le && (!d || x.fini_le > d) ? x.fini_le : d), null);
  const parcours = l.redboxer ? "Parcours Redboxer" : "Parcours Découverte";
  const minutes = ouvertes.reduce((t, x) => t + (x.duree ?? 0), 0);
  const numero = finLe
    ? `RBX-ACA-${String(u.id).padStart(4, "0")}-${finLe.toISOString().slice(0, 10).replaceAll("-", "")}-${ouvertes.length}`
    : "";
  const prochaine = ouvertes.find((x) => !x.fini) ?? null;

  return (
    <>
      <Entete page="academie" />
      <main className="ecran aca aca-focus">
        <Link href="/academie" className="aca-retour">‹ Académie</Link>

        {bilan.toutFini && finLe ? (
          <>
            <div className="aca-certif-actions sans-impression">
              <div>
                <div className="aca-marque"><IcoTrophee size={16} /> Formation terminée</div>
                <h1 style={{ marginTop: 6 }}>Votre certificat</h1>
                <p className="sous">Imprimez-le ou enregistrez-le en PDF pour le montrer à un gérant.</p>
              </div>
              <Imprimer />
            </div>

            <section className="aca-certificat" aria-label="Certificat de réussite">
              <div className="coin haut" aria-hidden="true" />
              <div className="coin bas" aria-hidden="true" />
              <header>
                <Image src="/logo-redbox.png" alt="RedBox" width={155} height={100} className="logo" />
                <div className="aca-marque"><IcoAcademie size={16} /> RedBox Academy</div>
              </header>
              <p className="surtitre">Certificat de réussite</p>
              <p className="decerne">décerné à</p>
              <p className="nom">{nomAffiche(u)}</p>
              <p className="pour">
                pour avoir suivi et terminé le <b>{parcours}</b> de la RedBox Academy :{" "}
                {pluriel(mods.filter((m) => ouvertes.some((x) => x.module_id === m.id)).length, "module", "modules")},{" "}
                {pluriel(ouvertes.length, "leçon", "leçons")}{minutes ? `, ${duree(minutes)} de formation` : ""}.
              </p>
              <ul className="modules">
                {mods.filter((m) => ouvertes.some((x) => x.module_id === m.id)).map((m) => (
                  <li key={m.id}><IcoCoche size={14} /> {m.titre}</li>
                ))}
              </ul>
              <footer>
                <div>
                  <span className="libelle">Délivré le</span>
                  <b>{JOUR.format(finLe)}</b>
                </div>
                <div className="sceau" aria-hidden="true"><IcoTrophee size={30} /></div>
                <div>
                  <span className="libelle">N° de certificat</span>
                  <b className="mono">{numero}</b>
                </div>
              </footer>
            </section>
          </>
        ) : (
          <section className="aca-certif-attente">
            <span className="aca-picto grand" aria-hidden="true"><IcoTrophee size={30} /></span>
            <div className="dit">
              <div className="aca-marque">Certificat de fin · {parcours}</div>
              <h1>Encore un peu de chemin</h1>
              <p className="sous">
                Le certificat se débloque quand toutes les leçons qui vous sont ouvertes sont terminées.
                {bilan.ouvertes > 0 ? ` Il vous en reste ${bilan.ouvertes - bilan.finies}${bilan.reste ? `, environ ${duree(bilan.reste)}` : ""}.` : ""}
              </p>
              {bilan.ouvertes > 0 ? (
                <div className="aca-avance">
                  <Piste n={bilan.finies} sur={bilan.ouvertes} label="Progression vers le certificat" />
                  <span className="num">{bilan.finies} / {bilan.ouvertes}</span>
                </div>
              ) : null}
              {prochaine ? (
                <Link href={`/academie/lecon/${prochaine.id}`} className="bouton primaire">
                  <IcoLecture size={18} /> {bilan.finies > 0 ? "Reprendre" : "Commencer"} : {prochaine.titre}
                </Link>
              ) : null}
              <ol className="aca-restes">
                {mods.map((m) => {
                  const siennes = ouvertes.filter((x) => x.module_id === m.id);
                  const fermees = lecons.filter((x) => x.module_id === m.id && !x.ouverte).length;
                  if (siennes.length === 0 && fermees === 0) return null;
                  const finies = siennes.filter((x) => x.fini).length;
                  const fait = siennes.length > 0 && finies === siennes.length;
                  return (
                    <li key={m.id} data-fait={fait ? "" : undefined}>
                      <span className="puce" aria-hidden="true">{fait ? <IcoCoche size={13} /> : siennes.length === 0 ? <IcoCadenas size={12} /> : null}</span>
                      <Link href={`/academie/module/${m.id}`} className="nom">{m.titre}</Link>
                      <span className="num faible">
                        {siennes.length > 0 ? `${finies}/${siennes.length}` : "réservé aux redboxers"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        )}
      </main>
      <NavBasse page="academie" />
    </>
  );
}
