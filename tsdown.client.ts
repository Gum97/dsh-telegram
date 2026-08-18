/**
 * Client bundle build.
 *
 * DSH's browser plugins are not ES modules: the page loads a script that calls
 * `window.__ModuleLoader__.load({ id, factory })` to REGISTER a factory, and the
 * factory body runs later, at materialization. Every shared dependency —
 * React, the slot registry, the UI primitives — must therefore stay an external
 * `require(...)` call resolved by the page's loader. Bundling React into a
 * plugin would give the card its own React instance, and hooks would fail at
 * runtime with an error that points nowhere near the cause.
 *
 * The upstream `clientBundle` preset that does this lives inside the DSH
 * monorepo and is not published, so this file reproduces its contract. That is
 * an acknowledged gap in the plugin story, documented in
 * `dsh-client-ui-settings-plugins`' own README under Known Limitations.
 */

import { defineConfig } from 'tsdown';

/** Every module id the page's loader already provides. */
const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-api-remotes',
];

export default defineConfig({
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  // `.js`, not `.cjs`: the page loads this with a <script> tag, and the
  // package's own `type: module` must not make the browser treat it as ESM.
  outExtensions: () => ({ js: '.js' }),
  format: 'cjs',
  platform: 'browser',
  external: EXTERNALS,
  dts: false,
  clean: false,
  treeshake: true,
  outputOptions: {
    // The loader hands the factory its own `require`; emitting a bare CJS body
    // and wrapping it here is what turns a normal build into a registration.
    banner: `window.__ModuleLoader__.load({\n\tid: "dsh-telegram",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;`,
    footer: `\t\treturn module.exports;\n\t}\n});`,
  },
});
