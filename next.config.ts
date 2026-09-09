import type { NextConfig } from "next";

const config: NextConfig = {
  // `pg` ouvre des sockets, `web-push` chiffre et signe avec les modules de
  // Node : ils doivent rester hors du paquet compile.
  serverExternalPackages: ["pg", "web-push"],
};

export default config;
