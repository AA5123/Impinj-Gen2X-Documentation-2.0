import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Config, LoadContext } from '@docusaurus/types';
import datumPrismTheme from './src/prism/datum-prism-theme';
import type * as Preset from '@docusaurus/preset-classic';
/* TYPE-ONLY, so nothing is imported at runtime — this file is loaded by Node at build
   time and `src/components/siteSections` is client code. It exists to check the two
   `sidebarId` values below against the sidebar names `sidebars/*.ts` actually declares. */
import type { SidebarName } from './src/components/siteSections';

/**
 * THE TWO API VERSIONS THE SIDEBAR HEADER PRINTS, read from the specifications rather
 * than typed into a component.
 *
 * WHY AT BUILD TIME AND FROM THESE FILES. The owner's rule is "version numbers taken from
 * their respective packages, and only for API reference pages". The authority for what
 * version an API is at is the document that describes it, not a constant somewhere in the
 * theme: `api/rest/schema/rest_api.yaml` and `api/mqtt/schema/openapi.json` are both
 * vendor-supplied inputs this repo already treats as read-only, and both carry `info.version`.
 * Reading them here means the header cannot drift from the reference it labels — a spec bump
 * moves the badge with it, with no second place to remember.
 *
 * ONE OF THEM IS NOT JSON, which is why this is two readers and not a loop. The REST spec is
 * YAML; `yaml` is already a dependency (the Scalar route parses nothing, but the package is
 * present for exactly this kind of build-time read).
 *
 * BOTH ARE READ AS TEXT AND NEVER WRITTEN. Same rule the Scalar plugin follows for the same
 * file.
 */
function specVersion(file: string, kind: 'json' | 'yaml'): string {
  // GUARDED, because an absent spec used to take the WHOLE SITE down at config load.
  // readFileSync here had no existsSync in front of it, and specVersion is called
  // unconditionally while Docusaurus loads this file — so a missing spec threw a bare
  // ENOENT from this line before a single page rendered, taking the guides and the REST
  // reference with it. Verified by moving the file aside and building: the build died
  // with `[ERROR] Error: ENOENT ... at specVersion (docusaurus.config.ts:32)`, ahead of
  // any other output. That mattered because the MQTT spec is being replaced, and the
  // generator's own gate cannot see this dependency: `gen:check` reported clean with the
  // file absent, so nothing between here and a full build would have warned.
  //
  // Now a missing spec costs the badge and nothing else. The sidebar header treats an
  // empty string as "no version to show", which is the honest rendering: the version of
  // an API is a fact about its spec, so with no spec there is no fact to print.
  if (!fs.existsSync(file)) {
    console.warn(
      `[apiVersions] ${file} is absent — the sidebar version badge for it will be blank. ` +
      `If this is unexpected, the spec moved rather than the badge breaking.`);
    return '';
  }
  const raw = fs.readFileSync(file, 'utf8');
  const doc = kind === 'json' ? JSON.parse(raw) : YAML.parse(raw);
  const v = doc?.info?.version;
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`No info.version in ${file} — the sidebar header reads it from there.`);
  }
  return normaliseVersion(v, file);
}

/**
 * `vMAJOR.MINOR.PATCH`, always, whatever the spec happened to write.
 *
 * The two specs disagree about the shape of their own version — MQTT says `2`, REST says
 * `3.0.0` — and left alone the sidebar would print `v2` under one reference and `v3.0.0`
 * under the other. Two badges in the same position, in the same style, reading at different
 * lengths, invites the reader to wonder what the difference means. It means nothing: an
 * omitted component is zero, so `2` and `2.0.0` are the same version.
 *
 * NORMALISED HERE RATHER THAN IN THE SPECS because neither file is ours — they are
 * vendor-supplied inputs this repo treats as read-only — and not in the component, because
 * the component's job is to place the string, not to decide what a version looks like.
 *
 * A pre-release or build suffix (`3.1.0-rc.2`, `2+build.7`) is preserved and rides after the
 * padded core, since dropping it would state a version the spec is explicitly not at.
 */
function normaliseVersion(raw: string, file: string): string {
  const trimmed = raw.trim().replace(/^v/i, '');

  // Split the numeric core off any `-prerelease` / `+build` tail before padding, so the
  // padding counts released components and not the dots inside `rc.2`.
  const [, core = '', suffix = ''] = /^([0-9.]*)(.*)$/.exec(trimmed) ?? [];
  const parts = core.split('.').filter((p) => p.length > 0);

  if (parts.length === 0 || parts.length > 3) {
    throw new Error(
      `info.version in ${file} is "${raw}", which is not a version this can pad to ` +
        `vMAJOR.MINOR.PATCH. Fix the spec, or teach normaliseVersion the new shape.`,
    );
  }

  // An absent component is zero — that is what the omission already means.
  while (parts.length < 3) {
    parts.push('0');
  }

  return `v${parts.join('.')}${suffix}`;
}

/**
 * THE DOCS SIDEBAR'S COLLAPSED STATE, READ BEFORE THE PAGE EVER PAINTS — the same job
 * theme-classic already does for colour, extended to this site's own persistence key.
 *
 * WHY A SCRIPT AND NOT A REACT EFFECT. A static/SSG build has no access to any given
 * reader's `localStorage` at build time, so the server-rendered HTML can only ever guess
 * "expanded" (the default). If the READER's own preference is only applied once React
 * hydrates — a `useEffect`, or even a `useLayoutEffect`, still runs after the browser has
 * already painted that server-rendered HTML at least once — the sidebar would render at
 * 300px for however long the page takes to load and hydrate, then snap to 48px: exactly the
 * Cumulative Layout Shift this exists to prevent, and on a slow connection not a subtle one.
 * theme-classic solves the identical problem for `data-theme` by injecting an inline
 * `<script>` as a `preBodyTag` (see its own `injectHtmlTags()`, node_modules/@docusaurus/
 * theme-classic/lib/index.js) — synchronous, so it runs and finishes WHILE THE BROWSER IS
 * STILL PARSING THE DOCUMENT, before there is a `<body>` to paint at all. This plugin does
 * the same thing for the sidebar's own attribute, `data-sidebar-collapsed`, which
 * `src/css/sidebar.scss` reads to pin the sidebar's (and the footer's) width on the very
 * first frame — see that file's own note on why the width still has to be handled this way
 * even though the icon-only CONTENT treatment (labels, carets, …) is React's, not CSS's.
 *
 * `matchMedia` GUARDS THE DESKTOP-ONLY SCOPE at the source, matching `src/css/sidebar.scss`'s
 * own `@media (min-width: 997px)` wrapper on the CSS side — belt and suspenders, not a
 * second decision: below that width the rail does not exist (an off-canvas drawer instead),
 * so the attribute would be inert there regardless, but there is no reason to set a
 * misleading one.
 *
 * `try/catch`, matching every inline script theme-classic ships alongside this one:
 * `localStorage` throws in a handful of real environments (Safari private mode with storage
 * fully disabled, some locked-down enterprise browsers) rather than merely returning `null`,
 * and a thrown error in a blocking `<head>` script would abort the rest of the page's
 * parsing. Falling through to "do nothing" — the sidebar stays expanded, the site's own
 * default — is the correct failure mode, not a site that will not load.
 */
function sidebarCollapsedPreHydrationPlugin() {
  return {
    name: 'sidebar-collapsed-pre-hydration',
    injectHtmlTags() {
      return {
        preBodyTags: [
          {
            tagName: 'script' as const,
            innerHTML: `(function() {
  try {
    if (
      window.matchMedia('(min-width: 997px)').matches &&
      window.localStorage.getItem('docs.sidebar.collapsed') === 'true'
    ) {
      document.documentElement.setAttribute('data-sidebar-collapsed', 'true');
    }
  } catch (err) {}
})();`,
          },
        ],
      };
    },
  };
}

/**
 * THE ONE WEBFONT THE FIRST PAINT ACTUALLY NEEDS, REQUESTED IN THE FIRST ROUND TRIP.
 *
 * THE BUG THIS FIXES, measured rather than assumed. `src/css/fonts.scss` serves Inter from this
 * origin with `font-display: swap`, backed by a metric-matched `'Inter Fallback'` face (see that
 * file's own `size-adjust` note). The vertical metrics match, so a swap costs no reflow of line
 * boxes — but per-glyph ADVANCE WIDTHS still differ, so any centred, content-sized box changes
 * width when the real face lands. On the homepage that is the hero: measured, the `<h1>` goes
 * 723.8px -> 754.1px and re-centres, moving its left edge ~15px, and the eyebrow above it moves
 * 9px the other way.
 *
 * WHETHER A READER SEES IT DEPENDS ENTIRELY ON WHETHER THE FONT BEATS FIRST PAINT, and without a
 * preload that is a race this site loses on exactly the connections that matter. A `url()` inside
 * a stylesheet is not discoverable until that stylesheet has been downloaded AND parsed AND the
 * font matched during layout, which on a slow link is very late in the load. Measured on the
 * built site, Chromium, cold cache, CDP-throttled Fast-3G (1.6 Mbps / 150 ms RTT), two runs each:
 *
 *     without preload   FCP 9620 / 9592 ms   Inter arrives 10503 / 10478 ms   -> 883 / 886 ms
 *                       AFTER first paint: the hero paints in the fallback, then visibly reflows.
 *                       Layout Instability records it, 0.00075 per load.
 *     with preload      FCP 9448 / 9472 ms   Inter arrives  1726 / 1695 ms    -> ~7.7 s BEFORE
 *                       first paint: the fallback never paints, so there is nothing to swap.
 *                       Layout Instability records 0.00000.
 *
 * So the constraint was DISCOVERY, not bandwidth — the face is 47 KB, about a quarter-second of
 * transfer on that link, and moving its request into the first round trip cost nothing measurable
 * at first paint (9620 -> 9448 ms, inside run-to-run noise) while removing the swap entirely. On a
 * fast connection the font already won this race (arriving ~580 ms against a ~2 s first paint,
 * because main-thread bundle work is what delays paint there), which is why this never reproduced
 * locally and why the earlier audits that looked only at a warm or unthrottled load found nothing.
 *
 * ONE FACE, DELIBERATELY. `latin` is the only subset an English page touches (`latin-ext` carries
 * accented and extended forms this content does not use — see the `unicode-range` pairs in
 * fonts.scss, which are load-bearing for exactly this reason), so preloading it alone is what
 * removes the visible swap. Preloading `latin-ext` too would add 85 KB of high-priority bytes for
 * glyphs no reader here renders, and IBM Plex Mono's four faces are code-block type: below the
 * fold on the pages that have any, and monospace advance widths are uniform by construction, so a
 * mono swap moves nothing horizontally. Adding faces here is not free — each one competes with the
 * CSS it now shares the first round trip with.
 *
 * WHY `postBuild` AND NOT `injectHtmlTags`, which is where a `<link>` would normally go. The face
 * is a bundled asset, so its emitted filename carries a content hash
 * (`inter-400_700-latin-<32 hex>.woff2`) that is not known while HTML tags are being collected —
 * it is decided by the bundler. The alternatives were both worse: hardcoding a `static/` path into
 * `@font-face` would put this site's `baseUrl` into a stylesheet (nothing in src/css does that
 * today, and this file already warns what it costs to duplicate a URL this repo single-sources)
 * and would drop the content hash that makes the font immutably cacheable. Reading the real
 * emitted filename after the build keeps both properties and cannot drift from what shipped.
 *
 * `crossorigin` IS REQUIRED AND IS NOT A COPY-PASTE ARTEFACT, even though this is same-origin:
 * fonts are always fetched in CORS mode, so a preload without it is a DIFFERENT cache entry from
 * the one `@font-face` will ask for, and the file downloads twice. Verified in the browser after
 * shipping this: exactly one request for the face, `initiatorType: 'link'`.
 *
 * THROWS IF THE FACE IS MISSING rather than skipping quietly, the same posture `specVersion`
 * above takes: a silent no-op here would look identical to a working preload while the bug it
 * fixes had come back. If fonts.scss ever renames or re-subsets Inter, this fails the build and
 * names the file it was looking for.
 */
function interFontPreloadPlugin(context: LoadContext) {
  const {baseUrl} = context.siteConfig;
  return {
    name: 'inter-font-preload',
    async postBuild({outDir}: {outDir: string}) {
      const fontsDir = path.join(outDir, 'assets', 'fonts');
      const entries = await fs.promises.readdir(fontsDir);
      // `latin`, never `latin-ext`: the ext file is `inter-400_700-latin-ext-<hash>.woff2`, whose
      // segment after `latin-` is not hex, so this pattern excludes it by construction.
      const face = entries.find((f) => /^inter-400_700-latin-[0-9a-f]+\.woff2$/.test(f));
      if (!face) {
        throw new Error(
          `[inter-font-preload] No inter-400_700-latin-<hash>.woff2 in ${fontsDir}. ` +
            `src/css/fonts.scss is what emits it — if that face was renamed or re-subsetted, ` +
            `update this plugin's pattern rather than deleting it: it is what keeps the hero ` +
            `from reflowing on a slow first load.`,
        );
      }

      const href = `${baseUrl}assets/fonts/${face}`;
      const tag = `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>`;

      const htmlFiles: string[] = [];
      const walk = async (dir: string): Promise<void> => {
        for (const entry of await fs.promises.readdir(dir, {withFileTypes: true})) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.name.endsWith('.html')) {
            htmlFiles.push(full);
          }
        }
      };
      await walk(outDir);

      let patched = 0;
      await Promise.all(
        htmlFiles.map(async (file) => {
          const html = await fs.promises.readFile(file, 'utf8');
          // Idempotent: a re-run over an already-patched tree changes nothing.
          if (html.includes(href) || !html.includes('</head>')) {
            return;
          }
          await fs.promises.writeFile(file, html.replace('</head>', `${tag}</head>`), 'utf8');
          patched += 1;
        }),
      );

      console.log(
        `[inter-font-preload] ${face} preloaded in ${patched}/${htmlFiles.length} pages.`,
      );
    },
  };
}

// remark-d2 is ESM-only; Docusaurus' config-loader (jiti) chokes on
// top-level await, so we wrap the whole config in an async default
// export and resolve the dynamic import inside it.

export default async function createConfig(): Promise<Config> {
  const remarkD2 = (await import('remark-d2')).default;

  // The FXR REST reference route. Loaded the same way as remark-d2 — a dynamic import inside the
  // async factory — because that is the pattern this file already proves works under the config
  // loader, and because the plugin is ESM.
  //
  // TRIAL 2 OF 2. `docusaurus-plugin-openapi-docs` was replaced by @stoplight/elements on
  // 2026-08-18 and by Scalar on the same day; the Elements implementation is preserved on the
  // `try/stoplight-elements` branch so the two can be compared rather than remembered. What went
  // with Elements: its 300 KB scoped stylesheet and the generator that produced it
  // (scripts/site/scope-elements-css.mjs), its CI drift gate, the url/buffer/process browser shims
  // and the react/react-dom overrides its dependency tree needed, and the 73 prerendered deep-link
  // shells. Scalar deep-links with a hash, so it needs none of them.
  const scalarApiReference = (await import('./plugins/scalar-api-reference/index.mjs')).default;

  // Site base URL. remark-d2's linkPath must include this prefix or
  // generated img src attributes will skip /zebra-handheld-rfid-iotc/
  // and 404 in production. Define once and reference below.
  const baseUrl = '/';
  const d2LinkPath = `${baseUrl}d2`.replace(/\/+/g, '/');

  // WINDOWS ONLY, AND IT BREAKS EVERY DIAGRAM. remark-d2 builds the image URL
  // with node's `path` module rather than string concatenation: `path.normalize`
  // on the `linkPath` option (node_modules/remark-d2/src/index.js:94) and
  // `path.join` for the final src (:130). `path` is platform-aware, so on Linux
  // and macOS — where CI and the deploy workflow run — the separator is already
  // `/` and both calls are no-ops. On a Windows checkout the same code yields
  //     \zebra-handheld-rfid-iotc\d2\docs\...\0.svg
  // and a leading backslash is NOT a root-relative URL to a browser: it resolves
  // against the current page path, so all 60 SVGs 404 and every diagram renders
  // as a broken-image placeholder. Nothing else is wrong — d2 writes the files to
  // the right place (the compile path SHOULD be platform-specific; only the URL
  // should not be), so restoring POSIX separators after remark-d2 has run is the
  // entire fix.
  //   This must be registered AFTER remarkD2 in `remarkPlugins` — it rewrites
  // what that plugin produced. It is a no-op wherever there is no backslash to
  // replace, so it changes nothing about the Linux CI build.
  //   Deliberately dependency-free: the obvious implementation imports `visit`
  // from unist-util-visit, but that is remark-d2's transitive dependency and not
  // declared in our package.json, so it would break the day the dependency tree
  // flattens differently. A six-line walk over `children` costs less than that risk.
  const remarkD2PosixUrls = () => (tree: unknown) => {
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'image' && typeof node.url === 'string') {
        node.url = node.url.replace(/\\/g, '/');
      }
      if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(tree);
  };

  // remark-d2 options, shared by the default docs preset and the `api-mqtt` plugin
  // (the MQTT API section renders ```d2``` fences too since 2026-09-29).
  const remarkD2Options = {
    // --font-* PUTS THE DIAGRAMS IN INTER. Without these, d2 embeds
    // Source Sans Pro into every SVG it writes, and because the SVGs are
    // loaded as <img> no page CSS can reach them — so the site shipped a
    // third typeface on 48 doc pages while every CSS audit came back
    // clean. Four faces, because those are the four d2 uses for text; the
    // --font-mono* flags are deliberately unset (no diagram here contains
    // code — `grep -l font-mono static/d2/**/*.svg` returns 0).
    //   The paths are relative to the repo root, which is d2's cwd under
    // remark-d2. See assets/fonts/README.md for why the .ttf files are
    // vendored rather than fetched.
    //   IF YOU ARE TESTING WHETHER A FLAG WORKS, do not use a bare shape
    // label: d2 renders those in the BOLD face, so `--font-regular` looks
    // like a no-op against `x: "Label"` and is not. Use a `|md ... |`
    // block, which is genuinely regular weight.
    defaultD2Opts: [
      '-t=0',
      '--dark-theme=200',
      '--font-regular=assets/fonts/inter/Inter-Regular.ttf',
      '--font-bold=assets/fonts/inter/Inter-Bold.ttf',
      '--font-italic=assets/fonts/inter/Inter-Italic.ttf',
      '--font-semibold=assets/fonts/inter/Inter-SemiBold.ttf',
    ],
    htmlImage: false,
    defaultImageAttrs: { alt: 'Diagram' },
    linkPath: d2LinkPath,
  };

  const config: Config = {
  title: 'Zebra Handheld RFID Reader | IoT Connector',
  tagline: 'MQTT API Documentation for RFD40 / RFD90 Series Handheld RFID Reader Sleds',
  url: 'https://ubiquitous-bassoon-kmn533n.pages.github.io',
  baseUrl,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  trailingSlash: true,
  // THREE docs plugin instances now share this site — the main instance at routeBasePath '/',
  // 'api-mqtt' at '/api-reference/mqtt', and 'fxr' at '/api-reference/rest' — so a route
  // collision between them is a real possibility rather than a theoretical one. The Docusaurus
  // default for this option is 'warn' (@docusaurus/core server/configValidation.js —
  // DEFAULT_CONFIG.onDuplicateRoutes: 'warn'), which prints to the build log and CARRIES ON:
  // the build would still exit 0, validate.yml would still pass, and one of the colliding
  // pages would be silently unreachable in production. 'throw' makes that a build failure.
  //   THIS PARAGRAPH USED TO SAY "no `exclude` option is set anywhere in this file", and
  // published `grep -nE '^[[:space:]]*exclude:' docusaurus.config.ts` as the proof that it
  // returned nothing. It now returns two rows, and the claim is dead:
  //     exclude: ['schema/**', 'prose/**']   on the fxr instance
  //     exclude: ['api-reference/**']        on the MAIN instance
  // The second is the more serious contradiction: the paragraph went on to argue for eight
  // lines that a main-instance `exclude` "could not be made to work" and "would be dead
  // configuration that READS as protection, which is worse than no protection at all" — advice
  // which, followed literally, deletes a guard that is doing real work. Corrected rather than
  // removed, because the original had one point that is still exactly right and is the reason
  // the two blocks looked compatible for as long as they did:
  //   `exclude` IS RELATIVE TO THE INSTANCE'S OWN contentPath. It is a glob list applied with
  // `cwd: versionMetadata.contentPath` (@docusaurus/plugin-content-docs lib/docs.js:33-35), so
  // on the main instance — whose contentPath is `docs/` — a pattern can only ever match inside
  // `docs/`. That is why `exclude: ['api-reference/**']` works: `docs/api-reference/` would be
  // inside it. And it is why an `exclude` naming `api/rest` or `api/mqtt/reference` would match
  // nothing at all, since those are SIBLINGS of `docs/`, not children. An exclude cannot fence
  // one instance off from another instance's directory; it can only trim its own.
  //   What is real: the three content directories (`docs/`, `api/mqtt/reference/`, `api/rest/`)
  // are disjoint, so no FILE can be claimed by two instances. A ROUTE collision is still
  // possible in principle, because the main instance is mounted at '/' and therefore owns the
  // whole URL space — and 'throw' is the one thing that catches it. See the `breadcrumbs` note
  // in the docs preset below for what happened when two of the directories WERE nested, and for
  // the reason `exclude` could not have saved that either.
  onDuplicateRoutes: 'throw',
  favicon: 'img/brand/zebra-mark.svg',
  organizationName: 'zebratechnologies',
  projectName: 'docs-rfid-handheld-iotc',
  // Visitor-analytics config for the PostHog client module
  // (src/client-modules/posthog). Sourced from build-time env so no key lives
  // in the repo; when POSTHOG_KEY is unset the module stays inert — nothing
  // loads and nothing is sent — so local and PR builds are analytics-free.
  // Region defaults to US Cloud (the privacy review accepted a US processor and
  // it consolidates with the existing US CI-telemetry org); set POSTHOG_API_HOST
  // to a first-party reverse-proxy origin once the custom domain is in place, or
  // to the `eu.` hosts to use EU Cloud instead.
  customFields: {
    /* Consumed by src/theme/DocSidebar/Desktop/Content, which picks by sidebar name. Only the
       two API references get one: the guides and resources trees are conceptual documentation
       and have no version to be at. */
    apiVersions: {
      rest: specVersion('api/rest/schema/rest_api.yaml', 'yaml'),
      // REPOINTED 2026-09-08 from api/mqtt/schema/openapi.json to the AsyncAPI contract.
      // openapi.json is the OpenAPI 3.0.0 mis-model of an MQTT API and is being deleted;
      // it said `info.version: 2`, which normalised to a v2.0.0 badge. The contract says
      // 1.26.0, so THE PUBLISHED BADGE GOES BACKWARDS. That is the correct trade: a badge
      // sourced from the document that actually describes the API, and which moves when
      // that document moves, beats a higher number sourced from a file that no longer
      // exists. Nothing else in the site reads openapi.json after this line.
      // On 2026-10-06 the contract's info.version became 1.22.0, the IoT Connector API version
      // it describes (V1.22), replacing the contract's own revision number 1.26.0.
      mqtt: specVersion('api/mqtt/schema/iotc-rfd40-90-mqtt.asyncapi.json', 'json'),
    },
    posthog: {
      key: process.env.POSTHOG_KEY ?? '',
      apiHost: process.env.POSTHOG_API_HOST ?? 'https://us.i.posthog.com',
      uiHost: process.env.POSTHOG_UI_HOST ?? 'https://us.posthog.com',
    },
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  future: {
    faster: true,
    // Pin the ad-hoc git VCS. `faster: true` turns on faster.gitEagerVcs, and
    // because experimental_vcs is otherwise left unset it defaults to the boolean
    // `true`, which the config validator then resolves to the EAGER strategy
    // whenever gitEagerVcs is on (@docusaurus/core server/configValidation.js
    // :465-471, with the boolean default at :278). The eager strategy keys its
    // git history map by ABSOLUTE path (@docusaurus/utils vcs/vcsGitEager.js
    // :15-22), while the sitemap plugin looks each page up by the SITE-RELATIVE
    // route.metadata.sourceFilePath — so every lookup misses and sitemap.xml
    // ships with zero <lastmod>, silently, with no warning in the build log
    // (upstream facebook/docusaurus#12322, open, filed against 3.10.2).
    // 'default-v1' is the historical strategy: hardcoded in dev, so `docusaurus
    // start` stays fast, and ad-hoc `git log` in production, which resolves a
    // relative path and produces the stamp. Do NOT delete this line while
    // faster.gitEagerVcs is on — see the sitemap block's lastmod note below.
    experimental_vcs: 'default-v1',
    v4: {
      removeLegacyPostBuildHeadAttribute: true,
    },
  },
  plugins: [
    // Algolia DocSearch v5 — the site's search UI (navbar modal + ⌘K,
    // contextual results, and the /search results page). We register the
    // @docsearch/docusaurus-adapter plugin INSTEAD of relying on the classic
    // preset's bundled theme-search-algolia so we can track DocSearch v5
    // (Ask AI, side panel, …) ahead of Docusaurus' own release cadence. The
    // adapter reads `themeConfig.docsearch` (below) and provides
    // @theme/SearchBar + @theme/SearchPage. Because we use the `docsearch`
    // key (not the legacy `algolia` key), the adapter — not the preset —
    // owns the /search route, so there is exactly one search integration.
    //
    // MIGRATED v4.6.3 -> v5.0.4 ON 2026-08-29, per Algolia's adapter migration
    // guide (docsearch.algolia.com/docs/packages/docusaurus-adapter/migrating-from-v4).
    // Only one of its ten steps had anything to change on this site: step 4,
    // `indexName` -> `indices` (see the `docsearch` block below). The rest were
    // already satisfied or do not apply — we were on `themeConfig.docsearch`
    // rather than the `algolia` alias (step 3), we set no root `searchParameters`
    // (step 4), no `searchPagePath` (step 5), and no `askAi`, `sidePanel` or
    // custom tools (steps 6-8). v5's compatibility floor is Node 20, Docusaurus
    // 3.10.2 in the 3.x line, and React 18 or 19; this repo is on Node >=22,
    // Docusaurus ^3.10.2 and React ^19.2.8, so nothing had to move.
    //
    // THE ONE NON-OBVIOUS THING, and the reason package.json grew a nested
    // `overrides` entry: EVERY published 5.x of this adapter (5.0.0 through
    // 5.0.4, verified by reading the tarball manifests) ships its four sibling
    // packages as raw `workspace:*` specifiers —
    //     "@docsearch/core": "workspace:*",   "@docsearch/modal": "workspace:*",
    //     "@docsearch/react": "workspace:*",  "@docsearch/sidepanel": "workspace:*"
    // `workspace:` is a pnpm/yarn/bun protocol that a publish is supposed to
    // rewrite into a real range; these were not rewritten, so `npm install`
    // fails outright with EUNSUPPORTEDPROTOCOL. The v4 line published pinned
    // versions ("@docsearch/react": "4.7.0"), so this is a v5 regression in
    // Algolia's release pipeline, not something this repo can fix upstream.
    // The `overrides` block substitutes the four specs with `$@docsearch/
    // docusaurus-adapter` — npm's reference syntax for "whatever range the root
    // project pins the adapter at" — so the siblings stay in lockstep with the
    // adapter automatically instead of being pinned to a version that would rot.
    // DELETE THAT OVERRIDE once a 5.x publishes with real ranges; keeping it
    // after that is harmless but is dead weight. THE PROCEDURE IS WRITTEN DOWN
    // rather than left to whoever notices: .ai-history/045-docsearch-v5-override-
    // removal.md carries the one command that decides whether the condition is
    // met, the exact edits, the lockfile step a plain `npm install` needs and
    // does not do on its own, and what to re-verify afterwards. Do not act on
    // this paragraph without reading it — a successful `npm install` is NOT
    // evidence that upstream is fixed, because the override is what makes it
    // succeed.
    '@docsearch/docusaurus-adapter',
    'docusaurus-plugin-sass',
    sidebarCollapsedPreHydrationPlugin,
    // Preloads the one Inter face the first paint needs; see the function's own note for the
    // Fast-3G measurements that justify it and for why it has to run after the bundler. Reads
    // `baseUrl` off the plugin context rather than closing over the const below, so there is one
    // source for it either way.
    interFontPreloadPlugin,
    // ---------------------------------------------------------------------
    // FXR60 / FXR90 fixed-reader REST reference — a SECOND docs instance.
    // ---------------------------------------------------------------------
    // Owner decision, 2026-08-13: mount the fixed-reader REST reference on this
    // site, scoped clearly as FIXED-READER ONLY. The site title, the tagline and
    // the four docs/ pages stating the HANDHELD exposes no REST surface are all
    // TRUE and stay exactly as they are — the FXR readers are a different product
    // line, and conflating the two would publish a falsehood.
    //
    // WHY A SECOND INSTANCE RATHER THAN A FOLDER IN THE MAIN ONE.
    // `docItemComponent` is a per-docs-plugin-instance option, not a per-page one
    // (docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs — "docItemComponent:
    // Root Component of the docs item page", default '@theme/DocItem', declared on the
    // plugin instance). This instance sets it, and the main instance must not, so the two
    // need separate instances. What it buys is now MUCH SMALLER THAN IT WAS, and the
    // change is recorded rather than the old argument left standing:
    //   UNTIL 2026-08-18 the stake was containment. '@theme/ApiItem' resolved to
    //   docusaurus-theme-openapi-docs' own doc-item shell, which composes NONE of the nine
    //   swizzles in src/theme/ (DocItem, DocRoot, DocSidebar, DocCard, CodeBlock, Heading,
    //   Icon, NotFound, MDXComponents) — so setting it on the main instance would have
    //   stripped every page on the site of them, including the Heading treatment ratified
    //   §12.19(9) and the per-page feedback widget in src/theme/DocItem/Footer.
    //   SINCE THE SWAP the option points at '@theme/RestDocItem', which is OUR component and
    //   whose whole body is a scope band wrapped around '@theme/DocItem'. There is no vendor
    //   shell left to contain: the risk this paragraph used to describe is gone with the
    //   theme, and the instance now exists for the ordinary reasons — its own `path`,
    //   `routeBasePath`, sidebar and breadcrumb scope — plus the fifteen-page scope band.
    // THIRD DOCS INSTANCE — the generated MQTT API reference.
    //
    // WHY IT EXISTS. Until 2026-08-15 these 26 pages lived in docs/reference/,
    // interleaved with twelve hand-authored reference pages, so nothing in the path
    // said which were generator output. They now live in api/mqtt/reference/, beside
    // the schema and prose they are derived from. A docs instance takes exactly one
    // `path`, so the move required an instance.
    //
    // WHAT THIS INSTANCE EMITS:
    //     api/mqtt/reference/mgmt/get-status.mdx  ->  /api-reference/mqtt/mgmt/get-status/
    // The prefix is `routeBasePath` twelve lines below, NOT the disk path. If you ever rebase
    // it, grep the whole repo for the old one before you finish: two pieces of URL-derived
    // logic match on it and would break silently — src/theme/Heading's PDF-button regexes, and
    // the per-page PDF output paths in scripts/site/generate-pdfs.mjs.
    //
    // URL OWNERSHIP, and nothing overlaps:
    //     main                 /guides/**, /resources/**, and the single page /api-reference/
    //     api-mqtt             /api-reference/mqtt/**
    //     fxr                  /api-reference/rest/**  EXCEPT the subtree below
    //     scalar-api-reference /api-reference/rest/endpoints (one route; operations are fragments)
    // The last two nest, which is new as of 2026-08-18 and is safe for one reason worth writing
    // down: the docs instance no longer has a FILE at endpoints/ (api/rest/endpoints/index.mdx was
    // deleted with the generated tree), so it emits no route there, and the explorer's own base
    // route is the only claimant. `onDuplicateRoutes: 'throw'` above is the mechanism that keeps
    // that honest rather than a comment promising it — re-adding an api/rest/endpoints/*.mdx would
    // fail the build rather than shadow the explorer.
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'api-mqtt',
        path: 'api/mqtt/reference',
        // /api-reference/mqtt/ since 2026-08-15. Was 'reference', which said nothing
        // about the transport and shared a prefix with the hand-authored lookup pages
        // that used to sit in docs/reference/. `routeBasePath` is a plain URL prefix,
        // so this ALSO rebases every generated-index `slug` in sidebars/api-mqtt.ts —
        // those are resolved relative to it, which is why they read '/management' and
        // '/control' rather than the full path, and why they needed no edit here.
        routeBasePath: 'api-reference/mqtt',
        sidebarPath: './sidebars/api-mqtt.ts',
        editUrl: undefined,
        // Same remark-d2 pipeline as the Guides, so a ```d2``` fence renders here too, plus
        // --scale=1: a sequence diagram needs its own width and height to be fitted to the
        // column rather than shrunk by the 480px image cap (see custom.scss).
        remarkPlugins: [
          [remarkD2, { ...remarkD2Options, defaultD2Opts: [...remarkD2Options.defaultD2Opts, '--scale=1'] }],
          remarkD2PosixUrls,
        ],
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'fxr',
        // A SIBLING of docs/, not a child of it — see the note beside the main
        // instance's `breadcrumbs` in the preset below for the build failure that
        // nesting causes and why `exclude` cannot prevent it.
        path: 'api/rest',
        // The vendored OpenAPI spec now lives at api/rest/schema/, which is INSIDE
        // this instance's contentPath, so its README.md was being picked up as a doc
        // and emitted /fxr-rest-api/schema/ — a route that did not exist before the
        // 2026-08-15 restructure. `exclude` globs are resolved with cwd = contentPath
        // (@docusaurus/plugin-content-docs lib/docs.js), so a relative pattern is
        // correct here and reaches it. This is the one place in this config where
        // `exclude` is real rather than decorative — see the onDuplicateRoutes note.
        // `prose/` is excluded for the same reason: it is the hand-authoring surface
        // that would go beside the generated pages if the OpenAPI plugin ever grows a
        // merge seam. It is empty today, so this is a guard rather than a filter.
        exclude: ['schema/**', 'prose/**'],
        // /api-reference/rest/ since 2026-08-15, completing the pair with the MQTT
        // instance above. The two references now sit under ONE namespace that names
        // what they are, and the segment names the transport, not the product.
        //
        // WHAT THIS INSTANCE STILL OWNS AFTER 2026-08-18. Only the FIFTEEN hand-written
        // pages: the six-page Overview, `your-first-rest-call`, the three Schemas pages
        // and their index, `errors-and-status-codes` and `changelog`. The 73 operations
        // are no longer docs at all — they are one Elements route registered by the
        // plugin further down, at /api-reference/rest/endpoints/**. The two do not
        // collide because api/rest/endpoints/index.mdx was DELETED with the generated
        // tree; `onDuplicateRoutes: 'throw'` is what keeps that honest.
        routeBasePath: 'api-reference/rest',
        sidebarPath: './sidebars/api-rest.ts',
        // The one line this whole instance exists for. Scoped here, it applies to
        // this instance's pages ONLY.
        //
        // RENAMED FROM '@theme/ApiItem' ON 2026-08-18, and the rename is the point. That
        // alias used to resolve to docusaurus-theme-openapi-docs' own doc-item shell, and
        // src/theme/ApiItem was a wrapper that delegated to it through
        // '@theme-original/ApiItem'. With the theme gone there is no original to delegate
        // to, and keeping the name would have implied a vendor component that no longer
        // exists. src/theme/RestDocItem now composes the scope band with the site's
        // ordinary '@theme/DocItem', so these pages get the same nine swizzles as the
        // rest of the site — which is a gain, not a compromise: they never did before.
        docItemComponent: '@theme/RestDocItem',
        breadcrumbs: true,
        // editUrl omitted for the same reason as the main instance: the source of
        // these pages is a vendor-generated OpenAPI document, not a file a reader
        // could sensibly edit.
        sidebarCollapsible: true,
        // No remark-d2 here: none of these pages carries a ```d2``` fence, and starting
        // the d2 CLI for a tree with no diagrams costs build time for nothing.
      },
    ],
    // ---------------------------------------------------------------------
    // THE FIXED-READER REST REFERENCE — Scalar, one route, hash deep links.
    // ---------------------------------------------------------------------
    // Everything about this integration is argued in plugins/scalar-api-reference/index.mjs,
    // including — at length, because it is a deviation from the obvious default — WHY it does not use
    // `@scalar/docusaurus`. The short form: that plugin's only loading mechanism is an unpinned
    // third-party CDN script injected into all ~290 pages, and its self-hosted alternative is a
    // classic script that collides with this site's own globals unless it runs first, so "pinned" and
    // "route-scoped" cannot both hold. `@scalar/api-reference` — the same package that CDN serves —
    // exports `createApiReference` as ESM, so the bundler owns it instead.
    //
    // The reference's own options live with the component that passes them
    // (src/components/ScalarApiReference), not here, because building the configuration in the
    // browser is the whole reason that file exists: it can hold real functions and be type checked,
    // where the official plugin has to serialise it to a source string.
    [
      scalarApiReference,
      {
        // READ-ONLY vendor input, under the same rule as api/mqtt/schema/. Read as TEXT and passed
        // straight through: Scalar's `content` takes raw YAML, so this needs no parser and never
        // mutates the document, not even the copy in memory.
        specPath: 'api/rest/schema/rest_api.yaml',
        // The URL both previous renderers used, kept so the published route does not move again. The
        // 'fxr' docs instance above owns everything ELSE under /api-reference/rest/ and emits no file
        // here, so there is nothing for `onDuplicateRoutes: 'throw'` to catch.
        routeBasePath: 'api-reference/rest/endpoints',
      },
    ],
  ],
  // NO `themes:` ENTRY, AND THAT IS THE BIGGEST SINGLE WIN OF THE 2026-08-18 SWAP.
  //
  // This site registered `docusaurus-theme-openapi-docs` here until then, and the ~40 lines of
  // comment that used to occupy this spot existed to record a containment failure it could not fix:
  // a theme's getThemePath() returns its whole lib/theme directory, so EVERY component in it
  // becomes a SITE-WIDE '@theme/*' alias, and the per-instance `docItemComponent` scoping declared
  // above does not contain that. Two of the 29 names it shipped collided with @docusaurus/theme-
  // classic — Tabs and TabItem — and on this site those aliases resolved to the VENDORED copies
  // for every page, including the handheld MQTT reference, which has nothing to do with OpenAPI.
  // src/components/ApiBody.tsx imports exactly those two names. The vendored pair were copies
  // rather than wrappers, pinned to an older theme-classic than this site installs, so the standing
  // risk on record was that a theme-classic fix would silently stop reaching this site's tabs.
  //
  // Neither @stoplight/elements nor Scalar is a Docusaurus theme, so neither contributes aliases:
  // '@theme/Tabs' and '@theme/TabItem' resolve to theme-classic again and src/components/ApiBody.tsx
  // gets the components its own site ships. Two vendor stylesheet collisions that src/css/custom.scss
  // carried purely to undo that theme's site-wide CSS went with it.
  //
  // SCALAR GOES FURTHER THAN ELEMENTS DID HERE, and it is the strongest argument for it on a site
  // with an established design system. Elements shipped a Tailwind build whose preflight was written
  // against `html`, `body`, `a` and `h1`-`h6`, so importing it as-is stripped the colour off every
  // navbar link and flattened every heading on the site; keeping it contained needed a 300 KB
  // generated stylesheet, a `:where()` specificity rewrite and a CI gate to keep the two in step.
  // Scalar's renderer paints into one container and namespaces its own variables, so there is no
  // preflight to contain, nothing generated, and no gate to maintain. What is left is a token map:
  // src/css/scalar-api-reference.scss.
  themeConfig: {
    image: 'img/social/zebra-social-card.png',
    // Algolia DocSearch v5 configuration, consumed by
    // @docsearch/docusaurus-adapter (registered in `plugins` above). This is
    // the ONLY search integration on the site. The `apiKey` below is public and MEANT to ship
    // in the client bundle — but it is NOT "search-only", which this comment claimed until
    // 2026-08-16. Asking the key to describe itself
    //     curl -s https://97OMTRHWD0-dsn.algolia.net/1/keys/<key> \
    //          -H "X-Algolia-API-Key: <key>" -H "X-Algolia-Application-Id: 97OMTRHWD0"
    // returns  acl: ["search", "listIndexes", "settings", "browse"]  with no index scope.
    // Three of those are not needed by a docs search box:
    //   browse       — pages the ENTIRE index without ranking or pagination caps, i.e. bulk
    //                  extraction of every record in one pass
    //   listIndexes  — enumerates every index in application 97OMTRHWD0, including any that
    //                  have nothing to do with this site
    //   settings     — reads index configuration
    // The indexed content is public documentation, so this is not a data leak; the exposure
    // is the application-level enumeration and the absence of an index scope.
    //   OWNER ACTION, cannot be done from this repo: in the Algolia dashboard mint a new key
    // with acl ["search"] scoped to the `zebra-handheld-rfid-iotc` index only, put it here,
    // and revoke this one. Until then this is a known, accepted exposure rather than an
    // undiscovered one.
    // exactly like every Algolia front end (the write/admin key is never
    // referenced here).
    //   contextualSearch is OFF on purpose: turning it on adds Algolia facet
    //   filters on `language` / `docusaurus_tag`, but THIS index was built by
    //   the DocSearch crawler (attributesForFaceting = ['type','lang']) and its
    //   records carry no `language`/`docusaurus_tag` attributes — so those
    //   filters match ZERO records and every query returns "No results".
    //   Verified against the live index: unfiltered "mqtt" → 458 hits, but with
    //   the contextual filters → 0 hits. The site is single-locale (en) and
    //   unversioned, so contextual scoping buys nothing here regardless. (If you
    //   ever add locales/versions, re-crawl with the Docusaurus DocSearch
    //   template so records get those facets, then set this back to true.)
    //   askAi is intentionally omitted until an Algolia Assistant is
    //   provisioned (no assistant ID yet); enabling it later is a one-line add.
    //   v5 NARROWED WHAT THAT ONE LINE WOULD BE, so record it here rather than
    //   rediscovering it: v5 dropped the legacy Ask AI backend entirely and only
    //   speaks Agent Studio, so `askAi` must be an OBJECT carrying an
    //   `assistantId` from an Agent Studio agent — the v4 shorthands and knobs
    //   (`askAi: 'ID'`, `agentStudio`, and an `askAi`-level `appId` / `apiKey` /
    //   `indexName`) are all rejected by the v5 schema, and Ask AI now reuses the
    //   root credentials above. `sidePanel` likewise moved OUT of `askAi` to the
    //   `docsearch` root and requires `askAi` to be set. Neither is configured
    //   here, so neither constrains this site today.
    //   FXR60 / FXR90 SEARCH, decided 2026-08-13, and the half of it that is NOT here.
    //   The question is real in both directions: a handheld reader searching "region" or
    //   "certificate" — both are tag names in the fixed-reader specification — should not
    //   get fixed-reader REST hits mixed into their answer, but the owner asked for that
    //   reference to be published, and content nobody can find is content nobody reads.
    //   What this file can decide: nothing about which pages are indexed. This index is
    //   built by the Algolia DocSearch CRAWLER, which fetches the deployed site and is
    //   configured in the Algolia dashboard, not in this repository. There is no
    //   `excludeRoutes` here to set, and no repo-side filter either: the crawler's
    //   attributesForFaceting is ['type','lang'] (see the contextualSearch note above), so
    //   the records carry no attribute that distinguishes a handheld page from a fixed-
    //   reader one, and `searchParameters.facetFilters` would have nothing to filter on.
    //   So the decision taken here is DO NOTHING, deliberately: the FXR pages are left
    //   crawlable and are in sitemap.xml (see the sitemap block's note), because
    //   suppressing discovery while leaving the navbar entry in place would cost the
    //   readership and buy no scoping at all.
    //   THE OWNER'S HALF, which only he can do, in the Algolia dashboard → Crawler:
    //   add a `pathsToMatch` group for `**/api-reference/rest/**` whose recordProps set a
    //   distinct `lvl0` — "FXR60 / FXR90 fixed reader REST API" — so a mixed result list
    //   labels which product each hit belongs to. Until he does, the two product lines are
    //   indexed into one undifferentiated result set. That is a labelling gap, not a
    //   correctness one: every FXR hit lands on a page whose first element is the scope
    //   note. Related: UNTRACKED:_meta/governance/analytics/algolia-docsearch-lvl0-support-request-2026-08-12.md.
    //   AMENDMENT 2026-08-18 — THE MIXING PROBLEM ABOVE JUST GOT SMALLER, AND SO DID THE
    //   INDEX. The 73 fixed-reader OPERATION pages no longer exist as HTML: Scalar renders them in
    //   the browser and addresses them with a fragment, so there is one route and no per-operation
    //   document to index. What remains crawlable under /api-reference/rest/** is the fifteen
    //   hand-written pages PLUS the server-rendered operation index on the reference route — a plain
    //   list of all 73 method/path/summary rows (see src/components/ScalarApiReference), which is
    //   less than the old per-operation pages carried but more than the Elements trial left.
    //   The tag-name collisions that motivated the `lvl0` request ("region", "certificate") are
    //   largely gone from the index with the operation pages.
    //   SEARCH ON THAT ROUTE IS THIS INTEGRATION AND NOTHING ELSE. Scalar ships its own search,
    //   bound by default to the same ⌘K as the navbar box; it is turned OFF (`hideSearch: true`,
    //   with the reasoning at src/components/ScalarApiReference), because two search affordances
    //   over two different indexes behind one hotkey is worse than one. So DocSearch is the only
    //   way to search from that page — VERIFIED in the browser: ⌘K opens this modal there, takes
    //   focus, and returns live hits.
    //   WHAT IS NOT VERIFIABLE FROM THIS REPOSITORY, stated as a gap rather than assumed working:
    //   whether the CRAWLER produces a record per operation. The 73 operations are painted by the
    //   renderer, so what a crawl can read is the server-rendered operation index on that route,
    //   which is now shaped for exactly that — `<article>`, one `<h2>` per tag carrying Scalar's own
    //   `#tag/<slug>` anchor, and one row per operation carrying `#tag/<slug>/<METHOD><path>` — so a
    //   hit resolves to the operation instead of the top of the page. Whether it is READ that way
    //   depends on the record extractor in the Algolia dashboard, which this file cannot see or set,
    //   and on a deploy: at the time of writing the live index returns 0 hits for `impinjGen2X` and
    //   1 prose hit for `Impinj`, i.e. it contains no operations at all today — that predates this
    //   change, since the route it would crawl is not published yet.
    //   THE OWNER'S HALF, in the dashboard → Crawler, alongside the `lvl0` group above: confirm the
    //   group matching `**/api-reference/rest/endpoints/**` extracts records from `article h2` /
    //   `article li` on that page. Then re-crawl and re-check `impinjGen2X`.
    docsearch: {
      appId: '97OMTRHWD0',
      apiKey: '06d14703b3d63f3e02baba474705e27d',
      // `indices`, NOT `indexName` — the v5 rename, and the only line the v4 ->
      // v5 migration actually forced on this site. v5's Joi schema rejects the
      // old key outright ("`themeConfig.docsearch.indexName` was removed. Use
      // `themeConfig.docsearch.indices` instead."), so this is a hard break, not
      // a deprecation. The array is the point of the rename: v5 queries every
      // entry in order in the modal and uses the FIRST for the /search page. A
      // bare string is the shorthand for `{ name: '...' }` with default search
      // parameters, which is what this site wants — there is one crawler index
      // and no per-index `searchParameters` to attach. If a second index is ever
      // added (the FXR `lvl0` split discussed at length above would be the
      // occasion), it goes here as a second element and the modal merges both.
      indices: ['Zebra Handheld RFID Reader IoTC Documentation'],
      contextualSearch: false,
      // Algolia Click & Conversion (Insights) analytics was evaluated but is NOT
      // enabled: an audit + empirical test showed it writes a persistent (non-PII)
      // localStorage key `AlgoliaObjectQueryCache` — the site's first client
      // storage — and its dashboard KPIs (CTR / click position / no-click) require
      // Event Analytics on the Algolia plan (likely absent on the free DocSearch
      // program). Enabling is a one-line `insights: true` here, gated on those two
      // owner decisions — see UNTRACKED:_meta/governance/analytics/algolia-docsearch-analytics-plan.md §7.
    },
    docs: {
      sidebar: {
        // ACCORDION — one section open at a time. Set to `true` BY THE OWNER ON
        // 2026-08-14 (criterion 1 of the sidebar-parity request), REVERSING the
        // multi-open contract this line carried until today.
        //
        // What it does, measured on the reference implementation rather than
        // inferred from the flag name: opening a category collapses its open
        // sibling. Stock reads this value through `useThemeConfig()` in
        // node_modules/@docusaurus/theme-classic/lib/theme/DocSidebarItem/Category/index.js:154-157
        // and acts on it in the effect at :183-192, which fires when a sibling
        // announces itself through `useDocSidebarItemsExpandedState`. Site-wide, not
        // per plugin instance — one boolean covers `docs`, `api-mqtt` AND
        // `api-rest`, which is why there is no second place to set it.
        //
        // TWO CONSEQUENCES THAT ARE NOT OBVIOUS FROM THE FLAG, both verified:
        //   1. The active ancestor chain still opens on load, and this flag cannot
        //      break that. `useAutoExpandActiveCategory` (:178-183 of that same
        //      file) expands the chain, and the collapse effect only fires for a
        //      category that is NOT the announced one — so a deep link still lands
        //      with its ancestors open and every unrelated section shut. Verified in
        //      the browser after the flip; see the run recorded with this change.
        //   2. The expanded-state provider is remounted per sibling list, at
        //      node_modules/@docusaurus/theme-classic/lib/theme/DocSidebarItems/index.js:16-20,
        //      so this gives one-open-at-a-time at tier 1 AND, independently,
        //      inside each tier-1 section. The
        //      request named the top tier; tier-1-only would require swizzling
        //      DocSidebarItem/Category to gate on `level === 1`, which is a
        //      component this repo does not own and is NOT worth owning for this.
        //      Reported to the owner as an accepted, reversible difference.
        //
        // SUPERSEDES the prior comment here and the ratified sidebar state contract
        // that comment implemented, which read "Opening a category does not close
        // its siblings — multi-open is the contract" and required an explicit
        // amendment before being changed. The owner's instruction is later and
        // governs; the clause itself is his to amend and is reported, not edited.
        autoCollapseCategories: true,
        // FALSE, 2026-09-02. This gated stock theme-classic's own conditional render of
        // `@theme/DocSidebar/Desktop/CollapseButton` — the chip this site swizzled and pinned to
        // the sidebar's bottom edge. That swizzle is deleted now: the dual-trigger pattern
        // (src/theme/DocSidebar/Desktop/Content's in-panel trigger, plus the persistent
        // src/components/SidebarNavToggle in the top navbar) replaces it, and both read the
        // lifted `useSidebarCollapse()` state directly rather than through this flag. Leaving
        // `hideable: true` here with the swizzle gone would silently resurrect STOCK's own
        // unstyled chip (and its own un-swizzled `@theme/Icon/Arrow`) as a third, uncoordinated
        // toggle — this flag has to go to false, not just have its consumer deleted.
        hideable: false,
      },
    },
    // Surface H2-H4 in the right-side table of contents. `grep -rl '^#### ' docs`
    // finds 17 pages on 2026-08-16 — for example resources/additional-reference/
    // rf-regions-and-regulatory-reference, guides/core-concepts/
    // interfaces-mqtt-and-tools, and guides/manage-your-reader/mqtt-endpoints.
    // Those pages section their content with `####` headings; the Docusaurus
    // default max of 3 left their right-side TOC empty. Raising the max to 4
    // gives every such page a populated right-side nav, consistent with the rest
    // of the docs. The examples have rotted twice across IA changes — re-run the
    // grep rather than trusting the paths above; the grep is the claim.
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
    metadata: [
      // `property`, not `name`: the Open Graph protocol defines property=, and
      // theme-classic renders each entry by spreading it (theme-classic
      // SiteMetadata/index.js:136-138), so the attribute written here is the
      // attribute shipped. og:site_name has no per-page fallback, so this entry
      // is the only one there is. og:title and og:description are NOT declared
      // here: Docusaurus already emits correct per-page property= tags for both
      // (measured 2026-08-12 over what were then 173 real built pages — 173/173 and
      // 172/173; the site builds 265 real pages as of 2026-08-16, so it is the RATIO, not
      // the total, that is the claim), and a static name= copy beside them is a second, disagreeing
      // declaration: name and property are separate keys to react-helmet and do
      // not dedupe against each other. Do not re-add them, and do not change the
      // twitter: entries below — name= is correct for Twitter cards.
      { property: 'og:site_name', content: 'Zebra IoT Connector | Handheld RFID Reader Documentation' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: '@ZebraTechnology' },
      // Algolia domain-ownership verification for the Crawler on the DocSearch
      // app (97OMTRHWD0), token from Algolia → Crawler → Domains. Uses the
      // meta-tag method (rendered into every page's <head>): the robots.txt
      // method is NOT usable here because this is a GitHub *project* page served
      // under /zebra-handheld-rfid-iotc/, so a robots.txt in this repo would not
      // sit at the required domain root (https://al1913-zebra.github.io/robots.txt).
      { name: 'algolia-site-verification', content: 'E51705BA23E77071' },
    ],
    navbar: {
      // Discriminates this site from the planned Fixed Reader IoTC sibling
      // ('Fixed reader'); the Zebra wordmark to the left carries the brand, so
      // the title only has to answer "which reader?". Sentence case here is the
      // shipped convention for a chrome label, not a rule: the rulebook that set
      // it was retired on 2026-08-13, and the style guide that replaced it governs
      // headings and prose, not navbar chrome. See the note at the foot of this
      // block — no rulebook governs a navbar label today.
      //
      // This is the fallback the 2026-08-07 UI audit (item 13) pre-declared for
      // its own gating measurement, taken because that measurement failed.
      // 'Handheld RFID Reader' was the first choice; at 360x800 `.navbar__title`
      // measured scrollWidth 170px against clientWidth 163px, so `text--truncate`
      // ate "Reader" — the word the then-current rulebook's §5a made load-bearing,
      // recorded here as the measurement's own premise rather than as a live rule —
      // and the brand box (right edge 328px) ran under the absolutely-positioned
      // DocSearch button (left edge 306px).
      //
      // SET TO 'Handheld Reader' BY THE OWNER ON 2026-08-12, which closes DR-5 and
      // TN-1's navbar limb and discharges the "Owner review required" note that had
      // sat on the navbar row of the rulebook retired on 2026-08-13. That
      // rulebook's N1-N4 fit rule is the reason this string is short; nothing
      // has replaced it as the authority, which is a recorded gap.
      //
      // The pixel budget is respected, and it was measured before the change rather
      // than after: at 360x800 in the navbar's computed font (700 16px), 'Handheld
      // reader' is 126.11px and 'Handheld Reader' is 129.86px — the capital R is the
      // only delta, +3.75px — so the string keeps 33.14px of slack inside the 163px
      // box instead of 36.9px, and still clears the DocSearch button. The candidate
      // that does NOT fit is 'Handheld RFID Reader' at 169.91px — the form the retired
      // rulebook's §5a called canonical, which is why it was measured at all —
      // which truncates to "Handheld RFID Rea" and loses the load-bearing word.
      //
      // WHAT GOVERNS THE CASE OF THIS STRING, STATED WITHOUT A RETIRED AUTHORITY.
      // An earlier version of this paragraph argued the case from the §3 and §7 of the
      // rulebook retired on 2026-08-13, in the present tense — "§3 capitalises proper
      // nouns; §7 forbids Title Case for ORDINARY words … No carve-out was added to
      // §7" — and reasoned that the 2026-08-08 audit had merely misclassified 'Reader'.
      // That reasoning is withdrawn, because it rests on a document the owner moved to
      // history. Re-read against the guide that replaced it
      // (UNTRACKED:_meta/governance/site-rulebooks/zebra-style-guide.md), the proper-noun question
      // turns out not to arise:
      //   - Rule 3.14 is the object-to-form map, and it names chapter titles, section
      //     headings, table titles, figure captions, body text, steps, list items,
      //     table cells and admonition text. A navbar label is in NEITHER column.
      //   - Rule 7.2 puts every heading at every level in title style. This is not a
      //     heading; it is site chrome, rendered into `.navbar__title`.
      //   - Rule 3.15 is the closest rule to the words themselves, and it points AWAY
      //     from the shipped value: it keeps the generic noun beside a product name
      //     lowercase, which would give 'Handheld reader'. It is named here because
      //     that is the honest reading, NOT as authority for the capital R.
      //   - The guide names this surface nowhere at all: it contains no occurrence of
      //     "navbar", "nav bar" or "site chrome", so it maps no form to it.
      // So the value is not an application of any live rule, in either direction. Its
      // two authorities are the OWNER'S RULING of 2026-08-12 and the pixel budget
      // measured above, and the recorded gap is that no rulebook governs a navbar label
      // today. If the case is ever to move it moves by a ruling and then by a
      // re-measurement, in that order — not by reading a prose rule onto chrome.
      title: 'Handheld Reader',
      logo: {
        alt: 'Zebra Technologies',
        src: 'img/brand/zebra-logo-black-horizontal.svg',
        srcDark: 'img/brand/zebra-logo-white-horizontal.svg',
      },
      items: [
        {
          // A PLAIN LINK, NOT `type: 'docSidebar'`, SINCE 2026-08-29.
          // `docSidebar` does not link to a sidebar — it links to that sidebar's FIRST
          // DOCUMENT, and the first document changed when the duplicate "Guides" row was
          // removed from sidebars/guides.ts. Left as it was, this chip would have gone on
          // pointing at whatever happened to be first, which is now Get Oriented, and it
          // would have done so silently: no build error, no broken link, just the wrong
          // destination on the site's most-used navbar item.
          //   `to` also states the intent that `docSidebar` only implied. This chip means
          // "the Guides landing page", not "wherever that tree happens to start".
          to: '/guides',
          label: 'Guides',
          position: 'left',
          // THE BOXED GUIDES ITEM (Dyte-parity brief, 2026-08-14, item 3A). The
          // reference implementation puts a 1px hairline box with a 6px radius round
          // its own "Guides" entry and nothing else in the row; the Dyte-parity
          // rule capture records it verbatim as a CUSTOM CLASS on the navbar link,
          // `.guides-top-header { border-width: 1px; border-radius: .375rem;
          // margin-left: 1.5rem; margin-right: .5rem; border-color: … }`.
          //   IT IS DONE HERE, AS A className, AND NOT AS `.navbar__link--active` IN
          // CSS, and that is the whole point rather than a stylistic preference: the
          // box is on the Guides item whether or not Guides is the active route,
          // which is how Dyte behaves, while `--active` is added and removed by the
          // router. Styling the active class would put a box on whichever of the
          // three items happened to be current — including the two API references —
          // and take it off Guides everywhere else.
          //   `className` on a navbar item is passed straight through to the rendered
          // <a class="navbar__item navbar__link …"> (theme-classic NavbarNavLink), so
          // the class lands on the link, which is the element Dyte measures. The
          // painting rule MOVED on 2026-08-28, from the navbar section of
          // src/css/custom.scss to src/css/navbar-menu.scss, because the box now has
          // to sit on the Radix chip that file draws — it trims a pixel of block
          // padding to absorb its own border so the boxed item and its two unboxed
          // neighbours end up the same height. It is still qualified by
          // `.navbar__link`, because theme-classic re-renders this same item inside
          // the mobile drawer as a `.menu__link`, where a box would be wrong.
          className: 'navbar-guides-item',
        },
        // API REFERENCE — one parent for both references, owner's brief of 2026-08-15.
        //
        // WHAT THIS REPLACES: two sibling top-level tabs, 'MQTT API' and 'REST API',
        // which forced a reader to know the transport before they knew the product.
        // The row was Guides · MQTT API · Resources · REST API — four items, two of
        // them the same kind of thing, split by a fifth. It is now three items, and
        // the two references are one choice made one level down.
        //
        // REST FIRST, MQTT SECOND, as specified. Note that this is NOT the site's
        // emphasis order: the handheld MQTT surface is what the rest of this site
        // documents, and the FXR REST reference is a separate product line published
        // here by the 2026-08-13 ruling. The order is the owner's instruction and is
        // recorded as such, so that a later reader does not "correct" it back.
        //
        // `to` ON A DROPDOWN MAKES THE PARENT ITSELF A LINK. theme-classic's
        // DropdownNavbarItem passes its props through to NavbarNavLink, so the label
        // navigates as well as opening the menu. Without it /api-reference/ would be
        // reachable only by typing it, which is the bare-namespace problem this whole
        // change exists to remove. The target is docs/api-reference.mdx.
        {
          type: 'dropdown',
          label: 'API Reference',
          to: '/api-reference',
          position: 'left',
          // NO `activeBasePath`, AND THAT IS A DECISION RATHER THAN AN OMISSION.
          // It was added on 2026-08-28 to light this trigger on every page under
          // /api-reference/, and withdrawn the same day: the owner's verdict on the
          // rendered result was that a nav row which recolours itself by route
          // "looks too fancy". The row is now neutral on every page, and
          // src/css/navbar-menu.scss carries the other half of that withdrawal —
          // it drops `.navbar__link--active` from the chip's state rule, which is
          // what stops Infima's own stock active colour reaching `Guides`.
          // Re-adding this line alone would therefore paint nothing; see that file.
          items: [
            // THE `REST API` ROW WAS REMOVED ON 2026-09-20, on the owner's instruction: this
            // site documents the handheld sleds, whose only interface is MQTT, and the FXR60 /
            // FXR90 REST reference is carried in this repository for testing only. It must not
            // be referenced from the menu, the sidebars or the content. The 'fxr' docs instance
            // and its routes are untouched, so the pages still build and are still reachable by
            // URL; nothing in the navigation points at them.
            {
              // `type: 'doc'`, NOT 'docSidebar', since IA v3 (2026-09-19). A docSidebar item opens
              // the sidebar's FIRST doc, which is now the Overview category's own page,
              // overview.mdx; the MQTT API landing page is in no row. `index` is that landing.
              type: 'doc',
              // `docsPluginId` is REQUIRED here. This sidebar lives on the third
              // instance; without it the item resolves against the default instance,
              // which exports only `docs`, `resources` and `apiIndex`, and the build
              // dies with "Can't find any sidebar with id api-mqtt".
              //   Sidebar name renamed 'apiReference' -> 'api-mqtt' on 2026-09-05, so it
              // now matches this instance's own id. They are still two namespaces that
              // merely agree; `docsPluginId` is not derived from `sidebarId`.
              docsPluginId: 'api-mqtt',
              docId: 'index',
              label: 'MQTT API',
              description: 'Commands and events for RFD40 and RFD90 sleds.',
              icon: 'MqttApi',
            },
          ],
        },
        // RESOURCES — the consult-while-building surface, after the two build-against
        // tabs.
        //
        // EXACTLY FOUR ITEMS, IN THIS ORDER, per the brief. Two things were dropped to
        // get there, and both were deliberate: 'Browse all resources' (the index is now
        // the parent link itself, via `to`) and 'Diagnose and Recover' (a guide, which
        // belongs under Guides and was only here because Resources had spare room).
        //
        // SUPPORT IS NOW AN INTERNAL SECTION, /resources/support/, not the outbound
        // zebra.com link it was until 2026-08-15. An internal page can do what a bare
        // outbound link cannot: route the reader to the on-site diagnostics first, and tell
        // them what to collect before they open a case. The zebra.com destinations are all
        // on it. It pointed at /resources/support/get-help until 2026-08-16, when Support
        // gained a landing page of its own with six children; a dropdown row should open the
        // section, not one page inside it.
        {
          type: 'dropdown',
          label: 'Resources',
          to: '/resources',
          position: 'left',
          // No `activeBasePath` here either — see the note on the API Reference
          // item above for why the route-driven highlight was withdrawn.
          items: [
            // IA v3 (2026-09-19): the three Resources pages, the two groups (each opens its own
            // landing page, OD18), and Support. The API Changelog moved to the MQTT
            // API reference, and the Resources landing links to it with a card.
            // `icon` NAMES A MARK FROM src/components/icons, NOT A FILE. The eight
            // names used across these two menus — RestApi, MqttApi, Glossary, Faq,
            // QuickReference, AdditionalReference, ReleaseNotes, Support — were all
            // already in that registry, chosen and argued for THESE pages when the
            // sidebar got its glyphs. Reusing them is the point: a reader meets the
            // same mark in the dropdown and in the sidebar it opens. Adding a new
            // row here means adding a semantic name there first, never a raw
            // Lucide import at the call site.
            //
            // `description` IS A CUSTOM KEY, AND IT IS LEGAL. theme-classic's
            // NavbarItemBaseSchema ends in `.unknown()` with the comment "we allow any
            // unknown attributes on the links", so this validates and is handed to the
            // component untouched. It is READ, and then STRIPPED, in two places, and
            // both matter: the desktop swizzle
            // (src/theme/NavbarItem/DropdownNavbarItem/Desktop) turns it into the
            // second line of the row, and the mobile swizzle (…/Mobile) drops it, so
            // the drawer keeps its one-line rows and no unknown attribute is spread
            // onto an <a>. Anything added here that is not rendered by one of those
            // two ends up in the markup — check both before inventing a third key.
            //
            // TWO LINES EACH, AND NEVER THREE. They are compressions of the pages' own
            // front-matter `description`, not new copy. The budget is the TEXT measure,
            // not the plate: the plate is --navbar-menu-column (273px), but 24px of its
            // own padding, the 16px icon column and that column's 10px gap come off it,
            // leaving 223.2px — measured, at every viewport that gets this bar, since
            // both the one- and two-column panels build from the same token. At 14px
            // Inter that is roughly 36 characters to the line, NOT the 40 this note
            // claimed until 2026-09-08; the old figure is what let 'API Changelog' ship
            // a 67-character string that wrapped to three lines and stood its row plate
            // 19.6px taller than the other five. All six now wrap to two.
            {
              to: '/resources/glossary',
              label: 'Glossary',
              description: 'IoT Connector, MQTT and RFID terms used across these docs.',
              icon: 'Glossary',
            },
            {
              to: '/resources/faq',
              label: 'FAQ',
              description: 'Answers to the questions that come up most.',
              icon: 'Faq',
            },
            {
              to: '/resources/known-issues-and-open-questions',
              label: 'Known Issues and Open Questions',
              description: 'Known limitations, and questions still open.',
              icon: 'Diagnose',
            },
            {
              to: '/resources/readers-radio-and-tags',
              label: 'Readers, Radio, and Tags',
              description: 'Supported readers, defaults, RF regions and tag standards.',
              icon: 'Reader',
            },
            {
              to: '/resources/network-and-tools',
              label: 'Network and Tools',
              description: 'Ports and firewall rules, setup tools, 123RFID equivalents.',
              icon: 'Endpoint',
            },
            {
              to: '/resources/support',
              label: 'Support',
              description: 'Get help, or report a bug or a security issue.',
              icon: 'Support',
            },
          ],
        },
        {
          type: 'search',
          position: 'right',
        },
      ],
    },
    footer: {
      // No `style: 'dark'`. The footer now sits on --zebra-surface-2, the same
      // plane as the landing page's .helpItem tiles, per the brief of 2026-08-15.
      // The chrome focus-ring block in custom.scss anticipated this exact change
      // ("if style: 'dark' is ever dropped ... this degrades gracefully"): the ring
      // and hover read var(--ifm-footer-link-color), so both track the new plane
      // instead of needing a second edit.
      // Four-column redesign, 2026-08-31. Every href below was fetched live and returned
      // 200 before being linked; the two tools-and-platforms anchors were confirmed against
      // the page's actual rendered heading ids (Docusaurus/github-slugger), not guessed from
      // the heading text.
      links: [
        {
          title: 'Read and Learn',
          items: [
            { label: 'Get Oriented', to: '/guides/get-oriented' },
            { label: 'Protocol', to: '/api-reference/mqtt/protocol-reference' },
            { label: 'MQTT API', to: '/api-reference/mqtt' },
            { label: 'MQTT API Changelog', to: '/api-reference/mqtt/changelog' },
          ],
        },
        {
          title: 'Build and Test',
          items: [
            { label: 'Manage Your Reader', to: '/guides/manage-your-reader' },
            {
              label: '123RFID Desktop',
              to: '/resources/setup-tools#123rfid-desktop-what-it-does',
            },
            {
              label: 'Bootstrap a Reader with 123RFID Desktop',
              to: '/guides/manage-your-reader/bootstrap-reader',
            },
            {
              label: 'Configure Advanced Radio Settings',
              to: '/guides/read-tags-and-barcodes/configure-advanced-radio-settings',
            },
          ],
        },
        {
          title: 'Support and Community',
          items: [
            { label: 'Support & Downloads', href: 'https://www.zebra.com/us/en/support-downloads/rfid.html' },
            { label: 'Developer Forum', href: 'https://developer.zebra.com/forum' },
            { label: 'Developer Community', href: 'https://developer.zebra.com/community' },
            {
              label: 'Zebra OneCare Services',
              href: 'https://www.zebra.com/us/en/services/support-services/zebra-onecare-support-services.html',
            },
          ],
        },
        {
          title: 'Zebra Ecosystem',
          items: [
            { label: 'RFD40 Handheld Reader', href: 'https://www.zebra.com/us/en/products/rfid/rfid-handhelds/rfd40.html' },
            { label: 'RFD90 Handheld Reader', href: 'https://www.zebra.com/us/en/products/rfid/rfid-handhelds/rfd90.html' },
            { label: 'Zebra Developer Portal', href: 'https://developer.zebra.com' },
            { label: 'Zebra TechDocs Home', href: 'https://techdocs.zebra.com/' },
          ],
        },
      ],
      // Bottom bar, mirroring the reference's "a • b • c • © year Co." line.
      // `copyright` is rendered as raw HTML by Infima, which is how the separators
      // and links get in. All three targets were fetched and returned 200 before
      // being linked — there is no legal/privacy page inside this repo, so these
      // point at Zebra's corporate pages rather than at nothing.
      // The three anchors carry target/rel BY HAND because they have to: the
      // raw-HTML path above means @docusaurus/Link never sees these hrefs, so the
      // target="_blank" rel="noopener noreferrer" that Link adds to every other
      // external link on the site — footer.links above, and every external link in
      // prose — does not reach them. Measured on the dev server 2026-09-06 before
      // this edit: over ten routes, 30 external anchors were missing target and
      // rel; all 30 were these three links × ten pages, and they were the only
      // external anchors anywhere on those routes missing either attribute.
      // `noopener` is the security half of the pair, not decoration — it stops the
      // opened tab reaching back through window.opener. Injecting both attributes
      // live and re-measuring left .footerLegal identical at 646×20 (1440), 646×20
      // (768) and 343×59 (375), so nothing moves.
      copyright: [
        '<span class="footerLegal">',
        '<a href="https://www.zebra.com/us/en/about-zebra/company-information/legal.html"' +
          ' target="_blank" rel="noopener noreferrer">Legal</a>',
        '<span class="footerDot" aria-hidden="true">•</span>',
        '<a href="https://www.zebra.com/us/en/about-zebra/company-information/legal/terms-of-use.html"' +
          ' target="_blank" rel="noopener noreferrer">Terms of Use</a>',
        '<span class="footerDot" aria-hidden="true">•</span>',
        '<a href="https://www.zebra.com/us/en/about-zebra/company-information/legal/privacy-statement.html"' +
          ' target="_blank" rel="noopener noreferrer">Privacy Policy</a>',
        '<span class="footerDot" aria-hidden="true">•</span>',
        `<span>© ${new Date().getFullYear()} Zebra Technologies Corp. and/or its affiliates.</span>`,
        '</span>',
      ].join(''),
    },
    prism: {
      /* ONE THEME FOR BOTH MODES, and that is the point rather than a shortcut.
       * Was `prismThemes.github` / `prismThemes.palenight` — two third-party schemes
       * belonging to neither this site's palette nor datum's, and invisible to the
       * 2026-08-30 palette migration because prism-react-renderer writes token colours
       * into INLINE STYLE attributes, which no stylesheet reaches without `!important`.
       * Measured consequence in light mode: numeric literals and CLI flags rendered at
       * 2.58:1 and string literals at 4.32:1, both failing WCAG 1.4.3.
       * Every colour in the replacement is a var() into datum's semantic layer, and an
       * inline style resolves var() like any other declaration — so the custom properties
       * do the light/dark switch and there is no second palette that can drift from the
       * first. src/prism/datum-prism-theme.ts carries the full derivation and the
       * measured contrast for every role. */
      theme: datumPrismTheme,
      darkTheme: datumPrismTheme,
      additionalLanguages: [
        'bash',
        'json',
        'yaml',
        'csharp',
        'java',
        'kotlin',
        'swift',
        'python',
        'ruby',
        'go',
        'rust',
        'tsx',
        'protobuf',
        'toml',
        // Added 2026-08-16. `api/rest/reference/set-impinj-gen-2-x.api.mdx` has two ```http
        // fences (request line, status line, headers). Unregistered, Prism renders them as
        // plain text with no warning anywhere — silent, and invisible unless you look at the
        // page. That file is generated, so the fence cannot be changed upstream.
        'http',
      ],
    },
    imgZoom: {
      selector: '.markdown img:not([src^="http"])',
      zoomedInClass: 'zoomed-in-img',
    },
  } satisfies Preset.ThemeConfig,
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars/guides.ts',
          // THE MAIN INSTANCE DISCLAIMS /reference/. It is mounted at
          // routeBasePath '/', so it owns the whole URL space by default and could
          // silently re-claim a path one of the API instances already serves — the
          // only thing standing in the way was `onDuplicateRoutes: 'throw'`, a
          // runtime check. This makes it structural.
          //   Guards the ONE namespace this instance shares. /guides/** and /resources/**
          // are wholly this instance's, and /api-reference/mqtt/** and
          // /api-reference/rest/** are wholly the other two's — but /api-reference/
          // ITSELF is served from here, by the single file docs/api-reference.mdx, so
          // that the namespace root is not a 404. This glob is what stops a future
          // docs/api-reference/<anything>.md quietly claiming a path one of the other
          // instances owns. Globs resolve with cwd = contentPath (docs/), so it reaches
          // exactly that directory and nothing else. `onDuplicateRoutes: 'throw'` is
          // still the net; this is the structure that keeps it from ever being needed.
          // ALSO EXCLUDES standards/**, ADDED 2026-09-09, and for a different reason than
          // api-reference/** above. docs/standards/ holds NORMATIVE GOVERNANCE documents --
          // ZIOTC-STD-001, the file-naming specification -- which bind the repository and
          // address contributors. They are not API documentation and have no business at a
          // public URL on a reader-facing reference site.
          //   MEASURED, not assumed. Without this glob the build published
          // build/standards/FILE_NAMING_SPECIFICATION/index.html as a live route, and then
          // FAILED: `onBrokenAnchors: 'throw'` checked the document's own 16 in-page anchors
          // against the slugs Docusaurus generates and found one truncated. So the file being
          // in this tree was not merely untidy -- it made an internal engineering document a
          // gate on the site build, which is backwards. The anchor was a real defect and was
          // fixed; the exclusion is what stops the next such document from being one.
          //   The file stays exactly where it was asked for and is read on the forge, where a
          // governance document belongs. Globs resolve with cwd = contentPath (docs/), so this
          // reaches exactly docs/standards/ and nothing else.
          exclude: ['api-reference/**', 'standards/**'],
          sidebarCollapsible: true,
          // editUrl intentionally omitted to hide the "Edit this page" link
          // on every doc page. The feedback widget at the bottom of each
          // page replaces this affordance (see src/theme/DocItem/Footer).
          routeBasePath: '/',
          // DO NOT put the FXR docs instance's `path` inside this one's. It was tried,
          // as a subfolder of this instance's own content directory, and it breaks the
          // build in a way `exclude` cannot fix:
          // `exclude` only filters which files become DOCS, while the webpack rule this
          // instance registers is built with `include: contentDirs` and NO exclude at
          // all (plugin-content-docs lib/index.js:63-69). A nested second instance
          // therefore matches the same .mdx with a SECOND mdx-loader, the two chain, and
          // the second one is handed the first one's JSX output — whose line 1 is
          // `import {Fragment as _Fragment, …}` and whose line 16 is
          // `function _createMdxContent(props) {`, so micromark-extension-mdxjs-esm
          // rejects it with "Unexpected `FunctionDeclaration` in code: only
          // import/exports are supported". Measured: all 74 pages of the subtree failed
          // that way, and the reported node span matched the emitted JSX, not the source
          // file. The fix is the sibling top-level directory the 'fxr' instance now uses.
          breadcrumbs: true,
          // Zebra four-type callout taxonomy (owner ruling 45, 2026-08-09; Zebra TechPubs
          // SG P1086622-001, Construction > Notes, Cautions, Warnings and Important
          // Statements, p. 43, which the live guide states as Rule 7.5 at
          // UNTRACKED:_meta/governance/site-rulebooks/zebra-style-guide.md:2680-2698, version 1.4.0
          // — range END re-derived, not inherited: the heading is :2680 and the See-also
          // that closes the rule is :2698, with Rule 7.6 opening at :2700).
          //   RE-POINTED 2026-08-14. This block previously cited a line range in the
          // 4,197-line guide that used to sit under UNTRACKED:_meta/governance/style-guide/, which
          // was DELETED — `lint:refs` graded that citation `no-such-path`, and the old
          // path is deliberately not repeated here because repeating it would re-create
          // the warning. `caution` and
          // `important` are ALREADY in Docusaurus' default keyword list
          // (@docusaurus/mdx-loader remark/admonitions/index.js:5-17 ships nine), so this
          // block does not ENABLE them — it PINS them. Upstream carries both only as
          // "undocumented legacy admonition type aliases" (theme-classic
          // Admonition/Types.js:22-30) and marks Caution `TODO remove before v4`
          // (Admonition/Type/Caution.js:24), while this site is already on the v4 track
          // (see the `future:` block near the top of this file). That read "(:53-58 above)"
          // until 2026-08-16, by which point those lines held the onDuplicateRoutes prose
          // instead — a line-number cross-reference inside a file that gets edited rots on
          // the first insertion, so it is named rather than numbered.
          // Listing the four explicitly means a v4 bump cannot retire the
          // taxonomy out from under us.
          // extendDefaults stays TRUE during the migration so `danger` and the other
          // defaults keep PARSING while docs/** is re-typed — with `false` the remark
          // plugin skips the node and a live `:::danger` degrades to a bare paragraph with
          // no build error. Tightening to `false` is the LAST step of the migration, not
          // the first: it lands with the retired-name CSS bridge, per §13.1(6) and §12.11(11) of UNTRACKED:_meta/governance/site-rulebooks/zebra-design-system.md.
          admonitions: {
            keywords: ['note', 'caution', 'warning', 'important'],
            extendDefaults: true,
          },
          // remark-d2 compiles every ```d2``` fenced block to SVG via the
          // `d2` CLI (must be on PATH at build time) and rewrites the
          // fence to an <img> tag.
          //   defaultD2Opts: pin themes — 0 (Neutral Default) light + 200
          //                  (Dark Mauve) dark per /UNTRACKED:_meta/governance/site-rulebooks/D2-MIGRATION.md §3.
          //                  Layout engine left as default (dagre); switch
          //                  to elk per-diagram via fence metadata when
          //                  needed for nested architectures.
          //   htmlImage: false — Docusaurus' MDX pipeline rejects raw
          //                      <img> tags ("Cannot handle unknown
          //                      node `raw`"). Markdown ![] syntax is
          //                      what we want anyway.
          //   linkPath: must include the site baseUrl so generated
          //             img tags resolve correctly under GitHub Pages.
          //             The default "/d2" produces absolute URLs that
          //             skip our /zebra-handheld-rfid-iotc/ prefix and
          //             404 in production.
          remarkPlugins: [
            [
              remarkD2,
              remarkD2Options,
            ],
            // Must stay last: rewrites the URLs remarkD2 just emitted. See the
            // remarkD2PosixUrls definition at the top of this file.
            remarkD2PosixUrls,
          ],
        },
        theme: {
          // shadcn/ui, Tailwind, and the two CSS files that existed only to carry them
          // (shadcn-compat.css, tailwind.css) were removed 2026-08-27. They were installed,
          // themed, and verified to render, but exactly one file in the whole project ever
          // imported from src/components/ui/ (src/pages/shadcn-lab.tsx, a disconnected demo
          // route, also removed) — every page a reader visits was, and remains, plain
          // Infima/custom.scss. See component-list.md for the full audit that established
          // this before removal, and its "Part I" for the removal record itself.
          customCss: ['./src/css/custom.scss'],
        },
        blog: false,
        sitemap: {
          // <lastmod> is derived from each page's last git commit date, and the
          // docs plugin's last-update option is NOT required: the sitemap plugin
          // reads route.metadata.sourceFilePath and falls back to whichever VCS
          // future.experimental_vcs resolved to (@docusaurus/plugin-sitemap
          // createSitemapItem.js:22-25, reading the VCS at :58). Verified
          // 2026-08-12 by driving that function over every source with the
          // last-update option off: all 133 doc sources and the home-page route
          // resolved to a real per-file date, 134 of 134, over 9 distinct dates.
          // Two conditions must hold, or the stamp comes back null on every URL
          // and nothing in the build log says so:
          //   1. the VCS strategy must be the ad-hoc one — see
          //      future.experimental_vcs above, and do not remove that pin;
          //   2. CI needs the full history — deploy.yml sets actions/checkout
          //      fetch-depth: 0.
          // Coverage is partial by design: the 133 doc routes and the home-page
          // route carry sourceFilePath, but the generated category-index routes
          // carry no route metadata at all (@docusaurus/plugin-content-docs
          // routes.js:22-38 attaches none), so 134 of the 169 URLs get a
          // <lastmod> and the other 35 do not.
          lastmod: 'date',
          changefreq: 'weekly',
          priority: 0.5,
          // Keep utility routes out of the public sitemap. These patterns are
          // matched against the FINAL route paths, which are baseUrl-prefixed
          // (/zebra-handheld-rfid-iotc/…) — so the globs must be baseUrl-agnostic
          // (`**/…`); a bare `/search` would never match. This matters most for
          // /search, which is now served by DocSearch's @theme/SearchPage: its
          // noindex tag uses `property="robots"` (which Docusaurus' sitemap does
          // NOT detect), so this ignorePattern is the only thing keeping it out
          // of sitemap.xml. (_meta / ia-blueprints are never built into the
          // site, so they cannot appear here in the first place.)
          // DECISION 2026-08-13 — the FXR60/FXR90 subtree IS in the sitemap, and
          // deliberately so. The existing entries below are the precedent, and they
          // do not extend to it: every one of them is a UTILITY route (a search
          // results page, a link-report form) with no indexable content, kept out
          // for the reason recorded above — /search's own noindex uses
          // property="robots", which the sitemap plugin does not detect, so the
          // pattern is the only thing keeping a non-content route out. The FXR pages
          // are the opposite case on both limbs: they are content, and the owner
          // asked for them published. Suppressing them here would not scope them —
          // it would only stop search engines discovering them while leaving them
          // fully reachable from the navbar, i.e. all of the mixing risk and none of
          // the readership. Scoping is done where a reader actually reads it: the
          // navbar label, the landing page's scope note, and the per-page breadcrumb.
          //
          // AMENDED 2026-08-18. The fifteen hand-written FXR pages are still in the sitemap for
          // exactly the reasons above. The operation reference is now ONE route
          // (/api-reference/rest/endpoints) and it stays listed, because it is the URL a search
          // engine can usefully land a reader on.
          //   The two `**/api-reference/rest/endpoints/operations/**` and `…/paths/**` patterns that
          // sat here for the length of the Elements trial are GONE, and their absence is the point:
          // Elements needed 73 prerendered shell routes so that GitHub Pages had a file to serve at
          // each deep link, and 73 near-identical documents in the sitemap would have been a
          // duplicate-content submission. Scalar addresses operations with a fragment, which is
          // never a route and never a sitemap entry, so there is nothing left to exclude.
          //   The cost is unchanged and is recorded at the plugin entry above: the operations
          // themselves are not crawlable under either renderer.
          //
          // AMENDED 2026-09-20, and this one REVERSES the decision above rather than refining it.
          // The owner's instruction that day: this site documents the handheld sleds, the FXR60 /
          // FXR90 REST reference is carried in the repository for testing only, and it must not be
          // referenced anywhere in the documentation. The navbar row, the /api-reference chooser
          // rows and the content cross-references were all removed the same day. The argument for
          // listing the FXR pages rested on their being reachable from the navbar — "all of the
          // mixing risk and none of the readership" — and that premise is now false: nothing links
          // to them, so listing them in the sitemap would invite exactly the mixed search results
          // the note above wanted to avoid. The routes are untouched and still resolve by URL,
          // which is what the testing use needs; they are simply not advertised.
          ignorePatterns: [
            '**/search',
            '**/search/**',
            '**/report-broken-link',
            '**/report-broken-link/**',
            '**/api-reference/rest',
            '**/api-reference/rest/**',
          ],
        },
      } satisfies Preset.Options,
    ],
  ],
  scripts: [
    // PushFeedback web component bundle. Loaded once per page; the
    // <feedback-modal> tag is rendered in src/theme/DocItem/Footer.
    // PINNED AND SRI'd 2026-08-16. This was an UNVERSIONED jsDelivr URL, which resolves to
    // whatever pushfeedback published most recently — so an upstream release that restructures
    // the <feedback-modal> custom element makes the widget vanish from every page with no repo
    // change, no build failure and no CI signal (onBrokenLinks cannot see a runtime CDN fetch),
    // and a hijacked publish executes arbitrary JS on every documentation page. Nothing in the
    // repo recorded which version had ever been tested — pushfeedback is not a package.json
    // dependency. 0.1.85 is what the unversioned URL served on 2026-08-16, confirmed by its
    // `x-jsd-version` response header, so the pin is a no-op today and a reviewable diff after.
    //   SRI COVERS THE ENTRY MODULE ONLY. Stencil bundles lazy-load component chunks by relative
    // path at runtime; those resolve under the pinned @0.1.85 prefix, so it is the version pin,
    // not the hash, that actually constrains them.
    {
      src: 'https://cdn.jsdelivr.net/npm/pushfeedback@0.1.85/dist/pushfeedback/pushfeedback.esm.js',
      type: 'module',
      async: true,
      integrity: 'sha384-q5ez2Qb3zIrh6HRyYiDFrsyhw+X9tyD19bjxOqFEG8GQt5GYkV4ZKS8lPtdkim3S',
      crossorigin: 'anonymous',
    },
  ],
  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/pushfeedback@0.1.85/dist/pushfeedback/pushfeedback.css',
      rel: 'stylesheet',
      integrity: 'sha384-cW3QYzMdfEE9fdzNapsTj+QE+hBg+l7MxBbvjUjIVN1tioZed18XFGqhVEJ1xVwV',
      crossorigin: 'anonymous',
    },
    // FONTS ARE SELF-HOSTED, AND THERE IS DELIBERATELY NOTHING HERE FOR THEM.
    //
    // The @font-face declarations are in src/css/fonts.scss and the .woff2 files in
    // assets/fonts/. Because that partial is compiled into the site stylesheet, webpack
    // resolves each url() and emits ONE content-hashed copy under build/assets/fonts/ —
    // so the faces are discovered the moment the stylesheet parses, and they get
    // immutable caching for free. No <link> is needed and none should be added.
    //
    // WHY NOT GOOGLE FONTS, which this site used until 2026-08-15: the design system's
    // guarantee is "exactly two typefaces", and a CDN <link> cannot deliver it. On any
    // network that blocks fonts.googleapis.com — a corporate proxy, a privacy blocker, a
    // region that filters it — the request fails, font-display: swap keeps the fallback,
    // and the reader silently gets their system UI face. Same-origin makes it real.
    //
    // WHY NO rel=preload EITHER, though it was tried and is the obvious idea. A preload
    // has to name an exact URL, and webpack's is content-hashed, so the href had to be
    // hand-written against a second, unhashed copy kept in static/fonts/. Measured in a
    // browser: that shipped every face TWICE — once for the preload, once for the CSS —
    // and the preload was never used. One copy discovered slightly later beats two
    // copies, one of them wasted. If preloading is ever wanted, it has to be generated
    // from the manifest, not written by hand.
  ],
  clientModules: [
    './src/client-modules/img-zoom',
    './src/client-modules/sidebar-deeplink',
    './src/client-modules/posthog',
  ],
  // The right-hand TOC is persistent on every page (standard Docusaurus). Wide schema
  // tables get room at the table level instead — see src/components/SchemaTable.tsx
  // (column sizing, a graceful horizontal-scroll region, and an explicit per-table
  // "Expand table" full-width toggle) — so no global TOC-hiding client module is needed.
  };

  return config;
}
