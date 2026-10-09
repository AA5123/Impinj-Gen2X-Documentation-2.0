/** Swizzled @theme/Admonition/Icon/Note — stroked Lucide outline. See AdmonitionGlyph.tsx for why. */
import React, { type ReactNode } from 'react';
import AdmonitionGlyph from './AdmonitionGlyph';

export default function AdmonitionIconNote(props: React.ComponentProps<'svg'>): ReactNode {
  return (
    <AdmonitionGlyph {...props}>
      <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>
    </AdmonitionGlyph>
  );
}
