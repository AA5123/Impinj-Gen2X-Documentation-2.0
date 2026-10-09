/**
 * Swizzled @theme/CodeBlock/Buttons/CopyButton (full eject of
 * `@docusaurus/theme-classic/src/theme/CodeBlock/Buttons/CopyButton/index.tsx`, v3.10.2).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE SAME COPY BUTTON AS <JsonBlock>'s, not a second one that resembles it.
 *
 * Upstream's is an icon square: two stacked SVGs (a clipboard and a tick) cross-fading inside a
 * `clean-btn`, with the word "Copy" living only in the `title` attribute. src/components/
 * JsonBlock.tsx renders a text pill instead — `.schema-ctrl.json-copy`, reading "Copy", swapping to
 * "Copied" or "Failed" — and the API Reference is full of them. Two different answers to one
 * question, on pages a reader moves between in a single sitting.
 *
 * This file adopts JsonBlock's answer, and adopts it whole: the same three labels, the same class
 * names, the same accessible-name construction, and the same `role="status"` region. Not because
 * text is better than an icon in the abstract, but because it is what the larger half of the site
 * already does and what src/css/api.scss already paints — `.json-copy:not(.schema-ctrl--icon)`
 * reserves 5rem for the label swap so the button cannot shove its neighbours mid-animation, and
 * that reservation now serves both kinds of block from one declaration.
 *
 * ── THE THREE THINGS CARRIED OVER FROM JsonBlock, AND WHY EACH IS LOAD-BEARING ──────────────
 *
 * 1. A FAILURE STATE. Upstream has none: its `copyToClipboard(...).then(...)` has no rejection
 *    path, and the upstream comment says errors are left unhandled on purpose so observability
 *    tools can capture them. That is a reasonable choice for telemetry and a bad one for the
 *    person at the keyboard, who gets a button that does nothing and says nothing. The `.catch`
 *    here reports "Failed" for the same 1.5s dwell JsonBlock uses, and the live region below adds
 *    the instruction the two-word label has no room for. Nothing is swallowed silently — the
 *    rejection is surfaced to the user rather than only to a dashboard.
 *
 * 2. THE ACCESSIBLE NAME TRACKS THE VISIBLE LABEL. A page carries several of these and every one
 *    of them is named "Copy", so the name folds in the block's title the way JsonBlock's does —
 *    and it is built from the SAME `copyLabel` the button renders, so the name starts with the
 *    visible string in every state. A fixed "Copy …" name would break WCAG 2.5.3 Label in Name for
 *    the dwell during which the button reads "Copied": a voice-control user saying "click Copied"
 *    would match nothing.
 *
 * 3. A LIVE REGION, because neither swap announces itself. The visible label change is not spoken,
 *    and an accessible-name change is re-read only by some screen readers and only while the button
 *    still holds focus — which after a click it does. The spoken strings are deliberately NOT the
 *    name strings ("Copied to clipboard" against the name's "Copied …"), so a reader that announces
 *    both does not say the same word twice.
 *
 * `useIsBrowser` is not needed and not used: @theme/CodeBlock/Buttons renders this inside
 * `BrowserOnly`, so there is no server pass to guard.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import {translate} from '@docusaurus/Translate';
import {useCodeBlockContext} from '@docusaurus/theme-common/internal';
import Button from '@theme/CodeBlock/Buttons/Button';
import Icon from '@site/src/components/icons';
import type {Props} from '@theme/CodeBlock/Buttons/CopyButton';

/** JsonBlock's dwell. Long enough to read, short enough not to feel stuck. */
const RESULT_DWELL_MS = 1500;

async function copyToClipboard(text: string): Promise<void> {
  // The clipboard API is only defined in secure contexts (HTTPS / localhost).
  // See https://developer.mozilla.org/en-US/docs/Web/API/Clipboard
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  // Fall back to copy-text-to-clipboard for non-secure contexts (e.g. HTTP
  // on a local network). The fallback is lazily loaded to avoid bundle
  // overhead for the common HTTPS case.
  const {default: copy} = await import('copy-text-to-clipboard');
  const ok = copy(text);
  if (!ok) {
    throw new Error('copy-text-to-clipboard reported failure');
  }
}

export default function CopyButton({className}: Props): ReactNode {
  const {
    metadata: {code, title},
  } = useCodeBlockContext();
  const [result, setResult] = useState<'idle' | 'copied' | 'failed'>('idle');
  const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(dwell.current), []);

  const copy = useCallback(() => {
    clearTimeout(dwell.current);
    copyToClipboard(code)
      .then(() => setResult('copied'))
      .catch(() => setResult('failed'))
      .finally(() => {
        dwell.current = setTimeout(() => setResult('idle'), RESULT_DWELL_MS);
      });
  }, [code]);

  const copyLabel =
    result === 'copied'
      ? translate({
          id: 'theme.CodeBlock.copied',
          message: 'Copied',
          description: 'The copied button label on code blocks',
        })
      : result === 'failed'
        ? translate({
            id: 'theme.CodeBlock.copyFailed',
            message: 'Failed',
            description: 'The copy button label after a failed clipboard write',
          })
        : translate({
            id: 'theme.CodeBlock.copy',
            message: 'Copy',
            description: 'The copy button label on code blocks',
          });

  return (
    <>
      <Button
        className={clsx(className, 'json-copy')}
        aria-label={`${copyLabel} ${title ?? 'code'}`}
        onClick={copy}>
        {/* THE SAME GLYPH JsonBlock's Copy CARRIES, and for the same reason: the label swaps to
            "Copied" / "Failed" for a moment and the mark says which happened without the reader
            having to read it. It is the same three <Icon> names, so the two Copy buttons on this
            site cannot drift apart — which is the whole point of this file emitting `json-copy`.
            `aria-hidden` comes from <Icon>; the accessible name already opens with copyLabel. */}
        <Icon
          name={result === 'copied' ? 'Confirmed' : result === 'failed' ? 'Failed' : 'Copy'}
          size={14}
          className="json-copy-icon"
        />
        {copyLabel}
      </Button>
      <span role="status" aria-live="polite" className="schema-visually-hidden">
        {result === 'copied'
          ? 'Copied to clipboard'
          : result === 'failed'
            ? 'Copy failed — select the code and copy it manually'
            : ''}
      </span>
    </>
  );
}
