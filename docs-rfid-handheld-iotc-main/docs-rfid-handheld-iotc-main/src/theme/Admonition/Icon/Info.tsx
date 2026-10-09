/** Swizzled @theme/Admonition/Icon/Info — stroked Lucide outline. See AdmonitionGlyph.tsx for why. */
import React, { type ReactNode } from 'react';
import AdmonitionGlyph from './AdmonitionGlyph';

export default function AdmonitionIconInfo(props: React.ComponentProps<'svg'>): ReactNode {
  return (
    <AdmonitionGlyph {...props}>
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
    </AdmonitionGlyph>
  );
}
