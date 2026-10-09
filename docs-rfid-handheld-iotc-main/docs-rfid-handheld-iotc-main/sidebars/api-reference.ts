import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

/**
 * THE /api-reference/ LANDING PAGE'S OWN SIDEBAR — the two references, each expandable to
 * its own pages.
 *
 * Added 2026-08-29, expanded to categories 2026-09-01, split into this file of its own
 * 2026-09-02. `docs/api-reference.mdx` belongs to the MAIN docs instance — the one
 * `sidebars/guides.ts` declares via `sidebarPath` — but appears in no sidebar of its own, and
 * a doc no sidebar lists renders with none. The reader arriving from the navbar's
 * `API Reference` chip therefore lost the panel entirely for one page and got it back on the
 * next click, which reads as a broken layout rather than as a deliberate full-width page.
 *
 * ITS OWN FILE, NOT INLINE IN guides.ts, for the same reason resources.ts already is one:
 * a single Docusaurus docs instance can serve more than one named sidebar, and Docusaurus
 * resolves a sidebar by NAME (`apiIndex`) against whatever `SidebarsConfig` object
 * `sidebarPath` points at — never by which physical file that name happened to be written in.
 * `sidebars/guides.ts` imports this one by name, exactly as it already imports `resources`,
 * and merges it into the one object the MAIN instance actually reads. Every existing consumer
 * that names this sidebar — `SECTIONS_BY_SIDEBAR.apiIndex` in src/components/siteSections.ts,
 * read
 * by both src/theme/DocSidebar/Desktop/Content/index.tsx and src/theme/DocBreadcrumbs, and
 * `displayed_sidebar: apiIndex` in docs/api-reference.mdx's front matter — keys on that name,
 * not on a file path, so the split changes nothing either can see.
 *
 * EVERY ITEM BELOW THE TWO CATEGORY HEADERS IS A `link`, NOT A `doc`, and the reason is the
 * same one api-rest.ts states for its own Endpoints row: every page these categories point
 * at — /api-reference/rest/** and /api-reference/mqtt/** — is owned by one of two OTHER docs
 * instances (`fxr` and `api-mqtt`), and `type: 'doc'` resolves ids against THIS instance, so
 * all of them would fail to resolve. `onBrokenLinks: 'throw'` still validates an href, so a
 * typo here fails the build rather than shipping a dead row.
 *
 * THE CATEGORY HEADERS CARRY NO `link` EITHER, for a narrower reason: Docusaurus's own
 * `SidebarItemCategoryLinkConfig` type is `{type: 'doc', id} | {type: 'generated-index', ...}`
 * — there is no variant that takes an arbitrary href, so a category cannot be made to
 * navigate to a route outside this instance the way its children can. Clicking "REST API" or
 * "MQTT API" therefore only expands the category (the swizzled
 * src/theme/DocSidebarItem/Category renders a caret, not a link, whenever `!href`); reaching
 * either reference's own landing page is one click further, via its "Overview" child.
 *
 * EVERY CHILD ROW CARRIES A GLYPH AS OF 2026-09-05, and each one is the SAME glyph the row
 * it points at already carries in that reference's own sidebar — `Overview` takes
 * `book-open` from both `api-mqtt.ts:51` and `api-rest.ts:70`, `Management` takes
 * `sliders-vertical` from `api-mqtt.ts:111`, `Endpoints` takes `sitemap` from
 * `api-rest.ts:116`, and so on. Nothing is newly picked here; this sidebar was the one
 * place a concept appeared without its mark, so the fix was to mirror, not to choose.
 *   THIS NEEDED A CSS CHANGE, not just these classNames. Every rule in
 * src/css/sidebar-icons.scss was scoped `.theme-doc-sidebar-menu > li`, i.e. tier-1 only,
 * and every row below is tier-2 — so the classes alone painted nothing. The child
 * combinator was dropped from all 29 selectors; see that file's header for what was given
 * up. BOTH classes are still required on every row: paint keys on `sidebar-icon--<name>`,
 * geometry on the bare `sidebar-icon`.
 *
 * THE CATEGORY HEADERS' OWN GLYPHS ARE THE NAVBAR'S GLYPHS. `RestApi: Globe` and `MqttApi: RadioTower` in
 * src/components/icons/index.tsx already own these two concepts, and that file's own rule
 * is that re-picking a mark "would fork one concept across two marks". `broadcast` is used
 * for MQTT rather than `radio-tower` because the two registry tokens hold the SAME lucide
 * glyph and only `broadcast` has a paint rule — see src/css/sidebar-icons.scss, which
 * documents `radio-tower` as read by no stylesheet and stays true.
 *
 * Exported by name as well as by default, mirroring resources.ts: sidebars/guides.ts imports
 * it so that both sidebars are declared by the one instance that serves them.
 */
export const apiIndex: SidebarsConfig[string] = [
  {
    type: 'category',
    label: 'MQTT API',
    className: 'sidebar-section-header sidebar-icon sidebar-icon--broadcast',
    description: 'Commands and events for RFD40 and RFD90 sleds.',
    collapsible: true,
    collapsed: true,
    customProps: { emoji: '📡' },
    items: [
      { type: 'link', label: 'Overview', href: '/api-reference/mqtt/overview', className: 'sidebar-icon sidebar-icon--book-open' },
      { type: 'link', label: 'Protocol', href: '/api-reference/mqtt/protocol-reference/', className: 'sidebar-icon sidebar-icon--sitemap' },
      { type: 'link', label: 'Management', href: '/api-reference/mqtt/management/', className: 'sidebar-icon sidebar-icon--sliders-vertical' },
      { type: 'link', label: 'Control', href: '/api-reference/mqtt/control/', className: 'sidebar-icon sidebar-icon--sliders' },
      { type: 'link', label: 'Events', href: '/api-reference/mqtt/events/', className: 'sidebar-icon sidebar-icon--bell' },
      { type: 'link', label: 'Telemetry', href: '/api-reference/mqtt/data/', className: 'sidebar-icon sidebar-icon--tag' },
      { type: 'link', label: 'Response Codes', href: '/api-reference/mqtt/response-codes/', className: 'sidebar-icon sidebar-icon--list' },
      { type: 'link', label: 'Limits', href: '/api-reference/mqtt/limits', className: 'sidebar-icon sidebar-icon--alert-triangle' },
      { type: 'link', label: 'Schemas', href: '/api-reference/mqtt/schemas/', className: 'sidebar-icon sidebar-icon--layers' },
    ],
  },
];

const sidebars: SidebarsConfig = { apiIndex };
export default sidebars;
