import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ------------------------------------------------------------------ *
 *  L'ALMANACH
 *  Deux vues sur une meme saison :
 *   - LE CARNET : une notion par nuit, tiree du vrai play-by-play,
 *     illustree par le clip officiel de l'action quand il existe.
 *   - LES NUITS : le calendrier remis a l'heure de Paris. L'axe n'est
 *     pas la date mais l'heure reelle de debut, minuit au centre.
 *  Source : statsapi.mlb.com (sans cle, CORS ouvert).
 * ------------------------------------------------------------------ */

const T = {
  turf: "#123D2A",
  turfLit: "#16472F",
  night: "#0B241A",
  chalk: "#EFF3EA",
  dim: "#93A697",
  clay: "#C2603A",
  sodium: "#F2CE6B",
};

const FF_DISPLAY = "'Big Shoulders Display', 'Haettenschweiler', Impact, sans-serif";
const FF_BODY = "'Spectral', Georgia, serif";
const FF_MONO = "'Space Mono', ui-monospace, Menlo, monospace";

const STORE_KEY = "almanach-carnet-v1";
const API = "https://statsapi.mlb.com/api/v1";
const CONCEPTS = [
  {
    id: "ground_out", code: "6-3", legs: [], rarete: 3,
    titre: "Le roulant",
    gist: "La balle roule au sol, un intérieur la ramasse et relaie au 1er but.",
    corps: [
      "C'est le retrait le plus banal du baseball, et pourtant sa notation est le cœur du carnet de marque. Chaque position défensive porte un numéro fixe : 1 lanceur, 2 receveur, 3 premier but, 4 deuxième but, 5 troisième but, 6 arrêt-court, 7 champ gauche, 8 champ centre, 9 champ droit.",
      "Un « 6-3 » se lit donc : l'arrêt-court a ramassé, le premier-but a réceptionné. Tu peux reconstruire l'action entière à partir de deux chiffres — c'est pour ça que ce système a survécu à un siècle et demi.",
    ],
    retenir: "Les positions sont numérotées de 1 à 9. Un retrait s'écrit comme un itinéraire.",
  },
  {
    id: "fly_out", code: "F8", legs: [], rarete: 4,
    titre: "Le ballon capturé",
    gist: "Frappée en cloche, attrapée en vol : retiré, sans discussion.",
    corps: [
      "Toute balle attrapée avant de toucher le sol retire le frappeur, où qu'elle soit tombée — même en zone de fausse balle, même dans les gradins si le défenseur y plonge.",
      "La conséquence importante est pour les coureurs : au moment exact où la balle touche le gant, ils doivent tous être en contact avec leur but. Sinon la défense relaie sur la base et les retire par appel. C'est ce qui explique pourquoi tu les vois hésiter au lieu de courir.",
    ],
    retenir: "Balle attrapée en vol = frappeur retiré, et tous les coureurs doivent être revenus toucher leur but.",
  },
  {
    id: "line_out", code: "L4", legs: [], rarete: 32,
    titre: "La ligne",
    gist: "Frappée tendue, à plat, très vite — et interceptée.",
    corps: [
      "Une ligne (line drive) part avec un angle de lancement bas et une vitesse de sortie élevée. Statistiquement c'est le type de contact le plus productif du baseball : environ 65 % des lignes deviennent des coups sûrs, contre 24 % des roulants.",
      "Sauf quand elle va droit sur un défenseur. Le frappeur a alors parfaitement fait son travail et se retrouve retiré quand même — d'où l'expression qui revient sans cesse dans les commentaires : « il a frappé dans la malchance ».",
    ],
    retenir: "La ligne est le meilleur contact possible. Son résultat dépend surtout de qui se trouve sur sa trajectoire.",
  },
  {
    id: "pop_out", code: "P4", legs: [], rarete: 36,
    titre: "La chandelle",
    gist: "Une cloche très haute et très courte, qui retombe sur le champ intérieur.",
    corps: [
      "C'est le pire résultat possible pour un frappeur : contact sous la balle, aucune distance, capture assurée. Zéro chance de coup sûr.",
      "Une règle particulière s'y attache. Avec des coureurs aux 1er et 2e buts et moins de deux retraits, l'arbitre peut déclarer un « ballon intérieur » (infield fly) : le frappeur est retiré d'office, même si personne n'attrape la balle. Sans cette règle, la défense laisserait tomber la chandelle exprès pour déclencher un double-jeu facile.",
    ],
    retenir: "La chandelle ne produit jamais rien — et la règle du ballon intérieur empêche la défense d'en abuser.",
  },
  {
    id: "strikeout", code: "K", legs: [], rarete: 9,
    titre: "Le retrait sur trois prises",
    gist: "Trois prises et le frappeur repart s'asseoir.",
    corps: [
      "Une prise (strike) se compte de trois façons : lancer dans la zone que le frappeur laisse passer, élan dans le vide, ou fausse balle. Nuance essentielle : une fausse balle ne peut jamais donner la troisième prise. Un frappeur peut en enchaîner quinze, l'échange continue.",
      "Le carnet distingue les deux façons de se faire retirer : « K » quand le frappeur s'est élancé, « {{K}} » — le même, retourné — quand il a regardé passer. Cette convention date des années 1860 et n'a jamais bougé.",
    ],
    retenir: "Trois prises, mais une fausse balle ne peut pas être la troisième.",
  },
  {
    id: "walk", code: "BB", legs: [1], rarete: 13,
    titre: "Le but sur balles",
    gist: "Quatre lancers hors de la zone : le 1er but est offert.",
    corps: [
      "Quatre balles et le frappeur marche jusqu'au 1er but sans avoir à courir. Personne ne peut le retirer en chemin.",
      "Le détail qui change tout dans les statistiques : un but sur balles n'est pas un « at-bat ». Il disparaît complètement du calcul de la moyenne au bâton — ni au numérateur, ni au dénominateur. C'est pour ça qu'un frappeur très patient a une AVG qui sous-estime sa vraie valeur, et pourquoi on lui préfère l'OBP, qui compte les buts sur balles.",
    ],
    retenir: "Quatre balles = 1er but gratuit. Invisible pour la moyenne, décisif pour l'OBP.",
  },
  {
    id: "intent_walk", code: "IBB", legs: [1], rarete: 82,
    titre: "Le but sur balles intentionnel",
    gist: "La défense offre le 1er but exprès, pour éviter un frappeur.",
    corps: [
      "Le manager décide de ne pas affronter un frappeur dangereux et lui donne le but. Depuis 2017 il n'y a même plus besoin de lancer : un signe au marbre suffit, le frappeur y va directement.",
      "Ça paraît absurde d'offrir un coureur, mais l'arithmétique tient : ça met en place un retrait forcé au 2e but (donc un double-jeu possible), et ça amène au marbre un frappeur plus faible. Le calcul se retourne dès que les buts sont déjà bien occupés — remplir les buts pour éviter un seul homme est presque toujours une mauvaise idée.",
    ],
    retenir: "On offre un but pour créer un retrait forcé et affronter quelqu'un de moins bon.",
  },
  {
    id: "hit_by_pitch", code: "HBP", legs: [1], rarete: 57,
    titre: "Atteint par un lancer",
    gist: "Le lancer touche le frappeur : 1er but offert.",
    corps: [
      "Le frappeur touché obtient le 1er but, à une condition : il doit avoir tenté d'éviter la balle. S'il se laisse volontairement heurter, ou si la balle le touche dans la zone de prises, l'arbitre refuse.",
      "Comme le but sur balles, ça ne compte pas comme un at-bat et n'affecte donc pas la moyenne. Certains frappeurs en font une compétence : se tenir très près du marbre et accepter d'encaisser. Le record moderne d'une saison dépasse les 50.",
    ],
    retenir: "Touché = 1er but, à condition d'avoir essayé de l'éviter.",
  },
  {
    id: "single", code: "1B", legs: [1], rarete: 10,
    titre: "Le simple",
    gist: "Un coup sûr qui amène le frappeur au 1er but.",
    corps: [
      "La brique de base de l'attaque : la balle tombe dans un espace libre, le frappeur atteint le 1er but sans erreur de la défense.",
      "Regarde ce qu'il fait en arrivant. Il traverse le but à pleine vitesse et freine dix mètres plus loin — le 1er but est le seul où le dépassement est autorisé sans risque, tant qu'il ne tente pas d'aller au 2e. C'est pour ça qu'il ne s'arrête jamais dessus.",
    ],
    retenir: "Un simple vaut 27 mètres. Le 1er but est le seul qu'on a le droit de dépasser.",
  },
  {
    id: "double", code: "2B", legs: [1, 2], rarete: 22,
    titre: "Le double",
    gist: "Deux buts d'un coup : le frappeur est en position de marquer.",
    corps: [
      "Un double se joue presque toujours dans les couloirs entre deux voltigeurs, ou en longeant la ligne de faute. Le frappeur arrondit le 1er but sans ralentir et glisse au 2e.",
      "Son intérêt réel est situationnel : au 2e but, on est en « position de marquer », c'est-à-dire qu'un simple ordinaire suffira à ramener le point. C'est le seuil qui fait basculer la valeur d'un coureur, bien plus que le simple fait d'avoir avancé d'une base.",
    ],
    retenir: "Au 2e but, on est en position de marquer : un simple suffit ensuite.",
  },
  {
    id: "triple", code: "3B", legs: [1, 2, 3], rarete: 77,
    titre: "Le triple",
    gist: "Le coup le plus rare et le plus spectaculaire après le circuit.",
    corps: [
      "Trois buts d'un coup, sans erreur défensive. C'est rare parce qu'il faut réunir deux choses qui coexistent mal : une balle frappée assez loin pour ne pas être un double, mais pas assez pour sortir — et un coureur assez rapide pour couvrir 82 mètres pendant que le relais revient.",
      "Le triple dépend donc énormément du stade. Un champ droit profond et irrégulier en produit beaucoup ; un parc symétrique et compact quasiment aucun. C'est la statistique la plus sensible à l'architecture du terrain.",
    ],
    retenir: "Le triple exige un frappeur rapide et un stade aux dimensions bizarres.",
  },
  {
    id: "home_run", code: "HR", legs: [1, 2, 3, 4], scored: true, rarete: 47,
    titre: "Le circuit",
    gist: "La balle sort du terrain en zone bonne : tour d'honneur.",
    corps: [
      "La balle franchit la clôture en territoire de bonnes balles. Le frappeur et tous les coureurs marquent. La seule contrainte qui reste est de toucher les quatre buts dans l'ordre — l'oublier fait annuler le point sur appel de la défense, et ça arrive une fois par décennie.",
      "Le carnet trace le losange en entier et noircit l'intérieur : c'est la marque visuelle d'un point marqué. Un circuit vaut au minimum 1 point produit (le frappeur se compte lui-même), et jusqu'à 4 si les buts sont pleins.",
    ],
    retenir: "Losange complet, intérieur noirci. Le frappeur compte son propre point produit.",
  },
  {
    id: "grand_slam", code: "GS", legs: [1, 2, 3, 4], scored: true, rarete: 92,
    titre: "Le grand chelem",
    gist: "Un circuit avec les buts pleins : quatre points d'un seul coup.",
    corps: [
      "Le maximum de points qu'une seule balle frappée peut produire. Environ un match sur vingt en contient un.",
      "C'est aussi le seul moment où la stratégie du but sur balles intentionnel se retourne violemment : remplir les buts pour éviter un frappeur, c'est offrir à son successeur la possibilité de tout renverser d'un coup.",
    ],
    retenir: "Quatre points d'un coup — la sanction maximale d'une défense qui a rempli les buts.",
  },
  {
    id: "sac_fly", code: "SF", legs: [], rarete: 62,
    titre: "Le ballon-sacrifice",
    gist: "Un retrait qui produit un point — et qui n'abîme pas la moyenne.",
    corps: [
      "Avec un coureur au 3e but et moins de deux retraits, le frappeur envoie une cloche assez profonde. La balle est attrapée, il est retiré ; mais le coureur, resté collé au but, part au moment de la capture et marque avant le relais. C'est le « tag up ».",
      "La statistique traite ce retrait comme un service rendu : +1 point produit pour le frappeur, et l'at-bat est retiré du calcul de la moyenne. Une cloche identique sans coureur au 3e aurait, elle, compté comme un échec. Même geste, deux comptabilisations — c'est un des héritages les plus arbitraires du règlement.",
    ],
    retenir: "Retiré, mais +1 RBI et l'at-bat est effacé de la moyenne.",
  },
  {
    id: "sac_bunt", code: "SH", legs: [], rarete: 80,
    titre: "L'amorti-sacrifice",
    gist: "Le frappeur se retire volontairement pour faire avancer un coureur.",
    corps: [
      "Il ne s'élance pas : il tend la batte et amortit la balle à quelques mètres, pour qu'elle roule mollement. La défense n'a le temps que de le retirer au 1er but, pendant que le coureur avance.",
      "La sabermétrie a beaucoup abîmé cette tactique : donner un retrait pour gagner une base fait baisser l'espérance de points dans la grande majorité des situations. Elle survit surtout en fin de match serré, quand on ne cherche qu'un seul point, et dans les mains des lanceurs — mauvais frappeurs par définition.",
    ],
    retenir: "On échange un retrait contre une base. Rentable seulement quand un seul point compte.",
  },
  {
    id: "gidp", code: "GIDP", legs: [], rarete: 52,
    titre: "Le double-jeu",
    gist: "Un roulant, deux retraits : la pire chose qui puisse arriver à une attaque.",
    corps: [
      "Coureur au 1er but, roulant vers le champ intérieur : la défense relaie au 2e pour retirer le coureur forcé, puis au 1er pour le frappeur. Le carnet l'écrit comme un itinéraire — « 6-4-3 » signifie arrêt-court, deuxième-but, premier-but.",
      "Le coureur forcé est retirable par simple toucher du but, sans qu'on ait besoin de le toucher lui. C'est précisément ce que la défense cherche à provoquer, et pourquoi certains lanceurs privilégient les balles basses : elles produisent des roulants.",
    ],
    retenir: "Deux retraits en une action, possible uniquement grâce au retrait forcé.",
  },
  {
    id: "double_play", code: "DP", legs: [], rarete: 64,
    titre: "Le double-jeu en vol",
    gist: "Une capture, puis un coureur pris trop loin de son but.",
    corps: [
      "Variante moins fréquente : la balle est attrapée en vol, et un coureur avait déjà quitté sa base. Le défenseur relaie vers ce but, on le touche, deuxième retrait.",
      "C'est l'illustration directe de la règle du retour obligatoire. Le coureur a parié que la balle tomberait, il a perdu son pari, et il paie le prix fort.",
    ],
    retenir: "Le coureur parti trop tôt sur une balle attrapée se fait éliminer par appel.",
  },
  {
    id: "triple_play", code: "TP", legs: [], rarete: 99,
    titre: "Le triple-jeu",
    gist: "Trois retraits sur une seule balle frappée. Deux ou trois par saison, toutes équipes confondues.",
    corps: [
      "Il faut une conjonction improbable : aucun retrait, au moins deux coureurs partis, et une balle qui permet d'enchaîner. Le cas le plus spectaculaire est le triple-jeu non assisté, où un seul défenseur fait les trois retraits — c'est arrivé quinze fois en un siècle et demi.",
      "Si tu en vois un en direct, tu as assisté à quelque chose de plus rare qu'un match parfait.",
    ],
    retenir: "Plus rare qu'un match parfait. Note la date.",
  },
  {
    id: "field_error", code: "E6", legs: [1], rarete: 57,
    titre: "L'erreur",
    gist: "Le frappeur atteint le but, mais grâce à une faute de la défense.",
    corps: [
      "Le marqueur officiel juge qu'un défenseur ordinaire aurait dû réussir le jeu. Le frappeur est sauf, mais ce n'est pas un coup sûr : sa moyenne n'en profite pas, et le lanceur n'est pas tenu responsable des points qui suivront.",
      "C'est la statistique la plus subjective du baseball. Elle repose sur l'appréciation d'une personne dans la tribune de presse, et elle punit paradoxalement les défenseurs les plus mobiles : celui qui atteint une balle difficile peut la rater et écoper d'une erreur, celui qui n'y va pas n'a rien.",
    ],
    retenir: "Sauf, mais sans coup sûr. Et c'est un humain dans les tribunes qui décide.",
  },
  {
    id: "fielders_choice", code: "FC", legs: [1], rarete: 67,
    titre: "Le choix du défenseur",
    gist: "Le frappeur est sauf uniquement parce qu'on a préféré retirer quelqu'un d'autre.",
    corps: [
      "La défense pouvait le retirer au 1er but, mais a choisi de viser un coureur plus dangereux — souvent celui qui allait marquer. Le frappeur atteint le but sans que ça compte comme un coup sûr.",
      "C'est une des rares situations où être sauf ne rapporte statistiquement rien : ça compte comme un at-bat raté, exactement comme un retrait. Sur le carnet, l'astuce est de noter aussi le coureur éliminé — sinon la ligne devient incompréhensible à la relecture.",
    ],
    retenir: "Sauf, mais compté comme un échec : la défense visait quelqu'un d'autre.",
  },
  {
    id: "force_out", code: "FO", legs: [], rarete: 47,
    titre: "Le retrait forcé",
    gist: "Toucher le but suffit — pas besoin de toucher le coureur.",
    corps: [
      "Un coureur est forcé quand toutes les bases derrière lui sont occupées : il n'a pas le droit de rester, donc la défense n'a qu'à toucher le but avec la balle.",
      "C'est la distinction qui gouverne toute la stratégie de course. Un coureur non forcé doit être touché physiquement, ce qui prend beaucoup plus de temps et lui laisse la possibilité de reculer, de feinter, de négocier. Toute la tension du jeu de coureurs vient de là.",
    ],
    retenir: "Forcé = on touche le but. Non forcé = on doit toucher le coureur.",
  },
  {
    id: "stolen_base_2b", code: "SB", legs: [2], rarete: 48,
    titre: "Le vol du 2e but",
    gist: "Le coureur part pendant le lancer et gagne la base à la course.",
    corps: [
      "Il prend quatre mètres d'avance, lit le premier mouvement du lanceur et part. Le budget de temps de la défense est d'environ 3,3 s : 1,35 s pour le lancer, 1,95 s pour le relais du receveur. Le coureur met à peu près autant. Ça se joue au dixième.",
      "Le facteur décisif n'est pas la vitesse pure mais le départ (« jump ») : réagir au talon du lanceur plutôt qu'à la balle. Les règles de 2023 — deux tentatives de relais maximum par frappeur, buts agrandis — ont fait remonter le taux de réussite au-delà de 80 %.",
    ],
    retenir: "Le vol se gagne au départ, pas à la vitesse. Seuil de rentabilité : ~75 % de réussite.",
  },
  {
    id: "stolen_base_3b", code: "SB3", legs: [3], rarete: 72,
    titre: "Le vol du 3e but",
    gist: "Plus facile qu'il n'y paraît, mais bien plus risqué stratégiquement.",
    corps: [
      "Techniquement c'est plus simple : l'avance possible au 2e but est plus grande, et un lanceur droitier tourne carrément le dos au coureur. Le taux de réussite y est plus élevé qu'au 2e.",
      "Le risque est ailleurs. Au 3e but avec moins de deux retraits, un simple ballon-sacrifice suffisait à marquer. Se faire éliminer là gaspille une position déjà gagnante — d'où la maxime des entraîneurs : ne jamais faire le premier ou le troisième retrait au 3e but.",
    ],
    retenir: "Plus facile à voler, mais l'échec coûte une position déjà payante.",
  },
  {
    id: "stolen_base_home", code: "SBH", legs: [4], scored: true, rarete: 99,
    titre: "Le vol du marbre",
    gist: "Voler le point directement. Quasiment disparu.",
    corps: [
      "Le coureur au 3e but part vers le marbre pendant le lancer. La balle arrive au receveur en un peu plus d'une seconde ; le coureur a 27 mètres à couvrir. C'est mathématiquement presque impossible, sauf contre un lanceur qui a totalement oublié sa présence.",
      "On en voit une poignée par saison en MLB, souvent comme deuxième volet d'un double vol destiné à occuper le receveur ailleurs.",
    ],
    retenir: "Presque impossible. Ça ne marche que contre l'inattention.",
  },
  {
    id: "caught_stealing", code: "CS", legs: [2], fail: true, rarete: 70,
    titre: "Le coureur surpris",
    gist: "Le vol a échoué : le relais du receveur est arrivé le premier.",
    corps: [
      "Le receveur a sorti la balle de son gant assez vite. On mesure ça par le « pop time » : de l'impact dans le gant à l'arrivée au 2e but. Moyenne MLB ≈ 1,95 s, élite ≈ 1,80 s. L'essentiel se joue dans le transfert, pas dans la puissance du bras.",
      "Comme le coureur n'est pas forcé, il faut le toucher — d'où la glissade et le gant tendu vers la jambe. Un coureur pris coûte double : le but perdu et le retrait offert.",
    ],
    retenir: "Le receveur gagne par son transfert. Un échec coûte une base et un retrait.",
  },
  {
    id: "pickoff", code: "PO", legs: [], fail: true, rarete: 87,
    titre: "Le relais surprise",
    gist: "Le lanceur élimine un coureur qui s'était trop éloigné.",
    corps: [
      "Sans lancer vers le marbre, il pivote et relaie directement au but. Le coureur doit plonger pour revenir. Depuis 2023, il n'a droit qu'à deux tentatives par frappeur : une troisième qui échoue est sanctionnée comme un balk.",
      "L'effet de cette limite est plus dissuasif qu'offensif — après deux tentatives, le coureur sait que le lanceur est désarmé et prend une avance considérable.",
    ],
    retenir: "Deux tentatives maximum par frappeur depuis 2023. Après, le coureur est libre.",
  },
  {
    id: "balk", code: "BK", legs: [], rarete: 96,
    titre: "Le balk",
    gist: "Mouvement trompeur du lanceur : tous les coureurs avancent gratuitement.",
    corps: [
      "Une fois engagé sur la plaque avec des coureurs sur les buts, le lanceur ne peut plus interrompre son mouvement vers le marbre, ni feinter un relais sans lâcher la balle. Toute tromperie est sanctionnée immédiatement : chaque coureur avance d'un but.",
      "La règle existe pour un motif d'équilibre. Sans elle, le lanceur pourrait figer les coureurs indéfiniment par la feinte, et le vol de base disparaîtrait du jeu. Elle est notoirement subtile — beaucoup de lanceurs ne savent pas exactement où est la limite.",
    ],
    retenir: "Toute feinte interdite fait avancer tous les coureurs d'un but.",
  },
  {
    id: "wild_pitch", code: "WP", legs: [], rarete: 60,
    titre: "Le mauvais lancer",
    gist: "Le lancer échappe au receveur par la faute du lanceur. Les coureurs avancent.",
    corps: [
      "Balle dans la terre, trop haute ou trop écartée pour être rattrapable : le marqueur l'impute au lanceur. Les coureurs en profitent pour avancer d'un but.",
      "Cas particulier savoureux : si la troisième prise échappe au receveur et que le 1er but est libre, le frappeur retiré peut courir. Il peut donc atteindre le 1er but après un retrait sur trois prises — le retrait est comptabilisé, le frappeur est sauf, les deux à la fois.",
    ],
    retenir: "Faute du lanceur, les coureurs avancent. Et une 3e prise échappée peut se courir.",
  },
  {
    id: "passed_ball", code: "PB", legs: [], rarete: 76,
    titre: "La balle passée",
    gist: "Même conséquence que le mauvais lancer, mais la faute est au receveur.",
    corps: [
      "Le lancer était rattrapable avec un effort ordinaire, le receveur l'a laissé filer. La distinction avec le mauvais lancer est entièrement à la main du marqueur officiel.",
      "Elle n'est pas cosmétique : elle détermine qui porte la responsabilité des points qui suivront dans les statistiques du lanceur. Un receveur qui encaisse beaucoup de balles passées coûte des points de moyenne de points mérités à tout son staff.",
    ],
    retenir: "Même effet, responsabilité inverse. Le marqueur tranche.",
  },
  {
    id: "catcher_interf", code: "CI", legs: [1], rarete: 97,
    titre: "L'interférence du receveur",
    gist: "Le gant du receveur touche la batte : 1er but offert.",
    corps: [
      "Le receveur s'est avancé trop près et son gant a heurté l'élan. Le frappeur obtient le 1er but automatiquement, et ça ne compte pas comme un at-bat.",
      "C'est une des lignes les plus rares du carnet — quelques dizaines par saison sur l'ensemble de la ligue. Certains frappeurs, en reculant leur position dans la boîte, en provoquent statistiquement plus que les autres.",
    ],
    retenir: "Gant contre batte = 1er but gratuit, et l'at-bat ne compte pas.",
  },
  {
    id: "defensive_indiff", code: "DI", legs: [2], rarete: 89,
    titre: "L'indifférence défensive",
    gist: "Le coureur avance sans opposition : ce n'est pas un vol.",
    corps: [
      "Fin de match, écart large : la défense se moque complètement du coureur, qui trotte jusqu'au 2e but sans que personne ne bouge. Le marqueur refuse alors de créditer un but volé.",
      "C'est un garde-fou statistique : sans lui, n'importe qui pourrait gonfler son total de buts volés en fin de match perdu d'avance. Le jugement appartient au marqueur, et il est régulièrement contesté par les joueurs concernés.",
    ],
    retenir: "Avancer sans opposition ne vaut pas un vol. Le marqueur veille.",
  },
  {
    id: "full_count", code: "3-2", legs: [], rarete: 27,
    titre: "Le compte plein",
    gist: "Trois balles, deux prises : le lancer suivant décide tout.",
    corps: [
      "Le compte se lit toujours balles d'abord, prises ensuite. À 3-2, il n'y a plus de marge : le prochain lancer donne un but sur balles, un retrait, ou du contact. Sauf fausse balle, qui remet le compteur en suspens indéfiniment.",
      "Le rapport de force s'inverse selon le compte. À 3-0, le frappeur sait qu'une balle rapide dans la zone arrive et l'attend ; à 0-2, le lanceur peut se permettre trois lancers hors zone pour le faire s'élancer dans le vide. Le compte plein est le point d'équilibre exact.",
    ],
    retenir: "On lit balles-prises. À 3-2, plus personne n'a de marge.",
  },
];

const BY_ID = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));

/* ------------------------------------------------------------------ *
 *  VIDEO
 *  /game/{pk}/content expose les clips officiels. Le champ `guid` d'un
 *  clip EST le playId de l'action — c'est la jointure avec le
 *  play-by-play, qui porte deja les playId sur chaque lancer.
 *  Seule une action sur cinq environ est filmee.
 * ------------------------------------------------------------------ */
function indexerClips(content) {
  const map = new Map();
  for (const it of content?.highlights?.highlights?.items || []) {
    if (!it.guid) continue;
    const pb = it.playbacks || [];
    const mp4 = pb.find((p) => p.name === "mp4Avc") || pb.find((p) => p.url?.endsWith(".mp4"));
    if (!mp4) continue;
    const cuts = it.image?.cuts || [];
    const poster = (cuts.find((c) => c.width === 1280) || cuts[0])?.src;
    map.set(it.guid, { url: mp4.url, poster, titre: it.title, duree: it.duration });
  }
  return map;
}

/* ------------------------------------------------------------------ *
 *  DETECTION dans le play-by-play
 * ------------------------------------------------------------------ */
function classifyFieldOut(desc = "") {
  const d = desc.toLowerCase();
  if (d.includes("grounds out") || d.includes("ground out")) return "ground_out";
  if (d.includes("flies out") || d.includes("fly out")) return "fly_out";
  if (d.includes("lines out") || d.includes("line out")) return "line_out";
  if (d.includes("pops out") || d.includes("pop out")) return "pop_out";
  return "fly_out";
}

const AT_BAT_MAP = {
  single: "single",
  double: "double",
  triple: "triple",
  home_run: "home_run",
  walk: "walk",
  intent_walk: "intent_walk",
  hit_by_pitch: "hit_by_pitch",
  strikeout: "strikeout",
  strikeout_double_play: "strikeout",
  sac_fly: "sac_fly",
  sac_fly_double_play: "sac_fly",
  sac_bunt: "sac_bunt",
  sac_bunt_double_play: "sac_bunt",
  grounded_into_double_play: "gidp",
  double_play: "double_play",
  triple_play: "triple_play",
  field_error: "field_error",
  fielders_choice: "fielders_choice",
  fielders_choice_out: "fielders_choice",
  force_out: "force_out",
  catcher_interf: "catcher_interf",
};

const ACTION_MAP = {
  stolen_base_2b: "stolen_base_2b",
  stolen_base_3b: "stolen_base_3b",
  stolen_base_home: "stolen_base_home",
  caught_stealing_2b: "caught_stealing",
  caught_stealing_3b: "caught_stealing",
  caught_stealing_home: "caught_stealing",
  pickoff_caught_stealing_2b: "caught_stealing",
  pickoff_caught_stealing_3b: "caught_stealing",
  pickoff_caught_stealing_home: "caught_stealing",
  pickoff_1b: "pickoff",
  pickoff_2b: "pickoff",
  pickoff_3b: "pickoff",
  balk: "balk",
  wild_pitch: "wild_pitch",
  passed_ball: "passed_ball",
  defensive_indiff: "defensive_indiff",
};

function detectSightings(plays, clips = new Map()) {
  const found = new Map();

  const add = (id, play, clip, over) => {
    if (!id || !BY_ID[id]) return;
    const ancien = found.get(id);
    // On ne remplace une occurrence deja retenue que pour gagner une video.
    if (ancien && (ancien.clip || !clip)) return;
    found.set(id, {
      conceptId: id,
      manche: play?.about?.inning,
      demi: play?.about?.halfInning,
      description: play?.result?.description || "",
      frappeur: play?.matchup?.batter?.fullName || "",
      lanceur: play?.matchup?.pitcher?.fullName || "",
      idFrappeur: play?.matchup?.batter?.id,
      idLanceur: play?.matchup?.pitcher?.id,
      coteFrappeur: play?.matchup?.batSide?.code,
      coteLanceur: play?.matchup?.pitchHand?.code,
      clip,
      ...over,
    });
  };

  for (const play of plays) {
    const r = play.result || {};
    const et = r.eventType;
    const evs = play.playEvents || [];

    // un clip est rattache a l'action si l'un de ses lancers porte le playId
    const clip = evs.map((e) => e.playId && clips.get(e.playId)).find(Boolean) || null;

    if (et === "home_run" && (r.rbi || 0) >= 4) add("grand_slam", play, clip);
    if (et === "field_out") add(classifyFieldOut(r.description), play, clip);
    else if (AT_BAT_MAP[et]) add(AT_BAT_MAP[et], play, clip);

    for (const ev of evs) {
      if (ev.type === "action") {
        const id = ACTION_MAP[ev?.details?.eventType];
        if (id) add(id, play, clip, { description: ev?.details?.description || r.description || "" });
      }
      if (ev.isPitch && ev?.count?.balls === 3 && ev?.count?.strikes === 2) {
        add("full_count", play, clip, {
          description: `${play?.matchup?.batter?.fullName || "Le frappeur"} sur un compte plein contre ${play?.matchup?.pitcher?.fullName || "le lanceur"}.`,
        });
      }
    }
  }
  return [...found.values()];
}

/* ------------------------------------------------------------------ *
 *  IMAGERIE OFFICIELLE MLB
 *  Tout est servi en CORS ouvert et minuscule : 761 o pour une casquette,
 *  6 Ko pour un portrait detoure. Cache 14 jours cote CDN.
 * ------------------------------------------------------------------ */
const CAP = (id, sombre = true) =>
  `https://www.mlbstatic.com/team-logos/team-cap-on-${sombre ? "dark" : "light"}/${id}.svg`;
const ROND = (id) => `https://midfield.mlbstatic.com/v1/team/${id}/spots/72`;
const PORTRAIT = (id) => `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`;

const COTE = { L: "gaucher", R: "droitier", S: "ambidextre" };

/* Une image qui disparait proprement si le CDN ne repond pas. */
function Img({ src, alt, size, rond = false, style }) {
  const [ko, setKo] = useState(false);
  if (ko || !src) return null;
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setKo(true)}
      style={{ display: "block", flexShrink: 0, borderRadius: rond ? "50%" : 0, ...style }}
    />
  );
}

/* ------------------------------------------------------------------ *
 *  LE LOSANGE — l'element signature
 * ------------------------------------------------------------------ */
const PTS = { H: [50, 92], B1: [92, 50], B2: [50, 8], B3: [8, 50] };
const SEG = {
  1: [PTS.H, PTS.B1],
  2: [PTS.B1, PTS.B2],
  3: [PTS.B2, PTS.B3],
  4: [PTS.B3, PTS.H],
};

function Losange({ concept, size = 92, animate = false, muted = false }) {
  const legs = concept?.legs || [];
  const scored = !!concept?.scored;
  const fail = !!concept?.fail;
  const ink = muted ? T.dim : T.clay;
  const len = 60;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polygon
        points="50,92 92,50 50,8 8,50"
        fill={scored ? (muted ? "rgba(242,206,107,.13)" : "rgba(242,206,107,.20)") : "none"}
        stroke={muted ? "rgba(147,166,151,.5)" : "rgba(147,166,151,.75)"}
        strokeWidth="1.6"
      />
      {legs.map((n) => {
        const [[x1, y1], [x2, y2]] = SEG[n];
        return (
          <line
            key={n}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={ink}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={fail ? "7 5" : animate ? len : undefined}
            strokeDashoffset={animate && !fail ? len : undefined}
            style={
              animate && !fail
                ? { animation: `trace 620ms ${120 * n}ms cubic-bezier(.4,0,.2,1) forwards` }
                : undefined
            }
          />
        );
      })}
      {fail && (() => {
        const cible = legs.length ? SEG[legs[legs.length - 1]][1] : PTS.B1;
        const cx = Math.min(88, Math.max(12, cible[0]));
        const cy = Math.min(88, Math.max(12, cible[1]));
        const a = 9;
        return (
          <g stroke={T.clay} strokeWidth="4" strokeLinecap="round">
            <line x1={cx - a} y1={cy - a} x2={cx + a} y2={cy + a} />
            <line x1={cx + a} y1={cy - a} x2={cx - a} y2={cy + a} />
          </g>
        );
      })()}
      {[PTS.H, PTS.B1, PTS.B2, PTS.B3].map(([x, y], i) => (
        <rect
          key={i} x={x - 3.2} y={y - 3.2} width="6.4" height="6.4"
          transform={`rotate(45 ${x} ${y})`}
          fill={muted ? "rgba(147,166,151,.55)" : T.dim}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 *  Stockage — localStorage, cloisonne par ORIGINE (pas par chemin) :
 *  tous tes projets sur <toi>.github.io partagent le meme espace.
 * ------------------------------------------------------------------ */
const ETAT_VIDE = { appris: [], suivies: [119] };

async function loadState() {
  try {
    return { ...ETAT_VIDE, ...(JSON.parse(localStorage.getItem(STORE_KEY)) || {}) };
  } catch {
    return { ...ETAT_VIDE };
  }
}

/* Semantique de fusion : sauver les notions ne doit pas effacer les equipes
   suivies, et reciproquement. */
async function saveState(patch) {
  try {
    const courant = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...courant, ...patch }));
  } catch {
    /* mode prive / quota plein : on continue en memoire */
  }
}

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */
const iso = (d) => d.toISOString().slice(0, 10);
const ordinal = (n) => (!n ? "?" : n === 1 ? "1re" : `${n}e`);

function dateFR(s) {
  try {
    return new Date(s).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long",
    });
  } catch {
    return s;
  }
}

/* Le « K » inverse du carnet n'a pas de codepoint fiable : U+A7B0 manque
   dans la quasi-totalite des polices, systeme compris, et sort en tofu.
   On retourne un vrai K en CSS — meme police, meme graisse, toujours rendu. */
function texteAvecKInverse(txt) {
  return String(txt).split("{{K}}").map((seg, i) => (
    <React.Fragment key={i}>
      {i > 0 && (
        <span style={{ display: "inline-block", transform: "scaleX(-1)" }}>K</span>
      )}
      {seg}
    </React.Fragment>
  ));
}

/* ================================================================== *
 *  VUE « LE CARNET »
 * ================================================================== */
function VueAlmanach({ teams, appris, setAppris, suivies }) {
  const [teamId, setTeamId] = useState(() => suivies[0] || 119);
  const [game, setGame] = useState(null);
  const [sightings, setSightings] = useState([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState("load"); // load | ok | vide | erreur
  const [erreur, setErreur] = useState("");
  const [justInked, setJustInked] = useState(null);
  const [ouvertCarnet, setOuvertCarnet] = useState(false);
  const [consulte, setConsulte] = useState(null); // conceptId ouvert depuis le carnet
  const articleRef = useRef(null);

  const charger = useCallback(async (tid) => {
    setPhase("load");
    setErreur("");
    try {
      const fin = new Date();
      const debut = new Date(Date.now() - 12 * 864e5);
      const sch = await fetch(
        `${API}/schedule?sportId=1&teamId=${tid}&startDate=${debut.toISOString().slice(0, 10)}` +
          `&endDate=${fin.toISOString().slice(0, 10)}`
      ).then((r) => r.json());

      const finis = (sch.dates || [])
        .flatMap((d) => d.games || [])
        .filter((g) => g.status?.abstractGameState === "Final")
        .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));

      if (!finis.length) {
        setPhase("vide");
        return;
      }
      const g = finis[0];

      // Les clips sont un bonus : leur absence ne doit pas casser la fiche.
      const [pbp, content] = await Promise.all([
        fetch(`${API}/game/${g.gamePk}/playByPlay`).then((r) => r.json()),
        fetch(`${API}/game/${g.gamePk}/content`).then((r) => r.json()).catch(() => null),
      ]);

      const vues = detectSightings(pbp.allPlays || [], indexerClips(content));
      vues.sort((a, b) => BY_ID[b.conceptId].rarete - BY_ID[a.conceptId].rarete);

      setGame(g);
      setSightings(vues);
      setIdx(0);
      setPhase("ok");
    } catch (e) {
      setErreur(String(e?.message || e));
      setPhase("erreur");
    }
  }, []);

  useEffect(() => {
    charger(teamId);
  }, [teamId, charger]);

  const nouveaux = useMemo(
    () => sightings.filter((s) => !appris.includes(s.conceptId)),
    [sightings, appris]
  );
  const liste = nouveaux.length ? nouveaux : sightings;

  // Consultation depuis le carnet : on reutilise l'action du match si la notion
  // y figure, sinon on affiche la fiche seule (mode revision, sans ancrage).
  const consulteSighting = consulte ? sightings.find((s) => s.conceptId === consulte) : null;
  const courant = consulte
    ? consulteSighting || { conceptId: consulte, clip: null, virtuel: true }
    : liste[Math.min(idx, Math.max(liste.length - 1, 0))] || null;

  const concept = courant ? BY_ID[courant.conceptId] : null;
  const dejaVu = courant ? appris.includes(courant.conceptId) : false;
  const ancre = !!courant && !courant.virtuel;

  useEffect(() => {
    if (!consulte || !articleRef.current) return;
    const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    articleRef.current.scrollIntoView({ behavior: doux ? "smooth" : "auto", block: "start" });
  }, [consulte]);

  const noter = async () => {
    if (!courant || dejaVu || !ancre) return;
    const s = [...appris, courant.conceptId];
    setAppris(s);
    setJustInked(courant.conceptId);
    await saveState({ appris: s });
    setTimeout(() => setJustInked(null), 1400);
    // La notion notee sort de `nouveaux` : la liste retrecit et l'index
    // pointe naturellement sur la suivante. L'incrementer en sauterait une.
  };

  return (
    <div className="alm-rise">
      {/* ---------- quelle equipe on etudie ---------- */}
      <div style={{ margin: "0 0 22px", display: "flex", alignItems: "center", gap: 10 }}>
        <label
          htmlFor="eq"
          style={{ fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".16em", color: T.dim }}
        >
          D'APRÈS
        </label>
        <Img src={CAP(teamId)} alt="" size={26} />
        <select
          id="eq"
          className="alm-sel"
          value={teamId}
          onChange={(e) => setTeamId(Number(e.target.value))}
          style={{
            fontFamily: FF_MONO, fontSize: 12, color: T.chalk,
            background: "rgba(11,36,26,.7)", border: "1px solid rgba(239,243,234,.28)",
            padding: "6px 10px", borderRadius: 2, cursor: "pointer",
          }}
        >
          {(() => {
            const liste = teams.length ? teams : [{ id: 119, name: "Los Angeles Dodgers" }];
            const mes = liste.filter((t) => suivies.includes(t.id));
            const reste = liste.filter((t) => !suivies.includes(t.id));
            const opt = (t) => (
              <option key={t.id} value={t.id} style={{ color: "#111" }}>
                {t.name}
              </option>
            );
            return mes.length ? (
              <>
                <optgroup label="Que je suis">{mes.map(opt)}</optgroup>
                <optgroup label="Les autres">{reste.map(opt)}</optgroup>
              </>
            ) : (
              liste.map(opt)
            );
          })()}
        </select>
      </div>

      {phase === "load" && (
        <p style={{ fontFamily: FF_MONO, fontSize: 12, color: T.dim, animation: "pulse 1.4s infinite" }}>
          Dépouillement de la feuille de match…
        </p>
      )}

      {phase === "erreur" && (
        <div style={{ border: `1px solid ${T.clay}`, padding: 18, borderRadius: 3 }}>
          <p style={{ margin: 0, fontSize: 15 }}>
            La feuille de match n'est pas arrivée. L'API de MLB n'a pas répondu.
          </p>
          <p style={{ fontFamily: FF_MONO, fontSize: 11, color: T.dim, margin: "8px 0 14px" }}>
            {erreur}
          </p>
          <button className="alm-btn" onClick={() => charger(teamId)} style={btnStyle(true)}>
            Réessayer
          </button>
        </div>
      )}

      {phase === "vide" && (
        <p style={{ fontSize: 16 }}>
          Aucun match terminé sur les douze derniers jours. Hors saison, ou pause du match des étoiles —
          choisis une autre équipe en attendant.
        </p>
      )}

      {phase === "ok" && courant && concept && (
        <article ref={articleRef} key={courant.conceptId} className="alm-rise">
          <div
            style={{
              fontFamily: FF_MONO, fontSize: 11, color: T.dim,
              letterSpacing: ".06em", marginBottom: 14,
            }}
          >
            {ancre ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Img src={CAP(game.teams.away.team.id)} alt="" size={22} />
                <span>{game.teams.away.team.name} {game.teams.away.score}</span>
                <span style={{ opacity: .5 }}>—</span>
                <span>{game.teams.home.score} {game.teams.home.team.name}</span>
                <Img src={CAP(game.teams.home.team.id)} alt="" size={22} />
                <span style={{ color: "rgba(147,166,151,.55)" }}>
                  · {dateFR(game.gameDate)}{game.venue?.name ? ` · ${game.venue.name}` : ""}
                </span>
              </span>
            ) : (
              <span style={{ color: T.sodium }}>CONSULTÉE DEPUIS LE CARNET · absente de ce match</span>
            )}
          </div>

          {/* LA CASE — seulement si la notion est ancree dans une action */}
          {ancre && (
            <div
              style={{
                background: "rgba(11,36,26,.78)",
                border: "1px solid rgba(239,243,234,.2)",
                borderRadius: 3, padding: 22,
                display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap",
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <Losange concept={concept} size={104} animate />
              </div>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontFamily: FF_MONO, fontSize: 11, color: T.sodium, letterSpacing: ".14em" }}>
                  {ordinal(courant.manche)} MANCHE · {courant.demi === "top" ? "HAUT" : "BAS"}
                </div>
                <div
                  style={{
                    fontFamily: FF_MONO, fontWeight: 700, fontSize: 30,
                    color: T.clay, margin: "2px 0 8px", letterSpacing: ".04em",
                  }}
                >
                  {concept.code}
                </div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "rgba(239,243,234,.9)" }}>
                  {courant.description}
                </p>
                {courant.frappeur && (
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 10, marginTop: 12,
                      flexWrap: "wrap", fontFamily: FF_MONO, fontSize: 10.5, color: T.dim,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Img src={PORTRAIT(courant.idFrappeur)} alt="" size={38} rond
                           style={{ background: "rgba(239,243,234,.09)" }} />
                      <span>
                        <span style={{ color: T.chalk, display: "block" }}>{courant.frappeur}</span>
                        <span style={{ fontSize: 9 }}>
                          frappeur {COTE[courant.coteFrappeur] || ""}
                        </span>
                      </span>
                    </span>
                    <span style={{ color: T.clay, fontSize: 13 }}>×</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Img src={PORTRAIT(courant.idLanceur)} alt="" size={38} rond
                           style={{ background: "rgba(239,243,234,.09)" }} />
                      <span>
                        <span style={{ color: T.chalk, display: "block" }}>{courant.lanceur}</span>
                        <span style={{ fontSize: 9 }}>
                          lanceur {COTE[courant.coteLanceur] || ""}
                        </span>
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mode revision : pas d'action a montrer, mais on garde l'identite visuelle */}
          {!ancre && (
            <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
              <Losange concept={concept} size={78} animate />
              <div
                style={{
                  fontFamily: FF_MONO, fontWeight: 700, fontSize: 28,
                  color: T.clay, letterSpacing: ".04em",
                }}
              >
                {concept.code}
              </div>
            </div>
          )}

          {/* LE CLIP — seulement si l'action a ete filmee */}
          {courant.clip && (
            <div style={{ marginTop: 14 }}>
              <video
                key={courant.clip.url}
                src={courant.clip.url}
                poster={courant.clip.poster}
                controls
                preload="none"
                playsInline
                style={{
                  width: "100%", display: "block", borderRadius: 3,
                  background: "#000", border: "1px solid rgba(239,243,234,.2)",
                }}
              />
              <p
                style={{
                  fontFamily: FF_MONO, fontSize: 10, color: T.dim,
                  margin: "6px 0 0", letterSpacing: ".04em",
                }}
              >
                {courant.clip.titre}
                {courant.clip.duree ? ` · ${courant.clip.duree}` : ""}
              </p>
            </div>
          )}

          <h2
            style={{
              fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 40, lineHeight: 1,
              textTransform: "uppercase", margin: "34px 0 6px", letterSpacing: ".01em",
            }}
          >
            {concept.titre}
          </h2>
          <p style={{ fontStyle: "italic", color: T.sodium, fontSize: 15.5, margin: "0 0 20px" }}>
            {concept.gist}
          </p>

          {concept.corps.map((p, i) => (
            <p key={i} style={{ fontSize: 16, lineHeight: 1.68, margin: "0 0 15px", color: "rgba(239,243,234,.93)" }}>
              {texteAvecKInverse(p)}
            </p>
          ))}

          <div style={{ borderLeft: `3px solid ${T.clay}`, paddingLeft: 14, margin: "22px 0 26px" }}>
            <div style={{ fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".18em", color: T.dim }}>
              À RETENIR
            </div>
            <p style={{ margin: "5px 0 0", fontSize: 16.5, lineHeight: 1.45 }}>{concept.retenir}</p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {/* On ne peut cocher une notion que si elle s'est vraiment produite. */}
            {ancre && !dejaVu && (
              <button className="alm-btn" onClick={noter} style={btnStyle(true)}>
                Noter dans le carnet
              </button>
            )}
            {dejaVu && (
              <span style={{ fontFamily: FF_MONO, fontSize: 11, color: T.sodium, letterSpacing: ".1em" }}>
                ✓ DÉJÀ NOTÉE
              </span>
            )}
            {consulte ? (
              <button className="alm-btn" onClick={() => setConsulte(null)} style={btnStyle(!dejaVu)}>
                Retour à cette nuit
              </button>
            ) : (
              liste.length > 1 && (
                <button
                  className="alm-btn"
                  onClick={() => setIdx((idx + 1) % liste.length)}
                  style={btnStyle(false)}
                >
                  Une autre de cette nuit
                </button>
              )
            )}
            {!consulte && (
              <span style={{ fontFamily: FF_MONO, fontSize: 10.5, color: T.dim, marginLeft: "auto" }}>
                {nouveaux.length
                  ? `${nouveaux.length} notion${nouveaux.length > 1 ? "s" : ""} neuve${nouveaux.length > 1 ? "s" : ""} dans ce match`
                  : "tout ce match est déjà noté"}
              </span>
            )}
          </div>
        </article>
      )}

      {phase === "ok" && !courant && (
        <p style={{ fontSize: 16 }}>
          Ce match ne contenait aucune action reconnue par l'almanach. Ça arrive : essaie une autre équipe.
        </p>
      )}

      {/* ---------- LE CARNET ---------- */}
      <section style={{ marginTop: 46 }}>
        <button
          className="alm-btn"
          onClick={() => setOuvertCarnet(!ouvertCarnet)}
          aria-expanded={ouvertCarnet}
          style={{
            all: "unset", cursor: "pointer", display: "flex", alignItems: "center",
            gap: 10, width: "100%", borderTop: "1px solid rgba(239,243,234,.22)", paddingTop: 14,
          }}
        >
          <span
            style={{
              fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 24,
              textTransform: "uppercase", letterSpacing: ".03em",
            }}
          >
            Le carnet
          </span>
          <span style={{ fontFamily: FF_MONO, fontSize: 11, color: T.dim }}>
            {ouvertCarnet ? "▾ replier" : "▸ déplier"}
          </span>
        </button>

        {ouvertCarnet && (
          <div
            className="alm-rise"
            style={{
              marginTop: 18, display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 12,
            }}
          >
            {CONCEPTS.map((c) => {
              const vu = appris.includes(c.id);
              return (
                <button
                  key={c.id}
                  className="alm-cell"
                  onClick={() => setConsulte(c.id)}
                  aria-label={`Ouvrir la fiche : ${c.titre}`}
                  title={c.titre}
                  style={{
                    all: "unset", cursor: "pointer", display: "block", boxSizing: "border-box",
                    border: `1px solid rgba(239,243,234,${vu ? ".26" : ".1"})`,
                    background: consulte === c.id
                      ? "rgba(194,96,58,.22)"
                      : vu ? "rgba(11,36,26,.6)" : "rgba(11,36,26,.28)",
                    borderRadius: 2, padding: "8px 6px 10px", textAlign: "center",
                    opacity: vu ? 1 : .55,
                  }}
                >
                  <Losange concept={c} size={62} muted={!vu} animate={justInked === c.id} />
                  <div
                    style={{
                      fontFamily: FF_MONO, fontSize: 10, color: vu ? T.clay : T.dim,
                      fontWeight: 700, letterSpacing: ".04em",
                    }}
                  >
                    {c.code}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5, lineHeight: 1.25, color: T.dim, marginTop: 3,
                      overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {c.titre}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ================================================================== *
 *  VUE « LES NUITS »
 *  L'axe horizontal va de 17h a 07h heure de Paris, soit 14 heures,
 *  ce qui place minuit exactement au centre : a gauche ce qui se
 *  regarde le soir, a droite ce qui demande un reveil.
 *  68 % des matchs changent de date entre le calendrier MLB et le
 *  calendrier parisien — d'ou le regroupement par NUIT, pas par jour.
 * ================================================================== */
const TZ = "Europe/Paris";
const DEBUT = 17;          // bord gauche de la piste, en heures
const FIN = 31;            // bord droit (07h le lendemain)
const AUBE = 7;            // avant 7h, on appartient a la nuit precedente
const PASTILLE_PX = 56;    // largeur reelle d'une pastille
const VOIE_PX = 22;        // hauteur d'une voie d'empilement
const NB_NUITS = 14;

const fmtParis = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function decalerJour(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`); // midi : immunise contre les changements d'heure
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* Renvoie la nuit d'appartenance et l'heure "etendue" (25.17 = 01h10). */
function nuitDe(isoUtc) {
  const p = Object.fromEntries(
    fmtParis.formatToParts(new Date(isoUtc)).map((x) => [x.type, x.value])
  );
  let h = Number(p.hour) + Number(p.minute) / 60;
  let jour = `${p.year}-${p.month}-${p.day}`;
  if (h < AUBE) {
    h += 24;
    jour = decalerJour(jour, -1);
  }
  return { jour, h, hhmm: `${p.hour}:${p.minute}` };
}

/* Une nuit chevauche toujours deux dates : la soiree et le petit matin.
   L'etiqueter d'un seul jour induirait en erreur pour un match a 01h10. */
function libelleNuit(iso) {
  const court = (s) => {
    const d = new Date(`${s}T12:00:00Z`);
    const j = d.toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
    const m = d.toLocaleDateString("fr-FR", { day: "numeric", timeZone: "UTC" });
    return `${j} ${m}`;
  };
  return { soir: court(iso), matin: court(decalerJour(iso, 1)) };
}

/* Empilement en voies : deux pastilles trop proches passent l'une sous l'autre. */
function repartirEnVoies(matchs, largeur) {
  const voies = [];
  for (const m of matchs) {
    let i = voies.findIndex((v) => m.pct - v[v.length - 1].pct >= largeur);
    if (i === -1) {
      voies.push([m]);
      i = voies.length - 1;
    } else {
      voies[i].push(m);
    }
    m.voie = i;
  }
  return Math.max(voies.length, 1);
}

/* ---------------------------------------------------------------- *
 *  COTE DE RENCONTRE — methode log5 (Bill James), en cotes.
 *  On combine les deux pourcentages de victoire puis on applique
 *  l'avantage du terrain : entre deux equipes egales, l'equipe qui
 *  recoit gagne environ 54 % du temps, soit un rapport de cotes 1,17.
 *  C'est une estimation grossiere : elle ignore les lanceurs partants,
 *  les blessures et la forme du moment.
 * ---------------------------------------------------------------- */
const AVANTAGE_TERRAIN = 1.17;

function coteDomicile(pctDom, pctExt) {
  if (pctDom == null || pctExt == null) return null;
  const borne = (p) => Math.min(0.85, Math.max(0.15, p)); // evite les cotes infinies
  const od = borne(pctDom) / (1 - borne(pctDom));
  const oe = borne(pctExt) / (1 - borne(pctExt));
  const r = (od / oe) * AVANTAGE_TERRAIN;
  return r / (1 + r);
}

/* ---------------------------------------------------------------- *
 *  INDICE DE SUSPENSE — somme des variations absolues de probabilite
 *  de victoire sur l'ensemble du match. Un match a sens unique tourne
 *  autour de 100, un renversement repete depasse 400.
 *  Bornes de deciles mesurees sur 34 matchs de juillet 2026 :
 *  mediane 211, quartiles 166 et 276.
 *  Cet indice NE REVELE PAS le vainqueur — c'est tout son interet.
 * ---------------------------------------------------------------- */
const DECILES = [92, 119, 171, 188, 211, 241, 260, 313, 363];
const CHAMPS_WP = "fields=homeTeamWinProbabilityAdded";

function noteSuspense(indice) {
  let n = 0;
  while (n < DECILES.length && indice >= DECILES[n]) n++;
  return n + 1; // 1 a 10
}

/* ---------------------------------------------------------------- *
 *  INDICE D'ENVIE
 *  Ce qui decide qu'on regarde un match depuis Paris, par ordre de
 *  poids reel : l'heure d'abord (un match a 4h ne sera pas regarde,
 *  quel que soit l'affiche), puis l'incertitude, puis le niveau des
 *  deux equipes. La cote sert ici a l'envers : elle predit mal le
 *  vainqueur, mais un 50/50 annonce un match plus disputé qu'un 75/25.
 *  Volontairement grossier — le but est de donner envie, pas de parier.
 * ---------------------------------------------------------------- */
function indiceEnvie(m, bilans) {
  if (m.etat === "Final") return -1;
  const p = m.coteDom ?? 0.5;
  const serre = 1 - Math.abs(2 * p - 1);
  const niveau = Math.max(
    0,
    Math.min(1, (((bilans[m.idDom]?.pct ?? 0.5) + (bilans[m.idExt]?.pct ?? 0.5)) / 2 - 0.42) / 0.16)
  );
  const heure = m.h < 24 ? 1 : m.h < 25.5 ? 0.3 : 0; // jusqu'a 01h30, ca reste jouable
  return 0.42 * heure + 0.3 * serre + 0.2 * niveau + (m.neutre ? 0.08 : 0);
}

/* Formule la raison principale, en clair. */
function raisonEnvie(m, bilans) {
  const r = [];
  if (m.h < 24) r.push(`à ${m.hhmm}, sans réveil`);
  else if (m.h < 25.5) r.push(`à ${m.hhmm}, encore tenable`);
  if (m.neutre && m.stade) r.push(`à ${m.stade}`);
  const p = m.coteDom;
  if (p != null && Math.abs(2 * p - 1) < 0.06) r.push("donné à pile ou face");
  const q = ((bilans[m.idDom]?.pct ?? 0.5) + (bilans[m.idExt]?.pct ?? 0.5)) / 2;
  if (q > 0.55) r.push("deux équipes du haut de tableau");
  return r.slice(0, 2).join(", ") || `à ${m.hhmm}`;
}

const GRADUATIONS = [18, 21, 24, 27, 30];
const pos = (h) => ((h - DEBUT) / (FIN - DEBUT)) * 100;

function Pastille({ m, spoilers, suivi, largeur, hauteur, note }) {
  const fini = m.etat === "Final";
  const live = m.etat === "Live";
  const p = m.coteDom;
  // Une ligne d'appoint n'apparait que s'il y a quelque chose a dire.
  const appoint =
    note != null
      ? `${note}/10`
      : fini && spoilers
      ? `${m.scoreExt}–${m.scoreDom}`
      : null;

  return (
    <div
      title={m.infobulle}
      style={{
        position: "absolute",
        left: `${m.pct * 100}%`,
        top: m.voie * hauteur,
        width: `${largeur * 100}%`,
        height: hauteur - 4,
        padding: "3px 4px 0",
        borderRadius: 2,
        boxSizing: "border-box",
        background: suivi ? "rgba(194,96,58,.9)" : "rgba(11,36,26,.85)",
        border: `1px solid ${
          m.neutre ? T.sodium : live ? T.sodium : suivi ? T.clay : "rgba(239,243,234,.24)"
        }`,
        boxShadow: m.neutre ? `0 0 0 1px ${T.sodium}` : undefined,
        color: suivi ? "#12241B" : T.chalk,
        opacity: fini && !spoilers && note == null ? 0.6 : 1,
        fontFamily: FF_MONO,
        lineHeight: 1,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <Img src={CAP(m.idExt, !suivi)} alt={m.ext} size={14} />
        <span style={{ fontSize: 7.5, opacity: .5 }}>@</span>
        <Img src={CAP(m.idDom, !suivi)} alt={m.dom} size={14} />
        {m.neutre && (
          <span style={{ marginLeft: "auto", fontSize: 9, color: suivi ? "#12241B" : T.sodium }}>◆</span>
        )}
      </div>

      {appoint && (
        <div
          style={{
            fontSize: 8.5, marginTop: 2, fontWeight: 700,
            color: note != null ? (suivi ? "#12241B" : T.sodium) : "inherit",
          }}
        >
          {appoint}
        </div>
      )}

      {/* cote de rencontre : la part claire revient a l'equipe qui recoit */}
      {p != null && !fini && (
        <div
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0, height: 2,
            background: suivi ? "rgba(18,36,27,.35)" : "rgba(239,243,234,.18)",
          }}
        >
          <div
            style={{
              position: "absolute", right: 0, top: 0, bottom: 0,
              width: `${p * 100}%`,
              background: suivi ? "#12241B" : T.sodium,
              opacity: suivi ? .55 : .7,
            }}
          />
        </div>
      )}
    </div>
  );
}

function VueNuits({ teams, suivies, setSuivies, stadeHabituel = {}, bilans = {} }) {
  const [ancre, setAncre] = useState(() => decalerJour(new Date().toISOString().slice(0, 10), -1));
  const [matchs, setMatchs] = useState([]);
  const [phase, setPhase] = useState("load");
  const [erreur, setErreur] = useState("");
  const [spoilers, setSpoilers] = useState(false);
  const [ouvertEquipes, setOuvertEquipes] = useState(false);
  // La largeur d'empilement doit suivre la largeur reelle de la piste :
  // sur mobile, 15 matchs groupes a 01h s'empilent forcement davantage.
  const [suspense, setSuspense] = useState({}); // gamePk -> indice brut
  const [jauge, setJauge] = useState({ etat: "repos", fait: 0, total: 0 });
  const pisteRef = useRef(null);
  const [pisteW, setPisteW] = useState(640);
  useEffect(() => {
    const el = pisteRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setPisteW(e.contentRect.width || 640));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const largeur = Math.min(0.35, Math.max(0.05, PASTILLE_PX / pisteW));
  // Une ligne d'appoint (score ou note) fait grandir les pastilles.
  const ligneAppoint = spoilers || Object.keys(suspense).length > 0;
  const hauteurVoie = ligneAppoint ? VOIE_PX + 12 : VOIE_PX;

  const nuits = useMemo(
    () => Array.from({ length: NB_NUITS }, (_, i) => decalerJour(ancre, i)),
    [ancre]
  );

  useEffect(() => {
    let annule = false;
    setPhase("load");
    setErreur("");
    // On tire une journee MLB de plus : une nuit parisienne deborde sur le
    // lendemain americain. On volontairement PAS `broadcasts` (x3 le poids
    // pour des diffuseurs americains inutiles depuis la France).
    fetch(
      `${API}/schedule?sportId=1&startDate=${ancre}&endDate=${decalerJour(ancre, NB_NUITS)}` +
        `&hydrate=team,probablePitcher`
    )
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        const out = [];
        for (const jour of d.dates || []) {
          for (const g of jour.games || []) {
            const { jour: nuit, h, hhmm } = nuitDe(g.gameDate);
            const brut = (h - DEBUT) / (FIN - DEBUT);
            out.push({
              id: g.gamePk,
              nuit,
              h,
              hhmm,
              avant: brut < 0,
              brut,
              ext: g.teams.away.team.abbreviation || "?",
              dom: g.teams.home.team.abbreviation || "?",
              idExt: g.teams.away.team.id,
              idDom: g.teams.home.team.id,
              scoreExt: g.teams.away.score,
              scoreDom: g.teams.home.score,
              etat: g.status?.abstractGameState,
              stade: g.venue?.name || "",
              idStade: g.venue?.id,
              typeMatch: g.gameType,
              infobulle:
                `${g.teams.away.team.name} @ ${g.teams.home.team.name} — ${hhmm} (Paris)` +
                (g.venue?.name ? `\n${g.venue.name}` : "") +
                (g.teams.away.probablePitcher || g.teams.home.probablePitcher
                  ? `\nLanceurs annoncés : ${g.teams.away.probablePitcher?.fullName || "?"}` +
                    ` / ${g.teams.home.probablePitcher?.fullName || "?"}`
                  : ""),
            });
          }
        }
        setMatchs(out);
        setPhase("ok");
      })
      .catch((e) => {
        if (annule) return;
        setErreur(String(e?.message || e));
        setPhase("erreur");
      });
    return () => {
      annule = true;
    };
  }, [ancre]); // volontairement pas `stadeHabituel` : il arrive plus tard et
               // relancerait une requete inutile. Le terrain neutre se calcule
               // au rendu, ci-dessous.

  const parId = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const toutes = suivies.length === 0; // aucune selection = tout afficher
  const estSuivi = (m) => toutes || suivies.includes(m.idExt) || suivies.includes(m.idDom);

  const parNuit = useMemo(() => {
    const carte = new Map(nuits.map((n) => [n, []]));
    for (const m of matchs) {
      if (!carte.has(m.nuit)) continue;
      if (!toutes && !estSuivi(m)) continue;
      carte.get(m.nuit).push(m);
    }
    for (const [, liste] of carte) {
      liste.sort((a, b) => a.h - b.h);
      for (const m of liste) {
        // Terrain neutre : dix matchs par saison (Mexico, Las Vegas, Field of
        // Dreams, Little League Classic). On exclut le printemps, ou tout le
        // monde joue hors de chez soi.
        const habituel = stadeHabituel[m.idDom];
        m.neutre = !["S", "E"].includes(m.typeMatch) && !!habituel && m.idStade !== habituel;
        m.coteDom = coteDomicile(bilans[m.idDom]?.pct, bilans[m.idExt]?.pct);
      }
      for (const m of liste) m.pct = Math.max(0, Math.min(1 - largeur, m.brut));
      repartirEnVoies(liste, largeur);
    }
    return carte;
  }, [matchs, nuits, suivies, toutes, largeur, stadeHabituel, bilans]);

  // Les trois matchs a venir les plus tentants de la fenetre affichee.
  const aVoir = useMemo(
    () =>
      [...parNuit.values()]
        .flat()
        .map((m) => ({ m, s: indiceEnvie(m, bilans) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        // Une meme affiche revient plusieurs fois dans une serie : on ne
        // garde que sa meilleure occurrence, pour varier le panneau.
        .filter(
          (x, i, tout) =>
            tout.findIndex((y) => y.m.idExt === x.m.idExt && y.m.idDom === x.m.idDom) === i
        )
        .slice(0, 3)
        .map((x) => x.m),
    [parNuit, bilans]
  );

  const total = [...parNuit.values()].reduce((a, l) => a + l.length, 0);
  const soiree = [...parNuit.values()].flat().filter((m) => m.h < 24).length;

  // La nuit "en cours" : avant 7h du matin, on est encore dans celle d'hier.
  const nuitCourante = useMemo(() => {
    const n = new Date();
    const h = Number(
      new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" })
        .format(n)
    );
    const auj = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(n);
    return h < AUBE ? decalerJour(auj, -1) : auj;
  }, []);

  /* Interroge winProbability pour les matchs termines actuellement affiches.
     Le filtre `fields` fait tomber la reponse de 1,1 Mo a 9,5 Ko par match ;
     sans lui, la fonctionnalite serait inutilisable. */
  const jauger = async () => {
    const cibles = [...parNuit.values()]
      .flat()
      .filter((m) => m.etat === "Final" && suspense[m.id] == null)
      .map((m) => m.id);
    if (!cibles.length) return;
    const lot = cibles.slice(0, 45); // garde-fou : ~430 Ko maximum
    setJauge({ etat: "cours", fait: 0, total: lot.length });
    const trouve = {};
    for (let i = 0; i < lot.length; i += 6) {
      const paquet = lot.slice(i, i + 6);
      await Promise.all(
        paquet.map(async (pk) => {
          try {
            const w = await fetch(`${API}/game/${pk}/winProbability?${CHAMPS_WP}`).then((r) => r.json());
            trouve[pk] = (Array.isArray(w) ? w : []).reduce(
              (a, x) => a + Math.abs(x.homeTeamWinProbabilityAdded || 0),
              0
            );
          } catch {
            /* un match manquant n'empeche pas les autres */
          }
        })
      );
      setJauge((j) => ({ ...j, fait: Math.min(j.total, i + paquet.length) }));
    }
    setSuspense((s) => ({ ...s, ...trouve }));
    setJauge({ etat: "fini", fait: lot.length, total: lot.length });
  };

  const basculer = (id) =>
    setSuivies(suivies.includes(id) ? suivies.filter((x) => x !== id) : [...suivies, id]);

  return (
    <div className="alm-rise">
      {/* --- barre de controle --- */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button className="alm-btn" onClick={() => setAncre(decalerJour(ancre, -7))} style={btnStyle(false)}>
          ◂ semaine
        </button>
        <button className="alm-btn" onClick={() => setAncre(decalerJour(ancre, 7))} style={btnStyle(false)}>
          semaine ▸
        </button>
        <button
          className="alm-btn"
          onClick={() => setAncre(decalerJour(new Date().toISOString().slice(0, 10), -1))}
          style={btnStyle(false)}
        >
          aujourd'hui
        </button>
        <button className="alm-btn" onClick={jauger} disabled={jauge.etat === "cours"} style={btnStyle(false)}>
          {jauge.etat === "cours"
            ? `jauge… ${jauge.fait}/${jauge.total}`
            : "Jauger le suspense"}
        </button>
        <label
          style={{
            fontFamily: FF_MONO, fontSize: 10, color: T.dim, letterSpacing: ".08em",
            display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} />
          AFFICHER LES SCORES
        </label>
      </div>

      {/* --- equipes suivies : toujours visibles, jamais repliees --- */}
      <div
        style={{
          display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
          borderTop: "1px solid rgba(239,243,234,.18)", paddingTop: 12, marginBottom: 14,
        }}
      >
        <span
          style={{
            fontFamily: FF_MONO, fontSize: 10, color: T.sodium,
            letterSpacing: ".12em", marginRight: 4,
          }}
        >
          JE SUIS
        </span>

        {toutes ? (
          <span style={{ fontFamily: FF_MONO, fontSize: 11, color: T.chalk }}>
            les 30 équipes
          </span>
        ) : (
          suivies.map((id) => (
            <button
              key={id}
              className="alm-cell"
              onClick={() => basculer(id)}
              title={`Ne plus suivre ${parId[id]?.name || ""}`}
              style={{
                all: "unset", cursor: "pointer", fontFamily: FF_MONO, fontSize: 10,
                fontWeight: 700, padding: "4px 7px", borderRadius: 2,
                background: "rgba(194,96,58,.9)", color: "#12241B",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Img src={CAP(id, false)} alt="" size={16} />
                {parId[id]?.abbreviation || id} ×
              </span>
            </button>
          ))
        )}

        <button
          className="alm-btn"
          onClick={() => setOuvertEquipes(!ouvertEquipes)}
          aria-expanded={ouvertEquipes}
          style={{
            all: "unset", cursor: "pointer", fontFamily: FF_MONO, fontSize: 10,
            color: T.clay, borderBottom: "1px solid currentColor", marginLeft: 4,
          }}
        >
          {ouvertEquipes ? "fermer" : "modifier"}
        </button>
      </div>

      {ouvertEquipes && (
        <div className="alm-rise" style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(62px, 1fr))", gap: 6,
            }}
          >
            {teams.map((t) => {
              const on = suivies.includes(t.id);
              return (
                <button
                  key={t.id}
                  className="alm-cell"
                  onClick={() => basculer(t.id)}
                  title={t.name}
                  aria-pressed={on}
                  style={{
                    all: "unset", cursor: "pointer", display: "block", boxSizing: "border-box",
                    textAlign: "center", padding: "6px 2px", borderRadius: 2,
                    fontFamily: FF_MONO, fontSize: 10, fontWeight: 700,
                    background: on ? "rgba(194,96,58,.9)" : "rgba(11,36,26,.4)",
                    color: on ? "#12241B" : T.dim,
                    border: `1px solid ${on ? T.clay : "rgba(239,243,234,.14)"}`,
                  }}
                >
                  <Img
                    src={ROND(t.id)}
                    alt=""
                    size={34}
                    style={{ margin: "0 auto 3px" }}
                  />
                  {t.abbreviation}
                </button>
              );
            })}
          </div>
          <p style={{ fontFamily: FF_MONO, fontSize: 9.5, color: T.dim, margin: "10px 0 0" }}>
            Ne rien sélectionner affiche les 30 équipes.{" "}
            <button
              className="alm-btn"
              onClick={() => setSuivies([])}
              style={{
                all: "unset", cursor: "pointer", color: T.clay,
                borderBottom: "1px solid currentColor",
              }}
            >
              tout désélectionner
            </button>
          </p>
        </div>
      )}

      {phase === "load" && (
        <p style={{ fontFamily: FF_MONO, fontSize: 12, color: T.dim, animation: "pulse 1.4s infinite" }}>
          Conversion des horaires…
        </p>
      )}

      {phase === "erreur" && (
        <div style={{ border: `1px solid ${T.clay}`, padding: 18, borderRadius: 3 }}>
          <p style={{ margin: 0, fontSize: 15 }}>Le calendrier n'est pas arrivé.</p>
          <p style={{ fontFamily: FF_MONO, fontSize: 11, color: T.dim, margin: "8px 0 0" }}>{erreur}</p>
        </div>
      )}

      {phase === "ok" && (
        <>
          {/* --- a ne pas rater --- */}
          {aVoir.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div
                style={{
                  fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".18em",
                  color: T.sodium, marginBottom: 8,
                }}
              >
                À NE PAS RATER
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {aVoir.map((m) => {
                  const l = libelleNuit(m.nuit);
                  return (
                    <div
                      key={m.id}
                      title={m.infobulle}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        background: "rgba(11,36,26,.6)",
                        border: `1px solid ${m.h < 24 ? "rgba(242,206,107,.5)" : "rgba(239,243,234,.18)"}`,
                        borderRadius: 3, padding: "9px 12px",
                      }}
                    >
                      <Img src={CAP(m.idExt)} alt="" size={26} />
                      <Img src={CAP(m.idDom)} alt="" size={26} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontFamily: FF_MONO, fontSize: 11.5, color: T.chalk }}>
                          {m.ext} <span style={{ opacity: .5 }}>@</span> {m.dom}
                          <span style={{ color: T.dim }}> · {l.soir}</span>
                        </div>
                        <div style={{ fontSize: 13, color: T.sodium, fontStyle: "italic" }}>
                          {raisonEnvie(m, bilans)}
                        </div>
                      </div>
                      {m.h < 24 && (
                        <span
                          style={{
                            fontFamily: FF_MONO, fontSize: 9, letterSpacing: ".1em",
                            color: T.sodium, whiteSpace: "nowrap",
                          }}
                        >
                          EN SOIRÉE
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* --- graduation --- */}
          <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
            <div style={{ width: 62, flexShrink: 0 }} />
            <div ref={pisteRef} style={{ position: "relative", flex: 1, height: 14 }}>
              {GRADUATIONS.map((h) => (
                <div
                  key={h}
                  style={{
                    position: "absolute", left: `${pos(h)}%`, transform: "translateX(-50%)",
                    fontFamily: FF_MONO, fontSize: 9, letterSpacing: ".06em",
                    color: h === 24 ? T.sodium : T.dim,
                  }}
                >
                  {String(h % 24).padStart(2, "0")}h
                </div>
              ))}
            </div>
          </div>

          {/* --- les nuits --- */}
          {nuits.map((n) => {
            const liste = parNuit.get(n) || [];
            const voies = liste.length ? Math.max(...liste.map((m) => m.voie)) + 1 : 1;
            const l = libelleNuit(n);
            const ceSoir = n === nuitCourante;
            return (
              <div key={n} style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                <div
                  style={{
                    width: 62, flexShrink: 0, fontFamily: FF_MONO, fontSize: 10,
                    color: T.dim, paddingTop: 4, textAlign: "right", lineHeight: 1.35,
                  }}
                >
                  {ceSoir && (
                    <div style={{ color: T.sodium, fontSize: 8, letterSpacing: ".1em" }}>CE SOIR</div>
                  )}
                  <div style={{ color: ceSoir ? T.sodium : T.chalk }}>{l.soir}</div>
                  <div style={{ fontSize: 8.5, opacity: .75 }}>→ {l.matin}</div>
                </div>
                <div
                  style={{
                    position: "relative", flex: 1, minHeight: 30, height: voies * hauteurVoie + 6,
                    borderTop: `1px solid ${ceSoir ? "rgba(242,206,107,.4)" : "rgba(239,243,234,.07)"}`,
                  }}
                >
                  {/* moitie soir / moitie nuit */}
                  <div
                    style={{
                      position: "absolute", left: 0, width: "50%", top: 0, bottom: 0,
                      background: "rgba(242,206,107,.045)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute", left: "50%", top: 0, bottom: 0, width: 1,
                      background: "rgba(242,206,107,.45)",
                    }}
                  />
                  {liste.map((m) => (
                    <Pastille
                      key={m.id}
                      m={{
                        ...m,
                        infobulle:
                          m.infobulle +
                          (m.coteDom != null && m.etat !== "Final"
                            ? `\nCote : ${Math.round(m.coteDom * 100)} % pour ${m.dom} (à domicile)`
                            : "") +
                          (suspense[m.id] != null
                            ? `\nSuspense : ${noteSuspense(suspense[m.id])}/10 — sans révéler le vainqueur`
                            : ""),
                      }}
                      spoilers={spoilers}
                      suivi={estSuivi(m)}
                      largeur={largeur}
                      hauteur={hauteurVoie}
                      note={suspense[m.id] != null ? noteSuspense(suspense[m.id]) : null}
                    />
                  ))}
                  {!liste.length && (
                    <div
                      style={{
                        fontFamily: FF_MONO, fontSize: 9, color: "rgba(147,166,151,.45)",
                        paddingTop: 8, paddingLeft: 4,
                      }}
                    >
                      aucun match
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <p
            style={{
              fontFamily: FF_MONO, fontSize: 10, color: T.dim, marginTop: 16, lineHeight: 1.7,
            }}
          >
            {total} match{total > 1 ? "s" : ""} sur {NB_NUITS} nuits — dont{" "}
            <span style={{ color: T.sodium }}>{soiree} en soirée</span>, avant minuit.
            <br />
            Chaque ligne est une nuit : elle court de 17h à 07h, minuit au centre. La zone claire
            à gauche est ce qui se regarde sans réveil. Survole une pastille pour le stade et les
            lanceurs annoncés.
            <br />
            <span style={{ color: T.sodium }}>◆</span> signale un match hors du stade habituel — dix
            par saison, dont Mexico, Las Vegas et le champ de maïs de l'Iowa.
            <br />
            Le filet sous les matchs à venir donne la cote : la part claire revient à l'équipe qui
            reçoit. Estimation à la louche, à partir des seuls bilans — elle sert surtout à repérer
            les affiches serrées.
            <br />
            « Jauger le suspense » note les matchs terminés de 1 à 10 selon l'ampleur des
            renversements. <strong>La note ne révèle pas le vainqueur</strong> : elle dit seulement
            si le replay vaut les deux heures.
          </p>
        </>
      )}
    </div>
  );
}

/* ================================================================== *
 *  COQUILLE : etat partage, onglets, chrome commun
 * ================================================================== */
export default function App() {
  const [onglet, setOnglet] = useState("carnet"); // carnet | nuits
  const [teams, setTeams] = useState([]);
  const [appris, setAppris] = useState([]);
  const [suivies, setSuivies] = useState([119]);
  const [resetArme, setResetArme] = useState(false);

  useEffect(() => {
    loadState().then((s) => {
      setAppris(s.appris || []);
      setSuivies(s.suivies || [119]);
    });
  }, []);

  // Bilans victoires/defaites : une seule requete pour les 30 equipes,
  // base de la cote de rencontre (log5).
  const [bilans, setBilans] = useState({});
  useEffect(() => {
    const saison = new Date().getFullYear();
    fetch(
      `${API}/standings?leagueId=103,104&season=${saison}&standingsTypes=regularSeason` +
        `&fields=records,teamRecords,team,id,wins,losses`
    )
      .then((r) => r.json())
      .then((d) => {
        const m = {};
        for (const rec of d.records || []) {
          for (const tr of rec.teamRecords || []) {
            const n = (tr.wins || 0) + (tr.losses || 0);
            if (n > 0) m[tr.team.id] = { v: tr.wins, d: tr.losses, pct: tr.wins / n };
          }
        }
        setBilans(m);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API}/teams?sportId=1&fields=teams,id,name,abbreviation,venue`)
      .then((r) => r.json())
      .then((d) => setTeams((d.teams || []).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  // Stade habituel de chaque franchise : sert a reperer les terrains neutres.
  const stadeHabituel = useMemo(
    () => Object.fromEntries(teams.filter((t) => t.venue?.id).map((t) => [t.id, t.venue.id])),
    [teams]
  );

  const majSuivies = (v) => {
    setSuivies(v);
    saveState({ suivies: v });
  };

  const vider = async () => {
    if (!resetArme) {
      setResetArme(true);
      return;
    }
    setAppris([]);
    await saveState({ appris: [] });
    setResetArme(false);
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;700;800&family=Spectral:ital,wght@0,300;0,400;0,600;1,400&family=Space+Mono:wght@400;700&display=swap');
    @keyframes trace { to { stroke-dashoffset: 0; } }
    @keyframes rise { from { opacity:0; transform: translateY(10px);} to {opacity:1; transform:none;} }
    @keyframes pulse { 0%,100%{opacity:.35} 50%{opacity:1} }
    .alm-rise { animation: rise 460ms cubic-bezier(.4,0,.2,1) both; }
    .alm-btn { transition: background-color .18s, color .18s, border-color .18s; }
    .alm-btn:focus-visible { outline: 2px solid ${T.sodium}; outline-offset: 3px; }
    .alm-cell:focus-visible { outline: 2px solid ${T.sodium}; outline-offset: 2px; }
    .alm-tab:focus-visible { outline: 2px solid ${T.sodium}; outline-offset: 3px; }
    select.alm-sel { -webkit-appearance:none; appearance:none; }
    @media (prefers-reduced-motion: reduce) {
      .alm-rise { animation: none; }
      svg line { animation: none !important; stroke-dashoffset: 0 !important; }
    }
  `;

  const mow = `repeating-linear-gradient(115deg, ${T.turf} 0 46px, ${T.turfLit} 46px 92px)`;

  const Onglet = ({ id, children }) => (
    <button
      className="alm-tab"
      onClick={() => setOnglet(id)}
      aria-current={onglet === id ? "page" : undefined}
      style={{
        all: "unset", cursor: "pointer",
        fontFamily: FF_DISPLAY, fontSize: 22, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: ".04em",
        padding: "8px 0", marginRight: 24,
        color: onglet === id ? T.chalk : "rgba(147,166,151,.7)",
        borderBottom: `2px solid ${onglet === id ? T.clay : "transparent"}`,
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{ background: mow, minHeight: "100%", color: T.chalk, fontFamily: FF_BODY }}>
      <style>{css}</style>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 56px" }}>

        <header
          style={{
            display: "flex", alignItems: "flex-end", justifyContent: "space-between",
            gap: 16, flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".22em",
                color: T.sodium, textTransform: "uppercase",
              }}
            >
              Carnet de marque
            </div>
            <h1
              style={{
                fontFamily: FF_DISPLAY, fontWeight: 800, fontSize: 42, lineHeight: .92,
                margin: "4px 0 0", letterSpacing: ".01em", textTransform: "uppercase",
              }}
            >
              L'almanach
            </h1>
          </div>
          <div style={{ textAlign: "right", fontFamily: FF_MONO, fontSize: 12, color: T.dim }}>
            <div style={{ color: T.chalk, fontSize: 20, fontWeight: 700 }}>
              {String(appris.length).padStart(2, "0")}
              <span style={{ color: T.dim, fontSize: 13 }}> / {CONCEPTS.length}</span>
            </div>
            <div style={{ fontSize: 10, letterSpacing: ".12em" }}>NOTIONS NOTÉES</div>
          </div>
        </header>

        <nav
          style={{
            display: "flex", alignItems: "center", flexWrap: "wrap",
            borderBottom: "1px solid rgba(239,243,234,.22)", margin: "16px 0 22px",
          }}
        >
          <Onglet id="carnet">Le carnet</Onglet>
          <Onglet id="nuits">Le programme</Onglet>
        </nav>

        {onglet === "carnet" ? (
          <VueAlmanach teams={teams} appris={appris} setAppris={setAppris} suivies={suivies} />
        ) : (
          <VueNuits
            teams={teams}
            suivies={suivies}
            setSuivies={majSuivies}
            stadeHabituel={stadeHabituel}
            bilans={bilans}
          />
        )}

        <footer
          style={{
            marginTop: 40, paddingTop: 14, borderTop: "1px solid rgba(239,243,234,.14)",
            fontFamily: FF_MONO, fontSize: 10, color: "rgba(147,166,151,.7)", lineHeight: 1.7,
          }}
        >
          {appris.length > 0 && (
            <>
              <button
                className="alm-btn"
                onClick={vider}
                onBlur={() => setResetArme(false)}
                style={{
                  all: "unset", cursor: "pointer", display: "inline-block",
                  fontFamily: FF_MONO, fontSize: 10, marginBottom: 12,
                  color: resetArme ? T.sodium : T.clay,
                  borderBottom: "1px solid currentColor",
                }}
              >
                {resetArme ? `Confirmer — effacer ${appris.length} notions` : "Vider le carnet"}
              </button>
              <br />
            </>
          )}
          Données : statsapi.mlb.com — usage personnel et éducatif. Horaires convertis en heure de Paris.
          <br />
          Les notions sont piochées dans le vrai déroulé du match ; les plus rares passent en premier,
          parce qu'un simple reviendra demain et pas un balk.
        </footer>
      </div>
    </div>
  );
}

function btnStyle(primaire) {
  return {
    fontFamily: FF_MONO, fontSize: 11.5, letterSpacing: ".1em", textTransform: "uppercase",
    padding: "11px 18px", cursor: "pointer", borderRadius: 2,
    border: `1px solid ${primaire ? T.clay : "rgba(239,243,234,.3)"}`,
    background: primaire ? T.clay : "transparent",
    color: primaire ? "#12241B" : T.chalk,
    fontWeight: 700,
  };
}
