import type { Forme, Rang } from "@/lib/communaute";

/**
 * Un badge : une pastille ronde et un dessin dedans. Dessines, pas pris dans
 * une police — memes regles que les icones. Eteint quand il n'est pas encore
 * obtenu : on voit ce qu'il reste a gagner, en gris.
 */
export const TRACES: Record<Forme, React.ReactNode> = {
  couronne: <path d="M4 15.5h12M4 15.5 3 7l4 3 3-5 3 5 4-3-1 8.5" />,
  borne:    <><rect x="5.5" y="3" width="9" height="14" rx="1.6" /><path d="M8 6.5h4M8 9.5h4M8 12.5h4" /></>,
  sablier:  <path d="M6 3h8M6 17h8M7 3c0 4 6 5 6 7s-6 3-6 7M13 3c0 4-6 5-6 7s6 3 6 7" />,
  medaille: <><circle cx="10" cy="12" r="4.5" /><path d="M7 8 5.5 3h9L13 8" /></>,
  bulle:    <path d="M10 3.5c-3.9 0-7 2.6-7 5.8 0 1.6.8 3.1 2.1 4.1L4.3 16.5l3.6-1.6c.7.2 1.4.3 2.1.3 3.9 0 7-2.6 7-5.9s-3.1-5.8-7-5.8z" />,
  eclair:   <path d="M11.5 2.5 5 11h4.5l-1 6.5L15 9h-4.5z" />,
  etoile:   <path d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z" />,
  coeur:    <path d="M10 16.5s-6.5-4-6.5-8.3A3.4 3.4 0 0 1 10 6.3a3.4 3.4 0 0 1 6.5 1.9c0 4.3-6.5 8.3-6.5 8.3z" />,
};

export function Badge({ forme, obtenu = true, taille = 44, titre, rang }:
  { forme: Forme; obtenu?: boolean; taille?: number; titre?: string;
    /** La rarete teinte la pastille : gris, bleu, violet, or. Sans elle, l'or par defaut. */
    rang?: Rang }) {
  return (
    <span className={`badge-rond${obtenu ? "" : " eteint"}${rang ? " " + rang : ""}${taille >= 30 ? " grand" : ""}`}
          style={{ width: taille, height: taille }}
          title={titre} aria-hidden={titre ? undefined : true}>
      <svg width={taille * 0.55} height={taille * 0.55} viewBox="0 0 20 20" fill="none"
           stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        {TRACES[forme]}
      </svg>
    </span>
  );
}
