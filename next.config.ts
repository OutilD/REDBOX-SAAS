import type { NextConfig } from "next";

const config: NextConfig = {
  // `pg` ouvre des sockets, `web-push` chiffre et signe avec les modules de
  // Node : ils doivent rester hors du paquet compile.
  serverExternalPackages: ["pg", "web-push"],
  // Une page qu'on vient de quitter se rouvre sans repasser par le serveur
  // pendant trente secondes : retour, onglet du bas, aller-retour entre deux
  // salons — c'est la que les clics paraissaient lents.
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
};

export default config;
