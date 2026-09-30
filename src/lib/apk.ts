import apk from "../../public/apk/redbox.json";

/**
 * L'APK DE LA BORNE PUBLIE PAR LA CONSOLE (public/apk/redbox.json).
 *
 * Ecrit par `scripts/publier-apk.mjs`. C'est la version que la console propose
 * aux machines et celle qu'elle considere comme « a jour ».
 */
export type Apk = {
  version: string; version_code: number; fichier: string;
  taille: number; sha256: string; publie_le: string;
};

export const APK: Apk = apk;
