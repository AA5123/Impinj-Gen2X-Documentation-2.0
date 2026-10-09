/**
 * Swizzled @theme/NavbarItem/DropdownNavbarItem/Desktop — the Radix Primitives
 * NavigationMenu INTERACTION model on theme-classic's dropdown markup.
 *
 * THE MARKUP IS UPSTREAM'S, DELIBERATELY AND ENTIRELY. Same wrapper
 * (`navbar__item dropdown`), same trigger (`NavbarNavLink` with
 * `role="button"`), same `<ul class="dropdown__menu">` of `<NavbarItem
 * isDropdownItem>` rows. Everything routing, `activeBasePath`, docs-plugin
 * sidebar linking and the mobile drawer rely on is therefore untouched — the
 * drawer is a different component (`DropdownNavbarItem/Mobile`) and never
 * reaches this file. What changes is the STATE, and four behaviours that the
 * upstream component does not have.
 *
 * 1. ONE OPEN STATE INSTEAD OF TWO. Upstream opens the menu two ways that do
 *    not know about each other: React state for click/Enter, and Infima's
 *    `dropdown--hoverable:hover` in CSS for the pointer. The CSS half is
 *    invisible to React, so hovering a trigger opened a menu that still
 *    reported `aria-expanded="false"` — a screen-reader user was told the menu
 *    was shut while it was on screen. `dropdown--hoverable` is dropped and the
 *    pointer drives the same `open` state as everything else, so
 *    `aria-expanded` is now true exactly when the menu is visible. That is also
 *    what lets `data-state` exist at all, and the stylesheet needs it: the
 *    caret rotation and the panel's scaleIn/scaleOut are keyed on it, the way
 *    Radix keys them.
 *
 * 2. A CLOSE GRACE PERIOD, which the detached panel makes necessary rather than
 *    nice. The reference stands its viewport 10px clear of its menu list, and
 *    src/css/navbar-menu.scss reproduces that measured from the bar, since the
 *    bar is what plays the menu list here. Pointer travel from trigger to panel
 *    therefore crosses 10px that belongs to neither, and `pointerleave` fires on
 *    the way across. Closing on that event would make the panel unreachable with
 *    a mouse. CLOSE_GRACE_MS holds it open long enough to cross. There is no
 *    matching OPEN delay: Radix defaults to 200ms there, but this bar has
 *    opened instantly on hover for its whole life and slowing it down is a
 *    regression this brief did not ask for.
 *
 * 3. KEYBOARD. Upstream handles Enter and Space and nothing else — no Escape,
 *    no way into the open menu, no way to move between its rows. This adds the
 *    menu-button pattern the WAI-ARIA practices describe and Radix implements:
 *    ArrowDown/ArrowUp open and land on the first/last row, the arrows and
 *    Home/End move between rows, and Escape closes and puts focus back on the
 *    trigger. Enter and Space keep upstream's exact semantics — including
 *    `preventDefault`, so a trigger with a `to` toggles rather than navigating,
 *    which is what this bar already did.
 *
 * 4. TOUCH. `pointerenter` fires for a tap as well as a hover, so on a
 *    touchscreen wide enough to get this bar (>=997px — an iPad or a touch
 *    laptop) the upstream CSS hover left a menu hanging open behind the
 *    navigation the same tap started. The pointer handlers ignore
 *    `pointerType === 'touch'`; a tap is then just a click, which either
 *    follows `to` or toggles the menu, exactly as it does with a mouse.
 *
 * 5. A SWITCH IS NOT AN OPEN. Moving from one open trigger to the next used to
 *    play a full close on one panel and a full open on the other, two 3D
 *    animations overlapping. The reference never does that: its `scaleIn` and
 *    `scaleOut` are the gestures for APPEARING and LEAVING, and moving between
 *    triggers keeps one viewport mounted and morphs it, so the scale does not
 *    replay. `openMenus` below is the one piece of shared state that lets each
 *    instance tell the two cases apart, and `data-switch` hands that to the
 *    stylesheet, which then suppresses both animations for the exchange.
 *
 * THE ROWS ARE TWO LINES, which is the reference's ListItemLink: a heading and a
 * one-sentence description, not a bare label. The second line comes from a
 * `description` key on the item in docusaurus.config.ts, and an `icon` key names
 * one of the semantic marks in src/components/icons — both legal because
 * theme-classic's NavbarItemBaseSchema ends in `.unknown()` — and it is READ AND
 * STRIPPED here rather than passed on, because everything a `NavbarItem` does not
 * recognise is spread onto the rendered `<a>`, and `description="…"` on an anchor
 * is an attribute no HTML parser knows. The drawer is covered by the swizzle one
 * directory up (…/DropdownNavbarItem/index.tsx), which drops the key on the mobile
 * branch without rendering it, so drawer rows stay one line.
 *
 * WHY `label` CARRIES THE CARET AND NOT `children`. `NavbarNavLink` builds its
 * own `children` from `label` and spreads that LAST, so any children passed in
 * are silently discarded — upstream's `{props.children ?? props.label}` has
 * never rendered. `Props['label']` is a `ReactNode`, so the caret goes there,
 * inside the anchor, which is where the reference puts its `<svg>` (inside the
 * `<button>`). Infima's own CSS triangle is suppressed with `dropdown--nocaret`,
 * Infima's own switch for it, rather than by out-shouting its `::after`.
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import NavbarNavLink from '@theme/NavbarItem/NavbarNavLink';
import NavbarItem from '@theme/NavbarItem';
import {Icon, type IconName} from '@site/src/components/icons';
import type {Props} from '@theme/NavbarItem/DropdownNavbarItem/Desktop';

/**
 * How long the menu stays open after the pointer leaves, so the 10px gap
 * after the pointer leaves. Not a --motion-* token and deliberately not one:
 * section 7.1(2) closes the set of ANIMATION durations, and this is a debounce on an
 * event, the same kind of value as --motion-delay-debounce (0.4s, the wait before the
 * back-to-top button hides).
 * RAISED FROM 150ms TO 300ms ON 2026-09-08, AND ITS JOB CHANGED. It used to be the
 * ONLY thing bridging the 8.8px band between the trigger wrapper and the panel — a
 * band that belonged to neither element — which made reaching your own menu
 * conditional on a minimum pointer speed of roughly 53px/s. Measured at 150ms: a
 * 400ms dwell in that band flipped `aria-expanded` to false and arriving at the panel
 * did not recover it, a WCAG 2.1 SC 1.4.13 Hoverable failure at default settings.
 * That band is now closed geometrically — the dropdown wrapper is stretched to the
 * bar's painted edge, see the hover-corridor note in src/css/navbar-menu.scss — so
 * this timer is defence in depth rather than the mechanism, and it no longer has to
 * be short enough to feel responsive while being long enough to be traversable. 300ms
 * sits between W3C's fly-out tutorial (1000ms) and NN/g's 500ms measured from leaving
 * both regions, and it covers a diagonal exit that clips a neighbouring trigger.
 */
const CLOSE_GRACE_MS = 300;

/** The rows a keyboard can land on inside an open menu. */
const ROW_SELECTOR = '.dropdown__link';

/**
 * `Props['items']` is theme-classic's `LinkLikeNavbarItemProps`, which of course
 * does not declare the custom key the config adds. Widening it here rather than
 * casting at the call site keeps the strip below type-checked: drop `description`
 * from the object and what is left is exactly what `NavbarItem` accepts.
 */
type DropdownRowProps = Props['items'][number] & {
  readonly description?: string;
  readonly icon?: IconName;
};

/**
 * The trigger is reached by query rather than by a ref, and that is a
 * type-safety call rather than a shortcut: `NavbarNavLink` is a plain function
 * component that re-spreads its props onto a `forwardRef` `Link`, so a ref
 * would have to travel as an ordinary prop through a `Props` type that does not
 * declare one. There is exactly one `.navbar__link` inside a dropdown wrapper,
 * and this is only ever called from an event handler, so the query costs
 * nothing that matters.
 */
const TRIGGER_SELECTOR = '.navbar__link';

/**
 * HOW MANY MENUS IN THIS ROW ARE OPEN, shared by every instance of this
 * component. It exists to answer one question at the moment a menu changes
 * state: is this an OPEN, or is it half of a switch between two triggers?
 *
 * MODULE SCOPE RATHER THAN A CONTEXT, and the trade is deliberate. A context
 * would need a provider around the row, which means owning `Navbar/Content` —
 * a component this work deliberately un-swizzled so the search box and the
 * colour-mode toggle stay upstream's. What is stored here is not application
 * state and is never rendered from directly: it is a transient count of open
 * overlays, read once per state change to pick an animation. It cannot leak
 * between pages (the count returns to zero as menus close, and unmount
 * decrements it), and it cannot desynchronise, because every increment has its
 * decrement in the same `useEffect` cleanup.
 *
 * SERVER-SAFE: it is only ever touched from event handlers and effects, never
 * during render, so it takes no part in SSR and cannot differ between the
 * server's HTML and the client's first paint.
 */
let openMenuCount = 0;

/**
 * THE MENUS THAT CAN BE TOLD TO STEP ASIDE, one entry per mounted instance. When a
 * trigger opens, every OTHER open menu in the row closes on the same tick, as the
 * leaving half of a switch — Radix NavigationMenu's single `value`, where moving to a
 * sibling trigger changes WHICH item is open rather than opening a second one beside it.
 *
 * Owner report, 2026-09-11: moving the pointer from "API Reference" to "Resources" left
 * API Reference's hover plate lit for about a second. Measured before this change: 481ms,
 * and ~470ms on every other exit too. CLOSE_GRACE_MS (300ms) held the leaving menu at
 * `data-state="open"`, the trigger's plate is painted on that state, and its 150ms fade
 * only started when the grace ran out. The grace exists so a pointer can overshoot and
 * come back; arriving at a SIBLING trigger is not an overshoot, it is a decision, so there
 * is nothing to wait for. Module scope for the same reason as `openMenuCount` above.
 */
const openMenuYielders = new Set<() => void>();


export default function DropdownNavbarItemDesktop({
  items,
  position,
  className,
  onClick,
  ...props
}: Props): ReactNode {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [open, setOpen] = useState(false);

  /**
   * `data-state` is withheld until the menu has been opened once. The
   * stylesheet runs its close animation on `[data-state='closed']`, so
   * stamping the attribute at mount would play a fade-out over every dropdown
   * on first paint. Radix reaches the same place through its Presence
   * machinery; this is the one-line version.
   */
  const [everOpened, setEverOpened] = useState(false);

  /**
   * Whether THIS transition is half of an exchange between two triggers rather
   * than a plain open or close. Decided at the moment of the change and held in
   * state so it reaches the DOM in the same commit as `data-state` — the
   * stylesheet has to see both attributes on the same frame or it would animate
   * the very transition this exists to suppress.
   */
  const [switching, setSwitching] = useState(false);

  /**
   * The pointer has left this dropdown and the close-grace timer is running. The PANEL
   * stays up for the grace — that is the point of it; the trigger's PLATE does not. The
   * plate is a hover indicator, and a hover indicator that outlives the hover reads as
   * lag, which is the other half of the 2026-09-11 report. The stylesheet drops the
   * open-state plate while this is set (`[data-leaving]` in src/css/navbar-menu.scss).
   * Only a pointer can set it, so a menu opened from the keyboard keeps its plate for as
   * long as it is open.
   */
  const [leaving, setLeaving] = useState(false);

  /** `open`, readable from ANOTHER instance's handler — see `yieldToSibling`. */
  const openRef = useRef(false);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== undefined) {
      clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  }, []);

  /* THE TWO PREDICATES ARE DIFFERENT, AND THE DIFFERENCE IS WHETHER THIS MENU IS
     ITSELF IN THE COUNT YET. On the way in it is not — the effect below has not
     run — so any non-zero count is somebody else. On the way out it still is, so
     the test has to clear one. Getting this wrong in either direction is silent:
     too eager and a lone menu loses its opening flourish, too shy and the mush
     comes back. */
  /* THE LEAVING HALF OF A SWITCH, called from a SIBLING's `openMenu`. `switching` is
     forced true rather than computed: at this instant the arriving menu is not in
     `openMenuCount` yet, so the count would call this a plain close and the panel would
     play its full scaleOut under the one arriving — the overlap note 5 exists to prevent.
     A closed menu has nothing to yield, and is left alone so it does not pick up a stray
     `data-switch`. */
  const yieldToSibling = useCallback(() => {
    if (!openRef.current) {
      return;
    }
    cancelClose();
    openRef.current = false;
    setSwitching(true);
    setLeaving(false);
    setOpen(false);
  }, [cancelClose]);

  useEffect(() => {
    openMenuYielders.add(yieldToSibling);
    return () => {
      openMenuYielders.delete(yieldToSibling);
    };
  }, [yieldToSibling]);

  const openMenu = useCallback(() => {
    cancelClose();
    openMenuYielders.forEach((yieldMenu) => {
      if (yieldMenu !== yieldToSibling) {
        yieldMenu();
      }
    });
    setSwitching(openMenuCount > 0);
    setEverOpened(true);
    setLeaving(false);
    openRef.current = true;
    setOpen(true);
  }, [cancelClose, yieldToSibling]);

  const closeMenu = useCallback(() => {
    cancelClose();
    setSwitching(openMenuCount > 1);
    setLeaving(false);
    openRef.current = false;
    setOpen(false);
  }, [cancelClose]);

  /* The registry's only writer. Written as an effect with a cleanup rather than
     inside the two callbacks above so that every increment is paired with its
     decrement by React itself — including the one that would otherwise leak if
     the item unmounted while its menu was open (a locale switch, a route change
     that re-renders the navbar). */
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    openMenuCount += 1;
    return () => {
      openMenuCount -= 1;
    };
  }, [open]);

  // Clear a pending close if the item unmounts mid-grace-period.
  useEffect(() => cancelClose, [cancelClose]);

  /**
   * Upstream's outside-interaction effect, unchanged in behaviour: a pointer
   * press or a focus landing anywhere outside this dropdown shuts it. The
   * `focusin` arm is what closes the menu when Tab walks out of the last row,
   * so there is no separate Tab handler below.
   */
  useEffect(() => {
    const handleInteractOutside = (event: MouseEvent | TouchEvent | FocusEvent) => {
      if (
        !dropdownRef.current ||
        dropdownRef.current.contains(event.target as Node)
      ) {
        return;
      }
      closeMenu();
    };

    document.addEventListener('mousedown', handleInteractOutside);
    document.addEventListener('touchstart', handleInteractOutside);
    document.addEventListener('focusin', handleInteractOutside);

    return () => {
      document.removeEventListener('mousedown', handleInteractOutside);
      document.removeEventListener('touchstart', handleInteractOutside);
      document.removeEventListener('focusin', handleInteractOutside);
    };
  }, [closeMenu]);

  /** Move focus onto a row of the open menu. `-1` means the last one. */
  const focusRow = useCallback((index: number) => {
    const rows = dropdownRef.current?.querySelectorAll<HTMLElement>(ROW_SELECTOR);
    if (!rows?.length) {
      return;
    }
    const target = index < 0 ? rows[rows.length - 1]! : rows[Math.min(index, rows.length - 1)]!;
    target.focus();
  }, []);

  /**
   * The menu is opened by state, and the row it should land on can only be
   * focused once React has painted it — a `visibility: hidden` element takes no
   * focus. Both keyboard entries therefore open first and queue the focus.
   */
  const openAndFocus = useCallback(
    (index: number) => {
      openMenu();
      requestAnimationFrame(() => focusRow(index));
    },
    [focusRow, openMenu],
  );

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLAnchorElement>) => {
    switch (event.key) {
      // Upstream's two keys, with upstream's semantics.
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) {
          closeMenu();
        } else {
          openMenu();
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        openAndFocus(0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        openAndFocus(-1);
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          closeMenu();
        }
        break;
      default:
        break;
    }
  };

  /**
   * Roving focus inside the open panel. Escape returns to the trigger, which is
   * the half of Escape handling that matters: closing without moving focus
   * would strand a keyboard user on an element that has just been hidden.
   */
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const rows = Array.from(
      dropdownRef.current?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? [],
    );
    const current = rows.indexOf(document.activeElement as HTMLElement);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRow(current < 0 ? 0 : (current + 1) % rows.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(current <= 0 ? rows.length - 1 : current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusRow(0);
        break;
      case 'End':
        event.preventDefault();
        focusRow(-1);
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu();
        dropdownRef.current
          ?.querySelector<HTMLElement>(TRIGGER_SELECTOR)
          ?.focus();
        break;
      default:
        break;
    }
  };

  /** Hover opens; a tap does not (see note 4 in the header). */
  const onPointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') {
      return;
    }
    openMenu();
  };

  const onPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') {
      return;
    }
    cancelClose();
    /* `closeMenu`, NOT a bare `setOpen(false)`. The bare call was here until
       2026-08-28 and it silently skipped the switch test: this is the path a
       pointer actually takes when it moves from one trigger to the next, so the
       LEAVING panel was the one case that never learned it was half of an
       exchange, and it kept playing its full close under the panel that had
       already arrived. Every close now goes through the one function that
       decides. */
    setLeaving(true);
    closeTimer.current = setTimeout(closeMenu, CLOSE_GRACE_MS);
  };

  const dataState = everOpened ? (open ? 'open' : 'closed') : undefined;

  return (
    <div
      ref={dropdownRef}
      data-state={dataState}
      data-switch={switching ? 'true' : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={clsx('navbar__item', 'dropdown', 'dropdown--nocaret', {
        'dropdown--right': position === 'right',
        'dropdown--show': open,
      })}>
      <NavbarNavLink
        aria-haspopup="true"
        aria-expanded={open}
        data-state={dataState}
        data-leaving={leaving ? 'true' : undefined}
        role="button"
        // # hash permits to make the <a> tag focusable in case no link target
        // See https://github.com/facebook/docusaurus/pull/6003
        href={props.to ? undefined : '#'}
        className={clsx('navbar__link', className)}
        /* NO `activeClassName` HERE, DELIBERATELY, and it is worth a line because
           the omission looks like upstream's oversight and is now a choice.
           `NavbarNavLink` becomes a react-router `NavLink` on the `to` branch, and
           with no class named it takes react-router's default `active` — which
           nothing in Infima or in this site paints. Naming `navbar__link--active`
           here would light the trigger on every page in its section; that was
           built on 2026-08-28 and withdrawn the same day as "too fancy". The row
           is neutral by route on purpose. See the matching notes in
           docusaurus.config.ts and src/css/navbar-menu.scss. */
        {...props}
        label={
          <>
            {props.label}
            {/* `strokeWidth` 2, not the icon set's 1.8 default. Lucide is a
                stroked face and the reference's CaretDown is a FILLED path, so
                at a shared 15px box the stroked glyph reads a step lighter than
                the 600-weight label it sits beside. 2 closes that without
                changing the mark, and it is a per-call prop precisely so the
                sidebar and card glyphs keep the 1.8 the set is tuned to (owner,
                2026-08-29). */}
            <Icon
              name="Disclosure"
              size={15}
              strokeWidth={2}
              className="navbar__menu-caret"
            />
          </>
        }
        onClick={props.to ? undefined : (e) => e.preventDefault()}
        onKeyDown={onTriggerKeyDown}
      />
      <ul className="dropdown__menu" onKeyDown={onMenuKeyDown}>
        {(items as readonly DropdownRowProps[]).map(
          ({description, icon, ...childItemProps}, i) => (
            <NavbarItem
              isDropdownItem
              activeClassName="dropdown__link--active"
              {...childItemProps}
              /* `label` LAST, so it beats the one the spread carries. Two block
                 spans rather than the reference's `<div>` + `<p>`: identical
                 rendering, and phrasing content inside an `<a>` needs no appeal
                 to the transparent content model to be valid. The description is
                 optional — an item without one renders exactly the single-line
                 row this menu had before. */
              label={
                childItemProps.label !== undefined && (description || icon) ? (
                  <>
                    {/* 16px, not the icon set's 20px default: the row's title is
                        14px, and a 20px mark beside it would out-weigh the thing
                        it labels. `size` is a prop for exactly this reason — the
                        sidebar's chips stay at their own rung. */}
                    {icon && (
                      <Icon
                        name={icon}
                        size={16}
                        className="navbar__menu-row-icon"
                      />
                    )}
                    <span className="navbar__menu-row-title">
                      {childItemProps.label}
                    </span>
                    {description && (
                      <span className="navbar__menu-row-text">{description}</span>
                    )}
                  </>
                ) : (
                  childItemProps.label
                )
              }
              key={i}
            />
          ),
        )}
      </ul>
    </div>
  );
}
