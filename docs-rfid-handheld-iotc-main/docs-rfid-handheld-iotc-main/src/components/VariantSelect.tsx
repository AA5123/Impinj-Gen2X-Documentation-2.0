import React, {
  Children,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {useHistory, useLocation} from '@docusaurus/router';

/** URL-safe slug for a variant value or groupId (stable across reorders). */
const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
/** Query-param key for a group's variant selection, e.g. ?set-wifi-req=create-wpa2-personal */
const urlKey = (groupId: string): string => slugify(groupId);

/**
 * VariantSelect / Variant / VariantView — API reference intent switcher.
 *
 * Used by the MQTT command/event reference templates (see
 * `_templates/COMMAND_TEMPLATE.mdx` and `_templates/EVENT_TEMPLATE.mdx`).
 *
 * - `<VariantSelect>` switches between `<Variant>` panels. It ALWAYS renders as a
 *   custom-styled native `<select>` — ONE control shape for every variant selector on
 *   the site, whatever the option count or label length. (A ≤3-option / short-label set
 *   used to render as an inline segmented toggle instead; that dual mode was removed
 *   because it made otherwise-identical reference pages present the same choice two
 *   different ways.) Pass a `groupId` to sync it with a `<VariantView>` elsewhere on
 *   the page (e.g. the Response body follows the Request body's intent).
 * - `<VariantView>` is a display-only follower with no control of its own;
 *   give it the same `groupId` and matching `<Variant value="…">` ids.
 * - `<Variant>` is a labeled panel; `value` (or `label`) is its sync key.
 *
 * SSR-safe: the server render and first client render both use the first
 * variant (no hydration mismatch); an effect then restores the shared /
 * persisted choice and subscribes to future changes. This mirrors how
 * Docusaurus `<Tabs groupId>` keep tab choices in sync across a page.
 */

type VariantProps = {
  /** Sync key — must match between a VariantSelect and its VariantView. */
  value?: string;
  /** Human-readable dropdown label. */
  label?: string;
  children?: ReactNode;
};

type GroupState = {
  value: string | undefined;
  listeners: Set<(value: string) => void>;
};

// --- shared per-groupId store (module-level), mirrors Docusaurus <Tabs groupId> sync ---
const VARIANT_GROUPS = new Map<string, GroupState>();

function group(groupId: string): GroupState {
  let g = VARIANT_GROUPS.get(groupId);
  if (!g) {
    g = { value: undefined, listeners: new Set() };
    VARIANT_GROUPS.set(groupId, g);
  }
  return g;
}

function publish(groupId: string, value: string): void {
  const g = group(groupId);
  g.value = value;
  g.listeners.forEach((fn) => fn(value));
  try {
    localStorage.setItem(`variant-group:${groupId}`, value);
  } catch {
    /* SSR / no storage */
  }
}

function useVariantGroup(
  groupId: string | undefined,
  initial: string,
  valid: string[],
): [string, (value: string) => void] {
  const location = useLocation();
  const [value, setValue] = useState<string>(initial);
  useEffect(() => {
    if (!groupId) return undefined;
    const g = group(groupId);
    // Precedence: URL param > shared module store > localStorage > initial.
    // location.search is read once at mount (deps [groupId]) — never during
    // render — so the SSR/first-client render stays on `initial` (no hydration
    // mismatch) and a deep-link then reconciles both the control and follower.
    let restored: string | undefined;
    try {
      const urlVal = new URLSearchParams(location.search).get(urlKey(groupId));
      if (urlVal) restored = valid.find((v) => slugify(v) === urlVal);
    } catch {
      /* SSR / bad search */
    }
    if (restored === undefined) restored = g.value;
    if (restored === undefined) {
      try {
        restored = localStorage.getItem(`variant-group:${groupId}`) ?? undefined;
      } catch {
        /* No storage: SSR, a privacy mode that throws on access rather than
           returning null, or a full quota. `restored` simply stays undefined and
           the caller falls through to `initial`, which is the correct default —
           there is nothing to report and nothing to retry. */
      }
    }
    if (restored !== undefined && valid.includes(restored)) {
      setValue(restored);
      g.value = restored;
    }
    const fn = (v: string): void => {
      if (valid.includes(v)) setValue(v);
    };
    g.listeners.add(fn);
    return () => {
      g.listeners.delete(fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);
  return [value, setValue];
}

const variantsOf = (children: ReactNode): ReactElement<VariantProps>[] =>
  Children.toArray(children).filter(isValidElement) as ReactElement<VariantProps>[];

const valuesOf = (items: ReactElement<VariantProps>[]): string[] =>
  items.map((c, i) => String(c.props.value ?? c.props.label ?? i));

const pick = (
  items: ReactElement<VariantProps>[],
  values: string[],
  value: string,
): ReactElement<VariantProps> | null => {
  const i = values.indexOf(value);
  return items[i >= 0 ? i : 0] ?? null;
};

/**
 * A labeled variant panel. `value` (or `label`) identifies it for syncing;
 * put the per-variant Example/Schema `<Tabs>` inside it.
 */
export function Variant({ children }: VariantProps): React.JSX.Element {
  return <>{children}</>;
}

/**
 * The dropdown control — a custom-styled native `<select>`, always (there is no
 * segmented / radiogroup render mode: every selector on the site is the same shape).
 * Pass a `groupId` to sync it with a `<VariantView>` (or another `<VariantSelect>`)
 * elsewhere on the page.
 */
export function VariantSelect({
  children,
  label = 'Variant',
  groupId,
}: {
  children: ReactNode;
  label?: string;
  groupId?: string;
}): React.JSX.Element | null {
  const items = variantsOf(children);
  const values = valuesOf(items);
  const id = useId();
  const labelId = `${id}-label`;
  const history = useHistory();
  const [value, setValue] = useVariantGroup(groupId, values[0], values);
  const current = values.includes(value) ? value : values[0];
  const labels = items.map((child, i) => child.props.label ?? `Option ${i + 1}`);
  const onChange = (v: string): void => {
    setValue(v);
    if (groupId) {
      publish(groupId, v);
      // Shareable deep-link: reflect the choice in the URL (replace, not push,
      // so it doesn't spam browser history). Keyed per groupId, value slugified.
      try {
        const params = new URLSearchParams(history.location.search);
        params.set(urlKey(groupId), slugify(v));
        // Preserve any in-page #hash (deep-linked anchor) across the replace.
        history.replace({search: params.toString(), hash: history.location.hash});
      } catch {
        /* The URL is a convenience, not the source of truth — the selection has
           already been published to the group and to storage before this runs. So
           if the router is mid-transition or the search string is unparseable, the
           right behaviour is to leave the URL alone and keep the selection: the
           picker still works, only the deep link is not written. */
      }
    }
  };
  // Chromium 149 under `appearance: base-select`: pressing Space inside an OPEN
  // picker CLOSES it and COMMITS the focused option instead of extending the
  // type-ahead buffer. Every option label on this site is a multi-word phrase and
  // 9 of the 17 variant controls have options sharing a first word, so typing
  // "ethernet i" commits "Ethernet config info" — the wrong variant — and
  // onChange then writes it to the URL, to localStorage and to the follower.
  // Suppressing Space degrades type-ahead to first-word-only (arrows reach the
  // rest); it does not corrupt state. No-op on the classic path: computed
  // `appearance` is only ever 'base-select' where the enhancement applies, so
  // this also self-disables under forced-colors and on coarse-pointer devices.
  //   BOTH COUNTS RE-MEASURED 2026-09-09, and they moved for two different reasons.
  // 18 -> 17 was always wrong: there have only ever been 17 <VariantSelect> controls.
  // The 18th came from counting a <VariantView> follower, which renders no <select> at
  // all and so cannot have type-ahead. 10 -> 9 is a REAL change made that day:
  // hyphenating the WPA program names on get-wifi split its shared first word, so
  // `WPA2 Personal connection` / `WPA2 Enterprise connection` became
  // `WPA2-Personal connection` / `WPA2-Enterprise connection` and no longer collide.
  // Re-derive by grouping every <Variant label> by its first whitespace-delimited
  // token within each groupId and counting the groups that contain a duplicate.
  // Contradicts the Open UI explainer ("Spacebar enables type-ahead") — file
  // upstream and delete this guard when Chromium fixes it.
  const onKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>): void => {
    if (e.key !== ' ') return;
    const el = e.currentTarget;
    let enhanced = false;
    try {
      // `:open` throws SyntaxError in engines that don't know it — that IS the
      // classic path, so swallowing the throw is the correct behaviour.
      enhanced = el.matches(':open') && getComputedStyle(el).appearance === 'base-select';
    } catch {
      /* classic path */
    }
    if (enhanced) e.preventDefault();
  };
  if (items.length === 0) return null; // no <Variant> children → nothing to render

  // ONE control shape for every variant selector on the site: the native <select>.
  // `appearance:none` + a custom chevron restyle it (.variant-select__control in api.scss)
  // while keeping the native mobile picker, type-ahead, keyboard model, and screen-reader
  // semantics. A ≤3-option / short-label special case used to render an inline segmented
  // toggle instead — removed, because it made otherwise-identical reference pages present
  // the same choice two different ways.
  return (
    <div className="variant-select">
      <label id={labelId} className="variant-select__label" htmlFor={id}>
        {label}
      </label>
      {/* Width contract. The box is sized by an invisible copy of EVERY label — all of
          them stacked in one grid cell (.variant-select__sizer in api.scss) — so the
          control's width is one value for every selection, and that value is the widest
          label as RENDERED. (Widest-by-character-count is a different label on 2 of the
          17 selectors and clipped a trailing glyph on the classic path.) Under
          `appearance: base-select` a <select> sizes itself to the SELECTED option
          (Chrome: "The <select> stops taking the width of the longest <option>"), which
          would otherwise reflow the control by up to 160px on every variant change. */}
      <span className="variant-select__box">
        <span className="variant-select__sizer" aria-hidden="true">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </span>
        <select
          id={id}
          aria-labelledby={labelId}
          className="variant-select__control"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        >
          {items.map((child, i) => (
            <option key={i} value={values[i]}>
              {labels[i]}
            </option>
          ))}
        </select>
      </span>
      <div className="variant-select__panel">{pick(items, values, current)}</div>
    </div>
  );
}

/**
 * Display-only follower — NO dropdown. Use the SAME `groupId` and matching
 * `value`s as the controlling `<VariantSelect>`; it shows whichever variant
 * the dropdown currently selects.
 */
export function VariantView({
  children,
  groupId,
  caption,
}: {
  children: ReactNode;
  groupId?: string;
  caption?: string;
}): React.JSX.Element | null {
  const items = variantsOf(children);
  const values = valuesOf(items);
  const [value] = useVariantGroup(groupId, values[0], values);
  const current = values.includes(value) ? value : values[0];
  if (items.length === 0) return null; // no <Variant> children → nothing to render
  // No aria-live on the wrapper: wrapping the whole body made a variant switch re-announce
  // the entire table/JSON. The dropdown's own change is announced by the native <select>.
  return (
    <div className="variant-view">
      {caption ? <p className="variant-view__caption">{caption}</p> : null}
      {pick(items, values, current)}
    </div>
  );
}
