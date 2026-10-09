/**
 * The FXR60 / FXR90 REST reference, rendered by Scalar's API Reference.
 *
 * Registered by plugins/scalar-api-reference. Read that file first: it explains, with the evidence,
 * why the renderer is imported as a module rather than loaded through `@scalar/docusaurus`' CDN
 * script tag.
 *
 * THREE THINGS IN HERE ARE LOAD-BEARING.
 *
 * 1. THE DYNAMIC IMPORT, INSIDE AN EFFECT. Docusaurus prerenders every route through
 *    react-dom/server, and Scalar is a Vue application that mounts into a live DOM node — it cannot
 *    render on a server. Effects do not run during prerendering, so putting `import('@scalar/api-
 *    reference')` inside one is what keeps 3.1 MB of Vue and renderer out of the server bundle's
 *    evaluated graph and out of every other route's chunk; a top-level import would be evaluated
 *    during prerendering even though nothing rendered it.
 *      There is deliberately NO `BrowserOnly` wrapper — see the note at the render tree below. It
 *    would also skip the server-rendered operation index, which is what carries the anchors that keep
 *    `onBrokenAnchors: 'throw'` satisfiable. (This paragraph described `BrowserOnly` as load-bearing
 *    until 2026-08-18, when it no longer was.)
 *
 * 2. THE CONFIGURATION IS A REAL OBJECT, WHICH IS THE PAYOFF FOR NOT USING THE OFFICIAL PLUGIN.
 *    `@scalar/docusaurus` has to serialise its configuration to a JavaScript SOURCE STRING and
 *    inject it as a `<script>` element, because Docusaurus JSON-serialises route props and would
 *    silently drop every function-valued option (upstream scalar/scalar#6933). Built here, in the
 *    browser, the configuration is just an object: functions are ordinary functions, and it is type
 *    checked against `ApiReferenceConfiguration` instead of being a string nothing can check.
 *
 * 3. DARK MODE IS DRIVEN FROM DOCUSAURUS, NOT FROM SCALAR. Scalar decides light/dark by putting
 *    `light-mode` or `dark-mode` on `document.body` and keys 78 CSS rules off those classes, and it
 *    remembers its own choice in `localStorage['colorMode']` — a second source of truth that would
 *    drift from this site's colour mode the first time either changed. Since the class IS the
 *    contract, the site owns the class: `useColorMode()` writes it and Scalar's own toggle is hidden.
 *    The class is removed on unmount because a body class outlives a client-side navigation, and
 *    `dark-mode` left behind would follow the reader to every other page.
 */

import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { useColorMode } from '@docusaurus/theme-common';
import useBrokenLinks from '@docusaurus/useBrokenLinks';
import clsx from 'clsx';

// SCALAR'S OWN STYLESHEET, WHICH ITS ESM ENTRY DOES NOT PULL IN. Importing `@scalar/api-reference`
// gives you the renderer and none of its CSS: verified by rendering without this line, which produced
// a working but entirely unstyled sidebar and content tree.
//   IT IS SAFE TO IMPORT GLOBALLY, and that is the single biggest difference from the renderer this
// replaced. @stoplight/elements shipped a Tailwind build whose preflight was written against `html`,
// `body`, `a` and `h1`-`h6`, so it could not be loaded without a generated, container-scoped copy of
// the whole sheet and a CI gate to keep that copy honest. Audited the same way, Scalar's 1,948 rules
// contain no element-level reset at all: the only compounds that can match outside a `.scalar-*`
// ancestor are its `:root` custom-property block and five Vue scoped-style selectors carrying
// `[data-v-…]` hashes, which can only match nodes Scalar itself renders. So it is inert on the other
// ~290 pages rather than dangerous, and nothing has to be generated or gated.
import '@scalar/api-reference/style.css';
// Token overrides, after the vendor sheet.
import '@site/src/css/scalar-api-reference.scss';
import styles from './styles.module.scss';

/** One operation, as the plugin derived it from the document. */
type Operation = {
  anchor: string;
  method: string;
  path: string;
  summary: string;
  tag: string;
};

/**
 * Whether the site is in dark mode, read from the DOM rather than from React state.
 *
 * WHY NOT `useColorMode()` FOR THIS. Docusaurus writes `data-theme` on <html> from an inline script
 * before first paint, so the attribute is authoritative from the very first tick. Its React context
 * is not: on a cold load `useColorMode()` can report the default on the FIRST RENDER and settle
 * afterwards. Seeding Scalar from that first-render value is what produced a light reference inside a
 * dark site: the seed said light, Scalar mounted and wrote `light-mode` on <body>, and our own effect
 * had already run. Measured at the point of failure: `data-theme="dark"` on <html>, `class="light-mode"`
 * on <body>, and Scalar's own `localStorage['colorMode']` unset, which ruled out a stale store.
 *
 * `useColorMode()` is still what drives CHANGES (see ScalarColorMode); this is only for the initial
 * read, where the DOM is ahead of the context.
 */
function isDarkMode(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

/** Puts the colour-mode class Scalar keys its 78 CSS rules off onto <body>. */
function applyColorModeClass(isDark: boolean): void {
  const { classList } = document.body;
  classList.toggle('dark-mode', isDark);
  classList.toggle('light-mode', !isDark);
}

/** Route props, both supplied by plugins/scalar-api-reference. */
type ScalarApiReferenceProps = {
  /** The vendor OpenAPI document, raw YAML. */
  document: string;
  /** Every tagged operation, with the anchor Scalar will address it by. */
  operations: Operation[];
};

/**
 * Everything this site sets on Scalar, and nothing that only restates a default.
 *
 * Kept at module scope so the object identity is stable: `createApiReference` is called once per
 * mount, and a fresh object each render would be a reason to re-mount the whole renderer.
 */
function configurationFor(document: string, darkMode: boolean) {
  return {
    content: document,

    // NO `layout` OPTION: 'modern' IS SCALAR'S DEFAULT AND IT IS WHAT THIS SITE WANTS. Both
    // alternatives were built and looked at, on the owner's instruction, and the record of that is
    // the point of this comment.
    //
    // WHAT PROMPTED THE DETOUR. The owner asked for the look of docs.scalar.com/swagger-editor and
    // said ours was "completely different". It was not: that page runs THIS component with
    // essentially stock tokens (Inter, JetBrains Mono, 3px radius). What made it look different is
    // WIDTH. It is the Swagger Editor, so the reference is squeezed into a ~540px preview pane beside
    // a code editor, and at that width `modern` stacks the Server / Authentication / Client Libraries
    // panels under the prose. Resized to 2400px in a browser, that same page moves those panels into
    // a right-hand column, which is exactly what this configuration already did. So there was never
    // a styling difference to close.
    //
    // WHY `classic` WAS TRIED AND THEN DROPPED. Scalar documents it as "Swagger UI-inspired", the
    // family the reference belongs to, and it removes the right-hand column. But it also removes the
    // NAVIGATION SIDEBAR, which leaves 73 operations reachable only through a search box and
    // collapsible tag groups. Reverted after seeing it; the search box is not a substitute for a tree
    // on a reference this size.
    //
    // WHAT `modern` COSTS, so the choice is not oversold: on a wide screen the prose column and the
    // examples column sit side by side, which is a wider measure than the ~540px the owner first
    // pointed at. If that turns out to matter more than the sidebar, the middle option is `modern`
    // with a capped content width, which reproduces the reference exactly AND keeps the tree. That is
    // a width rule in styles.module.scss, not a layout change.
    //
    // Setting `layout: 'modern'` explicitly would restate the default, which this configuration
    // avoids; the decision lives here instead.

    // NO `theme` OPTION, AND THAT IS A DECISION RATHER THAN AN OMISSION. Scalar ships eleven presets
    // plus 'none'. Their token values were read out of @scalar/themes rather than judged by name, and
    // on a site with neutral greys and one blue accent the answer is the default:
    //   solarized #fdf6e3 / mars #f9f6f0 / saturn #f3f3ee / moon #ccc9b3 / bluePlanet #f0f2f5
    //     — tinted paper backgrounds. Cream, warm and olive all fight this site's neutral surfaces.
    //   alternate  #131313 — dark-first; wrong base for a site whose light mode is the default.
    //   purple, kepler, laserwave — differ from `default` mainly in accent, and the accent is already
    //     overridden to Zebra blue in src/css/scalar-api-reference.scss, so choosing one of them buys
    //     nothing and costs a tinted border.
    //   default    #fff / #f6f6f6 / #dfdfdf — the only fully neutral set, and the one the reference
    //     page itself renders.
    // So the base is left alone and only the accent and the two typefaces are pushed in. Setting
    // `theme: 'default'` explicitly would restate a default, which this configuration avoids.

    // SCALAR'S OWN FIRST WRITE HAS TO BE RIGHT, or it undoes ours. Its Vue app sets
    // `light-mode`/`dark-mode` on <body> from an internal watcher with `immediate: true`, and it
    // mounts asynchronously — after our effect has already run. Measured before this option was
    // passed: the effect wrote `dark-mode`, Scalar mounted a moment later and wrote `light-mode`,
    // and the reference rendered light inside a dark site. Seeding its initial state means its one
    // write agrees with ours; every later toggle is ours alone, because its watcher only fires on a
    // change to ITS state and `hideDarkModeToggle` means nothing can change that.
    darkMode,

    // THE BASE URL, SUPPLIED WITHOUT TOUCHING THE DOCUMENT. The vendor document declares no
    // `servers` block — its own header says it is generated "for Swagger UI", which Zebra serves FROM
    // the reader, so a relative URL is correct in the place it was built for. Published on an
    // external docs site, a renderer with no server resolves against the docs origin, and every
    // generated code sample then tells the reader to call the documentation host. Scalar takes a
    // `servers` override, so the placeholder lives in configuration rather than in a mutated copy of
    // a read-only specification.
    //   `.invalid` is reserved by RFC 6761 §6.4 for names that can never resolve, so this cannot be
    // mistaken for a real endpoint and a sample pasted unchanged fails immediately instead of
    // reaching the wrong machine. api/rest/your-first-rest-call.mdx says the same in prose; the two
    // must change together.
    servers: [
      {
        url: 'https://reader.invalid',
        description:
          'Placeholder, not a real host. The vendor OpenAPI document declares no servers block — '
          + "substitute your reader's own hostname or IP address.",
      },
    ],

    // MODELS ARE PUBLISHED — owner decision, 2026-08-18, REVERSING the judgement this block recorded
    // until today. That judgement was `hideModels: true`, on the argument that the document's 134
    // component schemas triple the sidebar with content that already renders inline on every operation
    // referencing it; the same call had been made for both previous renderers (`showSchemas: false`,
    // then `hideSchemas`). The owner asked for the Models section that docs.scalar.com/swagger-editor
    // shows, so the reference now publishes it and the old argument is recorded rather than deleted.
    //   WHAT IT ADDS, so the overlap is not discovered later as a surprise: a Models entry in Scalar's
    // sidebar and a section addressed as `#model/<name>`. It does NOT replace the three hand-written
    // schema pages under api/rest/schemas/ (Common objects, Configuration objects, Enumerations),
    // which are prose about the shapes rather than a generated dump — so the two now coexist, and the
    // sidebar in sidebars/api-rest.ts still points at those pages.
    hideModels: false,

    // THE TEST REQUEST BUTTON IS ON — owner decision, 2026-08-18, reversing the judgement recorded here
    // (that a placeholder server makes a send button which can only fail, so it was a defect rather
    // than a feature). It is back because the owner asked for the control that
    // docs.scalar.com/swagger-editor has, and because a reader CAN edit the server in the UI: for an
    // on-premises reader, substituting its own hostname and sending a real request is a genuinely
    // useful thing to be able to do from the documentation.
    //
    // `proxyUrl: ''` BELOW IS PART OF THIS DECISION AND MUST NOT BE SEPARATED FROM IT. See the note
    // there: without it, enabling this button routes a reader's own credentials through a third party.
    hideTestRequestButton: false,

    // NO PROXY. THIS IS A CREDENTIAL-CONTAINMENT SETTING, NOT A PERFORMANCE ONE, and the empty string
    // is load-bearing rather than cosmetic.
    //
    // THERE IS A HOSTED-PROXY FALLBACK IN THE SHIPPED CODE, and this pins it shut. In
    //   node_modules/@scalar/workspace-store/dist/request-example/context/proxy.js
    //     getDefaultProxyUrl = (layout) => layout === 'web' ? 'https://proxy.scalar.com' : null
    //     getActiveProxyUrl  = (activeProxyUrl, layout) =>
    //       activeProxyUrl === undefined ? getDefaultProxyUrl(layout) : activeProxyUrl
    // with the vendor's own comment: "For the 'web' layout, this ensures requests use Scalar's hosted
    // proxy unless overridden".
    //   HOW RELIABLY THAT FIRES HERE IS NOT PROVEN, AND THE HONEST VERSION IS WORTH MORE THAN EITHER
    // EXTREME. An earlier draft of this comment claimed the top-level option DEFAULTS to the hosted
    // proxy and that leaving it unset is opting in; that overstated it. The `prefault('https://
    // proxy.scalar.com')` at base-configuration.js:6 is inside `externalUrlsSchema`, while the
    // top-level key at :39 is `proxyUrl: z.string().optional()` with NO default. Against that, the
    // fallback above is reached whenever `activeProxyUrl` is undefined and the layout is 'web', and
    // `layout:"web"`, `getDefaultProxyUrl` and the literal `proxy.scalar.com` all DO ship in this
    // site's built bundle (grep build/assets/js). So: a latent path whose reachability was not
    // established either way, pinned rather than argued about — the cost of pinning is one empty
    // string, and the cost of being wrong is a reader's credentials.
    //
    // WHAT THE PIN BUYS, and it is the part that is measured rather than reasoned. With `proxyUrl` set
    // to '' this route sends every test request straight from the browser. Verified by watching the
    // network while pressing Send: exactly `GET https://reader.invalid/cloud/localRestLogin`, direct,
    // failing at DNS, and ZERO requests to proxy.scalar.com.
    //
    // WHAT THAT WOULD COST, traced rather than assumed, in
    // node_modules/@scalar/helpers/dist/url/redirect-to-proxy.js:
    //   `shouldUseProxy` returns false when `!proxyUrl`, and false when `isLocalUrl(url)`. `isLocalUrl`
    //   counts localhost, 127.0.0.1, ::1, 0.0.0.0 AND the reserved TLDs test/example/invalid/localhost.
    //   So the placeholder `https://reader.invalid` would not be proxied even unpinned — but the moment
    //   a reader substitutes a REAL reader address such as `https://192.168.1.50`, that hostname is
    //   neither a local name nor a reserved TLD, `shouldUseProxy` returns true, and the request is
    //   rewritten to `https://proxy.scalar.com?scalar_url=…` carrying whatever the reader typed into
    //   Authorize — a bearer token or admin basic credentials — to a host neither this site nor its
    //   readers own. Scalar's proxy could not reach a private address anyway, so it would fail AND the
    //   credentials would egress: the worst of both. That is the shape of the risk being pinned out,
    //   and it is why the placeholder server being harmless is not a reason to leave the pin off.
    // The empty string is a real override rather than a no-op: `getActiveProxyUrl` tests
    // `=== undefined`, so '' is returned as-is, and `shouldUseProxy`'s `!proxyUrl` guard then sends
    // every request straight from the browser.
    //
    // THE HONEST LIMITATION THAT REMAINS, which is a functional one and not a privacy one: a direct
    // browser request to a reader needs the reader to answer CORS, and an https page cannot call an
    // http reader without a mixed-content block. Against `https://reader.invalid` it simply fails to
    // resolve. So this button is useful to someone testing a reachable reader, and honest about it
    // otherwise — it does not quietly succeed by sending the traffic somewhere else.
    proxyUrl: '',

    // TWO THIRD-PARTY AFFORDANCES, TURNED OFF — FOUND WHILE ENABLING THE BUTTON ABOVE, NOT REQUESTED.
    // Both are Scalar platform entry points that ship in this site's bundle (verified by grepping
    // build/assets/js), and both contradict a posture this file already holds elsewhere: fonts
    // self-hosted, telemetry off, the agent endpoint off.
    //
    //   hideClientButton — the sidebar footer otherwise renders
    //     <a class="open-api-client-button" href="https://client.scalar.com?url=…&utm_source=…">
    //   which hands the document's location to Scalar's hosted client. It is INVISIBLE ON LOCALHOST
    //   (`showMCPButton` is true for a local URL, and the two are mutually exclusive), so it would have
    //   shipped unnoticed — the CSS rule that removes the vendor credit was silently hiding it in
    //   production as a side effect of matching `scalar.com`. Stating it in configuration is better
    //   than a stylesheet hiding a live control by accident. In-page Test Request now covers the need.
    //
    //   mcp.disabled — the "Generate MCP" button's click path is uploadTempDocument()
    //   (@scalar/api-reference/dist/helpers/upload-temp-document.js:8-16), which does
    //     fetch(`${urls.apiBaseUrl}/core/share/upload/apis`, { method: 'POST', body: JSON.stringify({ document }) })
    //   i.e. it POSTs THE WHOLE OpenAPI DOCUMENT to api.scalar.com. The document is public, so this is
    //   not a data leak; it is an unannounced upload of a vendor artefact to a third party, triggered
    //   by a button in a documentation sidebar, and nothing on the page says so before it happens.
    // Either is one line to reverse if the owner wants them.
    hideClientButton: true,
    mcp: { disabled: true },

    // Scalar's default offers JSON and YAML. The source of truth is YAML and the JSON would be a
    // re-serialisation of it, so only the original form is offered.
    documentDownloadType: 'yaml' as const,

    // DEFAULTS TO TRUE, AND IT FETCHES FROM SCALAR'S CDN. This site self-hosts Inter and IBM Plex
    // Mono (src/css/fonts.scss) and pins every third-party asset it loads; letting the renderer pull
    // Inter and JetBrains Mono from a third party would add two uncontrolled requests and a second
    // copy of a font already on the page. The faces come from src/css/scalar-api-reference.scss.
    withDefaultFonts: false,

    // DEFAULTS TO TRUE. Analytics on this site are opt-in and gated on an environment variable that
    // is deliberately not in source (see the PostHog block in docusaurus.config.ts); a renderer
    // reporting usage on its own terms is not something a reader consented to.
    telemetry: false,

    // SCALAR'S SEARCH IS OFF, BECAUSE THIS SITE ALREADY HAS SEARCH AND TWO IS WORSE THAN ONE.
    // The navbar carries Algolia DocSearch on every page including this one, bound to the same ⌘K
    // that Scalar's own box binds by default (`searchHotKey: 'k'`), so leaving both on gives a reader
    // two search affordances with different indexes and one hotkey between them. DocSearch is the
    // one that searches the WHOLE site, which is what someone pressing ⌘K on a docs site expects;
    // Scalar's searches only the OpenAPI document.
    //   WHAT THIS COSTS, STATED PLAINLY: DocSearch indexes what its crawler can fetch, and the 73
    // operations are client-rendered, so it cannot see them the way it sees a normal page. What it
    // CAN see on this route is the server-rendered operation index (see OperationIndex below), so a
    // query for a path or a summary can still land a reader here. Finding a specific operation
    // WITHIN the reference is then Scalar's job, and its own search is reachable from the sidebar's
    // filter behaviour rather than a second modal.
    hideSearch: true,

    // The site owns the colour mode — see note 3 — so Scalar's own control would be a second switch
    // that disagrees with the navbar's.
    hideDarkModeToggle: true,

    // AGENT SCALAR IS OFF, AND THIS IS THE ONE OPTION HERE THAT IS A PRIVACY DECISION RATHER THAN A
    // DESIGN ONE. Left at its default, the renderer paints an "Ask AI" control and — measured in the
    // browser on a fresh load, not inferred — calls Scalar's own API before anyone touches anything:
    //     https://api.scalar.com/vector/registry/curated
    //     https://api.scalar.com/vector/registry/search?query=
    // That is an uncontrolled third-party request from a documentation page, and the second one
    // carries a `query` parameter, so a reader typing into the reference's search would be sending
    // their query to a processor nobody on this site has reviewed. This site pins every third-party
    // asset it loads, scrubs `q`/`query` out of its own analytics before anything egresses
    // (SCRUB_PARAMS in src/client-modules/posthog.ts) and gates analytics behind an unset environment
    // variable. Shipping an unreviewed AI endpoint alongside all of that would be incoherent.
    //   Turning it off leaves Scalar's own local search, which needs no network at all.
    agent: { disabled: true },

    // DEFAULTS TO `'localhost'`, WHICH IS WHY THIS LOOKS UNNECESSARY AND IS NOT. On the default the
    // renderer paints a "Developer Tools / Configure / Share / Deploy" toolbar above the document
    // whenever the host is localhost — so it is invisible in production and present for everyone
    // working on the site, which is exactly backwards for reviewing how the published page looks.
    // Those controls are affordances for Scalar's own platform, not part of this reference.
    showDeveloperTools: 'never' as const,
  };
}

/**
 * Keeps `document.body`'s colour-mode class in step with Docusaurus' own. See note 3.
 *
 * IT IS A SEPARATE COMPONENT BECAUSE OF WHERE THE PROVIDER LIVES. `useColorMode()` reads a context
 * that `@theme/Layout` itself establishes, so calling it in the component that RENDERS `<Layout>`
 * calls it above its own provider: it throws ReactContextError, and because that happens during
 * static generation it fails the build rather than one page. Rendering this as a CHILD of Layout puts
 * the call below the provider. It draws nothing.
 */
function ScalarColorMode(): null {
  const { colorMode } = useColorMode();
  useEffect(() => {
    applyColorModeClass(colorMode === 'dark');
    return () => document.body.classList.remove('dark-mode', 'light-mode');
  }, [colorMode]);
  return null;
}

/**
 * The server-rendered operation index, and the reason it is not just a loading state.
 *
 * It is rendered BESIDE the element Scalar mounts into — never inside it, see ScalarMount — and React
 * drops it the moment the renderer is up, so it costs nothing thereafter. Until then, and for anyone
 * or anything that never runs the renderer, it does three jobs:
 *
 *   1. IT CARRIES THE REAL ANCHORS, which is what lets `onBrokenAnchors: 'throw'` stay on for the
 *      whole site. Docusaurus can only see anchors in prerendered html; Scalar mounts in the browser.
 *      Without these ids the 26 per-operation links in the hand-written REST pages fail the build,
 *      and the alternatives were to relax a site-wide gate or to drop deep links from prose. The ids
 *      are not stand-ins: they are the same anchors Scalar resolves.
 *   2. IT IS CRAWLABLE, and it is the only search coverage the operations have. Both previous
 *      renderers made them invisible to search engines — recorded as an accepted loss twice — and
 *      Scalar's own search is off here in favour of the site's DocSearch, so this list is what a
 *      crawler reads. Hence the shape it has below: an `<article>`, one heading per tag, one row per
 *      operation, each carrying the anchor the renderer resolves.
 *   3. IT IS THE FALLBACK WHEN THE RENDERER NEVER ARRIVES — and only then. It used to be the loading
 *      state as well, painted from first contentful paint until Scalar replaced it, and that is exactly
 *      what made every load flash a page of operations (the renderer is a 3.1 MB chunk, so the window
 *      is seconds on a real connection, not the quarter-second it is on localhost). It is now hidden by
 *      default and revealed in the two cases where a reader genuinely has nothing else: the renderer
 *      failed, or JavaScript is off. See `.fallbackBody` in styles.module.scss.
 */
function OperationIndex({
  operations,
  shown,
}: {
  operations: Operation[];
  /** Paint it. False on a normal load — see the note on `.fallbackBody` in styles.module.scss. */
  shown: boolean;
}): ReactNode {
  // REGISTER EACH ANCHOR WITH DOCUSAURUS, WHICH AN `id` ATTRIBUTE ALONE DOES NOT DO.
  // `onBrokenAnchors` does not scrape the generated html: anchors are collected during static
  // generation through a React context, and something has to call `collectAnchor` to enter one. That
  // is why `@theme/Heading` calls it for every heading id, and why writing `<a id="…">` by hand is
  // invisible to the check — established by reading @docusaurus/core lib/client/BrokenLinksContext.js
  // after the ids were confirmed present in the prerendered html and the build still failed.
  //   This is the documented, intended hook, so the site-wide gate stays at 'throw' and the 26
  // per-operation links in the hand-written REST pages are genuinely verified rather than excused.
  //   Static generation renders this component (the renderer is never up during SSG), so the anchors
  // are always collected even though the browser drops this list a moment after load.
  const brokenLinks = useBrokenLinks();

  // GROUPED BY TAG, IN FIRST-APPEARANCE ORDER, and the grouping is not decoration.
  //
  // A flat list of 73 rows is one undifferentiated block of text to the only two readers this markup
  // has: a person without the renderer, and the DocSearch crawler. The crawler builds each record's
  // hierarchy from the headings it finds inside `<article>` and takes the record's link fragment from
  // the nearest `id` — so with no headings, this route contributes records that all point at the top
  // of the page, and a search for an operation cannot land on it. Grouping under one heading per tag
  // gives every row a lvl2 of its tag and a fragment that resolves.
  //
  // THE HEADING IDS ARE SCALAR'S OWN TAG ANCHORS, not invented ones: Scalar addresses a tag as
  // `#tag/<slug>` and an operation as `#tag/<slug>/<METHOD><path>`, so a hit on a group lands on that
  // tag inside the renderer exactly as a hit on a row lands on the operation. That is also why they
  // are registered with `collectAnchor` below: ids that are in the prerendered html but unknown to
  // Docusaurus are the precise trap this component already fell into once.
  const groups: { tag: string; anchor: string; operations: Operation[] }[] = [];
  operations.forEach((operation) => {
    brokenLinks.collectAnchor(operation.anchor);
    const existing = groups.find((group) => group.tag === operation.tag);
    if (existing) {
      existing.operations.push(operation);
      return;
    }
    // The tag anchor is the operation anchor's own first two segments — `tag/<slug>` — so it is
    // derived from the value Scalar resolves rather than re-slugged here, where the two could drift.
    const anchor = `tag/${operation.anchor.split('/')[1]}`;
    brokenLinks.collectAnchor(anchor);
    groups.push({ tag: operation.tag, anchor, operations: [operation] });
  });

  return (
    // `<article>` because that is the element every DocSearch record extractor is pointed at.
    <article className={clsx(styles.fallbackBody, shown && styles.fallbackBodyShown)}>
      {groups.map((group) => (
        <section key={group.anchor} className={styles.fallbackGroup}>
          <h2 className={styles.fallbackTag} id={group.anchor}>
            <a href={`#${group.anchor}`}>{group.tag}</a>
          </h2>
          <ul className={styles.fallbackList}>
            {group.operations.map((operation) => (
              <li key={operation.anchor}>
                {/* The id is the anchor; the href makes each row usable on its own. */}
                <a id={operation.anchor} href={`#${operation.anchor}`}>
                  <code>
                    {operation.method} {operation.path}
                  </code>
                  {operation.summary ? <span> {operation.summary}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

/**
 * Mounts the renderer beside the index, and tears it down again.
 *
 * SCALAR MUST BE HANDED AN **EMPTY** ELEMENT, AND THAT IS A HARD REQUIREMENT RATHER THAN TIDINESS.
 * `createApiReference` chooses between a client mount and a HYDRATION on one condition, at
 * node_modules/@scalar/api-reference/dist/standalone/lib/html-api.js:74:
 *
 *     let app = createReferenceApp(!!optionalConfiguration && !!mountElement && mountElement.children.length > 0)
 *
 * — the argument is `isSsr`, which selects Vue's `createSSRApp` over `createApp`. So a mount element
 * with ANY children puts Scalar into hydration mode, where Vue expects the existing markup to be its
 * own server-rendered output. When the operation index was rendered inside the host, that produced
 * two real defects from one cause:
 *
 *   1. Vue logged "Hydration completed but contains mismatches" on every load, because the markup it
 *      was adopting was a list of links, not the reference.
 *   2. Hydration ADOPTS the existing element as the app root instead of creating one, so the index's
 *      own container became Scalar's root container — and the `max-width: 62rem` that gave the index
 *      a readable measure capped the ENTIRE renderer at 992px, centred, with 224px of dead margin
 *      down each side of a 1440px viewport. That was the reported "too much white space on the left
 *      and right", and no amount of styling Scalar could have fixed it.
 *
 * Hence the shape below: an empty host that is Scalar's and only Scalar's, and the index as a SIBLING
 * that React owns and removes. React never writes inside the host, Vue never adopts anything of ours,
 * and neither can inherit the other's layout.
 */
function ScalarMount({
  document: openApiDocument,
  operations,
}: {
  document: string;
  operations: Operation[];
}): ReactNode {
  const mountId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // False through static generation and through hydration, so React's own SSR markup matches; the
  // effect below flips it once the renderer is up and React then unmounts the index.
  const [rendererUp, setRendererUp] = useState(false);

  useEffect(() => {
    let destroy: (() => void) | undefined;
    let cancelled = false;

    // See note 1. The import is here rather than at module scope so the chunk is fetched when the
    // route is opened, not when the site loads.
    import('@scalar/api-reference')
      .then(({ createApiReference }) => {
        if (cancelled || !hostRef.current) return;
        const isDark = isDarkMode();
        const instance = createApiReference(hostRef.current, configurationFor(openApiDocument, isDark));
        // RE-ASSERTED AFTER THE MOUNT, ON PURPOSE. Seeding `darkMode` above is what Scalar's own
        // watcher reads, but the watcher runs inside the Vue app and therefore AFTER this effect, so
        // it gets the last word on <body>. Writing the class again here means the site wins whatever
        // order the two settle in, which removes the race rather than betting on it.
        applyColorModeClass(isDark);
        setRendererUp(true);
        // `createApiReference` returns a handle with `destroy()`; guard it because that is a public
        // API on a package still in the 1.x line and a missing teardown must not break navigation.
        destroy = typeof instance?.destroy === 'function' ? () => instance.destroy() : undefined;
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailed(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [openApiDocument]);

  return (
    <>
      {/* SCALAR'S, AND EMPTY, AND UNSTYLED. Nothing may be rendered in here — see the note above —
          and nothing may size it either: Scalar establishes its own height, and the two bugs this
          route has had both came from a rule on an ancestor of this element. */}
      <div id={mountId} ref={hostRef} />

      {!rendererUp && (
        <>
          {/* ONE QUIET LINE, NOT A PAGE OF CONTENT. This is the whole visible pre-mount state now; the
              operation index below it is in the html but not painted. Before that change this spot
              rendered "73 operations, grouped by the specification's own tags" above the full list, and
              every load flashed what looked like a different page before the renderer replaced it. */}
          <p
            className={clsx(styles.fallbackNote, failed && styles.fallbackNoteFailed)}
            role={failed ? 'alert' : 'status'}
          >
            {failed
              ? `The interactive reference could not be loaded (${failed}). All ${operations.length} operations are listed below.`
              : 'Loading REST API…'}
          </p>

          {/* Painted only when the renderer failed — the one case where a reader needs this list AND
              the browser can tell us so. */}
          <OperationIndex operations={operations} shown={Boolean(failed)} />

          {/* THE OTHER CASE: NO JAVASCRIPT, where nothing can add a class because nothing runs. A
              <noscript> stylesheet reveals the list for exactly those readers and is inert for everyone
              else, which is why this needs no timeout and cannot reintroduce the flash.
                `dangerouslySetInnerHTML` rather than a JSX <style> child: with scripting ENABLED a
              browser parses <noscript> content as TEXT, so React would hydrate a text node where its
              server render put an element and log a mismatch. The class is doubled to match the
              specificity of the compounded rule it has to undo. */}
          <noscript
            dangerouslySetInnerHTML={{
              __html: `<style>.${styles.fallbackBody}.${styles.fallbackBody}{position:static;width:auto;height:auto;overflow:visible;clip-path:none;white-space:normal}</style>`,
            }}
          />
        </>
      )}
    </>
  );
}

export default function ScalarApiReference({
  document: openApiDocument,
  operations,
}: ScalarApiReferenceProps): ReactNode {
  return (
    <Layout
      title="REST API reference — FXR60 / FXR90"
      description="Every operation in the Zebra IoT Connector REST API for FXR60 / FXR90 fixed RFID readers, rendered from the vendor OpenAPI document."
      wrapperClassName={styles.wrapper}
      noFooter
    >
      <ScalarColorMode />

      <nav className={styles.chrome} aria-label="Reference sections">
        <Link className={styles.back} to="/api-reference/rest">
          <span aria-hidden="true">←</span> REST API reference
        </Link>
        <span className={styles.scope}>FXR60 / FXR90 fixed readers only</span>
      </nav>

      {/* NO `BrowserOnly` HERE, DELIBERATELY. It would keep the operation index out of the
          prerendered html, which is the one thing that index exists for — see OperationIndex. The
          renderer is still client-only: it is imported and mounted from an effect, and effects do
          not run during static generation. */}
      {/* `ziotc-scalar` and nothing else: the class scopes the token map in
          src/css/scalar-api-reference.scss and paints nothing. See the note in styles.module.scss
          about why this element deliberately has no layout rules. */}
      <div className="ziotc-scalar">
        <ScalarMount document={openApiDocument} operations={operations} />
      </div>
    </Layout>
  );
}
