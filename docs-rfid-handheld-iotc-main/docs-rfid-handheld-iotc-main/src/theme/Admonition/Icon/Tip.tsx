/** Swizzled @theme/Admonition/Icon/Tip — stroked Lucide outline. See AdmonitionGlyph.tsx for why. */
import React, { type ReactNode } from 'react';
import AdmonitionGlyph from './AdmonitionGlyph';

export default function AdmonitionIconTip(props: React.ComponentProps<'svg'>): ReactNode {
  return (
    <AdmonitionGlyph {...props}>
      <path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>
    </AdmonitionGlyph>
  );
}
