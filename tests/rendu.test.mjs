import { test, describe } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import App, { VueNuits, VueAlmanach } from "../.test-bundle.mjs";

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

const rendre = (el) => renderToString(el);

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

