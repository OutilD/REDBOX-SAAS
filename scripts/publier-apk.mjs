// Publie un APK de la borne dans public/apk et decrit la version dans
// public/apk/redbox.json, que la console lit pour les mises a jour a distance.
//
//   node scripts/publier-apk.mjs <chemin.apk> <versionName> <versionCode>
//   node scripts/publier-apk.mjs ../../../redbox-vmc/redbox-5.17.apk 5.17 67
//
// Ecrit redbox-<version>.apk (fige) et redbox.apk (toujours la derniere).
// Le versionCode doit etre celui de app/build.gradle : la borne le compare a
// l'APK telecharge et refuse l'installation s'ils different.

import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [source, version, code] = process.argv.slice(2);
if (!source || !/^\d+\.\d+$/.test(version ?? "") || !/^\d+$/.test(code ?? "")) {
  console.error("usage : node scripts/publier-apk.mjs <chemin.apk> <5.17> <67>");
  process.exit(1);
}

const octets = readFileSync(source);
const dossier = join(process.cwd(), "public", "apk");
const fichier = `redbox-${version}.apk`;
copyFileSync(source, join(dossier, fichier));
copyFileSync(source, join(dossier, "redbox.apk"));

const description = {
  version,
  version_code: Number(code),
  fichier: `/apk/${fichier}`,
  taille: octets.length,
  sha256: createHash("sha256").update(octets).digest("hex"),
  publie_le: new Date().toISOString(),
};
writeFileSync(join(dossier, "redbox.json"), JSON.stringify(description, null, 2) + "\n");
console.log(description);
