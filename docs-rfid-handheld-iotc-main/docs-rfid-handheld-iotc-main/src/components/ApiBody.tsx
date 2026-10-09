import React, {useEffect, useId, useLayoutEffect} from 'react';
import useIsBrowser from '@docusaurus/useIsBrowser';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import SchemaTable, { type SchemaRow } from './SchemaTable';
import JsonBlock, { type Json } from './JsonBlock';

/**
 * Stable, localStorage-safe key for a section title — mirrors VariantSelect's
 * `slugify`. Becomes the Docusaurus <Tabs> groupId (persist key
 * `docusaurus.tab.<groupId>`). Two bodies of the SAME section (identical title)
 * share a tab group; different sections ("Request payload" vs "Response payload")
 * get different groups and so toggle independently. Falls back to the legacy shared
 * "view" key when a body has no title (keeps any untitled body behaving as before).
 */
function sectionSlug(title?: string): string {
  const slug = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'view';
}

/**
 * A layout effect on the client, a no-op on the server. React logs a warning for
 * `useLayoutEffect` during SSR, and this one has to be a LAYOUT effect: it writes the
 * indicator's geometry, so running it after paint would flash an unpositioned pill on
 * every hydration.
 */
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * THE SLIDING SEGMENT INDICATOR — the JS half of the `.api-body-tabs::before` rules in
 * src/css/api.scss. Measures the ACTIVE `<li>` against the `<ul>` and writes two custom
 * properties onto the `<ul>`; CSS does the rest.
 *
 * WHY IT IS DRIVEN BY OBSERVATION AND NOT BY A CLICK HANDLER. Docusaurus's stock <Tabs>
 * owns tab state — selection, the roving tabindex, ArrowRight/Home/End, groupId sync
 * across bodies, localStorage persistence and the `beforeprint` expand-all. Adding our
 * own click handler would either duplicate that state or fight it. A MutationObserver on
 * `aria-selected` is a pure READER of Docusaurus's own state, so none of that behaviour
 * can drift. Its callback is a microtask, so the new geometry is committed before the
 * next paint and the transition starts from the previous committed value.
 *
 * WHY THE TRACK IS FOUND BY A PER-INSTANCE CLASS AND NOT BY A ref. `@theme/Tabs` is not
 * swizzled (and must not be — it is outside this change's file set), and it forwards no
 * ref: `className` is the only prop that reaches the `<ul>` it renders. Wrapping <Tabs>
 * in a ref-bearing `<div>` was the alternative and was rejected, because the whole
 * payload-container geometry in api.scss keys off `.theme-tabs-container:has(> .api-body-tabs)`
 * and its outward margin bleed, and a new box in that chain is a layout question nobody
 * asked. A unique class costs no DOM node at all.
 *
 * WHAT THE OBSERVERS COVER:
 *   • MutationObserver / aria-selected — a tab switch, from a click OR from the keyboard
 *     OR from another body in the same groupId. It is deliberately NOT watching `class`:
 *     `aria-selected` is the accessibility contract and changes in the same commit.
 *   • ResizeObserver — reflow: viewport width, the 576px padding change, a webfont swap
 *     (Inter loads with `font-display: swap`, which re-measures both labels), and the
 *     print handler hiding and restoring the strip.
 * A zero-width active item means the strip is not rendered right now (print emulation,
 * or an ancestor still `display: none`), so the last good geometry is kept rather than
 * being overwritten with garbage.
 *
 * `isBrowser` IS A REAL DEPENDENCY AND DELETING IT SILENTLY BREAKS THIS, which cost a
 * probe to find rather than a reading. @theme/Tabs renders
 * `<TabsProvider key={String(useIsBrowser())}>` — the comment on that line in
 * node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js says "Remount tabs after
 * hydration", a fix for facebook/docusaurus#5653 — so the `<ul>` this effect measured is
 * THROWN AWAY and rebuilt the moment that flag flips. Measured with a probe pushed into
 * the effect: it ran once per body and wrote `--seg-x: 0.00px` / `--seg-w: 89.31px` onto a
 * connected node, and a moment later both the inline style and `data-seg-ready` were gone
 * from every `<ul>` in the page, because those `<ul>`s were different elements. Taking
 * `isBrowser` as a dependency re-runs the setup on the surviving node. It is also why the
 * pre-measure fallback pill in api.scss is not merely a no-JS courtesy: that remount
 * guarantees a real un-measured window on every single page load.
 */
function useSegmentIndicator(trackClass: string, isBrowser: boolean): void {
  useIsomorphicLayoutEffect(() => {
    const track = document.querySelector<HTMLElement>(`ul.${trackClass}`);
    if (!track) return undefined;

    let raf = 0;
    const measure = (): void => {
      const active =
        track.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
        track.querySelector<HTMLElement>('[role="tab"]');
      if (!active) return;
      const item = active.getBoundingClientRect();
      if (item.width === 0) return; // not rendered — keep the last good geometry
      const box = track.getBoundingClientRect();
      const cs = getComputedStyle(track);
      /* The indicator is absolutely positioned, so `left: 0` resolves against the
         track's PADDING box. Offsets are therefore measured from that origin, not from
         the border box — hence the two subtractions. `offsetLeft` was the other option
         and is avoided on purpose: which edge it reports is not consistent enough to
         rely on for a value that has to land sub-pixel. */
      const originX =
        box.left +
        (parseFloat(cs.borderLeftWidth) || 0) +
        (parseFloat(cs.paddingLeft) || 0);
      track.style.setProperty('--seg-x', `${(item.left - originX).toFixed(2)}px`);
      track.style.setProperty('--seg-w', `${item.width.toFixed(2)}px`);
      /* FIRST PAINT MUST NOT ANIMATE. The indicator is `display: none` until this
         attribute exists, and an element that has never been rendered has no
         before-change style, so nothing transitions when it first appears. Guarded so a
         re-measure does not rewrite an attribute that is already correct. */
      if (track.dataset.segReady !== '1') track.dataset.segReady = '1';
    };

    measure();

    const mo = new MutationObserver(measure);
    mo.observe(track, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
    });

    /* rAF-coalesced: ResizeObserver fires once on observe() and can fire several times
       during a webfont swap, and a same-frame write is what produces the
       "ResizeObserver loop" warning. Nothing `measure` writes can change the track's own
       size — both properties only reach an absolutely-positioned pseudo-element — so
       there is no feedback loop to break, only noise to coalesce. */
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(track);

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      ro.disconnect();
    };
  }, [trackClass, isBrowser]);
}

/**
 * ApiBody — the request/response (or event payload / configuration) body for an
 * MQTT reference page, presented as two tabs of the SAME underlying data:
 *
 *   • "Example" — the collapsible, copy-pasteable <JsonBlock>, with line numbers.
 *                 Shown first (the default view): readers scan a concrete payload
 *                 before drilling into the field-by-field contract.
 *   • "Schema"  — the unified collapsible <SchemaTable> (Field · Type · Enum /
 *                 Units · Example · Description), with line numbers. Required
 *                 fields carry a red asterisk after the field name.
 *
 * Each SECTION gets its OWN tab group, derived from `title` (e.g. "Request payload"
 * → groupId "api-body-request-payload"). So the Request and Response bodies toggle
 * Example/Schema INDEPENDENTLY, while every body of the SAME section (e.g. the
 * per-variant bodies inside one VariantSelect — only one is ever shown at a time)
 * stays in sync, and the choice persists per section (localStorage). No `queryString`:
 * writing the tab to the URL on every click fired spurious analytics $pageviews and
 * added query-param noise for no real gain (the tab switch is already tracked directly).
 *
 * `title` names the SECTION ("Request payload" / "Response payload" / "Event
 * payload") and is shown in BOTH tabs' header bars — so it must be view-agnostic
 * (no "example", no variant qualifier). `exampleCaption` is the example-specific
 * qualifier ("RFID START", "live, abridged"): it describes only the concrete JSON,
 * so it renders as a caption in the Example tab ONLY (never over the schema, which
 * is variant-agnostic). For genuinely alternative payloads, use VariantSelect.
 *
 * Authoring: define the row tree and JSON object once in the page's ESM block, then
 * `<ApiBody rows={REQUEST_ROWS} json={REQUEST_JSON} title="Request payload" />`.
 */
export default function ApiBody({
  rows,
  json,
  title,
  exampleCaption,
}: {
  rows: SchemaRow[];
  json: Json;
  title?: string;
  exampleCaption?: string;
}): React.JSX.Element {
  const view = sectionSlug(title);
  /* The per-instance handle for the segment indicator — see useSegmentIndicator.
     `useId` is the only identifier that is stable across the SSR render and hydration,
     which a module-level counter is not. Its value is wrapped in delimiters that are
     illegal in a class name (`_R_…_` in React 19, `:r0:` in React 18), and stripping
     them is injective for either format, so uniqueness survives sanitising. */
  const trackClass = `api-body-tabs--${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  useSegmentIndicator(trackClass, useIsBrowser());
  return (
    <Tabs groupId={`api-body-${view}`} className={`api-body-tabs ${trackClass}`}>
      <TabItem value="example" label="Example" default>
        <JsonBlock data={json} title={title} caption={exampleCaption} />
      </TabItem>
      <TabItem value="schema" label="Schema">
        <SchemaTable rows={rows} title={title} />
      </TabItem>
    </Tabs>
  );
}
