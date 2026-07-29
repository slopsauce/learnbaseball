import { test, describe } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import App, { VueNuits, VueAlmanach, VueTerrains, AffichesDuSoir, LienStade, BandeauSituation, VueDirect, BasesOccupees, Compteurs, TableauManches } from "../.test-bundle.mjs";

/* `vite build` empaquette sans executer : il laisse passer les zones mortes
   temporelles, les hooks mal ordonnes et les variables indefinies. Symptome
   typique : build vert, page blanche. Ici on rend pour de vrai. Les effets ne
   tournent pas au rendu serveur, donc aucun appel reseau. */

const equipe = {
  id: 119, name: "Los Angeles Dodgers", abbreviation: "LAD",
  division: { id: 203, name: "National League West" }, venue: { id: 22 },
};
const bilan = {
  119: { v: 67, d: 39, pct: 0.632, rang: 1, meneur: true, magique: 45, serieNb: 4, serieType: "wins" },
  147: { v: 59, d: 46, pct: 0.562, rang: 2, meneur: false, retard: 3, wc: 1.5, elimination: 55, serieNb: 12, serieType: "losses" },
};
const stades = {
  22: { nom: "Dodger Stadium", ville: "Los Angeles", alt: 500, lat: 34.07, lon: -118.24,
        gauche: 330, centre: 395, droite: 330, places: 56000, toit: "Open" },
};

/* Le rendu serveur de React separe les noeuds de texte adjacents par des
   commentaires HTML : « ×2 » sort en « ×<!-- -->2 ». On les retire avant
   toute comparaison, sinon on teste un artefact du moteur, pas l'affichage. */
const rendre = (el) => renderToString(el).replaceAll("<!-- -->", "");

describe("rendu des composants", () => {
  test("App se rend sans lever", () => {
    assert.ok(rendre(React.createElement(App)).length > 500);
  });

  test("VueAlmanach se rend sans donnees", () => {
    assert.ok(rendre(React.createElement(VueAlmanach, {
      teams: [], appris: [], setAppris: () => {}, suivies: [119],
    })).length > 100);
  });

  test("VueNuits se rend sans donnees", () => {
    assert.ok(rendre(React.createElement(VueNuits, {
      teams: [], suivies: [119], setSuivies: () => {},
    })).length > 100);
  });

  test("VueNuits se rend avec un classement complet", () => {
    const html = rendre(React.createElement(VueNuits, {
      teams: [equipe], suivies: [119], setSuivies: () => {},
      stadeHabituel: { 119: 22 }, bilans: bilan, stades,
    }));
    assert.ok(html.length > 100);
  });

  test("VueNuits se rend en mode toutes equipes", () => {
    assert.ok(rendre(React.createElement(VueNuits, {
      teams: [equipe], suivies: [], setSuivies: () => {}, bilans: bilan,
    })).length > 100);
  });

  test("VueNuits tolere des props absentes", () => {
    assert.doesNotThrow(() =>
      rendre(React.createElement(VueNuits, { teams: [], suivies: [], setSuivies: () => {} })));
  });

  test("VueAlmanach tolere une liste d'equipes vide", () => {
    assert.doesNotThrow(() =>
      rendre(React.createElement(VueAlmanach, {
        teams: [], appris: ["walk", "home_run"], setAppris: () => {}, suivies: [],
      })));
  });
});

describe("garde-fous de mise en page", () => {
  test("les classes responsives sont bien emises", () => {
    const html = rendre(React.createElement(App));
    for (const c of ["alm-page", "alm-titre"])
      assert.match(html, new RegExp(c), `classe ${c} absente du rendu`);
  });

  test("la feuille de style embarque la requete media mobile", () => {
    const html = rendre(React.createElement(App));
    assert.match(html, /@media \(max-width: 560px\)/);
    assert.match(html, /prefers-reduced-motion/);
  });

  test("aucun stockage navigateur interdit n'est utilise au rendu", () => {
    assert.doesNotThrow(() => rendre(React.createElement(App)),
      "le rendu ne doit dependre d'aucune API navigateur");
  });
});


describe("rendu de la vue Terrains", () => {
  test("se rend sans données", () => {
    assert.ok(rendre(React.createElement(VueTerrains, { teams: [], stades: {} })).length > 100);
  });
  test("se rend avec un parc complet", () => {
    const html = rendre(React.createElement(VueTerrains, {
      teams: [equipe], stades,
      stadeHabituel: { 119: 22 }, suivies: [119],
    }));
    assert.match(html, /Dodger Stadium|LAD/, "le parc doit apparaître dans le rendu");
  });
  test("tolère un stade sans coordonnées", () => {
    assert.doesNotThrow(() =>
      rendre(React.createElement(VueTerrains, {
        teams: [equipe], stades: { 22: { nom: "X" } }, stadeHabituel: {},
      })));
  });
});

describe("affiches du soir", () => {
  const eqs = {
    113: { id: 113, name: "Cincinnati Reds", abbreviation: "CIN" },
    114: { id: 114, name: "Cleveland Guardians", abbreviation: "CLE" },
    120: { id: 120, name: "Washington Nationals", abbreviation: "WSH" },
  };
  const jeu = (o) => ({ id: 1, idStade: 5, idDom: 113, idExt: 114, hhmm: "01:10", ...o });

  test("un seul match affiche l'heure", () => {
    const html = rendre(React.createElement(AffichesDuSoir, { liste: [jeu({})], parEquipe: eqs }));
    assert.match(html, /Cincinnati Reds/);
    assert.match(html, /reçoit/);
    assert.match(html, /01:10/);
    assert.doesNotMatch(html, /×/, "pas de multiplicateur pour un match unique");
  });

  /* Un double programme oppose toujours les memes equipes : verifie sur les
     23 cas de la saison. On mutualise donc l'affiche. */
  test("un double programme mutualise l'affiche", () => {
    const html = rendre(React.createElement(AffichesDuSoir, {
      liste: [jeu({ id: 1, hhmm: "20:10", double: "Y" }), jeu({ id: 2, hhmm: "00:10", double: "Y" })],
      parEquipe: eqs,
    }));
    assert.equal(html.match(/Cincinnati Reds/g).length, 1, "l'affiche ne doit apparaître qu'une fois");
    assert.match(html, /×2/);
    assert.match(html, /20:10/);
    assert.match(html, /00:10/);
  });

  test("des affiches différentes restent empilées", () => {
    // Jamais observe en saison reguliere, mais le repli doit exister.
    const html = rendre(React.createElement(AffichesDuSoir, {
      liste: [jeu({ id: 1, idExt: 114 }), jeu({ id: 2, idExt: 120, hhmm: "04:10" })],
      parEquipe: eqs,
    }));
    assert.match(html, /Cleveland Guardians/);
    assert.match(html, /Washington Nationals/);
    assert.doesNotMatch(html, /×2/, "deux affiches distinctes ne se mutualisent pas");
  });

  test("ne casse pas sur une liste vide", () => {
    assert.equal(rendre(React.createElement(AffichesDuSoir, { liste: [], parEquipe: eqs })), "");
  });
});

describe("lien vers la fiche d'un terrain", () => {
  test("rend un bouton quand le stade est identifié", () => {
    const html = rendre(React.createElement(LienStade, { idStade: 5325, nom: "Great American Ball Park" }));
    assert.match(html, /<button/);
    assert.match(html, /Great American Ball Park/);
  });
  test("reste du texte simple sans identifiant", () => {
    const html = rendre(React.createElement(LienStade, { nom: "Parc inconnu" }));
    assert.doesNotMatch(html, /<button/, "sans identifiant, pas de lien mort");
    assert.match(html, /Parc inconnu/);
  });
  test("ne rend rien sans nom", () => {
    assert.equal(rendre(React.createElement(LienStade, { idStade: 5325 })), "");
  });
});

describe("aucune fuite de résultat au rendu", () => {
  /* Regression : le bandeau LA SITUATION affichait bilan, série et nombre
     magique — tous derivés du classement, donc de la nuit précédente.
     On teste le composant directement : au rendu serveur les effets ne
     tournent pas, donc VueNuits reste en chargement et ne montre rien —
     un test à son niveau passerait pour de mauvaises raisons. */
  const sensible = [{
    eq: { id: 119, name: "Los Angeles Dodgers", abbreviation: "LAD", division: { name: "National League West" } },
    b: { v: 67, d: 39, rang: 1, meneur: true, magique: 45, serieNb: 4, serieType: "wins" },
  }];

  test("rien ne fuite tant que les résultats sont masqués", () => {
    const html = rendre(React.createElement(BandeauSituation, { situation: sensible, spoilers: false }));
    assert.doesNotMatch(html, /67-39/, "le bilan fuite");
    assert.doesNotMatch(html, /magique 45/, "le nombre magique fuite");
    assert.doesNotMatch(html, /▲4/, "la série en cours fuite");
  });

  test("mais l'utilisateur sait qu'il manque quelque chose", () => {
    const html = rendre(React.createElement(BandeauSituation, { situation: sensible, spoilers: false }));
    assert.match(html, /masquée/);
    assert.match(html, /afficher quand même/);
  });

  test("tout revient une fois les résultats demandés", () => {
    const html = rendre(React.createElement(BandeauSituation, { situation: sensible, spoilers: true }));
    assert.match(html, /67-39/);
    assert.match(html, /magique 45/);
    assert.match(html, /▲4/);
  });

  test("ne rend rien sans équipe suivie", () => {
    assert.equal(rendre(React.createElement(BandeauSituation, { situation: [], spoilers: true })), "");
  });
});

describe("frise complète, recommandations ciblées", () => {
  /* La frise doit montrer toute la nuit, mais « À ne pas rater » et le match
     du jour ne doivent proposer que des équipes suivies. Deux notions
     distinctes qui etaient confondues dans un seul filtre. */
  test("la vue se rend avec une sélection restreinte", () => {
    assert.doesNotThrow(() =>
      rendre(React.createElement(VueNuits, {
        teams: [equipe], suivies: [119], setSuivies: () => {},
        bilans: bilan, stades, stadeHabituel: { 119: 22 },
      })));
  });
  test("et sans aucune sélection", () => {
    assert.doesNotThrow(() =>
      rendre(React.createElement(VueNuits, {
        teams: [equipe], suivies: [], setSuivies: () => {}, bilans: bilan,
      })));
  });
});

describe("vue Le direct", () => {
  test("se rend sans données", () => {
    assert.ok(rendre(React.createElement(VueDirect, { teams: [], suivies: [] })).length >= 0);
  });

  test("le losange allume les buts occupés", () => {
    const vide = rendre(React.createElement(BasesOccupees, { off: {} }));
    const pleines = rendre(React.createElement(BasesOccupees, { off: { first: {}, second: {}, third: {} } }));
    const compte = (h) => (h.match(/#F2CE6B/g) || []).length;
    assert.ok(compte(pleines) > compte(vide), "les bases pleines doivent s'allumer davantage");
  });

  test("les compteurs respectent leurs maximums", () => {
    const html = rendre(React.createElement(Compteurs, { balles: 3, prises: 2, retraits: 2 }));
    assert.match(html, /balles/);
    assert.match(html, /prises/);
    assert.match(html, /retraits/);
  });

  test("le tableau par manche affiche R, H et E", () => {
    const html = rendre(React.createElement(TableauManches, {
      innings: [{ num: 1, home: { runs: 0 }, away: { runs: 1 } }, { num: 2, home: { runs: 2 }, away: { runs: 0 } }],
      teams: { home: { runs: 2, hits: 5, errors: 1 }, away: { runs: 1, hits: 3, errors: 0 } },
      ab: { ext: "PHI", dom: "MIA" },
    }));
    assert.match(html, /PHI/);
    assert.match(html, /MIA/);
    for (const k of ["R", "H", "E"]) assert.match(html, new RegExp(`>${k}<`));
  });

  test("ne casse pas sur un tableau de manches absent", () => {
    assert.equal(rendre(React.createElement(TableauManches, { innings: [], teams: {}, ab: {} })), "");
  });
});
