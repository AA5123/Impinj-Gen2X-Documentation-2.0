import React, { type ReactNode } from 'react';

/**
 * SchemaBadge — the single, theme-safe badge for JSON-schema type/constraint
 * labels, used across the whole documentation set:
 *   - API reference: `SchemaTable` and `ApiType.Type` render the same
 *     `.api-type--<token>` classes from spec data.
 *   - Conceptual / guide pages: authors wrap a type label in MDX, e.g.
 *     `<SchemaBadge>string</SchemaBadge>` (registered globally in
 *     `src/theme/MDXComponents.tsx`, so no import is needed).
 *
 * The pastel color scheme is the SINGLE SOURCE OF TRUTH in `src/css/api.scss`
 * (`.api-type` base + the eight `.api-type--<token>` custom-property rules).
 * Identical hex in light and dark themes (light fill + dark text clears
 * WCAG AA 4.5:1 on both). This component only selects the token class; it
 * never encodes a color itself.
 *
 * Only the eight canonical labels are colored — the seven JSON types
 * `string`, `integer`, `number`, `boolean`, `null`, `array`, `object` and the
 * `enum` constraint. Detection is case-insensitive; the badge always shows the
 * casing the author supplied. Any other value renders as plain text, so no
 * color is ever invented for `format`, `pattern`, `required`, `default`, etc.
 *
 * For compound expressions (`array of string`, `string[]`), wrap each
 * recognized token separately — the component styles one token at a time and
 * leaves surrounding text untouched.
 */

/** The eight tokens the scheme colors (lower-cased for case-insensitive match). */
const SCHEMA_TOKENS = new Set([
  'string',
  'integer',
  'number',
  'boolean',
  'null',
  'array',
  'object',
  'enum',
]);

export default function SchemaBadge({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const key = String(children).trim().toLowerCase();
  if (!SCHEMA_TOKENS.has(key)) {
    // Not one of the eight labels — never invent a color; render verbatim.
    return <>{children}</>;
  }
  // Casing preserved (children rendered as-is); color comes from api.scss.
  return <span className={`api-type api-type--${key}`}>{children}</span>;
}
