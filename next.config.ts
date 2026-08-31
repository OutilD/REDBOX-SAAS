import type { NextConfig } from "next";

const config: NextConfig = {
  // `pg` ouvre des sockets : il doit rester hors du paquet compile.
  serverExternalPackages: ["pg"],
};

export default config;
