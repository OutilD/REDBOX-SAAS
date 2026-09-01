import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q1 } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { TEL_MAX, TEXTE_DEFAUT, TEXTE_MAX } from "@/lib/sav";

export const dynamic = "force-dynamic";

/**
 * L'ASSISTANCE.
 *
 * Une page pour deux champs, et c'est justifie : ces deux champs sont la seule
 * chose que le client verra quand plus rien ne marchera. Les noyer dans un
 * ecran de reglages generaux, c'est s'assurer que personne ne les remplira.
 */
export default async function Sav({
  searchParams,
}: { searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutConfigurer(u)) redirect("/reglages");
  const { e } = await searchParams;

  const [c, bornes] = await Promise.all([
    q1<{ sav_tel: string | null; sav_texte: string | null }>(
      "SELECT sav_tel, sav_texte FROM compte WHERE id = $1", [u.compte_id]),
    q1<{ n: number }>(
      "SELECT COUNT(*)::int n FROM borne WHERE compte_id = $1", [u.compte_id]),
  ]);

  const tel = (c?.sav_tel ?? "").trim();
  const texte = (c?.sav_texte ?? "").trim();
  const n = bornes?.n ?? 0;

  const messages: Record<string, string> = {
    tel: "Ce numéro ne contient pas assez de chiffres pour qu’on puisse appeler.",
  };

  return (
    <>
      <Entete page="sav" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/reglages" className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Assistance</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Le numéro que la borne affiche au client quand quelque chose coince. Il apparaît
          en bas de l’écran d’achat, et en grand sur les écrans de panne — là où
          quelqu’un cherche à qui parler.
        </p>
        {e ? <p className="erreur">{messages[e] ?? "Impossible."}</p> : null}

        <form method="post" action="/api/sav" className="carte">
          <div className="rangee" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="tel">Numéro à appeler</label>
              <input id="tel" name="tel" defaultValue={tel} maxLength={TEL_MAX}
                     inputMode="tel" placeholder="06 12 34 56 78" />
            </div>
            <div style={{ flex: 2, minWidth: 240 }}>
              <label htmlFor="texte">La phrase qui l’accompagne</label>
              <input id="texte" name="texte" defaultValue={texte} maxLength={TEXTE_MAX}
                     placeholder={TEXTE_DEFAUT} />
            </div>
            <button className="bouton primaire">Enregistrer</button>
          </div>
          <p className="faible" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            Laissez le numéro vide pour ne rien afficher du tout.
            {n > 0 ? ` La modification part sur vos ${n} borne${n > 1 ? "s" : ""} à leur prochaine synchronisation.` : ""}
          </p>
        </form>

        <h2>Ce que verra le client</h2>
        <div className="carte" style={{ background: "#0d0d10", borderColor: "#23232a" }}>
          {tel ? (
            <div style={{ textAlign: "center", padding: "18px 8px", color: "#e8e8ee" }}>
              <div style={{ fontSize: 14, color: "#9a9aa5" }}>{texte || TEXTE_DEFAUT}</div>
              <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 0.5, marginTop: 6 }}>
                {tel}
              </div>
            </div>
          ) : (
            <p className="faible" style={{ margin: 0 }}>
              Rien n’est affiché : la borne laisse la place vide tant qu’aucun numéro
              n’est renseigné. Un client bloqué devant une machine muette s’en va.
            </p>
          )}
        </div>
      </main>
      <NavBasse page="sav" />
    </>
  );
}
