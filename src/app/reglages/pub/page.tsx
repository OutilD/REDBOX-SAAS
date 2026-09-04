import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, depuis, enLigne } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { playlistsDe, poids, duree, TAILLE_MAX } from "@/lib/pub";
import { illustrationsDe } from "@/lib/illustration";
import { Repli } from "../../repli";
import { IcoAlerte, IcoPub } from "../../icones";
import Apercu from "./apercu";
import Modale from "../../modale";
import ChoixFichier from "../../choix-fichier";

export const dynamic = "force-dynamic";

/**
 * L'ECRAN D'ACCUEIL DE LA BORNE.
 *
 * Une PLAYLIST par campagne, pas une fiche par photo. On choisit ses bornes et
 * ses dates une fois, pour l'operation entiere — c'est ainsi qu'on y pense.
 *
 * Les visuels defilent en plein ecran quand la machine s'ennuie ; le premier
 * toucher les balaie et lance l'achat. La pub ne s'interpose donc JAMAIS entre
 * un client et son produit — c'est la seule regle qui rende la chose acceptable
 * sur une machine dont le metier est de vendre.
 */

const ERREURS: Record<string, string> = {
  vide:  "Aucun fichier choisi.",
  type:  "Format refusé. Images : JPEG, PNG, WebP. Vidéos : MP4, WebM.",
  poids: `Fichier trop lourd. Maximum ${Math.round(TAILLE_MAX / 1024 / 1024)} Mo.`,
  cible: "Choisissez au moins une borne, ou cochez « toutes mes bornes ». " +
         "Sans destination, la playlist ne passerait nulle part.",
  introuvable: "Cette playlist n’existe plus.",
};

function jour(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

type Borne = { id: number; nom: string; adresse: string | null; vue_le: Date | null;
                veille_active: boolean; inactivite_s: number };

/**
 * Le choix des bornes.
 *
 * Jamais replie, et jamais reduit a des cases nues : on coche un LIEU, pas un
 * identifiant. Le nom seul ne suffit pas quand on a « RedBox 3 » et
 * « RedBox 4 » — l'adresse, elle, dit tout de suite laquelle est laquelle.
 *
 * Le suffixe distingue le formulaire de creation (vide) de chaque playlist
 * existante (« _12 ») : la route lit `partout_12` et `borne_12`.
 */
function ChoixBornes({ bornes, suffixe, coches, partout }: {
  bornes: Borne[]; suffixe: string; coches: number[]; partout: boolean;
}) {
  return (
    <fieldset className="cadre-choix">
      <legend>Où diffuser</legend>
      <label className="coche maitresse">
        <input type="checkbox" name={`partout${suffixe}`} defaultChecked={partout} />
        <span><b>Toutes mes bornes</b> — celles d’aujourd’hui et les prochaines</span>
      </label>
      {bornes.length === 0 ? (
        <p className="faible" style={{ fontSize: 12.5, margin: "8px 2px 2px" }}>
          Vous n’avez encore aucune borne. La playlist partira dès qu’une machine
          sera appairée.
        </p>
      ) : (
        <>
          <p className="faible" style={{ fontSize: 12.5, margin: "9px 2px 7px" }}>
            Sinon décochez ci-dessus, et choisissez parmi vos {bornes.length} borne
            {bornes.length > 1 ? "s" : ""} :
          </p>
          <div className="bornes-choix">
            {bornes.map((b) => (
              <label className="borne-carte" key={b.id}>
                <input type="checkbox" name={`borne${suffixe}`} value={b.id}
                       defaultChecked={coches.includes(b.id)} />
                <span className="dedans">
                  <span className="nom">{b.nom}</span>
                  <span className="lieu">{b.adresse ?? "lieu non renseigné"}</span>
                  <span className={`etat${enLigne(b.vue_le) ? " ok" : ""}`}>
                    {enLigne(b.vue_le) ? "en ligne" : `vue ${depuis(b.vue_le)}`}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
}

export default async function Pub({
  searchParams,
}: { searchParams: Promise<{ e?: string; ignores?: string; retirer?: string; dans?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { e, ignores, retirer, dans } = await searchParams;
  const aConfirmer = Number(retirer) || 0;
  const aGarnir = Number(dans) || 0;

  const [listes, bornes, illus] = await Promise.all([
    playlistsDe(u.compte_id),
    q<Borne>(`SELECT id, nom, adresse, vue_le, veille_active, inactivite_s
                FROM borne WHERE compte_id = $1 ORDER BY nom`, [u.compte_id]),
    illustrationsDe(u.compte_id),
  ]);

  // Absente = l'animation d'origine joue. Le defaut n'est pas une valeur qu'on
  // stocke, c'est l'absence de ligne.
  const illuAge = illus.find((i) => i.ecran === "age") ?? null;

  const total = listes.reduce((s, l) => s + l.taille, 0);
  const enLair = listes.filter((l) => l.diffuse && l.medias.length > 0).length;
  const modifiable = peutConfigurer(u);
  const cible = listes.find((l) => Number(l.id) === aGarnir);
  // UNE PLAYLIST N'ATTEINT PAS UNE BORNE SANS ECRAN D'ACCUEIL.
  //
  // Les visuels ne passent QUE sur cet ecran. Une machine ou l'exploitant l'a
  // coupe — pour rester en permanence sur son catalogue — ne diffusera donc
  // rien, quoi qu'on programme ici. C'est invisible depuis cette page, et c'est
  // exactement le genre de silence qu'on met une semaine a comprendre.
  const muettes = bornes.filter((b) => !b.veille_active);

  return (
    <>
      <Entete page="pub" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/reglages" className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Écran d’accueil</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Ce que la borne montre quand personne n’est devant : le logo, l’invite, et
          les visuels que vous y déposez. Le premier toucher les efface et lance l’achat —
          la publicité ne s’interpose jamais entre un client et son produit.
        </p>

        {bornes.length > 0 ? (
          <>
          {/* LA COULEUR MARQUE L'EXCEPTION, PAS L'ETAT NORMAL.
              Il y avait ici trois pastilles pour deux lignes de contenu : le
              compte en rouge a cote du titre, « coupe » en rouge sur la ligne,
              « en ligne » en vert. Trois signaux dont deux disaient une
              situation ordinaire. Ne reste que ce qui cloche, dit une fois. */}
          <h2 style={{ marginTop: 28 }}>Où l’écran d’accueil est allumé</h2>
          <section className="carte">
            <p className="faible" style={{ margin: 0, fontSize: 13 }}>
              Les visuels ne passent que sur cet écran : une borne coupée reste sur
              son catalogue et ne diffuse rien.
            </p>

            <div className="veille-liste">
              {bornes.map((b) => (
                <form key={b.id} method="post" action={`/api/bornes/${b.id}/veille`}
                      className="veille-ligne">
                  <input type="hidden" name="retour" value="/reglages/pub" />
                  {/* Une case absente vaut « non » cote route : pour rallumer on
                      envoie le champ, pour couper on ne l'envoie pas. */}
                  {b.veille_active ? null : <input type="hidden" name="veille" value="1" />}

                  <span className="qui">
                    <Link href={`/bornes/${b.id}/affichage`} className="nom">{b.nom}</Link>
                    <span className="meta">
                      {b.adresse && b.adresse !== b.nom ? `${b.adresse} · ` : ""}
                      {enLigne(b.vue_le) ? "en ligne" : `vue ${depuis(b.vue_le)}`}
                      {" · repos après "}{duree(b.inactivite_s)}
                    </span>
                  </span>

                  {/* Rien a dire d'une borne qui fait ce qu'on attend : le bouton
                      « Couper » suffit a dire qu'elle est allumee. On ne signale
                      que celle qui ne diffuse pas. */}
                  {b.veille_active ? null : <span className="eteint">coupé</span>}

                  {modifiable ? (
                    <button className="bouton petit">
                      {b.veille_active ? "Couper" : "Rétablir"}
                    </button>
                  ) : null}
                </form>
              ))}
            </div>
          </section>
          </>
        ) : null}

        {/* ── LES PLAYLISTS ─────────────────────────────────────────────────
            Tout ce qui suit concerne les visuels : les erreurs de televersement,
            l'avertissement legal, l'ajout a une campagne en cours, et la liste
            elle-meme. La creation, elle, passe derriere un bouton — elle occupe
            un demi-ecran et ne sert qu'une fois de temps en temps, alors que la
            liste se consulte tout le temps. */}
        <div className="rangee" style={{ gap: 10, flexWrap: "wrap", marginTop: 28 }}>
          <h2 style={{ margin: 0 }}>Playlists</h2>
          {listes.length > 0 ? (
            <span className="pilule">
              <i />{enLair} à l’antenne sur {listes.length} · {poids(total)}
            </span>
          ) : null}
          <div className="pousse" />
          {modifiable ? (
            <Modale titre="Nouvelle playlist" ouvrir="＋ Nouvelle playlist"
                    classeBouton="bouton primaire">
            <form method="post" action="/api/pub" encType="multipart/form-data">
            <input type="hidden" name="action" value="ajouter" />
            <div>
              <label htmlFor="fichier">Images ou vidéos</label>
              <ChoixFichier id="fichier" name="fichier" required multiple
                            libelle="Choisir des visuels"
                            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" />
              <p className="faible" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
                Sélectionnez-en <b>plusieurs à la fois</b> : elles formeront <b>une seule
                playlist</b> qui défile, pas une fiche par photo. JPEG, PNG, WebP, MP4 ou
                WebM · {Math.round(TAILLE_MAX / 1024 / 1024)} Mo par fichier. Le visuel
                remplit l’écran et déborde des côtés plutôt que de se déformer : gardez le
                sujet au centre.
              </p>
            </div>
            <div className="rangee" style={{ gap: 12, alignItems: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label htmlFor="nom">Nom de la playlist</label>
                <input id="nom" name="nom" placeholder="Promo rentrée" />
              </div>
              <div style={{ width: 160 }}>
                <label htmlFor="duree_s">Durée par image (s)</label>
                <input id="duree_s" name="duree_s" type="number" min={2} max={60}
                       defaultValue={7} inputMode="numeric" />
              </div>
            </div>
            <div className="rangee" style={{ gap: 12, alignItems: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label htmlFor="debut_le">Diffuser à partir du</label>
                <input id="debut_le" name="debut_le" type="date" />
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label htmlFor="fin_le">Jusqu’au</label>
                <input id="fin_le" name="fin_le" type="date" />
              </div>
            </div>
            <ChoixBornes bornes={bornes} suffixe="" coches={[]} partout />
            <div style={{ height: 16 }} />
            <button className="bouton primaire large">Créer la playlist</button>
          </form>
            </Modale>
          ) : null}
        </div>

        {e && ERREURS[e] ? <p className="erreur">{ERREURS[e]}</p> : null}
        {ignores ? (
          <p className="erreur">
            {ignores} fichier{Number(ignores) > 1 ? "s ont" : " a"} été ignoré
            {Number(ignores) > 1 ? "s" : ""} : mauvais format ou trop lourd. Le reste est en ligne.
          </p>
        ) : null}

        <div className="avis">
          <IcoAlerte size={17} />
          <div className="dit">
            <div className="titre">La publicité pour le vapotage est interdite en France</div>
            <div className="texte">
              L’article L3513-4 du code de la santé publique interdit la propagande et
              la publicité en faveur des produits du vapotage, affichage sur le lieu de
              vente compris, hors exceptions étroites. Cet écran diffuse ce que vous y
              mettez, sans rien vérifier. Faites valider vos visuels avant de les mettre
              en ligne.
            </div>
          </div>
        </div>

        {/* Ajouter des medias a une playlist existante */}
        {modifiable && cible ? (
          <form method="post" action="/api/pub" encType="multipart/form-data" className="carte chaude">
            <input type="hidden" name="action" value="ajouter" />
            <input type="hidden" name="dans" value={cible.id} />
            <h2 style={{ marginTop: 0 }}>Ajouter à « {cible.nom} »</h2>
            <p className="faible" style={{ fontSize: 13, marginTop: 0 }}>
              Les fichiers rejoignent cette playlist à la suite. Ses bornes et ses dates
              ne changent pas.
            </p>
            <ChoixFichier name="fichier" required multiple libelle="Choisir des visuels"
                          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" />
            <div className="rangee" style={{ gap: 12, alignItems: "flex-end", marginTop: 14 }}>
              <div style={{ width: 160 }}>
                <label htmlFor="duree_ajout">Durée par image (s)</label>
                <input id="duree_ajout" name="duree_s" type="number" min={2} max={60}
                       defaultValue={7} inputMode="numeric" />
              </div>
              <div className="pousse" />
              <Link href="/reglages/pub" className="bouton">Annuler</Link>
              <button className="bouton primaire">Ajouter</button>
            </div>
          </form>
        ) : null}

        {/* Les playlists */}
        {listes.length === 0 ? (
          <Repli icone={<IcoPub />} titre="Aucune playlist"
                 texte="Déposez des images ou une vidéo : elles passeront en plein écran sur vos bornes au repos." />
        ) : (
          <form method="post" action="/api/pub">
            {listes.map((l) => (
              <div className={`carte visuel${l.diffuse ? "" : " dormant"}`} key={l.id}>
                <div className="tete-playlist">
                  <Apercu medias={l.medias} />
                  <div className="quoi">
                    {modifiable
                      ? <input name={`nom_${l.id}`} defaultValue={l.nom} aria-label="Nom de la playlist" />
                      : <div className="nom">{l.nom}</div>}
                    <div className="meta" style={{ marginTop: 6 }}>
                      {l.medias.length} média{l.medias.length > 1 ? "s" : ""} ·
                      {" "}{duree(l.duree_s)} par tour · {poids(l.taille)}
                      {l.partout ? " · toutes les bornes"
                                 : ` · ${l.bornes.length} borne${l.bornes.length > 1 ? "s" : ""}`}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {l.diffuse
                        ? <span className="pilule ok"><i />à l’antenne</span>
                        : <span className="pilule attente"><i />
                            {!l.actif ? "suspendue"
                              : l.debut_le && new Date(l.debut_le) > new Date() ? "pas encore commencée"
                              : "période terminée"}
                          </span>}
                      {!l.partout && l.bornes.length === 0
                        ? <span className="pilule mal"><i />sur aucune borne</span> : null}
                      {l.medias.length === 0
                        ? <span className="pilule mal"><i />vide</span> : null}
                    </div>
                  </div>
                  {modifiable ? (
                    <div className="commandes">
                      {/* L'action réversible d'abord, et en premier sous le pouce.
                          Supprimer est irréversible : elle passe par une question. */}
                      <button name="basculer" value={l.id} className="bouton petit">
                        {l.actif ? "Suspendre" : "Reprendre"}
                      </button>
                      <Link href={`/reglages/pub?dans=${l.id}`} className="bouton petit">
                        Ajouter…
                      </Link>
                      <Link href={`/reglages/pub?retirer=${l.id}`}
                            className="bouton petit discret">Retirer…</Link>
                    </div>
                  ) : null}
                </div>

                {aConfirmer === Number(l.id) ? (
                  <div className="avis" style={{ borderLeftColor: "var(--rouge)" }}>
                    <IcoAlerte size={17} />
                    <div className="dit">
                      <div className="titre">
                        Retirer « {l.nom} » et ses {l.medias.length} média
                        {l.medias.length > 1 ? "s" : ""} ?
                      </div>
                      <div className="texte">
                        Les fichiers sont effacés de la base : il faudra les retéléverser
                        pour les rediffuser. Si vous vouliez seulement arrêter la campagne,
                        <b> Suspendre</b> la garde intacte, avec ses dates et ses bornes.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flex: "none", alignItems: "center" }}>
                      <Link href="/reglages/pub" className="bouton petit">Annuler</Link>
                      <button name="supprimer" value={l.id} className="bouton petit danger">
                        Retirer définitivement
                      </button>
                    </div>
                  </div>
                ) : null}

                {modifiable ? (
                  <>
                    {l.medias.length > 0 ? (
                      <div className="medias">
                        {l.medias.map((m, i) => (
                          <div className="media" key={m.id}>
                            <span className="rang">{i + 1}</span>
                            <div className="vignette petite">
                              {m.genre === "image"
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={`/api/pub/${m.id}`} alt={m.nom} />
                                : <video src={`/api/pub/${m.id}`} muted playsInline preload="metadata" />}
                            </div>
                            <div className="pousse" style={{ minWidth: 0 }}>
                              <div className="nom-media">{m.nom}</div>
                              <div className="meta">
                                {poids(m.taille)}{m.genre === "video" ? " · vidéo" : ""}
                              </div>
                            </div>
                            <div className="duree-media">
                              <input name={`mduree_${m.id}`} type="number" min={2} max={60}
                                     defaultValue={m.duree_s} inputMode="numeric"
                                     disabled={m.genre === "video"}
                                     aria-label={`Durée de ${m.nom}`}
                                     style={{ minHeight: 38, textAlign: "right" }} />
                            </div>
                            <button name="oter_media" value={m.id}
                                    className="bouton petit discret" aria-label={`Retirer ${m.nom}`}>
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="rangee" style={{ gap: 12, alignItems: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
                      <div style={{ width: 96 }}>
                        <label htmlFor={`ordre_${l.id}`}>Ordre</label>
                        <input id={`ordre_${l.id}`} name={`ordre_${l.id}`} type="number" min={1} max={999}
                               defaultValue={l.ordre} inputMode="numeric" />
                      </div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <label htmlFor={`debut_${l.id}`}>Du</label>
                        <input id={`debut_${l.id}`} name={`debut_${l.id}`} type="date"
                               defaultValue={jour(l.debut_le)} />
                      </div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <label htmlFor={`fin_${l.id}`}>Au</label>
                        <input id={`fin_${l.id}`} name={`fin_${l.id}`} type="date"
                               defaultValue={jour(l.fin_le)} />
                      </div>
                      <label className="coche">
                        <input type="checkbox" name={`actif_${l.id}`} defaultChecked={l.actif} />
                        <span>Diffuser</span>
                      </label>
                    </div>

                    <ChoixBornes bornes={bornes} suffixe={`_${l.id}`}
                                 coches={l.bornes.map(Number)} partout={l.partout} />
                  </>
                ) : null}
              </div>
            ))}
            {modifiable ? (
              <div style={{ marginTop: 12 }}>
                <button className="bouton large">Enregistrer</button>
              </div>
            ) : null}
          </form>
        )}

        {/* ── L'illustration de la verification d'age ─────────────────────────
            L'animation dessinee marche partout et ne pese rien, mais elle ne
            montre pas VOTRE lecteur sur VOTRE machine. D'ou le remplacement
            possible — et le retour a l'origine en un clic. */}
        <h2>Écran de vérification d’âge</h2>
        <div className="carte">
          <div className="rangee" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="vignette" style={{ width: 148, height: 100, flex: "none" }}>
              {illuAge
                ? (illuAge.type_mime.startsWith("video/")
                    ? <video src="/api/illustration/age" muted playsInline loop autoPlay />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src="/api/illustration/age" alt="" />)
                : <span className="genre">animation</span>}
            </div>
            <div className="pousse" style={{ minWidth: 250 }}>
              <div className="nom">{illuAge ? "Votre vidéo" : "Animation d’origine"}</div>
              <p className="faible" style={{ fontSize: 13, margin: "6px 0 0", lineHeight: 1.55 }}>
                La borne montre une carte qui descend vers la fente — un geste dessiné,
                qui marche partout mais ne montre pas <b>votre</b> lecteur sur <b>votre</b>
                {" "}machine. Vous pouvez y mettre une vidéo tournée devant la vraie borne.
                {" "}{illuAge ? `Actuellement : ${poids(illuAge.taille)}.`
                              : "Sans fichier, l’animation d’origine reste."}
              </p>
              {modifiable ? (
                <div className="rangee" style={{ gap: 10, marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <form method="post" action="/api/pub" encType="multipart/form-data"
                        className="rangee" style={{ gap: 10, alignItems: "flex-end" }}>
                    <input type="hidden" name="ecran" value="age" />
                    <div>
                      <label htmlFor="illu_age">Vidéo ou image</label>
                      <ChoixFichier id="illu_age" name="illustration" required
                                    libelle="Choisir une vidéo"
                                    accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" />
                    </div>
                    <button className="bouton primaire">Remplacer</button>
                  </form>
                  {illuAge ? (
                    <form method="post" action="/api/pub">
                      <input type="hidden" name="ecran" value="age" />
                      <button name="oter" value="1" className="bouton discret">
                        Revenir à l’animation
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

      </main>
      <NavBasse page="pub" />
    </>
  );
}
