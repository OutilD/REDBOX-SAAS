import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { q1 } from "@/db";
import { nomDuRole, utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Offre = { email: string; role: string; compte: string; borne: string | null };

/**
 * LA PAGE OU L'ON ENTRE AVEC UN CODE.
 *
 * Elle disait la meme chose a tout le monde et demandait un mot de passe a tout
 * le monde. Or trois situations se presentent, et se tromper de reponse laisse
 * l'invite devant un formulaire qui ne peut pas aboutir :
 *
 *  - L'ADRESSE EST INCONNUE. Le formulaire cree l'acces. Cas ordinaire.
 *  - ELLE A DEJA UN ACCES, ET C'EST LUI QUI REGARDE. Un bouton suffit : on ne
 *    lui redemande pas un mot de passe qu'il a deja.
 *  - ELLE A DEJA UN ACCES, MAIS PERSONNE N'EST CONNECTE. Il doit se connecter
 *    d'abord — le code ne suffit pas a parler au nom d'une adresse.
 *
 * On lit donc l'invitation AVANT d'afficher quoi que ce soit, et on annonce ce
 * qu'elle donne : quel compte, quel role, et quelle borne s'il n'y en a qu'une.
 */
export default async function Rejoindre({ searchParams }:
  { searchParams: Promise<{ e?: string; code?: string }> }) {
  const { e, code } = await searchParams;
  const moi = await utilisateur();
  // Sans code, cette page n'a rien a proposer : on renvoie qui est deja entre.
  if (moi && !code) redirect("/");

  const offre = code ? await q1<Offre>(`
    SELECT i.email, i.role, c.nom AS compte, b.nom AS borne
      FROM invitation i
      JOIN compte c ON c.id = i.compte_id
      LEFT JOIN borne b ON b.id = i.borne_id
     WHERE i.code = $1 AND i.utilisee_le IS NULL`, [code.trim().toUpperCase()]) : null;

  const connu = offre ? await q1<{ id: number }>(
    "SELECT id FROM utilisateur WHERE email = $1", [offre.email]) : null;
  const cestMoi = Boolean(moi && connu && moi.id === connu.id);

  const messages: Record<string, string> = {
    code: "Code inconnu, déjà utilisé ou annulé.",
    mdp: "Le mot de passe doit faire au moins huit caractères, et les deux saisies doivent être identiques.",
    connexion: "Cette adresse a déjà un accès RedBox : connectez-vous avec, puis rouvrez ce lien.",
    deja: "Cette adresse a déjà un accès RedBox.",
  };

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100svh", padding: 20 }}>
      <form method="post" action="/api/rejoindre" className="carte"
            style={{ width: "min(390px, 100%)", padding: 26 }}>
        {/* Le vrai logo, pas la marque reconstituee en texte : c'est la premiere
            chose qu'on voit de RedBox, et c'est celle qui doit etre juste. */}
        <Image src="/logo-redbox.png" alt="RedBox" width={232} height={150}
               className="logo-entree" priority />

        {offre ? (
          <p className="sous" style={{ marginBottom: 22 }}>
            Vous êtes invité à rejoindre <strong>{offre.compte}</strong> comme{" "}
            <strong>{nomDuRole(offre.role)}</strong>
            {offre.borne ? <> pour la borne <strong>{offre.borne}</strong> uniquement</> : null}.
          </p>
        ) : (
          <p className="sous" style={{ marginBottom: 22 }}>
            Vous avez reçu un code d’invitation. Ce formulaire crée votre accès :
            il ne vous reste qu’à choisir un mot de passe.
          </p>
        )}

        <div className="champ">
          <label htmlFor="code">Code d’invitation</label>
          <input id="code" name="code" required defaultValue={code ?? ""} placeholder="XXXX-XXXX"
                 className="mono" autoCapitalize="characters" autoComplete="off"
                 style={{ letterSpacing: ".14em", textAlign: "center", fontSize: 19 }} />
        </div>

        {/* Le mot de passe ne sert qu'a creer un acces. Celui qui en a deja un
            n'a rien a retaper, et se le voir demander ferait douter du lien. */}
        {connu ? null : (
          <>
            <div className="champ">
              <label htmlFor="mdp">Mot de passe</label>
              <input id="mdp" name="mdp" type="password" autoComplete="new-password"
                     required minLength={8} />
            </div>
            <div className="champ">
              <label htmlFor="mdp2">Le même, pour être sûr</label>
              <input id="mdp2" name="mdp2" type="password" autoComplete="new-password"
                     required minLength={8} />
            </div>
          </>
        )}

        {connu && !cestMoi ? (
          <p className="faible" style={{ fontSize: 13, marginTop: 4 }}>
            <strong>{offre?.email}</strong> a déjà un accès RedBox. Connectez-vous avec
            cette adresse, puis rouvrez ce lien : votre accès actuel est conservé et ce
            compte s’ajoutera au vôtre.
          </p>
        ) : null}

        {e ? <p className="erreur" style={{ marginTop: 14 }}>{messages[e] ?? "Impossible."}</p> : null}

        <div style={{ height: 18 }} />
        <button className="bouton primaire large" disabled={Boolean(connu) && !cestMoi}>
          {cestMoi ? "Rejoindre ce compte" : "Rejoindre"}
        </button>

        <p className="faible" style={{ fontSize: 13, textAlign: "center", margin: "16px 0 0" }}>
          {connu && !cestMoi ? (
            <Link href="/connexion" style={{ textDecoration: "underline" }}>Se connecter</Link>
          ) : (
            <>Vous avez déjà un accès ?{" "}
              <Link href="/connexion" style={{ textDecoration: "underline" }}>Se connecter</Link></>
          )}
        </p>
      </form>
    </main>
  );
}
