import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse, planDe } from "../chrome";
import { nomDuRole, utilisateur } from "@/lib/auth";
import { nonLus } from "@/lib/salons";
import { IcoCommunaute, IcoEquipe, IcoReglages } from "../icones";

export const dynamic = "force-dynamic";

/** Ce qu'on trouve derriere chaque entree, en quelques mots : on choisit sans ouvrir. */
const QUOI: Record<string, string> = {
  tableau: "Le parc et les ventes d’un coup d’œil",
  analytiques: "Graphes et classements",
  ventes: "Chaque vente, et les litiges à traiter",
  bornes: "Vos machines et leur état",
  messages: "L’équipe, vos RedBox, le SAV",
  communaute: "Redboxers, badges et classement",
  stock: "Ce qui reste au dépôt",
  reception: "Enregistrer une livraison",
  charger: "Remplir une machine",
  categories: "Ranger le catalogue",
  catalogue: "Vos produits",
  pub: "Ce qui défile sur l’écran des machines",
  sav: "Le numéro d’assistance des machines",
  equipe: "Qui a accès, et à quoi",
  notifications: "Ce qui sonne sur cet appareil",
};

/**
 * LE MENU : LE PLAN DE LA CONSOLE, SUR UN TELEPHONE.
 *
 * Le rail montre tout sur un ordinateur ; sur un telephone il n'existe pas, et
 * la barre du bas ne tient que cinq onglets. Cette page est le rail en grand :
 * les memes sections, les memes droits, une rangee par destination, assez haute
 * pour le pouce. Une page plutot qu'un tiroir qui glisse : elle marche sans
 * JavaScript, et le retour du telephone la referme.
 */
export default async function Menu() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const sections = planDe(u);
  const nonLusN = await nonLus(u).catch(() => 0);

  return (
    <>
      <Entete page="menu" />
      <main className="ecran">
        <h1>Menu</h1>

        {sections.map((s) => (
          <section key={s.titre}>
            <h2>{s.titre}</h2>
            <div className="rubriques">
              {s.items.map((i) => (
                <Link key={i.cle} href={i.vers} className="rubrique">
                  <span className="rond" aria-hidden="true">{i.icone}</span>
                  <span className="dit">
                    <span className="nom">{i.nom}</span>
                    {QUOI[i.cle] ? <span className="quoi">{QUOI[i.cle]}</span> : null}
                  </span>
                  <span className="etat num">
                    {i.cle === "messages" && nonLusN > 0
                      ? <span className="compte-menu">{nonLusN > 99 ? "99+" : nonLusN}</span> : null}
                  </span>
                  <span className="fleche" aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <h2>Vous</h2>
        <div className="rubriques">
          <Link href={`/communaute/${u.id}`} className="rubrique">
            <span className="rond" aria-hidden="true"><IcoCommunaute /></span>
            <span className="dit">
              <span className="nom">Mon profil</span>
              <span className="quoi">Niveau, badges, ce que voient les autres redboxers</span>
            </span>
            <span className="etat" />
            <span className="fleche" aria-hidden="true">›</span>
          </Link>
          <Link href="/profil" className="rubrique">
            <span className="rond" aria-hidden="true"><IcoEquipe /></span>
            <span className="dit">
              <span className="nom">Mon compte</span>
              <span className="quoi">{u.email} · {nomDuRole(u.role)}</span>
            </span>
            <span className="etat" />
            <span className="fleche" aria-hidden="true">›</span>
          </Link>
          <Link href="/reglages" className="rubrique">
            <span className="rond" aria-hidden="true"><IcoReglages /></span>
            <span className="dit">
              <span className="nom">Réglages</span>
              <span className="quoi">Tout le paramétrage de {u.compte}</span>
            </span>
            <span className="etat" />
            <span className="fleche" aria-hidden="true">›</span>
          </Link>
        </div>

        {/* Plusieurs comptes : le moyen d'en changer, qui vit dans le pied du
            rail sur un ordinateur, et nulle part ailleurs sur un telephone. */}
        {u.comptes.length > 1 ? (
          <form method="post" action="/api/compte/basculer" className="carte plate rangee"
                style={{ gap: 8, marginTop: 14 }}>
            <select name="compte_id" defaultValue={u.compte_id} aria-label="Compte" style={{ flex: 1 }}>
              {u.comptes.map((a) => (
                <option key={a.compte_id} value={a.compte_id}>{a.compte}</option>
              ))}
            </select>
            <button className="bouton petit">Changer de compte</button>
          </form>
        ) : null}
      </main>
      <NavBasse page="menu" />
    </>
  );
}
