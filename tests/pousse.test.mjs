import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { abonnerPoussees, URL_POUSSEE, FERMETURES_DEFINITIVES } from "../src/pousse-direct.js";

/* Un faux WebSocket : on tient la poignee pour declencher a la main ce que
   la ligue enverrait. Le vrai flux ne se laisse pas piloter — il faut un
   match en cours, et il ne rejoue pas une coupure reseau sur commande. */
class FauxWS {
  static ouverts = [];
  constructor(url) {
    this.url = url;
    this.ferme = false;
    FauxWS.ouverts.push(this);
  }
  ouvrir() { this.onopen?.(); }
  pousser(o) { this.onmessage?.({ data: JSON.stringify(o) }); }
  brut(s) { this.onmessage?.({ data: s }); }
  fermer(code) { this.ferme = true; this.onclose?.({ code }); }
  close() { this.ferme = true; }
}
const fabrique = (u) => new FauxWS(u);
const dernier = () => FauxWS.ouverts[FauxWS.ouverts.length - 1];
const avis = (o = {}) => ({ gamePk: "823918", timeStamp: "20260811_041215", gameEvents: ["foul"], ...o });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* La fusion est de 300 ms et le plancher de 2 s : les attentes ci-dessous
   sont calees dessus, avec de la marge. */
const APRES_FUSION = 450;
const APRES_PLANCHER = 2300;

describe("les poussées du direct", () => {

  test("s'abonne au bon match", () => {
    FauxWS.ouverts = [];
    const fermer = abonnerPoussees(823918, { fabrique });
    assert.equal(dernier().url, `${URL_POUSSEE}823918`);
    fermer();
  });

  test("une poussée déclenche une requête, une fois", async () => {
    FauxWS.ouverts = [];
    let n = 0;
    const fermer = abonnerPoussees(823918, { surChangement: () => n++, fabrique });
    dernier().ouvrir();
    dernier().pousser(avis());
    assert.equal(n, 0, "rien ne doit partir avant la fenêtre de fusion");
    await dormir(APRES_FUSION);
    assert.equal(n, 1);
    fermer();
  });

  test("deux avis pour le même instant ne font qu'une requête", async () => {
    /* Vu sur le flux réel : un « mound_visit » et un « at_bat_start » à la
       même seconde. Deux requêtes pour le même état seraient du gâchis. */
    FauxWS.ouverts = [];
    let n = 0;
    const fermer = abonnerPoussees(823918, { surChangement: () => n++, fabrique });
    dernier().ouvrir();
    dernier().pousser(avis({ gameEvents: ["mound_visit"] }));
    dernier().pousser(avis({ gameEvents: ["at_bat_start"] }));
    await dormir(APRES_FUSION);
    assert.equal(n, 1);
    fermer();
  });

  test("un flux devenu bavard ne devient pas un marteau", async () => {
    // Le plancher de deux secondes borne le coût, quoi qu'envoie la ligue.
    FauxWS.ouverts = [];
    let n = 0;
    const fermer = abonnerPoussees(823918, { surChangement: () => n++, fabrique });
    dernier().ouvrir();
    for (let i = 0; i < 40; i++) dernier().pousser(avis());
    await dormir(APRES_FUSION);
    assert.equal(n, 1);
    // Une poussée juste après la précédente attend le plancher, elle ne
    // s'ajoute pas.
    dernier().pousser(avis());
    await dormir(APRES_FUSION);
    assert.equal(n, 1, "le plancher de 2 s n'est pas respecté");
    await dormir(APRES_PLANCHER);
    assert.equal(n, 2);
    fermer();
  });

  test("un message d'un autre match, ou illisible, ne déclenche rien", async () => {
    FauxWS.ouverts = [];
    let n = 0;
    const fermer = abonnerPoussees(823918, { surChangement: () => n++, fabrique });
    dernier().ouvrir();
    dernier().pousser(avis({ gamePk: "999999" }));
    dernier().brut("ceci n'est pas du JSON");
    await dormir(APRES_FUSION);
    assert.equal(n, 0);
    fermer();
  });

  test("la vue est prévenue quand le flux vit et quand il meurt", async () => {
    FauxWS.ouverts = [];
    const vies = [];
    const fermer = abonnerPoussees(823918, { surVie: (v) => vies.push(v), fabrique });
    dernier().ouvrir();
    assert.deepEqual(vies, [true]);
    dernier().fermer(1006);            // coupure réseau
    assert.deepEqual(vies, [true, false]);
    fermer();
  });

  test("une coupure réseau se reconnecte, un match fini non", async () => {
    /* La ligue ferme avec 4400 sur un match terminé et 4404 sur un gamePk
       inconnu — mesuré sur le vrai flux. Se reconnecter alors serait taper
       contre un mur ; sur n'importe quel autre code, au contraire, il faut
       revenir. */
    FauxWS.ouverts = [];
    const f1 = abonnerPoussees(823918, { fabrique });
    dernier().ouvrir();
    dernier().fermer(1006);
    await dormir(2200);                // la première attente est de ~1 s
    assert.equal(FauxWS.ouverts.length, 2, "une coupure réseau doit se reconnecter");
    f1();

    for (const code of FERMETURES_DEFINITIVES) {
      FauxWS.ouverts = [];
      const f2 = abonnerPoussees(823918, { fabrique });
      dernier().ouvrir();
      dernier().fermer(code);
      await dormir(2200);
      assert.equal(FauxWS.ouverts.length, 1, `le code ${code} ne doit pas relancer de connexion`);
      f2();
    }
  });

  test("fermer coupe tout, y compris une requête déjà programmée", async () => {
    FauxWS.ouverts = [];
    let n = 0;
    const fermer = abonnerPoussees(823918, { surChangement: () => n++, fabrique });
    dernier().ouvrir();
    dernier().pousser(avis());
    fermer();                          // avant la fin de la fenêtre de fusion
    await dormir(APRES_FUSION);
    assert.equal(n, 0, "une requête programmée doit être annulée");
    assert.equal(dernier().ferme, true, "la socket doit être fermée");
    // Et plus rien ne repart, même si le serveur bavarde encore.
    dernier().pousser(avis());
    await dormir(APRES_FUSION);
    assert.equal(n, 0);
  });

  test("le retour au premier plan reconnecte sans attendre", async () => {
    /* Un onglet cache voit ses minuteurs brides — jusqu'a un declenchement
       par minute. Une socket tombee pendant qu'on regardait ailleurs peut
       donc rester morte bien apres le retour, le temps que l'attente de
       reconnexion veuille bien s'ecouler. On la court-circuite.
       `document` n'existe pas sous Node : on le simule le temps du test. */
    const auditeurs = [];
    globalThis.document = {
      visibilityState: "hidden",
      addEventListener: (t, f) => t === "visibilitychange" && auditeurs.push(f),
      removeEventListener: (t, f) => {
        const i = auditeurs.indexOf(f);
        if (t === "visibilitychange" && i >= 0) auditeurs.splice(i, 1);
      },
    };
    try {
      FauxWS.ouverts = [];
      const fermer = abonnerPoussees(823918, { fabrique });
      dernier().ouvrir();
      assert.equal(auditeurs.length, 1, "l'abonnement doit écouter le retour au premier plan");

      dernier().fermer(1006);                    // la socket meurt, onglet caché
      assert.equal(FauxWS.ouverts.length, 1);
      // Onglet toujours caché : le retour ne se déclenche pas.
      auditeurs[0]();
      assert.equal(FauxWS.ouverts.length, 1, "un onglet caché ne doit rien relancer");

      globalThis.document.visibilityState = "visible";
      auditeurs[0]();
      assert.equal(FauxWS.ouverts.length, 2, "le retour au premier plan doit reconnecter tout de suite");

      // Et sur une socket vivante, le retour ne rouvre rien.
      dernier().ouvrir();
      auditeurs[0]();
      assert.equal(FauxWS.ouverts.length, 2, "une socket vivante ne doit pas être doublée");

      fermer();
      assert.equal(auditeurs.length, 0, "l'auditeur doit être retiré à la fermeture");
    } finally {
      delete globalThis.document;
    }
  });

  test("un navigateur qui refuse le WebSocket ne fait pas tomber la vue", async () => {
    /* Réseau d'entreprise, extension, mode restreint : le constructeur peut
       lever. La vue doit l'apprendre et garder son sondage, pas planter. */
    let n = 0;
    const vies = [];
    const fermer = abonnerPoussees(823918, {
      surChangement: () => n++,
      surVie: (v) => vies.push(v),
      fabrique: () => { throw new Error("WebSocket bloqué"); },
    });
    assert.deepEqual(vies, [false]);
    await dormir(APRES_FUSION);
    assert.equal(n, 0);
    fermer();                          // ne doit pas lever non plus
  });
});
