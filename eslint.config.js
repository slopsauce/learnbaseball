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

      // Signale les appels a setState depuis un effet. Ici ce sont presque
      // tous des chargements reseau, ou le motif est legitime ; on garde
      // l'avertissement pour relire les quelques cas qui ne le sont pas,
      // sans bloquer le build sur un refactoring qui n'est pas demande.
      "react-hooks/set-state-in-effect": "warn",
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
