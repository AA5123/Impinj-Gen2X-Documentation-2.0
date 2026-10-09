/**
 * THE FXR60 / FXR90 REST REFERENCE — Scalar's API Reference, bundled rather than script-injected.
 *
 * WHY THIS IS NOT `@scalar/docusaurus`, AND THE EVIDENCE FOR IT. The official Docusaurus integration
 * was tried first and abandoned for a reason that is not a matter of taste; it is written down here
 * because "use the official integration" is otherwise the right default and a later reader deserves
 * to know why it was not followed.
 *
 *   1. IT LOADS THE RENDERER FROM AN UNPINNED THIRD-PARTY CDN. `@scalar/docusaurus`'
 *      `injectHtmlTags()` emits `<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference">`
 *      with no version and no `integrity`. This repository has already ruled on exactly that pattern
 *      — see the `scripts:` block in docusaurus.config.ts, where the PushFeedback bundle was pinned
 *      and SRI'd because an unversioned jsDelivr URL "resolves to whatever … published most
 *      recently", so an upstream release breaks the page "with no repo change, no build failure and
 *      no CI signal". Here the script IS the reference, so that failure takes all 73 operations, and
 *      the reference also stops working offline.
 *   2. IT LOADS IT ON EVERY PAGE. `injectHtmlTags` has no route scoping: `preBodyTags` goes into all
 *      ~290 generated pages. The bundle is 3.7 MB, parser-blocking, to serve one route.
 *   3. AND ITS SELF-HOSTED ESCAPE HATCH CANNOT BE ROUTE-SCOPED — this is the part that settles it.
 *      The plugin's `cdn` option can point at a vendored copy of `dist/browser/standalone.js`, but
 *      that file is a CLASSIC script whose top-level `let`/`const` declarations live in the shared
 *      global lexical scope. Loaded after this site's own classic bundles it throws
 *      "Identifier 'r' has already been declared" and defines nothing — verified in a browser, both
 *      as a classic script and as `type="module"`, on a fresh page. It only works when it executes
 *      BEFORE the site's scripts, which is precisely what `preBodyTags` buys and what route-scoping
 *      gives up. So with that plugin, "pinned" and "route-scoped" are mutually exclusive.
 *
 * WHAT IS USED INSTEAD IS THE SAME CODE THE CDN SERVES. `@scalar/api-reference` — the package
 * jsDelivr resolves that URL to — exports `createApiReference` from its ESM entry. Importing it means
 * the bundler owns it: module scope instead of global scope (so no identifier collisions), a route
 * chunk instead of a site-wide script, the version pinned by package-lock.json, real types, and it
 * behaves the same in `docusaurus start` and in a production build. src/components/ScalarApiReference
 * does the import; this plugin only registers the route and supplies the document.
 *
 * ONE `exact: true` ROUTE SERVES ALL 73 OPERATIONS, and that is a property of Scalar rather than a
 * compromise: it addresses operations with a FRAGMENT (`#tag/<tag>/<METHOD><path>`), which never
 * reaches the server. The renderer this replaced needed 73 prerendered shell routes so that GitHub
 * Pages had a file to serve at each deep link. This needs none.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeUrl } from '@docusaurus/utils';
import { parse as parseYaml } from 'yaml';

const PLUGIN_NAME = 'ziotc-scalar-api-reference';

/** Our route component, resolved from this file so it does not depend on the caller's cwd. */
const COMPONENT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'components',
  'ScalarApiReference',
  'index.tsx',
);

/**
 * @param {import('@docusaurus/types').LoadContext} context
 * @param {{specPath: string, routeBasePath: string}} options
 * @returns {import('@docusaurus/types').Plugin}
 */
export default function scalarApiReference(context, options) {
  const { siteDir, baseUrl } = context;
  const { specPath, routeBasePath } = options;

  if (!specPath || !routeBasePath) {
    throw new Error(`${PLUGIN_NAME}: both 'specPath' and 'routeBasePath' are required options.`);
  }

  const absoluteSpecPath = path.resolve(siteDir, specPath);
  const routePath = normalizeUrl([baseUrl, routeBasePath]);

  return {
    name: PLUGIN_NAME,

    // `docusaurus start` must restart the reference when the vendor document changes. Nothing else on
    // the site reads it any more, so this is the only watch that would notice.
    getPathsToWatch() {
      return [absoluteSpecPath];
    },

    async loadContent() {
      // THE DOCUMENT IS HANDED TO SCALAR AS TEXT, AND NEVER MUTATED. Scalar's `content` option
      // accepts a raw YAML string, and unlike the renderer this replaced it needs no edit to supply
      // a base URL — that is what Scalar's `servers` configuration option is for. So
      // api/rest/schema/rest_api.yaml, read-only by the rule in its own README and frozen in
      // .gitattributes, stays untouched even in memory.
      let document;
      try {
        document = fs.readFileSync(absoluteSpecPath, 'utf8');
      } catch (err) {
        throw new Error(
          `${PLUGIN_NAME}: cannot read the OpenAPI document at ${specPath} `
            + `(${err instanceof Error ? err.message : String(err)}). The reference renders this `
            + 'document and has no other source, so the build stops here rather than publishing an '
            + 'empty page.',
        );
      }

      // IT IS ALSO PARSED, FOR SOMETHING SCALAR DOES NOT DO ITSELF: a server-rendered index of the
      // operations, with the anchor of each. Three things need it, and the third is why it is not
      // optional.
      //   1. `onBrokenAnchors: 'throw'` is a site-wide gate, and Docusaurus can only see anchors in
      //      PRERENDERED html. Scalar mounts in the browser, so without this the 26 per-operation
      //      links in the hand-written REST pages fail the build, and the only alternatives are to
      //      relax the gate for all ~290 pages or to give up deep links from prose. Emitting the
      //      real anchor ids is neither a workaround nor decoration: the anchors genuinely exist.
      //   2. It gives readers without JavaScript, and crawlers, an actual list of the 73 operations.
      //      Both previous renderers lost per-operation crawlability; this returns part of it.
      //   3. It is what the reader sees for the moment before a 1.5 MB renderer finishes loading,
      //      instead of an empty panel.
      // Scalar mounts INTO the element that holds this list and replaces it, so it costs nothing
      // once the renderer is up.
      let parsed;
      try {
        parsed = parseYaml(document);
      } catch (err) {
        throw new Error(
          `${PLUGIN_NAME}: ${specPath} is not parseable YAML `
            + `(${err instanceof Error ? err.message : String(err)}), so the reference would render `
            + "Scalar's parse-failure state on load. Fixed by replacing the document.",
        );
      }

      const METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options']);
      // Scalar's anchor for an operation, verified against the ids its renderer emits:
      //   tag/<tag lowercased, '&' removed>/<METHOD><path>
      // It keys on METHOD + PATH and never on `operationId`, which is why the two "Purge Log"
      // operations — identical summaries, no operationId, the pair the previous generator silently
      // dropped one of — get distinct anchors for free.
      const tagSlug = (name) => String(name).toLowerCase().replaceAll('&', '');
      const operations = [];
      for (const [route, item] of Object.entries(parsed?.paths ?? {})) {
        for (const [method, operation] of Object.entries(item ?? {})) {
          if (!METHODS.has(method)) continue;
          const tag = operation?.tags?.[0];
          if (!tag) continue;
          operations.push({
            anchor: `tag/${tagSlug(tag)}/${method.toUpperCase()}${route}`,
            method: method.toUpperCase(),
            path: route,
            summary: operation.summary ?? '',
            tag: String(tag),
          });
        }
      }

      if (operations.length === 0) {
        throw new Error(
          `${PLUGIN_NAME}: ${specPath} parsed but yielded no tagged operations, so the reference `
            + 'would publish an empty index. Check that the document has `paths` and that its '
            + 'operations carry `tags`.',
        );
      }

      return { document, operations };
    },

    async contentLoaded({ content, actions }) {
      const { addRoute, createData } = actions;

      // The document travels as ROUTE DATA rather than as a fetch. webpack loads it with the route's
      // chunk, so there is one request, no CORS surface, and no copy of the 566 KB vendor YAML under
      // static/ (which would also need an entry in lint-static-orphans' reference scan).
      const documentPath = await createData('openapi.yaml.json', JSON.stringify(content.document));
      const operationsPath = await createData(
        'operations.json',
        JSON.stringify(content.operations),
      );

      addRoute({
        path: routePath,
        component: COMPONENT,
        // Scalar deep-links with a fragment, so there is nothing below this path for the server to
        // serve and nothing to prerender per operation.
        exact: true,
        modules: { document: documentPath, operations: operationsPath },
      });
    },
  };
}
