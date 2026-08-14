/* ------------------------------------------------------------------ *
 *  LES POUSSEES DU DIRECT
 *  La ligue tient un WebSocket qui previent, lancer par lancer, qu'un
 *  match a bouge :
 *
 *    wss://ws.statsapi.mlb.com/api/v1/game/push/subscribe/gameday/{pk}
 *    {"timeStamp":"20260811_041215","gamePk":"823918","wait":10,
 *     "logicalEvents":["countChange","count02"],"gameEvents":["foul"],
 *     "changeEvent":{"type":"new_entry"},"isDelay":true}
 *
 *  IL NE POUSSE PAS LES DONNEES, il pousse un AVIS. On continue donc
 *  d'aller chercher `feed/live` — mais au moment ou quelque chose arrive,
 *  au lieu de toutes les quinze secondes.
 *
 *  CE QUE LA MESURE A DONNE, sur des matchs en cours :
 *   - la poussee arrive 6,9 s apres son propre horodatage (mediane sur
 *     huit poussees, de 6,2 a 7,1 s). Ce retard est celui de la ligue et
 *     ne se rattrape pas ;
 *   - a cet instant, le flux est DEJA a jour : 0,1 a 1,1 s pour les
 *     evenements de lancer. On peut donc aller chercher tout de suite,
 *     sans respecter le `wait: 10` du message.
 *   - font exception les balles mises en jeu, dont la description
 *     n'apparait qu'une dizaine de secondes plus tard : la, ce n'est pas
 *     le transport qui traine, c'est le marqueur. Ni le sondage ni la
 *     poussee n'y changent quoi que ce soit — d'ou le filet de securite
 *     que la vue garde par ailleurs.
 *
 *  Le sondage reste donc en repli, et ce module ne fait qu'une chose :
 *  appeler `surChangement` quand il y a lieu.
 * ------------------------------------------------------------------ */

export const URL_POUSSEE = "wss://ws.statsapi.mlb.com/api/v1/game/push/subscribe/gameday/";

/* Les deux fermetures que la ligue prononce elle-meme, et sur lesquelles
   se reconnecter serait taper contre un mur : 4400 quand le match est
   termine, 4404 quand le gamePk n'existe pas. Toutes les autres — reseau
   coupe, veille de l'ordinateur, coupure du serveur — meritent au
   contraire une nouvelle tentative. */
export const FERMETURES_DEFINITIVES = new Set([4400, 4404]);

/* Deux gardes-fous sur le rythme des requetes. La ligue envoie parfois
   deux avis pour le meme instant — un « mound_visit » et un
   « at_bat_start » a la meme seconde : on les fond en un seul appel. Et
   quoi qu'il arrive, jamais plus d'un appel toutes les deux secondes,
   pour qu'un flux devenu bavard ne se transforme pas en marteau. */
const FUSION_MS = 300;
const PLANCHER_MS = 2000;

/* Reconnexion : on double a chaque echec, plafonne a trente secondes, avec
   un peu de hasard pour que trente onglets ouverts sur le meme match ne
   reviennent pas tous ensemble a la seconde pres. */
const ATTENTE_MIN = 1000, ATTENTE_MAX = 30000;

/**
 * @param gamePk        le match a suivre
 * @param surChangement appele quand le match a bouge (deja fusionne)
 * @param surVie        appele avec `true` des l'ouverture, `false` sinon —
 *                      la vue s'en sert pour ralentir ou reprendre son
 *                      sondage, et pour dire a l'ecran ce qu'elle fait
 * @param fabrique      remplacable dans les tests
 * @returns             la fonction a appeler pour tout arreter
 */
export function abonnerPoussees(gamePk, { surChangement, surVie, fabrique } = {}) {
  const ouvrir = fabrique || ((u) => new WebSocket(u));
  let ws = null, minuteurFusion = null, minuteurReprise = null;
  let dernierAppel = 0, attente = ATTENTE_MIN, arrete = false;

  const prevenir = (vivant) => { try { surVie?.(vivant); } catch { /* la vue ne doit pas casser le flux */ } };

  const declencher = () => {
    if (arrete || minuteurFusion) return;
    // Le plancher : si le dernier appel est trop recent, on decale d'autant.
    const depuis = Date.now() - dernierAppel;
    const delai = Math.max(FUSION_MS, PLANCHER_MS - depuis);
    minuteurFusion = setTimeout(() => {
      minuteurFusion = null;
      if (arrete) return;
      dernierAppel = Date.now();
      try { surChangement?.(); } catch { /* idem */ }
    }, delai);
  };

  const connecter = () => {
    if (arrete) return;
    let socket;
    try {
      socket = ouvrir(URL_POUSSEE + gamePk);
    } catch {
      // Un navigateur qui refuse le WebSocket (reseau d'entreprise, extension) :
      // on ne reessaie pas indefiniment, la vue retombe sur son sondage.
      prevenir(false);
      return;
    }
    ws = socket;

    socket.onopen = () => {
      if (arrete) return;
      attente = ATTENTE_MIN;
      prevenir(true);
    };

    socket.onmessage = (e) => {
      if (arrete) return;
      /* On declenche sur tout message : la ligue n'envoie que des avis de
         changement, et distinguer les evenements « interessants » ferait
         dependre l'affichage d'une liste de mots-cles qu'on ne maitrise
         pas. Le plancher ci-dessus borne le cout de cette generosite. */
      let m = null;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m && String(m.gamePk) === String(gamePk)) declencher();
    };

    socket.onerror = () => { /* `onclose` suit toujours : tout s'y decide */ };

    socket.onclose = (e) => {
      if (arrete) return;
      prevenir(false);
      ws = null;
      if (FERMETURES_DEFINITIVES.has(e?.code)) {
        // Match fini ou inconnu : il n'y aura plus rien a pousser.
        arrete = true;
        return;
      }
      const d = attente * (0.7 + Math.random() * 0.6);
      attente = Math.min(ATTENTE_MAX, attente * 2);
      minuteurReprise = setTimeout(connecter, d);
    };
  };

  /* AU RETOUR AU PREMIER PLAN, on ne laisse pas courir une attente de
     reconnexion qui peut atteindre trente secondes. Un onglet cache voit
     ses minuteurs brides — jusqu'a un declenchement par minute — donc une
     socket tombee pendant qu'on regardait ailleurs peut rester morte bien
     apres le retour. Le navigateur vient de debrider : autant reconnecter
     tout de suite, et repartir du delai le plus court. */
  const doc = typeof document === "undefined" ? null : document;
  const surRetour = () => {
    if (arrete || ws || doc.visibilityState !== "visible") return;
    clearTimeout(minuteurReprise);
    minuteurReprise = null;
    attente = ATTENTE_MIN;
    connecter();
  };

  connecter();
  doc?.addEventListener("visibilitychange", surRetour);

  return () => {
    arrete = true;
    clearTimeout(minuteurFusion);
    clearTimeout(minuteurReprise);
    minuteurFusion = minuteurReprise = null;
    doc?.removeEventListener("visibilitychange", surRetour);
    try { ws?.close(); } catch { /* deja fermee */ }
    ws = null;
  };
}
