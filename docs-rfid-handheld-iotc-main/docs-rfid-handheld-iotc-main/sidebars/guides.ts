import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';
import type { LiteralSidebarKeys } from './literal-keys-guard';

/**
 * Sidebar for the MAIN docs instance — the Guides section.
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
import { resources } from './resources';
import { apiIndex } from './api-reference';

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
  resources,

  // THE /api-reference/ LANDING PAGE'S OWN SIDEBAR. Split into sidebars/api-reference.ts of
  // its own on 2026-09-02 — see that file's header for why it exists, why it is a separate
  // file rather than inline here, and why every leaf below the two category headers is a
  // `link` rather than a `doc`. Imported here, exactly as `resources` is above, because
  // Docusaurus resolves a sidebar by NAME against the one `SidebarsConfig` object this
  // instance's `sidebarPath` points at — never by which file that name was written in.
  apiIndex,

  docs: [
    /* THE "Guides" ROW USED TO BE HERE, AND IT WAS A DUPLICATE OF THE PANEL'S OWN TITLE.
     * Removed 2026-08-29: the sidebar header above prints "Guides" and now links to /guides/,
     * so a first row saying "Guides" and going to the same URL said the same thing twice, one
     * line apart. The page is still in this tree's sidebar — docs/guides/index.mdx carries
     * `displayed_sidebar: docs`, which is what keeps the panel on a page no sidebar lists.
     *   WHAT WENT WITH IT: the `sidebar-icon--route` glyph (a row mark, with no row left to
     * mark) and the `sidebar-index-row` geometry rules in src/css/sidebar.scss, whose only two
     * consumers were this row and the identical one in resources.ts. The `route` token stays in
     * the registry, where the card map still reads it.
     *   THE NAVBAR CHIP MOVED WITH IT. It was `type: 'docSidebar'`, which resolves to a
     * sidebar's FIRST DOC — so deleting this row would have silently repointed "Guides" in the
     * navbar at Get Oriented. It is now an explicit `to: '/guides'`. See docusaurus.config.ts. */
    {
      type: 'category',
      label: 'Get Oriented',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--compass',
      description: 'Decide whether and how to use the IoT Connector: what it is, and what you need before you set up a reader.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '👋', card: 'What the IoT Connector is, and what you need before you start.' },
      link: { type: 'doc', id: 'guides/get-oriented/index' },
      items: [
        'guides/get-oriented/what-the-iot-connector-is',
        'guides/get-oriented/what-you-need',
      ],
    },
    /* A SINGLE TOP-LEVEL PAGE since v3 (OD17), not a category: one path to a first success. Its
     * four steps are sections of the one page (#prepare, #first-command, #first-tag-reads, #next).
     * It keeps the outlined frame the live sidebar gave it (`sidebar-row-recommended`). */
    {
      type: 'doc',
      id: 'guides/quick-start/index',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--bolt sidebar-row-recommended',
    },
    {
      type: 'category',
      label: 'Core Concepts',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--layers',
      description: 'The mental models that two or more other sections rely on: how the IoT Connector communicates, and how the reader reads tags and holds its configuration.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🧩', card: 'The mental models the rest of the documentation relies on.' },
      link: { type: 'doc', id: 'guides/core-concepts/index' },
      items: [
        {
          type: 'category',
          label: 'The Communication Model',
          description: 'How the IoT Connector communicates: how it works, MQTT in the IoT Connector, endpoints, topics and channels, commands, responses and events, delivery and disconnects, and the security model.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🔗', card: 'How the IoT Connector communicates.' },
          link: { type: 'doc', id: 'guides/core-concepts/the-communication-model' },
          items: [
            'guides/core-concepts/how-the-iot-connector-works',
            'guides/core-concepts/mqtt-in-the-iot-connector',
            'guides/core-concepts/endpoints-topics-and-channels',
            'guides/core-concepts/commands-responses-and-events',
            'guides/core-concepts/delivery-retries-and-disconnects',
            'guides/core-concepts/the-security-model',
          ],
        },
        {
          type: 'category',
          label: 'Reading and Configuring',
          description: 'How the radio reads tags, the tag data stream, and the configuration model.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '⚙️', card: 'How the reader reads tags and holds its configuration.' },
          link: { type: 'doc', id: 'guides/core-concepts/reading-and-configuring' },
          items: [
            'guides/core-concepts/how-the-radio-reads-tags',
            'guides/core-concepts/the-tag-data-stream',
            'guides/core-concepts/the-configuration-model',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Manage Your Reader',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--sliders',
      description: 'Inspect or change one reader: bootstrap it, check its identity and status, configure its MQTT endpoints and Wi-Fi, secure it, and update its firmware.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🎛️', card: 'Set up, secure, and maintain one reader.' },
      link: { type: 'doc', id: 'guides/manage-your-reader/index' },
      items: [
        {
          type: 'category',
          label: 'Set Up',
          description: 'Set up one reader: bootstrap it with 123RFID Desktop, inspect its identity and status, and configure its MQTT endpoints and Wi-Fi.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🚀', card: 'Bootstrap a reader, then configure its endpoints and Wi-Fi.' },
          link: { type: 'doc', id: 'guides/manage-your-reader/set-up' },
          items: [
            'guides/manage-your-reader/bootstrap-reader',
            'guides/manage-your-reader/inspect-reader-identity-and-status',
            'guides/manage-your-reader/configure-mqtt-endpoints',
            'guides/manage-your-reader/configure-wi-fi',
          ],
        },
        {
          type: 'category',
          label: 'Secure and Maintain',
          description: 'Secure and maintain one reader: install and manage certificates, secure an endpoint with TLS and client certificates, and update firmware and restart the reader.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🛡️', card: 'Certificates, TLS, and firmware updates for one reader.' },
          link: { type: 'doc', id: 'guides/manage-your-reader/secure-and-maintain' },
          items: [
            'guides/manage-your-reader/install-and-manage-certificates',
            'guides/manage-your-reader/secure-an-endpoint',
            'guides/manage-your-reader/update-firmware-and-restart',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Read Tags and Barcodes',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--broadcast',
      description: 'Control how the reader reads and what it reports: run an inventory, tune read performance, filter and shape tag data, and access tag memory.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '📡', card: 'Run inventory, tune performance, and shape what the reader reports.' },
      link: { type: 'doc', id: 'guides/read-tags-and-barcodes/index' },
      items: [
        {
          type: 'category',
          label: 'Run Inventory',
          description: 'Start and stop inventory, configure trigger and stop conditions, and scan barcodes.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '▶️', card: 'Start and stop inventory, and scan barcodes.' },
          link: { type: 'doc', id: 'guides/read-tags-and-barcodes/run-inventory' },
          items: [
            'guides/read-tags-and-barcodes/start-and-stop-inventory',
            'guides/read-tags-and-barcodes/configure-trigger-and-stop-conditions',
            'guides/read-tags-and-barcodes/scan-barcodes',
          ],
        },
        {
          type: 'category',
          label: 'Tune Read Performance',
          description: 'Choose a performance profile, configure advanced radio settings, and improve read performance.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🎚️', card: 'Profiles, radio settings, and read performance.' },
          link: { type: 'doc', id: 'guides/read-tags-and-barcodes/tune-read-performance' },
          items: [
            'guides/read-tags-and-barcodes/choose-a-performance-profile',
            'guides/read-tags-and-barcodes/configure-advanced-radio-settings',
            'guides/read-tags-and-barcodes/improve-read-performance',
          ],
        },
        {
          type: 'category',
          label: 'Filter and Shape Tag Data',
          description: 'Pre-filter tags with Select, post-filter reported tags, and choose which tag fields are reported.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🎯', card: 'Pre-filters, post-filters, and reported tag fields.' },
          link: { type: 'doc', id: 'guides/read-tags-and-barcodes/filter-and-shape-tag-data' },
          items: [
            'guides/read-tags-and-barcodes/pre-filter-tags-with-select',
            'guides/read-tags-and-barcodes/post-filter-reported-tags',
            'guides/read-tags-and-barcodes/choose-tag-data-fields',
          ],
        },
        {
          type: 'category',
          label: 'Tag Memory',
          description: 'Read and write tag memory.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🏷️', card: 'Read and write tag memory.' },
          link: { type: 'doc', id: 'guides/read-tags-and-barcodes/tag-memory' },
          items: [
            'guides/read-tags-and-barcodes/read-and-write-tag-memory',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Build Your Integration',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--sitemap',
      description: 'Design decisions and code in your application: plan the integration, exchange messages with the reader, and harden it for production.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🔗', card: 'Plan, build, and harden your application.' },
      link: { type: 'doc', id: 'guides/build-your-integration/index' },
      items: [
        'guides/build-your-integration/build-a-minimal-integration',
        {
          type: 'category',
          label: 'Design',
          description: 'Plan your integration, and choose shared or dedicated data endpoints.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🗂️', card: 'Plan your integration and its data endpoints.' },
          link: { type: 'doc', id: 'guides/build-your-integration/design' },
          items: [
            'guides/build-your-integration/plan-your-integration',
            'guides/build-your-integration/choose-shared-or-dedicated-data-endpoints',
          ],
        },
        {
          type: 'category',
          label: 'Exchange Messages',
          description: 'Connect your application to the broker, send commands and handle responses, track asynchronous commands, handle events, and consume tag data.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '↔️', card: 'Connect, send commands, and handle events and tag data.' },
          link: { type: 'doc', id: 'guides/build-your-integration/exchange-messages' },
          items: [
            'guides/build-your-integration/connect-your-application',
            'guides/build-your-integration/send-commands-and-handle-responses',
            'guides/build-your-integration/track-asynchronous-commands',
            'guides/build-your-integration/handle-events',
            'guides/build-your-integration/consume-tag-data',
          ],
        },
        {
          type: 'category',
          label: 'Harden for Production',
          description: 'Retry commands safely, recover from disconnects, manage tag data throughput, and test your integration.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🔧', card: 'Retries, reconnects, throughput, and testing.' },
          link: { type: 'doc', id: 'guides/build-your-integration/harden-for-production' },
          items: [
            'guides/build-your-integration/retry-commands-safely',
            'guides/build-your-integration/recover-from-disconnects',
            'guides/build-your-integration/manage-tag-data-throughput',
            'guides/build-your-integration/test-your-integration',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Operate and Monitor',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--pulse',
      description: 'Keep deployed readers observable and healthy: what to monitor, event reporting, connectivity, health and battery, alerts, and a fleet health view.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🩺', card: 'Keep deployed readers observable and healthy.' },
      link: { type: 'doc', id: 'guides/operate-and-monitor/index' },
      items: [
        'guides/operate-and-monitor/what-to-monitor-and-why',
        'guides/operate-and-monitor/configure-event-reporting',
        'guides/operate-and-monitor/monitor-reader-connectivity',
        'guides/operate-and-monitor/monitor-reader-health-and-battery',
        'guides/operate-and-monitor/respond-to-alerts',
        'guides/operate-and-monitor/build-a-fleet-health-view',
      ],
    },
    {
      type: 'category',
      label: 'Scale to a Fleet',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--grid',
      description: 'Processes that exist only because there are many readers: provisioning, consistent configuration, and staged rollouts.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🏗️', card: 'Provision many readers and keep them consistent.' },
      link: { type: 'doc', id: 'guides/scale-to-a-fleet/index' },
      items: [
        'guides/scale-to-a-fleet/what-changes-when-you-scale',
        'guides/scale-to-a-fleet/provision-readers',
        'guides/scale-to-a-fleet/keep-configuration-consistent',
        'guides/scale-to-a-fleet/roll-out-changes-in-stages',
      ],
    },
    {
      type: 'category',
      label: 'Diagnose and Recover',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--wrench',
      description: 'Start from a symptom and end at a fix: symptom pages, diagnosis by system area, recovery playbooks, fleet-wide incidents, and escalation.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🩹', card: 'Start from a symptom and end at a fix.' },
      link: { type: 'doc', id: 'guides/diagnose-and-recover/index' },
      items: [
        {
          type: 'category',
          label: 'Start from a Symptom',
          description: 'Symptom pages: commands get no response, no events arrive, no tag data or missing reads, the reader cannot connect to the broker or keeps disconnecting, and an update or install never completes.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🚨', card: 'Start from what you see, and end at a fix.' },
          link: { type: 'doc', id: 'guides/diagnose-and-recover/start-from-a-symptom' },
          items: [
            'guides/diagnose-and-recover/commands-get-no-response',
            'guides/diagnose-and-recover/no-events-arrive',
            'guides/diagnose-and-recover/no-tag-data',
            'guides/diagnose-and-recover/cannot-connect-to-the-broker',
            'guides/diagnose-and-recover/reader-keeps-disconnecting',
            'guides/diagnose-and-recover/update-or-install-never-completes',
          ],
        },
        {
          type: 'category',
          label: 'Diagnose by System Area',
          description: 'The layered model for locating an IOTC fault — Wi-Fi link, MQTT session, application — and the catalog of twenty failure modes (FM-NN) that live in each layer.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '⚠️', card: 'The layered model for locating an IOTC fault — Wi-Fi link, MQTT session.' },
          link: { type: 'doc', id: 'guides/diagnose-and-recover/diagnose-by-system-area/index' },
          items: [
            'guides/diagnose-and-recover/diagnose-by-system-area/reader-and-hardware',
            'guides/diagnose-and-recover/diagnose-by-system-area/network-and-connectivity',
            'guides/diagnose-and-recover/diagnose-by-system-area/mqtt-connection',
            'guides/diagnose-and-recover/diagnose-by-system-area/endpoints-and-configuration',
            'guides/diagnose-and-recover/diagnose-by-system-area/rfid-read-performance',
            'guides/diagnose-and-recover/diagnose-by-system-area/application-integration',
          ],
        },
        {
          type: 'category',
          label: 'Recovery Playbooks',
          description: 'Nine step-by-step recovery playbooks (RP-01 to RP-09) for IOTC failures, grouped into four pages: reconnect the reader, restore MQTT, fix configuration, fix firmware.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🛟', card: 'Nine step-by-step recovery playbooks (RP-01 to RP-09) for IOTC failures.' },
          link: { type: 'doc', id: 'guides/diagnose-and-recover/recovery-playbooks/index' },
          items: [
            'guides/diagnose-and-recover/recovery-playbooks/reconnect-the-reader',
            'guides/diagnose-and-recover/recovery-playbooks/restore-mqtt-connectivity',
            'guides/diagnose-and-recover/recovery-playbooks/recover-from-configuration-problems',
            'guides/diagnose-and-recover/recovery-playbooks/recover-from-firmware-problems',
            'guides/diagnose-and-recover/recovery-playbooks/factory-reset-and-re-bootstrap',
          ],
        },
        'guides/diagnose-and-recover/scope-a-fleet-wide-incident',
        'guides/diagnose-and-recover/escalate-to-support',
      ],
    },
  ],
} satisfies SidebarsConfig;

/* The literal keys above are load-bearing: src/components/siteSections.ts derives its
 * `SidebarName` union from them. This line fails the build, with the reason and the fix in the
 * error text, if the `: SidebarsConfig` annotation is ever restored on the const and the keys
 * widen to `string`. See sidebars/literal-keys-guard.ts for why that regression is otherwise
 * completely silent. `npm run lint:sidebar-sources` checks this line is still here. */
const _literalKeys: LiteralSidebarKeys<typeof sidebars> = true;
void _literalKeys;

export default sidebars;
