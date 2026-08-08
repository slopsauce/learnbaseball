/* ------------------------------------------------------------------ *
 *  TRADUCTION DU DEROULE
 *  L'API rend chaque action en anglais, dans une langue de marqueur
 *  officiel : « Mookie Betts singles on a sharp line drive to right
 *  fielder Juan Soto. Freddie Freeman scores. »
 *
 *  C'est la matiere premiere du carnet et du direct — donc la premiere
 *  chose que lit quelqu'un qui vient apprendre le baseball en francais.
 *  La laisser telle quelle revenait a dire « comprends d'abord, tu
 *  apprendras ensuite ».
 *
 *  CE N'EST PAS un traducteur general : c'est une grammaire fermee. Le
 *  marqueur ecrit avec un vocabulaire fini — une quinzaine de verbes,
 *  neuf positions, quatre types de contact, des propositions de coureurs
 *  toujours formees pareil. On les couvre, et on s'arrete la.
 *
 *  REGLE D'OR : rien de mi-anglais. Si une seule phrase resiste, on rend
 *  l'original entier plutot qu'un francais troue — un « retiré sur
 *  ground ball » est pire que la phrase anglaise, qui au moins est
 *  coherente. `complet` dit lequel des deux on tient.
 * ------------------------------------------------------------------ */

/* Les neuf positions, telles qu'elles se disent dans le carnet de marque.
   L'ordre compte : « first baseman » doit etre teste avant « first ». */
const POSTES = [
  ["designated hitter", "le frappeur désigné"],
  ["first baseman", "le premier-but"],
  ["second baseman", "le deuxième-but"],
  ["third baseman", "le troisième-but"],
  ["shortstop", "l'arrêt-court"],
  ["left fielder", "le voltigeur de gauche"],
  ["center fielder", "le voltigeur de centre"],
  ["right fielder", "le voltigeur de droite"],
  ["catcher", "le receveur"],
  ["pitcher", "le lanceur"],
];

/* Les postes portent leur article, ce qui impose de contracter : « relayant
   a le premier-but » n'est pas du francais. Deux formes suffisent. */
const au = (po) =>
  po.startsWith("le ") ? `au ${po.slice(3)}` : po.startsWith("les ") ? `aux ${po.slice(4)}` : `à ${po}`;
const du = (po) =>
  po.startsWith("le ") ? `du ${po.slice(3)}` : po.startsWith("les ") ? `des ${po.slice(4)}` : `de ${po}`;

/* Le type de contact : ce que la balle a fait, et c'est souvent tout ce
   qui distingue un coup sûr d'un retrait. */
const CONTACTS = [
  ["a sharp line drive", "un coup de ligne appuyé"],
  ["a soft line drive", "un coup de ligne mou"],
  ["a line drive", "un coup de ligne"],
  ["a sharp ground ball", "un roulant appuyé"],
  ["a soft ground ball", "un roulant mou"],
  ["a ground ball", "un roulant"],
  ["a bunt ground ball", "un amorti roulant"],
  ["a soft bunt ground ball", "un amorti roulant mou"],
  ["a sharp bunt ground ball", "un amorti roulant appuyé"],
  ["a bunt pop up", "un amorti en chandelle"],
  ["a fly ball", "un ballon"],
  ["a pop up", "une chandelle"],
  ["a bunt line drive", "un amorti de ligne"],
];

const BASES = { "1st": "1er", "2nd": "2e", "3rd": "3e", home: "marbre" };

/* Les zones du terrain, quand le marqueur nomme la zone et non le joueur. */
const ZONES = [
  ["left center field", "le champ gauche-centre"],
  ["right center field", "le champ droit-centre"],
  ["left field", "le champ gauche"],
  ["center field", "le champ centre"],
  ["right field", "le champ droit"],
  ["shallow infield", "l'avant-champ"],
  ["infield", "l'avant-champ"],
];

const echappe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* Un nom propre. Les classes `\w` et `[A-Z]` ne suffisent pas : un tiers
   des joueurs de la ligue porte un accent (Nuñez, Domínguez, Ramírez,
   José), et un `\w` les coupait en deux — ces actions repartaient en
   anglais sans qu'on sache pourquoi. On accepte donc la plage latine
   accentuee, les particules et les suffixes dynastiques. */
const LETTRE = "A-ZÀ-ÖØ-Þ";
const SUITE = "A-Za-zÀ-ÖØ-öø-ÿ'’.-";
const NOM =
  `([${LETTRE}][${SUITE}]*(?: (?:[${LETTRE}][${SUITE}]*|[a-z]['’][${LETTRE}][${SUITE}]*|de|del|la|los|van|der|y))*)`;

/* Le marqueur accroche au defenseur des queues de phrase qui ne changent pas
   la nature de l'action, seulement ses circonstances : une chandelle prise
   derriere les lignes, un ballon rabattu par un coequipier, la regle du
   ballon interieur. On les traite ici, une fois, plutot que de doubler
   chaque regle de frappe. */
const QUEUES = [
  [/ in foul territory$/, " en territoire de fausses balles"],
  [/ on the infield fly rule$/, " — ballon intérieur, le frappeur est retiré d'office"],
];

const poste = (s) => {
  let t = s.trim();
  let queue = "";
  // « , deflected by X » : la balle a touche un premier defenseur avant
  // d'etre jouee par un second.
  const devie = /^(.+), deflected by (.+)$/.exec(t);
  if (devie) {
    const second = poste(devie[2]);
    if (!second) return null;
    t = devie[1].trim();
    queue = `, après déviation ${du(second)}`;
  }
  for (const [motif, fr] of QUEUES) {
    if (motif.test(t)) {
      t = t.replace(motif, "");
      queue = fr + queue;
    }
  }
  for (const [en, fr] of POSTES) {
    const m = new RegExp(`^${echappe(en)} ${NOM}$`).exec(t);
    if (m) return `${fr} ${m[1]}${queue}`;
  }
  for (const [en, fr] of ZONES) if (t === en) return fr + queue;
  return null;
};

const contact = (s) => {
  for (const [en, fr] of CONTACTS) if (s.trim() === en) return fr;
  return null;
};

const base = (s) => BASES[s.trim()] || null;

/* Le rang d'un coup dans la saison : « (20) » devient « 20e ». */
const rang = (n) => (n ? ` (${n === "1" ? "1er" : `${n}e`})` : "");

/* ------------------------------------------------------------------ *
 *  LES REGLES
 *  Chacune reconnait UNE phrase entiere. L'ordre est celui de la
 *  lecture : les formes les plus longues d'abord, sinon « strikes out »
 *  avalerait « strikes out swinging ».
 * ------------------------------------------------------------------ */
const REGLES = [
  // --- retraits sur prises ------------------------------------------
  [/^N strikes out swinging$/, (n) => `${n} est retiré sur trois prises, en s'élançant`],
  [/^N strikes out on a foul tip$/, (n) => `${n} est retiré sur trois prises, sur une balle effleurée`],
  [/^N called out on strikes$/, (n) => `${n} est retiré sur trois prises, sans élancer`],
  [/^N strikes out on a missed bunt attempt$/, (n) => `${n} est retiré sur trois prises, sur un amorti manqué`],
  [/^N strikes out swinging, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} est retiré sur trois prises, ${a} relayant ${au(b)}` : null;
  }],

  // --- buts offerts --------------------------------------------------
  [/^N walks$/, (n) => `${n} obtient un but sur balles`],
  [/^N intentionally walks N$/, (n, b) => `${n} accorde un but sur balles intentionnel à ${b}`],
  [/^N hit by pitch$/, (n) => `${n} est atteint par le lancer`],

  // --- coups sûrs -----------------------------------------------------
  [/^N singles on (.+) to (.+)$/, (n, c, p) => {
    const ct = contact(c), po = poste(p);
    return ct && po ? `${n} réussit un simple sur ${ct} vers ${po}` : null;
  }],
  [/^N doubles(?: \((\d+)\))? on (.+) to (.+)$/, (n, r, c, p) => {
    const ct = contact(c), po = poste(p);
    return ct && po ? `${n} réussit un double${rang(r)} sur ${ct} vers ${po}` : null;
  }],
  [/^N triples(?: \((\d+)\))? on (.+) to (.+)$/, (n, r, c, p) => {
    const ct = contact(c), po = poste(p);
    return ct && po ? `${n} réussit un triple${rang(r)} sur ${ct} vers ${po}` : null;
  }],
  [/^N homers(?: \((\d+)\))? on (.+) to (.+)$/, (n, r, c, p) => {
    const ct = contact(c), po = poste(p);
    return ct && po ? `${n} frappe un circuit${rang(r)} sur ${ct} vers ${po}` : null;
  }],
  [/^N homers(?: \((\d+)\))? on (.+)$/, (n, r, c) => {
    const ct = contact(c);
    return ct ? `${n} frappe un circuit${rang(r)} sur ${ct}` : null;
  }],
  [/^N singles on (.+)$/, (n, c) => {
    const ct = contact(c);
    return ct ? `${n} réussit un simple sur ${ct}` : null;
  }],
  [/^N doubles(?: \((\d+)\))? on (.+)$/, (n, r, c) => {
    const ct = contact(c);
    return ct ? `${n} réussit un double${rang(r)} sur ${ct}` : null;
  }],

  // --- retraits sur balle en jeu ---------------------------------------
  [/^N grounds out(?: softly| sharply)?, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} est retiré au sol, ${a} relayant ${au(b)}` : null;
  }],
  [/^N grounds out(?: softly| sharply)? to (.+)$/, (n, p) => {
    const po = poste(p);
    return po ? `${n} est retiré au sol par ${po}` : null;
  }],
  [/^N flies out(?: sharply)? to (.+)$/, (n, p) => {
    const po = poste(p);
    return po ? `${n} est retiré sur un ballon capté par ${po}` : null;
  }],
  [/^N lines out(?: sharply| softly)? to (.+)$/, (n, p) => {
    const po = poste(p);
    return po ? `${n} est retiré sur un coup de ligne capté par ${po}` : null;
  }],
  [/^N pops out(?: softly| sharply)? to (.+)$/, (n, p) => {
    const po = poste(p);
    return po ? `${n} est retiré sur une chandelle captée par ${po}` : null;
  }],
  [/^N out on a sacrifice fly to (.+)$/, (n, p) => {
    const po = poste(p);
    return po ? `${n} est retiré sur un ballon-sacrifice vers ${po}` : null;
  }],
  [/^N out on a sacrifice bunt, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} est retiré sur un amorti-sacrifice, ${a} relayant ${au(b)}` : null;
  }],

  // --- jeux forcés et doubles jeux --------------------------------------
  [/^N grounds into a double play, (.+) to (.+) to (.+)$/, (n, p1, p2, p3) => {
    const a = poste(p1), b = poste(p2), c = poste(p3);
    return a && b && c ? `${n} frappe dans un double jeu, ${a} ${au(b)} ${au(c)}` : null;
  }],
  [/^N grounds into a double play, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} frappe dans un double jeu, ${a} ${au(b)}` : null;
  }],
  [/^N grounds into a force out, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} frappe dans un retrait forcé, ${a} relayant ${au(b)}` : null;
  }],
  [/^N grounds into a fielders choice out, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} frappe dans un choix du défenseur, ${a} relayant ${au(b)}` : null;
  }],
  [/^N reaches on a fielding error by (.+)$/, (n, p) => {
    const po = poste(p);
    return po ? `${n} atteint le but sur une erreur ${du(po)}` : null;
  }],
  [/^N reaches on a throwing error by (.+)$/, (n, p) => {
    const po = poste(p);
    return po ? `${n} atteint le but sur un mauvais relais ${du(po)}` : null;
  }],

  [/^N ground bunts into a force out, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} amortit au sol dans un retrait forcé, ${a} relayant ${au(b)}` : null;
  }],
  [/^N bunt grounds out(?: softly| sharply)?, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} est retiré sur un amorti roulant, ${a} relayant ${au(b)}` : null;
  }],
  [/^N bunt pops into a double play, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} amortit en chandelle, transformée en double jeu, ${a} ${au(b)}` : null;
  }],
  [/^N reaches on a fielder's choice, fielded by (.+)$/, (n, p) => {
    const po = poste(p);
    return po ? `${n} atteint le but sur un choix du défenseur, joué par ${po}` : null;
  }],
  [/^N grounds into an unassisted double play, (.+)$/, (n, p) => {
    const po = poste(p);
    return po ? `${n} frappe dans un double jeu sans aide, réussi par ${po}` : null;
  }],
  [/^N grounds into a force out, fielded by (.+)$/, (n, p) => {
    const po = poste(p);
    return po ? `${n} frappe dans un retrait forcé, sur un jeu ${du(po)}` : null;
  }],
  [/^N reaches on a fielder's choice out, (.+) to (.+) to (.+)$/, (n, p1, p2, p3) => {
    const a = poste(p1), b = poste(p2), c = poste(p3);
    return a && b && c ? `${n} atteint le but sur un choix du défenseur, ${a} ${au(b)} ${au(c)}` : null;
  }],
  [/^N reaches on a fielder's choice out, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} atteint le but sur un choix du défenseur, ${a} relayant ${au(b)}` : null;
  }],
  [/^N hits a grand slam(?: \((\d+)\))? to (.+)$/, (n, r, z) => {
    const po = poste(z);
    return po ? `${n} frappe un grand chelem${rang(r)} vers ${po}` : null;
  }],
  [/^Throwing error by (.+)$/, (p) => {
    const po = poste(p);
    return po ? `Mauvais relais ${du(po)}` : null;
  }],
  [/^Fielding error by (.+)$/, (p) => {
    const po = poste(p);
    return po ? `Erreur ${du(po)}` : null;
  }],

  // --- coureurs ---------------------------------------------------------
  [/^N to (1st|2nd|3rd)$/, (n, b) => `${n} passe au ${base(b)}`],
  [/^N scores$/, (n) => `${n} marque`],
  [/^N out at (1st|2nd|3rd|home) on the throw, (.+) to (.+)$/, (n, b, p1, p2) => {
    const a = poste(p1), c = poste(p2);
    return a && c
      ? `${n} est retiré ${b === "home" ? "au marbre" : `au ${base(b)}`} sur le relais, ${a} ${au(c)}`
      : null;
  }],
  [/^N advances to (1st|2nd|3rd), on a throwing error by (.+)$/, (n, b, p) => {
    const po = poste(p);
    return po ? `${n} avance au ${base(b)} sur un mauvais relais ${du(po)}` : null;
  }],
  [/^N advances to (1st|2nd|3rd), on a fielding error by (.+)$/, (n, b, p) => {
    const po = poste(p);
    return po ? `${n} avance au ${base(b)} sur une erreur ${du(po)}` : null;
  }],
  [/^N pops into a double play, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} frappe une chandelle transformée en double jeu, ${a} ${au(b)}` : null;
  }],
  [/^N lines into a double play, (.+) to (.+)$/, (n, p1, p2) => {
    const a = poste(p1), b = poste(p2);
    return a && b ? `${n} frappe un coup de ligne transformé en double jeu, ${a} ${au(b)}` : null;
  }],
  [/^N out at (1st|2nd|3rd|home)$/, (n, b) =>
    `${n} est retiré ${b === "home" ? "au marbre" : `au ${base(b)}`}`],
  [/^N steals(?: \((\d+)\))? (1st|2nd|3rd|home) base$/, (n, r, b) =>
    `${n} vole le ${base(b)}${rang(r)}`],
  [/^N caught stealing (1st|2nd|3rd|home) base, (.+) to (.+)$/, (n, b, p1, p2) => {
    const a = poste(p1), c = poste(p2);
    return a && c ? `${n} est surpris en vol du ${base(b)}, ${a} relayant ${au(c)}` : null;
  }],
  [/^N picks off N at (1st|2nd|3rd) base$/, (n, x, b) => `${n} surprend ${x} au ${base(b)}`],
  [/^(.+) picks off N at (1st|2nd|3rd) on throw to (.+)$/, (p, x, b, p2) => {
    const a = poste(p), c = poste(p2);
    return a && c ? `${a} surprend ${x} au ${base(b)}, sur un relais ${au(c)}` : null;
  }],

  // --- incidents de lancer ------------------------------------------------
  [/^Wild pitch by (.+)$/, (p) => {
    const po = poste(p);
    return po ? `Mauvais lancer ${du(po)}` : null;
  }],
  [/^Passed ball by (.+)$/, (p) => {
    const po = poste(p);
    return po ? `Balle passée ${du(po)}` : null;
  }],
  [/^Balk by (.+)$/, (p) => {
    const po = poste(p);
    return po ? `Feinte irrégulière ${du(po)}` : null;
  }],
  [/^Catcher interference by (.+)$/, (p) => {
    const po = poste(p);
    return po ? `Obstruction ${du(po)}` : null;
  }],

  // --- intendance ---------------------------------------------------------
  [/^Pitching Change: N replaces N(?:, batting \w+)?$/, (n, b) =>
    `Changement de lanceur : ${n} remplace ${b}`],
  [/^Mound Visit$/, () => "Visite au monticule"],
  [/^Status Change - (.+)$/, (s) => `Changement de statut — ${s}`],
];

/* Les entetes de contestation vidéo, qui se collent devant une phrase
   ordinaire : « X challenged (pitch result), call on the field was
   confirmed: Y called out on strikes. » */
const CONTESTATIONS = [
  [/^(.+) challenged \(([^)]+)\), call on the field was confirmed: (.+)$/,
    (qui, quoi, suite) => [`Contestation de ${qui} (${quoi}) : décision confirmée`, suite]],
  [/^(.+) challenged \(([^)]+)\), call on the field was overturned: (.+)$/,
    (qui, quoi, suite) => [`Contestation de ${qui} (${quoi}) : décision infirmée`, suite]],
  [/^(.+) challenged \(([^)]+)\), call on the field was upheld: (.+)$/,
    (qui, quoi, suite) => [`Contestation de ${qui} (${quoi}) : décision maintenue`, suite]],
];

const MOTIFS = { "pitch result": "résultat du lancer", "tag play": "jeu au toucher",
  "force play": "jeu forcé", "hit by pitch": "atteint par le lancer",
  "catch play": "capture", "fair/foul": "balle bonne ou fausse" };

/* Une phrase, sans le point final. */
function traduirePhrase(p) {
  const t = p.trim();
  if (!t) return null;
  for (const [motif, faire] of REGLES) {
    // Le motif est ecrit avec « N » pour un nom propre : on le developpe ici
    // plutot que de repeter l'expression a chaque regle.
    const re = new RegExp(motif.source.replaceAll("N", NOM));
    const m = re.exec(t);
    if (m) {
      const r = faire(...m.slice(1));
      if (r) return r;
    }
  }
  return null;
}

/* Le point d'entree. Rend `{ fr, complet }` : `complet` est faux des qu'une
   phrase a resiste, auquel cas `fr` vaut l'original — jamais de moitie-moitie. */
export function traduireAction(txt) {
  const brut = String(txt || "").trim();
  if (!brut) return { fr: "", complet: true };

  let entete = null;
  let corps = brut;
  for (const [motif, faire] of CONTESTATIONS) {
    const m = motif.exec(brut);
    if (m) {
      const [e, suite] = faire(m[1], MOTIFS[m[2]] || m[2], m[3]);
      entete = e;
      corps = suite;
      break;
    }
  }

  // Le marqueur separe ses propositions par des points, sans jamais mettre
  // de point a l'interieur d'un nom — sauf « Jr. », qu'on protege.
  const phrases = corps
    .replace(/\b(Jr|Sr|St)\./g, "$1§")
    // Les initiales — « A.J. Ewing », « J.P. Crawford » — portent des points
    // qui ne terminent rien. Un point suivi d'une capitale a l'interieur d'un
    // nom n'est jamais une fin de phrase dans cette grammaire.
    .replace(/\b([A-Z])\.(?=\s?[A-Z])/g, "$1§")
    .split(/\.\s*/)
    .map((x) => x.replace(/§/g, ".").trim())
    .filter(Boolean);

  const out = [];
  for (const p of phrases) {
    const r = traduirePhrase(p);
    if (r) {
      out.push(r);
      continue;
    }
    /* « Jr. » est a la fois un suffixe de nom et un point final : dans
       « ...first baseman Vladimir Guerrero Jr. Yordan Alvarez to 2nd », le
       meme point termine une phrase. On le protege d'abord — c'est le cas
       le plus frequent — et on ne tente la coupure que si la phrase entiere
       a echoue. Aucune des deux lectures n'est devinable sans essayer. */
    const morceaux = p.split(/(?<=\b(?:Jr|Sr)\.)\s+/).filter(Boolean);
    if (morceaux.length > 1) {
      const t = morceaux.map(traduirePhrase);
      if (t.every(Boolean)) {
        out.push(...t);
        continue;
      }
    }
    return { fr: brut, complet: false };
  }
  const fr = (entete ? `${entete} — ` : "") + out.join(". ") + ".";
  return { fr, complet: true };
}
