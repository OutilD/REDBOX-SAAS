"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ECHEC, FAIT } from "@/lib/messages";

/**
 * LE BANDEAU QUI CONFIRME.
 *
 * Il lit la cle laissee par la redirection, la dit, puis s'efface. Et il RETIRE
 * `fait` de l'adresse : sans cela, un rafraichissement rejouerait « Enregistré »
 * pour une action vieille de dix minutes, et le message ne voudrait plus rien
 * dire. `e`, lui, reste — l'erreur est toujours vraie tant qu'on ne l'a pas
 * corrigee, et la page l'explique en dessous.
 *
 * Sans JavaScript il ne s'affiche pas : la page se recharge deja, ce qui est en
 * soi le signe que l'envoi est parti. C'est le confort qu'on perd, pas
 * l'information.
 */
export default function Notif() {
  const params = useSearchParams();
  const chemin = usePathname();
  const router = useRouter();
  const [mot, poser] = useState<{ texte: string; mal: boolean } | null>(null);
  const [sort, sortir] = useState(false);

  const fait = params.get("fait");
  const rate = params.get("e");

  useEffect(() => {
    if (!fait && !rate) return;
    poser(fait ? { texte: FAIT[fait] ?? "C’est fait", mal: false }
               : { texte: ECHEC, mal: true });
    sortir(false);

    // On nettoie l'adresse tout de suite, pas a la disparition : si la personne
    // navigue entre-temps, l'historique ne doit pas garder un « fait » qui
    // reviendrait au retour arriere.
    if (fait) {
      const reste = new URLSearchParams(params.toString());
      reste.delete("fait");
      const q = reste.toString();
      router.replace(q ? `${chemin}?${q}` : chemin, { scroll: false });
    }

    const glisse = setTimeout(() => sortir(true), 3200);
    const fin = setTimeout(() => poser(null), 3600);
    return () => { clearTimeout(glisse); clearTimeout(fin); };
    // `params` change a chaque replace : on ne depend que des deux valeurs lues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fait, rate]);

  if (!mot) return null;
  return (
    <div className={`notif${mot.mal ? " mal" : ""}${sort ? " sort" : ""}`}
         role="status" aria-live="polite">
      <span className="marque" aria-hidden>{mot.mal ? "!" : "✓"}</span>
      <span>{mot.texte}</span>
    </div>
  );
}
