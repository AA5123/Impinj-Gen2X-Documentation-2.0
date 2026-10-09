/**
 * Swizzled DocCard (wrapped default).
 *
 * TWO changes versus the theme-classic default, both in icon handling.
 *
 * 1. RESOLUTION (unchanged, 2026-07): a card prefers an explicit
 *    `customProps.emoji` (set per doc via front-matter
 *    `sidebar_custom_props.emoji`, or per category in `sidebars/guides.ts`), then
 *    any leading emoji in the label, then one of the three generic marks
 *    `getFallbackEmojiIcon` synthesises below (category / internal doc /
 *    external link). They are named there and NOT quoted here on purpose:
 *    one of the three carries a U+FE0F variation selector, and a copy of it
 *    in prose that silently drops the selector is a different string from
 *    the one the CSS keys off. This gives each landing-page tile a
 *    meaningful icon without putting emoji in the sidebar labels.
 *
 * 2. CARRIER (item 3F of the Dyte-parity brief): the resolved emoji is
 *    handed to the theme as an ELEMENT rather than a bare string, so CSS
 *    can address it. `src/css/cards.scss` maps 106 distinct emoji onto 34
 *    line icons by matching `[data-card-emoji="…"]` and painting the
 *    matching glyph as a mask.
 *
 *    This file deliberately does NOT know the map. The emoji stays the
 *    element's own text content, which is what makes the whole change
 *    revertible and makes an unmapped emoji fall back to itself: with no
 *    matching rule in `cards.scss` — or with `cards.scss` deleted — the
 *    span renders the emoji exactly as the stock component would, and a
 *    card can never show an empty box. Adding an emoji to a page therefore
 *    cannot break a card; at worst the new emoji has no glyph yet.
 *
 *    `aria-hidden` is new and is a fix, not a side effect. The emoji was
 *    previously announced ("high voltage", "package") ahead of a title
 *    that already names the destination. It is decoration in both
 *    renderings, so it is now hidden in both.
 */
import React from 'react';
import {
  useDocById,
  findFirstSidebarItemLink,
} from '@docusaurus/plugin-content-docs/client';
import {
  extractLeadingEmoji,
  useDocCardDescriptionCategoryItemsPlural,
} from '@docusaurus/theme-common/internal';
import isInternalUrl from '@docusaurus/isInternalUrl';
import Layout from '@theme/DocCard/Layout';

function getFallbackEmojiIcon(item) {
  if (item.type === 'category') {
    return '🗃';
  }
  return isInternalUrl(item.href) ? '📄️' : '🔗';
}

function getIconTitleProps(item) {
  const extracted = extractLeadingEmoji(item.label);
  const emoji =
    item.customProps?.emoji ?? extracted.emoji ?? getFallbackEmojiIcon(item);
  return {
    // `icon` is a ReactNode in the theme's own contract — stock renders it as
    // `<span className={ThemeClassNames.docs.docCard.icon}>{icon}</span>` at
    // `node_modules/@docusaurus/theme-classic/lib/theme/DocCard/Heading/Icon/index.js:12-17`
    // — so wrapping it needs no second swizzle. The emoji is both the CSS key and
    // the visible fallback; see the CARRIER note at the top of this file.
    icon: (
      <span className="docCardIcon" data-card-emoji={emoji} aria-hidden="true">
        {emoji}
      </span>
    ),
    title: extracted.rest.trim(),
  };
}

function CardCategory({item}) {
  const href = findFirstSidebarItemLink(item);
  const categoryItemsPlural = useDocCardDescriptionCategoryItemsPlural();
  // Unexpected: categories that don't have a link have been filtered upfront
  if (!href) {
    return null;
  }
  return (
    <Layout
      item={item}
      className={item.className}
      href={href}
      description={item.description ?? categoryItemsPlural(item.items.length)}
      {...getIconTitleProps(item)}
    />
  );
}

function CardLink({item}) {
  const doc = useDocById(item.docId ?? undefined);
  return (
    <Layout
      item={item}
      className={item.className}
      href={item.href}
      description={item.description ?? doc?.description}
      {...getIconTitleProps(item)}
    />
  );
}

export default function DocCard({item}) {
  switch (item.type) {
    case 'link':
      return <CardLink item={item} />;
    case 'category':
      return <CardCategory item={item} />;
    default:
      throw new Error(`unknown item type ${JSON.stringify(item)}`);
  }
}
