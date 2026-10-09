/**
 * THE SITE'S FIVE TOP-LEVEL SECTIONS — one datum, two readers.
 *
 * Sidebar key -> the section's title, the route that title links to, which spec version (if
 * any) sits under it, and which section it hangs off. The keys are the five declared in
 * sidebars/*.ts: `docs` (guides.ts), `api-mqtt` (api-mqtt.ts), `api-rest` (api-rest.ts),
 * `resources` (resources.ts) and `apiIndex` (api-reference.ts).
 *
 * THESE KEYS ARE SIDEBAR NAMES, NOT PLUGIN INSTANCE IDS. `api-mqtt` happens to be both;
 * `api-rest` is the sidebar name on the instance whose id is still `fxr`. Renamed from
 * `apiReference` / `fxr` on 2026-09-05 — a key that does not match a real sidebar name
 * silently drops the panel header rather than failing the build, so this map is the one
 * place the rename had to reach.
 *   THAT SENTENCE IS NO LONGER TRUE, AND THE SEAM IT DESCRIBED IS CLOSED — 2026-09-07. It is
 * kept because the shape of the mistake is worth keeping: for two days this file restated the
 * five names by hand and nothing linked them to `sidebars/*.ts`, so renaming a sidebar there
 * dropped the panel header and the breadcrumb ancestors at runtime behind a green build. An
 * earlier note here went further and called the seam unclosable, on the reasoning that the
 * names are string keys in five `SidebarsConfig` objects with no type to derive from. That was
 * wrong, and it was wrong about one annotation: `SidebarsConfig` is
 * `{[sidebarId: string]: …}`, so `const sidebars: SidebarsConfig = {…}` DECLARES the index
 * signature as the const's type and erases the literal keys. The three files Docusaurus loads
 * as `sidebarPath` now close with `} satisfies SidebarsConfig` instead — identical checking,
 * no widening — and `SidebarName` below is derived from them. Renaming, adding or removing a
 * sidebar name is a build error from this file's side now. See `SidebarName`.
 *
 * WHY IT IS A FILE OF ITS OWN, as of 2026-09-06. It was a private `SIDEBAR_HEADERS` const in
 * src/theme/DocSidebar/Desktop/Content/index.tsx, which prints the title at the top of the
 * sidebar panel. src/theme/DocBreadcrumbs now needs the same five titles and the same five
 * hrefs, for the section ancestors it prepends to every trail, and a second copy would fork
 * one concept across two definitions. With one row per section and two readers of it, a crumb
 * that disagrees with the panel title one column to its left is not expressible.
 *   IT IS NOT THE ONLY PLACE THESE STRINGS APPEAR, and claiming otherwise would be wrong:
 * src/components/NotFoundBody.tsx, src/client-modules/posthog.ts and src/pages/index.tsx each
 * carry their own copy for their own purpose. Those were left alone. What this file guarantees
 * is narrower and worth having on its own: the sidebar panel header and the breadcrumb trail —
 * the two places a reader sees the section named at the same time — cannot disagree.
 *
 * THE HREFS CARRY NO TRAILING SLASH, and that is a decision rather than an oversight.
 * ContentWrapper compares `useBaseUrl(href)` against a `useLocation().pathname` whose trailing
 * slash it trims, so both forms work for it. `<Link>` runs every internal href through
 * `applyTrailingSlash` (@docusaurus/core lib/client/exports/Link.js), so the rendered
 * `<a href>` picks up the site's canonical slash whatever is written here. The one place the
 * stored form survives verbatim is the JSON-LD `BreadcrumbList`, which publishes
 * `siteConfig.url + href` — and Docusaurus' own permalinks for these five pages are not
 * uniform, so there is no single form to match. Read off the running site 2026-09-06:
 * /guides/, /resources/, /api-reference/mqtt/ and /api-reference/rest/ are index.mdx files and
 * end in a slash; /api-reference is docs/api-reference.mdx, which is not, and does not.
 *
 * `parent` IS THE FIELD THE BREADCRUMB ADDED, and it holds the two edges the IA actually has:
 * both API references hang off the /api-reference/ chooser (docs/api-reference.mdx). Guides,
 * Resources and the chooser itself are top level and carry none, which is what makes their
 * ancestor trail exactly one crumb long. ContentWrapper does not read it.
 */
/**
 * EVERY SIDEBAR NAME THE SITE DECLARES, DERIVED FROM THE FILES THAT DECLARE THEM.
 *
 * There is no list of names in this file any more. `sidebars/*.ts` is the single source of
 * truth, and this union reads it: rename `docs` to `guides` over there and every reference here
 * fails to compile, where until 2026-09-07 it produced a green build and a missing sidebar
 * header. That is the whole point of the change.
 *
 * THREE MODULES, NOT FIVE, and the asymmetry is real rather than an oversight. Docusaurus only
 * loads three of the five files as a `sidebarPath` — `guides.ts` (docusaurus.config.ts:1242),
 * `api-mqtt.ts` (:519) and `api-rest.ts` (:554). `resources.ts` and `api-reference.ts` export a
 * `SidebarsConfig[string]` VALUE each, which `guides.ts` composes into its own object
 * (`{docs, resources, apiIndex}`), so their names arrive through `guides.ts` and reading them
 * here again would double-count. Following `sidebarPath` rather than the file listing is what
 * keeps this union equal to the set Docusaurus actually registers.
 *
 * `typeof import(...)` RATHER THAN A REAL IMPORT, deliberately: this module is client code that
 * ships in the browser bundle, and `sidebars/*.ts` are ~1,100 lines of build-time configuration
 * between them. A type query is erased before bundling — it emits no `import` at all — so the
 * union costs nothing at runtime. A value import would pull all three trees into the client.
 *
 * WHAT IS STILL HAND-MAINTAINED, stated plainly because the last version of this note
 * overclaimed in the other direction: the THREE MODULE PATHS above. A fourth docs plugin
 * instance with its own `sidebarPath` would not appear here on its own. That is a far smaller
 * and more visible surface than five bare string literals — three imports whose job is obvious,
 * versus names that looked like data — and adding a plugin instance is a deliberate act where
 * renaming a sidebar is a casual one. Closing it too would mean importing docusaurus.config.ts
 * into client code, which is Node-side and calls `require.resolve`; not worth the coupling.
 */
export type SidebarName =
  | keyof typeof import('@site/sidebars/guides').default
  | keyof typeof import('@site/sidebars/api-mqtt').default
  | keyof typeof import('@site/sidebars/api-rest').default;

/**
 * A COMPILE-TIME TRIPWIRE FOR THE ONE REGRESSION THAT WOULD BE SILENT, and the reason it is
 * here rather than in a test is that there is nothing to run — it fails the build or it does
 * not exist.
 *
 * Everything below leans on `SidebarName` being a union of string LITERALS. If someone puts the
 * `: SidebarsConfig` annotation back on any of the three `const sidebars` declarations, that
 * file's `keyof` collapses to `string`, `string` swallows the whole union, and
 * `Record<SidebarName, SiteSection>` quietly degrades to `Record<string, SiteSection>` — the
 * exact shape this work replaced. Nothing else in this file would complain: the map still
 * typechecks, `sectionFor` still narrows, every gate stays green, and the only symptom is that
 * a renamed sidebar stops being a build error again. It would be a total, invisible loss of the
 * guarantee.
 *
 * `string extends SidebarName` is true ONLY in that degraded state — a literal union is never a
 * supertype of `string` — so the conditional resolves to `never` and the assignment cannot
 * compile. It names no sidebar, so it needs no upkeep when one is added or renamed; it asserts
 * the SHAPE of the type, not its members. Deliberately not an exhaustiveness check against a
 * written-out list of the five names: that would re-introduce by hand exactly the restatement
 * this file just got rid of.
 */
type NamesAreLiteralUnion = string extends SidebarName ? never : true;
const _namesAreLiteralUnion: NamesAreLiteralUnion = true;
void _namesAreLiteralUnion;

export type SiteSection = {
  title: string;
  href: string;
  version?: 'rest' | 'mqtt';
  /**
   * The sidebar name of the section this one sits under; absent for a top-level section.
   *
   * TYPED `SidebarName`, NOT `string`, since 2026-09-07. A parent naming a section that does
   * not exist is now a build error rather than a trail that silently stops one crumb short —
   * `sectionTrail` looks the value up in the same map, so a typo here used to end the walk
   * early and print a shorter, plausible-looking trail.
   */
  parent?: SidebarName;
};

/**
 * RENAMED FROM `SITE_SECTIONS` on 2026-09-07, and the name is the point.
 *
 * The VALUES model the site's five top-level sections. The KEYS are sidebar names — an artifact
 * of the sidebar layer, not a section identity: this section is titled "Guides" and keyed
 * `docs`, and the chooser is titled "API Reference" and keyed `apiIndex`. `SITE_SECTIONS` named
 * only half of that and read oddly at both call sites, which index it with `sidebar.name`.
 * `SECTIONS_BY_SIDEBAR` is true of the keys and the values at once, and restores the fluency
 * the original `SIDEBAR_HEADERS` had before this datum acquired its second reader.
 *   The predecessor's own name is worth keeping in the record: it was `SIDEBAR_HEADERS`, a
 * private const in src/theme/DocSidebar/Desktop/Content/index.tsx, which named the one place it
 * was RENDERED. That stopped being unique the moment DocBreadcrumbs began reading the same rows,
 * and it was never able to describe `parent` at all — a header is a string at the top of a
 * panel and has no ancestor. Naming the model rather than one of its views is what the two
 * renames have been converging on.
 *
 * NOT EXPORTED, and that is load-bearing rather than tidiness. `sectionFor` below is meant to
 * be the only way in, but a narrowed key type does NOT enforce that on its own: this project
 * leaves `strict` and `noImplicitAny` unset (`npx tsc --showConfig`), so
 * `SECTIONS_BY_SIDEBAR[someString]` compiles clean and yields `any` instead of erroring. An
 * earlier draft of this file claimed the type made that impossible; it was tested and it does
 * not. Module scope does, at every setting, so the boundary is enforced by not exporting the
 * map rather than by a rule the compiler is not configured to apply. Export it again only
 * alongside a guarded accessor, or after turning `noImplicitAny` on.
 */
const SECTIONS_BY_SIDEBAR: Record<SidebarName, SiteSection> = {
  docs: {title: 'Guides', href: '/guides'},
  'api-rest': {
    title: 'REST API',
    href: '/api-reference/rest',
    version: 'rest',
    parent: 'apiIndex',
  },
  'api-mqtt': {
    title: 'MQTT API',
    href: '/api-reference/mqtt',
    version: 'mqtt',
    parent: 'apiIndex',
  },
  resources: {title: 'Resources', href: '/resources'},
  /* The /api-reference/ chooser. NO VERSION, and this is the one case where that is not the
     conceptual-vs-reference rule doing the work: the page fronts BOTH specs, which sit at
     v3.0.0 and v2.0.0. Printing either would label the panel with a version half of it is
     not at, and printing both would put two numbers under one title. The versions belong on
     the two references themselves, one row down, where each is unambiguous. */
  apiIndex: {title: 'API Reference', href: '/api-reference'},
};

/**
 * The section a sidebar name belongs to, or `undefined` for a name this file does not know.
 *
 * BOTH READERS GO THROUGH HERE, because the map is keyed on `SidebarName` and the name they
 * hold is a runtime `string`: `useDocsSidebar().name` is typed `string` by Docusaurus and its
 * value is whatever `sidebars/*.ts` declares.
 *   IT IS A REAL MEMBERSHIP TEST, NOT AN ASSERTION. `SIDEBAR_NAMES.includes` is what narrows
 * `string` to `SidebarName`, and `undefined` is the honest answer for a name that is not one of
 * the five. A cast would have been shorter and would have handed back a `SiteSection` that can
 * be absent at runtime while claiming it never is — strictly worse than the loose
 * `Record<string, …>` this replaced, because the old shape at least admitted the possibility.
 *   WHAT EACH HALF ACTUALLY BUYS, since it is easy to credit the type with too much. The
 * narrowed key type polices the MAP: a missing row, a misspelled key and a `parent` naming a
 * section that does not exist are all build errors (verified by mutation — each one was
 * introduced and `tsc` was made to reject it). It does NOT police LOOKUPS, because
 * `noImplicitAny` is unset here; that is why the map is module-private and this function is the
 * only door. And what this function buys at runtime is that a sidebar the map has never heard
 * of degrades to "no header, no ancestors" rather than throwing mid-render.
 */
export function sectionFor(sidebarName: string | undefined): SiteSection | undefined {
  return sidebarName !== undefined && isSidebarName(sidebarName)
    ? SECTIONS_BY_SIDEBAR[sidebarName]
    : undefined;
}

/**
 * The runtime half of `SidebarName`, TAKEN FROM THE MAP'S OWN KEYS rather than written out.
 *
 * `SECTIONS_BY_SIDEBAR` is `Record<SidebarName, SiteSection>` and therefore exhaustive, so its
 * keys ARE the full set of sidebar names — there is nothing a separate array could add except a
 * way to disagree. It replaced a hand-written `SIDEBAR_NAMES` literal on 2026-09-07, at which
 * point the last restatement of these names in this file went away.
 *
 * THE CAST IS SOUND HERE AND WOULD NOT BE ANYWHERE ELSE. `Object.keys` is typed `string[]`
 * because a JS object can carry keys its type does not mention; this one is a module-private
 * const initialised by a literal that the compiler has already checked against
 * `Record<SidebarName, …>`, so no other key can reach it. That is also why the map must stay
 * private — see its own note.
 *
 * DECLARED AFTER THE MAP, and it has to be: these are module-level consts evaluated top to
 * bottom, so hoisting this above `SECTIONS_BY_SIDEBAR` would read a `TDZ` binding and throw at
 * import time. `isSidebarName` below is a function declaration and is hoisted, so its position
 * does not matter; this is the one ordering constraint in the file.
 */
const SIDEBAR_NAMES = Object.keys(SECTIONS_BY_SIDEBAR) as readonly SidebarName[];

function isSidebarName(name: string): name is SidebarName {
  return (SIDEBAR_NAMES as readonly string[]).includes(name);
}

/**
 * The chain of sections a page in `sidebarName` sits under, ROOT FIRST — `[API Reference,
 * MQTT API]` for `api-mqtt`, `[Guides]` for `docs`, `[]` for a name this file does not know.
 *
 * AN UNKNOWN NAME RETURNS AN EMPTY TRAIL, deliberately, matching what ContentWrapper does
 * with the same map: a sixth tree added to sidebars/*.ts without a row above prepends nothing,
 * which is visible and self-correcting, where guessing an ancestor from the URL would print
 * something plausible and wrong.
 *
 * IT STOPS ON A KEY IT HAS ALREADY WALKED. This runs inside a render, and the one failure mode
 * a hand-maintained `parent` has is a cycle, which a plain `while (key)` turns into a hung page.
 * Breaking on a repeat rather than counting hops matters: a hop budget would keep unshifting
 * the same two rows until it ran out, and a caller that de-duplicates would then quietly
 * collapse them back down to a plausible-looking trail. Stopping leaves the chain visibly
 * truncated instead.
 */
export function sectionTrail(sidebarName: string | undefined): SiteSection[] {
  const trail: SiteSection[] = [];
  const walked = new Set<string>();
  /* `string | undefined` rather than `SidebarName | undefined`: the FIRST value comes from
     Docusaurus and may be any sidebar name at all, while every later one is `section.parent`
     and therefore already a `SidebarName`. Widening the variable to the looser of the two is
     what lets `sectionFor` do the narrowing in one place instead of at each hop. */
  let key: string | undefined = sidebarName;
  while (key !== undefined && !walked.has(key)) {
    const section = sectionFor(key);
    if (!section) {
      break;
    }
    walked.add(key);
    trail.unshift(section);
    key = section.parent;
  }
  return trail;
}
