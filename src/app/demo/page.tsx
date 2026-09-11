import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { peutGererEquipe, utilisateur } from "@/lib/auth";
import { etatDemo } from "@/lib/demo";
import { IcoAlerte } from "../icones";

export const dynamic = "force-dynamic";

const ERREURS: Record<string, string> = {
  role:  "Seul le propriétaire du compte peut changer le mode démo.",
  plein: "Ce compte contient déjà des données : la démo ne se relance que sur un compte vide.",
};

/**
 * LA PAGE DU MODE DEMO.
 *
 * Elle dit trois choses : ce que le compte contient d'invente, ce qu'il
 * advient quand on quitte — tout s'efface —, et comment le faire. Le geste
 * demande deux appuis : le premier ouvre l'avis rouge, le second envoie. Pas
 * de boite de dialogue, la console doit marcher sans JavaScript ; et pas de
 * bouton unique non plus, on n'efface pas trois semaines d'essais sur un
 * pouce qui glisse.
 *
 * On y vient par le bandeau, par les reglages, ou par les redirections des
 * routes ; c'est aussi la qu'on remet la demo a neuf, ou qu'on la relance sur
 * un compte reste vide.
 */
export default async function Demo({ searchParams }:
  { searchParams: Promise<{ quitter?: string; renouveler?: string; e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { quitter, renouveler, e } = await searchParams;
  const etat = await etatDemo(u.compte_id);
  const patron = peutGererEquipe(u);

  return (
    <>
      <Entete page="demo" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/reglages" className="bouton petit" aria-label="Retour aux réglages">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>Mode démo</h1></div>
        </div>

        {e ? <p className="erreur" style={{ marginTop: 14 }}>{ERREURS[e] ?? "Impossible."}</p> : null}

        {etat.demo ? (
          <>
            <p className="sous" style={{ marginTop: 14, maxWidth: 720 }}>
              Votre compte a été ouvert avec un parc <b>inventé</b>, pour que vous puissiez
              essayer la console avant d’avoir une seule machine branchée. Rien de ce qui est
              affiché n’existe.
            </p>

            <div className="bandeau quatre" style={{ marginBottom: 18 }}>
              <div><div className="faible" style={{ fontSize: 12 }}>RedBox fictives</div>
                   <div className="num" style={{ fontSize: 24, fontWeight: 750 }}>{etat.bornes}</div></div>
              <div><div className="faible" style={{ fontSize: 12 }}>Produits</div>
                   <div className="num" style={{ fontSize: 24, fontWeight: 750 }}>{etat.produits}</div></div>
              <div><div className="faible" style={{ fontSize: 12 }}>Ventes</div>
                   <div className="num" style={{ fontSize: 24, fontWeight: 750 }}>{etat.ventes}</div></div>
              <div><div className="faible" style={{ fontSize: 12 }}>Mouvements de stock</div>
                   <div className="num" style={{ fontSize: 24, fontWeight: 750 }}>{etat.mouvements}</div></div>
            </div>

            <div className="carte">
              <h2 style={{ marginTop: 0 }}>Comment ça marche</h2>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 14.5 }}>
                <li>Les trois RedBox fictives <b>vivent</b> : elles vendent quelques articles entre
                    deux de vos visites, confirment les chargements que vous saisissez, répondent
                    aux corrections de compteur et restent en ligne.</li>
                <li>Vous pouvez tout faire comme pour de vrai : recevoir de la marchandise,
                    réassortir une RedBox, traiter un litige, poser un prix, composer l’écran d’accueil,
                    inviter quelqu’un.</li>
                <li>Une <b>vraie</b> machine ne peut pas être appairée tant que le mode démo est
                    actif : ses ventes se mêleraient aux ventes inventées.</li>
                <li>Le bandeau ambre reste sur chaque page jusqu’à ce que vous désactiviez le mode.</li>
              </ul>
            </div>

            <h2>Désactiver le mode démo</h2>
            <div className="carte">
              <p style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 1.6 }}>
                Le compte est <b>entièrement vidé</b> : RedBox, catalogue, catégories, stock,
                ventes, écran d’accueil — y compris ce que vous avez ajouté pendant l’essai.
                Restent votre compte, les personnes que vous y avez fait entrer, et une réserve vide.
                Vous pourrez alors appairer votre première RedBox.
              </p>
              {!patron ? (
                <p className="faible" style={{ margin: 0, fontSize: 13.5 }}>
                  Seul le propriétaire du compte peut désactiver la démo.
                </p>
              ) : quitter ? (
                <div className="avis" style={{ borderLeftColor: "var(--rouge)", margin: 0 }}>
                  <IcoAlerte size={17} />
                  <div className="dit">
                    <div className="titre">Effacer les données de démonstration et repartir à zéro ?</div>
                    <div className="texte">
                      {etat.bornes} RedBox, {etat.produits} produit{etat.produits > 1 ? "s" : ""},
                      {" "}{etat.ventes} vente{etat.ventes > 1 ? "s" : ""} et {etat.mouvements} mouvement{etat.mouvements > 1 ? "s" : ""} seront
                      supprimés. Il n’y a pas de retour en arrière.
                    </div>
                    <div className="rangee" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                      <form method="post" action="/api/demo/fin">
                        <input type="hidden" name="sur" value="1" />
                        <button className="bouton primaire">Oui, désactiver et tout effacer</button>
                      </form>
                      <Link href="/demo" className="bouton discret">Non, garder la démo</Link>
                    </div>
                  </div>
                </div>
              ) : (
                <Link href="/demo?quitter=1" className="bouton primaire">Désactiver le mode démo…</Link>
              )}
            </div>

            {patron ? (
              <>
                <h2>Remettre la démo à neuf</h2>
                <div className="carte">
                  <p style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 1.6 }}>
                    Pour revenir au point de départ après avoir tout essayé : le parc inventé est
                    effacé puis recréé, et le compte reste en mode démo.
                  </p>
                  {renouveler ? (
                    <div className="avis" style={{ margin: 0 }}>
                      <IcoAlerte size={17} />
                      <div className="dit">
                        <div className="titre">Tout effacer et recréer le parc de démonstration ?</div>
                        <div className="rangee" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                          <form method="post" action="/api/demo/renouveler">
                            <input type="hidden" name="sur" value="1" />
                            <button className="bouton">Oui, remettre à neuf</button>
                          </form>
                          <Link href="/demo" className="bouton discret">Annuler</Link>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Link href="/demo?renouveler=1" className="bouton">Remettre à neuf…</Link>
                  )}
                </div>
              </>
            ) : null}
          </>
        ) : (
          <>
            <p className="sous" style={{ marginTop: 14, maxWidth: 720 }}>
              Le mode démo est désactivé : ce que ce compte affiche est ce qu’il contient
              vraiment.
            </p>
            {etat.vide && patron ? (
              <div className="carte">
                <p style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 1.6 }}>
                  Le compte est vide. Vous pouvez relancer la démo pour continuer à essayer la
                  console avec un parc inventé — tant qu’aucune vraie RedBox n’est appairée.
                </p>
                <form method="post" action="/api/demo/relancer">
                  <button className="bouton">Relancer le mode démo</button>
                </form>
              </div>
            ) : null}
          </>
        )}
      </main>
      <NavBasse page="reglages" />
    </>
  );
}
