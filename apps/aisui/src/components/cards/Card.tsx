"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  source?: ReactNode;
  status?: ReactNode;
  rightSlot?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({
  title,
  subtitle,
  source,
  status,
  rightSlot,
  footer,
  children,
  className,
}: CardProps) {
  return (
    <div className={cn("gui-card", className)}>
      {(title || rightSlot) && (
        <div className="gui-card-head">
          <div className="gui-card-head-l">
            {title ? <div className="gui-card-title">{title}</div> : null}
            {subtitle ? <div className="gui-card-subtitle">{subtitle}</div> : null}
          </div>
          {rightSlot ? <div className="gui-card-right">{rightSlot}</div> : null}
        </div>
      )}
      {(source || status) && (
        <div className="gui-card-meta">
          {source ? (
            <span className="gui-source">
              <span className="gui-src-dot" /> {source}
            </span>
          ) : null}
          {status ? <span className="gui-status">{status}</span> : null}
        </div>
      )}
      <div className="gui-card-body">{children}</div>
      {footer ? <div className="gui-card-foot">{footer}</div> : null}

      <style>{`
        .gui-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          overflow: hidden;
          box-shadow: var(--shadow-card);
        }
        .gui-card-head {
          padding: 14px 16px 8px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .gui-card-title {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.3;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
        }
        .gui-card-subtitle {
          font-size: 11.5px;
          color: var(--fg-muted);
          margin-top: 2px;
          font-family: var(--font-mono);
          word-break: break-all;
        }
        .gui-card-meta {
          padding: 0 16px 6px;
          display: flex;
          gap: 12px;
          align-items: center;
          font-size: 10.5px;
          color: var(--fg-faint);
        }
        .gui-source {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .gui-src-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
        }
        .gui-card-body { padding: 4px 16px 14px; }
        .gui-card-foot {
          padding: 10px 16px;
          background: var(--bg-soft);
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11.5px;
        }
      `}</style>
    </div>
  );
}

export function StatRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
      <style>{`
        .stat-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          padding: 4px 0;
          min-width: 0;
        }
        .stat-label {
          font-size: 11.5px;
          color: var(--fg-muted);
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .stat-value {
          font-size: 13px;
          font-family: var(--font-mono);
          color: var(--fg);
          font-variant-numeric: tabular-nums;
        }
        .stat-hint {
          font-size: 10.5px;
          color: var(--fg-faint);
        }
      `}</style>
    </div>
  );
}

export function VerifiedTick() {
  return (
    <span title="Verified" style={{ display: "inline-flex" }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 2 14 4l3-1 1 3 3 1-1 3 1 3-3 1-1 3-3-1-2 2-2-2-3 1-1-3-3-1 1-3-1-3 3-1 1-3 3 1z"
          fill="var(--accent)"
        />
        <path
          d="m9 12 2 2 4-4"
          stroke="var(--on-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  );
}

interface TokenLogoProps {
  symbol: string;
  color?: string;
  size?: number;
  src?: string;
}

export function TokenLogo({ symbol, color, size = 22, src }: TokenLogoProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={symbol}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  const c = color ?? "oklch(78% 0.13 220)";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontSize: Math.max(9, Math.round(size * 0.5)),
        fontWeight: 700,
        color: "var(--on-accent)",
        fontFamily: "var(--font-mono)",
        flexShrink: 0,
        background: `linear-gradient(135deg, ${c} 0%, oklch(60% 0.16 220) 100%)`,
      }}
    >
      {symbol[0]}
    </div>
  );
}
