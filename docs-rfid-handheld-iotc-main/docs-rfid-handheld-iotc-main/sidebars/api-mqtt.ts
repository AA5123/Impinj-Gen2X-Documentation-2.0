import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';
import type { LiteralSidebarKeys } from './literal-keys-guard';

/**
 * Sidebar for the 'api-mqtt' docs instance — the MQTT API reference for the
 * RFD40 / RFD90 handheld sleds. This is the ONLY API surface these sleds expose.
 *
 * THE SIDEBAR IS NAMED `api-mqtt` TOO, as of 2026-09-05 (it was `apiReference`). The name
 * now matches the instance id, but they remain two namespaces that merely agree —
 * `docsPluginId` is not derived from `sidebarId`. Consumers of the name:
 * `sidebarId` in docusaurus.config.ts, `SECTIONS_BY_SIDEBAR` in
 * src/components/siteSections.ts (read by the sidebar panel header in
 * src/theme/DocSidebar/Desktop/Content/index.tsx), and `sectionTrail` in that same module,
 * which src/theme/DocBreadcrumbs keys the section ancestors of every trail on.
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
 * DOC IDS ARE RELATIVE TO `path` (api/mqtt/reference), not to the URL. The published
 * prefix /api-reference/mqtt/** comes from `routeBasePath` on the instance.
 *
 * THE LANDING PAGE IS THE PANEL TITLE'S LINK, since IA v3. /api-reference/mqtt/ is index.mdx,
 * titled "MQTT API"; it is in no row, so its front matter sets `displayed_sidebar: api-mqtt`.
 * The first row is the "Overview" category, whose landing page is overview.mdx (OD18).
 *
 * OPERATIONS KEEP THE COMPACT CANONICAL ROUTES /mgmt/**, /ctrl/**, /events/**, /data/**,
 * which is 020's deliberate split: "human-facing protocol/category pages mirror the IA
 * hierarchy; individual API operations use the compact canonical API namespace." So
 * Management > Device Status is a real page at /management/device-status/ while the three
 * operations under it stay at /mgmt/get-status/ and siblings.
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
  'api-mqtt': [
    /* REBUILT TO IA v3 on 2026-09-19 (iotc-ia-outline-v3.md), EXCEPT Management, Control, Events and
     * Telemetry, which the owner kept exactly as they were. The landing page, /api-reference/mqtt/,
     * is the panel title's link; index.mdx carries `displayed_sidebar` for that reason. "Overview"
     * is a category with its own landing page, overview.mdx (OD18). */
    {
      type: 'category',
      label: 'Overview',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--book-open',
      description: 'How to read this reference, how the API is versioned, and its changelog.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '📚', card: 'How to read the reference, versioning, and the changelog.' },
      link: { type: 'doc', id: 'overview' },
      items: [
        'how-to-read-this-reference',
        'versioning-and-deprecation-policy',
        'changelog',
      ],
    },
    {
      type: 'category',
      label: 'Protocol',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--sitemap',
      description: 'The rules of the wire: connection and session, TLS and authentication, topics and channels, endpoints and topic slots, message envelopes and correlation, and delivery and retry semantics.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🧬', card: 'The rules of the wire: connection, security, topics, messages and delivery.' },
      link: { type: 'doc', id: 'protocol-reference/index' },
      items: [
        'protocol-reference/connection-and-session',
        'protocol-reference/tls-and-authentication',
        'protocol-reference/topic-structure',
        'protocol-reference/endpoints-and-topic-slots',
        'protocol-reference/message-envelope',
        'protocol-reference/qos-and-delivery-semantics',
      ],
    },
    {
      type: 'category',
      label: 'Management',
      /* `sidebar-row-outlined` — the permanent 2px frame, added 2026-09-06 by owner request for
       * "an outline similar to the Quick Start item in the Guides sidebar," with the same styling
       * and the same hover/current behaviour. It is literally the same six declarations: the
       * treatment was pulled out of `.sidebar-row-recommended` under a name that describes the
       * frame rather than an editorial claim, precisely so this rail could take it without
       * asserting that these five sections are "recommended" over their siblings. See the block
       * note in src/css/sidebar.scss.
       *   WHY THESE FIVE AND NOT ALL TWELVE. These are the rows that hold the API reference
       * itself — the commands, the events, the telemetry stream. Overview, Getting Started,
       * Connection and Security, Protocol Reference, Schemas, MDM Interface and
       * Response Codes are all prose ABOUT that surface. Because the five are contiguous, rows
       * five through nine, the frames read as one bracket around the reference block rather than
       * as five separate "special" marks, which is the failure mode the treatment's own note
       * warns about ("a bordered chip in a column of borderless ones").
       *   FIRST LEVEL ONLY, which the request also asked for, is not enforced here and does not
       * need to be: every selector in the CSS block is rooted at `.theme-doc-sidebar-menu > li`,
       * so a nested row cannot inherit the frame even if the class were stamped on it. */
      className: 'sidebar-section-header sidebar-icon sidebar-icon--sliders-vertical sidebar-row-outlined',
      description: 'Commands that query and configure the reader — device info and status, network, endpoints, certificates, event reporting, and device lifecycle.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🛠️', card: 'Commands that query and configure the reader — device info and status, network.' },
      link: { type: 'doc', id: 'management/index' },
      items: [
        {
          type: 'category',
          /* RENAMED 'Device Status' -> 'Device Info and Status' on 2026-09-06, owner-directed.
           * The old name undersold the group: two of its three operations return IDENTITY rather
           * than state — get_version is model/serial/SKU/firmware and get_current_region is
           * regulatory configuration. Only get_status is status.
           *   THE OWNER WROTE 'Device Info & Status'. Spelled `and` here because CONTRIBUTING.md
           * section 1 makes that a measurement rather than a judgement call: "Authored labels never
           * use `&`. They use `and`", enforced by a grep that must return zero. One word, reversible
           * -- say so and it changes.
           *   get_version NOW LEADS, ahead of get_status. Owner-directed, and it matches how the
           * group is actually used: you identify a reader before you interrogate its state. */
          label: 'Device Info and Status',
          description: 'Identify the reader and read its state — firmware and API version, device status, and the regulatory region.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '📟', card: 'Identify the reader and read its state — firmware and API version, device status.' },
          link: { type: 'doc', id: 'management/device-status/index' },
          items: [
            { type: 'doc', id: 'mgmt/get-version', className: 'sidebar-badge sidebar-badge--mgmt' },
            { type: 'doc', id: 'mgmt/get-status', className: 'sidebar-badge sidebar-badge--mgmt' },
            { type: 'doc', id: 'mgmt/get-current-region', className: 'sidebar-badge sidebar-badge--mgmt' },
          ],
        },
        {
          type: 'category',
          label: 'Network Configuration',
          description: 'Inspect Ethernet and Wi-Fi, configure Wi-Fi, and manage saved Wi-Fi profiles.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🌐', card: 'Inspect Ethernet and Wi-Fi, configure Wi-Fi, and manage saved Wi-Fi profiles.' },
          link: { type: 'doc', id: 'management/network-configuration/index' },
          items: [
            { type: 'doc', id: 'mgmt/get-eth', className: 'sidebar-badge sidebar-badge--mgmt' },
            { type: 'doc', id: 'mgmt/get-wifi', className: 'sidebar-badge sidebar-badge--mgmt' },
            { type: 'doc', id: 'mgmt/set-wifi', className: 'sidebar-badge sidebar-badge--mgmt' },
            { type: 'doc', id: 'mgmt/delete-wifi-profile', className: 'sidebar-badge sidebar-badge--mgmt' },
          ],
        },
        {
          type: 'category',
          /* RENAMED 'MQTT Endpoint Configuration' -> 'Endpoint Configuration' on 2026-09-06,
           * owner-directed. The 'MQTT' was redundant inside a sidebar whose panel header already
           * reads MQTT API and whose every endpoint is an MQTT endpoint. The route is unchanged at
           * /management/mqtt-endpoint-configuration/ -- renaming it would move a live URL for a
           * label tidy-up, which is not a trade worth making. */
          label: 'Endpoint Configuration',
          description: 'Read and configure the MQTT endpoints the reader connects through.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🔌', card: 'Read and configure the MQTT endpoints the reader connects through.' },
          link: { type: 'doc', id: 'management/mqtt-endpoint-configuration/index' },
          items: [
            { type: 'doc', id: 'mgmt/get-endpoint-config', className: 'sidebar-badge sidebar-badge--mgmt' },
            { type: 'doc', id: 'mgmt/config-endpoint', className: 'sidebar-badge sidebar-badge--mgmt' },
          ],
        },
        {
          type: 'category',
          label: 'Certificate Management',
          description: 'List, install, and delete TLS certificates on the reader.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🛡️', card: 'List, install, and delete TLS certificates on the reader.' },
          link: { type: 'doc', id: 'management/certificate-management/index' },
          items: [
            { type: 'doc', id: 'mgmt/get-installed-certificates', className: 'sidebar-badge sidebar-badge--mgmt' },
            { type: 'doc', id: 'mgmt/install-certificate', className: 'sidebar-badge sidebar-badge--mgmt' },
            { type: 'doc', id: 'mgmt/delete-certificate', className: 'sidebar-badge sidebar-badge--mgmt' },
          ],
        },
        {
          type: 'category',
          label: 'Event Management',
          description: 'Enable or disable event streams, set the heartbeat interval, and set alert thresholds.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '📣', card: 'Enable or disable event streams, set the heartbeat interval.' },
          link: { type: 'doc', id: 'management/event-management/index' },
          items: [
            { type: 'doc', id: 'mgmt/config-events', className: 'sidebar-badge sidebar-badge--mgmt' },
          ],
        },
        {
          type: 'category',
          /* RENAMED 'System Operations' -> 'Device Lifecycle' on 2026-09-06, owner-directed.
           * 'System Operations' named nothing a reader could look for -- almost every command on
           * this API is a system operation. Its two members, set_os and reboot, are the only two
           * that change the device's running state rather than its configuration, which is a
           * lifecycle. Route unchanged at /management/system-operations/. */
          label: 'Device Lifecycle',
          description: 'System-level actions — OS update and reboot.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🔧', card: 'System-level actions — OS update and reboot.' },
          link: { type: 'doc', id: 'management/system-operations/index' },
          items: [
            { type: 'doc', id: 'mgmt/set-os', className: 'sidebar-badge sidebar-badge--mgmt' },
            { type: 'doc', id: 'mgmt/reboot', className: 'sidebar-badge sidebar-badge--mgmt' },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Control',
      /* `sidebar-row-outlined` — the permanent 2px frame, added 2026-09-06 by owner request for
       * "an outline similar to the Quick Start item in the Guides sidebar," with the same styling
       * and the same hover/current behaviour. It is literally the same six declarations: the
       * treatment was pulled out of `.sidebar-row-recommended` under a name that describes the
       * frame rather than an editorial claim, precisely so this rail could take it without
       * asserting that these five sections are "recommended" over their siblings. See the block
       * note in src/css/sidebar.scss.
       *   WHY THESE FIVE AND NOT ALL TWELVE. These are the rows that hold the API reference
       * itself — the commands, the events, the telemetry stream. Overview, Getting Started,
       * Connection and Security, Protocol Reference, Schemas, MDM Interface and
       * Response Codes are all prose ABOUT that surface. Because the five are contiguous, rows
       * five through nine, the frames read as one bracket around the reference block rather than
       * as five separate "special" marks, which is the failure mode the treatment's own note
       * warns about ("a bordered chip in a column of borderless ones").
       *   FIRST LEVEL ONLY, which the request also asked for, is not enforced here and does not
       * need to be: every selector in the CSS block is rooted at `.theme-doc-sidebar-menu > li`,
       * so a nested row cannot inherit the frame even if the class were stamped on it. */
      className: 'sidebar-section-header sidebar-icon sidebar-icon--sliders sidebar-row-outlined',
      description: 'Control-plane commands that configure how the reader reads and run inventory — operating mode, post-read tag filtering, and START/STOP inventory control.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🎛️', card: 'Control-plane commands that configure how the reader reads and run inventory.' },
      link: { type: 'doc', id: 'control/index' },
      items: [
        {
          type: 'category',
          label: 'Operating Mode',
          description: 'Read back and configure the RFID operating mode — profile, Gen2 query, pre-filters, and triggers.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '⚙️', card: 'Read back and configure the RFID operating mode — profile, Gen2 query.' },
          link: { type: 'doc', id: 'control/operating-mode/index' },
          items: [
            { type: 'doc', id: 'ctrl/get-operating-mode', className: 'sidebar-badge sidebar-badge--ctrl' },
            { type: 'doc', id: 'ctrl/set-operating-mode', className: 'sidebar-badge sidebar-badge--ctrl' },
          ],
        },
        {
          type: 'category',
          label: 'Tag Filtering',
          description: "Read back and manage the reader's post-filter rules — per data endpoint.",
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🔍' },
          link: { type: 'doc', id: 'control/tag-filtering/index' },
          items: [
            { type: 'doc', id: 'ctrl/get-post-filter', className: 'sidebar-badge sidebar-badge--ctrl' },
            { type: 'doc', id: 'ctrl/set-post-filter', className: 'sidebar-badge sidebar-badge--ctrl' },
          ],
        },
        {
          type: 'category',
          label: 'Inventory Control',
          description: 'Start or stop an RFID inventory (or the barcode scanner) on demand.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '▶️', card: 'Start or stop an RFID inventory (or the barcode scanner) on demand.' },
          link: { type: 'doc', id: 'control/inventory-control/index' },
          items: [
            { type: 'doc', id: 'ctrl/control-operation', className: 'sidebar-badge sidebar-badge--ctrl' },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Events',
      /* `sidebar-row-outlined` — the permanent 2px frame, added 2026-09-06 by owner request for
       * "an outline similar to the Quick Start item in the Guides sidebar," with the same styling
       * and the same hover/current behaviour. It is literally the same six declarations: the
       * treatment was pulled out of `.sidebar-row-recommended` under a name that describes the
       * frame rather than an editorial claim, precisely so this rail could take it without
       * asserting that these five sections are "recommended" over their siblings. See the block
       * note in src/css/sidebar.scss.
       *   WHY THESE FIVE AND NOT ALL TWELVE. These are the rows that hold the API reference
       * itself — the commands, the events, the telemetry stream. Overview, Getting Started,
       * Connection and Security, Protocol Reference, Schemas, MDM Interface and
       * Response Codes are all prose ABOUT that surface. Because the five are contiguous, rows
       * five through nine, the frames read as one bracket around the reference block rather than
       * as five separate "special" marks, which is the failure mode the treatment's own note
       * warns about ("a bordered chip in a column of borderless ones").
       *   FIRST LEVEL ONLY, which the request also asked for, is not enforced here and does not
       * need to be: every selector in the CSS block is rooted at `.theme-doc-sidebar-menu > li`,
       * so a nested row cannot inherit the frame even if the class were stamped on it. */
      className: 'sidebar-section-header sidebar-icon sidebar-icon--bell sidebar-row-outlined',
      description: 'What the reader emits unprompted: connectivity, health and alerts. The command that enables them is config_events, under Management.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '📣', card: 'What the reader emits unprompted: connectivity, health and alerts.' },
      link: { type: 'doc', id: 'events/index' },
      items: [
        /* SUBCATEGORY ORDER IS MQTT CONNECTIVITY -> DEVICE HEALTH -> ALERTS, owner-directed
         * 2026-09-06 (was Device Health -> Alerts -> MQTT Connectivity). It now reads as the
         * lifecycle a reader actually goes through: the endpoint connects, then it reports health,
         * then it raises alerts. Connectivity first also matches the diagnostic path -- mqttConnEVT
         * is the first thing you look at when nothing is arriving. */
        {
          type: 'category',
          label: 'MQTT Connectivity',
          description: 'The per-endpoint CONNECTED and DISCONNECTED signal, published as MQTT birth and Last-Will messages on the rfid topic.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🔗', card: 'The per-endpoint CONNECTED and DISCONNECTED signal.' },
          link: { type: 'doc', id: 'events/mqtt-connectivity/index' },
          items: [
            // Badged MGMT, owner call 2026-09-01: mqttConnEVT's own Topic Mapping table
            // lists it on EVERY active endpoint's `rfid` topic — MGMT and CTRL shown, prose
            // open-ended ("each active endpoint (MGMT, CTRL, …)") — so no single badge is
            // fully precise here. MGMT is the representative endpoint (every reader has one;
            // CTRL is optional), not a claim that MGMT is the only topic this fires on — see
            // the page's own Topic Mapping section for the complete, unabridged list.
            { type: 'doc', id: 'events/mqtt-connection-event', className: 'sidebar-badge sidebar-badge--mgmt' },
          ],
        },
        {
          type: 'category',
          label: 'Device Health',
          description: 'The periodic liveness signal — uptime, event sequence, inventory status, battery — on the management event topic.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '💓', card: 'The periodic liveness signal — uptime, event sequence, inventory status, battery.' },
          link: { type: 'doc', id: 'events/device-health/index' },
          items: [
            // Badged MGMT: the event's own Topic Mapping table names one fixed topic,
            // `<tenantId>/MGMT/clients/event/<serial>` — "the management endpoint's
            // event topic" verbatim.
            { type: 'doc', id: 'events/heartbeat-event', className: 'sidebar-badge sidebar-badge--mgmt' },
          ],
        },
        {
          type: 'category',
          label: 'Alerts',
          description: 'The alert envelope (type, state, id, priority) and the six alertDetails branches, on the management event topic.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🚨', card: 'The alert envelope (type, state, id, priority) and the six alertDetails branches.' },
          link: { type: 'doc', id: 'events/alerts/index' },
          items: [
            { type: 'doc', id: 'events/alerts-event', className: 'sidebar-badge sidebar-badge--mgmt' },
          ],
        },
      ],
    },
    {
      type: 'category',
      /* RENAMED 'Data' -> 'Telemetry' on 2026-09-06, owner-directed. 'Data' was the weakest
       * label in this sidebar: every section on an API reference is data, so the word carried no
       * information and collided with the DATA1/DATA2 endpoint names and the 'data plane' concept.
       * 'Telemetry' names what the section actually contains -- a continuous outbound measurement
       * stream, not a request/response surface.
       *   ROUTE UNCHANGED at /api-reference/mqtt/data/, deliberately. The plane really is called
       * `data` on the wire (endpoint types DATA1/DATA2, badges `sidebar-badge--data1` and
       * `sidebar-badge--data2`), so the URL
       * stays true to the protocol while the label is written for the reader. src/pages/index.tsx
       * also still says 'Data plane' for the same reason -- that is the plane, not this section. */
      label: 'Telemetry',
      /* `sidebar-row-outlined` — the permanent 2px frame, added 2026-09-06 by owner request for
       * "an outline similar to the Quick Start item in the Guides sidebar," with the same styling
       * and the same hover/current behaviour. It is literally the same six declarations: the
       * treatment was pulled out of `.sidebar-row-recommended` under a name that describes the
       * frame rather than an editorial claim, precisely so this rail could take it without
       * asserting that these five sections are "recommended" over their siblings. See the block
       * note in src/css/sidebar.scss.
       *   WHY THESE FIVE AND NOT ALL TWELVE. These are the rows that hold the API reference
       * itself — the commands, the events, the telemetry stream. Overview, Getting Started,
       * Connection and Security, Protocol Reference, Schemas, MDM Interface and
       * Response Codes are all prose ABOUT that surface. Because the five are contiguous, rows
       * five through nine, the frames read as one bracket around the reference block rather than
       * as five separate "special" marks, which is the failure mode the treatment's own note
       * warns about ("a bordered chip in a column of borderless ones").
       *   FIRST LEVEL ONLY, which the request also asked for, is not enforced here and does not
       * need to be: every selector in the CSS block is rooted at `.theme-doc-sidebar-menu > li`,
       * so a nested row cannot inherit the frame even if the class were stamped on it. */
      className: 'sidebar-section-header sidebar-icon sidebar-icon--tag sidebar-row-outlined',
      description: 'The tag-read stream the reader emits during active inventory, on the data plane.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🏷️', card: 'The tag-read stream the reader emits during active inventory, on the data plane.' },
      link: { type: 'doc', id: 'data/index' },
      items: [
        {
          type: 'category',
          /* RENAMED 'Tag Data Events' -> 'Tag Data Stream' on 2026-09-06, owner-directed.
           * 'Events' duplicated the sibling top-level Events section one row above and invited the
           * reader to look for dataEVT there. 'Stream' is also the truer noun: dataEVT arrives
           * continuously while an inventory runs, rather than on a discrete state change the way
           * mqttConnEVT and alerts do. Route unchanged at /data/tag-data-events/. */
          label: 'Tag Data Stream',
          description: 'Tag reads during an active inventory — EPC, TID, and USER memory, RSSI telemetry, access results — on the DATA endpoint.',
          collapsible: true,
          collapsed: true,
          customProps: { emoji: '🏷️', card: 'Tag reads during an active inventory — EPC, TID, and USER memory, RSSI telemetry.' },
          link: { type: 'doc', id: 'data/tag-data-events/index' },
          items: [
            /* TWO BADGES, `DATA1` AND `DATA2` (owner, 2026-09-06), replacing the single `DATA`.
             * This row is the only two-badge row on the site, and the reason is in the page's own
             * Topic Mapping table: dataEVT is published on TWO endpoints, on two different topics
             * -- `<tenantId>/DATA/clients/data1event/<serial>` and `.../data2event/...` -- and
             * `config_endpoint` spells the types `epType: DATA1` / `DATA2`. There is no
             * `epType: DATA`, so the old chip was naming the topic SEGMENT while every other chip
             * on this rail names an endpoint TYPE. One chip could only be half the answer.
             *   The order of the two class names does not set the painted order: `--data1` fills
             * the badge slot that renders first and `--data2` the one that renders second, by
             * construction in src/css/sidebar.scss, not by their position here. */
            {
              type: 'doc',
              id: 'data/tag-data-event',
              className: 'sidebar-badge sidebar-badge--data1 sidebar-badge--data2',
            },
          ],
        },
      ],
    },
    { type: 'doc', id: 'response-codes', className: 'sidebar-section-header sidebar-icon sidebar-icon--list' },
    { type: 'doc', id: 'limits', className: 'sidebar-section-header sidebar-icon sidebar-icon--alert-triangle' },
    {
      type: 'category',
      label: 'Schemas',
      className: 'sidebar-section-header sidebar-icon sidebar-icon--layers',
      description: 'The named types the MQTT API exchanges, by domain: MQTT endpoints, network, certificates, event reporting, and RFID and barcode reading, plus the common objects, enumerations, and reserved and deprecated fields.',
      collapsible: true,
      collapsed: true,
      customProps: { emoji: '🌳', card: 'The named types the MQTT API exchanges, by domain.' },
      link: { type: 'doc', id: 'schemas/index' },
      items: [
        'schemas/mqtt-endpoints',
        'schemas/network',
        'schemas/certificates',
        'schemas/event-reporting',
        'schemas/rfid-and-barcode-reading',
        'schemas/common-objects',
        'schemas/enumerations',
        'schemas/reserved-and-deprecated-fields',
      ],
    },
    /* NO ROW FOR mdm-interface. IA v3 §1.7 makes it the one contract-linked
     * compatibility stub: `unlisted` in its front matter, no sidebar entry, out of search and the
     * sitemap. */
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
