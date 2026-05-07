/**
 * News aggregation. MVP fetches RSS from Sui Foundation + The Block + Sui News
 * and caches for 1h via withCache. If parsing fails, returns a curated static
 * fallback so the UI never breaks.
 */
import { NextResponse } from "next/server";
import { withCache, hashKey } from "@/lib/cache/store";

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
}

const SOURCES: Array<{ name: string; url: string }> = [
  { name: "Sui Foundation", url: "https://blog.sui.io/feed.xml" },
  { name: "Sui Foundation Alt", url: "https://blog.sui.io/rss" },
];

const FALLBACK: NewsItem[] = [
  {
    title: "What is Sui?",
    url: "https://sui.io/about",
    source: "Sui",
    publishedAt: Date.now(),
  },
  {
    title: "Sui developer docs",
    url: "https://docs.sui.io",
    source: "Sui Docs",
    publishedAt: Date.now(),
  },
];

function parseRss(xml: string, source: string, max = 6): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/g;
  const titleRegex = /<title>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/title>/;
  const linkRegex = /<link>([^<]+)<\/link>/;
  const dateRegex = /<pubDate>([^<]+)<\/pubDate>/;

  for (const match of xml.match(itemRegex) ?? []) {
    const title = titleRegex.exec(match)?.[1]?.trim();
    const link = linkRegex.exec(match)?.[1]?.trim();
    const date = dateRegex.exec(match)?.[1]?.trim();
    if (title && link) {
      items.push({
        title,
        url: link,
        source,
        publishedAt: date ? Date.parse(date) || Date.now() : Date.now(),
      });
      if (items.length >= max) break;
    }
  }
  return items;
}

export async function GET() {
  const items = await withCache<NewsItem[]>(
    hashKey(["news", "v1"]),
    async () => {
      const all: NewsItem[] = [];
      for (const src of SOURCES) {
        try {
          const res = await fetch(src.url, {
            cache: "no-store",
            headers: { accept: "application/xml,text/xml,*/*" },
          });
          if (!res.ok) continue;
          const text = await res.text();
          all.push(...parseRss(text, src.name));
          if (all.length >= 6) break;
        } catch {
          /* skip */
        }
      }
      const dedup = new Map<string, NewsItem>();
      for (const it of all) dedup.set(it.url, it);
      const out = [...dedup.values()].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 6);
      return out.length > 0 ? out : FALLBACK;
    },
    { ttl: 3600, swr: 86400 },
  );
  return NextResponse.json({ items });
}

export const runtime = "nodejs";
