import type { MetadataRoute } from "next";

/**
 * LE MANIFESTE DE L'APPLICATION INSTALLEE.
 *
 * C'est lui qui permet de poser la console sur l'ecran d'accueil d'un
 * telephone, sans barre d'adresse, et c'est la condition des notifications
 * sur iOS : Safari n'accepte de s'abonner qu'a une application installee.
 *
 * Sombre, comme la console et comme la borne. `start_url` est la racine :
 * une application qui s'ouvre sur une page precise ramene toujours au meme
 * endroit, quel que soit ce qu'on faisait en la quittant, et c'est ce qu'on
 * attend d'une icone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RedBox",
    short_name: "RedBox",
    description: "Stock, réassort et état des bornes RedBox",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
