/**
 * AU DEMARRAGE DU SERVEUR : LA RONDE DES MACHINES MUETTES.
 *
 * Next appelle `register` une fois par processus, et compile ce fichier pour
 * DEUX environnements : Node et « edge ». La ronde a besoin de la base, donc de
 * modules que l'edge n'a pas (`pg`, `http`). Elle vit dans un fichier a part,
 * importe DANS ce `if` — la forme que Next sait retirer de la compilation edge.
 * Un `if (...) return;` suivi de l'import ne suffit pas : l'import partait
 * quand meme dans l'edge, et sa compilation cassait toutes les pages.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

/**
 * UNE ERREUR DU SERVEUR — une page qui plante, une route qui leve — s'ecrit au
 * releve de sante (Plateforme → Santé). Next appelle ce crochet pour chaque
 * erreur de rendu ou de route.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
): Promise<void> {
  // L'import DANS le `if`, comme pour `register` : c'est la seule forme que
  // Next retire de la compilation edge, qui n'a ni `pg` ni `fs`.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { relever } = await import("./db");
    const e = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    relever("erreur", e, null, `${request.method} ${request.path.split("?")[0]}`);
  }
}
