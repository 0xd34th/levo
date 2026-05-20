#!/usr/bin/env node
/**
 * Fetch the Cetus public pool list, extract every coin marked `is_trusted`,
 * and write the deduped set to `src/lib/sui/cetus-trusted-coins.json`.
 *
 * Run periodically (e.g. weekly) to refresh the canonical-coin whitelist used
 * by the portfolio trust classifier.
 *
 * Usage:  pnpm refresh:trusted-coins
 *
 * Network failures abort with a non-zero exit so CI / cron picks it up; the
 * existing JSON is left untouched.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/lib/sui/cetus-trusted-coins.json");

const ENDPOINT = "https://api-sui.cetus.zone/v2/sui/stats_pools";
const PAGE_SIZE = 100;
const MAX_PAGES = 20; // 2000 pools — empirically covers ~99% of trusted coins
const TIMEOUT_MS = 15_000;

async function fetchPage(offset) {
  const url = `${ENDPOINT}?limit=${PAGE_SIZE}&offset=${offset}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Cetus ${url} → HTTP ${res.status}`);
    const json = await res.json();
    if (json?.code !== 0) {
      throw new Error(`Cetus ${url} → code=${json?.code} msg=${json?.msg}`);
    }
    return json?.data?.lp_list ?? [];
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const trusted = new Map();
  let scanned = 0;
  let consecutiveNoNew = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const pools = await fetchPage(page * PAGE_SIZE);
    if (pools.length === 0) break;
    scanned += pools.length;

    const before = trusted.size;
    for (const p of pools) {
      if (p.is_closed) continue;
      for (const side of [p.coin_a, p.coin_b]) {
        if (!side?.is_trusted || !side?.address) continue;
        if (!trusted.has(side.address)) {
          trusted.set(side.address, {
            address: side.address,
            symbol: side.symbol ?? null,
            name: side.name ?? null,
            decimals: side.decimals ?? null,
          });
        }
      }
    }

    const added = trusted.size - before;
    process.stdout.write(
      `page ${page + 1}/${MAX_PAGES}  pools=${pools.length}  +${added} trusted  total=${trusted.size}\n`,
    );

    // Early exit when 3 consecutive pages add nothing — past the long tail.
    consecutiveNoNew = added === 0 ? consecutiveNoNew + 1 : 0;
    if (consecutiveNoNew >= 3) {
      process.stdout.write("plateau reached — stopping early\n");
      break;
    }
  }

  if (trusted.size === 0) {
    throw new Error("Cetus returned 0 trusted coins — refusing to overwrite JSON");
  }

  const coins = [...trusted.values()].sort((a, b) =>
    (a.symbol ?? "").localeCompare(b.symbol ?? ""),
  );
  const payload = {
    source: "cetus",
    endpoint: ENDPOINT,
    fetchedAt: new Date().toISOString(),
    poolsScanned: scanned,
    count: coins.length,
    coins,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
  process.stdout.write(`\nwrote ${OUT}  (${coins.length} trusted coins)\n`);
}

main().catch((err) => {
  process.stderr.write(`refresh-cetus-trusted-coins failed: ${err?.message ?? err}\n`);
  process.exit(1);
});
