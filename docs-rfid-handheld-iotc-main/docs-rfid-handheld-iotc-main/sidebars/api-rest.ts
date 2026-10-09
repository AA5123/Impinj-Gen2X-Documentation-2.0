import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';
import type { LiteralSidebarKeys } from './literal-keys-guard';

/**
 * Sidebar for the 'fxr' docs instance — the FXR60 / FXR90 fixed-reader REST reference.
 *
 * THE SIDEBAR IS NAMED `api-rest`; THE INSTANCE IS STILL NAMED `fxr`. Renamed 2026-09-05
 * so both API sidebars are named after their transport. A sidebar name and a plugin
 * instance id are independent namespaces: `docusaurus.config.ts` pairs
 * `docsPluginId: 'fxr'` with `sidebarId: 'api-rest'` and both resolve. The instance id is
 * load-bearing elsewhere — `src/theme/ThemeProvider/TitleFormatter` matches on it to swap
 * the site title on these pages — so it was deliberately left alone.
 *
 * GENERATED FROM THE IA IN .ai-history/019-ia-spec-final.md AND THE URL ARCHITECTURE IN
 * .ai-history/020-documentation-url-architecture.md, and hand-maintained from here on.
 * Order is the top-to-bottom order of 019's tree; labels are its node names verbatim;
 * nesting and depth match it exactly.
 *
 * EVERY CATEGORY LINKS TO A REAL PAGE. Each node is a page, or a category with its own
 * landing page at index.mdx. Docusaurus' synthetic category index is a route with no file,
 * so it cannot be that landing page and cannot carry an intro; every category here takes a
 * doc link instead. The invariant is checkable: searching these four files for the
 * synthetic category-index link type must return no hits outside this comment.
 *
 * ORDER LIVES HERE, NOT IN FRONT MATTER. `sidebar_position` is also set on every page to
 * the same value, but Docusaurus ignores it whenever a sidebar lists items explicitly, as
 * this one does. This array is the effective source of truth; the front-matter field is
 * the declarative echo of it.
 */

/*
 * THE FIRST ROW IS 'Overview' AND IT LINKS TO THE INSTANCE ROOT. 020: "I would make
 * /api-reference/rest/ the canonical REST landing URL and not add
 * /api-reference/rest/overview/; the landing page itself is the Overview." So the six
 * Overview pages sit FLAT at /api-reference/rest/<slug>/ and the category's landing page
 * is index.mdx, whose own title is "REST API".
 */
/*
 * THERE IS NO GENERATED SLICE ANY MORE, and the ~50 lines that used to sit here are worth
 * summarising because their absence is the change.
 *
 * Until 2026-08-18 this file `require`d api/rest/reference/sidebar.ts — a file written by
 * docusaurus-plugin-openapi-docs beside the 89 MDX pages it generated — and spread it into the
 * Endpoints category below. The require was wrapped in a try/catch, because Docusaurus loads this
 * file to build its own config and the generator CLI was itself a Docusaurus command, so an
 * unguarded require made the generator impossible to run on a tree where its output was absent.
 * The catch then had to decide whether a miss was fatal, because tolerating one during a BUILD
 * shipped a live navbar entry and a landing page with 89 missing operations at exit 0, silently.
 * That whole apparatus — the require, the guard, the argv sniff that distinguished a generate from
 * a build, and the `filter(e => e.type === …)` partition that kept a regenerate from reordering the
 * tree — existed to make a committed generated artefact safe to depend on.
 *
 * The operations are no longer docs. They are one Scalar route registered by
 * plugins/scalar-api-reference, and Scalar builds its own sidebar from the OpenAPI document at read
 * time. So the Endpoints node below is a plain link to that route, this file has nothing generated
 * to import, and the failure mode the guard existed for cannot occur: there is no artefact to be
 * missing. If the vendor document itself is unreadable the plugin throws during `loadContent`,
 * which fails the build with the reason.
 *
 * SCHEMAS ARE STILL THREE HAND-AUTHORED PAGES (owner decision Q35, unchanged in substance). The
 * document's 134 component schemas are not published individually — Scalar is told
 * `hideModels`, which is the same judgement the old renderer's `showSchemas: false` recorded — and
 * 017's `Schemas` node is satisfied by the three pages under api/rest/schemas/.
 */

/*
 * `satisfies SidebarsConfig` AT THE FOOT OF THIS OBJECT, NOT `: SidebarsConfig` ON THE CONST —
 * changed 2026-09-07, and it is the difference between this file being the source of truth for
 * its own sidebar names and merely claiming to be.
 *
 * `SidebarsConfig` is `{[sidebarId: string]: SidebarItemConfig[] | …}`. An ANNOTATION makes that
 * index signature the declared type of the const, so `keyof typeof sidebars` collapses to
 * `string` and the literal key(s) below are gone from the type system the moment the file is
 * read from anywhere else. `satisfies` checks the identical assignability — every item in here
 * is validated exactly as before, and contextual typing still flows into the literal, so the
 * discriminated `type: 'category' | 'doc' | 'link'` members narrow as they always did — while
 * leaving the inferred type as the literal object. So `keyof` survives.
 *
 * WHO READS IT: src/components/siteSections.ts derives `SidebarName` from
 * `keyof typeof import('@site/sidebars/…').default` across the three files Docusaurus loads as
 * `sidebarPath`. That map is `Record<SidebarName, SiteSection>` and therefore exhaustive, so
 * renaming, adding or removing a sidebar name in this file now fails the BUILD instead of
 * silently dropping the panel header and the breadcrumb ancestors at runtime. Before this
 * change those names were restated by hand in that file with nothing linking the two.
 *
 * DO NOT RE-ADD THE ANNOTATION. It typechecks, it looks tidier, and it silently reopens the
 * seam — the failure mode is a green build and a missing sidebar header, which is exactly the
 * class of defect this project has been closing.
 */
const sidebars = {
  'api-rest': [
    {
      type: 'category',
      label: 'Overview',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--book-open',
      description: 'The IoT Connector REST API reference for FXR60 / FXR90 fixed readers, read from the vendor OpenAPI document: base URL and versioning, authentication, the request and response format, and every endpoint.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '📖' },
      link: { type: 'doc', id: 'index' },
      items: [
        'about-the-rest-api',
        'base-url-versioning-and-deprecation-policy',
        'authentication-and-tenancy',
        'request-and-response-format',
        'pagination-filtering-and-rate-limits',
        'how-to-read-this-reference',
      ],
    },
    {
      type: 'category',
      label: 'Getting Started',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--play',
      description: 'Orientation for the FXR60 / FXR90 REST API: where the base URL comes from, how to obtain a bearer token, how to make a first authenticated call, and how the operation reference is organized.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🚀' },
      link: { type: 'doc', id: 'getting-started/index' },
      items: [
        'your-first-rest-call',
      ],
    },
    /*
     * A `link`, NOT a `category` AND NOT A `doc`, and both halves of that matter.
     *
     * Not a doc: /api-reference/rest/endpoints is no longer a page of this docs instance. It is a
     * route owned by plugins/scalar-api-reference, and `type: 'doc'` resolves against this instance's
     * document ids, so it would fail to resolve. `type: 'link'` with an `href` is the only sidebar
     * item type that can point at a route from outside the instance — and `onBrokenLinks: 'throw'`
     * still validates it, so a typo here fails the build rather than shipping a dead row.
     *
     * Not a category: it has no children to hold. Scalar renders its own tag-grouped sidebar inside
     * that route, so a Docusaurus category here would duplicate a navigation tree the reader is
     * about to be handed a better version of, and would have to be kept in sync with a document this
     * file does not read.
     */
    {
      type: 'link',
      label: 'Endpoints',
      href: '/api-reference/rest/endpoints',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--sitemap',
      description: "Every operation in the vendor OpenAPI document, grouped by the specification's own tags.",
      customProps: { emoji: '🔗' },
    },
    {
      type: 'category',
      label: 'Schemas',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--layers',
      description: 'The object shapes the REST surface exchanges — common objects, configuration objects, and enumerations.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🌳' },
      link: { type: 'doc', id: 'schemas/index' },
      items: [
        'schemas/common-objects',
        'schemas/configuration-objects',
        'schemas/enumerations',
      ],
    },
    { type: 'doc', id: 'errors-and-status-codes', className: 'sidebar-section-header sidebar-icon sidebar-icon--alert-triangle' },
    { type: 'doc', id: 'changelog', className: 'sidebar-section-header sidebar-icon sidebar-icon--list' },
  ] as SidebarsConfig['api-rest'],
} satisfies SidebarsConfig;

/* The literal keys above are load-bearing: src/components/siteSections.ts derives its
 * `SidebarName` union from them. This line fails the build, with the reason and the fix in the
 * error text, if the `: SidebarsConfig` annotation is ever restored on the const and the keys
 * widen to `string`. See sidebars/literal-keys-guard.ts for why that regression is otherwise
 * completely silent. `npm run lint:sidebar-sources` checks this line is still here. */
const _literalKeys: LiteralSidebarKeys<typeof sidebars> = true;
void _literalKeys;

export default sidebars;
