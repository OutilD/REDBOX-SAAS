"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker des que la page est la.
 *
 * Il ne sert qu'aux notifications, mais il doit exister AVANT qu'on demande
 * a s'abonner : l'abonnement se prend sur lui. On l'enregistre donc partout,
 * et pas seulement sur la page des reglages — sur iOS, une application posee
 * sur l'ecran d'accueil ne passe pas toujours par cette page-la en premier.
 *
 * Ni contexte securise (https, ou localhost), ni service worker : les
 * navigateurs ne l'offrent pas ailleurs, et c'est ce que la page des reglages
 * explique quand on y arrive.
 */
export default function Pwa() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* on le redira aux reglages */ });
  }, []);
  return null;
}
