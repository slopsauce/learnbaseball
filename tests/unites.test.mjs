import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as A from "../.test-bundle.mjs";

const PARIS = "Europe/Paris";
/* Fabrique un instant UTC a partir d'une heure de New York, pour raisonner
   comme le calendrier MLB. */
const depuisNY = (iso) => new Date(new Date(`${iso}`).toISOString()).toISOString();

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
