import { redirect } from "next/navigation";
import { utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Connexion({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await utilisateur()) redirect("/");
  const { e } = await searchParams;
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100svh", padding: 20 }}>
      <form method="post" action="/api/session" className="carte" style={{ width: "min(380px, 100%)", padding: 26 }}>
        <div className="marque" style={{ fontSize: 22, marginBottom: 6 }}>
          <span className="bloc" />RED<em>BOX</em>
        </div>
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
      </form>
    </main>
  );
}
