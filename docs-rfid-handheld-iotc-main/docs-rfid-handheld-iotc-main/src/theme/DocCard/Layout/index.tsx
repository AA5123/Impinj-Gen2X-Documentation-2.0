/**
 * Swizzled @theme/DocCard/Layout (eject of theme-classic v3.10.2).
 *
 * ONE STRUCTURAL CHANGE: the icon leaves the heading and becomes the card's first column.
 *
 * WHY. Stock nests the icon INSIDE the <h2> — `<Heading>{icon}{title}</Heading>` — so it sits on
 * the title's baseline and shares its line box. That is the right shape for a card whose title is
 * one short line, and the wrong one for this site: the 23 section hubs carry titles like
 * "Management, Control, Events, and Data", which wrap to two lines at the 420px column this grid
 * produces. With the icon in the heading, a wrapped title pushes the icon up onto the first line
 * and the second line starts under it, so the text block has a ragged left edge.
 *
 * The H1 design (design-system-options.html §6) is a two-column card: a tinted icon TILE on the
 * left, and a text column on the right holding the title over the description, both aligned to
 * one left edge that does not move when the title wraps. That needs the icon to be a sibling of
 * the text, not a child of the heading — which is a markup change, so it is made here rather than
 * approximated in CSS.
 *
 * WHAT IS UNCHANGED: the Container (its class list, its Link, its href), the Heading and
 * Description components, and the icon resolution in ../index.js. `icon` is still handed the same
 * element; it is only placed differently. Passing `icon={null}` to Heading is the whole trick —
 * stock renders `{icon}` unconditionally, and null renders nothing.
 */
import React, { type ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import { ThemeClassNames } from '@docusaurus/theme-common';
import Heading from '@theme/DocCard/Heading';
import Description from '@theme/DocCard/Description';
import styles from '@docusaurus/theme-classic/lib/theme/DocCard/Layout/styles.module.css';
import type { Props } from '@theme/DocCard/Layout';

/**
 * THE CARD'S OWN DESCRIPTION, WHICH IS NOT THE PAGE'S — added 2026-09-10.
 *
 * H1 clamps the description to TWO LINES, and at the 304px text column this grid produces that
 * is about 82 characters (measured: 14px Inter, 41 characters per line). The site's
 * `description` front matter is a SEO field — it ships as <meta name="description"> and
 * og:description, where the useful length is 150-160 — and its median here is 157 characters,
 * four lines. Every card therefore ended in an ellipsis, which the owner reported.
 *
 * Two fields, two jobs: `description` keeps its length for search engines and link previews,
 * and `sidebar_custom_props.card` (or a sidebar category's `customProps.card`) carries the
 * one-line summary the card shows. Both are authored, both are reviewable, and neither is
 * derived from the other at runtime — a heuristic that cut the description down would have
 * produced a different sentence every time either one was edited.
 *
 * The fallback chain is deliberate: a card with no `card` prop still renders its description
 * rather than nothing, so adding a page never produces a blank card. It will clip if that
 * description is long, and `npm run lint:card-text` is the gate that catches it.
 */
function cardText(item: Props['item'], description?: string): string | undefined {
  const card = (item as { customProps?: { card?: unknown } }).customProps?.card;
  return typeof card === 'string' && card.trim() ? card.trim() : description;
}

export default function DocCardLayout({
  item,
  className,
  href,
  icon,
  title,
  description,
}: Props): ReactNode {
  const text = cardText(item, description);
  return (
    <Link
      href={href}
      className={clsx(
        'card padding--lg',
        ThemeClassNames.docs.docCard.container,
        // STOCK'S MODULE CLASS IS KEPT. Dropping it in the first pass was a real regression: it
        // is what sets `--ifm-link-color: --ifm-color-emphasis-800` (plus the hover colour and
        // `--ifm-link-hover-decoration: none`) on the card, and without it the title and
        // description inherited the page's real link blue. Its other three declarations — a
        // shadow, a border and a hover border — are already cancelled by
        // `.theme-doc-card-container.theme-doc-card-container` in src/css/cards.scss, which is
        // why keeping this class costs nothing.
        styles.cardContainer,
        className,
      )}>
      {/* The icon tile. It CARRIES `theme-doc-card-icon` and that is load-bearing, not cosmetic:
          the 106 emoji-to-Lucide mask rules in src/css/cards.scss are keyed
          `.theme-doc-card-icon > .docCardIcon[data-card-emoji="…"]`. Stock provides that wrapper
          inside DocCard/Heading/Icon; moving the icon out of the heading removed it, and the
          first pass shipped raw colour emoji as a result. The tile is now that wrapper.
          `aria-hidden` is already on the span ../index.js builds; this adds no second
          announcement — it is a layout box and nothing else. */}
      <span
        className={clsx('docCardIconTile', ThemeClassNames.docs.docCard.icon)}
        aria-hidden="true">
        {icon}
      </span>
      <span className="docCardBody">
        <Heading item={item} icon={null} title={title} />
        {text && <Description item={item} description={text} />}
      </span>
    </Link>
  );
}
