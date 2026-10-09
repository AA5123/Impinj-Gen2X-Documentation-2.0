/**
 * THE SIDEBAR HEADER — the tree's own name, and a version where there is one to state.
 *
 * Added 2026-08-29 with the HeroUI-anatomy rebuild, which opens its sidebar with the same
 * pair. Docusaurus ships no such block, so it is authored here rather than styled into
 * existence.
 *
 * WHICH TREE AM I IN. `useDocsSidebar()` returns the sidebar the current route resolved to,
 * including the KEY it was declared under in sidebars/*.ts. That key is the discriminator —
 * not the URL, which would have to be re-derived every time a routeBasePath moves, and not
 * the plugin id, which is one level too coarse (the MQTT and REST references are separate
 * plugins but the guides and resources trees share one).
 *
 * VERSIONS ONLY ON THE API REFERENCES, per the owner's rule, and the reason is worth stating
 * because the omission looks like an oversight: `docs` and `resources` are conceptual
 * documentation. They describe how the reader should think about the product, not what
 * revision of an interface they are calling, so there is no version for them to be at. A
 * version badge on a conceptual page invites a question it cannot answer.
 *
 * THE NUMBERS ARE NOT WRITTEN HERE. They come from `info.version` in the two specifications,
 * read at build time in docusaurus.config.ts — see the note beside `specVersion` there for
 * why the spec is the authority. What that means in practice: nobody has to remember to
 * update this file when an API moves.
 *
 * BOTH DUAL-TRIGGER BUTTONS LIVE HERE NOW, 2026-09-02. Trigger B (the persistent Equal toggle)
 * moved in from the top navbar — the brief's corrected placement is immediately before the
 * tree's own title, not the site's — and Trigger A (the in-panel PanelLeft/PanelLeftClose
 * button) was already here. See the two components below for what each does; the header's own
 * JSX just arranges them either side of the title in one row.
 */
import React, {useEffect, useRef, useState, type ReactNode} from 'react';
import Content from '@theme-original/DocSidebar/Desktop/Content';
import type ContentType from '@theme/DocSidebar/Desktop/Content';
import type {WrapperProps} from '@docusaurus/types';
import {useDocsSidebar} from '@docusaurus/plugin-content-docs/client';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useLocation} from '@docusaurus/router';
import {translate} from '@docusaurus/Translate';
import Icon from '@site/src/components/icons';
import {useSidebarCollapse} from '@site/src/components/SidebarCollapse';
import {sectionFor} from '@site/src/components/siteSections';
import useTruncatedLabelReveal from './useTruncatedLabelReveal';

import styles from './styles.module.css';

type Props = WrapperProps<typeof ContentType>;

/**
 * TRIGGER B — the persistent half of the dual-trigger pattern. Relocated 2026-09-02 from the
 * top navbar into the sidebar's own header, immediately before the title: `[Equal] Guides`.
 * Unlike Trigger A it is ALWAYS rendered, in both the expanded and the 48px icon-rail state —
 * sidebar.scss keeps this row visible and centred when the rail collapses, specifically so this
 * button survives being the one thing left to click to get the panel back. See the "docked on
 * collapse" rules there for the other half of that contract.
 *
 * `buttonRef` is what lets Trigger A, below, move focus here when it collapses the sidebar and
 * unmounts itself — a plain prop now, not a context value, because both triggers are siblings in
 * the same component (`ContentWrapper`) rather than components in unrelated parts of the tree the
 * way Trigger B's old Navbar location was.
 *
 * ONE ICON, NEVER ROTATED. `Equal` (three bars) reads as "sidebar/panel control" in either state
 * without needing to point anywhere — unlike Trigger A's `PanelLeft`/`PanelLeftClose` pair, which
 * depict the specific action of closing a panel that is currently open, this control has to make
 * sense while the sidebar is ALREADY collapsed too, where "closing" is not what a click does.
 */
function SidebarPersistentToggle({
  buttonRef,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}): ReactNode {
  const sidebar = useSidebarCollapse();
  if (!sidebar) {
    return null;
  }
  const label = sidebar.collapsed
    ? translate({
        id: 'theme.docs.sidebar.expandButtonTitle',
        message: 'Open sidebar',
        description: 'The ARIA label and tooltip for the persistent sidebar toggle, collapsed state',
      })
    : translate({
        id: 'theme.docs.sidebar.collapseButtonTitle',
        message: 'Close sidebar',
        description: 'The ARIA label and tooltip for the persistent sidebar toggle, expanded state',
      });
  /* The shortcut rides in the VISUAL tooltip only, not the accessible name — `aria-label`
     stays the plain action ("Close sidebar"), which is what most screen readers already
     announce well; the chip a sighted, mousing reader hovers is the one place a mnemonic
     earns its keep. */
  const tooltip = `${label} (${sidebar.shortcutLabel})`;
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`sidebar-header-toggle ${styles.persistentToggle}`}
      data-tooltip={tooltip}
      aria-label={label}
      aria-expanded={!sidebar.collapsed}
      aria-controls="docs-sidebar"
      onClick={sidebar.toggle}>
      {/* `size` 20, matching the row icons' own mask box below (sidebar-icons.scss paints every
          category glyph into a 20x20 box) — not 18 with a compensating `strokeWidth`. 18px was
          this button's first draft, made to read the same WEIGHT as the rows via a heavier
          strokeWidth (2 instead of the set's 1.8 default); it never read the same SIZE, and once
          both sat in the same panel the row icons were visibly larger. Matching the box directly
          gets both size and weight right from the one number: at 20px, the default `strokeWidth`
          (1.8) already lands on the identical rendered stroke the masks use, so it is left
          unset. */}
      <Icon name="SidebarToggle" aria-hidden size={20} />
    </button>
  );
}

/**
 * TRIGGER A — the in-panel half of the dual-trigger pattern. Sits at the far end of the header's
 * title row, mounted ONLY while the sidebar is expanded: the sidebar narrows to a 48px icon rail
 * rather than disappearing (src/theme/DocRoot/Layout/Sidebar), but this control's OWN job —
 * collapsing FROM the expanded state — has nothing to do once that state is reached, so it
 * unmounts rather than sitting there disabled or, worse, painted over the icon column.
 *
 * TWO ICONS ON ONE BUTTON, SWAPPED BY CSS, NOT BY STATE. `PanelLeft` at rest, `PanelLeftClose` on
 * hover/focus-visible/active — see styles.module.css for the mechanism (both render; CSS shows
 * one). No JS hover state needed, matching how every other interactive cue in this sidebar is
 * authored.
 *
 * FOCUS NEVER FALLS TO <body>. Clicking this button collapses the sidebar, which unmounts this
 * very button on the next render. Without intervention the browser drops focus to the document
 * body the instant that happens — invisible to a sighted mouse user, and a real "where did I go"
 * moment for anyone navigating by keyboard or screen reader. `onCollapse` (passed in by
 * `ContentWrapper`, calling `.focus()` on Trigger B's own DOM node) closes that gap: by the time
 * this component's node is actually removed, focus has already moved next door.
 */
function SidebarCollapseTrigger({onCollapse}: {onCollapse: () => void}): ReactNode {
  const sidebar = useSidebarCollapse();
  if (!sidebar || sidebar.collapsed) {
    return null;
  }
  const label = translate({
    id: 'theme.docs.sidebar.collapseButtonTitle',
    message: 'Close sidebar',
    description: 'The ARIA label and tooltip for the in-panel sidebar collapse trigger',
  });
  // Same visual-only shortcut hint as Trigger B's own tooltip — see its comment above.
  const tooltip = `${label} (${sidebar.shortcutLabel})`;
  return (
    <button
      type="button"
      /* A STABLE GLOBAL CLASS BESIDE THE MODULE ONE — see ContentWrapper's own header comment
         below (`sidebar-header-title`) for the rationale. sidebar.scss needs this hook to hide
         this button during the pre-hydration window, before React's conditional render above
         has had a chance to unmount it. */
      className={`sidebar-header-collapse-trigger ${styles.collapseTrigger}`}
      data-tooltip={tooltip}
      aria-label={label}
      aria-controls="docs-sidebar"
      onClick={() => {
        sidebar.toggle();
        onCollapse();
      }}>
      {/* `size` 20 for the same reason as Trigger B's own icon — see its comment above. */}
      <Icon
        name="SidebarPanel"
        aria-hidden
        size={20}
        className={styles.collapseTriggerIconRest}
      />
      <Icon
        name="SidebarPanelClose"
        aria-hidden
        size={20}
        className={styles.collapseTriggerIconActive}
      />
    </button>
  );
}

/* THE FIVE SECTIONS' TITLES, HREFS AND VERSIONS MOVED TO src/components/siteSections.ts on
   2026-09-06 — whole, comments included, plus a `parent` field this component does not read.
   src/theme/DocBreadcrumbs needs the same five titles and the same five hrefs for the section
   ancestors it prepends to every trail, and a second copy would fork one concept across two
   definitions. Nothing about what this component does with them changed: the map has the same
   keys and the same values `SIDEBAR_HEADERS` had.
     THE LOOKUP IS NOW `sectionFor(...)` RATHER THAN AN INDEX, since 2026-09-07. The map was
   renamed `SECTIONS_BY_SIDEBAR` and keyed on a `SidebarName` union, which a `string` from
   `useDocsSidebar()` cannot index — so both readers share one guarded lookup instead of each
   casting. It also absorbed the `sidebar ? … : undefined` ternary that used to sit here,
   because it takes `string | undefined` directly. The behaviour is identical: an unmapped
   sidebar still yields `undefined` and still renders no header, per the note below. */

export default function ContentWrapper(props: Props): ReactNode {
  const sidebar = useDocsSidebar();
  const {siteConfig} = useDocusaurusContext();
  const header = sectionFor(sidebar?.name);

  /* Marks which labels are clipped, so sidebar.scss's THE FULL LABEL, REVEALED can give the
     hidden tail back on hover AND on keyboard focus. Called HERE, above the `!header` early
     return below, because it is a hook — and it has to keep working on a tree with no header
     row, which that branch returns for. See the file's own header for why the question has to be
     measured at runtime and why the answer is CSS rather than a `title`. */
  useTruncatedLabelReveal();

  /**
   * THE SEPARATOR IS DRAWN ONLY ONCE SOMETHING HAS GONE UNDER IT.
   *
   * The header does not scroll and never did: `<Content>` renders `<nav class="menu">`, that
   * nav is the scroll container (`overflow-y: auto`), and this block is its SIBLING, sitting
   * above it. So the title is already pinned for free, by structure rather than by
   * `position: sticky`, and the only open question was the hairline between the two.
   *
   * A rule that is always drawn separates the title from nothing at all on the short trees —
   * Resources never overflows, and neither does REST at a normal window height. Drawing it
   * only when the menu is genuinely scrolled away from the top means the line appears exactly
   * when it starts doing a job, and the panel is otherwise one uninterrupted surface.
   *
   * The listener goes on the nav rather than on `window`: the page scrolling is a different
   * event from the tree scrolling, and it is the tree's position that this line describes.
   */
  const headerRef = useRef<HTMLDivElement>(null);
  const [ruled, setRuled] = useState(false);

  /* Trigger A -> Trigger B's focus handoff, see SidebarCollapseTrigger's own header. A plain
     local ref: both triggers are siblings in this component's own return value now. */
  const persistentToggleRef = useRef<HTMLButtonElement>(null);

  /* Is the reader already on the page the title points at? `useBaseUrl` applies the site's
     baseUrl the same way `<Link to>` does, so both sides of the comparison are real pathnames;
     the trailing slash is trimmed because Docusaurus serves /guides/ while the map holds
     /guides. Only `aria-current` depends on this — the element itself never changes.
       BOTH HOOKS RUN UNCONDITIONALLY, above the `!header` return below, because they are
     hooks. The `?? '/'` is the price of that ordering and is never read: the one branch that
     can see it returns before the value is used. */
  const {pathname} = useLocation();
  const target = useBaseUrl(header?.href ?? '/');
  const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p);
  const isHere = trimSlash(pathname) === trimSlash(target);

  useEffect(() => {
    /* `<Content>` renders the nav as this block's immediate next sibling. If a Docusaurus
       release ever changes that shape the guard fails closed — no listener, no rule, and a
       header that still renders correctly — rather than throwing in the sidebar. */
    const nav = headerRef.current?.nextElementSibling;
    if (!(nav instanceof HTMLElement)) {
      return undefined;
    }
    const sync = () => setRuled(nav.scrollTop > 0);
    sync();
    nav.addEventListener('scroll', sync, {passive: true});
    return () => nav.removeEventListener('scroll', sync);
    /* Re-attached when the route moves to a DIFFERENT tree, because that swaps the nav
       element underneath us and would otherwise leave the listener on a detached node. */
  }, [sidebar?.name]);

  /* An unmapped sidebar renders no header rather than a wrong one. A sixth tree added to
     sidebars/*.ts without a row in src/components/siteSections.ts gets nothing, which is
     visible and self-correcting; falling back to the site title would print something
     plausible and wrong. The breadcrumb trail fails the same way for the same reason — see
     `sectionTrail` in that file. */
  if (!header) {
    return <Content {...props} />;
  }

  const versions = siteConfig.customFields?.apiVersions as
    | Record<'rest' | 'mqtt', string>
    | undefined;
  const version = header.version ? versions?.[header.version] : undefined;

  return (
    <>
      {/* Not an <h#>, deliberately: this labels a navigation panel, and a heading here would
          inject a rogue level into the outline of every documentation page. */}
      {/* A STABLE GLOBAL CLASS BESIDE THE MODULE ONE. sidebar.scss has to hide this block
          when the rail collapses, and a content-hashed module class is not something another
          stylesheet can name. `sidebar--icons-only` next door is set on the <aside> for the
          same reason — see src/theme/DocRoot/Layout/Sidebar. */}
      <div
        ref={headerRef}
        className={`sidebar-header ${styles.sidebarHeader}${
          ruled ? ` ${styles.sidebarHeaderRuled}` : ''
        }`}>
        {/* THE TOP ROW: Trigger B, the title, Trigger A — in that order, matching the brief's
            own diagram. `sidebar-header-row` is the stable global hook sidebar.scss uses to
            re-centre this row on Trigger B alone once the title and Trigger A both disappear
            in the collapsed rail. */}
        <div className={`sidebar-header-row ${styles.sidebarTopRow}`}>
          <SidebarPersistentToggle buttonRef={persistentToggleRef} />
          {/* THE TITLE IS THE TREE'S HOME LINK.
              It took that job from the duplicate first row each of these trees used to open
              with — "Guides" above Guides, "Resources" above Resources — which named the panel
              a second time one line lower. One name, one target, one place.

              STILL A LINK WHEN IT IS THE CURRENT PAGE, marked with `aria-current` rather than
              downgraded to plain text. That is how the rows below it already behave: an active
              `.menu__link` stays an anchor. Swapping the element by route would also make the
              hover affordance appear and disappear as the reader moves through the tree, on
              the one piece of the panel that never otherwise changes.

              NO ICON OF ITS OWN, deliberately, beyond Trigger B now sitting beside it: the
              glyphs are the row vocabulary; the header labels the panel. `sidebar-header-title`
              is the stable global hook sidebar.scss hides this specific piece by in the
              collapsed rail, where there is no room for the tree's name. */}
          <Link
            to={header.href}
            className={`sidebar-header-title ${styles.sidebarTitle}`}
            aria-current={isHere ? 'page' : undefined}>
            {header.title}
          </Link>
          <SidebarCollapseTrigger
            onCollapse={() => persistentToggleRef.current?.focus()}
          />
        </div>
        {/* The version is metadata, not a destination, so it stays outside the anchor.
            `sidebar-header-version` is the same kind of stable hook as the title's, for the
            same reason: hidden in the collapsed rail, where there is no room for it either. */}
        {version ? (
          <span className={`sidebar-header-version ${styles.sidebarVersion}`}>
            {version}
          </span>
        ) : null}
      </div>
      <Content {...props} />
    </>
  );
}
