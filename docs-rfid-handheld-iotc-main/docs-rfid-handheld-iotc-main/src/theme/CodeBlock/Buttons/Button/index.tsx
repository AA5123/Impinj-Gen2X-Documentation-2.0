/**
 * Swizzled @theme/CodeBlock/Buttons/Button (full eject of
 * `@docusaurus/theme-classic/src/theme/CodeBlock/Buttons/Button/index.tsx`, v3.10.2).
 *
 * ONE change: `schema-ctrl` replaces `clean-btn` as the base class.
 *
 * `clean-btn` is Infima's "this button should look like nothing" reset — no border, no fill, no
 * padding. It is the right base for a control that floats invisibly over code and appears on
 * hover, which is what this button used to be. It is the wrong base for a control that lives in a
 * panel header next to controls that came from somewhere else.
 *
 * `schema-ctrl` is this site's control primitive, and the one every button in a JsonBlock or
 * SchemaTable header already uses: the pill geometry, the 28px height, the 1px frame, the hover
 * and focus treatments, and the `--schema-ctrl` sizing. Adopting it is what makes a code block's
 * Copy button the same object as a JSON panel's Copy button rather than a lookalike — one rule set
 * in src/css/api.scss paints both, so they cannot drift.
 *
 * Callers add the modifier that says which SHAPE of control this is: `schema-ctrl--icon` for the
 * square glyph buttons (word wrap), `json-copy` for the text pill (copy). Both are existing classes
 * with existing rules; neither was invented for this file.
 */
import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import type {Props} from '@theme/CodeBlock/Buttons/Button';

export default function CodeBlockButton({className, ...props}: Props): ReactNode {
  return (
    <button type="button" {...props} className={clsx('schema-ctrl', className)} />
  );
}
