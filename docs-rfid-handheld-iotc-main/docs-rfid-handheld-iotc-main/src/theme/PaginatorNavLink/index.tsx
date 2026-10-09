/**
 * P4 · the two pagination cards.
 *
 * SWIZZLED FOR ONE REASON: the arrow. The stock link renders a sublabel and a title and
 * nothing else; Infima then draws the direction as a `«`/`»` CHARACTER glued onto the label
 * through generated content. A character cannot take a stroke weight, cannot be moved
 * independently of the text it is concatenated to, and cannot slide 3px on hover — which is
 * the whole affordance of the presented P4. So the arrow becomes a real element, the two
 * pseudo-elements are switched off in custom.scss, and the slide is a `translate` on it.
 *
 * `Advance` / `Back` are the icon set's own names for exactly this pair; see
 * src/components/icons for why one glyph rotated would have been the wrong call.
 *
 * THE DOM ORDER MIRRORS: the arrow leads on `prev` and trails on `next`, so the two cards
 * read outward from the gap between them rather than both pointing the same way. It is DOM
 * order and not `flex-direction: row-reverse`, so the tab order and the reading order stay
 * the visual order.
 */
import React, { type ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import type { Props } from '@theme/PaginatorNavLink';
import Icon from '@site/src/components/icons';

export default function PaginatorNavLink(props: Props): ReactNode {
  const { permalink, title, subLabel, isNext } = props;
  const arrow = (
    <Icon
      name={isNext ? 'Advance' : 'Back'}
      size={16}
      className="pagination-nav__arrow"
    />
  );
  return (
    <Link
      className={clsx(
        'pagination-nav__link',
        isNext ? 'pagination-nav__link--next' : 'pagination-nav__link--prev',
      )}
      to={permalink}>
      {!isNext && arrow}
      <div className="pagination-nav__text">
        {subLabel && <div className="pagination-nav__sublabel">{subLabel}</div>}
        <div className="pagination-nav__label">{title}</div>
      </div>
      {isNext && arrow}
    </Link>
  );
}
