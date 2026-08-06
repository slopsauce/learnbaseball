import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as A from "../.test-bundle.mjs";

describe("nuitDe — decoupage en nuits parisiennes", () => {
  test("un match du soir americain bascule au petit matin a Paris", () => {
    // 19h10 a New York le 26 juillet = 01h10 a Paris le 27
    const r = A.nuitDe("2026-07-26T23:10:00Z");
    assert.equal(r.hhmm, "01:10");
    assert.equal(r.jour, "2026-07-26", "doit appartenir a la nuit du 26, pas du 27");
    assert.ok(r.h > 24 && r.h < 26, `heure etendue attendue >24, obtenue ${r.h}`);
  });

  test("un match de jour americain reste dans la soiree du meme jour", () => {
    const r = A.nuitDe("2026-07-26T17:35:00Z"); // 19h35 a Paris
    assert.equal(r.hhmm, "19:35");
    assert.equal(r.jour, "2026-07-26");
    assert.ok(r.h > 19 && r.h < 20);
  });

  test("l'heure etendue reste dans la plage exploitable", () => {
    // Valeurs en dur : se referer a A.AUBE rendrait le test tautologique,
    // il suivrait la constante au lieu de verifier le comportement voulu.
    for (let i = 0; i < 24 * 4; i++) {
      const d = new Date(Date.UTC(2026, 6, 26, 0, 15 * i));
      const { h } = A.nuitDe(d.toISOString());
      assert.ok(h >= 7 && h < 31, `h=${h} hors de la plage 7h-31h`);
    }
  });

  test("une nuit court jusqu'a 7h du matin, pas avant", () => {
    // 04h00 a Paris appartient encore a la nuit de la veille.
    const tot = A.nuitDe("2026-07-27T02:00:00Z"); // 04h00 heure de Paris
    assert.equal(tot.hhmm, "04:00");
    assert.equal(tot.jour, "2026-07-26", "04h doit rester dans la nuit du 26");
    assert.ok(tot.h > 24, "04h doit etre compte au-dela de minuit");

    // 08h00 a Paris ouvre bien la nuit du jour meme.
    const tard = A.nuitDe("2026-07-27T06:00:00Z");
    assert.equal(tard.jour, "2026-07-27", "08h appartient au jour courant");
    assert.ok(tard.h < 24);
  });

  test("resiste au changement d'heure d'ete", () => {
    // Nuit du 28 au 29 mars 2026 : la France passe de UTC+1 a UTC+2
    for (const iso of ["2026-03-28T23:10:00Z", "2026-03-29T01:10:00Z", "2026-10-25T01:10:00Z"]) {
      const r = A.nuitDe(iso);
      assert.match(r.jour, /^\d{4}-\d{2}-\d{2}$/, `jour malforme pour ${iso}`);
      assert.ok(Number.isFinite(r.h));
    }
  });
});

describe("decalerJour", () => {
  test("franchit les fins de mois", () => {
    assert.equal(A.decalerJour("2026-07-31", 1), "2026-08-01");
    assert.equal(A.decalerJour("2026-03-01", -1), "2026-02-28");
  });
  test("franchit le changement d'heure sans deriver", () => {
    // Le passage a l'heure d'ete ne doit pas faire perdre ou gagner un jour.
    assert.equal(A.decalerJour("2026-03-28", 1), "2026-03-29");
    assert.equal(A.decalerJour("2026-10-24", 1), "2026-10-25");
  });
  test("est reversible", () => {
    for (const d of ["2026-01-01", "2026-06-15", "2026-12-31"])
      assert.equal(A.decalerJour(A.decalerJour(d, 7), -7), d);
  });
});

describe("libelleNuit — une nuit couvre toujours deux dates", () => {
  test("renvoie la soiree et le lendemain matin", () => {
    const l = A.libelleNuit("2026-07-28");
    assert.ok(l.soir && l.matin);
    assert.notEqual(l.soir, l.matin, "les deux dates doivent differer");
  });
});

describe("coteDomicile — log5 avec avantage du terrain", () => {
  test("deux equipes egales donnent l'avantage a celle qui recoit", () => {
    const p = A.coteDomicile(0.5, 0.5);
    assert.ok(p > 0.52 && p < 0.56, `attendu ~0,54 obtenu ${p}`);
  });
  test("est monotone en la qualite de l'equipe a domicile", () => {
    let prec = 0;
    for (const pct of [0.35, 0.45, 0.5, 0.6, 0.7]) {
      const p = A.coteDomicile(pct, 0.5);
      assert.ok(p > prec, "la cote doit croitre avec le niveau du receveur");
      prec = p;
    }
  });
  test("reste bornee et ne renvoie jamais NaN", () => {
    for (const a of [0, 0.001, 0.5, 0.999, 1])
      for (const b of [0, 0.001, 0.5, 0.999, 1]) {
        const p = A.coteDomicile(a, b);
        assert.ok(Number.isFinite(p) && p > 0 && p < 1, `p=${p} pour ${a}/${b}`);
      }
  });
  test("renvoie null si un bilan manque", () => {
    assert.equal(A.coteDomicile(null, 0.5), null);
    assert.equal(A.coteDomicile(0.5, undefined), null);
  });
});

describe("noteSuspense", () => {
  test("borne la note entre 1 et 10", () => {
    for (const v of [0, 50, 211, 400, 9999]) {
      const n = A.noteSuspense(v);
      assert.ok(n >= 1 && n <= 10, `note ${n} hors bornes pour ${v}`);
    }
  });
  test("est croissante", () => {
    let prec = 0;
    for (const v of [0, 100, 180, 250, 350, 999]) {
      const n = A.noteSuspense(v);
      assert.ok(n >= prec);
      prec = n;
    }
  });
  test("place le match median au milieu de l'echelle", () => {
    const n = A.noteSuspense(211); // mediane mesuree sur 34 matchs
    assert.ok(n >= 4 && n <= 7, `mediane notee ${n}/10, echelle mal calibree`);
  });
});

/* Fabrique un match minimal pour les tests de selection. */
const match = (o = {}) => ({
  id: 1, nuit: "2026-07-28", h: 20, hhmm: "20:00", idExt: 147, idDom: 119,
  ext: "NYY", dom: "LAD", etat: "Preview", coteDom: 0.55,
  matchSerie: 1, totalSerie: 3, derby: false, neutre: false, stade: "Dodger Stadium",
  ...o,
});

describe("indiceEnvie", () => {
  test("ecarte les matchs deja joues", () => {
    assert.ok(A.indiceEnvie(match({ etat: "Final" }), {}) < 0);
  });
  test("prefere la soiree a la pleine nuit, toutes choses egales", () => {
    const soir = A.indiceEnvie(match({ h: 20 }), {});
    const nuit = A.indiceEnvie(match({ h: 27 }), {});
    assert.ok(soir > nuit, "un match de 20h doit primer sur un de 3h");
  });
  test("un match de pleine nuit ne peut pas rivaliser avec une soiree", () => {
    // Heures en dur : se referer a A.LIMITE_TENABLE suivrait la constante
    // et le test ne pourrait plus jamais echouer.
    const soir = A.indiceEnvie(match({ h: 20 }), {});
    const limite = A.indiceEnvie(match({ h: 25.5 }), {});   // 01h30
    const creuse = A.indiceEnvie(match({ h: 27 }), {});     // 03h00
    assert.ok(soir > limite, "20h doit primer sur 01h30");
    assert.ok(limite > creuse, "01h30 doit primer sur 03h00");
    assert.equal(A.indiceEnvie(match({ h: 29 }), {}), A.indiceEnvie(match({ h: 30 }), {}),
      "au-dela d'une certaine heure, tout se vaut : plus personne ne regarde");
  });

  test("la tolerance horaire reste dans des bornes credibles", () => {
    // Un garde-fou sur la constante elle-meme : entre minuit et 3h du matin.
    assert.ok(A.LIMITE_TENABLE > 24 && A.LIMITE_TENABLE <= 27,
      `LIMITE_TENABLE = ${A.LIMITE_TENABLE}, valeur invraisemblable`);
    const r = A.raisonEnvie(match({ h: 27, coteDom: 0.72 }), {}, {}, {});
    assert.doesNotMatch(r, /tenable/, "03h du matin ne doit jamais etre dit tenable");
  });
  test("reste dans une plage exploitable", () => {
    for (const h of [18, 20, 23.9, 24.5, 25.7, 26, 30])
      for (const derby of [true, false]) {
        const s = A.indiceEnvie(match({ h, derby }), {});
        assert.ok(s >= 0 && s <= 1.2, `indice ${s} hors plage`);
      }
  });
});

describe("raisonEnvie — ne doit jamais contredire l'en-tete", () => {
  test("ne renvoie jamais une chaine vide", () => {
    for (const h of [18, 20, 23.9, 24.5, 25.7, 27, 30]) {
      const r = A.raisonEnvie(match({ h }), {}, {}, {});
      assert.ok(r && r.length > 3, `raison vide pour h=${h}`);
    }
  });

  /* Regression : une carte de soiree affichait « en pleine nuit ». */
  test("un match de soiree ne parle jamais de pleine nuit", () => {
    for (const h of [17.5, 18, 19.6, 21, 23.9])
      for (const cote of [0.5, 0.72, 0.9]) {
        const r = A.raisonEnvie(match({ h, coteDom: cote }), {}, {}, {});
        assert.doesNotMatch(r, /pleine nuit/, `h=${h} cote=${cote} -> "${r}"`);
      }
  });

  test("un match nocturne ne promet jamais l'absence de reveil", () => {
    for (const h of [26, 27, 29]) {
      const r = A.raisonEnvie(match({ h, coteDom: 0.72 }), {}, {}, {});
      assert.doesNotMatch(r, /sans réveil|regardable, tout simplement/, `h=${h} -> "${r}"`);
    }
  });
});

describe("repartirEnVoies — aucune pastille ne doit en recouvrir une autre", () => {
  test("respecte l'ecart minimal dans chaque voie", () => {
    for (const largeur of [0.05, 0.115, 0.2, 0.35]) {
      const ms = Array.from({ length: 40 }, (_, i) => ({ pct: (i % 9) * 0.02 + 0.1 }));
      ms.sort((a, b) => a.pct - b.pct);
      A.repartirEnVoies(ms, largeur);
      const parVoie = {};
      for (const m of ms) (parVoie[m.voie] ??= []).push(m.pct);
      for (const [v, l] of Object.entries(parVoie)) {
        const tri = l.slice().sort((a, b) => a - b);
        for (let i = 1; i < tri.length; i++)
          assert.ok(tri[i] - tri[i - 1] >= largeur - 1e-9,
            `chevauchement voie ${v} : ${tri[i - 1]} et ${tri[i]} (largeur ${largeur})`);
      }
    }
  });
  test("renvoie au moins une voie, meme sans match", () => {
    assert.ok(A.repartirEnVoies([], 0.1) >= 1);
  });
});

describe("classifyFieldOut", () => {
  test("distingue les quatre trajectoires", () => {
    assert.equal(A.classifyFieldOut("Mookie Betts grounds out to shortstop."), "ground_out");
    assert.equal(A.classifyFieldOut("Freddie Freeman flies out to center field."), "fly_out");
    assert.equal(A.classifyFieldOut("Will Smith lines out to second baseman."), "line_out");
    assert.equal(A.classifyFieldOut("Max Muncy pops out to first."), "pop_out");
  });
  test("retombe sur une valeur connue face a l'inattendu", () => {
    const r = A.classifyFieldOut("something entirely unexpected");
    assert.ok(A.BY_ID[r], "le repli doit designer un concept existant");
  });
});

describe("indexerClips", () => {
  const contenu = (items) => ({ highlights: { highlights: { items } } });
  test("indexe par guid, qui est le playId", () => {
    const m = A.indexerClips(contenu([
      { guid: "abc", playbacks: [{ name: "mp4Avc", url: "http://x/a.mp4" }], image: { cuts: [{ width: 1280, src: "p.jpg" }] } },
    ]));
    assert.equal(m.get("abc").url, "http://x/a.mp4");
    assert.equal(m.get("abc").poster, "p.jpg");
  });
  test("ignore les clips sans guid (resumes, compilations)", () => {
    const m = A.indexerClips(contenu([{ playbacks: [{ name: "mp4Avc", url: "u" }] }]));
    assert.equal(m.size, 0);
  });
  test("ne casse pas sur une reponse absente", () => {
    assert.equal(A.indexerClips(null).size, 0);
    assert.equal(A.indexerClips({}).size, 0);
  });
});

describe("detectSightings", () => {
  const action = (eventType, description, extra = {}) => ({
    result: { eventType, description, rbi: 0 },
    about: { inning: 3, halfInning: "top" },
    matchup: { batter: { id: 1, fullName: "A" }, pitcher: { id: 2, fullName: "B" } },
    playEvents: [],
    ...extra,
  });

  test("reconnait les issues de presence au baton", () => {
    const v = A.detectSightings([
      action("home_run", "hits a home run"),
      action("walk", "walks"),
      action("field_out", "grounds out to short"),
    ]);
    const ids = v.map((x) => x.conceptId);
    assert.ok(ids.includes("home_run") && ids.includes("walk") && ids.includes("ground_out"));
  });

  test("detecte le grand chelem en plus du circuit", () => {
    const p = action("home_run", "grand slam");
    p.result.rbi = 4;
    const ids = A.detectSightings([p]).map((x) => x.conceptId);
    assert.ok(ids.includes("grand_slam") && ids.includes("home_run"));
  });

  test("repere les actions de course cachees dans playEvents", () => {
    const p = action("strikeout", "strikes out", {
      playEvents: [{ type: "action", details: { eventType: "stolen_base_2b", description: "steals 2nd" } }],
    });
    const ids = A.detectSightings([p]).map((x) => x.conceptId);
    assert.ok(ids.includes("stolen_base_2b"), "le vol de base doit etre vu");
  });

  test("prefere l'occurrence filmee quand une notion revient", () => {
    const clips = new Map([["PID", { url: "u", titre: "t" }]]);
    const sans = action("strikeout", "premier retrait");
    const avec = action("strikeout", "second retrait");
    avec.playEvents = [{ isPitch: true, playId: "PID", count: { balls: 0, strikes: 0 } }];
    const v = A.detectSightings([sans, avec], clips);
    const k = v.find((x) => x.conceptId === "strikeout");
    assert.ok(k.clip, "l'occurrence retenue doit etre celle qui a une video");
    assert.equal(k.description, "second retrait");
  });

  test("chaque notion detectee existe au catalogue", () => {
    const v = A.detectSightings([action("field_error", "reaches on error")]);
    for (const s of v) assert.ok(A.BY_ID[s.conceptId], `concept inconnu : ${s.conceptId}`);
  });

  test("ne casse pas sur une liste vide ou malformee", () => {
    assert.deepEqual(A.detectSightings([]), []);
    assert.doesNotThrow(() => A.detectSightings([{}]));
  });
});

describe("anecdote", () => {
  const stades = { 9: { alt: 5190, centre: 415, places: 50144, toit: "Open", lat: 39.7, lon: -104.9 } };
  test("est stable : un meme match donne toujours le meme texte", () => {
    const m = match({ id: 42, idStade: 9 });
    const a = A.anecdote(m, stades, {});
    assert.equal(a, A.anecdote(m, stades, {}));
  });
  test("signale l'altitude quand elle est remarquable", () => {
    const textes = new Set();
    for (let i = 0; i < 10; i++) textes.add(A.anecdote(match({ id: i, idStade: 9 }), stades, {}));
    assert.ok([...textes].some((x) => /altitude/.test(x)), "Coors Field doit citer son altitude");
  });
  test("renvoie null faute de donnees", () => {
    assert.equal(A.anecdote(match({ idStade: 999 }), {}, {}), null);
  });
});

describe("blagueDeNoms", () => {
  test("reconnait les affiches prevues, dans les deux sens", () => {
    assert.match(A.blagueDeNoms(110, 141), /oiseaux/);
    assert.match(A.blagueDeNoms(141, 110), /oiseaux/);
    assert.match(A.blagueDeNoms(119, 137), /rivalité/);
  });
  /* Regression : identifiants et textes vivaient dans deux tables desynchronisees. */
  test("chaque affiche declaree renvoie bien un texte", () => {
    for (const [a, b] of [[110, 141], [116, 112], [134, 136], [111, 145], [117, 108], [139, 146], [113, 111], [119, 137], [147, 111]]) {
      const r = A.blagueDeNoms(a, b);
      assert.ok(typeof r === "string" && r.length > 5, `texte manquant pour ${a} contre ${b}`);
    }
  });
  test("renvoie null pour une affiche ordinaire", () => {
    assert.equal(A.blagueDeNoms(120, 115), null);
  });
});

describe("catalogue des notions", () => {
  test("les identifiants sont uniques", () => {
    const ids = A.CONCEPTS.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });
  test("chaque notion est complete", () => {
    for (const c of A.CONCEPTS) {
      assert.ok(c.titre && c.gist && c.retenir, `champs manquants : ${c.id}`);
      assert.ok(Array.isArray(c.corps) && c.corps.length >= 1, `corps vide : ${c.id}`);
      assert.ok(Number.isFinite(c.rarete), `rarete absente : ${c.id}`);
      assert.ok(Array.isArray(c.legs), `legs absent : ${c.id}`);
      for (const n of c.legs) assert.ok(n >= 1 && n <= 4, `segment invalide dans ${c.id}`);
    }
  });
  test("le marqueur du K inverse est rendu, jamais affiche brut", () => {
    const brut = A.CONCEPTS.filter((c) => c.corps.some((p) => p.includes("{{K}}")));
    assert.ok(brut.length >= 1, "le marqueur doit exister quelque part");
    for (const c of brut) {
      const rendu = A.texteAvecKInverse(c.corps.find((p) => p.includes("{{K}}")));
      assert.ok(Array.isArray(rendu), "le rendu doit produire des elements React");
      assert.ok(rendu.length > 1, "le marqueur doit avoir ete decoupe");
    }
  });
  test("aucun caractere absent des polices courantes", () => {
    const interdits = /[\uA7B0]/; // K culbute : absent de presque toutes les polices
    for (const c of A.CONCEPTS)
      for (const p of [...c.corps, c.titre, c.gist, c.retenir])
        assert.doesNotMatch(p, interdits, `caractere non rendu dans ${c.id}`);
  });
});

describe("helpers d'affichage", () => {
  test("ordinal supporte l'absence de valeur", () => {
    assert.equal(A.ordinal(1), "1re");
    assert.equal(A.ordinal(6), "6e");
    assert.equal(A.ordinal(undefined), "?");
  });
  test("DIVISION_FR traduit sans laisser d'anglais", () => {
    assert.equal(A.DIVISION_FR("National League West"), "NL Ouest");
    assert.equal(A.DIVISION_FR("American League Central"), "AL Centre");
  });
  test("couleurEra distingue les trois regimes", () => {
    assert.notEqual(A.couleurEra("2.10"), A.couleurEra("6.50"));
    assert.ok(A.couleurEra("abc"), "une valeur illisible ne doit pas casser");
  });
  test("distanceKm est plausible et symetrique", () => {
    const ny = { lat: 40.83, lon: -73.93 }, la = { lat: 34.07, lon: -118.24 };
    const d = A.distanceKm(ny, la);
    assert.ok(d > 3800 && d < 4200, `New York-Los Angeles = ${d} km, attendu ~3940`);
    assert.equal(d, A.distanceKm(la, ny));
    assert.equal(A.distanceKm(null, la), null);
  });
});

describe("adressage par fragment d'URL", () => {
  test("les alias du programme mènent tous à la bonne vue", () => {
    for (const h of ["#programme", "#nuits", "#calendrier", "programme", "#/programme", "#PROGRAMME", "#Programme"])
      assert.equal(A.ongletDepuisFragment(h), "nuits", `alias non reconnu : ${h}`);
  });
  test("les alias du carnet aussi", () => {
    for (const h of ["#carnet", "#almanach", "#notions", "#/carnet"])
      assert.equal(A.ongletDepuisFragment(h), "carnet", `alias non reconnu : ${h}`);
  });
  test("les alias des équipes aussi", () => {
    for (const h of ["#equipes", "#equipe", "#effectif", "#roster", "#joueurs", "#/equipes", "#EQUIPES"])
      assert.equal(A.ongletDepuisFragment(h), "equipes", `alias non reconnu : ${h}`);
  });
  test("un fragment absent ou farfelu retombe sur le carnet", () => {
    for (const h of ["", "#", null, undefined, "#nawak", "#../../etc/passwd", "#<script>"])
      assert.equal(A.ongletDepuisFragment(h), "carnet", `repli manquant pour ${JSON.stringify(h)}`);
  });
  test("ne renvoie jamais autre chose qu'un onglet connu", () => {
    for (const h of ["#a", "#programme", "#carnet", "#123", "#%20"])
      assert.ok(["carnet", "nuits"].includes(A.ongletDepuisFragment(h)));
  });
});

describe("le match du jour", () => {
  const T0 = Date.parse("2026-07-28T12:00:00Z");
  const h = (n) => new Date(T0 + n * 3600e3).toISOString();
  const jeu = [
    { ...match({ id: 1, nuit: "2026-07-27", h: 20 }), debut: h(-24) }, // passe
    { ...match({ id: 2, nuit: "2026-07-28", h: 27, hhmm: "03:00" }), debut: h(15) },
    { ...match({ id: 3, nuit: "2026-07-28", h: 20, hhmm: "20:00" }), debut: h(8) },
    { ...match({ id: 4, nuit: "2026-07-30", h: 20 }), debut: h(56) },
  ];

  test("ignore les matchs deja commences", () => {
    const m = A.choisirMatchDuJour(jeu, {}, T0);
    assert.notEqual(m.id, 1, "un match passe ne peut pas etre celui du jour");
  });
  test("choisit dans la nuit la plus proche, pas la meilleure du mois", () => {
    const m = A.choisirMatchDuJour(jeu, {}, T0);
    assert.equal(m.nuit, "2026-07-28", "doit rester sur la prochaine nuit disponible");
  });
  test("dans cette nuit, prefere le match le plus tentant", () => {
    const m = A.choisirMatchDuJour(jeu, {}, T0);
    assert.equal(m.id, 3, "20h doit primer sur 03h du matin");
  });
  test("est stable dans la journee", () => {
    const a = A.choisirMatchDuJour(jeu, {}, T0);
    const b = A.choisirMatchDuJour(jeu, {}, T0 + 3600e3);
    assert.equal(a.id, b.id, "la proposition ne doit pas changer d'heure en heure");
  });
  test("renvoie null quand plus rien n'est a venir", () => {
    assert.equal(A.choisirMatchDuJour(jeu, {}, Date.parse("2027-01-01")), null);
    assert.equal(A.choisirMatchDuJour([], {}, T0), null);
  });
  test("tolere un match sans instant de debut", () => {
    assert.doesNotThrow(() => A.choisirMatchDuJour([match({ id: 9 })], {}, T0));
  });
});

describe("compte a rebours", () => {
  const T0 = Date.parse("2026-07-28T12:00:00Z");
  const dans = (min) => new Date(T0 + min * 60000).toISOString();
  test("exprime les minutes puis les heures", () => {
    assert.match(A.compteARebours(dans(38), T0), /38 min/);
    assert.match(A.compteARebours(dans(252), T0), /4 h/);
  });
  test("bascule sur les jours au-dela de vingt-quatre heures", () => {
    assert.match(A.compteARebours(dans(60 * 30), T0), /demain|jours/);
    assert.match(A.compteARebours(dans(60 * 72), T0), /3 jours/);
  });
  test("gere l'instant present et le passe", () => {
    assert.equal(A.compteARebours(dans(0), T0), "c'est maintenant");
    assert.equal(A.compteARebours(dans(-30), T0), "c'est maintenant");
  });
});

describe("le quiz de révision", () => {
  const vues = [
    { conceptId: "sac_fly", description: "flies out, runner scores", manche: 3, demi: "top" },
    { conceptId: "walk", description: "walks", manche: 5, demi: "bottom" },
    { conceptId: "home_run", description: "hits a home run", manche: 7, demi: "top" },
  ];
  // Alea deterministe, pour que les tests ne clignotent pas.
  const fixe = (v) => () => v;

  test("produit quatre options dont la bonne", () => {
    const q = A.fabriquerQuestion(vues, [], fixe(0));
    assert.equal(q.options.length, 4);
    assert.ok(q.options.some((o) => o.id === q.bon.id), "la bonne reponse doit figurer parmi les options");
  });
  test("ne propose jamais deux fois la même notion", () => {
    const q = A.fabriquerQuestion(vues, [], fixe(0));
    const ids = q.options.map((o) => o.id);
    assert.equal(new Set(ids).size, 4, "options en double");
  });
  test("les distracteurs partagent la forme de la bonne réponse", () => {
    // Le losange ne doit pas trahir la reponse : meme nombre de segments.
    for (let i = 0; i < 20; i++) {
      const q = A.fabriquerQuestion(vues, [], () => i / 20);
      const memeForme = q.options.filter((o) => o.legs.length === q.bon.legs.length);
      assert.ok(memeForme.length >= 2, `une seule option de la bonne forme : ${q.bon.id}`);
    }
  });
  test("évite les notions déjà posées tant qu'il en reste", () => {
    const q = A.fabriquerQuestion(vues, ["sac_fly", "walk"], fixe(0));
    assert.equal(q.bon.id, "home_run", "doit piocher la seule notion non posee");
  });
  test("recycle quand toutes ont été posées", () => {
    const q = A.fabriquerQuestion(vues, ["sac_fly", "walk", "home_run"], fixe(0));
    assert.ok(q, "doit continuer a poser des questions plutot que s'arreter");
  });
  test("renvoie null faute d'actions", () => {
    assert.equal(A.fabriquerQuestion([], [], fixe(0)), null);
  });
  test("ignore une action dont la notion n'existe plus au catalogue", () => {
    const q = A.fabriquerQuestion([{ conceptId: "inexistant", description: "x" }], [], fixe(0));
    assert.equal(q, null, "une notion inconnue ne doit pas produire de question bancale");
  });
  test("chaque option existe bien au catalogue", () => {
    for (let i = 0; i < 20; i++) {
      const q = A.fabriquerQuestion(vues, [], () => i / 20);
      for (const o of q.options) assert.ok(A.BY_ID[o.id], `option inconnue : ${o.id}`);
    }
  });
});

describe("melanger", () => {
  test("conserve tous les éléments", () => {
    const src = [1, 2, 3, 4, 5];
    const m = A.melanger(src, () => 0.5);
    assert.deepEqual(m.slice().sort(), src);
  });
  test("ne modifie pas le tableau d'origine", () => {
    const src = [1, 2, 3];
    A.melanger(src, () => 0.9);
    assert.deepEqual(src, [1, 2, 3]);
  });
});

describe("le direct", () => {
  test("abrège la manche sans révéler le score", () => {
    const s = A.abregeManche({ manche: "5th", moitie: "Top", ext: 3, dom: 2 });
    assert.match(s, /5e/);
    assert.doesNotMatch(s, /[0-9]+\s*[–-]\s*[0-9]+/, "l'abrege ne doit contenir aucun score");
  });
  test("distingue le haut du bas de manche", () => {
    assert.notEqual(
      A.abregeManche({ manche: "7th", moitie: "Top" }),
      A.abregeManche({ manche: "7th", moitie: "Bottom" })
    );
  });
  test("tolère une réponse incomplète", () => {
    assert.equal(A.abregeManche(null), "en cours");
    assert.equal(A.abregeManche({}), "en cours");
  });
});

describe("doublons de matchs reportés", () => {
  /* Regression : un match reporte conserve son gamePk et figure sous DEUX
     dates — l'originale marquee Postponed et celle du rattrapage. Cliquer la
     pastille du rattrapage ouvrait la fiche du fantome, parce que la recherche
     se faisait par gamePk et renvoyait la premiere occurrence. */
  const fantome = { id: 824490, cle: "824490@2026-07-27", nuit: "2026-07-27", reporte: true, hhmm: "01:10" };
  const vrai = { id: 824490, cle: "824490@2026-07-28", nuit: "2026-07-28", reporte: false, hhmm: "19:40" };
  const autre = { id: 824489, cle: "824489@2026-07-28", nuit: "2026-07-28", reporte: false, hhmm: "01:10" };

  test("écarte le fantôme quand le rattrapage est programmé", () => {
    const r = A.purgerReports([fantome, vrai, autre]);
    assert.equal(r.length, 2);
    assert.ok(!r.some((m) => m.reporte), "le report doublonne doit disparaitre");
    assert.ok(r.some((m) => m.cle === vrai.cle), "le match rattrape doit rester");
  });

  test("conserve le report tant qu'aucun rattrapage n'est fixé", () => {
    const r = A.purgerReports([fantome, autre]);
    assert.equal(r.length, 2);
    assert.ok(r.some((m) => m.reporte), "sans rattrapage, « reporté » explique la soiree vide");
  });

  test("ne touche à rien quand il n'y a pas de doublon", () => {
    const l = [vrai, autre];
    assert.deepEqual(A.purgerReports(l), l);
  });

  test("les clés restent uniques après purge", () => {
    const r = A.purgerReports([fantome, vrai, autre]);
    assert.equal(new Set(r.map((m) => m.cle)).size, r.length);
  });

  test("une clé identifie une occurrence, pas un match", () => {
    assert.notEqual(fantome.cle, vrai.cle, "meme gamePk, nuits differentes");
    assert.equal(fantome.id, vrai.id);
  });
});

describe("le match du jour ne suit pas la fenêtre consultée", () => {
  const T0 = Date.parse("2026-07-28T12:00:00Z");
  const dans = (h) => new Date(T0 + h * 3600e3).toISOString();

  /* Regression : le match du jour etait tire de la fenetre affichee. Avancer
     d'une semaine proposait donc un match dans huit jours. */
  test("ignore les nuits au-delà de l'horizon", () => {
    const semaineProchaine = [
      { ...match({ id: 7, nuit: "2026-08-04", h: 20 }), debut: dans(24 * 7) },
      { ...match({ id: 8, nuit: "2026-08-05", h: 20 }), debut: dans(24 * 8) },
    ];
    assert.equal(A.choisirMatchDuJour(semaineProchaine, {}, T0), null,
      "aucune proposition quand la fenetre ne contient que du lointain");
  });

  test("accepte ce soir et la nuit suivante", () => {
    const proche = [{ ...match({ id: 1, nuit: "2026-07-28", h: 20 }), debut: dans(8) }];
    assert.ok(A.choisirMatchDuJour(proche, {}, T0), "ce soir doit passer");
    const demain = [{ ...match({ id: 2, nuit: "2026-07-29", h: 20 }), debut: dans(32) }];
    assert.ok(A.choisirMatchDuJour(demain, {}, T0), "demain soir doit passer aussi");
  });

  test("l'horizon reste crédible", () => {
    const heures = A.HORIZON_JOUR / 3600e3;
    assert.ok(heures >= 24 && heures <= 72, `horizon de ${heures} h, valeur invraisemblable`);
  });

  test("ne propose rien quand on remonte dans le passé", () => {
    const passe = [{ ...match({ id: 3, nuit: "2026-07-20", h: 20 }), debut: dans(-24 * 8) }];
    assert.equal(A.choisirMatchDuJour(passe, {}, T0), null);
  });
});

describe("résumés de match", () => {
  const contenu = (items) => ({ highlights: { highlights: { items } } });
  const item = (tax, titre, duree, playbacks) => ({
    title: titre, duration: duree, playbacks,
    keywordsAll: [{ type: "mlbtax", value: tax }, { type: "taxonomy", value: "x" }],
  });
  const mp4 = [{ name: "mp4Avc", url: "https://x/y_1280x720_59_4000K.mp4" }];
  const avecHls = [{ name: "hlsCloud", url: "https://x/y.m3u8" }, ...mp4];

  test("distingue le condensé du résumé commenté", () => {
    const r = A.extraireResumes(contenu([
      item("mlb_recap", "Machin lead Truc in win", "00:02:55", mp4),
      item("condensed_game", "Condensed Game: A@B", "00:11:29", mp4),
    ]));
    assert.equal(r.recap.duree, "00:02:55");
    assert.equal(r.condense.duree, "00:11:29");
  });

  test("ignore les clips d'action", () => {
    const r = A.extraireResumes(contenu([
      { title: "un circuit", guid: "abc", playbacks: mp4, keywordsAll: [] },
    ]));
    assert.equal(r.recap, null);
    assert.equal(r.condense, null);
  });

  test("ne casse pas sur un contenu absent ou vide", () => {
    for (const c of [null, {}, contenu([])]) {
      const r = A.extraireResumes(c);
      assert.equal(r.recap, null);
      assert.equal(r.condense, null);
    }
  });

  test("écarte un montage sans source lisible", () => {
    const r = A.extraireResumes(contenu([item("mlb_recap", "t", "00:03:00", [])]));
    assert.equal(r.recap, null, "un montage sans playback ne doit pas produire de bouton mort");
  });

  test("retombe sur le mp4 hors d'un navigateur", () => {
    // Au rendu serveur, `document` n'existe pas : la detection HLS doit
    // se contenter du mp4 plutot que de lever.
    const s = A.sourceLisible(avecHls);
    assert.ok(s.url.endsWith(".mp4"));
    assert.equal(s.adaptatif, false);
  });

  test("renvoie null faute de toute source", () => {
    assert.equal(A.sourceLisible([]), null);
    assert.equal(A.sourceLisible([{ name: "trickplay", url: "https://x/y.jpg" }]), null);
  });
});

describe("carte des terrains", () => {
  /* Le trace est fige au moment de la conception : ces tests verifient que la
     projection reste coherente avec lui, pas qu'elle est mathematiquement
     exacte dans l'absolu. Valeurs en dur, jamais derivees des constantes. */
  const parc = (lon, lat) => A.projeter(lon, lat);

  test("les parcs tombent dans le cadre", () => {
    const villes = [
      [-122.33, 47.59], [-71.09, 42.34], [-80.22, 25.77],
      [-93.27, 44.98], [-79.38, 43.64], [-104.99, 39.75],
    ];
    for (const [lo, la] of villes) {
      const p = parc(lo, la);
      assert.ok(p.x >= 0 && p.x <= A.CARTE_L, `x=${p.x} hors cadre pour ${lo},${la}`);
      assert.ok(p.y >= 0 && p.y <= A.CARTE_H, `y=${p.y} hors cadre pour ${lo},${la}`);
    }
  });

  test("l'orientation est correcte", () => {
    const seattle = parc(-122.33, 47.59), boston = parc(-71.09, 42.34);
    const miami = parc(-80.22, 25.77), minneapolis = parc(-93.27, 44.98);
    assert.ok(seattle.x < boston.x, "Seattle doit être à gauche de Boston");
    assert.ok(seattle.y < miami.y, "Seattle doit être plus haut que Miami");
    assert.ok(minneapolis.y < miami.y, "Minneapolis doit être plus haut que Miami");
  });

  /* Regression : l'ordonnee d'Albers croît vers le nord, le SVG vers le bas.
     Sans l'inversion, la carte etait retournee. */
  test("le nord est bien en haut", () => {
    const nord = parc(-96, 48), sud = parc(-96, 26);
    assert.ok(nord.y < sud.y, "à longitude égale, le nord doit avoir un y plus petit");
  });

  test("les deux parcs d'une même ville se touchent", () => {
    const a = parc(-73.93, 40.83), b = parc(-73.85, 40.76); // Bronx et Queens
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 30, "les deux parcs new-yorkais sont trop éloignés");
  });

  /* Verifier les bornes ne suffit pas : une echelle trop petite garde tout
     dans le cadre en tassant la carte dans un coin. On exige donc qu'elle
     le remplisse. Fractions en dur, jamais derivees de l'echelle. */
  test("la carte occupe bien le cadre", () => {
    const seattle = parc(-122.33, 47.59), miami = parc(-80.22, 25.77);
    const large = Math.abs(miami.x - seattle.x) / A.CARTE_L;
    const haut = Math.abs(miami.y - seattle.y) / A.CARTE_H;
    assert.ok(large > 0.6, `Seattle-Miami ne couvre que ${(large * 100).toFixed(0)} % de la largeur`);
    assert.ok(haut > 0.6, `Seattle-Miami ne couvre que ${(haut * 100).toFixed(0)} % de la hauteur`);
  });

  test("tolère une coordonnée manquante", () => {
    assert.equal(A.projeter(null, 40), null);
    assert.equal(A.projeter(-96, null), null);
  });

  test("le tracé embarqué reste léger et exploitable", () => {
    assert.ok(A.CONTOUR_US.startsWith("M"), "le tracé doit être un chemin SVG");
    assert.ok(A.CONTOUR_US.length < 4000, `tracé de ${A.CONTOUR_US.length} o, trop lourd`);
    assert.ok(A.CONTOUR_US.includes("Z"), "le contour doit être fermé");
  });

  test("conversion des pieds en mètres", () => {
    assert.equal(A.enM(400), 122);   // champ centre typique
    assert.equal(A.enM(5190), 1582); // altitude de Coors Field
    assert.equal(A.enM(null), null);
  });
});

describe("cible dans le fragment d'URL", () => {
  test("extrait l'identifiant du parc", () => {
    assert.equal(A.cibleDepuisFragment("#terrains/5325"), "5325");
    assert.equal(A.cibleDepuisFragment("terrains/22"), "22");
    assert.equal(A.cibleDepuisFragment("#/terrains/19"), "19");
  });
  test("renvoie null sans cible", () => {
    for (const h of ["#terrains", "#programme", "", "#", null, undefined, "#terrains/"])
      assert.equal(A.cibleDepuisFragment(h), null, `cible fantome pour ${JSON.stringify(h)}`);
  });
  test("l'onglet reste correct malgré la cible", () => {
    assert.equal(A.ongletDepuisFragment("#terrains/5325"), "terrains");
    assert.equal(A.ongletDepuisFragment("#programme/xyz"), "nuits");
    assert.equal(A.ongletDepuisFragment("#equipes/119"), "equipes");
    assert.equal(A.cibleDepuisFragment("#equipes/119"), "119");
  });
  test("un fragment à cible inconnue retombe sur le carnet", () => {
    assert.equal(A.ongletDepuisFragment("#nawak/5325"), "carnet");
  });
});

describe("unités des distances", () => {
  /* Le baseball compte en pieds : c'est l'unite de l'API et celle peinte sur
     les murs. Les metres sont notre conversion, pas l'inverse. */
  test("les pieds sont la valeur d'origine, non convertie", () => {
    assert.equal(A.enPi(400), 400);
    assert.equal(A.enPi(5190), 5190);
    assert.equal(A.enPi(null), null);
  });

  test("la conversion en mètres reste juste", () => {
    assert.equal(A.enM(400), 122);   // champ centre courant
    assert.equal(A.enM(310), 94);    // ligne courte
    assert.equal(A.enM(5190), 1582); // altitude de Coors Field
  });

  test("les deux unités sont cohérentes entre elles", () => {
    for (const p of [302, 330, 400, 420, 435]) {
      const ecart = Math.abs(A.enM(p) / A.enPi(p) - 0.3048);
      assert.ok(ecart < 0.005, `rapport incohérent pour ${p} ft`);
    }
  });

  test("les trois clôtures sortent dans les deux unités", () => {
    const d = A.distancesCloture({ gauche: 330, centre: 400, droite: 330 });
    assert.match(d.m, /101 · 122 · 101 m/);
    assert.match(d.pi, /330 · 400 · 330 ft/);
  });

  test("tolère une ligne manquante", () => {
    const d = A.distancesCloture({ centre: 400 });
    assert.match(d.m, /122 m/);
    assert.match(d.pi, /400 ft/);
  });

  test("renvoie null sans champ centre", () => {
    assert.equal(A.distancesCloture({ gauche: 330 }), null);
    assert.equal(A.distancesCloture(null), null);
  });
});

describe("qualité du tracé de la carte", () => {
  const pts = A.CONTOUR_US.replace(/^M|Z$/g, "").split("L").map((s) => s.split(" ").map(Number));
  const angle = (a, b, c) => {
    const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const n1 = Math.hypot(...v1), n2 = Math.hypot(...v2);
    if (!n1 || !n2) return 180;
    const cs = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)));
    return (Math.acos(cs) * 180) / Math.PI;
  };

  /* Regression : Douglas-Peucker sur les cotes tres decoupees conservait les
     points extremes en jetant les intermediaires, produisant des zigzags en
     aiguille dans le golfe du Mexique et sur la baie de Chesapeake. */
  test("aucune pointe en aiguille", () => {
    const n = pts.length;
    const fautifs = [];
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const saillie = Math.min(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(c[0] - b[0], c[1] - b[1]));
      if (angle(a, b, c) < 25 && saillie > 6) fautifs.push([i, b]);
    }
    assert.equal(fautifs.length, 0, `${fautifs.length} pointe(s) : ${JSON.stringify(fautifs.slice(0, 3))}`);
  });

  test("le tracé reste léger", () => {
    assert.ok(pts.length > 100, "trop simplifié, le contour deviendrait méconnaissable");
    assert.ok(A.CONTOUR_US.length < 4000, `${A.CONTOUR_US.length} o, trop lourd`);
  });

  test("tous les points sont dans le cadre", () => {
    for (const [x, y] of pts) {
      assert.ok(x >= -1 && x <= A.CARTE_L + 1, `x=${x} hors cadre`);
      assert.ok(y >= -1 && y <= A.CARTE_H + 1, `y=${y} hors cadre`);
    }
  });
});

describe("étanchéité aux spoilers", () => {
  /* Regression : le bandeau LA SITUATION et les mentions de série révélaient
     le résultat de la nuit précédente. « sur 4 victoires » dit qu'ils ont
     gagné hier ; le bilan et le nombre magique bougent aussi chaque nuit. */
  const bil = {
    119: { pct: 0.63, meneur: true, magique: 45, serieNb: 4, serieType: "wins" },
    147: { pct: 0.56, wc: 1.5, serieNb: 12, serieType: "losses" },
  };
  const m = { ...match({ h: 20, coteDom: 0.72 }), idDom: 119, idExt: 147 };

  test("aucune série n'est citée quand les résultats sont masqués", () => {
    const r = A.raisonEnvie(m, bil, {}, {}, false);
    assert.doesNotMatch(r, /victoire|défaite/, `série révélée : "${r}"`);
  });

  test("la série revient quand les résultats sont demandés", () => {
    const r = A.raisonEnvie(m, bil, {}, {}, true);
    assert.match(r, /victoires|défaites/, "la série doit apparaître une fois les résultats acceptés");
  });

  test("le comportement par défaut est le silence", () => {
    // Un appel sans le drapeau ne doit jamais divulguer : c'est le sens sûr.
    const r = A.raisonEnvie(m, bil, {}, {});
    assert.doesNotMatch(r, /victoire|défaite/, "l'oubli du paramètre ne doit pas spoiler");
  });

  test("une raison utile subsiste malgré le masquage", () => {
    const r = A.raisonEnvie(m, bil, {}, {}, false);
    assert.ok(r && r.length > 5, "la carte ne doit pas se retrouver sans motif");
  });
});

describe("liens Wikipédia des stades", () => {
  test("les trente parcs ont un article", () => {
    const n = Object.keys(A.WIKI_STADES).length;
    assert.equal(n, 30, `${n} entrées au lieu de 30`);
    for (const [id, titre] of Object.entries(A.WIKI_STADES))
      assert.ok(titre && titre.length > 2, `titre vide pour le stade ${id}`);
  });

  test("l'URL est bien formée", () => {
    const u = A.lienWiki(Object.keys(A.WIKI_STADES)[0]);
    assert.match(u, /^https:\/\/fr\.wikipedia\.org\/wiki\//);
    assert.doesNotMatch(u, / /, "les espaces doivent être encodés");
  });

  /* Les noms de l'API portent les sponsors : « UNIQLO Field at Dodger
     Stadium » doit pointer vers l'article « Dodger Stadium ». */
  test("le sponsor ne pollue pas le lien", () => {
    const dodger = Object.values(A.WIKI_STADES).find((x) => /Dodger/.test(x));
    assert.equal(dodger, "Dodger Stadium");
    assert.ok(!Object.values(A.WIKI_STADES).some((x) => /UNIQLO|Daikin Field/.test(x)));
  });

  test("les titres sont uniques", () => {
    const t = Object.values(A.WIKI_STADES);
    assert.equal(new Set(t).size, t.length, "deux parcs pointent vers le même article");
  });

  test("renvoie null pour un stade inconnu", () => {
    assert.equal(A.lienWiki(999999), null);
    assert.equal(A.lienWiki(null), null);
  });
});

describe("le direct", () => {
  test("le filtre de champs couvre ce que la vue affiche", () => {
    for (const c of ["linescore", "currentInningOrdinal", "inningState", "balls", "strikes",
                     "outs", "offense", "defense", "innings", "currentPlay", "description"])
      assert.ok(A.CHAMPS_DIRECT.includes(c), `champ ${c} absent du filtre`);
  });

  test("la cadence reste raisonnable", () => {
    // Un lancer toutes les vingt secondes environ : plus rapide serait du gâchis,
    // plus lent donnerait un direct qui traîne.
    assert.ok(A.CADENCE_DIRECT >= 10000 && A.CADENCE_DIRECT <= 30000,
      `${A.CADENCE_DIRECT} ms, cadence invraisemblable`);
  });

  test("le filtre reste court", () => {
    // C'est lui qui fait tomber la requête de 625 Ko à 1,6 Ko.
    assert.ok(A.CHAMPS_DIRECT.length < 500, "filtre trop bavard");
    assert.doesNotMatch(A.CHAMPS_DIRECT, /\s/, "les espaces casseraient l'URL");
  });
});

describe("déroulé du match", () => {
  const act = (manche, demi, texte, points = false) => ({
    result: { description: texte },
    about: { inning: manche, halfInning: demi, isScoringPlay: points },
  });

  test("regroupe par demi-manche, la plus récente en tête", () => {
    const g = A.grouperParManche([
      act(1, "top", "A"), act(1, "top", "B"),
      act(1, "bottom", "C"),
      act(2, "top", "D"),
    ]);
    assert.equal(g.length, 3);
    assert.equal(g[0].manche, 2, "la manche la plus récente doit venir en premier");
    assert.equal(g[2].manche, 1);
    assert.equal(g[2].demi, "top");
  });

  test("inverse aussi les actions dans chaque manche", () => {
    const g = A.grouperParManche([act(1, "top", "premier"), act(1, "top", "second")]);
    assert.equal(g[0].actions[0].result.description, "second", "la dernière action doit être en tête");
  });

  test("écarte les actions sans description", () => {
    const g = A.grouperParManche([act(1, "top", "A"), { about: { inning: 1, halfInning: "top" } }]);
    assert.equal(g[0].actions.length, 1);
  });

  test("ne casse pas sur une liste vide", () => {
    assert.deepEqual(A.grouperParManche([]), []);
    assert.deepEqual(A.grouperParManche(), []);
  });

  test("le filtre de l'historique reste léger", () => {
    // C'est lui qui fait tomber la requête de 677 Ko à 12 Ko.
    assert.ok(A.CHAMPS_HISTOIRE.includes("allPlays"));
    assert.ok(A.CHAMPS_HISTOIRE.includes("description"));
    assert.ok(A.CHAMPS_HISTOIRE.length < 250, "filtre trop bavard");
  });

  test("l'historique se rafraîchit moins vite que l'état courant", () => {
    // Une action toutes les deux ou trois minutes : inutile de la relire
    // aussi souvent que le compte de balles.
    assert.ok(A.CADENCE_HISTOIRE > A.CADENCE_DIRECT);
    assert.ok(A.CADENCE_HISTOIRE <= 120000);
  });
});

describe("codes du marqueur dans le déroulé", () => {
  const act = (eventType, description, extra = {}) => ({
    result: { eventType, description, rbi: 0, ...extra.result },
    about: { inning: 1, halfInning: "top", ...extra.about },
    playEvents: extra.playEvents || [],
  });

  test("reconnaît les issues de présence au bâton", () => {
    assert.equal(A.codeAction(act("home_run", "hits a home run")).code, "HR");
    assert.equal(A.codeAction(act("walk", "walks")).code, "BB");
    assert.equal(A.codeAction(act("strikeout", "strikes out")).code, "K");
    assert.equal(A.codeAction(act("single", "singles")).code, "1B");
  });

  test("distingue les trajectoires d'un retrait au champ", () => {
    assert.equal(A.codeAction(act("field_out", "grounds out to short")).code, "6-3");
    assert.equal(A.codeAction(act("field_out", "flies out to center")).code, "F8");
  });

  test("repère les actions de course cachées dans playEvents", () => {
    const a = act("strikeout", "strikes out", {
      playEvents: [{ type: "action", details: { eventType: "stolen_base_2b" } }],
    });
    assert.equal(A.codeAction(a).code, "K", "l'issue au bâton prime sur l'action de course");
    const b = act("game_advisory", "…", {
      playEvents: [{ type: "action", details: { eventType: "wild_pitch" } }],
    });
    assert.equal(A.codeAction(b).code, "WP");
  });

  test("le grand chelem se distingue du circuit", () => {
    const a = act("home_run", "grand slam", { result: { rbi: 4 } });
    assert.equal(A.codeAction(a).code, "GS");
  });

  test("la couleur suit la catégorie", () => {
    const point = A.codeAction(act("single", "singles, run scores", { about: { isScoringPlay: true } }));
    const coup = A.codeAction(act("single", "singles"));
    const retrait = A.codeAction(act("strikeout", "strikes out"));
    assert.equal(point.ton, A.TON_ACTION.point);
    assert.equal(coup.ton, A.TON_ACTION.coup);
    assert.equal(retrait.ton, A.TON_ACTION.retrait);
    assert.notEqual(point.ton, coup.ton);
  });

  test("les cinq tons sont distincts", () => {
    const t = Object.values(A.TON_ACTION);
    assert.equal(new Set(t).size, t.length, "deux catégories partagent une couleur");
  });

  test("chaque code renvoyé existe au catalogue", () => {
    for (const et of Object.keys(A.CATEGORIE)) {
      const c = A.codeAction(act(et, "peu importe"));
      if (c.concept) assert.ok(A.BY_ID[c.concept], `notion inconnue : ${c.concept}`);
    }
  });

  test("un évènement inconnu ne casse rien", () => {
    const c = A.codeAction(act("evenement_invente", "…"));
    assert.equal(c.code, "—");
    assert.ok(c.ton, "une couleur de repli est toujours fournie");
    assert.doesNotThrow(() => A.codeAction({}));
  });
});

describe("stabilité du déroulé", () => {
  const act = (i, manche, demi, texte) => ({
    result: { description: texte },
    about: { atBatIndex: i, inning: manche, halfInning: demi },
  });

  /* Regression : les clés React reposaient sur l'index de position. Chaque
     action insérée en tête décalait toutes les autres et React réutilisait
     les mauvais nœuds — des lignes semblaient disparaître ou changer. */
  test("chaque action porte un identifiant stable", () => {
    const g = A.grouperParManche([act(0, 1, "top", "A"), act(1, 1, "top", "B")]);
    for (const gr of g)
      for (const a of gr.actions)
        assert.ok(Number.isInteger(a.about.atBatIndex), "atBatIndex manquant");
  });

  test("l'identifiant survit à l'ajout d'une action", () => {
    const avant = A.grouperParManche([act(0, 1, "top", "A"), act(1, 1, "top", "B")]);
    const apres = A.grouperParManche([act(0, 1, "top", "A"), act(1, 1, "top", "B"), act(2, 1, "top", "C")]);
    const idOf = (gr, texte) =>
      gr.flatMap((x) => x.actions).find((a) => a.result.description === texte).about.atBatIndex;
    assert.equal(idOf(avant, "A"), idOf(apres, "A"), "l'identifiant de A a bougé");
    assert.equal(idOf(avant, "B"), idOf(apres, "B"), "l'identifiant de B a bougé");
  });

  test("le filtre demande bien atBatIndex", () => {
    assert.ok(A.CHAMPS_HISTOIRE.includes("atBatIndex"));
  });

  /* Regression : tronquer par demi-manche faisait disparaître quatre ou cinq
     lignes d'un coup au changement de manche. */
  test("la troncature compte des actions, pas des manches", () => {
    const g = A.grouperParManche([
      act(0, 1, "top", "a"), act(1, 1, "top", "b"), act(2, 1, "top", "c"),
      act(3, 1, "bottom", "d"), act(4, 1, "bottom", "e"),
      act(5, 2, "top", "f"),
    ]);
    // Limite choisie pour tomber AU MILIEU d'une demi-manche : avec 3, la
    // coupure coincidait avec une frontiere et le test ne discriminait rien.
    for (const max of [1, 2, 4, 5]) {
      const l = A.limiterActions(g, max);
      const n = l.reduce((acc, x) => acc + x.actions.length, 0);
      assert.equal(n, max, `limite ${max} : ${n} actions gardées`);
    }
  });

  test("signale un groupe coupé en cours", () => {
    const g = A.grouperParManche([
      act(0, 1, "top", "a"), act(1, 1, "top", "b"), act(2, 1, "top", "c"),
    ]);
    const l = A.limiterActions(g, 2);
    assert.equal(l[0].tronque, true, "un groupe partiel doit être marqué");
    assert.equal(A.limiterActions(g, 3)[0].tronque, false);
  });

  test("la troncature garde les plus récentes", () => {
    const g = A.grouperParManche([act(0, 1, "top", "vieille"), act(1, 2, "top", "recente")]);
    const l = A.limiterActions(g, 1);
    assert.equal(l[0].actions[0].result.description, "recente");
  });

  test("une limite large ne perd rien", () => {
    const src = [act(0, 1, "top", "a"), act(1, 1, "top", "b")];
    const g = A.grouperParManche(src);
    assert.equal(A.limiterActions(g, 99).reduce((n, x) => n + x.actions.length, 0), src.length);
  });

  test("une limite nulle ne renvoie rien", () => {
    const g = A.grouperParManche([act(0, 1, "top", "a")]);
    assert.deepEqual(A.limiterActions(g, 0), []);
  });
});

describe("entrées d'intendance dans le déroulé", () => {
  /* Regression : une substitution occupe temporairement la place de l'action
     en cours, puis l'API l'absorbe dans les playEvents du duel suivant. La
     ligne apparaissait donc puis s'effaçait d'elle-même. */
  const jeu = (eventType, texte) => ({
    result: { eventType, description: texte },
    about: { atBatIndex: 1, inning: 7, halfInning: "top" },
  });

  test("les changements de joueur sont écartés", () => {
    for (const e of ["defensive_substitution", "offensive_substitution",
                     "pitching_substitution", "defensive_switch"])
      assert.ok(A.estIntendance(jeu(e, "…")), `${e} devrait être filtré`);
  });

  test("les avis et interruptions aussi", () => {
    for (const e of ["game_advisory", "mound_visit", "batter_timeout", "injury", "ejection"])
      assert.ok(A.estIntendance(jeu(e, "…")), `${e} devrait être filtré`);
  });

  test("les vraies actions passent", () => {
    for (const e of ["single", "home_run", "strikeout", "field_out", "walk",
                     "stolen_base_2b", "wild_pitch", "sac_fly", "balk"])
      assert.ok(!A.estIntendance(jeu(e, "…")), `${e} ne doit pas être filtré`);
  });

  test("le déroulé n'en contient plus aucune", () => {
    const g = A.grouperParManche([
      jeu("single", "singles"),
      jeu("defensive_substitution", "Defensive Substitution: X replaces Y"),
      jeu("strikeout", "strikes out"),
    ]);
    const tout = g.flatMap((x) => x.actions);
    assert.equal(tout.length, 2, "la substitution devrait avoir disparu");
    assert.ok(!tout.some((a) => /Substitution/i.test(a.result.description)));
  });

  test("une action sans type ne casse rien", () => {
    assert.equal(A.estIntendance({}), false);
    assert.equal(A.estIntendance(null), false);
  });
});

describe("classification de l'état d'un match", () => {
  /* Regression : TOR@WSH a disparu du sélecteur au moment de finir. L'API
     passe par un état « Game Over » (code O) entre le jeu et l'homologation ;
     le filtre exigeait le code « F » et ce match n'était donc ni vif ni fini. */
  const st = (abs, code) => ({ abstractGameState: abs, codedGameState: code });

  test("Game Over compte comme terminé", () => {
    const e = A.classerMatch(st("Final", "O"));
    assert.equal(e.fini, true, "un match joué mais non homologué doit rester visible");
    assert.equal(e.vif, false);
    assert.equal(e.reporte, false);
  });

  test("Final homologué aussi", () => {
    assert.equal(A.classerMatch(st("Final", "F")).fini, true);
  });

  test("un report n'est ni vif ni fini", () => {
    const e = A.classerMatch(st("Final", "D"));
    assert.equal(e.reporte, true);
    assert.equal(e.fini, false, "un match jamais joué ne doit pas passer pour terminé");
  });

  test("l'échauffement se distingue du jeu lancé", () => {
    const chauffe = A.classerMatch(st("Live", "P"));
    const joue = A.classerMatch(st("Live", "I"));
    assert.equal(chauffe.vif, true);
    assert.equal(chauffe.echauffement, true);
    assert.equal(joue.echauffement, false, "un match en cours n'est pas à l'échauffement");
  });

  test("un match à venir n'est rien de tout ça", () => {
    for (const code of ["S", "P"]) {
      const e = A.classerMatch(st("Preview", code));
      assert.equal(e.vif, false);
      assert.equal(e.fini, false);
    }
  });

  /* Tout match doit tomber dans exactement une categorie exploitable :
     c'est la garantie qu'aucun ne disparaisse entre les mailles. */
  test("aucun état connu ne tombe entre les mailles", () => {
    const connus = [
      ["Live", "I"], ["Live", "P"], ["Final", "F"], ["Final", "O"],
      ["Final", "D"], ["Preview", "S"], ["Preview", "P"],
    ];
    for (const [abs, code] of connus) {
      const e = A.classerMatch(st(abs, code));
      const classe = e.vif || e.fini || e.reporte || abs === "Preview";
      assert.ok(classe, `${abs}/${code} n'est classé nulle part`);
    }
  });

  test("tolère un statut absent", () => {
    for (const s of [null, undefined, {}]) {
      const e = A.classerMatch(s);
      assert.equal(e.vif, false);
      assert.equal(e.fini, false);
    }
  });
});

describe("date de reference : Paris et non UTC", () => {
  /* `toISOString().slice(0,10)` donne la date UTC. Entre minuit et 02h l'ete,
     c'est encore la veille a Paris — et toute la fenetre de nuits glissait
     d'un cran, precisement aux heures ou l'on consulte. */
  const a = (iso) => new Date(iso);

  test("00h30 à Paris en été est déjà le lendemain", () => {
    // 2026-07-31T22:30Z = 2026-08-01 00h30 à Paris (UTC+2)
    const d = a("2026-07-31T22:30:00Z");
    assert.equal(A.jourParis(d), "2026-08-01");
    assert.equal(d.toISOString().slice(0, 10), "2026-07-31", "l'ancienne base UTC");
  });

  test("01h10 à Paris en hiver aussi", () => {
    // 2026-01-15T00:10Z = 01h10 à Paris (UTC+1)
    assert.equal(A.jourParis(a("2026-01-15T00:10:00Z")), "2026-01-15");
  });

  test("23h en été reste le jour courant", () => {
    assert.equal(A.jourParis(a("2026-07-31T21:00:00Z")), "2026-07-31");
  });

  test("juste avant minuit à Paris, la date n'a pas encore tourné", () => {
    // 2026-07-31T21:59Z = 23h59 à Paris
    assert.equal(A.jourParis(a("2026-07-31T21:59:00Z")), "2026-07-31");
  });
});

describe("statut HTTP des reponses de l'API", () => {
  /* Une reponse d'erreur reste tres souvent du JSON valide : sans controle du
     statut, un 500 se lisait comme une reponse vide et l'ecran annoncait
     « aucun match » au lieu de signaler la panne. */
  const avecFetch = async (faux, fn) => {
    const vrai = globalThis.fetch;
    globalThis.fetch = faux;
    try { return await fn(); } finally { globalThis.fetch = vrai; }
  };
  const rep = (statut, corps) =>
    new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });

  test("une reponse 200 renvoie le JSON", async () => {
    const d = await avecFetch(async () => rep(200, { dates: [1, 2] }), () => A.jsonMlb("http://x"));
    assert.deepEqual(d.dates, [1, 2]);
  });

  test("un 500 avec du JSON valide leve malgre tout", async () => {
    await avecFetch(async () => rep(500, { message: "boom" }), async () => {
      await assert.rejects(() => A.jsonMlb("http://x"), /500/);
    });
  });

  test("un 404 leve aussi", async () => {
    await avecFetch(async () => rep(404, {}), async () => {
      await assert.rejects(() => A.jsonMlb("http://x"), /404/);
    });
  });
});

describe("garde-fou de rendu", () => {
  /* `renderToString` ne declenche pas les frontieres d'erreur : on teste donc
     le contrat de la classe directement — c'est lui qui compte. Le
     comportement complet a ete verifie au navigateur, sur un rendu qui leve
     pour de vrai (champ `innings` renvoye sous une autre forme). */
  test("une erreur de rendu devient un etat, pas une page blanche", () => {
    const e = new Error("boum");
    assert.deepEqual(A.Garde.getDerivedStateFromError(e), { erreur: e });
  });

  test("sans erreur, la garde est transparente", () => {
    const g = new A.Garde({ children: "CONTENU" });
    assert.equal(g.render(), "CONTENU");
  });

  test("avec une erreur, elle rend un repli qui nomme la panne", () => {
    const g = new A.Garde({ children: "CONTENU" });
    g.state = { erreur: new Error("champ disparu") };
    const arbre = JSON.stringify(g.render());
    assert.match(arbre, /interrompue/, "le repli doit expliquer ce qui se passe");
    assert.match(arbre, /champ disparu/, "et rapporter la cause");
    assert.doesNotMatch(arbre, /CONTENU/, "l'arbre fautif ne doit plus etre rendu");
  });

  test("changer d'onglet rearme la garde", () => {
    const g = new A.Garde({ cle: "carnet" });
    g.state = { erreur: new Error("x") };
    const vus = [];
    g.setState = (s) => vus.push(s);
    g.props = { cle: "nuits" };
    g.componentDidUpdate({ cle: "carnet" });
    assert.deepEqual(vus, [{ erreur: null }], "sans cela, une vue en panne condamnerait les autres");
  });

  test("mais un rendu de la meme vue ne l'efface pas toute seule", () => {
    const g = new A.Garde({ cle: "carnet" });
    g.state = { erreur: new Error("x") };
    const vus = [];
    g.setState = (s) => vus.push(s);
    g.props = { cle: "carnet" };
    g.componentDidUpdate({ cle: "carnet" });
    assert.deepEqual(vus, [], "sinon la garde boucle sur l'erreur");
  });
});

describe("avertissements d'avant-match", () => {
  const T0 = Date.parse("2026-08-05T23:40:00Z"); // heure prevue du premier lancer
  const min = (n) => T0 + n * 60e3;

  // « code » est codedGameState et « detail » detailedState. S = prevu,
  // P = avant-match, I = en cours.
  const jeu = (o = {}) => [{
    id: 823753, debut: new Date(T0).toISOString(),
    ext: "Cubs", dom: "Reds", idExt: 112, idDom: 113, idSuivi: 112,
    code: "S", detail: "Scheduled", ...o,
  }];

  const types = (matchs, deja, quand) =>
    A.notificationsADeclencher(matchs, new Set(deja), quand).map((a) => a.type);

  test("le rappel tombe dans le quart d'heure, pas avant", () => {
    assert.deepEqual(types(jeu(), [], min(-16)), []);
    assert.deepEqual(types(jeu(), [], min(-15)), ["rappel"]);
    assert.deepEqual(types(jeu(), [], min(-1)), ["rappel"]);
  });

  test("le rappel dit le temps qu'il reste vraiment", () => {
    // Ouvrir la page a T-8 ne doit pas annoncer un quart d'heure fictif.
    const [a] = A.notificationsADeclencher(jeu(), new Set(), min(-8));
    assert.match(a.corps, /dans 8 min/);
  });

  test("l'echauffement ne compte pas pour la premiere balle", () => {
    // Le coeur du sujet : l'API met deja « Live » dans abstractGameState
    // pendant l'echauffement. Seul codedGameState separe les deux.
    const echauffe = jeu({ code: "P", detail: "Warmup" });
    assert.deepEqual(types(echauffe, [], min(-35)), ["echauffement"]);
    assert.deepEqual(types(jeu({ code: "I", detail: "In Progress" }), [], min(2)), ["premiere"]);
  });

  test("l'echauffement n'empeche pas le rappel qui le suit", () => {
    // Les echauffements commencent une demi-heure avant le premier lancer,
    // donc AVANT le rappel : une chaine exclusive aurait avale celui-ci.
    const echauffe = jeu({ code: "P", detail: "Warmup" });
    assert.deepEqual(types(echauffe, [], min(-35)), ["echauffement"]);
    assert.deepEqual(types(echauffe, ["823753:echauffement"], min(-12)), ["rappel"]);
  });

  test("arriver en retard ne declenche rien de perime", () => {
    // Ouvrir la page a 3h du matin ne doit pas annoncer la premiere balle
    // d'un match entame depuis deux heures.
    assert.deepEqual(types(jeu({ code: "I", detail: "In Progress" }), [], min(120)), []);
    assert.deepEqual(types(jeu({ code: "P", detail: "Warmup" }), [], min(30)), []);
    // Ni le rappel d'un match deja commence.
    assert.deepEqual(types(jeu({ code: "I", detail: "In Progress" }), [], min(1)), ["premiere"]);
  });

  test("un avertissement deja servi ne repart pas", () => {
    assert.deepEqual(types(jeu(), ["823753:rappel"], min(-10)), []);
  });

  test("un match qui ne se jouera pas se tait", () => {
    for (const detail of ["Postponed", "Cancelled", "Suspended: Rain"])
      assert.deepEqual(types(jeu({ detail }), [], min(-10)), [], detail);
    // Un depart differe reste un match a voir : il ne doit PAS etre ecarte.
    assert.deepEqual(types(jeu({ code: "P", detail: "Delayed Start" }), [], min(-10)), ["rappel"]);
  });

  test("le clic mene la ou il y a quelque chose a voir", () => {
    const [r] = A.notificationsADeclencher(jeu(), new Set(), min(-10));
    assert.equal(r.cible, "programme");
    const [p] = A.notificationsADeclencher(
      jeu({ code: "I", detail: "In Progress" }), new Set(), min(2));
    assert.equal(p.cible, "direct");
  });

  test("un seul fil de notification par match", () => {
    const [r] = A.notificationsADeclencher(jeu(), new Set(), min(-10));
    assert.equal(r.tag, "823753", "sans tag commun, les trois avertissements s'empilent");
    assert.equal(r.idEquipe, 112, "l'icone porte la casquette de l'equipe suivie");
  });

  test("tolere les donnees manquantes", () => {
    assert.deepEqual(A.notificationsADeclencher([], new Set(), T0), []);
    assert.deepEqual(A.notificationsADeclencher(jeu({ debut: null }), new Set(), T0), []);
    assert.deepEqual(A.notificationsADeclencher(jeu({ debut: "n'importe quoi" }), new Set(), T0), []);
    assert.doesNotThrow(() => A.notificationsADeclencher(jeu(), undefined, T0));
  });

  test("la memoire des avertissements servis se purge", () => {
    const vues = {
      "1:rappel": "2026-08-05",
      "2:rappel": "2026-08-03",  // trois jours : dehors
      "3:rappel": "2026-08-04",  // deux jours : la limite, on garde
    };
    assert.deepEqual(Object.keys(A.purgerVues(vues, "2026-08-06")).sort(), ["1:rappel", "3:rappel"]);
    assert.deepEqual(A.purgerVues(undefined, "2026-08-06"), {});
  });
});

describe("ce que le reglage promet", () => {
  const t = (o) => A.texteAvertissements({ permission: "granted", actif: true, nbSuivies: 1, ...o });

  test("eteint, il annonce seulement les trois moments", () => {
    const s = t({ actif: false });
    assert.match(s, /quart d'heure.*échauffements.*première balle/s);
    assert.doesNotMatch(s, /bandeau|système/, "eteint, il ne promet aucun canal");
  });

  test("allume sans equipe suivie, il dit qu'il ne dira rien", () => {
    assert.match(t({ nbSuivies: 0 }), /Aucune équipe suivie/);
  });

  test("avec la permission, il annonce les deux canaux", () => {
    const s = t({});
    assert.match(s, /système/);
    assert.match(s, /bandeau dans la page/);
  });

  test("sans permission, il ne promet que ce qu'il peut tenir", () => {
    for (const permission of ["denied", "absent", "default"]) {
      const s = t({ permission });
      assert.match(s, /bandeau dans la page/, permission);
      assert.doesNotMatch(
        s, /notification du système quand tu es ailleurs/,
        `${permission} : promettre la banniere systeme serait mentir`);
    }
    assert.match(t({ permission: "denied" }), /bloquées/);
    assert.match(t({ permission: "absent" }), /iOS.*Android/);
    assert.match(t({ permission: "default" }), /autorise/);
  });

  test("des qu'il est allume avec une equipe, il promet toujours le bandeau", () => {
    // Le bandeau est le seul canal qui marche partout : quel que soit l'etat
    // de la permission, il doit figurer dans la promesse.
    for (const permission of ["granted", "denied", "absent", "default", "n'importe quoi"])
      assert.match(t({ permission }), /bandeau dans la page/, permission);
  });
});

describe("l'effectif d'une équipe", () => {
  const membre = (o = {}) => ({
    person: { id: 1, fullName: "Test Joueur", ...(o.person || {}) },
    jerseyNumber: o.jerseyNumber,
    position: o.position || { type: "Pitcher", abbreviation: "P", name: "Pitcher" },
    status: o.status || { description: "Active" },
  });

  test("un joueur actif ne porte aucune mention", () => {
    for (const d of ["Active", "active", "", null, undefined])
      assert.equal(A.statutEffectif(d), null, `mention parasite pour ${JSON.stringify(d)}`);
  });

  test("les indisponibilités sont traduites", () => {
    assert.equal(A.statutEffectif("Injured 10-Day"), "blessé — liste 10 jours");
    assert.equal(A.statutEffectif("Injured 60-Day"), "blessé — liste 60 jours");
    assert.equal(A.statutEffectif("Reassigned to Minors"), "en ligues mineures");
    assert.equal(A.statutEffectif("Restricted List"), "liste restreinte");
    assert.equal(A.statutEffectif("Paternity"), "congé paternité");
  });

  test("un statut inconnu passe tel quel plutôt que de disparaître", () => {
    // Taire une indisponibilite serait pire que l'afficher en anglais.
    assert.equal(A.statutEffectif("Trade Pending"), "trade pending");
  });

  test("un joueur échangé montre son total, pas ses deux matchs ici", () => {
    // Cas reel : arrive du club 147 la semaine derniere, 2 matchs joues.
    // Afficher « .000 » a cote de son nom se lirait comme une panne.
    const person = {
      stats: [{
        group: { displayName: "hitting" },
        splits: [
          { numTeams: 2, stat: { avg: ".229", homeRuns: 2 } },
          { team: { id: 147 }, stat: { avg: ".234", homeRuns: 2 } },
          { team: { id: 119 }, stat: { avg: ".000", homeRuns: 0 } },
        ],
      }],
    };
    assert.equal(A.statsSaison(person, 119).frappe.avg, ".229");
  });

  test("sans ligne de total, on retombe sur celle du club consulté", () => {
    const person = {
      stats: [{
        group: { displayName: "hitting" },
        splits: [
          { team: { id: 147 }, stat: { avg: ".200" } },
          { team: { id: 119 }, stat: { avg: ".310" } },
        ],
      }],
    };
    assert.equal(A.statsSaison(person, 119).frappe.avg, ".310");
    assert.equal(A.statsSaison(person, 147).frappe.avg, ".200");
    // Club absent des lignes : on montre la derniere plutot que rien.
    assert.equal(A.statsSaison(person, 108).frappe.avg, ".310");
  });

  test("les lignes de ligues mineures ne passent pas pour de la MLB", () => {
    const person = {
      stats: [{
        group: { displayName: "hitting" },
        splits: [
          { sport: { id: 11 }, team: { id: 260 }, stat: { avg: ".412" } },
          { sport: { id: 1 }, team: { id: 119 }, stat: { avg: ".198" } },
        ],
      }],
    };
    assert.equal(A.statsSaison(person, 119).frappe.avg, ".198");
    // Rien qu'en mineures : aucune statistique majeure a montrer.
    assert.equal(A.statsSaison({ stats: [{ group: { displayName: "hitting" },
      splits: [{ sport: { id: 11 }, stat: { avg: ".412" } }] }] }, 119).frappe, null);
  });

  test("un joueur sans apparition ne fabrique pas de statistiques", () => {
    assert.deepEqual(A.statsSaison({ stats: [] }, 119), { frappe: null, lance: null });
    assert.deepEqual(A.statsSaison(null, 119), { frappe: null, lance: null });
    assert.equal(A.statsSaison({ stats: [{ group: { displayName: "hitting" }, splits: [] }] }, 119).frappe, null);
  });

  test("le regroupement suit l'ordre d'une feuille de match", () => {
    const g = A.grouperEffectif([
      membre({ position: { type: "Outfielder", abbreviation: "CF" } }),
      membre({ position: { type: "Pitcher", abbreviation: "P" } }),
      membre({ position: { type: "Catcher", abbreviation: "C" } }),
    ]);
    assert.deepEqual(g.map((x) => x.type), ["Pitcher", "Catcher", "Outfielder"]);
    // Aucun groupe vide : on n'affiche pas un titre sans personne dessous.
    assert.ok(g.every((x) => x.membres.length > 0));
  });

  test("un type de poste inattendu n'est pas perdu", () => {
    const g = A.grouperEffectif([membre({ position: { type: "Coach", abbreviation: "X" } })]);
    assert.equal(g.length, 1);
    assert.equal(g[0].type, "Autres");
  });

  test("les joueurs sont triés par numéro de maillot", () => {
    const g = A.grouperEffectif([
      membre({ jerseyNumber: "51", person: { id: 3, fullName: "C" } }),
      membre({ jerseyNumber: "7", person: { id: 1, fullName: "A" } }),
      membre({ jerseyNumber: undefined, person: { id: 2, fullName: "B" } }),
    ]);
    assert.deepEqual(g[0].membres.map((m) => m.person.fullName), ["A", "C", "B"]);
  });

  test("chaque poste affiché a une traduction", () => {
    for (const p of ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "TWP"])
      assert.ok(A.POSTE_FR[p], `poste ${p} sans libellé français`);
  });

  test("le filtre de champs couvre ce que la vue affiche", () => {
    // Un champ absent de la liste blanche n'arrive tout simplement pas.
    for (const c of ["fullName", "jerseyNumber", "batSide", "pitchHand", "currentAge",
                     "avg", "homeRuns", "rbi", "era", "wins", "losses", "strikeOuts", "team"])
      assert.match(A.CHAMPS_EFFECTIF, new RegExp(`\\b${c}\\b`), `champ ${c} non demandé à l'API`);
  });
});
