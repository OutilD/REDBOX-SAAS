/**
 * Servir un fichier stocke en base.
 *
 * L'EMPREINTE FAIT OFFICE D'ETAG. Le contenu d'un visuel ne change jamais — on
 * en televerse un nouveau, on ne modifie pas celui-la. Donc une fois qu'un
 * client l'a, il l'a pour toujours : `immutable`, et un 304 sur re-demande. Une
 * borne qui redemarre ne retelecharge rien.
 */
export function servir(
  req: Request,
  v: { octets: Buffer; type_mime: string; empreinte: string } | null,
): Response {
  if (!v) return new Response(null, { status: 404 });

  const etiquette = `"${v.empreinte.slice(0, 32)}"`;
  if (req.headers.get("if-none-match") === etiquette) {
    return new Response(null, { status: 304, headers: { ETag: etiquette } });
  }

  return new Response(new Uint8Array(v.octets), {
    headers: {
      "content-type": v.type_mime,
      "content-length": String(v.octets.length),
      "cache-control": "private, max-age=31536000, immutable",
      ETag: etiquette,
    },
  });
}
