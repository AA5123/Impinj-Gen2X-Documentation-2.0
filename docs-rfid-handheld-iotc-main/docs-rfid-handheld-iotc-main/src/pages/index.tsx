import React, { type ReactNode } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';
import { Icon } from '@site/src/components/icons';
import styles from './index.module.css';

/**
 * Landing page — the docs.dyte.io section architecture, rebuilt for Zebra IOTC.
 *
 * The section order and container widths were measured off
 * https://docs.dyte.io/ with Playwright on 2026-08-15 and are documented in
 * index.module.css.
 *
 * THE TYPE SCALE IS NOT THEIRS. Since 2026-08-16 every font-size and every
 * leading on this page comes from
 * `.ai-history/022-reconciled-typography-guidelines-for-marketing-and-landing-
 * pages.md` §12-13, which the owner scoped to "marketing and landing pages
 * ONLY". index.module.css records both, and its header is the long form.
 *
 * Their accent is rgb(33,96,253); ours stays
 * --ifm-color-primary, per the rule already set for the navbar block at the
 * foot of src/css/custom.scss. No Dyte markup, CSS, image or copy is reused.
 *
 * Every `to=` below was verified against .docusaurus/routes.js and the backing
 * file on disk. onBrokenLinks is 'throw', so an invented path fails the build.
 */

/** Abstract card art. Drawn, not cropped from a screenshot — the Quick Start
 *  PNGs are the subject of the open exposure item in to-do.md §4.1. */
/* ===========================================================================
 * THE RESOURCE COVER — one generated panel, three kinds.
 *
 * WHAT IT REPLACED. Explanations drew abstract line art (CardArt below, still used by
 * the capability cards), blogs drew stock photography and videos drew DevCon frame
 * grabs. Three different visual languages for three rows of the same control, and the
 * line art in particular said nothing about the page behind it — the same wave appeared
 * on "how commands flow" and could have appeared on anything.
 *
 * WHY THIS IS A COMPONENT AND NOT A GENERATED IMAGE FILE, which is the one place this
 * departs from the brief and is worth being explicit about. The brief's FIRST
 * requirement is that the panel takes the project's accent and keeps taking it if the
 * accent changes. A PNG or a baked SVG cannot: it freezes whatever the accent was on
 * the day the script ran, and the requirement quietly becomes "re-run the script and
 * remember to commit the output". Rendering the panel means `var(--primary)` is read at
 * paint time, so the accent is followed rather than copied — including live in a theme
 * switch. The other three requirements come out ahead too: the title stays real text
 * (selectable, searchable, translatable, and not a second copy of the <h3> below it),
 * the icons are the site's own Lucide set rather than pixels traced from it, and the
 * type is the site's face at the site's rungs instead of a font baked into a raster.
 * If a file on disk is genuinely wanted later, this component is the thing to render it
 * FROM, and nothing above changes.
 *
 * THE FILL IS `--primary`, NOT `--ifm-color-primary`, and it is the same trap the row
 * pill hit: the Infima token is #0071E3 light but #2997FF dark, and white on that
 * lighter blue is about 2.5:1 — a fail at the 12px meta rung, in one theme only. The
 * shadcn pair is declared to one oklch in both themes precisely because it means
 * "accent surface with text on it", so the panel is one colour everywhere and the ratio
 * is fixed at whatever that pair was ratified to.
 *
 * THE COMPOSITION, revised 2026-08-29 after the owner's specimen review: the kind glyph
 * and the time share a top row, and the TITLE sits at the foot of the panel. It used to
 * be glyph and time alone, with the title as text below — which made every cover in a
 * tab an identical rectangle, because within one tab every card has the same glyph. The
 * title is the only thing that tells three cards apart, so the title is what the cover
 * has to carry.
 *
 * THE DESCRIPTION DELIBERATELY DID NOT FOLLOW IT, and the reason is a hard constraint
 * rather than a preference. White on this accent measures 4.70:1 — the whole contrast
 * budget at the 14px meta rung. A description has to sit BELOW its title in importance,
 * and the ordinary way to say so is to lighten it; here there is nothing to lighten
 * into, so it would have to print at the title's own strength and the card would carry
 * two headlines. Two further costs came with it: a saturated field holding two
 * paragraphs is a poster, which is read, and these are cards, which are scanned; and the
 * row's height would be set by whichever card happened to have the longest blurb.
 *
 * THE HEIGHT IS A FLOOR, NOT A FIXED BOX, and that is what carrying a title costs. The
 * longest video title is 105 characters and sets five lines at this measure; `height`
 * would clip it, and clipping a title to protect a rectangle is the wrong trade. The
 * grid levels the row instead — see `.resourceGrid` and its subgrid note.
 *
 * The sheen is a single 135deg white wash at 12% falling to nothing by 60% — enough to
 * keep a large flat fill from reading as a swatch, not enough to be a gradient anyone
 * notices. The restraint IS the brief: a premium panel is one that can afford the space.
 * ======================================================================== */
const RESOURCE_KIND_ICON = {
  explanation: 'Explanation',
  blog: 'Blog',
  video: 'Video',
} as const;

type ResourceKind = keyof typeof RESOURCE_KIND_ICON;

/* NO `aria-hidden` ON THE PANEL ANY MORE. It carried one while it held only decoration;
 * it now holds the card's heading and its read time, and hiding those would leave the
 * link with an accessible name of just its description. The glyph keeps its own
 * `aria-hidden` (Icon sets it) because the heading beside it already says the kind. */
function ResourceCover({
  kind,
  meta,
  title,
}: {
  kind: ResourceKind;
  meta: string;
  title: string;
}): ReactNode {
  return (
    <span className={styles.resourceCover}>
      <span className={styles.resourceCoverTop}>
        <Icon name={RESOURCE_KIND_ICON[kind]} size={36} className={styles.resourceCoverIcon} />
        <span className={styles.resourceCoverMeta}>{meta}</span>
      </span>
      <h3 className={styles.resourceCoverTitle}>{title}</h3>
    </span>
  );
}

function CardArt({ variant }: { variant: 'wave' | 'grid' | 'nodes' }) {
  const common = { className: styles.capCardArt, viewBox: '0 0 440 92', preserveAspectRatio: 'none', 'aria-hidden': true } as const;
  if (variant === 'wave') {
    return (
      <svg {...common}>
        <path d="M0 62c40 0 40-30 80-30s40 30 80 30 40-34 80-34 40 34 80 34 40-22 80-22 40 22 80 22" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
        <path d="M0 74c40 0 40-20 80-20s40 20 80 20 40-24 80-24 40 24 80 24 40-14 80-14 40 14 80 14" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
      </svg>
    );
  }
  if (variant === 'grid') {
    /* A dot field with a few lit nodes — a fleet of readers, not a spreadsheet. */
    return (
      <svg {...common}>
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 20 }, (_, col) => {
            const lit = (row === 1 && col === 6) || (row === 2 && col === 11) || (row === 3 && col === 4);
            return (
              <circle
                key={`${row}-${col}`}
                cx={12 + col * 22}
                cy={16 + row * 17}
                r={lit ? 3.5 : 1.6}
                fill="currentColor"
                fillOpacity={lit ? 0.45 : 0.14}
              />
            );
          }),
        )}
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M60 70h100l40-34h60l40 34h80" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
      {[60, 160, 220, 300, 380].map((x, i) => (
        <circle key={x} cx={x} cy={i === 1 || i === 3 ? 36 : 70} r="5" fill="currentColor" fillOpacity="0.35" />
      ))}
    </svg>
  );
}

/* ----------------------------------------------------- PREVIEW TOGGLE --- */

/**
 * TEMPORARY, 2026-08-17. Flip to `false` to restore the drawn SVG art.
 *
 * Wired so the harvested-and-edited zebra.com photography can be judged in situ
 * rather than from a mock. It swaps the art for the capability cards ONLY.
 *
 * THE SECOND HALF OF THIS NOTE IS OUT OF DATE AND IS CORRECTED HERE RATHER THAN
 * DELETED, because its reasoning is still the reason CardArt survives. It read:
 * "RESOURCES still uses <CardArt>, because the resource thumbnail recolours the mark
 * via `.resourceThumb .capCardArt { color: var(--ifm-link-color) }` and a raster
 * cannot consume that." As of 2026-08-29 RESOURCES uses neither: it draws
 * <ResourceCover>, and `.resourceThumb` is gone with it. The point about rasters
 * stands and is exactly why the cover is painted rather than generated to a file —
 * see the note beside ResourceCover.
 *
 * The three assets are committed at static/img/cards/. The ~1,100-file harvest
 * library they were derived from lives at image-src/zebra/ — tracked, but
 * deliberately OUTSIDE static/, because anything under static/ is published
 * whether or not a page links to it.
 *
 * Note this contradicts the standing decision recorded at the CardArt comment
 * above ("Drawn, not cropped from a screenshot").
 */
const PREVIEW_PHOTO_ART = true;

/* Literal paths, deliberately not a template string. scripts/site/lint-static-orphans.mjs
 * resolves a static/ asset only when its exact basename appears in some tracked file
 * outside static/ (`hay.includes(path.basename(a))`, :125). An interpolated
 * `${variant}-photo.webp` never yields that literal, so all three would be reported as
 * orphans and fail CI at .github/workflows/validate.yml:94. */
const CARD_PHOTO: Record<'wave' | 'grid' | 'nodes', string> = {
  wave: '/img/cards/wave-photo.webp',
  grid: '/img/cards/grid-photo.webp',
  nodes: '/img/cards/nodes-photo.webp',
};

function CardPhoto({ variant }: { variant: 'wave' | 'grid' | 'nodes' }) {
  return (
    <img
      className={styles.capCardArt}
      src={useBaseUrl(CARD_PHOTO[variant])}
      alt=""
      aria-hidden
    />
  );
}

/**
 * Product-photograph art — a different contract from the 92px drawn strip.
 *
 * The asset is a background-removed cut-out on transparency, so the card surface
 * shows through and the product reads as floating rather than as a photo panel
 * pasted on. That is what makes it survive both themes, which the earlier
 * white-ground attempt could not: at opacity .9 over #1b1b1d a studio-white
 * background still resolves to ~#eeeeee, i.e. a light slab bolted to a dark card.
 *
 * Two variants rather than one, via ThemedImage. They share the product pixels; the dark
 * one lifts them 10% (`-modulate 110`) and does NOTHING ELSE.
 *
 * NO RADIAL GLOW, as of 2026-08-20. Each dark variant used to composite a blurred #8e9099
 * ellipse behind the product "because these products are near-black and would otherwise
 * vanish into the dark surface". Measured, it did the opposite: it lifted the BACKGROUND
 * toward the chassis rather than the chassis off the background. Background pixels just
 * outside the product ran to gray 46 against the surface's own 27, and the silhouette step
 * fell from 1.459:1 to 1.396:1 on the inventory card and 1.365 to 1.335 on the fleet card.
 * It never touched the product's own pixels, because it sat behind them — its only visible
 * effect was a pale blob in the middle of every dark card. Removing it pins the background
 * at exactly gray 27 with sd 0.00. Full table in scripts/images/make-fleet-card.sh.
 *
 * NOTE FOR ANYONE COMPARING AGAINST THE OLD TEST PAGES in .audit/2026-08-19_fleet-variants:
 * ThemedImage renders ONE <img> chosen from React's colour-mode state, not both with one
 * hidden. Those captures had their scripts stripped, so they froze the LIGHT asset and their
 * "dark mode" was light art on a dark surface. Dark mode cannot be reviewed there at all.
 *
 * None of the current three carries a ground shadow: two of them run off the frame edge, so
 * there is no visible footing for one to attach to.
 */
/* All three cards carry product art. They no longer share ONE canvas: as of 2026-08-20
 * the card basis is 360px and .capCardProduct's box is 360x327, so the fleet asset is
 * authored at 720x654 — exactly 2x that box on both axes, which is what makes it render
 * 1:1 at DPR 2 with zero letterbox. The other two are still 880x800 (aspect 1.10000
 * against the box's 1.10092) and letterbox by 0.3px horizontally, which is sub-pixel and
 * leaves the bottom flush; re-authoring them at 720x654 is the obvious follow-up and is
 * deliberately not bundled here. See the note on .capCardProduct's height.
 *
 * .capCardProduct still keeps ONE height for all three, because cards in a flex row
 * stretch to the tallest sibling and per-card heights would desynchronise the grid.
 *
 * Literal basenames, for the lint-static-orphans reason noted at CARD_PHOTO. */
const CARD_PRODUCT = {
  /* Device centred on the card's axis, arm running off the bottom-right corner. */
  'rfd40-inventory': {
    light: '/img/cards/rfd40-inventory-light.avif',
    dark: '/img/cards/rfd40-inventory-dark.avif',
  },
  /* Cropped at the component panel's lower frame edge, so the border left under
   * the cameras/scanner matches the one above them. Width 70-80% of the box.
   *
   * DO NOT "FIX" THE SCREEN. Its on-screen content reads 180 degrees from the ZEBRA
   * wordmark on the body, which looks like a compositing error and was repeatedly
   * reported as one during review. It is not: the owner confirmed on 2026-08-19 that
   * this is how the product actually presents with its front toward the viewer.
   * Rotating the screen region would be wrong, and would also misregister by ~32px
   * per side, since the display is a perspective trapezoid and not a rectangle. */
  'manage-your-reader': {
    light: '/img/cards/manage-your-reader-light.avif',
    dark: '/img/cards/manage-your-reader-dark.avif',
  },
  /* NINE sleds on a 720x654 canvas — three per row, three rows, ALL NINE THE SAME
   * RENDER facing the same way. The owner asked for "3 readers within a row... in
   * total 9 readers", and on 2026-08-20 chose the right-facing render after comparing
   * both on live test pages.
   *
   * DO NOT SWITCH THE RENDER. scripts/images/make-fleet-card.sh carries the full note:
   * the review at .audit/2026-08-19_scale-to-a-fleet-apple-review found this render is
   * the MIRRORED one and recommended the other, the owner read that finding and chose
   * this anyway. It is a recorded decision, not an oversight. Reopen it with the owner.
   *
   * THE INSETS ARE THE CARD'S OWN GUTTER, NOT A CHOSEN NUMBER. 48 canvas px = 24 CSS
   * left and right, which is .capCard's `padding: 24px 24px 0` text gutter. That makes
   * the grid's left edge land on the heading and paragraph. It used to be the card's
   * `border-radius: 24px` as well; the card is square as of 2026-08-30
   * (`aw-style-guide.md` section 6.1), so the padding is now the only thing setting it. The first attempt used 94 canvas px, which is nearly twice the
   * gutter and left the grid 22.8px inboard of the text with nothing lining up.
   * The bottom is deliberately tighter, 36 canvas px = 18 CSS: the card declares no
   * bottom gutter at all (`padding-bottom: 0`), and bottom-anchored content reads
   * heavier, so an equal margin all round looks bottom-heavy. 18 was chosen when the
   * card had a 24px arc to clear; with a square corner there is no arc, and the value
   * survives on the optical argument alone.
   *
   * The gap is 36 canvas px (18 CSS) and not the old 38: on this canvas the block is
   * 720 - 96 = 624 wide, and 3W + 2*36 = 624 gives W = 184 exactly, where 38 would
   * make the device width fractional and break the symmetric insets. */
  'scale-to-a-fleet': {
    light: '/img/cards/scale-to-a-fleet-light.avif',
    dark: '/img/cards/scale-to-a-fleet-dark.avif',
  },
} as const;

function CardProduct({ name }: { name: keyof typeof CARD_PRODUCT }) {
  const s = CARD_PRODUCT[name];
  return (
    <ThemedImage
      className={styles.capCardProduct}
      sources={{ light: useBaseUrl(s.light), dark: useBaseUrl(s.dark) }}
      alt=""
      aria-hidden
    />
  );
}

/* ----------------------------------------------------------------- data --- */

const CAPABILITIES = [
  {
    title: 'Run an RFID inventory',
    icon: 'Inventory' as const,
    art: 'wave' as const,
    product: 'rfd40-inventory' as const,
    to: '/guides/read-tags-and-barcodes/start-and-stop-inventory/',
    text: 'Start and stop the radio with control_operation, or let set_operating_mode fire it from the physical trigger. Reads arrive as dataEVT.',
  },
  {
    title: 'Manage your reader',
    icon: 'Reader' as const,
    art: 'grid' as const,
    product: 'manage-your-reader' as const,
    to: '/guides/core-concepts/the-configuration-model',
    text: 'Identity, runtime and regulatory state via get_status, get_version and get_current_region — plus Wi-Fi, endpoints, TLS and certificates.',
  },
  {
    title: 'Scale to a fleet',
    icon: 'Fleet' as const,
    art: 'nodes' as const,
    product: 'scale-to-a-fleet' as const,
    to: '/guides/scale-to-a-fleet/what-changes-when-you-scale/',
    text: '123RFID Desktop over USB-C for 1–10 readers, Bulk-123RFID for 10–100, and an MDM platform such as SureMDM beyond 100.',
  },
];

/* PER-ROW ICONS, not one per column. Every guide row used to draw list-checks and every
 * reference row braces, so inside a column all three rows were identical and the mark repeated
 * what the column heading already said. Each row now carries the icon for what its own page is
 * about; the reasoning for each choice — and why raising them from 16px to 24px re-opened
 * two of those choices without changing either — is in src/components/icons/index.tsx
 * beside SYMBOLS.
 *
 * `as const` on the icon, same as CAPABILITIES above, so the value narrows to IconName and a
 * typo is a build error rather than a runtime miss. */
const GUIDES = [
  { title: 'Configure MQTT endpoints', icon: 'Endpoint' as const, to: '/guides/manage-your-reader/configure-mqtt-endpoints', text: 'Point CTRL, MGMT and DATA1 at a broker with config_endpoint — add, update, delete.' },
  { title: 'Manage TLS / SSL certificates', icon: 'Certificate' as const, to: '/guides/manage-your-reader/install-and-manage-certificates', text: 'Install over HTTP, list what is on the reader, and remove with delete_certificate.' },
  { title: 'Start and stop a tag inventory', icon: 'Operation' as const, to: '/guides/read-tags-and-barcodes/start-and-stop-inventory/', text: 'The minimal control_operation payloads, and why you stop before reconfiguring.' },
];

const REFERENCES = [
  { title: 'Management commands', icon: 'Administer' as const, to: '/api-reference/mqtt/management/', tag: 'MQTT', text: 'Fifteen MGMT commands: status, version, region, Wi-Fi, endpoints, certificates.' },
  { title: 'Control commands', icon: 'Control' as const, to: '/api-reference/mqtt/control/', tag: 'MQTT', text: 'Five CTRL commands including control_operation and set_operating_mode.' },
  /* WAS `REST API` UNTIL 2026-08-29, and the swap is an accuracy fix, not a preference.
   * The FXR60 / FXR90 REST reference is a DIFFERENT PRODUCT LINE — fixed readers — and the
   * handheld sleds this site documents expose no REST surface at all (four docs pages say so
   * in as many words). Giving it one of the three slots in the landing page's reference list
   * put the most prominent possible answer to "what can I call?" on a protocol the reader in
   * front of you does not speak. It is still published and still reachable, from the API
   * Reference menu and from the Tools chip row below.
   * WHAT REPLACES IT COMPLETES A SET RATHER THAN FILLING A HOLE. The two rows above are the
   * MQTT surfaces you SEND to; Events is the one the reader sends YOU. Those three are the
   * whole of what the API does, so the list now enumerates instead of sampling. */
  { title: 'Events', icon: 'Events' as const, to: '/api-reference/mqtt/events/', tag: 'MQTT', text: 'Three events the reader emits unprompted: device health, alerts and MQTT connectivity.' },
];

const SURFACES = [
  {
    name: 'MQTT API',
    text: 'Native MQTT command and event reference for the RFD40 / RFD90 handheld sleds.',
    chips: [
      { label: 'API overview', to: '/api-reference/mqtt/', short: 'API' },
      { label: 'Management', to: '/api-reference/mqtt/management/', short: 'MGT' },
      { label: 'Control', to: '/api-reference/mqtt/control/', short: 'CTL' },
      { label: 'Events', to: '/api-reference/mqtt/events/', short: 'EVT' },
      { label: 'Data plane', to: '/api-reference/mqtt/data/', short: 'DAT' },
      { label: 'Response codes', to: '/api-reference/mqtt/response-codes/', short: 'RES' },
      { label: 'Error format', to: '/api-reference/mqtt/protocol-reference/message-envelope#correlation-and-request-response-pairing', short: 'ERR' },
      { label: 'Topic reference', to: '/api-reference/mqtt/protocol-reference/topic-structure/', short: 'TOP' },
    ],
  },
  {
    name: 'Tools and integrations',
    text: 'The tools that bootstrap a reader onto a broker, and the first steps of an integration.',
    chips: [
      { label: '123RFID Desktop', to: '/resources/setup-tools', short: 'DSK' },
      { label: '123RFID Mobile', to: '/resources/setup-tools', short: 'MOB' },
      { label: 'First command', to: '/guides/quick-start#first-command', short: 'CMD' },
      { label: 'Python tutorial', to: '/guides/build-your-integration/build-a-minimal-integration', short: 'PY' },
      { label: 'Plan an integration', to: '/guides/build-your-integration/plan-your-integration', short: 'PLN' },
      { label: 'FXR REST API', to: '/api-reference/rest/', short: 'FXR' },
    ],
  },
];

const OPERATIONS = [
  { name: 'control_operation', to: '/api-reference/mqtt/ctrl/control-operation/', text: 'START or STOP the RFID radio or the barcode scanner.' },
  { name: 'set_operating_mode', to: '/api-reference/mqtt/ctrl/set-operating-mode/', text: 'Profile, trigger conditions and Gen2 query parameters.' },
  { name: 'dataEVT', to: '/api-reference/mqtt/data/tag-data-event/', text: 'Tag reads streamed on the DATA endpoint: EPC, TID, RSSI.' },
];

/* Request body verbatim from api/mqtt/reference/ctrl/control-operation.mdx lines
 * 27-34 (REQUEST_START_JSON). Topic line in the placeholder form that file's
 * own Topic Mapping table uses at line 150 — a concrete tenant id would need
 * the caveat the doc pages carry alongside it.
 *
 * WHY THIS IS JSX AND NOT A TEMPLATE STRING ANY MORE (2026-08-29). The plate it renders
 * into is now white and carries the site's JSON colour scheme, and a string has nothing
 * to colour: keys, values and punctuation have to be separate elements before any of
 * them can take a different ink. Prism was the other route and was rejected — it would
 * pull the whole fenced-code-block apparatus (container, toolbar, copy button, theme
 * plumbing) onto a landing page for nine static lines that never change.
 *
 * EVERY PIECE OF WHITESPACE IS AN EXPRESSION — `{'\n'}`, `{'  '}` — and that is not a
 * style choice. JSX strips whitespace at the start and end of a line and drops lines
 * that are only whitespace, so indentation written as literal JSX text would vanish and
 * the sample would render as one flat run inside a <pre>. Expressions are passed
 * through byte for byte. If you edit this, keep that rule or the payload silently
 * loses its shape. */

/** `  "name": "value",` — the one line shape the sample repeats. */
function SampleField({
  indent,
  name,
  value,
  last = false,
}: {
  indent: string;
  name: string;
  value: string;
  last?: boolean;
}): ReactNode {
  return (
    <>
      {indent}
      <span className={styles.apiSampleKey}>{`"${name}"`}</span>
      <span className={styles.apiSamplePunct}>{': '}</span>
      <span className={styles.apiSampleString}>{`"${value}"`}</span>
      {last ? null : <span className={styles.apiSamplePunct}>{','}</span>}
      {'\n'}
    </>
  );
}

const SAMPLE = (
  <>
    {/* The topic, not the payload: WHERE you publish, above WHAT you publish. Structural
        ink, with the two fill-in-the-blank slots dimmed to the punctuation rung so the
        fixed path reads as the instruction and `<tenantId>` / `<serial>` read as gaps. */}
    <span className={styles.apiSampleTopic}>
      <span className={styles.apiSampleSlot}>{'<tenantId>'}</span>
      {'/CTRL/clients/cmnd/'}
      <span className={styles.apiSampleSlot}>{'<serial>'}</span>
    </span>
    {'\n\n'}
    <span className={styles.apiSamplePunct}>{'{'}</span>
    {'\n'}
    <SampleField indent="  " name="command" value="control_operation" />
    <SampleField indent="  " name="requestId" value="abc123" />
    {'  '}
    <span className={styles.apiSampleKey}>{'"ctrlOprPayload"'}</span>
    <span className={styles.apiSamplePunct}>{': {'}</span>
    {'\n'}
    <SampleField indent="    " name="controlType" value="RFID" />
    <SampleField indent="    " name="operation" value="START" last />
    {'  '}
    <span className={styles.apiSamplePunct}>{'}'}</span>
    {'\n'}
    <span className={styles.apiSamplePunct}>{'}'}</span>
  </>
);

/* `art` BECAME `kind` on 2026-08-29. These three drew CardArt's abstract line work —
 * a wave, a node chain, a dot field — chosen per card for atmosphere rather than
 * meaning, so the same wave would have suited any of the three. They now draw the
 * generated cover (see ResourceCover), which takes the CONTENT KIND instead: all three
 * are Diátaxis explanations, so all three take the same glyph, and the differentiation
 * moves to where it belongs, the title.
 * CardArt is untouched and still draws the capability cards above, where an atmospheric
 * mark is the right call because those tiles carry no kind. */
const RESOURCES = [
  { kind: 'explanation' as const, title: 'How commands and responses flow', to: '/guides/core-concepts/commands-responses-and-events', meta: '6 min read', text: 'The three flows: command/response paired by requestId, asynchronous events, and high-throughput dataEVT streaming.' },
  { kind: 'explanation' as const, title: 'RFID air interface: how Gen2 tags are read', to: '/guides/core-concepts/how-the-radio-reads-tags/', meta: '8 min read', text: 'Inventory rounds and the Q parameter, sessions and the inventoried flag, the SELECT filter, and the four memory banks.' },
  /* `Securing the connection` set ONE line at the card measure and the two-line rule
     needed a second. Lengthened by naming the transport and the mechanism, which the
     page is actually about, rather than by padding. */
  { kind: 'explanation' as const, title: 'Securing the MQTT connection with TLS', to: '/guides/core-concepts/the-security-model/', meta: '6 min read', text: 'TLS 1.2 for MQTT, the four trust layers, the five certificate types, and MQTT_TLS versus plain endpoints.' },
];

/* docs.dyte.io's resources-page filter toggle ("All / Blogs / Videos"), placed
 * here per an explicit owner call: IOTC ships neither blog posts nor videos
 * today, so both tabs are a known, accepted gap rather than fabricated
 * content — see `.resourceEmpty` below for what renders instead of a grid. */
/* THE "SEE ALL" LINK TRAVELS WITH THE TAB, and that is the whole of the fix for a bug
 * the old shape made inevitable: the header link was a single hardcoded <Link> beside
 * the <h2>, so switching to Blogs or Videos left it reading "All explanations" and
 * pointing at the guides path. A filter control and a see-all link that disagree is
 * worse than no link — the reader is told the tab changed and the destination did not.
 * Putting `seeAll` in the same record as `id` and `label` makes the disagreement
 * unrepresentable rather than merely fixed.
 * `external` drives target/rel and the "(opens in a new tab)" name, the same treatment
 * the community buttons and the footer's outbound links already use. */
const RESOURCE_TABS = [
  {
    id: 'all' as const,
    label: 'All',
    seeAll: {
      label: 'All explanations',
      to: '/guides/get-oriented',
      external: false,
    },
  },
  {
    id: 'blog' as const,
    label: 'Blogs',
    seeAll: {
      label: 'All blogs',
      to: 'https://www.zebra.com/ap/en/blog.html#Topic=filter-rfid',
      external: true,
    },
  },
  {
    id: 'video' as const,
    label: 'Videos',
    seeAll: {
      label: 'All videos',
      to: 'https://developer.zebra.com/content/devcon-2025-highlights',
      external: true,
    },
  },
];

/**
 * The Blogs/Videos card grid + pager, per docs.dyte.io/resources — geometry
 * (16:9 thumb, 8px radii, 24px gap, 20px/600 title, 16px snug-leading body,
 * 14px meta) measured off their live control the same way the rest of this
 * page is. Colour is not theirs: title/body/meta read --ifm-heading-color /
 * --lp-faint the same way .resourceTitle / .resourceText already do, and the
 * card-hover accent is --ifm-link-color, matching .resourceCard:hover below.
 *
 * CONTENT, 2026-08-27. BLOG_RESOURCES links to three real Zebra corporate blog
 * posts (zebra.com/.../blog/posts/2026/...) and VIDEO_RESOURCES to three real
 * DevCon 2025 session recordings — all genuinely about Zebra RFID or directly
 * adjacent (the Edge Impulse keynote). This supersedes the empty-arrays
 * decision recorded earlier in this file's history for the Dyte-content
 * request: that one was refused because the content was a different,
 * unrelated product (Dyte's own video-calling SDK); this one is Zebra's own.
 *
 * TITLES ARE NOT THE URL SLUGS OR og:title. Two of the three blog pages ship
 * an og:title that is literally their slug ("why-supply-chains-must-adapt-
 * now | Zebra") or carries a CMS artifact ("Save & Close A Sweet Escape...");
 * the titles below are each page's own <h1>, fetched and read directly.
 * Descriptions are a short paraphrase of the article's real opening
 * paragraphs, not the og:description (blog2's is missing one entirely).
 * "N min read" is word-count / 200wpm over the article's own body paragraphs
 * (stopping before the "Related articles" teaser cards that follow it in the
 * markup) — an estimate, on the same basis "6 min read" etc. already use
 * elsewhere on this page, not a scraped or authoritative figure.
 *
 * VIDEO TITLES ARE READ OFF EACH RECORDING'S OWN TITLE SLIDE, not the
 * filename. "av10" / "av9" are AV-team tape labels, not names; ffprobe'd
 * duration (61 / 42 / 45 min) is exact, ffmpeg opened each https:// URL
 * directly with `-ss` before `-i` and pulled a single frame via an HTTP range
 * request — each source file is a multi-gigabyte DevCon recording (3646s /
 * 2519s / 2720s long), and this reads a few hundred KB near the seek point
 * rather than the whole thing.
 *
 * THUMBNAILS ARE NOT HOTLINKED. Blog hero images came back from the CMS at
 * 6-32MB (DAM originals, not web-sized) and the two DevCon frames came off
 * 1080p video — all six were re-encoded to ~960px-wide WebP (44-94KB) and
 * committed under static/img/home/. Card hover-zoom (.mediaImg above) makes
 * a hotlinked multi-MB original a real page-weight cost on every render of
 * this section, not just a stylistic mismatch.
 *
 * THE VIDEO HREFS STILL POINT AT ZEBRA'S CDN, MULTI-GIGABYTE FILES. Clicking
 * a video card opens the raw .mp4 directly (external, new tab) — there is no
 * lighter-weight streaming or embed URL for these three assets, only the DAM
 * original. A reader on a metered connection will download gigabytes if they
 * let the browser's native player run past the first buffer. Flagged, not
 * silently accepted: revisit if IOTC gets a proper video host (YouTube,
 * Vimeo, a CDN with adaptive bitrate) for its own content.
 */
type MediaResource = {
  /* THE CARD'S DISPLAY TITLE, WHICH IS NOT ALWAYS THE DESTINATION'S OWN TITLE. The
   * two-line rule applies to every cover, and six of these link to material Zebra
   * published under titles of four and five lines — "Mastering Zebra RFID: Optimizing
   * Reader Performance with Real-Time Health Monitoring and Gen2X Extensions" is a real
   * DevCon session name, not something to trim for a grid. So the card carries a short
   * label written for the card, and `sourceTitle` below keeps the published one.
   * A CURATED LIST GIVING ITS OWN LABELS IS ORDINARY EDITORIAL PRACTICE, but it has one
   * hard requirement: the destination has to stay recognisable from the label. Every
   * rewrite below keeps the subject and the proper nouns and drops only the framing. */
  title: string;
  /* The published title, verbatim, rendered as the link's `title` attribute so the real
   * name is one hover away and stays in the DOM for anything that reads it. NOT an
   * aria-label: the visible text is the accessible name, and replacing it with a
   * different string is the WCAG 2.5.3 (Label in Name) failure this avoids. */
  sourceTitle: string;
  text: string;
  meta: string;
  /* NO LONGER RENDERED, and retained on purpose. ResourceCover replaced the photography
   * on both media kinds, so nothing reads this field today — but the six paths in it are
   * the only thing keeping six committed WebPs under static/img/home/ out of
   * `npm run lint:static-orphans`. Dropping the field is therefore not a tidy-up, it is
   * a decision to delete real commissioned photography, and that is the owner's to make.
   * If they say so: remove this field, its six values, and the files. */
  image: string;
  href: string;
  external?: boolean;
};

const BLOG_RESOURCES: MediaResource[] = [
  {
    title: 'Adapting supply chains to same-day delivery',
    sourceTitle: 'From Aspiration to Expectation: Why Does Your Supply Chain Need to Adapt Now?',
    text: 'Same-day delivery is an expectation now, and most of the pressure lands on the middle mile rather than the last one.',
    meta: '2 min read',
    image: '/img/home/blog-supply-chain-adapt-now.webp',
    href: 'https://www.zebra.com/ap/en/blog/posts/2026/why-supply-chains-must-adapt-now.html',
    external: true,
  },
  {
    title: 'Securing life-science supply chains in transit',
    sourceTitle: 'How Do Intelligent Operations Help Secure Life Science Supply Chains?',
    text: 'Cold storage is not enough: connected mobility and real-time capture keep fragile shipments visible end to end.',
    meta: '4 min read',
    image: '/img/home/blog-life-science-supply-chain.webp',
    href: 'https://www.zebra.com/ap/en/blog/posts/2026/intelligent-operations-secure-life-science-supply-chain.html',
    external: true,
  },
  {
    title: 'What a chocolate heist teaches about resilience',
    sourceTitle: 'A Sweet Escape: What a Chocolate Heist Teaches Us About Supply Chain Resiliency',
    text: 'Twelve tons vanished between Italy and Poland — a light story with a serious lesson about supply-chain visibility.',
    meta: '4 min read',
    image: '/img/home/blog-chocolate-heist-resiliency.webp',
    href: 'https://www.zebra.com/ap/en/blog/posts/2026/a-sweet-escape-what-a-chocolate-heist-teaches-us-about-supply-chain-resiliency.html',
    external: true,
  },
];

const VIDEO_RESOURCES: MediaResource[] = [
  {
    title: 'Reader health monitoring and Gen2X extensions',
    sourceTitle: 'Mastering Zebra RFID: Optimizing Reader Performance with Real-Time Health Monitoring and Gen2X Extensions',
    text: 'Suresh Ramamoorthy of Zebra on real-time reader health monitoring and the Gen2X protocol extensions, at DevCon 2025.',
    meta: '61 min watch',
    image: '/img/home/video-devcon2025-reader-health-monitoring.webp',
    href: 'https://www.zebra.com/content/dam/zebra_dam/en/video/product-solutions-portfolio/0005/av10-video-customer-devcon2025-en-us.mp4',
    external: true,
  },
  {
    title: 'Developing for handheld and fixed readers',
    sourceTitle: 'Developing for Zebra RFID: A Comprehensive Guide for Handheld and Fixed Readers',
    text: 'Sajan Wilfred, Fellow Engineer at Zebra, walks through building against both handheld and fixed RFID readers — a DevCon 2025 session.',
    meta: '42 min watch',
    image: '/img/home/video-devcon2025-handheld-fixed-readers.webp',
    href: 'https://www.zebra.com/content/dam/zebra_dam/en/video/product-solutions-portfolio/0005/av9-video-customer-devcon2025-en-us.mp4',
    external: true,
  },
  {
    title: 'Bringing real-world intelligence to the edge',
    sourceTitle: 'Bringing Real-World Intelligence to Edge Devices',
    text: 'Jan Jongboom, CTO of Edge Impulse, on bringing real-world intelligence to edge devices — a DevCon 2025 keynote.',
    meta: '45 min watch',
    image: '/img/home/video-devcon2025-jan-jongboom-keynote.webp',
    href: 'https://www.zebra.com/content/dam/zebra_dam/en/video/product-solutions-portfolio/0005/jan-jongboom-keynote-video-customer-devcon2025-en-us.mp4',
    external: true,
  },
];

const MEDIA_PAGE_SIZE = 3; /* matches the 3-column desktop grid — one page is one full row */

/* `MediaThumbImage` WAS DELETED HERE on 2026-08-29, with the owner's instruction to
 * remove the CSS it depended on. It rendered the blog and video photography into
 * `.mediaThumb` with `.mediaImg`; both classes are gone, so leaving the component would
 * have left it emitting `class="undefined"` — broken code, not dead code.
 *
 * WHAT IT LOOKED LIKE, so restoring it is a paste rather than a rewrite:
 *     function MediaThumbImage({ src, alt }: { src: string; alt: string }) {
 *       return <img src={useBaseUrl(src)} alt={alt} loading="lazy" className={styles.mediaImg} />;
 *     }
 * useBaseUrl is a hook, which is why it lived in its own component: called from inside
 * MediaCarousel's .map() body the number of hook calls would depend on items.length and
 * break the rules of hooks the moment the list changed length.
 * The three CSS rules it needs are quoted in index.module.css where they were removed. */

function MediaCarousel({ items, kind }: { items: MediaResource[]; kind: ResourceKind }) {
  const [page, setPage] = React.useState(0);
  const pageCount = Math.ceil(items.length / MEDIA_PAGE_SIZE);
  const start = page * MEDIA_PAGE_SIZE;
  const shown = items.slice(start, start + MEDIA_PAGE_SIZE);

  return (
    <div className={styles.mediaCarousel}>
      <div className={styles.mediaGrid}>
        {shown.map((item) => (
          <a
            key={item.title}
            className={styles.mediaCard}
            href={item.href}
            /* The published name, one hover away. Supplementary only — the visible text
               is still the accessible name, so this cannot break Label in Name. */
            title={item.sourceTitle}
            {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            <ResourceCover kind={kind} meta={item.meta} title={item.title} />
            <p className={styles.mediaText}>{item.text}</p>
          </a>
        ))}
      </div>
      {pageCount > 1 && (
        <div className={styles.mediaNav}>
          <button
            type="button"
            className={styles.mediaNavBtn}
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <Icon name="Back" size={24} />
          </button>
          <button
            type="button"
            className={styles.mediaNavBtn}
            aria-label="Next page"
            disabled={page === pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
            <Icon name="Advance" size={24} />
          </button>
        </div>
      )}
    </div>
  );
}

const HELP = [
  { title: 'Diagnose a failure', icon: 'Diagnose' as const, to: '/guides/diagnose-and-recover', cta: 'Match a symptom', text: 'Pick the signal you are actually seeing and it routes you to a symptom page, a failure mode, or a recovery playbook.' },
  { title: 'Read the FAQ', icon: 'Faq' as const, to: '/resources/faq', cta: 'Open the FAQ', text: 'Supported hardware, the MQTT version IOTC speaks, credentials, minimum firmware, API versioning and multi-endpoint.' },
  { title: 'Look up a term', icon: 'Glossary' as const, to: '/resources/glossary/', cta: 'Open the glossary', text: 'Canonical IOTC, MQTT and RFID terminology. Terms only — the limits and the wire shapes are in the MQTT API reference.' },
];

/* ------------------------------------------------------------- sections --- */

function Hero() {
  return (
    <div className={styles.heroBand}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Zebra Handheld RFID · IoT Connector</p>
        <h1 className={styles.heroTitle}>Build with the IoT Connector</h1>
        <p className={styles.heroSubtitle}>
          IOTC is the in-firmware MQTT control and data plane for RFD40 and RFD90 handheld RFID
          sleds — one persistent connection for commands, tag data, and fleet health.
        </p>
        <div className={styles.heroActions}>
          <Link className="button button--primary button--lg" to="/guides/quick-start">
            Quick Start: read your first tag
          </Link>
          <Link className="button button--secondary button--lg" to="/api-reference/mqtt">
            MQTT API
          </Link>
        </div>
      </section>

      <section className={styles.capabilityGrid}>
        {CAPABILITIES.map((c) => {
          return (
            <Link key={c.title} to={c.to} className={styles.capCard}>
              <h2 className={styles.capCardHead}>
                <Icon name={c.icon} className={styles.capCardIcon} />
                {c.title}
              </h2>
              <p className={styles.capCardText}>{c.text}</p>
              {'product' in c && c.product ? (
                <CardProduct name={c.product} />
              ) : PREVIEW_PHOTO_ART ? (
                <CardPhoto variant={c.art} />
              ) : (
                <CardArt variant={c.art} />
              )}
            </Link>
          );
        })}
      </section>
    </div>
  );
}

function PopularBlock() {
  return (
    <section className={styles.twoCol}>
      <div className={styles.twoColMain}>
        <div className={styles.blockHead}>
          <h2 className={styles.blockTitle}>Popular how-to guides</h2>
          <Link className={styles.blockLink} to="/guides/get-oriented">
            View more guides <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={styles.rowList}>
          {GUIDES.map((g) => (
            <Link key={g.title} to={g.to} className={styles.row}>
              <Icon name={g.icon} size={24} className={styles.rowIcon} />
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>{g.title}</span>
                <span className={styles.rowText}>{g.text}</span>
              </span>
              <Icon name="Advance" size={20} className={styles.rowChevron} />
            </Link>
          ))}
        </div>
      </div>

      <div className={styles.twoColDivider} />

      <div className={styles.twoColAside}>
        <div className={styles.blockHead}>
          <h2 className={styles.blockTitle}>Popular references</h2>
          <Link className={styles.blockLink} to="/api-reference/mqtt">
            All references <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={styles.rowList}>
          {REFERENCES.map((r) => (
            <Link key={r.title} to={r.to} className={styles.row}>
              <Icon name={r.icon} size={24} className={styles.rowIcon} />
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>{r.title}</span>
                <span className={styles.rowText}>{r.text}</span>
              </span>
              <span className={styles.rowTag}>{r.tag}</span>
              {/* Must stay the LAST child: .rowTag + .rowChevron is what stops the two
                  auto margins from splitting the row's free space between them. */}
              <Icon name="Advance" size={20} className={styles.rowChevron} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Surfaces() {
  return (
    <section className={styles.surfaces}>
      <p className={styles.eyebrow}>API surfaces</p>
      <h2 className={styles.sectionTitle}>Every command, event, and integration path</h2>
      {SURFACES.map((group) => (
        <div key={group.name} className={styles.surfaceGroup}>
          <h3 className={styles.groupTitle}>{group.name}</h3>
          <p className={styles.groupText}>{group.text}</p>
          <div className={styles.chipGrid}>
            {group.chips.map((chip) => (
              <Link key={chip.label} to={chip.to} className={styles.chip}>
                <span className={styles.chipDot} aria-hidden="true">
                  {chip.short}
                </span>
                {chip.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ApiPanel() {
  return (
    <section className={styles.apiSection}>
      <div className={styles.apiPanel}>
        <Link to="/api-reference/mqtt" className={styles.apiExpand} aria-label="Open the MQTT API reference">
          <Icon name="ArrowOut" className={styles.iconOnFill} />
        </Link>

        <div className={styles.apiPanelBody}>
          <h2 className={styles.apiPanelTitle}>Drive the reader over MQTT</h2>
          <p className={styles.apiPanelText}>
            Publish JSON commands on the CTRL endpoint and receive tag reads on the DATA endpoint.
            No REST wrapper and no SDK — every command and event is documented with request rows,
            response rows, and topic mapping.
          </p>
          <Link className={styles.apiPanelLink} to="/api-reference/mqtt">
            Get started with the IOTC MQTT API <span aria-hidden="true">→</span>
          </Link>
          {OPERATIONS.map((op) => (
            <Link key={op.name} to={op.to} className={styles.apiOp}>
              <span className={styles.apiOpName}>{op.name}</span>
              <span className={styles.apiOpText}>{op.text}</span>
            </Link>
          ))}
        </div>

        <div className={styles.apiPanelAside}>
          {/* `light` IS A DATUM THEME SCOPE, NOT A STYLE HOOK, and it is the fix for a
              real defect. This plate is a permanently-WHITE surface on a permanently-BLACK
              panel — neither follows the page theme, by design. Its ink, however, reads
              datum's --technical-syntax-* tokens, and those DO follow the page theme, so in
              dark mode the plate stayed white while the ink turned into dark-theme values:
              the topic line and every key measured 1.16:1 on it, which is invisible.
              datum's 02-foundations/color/05-themes.md 5.1 supports exactly this — every
              token is redeclared under `.light` so a light region can be scoped inside a
              dark page — and 5.2 explains why that works where a single :root declaration
              would not. Scoping the plate pins its ink to the light theme in BOTH page
              themes, which is the only self-consistent answer for a surface that does not
              flip. Measured after: worst case 4.99:1, identical in light and dark. */}
          <pre
            className={`light ${styles.apiSample}`}
            tabIndex={0}
            role="region"
            aria-label="Example control_operation command">
            {SAMPLE}
          </pre>
        </div>
      </div>
    </section>
  );
}

const MEDIA_RESOURCES: Record<'blog' | 'video', MediaResource[]> = {
  blog: BLOG_RESOURCES,
  video: VIDEO_RESOURCES,
};

function Resources() {
  const [activeTab, setActiveTab] = React.useState<(typeof RESOURCE_TABS)[number]['id']>('all');
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const activeTabIndex = RESOURCE_TABS.findIndex((t) => t.id === activeTab);
  const activeTabDef = RESOURCE_TABS[activeTabIndex] ?? RESOURCE_TABS[0];
  const activeLabel = activeTabDef.label;
  const seeAll = activeTabDef.seeAll;

  /* THE SLIDING THUMB, which is what makes this a SEGMENTED CONTROL rather than a row
   * of toggle buttons. HeroUI's Segment draws a raised pane on a recessed track and
   * moves it between the options; the three labels here are different widths, so its
   * position and width have to be measured rather than derived in CSS.
   *
   * SSR IS THE PART THAT NEEDS CARE. This page is server-rendered, and on the server
   * there is nothing to measure — so the markup ships with the thumb at zero width and
   * the ACTIVE BUTTON carrying its own raised fill as a fallback. `ready` flips on the
   * first client measurement and, in the same commit, the stylesheet hands the fill
   * from the button to the thumb (see `[data-thumb='ready']`). One paint, no flash,
   * and a reader with JS disabled keeps a correct-looking control instead of a track
   * with nothing selected.
   *
   * THE TRANSITION IS WITHHELD UNTIL AFTER THAT FIRST MEASUREMENT for the same reason:
   * animating from 0 to the first tab's box on load would be a slide nobody asked for.
   * `data-thumb` gates the transition too. */
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = React.useState({ x: 0, w: 0, ready: false });

  React.useEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeTabIndex];
      const track = tabsRef.current;
      if (!el || !track) return;
      setThumb({
        x: el.offsetLeft - track.clientLeft,
        w: el.offsetWidth,
        ready: true,
      });
    };
    measure();
    /* Labels are text, so the boxes move when the face loads, when the viewport
       changes, and on a zoom step. A ResizeObserver on the track catches all three;
       a window resize listener would miss the font swap. */
    const ro = new ResizeObserver(measure);
    if (tabsRef.current) ro.observe(tabsRef.current);
    return () => ro.disconnect();
  }, [activeTabIndex]);

  /* Roving tabindex, APG Tabs pattern: arrow keys move both focus and
   * selection between the three pills. Click/Enter/Space need no handler of
   * their own — they are a native <button>'s onClick and activation for free. */
  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % RESOURCE_TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + RESOURCE_TABS.length) % RESOURCE_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = RESOURCE_TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    setActiveTab(RESOURCE_TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className={styles.resources}>
      <div className={styles.resourcesHead}>
        <div>
          <p className={styles.eyebrow}>Resources</p>
          <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>
            Want to know more?
          </h2>
        </div>
        {seeAll.external ? (
          <a
            className={styles.blockLink}
            href={seeAll.to}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${seeAll.label} (opens in a new tab)`}>
            {seeAll.label} <span aria-hidden="true">→</span>
          </a>
        ) : (
          <Link className={styles.blockLink} to={seeAll.to}>
            {seeAll.label} <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>

      <div
        ref={tabsRef}
        className={styles.resourceTabs}
        data-thumb={thumb.ready ? 'ready' : undefined}
        role="tablist"
        aria-label="Filter resources by type">
        {/* Decorative: the selected state is already on each button's aria-selected,
            so this must not be announced or reachable. */}
        <span
          className={styles.resourceTabThumb}
          aria-hidden="true"
          style={{ transform: `translateX(${thumb.x}px)`, width: `${thumb.w}px` }}
        />
        {RESOURCE_TABS.map((tab, index) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`resource-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="resource-tabpanel"
              tabIndex={selected ? 0 : -1}
              className={selected ? `${styles.resourceTab} ${styles.resourceTabActive}` : styles.resourceTab}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* THE GAP BELOW THE TABS LIVES HERE, ON THE PANEL, and that is the fix rather
          than a third copy of it. `.resourceGrid` and `.resourceEmpty` each carried
          their own `margin-top: 2rem`; the carousel — the third thing this panel can
          render, and the one that shows for Blogs and Videos — had no rule in the
          stylesheet at all, so switching away from All collapsed the gap to zero.
          Hanging the margin on the panel means the next panel state cannot repeat the
          bug, and the two children no longer need to know about it. */}
      <div
        id="resource-tabpanel"
        className={styles.resourcePanel}
        role="tabpanel"
        aria-labelledby={`resource-tab-${activeTab}`}>
        {activeTab === 'all' ? (
          <div className={styles.resourceGrid}>
            {/* NO `.resourceMeta` LINE ANY MORE, on any of the three kinds. The read /
                watch time moved onto the cover, and leaving it below as well would have
                printed the same four words twice in one card. */}
            {RESOURCES.map((r) => (
              <Link key={r.title} to={r.to} className={styles.resourceCard}>
                <ResourceCover kind={r.kind} meta={r.meta} title={r.title} />
                <p className={styles.resourceText}>{r.text}</p>
              </Link>
            ))}
          </div>
        ) : MEDIA_RESOURCES[activeTab].length > 0 ? (
          <MediaCarousel items={MEDIA_RESOURCES[activeTab]} kind={activeTab} />
        ) : (
          <p className={styles.resourceEmpty}>
            No {activeLabel.toLowerCase()} yet — new {activeLabel.toLowerCase()} will show up here as we publish them.
          </p>
        )}
      </div>
    </section>
  );
}

function Help() {
  return (
    <section className={styles.helpSection}>
      <div className={styles.helpCard}>
        <h2 className={styles.helpTitle}>How can we help you today?</h2>
        <div className={styles.helpGrid}>
          {HELP.map((h) => {
            return (
              <div key={h.title} className={styles.helpItem}>
                <span className={styles.helpIcon}>
                  <Icon name={h.icon} className={styles.iconOnFill} />
                </span>
                <h3 className={styles.helpItemTitle}>{h.title}</h3>
                <p className={styles.helpItemText}>{h.text}</p>
                <Link className={styles.helpItemLink} to={h.to}>
                  {h.cta} <span aria-hidden="true">→</span>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Community() {
  return (
    <section className={styles.community}>
      <h2 className={styles.communityTitle}>
        Join the <span className={styles.communityAccent}>community</span>
      </h2>
      <p className={styles.communityText}>
        Zebra&apos;s developer portal, support channels, and community forum — for firmware
        releases, hardware questions, and everything this reference does not cover.
      </p>
      <div className={styles.communityActions}>
        <a
          className={styles.communityBtn}
          href="https://developer.zebra.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Zebra Developer Portal (opens in a new tab)">
          Developer Portal <span aria-hidden="true">→</span>
        </a>
        <a
          className={styles.communityBtn}
          href="https://developer.zebra.com/community"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Zebra Developer Community (opens in a new tab)">
          Developer Community <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  );
}

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="MQTT API documentation for Zebra RFD40 and RFD90 handheld RFID reader sleds. Quick Start tutorials, integration guides, API reference, and conceptual explanations.">
      <div className={styles.page}>
        <main>
          <Hero />
          <PopularBlock />
          <Surfaces />
          <ApiPanel />
          <Resources />
          <Help />
          <Community />
        </main>
      </div>
    </Layout>
  );
}
