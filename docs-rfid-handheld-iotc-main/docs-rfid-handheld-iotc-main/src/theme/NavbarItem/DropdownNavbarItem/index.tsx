/**
 * Swizzled @theme/NavbarItem/DropdownNavbarItem — upstream's desktop/mobile fork,
 * with one thing added at the fork: the DRAWER never sees the custom keys.
 *
 * WHY IT HAS TO HAPPEN HERE. The navbar items in docusaurus.config.ts carry a
 * custom `description` and `icon` on each dropdown child — legal, because
 * theme-classic's `NavbarItemBaseSchema` ends in `.unknown()` for exactly this.
 * The desktop swizzle beside this file reads them and renders a mark and a second
 * line; the drawer has neither and must not grow them, and
 * everything a `NavbarItem` does not recognise is eventually spread onto the
 * rendered `<a>` — so left alone, every drawer row would ship `description="…"`
 * and `icon="…"`, attributes no HTML parser knows.
 *
 * THIS FILE RATHER THAN A SWIZZLE OF `…/Mobile`, and the choice is about blast
 * radius: Mobile is ~160 lines with a CSS module of its own, and ejecting it to
 * delete one key would put all of that under local maintenance. This component is
 * upstream's whole twelve lines, has no styles, and is the one place where the
 * two branches are already being told apart — which is precisely the fact being
 * acted on. The desktop branch is passed through untouched.
 */
import React, {type ReactNode} from 'react';
import DropdownNavbarItemMobile from '@theme/NavbarItem/DropdownNavbarItem/Mobile';
import DropdownNavbarItemDesktop from '@theme/NavbarItem/DropdownNavbarItem/Desktop';
import type {Props} from '@theme/NavbarItem/DropdownNavbarItem';

/** `Props['items']` is upstream's type, which cannot know about the custom keys. */
type DropdownRowProps = Props['items'][number] & {
  readonly description?: string;
  readonly icon?: string;
};

export default function DropdownNavbarItem({
  mobile = false,
  ...props
}: Props): ReactNode {
  if (mobile) {
    const items = (props.items as readonly DropdownRowProps[]).map(
      ({description, icon, ...rest}) => rest,
    );
    return <DropdownNavbarItemMobile {...props} items={items} />;
  }
  return <DropdownNavbarItemDesktop {...props} />;
}
