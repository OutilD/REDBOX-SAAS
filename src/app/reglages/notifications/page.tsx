import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, depuis, leJour } from "@/db";
import { utilisateur } from "@/lib/auth";
import { GENRES, clesVapid, type Genre } from "@/lib/notifications";
import Activer from "./activer";

export const dynamic = "force-dynamic";

type Appareil = { id: number; endpoint: string; appareil: string | null; origine: string | null;
                  cree_le: Date; envoye_le: Date | null; echecs: number } & Record<Genre, boolean>;

const ERREURS: Record<string, string> = {
  aucun: "Aucun appareil n’a pu être joint. Activez d’abord les notifications sur un appareil.",
};

/**
 * LES NOTIFICATIONS.
 *
 * Trois blocs, dans l'ordre ou l'on s'en sert : CET APPAREIL — ce que le
 * serveur ne peut pas savoir, rendu par le navigateur — ; la liste de TOUS les
 * appareils de la personne, chacun avec ce qu'il veut recevoir ; et un
 * bouton d'ESSAI, parce qu'un abonnement accepte par le navigateur ne dit pas
 * que le telephone laissera passer le message.
 *
 * Les preferences sont des formulaires ordinaires : elles se reglent sans
 * JavaScript. Seul l'abonnement lui-meme en a besoin — il n'existe que dans le
 * navigateur.
 */
export default async function Notifications({ searchParams }:
  { searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { e } = await searchParams;

  const [cles, appareils] = await Promise.all([
    clesVapid(),
    q<Appareil>(`
      SELECT id, endpoint, appareil, origine, cree_le, envoye_le, echecs,
             ${GENRES.map((g) => g.cle).join(", ")}
        FROM abonnement_push WHERE utilisateur_id = $1 ORDER BY cree_le`, [u.id]),
  ]);

  return (
    <>
      <Entete page="notifications" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/reglages" className="bouton petit" aria-label="Retour aux réglages">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>Notifications</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12, maxWidth: 720 }}>
          Soyez prévenu sur votre téléphone quand une RedBox vend, coince ou se vide, sans
          avoir la console ouverte. Ça passe par le navigateur, rien à installer d’autre.
        </p>
        {e ? <p className="erreur" style={{ marginTop: 0 }}>{ERREURS[e] ?? "Impossible."}</p> : null}

        <h2>Cet appareil</h2>
        <Activer publique={cles.publique} connus={appareils.map((a) => a.endpoint)} />

        <h2>Vos appareils</h2>
        {appareils.length === 0 ? (
          <p className="vide">Aucun appareil ne reçoit encore de notification.</p>
        ) : appareils.map((a) => (
          <form key={a.id} method="post" action="/api/notifications/preferences" className="carte">
            <input type="hidden" name="id" value={a.id} />
            <div className="rangee" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>{a.appareil ?? "Appareil"}</b>
              <span className="faible" style={{ fontSize: 12.5 }}>
                ajouté le {leJour(a.cree_le)}
                {a.envoye_le ? ` · dernier envoi ${depuis(a.envoye_le)}` : " · rien d’envoyé encore"}
                {a.echecs > 0 ? ` · ${a.echecs} échec${a.echecs > 1 ? "s" : ""} de suite` : ""}
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              {GENRES.map((g) => (
                <label key={g.cle} className="coche" style={{ alignItems: "flex-start", padding: "4px 0" }}>
                  <input type="checkbox" name={g.cle} defaultChecked={a[g.cle]} style={{ marginTop: 3 }} />
                  <span><b>{g.nom}</b><span className="faible"> — {g.quoi}</span></span>
                </label>
              ))}
            </div>
            <div className="rangee" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
              <button className="bouton petit">Enregistrer</button>
              <button className="bouton petit discret" formAction="/api/notifications/retirer">Retirer</button>
            </div>
          </form>
        ))}

        {appareils.length > 0 ? (
          <>
            <h2>Essayer</h2>
            <form method="post" action="/api/notifications/essai" className="carte plate">
              <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5 }}>
                Envoie un message à chacun de vos appareils. S’il n’arrive pas, c’est le
                téléphone qui le retient : vérifiez que RedBox a le droit de notifier dans ses
                réglages.
              </p>
              <button className="bouton">Envoyer une notification d’essai</button>
            </form>
          </>
        ) : null}

        <h2>Sur téléphone</h2>
        <div className="carte plate" style={{ fontSize: 14, lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            <b>Android</b> — ouvrez la console dans Chrome, menu <b>⋮</b> puis
            « Installer l’application » (ou « Ajouter à l’écran d’accueil »). Les notifications
            marchent aussi sans installer.
          </p>
          <p style={{ margin: "10px 0 0" }}>
            <b>iPhone</b> — dans Safari, bouton <b>Partager</b> puis « Sur l’écran d’accueil ».
            Ouvrez RedBox depuis cette icône : c’est seulement là que Safari accepte de
            notifier (iOS 16.4 ou plus).
          </p>
          <p style={{ margin: "10px 0 0" }} className="faible">
            Dans les deux cas, la console doit être ouverte par une adresse en https.
          </p>
        </div>
      </main>
      <NavBasse page="reglages" />
    </>
  );
}
