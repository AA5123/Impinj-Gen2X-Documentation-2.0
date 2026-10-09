/**
 * Swizzled @theme/DocRoot/Layout/Sidebar (full eject of
 * `@docusaurus/theme-classic/src/theme/DocRoot/Layout/Sidebar/index.tsx`, v3.10.2).
 *
 * ONE behavioural change: `hiddenSidebar` is now DERIVED from `hiddenSidebarContainer` by an effect,
 * instead of being set by hand inside `toggleSidebar`. Markup, class list, props, the
 * `ResetOnSidebarChange` wrapper and the export shape are otherwise byte-identical, including
 * upstream's Prettier settings (`bracketSpacing: false`, `bracketSameLine: true`).
 *
 * ── WHY, and it is not a tidy-up ─────────────────────────────────────────────────────────────
 *
 * The sidebar now COLLAPSES TO ICONS at 48px instead of hiding, and that is only possible because
 * this file controls what upstream hands to DocSidebar. Three changes, all here:
 *
 *   1. `isHidden={false}`, always. Upstream passes `hiddenSidebar`, whose only effect is
 *      `.sidebarHidden { opacity: 0; visibility: hidden }` in DocSidebar/Desktop's CSS module —
 *      i.e. the reason a collapsed sidebar used to be an empty strip. Passing false keeps the menu
 *      painted, and keeps its links in the tab order.
 *   2. A stable `sidebar--icons-only` class, so src/css/sidebar.scss can style the collapsed state.
 *      The theme's own class is a CSS module and renders hashed, so it is not selectable from there.
 *   3. `Sidebar/ExpandButton` is no longer rendered. It is absolutely positioned across the whole
 *      collapsed strip, so at 48px it would cover the icon column.
 *
 * ── AND THE TWO-BOOLEAN PROBLEM IS GONE, NOT WORKED AROUND ───────────────────────────────────
 *
 * Upstream runs two flags for one visual state:
 *
 *   hiddenSidebarContainer   owned by DocRoot/Layout. The <aside> width, and the main column's.
 *   hiddenSidebar            owned here. Fed to `isHidden`, and mounts the rail.
 *
 * It keeps them in step inside `toggleSidebar`, which is sound while that callback is the only
 * mutator — true on a stock site, false the moment a second control exists. The 2026-08-23 brief
 * moved the trigger to the breadcrumbs, in the OTHER branch of DocRoot/Layout, which can reach
 * `setHiddenSidebarContainer` (published through src/components/SidebarCollapse) but not
 * `setHiddenSidebar`. Flipping only the container LOOKED right collapsing, because the
 * `onTransitionEnd` handler caught the second flag up, and then re-opened the sidebar EMPTY.
 *
 * An earlier revision of this file fixed that by deriving `hiddenSidebar` from the container with
 * an effect. With `isHidden` pinned to false and the rail unrendered, that flag has NO CONSUMERS
 * LEFT, so the state, the effect and the `onTransitionEnd` handler are all deleted instead.
 * `hiddenSidebarContainer` is now the single source of truth, full stop.
 *
 * TWO PIECES OF UPSTREAM LOGIC GO WITH IT, and neither is a loss:
 *   - the `onTransitionEnd` handshake existed to hide the contents at the END of the slide. There
 *     is nothing to hide any more; the labels go at the start of it, by design.
 *   - the `prefersReducedMotion()` branch existed because no `transitionend` fires when the
 *     animation is off (facebook/docusaurus#8918), leaving `hiddenSidebar` stuck false. With the
 *     flag gone the bug it guarded cannot occur.
 *
 * DO NOT REINTRODUCE `hiddenSidebar`. If a future change needs `isHidden` to be true again, it also
 * needs to explain what a collapsed sidebar is FOR, because at that point it shows nothing.
 *
 * Re-diff against node_modules on each Docusaurus minor.
 */
import React, {type ReactNode, useCallback} from 'react';
import clsx from 'clsx';
import {ThemeClassNames} from '@docusaurus/theme-common';
import {useDocsSidebar} from '@docusaurus/plugin-content-docs/client';
import {useLocation} from '@docusaurus/router';
import DocSidebar from '@theme/DocSidebar';
import type {Props} from '@theme/DocRoot/Layout/Sidebar';

import styles from '@docusaurus/theme-classic/lib/theme/DocRoot/Layout/Sidebar/styles.module.css';

// Reset sidebar state when sidebar changes
// Use React key to unmount/remount the children
// See https://github.com/facebook/docusaurus/issues/3414
function ResetOnSidebarChange({children}: {children: ReactNode}) {
  const sidebar = useDocsSidebar();
  return (
    <React.Fragment key={sidebar?.name ?? 'noSidebar'}>
      {children}
    </React.Fragment>
  );
}

export default function DocRootLayoutSidebar({
  sidebar,
  hiddenSidebarContainer,
  setHiddenSidebarContainer,
}: Props): ReactNode {
  const {pathname} = useLocation();

  const toggleSidebar = useCallback(() => {
    setHiddenSidebarContainer((value) => !value);
  }, [setHiddenSidebarContainer]);

  return (
    <aside
      // Both dual-trigger buttons (src/theme/DocSidebar/Desktop/Content,
      // src/components/SidebarNavToggle) carry `aria-controls="docs-sidebar"`, added 2026-09-02.
      // Docusaurus gives this element no id of its own — this is the first thing in the sidebar
      // machinery that ever needed one.
      id="docs-sidebar"
      className={clsx(
        ThemeClassNames.docs.docSidebarContainer,
        styles.docSidebarContainer,
        hiddenSidebarContainer && styles.docSidebarContainerHidden,
        // OUR stable hook for the icon-collapsed state. The theme's own class is a CSS module,
        // so it renders hashed (`docSidebarContainerHidden_YfHR`) and a plain selector in
        // src/css/ matches NOTHING, silently — the trap that made the first attempt at the
        // retired chip's geometry a no-op. This one is unhashed and is what sidebar.scss targets.
        //
        // KEYED ON hiddenSidebarContainer, WHICH FLIPS IMMEDIATELY. The obvious alternative was
        // the old `hiddenSidebar`, which was only set at `transitionend` — and that would put the
        // layout change 150ms AFTER the width starts moving, so the labels would still be painted
        // at full size inside a box animating down to 48px, then snap. Flipping both at once means
        // the labels go, the icons centre, and the width animates, all from the same tick.
        hiddenSidebarContainer && 'sidebar--icons-only',
      )}>
      <ResetOnSidebarChange>
        <div className={styles.sidebarViewport}>
          <DocSidebar
            sidebar={sidebar}
            path={pathname}
            onCollapse={toggleSidebar}
            // ALWAYS FALSE, and this is the change that makes icon-collapse possible at all.
            //
            // `isHidden` has exactly one consumer: `.sidebarHidden { opacity: 0;
            // visibility: hidden }` in DocSidebar/Desktop's CSS module. Verified against
            // node_modules — Desktop applies it as `clsx(styles.sidebar, isHidden &&
            // styles.sidebarHidden)` and reads the prop nowhere else. Passing `true` is what
            // made a collapsed sidebar an empty 30px rail; passing `false` keeps the menu
            // painted so the icons survive the collapse, and sidebar.scss does the rest.
            //
            // It also keeps the icon links in the TAB ORDER, which `visibility: hidden` removed.
            // That is correct here rather than incidental: after this change the collapsed
            // sidebar is still a working navigation, so it should still be reachable.
            isHidden={false}
          />
          {/*
            THE COLLAPSED RAIL IS GONE. `Sidebar/ExpandButton` used to mount here whenever the
            sidebar was hidden, as the only way back — the collapse control being INSIDE the
            region it hid. Two things retire it:
              1. The trigger now lives in the breadcrumbs and toggles both ways, so nothing
                 depends on the rail to re-expand.
              2. It is absolutely positioned over the full height of the collapsed strip, so at
                 48px it would sit ON TOP of the icon column it is meant to reveal.
            The component and its 486 lines of CSS are left in the tree, unrendered, rather than
            deleted — same treatment as CollapseButton, and for the same reason: the measured
            contrast figures in its header are the work that would be redone if it returns.
          */}
        </div>
      </ResetOnSidebarChange>
    </aside>
  );
}
