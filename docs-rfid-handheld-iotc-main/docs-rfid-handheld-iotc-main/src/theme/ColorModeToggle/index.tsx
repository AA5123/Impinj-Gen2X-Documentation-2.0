/**
 * EJECTED FROM @docusaurus/theme-classic ON 2026-08-29, for one reason: the tooltip on
 * the light/dark control named the mode the reader was ALREADY IN, and nothing else.
 *
 * WHAT UPSTREAM DOES AND WHY IT READS AS A BUG. theme-classic sets
 *     title={getColorModeLabel(value)}
 * which returns the bare noun phrase "light mode". There is no verb in it, so the string
 * cannot say whether it is reporting a state or promising one, and a reader has no way to
 * tell from the words whether clicking gives them light or takes it away. A button's label
 * has to name its ACTION; "light mode" is a badge.
 *
 * WHY THIS COULD NOT BE A TRANSLATION OVERRIDE, which is the obvious cheap fix and is a
 * trap. The same three strings feed BOTH the tooltip and the {mode} placeholder inside the
 * aria-label — upstream's getColorModeAriaLabel() interpolates getColorModeLabel() — so
 * retargeting `theme.colorToggle.ariaLabel.mode.light` to "Switch to dark mode" produces
 *     aria-label="Switch between dark and light mode (currently Switch to dark mode)"
 * The two strings have to be able to diverge, and only a swizzle lets them.
 *
 * WHY EJECT AND NOT WRAP. Both are marked `safe` by the theme's swizzle config, but a
 * wrapper only sees props; `title` and `aria-label` are computed inside the component and
 * set on a button the wrapper never touches.
 *
 * WHAT THE FORK COSTS, stated rather than discovered later: this file no longer tracks
 * upstream. On a @docusaurus/theme-classic upgrade, diff it against
 *     node_modules/@docusaurus/theme-classic/src/theme/ColorModeToggle/index.tsx
 * and port anything that is not the three labelled changes below. As of 3.10.2 the
 * component is 121 lines and has been stable for several minors, so this is cheap to keep.
 *
 * THE THREE CHANGES, and nothing else is touched:
 *   1. getSwitchToLabel() is new. It names the mode the NEXT CLICK PRODUCES, and it derives
 *      that from upstream's own getNextColorMode() rather than restating the cycle — so the
 *      words and the behaviour cannot drift apart, including if `respectPrefersColorScheme`
 *      is ever turned on and the control becomes a three-state cycle.
 *   2. `title` is REPLACED by `data-tooltip`, which is this site's tooltip (see the block in
 *      styles.module.css). Replaced, not supplemented: leaving `title` in place would render
 *      the native tooltip AND the site chip on top of each other.
 *   3. `aria-label` leads with the same action string and keeps the current state after it.
 *      The state is worth carrying for a screen-reader user, who has no icon to look at; the
 *      sighted user already has the icon and gets the shorter string. When both `title` and
 *      `aria-label` are present the aria-label wins for the accessible name, so these never
 *      compete — but leading with the tooltip's exact wording also keeps the pair honest
 *      under any Label-in-Name (WCAG 2.5.3) reading of a tooltip as a visible label.
 */
import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import useIsBrowser from '@docusaurus/useIsBrowser';
import {translate} from '@docusaurus/Translate';
import IconLightMode from '@theme/Icon/LightMode';
import IconDarkMode from '@theme/Icon/DarkMode';
import IconSystemColorMode from '@theme/Icon/SystemColorMode';
import type {Props} from '@theme/ColorModeToggle';
import type {ColorMode} from '@docusaurus/theme-common';

import styles from './styles.module.css';

// The order of color modes is defined here, and can be customized with swizzle
function getNextColorMode(
  colorMode: ColorMode | null,
  respectPrefersColorScheme: boolean,
) {
  // 2-value transition
  if (!respectPrefersColorScheme) {
    return colorMode === 'dark' ? 'light' : 'dark';
  }

  // 3-value transition
  switch (colorMode) {
    case null:
      return 'light';
    case 'light':
      return 'dark';
    case 'dark':
      return null;
    default:
      throw new Error(`unexpected color mode ${colorMode}`);
  }
}

function getColorModeLabel(colorMode: ColorMode | null): string {
  switch (colorMode) {
    case null:
      return translate({
        message: 'system mode',
        id: 'theme.colorToggle.ariaLabel.mode.system',
        description: 'The name for the system color mode',
      });
    case 'light':
      return translate({
        message: 'light mode',
        id: 'theme.colorToggle.ariaLabel.mode.light',
        description: 'The name for the light color mode',
      });
    case 'dark':
      return translate({
        message: 'dark mode',
        id: 'theme.colorToggle.ariaLabel.mode.dark',
        description: 'The name for the dark color mode',
      });
    default:
      throw new Error(`unexpected color mode ${colorMode}`);
  }
}

/**
 * CHANGE 1. The action, named by its destination.
 *
 * "Switch to X" is the phrasing because it can only point forward — the ambiguity this
 * whole file exists to remove comes from a string that could be read either way. The three
 * arms stay grammatically parallel ("light mode" / "dark mode" / "system mode") so that
 * enabling the three-state cycle needs no rewrite.
 *
 * NEW TRANSLATION IDS, deliberately not the theme's. Reusing `theme.colorToggle.ariaLabel
 * .mode.*` is exactly the collision described at the head of this file: those ids still mean
 * "the NAME of a mode" and are still used, unchanged, for the "(currently ...)" clause.
 */
function getSwitchToLabel(nextColorMode: ColorMode | null): string {
  switch (nextColorMode) {
    case null:
      return translate({
        message: 'Switch to system mode',
        id: 'theme.colorToggle.switchTo.system',
        description:
          'The tooltip and action label for switching to the system color mode',
      });
    case 'light':
      return translate({
        message: 'Switch to light mode',
        id: 'theme.colorToggle.switchTo.light',
        description:
          'The tooltip and action label for switching to the light color mode',
      });
    case 'dark':
      return translate({
        message: 'Switch to dark mode',
        id: 'theme.colorToggle.switchTo.dark',
        description:
          'The tooltip and action label for switching to the dark color mode',
      });
    default:
      throw new Error(`unexpected color mode ${nextColorMode}`);
  }
}

/**
 * CHANGE 3. Action first, state second.
 *
 * Upstream's message is "Switch between dark and light mode (currently {mode})", which
 * enumerates both modes and then reports one. This names the single thing the click will do
 * and then reports where the reader is standing. A new id rather than upstream's, because
 * the shape of the message changed and other locales' translations of the old id would no
 * longer fit it.
 */
function getColorModeAriaLabel(
  colorMode: ColorMode | null,
  nextColorMode: ColorMode | null,
) {
  return translate(
    {
      message: '{action} (currently {mode})',
      id: 'theme.colorToggle.ariaLabel.actionWithState',
      description:
        'The ARIA label for the color mode toggle: the action it performs, then the current mode',
    },
    {
      action: getSwitchToLabel(nextColorMode),
      mode: getColorModeLabel(colorMode),
    },
  );
}

function CurrentColorModeIcon(): ReactNode {
  // 3 icons are always rendered for technical reasons
  // We use "data-theme-choice" to render the correct one
  // This must work even before React hydrates
  return (
    <>
      <IconLightMode
        // a18y is handled at the button level,
        // not relying on button content (svg icons)
        aria-hidden
        className={clsx(styles.toggleIcon, styles.lightToggleIcon)}
      />
      <IconDarkMode
        aria-hidden
        className={clsx(styles.toggleIcon, styles.darkToggleIcon)}
      />
      <IconSystemColorMode
        aria-hidden
        className={clsx(styles.toggleIcon, styles.systemToggleIcon)}
      />
    </>
  );
}

function ColorModeToggle({
  className,
  buttonClassName,
  respectPrefersColorScheme,
  value,
  onChange,
}: Props): ReactNode {
  const isBrowser = useIsBrowser();
  // Computed ONCE and used for both the click and the words, so the label can never
  // describe a transition the button does not perform.
  const nextColorMode = getNextColorMode(value, respectPrefersColorScheme);
  return (
    <div className={clsx(styles.toggle, className)}>
      <button
        className={clsx(
          'clean-btn',
          styles.toggleButton,
          !isBrowser && styles.toggleButtonDisabled,
          buttonClassName,
        )}
        type="button"
        onClick={() => onChange(nextColorMode)}
        disabled={!isBrowser}
        // CHANGE 2. `data-tooltip` replaces `title`. The chip is drawn by
        // styles.module.css off the site's shared --tip-* tokens, and unlike the native
        // tooltip it also appears on :focus-visible, so the control is discoverable from
        // the keyboard.
        data-tooltip={getSwitchToLabel(nextColorMode)}
        aria-label={getColorModeAriaLabel(value, nextColorMode)}

        // For accessibility decisions
        // See https://github.com/facebook/docusaurus/issues/7667#issuecomment-2724401796

        // aria-live disabled on purpose - This is annoying because:
        // - without this attribute, VoiceOver doesn't announce on button enter
        // - with this attribute, VoiceOver announces twice on ctrl+opt+space
        // - with this attribute, NVDA announces many times
        // aria-live="polite"
      >
        <CurrentColorModeIcon />
      </button>
    </div>
  );
}

export default React.memo(ColorModeToggle);
