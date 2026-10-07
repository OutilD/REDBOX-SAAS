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
