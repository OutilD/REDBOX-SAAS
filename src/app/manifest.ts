import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { hoteDes, produitDeLHote } from "@/lib/produits";

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
 *
 * UNE APPLICATION PAR PRODUIT quand chacun a son hote (`lib/produits.ts`) :
 * « RedBox Connect » s'installe depuis l'adresse de Connect et s'ouvre sur la
 * communaute ; l'autre hote, et un hote unique, donnent « RedBox ». Deux
 * icones sur l'ecran d'accueil, deux jeux de notifications — comme Messenger
 * et Facebook. `id` les distingue pour de bon aux yeux du telephone.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const connect = produitDeLHote(hoteDes(await headers())) === "connect";
  return {
    id: connect ? "/?app=connect" : "/",
    name: connect ? "RedBox Connect" : "RedBox",
    short_name: connect ? "Connect" : "RedBox",
    description: connect ? "La communauté, les messages et l’académie RedBox" : "Stock, réassort et état des RedBox",
    lang: "fr",
    start_url: connect ? "/communaute" : "/",
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
