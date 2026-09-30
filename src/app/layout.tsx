import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { ENTETE_PRODUIT, hoteDes, produitDeLHote } from "@/lib/produits";
import "./globals.css";
import Occupe from "./occupe";
import Glisser from "./glisser";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Suspense } from "react";
import Notif from "./notif";
import Pwa from "./pwa";
import HauteurEcran from "./hauteur-ecran";

/**
 * L'application installee : le manifeste pour Android et le bureau, et les
 * trois lignes qu'iOS lit a la place — plein ecran, barre d'etat fondue, et le
 * nom sous l'icone. Comme le manifeste, elles suivent l'ADRESSE : posee depuis
 * celle de Connect, l'icone est « RB Connect », blanche sur bleu nuit ; depuis
 * l'autre, « RB Gestion », rouge sur noir.
 */
export async function generateMetadata(): Promise<Metadata> {
  const connect = produitDeLHote(hoteDes(await headers())) === "connect";
  const dossier = connect ? "/connect" : "";
  return {
    title: connect ? "RedBox Connect" : "RedBox",
    description: connect ? "La communauté, les messages et l’académie RedBox" : "Stock, réassort et état des RedBox",
    icons: { icon: `${dossier}/favicon.png`, apple: `${dossier}/apple-touch-icon.png` },
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: connect ? "RB Connect" : "RB Gestion" },
    // Next ecrit la balise moderne ; les iPhone d'avant iOS 17 ne lisent que celle-ci.
    other: { "apple-mobile-web-app-capable": "yes" },
  };
}

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
  if (rail === "ferme" || rail === "ouvert") attr["data-rail"] = rail;
  // LE PRODUIT — Gestion ou Connect — habille toute la page : c'est le
  // middleware qui l'a decide, la feuille de style fait le reste.
  attr["data-produit"] = (await headers()).get(ENTETE_PRODUIT) === "connect" ? "connect" : "gestion";
  return (
    <html lang="fr" {...attr}>
      <body>
        {/* `useSearchParams` exige une frontiere differee : sans elle, Next
            refuse de rendre la page cote serveur. */}
        <Suspense fallback={null}><Notif /></Suspense>
        {children}
        <Occupe />
        <Glisser />
        {/* Le temps de chargement vu par les vrais utilisateurs, page par page,
            dans le tableau de bord Vercel (onglet Speed Insights, a activer une
            fois). Hors de Vercel, il ne fait rien. */}
        <SpeedInsights />
        <Pwa />
        {/* iPhone : la barre du bas et l'en-tete restent a leur place apres le clavier. */}
        <HauteurEcran />
      </body>
    </html>
  );
}
