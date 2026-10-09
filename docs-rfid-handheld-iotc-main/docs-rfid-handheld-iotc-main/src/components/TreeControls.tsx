import React, { useEffect, useRef, useState } from 'react';

/**
 * TreeControls — the shared "Expand all" / "Collapse all" bulk-control pair used by
 * both <SchemaTable> (Schema tab) and <JsonBlock> (Example tab), rendered as two
 * compact icon buttons inside a labelled group.
 *
 * Design rationale (see the UX analysis behind this): a collapsible tree's GLOBAL
 * state is tri-state — fully expanded / fully collapsed / mixed — over 2^N per-node
 * combinations, NOT a binary. So these stay two distinct, stable-labelled commands
 * rather than one relabeling toggle: both actions remain reachable in one click from
 * any state, keep fixed positions (muscle memory), and keep stable accessible names.
 *
 * State-aware: each button is `aria-disabled` (and inert) exactly when its action
 * would be a no-op — Expand all when everything is already expanded, Collapse all
 * when everything is collapsed. The enabled/disabled pair therefore SIGNALS the
 * current global state (both active = mixed; one dimmed = at that extreme), which is
 * the real benefit a single toggle promised — without hiding an action. `aria-disabled`
 * (not the native `disabled` attribute) keeps the icon button focusable so it retains
 * its tooltip and screen-reader name while dimmed.
 *
 * Both actions are also ANNOUNCED. Folding is instant, and it was silent: a sighted reader
 * watches a block collapse from 26 rendered lines to 1 (74 to 1 on the largest block of
 * /api-reference/mqtt/ctrl/set-operating-mode/), while a screen-reader user got nothing at all — the
 * focus ring stays put and neither button's accessible name changes. The visually-hidden
 * `role="status"` region below closes that gap. (UI audit 2026-08, item 6 finding 3.)
 */

function ExpandAllIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* chevrons pointing away from the centre — "unfold" */}
      <polyline points="8 9 12 5 16 9" />
      <polyline points="8 15 12 19 16 15" />
    </svg>
  );
}

function CollapseAllIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* chevrons pointing toward the centre — "fold" */}
      <polyline points="8 5 12 9 16 5" />
      <polyline points="8 19 12 15 16 19" />
    </svg>
  );
}

export default function TreeControls({
  className,
  onExpandAll,
  onCollapseAll,
  expandDisabled,
  collapseDisabled,
}: {
  /** Wrapper class — the group's layout (e.g. `schema-controls` or `json-bulk-controls`). */
  className?: string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** Expand-all is a no-op (everything already expanded). */
  expandDisabled: boolean;
  /** Collapse-all is a no-op (everything already collapsed). */
  collapseDisabled: boolean;
}): React.JSX.Element {
  // Status text for the live region. Blanked and then re-set on the NEXT TICK rather than
  // assigned directly, so that activating the same button twice in a row re-announces:
  // writing an identical string back into a live region is not a change and is not spoken.
  // (Same trick as JsonBlock's copy status.) The timer is cleared on unmount so nothing
  // calls setState after the component is gone.
  const [status, setStatus] = useState('');
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = (text: string): void => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus('');
    statusTimerRef.current = setTimeout(() => setStatus(text), 0);
  };
  useEffect(
    () => () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    },
    [],
  );

  return (
    <div className={className} role="group" aria-label="Expand or collapse all">
      {/* FIRST child, deliberately. api.scss right-aligns the Schema panel's corner tooltip via
          `.schema-header > .schema-controls:last-child > .schema-ctrl--icon:last-child::after`,
          so APPENDING anything to this group would stop Collapse all matching and let its
          tooltip overhang the panel border by the measured 13px.
          Placement is free: .schema-visually-hidden makes this absolutely positioned —
          out of flow, so it adds neither a flex item nor a gap — and a live region is
          announced on mutation regardless of where it sits in the DOM. */}
      <span role="status" aria-live="polite" className="schema-visually-hidden">
        {status}
      </span>
      <button
        type="button"
        className="schema-ctrl schema-ctrl--icon"
        aria-label="Expand all"
        data-tooltip="Expand all"
        aria-disabled={expandDisabled || undefined}
        onClick={() => {
          // Announce INSIDE the guard: a click on the dimmed button changes nothing, so it
          // must stay silent rather than claim an expansion that did not happen.
          if (!expandDisabled) {
            onExpandAll();
            announce('All expanded');
          }
        }}
      >
        <ExpandAllIcon />
      </button>
      <button
        type="button"
        className="schema-ctrl schema-ctrl--icon"
        aria-label="Collapse all"
        data-tooltip="Collapse all"
        aria-disabled={collapseDisabled || undefined}
        onClick={() => {
          if (!collapseDisabled) {
            onCollapseAll();
            announce('All collapsed');
          }
        }}
      >
        <CollapseAllIcon />
      </button>
    </div>
  );
}
