import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { depuis } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { actionsDe, domaineDe } from "@/lib/journal-actions";
import { FAIT } from "@/lib/messages";
import { Repli } from "../../repli";
import { IcoListe } from "../../icones";

export const dynamic = "force-dynamic";

/**
 * LE JOURNAL DES ACTIONS : qui a fait quoi, quand. Des que le compte a un
 * gerant, un reassortisseur, un associe, la question revient — qui a change
 * ce prix, qui a retire ce produit. Chaque action confirmee par la console y
 * laisse une ligne, avec un lien vers la page ou elle s'est faite.
 */
export default async function Journal() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutConfigurer(u)) redirect("/reglages");
  const actions = await actionsDe(u.compte_id);

  return (
    <>
      <Entete page="journal" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/reglages" className="bouton petit" aria-label="Retour aux réglages">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Journal des actions</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12, maxWidth: 720 }}>
          Ce que chacun a fait dans le compte : un prix changé, un réassort saisi, une réception, une invitation.
          Les deux cents dernières actions.
        </p>
        {actions.length === 0 ? (
          <Repli icone={<IcoListe />} titre="Rien encore" texte="Les actions apparaissent ici au fur et à mesure." />
        ) : (
          <div className="carte plate"><div className="lignes">
            {actions.map((a) => (
              <div className="ligne" key={a.id}>
                <div className="corps">
                  <div className="nom">{FAIT[a.fait] ?? a.fait}</div>
                  <div className="meta">
                    <span className="pilule" style={{ marginRight: 8 }}>{domaineDe(a.route)}</span>
                    {a.qui ?? "quelqu’un"}
                    {a.page ? <> · <Link href={a.page.replace(/[?&]fait=[^&]*/, "").replace(/\?$/, "")}>voir la page</Link></> : null}
                  </div>
                </div>
                <div className="fin faible" style={{ fontSize: 12.5, whiteSpace: "nowrap" }} title={new Date(a.quand).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}>
                  {depuis(a.quand)}
                </div>
              </div>
            ))}
          </div></div>
        )}
      </main>
      <NavBasse page="journal" />
    </>
  );
}
