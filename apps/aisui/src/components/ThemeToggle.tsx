"use client";

import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={isDark ? "Light mode" : "Dark mode"}
      className="theme-toggle"
    >
      <span className={`tt-track ${isDark ? "is-dark" : "is-light"}`}>
        <span className="tt-thumb">
          {isDark ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M13 9.5A5 5 0 0 1 6.5 3a.5.5 0 0 0-.7-.5 6 6 0 1 0 7.7 7.7.5.5 0 0 0-.5-.7Z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" />
            </svg>
          )}
        </span>
      </span>
      <style>{`
        .theme-toggle {
          background: transparent;
          border: 0;
          padding: 4px;
          cursor: pointer;
          display: grid;
          place-items: center;
        }
        .tt-track {
          width: 44px;
          height: 24px;
          border-radius: 999px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          position: relative;
          display: block;
          transition: background 200ms ease, border-color 200ms ease;
        }
        .tt-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--card);
          color: var(--fg-mid);
          display: grid;
          place-items: center;
          box-shadow: 0 1px 2px oklch(0% 0 0 / 0.25);
          transition: transform 220ms cubic-bezier(.4,1.2,.5,1), background 200ms ease, color 200ms ease;
        }
        .tt-track.is-light .tt-thumb {
          transform: translateX(20px);
          background: var(--accent);
          color: var(--on-accent);
        }
        .theme-toggle:hover .tt-track { border-color: var(--border-hi); }
      `}</style>
    </button>
  );
}
