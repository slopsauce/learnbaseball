/* ------------------------------------------------------------------ *
 *  LES COULEURS DES TRENTE FRANCHISES
 *  L'API ne les publie pas. Elles sont extraites des ecussons officiels
 *  que l'application affiche deja — les fichiers
 *  mlbstatic.com/team-logos/team-cap-on-light/{id}.svg — en prenant la
 *  premiere teinte declaree, celle de la coiffe. C'est une source, pas
 *  un souvenir : personne ici n'a ecrit « le bleu des Dodgers » de
 *  memoire.
 *
 *  `brut` est la couleur du logo. `c` est celle qu'on AFFICHE : la meme
 *  teinte, eclaircie juste assez pour se detacher a la fois du gazon et
 *  du ciel de la scene — au moins 1,9 contre la pelouse et 3 contre le
 *  fond. Sans cette correction, le vert des Athletics et le marine des
 *  Braves se perdaient dans le terrain. On ne touche qu'a la clarte : la
 *  teinte est ce qui fait reconnaitre une equipe.
 *
 *  Le noir des White Sox n'a pas de teinte a preserver ; il monte en
 *  gris chaud, faute de mieux.
 * ------------------------------------------------------------------ */

export const COULEURS = {
  109: { c: "#e96375", brut: "#aa182c" }, // Arizona Diamondbacks
  133: { c: "#00a38f", brut: "#003831" }, // Athletics
  144: { c: "#5391df", brut: "#0c2340" }, // Atlanta Braves
  110: { c: "#fd5001", brut: "#df4601" }, // Baltimore Orioles
  111: { c: "#5490e5", brut: "#0d2b56" }, // Boston Red Sox
  112: { c: "#da6b6a", brut: "#cc3433" }, // Chicago Cubs
  145: { c: "#a18888", brut: "#1a1a1a" }, // Chicago White Sox
  113: { c: "#fe4b66", brut: "#c6011f" }, // Cincinnati Reds
  114: { c: "#2c8eff", brut: "#002b5c" }, // Cleveland Guardians
  115: { c: "#c4ced4", brut: "#c4ced4" }, // Colorado Rockies
  116: { c: "#4c8fe3", brut: "#0a2240" }, // Detroit Tigers
  117: { c: "#2a8cff", brut: "#002d62" }, // Houston Astros
  118: { c: "#128dff", brut: "#004687" }, // Kansas City Royals
  108: { c: "#1c8eff", brut: "#003263" }, // Los Angeles Angels
  119: { c: "#008ff8", brut: "#005a9c" }, // Los Angeles Dodgers
  146: { c: "#00a3e0", brut: "#00a3e0" }, // Miami Marlins
  158: { c: "#ffc72c", brut: "#ffc72c" }, // Milwaukee Brewers
  142: { c: "#478ff4", brut: "#041e42" }, // Minnesota Twins
  121: { c: "#ff5910", brut: "#ff5910" }, // New York Mets
  147: { c: "#698cd7", brut: "#132448" }, // New York Yankees
  143: { c: "#f45475", brut: "#c20c31" }, // Philadelphia Phillies
  134: { c: "#fdb827", brut: "#fdb827" }, // Pittsburgh Pirates
  135: { c: "#a88772", brut: "#2f241d" }, // San Diego Padres
  137: { c: "#fd5a1e", brut: "#fd5a1e" }, // San Francisco Giants
  136: { c: "#00a1a1", brut: "#005c5c" }, // Seattle Mariners
  138: { c: "#f6545d", brut: "#be0a14" }, // St. Louis Cardinals
  139: { c: "#478ded", brut: "#092c5c" }, // Tampa Bay Rays
  140: { c: "#388bff", brut: "#003278" }, // Texas Rangers
  141: { c: "#4b91e7", brut: "#134a8e" }, // Toronto Blue Jays
  120: { c: "#ff4d50", brut: "#ab0003" }, // Washington Nationals
};

/* Le repli sert aux matchs hors ligue — entrainement de printemps, equipes
   invitees — ou l'identifiant n'est pas celui d'une des trente. */
export const COULEUR_DEFAUT = "#f2ce6b";

export const couleurEquipe = (id) => COULEURS[id]?.c || COULEUR_DEFAUT;
