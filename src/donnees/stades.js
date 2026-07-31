/* ------------------------------------------------------------------ *
 *  DONNEES DE STADES
 *  Articles Wikipedia resolus une fois pour toutes plutot qu'interroges a
 *  l'execution : pas de requete, pas de quota, pas d'erreur a gerer. Les
 *  noms de l'API portent les sponsors — « UNIQLO Field at Dodger Stadium » —
 *  d'ou la resolution par recherche et non par titre exact. Wikipedia
 *  maintient des redirections quand un article est renomme, donc ces liens
 *  survivront aux changements de nom.
 *
 *  Les affiches cocasses vivent ici aussi : le texte reste colle aux
 *  identifiants, les separer en deux tables avait deja fait oublier d'en
 *  declarer la moitie.
 * ------------------------------------------------------------------ */

export const WIKI_STADES = {
  1: "Angel Stadium of Anaheim",
  2: "Oriole Park at Camden Yards",
  3: "Fenway Park",
  4: "Guaranteed Rate Field",
  5: "Progressive Field",
  7: "Kauffman Stadium",
  12: "Tropicana Field",
  14: "Centre Rogers",
  15: "Chase Field",
  17: "Wrigley Field",
  19: "Coors Field",
  22: "Dodger Stadium",
  31: "PNC Park",
  32: "American Family Field",
  680: "T-Mobile Park",
  2392: "Daikin Park",
  2394: "Comerica Park",
  2395: "Oracle Park",
  2529: "Sutter Health Park",
  2602: "Great American Ball Park",
  2680: "Petco Park",
  2681: "Citizens Bank Park",
  2889: "Busch Stadium",
  3289: "Citi Field",
  3309: "Nationals Park",
  3312: "Target Field",
  3313: "Yankee Stadium",
  4169: "LoanDepot Park",
  4705: "Truist Park",
  5325: "Globe Life Field",
};


export const AFFICHES = [
  { ids: [110, 141, 138], texte: "duel d'oiseaux, personne ne sait voler" },
  { ids: [116, 112], texte: "confrontation féline" },
  { ids: [134, 136], texte: "des pirates contre des marins, enfin" },
  { ids: [111, 145], texte: "des chaussettes rouges contre des blanches" },
  { ids: [117, 108], texte: "duel céleste" },
  { ids: [139, 146], texte: "deux poissons dans le même bocal" },
  { ids: [113, 111], texte: "duel de rouges" },
  // Les deux grandes rivalites du baseball, parfaitement reelles.
  { ids: [119, 137], texte: "la plus vieille rivalité du baseball, importée de New York en 1958" },
  { ids: [147, 111], texte: "Yankees contre Red Sox, un siècle de rancune" },
];
