import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type FocusEvent as ReactFocusEvent,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import styles from '../css/copy-page-button.module.scss';
import {useHoverIntent} from './hoverIntent';

// --- TYPES ---

type ActionId = 'copy' | 'view' | 'chatgpt' | 'claude';

interface DropdownItem {
  id: ActionId;
  title: string;
  description: string;
  icon: JSX.Element;
  action: () => void;
}

interface DropdownPosition {
  top: number;
  left: number;
  /**
   * Cap that keeps the panel inside the viewport when it is taller than the space
   * available. `null` until the panel has been measured and placed, which is the
   * only state in which the panel renders uncapped.
   */
  maxHeight: number | null;
}

/** Transient result of the "Copy page" action. Drives both the trigger label and the live region. */
type CopyState = 'idle' | 'copied' | 'failed';

// --- CONFIGS ---

const CONFIG = {
  MOBILE_BREAKPOINT: 767,
  DROPDOWN_OFFSET: 8,
  DROPDOWN_WIDTH: 300,
  // Gutter kept between the fixed panel and either viewport edge. Without it the
  // panel opened 37.3px off-screen at 360px on the 30 pages that also carry the
  // PDF button, and `position: fixed` means it cannot be scrolled back into view.
  VIEWPORT_MARGIN: 8,
  // Matches JsonBlock's copy feedback window so the two copy affordances announce
  // for the same duration (UI audit 2026-08-07, section 4.6: one contract, not three).
  FEEDBACK_MS: 1500,
  DEBUG: process.env.NODE_ENV === 'development',
  MIN_CONTENT_LENGTH: 100,
};

// The trigger label swaps between these. All three are rendered at once, stacked in
// one grid cell by .copyPageText / .copyPageTextLayer* (copy-page-button.module.scss),
// so the box is sized by the widest layer and the swap cannot resize the button. That
// file's comment on those rules carries the measurements and the reasoning.
// Both feedback labels are deliberately SHORTER than "Copy page", so the widest layer
// is the resting one and the button's measured resting width does not grow.
const TRIGGER_LABELS: ReadonlyArray<readonly [CopyState, string]> = [
  ['idle', 'Copy page'],
  // JsonBlock's visible success/failure pair, verbatim (audit item 8a).
  ['copied', 'Copied'],
  ['failed', 'Failed'],
];

// Spoken, not shown. Deliberately longer than the visible label: the trigger holds
// focus while this fires, so an identical string would risk being heard twice — once
// as the focused element's changed accessible name, once from the live region.
const STATUS_MESSAGES: Record<Exclude<CopyState, 'idle'>, string> = {
  copied: 'Page copied',
  failed: 'Copy failed',
};

// This component is server-rendered (it is mounted from src/theme/Heading), and React
// warns when useLayoutEffect runs on the server. The effect's body only has work to do
// while the panel is open, i.e. only in a browser, so the variant is chosen once at
// module scope where the choice cannot break the rules of hooks.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

// Static selectors for content cleanup
const DEFAULT_SELECTORS_TO_REMOVE = [
  '.theme-edit-this-page',
  '.theme-last-updated',
  '.pagination-nav',
  '.theme-doc-breadcrumbs',
  '.theme-doc-footer',
  'button',
  '.copy-code-button',
  '.buttonGroup',
  '.clean-btn',
  '.theme-code-block-title',
  '.line-number',
  // aria-hidden content is by definition not page content, so it has no business in the
  // copied markdown or in the ChatGPT/Claude payloads. The case that prompted this: the
  // variant dropdown renders an invisible `.variant-select__sizer` <span> holding EVERY
  // option label (that is how the control is sized -- VariantSelect.tsx:238), and the
  // <select> then renders an <option> per label. So the export emitted every label TWICE,
  // followed by only the default variant's body -- a list of scenario names detached from
  // the single payload shown, which is worse than omitting the control.
  //
  // MEASURED COLLATERAL, so nobody has to re-derive it. On a representative page there are
  // 74 aria-hidden nodes inside <article>, 72 of them top level. Removing them drops: the
  // sizer (the point); ~60 empty spacer <span>s and decorative <svg>s; the SchemaTable
  // legend ("* required / not applicable / Colored badge = JSON type"); and the row-number
  // gutter. The gutter goes as a WHOLE COLUMN -- `.schema-ln-head` and every `.schema-ln`
  // cell are all aria-hidden -- so the markdown table stays aligned rather than losing a
  // cell per row. The JSON payload and the field names are NOT aria-hidden and survive;
  // that was checked against the built HTML with a real DOM, not a regex.
  '[aria-hidden="true"]',
];

const DEFAULT_CONTENT_SELECTORS = [
  'main article',
  'main .markdown',
  'main',
  'article',
  '.main-wrapper',
  '[role="main"]',
] as const;

// --- UTILS ---

const log = (...args: any[]) => {
  if (CONFIG.DEBUG) {
    console.log('[CopyPageButton]', ...args);
  }
};

// Text cleaning
const cleanSpecialChars = (text: string): string => {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/â€‹/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Note: the extracted page content is Markdown consumed only by text sinks —
// clipboard `writeText`, a `text/plain` Blob opened in a tab, and a URL-encoded
// prompt — never an HTML sink. No HTML sanitization is applied here: a regex
// HTML stripper would be unnecessary for safety in these sinks and would also
// corrupt legitimate Markdown (e.g. docs pages that contain literal `<script>`
// or `on*=` attribute code samples). Encode/escape at each sink instead.

// --- CONTENT EXTRACTION ---

const findContentElement = (): HTMLElement | null => {
  for (const selector of DEFAULT_CONTENT_SELECTORS) {
    const element = document.querySelector(selector);
    if (
      element?.textContent &&
      element.textContent.trim().length > CONFIG.MIN_CONTENT_LENGTH
    ) {
      log('Found content with selector:', selector);
      return element as HTMLElement;
    }
  }
  return null;
};

const extractCodeContent = (codeElement: HTMLElement): string => {
  // 1: Data attributes
  const dataContent =
    codeElement.getAttribute('data-code') ||
    codeElement.getAttribute('data-raw');
  if (dataContent) return dataContent;

  // 2: Line-based elements
  const lineSelectors =
    'span[data-line], .token-line, .code-line, .highlight-line';
  const codeLines = codeElement.querySelectorAll(lineSelectors);
  if (codeLines.length > 0) {
    return Array.from(codeLines)
      .map((line) => line.textContent || '')
      .join('\n');
  }

  // 3: Div-based structure
  const codeLineDivs = codeElement.querySelectorAll('div');
  if (codeLineDivs.length > 0) {
    return Array.from(codeLineDivs)
      .filter((div) => {
        const className = div.className || '';
        return (
          !className.includes('codeLineNumber') &&
          !className.includes('LineNumber') &&
          !className.includes('line-number') &&
          div.style?.userSelect !== 'none'
        );
      })
      .map((div) => div.textContent || '')
      .join('\n');
  }

  // 4: Direct text
  return (codeElement.textContent || '')
    .replace(/^\d+\s+/gm, '') // Remove line numbers
    .replace(/^Copy$/gm, '')
    .replace(/^Copied!$/gm, '')
    .replace(/^\s*Copy to clipboard\s*$/gm, '');
};

export default function CopyPageButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({
    top: 0,
    left: 0,
    maxHeight: null,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Roving focus: every menuitem is tabIndex={-1} and focus is moved programmatically,
  // which is the APG menu pattern. Indices line up with `dropdownItems`.
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Set by the trigger's Arrow keys, consumed by the layout effect below — the panel
  // does not exist yet at the moment the key is pressed (it is behind `{isOpen && …}`).
  const pendingFocusRef = useRef<'first' | 'last' | null>(null);
  const feedbackTimersRef = useRef<number[]>([]);
  const menuId = useId();

  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const focusItemAt = useCallback((index: number) => {
    const items = itemRefs.current.filter(
      (el): el is HTMLButtonElement => el !== null,
    );
    if (items.length === 0) return;
    // Wraps in both directions, so -1 is "last" and count is "first".
    const wrapped = ((index % items.length) + items.length) % items.length;
    const item = items[wrapped];
    // preventScroll: the panel is `position: fixed`, so scrolling the PAGE cannot
    // reveal any part of it — and a page scroll closes the menu, swallowing the
    // keypress that asked for the focus move. The panel itself does scroll when the
    // layout effect below has had to cap its height, so bring the item into view by
    // hand instead (WCAG 2.4.11); the close listener ignores scrolls raised inside
    // the panel, so this cannot close the menu.
    item.focus({ preventScroll: true });
    const panel = dropdownRef.current;
    if (!panel) return;
    // offsetTop is measured from the panel's padding box — `position: fixed` makes
    // the panel every item's offsetParent — which is the same origin as scrollTop.
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    if (itemTop < panel.scrollTop) {
      panel.scrollTop = itemTop;
    } else if (itemBottom > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = itemBottom - panel.clientHeight;
    }
  }, []);

  const closeAndRestoreFocus = useCallback(() => {
    setIsOpen(false);
    buttonRef.current?.focus();
  }, []);

  // Position the panel, then keep it honest: it is `position: fixed`, so a scroll
  // detaches it from its trigger (measured: a 608px gap after a 566px scroll) and a
  // resize can strand it off-screen. Both listeners are passive — neither calls
  // preventDefault — so they cannot block scrolling. useLayoutEffect, not useEffect:
  // the panel mounts at 0,0 and the corrected position must land before paint.
  useIsomorphicLayoutEffect(() => {
    if (!isOpen) return undefined;

    const place = (): void => {
      const trigger = buttonRef.current;
      if (!trigger) return;
      const panel = dropdownRef.current;
      const rect = trigger.getBoundingClientRect();
      // offsetWidth, not getBoundingClientRect().width: the panel's entry transition
      // animates `scale` from 0.98 (copy-page-button.module.scss @starting-style) and a
      // bounding rect is post-transform. offsetWidth is the untransformed layout box, so
      // the clamp below stays correct no matter when this runs.
      const width = panel?.offsetWidth || CONFIG.DROPDOWN_WIDTH;
      const isMobile = window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
      const preferred = isMobile ? rect.left : rect.right - width;
      const maxLeft = window.innerWidth - width - CONFIG.VIEWPORT_MARGIN;

      // Vertical, with the same 8px reserve the horizontal clamp keeps. Below the
      // trigger is the resting placement; flip above only when below overflows and
      // the flip itself fits; then clamp, which is what covers the case where the
      // panel fits on neither side. That case is real: at the 1.4.10 reflow target
      // of 320x256 the panel measured 240.6px, started at y=152.8 and ran 137.4px
      // past the fold, and since roving focus can put focus on those rows — on a
      // `position: fixed` panel that no scroll can bring back — they were obscured
      // outright (WCAG 2.4.11). The 2026-08-16 type contract makes that panel
      // TALLER, not shorter: four rows of 0.75rem/1rem padding, a 0.875rem/1.25
      // title, a 0.125rem gap and a 0.8125rem/1.4 description, plus three internal
      // hairlines and the panel's own two borders, is 251.8px at a 16px root. The
      // overrun therefore grows and the argument holds a fortiori. Both figures are
      // illustrative only — the clamp reads scrollHeight at runtime, so it tracks
      // the real box at whatever root the reader is using.
      const viewport = window.innerHeight;
      const maxHeight = Math.max(0, viewport - CONFIG.VIEWPORT_MARGIN * 2);
      // scrollHeight plus the borders (offsetHeight - clientHeight), not offsetHeight:
      // a previous open leaves its own maxHeight in state, so offsetHeight can report
      // that capped box rather than the height the panel actually wants. scrollHeight
      // is the content height either way.
      const height = panel
        ? Math.min(
            panel.scrollHeight + (panel.offsetHeight - panel.clientHeight),
            maxHeight,
          )
        : 0;
      const below = rect.bottom + CONFIG.DROPDOWN_OFFSET;
      const above = rect.top - CONFIG.DROPDOWN_OFFSET - height;
      const flip =
        below + height > viewport - CONFIG.VIEWPORT_MARGIN &&
        above >= CONFIG.VIEWPORT_MARGIN;
      const top = Math.max(
        CONFIG.VIEWPORT_MARGIN,
        Math.min(flip ? above : below, viewport - CONFIG.VIEWPORT_MARGIN - height),
      );

      // The cap also goes straight onto the node: the pending open-time focus below
      // runs in this same effect, one commit before React applies the state, and
      // focusItemAt needs the panel's final clientHeight to scroll an item into view.
      // The state carries the same number, so whether React rewrites the property on
      // that commit or skips it as unchanged, the node ends up with this exact cap.
      if (panel) panel.style.maxHeight = `${maxHeight}px`;

      setDropdownPosition({
        top,
        left: Math.max(CONFIG.VIEWPORT_MARGIN, Math.min(preferred, maxLeft)),
        maxHeight,
      });
    };

    place();

    if (pendingFocusRef.current) {
      focusItemAt(pendingFocusRef.current === 'last' ? -1 : 0);
      pendingFocusRef.current = null;
    }

    // A scroll INSIDE the panel is the panel doing its job, not the page moving out
    // from under it; only the latter should close. Element scroll events do not
    // bubble, but a capturing window listener is on their propagation path all the
    // same, so the panel has to be excluded explicitly.
    const closeOnScroll = (event: Event): void => {
      const target = event.target as Node | null;
      if (target && dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const closeOnResize = (): void => setIsOpen(false);
    window.addEventListener('scroll', closeOnScroll, {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', closeOnResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', closeOnScroll, { capture: true });
      window.removeEventListener('resize', closeOnResize);
    };
  }, [isOpen, focusItemAt]);

  // Clear any pending feedback timer on unmount (route changes unmount the Heading).
  const clearFeedbackTimers = useCallback(() => {
    feedbackTimersRef.current.forEach((id) => window.clearTimeout(id));
    feedbackTimersRef.current = [];
  }, []);

  useEffect(() => clearFeedbackTimers, [clearFeedbackTimers]);

  const flashFeedback = useCallback(
    (next: Exclude<CopyState, 'idle'>) => {
      clearFeedbackTimers();
      // Blank the live region first and set the message on the next tick: role="status"
      // announces a *change* of text content, so copying twice in a row would otherwise
      // be silent the second time. Same trick, same reason, as JsonBlock.tsx.
      setCopyState('idle');
      feedbackTimersRef.current.push(
        window.setTimeout(() => setCopyState(next), 0),
      );
      feedbackTimersRef.current.push(
        window.setTimeout(() => setCopyState('idle'), CONFIG.FEEDBACK_MS),
      );
    },
    [clearFeedbackTimers],
  );

  /* ── HOVER OPENS THE MENU, AND MAY ONLY CLOSE WHAT IT OPENED ────────────────────────
   *
   * The timing (200ms in, 400ms out) and the research behind it live in
   * src/components/hoverIntent.ts, and the sidebar's collapsible categories read the same hook —
   * so the two hover-openable controls on a docs page open at one speed rather than two.
   * What is decided HERE is the scope.
   *
   * `openedByHover` is the whole rule. A menu the user CLICKED open stays open when the pointer
   * wanders off to read the page: undoing an explicit action because the mouse moved is the
   * behaviour that makes hover menus feel hostile. A menu hover opened is hover's to close.
   *
   * FOCUS OUTRANKS THE POINTER. A keyboard user can be inside this menu with the pointer parked
   * anywhere on screen, and a 400ms timer must not close a menu somebody is arrowing through.
   * `handleWidgetBlur` already owns closing when focus leaves; this defers to it rather than
   * racing it.
   *
   * NOTHING SETS `pendingFocusRef`. Opening by hover deliberately does not move focus — the pointer
   * has not asked for the caret, and taking it would drag a keyboard user to a menu they never
   * touched. Click and the arrow keys keep their own focus behaviour untouched.
   *
   * THE HANDLERS GO ON BOTH HALVES OF THE WIDGET, because it has two: the trigger's container, and
   * the panel, which is `position: fixed` and a DOM sibling rather than a child. Crossing between
   * them fires leave on one and enter on the other, and since useHoverIntent keeps a SINGLE timer
   * the second cancels the first — so the close never fires for a pointer travelling into the menu.
   * That is the 1.4.13 "hoverable" requirement, which for this control is a real obligation and not
   * an exempt one: unlike a sidebar category, this panel is drawn OVER the article. Its Escape key,
   * which 1.4.13 also wants, was already there as part of the APG menu-button pattern. */
  const openedByHover = useRef(false);
  const hover = useHoverIntent({
    open: () => {
      if (isOpen) {
        return;
      }
      openedByHover.current = true;
      setIsOpen(true);
    },
    close: () => {
      if (!openedByHover.current) {
        return;
      }
      const active =
        typeof document === 'undefined' ? null : document.activeElement;
      if (
        active &&
        (dropdownRef.current?.contains(active) ||
          buttonRef.current?.contains(active))
      ) {
        return;
      }
      openedByHover.current = false;
      setIsOpen(false);
    },
  });

  /* Any explicit open or close — click, Enter, Space, the arrow keys, Escape, an item being
   * activated — settles ownership: hover no longer has a claim on the result, and any timer still
   * in flight is dropped so it cannot undo what was just asked for. */
  const settleHoverOwnership = useCallback(() => {
    openedByHover.current = false;
    hover.cancel();
  }, [hover]);

  // Enter and Space do not reach a keydown handler as themselves — the browser turns
  // them into a `click` on a <button>. `detail` is the only reliable discriminator: 0
  // for a keyboard-synthesised click, >= 1 for a real pointer press. APG wants keyboard
  // activation to open the menu AND land on the first item; a mouse click should leave
  // focus where the user put it.
  const handleTriggerClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (!isOpen && event.detail === 0) {
        pendingFocusRef.current = 'first';
      }
      settleHoverOwnership();
      setIsOpen(!isOpen);
    },
    [isOpen, settleHoverOwnership],
  );

  // APG menu-button keys on the trigger. Enter and Space are handled by the click above.
  const handleTriggerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); // Arrow keys otherwise scroll the page
        settleHoverOwnership();
        const target = event.key === 'ArrowDown' ? 'first' : 'last';
        if (isOpen) {
          focusItemAt(target === 'last' ? -1 : 0);
        } else {
          pendingFocusRef.current = target;
          setIsOpen(true);
        }
        return;
      }
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        settleHoverOwnership();
        setIsOpen(false); // focus is already on the trigger; leave it there
      }
    },
    [focusItemAt, isOpen, settleHoverOwnership],
  );

  // APG menu keys on the panel. Items are tabIndex={-1}, so Tab leaves the menu
  // outright; forward Tab lands outside the widget and handleWidgetBlur below closes
  // it, but Shift+Tab lands on the trigger, which that handler reads as focus staying
  // inside — hence the explicit case here.
  const handleMenuKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const items = itemRefs.current.filter(
        (el): el is HTMLButtonElement => el !== null,
      );
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLButtonElement);

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          focusItemAt(current + 1); // current === -1 (focus on the panel) lands on the first
          break;
        case 'ArrowUp':
          event.preventDefault();
          focusItemAt(current < 0 ? -1 : current - 1);
          break;
        case 'Home':
          event.preventDefault();
          focusItemAt(0);
          break;
        case 'End':
          event.preventDefault();
          focusItemAt(-1);
          break;
        case 'Tab':
          // APG: Tab in either direction closes the menu and moves focus on. Forward
          // Tab is left to the browser — its own move is already the right one and
          // cancelling it would trap focus. Shift+Tab would otherwise leave the panel
          // mounted with aria-expanded="true" behind a focused trigger, so take the
          // same move the browser would have made (items are not in the tab sequence
          // and the panel follows the trigger, so the trigger is where it lands) and
          // close with it. A further Shift+Tab from the trigger then leaves the widget.
          if (event.shiftKey) {
            event.preventDefault();
            closeAndRestoreFocus();
          }
          break;
        case 'Escape':
          event.preventDefault();
          closeAndRestoreFocus();
          break;
        default:
          break;
      }
    },
    [closeAndRestoreFocus, focusItemAt],
  );

  // Focusout on either half of the widget. The trigger and the panel are siblings in
  // two separate subtrees, so this is bound to both; membership is tested against both
  // refs either way. Closing here is what stops Tab from leaving an open menu behind.
  const handleWidgetBlur = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      const next = event.relatedTarget as Node | null;
      if (
        next &&
        (dropdownRef.current?.contains(next) ||
          buttonRef.current?.contains(next))
      ) {
        return;
      }
      setIsOpen(false);
    },
    [],
  );

  const convertToMarkdown = useCallback((element: HTMLElement): string => {
    const cleanText = (text: string) => cleanSpecialChars(text);

    const processNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return cleanText(node.textContent || '');
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const childResults = Array.from(node.childNodes).map((child) =>
          processNode(child),
        );

        const children = childResults
          .reduce((acc: string[], current: string, i: number) => {
            if (!current) return acc;

            const previous = i > 0 ? childResults[i - 1] : '';
            const needsSpace =
              previous &&
              !previous.match(/[\s\n]$/) &&
              !current.match(/^[\s\n]/) &&
              previous.trim() &&
              current.trim();

            if (needsSpace && acc.length > 0) {
              acc.push(' ');
            }
            acc.push(current);
            return acc;
          }, [])
          .join('');

        switch (tag) {
          case 'h1':
            return `\n# ${children.trim()}\n\n`;
          case 'h2':
            return `\n## ${children.trim()}\n\n`;
          case 'h3':
            return `\n### ${children.trim()}\n\n`;
          case 'h4':
            return `\n#### ${children.trim()}\n\n`;
          case 'h5':
            return `\n##### ${children.trim()}\n\n`;
          case 'h6':
            return `\n###### ${children.trim()}\n\n`;
          case 'p':
            return children.trim() ? `${children.trim()}\n\n` : '\n';
          case 'strong':
          case 'b':
            return `**${children}**`;
          case 'em':
          case 'i':
            return `*${children}*`;
          case 'code':
            if (el.parentElement?.tagName.toLowerCase() === 'pre') {
              return children;
            }
            return `\`${cleanSpecialChars(children)}\``;
          case 'pre':
            const codeElement = el.querySelector('code');
            if (codeElement) {
              const language =
                (codeElement.className?.match(/language-(\w+)/) ||
                  el.className?.match(/language-(\w+)/) ||
                  codeElement.className?.match(/hljs-(\w+)/) ||
                  codeElement.className?.match(/prism-(\w+)/) ||
                  [])[1] || '';

              const codeContent = cleanSpecialChars(
                extractCodeContent(codeElement),
              ).replace(/^\n+|\n+$/g, '');

              return `\n\`\`\`${language}\n${codeContent}\n\`\`\`\n\n`;
            }
            return `\n\`\`\`\n${children}\n\`\`\`\n\n`;
          case 'ul':
            return `\n${children}`;
          case 'ol':
            const items = Array.from(el.querySelectorAll('li'));
            return (
              '\n' +
              items
                .map(
                  (item, index) =>
                    `${index + 1}. ${processNode(item)
                      .replace(/^- /, '')
                      .trim()}\n`,
                )
                .join('')
            );
          case 'li':
            return `- ${children.trim()}\n`;
          case 'a':
            const href = el.getAttribute('href');
            if (href && !href.startsWith('#') && children.trim()) {
              return `[${children.trim()}](${href})`;
            }
            return children;
          case 'br':
            return '\n';
          case 'blockquote':
            return `\n> ${children.trim()}\n\n`;
          case 'table':
            return `\n${children}\n`;
          case 'tr':
            return `${children}\n`;
          case 'th':
          case 'td':
            return `| ${children.trim()} `;
          case 'img':
            const src = el.getAttribute('src');
            const alt = el.getAttribute('alt') || '';
            return src ? `![${alt}](${src})` : '';
          case 'div':
          case 'section':
          case 'article':
            if (el.classList?.contains('admonition')) {
              const type =
                Array.from(el.classList)
                  .find((cls) => cls.startsWith('alert--'))
                  ?.replace('alert--', '') || 'note';
              return `\n> **${type.toUpperCase()}**: ${children.trim()}\n\n`;
            }
            return children + '\n';
          default:
            return children;
        }
      }

      return '';
    };

    return processNode(element)
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+|\n+$/g, '')
      .trim();
  }, []);

  const extractPageContent = useCallback(() => {
    log('Extracting page content...');
    const mainContent = findContentElement();
    if (!mainContent) {
      log('No main content found on page');
      return '';
    }

    const clone = mainContent.cloneNode(true) as HTMLElement;

    DEFAULT_SELECTORS_TO_REMOVE.forEach((selector) => {
      try {
        clone.querySelectorAll(selector).forEach((el) => el.remove());
      } catch (err) {
        log('Error removing selector:', selector, err);
      }
    });

    const firstH1 = clone.querySelector('h1');
    const title = firstH1?.textContent?.trim() || 'Documentation Page';
    log('Extracted title:', title);
    if (firstH1) {
      firstH1.remove();
    }

    const content = convertToMarkdown(clone);
    const currentUrl = window.location.href;
    const finalContent = `# ${title}\n\nURL: ${currentUrl}\n\n${content}`;

    return finalContent;
  }, [convertToMarkdown]);

  const getPageContent = useCallback(() => {
    return extractPageContent();
  }, [extractPageContent]);

  const copyToClipboard = useCallback(async () => {
    const content = getPageContent();

    // Every exit below reports: `log()` is compiled out in production (CONFIG.DEBUG),
    // so before this the whole action — including a rejected writeText — was silent.
    if (!content || content.trim() === '') {
      log('Failed to extract content');
      flashFeedback('failed');
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        log('Content copied to clipboard successfully');
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        const succeeded = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!succeeded) {
          // execCommand reports failure by return value, not by throwing.
          throw new Error('document.execCommand("copy") returned false');
        }
        log('Content copied to clipboard using fallback method');
      }
      flashFeedback('copied');
    } catch (err) {
      log('Failed to copy to clipboard:', err);
      flashFeedback('failed');
    }
  }, [flashFeedback, getPageContent]);

  const openInAI = useCallback((baseUrl: string) => {
    try {
      const currentUrl = window.location.href;
      const prompt = encodeURIComponent(
        `Please read and explain this documentation page: ${currentUrl}

Please provide a clear summary and help me understand the key concepts covered in this documentation.`,
      );
      window.open(`${baseUrl}?q=${prompt}`, '_blank');
      log('Opened AI tool with prompt');
    } catch (err) {
      log('Failed to open AI tool:', err);
    }
  }, []);

  const viewAsMarkdown = useCallback(() => {
    const content = getPageContent();

    if (!content || content.trim() === '') {
      log('Failed to extract content');
      return;
    }

    try {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      log('Opened markdown view');
    } catch (err) {
      log('Failed to open markdown view:', err);
    }
  }, [getPageContent]);

  const dropdownItems: DropdownItem[] = useMemo(() => [
    {
      id: 'copy',
      title: 'Copy Page',
      description: 'Copy the page as Markdown for LLMs',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      ),
      action: copyToClipboard,
    },
    {
      id: 'view',
      title: 'View as Markdown',
      description: 'View this page as plain text',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
      ),
      action: viewAsMarkdown,
    },
    {
      id: 'chatgpt',
      title: 'Open in ChatGPT',
      description: 'Ask questions about this page',
      icon: (
        <svg
          width="16"
          height="16"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          strokeWidth="1.5"
          viewBox="-0.17090198558635983 0.482230148717937 41.14235318283891 40.0339509076386"
        >
          <path
            d="M37.532 16.87a9.963 9.963 0 0 0-.856-8.184 10.078 10.078 0 0 0-10.855-4.835A9.964 9.964 0 0 0 18.306.5a10.079 10.079 0 0 0-9.614 6.977 9.967 9.967 0 0 0-6.664 4.834 10.08 10.08 0 0 0 1.24 11.817 9.965 9.965 0 0 0 .856 8.185 10.079 10.079 0 0 0 10.855 4.835 9.965 9.965 0 0 0 7.516 3.35 10.078 10.078 0 0 0 9.617-6.981 9.967 9.967 0 0 0 6.663-4.834 10.079 10.079 0 0 0-1.243-11.813zM22.498 37.886a7.474 7.474 0 0 1-4.799-1.735c.061-.033.168-.091.237-.134l7.964-4.6a1.294 1.294 0 0 0 .655-1.134V19.054l3.366 1.944a.12.12 0 0 1 .066.092v9.299a7.505 7.505 0 0 1-7.49 7.496zM6.392 31.006a7.471 7.471 0 0 1-.894-5.023c.06.036.162.099.237.141l7.964 4.6a1.297 1.297 0 0 0 1.308 0l9.724-5.614v3.888a.12.12 0 0 1-.048.103l-8.051 4.649a7.504 7.504 0 0 1-10.24-2.744zM4.297 13.62A7.469 7.469 0 0 1 8.2 10.333c0 .068-.004.19-.004.274v9.201a1.294 1.294 0 0 0 .654 1.132l9.723 5.614-3.366 1.944a.12.12 0 0 1-.114.01L7.04 23.856a7.504 7.504 0 0 1-2.743-10.237zm27.658 6.437l-9.724-5.615 3.367-1.943a.121.121 0 0 1 .113-.01l8.052 4.648a7.498 7.498 0 0 1-1.158 13.528v-9.476a1.293 1.293 0 0 0-.65-1.132zm3.35-5.043c-.059-.037-.162-.099-.236-.141l-7.965-4.6a1.298 1.298 0 0 0-1.308 0l-9.723 5.614v-3.888a.12.12 0 0 1 .048-.103l8.05-4.645a7.497 7.497 0 0 1 11.135 7.763zm-21.063 6.929l-3.367-1.944a.12.12 0 0 1-.065-.092v-9.299a7.497 7.497 0 0 1 12.293-5.756 6.94 6.94 0 0 0-.236.134l-7.965 4.6a1.294 1.294 0 0 0-.654 1.132l-.006 11.225zm1.829-3.943l4.33-2.501 4.332 2.5v5l-4.331 2.5-4.331-2.5V18z"
            fill="currentColor"
          />
        </svg>
      ),
      action: () => openInAI('https://chat.openai.com/'),
    },
    {
      id: 'claude',
      title: 'Open in Claude',
      description: 'Ask questions about this page',
      icon: (
        <svg
          width="16"
          height="16"
          fill="currentColor"
          fillRule="evenodd"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
        >
          <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
        </svg>
      ),
      action: () => openInAI('https://claude.ai/new'),
    },
  ], [copyToClipboard, viewAsMarkdown, openInAI]);

  return (
    <>
      <div
        className={styles.copyPageButtonContainer}
        onBlur={handleWidgetBlur}
        onPointerEnter={hover.onPointerEnter}
        onPointerLeave={hover.onPointerLeave}
      >
        <button
          type="button"
          className={styles.copyPageButton}
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-controls={isOpen ? menuId : undefined}
          ref={buttonRef}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span className={styles.copyPageText}>
            {TRIGGER_LABELS.map(([state, label]) => (
              <span
                key={state}
                className={
                  state === copyState
                    ? styles.copyPageTextLayer
                    : styles.copyPageTextLayerHidden
                }
              >
                {label}
              </span>
            ))}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={
              isOpen ? `${styles.chevron} ${styles.open}` : styles.chevron
            }
          >
            <polyline points="6,9 12,15 18,9"></polyline>
          </svg>
        </button>
        {/* Announce the copy result: the trigger's label change alone is not announced,
            and the panel has usually closed by the time the clipboard write settles.
            Always mounted, because a live region only announces content that changes
            inside a region the AT was already observing. */}
        <span role="status" aria-live="polite" className="schema-visually-hidden">
          {copyState === 'idle' ? '' : STATUS_MESSAGES[copyState]}
        </span>
      </div>

      {isOpen && (
        <div
          className={styles.copyPageDropdown}
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            // Set by the layout effect once the panel has been measured. Scroll, not
            // clip, when the viewport cannot hold the whole panel — a focused item has
            // to be reachable. This overrides only overflow-y, and an `auto` scroll
            // container still clips its box, so the module's `overflow: hidden` keeps
            // doing its real job on the 8px corners.
            maxHeight:
              dropdownPosition.maxHeight === null
                ? undefined
                : `${dropdownPosition.maxHeight}px`,
            overflowY: 'auto',
            zIndex: 10000,
          }}
          ref={dropdownRef}
          id={menuId}
          role="menu"
          aria-label="Copy page actions"
          onKeyDown={handleMenuKeyDown}
          onBlur={handleWidgetBlur}
          onPointerEnter={hover.onPointerEnter}
          onPointerLeave={hover.onPointerLeave}
        >
          {dropdownItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className={styles.dropdownItem}
              onClick={() => {
                item.action();
                // APG: activating an item closes the menu and returns focus to the
                // trigger. Programmatic focus after a click is not :focus-visible in
                // Chromium, so mouse users do not get a ring they did not ask for.
                closeAndRestoreFocus();
              }}
            >
              {item.icon}
              <div>
                <div className={styles.itemTitle}>{item.title}</div>
                <div className={styles.itemDescription}>{item.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
