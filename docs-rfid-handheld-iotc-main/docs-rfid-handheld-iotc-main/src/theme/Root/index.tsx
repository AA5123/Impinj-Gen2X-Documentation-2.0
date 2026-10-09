/**
 * Swizzled @theme/Root — the one component Docusaurus mounts once, outside the router, for the
 * whole life of the tab. Everything here has to be genuinely global and genuinely cheap.
 *
 * TODAY IT HOLDS ONE THING: the tooltip flip.
 *
 * WHY A DOCUMENT-LEVEL LISTENER AND NOT A HOOK PER BUTTON. The site's `data-tooltip` chip is a
 * CSS pseudo-element on the anchor — three consumers today (the schema panel's icon controls, the
 * schema table's width toggle, the navbar's colour-mode toggle) and no shared React component
 * between them, because each is a plain <button> in a different tree. A chip drawn below its
 * anchor is right almost everywhere and wrong in one place: near the bottom of the viewport it
 * opens off-screen. CSS cannot see where the viewport edge is, so something has to measure — and
 * measuring once, on the element the pointer just reached, is strictly less work than three hooks
 * that each install listeners on mount for buttons that are usually never hovered.
 *
 * `position-try-fallbacks: flip-block` would express this in CSS and is the right answer the day
 * it is safe to rely on; it is Chromium-only as of this writing and the fallback would be this
 * code anyway.
 *
 * IT IS PASSIVE AND IDEMPOTENT: capture-phase listeners that only read a bounding box and set one
 * attribute. No layout is written, nothing is scheduled, and an anchor already carrying the right
 * flag is left alone.
 */
import React, { useEffect, type ReactNode } from 'react';

/** Room a chip needs below its anchor: the chip's own box, its arrow, and the offset between. */
const CHIP_CLEARANCE = 56;

function place(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const anchor = target.closest<HTMLElement>('[data-tooltip]');
  if (!anchor) return;
  const room = window.innerHeight - anchor.getBoundingClientRect().bottom;
  const above = room < CHIP_CLEARANCE;
  if (above === (anchor.dataset.tipAbove === 'true')) return;
  anchor.dataset.tipAbove = String(above);
}

export default function Root({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    const onPointer = (e: Event): void => place(e.target);
    // `focusin` and not `focus`: focus does not bubble, and the chip is shown on :focus-visible
    // as well as :hover, so a keyboard user has to get the same placement decision.
    document.addEventListener('pointerover', onPointer, { capture: true, passive: true });
    document.addEventListener('focusin', onPointer, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerover', onPointer, { capture: true });
      document.removeEventListener('focusin', onPointer, { capture: true });
    };
  }, []);
  return <>{children}</>;
}
