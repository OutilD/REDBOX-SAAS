import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Connexion({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await utilisateur()) redirect("/");
  const { e } = await searchParams;
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100svh", padding: 20 }}>
      <form method="post" action="/api/session" className="carte" style={{ width: "min(380px, 100%)", padding: 26 }}>
        {/* Le vrai logo, pas la marque reconstituee en texte : c'est la premiere
            chose qu'on voit de RedBox, et c'est celle qui doit etre juste. */}
        <Image src="/logo-redbox.png" alt="RedBox" width={232} height={150}
               className="logo-entree" priority />
        <p className="sous" style={{ marginBottom: 22 }}>Console d’exploitation</p>
        <div className="champ">
          <label htmlFor="email">Adresse</label>
          <input id="email" name="email" type="email" autoComplete="username" required
                 inputMode="email" autoCapitalize="off" />
        </div>
        <div className="champ">
          <label htmlFor="mdp">Mot de passe</label>
          <input id="mdp" name="mdp" type="password" autoComplete="current-password" required />
        </div>
        {e ? <p className="erreur" style={{ marginTop: 14 }}>Identifiants incorrects.</p> : null}
        <div style={{ height: 20 }} />
        <button className="bouton primaire large">Entrer</button>

        <p className="faible" style={{ fontSize: 13, textAlign: "center", margin: "16px 0 0" }}>
          Pas encore de compte ?{" "}
          <Link href="/inscription" style={{ textDecoration: "underline" }}>En créer un</Link>
        </p>
        {/*
          LA PORTE DES INVITES.

          Elle manquait, et la page /rejoindre restait donc orpheline : on donnait
          un code a quelqu'un qui n'avait nulle part ou le taper. Quelqu'un qu'on
          invite arrive TOUJOURS par la page de connexion — c'est la seule adresse
          qu'il connaisse — et c'est donc la que la porte doit etre.
        */}
        <p className="faible" style={{ fontSize: 13, textAlign: "center", margin: "8px 0 0" }}>
          Vous avez un code d’invitation ?{" "}
          <Link href="/rejoindre" style={{ textDecoration: "underline" }}>Rejoindre une équipe</Link>
        </p>
      </form>
    </main>
  );
}
