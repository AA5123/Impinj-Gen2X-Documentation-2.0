/**
 * THE DESKTOP SIDEBAR'S COLLAPSE STATE.
 *
 * SIMPLIFIED 2026-09-02: both dual-trigger buttons now live inside the sidebar itself
 * (src/theme/DocSidebar/Desktop/Content — Trigger A directly, Trigger B as of this change too),
 * so the cross-tree problem that used to justify lifting this state to `@theme/Root` is gone.
 * `@theme/Root`'s only job was making this context reachable from the Navbar, which no longer
 * consumes it at all; that swizzle is deleted with this change. The provider is mounted back
 * where it naturally belongs, by `@theme/DocRoot/Layout` — the one component that already knows,
 * synchronously and without a round trip, whether the current route has a sidebar at all.
 *
 * `hasSidebar` IS A CONSTRUCTOR ARGUMENT NOW, NOT STATE. `DocRoot/Layout` calls
 * `useDocsSidebar()` itself and passes the boolean straight in as a prop — no effect, no bottom-up
 * signal, no one-frame flash while an answer is in flight, because the answer was never anywhere
 * else. The only consumer is the keyboard shortcut's own guard, so it stays out of the public
 * `SidebarCollapseValue` shape entirely; nothing else needs to ask "is there a sidebar" any more,
 * because both triggers are physically inside one and the question answers itself.
 *
 * `triggerBRef` IS GONE FROM THIS FILE for the same reason. Trigger A and Trigger B are now
 * siblings in one component (`ContentWrapper` in DocSidebar/Desktop/Content), so the ref that
 * lets Trigger A focus Trigger B on collapse is a plain local `useRef` passed down as a prop —
 * no global context needed to share a DOM node between two components that were never in
 * different trees to begin with.
 *
 * WHY A CONTEXT AT ALL, THEN, RATHER THAN JUST PROPS THROUGHOUT. `DocRootLayoutSidebar` and
 * `DocRootLayoutMain` still need `hiddenSidebarContainer`/`setHiddenSidebarContainer` as plain
 * props — those are Docusaurus's own declared prop types, unrelated to this file — so the
 * context exists to get the flag from where it is (now: `DocRoot/Layout`, one level up from
 * where it is READ back out into those same props) to `DocSidebar/Desktop/Content`, several
 * layers further down inside `<DocSidebar>`, without threading it through every intermediate
 * component's own prop list.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

/* Both read by docusaurus.config.ts's `sidebarCollapsedPreHydrationPlugin` too — kept as
   literals in both places rather than a shared import because that plugin runs in the config
   loader (a separate Node process from this file's own bundle) and generates a STRING to be
   inlined into the page's `<head>`, not code that can `import` a runtime constant from here. */
const STORAGE_KEY = 'docs.sidebar.collapsed';
const COLLAPSED_ATTRIBUTE = 'data-sidebar-collapsed';

export interface SidebarCollapseValue {
  /** True when the desktop sidebar is in its 48px icon-only rail state. */
  collapsed: boolean;
  /** The raw setter, for call sites that already carry a `boolean | (prev) => boolean` update
   *  (kept so `DocRoot/Layout` can hand it straight to `DocRootLayoutSidebar`/`Main` exactly as
   *  it always has — those props are Docusaurus's own declared types, not this file's). */
  setCollapsed: Dispatch<SetStateAction<boolean>>;
  /** Flip it. What every trigger click actually calls. */
  toggle: () => void;
  /** `'⌘B'` on macOS, `'Ctrl+B'` everywhere else — for the two triggers' own tooltips, computed
   *  once here rather than twice so both agree and neither re-implements the platform sniff. */
  shortcutLabel: string;
}

const Ctx = createContext<SidebarCollapseValue | null>(null);

export function SidebarCollapseProvider({
  hasSidebar,
  children,
}: {
  /** Whether the current route has a docs sidebar at all — gates the keyboard shortcut only;
   *  both triggers live inside the sidebar itself now, so they never render without one. */
  hasSidebar: boolean;
  children: ReactNode;
}): ReactNode {
  /* STARTS `false`, ALWAYS — matching what the server rendered, with no `localStorage` read in
     the initializer. A lazy `useState(() => localStorage.getItem(...) === 'true')` looks like
     the obvious move and is the wrong one: that initializer runs on the CLIENT'S first render
     too (not only on mount), so a returning reader who had collapsed the sidebar would hydrate
     to markup that disagrees with what the server sent — a real hydration mismatch, not a
     cosmetic one, on the exact attribute this state drives. Reading the persisted value is the
     layout effect below's job instead, which runs strictly after the DOM the server sent has
     already been committed once. */
  const [collapsed, setCollapsed] = useState(false);

  /* `'Ctrl+B'` first for the same reason: `navigator.platform` does not exist during SSR, so the
     tooltip text has to start at the value the server could plausibly have produced and correct
     itself once the browser is there to ask. */
  const [shortcutLabel, setShortcutLabel] = useState('Ctrl+B');

  /* CORRECTS `collapsed` FROM STORAGE BEFORE THE BROWSER'S NEXT PAINT, not merely "soon after
     mount" — `useLayoutEffect`, not `useEffect`. The sidebar's own WIDTH is already right on the
     very first paint regardless of this effect: docusaurus.config.ts's pre-hydration script set
     `[data-sidebar-collapsed]` on `<html>` before React ever ran, and sidebar.scss keys the
     width off that attribute directly (see its own note on why that CAN'T wait for React state).
     What THIS effect corrects is everything downstream of REACT's own state — the icon-only
     content treatment (labels clipped to tooltips, tier-2 lists hidden, …), which has no
     CSS-only equivalent and genuinely does need `collapsed` to already read `true` once
     anything paints. `useLayoutEffect` is what keeps that correction inside the same commit
     React is already flushing on mount rather than a frame behind it.
       Platform detection rides along in the same effect, for the same "browser-only" reason,
     not because it is logically related to storage. */
  useLayoutEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'true') {
        setCollapsed(true);
      }
    } catch {
      // Storage disabled or throwing (Safari private mode, locked-down browsers): the
      // sidebar simply stays at its default, expanded state.
    }
    setShortcutLabel(/Mac|iPod|iPhone|iPad/.test(window.navigator.platform) ? '⌘B' : 'Ctrl+B');
  }, []);

  /* KEEPS STORAGE AND THE PRE-HYDRATION ATTRIBUTE IN LOCKSTEP WITH REACT'S OWN STATE, on every
     change — the same dual-write `data-theme` already does for colour mode, not a new pattern.
     This also re-affirms the attribute right after the layout effect above corrects `collapsed`
     from storage, which is a harmless, idempotent re-write of the SAME value the pre-hydration
     script already set — not a second source of truth, just the one place `collapsed` ever
     changes remembering to say so. */
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // ignore — see the layout effect above for why this can throw at all.
    }
    document.documentElement.setAttribute(COLLAPSED_ATTRIBUTE, String(collapsed));
  }, [collapsed]);

  /* Ctrl+B / Cmd+B toggles the sidebar from anywhere — REPLACES Ctrl+[ / Cmd+[ (this file's own
     prior binding, same day), per the brief's explicit choice of key. Kept as ONE binding rather
     than both: VS Code, GitHub.dev and most editor-shaped web apps already use exactly this
     combination for "toggle sidebar", so it is the more discoverable of the two rather than an
     arbitrary pick, and a control with two unrelated shortcuts for one action is a second thing
     to document for no reader benefit. Still accepts EITHER modifier key regardless of platform
     (`event.metaKey || event.ctrlKey`), matching the binding this replaces — simpler than gating
     Cmd strictly to macOS and Ctrl strictly to everything else, and no real reader is hurt by a
     Mac accepting Ctrl+B too. Guarded against firing while the reader is typing — a text input,
     a `<select>`, or the search modal's own field — so `b` still types a literal letter there;
     DocSearch owns Ctrl/Cmd+K and this never touches that combination. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'b') {
        return;
      }
      if (!hasSidebar) {
        return;
      }
      const {activeElement} = document;
      if (
        activeElement instanceof HTMLElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setCollapsed((value) => !value);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasSidebar]);

  const value = useMemo<SidebarCollapseValue>(
    () => ({
      collapsed,
      setCollapsed,
      toggle: () => setCollapsed((v) => !v),
      shortcutLabel,
    }),
    [collapsed, shortcutLabel],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `null` when there is no docs sidebar on this page (DocRoot/Layout, the only mount point,
 *  provides it unconditionally, but both dual-trigger consumers still guard defensively). */
export function useSidebarCollapse(): SidebarCollapseValue | null {
  return useContext(Ctx);
}
