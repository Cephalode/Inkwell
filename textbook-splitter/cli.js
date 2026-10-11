#!/usr/bin/env node
/**
 * textbook-splitter — detect chapters in a textbook PDF and split it into
 * per-chapter PDFs.
 *
 * Usage:
 *   textbook-splitter <input.pdf>                  # print detected chapters
 *   textbook-splitter <input.pdf> -o outdir        # split into per-chapter PDFs
 *
 * Options:
 *   -o, --out <dir>     Output directory (default: ./<pdf basename>)
 *   -m, --method <m>    auto | outline | toc | font   (default: auto)
 *   -n, --dry-run       Show chapters without writing files
 *   -q, --quiet         Only print errors
 *   -j, --json          Print chapter list as JSON
 *   -h, --help
 *
 * Examples:
 *   textbook-splitter book.pdf
 *   textbook-splitter book.pdf -o chapters/
 *   textbook-splitter book.pdf --method toc --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { detectChapters, loadPdf, splitRange, computeEndPages, chapterFileName } from './lib.mjs';

function parseArgs(argv) {
  const args = {
    out: null, method: 'auto', dryRun: false, quiet: false, json: false,
    input: null, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') args.help = true;
    else if (a === '-o' || a === '--out') args.out = argv[++i];
    else if (a === '-m' || a === '--method') args.method = argv[++i];
    else if (a === '-n' || a === '--dry-run') args.dryRun = true;
    else if (a === '-q' || a === '--quiet') args.quiet = true;
    else if (a === '-j' || a === '--json') args.json = true;
    else if (!args.input) args.input = a;
    else {
      console.error(`Error: unexpected argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

const HELP = `textbook-splitter — detect chapters in a textbook PDF and split it into per-chapter PDFs

Usage:
  textbook-splitter <input.pdf> [options]

Options:
  -o, --out <dir>     Output directory for chapter PDFs (default: ./<pdf basename>)
  -m, --method <m>    Detection method: auto | outline | toc | font (default: auto)
  -n, --dry-run       List detected chapters without writing files
  -j, --json          Print chapter list as JSON
  -q, --quiet         Suppress progress output (errors only)
  -h, --help          Show this help

Detection tiers (auto): PDF outline → TOC text parsing → font-size heuristic.

Examples:
  textbook-splitter book.pdf                    # list detected chapters
  textbook-splitter book.pdf -o chapters/       # write one PDF per chapter
  textbook-splitter book.pdf --method toc -j    # force TOC parsing, JSON output
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 2);
  }
  if (!['auto', 'outline', 'toc', 'font'].includes(args.method)) {
    console.error(`Error: unknown method "${args.method}" (auto | outline | toc | font)`);
    process.exit(2);
  }
  if (!fs.existsSync(args.input) || !fs.statSync(args.input).isFile()) {
    console.error(`Error: file not found: ${args.input}`);
    process.exit(1);
  }

  const { pdf, totalPages, data } = await loadPdf(args.input);
  if (!args.quiet) console.error(`Loaded ${args.input} (${totalPages} pages)`);

  const { chapters, method } = await detectChapters(pdf, totalPages, {
    method: args.method,
    onProgress: (p, total) => {
      if (!args.quiet) process.stdout.write(`\rScanning body text… page ${p}/${total}`);
    },
  });

  if (!args.quiet && method === 'font') process.stdout.write('\n');
  if (chapters.length === 0) {
    console.error('No chapters detected. Try --method toc or --method font.');
    process.exit(1);
  }
  if (!args.quiet) console.error(`Detected ${chapters.length} chapters via ${method === 'font' ? 'font-size heuristic' : method}`);

  const withEnd = computeEndPages(chapters, totalPages);

  if (args.json) {
    console.log(JSON.stringify({
      source: args.input, pages: totalPages, method, count: withEnd.length,
      chapters: withEnd.map((c, i) => ({ index: i + 1, title: c.title, startPage: c.page, endPage: c.endPage })),
    }, null, 2));
  } else {
    for (const [i, c] of withEnd.entries()) {
      const num = String(i + 1).padStart(2, '0');
      console.log(`${num}. [p.${c.page}-${c.endPage}] ${c.title}`);
    }
  }

  if (args.dryRun) return;

  const baseName = path.basename(args.input).replace(/\.pdf$/i, '');
  const outDir = args.out ?? baseName;
  fs.mkdirSync(outDir, { recursive: true });

  let done = 0;
  for (const [i, c] of withEnd.entries()) {
    const bytes = await splitRange(data, c.page, c.endPage);
    const file = path.join(outDir, chapterFileName(baseName, i, c.title));
    fs.writeFileSync(file, bytes);
    done++;
    if (!args.quiet) console.error(`  wrote ${file} (${c.endPage - c.page + 1} pages)`);
  }
  if (!args.quiet) console.error(`Done: ${done} chapter PDFs in ${outDir}/`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
