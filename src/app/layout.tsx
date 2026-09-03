import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import Occupe from "./occupe";
import { Suspense } from "react";
import Notif from "./notif";

export const metadata: Metadata = {
  title: "RedBox",
  description: "Stock, réassort et état des bornes RedBox",
  icons: { icon: "/favicon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)",  color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
  ],
  width: "device-width", initialScale: 1, viewportFit: "cover",
};

/**
 * Le theme est un biscuit, pas un reglage de navigateur.
 *
 * Il est donc applique au rendu, sur le serveur : la page arrive deja dans la
 * bonne couleur. Une bascule en JavaScript ferait clignoter l'ecran a chaque
 * chargement — et surtout, elle ne marcherait pas ici, ou tout tient sans JS.
 * « auto » ne pose rien et laisse la feuille de style suivre le systeme.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const biscuits = await cookies();
  const theme = biscuits.get("rbx_theme")?.value;
  const rail = biscuits.get("rbx_rail")?.value;
  /**
   * SOMBRE PAR DEFAUT, ET PAS « SELON LE SYSTEME ».
   *
   * La console vit sur le comptoir d'un bar et sur le telephone d'un
   * reassortisseur, la nuit, a cote d'une machine noire. Suivre le systeme
   * donnait du blanc a qui n'avait rien demande — et le blanc, a deux heures du
   * matin devant une borne, on le prend dans les yeux.
   *
   * L'attribut est donc TOUJOURS pose : absent, il laissait la feuille de style
   * suivre `prefers-color-scheme`. Seul un choix explicite de theme clair
   * l'emporte, et il est retenu.
   */
  const attr: Record<string, string> = { "data-theme": theme === "light" ? "light" : "dark" };
  if (rail === "ferme") attr["data-rail"] = "ferme";
  return (
    <html lang="fr" {...attr}>
      <body>
        {/* `useSearchParams` exige une frontiere differee : sans elle, Next
            refuse de rendre la page cote serveur. */}
        <Suspense fallback={null}><Notif /></Suspense>
        {/*
          Filet sans JavaScript.

          `loading.tsx` place la page dans une frontiere differee : le serveur
          envoie d'abord l'ecran d'attente, puis le vrai contenu dans un bloc
          masque que React devoile. Sans JavaScript, personne ne le devoile — et
          l'ecran d'attente resterait pour toujours.

          Ces deux regles renversent la situation : l'attente disparait, le bloc
          differe s'affiche. Le contenu est deja dans la page, il ne manquait que
          la permission de le montrer.
        */}
        <noscript>
          <style>{`.ecran-chargement{display:none!important}
                   body>div[hidden]{display:block!important}`}</style>
        </noscript>
        {children}
        <Occupe />
      </body>
    </html>
  );
}
