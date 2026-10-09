/**
 * HOVER INTENT — one timing contract, shared by every control on this site that opens on hover.
 *
 * Two controls read it today: the sidebar's collapsible categories
 * (src/theme/DocSidebarItem/Category) and the "Copy page" menu (src/components/CopyPageButton).
 * They are very different components, and the reason they share a module rather than each picking a
 * number is that the delays are what the USER feels as one behaviour. Two controls on the same page
 * that open at 150ms and 300ms do not read as two settings; they read as one of them being broken.
 *
 * ── THE NUMBERS, AND WHERE THEY COME FROM ───────────────────────────────────────────────────
 *
 * 200ms to OPEN. This is Radix UI's `NavigationMenu.delayDuration` default — the figure a widely
 * deployed primitive settled on for exactly this problem, after shipping without any delay and
 * adding one because triggers opening on the way past was the complaint. It is long enough that a
 * pointer crossing a row on its way somewhere else does not open it, and short enough that a pointer
 * that stops on a row does not feel like it is waiting.
 *
 * 400ms to CLOSE, and the asymmetry is the whole point. Baymard's usability testing puts the
 * hover-menu delay at 300-500ms and reports that 60% of the sites they tested get it wrong, with
 * flicker — menus opening and closing as the pointer crosses them — as the failure mode. Leaving is
 * far more often accidental than entering: the pointer clips a corner on the way to a child row, or
 * overshoots by three pixels. 400ms is the middle of that band and gives the pointer time to come
 * back without the content having moved. Radix's own `skipDelayDuration` (300ms) is the same idea
 * from the other side.
 *
 * Deliberately NOT a "mouse path" / safe-triangle implementation, which Smashing Magazine's survey
 * of mega-dropdown patterns describes as the next step up. That technique predicts whether the
 * pointer is travelling TOWARD the open panel and suppresses the close while it is. It earns its
 * complexity on a horizontal mega-menu, where the panel is diagonally down-and-across from the
 * trigger and a straight-line path leaves the trigger immediately. Neither control here has that
 * geometry: the sidebar's children open directly BELOW their parent and inside the same <li>, and
 * the Copy page panel is directly below its trigger. The pointer path from trigger to content does
 * not leave the hover region, so there is nothing for a triangle to protect.
 *
 * ── WHAT THE HOOK REFUSES TO DO ─────────────────────────────────────────────────────────────
 *
 * Nothing happens for a pointer that is not a real hovering mouse. Two independent guards, because
 * they catch different things:
 *   - `event.pointerType !== 'mouse'` rejects the touch and pen events that a touchscreen laptop
 *     fires at a device that ALSO has a mouse, where a media query cannot help because the media
 *     query is true.
 *   - `(hover: hover) and (pointer: fine)` rejects devices whose primary pointer cannot hover at
 *     all, where a browser may still synthesise mouse events after a tap. Without it, a tap on a
 *     category on a phone would arm a 200ms timer and then expand something the user did not ask
 *     for, 200ms after they had already moved on.
 *
 * ── WCAG 1.4.13, AND WHY ONLY ONE OF THE TWO CALLERS HAS WORK TO DO ─────────────────────────
 *
 * 1.4.13 (Content on Hover or Focus) asks for three things of hover-revealed content: it must be
 * dismissible without moving the pointer, hoverable (the pointer can move onto it without it
 * vanishing), and persistent (it stays until dismissed or the pointer leaves).
 *
 *   Hoverable   Satisfied structurally by both callers, and by the 400ms close delay for the one
 *               case with a gap to cross. This is what the close delay is FOR, in conformance
 *               terms, not only in feel.
 *   Persistent  Satisfied: nothing here closes on a timer while the pointer is still inside.
 *   Dismissible The sidebar category is EXEMPT — the criterion's own exception covers additional
 *               content that "does not obscure or replace other content", and an expanding tree
 *               node reflows the list below it rather than covering anything. The Copy page menu
 *               is NOT exempt: it is a fixed-position panel drawn over the article, so it needs an
 *               Escape key, and it already had one as part of the APG menu-button pattern it
 *               implements. Nothing in this module weakens that.
 *
 * Hover is never the ONLY way to reach either control. Both keep their click handlers and their
 * keyboard paths untouched; this is an accelerator laid over them, which is the only form of
 * hover-activation that is safe to add.
 */
import {useCallback, useEffect, useMemo, useRef} from 'react';

/* ── THE POINTER TRACKER: "did the user move, or did the page?" ──────────────────────────────
 *
 * A `pointerenter` does NOT mean the pointer arrived somewhere. It means the topmost element
 * under the pointer changed, and that happens for two completely different reasons:
 *
 *     the pointer moved onto a row      <- intent
 *     a row moved under the pointer     <- not intent
 *
 * Only the first is a request to open something. The second is the page rearranging itself, and
 * acting on it is how a hover-open cascades: expanding a category pushes every row below it down,
 * a hover-close 400ms later pulls them back up, and each of those shifts drags fresh rows under a
 * motionless cursor. Every one of them used to arm its own 200ms open. The reported symptom was a
 * pointer that "ends up on another parent item, and so it expands" — which is exactly this, seen
 * from the outside.
 *
 * The two cases are told apart by coordinates, and the event ordering is what makes it reliable.
 * When a pointer genuinely crosses a boundary the browser fires `pointerover` for the new element
 * BEFORE the `pointermove` at that position, so at handler time the last recorded move still holds
 * the PREVIOUS position and differs from the event's. When layout moves under a still pointer there
 * is no `pointermove` at all, so the last recorded move is the event's own position. Identical
 * coordinates therefore mean the pointer has not moved, and the enter is the page's doing.
 *
 * Deliberately only gates OPENING. A `pointerleave` caused by a row sliding away is still a real
 * departure — the pointer genuinely is not on that row any more — and closing what hover opened is
 * the correct response. Opening is the surprising, destructive direction, so it is the one that has
 * to prove intent.
 *
 * One document-level listener, installed once, `passive` and in the capture phase so nothing can
 * stop it reaching us. It is never removed: it outlives every component that reads it, costs one
 * property write per move, and reinstalling it per mount would be more work than it saves. */
let lastMoveX: number | null = null;
let lastMoveY: number | null = null;
let trackerInstalled = false;

function installPointerTracker(): void {
  if (trackerInstalled || typeof document === 'undefined') {
    return;
  }
  trackerInstalled = true;
  document.addEventListener(
    'pointermove',
    (event: PointerEvent) => {
      lastMoveX = event.clientX;
      lastMoveY = event.clientY;
    },
    {capture: true, passive: true},
  );
}

/**
 * True when this enter was produced by the pointer moving, rather than by the page moving under it.
 *
 * Fails OPEN when no movement has been recorded yet (`lastMoveX` null): with no evidence either way
 * the honest default is to let the hover work, and by the time a reader has reached the sidebar the
 * tracker has always seen movement. An event with no coordinates — which some test utilities and
 * synthetic dispatches produce — is treated the same way, for the same reason.
 */
function movedHere(event: {clientX?: number; clientY?: number}): boolean {
  if (lastMoveX === null || event.clientX === undefined || event.clientY === undefined) {
    return true;
  }
  return event.clientX !== lastMoveX || event.clientY !== lastMoveY;
}

/** Radix UI's `NavigationMenu.delayDuration` default. See the module header. */
export const HOVER_INTENT_OPEN_MS = 200;

/** The middle of Baymard's measured 300-500ms band. See the module header. */
export const HOVER_INTENT_CLOSE_MS = 400;

/**
 * Returns pointer handlers that call `open` after 200ms of sustained hover and `close` after 400ms
 * of sustained absence, and a `cancel` for callers that need to abandon a pending change when
 * something else settles the state first — a click, a route change, a focus move.
 *
 * ONE TIMER, NOT TWO. Enter and leave share it, so the pending action is always the most recent
 * intent and the two can never race. A pointer that leaves and comes back inside the close window
 * cancels the close and, finding the region already open, schedules nothing.
 *
 * `open` and `close` are read from a ref rather than captured, so a caller may pass a fresh closure
 * on every render — which both callers do, because both close over React state — without the
 * handlers changing identity and without a stale callback firing 400ms later.
 */
/** The slice of a pointer event this hook reads. Widened from `pointerType` alone when the
 *  tracker above was added: telling a real move from a layout shift needs the coordinates. */
type PointerIntentEvent = {pointerType?: string; clientX?: number; clientY?: number};

export function useHoverIntent({
  open,
  close,
  openDelay = HOVER_INTENT_OPEN_MS,
  closeDelay = HOVER_INTENT_CLOSE_MS,
}: {
  open: () => void;
  close: () => void;
  openDelay?: number;
  closeDelay?: number;
}): {
  onPointerEnter: (event: PointerIntentEvent) => void;
  onPointerLeave: (event: PointerIntentEvent) => void;
  cancel: () => void;
} {
  installPointerTracker();

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callbacks = useRef({open, close});
  callbacks.current = {open, close};

  const cancel = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);

  // A pending timer outlives the element without this: navigate away mid-delay and the callback
  // still fires, into a component React has already unmounted.
  useEffect(() => cancel, [cancel]);

  const schedule = useCallback(
    (run: () => void, delay: number) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = undefined;
        run();
      }, delay);
    },
    [cancel],
  );

  const isHoveringPointer = (event: {pointerType?: string}) =>
    // `pointerType` is undefined on the synthetic events some test utilities dispatch; treating that
    // as a mouse keeps those usable, and the media query below is the real gate on touch hardware.
    (event.pointerType === undefined || event.pointerType === 'mouse') &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const onPointerEnter = useCallback(
    (event: PointerIntentEvent) => {
      if (!isHoveringPointer(event)) {
        return;
      }
      /* The page moved, not the pointer — see the tracker at the head of this file. Nothing is
       * scheduled AND nothing pending is cancelled: a layout shift is not a signal in either
       * direction, so the correct response is to be entirely inert. */
      if (!movedHere(event)) {
        return;
      }
      schedule(() => callbacks.current.open(), openDelay);
    },
    [schedule, openDelay],
  );

  const onPointerLeave = useCallback(
    (event: PointerIntentEvent) => {
      if (!isHoveringPointer(event)) {
        return;
      }
      schedule(() => callbacks.current.close(), closeDelay);
    },
    [schedule, closeDelay],
  );

  /* MEMOISED, and not as a micro-optimisation. Callers put this object in effect dependency
   * arrays — the sidebar category does, to cancel a pending change the moment a route makes the
   * expansion the reader's rather than hover's. A fresh object every render would re-run that
   * effect every render and cancel timers that were still legitimately in flight. The three
   * members are already stable, so the only thing that was unstable was the wrapper. */
  return useMemo(
    () => ({onPointerEnter, onPointerLeave, cancel}),
    [onPointerEnter, onPointerLeave, cancel],
  );
}
