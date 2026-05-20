// Shared Levo UI primitives — match the real app's vocabulary
// Colors from web/app/globals.css

const LEVO = {
  bg: '#ffffff',
  surface: '#f5f5f3',
  raise: '#ecece8',
  sunk: '#fafaf8',
  ink: '#0e0e10',
  soft: '#55555a',
  mute: '#8a8a8f',
  fade: '#b8b8bc',
  up: '#1f7a3e',
  upSoft: '#e6f0e8',
  down: '#b23a3a',
  downSoft: '#f3e4e3',
  blue: '#1f5aa8',
  border: 'rgba(17,17,17,0.08)',
  borderStrong: 'rgba(17,17,17,0.14)',
  sans: '"Geist", -apple-system, BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif',
  mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

// Levo wordmark — bold, slightly tightened
function Wordmark({ size = 22, color = LEVO.ink }) {
  return (
    <span style={{
      fontFamily: LEVO.sans, fontWeight: 700, fontSize: size,
      letterSpacing: '-0.04em', color, lineHeight: 1,
    }}>levo</span>
  );
}

// Tiny inline sparkle (lucide-react Sparkles, simplified)
function Sparkle({ size = 14, color = 'currentColor', stroke = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.94 14.34 12 22l2.06-7.66L22 12l-7.94-2.34L12 2l-2.06 7.66L2 12z"/>
    </svg>
  );
}

function Pill({ children, style = {}, tone = 'neutral' }) {
  const tones = {
    neutral: { bg: LEVO.surface, fg: LEVO.soft },
    ink: { bg: LEVO.ink, fg: '#fff' },
    up: { bg: LEVO.upSoft, fg: LEVO.up },
    down: { bg: LEVO.downSoft, fg: LEVO.down },
    line: { bg: 'transparent', fg: LEVO.soft, ring: LEVO.border },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: 22, padding: '0 9px', borderRadius: 999,
      fontFamily: LEVO.sans, fontSize: 11, fontWeight: 500,
      letterSpacing: '0.01em',
      background: t.bg, color: t.fg,
      boxShadow: t.ring ? `inset 0 0 0 1px ${t.ring}` : 'none',
      ...style,
    }}>{children}</span>
  );
}

// Money figure — uses tabular nums, decimals smaller
function Money({ value, ccy = 'USDC', size = 28, weight = 600, color = LEVO.ink, dim = false }) {
  const [intPart, decPart] = String(value.toFixed ? value.toFixed(2) : value).split('.');
  return (
    <span style={{
      fontFamily: LEVO.sans, fontWeight: weight, fontSize: size,
      letterSpacing: '-0.025em', color, fontVariantNumeric: 'tabular-nums',
      lineHeight: 1,
    }}>
      <span style={{ color: dim ? LEVO.mute : color, fontWeight: weight, marginRight: 1 }}>$</span>
      {intPart}
      {decPart !== undefined && (
        <span style={{ color: dim ? LEVO.fade : LEVO.mute, fontWeight: weight }}>.{decPart}</span>
      )}
      <span style={{
        marginLeft: 6, fontSize: Math.max(10, size * 0.36), fontWeight: 500,
        color: LEVO.mute, letterSpacing: '0.02em', verticalAlign: 'middle',
      }}>{ccy}</span>
    </span>
  );
}

function Avatar({ size = 28, label = 'JC', bg = LEVO.ink, color = '#fff' }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center',
      background: bg, color, fontFamily: LEVO.sans, fontSize: size * 0.4,
      fontWeight: 600,
    }}>{label}</span>
  );
}

function Tabs({ active = 'home' }) {
  const items = [
    { id: 'home', label: 'Home' },
    { id: 'activity', label: 'Activity' },
    { id: 'tools', label: 'Tools' },
  ];
  return (
    <div style={{
      display: 'flex', gap: 4, padding: 4, margin: '12px 20px 4px',
      background: LEVO.surface, borderRadius: 999, fontFamily: LEVO.sans,
    }}>
      {items.map(t => {
        const on = t.id === active;
        return (
          <div key={t.id} style={{
            flex: 1, textAlign: 'center', padding: '7px 10px', borderRadius: 999,
            background: on ? LEVO.ink : 'transparent',
            color: on ? '#fff' : LEVO.soft,
            fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
          }}>{t.label}</div>
        );
      })}
    </div>
  );
}

function Card({ children, style = {}, padding = 16, surface = LEVO.surface, radius = 16 }) {
  return (
    <div style={{
      background: surface, borderRadius: radius, padding,
      fontFamily: LEVO.sans, color: LEVO.ink,
      ...style,
    }}>{children}</div>
  );
}

// Top status bar offset (status bar is 51px tall)
const STATUS_OFFSET = 51;

// Shared shell — Wordmark + Tabs + body
function LevoShell({ children, tab = 'home', topBanner = null, hideTabs = false, navTitle = null }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: LEVO.bg,
      paddingTop: STATUS_OFFSET, fontFamily: LEVO.sans, color: LEVO.ink,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {topBanner}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 20px 0',
      }}>
        {navTitle ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BackChevron />
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{navTitle}</span>
          </div>
        ) : (
          <Wordmark size={24}/>
        )}
        <Avatar/>
      </div>
      {!hideTabs && !navTitle && <Tabs active={tab}/>}
      <div style={{
        flex: 1, padding: '14px 20px 28px', overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>{children}</div>
    </div>
  );
}

function BackChevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={LEVO.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6"/>
    </svg>
  );
}

// Icon button (square with rounded corners, used as small action target)
function IconTile({ children, bg = LEVO.ink, color = '#fff', size = 36, radius = 10 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: radius, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', background: bg, color,
      flexShrink: 0,
    }}>{children}</span>
  );
}

// Primary CTA button (Levo: ink bg, white text, rounded)
function CTA({ children, full = true, tone = 'ink', height = 48, style = {} }) {
  const tones = {
    ink: { bg: LEVO.ink, fg: '#fff' },
    ghost: { bg: LEVO.surface, fg: LEVO.ink },
    soft: { bg: LEVO.upSoft, fg: LEVO.up },
  };
  const t = tones[tone];
  return (
    <button style={{
      width: full ? '100%' : 'auto', height, borderRadius: 14,
      border: 'none', background: t.bg, color: t.fg,
      fontFamily: LEVO.sans, fontSize: 15, fontWeight: 600, letterSpacing: '-0.005em',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: '0 18px', cursor: 'pointer',
      ...style,
    }}>{children}</button>
  );
}

// Small caption row (icon + text)
function Row({ icon, label, value, color = LEVO.soft, mono = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color, fontSize: 13 }}>
        {icon}{label}
      </span>
      <span style={{
        fontSize: 13, fontWeight: 500, color: LEVO.ink,
        fontFamily: mono ? LEVO.mono : LEVO.sans,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  );
}

Object.assign(window, {
  LEVO, Wordmark, Sparkle, Pill, Money, Avatar, Tabs, Card,
  LevoShell, IconTile, CTA, Row, BackChevron, STATUS_OFFSET,
});
