import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/* Le projet a longtemps tourne sans linteur. Ce qu'il a laisse passer :
   un `className` declare deux fois sur le meme element — le premier etait
   silencieusement jete — un `useEffect` sans tableau de dependances qui
   reconstruisait un ResizeObserver a chaque rendu, et une cle dupliquee
   dans un objet de style. Trois bugs reels, tous rattrapables ici. */

export default [
  { ignores: ["dist/", ".test-bundle.mjs", "node_modules/"] },

  js.configs.recommended,

  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // React 19 : plus besoin d'importer React pour du JSX.
      "react/react-in-jsx-scope": "off",
      // Les composants sont internes a un seul fichier et l'app n'utilise pas
      // de typage : exiger des propTypes ferait du bruit sans rien attraper.
      "react/prop-types": "off",
      // L'interface est en francais : l'apostrophe est partout. La regle vise
      // les chevrons et accolades mal echappes, pas notre cas — 25 signalements
      // pour zero bug possible.
      "react/no-unescaped-entities": "off",

      // Les trois regles qui auraient evite les bugs ci-dessus.
      "react/jsx-no-duplicate-props": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-dupe-keys": "error",

      // En erreur, pas en avertissement : un avertissement permanent est une
      // liste de taches que plus personne ne lit. Les trois exceptions du
      // fichier sont des chargements reseau — « je passe en etat chargement,
      // puis je pars chercher » — et portent chacune un `disable` motive a
      // l'endroit precis. Toute NOUVELLE occurrence casse le build, ce qui est
      // le but : c'est le motif « synchroniser deux etats React » qu'on veut
      // interdire, pas l'appel a une API distante.
      "react-hooks/set-state-in-effect": "error",
    },
  },

  // Les fichiers de configuration tournent sous Node, pas dans le navigateur.
  {
    files: ["*.config.js"],
    languageOptions: { globals: globals.node },
  },

  {
    files: ["tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.node,
    },
  },
];
