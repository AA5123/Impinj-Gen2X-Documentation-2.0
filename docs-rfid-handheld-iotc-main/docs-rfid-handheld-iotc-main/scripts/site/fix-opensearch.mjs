#!/usr/bin/env node
/**
 * Corrects three defects in the generated build/opensearch.xml, all from the same root cause:
 * @docusaurus/theme-search-algolia is bundled unconditionally by preset-classic, so its
 * postBuild step writes opensearch.xml even though this site's actual search UI is
 * @docsearch/docusaurus-adapter (its Joi schema defaults themeConfig.algolia.searchPagePath to
 * 'search' even when `algolia` is never configured). There is no theme option to override its
 * template (node_modules/@docusaurus/theme-search-algolia/src/templates/opensearch.ts), and
 * patching node_modules is not durable, so this runs as a `postbuild` step (chained in
 * package.json's "build" script) and fixes the file in place:
 *
 *   1. <Image type="image/x-icon"> is hardcoded regardless of the site's real favicon — wrong
 *      even for the old PNG favicon (real type image/png) and wrong again now that favicon is
 *      an SVG. Corrected from the referenced image's own extension, so it stays correct if the
 *      favicon format changes again.
 *   2. <ShortName> is the full site title (`Zebra Handheld RFID Reader | IoT Connector`, ~43
 *      chars), way past the OpenSearch 1.1 spec's 16-character limit, and there is no
 *      `theme-search-algolia` option to shorten it independently of the site title. Replaced
 *      with 'Handheld Reader' (15 chars) — the SAME short-form label docusaurus.config.ts
 *      already uses for this exact "brand name, but short" purpose in the navbar (see
 *      `themeConfig.navbar.title`, ~line 775: an owner ruling, not this script's own choice —
 *      if that navbar title is ever revised, update SHORT_NAME here to match).
 *   3. The search URL template omits the trailing slash this site's `trailingSlash: true`
 *      config gives every other route (`.../search?q=...` instead of `.../search/?q=...`).
 *
 * MUST run strictly after `docusaurus build` has fully exited, not as a Docusaurus plugin
 * postBuild hook: those run via Promise.all, and this file is written by theme-search-algolia's
 * OWN async postBuild, so a same-phase hook races it — verified empirically, the file did not
 * exist yet when a postBuild-hook version of this fix ran.
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join('build', 'opensearch.xml');
const SHORT_NAME = 'Handheld Reader';
const MIME_BY_EXT = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

if (!fs.existsSync(FILE)) {
  console.log('[fix-opensearch] build/opensearch.xml not found — nothing to fix.');
  process.exit(0);
}

let xml = fs.readFileSync(FILE, 'utf8');
const changes = [];

// 1. <Image type>
const imageMatch = xml.match(/<Image\b[^>]*>([^<]+)<\/Image>/);
if (imageMatch) {
  const ext = path.extname(imageMatch[1]).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (mime) {
    const fixed = xml.replace(/(<Image\b[^>]*\btype=")[^"]*(")/, `$1${mime}$2`);
    if (fixed !== xml) { xml = fixed; changes.push(`<Image type> -> "${mime}"`); }
  } else {
    console.warn(`[fix-opensearch] unrecognized favicon extension "${ext}" — leaving <Image type> as-is.`);
  }
} else {
  console.log('[fix-opensearch] no <Image> element found — skipping favicon-type fix.');
}

// 2. <ShortName> — must be ≤16 chars per the OpenSearch 1.1 spec.
if (SHORT_NAME.length > 16) {
  console.warn(`[fix-opensearch] SHORT_NAME "${SHORT_NAME}" is ${SHORT_NAME.length} chars — still over the 16-char spec limit.`);
}
{
  const fixed = xml.replace(/<ShortName>[^<]*<\/ShortName>/, `<ShortName>${SHORT_NAME}</ShortName>`);
  if (fixed !== xml) { xml = fixed; changes.push(`<ShortName> -> "${SHORT_NAME}"`); }
}

// 3. Search URL template — add the trailing slash trailingSlash:true gives every other route.
{
  const fixed = xml.replace(
    /(<Url\s+type="text\/html"[^>]*\btemplate=")([^"]*?)(\?q=\{searchTerms\}"[^>]*\/?>)/,
    (whole, pre, urlPart, post) => (urlPart.endsWith('/') ? whole : `${pre}${urlPart}/${post}`),
  );
  if (fixed !== xml) { xml = fixed; changes.push('search URL template -> trailing slash added'); }
}

if (changes.length > 0) {
  fs.writeFileSync(FILE, xml, 'utf8');
  console.log(`[fix-opensearch] corrected: ${changes.join('; ')}.`);
} else {
  console.log('[fix-opensearch] already correct — no changes.');
}
