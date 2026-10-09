import React, { useMemo, useState, useEffect, useRef, useId, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import Link from '@docusaurus/Link';
import TreeControls from './TreeControls';
import ToggleMark from './ToggleMark';

/**
 * SchemaTable — a single, unified, collapsible tree-table for an MQTT request
 * or response body. It MERGES the schema and the example into one table:
 * columns are Field · Type · Enum / Units · Example · Description, with a
 * line-number gutter on the left. Required fields are flagged with a red
 * asterisk (`*`) after the field name — there is no separate Required column.
 *
 * - Nested objects/arrays are child rows, indented under their parent.
 * - Every expandable row has a geometric +/- disclosure mark
 *   (<ToggleMark>, styled as `.api-toggle-mark` in api.scss) before the field name.
 * - "Expand all" / "Collapse all" controls sit above the table.
 * - Line numbers count the currently VISIBLE rows (collapsing a row renumbers).
 *
 * Width strategy (the right-hand TOC stays persistent site-wide — width is solved
 * at the table level, not by hiding navigation):
 *   1. Column sizing (src/css/api.scss) caps the boundable columns so Description
 *      keeps a comfortable, flexible width and most tables fit beside the TOC.
 *   2. When a table is still too wide it scrolls horizontally inside `.schema-table-wrap`
 *      — an edge fade signals the overflow and the scroll box becomes a focusable,
 *      labelled region ONLY while it actually scrolls (WCAG 2.1.1 keyboard scroll).
 *   3. An explicit, per-table "Expand table" toggle full-bleeds ONLY that table to
 *      the viewport's right edge on demand (shown only when the table overflows);
 *      navigation is never hidden.
 *
 * Authoring: pass `rows` as a tree (defined in the page's ESM block). Usually
 * rendered inside <ApiBody> (Schema tab). See `_templates/COMMAND_TEMPLATE.mdx`.
 */

export type SchemaRow = {
  /** Field name (rendered monospace). */
  field: string;
  /** JSON type: string | integer | number | boolean | object | array | enum | null. */
  type?: string;
  /** true → red asterisk after the field name; false/omitted/any string → no marker. */
  required?: boolean | string;
  /** Array → enum pills; string → units/constraint text (e.g. "mAh", "0–100"). */
  enumUnits?: string[] | string;
  /** Example value (rendered monospace). */
  example?: string;
  /** Description. Supports inline code and Markdown links. */
  desc?: ReactNode;
  /** Nested child fields. */
  children?: SchemaRow[];
};

type FlatRow = { row: SchemaRow; id: string; depth: number; hasChildren: boolean; isOpen: boolean };

const INDENT_REM = 1.4;

function renderDesc(text: ReactNode): ReactNode {
  if (text == null) return null;
  if (typeof text !== 'string') return text;
  const inline = (value: string) => value.split('`').map((part, i) =>
    i % 2 === 1 ? <code key={i}>{part}</code> : <React.Fragment key={i}>{part}</React.Fragment>,
  );
  const parts: ReactNode[] = [];
  // Labels may contain indexed fields such as `publishTopics[1]`.
  const links = /\[((?:[^\[\]]|\[[^\]]*\])+)\]\(([^)\s]+)\)/g;
  let offset = 0;
  for (const match of text.matchAll(links)) {
    parts.push(<React.Fragment key={`text-${offset}`}>{inline(text.slice(offset, match.index))}</React.Fragment>);
    parts.push(<Link key={`link-${match.index}`} to={match[2]}>{inline(match[1])}</Link>);
    offset = match.index + match[0].length;
  }
  parts.push(<React.Fragment key={`text-${offset}`}>{inline(text.slice(offset))}</React.Fragment>);
  return parts;
}

function renderEnumUnits(enumUnits: SchemaRow['enumUnits']): ReactNode {
  if (Array.isArray(enumUnits)) {
    if (enumUnits.length === 0) return <span className="schema-muted">—</span>;
    return enumUnits.map((v, i) => (
      <span className="api-enum" key={i}>
        {v}
      </span>
    ));
  }
  if (typeof enumUnits === 'string' && enumUnits.trim() !== '') {
    return <span className="schema-units">{enumUnits}</span>;
  }
  return <span className="schema-muted">—</span>;
}

// Horizontal expand/collapse (full-bleed) glyphs for the "Expand table" toggle.
function ExpandTableIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="12" x2="21" y2="12" />
      <polyline points="7 8 3 12 7 16" />
      <polyline points="17 8 21 12 17 16" />
    </svg>
  );
}

function CollapseTableIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="12" x2="16" y2="12" />
      <polyline points="4 8 8 12 4 16" />
      <polyline points="20 8 16 12 20 16" />
    </svg>
  );
}

// All expandable (has-children) node ids, by path.
function collectExpandable(rows: SchemaRow[], prefix = '', acc: string[] = []): string[] {
  rows.forEach((r, i) => {
    const id = prefix ? `${prefix}.${i}` : `${i}`;
    if (r.children && r.children.length > 0) {
      acc.push(id);
      collectExpandable(r.children, id, acc);
    }
  });
  return acc;
}

// Flatten to the list of currently VISIBLE rows (respecting `expanded`).
function flatten(
  rows: SchemaRow[],
  expanded: Set<string>,
  depth = 0,
  prefix = '',
  out: FlatRow[] = [],
): FlatRow[] {
  rows.forEach((r, i) => {
    const id = prefix ? `${prefix}.${i}` : `${i}`;
    const hasChildren = !!(r.children && r.children.length > 0);
    const isOpen = expanded.has(id);
    out.push({ row: r, id, depth, hasChildren, isOpen });
    if (hasChildren && isOpen) flatten(r.children!, expanded, depth + 1, id, out);
  });
  return out;
}

export default function SchemaTable({ rows, title }: { rows: SchemaRow[]; title?: string }): React.JSX.Element {
  const titleId = useId(); // labels the <table> for screen readers (tables are jumped between)
  const expandableIds = useMemo(() => collectExpandable(rows), [rows]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(expandableIds));
  const toggle = (id: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAll = (): void => setExpanded(new Set(expandableIds));
  const collapseAll = (): void => setExpanded(new Set());
  const hasExpandable = expandableIds.length > 0;
  // Expand-all / Collapse-all disabled-state (this component stores EXPANDED ids):
  const allExpanded = expanded.size === expandableIds.length;
  const allCollapsed = expanded.size === 0;

  // --- Layer 2: horizontal-scroll affordance + accessible scroll region ---
  const wrapRef = useRef<HTMLDivElement>(null); // the overflow:auto scroll container
  const [scroll, setScroll] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = (): void => {
      const max = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft < max - 1;
      // Bail out when unchanged so horizontal scrolling doesn't re-render every frame.
      setScroll((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // Print / PDF: collapsed subtrees are unmounted (see flatten), so CSS alone can't
  // reveal them. Force every row open before the browser paints, restore after. (UI audit)
  const prevExpandedRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const before = (): void =>
      flushSync(() =>
        setExpanded((cur) => {
          // Capture the pre-print state only on FIRST entry — some browsers dispatch
          // beforeprint more than once without an intervening afterprint; a second capture
          // would save the already-expanded set and lose the user's collapse. (UI audit — review.)
          if (prevExpandedRef.current == null) prevExpandedRef.current = cur;
          return new Set(expandableIds);
        }),
      );
    const after = (): void => {
      if (prevExpandedRef.current) setExpanded(prevExpandedRef.current);
      prevExpandedRef.current = null;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [expandableIds]);

  // --- Layer 3: per-table "Expand table" (full-bleed) toggle ---
  // On-demand and per-instance (NOT persisted): the toggle only appears on a table
  // that actually overflows, and full-bleed is never auto-applied — so it never
  // force-expands other tables or re-covers the (now persistent) TOC.
  const panelRef = useRef<HTMLDivElement>(null); // the whole panel (header + table); full-bleeds together
  const [fullWidth, setFullWidth] = useState(false);
  const toggleFullWidth = (): void => setFullWidth((v) => !v);
  // Measure the exact width needed to reach the viewport's right edge (reclaiming
  // the TOC gutter) — the doc content column is NOT centred in the viewport, so a
  // pure-CSS `calc(50% - 50vw)` breakout would be mis-offset. clientWidth excludes
  // the scrollbar, so the table never triggers a horizontal page scrollbar. A
  // ResizeObserver re-measures when the panel is revealed (Example is the default
  // tab, so the Schema panel can be display:none); measuring is skipped while hidden.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return undefined;
    if (!fullWidth) {
      el.style.removeProperty('--fb-reach');
      return undefined;
    }
    const measure = (): void => {
      if (el.clientWidth === 0) return; // hidden (display:none) — the RO re-fires on reveal
      const left = el.getBoundingClientRect().left;
      const vw = document.documentElement.clientWidth;
      // THE PANEL STOPS SHORT OF THE VIEWPORT EDGE — owner instruction 2026-09-10: "when
      // expanding the schema table there should be a slight gap between the table and the edge
      // of the browser". It reached `vw` exactly, so the table's right border sat on the window
      // frame and the expanded state read as clipped rather than as widened.
      //
      // JS PUBLISHES THE REACH; CSS SUBTRACTS THE GUTTER. The first attempt read
      // `--ifm-spacing-horizontal` here and passed it to parseFloat — which returns 1 for the
      // string "1rem", so the panel inset by ONE PIXEL and the bug looked fixed while being off
      // by a factor of sixteen. getPropertyValue hands back the authored token, units and all,
      // and resolving CSS units in JS means reimplementing the cascade. So this sets only the
      // measured px reach and the stylesheet does the arithmetic, where a rem is just a rem.
      el.style.setProperty('--fb-reach', `${vw - left}px`);
    };
    measure();
    /* ── OBSERVE THE COLUMN, NOT THE PANEL — corrected 2026-09-10 ────────────────────────
     * This observed `el`, and `el` is the one element whose width THIS EFFECT SETS: the panel
     * is `width: calc(var(--fb-reach) - …)`, so once expanded its box stops responding to the
     * layout and the ResizeObserver has nothing to fire on. Collapsing or expanding the left
     * sidebar therefore MOVED the panel without re-measuring it. Measured on
     * /api-reference/mqtt/mgmt/config-endpoint/ at 1440px, table expanded: with the sidebar
     * collapsed the panel ended 32px short of the viewport, and expanding the sidebar pushed
     * its right edge to 1482 — 42px PAST the window — because the stale reach was carried
     * across a 74px shift of the panel's left edge.
     * The PARENT is the content column's own box: it is not sized by us, it narrows and widens
     * with the sidebar, and it is the element whose left edge the reach is measured from. So it
     * is the honest thing to watch, and the sidebar toggle now re-measures for free — no
     * MutationObserver on the collapse attribute, no coupling to how the sidebar is built. */
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', measure);

    /* ── AND THE SIDEBAR, WHICH NO ResizeObserver CAN SEE ────────────────────────────────
     * Collapsing the sidebar does not RESIZE the content column on this site — the column has a
     * max-width, so what changes is where it SITS. Measured at 1440px: the panel's left edge
     * moved 352 -> 294 while its parent's width did not change by a pixel, so neither observer
     * above fired and the expanded table kept a reach measured against the old position — 58px
     * short of the viewport with the sidebar collapsed, and 42px PAST it going the other way.
     * A ResizeObserver is the wrong instrument for a translation; the state change itself is the
     * signal, and `<html data-sidebar-collapsed>` is where the sidebar publishes it.
     *
     * IT MEASURES AFTER THE TRANSITION, NOT DURING. The panel slides over ~200ms, and a
     * measurement taken on the attribute flip reads the position it is leaving. `transitionend`
     * on the sidebar container is the precise signal; the timeout is the fallback for the case
     * where the transition is suppressed (prefers-reduced-motion) and no event ever fires. */
    /* A SEQUENCE, NOT A SINGLE DELAYED MEASUREMENT. The panel does not arrive at its new
     * position in one step: the attribute flips, the sidebar's own width transitions, and the
     * content column reflows behind it. A single re-measure at 260ms landed mid-slide and left
     * the table 16px short — measured, gap 32 where 16 was owed. These four passes bracket the
     * whole settle: the last correct one wins and the earlier ones cost a `getBoundingClientRect`
     * each, which is a read of the box the browser has just laid out anyway. */
    const timers: number[] = [];
    const settle = (): void => {
      measure();
      for (const ms of [120, 320, 700]) timers.push(window.setTimeout(measure, ms));
    };
    const mo = new MutationObserver(settle);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-sidebar-collapsed'],
    });
    /* On the DOCUMENT, in capture, because the element that actually animates is the sidebar's
       inner container and this component has no business knowing which one that is. */
    document.addEventListener('transitionend', measure, true);
    return () => {
      mo.disconnect();
      document.removeEventListener('transitionend', measure, true);
      for (const t of timers) window.clearTimeout(t);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [fullWidth]);

  const visible = useMemo(() => flatten(rows, expanded), [rows, expanded]);
  const scrollable = scroll.left || scroll.right;
  /* THE WIDTH TOGGLE IS ALWAYS RENDERED — corrected 2026-09-10.
   *
   * It used to be `scrollable || fullWidth`: shown only while the table was actually overflowing
   * its column. That made the control disappear at the exact moment the reader gained room —
   * collapsing the left sidebar widens the content column, the table stops overflowing, and the
   * button vanished. Reproduced at 1440px on /api-reference/mqtt/mgmt/config-endpoint/: with the
   * sidebar collapsed the toggle was not in the DOM at all, which is the owner's report.
   *
   * OVERFLOW WAS THE WRONG TEST. Expanding is not only an escape from a scrollbar — it reclaims
   * the TOC gutter and gives every column more room, which is worth doing on a table that fits.
   * And a control whose presence depends on a measurement of its own container is a control that
   * flickers: the same table shows and hides its button as the window is dragged.
   * The VIEWPORT gate that does belong stays in CSS, where it already was:
   * `@media (max-width: 996px) { .schema-fullbleed-toggle { display: none } }` — below that width
   * there is no gutter to reclaim and the table scrolls natively.
   *
   * `scrollable` is still computed and still used: it drives the scroll REGION's role and label
   * further down, which is a genuine statement about overflow and must keep tracking it. */

  return (
    <div className="schema">
      <div
        ref={panelRef}
        className={'schema-panel' + (fullWidth ? ' schema-panel--fullbleed' : '')}
      >
        <div className="schema-header">
          {title ? (
            <span className="schema-title" id={titleId}>
              {title}
            </span>
          ) : null}
          <span className="schema-header-spacer" />
          {hasExpandable ? (
            <TreeControls
              className="schema-controls"
              onExpandAll={expandAll}
              onCollapseAll={collapseAll}
              expandDisabled={allExpanded}
              collapseDisabled={allCollapsed}
            />
          ) : null}
          <button
            type="button"
            className="schema-ctrl schema-ctrl--icon schema-fullbleed-toggle"
            aria-pressed={fullWidth}
            aria-label={fullWidth ? 'Collapse table to column width' : 'Expand table to full width'}
            data-tooltip={fullWidth ? 'Collapse table' : 'Expand table'}
            onClick={toggleFullWidth}
          >
            {fullWidth ? <CollapseTableIcon /> : <ExpandTableIcon />}
          </button>
        </div>
        {/* Key for the table's symbols. It PRECEDES the table deliberately: placed after the
            rows, a linear reader meets the asterisk, the type badge and the toggle long
            before the key that decodes them. (UI audit 2026-08, item 9.)
            Purely visual: the required-ness (asterisk aria-label="required") and the type
            (visible Type column) are already exposed to AT, and the symbol→meaning mapping
            here is visual-only — so hide the whole legend from screen readers to avoid
            orphaned, repeated words. (UI audit — review follow-up.) */}
        <div className="schema-legend" aria-hidden="true">
          <span>
            <span className="schema-req-asterisk">*</span> required
          </span>
          <span>
            <span className="schema-muted" aria-hidden="true">—</span> not applicable
          </span>
          <span>Colored badge = JSON type</span>
        </div>
        <div
          className={
            'schema-table-scroll' +
            (scroll.left ? ' has-scroll-left' : '') +
            (scroll.right ? ' has-scroll-right' : '')
          }
        >
          <div
            className="schema-table-wrap"
            ref={wrapRef}
            {...(scrollable
              ? { role: 'region', 'aria-label': 'Schema table, scroll horizontally to see more', tabIndex: 0 }
              : {})}
          >
            <table className="schema-table" aria-labelledby={title ? titleId : undefined}>
            <thead>
              <tr>
                {/* Gutter header hidden from AT — its column cells are aria-hidden too,
                    so the numbering is consistently skipped by screen readers. */}
                <th className="schema-ln-head" aria-hidden="true">
                  #
                </th>
                <th scope="col" className="schema-field-head">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Enum / Units</th>
                <th scope="col">Example</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ row: r, id, depth, hasChildren, isOpen }, idx) => (
                <tr key={id} className={`schema-row${hasChildren ? ' schema-row--parent' : ''}`}>
                  <td className="schema-ln" aria-hidden="true">
                    {idx + 1}
                  </td>
                  <td className="schema-cell schema-cell--field">
                    <span className="schema-indent" style={{ paddingLeft: `${depth * INDENT_REM}rem` }}>
                      {hasChildren ? (
                        <button
                          type="button"
                          className="schema-toggle"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? `Collapse ${r.field}` : `Expand ${r.field}`}
                          onClick={() => toggle(id)}
                        >
                          <ToggleMark open={isOpen} />
                        </button>
                      ) : (
                        <span className="schema-toggle-spacer" aria-hidden="true" />
                      )}
                      <span className="schema-field-wrap">
                        <code className="schema-field">{r.field}</code>
                        {r.required === true ? (
                          <span
                            className="schema-req-asterisk"
                            role="img"
                            aria-label="required"
                            title="Required"
                          >
                            {/* No leading space: datum's own markup is
                                `<code>field</code><span …>*</span>`, flush. The space
                                separated the marker from the name it qualifies and read
                                as a footnote rather than as part of the field. */}
                            {'*'}
                          </span>
                        ) : null}
                        {depth > 0 ? (
                          <span className="schema-visually-hidden">, nesting level {depth + 1}</span>
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td className="schema-cell schema-cell--type">
                    {r.type ? (
                      <span className={`api-type api-type--${String(r.type).trim().toLowerCase()}`}>{r.type}</span>
                    ) : (
                      <span className="schema-muted">—</span>
                    )}
                  </td>
                  <td className="schema-cell schema-cell--enum">
                    <div className="schema-enum-wrap">{renderEnumUnits(r.enumUnits)}</div>
                  </td>
                  <td className="schema-cell schema-cell--example">
                    {r.example != null && r.example !== '' ? (
                      <code className="schema-example">{r.example}</code>
                    ) : (
                      <span className="schema-muted">—</span>
                    )}
                  </td>
                  <td className="schema-cell schema-cell--desc">
                    {r.desc != null && r.desc !== '' ? renderDesc(r.desc) : <span className="schema-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
