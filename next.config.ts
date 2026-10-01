import type { NextConfig } from "next";

const config: NextConfig = {
  // `pg` ouvre des sockets, `web-push` chiffre et signe avec les modules de
  // Node : ils doivent rester hors du paquet compile.
  serverExternalPackages: ["pg", "web-push"],
  // Une page qu'on vient de quitter se rouvre sans repasser par le serveur
  // pendant trente secondes : retour, onglet du bas, aller-retour entre deux
  // salons — c'est la que les clics paraissaient lents.
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
  // Des en-tetes de prudence sur tout ce qui sort. Pas de politique de
  // scripts : la carte, la 3D, le temps reel et les mesures de Vercel en
  // chargent d'ailleurs, et une liste oubliee casserait la console.
  async headers() {
    const entetes = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];
    // HSTS seulement en production ; sur une reponse en http (le reseau du
    // bar), le navigateur l'ignore de toute facon.
    if (process.env.NODE_ENV === "production") {
      entetes.push({ key: "Strict-Transport-Security", value: "max-age=31536000" });
    }
    return [{ source: "/:path*", headers: entetes }];
  },
};

export default config;
