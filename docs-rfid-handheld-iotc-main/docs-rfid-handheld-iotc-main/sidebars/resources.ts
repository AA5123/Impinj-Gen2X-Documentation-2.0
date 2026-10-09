import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

/**
 * Sidebar for the Resources section of the MAIN docs instance.
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

/* Exported by name as well as by default: sidebars/guides.ts imports it so that both
 * sidebars are declared by the one instance that serves them. */
export const resources: SidebarsConfig[string] = [
  /* REBUILT TO IA v3 on 2026-09-19 (iotc-ia-outline-v3.md). Three pages and three categories, each
   * group with a landing page of its own (OD18). Every top-level row carries a
   * glyph, because the collapsed rail shows nothing else; BOTH classes are required on every row:
   * the paint rule keys on `sidebar-icon--<name>`, the geometry rule on the bare `sidebar-icon`.
   * Paint rules are in src/css/sidebar-icons.scss. */
  { type: 'doc', id: 'resources/glossary', className: 'sidebar-icon sidebar-icon--book-a' },
  { type: 'doc', id: 'resources/faq', className: 'sidebar-icon sidebar-icon--help-circle' },
  { type: 'doc', id: 'resources/known-issues-and-open-questions', className: 'sidebar-icon sidebar-icon--alert-triangle' },
  {
    type: 'category',
    label: 'Readers, Radio, and Tags',
    className: 'sidebar-icon sidebar-icon--device',
    description: 'Supported readers and features, reader factory defaults, RF regions and regulations, and tag and EPC standards.',
    collapsible: true,
    collapsed: true,
    customProps: { emoji: '📟', card: 'Supported readers, defaults, RF regions, and tag standards.' },
    link: { type: 'doc', id: 'resources/readers-radio-and-tags' },
    items: [
      'resources/supported-readers-and-features',
      'resources/reader-factory-defaults',
      'resources/rf-regions-and-regulations',
      'resources/tag-and-epc-standards',
    ],
  },
  {
    type: 'category',
    label: 'Network and Tools',
    className: 'sidebar-icon sidebar-icon--route',
    description: 'Network ports and firewall requirements, setup tools, and 123RFID Desktop settings with their MQTT equivalents.',
    collapsible: true,
    collapsed: true,
    customProps: { emoji: '🌐', card: 'Ports and firewall rules, setup tools, and 123RFID equivalents.' },
    link: { type: 'doc', id: 'resources/network-and-tools' },
    items: [
      'resources/network-ports-and-firewall-requirements',
      'resources/setup-tools',
      'resources/123rfid-desktop-settings-and-mqtt-equivalents',
    ],
  },
  {
    type: 'category',
    label: 'Support',
    className: 'sidebar-icon sidebar-icon--headset',  /* a support desk. `life-buoy` was rejected: it is the identical circle r=10 as FAQs' help-circle */
    description: 'How to get help, report a bug or a security issue, and understand what support covers.',
    collapsible: true,
    collapsed: true,
    customProps: { emoji: '🛟', card: 'How to get help, and how to report a bug or a security issue.' },
    link: { type: 'doc', id: 'resources/support/index' },
    items: [
      'resources/support/get-help',
      'resources/support/report-a-bug-or-request-a-feature',
      'resources/support/report-a-security-issue',
      'resources/support/support-scope-and-lifecycle-policy',
    ],
  },
];

const sidebars: SidebarsConfig = { resources };
export default sidebars;
