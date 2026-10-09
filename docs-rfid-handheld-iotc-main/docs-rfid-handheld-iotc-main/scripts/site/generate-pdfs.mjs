// Generate a print-optimized PDF for every command/event API-reference page,
// plus one consolidated "full API reference" PDF, into <--dir>/pdf/ (default build/pdf/).
//
// Runs in CI AFTER `npm run build` and BEFORE the gh-pages deploy (see
// .github/workflows/deploy.yml). The PDFs are build artifacts shipped in the
// gh-pages output — they are NOT committed to the source repo (build/ is
// .gitignored, and gh-pages is force_orphan'd each deploy).
//
// Fidelity: each page is rendered fresh with Chromium (print media), so the
// @media print rules in src/css/print.scss reveal BOTH ApiBody tabs and every
// SchemaTable/JsonBlock is already fully expanded.
//
// "NOTHING IS DROPPED" USED TO END THAT SENTENCE, AND IT IS FALSE. It holds for
// tabs and for collapsed schema/JSON trees; it does not hold for variants.
// `VariantSelect.tsx` renders `pick()`, which returns exactly ONE element, so the
// unselected panels are never in the DOM and no print rule can reach them —
// `src/css/print.scss` accordingly contains zero `variant-select` matches
// `[measured 2026-08-12]`. Corpus-wide that is **55 of 73 authored `<Variant>`
// subtrees absent from every PDF**, over 32 pages carrying a picker, heaviest on
// install-certificate (10), set-wifi (9), config-endpoint (8) and
// set-operating-mode (8).
//
// This is design-system OQ-91, it is assigned to the owner, and §14.3(1) names it
// as the ONE measured violation of the no-loss rule. Batch B19 is the fix and is
// graded `reversible-with-cost`, so it is not shipped here. The claim is corrected
// rather than the defect, because a script asserting fidelity it does not deliver
// is worse than the shortfall it hides.

//   node scripts/site/generate-pdfs.mjs [--dir build]
//     → renders that built directory and writes into <dir>/pdf/
import { chromium } from 'playwright';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import { spawn } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const BASE_URL = '/';
const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;
// The public address of the site these PDFs are published with, ending in "/". The pages are
// printed from the local server at ORIGIN, so every link to the site would otherwise point at
// 127.0.0.1 and open nothing on a reader's machine. Links are rewritten to this address before
// printing, and the cover prints it. scripts/publish/publish-site.mjs and the stage kit's
// apply-stage-changes.mjs replace this line with the address of the site they publish.
const SITE_URL = 'https://ubiquitous-bassoon-kmn533n.pages.github.io/';
const BUILD_DIR = flag('--dir', 'build');          // `--dir build_verify` for a side-by-side check
// Command/event groups only — NOT the conceptual reference pages
// (faq/appendices/errors/mdm/glossary/api-overview, which are .md).
//
// DECISION 2026-08-13 — the FXR60 / FXR90 fixed-reader REST reference is NOT in the PDF
// set, and this list is why: it is scoped by directory, `fxr-rest-api/` is not under
// api/mqtt/reference/, so the exclusion needs no code and no flag. It is recorded here so the
// next person to widen the list knows it was considered and declined, on three grounds,
// measured before deciding.
//   1. IDENTITY. Every page of the consolidated PDF is footer-stamped "Zebra Handheld RFID
//      Reader — IoT Connector · MQTT API" — scripts/site/generate-pdfs.mjs:156-159, cover :231-233.
//      Both read "MQTT API Reference" until owner ruling K, 2026-08-14. Binding fixed-reader
//      REST pages in would make it assert the conflation that ruling exists to prevent.
//   2. IT WOULD NOT SLOW THE DEPLOY DOWN — IT WOULD BREAK IT. renderPage() waits on
//      `.schema-table`, which is the handheld <SchemaTable> and appears on ZERO FXR pages
//      (`grep -o schema-table` over a built FXR page = 0, over a built handheld reference
//      page = 6). Measured on the real build with the real render options: 12 handheld
//      pages mean 950 ms each with 0 selector timeouts; 3 FXR pages under the SAME selector
//      mean 20,628 ms each with 3 of 3 timing out. In this script that throw is caught and
//      retried three times and then rethrown, so main() exits 1 — before the publish step
//      in deploy.yml, which is the failure shape that once left the live site stale.
//   3. SIZE. With a selector that does exist (`.openapi-tabs__heading`) FXR pages render in
//      665 ms each, so the render cost of all 72 is only about 48 s — cheap. The artifact is
//      not: mean FXR page PDF is 239 KB, so the consolidated file would grow by roughly
//      17 MB on top of about 5.6 MB, i.e. four times its size, for content that the reader
//      downloading "the API reference" did not ask for.
// If the fixed readers are ever given their own PDF set, it needs its own cover, its own
// footer string and its own readiness selector — not a widened GROUPS list.
const GROUPS = ['mgmt', 'ctrl', 'events', 'data'];
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const TODAY = new Date().toISOString().slice(0, 10);

const log = (...a) => console.log('[generate-pdfs]', ...a);

// The command/event pages are exactly the .mdx files under api/mqtt/reference/<group>/.
// (Conceptual reference pages are authored as .md, so this cleanly excludes them.)
//   index.mdx IS EXCLUDED. The 2026-08-16 IA restructure gave every category a real
// landing page, and two of them — Events and Data — live in a group directory beside the
// operation pages. `index` is not an operation, and its route is the directory itself
// (/api-reference/mqtt/events/), not /api-reference/mqtt/events/index/, so leaving it in
// made the built-page guard below fail on a route that was never supposed to exist.
//   A PAGE WITH NO `<ApiBody>` IS EXCLUDED TOO, added 2026-09-06, and it is the same defect
// as the FXR one above arriving from the opposite direction. `renderPage` gates readiness on
// `.schema-table` and its comment states the assumption out loud: "Every command/event page
// renders at least one SchemaTable via <ApiBody>." That was true of all 24 operation pages
// until three more landed in these directories with front matter and no body at all —
// `mgmt/get-config`, `mgmt/set-config` and `events/alert-short`, created title-only by owner
// instruction because their schemas are in SKIP_FILES (scripts/api/mqtt/schema.py) and the
// generator will never emit a body for them.
//   WHAT THAT COST, measured rather than predicted: the run stalled on the first of the three
// and never reached the other 20 routes. 3 attempts x (20 s selector timeout + 1.5 s backoff)
// and then a rethrow, so `main()` exits 1 — in deploy.yml that is before the publish step,
// which is exactly "the failure shape that once left the live site stale" described above.
//   KEYED ON `ApiBody` IN THE SOURCE, not on a hardcoded skip list, so it stays true by
// construction: a hand-authored operation page is skipped for exactly as long as it has no
// body to render, and starts being included the moment it gains one. Nothing to keep in step.
function findRoutes() {
  const routes = [];
  for (const g of GROUPS) {
    const dir = join('api', 'mqtt', 'reference', g);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (f === 'index.mdx') continue;
      if (!f.endsWith('.mdx')) continue;
      if (!readFileSync(join(dir, f), 'utf8').includes('ApiBody')) {
        log(`skipping ${g}/${f} — no <ApiBody>, so it renders no .schema-table`);
        continue;
      }
      routes.push(`/api-reference/mqtt/${g}/${f.replace(/\.mdx$/, '')}/`);
    }
  }
  return routes;
}

function waitForServer(url, timeoutMs = 90000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(url);
        if (r.status >= 200 && r.status < 400) return resolve();
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`server did not start: ${url}`));
      setTimeout(tick, 500);
    };
    tick();
  });
}

async function renderPage(page, url, outPath, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Wait for 'domcontentloaded', NOT 'networkidle'. These are static SSG pages, so the
      // content is already in the initial HTML and the explicit `.schema-table` wait below is
      // the real readiness gate. 'networkidle' is flaky here: the deploy build bakes in PostHog
      // analytics, whose background XHRs keep the network busy so idle never fires within 60s —
      // the PDF step then times out and aborts the job before the gh-pages deploy step runs.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Emulate print media FIRST. Example is the default (visible) ApiBody tab, so
      // the Schema panel is display:none under screen media; print.scss reveals BOTH
      // panels ([role='tabpanel']{display:block}). Only then is the SchemaTable
      // actually visible — waiting on it before emulateMedia would time out.
      await page.emulateMedia({ media: 'print' });
      // Every command/event page renders at least one SchemaTable via <ApiBody>.
      await page.waitForSelector('.schema-table', { timeout: 20000 });
      // Fire beforeprint so SchemaTable/JsonBlock force-expand any collapsed subtrees into the
      // PDF (page.emulateMedia does NOT dispatch the DOM print events). Harmless when the trees
      // are already fully expanded (their default). (UI audit — review follow-up.)
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await page.waitForTimeout(300); // let the print layout settle
      const buf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        // The running footer stays at 8px, and both halves of that are deliberate.
        // SIZE: it prints inside the 16mm bottom margin, outside the text block — page
        // furniture (product stamp and folio), not reading text, so the 13px caption floor
        // the type contract sets for prose and metadata does not reach it.
        // UNIT: rem is unusable here. Chromium renders headerTemplate/footerTemplate in its
        // own template document, whose root font-size is 1px rather than 16px, so `0.5rem`
        // would print this line at half a point and `8rem` is what actually reproduces 8px
        // — an unreadable way to write a readable number. [measured 2026-08-16, font sizes
        // recovered from the `Tf` operators of the generated PDF's content stream: 8px -> 8,
        // 4px -> 4, 0.5rem -> 0.5, 1rem -> 1, 8rem -> 8, that last output byte-identical to
        // today's.] px is the only unit that means the same thing here as elsewhere.
        footerTemplate:
          '<div style="font-size:8px;width:100%;text-align:center;color:#5C5F66;padding:0 10mm;">' +
          'Zebra Handheld RFID Reader — IoT Connector · MQTT API · ' +
          '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
      const pdf = await publicLinks(buf);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, pdf);
      return pdf;
    } catch (e) {
      lastErr = e;
      log(`  attempt ${attempt}/${retries} failed for ${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

// Chromium writes each link to the site with the local address the page was printed from. Point
// those links at SITE_URL in the PDF itself, after printing: rewriting them in the page first
// misses links that React renders again after the print event.
async function publicLinks(buf) {
  const doc = await PDFDocument.load(buf);
  const local = ORIGIN + BASE_URL;
  let changed = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let k = 0; k < annots.size(); k++) {
      const annot = doc.context.lookup(annots.get(k));
      const action = annot instanceof PDFDict && annot.lookupMaybe(PDFName.of('A'), PDFDict);
      const uri = action && action.lookupMaybe(PDFName.of('URI'), PDFString, PDFHexString);
      if (!uri || !uri.decodeText().startsWith(local)) continue;
      action.set(PDFName.of('URI'), PDFString.of(SITE_URL + uri.decodeText().slice(local.length)));
      changed++;
    }
  }
  return changed ? Buffer.from(await doc.save()) : buf;
}

// copyPages() copies a PDF's pages but not its named destinations, the targets of its in-page
// links, so every jump in the merged PDF would lead nowhere. Copy each source PDF's destinations
// into the merged one under a prefix (each command page has its own "request-semantics") and
// point the copied links at the prefixed names.
function keepDestinations(doc, copied, merged, mergedDests, prefix) {
  const dests = doc.catalog.lookupMaybe(PDFName.of('Dests'), PDFDict);
  if (!dests) return;
  const pageRef = new Map(doc.getPages().map((p, k) => [p.ref.toString(), copied[k].ref]));
  const renamed = (name) => PDFName.of(prefix + name.decodeText());
  for (const [name, value] of dests.entries()) {
    const target = doc.context.lookup(value);
    const array = target instanceof PDFDict ? target.lookup(PDFName.of('D'), PDFArray) : target;
    if (!(array instanceof PDFArray)) continue;
    const page = pageRef.get(array.get(0).toString());
    if (!page) continue;
    const rest = Array.from({ length: array.size() - 1 }, (_, k) => array.get(k + 1));
    mergedDests.set(renamed(name), merged.context.obj([page, ...rest]));
  }
  for (const page of copied) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let k = 0; k < annots.size(); k++) {
      const annot = merged.context.lookup(annots.get(k));
      if (!(annot instanceof PDFDict)) continue;
      const dest = annot.get(PDFName.of('Dest'));
      if (dest instanceof PDFName) annot.set(PDFName.of('Dest'), renamed(dest));
      else if (dest instanceof PDFString || dest instanceof PDFHexString) {
        annot.set(PDFName.of('Dest'), PDFName.of(prefix + dest.decodeText()));
      }
    }
  }
}

// Every web link must point at SITE_URL or another public address, never at the local server,
// and every in-page link must name a destination the PDF defines.
async function brokenLinks(buf) {
  const doc = await PDFDocument.load(buf);
  const dests = doc.catalog.lookupMaybe(PDFName.of('Dests'), PDFDict);
  const problems = [];
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let k = 0; k < annots.size(); k++) {
      const annot = doc.context.lookup(annots.get(k));
      if (!(annot instanceof PDFDict)) continue;
      const action = annot.lookupMaybe(PDFName.of('A'), PDFDict);
      const uri = action && action.lookupMaybe(PDFName.of('URI'), PDFString, PDFHexString);
      if (uri && /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri.decodeText())) problems.push(uri.decodeText());
      const dest = annot.get(PDFName.of('Dest'));
      if (dest instanceof PDFName && !(dests && dests.has(dest))) problems.push(`#${dest.decodeText()}`);
    }
  }
  return problems;
}

async function main() {
  const routes = findRoutes();
  log(`found ${routes.length} command/event routes`);
  if (routes.length === 0) throw new Error('no API-reference (.mdx) routes found under api/mqtt/reference/{mgmt,ctrl,events,data}');

  // Each route must have been built (guards against id/slug drift).
  for (const r of routes) {
    const idx = join(BUILD_DIR, r.replace(/^\//, ''), 'index.html');
    if (!existsSync(idx)) throw new Error(`built page missing for route ${r} (expected ${idx})`);
  }

  // '--dir' must carry BUILD_DIR: without it the server serves the CLI default (build/) while
  // the existence check above and the out-paths below use the flagged directory instead.
  const server = spawn(
    'npx',
    ['docusaurus', 'serve', '--dir', BUILD_DIR, '--port', String(PORT), '--host', '127.0.0.1', '--no-open'],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );

  try {
    await waitForServer(ORIGIN + BASE_URL);
    log('preview server up');

    const browser = await chromium.launch();
    const page = await browser.newPage();

    const perPage = [];
    for (const r of routes) {
      const url = ORIGIN + BASE_URL.replace(/\/$/, '') + r;
      const outPath = join(BUILD_DIR, 'pdf', `${r.replace(/^\//, '').replace(/\/$/, '')}.pdf`);
      log(`rendering ${r}`);
      perPage.push(await renderPage(page, url, outPath));
    }

    // Consolidated: branded cover + all per-page PDFs merged in order.
    const cover = await browser.newPage();
    await cover.setContent(
      `<!doctype html><html><head>
         <!-- The cover is rendered by Chromium from this string, so it does NOT inherit
              the site stylesheet and would otherwise set in the system UI face — a third
              typeface on the one page of the consolidated PDF a reader sees first. -->
         <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap">
       </head><body style="margin:0;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
       <!-- TYPE IS WRITTEN OUT BY HAND for the same reason the face is: no site stylesheet
            reaches this document, so the ladder declared at :root in src/css/custom.scss
            cannot cascade into it and every rung below is a literal. rem is exact here —
            nothing sets a root font-size on this document, so 1rem is Chromium's default
            16px and these are the same sizes the site renders [measured 2026-08-16 off the
            generated cover's content stream: the h1 emits Tf 32, the h2 Tf 24, the four
            small lines Tf 13].
              h1                2rem       32px   was 30px, which sat on no rung at all
              h2                1.5rem     24px   was 20px, the H3 rung
              eyebrow + 3 meta  0.8125rem  13px   caption rung; were 13 / 13 / 12 / 11px
            The h2 keeps font-weight 400. It is a subtitle under the product name, not a
            section heading, and the specification makes bold "primarily" for headings
            rather than a requirement — the same reading that keeps .title at 600 in
            src/components/NotFoundBody.module.css. -->
       <div style="height:250mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 20mm;">
         <div style="font-size:0.8125rem;letter-spacing:0.125rem;color:#5C5F66;text-transform:uppercase;">Zebra Handheld RFID Reader</div>
         <h1 style="font-size:2rem;color:#004C97;margin:12px 0 4px;">IoT Connector</h1>
         <h2 style="font-size:1.5rem;font-weight:400;color:#000000;margin:0 0 24px;">MQTT API</h2>
         <div style="font-size:0.8125rem;color:#2D2F33;">RFD40 / RFD90 Series · API v1.1</div>
         <div style="font-size:0.8125rem;color:#5C5F66;margin-top:6px;">Document version ${VERSION} · Generated ${TODAY}</div>
         <div style="font-size:0.8125rem;color:#5C5F66;margin-top:24px;">${SITE_URL}api-reference/mqtt/</div>
       </div>
     </body></html>`,
    );
    await cover.emulateMedia({ media: 'print' });
    const coverBuf = await cover.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });

    const merged = await PDFDocument.create();
    const mergedDests = merged.context.obj({});
    for (const [i, buf] of [coverBuf, ...perPage].entries()) {
      const doc = await PDFDocument.load(buf);
      const copied = await merged.copyPages(doc, doc.getPageIndices());
      copied.forEach((p) => merged.addPage(p));
      keepDestinations(doc, copied, merged, mergedDests, `p${i}-`);
    }
    merged.catalog.set(PDFName.of('Dests'), mergedDests);
    const fullPath = join(BUILD_DIR, 'pdf', 'reference', 'api-reference-full.pdf');
    mkdirSync(dirname(fullPath), { recursive: true });
    const fullBuf = await merged.save();
    writeFileSync(fullPath, fullBuf);

    // Fail rather than publish a PDF whose links lead nowhere.
    for (const [k, buf] of [...perPage, fullBuf].entries()) {
      const problems = await brokenLinks(buf);
      if (problems.length) {
        const name = k < routes.length ? routes[k] : 'the full PDF';
        throw new Error(`${problems.length} broken link(s) in ${name}, for example ${problems[0]}`);
      }
    }

    await browser.close();

    if (perPage.length !== routes.length) {
      throw new Error(`generated ${perPage.length} PDFs but expected ${routes.length}`);
    }
    log(`done: ${perPage.length} per-page PDFs + 1 consolidated -> ${fullPath}`);
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error('[generate-pdfs] FAILED:', e);
  process.exit(1);
});
