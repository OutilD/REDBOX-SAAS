import Link from "next/link";

/**
 * L'ecran vide.
 *
 * Toujours trois choses : ce qu'il n'y a pas, POURQUOI c'est normal, et le geste
 * suivant. Un tableau sans lignes ne dit pas s'il est vide parce qu'il n'y a
 * rien, parce qu'un filtre cache tout, ou parce que quelque chose a casse — et
 * sans bouton, il ne fait qu'annoncer une impasse.
 */
export function Repli({ icone, titre, texte, action, secondaire, dedans = false }: {
  icone?: React.ReactNode;
  titre: string;
  texte?: string;
  action?: { nom: string; vers: string };
  secondaire?: { nom: string; vers: string };
  dedans?: boolean;
}) {
  return (
    <div className={`repli ${dedans ? "dedans" : ""}`}>
      {icone ? <span className="marque-repli">{icone}</span> : null}
      <span className="titre">{titre}</span>
      {texte ? <span className="texte">{texte}</span> : null}
      {action || secondaire ? (
        <div className="actions">
          {action ? <Link href={action.vers} className="bouton primaire">{action.nom}</Link> : null}
          {secondaire ? <Link href={secondaire.vers} className="bouton">{secondaire.nom}</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
