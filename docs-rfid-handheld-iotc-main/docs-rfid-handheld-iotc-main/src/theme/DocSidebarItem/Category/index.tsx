/**
 * Swizzled @theme/DocSidebarItem/Category (full eject of
 * `@docusaurus/theme-classic/src/theme/DocSidebarItem/Category/index.tsx`, v3.10.2).
 *
 * FOUR behavioural additions from upstream, all scoped to click and route changes — this
 * component has no hover behaviour of any kind. Everything else — the two local components, the
 * class lists, the `Collapsible`, the translation ids — is byte-identical to upstream, including
 * upstream's Prettier settings (`bracketSpacing: false`, `bracketSameLine: true`), which differ
 * from this repo's `.prettierrc.json`. Kept so the file diffs cleanly against node_modules on
 * upgrade. `useAutoExpandActiveCategory`, `useCategoryHrefWithSSRFallback` and
 * `handleItemClick`'s branching are ALSO upstream, but are reproduced below rather than quoted,
 * because additions 1 and 4 hook into them directly.
 *
 * ── ADDITION 1: A CLICKED CATEGORY CASCADES ITS AUTO-EXPANSION, BY BRANCHING FACTOR ─────────
 *
 * REPLACES the single earlier rule ("a sole child tunnels open with its parent, unbounded
 * depth") with three rules, keyed on how many items a just-expanded category has. Nothing here
 * runs on collapse — see "Manual Collapse Priority" below — and nothing here runs on the
 * upstream active-route auto-expand (`useAutoExpandActiveCategory`, untouched): the brief scopes
 * this to "when a user clicks," and a route change revealing one ancestor chain is not that.
 *
 *   1 child      — TUNNEL. Expand the child, and if IT ALSO has exactly one child, expand that
 *                  one too, and so on, for up to MAX_TUNNEL_DEPTH (5) levels counted from the
 *                  clicked category (not from the sidebar root). The walk stops the moment a
 *                  node in the chain does not have exactly one child, OR the depth budget is
 *                  spent — that stopping node is still visible (its parent is now open) but is
 *                  NOT itself auto-expanded, exactly as before. Worked example, unchanged: X has
 *                  one child A, A has one child Z — clicking X expands X and A, revealing Z. If
 *                  A had two children B/C instead, clicking X still expands X, but A does not
 *                  auto-expand — B and C stay hidden until A is clicked on its own.
 *   2 or 3       — SHALLOW BRANCH. Expand the clicked category's direct children too (one level
 *   children       further than a plain click would), revealing grandchildren. Their OWN
 *                  children — regardless of how many — are never auto-expanded; the rule does
 *                  not recurse past this one level, and does NOT chain into rule 1 even if one
 *                  of the 2 or 3 has exactly one child of its own.
 *   4+ children  — Nothing beyond the plain click: the category itself opens, its children do
 *                  not.
 *
 * IMPLEMENTATION. Docusaurus's own accordion (`autoCollapseCategories: true`,
 * docusaurus.config.ts, an explicit and unrelated owner decision — "one section open at a time")
 * scopes ONE sibling list to at most one expanded member at a time, via
 * `useDocSidebarItemsExpandedState` and the `expandedItem` effect below. Rule 2's whole point is
 * MULTIPLE siblings open at once, which that accordion would otherwise fight: opening the second
 * of 2-3 children the ordinary way (`updateCollapsed`, which calls `setExpandedItem`) would
 * immediately re-collapse the first, since each sibling's own accordion effect sees "some other
 * index is now the expanded one" and closes itself. So a cascade-driven open calls the RAW
 * `setCollapsed` returned by `useCollapsible` directly — never `updateCollapsed` — which changes
 * a category's own collapsed state without touching `expandedItem` at all. The accordion is
 * therefore never even aware a cascade happened, and continues to work exactly as before for
 * every genuine, independent click a reader makes.
 *
 * That raw setter has to be reachable from an ANCESTOR's click handler, though, which is a
 * different component instance possibly several levels up — plain props can't do that once a
 * category has already mounted. Two module-level, WeakMap/WeakSet-keyed registries (item
 * identity is stable — the sidebar plugin generates this tree once and never recreates item
 * objects) cover the two cases:
 *   `liveCollapsedSetters`  — every MOUNTED category's raw `setCollapsed`, registered on mount
 *                             and removed on unmount. A cascade target that is already on screen
 *                             (the reader expanded it before, then collapsed it, then reopened
 *                             its ancestor) is forced open through this directly.
 *   `cascadeExpandOnMount`  — a plain marker for a target that has never mounted yet. `Collapsible
 *                             lazy` mounts a category's children exactly once, the first time its
 *                             parent expands, and never again — so a target with no live setter
 *                             is about to mount for the first time, and is instead marked here for
 *                             its OWN `useCollapsible`'s lazy initialiser to read, the same
 *                             one-shot side-channel technique the old sole-child rule used.
 * Every cascade write picks whichever of the two applies per target, so an already-mounted and a
 * not-yet-mounted target in the very same click are both handled correctly.
 *
 * BATCHING. All of the above — the clicked category's own `updateCollapsed`/`setCollapsed` call
 * and every cascade target's raw `setCollapsed` call — happen synchronously inside the same
 * click handler. React 18's automatic batching folds them into one commit, so a five-level
 * tunnel opens in a single paint rather than five sequential layout jumps.
 *
 * ── MANUAL COLLAPSE PRIORITY ─────────────────────────────────────────────────────────────────
 *
 * `handleItemClick` below reads `collapsed` (the PRE-click value) before calling
 * `updateCollapsed`/`setCollapsed`, and only runs the cascade when that read shows the click is
 * an EXPANSION. A click that collapses a category — whichever of the three branches it takes —
 * never reaches `applyExpansionCascade`, so collapsing is exactly what upstream already does:
 * immediate, with no auto-expansion side effect of any kind.
 *
 * ── ADDITION 2: NONE OF THIS RUNS ON HOVER ──────────────────────────────────────────────────
 *
 * A pointer resting on a closed category used to expand it after 200ms and collapse it again on
 * leaving (src/components/hoverIntent.ts, still used by the unrelated "Copy page" menu — that
 * caller is untouched). Removed here in full: the ref, the hook call, the pointer handlers on
 * the `<li>`, and the isActive effect that disowned a pending hover claim. The sidebar expands
 * and collapses on click alone.
 *
 * ── ADDITION 3: A COLLAPSED CATEGORY FORGETS WHAT WAS OPEN UNDERNEATH IT ────────────────────
 *
 * FIRST, WHAT THIS IS NOT: there is no `localStorage`, `sessionStorage`, URL query state, or
 * Redux/Zustand-style store anywhere in this codebase that remembers sidebar expansion — audited
 * across `src/` and confirmed nothing on that list exists for it. The state this addition erases
 * is plainer and easier to miss: ordinary React `useState`, sitting in category components that
 * `<Collapsible lazy>` (theme-common) never unmounts once they have expanded once. Collapsing a
 * category only ANIMATES it to zero height; every descendant category underneath it stays
 * mounted, and each one's own `collapsed` boolean — whatever the reader last clicked it to,
 * including the auto-expansion cascade's OWN prior decisions — sits there unchanged, waiting to
 * reappear exactly as it was the next time an ancestor opens back up. Two clicks put a reader
 * back at a "fresh" node that silently is not fresh: it remembers.
 *
 * FIXED BY REMOUNTING THE SUBTREE, not by adding a second store to distrust. `key={generation}`
 * on this category's own `<DocSidebarItems>` forces React to throw away every descendant
 * component instance — and with it, every descendant's `collapsed` `useState` — the moment
 * `generation` changes, which happens exactly once, in `onCollapseTransitionEnd`, the instant
 * THIS category finishes animating closed (whether the reader collapsed it directly or an
 * ancestor's re-click did, and whether an accordion sibling-switch caused it — collapsing is
 * collapsing, regardless of cause). The NEXT expansion mounts a brand-new subtree from scratch,
 * so every descendant's `initialState` re-runs cold: `isActive` for whichever page is current,
 * this file's own cascade marks for whatever ADDITION 1 just decided on this fresh click, and
 * `item.collapsed` for everything else. Nothing carries over, because nothing OLD still exists
 * to carry over from.
 *
 * WHY `onCollapseTransitionEnd` AND NOT THE `collapsed` PROP DIRECTLY: `useCollapseAnimation`
 * (theme-common's `Collapsible`) reads the CURRENT children's `scrollHeight` to animate the
 * collapse, so remounting them at the same instant `collapsed` flips true would tear down the
 * content the animation is still measuring, mid-transition. The callback fires once the browser's
 * own `transitionend` for `height` has already landed — content is fully at zero height and fully
 * hidden by then, so discarding it is invisible, and reduced-motion is still covered:
 * `getAutoHeightDuration` returns 1ms rather than 0 specifically so this event keeps firing.
 * Nothing here needs to run on EXPAND: an already-fresh subtree has nothing to forget.
 *
 * ACTIVE-ROUTE ANCESTORS ARE UNAFFECTED, on purpose and without new code: this is the same
 * `isActive` branch `initialState` already had, so a category on the path to the current page
 * still mounts expanded on the very first render of its fresh subtree — the remount changes
 * WHICH state a category starts from, never the rule that decides it.
 *
 * ── ADDITION 4: IN THE COLLAPSED ICON RAIL, A PARENT ROW IS A LINK AND NOTHING ELSE ─────────
 *
 * Reported as "clicking a parent item's icon across any collapsed sidebar must navigate to its
 * linked page only — do not trigger expand/collapse of the parent item". Measured against the
 * built site with the rail asserted engaged (aside width === 48), THREE of the four row shapes
 * were doing neither: they navigated nowhere and they changed nothing a reader could see —
 * 0 differing pixels out of 1,296,000 across the whole viewport, no URL change, no scroll.
 *
 *   href + NOT current page   navigates, and also expands (upstream's own branch)
 *   href + IS current page    e.preventDefault(); toggles a disclosure the rail hides  → DEAD
 *   no href (every category    e.preventDefault(); toggles a disclosure the rail hides  → DEAD
 *     in sidebars/api-reference.ts, which cannot carry a `link` across docs instances)
 *   plain leaf link           navigates                                                → fine
 *
 * The two dead shapes were not inert, which is what made this worth more than a shrug: each
 * click silently flipped `menu__list-item--collapsed`, and the flip only became visible later.
 * Worst case measured: a reader standing on /guides/get-oriented/ who clicks that section's own
 * rail icon COLLAPSES the section they are standing in — the tree they get back on Ctrl+B is
 * missing 112px / 3 rows of exactly the branch they were reading, and one of the two no-href
 * icons on /api-reference/ needed two further clicks to repair.
 *
 * TWO CHANGES, AND THE SECOND IS NOT A NEW BEHAVIOUR SO MUCH AS UPSTREAM'S OWN, EXTENDED:
 *
 *   1. `handleItemClick` returns early while the rail is collapsed, skipping the entire
 *      `if (collapsible)` branch. The row's `<a>` then does what an `<a>` does.
 *   2. `useCategoryHrefWithSSRFallback` keeps resolving the first child's link while the rail is
 *      collapsed, instead of dropping it the moment `useIsBrowser()` flips true. That hook
 *      exists because a category with no `link` still has to be reachable when JS has not loaded
 *      (upstream's own comment, facebook/docusaurus#3030) — and the collapsed rail is the same
 *      situation for the same reason: the disclosure is not on screen, so the first child IS the
 *      destination. `findFirstSidebarItemLink` resolves to /api-reference/rest/ and
 *      /api-reference/mqtt/ for the two rows in question, which is precisely where a reader
 *      clicking a Globe or a RadioTower in the rail expects to land.
 *        NOTHING IS TAKEN AWAY FROM SSR: the `isBrowser` arm is untouched, so the no-JS anchors
 *      in the built HTML are byte-identical. The condition only ADDS a case in which the
 *      fallback survives hydration.
 *        AND IT IS HYDRATION-SAFE: `SidebarCollapseProvider.collapsed` starts `false` on the
 *      server AND on the client's first render by design (see that file), so both renders emit
 *      the same `href`; the real value arrives in a layout effect, after hydration has matched.
 *
 *   3. `role="button"` and `aria-expanded` are gated on the rail flag TOO, and the first pass at
 *      this addition got that wrong. It left them alone on the grounds that SSR already ships
 *      `role="button"` alongside a resolved fallback href for these same rows, so matching that
 *      state was reproducing upstream rather than inventing something. That equivalence does not
 *      hold, and an accessibility-tree audit is what showed it: SSR's version of this pair lasts
 *      ONE PAINT and describes a disclosure that genuinely cannot be operated yet, whereas the
 *      rail is a persisted state a reader CHOSE and can sit in indefinitely — and after change 1
 *      above, activating the row navigates instead of touching the state it advertises. Read out
 *      of a CDP `Accessibility.getFullAXTree` dump, the rail rows exposed `role=button name="REST
 *      API" expanded=false`, and pressing Enter on that "collapsed button" changed the page. That
 *      is a WCAG 4.1.2 name/role/value mismatch on the nose, it kept both rows out of a screen
 *      reader's links list, and it contradicted this addition's own heading. Worse case measured:
 *      expand the category in the panel, then Ctrl+B, and the rail row announces
 *      `expanded=true` while exposing zero children.
 *        Both are `undefined` in the rail now, so the row is exactly what the heading says — a
 *      link. SSR is untouched for the third time: `railCollapsed` is `false` on the server, so
 *      the no-JS markup keeps the pair it has always had.
 *
 *   4. THERE IS A SECOND WRITER, AND SUPPRESSING ONLY THE CLICK DID NOT CLOSE THE REPORT.
 *      `useAutoExpandActiveCategory` opens a category the moment it becomes ACTIVE, with no click
 *      involved — so a rail click that merely navigates still ended up expanding the destination
 *      one effect later. Reported back as "click Diagnose and Recover in the collapsed rail, then
 *      expand the sidebar: the arrow points down although no child items are shown", and
 *      confirmed exactly, on /guides/:
 *
 *        before the rail click   --collapsed present, caret transform none, ul not yet mounted
 *        after the rail click    --collapsed GONE, aria-expanded true, ul inline height 0px,
 *                                scrollHeight 0, display none
 *        after Ctrl+B            caret transform rotate(90deg) — pointing DOWN — while the ul
 *                                still measures 0px against a scrollHeight of 188px
 *        fresh expanded load     ul inline height auto, 188px, li 228px tall  (the correct shape)
 *
 *      The mechanism is why the numbers look contradictory: theme-common's `Collapsible` animates
 *      by reading `scrollHeight`, and sidebar.scss holds tier-2 lists at `display: none
 *      !important` in the rail — so it measures 0, writes `height: 0px` inline, and never receives
 *      the `transitionend` that would restore `height: auto`. The category is left ASSERTING that
 *      it is open, caret and `aria-expanded` and all, over a list pinned shut.
 *        So the guard is on the effect too. ONE INVARIANT, TWO WRITERS: nothing may change a
 *      category's disclosure state while the rail is collapsed, because the rail cannot show that
 *      state and the animation cannot measure it.
 *
 * WHAT THAT COSTS, STATED PLAINLY: after navigating via a rail icon, the destination section is
 * CLOSED when the reader next opens the panel, where a fresh load of the same page would have it
 * open (`initialState`'s own `isActive` branch, untouched, still opens the active category on
 * mount — so only client-side navigation while railed is affected). One click opens it, and the
 * caret now tells the truth about which state it is in, which the stranded version did not.
 *   THE ALTERNATIVE WAS TRIED AND REJECTED: re-running the auto-expand when the rail OPENS cannot
 * be done from an effect in this component. Those CSS rules key on `[data-sidebar-collapsed]` as
 * well as on the class, that attribute is written by `SidebarCollapseProvider`'s own effect, and
 * React flushes effects children-first — so at the instant this component could react, the
 * attribute still reads "true", the list is still `display: none`, and the measurement strands
 * itself all over again. That fix belongs with the provider, and it is not what was asked for.
 */
import React, {useEffect, useMemo, useState, type ReactNode} from 'react';
import clsx from 'clsx';
import {
  ThemeClassNames,
  useThemeConfig,
  usePrevious,
  Collapsible,
  useCollapsible,
} from '@docusaurus/theme-common';
import {isSamePath} from '@docusaurus/theme-common/internal';
import {
  isActiveSidebarItem,
  findFirstSidebarItemLink,
  useDocSidebarItemsExpandedState,
  useVisibleSidebarItems,
} from '@docusaurus/plugin-content-docs/client';
import Link from '@docusaurus/Link';
import {translate} from '@docusaurus/Translate';
import useIsBrowser from '@docusaurus/useIsBrowser';
import DocSidebarItems from '@theme/DocSidebarItems';
import DocSidebarItemLink from '@theme/DocSidebarItem/Link';
import type {Props} from '@theme/DocSidebarItem/Category';
import type {
  PropSidebarItem,
  PropSidebarItemCategory,
} from '@docusaurus/plugin-content-docs';
import {useSidebarCollapse} from '@site/src/components/SidebarCollapse';

import styles from '@docusaurus/theme-classic/lib/theme/DocSidebarItem/Category/styles.module.css';

// See "ADDITION 1" above for what these are and why both are needed.
const liveCollapsedSetters = new WeakMap<object, (collapsed: boolean) => void>();
const cascadeExpandOnMount = new WeakSet<object>();

/** Counted from the CLICKED category, not from the sidebar root — see rule 1 in the file
 *  header. A tunnel this long is already an unusual sidebar shape; the cap exists so one
 *  reader's one click can never mount and reveal an unbounded number of rows at once. */
const MAX_TUNNEL_DEPTH = 5;

function isCategoryItem(
  item: PropSidebarItem,
): item is PropSidebarItemCategory {
  return item.type === 'category';
}

/** Opens `item`, via whichever of the two registries in the file header applies. Never touches
 *  `expandedItem` / the accordion — see "IMPLEMENTATION" above. */
function forceItemExpanded(item: PropSidebarItemCategory): void {
  const liveSetter = liveCollapsedSetters.get(item);
  if (liveSetter) {
    liveSetter(false);
  } else {
    cascadeExpandOnMount.add(item);
  }
}

/** Rule 1. `depthRemaining` starts at `MAX_TUNNEL_DEPTH` on the clicked category's first child
 *  and decrements once per level; see the file header for why the chain has to be walked in one
 *  shot here rather than left for each level to re-decide independently when it mounts. */
function walkSingleChildTunnel(
  item: PropSidebarItem,
  depthRemaining: number,
): void {
  if (depthRemaining <= 0 || !isCategoryItem(item)) {
    return;
  }
  const children = item.items;
  if (children.length !== 1) {
    // Breaks the chain: `item` is revealed (its parent just opened) but not itself
    // auto-expanded — this is where "stop tunneling" actually stops, not one level earlier.
    return;
  }
  forceItemExpanded(item);
  walkSingleChildTunnel(children[0]!, depthRemaining - 1);
}

/** Entry point, called once from `handleItemClick` per genuine expand — never on collapse. */
function applyExpansionCascade(item: PropSidebarItemCategory): void {
  const {items} = item;
  if (items.length === 1) {
    walkSingleChildTunnel(items[0]!, MAX_TUNNEL_DEPTH);
  } else if (items.length === 2 || items.length === 3) {
    // Rule 2. Deliberately non-recursive: force each direct child open and stop, regardless
    // of what any of them individually contain.
    items.forEach((child) => {
      if (isCategoryItem(child)) {
        forceItemExpanded(child);
      }
    });
  }
  // 0 or 4+ children: rule 3, nothing beyond the plain click that already opened `item` itself.
}

// If we navigate to a category and it becomes active, it should automatically
// expand itself
function useAutoExpandActiveCategory({
  isActive,
  collapsed,
  updateCollapsed,
  activePath,
  // ADDITION 4's third writer — see the file header. This effect, not the click handler, is what
  // produced the reported down-pointing caret over an empty category.
  railCollapsed,
}: {
  isActive: boolean;
  collapsed: boolean;
  updateCollapsed: (toCollapsed?: boolean) => void;
  activePath: string;
  railCollapsed: boolean;
}) {
  const wasActive = usePrevious(isActive);
  const previousActivePath = usePrevious(activePath);
  useEffect(() => {
    /* NOTHING MAY OPEN A CATEGORY THE RAIL CANNOT SHOW. The whole `if` below is upstream's; the
       guard is ours, and it is the same invariant `handleItemClick`'s early return enforces one
       screen down — stated twice because there are two independent writers, not because one of
       them is a special case. See the file header for the measured failure. */
    if (railCollapsed) {
      return;
    }
    const justBecameActive = isActive && !wasActive;
    const stillActiveButPathChanged =
      isActive && wasActive && activePath !== previousActivePath;
    if ((justBecameActive || stillActiveButPathChanged) && collapsed) {
      updateCollapsed(false);
    }
  }, [
    isActive,
    wasActive,
    collapsed,
    updateCollapsed,
    activePath,
    previousActivePath,
    railCollapsed,
  ]);
}

/**
 * When a collapsible category has no link, we still link it to its first child
 * during SSR as a temporary fallback. This allows to be able to navigate inside
 * the category even when JS fails to load, is delayed or simply disabled
 * React hydration becomes an optional progressive enhancement
 * see https://github.com/facebookincubator/infima/issues/36#issuecomment-772543188
 * see https://github.com/facebook/docusaurus/issues/3030
 */
function useCategoryHrefWithSSRFallback(
  item: Props['item'],
  // ADDITION 4's second half — see that note in the file header. The collapsed 48px icon rail
  // is the same situation as "JS has not loaded": there is no disclosure on screen, so the
  // first child's link is the only destination this row can offer.
  railCollapsed: boolean,
): string | undefined {
  const isBrowser = useIsBrowser();
  return useMemo(() => {
    if (item.href && !item.linkUnlisted) {
      return item.href;
    }
    // In these cases, it's not necessary to render a fallback
    // We skip the "findFirstCategoryLink" computation
    if ((isBrowser && !railCollapsed) || !item.collapsible) {
      return undefined;
    }
    return findFirstSidebarItemLink(item);
  }, [item, isBrowser, railCollapsed]);
}

function CollapseButton({
  collapsed,
  categoryLabel,
  onClick,
}: {
  collapsed: boolean;
  categoryLabel: string;
  onClick: React.MouseEventHandler;
}) {
  return (
    <button
      aria-label={
        collapsed
          ? translate(
              {
                id: 'theme.DocSidebarItem.expandCategoryAriaLabel',
                message: "Expand sidebar category '{label}'",
                description: 'The ARIA label to expand the sidebar category',
              },
              {label: categoryLabel},
            )
          : translate(
              {
                id: 'theme.DocSidebarItem.collapseCategoryAriaLabel',
                message: "Collapse sidebar category '{label}'",
                description: 'The ARIA label to collapse the sidebar category',
              },
              {label: categoryLabel},
            )
      }
      aria-expanded={!collapsed}
      type="button"
      className="clean-btn menu__caret"
      onClick={onClick}
    />
  );
}

function CategoryLinkLabel({label}: {label: string}) {
  return <span className={styles.categoryLinkLabel}>{label}</span>;
}

export default function DocSidebarItemCategory(props: Props): ReactNode {
  const visibleChildren = useVisibleSidebarItems(
    props.item.items,
    props.activePath,
  );
  if (visibleChildren.length === 0) {
    return <DocSidebarItemCategoryEmpty {...props} />;
  }
  return <DocSidebarItemCategoryCollapsible {...props} />;
}

function isCategoryWithHref(
  category: PropSidebarItemCategory,
): category is PropSidebarItemCategory & {href: string} {
  return typeof category.href === 'string';
}

// If a category doesn't have any visible children, we render it as a link
function DocSidebarItemCategoryEmpty({item, ...props}: Props): ReactNode {
  // If the category has no link, we don't render anything
  // It's not super useful to render a category you can't open nor click
  if (!isCategoryWithHref(item)) {
    return null;
  }
  // We remove props that don't make sense for a link and forward the rest
  const {
    type,
    collapsed,
    collapsible,
    items,
    linkUnlisted,
    ...forwardableProps
  } = item;
  const linkItem = {
    type: 'link' as const,
    ...forwardableProps,
  };
  return <DocSidebarItemLink item={linkItem} {...props} />;
}

function DocSidebarItemCategoryCollapsible({
  item,
  onItemClick,
  activePath,
  level,
  index,
  ...props
}: Props): ReactNode {
  const {items, label, collapsible, className, href} = item;
  const {
    docs: {
      sidebar: {autoCollapseCategories},
    },
  } = useThemeConfig();
  /* ADDITION 4 — see the file header. `?.collapsed ?? false`, NEVER the non-null assertion the
     two header triggers use: this component also renders in the MOBILE sidebar, which
     `NavbarSecondaryMenuFiller` teleports into the Navbar's React tree — a SIBLING of
     `SidebarCollapseProvider`'s subtree, not a descendant — so the hook genuinely returns null
     there. Measured at <=996px: 10 of 10 category instances render inside `nav.navbar`, none
     inside `.main-wrapper`. And Layout's ErrorBoundary wraps only `{children}`, not `<Navbar/>`,
     so a null-deref here would take down the whole page rather than one subtree, on every mobile
     docs page. `false` is also the correct fallback on its own terms: there is no icon rail on
     mobile, so no row is ever in one. */
  const railCollapsed = useSidebarCollapse()?.collapsed ?? false;
  const hrefWithSSRFallback = useCategoryHrefWithSSRFallback(item, railCollapsed);
  const isActive = isActiveSidebarItem(item, activePath);
  const isCurrentPage = isSamePath(href, activePath);

  // See "ADDITION 3" in the file header: bumped once per full collapse, and used as this
  // category's own `<DocSidebarItems>` `key` below, so every descendant remounts from scratch
  // rather than reappearing in whatever state the reader left it in last time.
  const [contentGeneration, setContentGeneration] = useState(0);

  const {collapsed, setCollapsed} = useCollapsible({
    // Active categories are always initialized as expanded. The default
    // (`item.collapsed`) is only used for non-active categories.
    initialState: () => {
      if (!collapsible) {
        return false;
      }
      if (isActive) {
        return false;
      }
      // See "ADDITION 1" in the file header: a category not yet mounted, marked by an
      // ancestor's click cascade to be born already expanded.
      if (cascadeExpandOnMount.has(item)) {
        return false;
      }
      return item.collapsed;
    },
  });

  // See "ADDITION 1" in the file header: registers the RAW setter (not `updateCollapsed`) so an
  // ancestor's click cascade can force this already-mounted category open without touching the
  // sibling accordion below. Unregistered on unmount so the registry never holds a setter for a
  // category that no longer exists.
  useEffect(() => {
    liveCollapsedSetters.set(item, setCollapsed);
    return () => {
      liveCollapsedSetters.delete(item);
    };
  }, [item, setCollapsed]);

  const {expandedItem, setExpandedItem} = useDocSidebarItemsExpandedState();
  // Use this instead of `setCollapsed`, because it is also reactive
  const updateCollapsed = (toCollapsed: boolean = !collapsed) => {
    setExpandedItem(toCollapsed ? null : index);
    setCollapsed(toCollapsed);
  };
  useAutoExpandActiveCategory({
    isActive,
    collapsed,
    updateCollapsed,
    activePath,
    railCollapsed,
  });
  useEffect(() => {
    if (
      collapsible &&
      expandedItem != null &&
      expandedItem !== index &&
      autoCollapseCategories
    ) {
      setCollapsed(true);
    }
  }, [collapsible, expandedItem, index, setCollapsed, autoCollapseCategories]);

  const handleItemClick = (e: React.MouseEvent) => {
    onItemClick?.(item);
    /* ADDITION 4 — IN THE COLLAPSED ICON RAIL THIS ROW IS A LINK AND NOTHING ELSE.
       See the file header for the measurements. The whole `if (collapsible)` body below is what
       is skipped, deliberately, and not merely `updateCollapsed`: `applyExpansionCascade` writes
       into `cascadeExpandOnMount`, which is add-only (there is no `.delete` anywhere in this
       file), so a mark written by a click the reader could not see is permanent for the page's
       life and survives ADDITION 3's remount — it would silently open descendants minutes later.
       Gating the whole branch is the clean cut.
         `e.preventDefault()` STILL FIRES when there is nothing to navigate to, and dropping it
       would be a regression: a category with neither a `link` nor any linkable descendant renders
       `href="#"`, and letting that through pushes a `#` history entry on every click. */
    if (railCollapsed) {
      if (!hrefWithSSRFallback) {
        e.preventDefault();
      }
      return;
    }
    if (collapsible) {
      // Per branch below, and read BEFORE `updateCollapsed` changes anything: the cascade
      // (ADDITION 1) only ever runs for a genuine expand, never on collapse — see "Manual
      // Collapse Priority" in the file header.
      let isExpanding: boolean;
      if (href) {
        // When already on the category's page, we collapse it
        // We don't use "isActive" because it would collapse the
        // category even when we browse a children element
        // See https://github.com/facebook/docusaurus/issues/11213
        if (isCurrentPage) {
          e.preventDefault();
          isExpanding = collapsed; // toggle: expanding iff it was collapsed
          updateCollapsed();
        } else {
          // When navigating to a new category, we always expand — unconditionally, so the
          // cascade runs on this branch even if the category happened to be expanded
          // already, because the click itself is the "navigate into this category" action
          // the cascade exists for, not merely a collapsed -> expanded state transition.
          // see https://github.com/facebook/docusaurus/issues/10854#issuecomment-2609616182
          isExpanding = true;
          updateCollapsed(false);
        }
      } else {
        e.preventDefault();
        isExpanding = collapsed; // toggle: expanding iff it was collapsed
        updateCollapsed();
      }
      if (isExpanding) {
        applyExpansionCascade(item);
      }
    }
  };

  return (
    <li
      className={clsx(
        ThemeClassNames.docs.docSidebarItemCategory,
        ThemeClassNames.docs.docSidebarItemCategoryLevel(level),
        'menu__list-item',
        {
          'menu__list-item--collapsed': collapsed,
        },
        className,
      )}>
      <div
        className={clsx('menu__list-item-collapsible', {
          'menu__list-item-collapsible--active': isCurrentPage,
        })}>
        <Link
          className={clsx(styles.categoryLink, 'menu__link', {
            'menu__link--sublist': collapsible,
            'menu__link--sublist-caret': !href && collapsible,
            'menu__link--active': isActive,
          })}
          onClick={handleItemClick}
          aria-current={isCurrentPage ? 'page' : undefined}
          role={collapsible && !href && !railCollapsed ? 'button' : undefined}
          aria-expanded={
            collapsible && !href && !railCollapsed ? !collapsed : undefined
          }
          href={collapsible ? hrefWithSSRFallback ?? '#' : hrefWithSSRFallback}
          {...props}>
          <CategoryLinkLabel label={label} />
        </Link>
        {href && collapsible && (
          <CollapseButton
            collapsed={collapsed}
            categoryLabel={label}
            onClick={(e) => {
              e.preventDefault();
              // A second, independent toggle path — the caret, separate from the label link's
              // `handleItemClick` above — needs the same "cascade only on genuine expand" guard.
              // See "Manual Collapse Priority" in the file header.
              const isExpanding = collapsed;
              updateCollapsed();
              if (isExpanding) {
                applyExpansionCascade(item);
              }
            }}
          />
        )}
      </div>

      <Collapsible
        lazy
        as="ul"
        className="menu__list"
        collapsed={collapsed}
        onCollapseTransitionEnd={(nowCollapsed) => {
          // See "ADDITION 3" in the file header. Only on the collapse-ending transition —
          // an already-fresh subtree has nothing to discard on expand.
          if (nowCollapsed) {
            setContentGeneration((generation) => generation + 1);
          }
        }}>
        <DocSidebarItems
          key={contentGeneration}
          items={items}
          tabIndex={collapsed ? -1 : 0}
          onItemClick={onItemClick}
          activePath={activePath}
          level={level + 1}
        />
      </Collapsible>
    </li>
  );
}
