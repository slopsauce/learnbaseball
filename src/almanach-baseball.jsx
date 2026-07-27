import React, { useState, useEffect, useMemo, useCallback } from "react";

/* ------------------------------------------------------------------ *
 *  ALMANACH DU CARNET DE MARQUE
 *  Une notion par nuit, tirée du vrai play-by-play (statsapi.mlb.com),
 *  illustrée par le clip officiel de l'action quand il existe.
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

/* ------------------------------------------------------------------ *
 *  LE CATALOGUE
 *  rarete : plus c'est haut, plus l'evenement est rare — donc plus il
 *  est prioritaire (un simple reviendra demain, pas un balk).
 *  legs   : segments du losange traces (1 = marbre>1er, 2 = 1er>2e ...)
 * ------------------------------------------------------------------ */
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
      "Le carnet distingue les deux façons de se faire retirer : « K » quand le frappeur s'est élancé, « Ʞ » à l'envers quand il a regardé passer. Cette convention date des années 1860 et n'a jamais bougé.",
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
async function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || { appris: [] };
  } catch {
    return { appris: [] };
  }
}
async function saveState(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
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

/* ------------------------------------------------------------------ *
 *  APP
 * ------------------------------------------------------------------ */
export default function Almanach() {
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState(119);
  const [game, setGame] = useState(null);
  const [sightings, setSightings] = useState([]);
  const [appris, setAppris] = useState([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState("load"); // load | ok | vide | erreur
  const [erreur, setErreur] = useState("");
  const [justInked, setJustInked] = useState(null);
  const [ouvertCarnet, setOuvertCarnet] = useState(false);
  const [resetArme, setResetArme] = useState(false);

  useEffect(() => {
    loadState().then((s) => setAppris(s.appris || []));
  }, []);

  useEffect(() => {
    fetch(`${API}/teams?sportId=1&fields=teams,id,name,abbreviation`)
      .then((r) => r.json())
      .then((d) => setTeams((d.teams || []).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  const charger = useCallback(async (tid) => {
    setPhase("load");
    setErreur("");
    try {
      const fin = new Date();
      const debut = new Date(Date.now() - 12 * 864e5);
      const sch = await fetch(
        `${API}/schedule?sportId=1&teamId=${tid}&startDate=${iso(debut)}&endDate=${iso(fin)}`
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
  const courant = liste[Math.min(idx, Math.max(liste.length - 1, 0))] || null;
  const concept = courant ? BY_ID[courant.conceptId] : null;
  const dejaVu = courant ? appris.includes(courant.conceptId) : false;

  const noter = async () => {
    if (!courant || dejaVu) return;
    const s = [...appris, courant.conceptId];
    setAppris(s);
    setJustInked(courant.conceptId);
    await saveState({ appris: s });
    setTimeout(() => setJustInked(null), 1400);
    // La notion notee sort de `nouveaux` : la liste retrecit et l'index
    // pointe naturellement sur la suivante. L'incrementer en sauterait une.
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
    select.alm-sel { -webkit-appearance:none; appearance:none; }
    @media (prefers-reduced-motion: reduce) {
      .alm-rise { animation: none; }
      svg line { animation: none !important; stroke-dashoffset: 0 !important; }
    }
  `;

  const mow = `repeating-linear-gradient(115deg, ${T.turf} 0 46px, ${T.turfLit} 46px 92px)`;

  return (
    <div style={{ background: mow, minHeight: "100%", color: T.chalk, fontFamily: FF_BODY }}>
      <style>{css}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 56px" }}>

        {/* ---------- bandeau ---------- */}
        <header
          style={{
            display: "flex", alignItems: "flex-end", justifyContent: "space-between",
            gap: 16, flexWrap: "wrap", borderBottom: `1px solid rgba(239,243,234,.22)`,
            paddingBottom: 12,
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

        {/* ---------- selecteur equipe ---------- */}
        <div style={{ margin: "14px 0 22px", display: "flex", alignItems: "center", gap: 10 }}>
          <label
            htmlFor="eq"
            style={{ fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".16em", color: T.dim }}
          >
            SUIVI DE
          </label>
          <select
            id="eq"
            className="alm-sel"
            value={teamId}
            onChange={(e) => setTeamId(Number(e.target.value))}
            style={{
              fontFamily: FF_MONO, fontSize: 12, color: T.chalk,
              background: "rgba(11,36,26,.7)", border: `1px solid rgba(239,243,234,.28)`,
              padding: "6px 10px", borderRadius: 2, cursor: "pointer",
            }}
          >
            {(teams.length ? teams : [{ id: 119, name: "Los Angeles Dodgers" }]).map((t) => (
              <option key={t.id} value={t.id} style={{ color: "#111" }}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* ---------- etats ---------- */}
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
          <article key={courant.conceptId} className="alm-rise">
            {/* en-tete match */}
            <div
              style={{
                fontFamily: FF_MONO, fontSize: 11, color: T.dim,
                letterSpacing: ".06em", marginBottom: 14,
              }}
            >
              {game.teams.away.team.name} {game.teams.away.score} — {game.teams.home.score}{" "}
              {game.teams.home.team.name}
              <span style={{ color: "rgba(147,166,151,.55)" }}> · {dateFR(game.gameDate)}</span>
            </div>

            {/* LA CASE */}
            <div
              style={{
                background: "rgba(11,36,26,.78)",
                border: `1px solid rgba(239,243,234,.2)`,
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
                  <p style={{ fontFamily: FF_MONO, fontSize: 10.5, color: T.dim, margin: "10px 0 0" }}>
                    {courant.frappeur} <span style={{ opacity: .5 }}>vs</span> {courant.lanceur}
                  </p>
                )}
              </div>
            </div>

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
                    background: "#000", border: `1px solid rgba(239,243,234,.2)`,
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

            {/* LA NOTION */}
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
                {p}
              </p>
            ))}

            <div style={{ borderLeft: `3px solid ${T.clay}`, paddingLeft: 14, margin: "22px 0 26px" }}>
              <div style={{ fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".18em", color: T.dim }}>
                À RETENIR
              </div>
              <p style={{ margin: "5px 0 0", fontSize: 16.5, lineHeight: 1.45 }}>{concept.retenir}</p>
            </div>

            {/* actions */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {!dejaVu ? (
                <button className="alm-btn" onClick={noter} style={btnStyle(true)}>
                  Noter dans le carnet
                </button>
              ) : (
                <span style={{ fontFamily: FF_MONO, fontSize: 11, color: T.sodium, letterSpacing: ".1em" }}>
                  ✓ DÉJÀ NOTÉE
                </span>
              )}
              {liste.length > 1 && (
                <button
                  className="alm-btn"
                  onClick={() => setIdx((idx + 1) % liste.length)}
                  style={btnStyle(false)}
                >
                  Une autre de cette nuit
                </button>
              )}
              <span style={{ fontFamily: FF_MONO, fontSize: 10.5, color: T.dim, marginLeft: "auto" }}>
                {nouveaux.length
                  ? `${nouveaux.length} notion${nouveaux.length > 1 ? "s" : ""} neuve${nouveaux.length > 1 ? "s" : ""} dans ce match`
                  : "tout ce match est déjà noté"}
              </span>
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
              gap: 10, width: "100%", borderTop: `1px solid rgba(239,243,234,.22)`,
              paddingTop: 14,
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
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                gap: 12,
              }}
            >
              {CONCEPTS.map((c) => {
                const vu = appris.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className="alm-cell"
                    tabIndex={0}
                    title={c.titre}
                    style={{
                      border: `1px solid rgba(239,243,234,${vu ? ".26" : ".1"})`,
                      background: vu ? "rgba(11,36,26,.6)" : "rgba(11,36,26,.28)",
                      borderRadius: 2, padding: "8px 6px 10px", textAlign: "center",
                      opacity: vu ? 1 : .45,
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
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer
          style={{
            marginTop: 40, paddingTop: 14, borderTop: `1px solid rgba(239,243,234,.14)`,
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
          Données : statsapi.mlb.com — usage personnel et éducatif.
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
