import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, opts: { compact?: boolean; digits?: number } = {}): string {
  if (!Number.isFinite(value)) return "—";
  const { compact = true, digits = 2 } = opts;
  return new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatUsd(value: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(value)) return "—";
  const { compact = false } = opts;
  if (compact) {
    return "$" + formatNumber(value, { compact: true, digits: 2 });
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function shortAddr(addr: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function isHex(s: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(s);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
