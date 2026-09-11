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
