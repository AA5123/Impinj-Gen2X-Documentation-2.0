import React, { useMemo, useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import TreeControls from './TreeControls';
import Icon from '@site/src/components/icons';
import ToggleMark from './ToggleMark';

/**
 * JsonBlock — a collapsible, copy-pasteable raw-JSON viewer.
 *
 * - Objects and arrays are foldable: each has a geometric +/- disclosure mark
 *   (<ToggleMark>, styled as `.api-toggle-mark` in api.scss) before its opening brace/bracket.
 * - "Expand all" / "Collapse all" fold every container at once.
 * - "Copy" copies the pretty-printed JSON to the clipboard. It reports all three outcomes —
 *   "Copy" / "Copied" / "Failed" — in the label AND in the `role="status"` region below, over a
 *   width reserved by `.json-copy:not(.schema-ctrl--icon)` in api.scss so the swap cannot shove
 *   its siblings. `aria-label` folds in the panel title, because a reference page renders 5-7 of
 *   these and every one of them was named just "Copy" (UI audit 2026-08, item 8a); it is built
 *   from the same string the button renders, so the name follows the swap (WCAG 2.5.3).
 *
 * Authoring: pass the actual JS value via `data` (defined in the page's ESM
 * block), not a string. See `_templates/COMMAND_TEMPLATE.mdx`.
 */

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

const INDENT_REM = 1.2;

function isContainer(v: Json): v is Json[] | { [k: string]: Json } {
  return v !== null && typeof v === 'object';
}

// Collect the path-ids of every container node (object/array with entries).
function collectContainers(value: Json, path = '', acc: string[] = []): string[] {
  if (isContainer(value)) {
    const entries: [string, Json][] = Array.isArray(value)
      ? value.map((v, i) => [String(i), v])
      : Object.entries(value);
    if (entries.length > 0) acc.push(path);
    entries.forEach(([k, v]) => collectContainers(v, `${path}/${k}`, acc));
  }
  return acc;
}

function Primitive({ value }: { value: Json }): React.JSX.Element {
  if (typeof value === 'string') return <span className="json-string">"{value}"</span>;
  if (typeof value === 'number') return <span className="json-number">{String(value)}</span>;
  if (typeof value === 'boolean') return <span className="json-boolean">{String(value)}</span>;
  return <span className="json-null">null</span>;
}

function KeyLabel({ label }: { label: string | null }): React.JSX.Element | null {
  if (label == null) return null;
  return (
    <>
      <span className="json-key">"{label}"</span>
      <span className="json-punct">: </span>
    </>
  );
}

function renderValue(
  value: Json,
  path: string,
  depth: number,
  keyLabel: string | null,
  trailingComma: boolean,
  collapsed: Set<string>,
  toggle: (p: string) => void,
): React.JSX.Element[] {
  const pad = { paddingLeft: `${depth * INDENT_REM}rem` };

  if (isContainer(value)) {
    const isArr = Array.isArray(value);
    const entries: [string, Json][] = isArr
      ? (value as Json[]).map((v, i) => [String(i), v])
      : Object.entries(value as { [k: string]: Json });
    const open = isArr ? '[' : '{';
    const close = isArr ? ']' : '}';
    const hasChildren = entries.length > 0;
    const isCollapsed = collapsed.has(path);
    const lines: React.JSX.Element[] = [];

    lines.push(
      <div className="json-line" key={`${path}#open`}>
        <span className="json-content" style={pad}>
          {hasChildren ? (
            <button
              type="button"
              className="json-toggle"
              aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${keyLabel ?? (path ? `item ${path.split('/').pop()}` : isArr ? 'array' : 'object')}`}
              onClick={() => toggle(path)}
            >
              <ToggleMark open={!isCollapsed} />
            </button>
          ) : (
            <span className="json-toggle-spacer" aria-hidden="true" />
          )}
          <KeyLabel label={keyLabel} />
          <span className="json-punct">{open}</span>
          {!hasChildren ? (
            <span className="json-punct">
              {close}
              {trailingComma ? ',' : ''}
            </span>
          ) : isCollapsed ? (
            <>
              <span className="json-collapsed">
                {isArr ? ` ${entries.length} items ` : ' … '}
              </span>
              <span className="json-punct">
                {close}
                {trailingComma ? ',' : ''}
              </span>
            </>
          ) : null}
        </span>
      </div>,
    );

    if (hasChildren && !isCollapsed) {
      entries.forEach(([k, v], idx) => {
        lines.push(
          ...renderValue(
            v,
            `${path}/${k}`,
            depth + 1,
            isArr ? null : k,
            idx < entries.length - 1,
            collapsed,
            toggle,
          ),
        );
      });
      lines.push(
        <div className="json-line" key={`${path}#close`}>
          <span className="json-content" style={pad}>
            <span className="json-toggle-spacer" aria-hidden="true" />
            <span className="json-punct">
              {close}
              {trailingComma ? ',' : ''}
            </span>
          </span>
        </div>,
      );
    }
    return lines;
  }

  return [
    <div className="json-line" key={path}>
      <span className="json-content" style={pad}>
        <span className="json-toggle-spacer" aria-hidden="true" />
        <KeyLabel label={keyLabel} />
        <Primitive value={value} />
        <span className="json-punct">{trailingComma ? ',' : ''}</span>
      </span>
    </div>,
  ];
}

export default function JsonBlock({
  data,
  title,
  caption,
}: {
  data: Json;
  title?: string;
  /** Example-specific qualifier shown under the header (Example view only). */
  caption?: string;
}): React.JSX.Element {
  const pretty = useMemo(() => JSON.stringify(data, null, 2), [data]);
  const containers = useMemo(() => collectContainers(data), [data]);
  // Default: fully expanded (collapsed set empty).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  // Accessible vertical scroll region: when the height-capped .json-pre overflows, expose it as a
  // focusable, labelled region (WCAG 2.1.1). Mirrors SchemaTable's horizontal-scroll pattern.
  const preRef = useRef<HTMLDivElement>(null);
  const [vScroll, setVScroll] = useState(false);
  const hasContainers = containers.length > 0;
  // Global state (this component stores COLLAPSED paths, default fully expanded):
  const allExpanded = collapsed.size === 0;
  const allCollapsed = collapsed.size === containers.length;

  const toggle = (p: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const expandAll = (): void => setCollapsed(new Set());
  const collapseAll = (): void => setCollapsed(new Set(containers));
  // Track the copy-status timers so a rapid repeat copy doesn't get clobbered by a prior
  // copy's pending reset (1.5s on success, 4s on failure), and so nothing fires setState after
  // unmount. (UI audit — review.)
  const copyTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearCopyTimers = (): void => {
    copyTimersRef.current.forEach(clearTimeout);
    copyTimersRef.current = [];
  };
  useEffect(() => clearCopyTimers, []); // clear any pending timers on unmount
  // One dwell primitive for both outcomes. Clears any pending reset, blanks BOTH flags, then
  // raises the new one on the next tick so the live region sees a real empty->text change on a
  // repeat copy (re-assigning an identical string is not a change and is not announced).
  const flash = (set: (v: boolean) => void, ms: number): void => {
    clearCopyTimers();
    setCopied(false);
    setFailed(false);
    copyTimersRef.current.push(setTimeout(() => set(true), 0));
    copyTimersRef.current.push(setTimeout(() => set(false), ms));
  };
  const copy = (): void => {
    // A missing clipboard (non-secure context) used to leave the button inert with no feedback
    // of any kind, and a REJECTED write left the label at "Copy" and the live region empty.
    // Both are the same failure to the reader, so both get the same state. The failure dwell is
    // 4s, not the success 1.5s: its message asks the reader to do something instead.
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      flash(setFailed, 4000);
      return;
    }
    navigator.clipboard.writeText(pretty).then(
      () => flash(setCopied, 1500),
      () => flash(setFailed, 4000),
    );
  };
  // ONE string for the visible label and the accessible name, so the two cannot drift apart
  // mid-state. `copied` and `failed` are never both true: flash() blanks both before raising one.
  const copyLabel = copied ? 'Copied' : failed ? 'Failed' : 'Copy';

  const prevCollapsedRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const before = (): void =>
      flushSync(() =>
        setCollapsed((cur) => {
          if (prevCollapsedRef.current == null) prevCollapsedRef.current = cur;
          return new Set();
        }),
      );
    const after = (): void => {
      if (prevCollapsedRef.current) setCollapsed(prevCollapsedRef.current);
      prevCollapsedRef.current = null;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  // Re-measure vertical overflow on mount, viewport resize, and after every expand/collapse
  // (collapsing changes content height without resizing the element's box, so a ResizeObserver
  // alone won't catch it — hence the `collapsed` dependency).
  useEffect(() => {
    const el = preRef.current;
    if (!el) return undefined;
    const update = (): void => {
      const over = el.scrollHeight - el.clientHeight > 1;
      setVScroll((prev) => (prev === over ? prev : over));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [collapsed]);

  // The rendered lines, hoisted out of the JSX so their COUNT is available to the gutter gate
  // below. `renderValue` returns one element per visible line — a collapsed object contributes
  // one, not the lines it hides — which is exactly the number the reader is looking at.
  const rendered = renderValue(data, '', 0, null, false, collapsed, toggle);
  const lineCount = Array.isArray(rendered) ? rendered.length : 1;

  return (
    <div className="json-block">
      <div className="json-toolbar">
        {title ? <span className="json-title">{title}</span> : null}
        <span className="json-toolbar-spacer" />
        {hasContainers ? (
          <TreeControls
            className="json-bulk-controls"
            onExpandAll={expandAll}
            onCollapseAll={collapseAll}
            expandDisabled={allExpanded}
            collapseDisabled={allCollapsed}
          />
        ) : null}
        {/* A reference page renders 5-7 of these and every one was named just "Copy", while the
            .json-title beside each ("Request Payload", "Response — error (code 101)", …) was
            never wired to the button. `aria-label` folds the title in, keeping the 5-7 names
            distinct, and prefixes it with the SAME `copyLabel` the button renders — so the
            accessible name starts with the visible string in every state, not just the resting
            one. A fixed "Copy …" name broke WCAG 2.5.3 Label in Name for the 1.5s/4s the label
            reads "Copied"/"Failed": a voice-control user saying "click Copied" matched nothing.
            Same contract as CopyPageButton's trigger, whose name also tracks its label.
            Deliberately no `title` attribute (keyboard-inaccessible) and no width override: the
            label swap is absorbed by the 5rem (80px) reservation on
            `.json-copy:not(.schema-ctrl--icon)` in api.scss, re-derived for the 0.875rem control
            rung against "Copied" (~71.84px). "Failed" is expected to be narrower in this stack
            and so to fit the same reservation, but that is a PREDICTION — re-measure the button's
            width across the failure swap before trusting it. Only the name grew; the visible
            strings are unchanged, so the reservation is unaffected either way. */}
        <button
          type="button"
          className="schema-ctrl json-copy"
          aria-label={`${copyLabel} ${title ?? 'JSON'}`}
          onClick={copy}
        >
          {/* THE GLYPH — added 2026-09-10, owner: "there should be a copy icon on the left of the
              text Copy in the Copy button". It also carries the state: the label swaps to
              "Copied" / "Failed" for 1.5s, and a tick or a cross beside those words says which
              happened without the reader having to read them, which is the whole reason a
              transient label is worth a mark at all.
              `aria-hidden` comes from <Icon>: the button's accessible name already opens with
              `copyLabel`, so announcing the glyph would say the state twice. The width
              reservation the note above describes is unaffected — the icon is a fixed 14px in
              every state, so the swap still only has to absorb the label. */}
          <Icon
            name={copied ? 'Confirmed' : failed ? 'Failed' : 'Copy'}
            size={14}
            className="json-copy-icon"
          />
          {copyLabel}
        </button>
      </div>
      {/* Announce the copy result to screen readers. This region is the reliable channel: the
          visible label swap is not announced on its own, and the accessible-name swap above is
          re-read only by some screen readers, and only while the button still holds focus. Because
          it usually does, the spoken strings are deliberately NOT the name strings ("Copied to
          clipboard" vs the name's "Copied …") — an identical string would risk being heard twice.
          Same reasoning as CopyPageButton's STATUS_MESSAGES. The failure string also carries the
          fallback instruction the two-word label cannot. */}
      <span role="status" aria-live="polite" className="schema-visually-hidden">
        {copied
          ? 'Copied to clipboard'
          : failed
            ? 'Copy failed — select the JSON and copy it manually'
            : ''}
      </span>
      {caption ? <div className="json-caption">Example: {caption}</div> : null}
      {/* ── WHEN THE GUTTER EARNS ITS PLACE ──────────────────────────────────────────────
          Line numbers exist so a reader can REFER to a line — "line 12 is the one that
          fails", a colleague reading over a shoulder, a support thread quoting a payload.
          THREE IS THE THRESHOLD — owner instruction, 2026-09-10: "for any code block / JSON
          table across the entire docs there should be a numbering column if it has three or
          more rows". A one- or two-line block is a fragment nobody cites by line; from three
          the payload has a shape worth pointing at.
          (It was ten for a day, on the reasoning that a shorter block fits in one fixation.
          That is true and it is not the test the owner wants; the schema table numbers every
          row regardless, so a three-line JSON block that did not was the inconsistency.)
          `data-lines` drives the CSS; the counter itself is unconditional so the numbering is
          correct the moment the block crosses the line. */}
      <div
        className="json-pre"
        data-lines={lineCount >= 3 ? 'numbered' : 'bare'}
        ref={preRef}
        {...(vScroll
          ? { role: 'region', 'aria-label': `${title ?? 'JSON'} example, scroll to see more`, tabIndex: 0 }
          : {})}
      >
        {rendered}
      </div>
    </div>
  );
}
