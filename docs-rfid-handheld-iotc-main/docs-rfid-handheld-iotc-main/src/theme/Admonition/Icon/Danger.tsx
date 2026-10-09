/** Swizzled @theme/Admonition/Icon/Danger — stroked Lucide outline. See AdmonitionGlyph.tsx for why. */
import React, { type ReactNode } from 'react';
import AdmonitionGlyph from './AdmonitionGlyph';

export default function AdmonitionIconDanger(props: React.ComponentProps<'svg'>): ReactNode {
  return (
    <AdmonitionGlyph {...props}>
      <path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z"/><path d="M12 8v4"/><path d="M12 16h.01"/>
    </AdmonitionGlyph>
  );
}
