"use client";

import { Box, ChevronDown } from "lucide-react";
import Image from "next/image";
import type { ObjectResult } from "@/lib/tools/get-object";
import { Card, StatRow } from "./Card";
import { shortAddr } from "@/lib/utils";

export function ObjectCard({ data }: { data: ObjectResult }) {
  if (!data.exists) {
    return (
      <Card title={<><Box size={14} /> Object</>} subtitle={<span className="mono">{data.objectId}</span>}>
        <div className="rounded-md bg-[var(--color-bg-soft)] p-3 text-sm text-[var(--color-fg-muted)]">
          Object does not exist or is not visible from RPC.
        </div>
      </Card>
    );
  }

  const display = data.display ?? {};
  const previewImg = display.image_url ?? display.image;
  const displayName = display.name ?? data.description ?? "Sui object";
  const storageRebateSui =
    data.storageRebate ? Number(data.storageRebate) / 1e9 : undefined;

  // Filter out image fields from the Display block so we don't print URLs.
  const displayEntries = Object.entries(display).filter(
    ([k]) => k !== "image_url" && k !== "image",
  );

  return (
    <Card
      title={
        <>
          {previewImg ? (
            <Image
              src={previewImg}
              alt={displayName}
              width={28}
              height={28}
              className="rounded-md"
              unoptimized
            />
          ) : (
            <Box size={14} />
          )}
          <span>{displayName}</span>
        </>
      }
      subtitle={<span className="mono">{shortAddr(data.objectId, 12, 8)}</span>}
      source="Sui RPC · sui_getObject"
      rightSlot={
        data.ownerKind ? (
          <span className="oc-type-badge">{data.ownerKind}</span>
        ) : null
      }
    >
      <div className="oc-grid">
        <div className="oc-meta">
          {data.type ? (
            <StatRow
              label="Type"
              value={
                <span className="mono" style={{ fontSize: 11 }}>
                  {shortAddr(data.type, 8, 16)}
                </span>
              }
            />
          ) : null}
          {data.owner ? (
            <StatRow
              label="Owner"
              value={
                <span className="mono" style={{ fontSize: 11 }}>
                  {data.ownerKind} · {shortAddr(data.owner, 6, 4)}
                </span>
              }
            />
          ) : null}
          {data.version ? (
            <StatRow label="Version" value={<span className="mono">{data.version}</span>} />
          ) : null}
          {storageRebateSui !== undefined ? (
            <StatRow
              label="Storage rebate"
              value={<span className="mono">{storageRebateSui.toFixed(6)} SUI</span>}
            />
          ) : null}
        </div>

        {displayEntries.length > 0 ? (
          <div className="oc-display">
            <div className="eyebrow">Display</div>
            {displayEntries.map(([k, v]) => (
              <div key={k} className="oc-disp-row">
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                  {k}
                </span>
                <span style={{ fontSize: 11.5 }}>{v}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {data.dynamicFields && data.dynamicFields.length > 0 ? (
        <div className="oc-dyn">
          <div className="oc-dyn-head">
            <span className="eyebrow">Dynamic fields</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
              {data.dynamicFields.length}
            </span>
          </div>
          <div className="oc-dyn-list">
            {data.dynamicFields.slice(0, 8).map((f) => {
              const fieldName =
                typeof f.name === "string" ? f.name : JSON.stringify(f.name);
              const shortType = f.objectType.split("::").pop() ?? f.objectType;
              return (
                <button key={f.objectId} type="button" className="oc-dyn-row">
                  <span className="mono" style={{ fontSize: 11.5 }}>{fieldName}</span>
                  <span className="mono oc-dyn-type">{shortType}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>
                    {shortAddr(f.objectId, 6, 4)}
                  </span>
                  <ChevronDown size={10} />
                </button>
              );
            })}
            {data.dynamicFields.length > 8 ? (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--fg-faint)",
                  padding: "6px 10px",
                }}
              >
                + {data.dynamicFields.length - 8} more
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {data.fields ? (
        <details style={{ marginTop: 12 }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 11,
              color: "var(--fg-muted)",
            }}
          >
            Raw fields
          </summary>
          <pre className="mono" style={{ marginTop: 8, maxHeight: 240, overflow: "auto", background: "var(--bg-soft)", padding: 8, fontSize: 11, borderRadius: 6 }}>
            {JSON.stringify(data.fields, null, 2)}
          </pre>
        </details>
      ) : null}

      <style>{`
        .oc-type-badge {
          padding: 4px 10px;
          background: color-mix(in oklch, var(--accent) 14%, transparent);
          color: var(--accent);
          border: 1px solid var(--accent-soft);
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-family: var(--font-mono);
        }
        .oc-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border);
        }
        @media (max-width: 540px) {
          .oc-grid { grid-template-columns: 1fr; }
        }
        .oc-display {
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .oc-disp-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .oc-dyn { margin-top: 12px; }
        .oc-dyn-head {
          display: flex;
          gap: 8px;
          align-items: baseline;
          margin-bottom: 6px;
        }
        .oc-dyn-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .oc-dyn-row {
          display: grid;
          grid-template-columns: 1fr auto auto auto;
          gap: 12px;
          align-items: center;
          padding: 8px 10px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--fg);
          cursor: pointer;
          text-align: left;
        }
        .oc-dyn-row:hover {
          background: var(--bg-elev);
          border-color: var(--accent-soft);
        }
        .oc-dyn-type {
          font-size: 10.5px;
          padding: 1px 5px;
          background: var(--card);
          border-radius: 3px;
          color: var(--fg-muted);
        }
      `}</style>
    </Card>
  );
}
