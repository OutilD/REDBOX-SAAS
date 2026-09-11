import { veiller } from "./lib/veille";

/**
 * LA RONDE, COTE NODE SEULEMENT (voir `instrumentation.ts`).
 *
 * Chaque minute, on cherche les RedBox qui se sont tues — coupure de courant
 * ou de reseau — pour l'annoncer dans leur salon (voir `lib/veille.ts`). Une
 * seule minuterie par processus, meme quand le serveur de developpement
 * recharge ce fichier.
 */
const g = globalThis as typeof globalThis & { __redboxRonde?: boolean };

if (!g.__redboxRonde) {
  g.__redboxRonde = true;
  const ronde = () => {
    void veiller().catch((e) => console.error("ronde :", e instanceof Error ? e.message : e));
  };
  // Une premiere ronde apres le demarrage, puis chaque minute.
  setTimeout(ronde, 20_000);
  setInterval(ronde, 60_000);
}
