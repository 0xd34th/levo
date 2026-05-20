// scenes-web.jsx — desktop/web frictionless AI scenarios for Levo
// Each scene fills the browser content area (1280×800).

const { LEVO, Wordmark, Sparkle, Pill, Money, Avatar, Card, IconTile, CTA } = window;

// ─────────────────────────────────────────────────────────────
// Icon set (shared / extended)
// ─────────────────────────────────────────────────────────────
const wico = {
  send: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>,
  home: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/></svg>,
  activity: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>,
  vault: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/></svg>,
  sparkle: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.94 14.34 12 22l2.06-7.66L22 12l-7.94-2.34L12 2l-2.06 7.66L2 12z"/></svg>,
  search: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  shield: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  refresh: (c) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>,
  trend: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 7-9.5 9.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>,
  arrow: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
  check: (c) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  x: (c) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  clock: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  calendar: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  plus: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  pause: (c) => <svg width="11" height="11" viewBox="0 0 24 24" fill={c}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>,
  twitter: (c) => <svg width="12" height="12" viewBox="0 0 24 24" fill={c}><path d="M18.244 2H21.55l-7.224 8.26L23 22h-6.84l-5.36-7.005L4.7 22H1.392l7.728-8.835L1 2h7.012l4.84 6.4L18.244 2zm-1.16 18h1.84L7.04 4H5.07l12.014 16z"/></svg>,
  link: (c) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>,
  bolt: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  filter: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>,
  cmd: (c) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z"/></svg>,
};

// ─────────────────────────────────────────────────────────────
// Shared shell: left nav + main (+ optional right rail)
// ─────────────────────────────────────────────────────────────
function WebSidebar({ active = 'home' }) {
  const items = [
    { id: 'home', label: 'Home', ico: wico.home },
    { id: 'agent', label: 'Agent', ico: wico.sparkle, badge: 4 },
    { id: 'send', label: 'Send', ico: wico.send },
    { id: 'earn', label: 'Earn', ico: wico.vault },
    { id: 'activity', label: 'Activity', ico: wico.activity },
  ];
  return (
    <aside style={{
      width: 232, flexShrink: 0, background: LEVO.bg, padding: '20px 14px',
      borderRight: `1px solid ${LEVO.border}`, display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px 16px' }}>
        <Wordmark size={22}/>
        <span style={{
          fontSize: 10, fontWeight: 500, color: LEVO.mute, letterSpacing: '0.06em',
          textTransform: 'uppercase', background: LEVO.surface, borderRadius: 6, padding: '3px 7px',
        }}>Mainnet</span>
      </div>
      {/* Cmd-K hint */}
      <div style={{
        margin: '0 0 12px', padding: '8px 10px', background: LEVO.surface, borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: LEVO.soft,
      }}>
        {wico.search(LEVO.soft)}
        <span style={{ flex: 1 }}>Ask or search…</span>
        <span style={{
          fontSize: 10, fontWeight: 500, color: LEVO.mute, padding: '2px 6px',
          background: '#fff', borderRadius: 5, boxShadow: `inset 0 0 0 1px ${LEVO.border}`,
        }}>⌘K</span>
      </div>
      {items.map(it => {
        const on = it.id === active;
        return (
          <div key={it.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 10px', borderRadius: 10,
            background: on ? LEVO.ink : 'transparent',
            color: on ? '#fff' : LEVO.soft,
            fontSize: 13.5, fontWeight: 500, letterSpacing: '-0.005em',
          }}>
            <span style={{ color: on ? '#fff' : LEVO.ink, display: 'inline-flex' }}>{it.ico(on ? '#fff' : LEVO.ink)}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.badge && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 6px',
                background: on ? 'rgba(255,255,255,0.18)' : LEVO.upSoft,
                color: on ? '#fff' : LEVO.up, borderRadius: 999, minWidth: 18,
                textAlign: 'center',
              }}>{it.badge}</span>
            )}
          </div>
        );
      })}

      <div style={{ flex: 1 }}/>

      <div style={{
        padding: 12, background: LEVO.surface, borderRadius: 12, fontSize: 12,
        color: LEVO.soft,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Avatar label="JC" size={26} bg={LEVO.ink}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: LEVO.ink,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@jocelyn</div>
            <div style={{ fontSize: 10.5, color: LEVO.mute, fontFamily: LEVO.mono }}>0x7bca…1f9b</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function WebShell({ active = 'home', children, rail = null }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', background: LEVO.bg,
      fontFamily: LEVO.sans, color: LEVO.ink, overflow: 'hidden',
    }}>
      <WebSidebar active={active}/>
      <main style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          {children}
        </div>
        {rail}
      </main>
    </div>
  );
}

function PageHeader({ title, subtitle, action = null }) {
  return (
    <div style={{
      padding: '24px 32px 8px', display: 'flex', alignItems: 'flex-end',
      justifyContent: 'space-between', gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.08em',
          textTransform: 'uppercase', fontWeight: 500 }}>{subtitle}</div>
        <h1 style={{
          margin: '4px 0 0', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1,
        }}>{title}</h1>
      </div>
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1) DASHBOARD WITH PERSISTENT AGENT RAIL
// ─────────────────────────────────────────────────────────────
function WebScene_Dashboard() {
  const rail = (
    <aside style={{
      width: 304, flexShrink: 0, background: LEVO.bg, padding: '22px 18px',
      borderLeft: `1px solid ${LEVO.border}`, display: 'flex', flexDirection: 'column',
      gap: 12, overflow: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8, background: LEVO.ink,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{wico.sparkle('#fff')}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>Agent</div>
          <div style={{ fontSize: 11, color: LEVO.mute }}>4 active · saved 23 taps this month</div>
        </div>
      </div>

      {/* Live proposal */}
      <div style={{
        background: LEVO.ink, color: '#fff', borderRadius: 14, padding: 14,
        position: 'relative', overflow: 'hidden',
      }}>
        <Pill tone="ink" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}>
          {wico.sparkle('#fff')} New suggestion
        </Pill>
        <div style={{ fontSize: 14, fontWeight: 500, marginTop: 10, lineHeight: 1.4,
          letterSpacing: '-0.005em' }}>
          USDC vault APY just hit <span style={{ fontWeight: 600 }}>5.12%</span>. Move
          your idle <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>$1,242</span>?
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button style={{
            flex: 1, height: 32, borderRadius: 8, background: '#fff', color: LEVO.ink,
            border: 'none', fontSize: 12.5, fontWeight: 600, fontFamily: LEVO.sans,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>Review &amp; approve {wico.arrow(LEVO.ink)}</button>
          <button style={{
            height: 32, padding: '0 10px', borderRadius: 8, background: 'transparent',
            color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.18)',
            fontSize: 12, fontFamily: LEVO.sans, fontWeight: 500,
          }}>Dismiss</button>
        </div>
      </div>

      {/* Live mandates */}
      <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.06em',
        textTransform: 'uppercase', fontWeight: 500, marginTop: 4 }}>Running now</div>
      {[
        { name: 'Daily SUI harvest', sub: 'Next in 4h 12m', tone: 'up', dot: true },
        { name: 'Pay @jack weekly', sub: 'Next Fri · $50', tone: 'ink', dot: true },
        { name: 'Yield-chaser', sub: 'Watching · APY 4.81%', tone: 'blue', dot: false },
      ].map((m, i) => (
        <div key={i} style={{
          padding: 12, background: LEVO.surface, borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: 999,
            background: m.tone === 'up' ? LEVO.up : m.tone === 'blue' ? LEVO.blue : LEVO.ink,
            boxShadow: m.dot ? `0 0 0 3px ${m.tone === 'up' ? LEVO.upSoft : 'rgba(31,90,168,0.15)'}` : 'none',
          }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
            <div style={{ fontSize: 11, color: LEVO.mute }}>{m.sub}</div>
          </div>
          <button style={{
            width: 26, height: 26, borderRadius: 7, border: `1px solid ${LEVO.border}`,
            background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{wico.pause(LEVO.soft)}</button>
        </div>
      ))}

      {/* Recent agent actions */}
      <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.06em',
        textTransform: 'uppercase', fontWeight: 500, marginTop: 6 }}>Just happened</div>
      {[
        { t: 'Harvested 0.42 SUI · $0.42', sub: '12 seconds ago', tone: 'up' },
        { t: 'Repaid $50 to @jack', sub: '6 days ago · run 3/12', tone: 'ink' },
      ].map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12,
          padding: '6px 4px' }}>
          <span style={{
            width: 22, height: 22, borderRadius: 999,
            background: r.tone === 'up' ? LEVO.upSoft : LEVO.surface,
            color: r.tone === 'up' ? LEVO.up : LEVO.ink,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{r.tone === 'up' ? wico.check(LEVO.up) : wico.send(LEVO.ink)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: LEVO.ink }}>{r.t}</div>
            <div style={{ fontSize: 10.5, color: LEVO.mute }}>{r.sub}</div>
          </div>
          {wico.link(LEVO.mute)}
        </div>
      ))}
    </aside>
  );

  return (
    <WebShell active="home" rail={rail}>
      <PageHeader
        subtitle="Wallet · jocelyn"
        title="Good morning"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <CTA tone="ghost" style={{ height: 38, fontSize: 13, borderRadius: 10,
              boxShadow: `inset 0 0 0 1px ${LEVO.border}`, background: '#fff' }}>
              Deposit
            </CTA>
            <CTA tone="ink" style={{ height: 38, fontSize: 13, borderRadius: 10 }}>
              Send {wico.arrow('#fff')}
            </CTA>
          </div>
        }
      />

      <div style={{ padding: '8px 24px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Balance — primary card + two compact tiles */}
        <Card padding={20} radius={16}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.08em',
                textTransform: 'uppercase', fontWeight: 500 }}>Total balance</div>
              <div style={{ marginTop: 8 }}><Money value={1242.18} size={38} ccy="USDC"/></div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                <Pill tone="up">▲ $4.20 today</Pill>
                <Pill tone="line">Earning 4.81% APY</Pill>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ padding: '10px 14px', background: LEVO.sunk, borderRadius: 12,
                boxShadow: `inset 0 0 0 1px ${LEVO.border}`, minWidth: 130 }}>
                <div style={{ fontSize: 10.5, color: LEVO.mute, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontWeight: 500 }}>In yield</div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.015em' }}>$840.00</div>
              </div>
              <div style={{ padding: '10px 14px', background: LEVO.sunk, borderRadius: 12,
                boxShadow: `inset 0 0 0 1px ${LEVO.border}`, minWidth: 130 }}>
                <div style={{ fontSize: 10.5, color: LEVO.mute, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontWeight: 500 }}>Idle</div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600, color: LEVO.soft,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.015em' }}>$402.18</div>
                <div style={{ marginTop: 3, fontSize: 10.5, color: LEVO.down, display: 'flex',
                  alignItems: 'center', gap: 3 }}>
                  {wico.bolt(LEVO.down)} Could earn ~$19/yr
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Sparkline-ish balance card */}
        <Card padding={0} radius={16} style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px 8px' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Balance trend · 30d</div>
            <div style={{ display: 'flex', gap: 4, fontSize: 11, color: LEVO.mute }}>
              {['7D','30D','90D','1Y'].map((t, i) => (
                <span key={t} style={{
                  padding: '3px 8px', borderRadius: 6,
                  background: i === 1 ? LEVO.ink : 'transparent',
                  color: i === 1 ? '#fff' : LEVO.soft, fontWeight: 500,
                }}>{t}</span>
              ))}
            </div>
          </div>
          <SparklineSVG/>
        </Card>

        {/* Recent payments */}
        <Card padding={0} radius={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            padding: '14px 20px', borderBottom: `1px solid ${LEVO.border}` }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Recent payments</span>
            <span style={{ fontSize: 12, color: LEVO.mute }}>See all</span>
          </div>
          {[
            { who: '@nikitabier', label: 'Received', amt: '+ 120.00', tone: 'up', t: 'Just now' },
            { who: '@_brentbum', label: 'Sent', amt: '− 35.00', tone: 'ink', t: '2 hrs ago' },
            { who: '@jack', label: 'Sent · recurring', amt: '− 50.00', tone: 'ink', t: '6 days ago' },
          ].map((r, i) => (
            <div key={i} style={{
              padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
              borderTop: i ? `1px solid ${LEVO.border}` : 'none',
            }}>
              <Avatar size={32} label={r.who.slice(1, 3).toUpperCase()} bg={LEVO.raise} color={LEVO.ink}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.who}</div>
                <div style={{ fontSize: 11.5, color: LEVO.mute }}>{r.label} · {r.t}</div>
              </div>
              <span style={{
                fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                color: r.tone === 'up' ? LEVO.up : LEVO.ink,
              }}>{r.amt} <span style={{ color: LEVO.mute, fontWeight: 500, fontSize: 11 }}>USDC</span></span>
            </div>
          ))}
        </Card>
      </div>
    </WebShell>
  );
}

function SparklineSVG() {
  // Decorative line chart, deliberately simple
  return (
    <svg width="100%" height="180" viewBox="0 0 700 180" preserveAspectRatio="none"
      style={{ display: 'block' }}>
      <defs>
        <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(31,122,62,0.18)"/>
          <stop offset="100%" stopColor="rgba(31,122,62,0)"/>
        </linearGradient>
      </defs>
      <path d="M0 140 L60 130 L120 135 L180 110 L240 115 L300 95 L360 100 L420 75 L480 88 L540 60 L600 70 L660 45 L700 50 L700 180 L0 180 Z" fill="url(#ga)"/>
      <path d="M0 140 L60 130 L120 135 L180 110 L240 115 L300 95 L360 100 L420 75 L480 88 L540 60 L600 70 L660 45 L700 50" fill="none" stroke="#1f7a3e" strokeWidth="2"/>
      {/* dot at end */}
      <circle cx="700" cy="50" r="4" fill="#1f7a3e"/>
      <circle cx="700" cy="50" r="9" fill="#1f7a3e" opacity="0.18"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 2) SPLIT COMPOSER — chat left, live mandate preview right
// ─────────────────────────────────────────────────────────────
function WebScene_SplitComposer() {
  return (
    <WebShell active="agent">
      <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column',
        height: '100%', boxSizing: 'border-box', gap: 12 }}>
        <PageHeader
          subtitle="Agent"
          title="Plan a new rule"
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <CTA tone="ghost" style={{ height: 34, fontSize: 12.5, borderRadius: 9,
                boxShadow: `inset 0 0 0 1px ${LEVO.border}`, background: '#fff' }}>
                Templates
              </CTA>
              <CTA tone="ghost" style={{ height: 34, fontSize: 12.5, borderRadius: 9,
                boxShadow: `inset 0 0 0 1px ${LEVO.border}`, background: '#fff' }}>
                Import from cron
              </CTA>
            </div>
          }
        />

        <div style={{
          flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1.05fr 1fr',
          gap: 14, margin: '4px 8px 0',
        }}>
          {/* LEFT — Chat */}
          <Card padding={0} radius={16} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${LEVO.border}`,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 24, height: 24, borderRadius: 7, background: LEVO.ink,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{wico.sparkle('#fff')}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Conversation</span>
              <div style={{ flex: 1 }}/>
              <Pill tone="line">DeepSeek · Chat</Pill>
            </div>

            <div style={{ flex: 1, padding: 18, display: 'flex', flexDirection: 'column',
              gap: 10, overflow: 'auto' }}>
              {/* user */}
              <div style={{ alignSelf: 'flex-end', maxWidth: '75%' }}>
                <div style={{
                  background: LEVO.ink, color: '#fff', borderRadius: 12,
                  padding: '8px 12px', fontSize: 13, lineHeight: 1.4,
                }}>auto-compound my SUI yield every morning</div>
              </div>
              {/* assistant */}
              <div style={{ maxWidth: '82%' }}>
                <div style={{
                  background: LEVO.surface, color: LEVO.ink, borderRadius: 12,
                  padding: '9px 12px', fontSize: 13, lineHeight: 1.45,
                }}>
                  Drafted a daily harvest rule on the right. I&rsquo;m capping it at $2.40/run, $20/week.
                  <br/>
                  <span style={{ color: LEVO.mute, fontSize: 12 }}>
                    Want me to also auto-stop if APY drops below 3%?
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {['Yes, add a guard','Make it weekly','Lower the cap to $1','Run at 6 AM'].map(s => (
                    <span key={s} style={{
                      fontSize: 11.5, padding: '5px 10px', background: '#fff',
                      borderRadius: 999, color: LEVO.ink, fontWeight: 500,
                      boxShadow: `inset 0 0 0 1px ${LEVO.border}`,
                    }}>{s}</span>
                  ))}
                </div>
              </div>
              {/* user */}
              <div style={{ alignSelf: 'flex-end', maxWidth: '75%' }}>
                <div style={{
                  background: LEVO.ink, color: '#fff', borderRadius: 12,
                  padding: '8px 12px', fontSize: 13, lineHeight: 1.4,
                }}>yes, also stop if APY &lt; 3%</div>
              </div>
              {/* assistant — running */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                color: LEVO.mute, padding: '4px 0' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: LEVO.surface, borderRadius: 999, padding: '4px 10px',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 999, background: LEVO.up,
                    animation: 'pulse 1.4s ease-in-out infinite',
                  }}/>
                  Tool: <span style={{ fontFamily: LEVO.mono, color: LEVO.ink }}>propose_yield_mandate</span>
                </span>
              </div>
            </div>

            <div style={{ padding: 12, borderTop: `1px solid ${LEVO.border}` }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: LEVO.surface, borderRadius: 14, padding: '8px 8px 8px 14px',
              }}>
                <span style={{ fontSize: 13, color: LEVO.mute, flex: 1 }}>Refine the rule…</span>
                <span style={{
                  fontSize: 10, padding: '2px 6px', background: '#fff', color: LEVO.mute,
                  borderRadius: 5, boxShadow: `inset 0 0 0 1px ${LEVO.border}`,
                }}>⌘↵</span>
                <span style={{
                  width: 32, height: 32, borderRadius: 999, background: LEVO.ink,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{wico.send('#fff')}</span>
              </div>
            </div>
          </Card>

          {/* RIGHT — live preview */}
          <Card padding={0} radius={16} style={{ display: 'flex', flexDirection: 'column',
            background: '#fff', boxShadow: `inset 0 0 0 1px ${LEVO.border}` }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${LEVO.border}`,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Mandate preview</span>
              <Pill tone="up">Live</Pill>
              <div style={{ flex: 1 }}/>
              <Pill tone="line">Updates as you chat</Pill>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex',
              flexDirection: 'column', gap: 16 }}>
              {/* Header */}
              <div>
                <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontWeight: 500 }}>Daft</div>
                <h2 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 600,
                  letterSpacing: '-0.02em' }}>Daily SUI harvest</h2>
                <div style={{ fontSize: 12.5, color: LEVO.soft, marginTop: 4 }}>
                  StableLayer · SUI vault · expires in 30 days
                </div>
              </div>

              {/* Plain-English */}
              <div style={{
                padding: '14px 16px', borderRadius: 12, background: LEVO.surface,
                fontSize: 14, lineHeight: 1.55, color: LEVO.ink, letterSpacing: '-0.005em',
              }}>
                Every day at <Bold>9:00 AM</Bold>, harvest up to <Bold>$2.40</Bold> of yield
                and re-deposit it. Pause automatically if <Bold>APY drops below 3%</Bold>. Max
                <Bold> $20/week</Bold>.
              </div>

              {/* Flow diagram */}
              <FlowDiagram/>

              {/* Knobs grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <Knob label="Schedule" value="Daily 9:00 AM" icon={wico.clock(LEVO.ink)} />
                <Knob label="Cap per run" value="$2.40" icon={wico.bolt(LEVO.ink)} />
                <Knob label="Weekly cap" value="$20.00" icon={wico.refresh(LEVO.ink)} />
                <Knob label="APY guard" value="Stop < 3%" icon={wico.trend(LEVO.ink)} highlight />
                <Knob label="Coin" value="SUI" icon={wico.vault(LEVO.ink)} />
                <Knob label="Expires" value="Jun 16, 2026" icon={wico.calendar(LEVO.ink)} />
              </div>

              {/* Diff banner */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', background: LEVO.upSoft, borderRadius: 10,
                fontSize: 12, color: LEVO.up,
              }}>
                {wico.sparkle(LEVO.up)}
                <span style={{ flex: 1 }}>
                  Just added: <span style={{ fontWeight: 600 }}>APY guard</span> from your last message
                </span>
                <span style={{ fontSize: 11, color: LEVO.up, opacity: 0.7 }}>2s ago</span>
              </div>
            </div>

            <div style={{ padding: 14, borderTop: `1px solid ${LEVO.border}`,
              display: 'flex', gap: 8 }}>
              <CTA tone="ghost" style={{ height: 40, fontSize: 13, borderRadius: 10,
                background: LEVO.surface, flex: 1 }}>Discard</CTA>
              <CTA tone="ink" style={{ height: 40, fontSize: 13, borderRadius: 10, flex: 2 }}>
                Approve &amp; activate {wico.arrow('#fff')}
              </CTA>
            </div>
          </Card>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </WebShell>
  );
}

function Bold({ children }) {
  return <span style={{ fontWeight: 600, color: LEVO.ink, fontVariantNumeric: 'tabular-nums' }}>{children}</span>;
}

function Knob({ label, value, icon, highlight = false }) {
  return (
    <div style={{
      padding: 11, background: LEVO.surface, borderRadius: 10,
      boxShadow: highlight ? `inset 0 0 0 1.5px ${LEVO.ink}` : 'none',
    }}>
      <div style={{
        fontSize: 10, color: LEVO.mute, letterSpacing: '0.06em',
        textTransform: 'uppercase', fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 5,
      }}>{icon} {label}</div>
      <div style={{ marginTop: 5, fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em' }}>{value}</div>
    </div>
  );
}

function FlowDiagram() {
  const node = (label, sub, icon) => (
    <div style={{
      flex: 1, padding: 10, borderRadius: 10, background: '#fff',
      boxShadow: `inset 0 0 0 1px ${LEVO.border}`,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: 7, background: LEVO.surface,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</span>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: LEVO.mute }}>{sub}</div>
    </div>
  );
  const arrow = (
    <div style={{ flexShrink: 0, color: LEVO.mute, display: 'inline-flex',
      alignItems: 'center', padding: '0 6px' }}>{wico.arrow(LEVO.mute)}</div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {node('SUI vault', 'StableLayer', wico.vault(LEVO.ink))}
      {arrow}
      {node('Harvest', 'every 24h', wico.refresh(LEVO.ink))}
      {arrow}
      {node('Re-deposit', 'into vault', wico.plus(LEVO.ink))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3) CMD-K SPOTLIGHT OVER DASHBOARD
// ─────────────────────────────────────────────────────────────
function WebScene_CmdK() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative',
      fontFamily: LEVO.sans, overflow: 'hidden' }}>
      {/* dimmed dashboard underneath */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px) saturate(0.5)',
        opacity: 0.65, pointerEvents: 'none' }}>
        <WebScene_Dashboard/>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,14,16,0.42)' }}/>

      {/* The palette */}
      <div style={{
        position: 'absolute', left: '50%', top: 90, transform: 'translateX(-50%)',
        width: 640, background: '#fff', borderRadius: 18,
        boxShadow: '0 40px 100px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.18)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px', borderBottom: `1px solid ${LEVO.border}`,
        }}>
          <Sparkle size={18} color={LEVO.ink}/>
          <span style={{ fontSize: 18, color: LEVO.ink, letterSpacing: '-0.01em', flex: 1 }}>
            send 50 to <span style={{ background: LEVO.upSoft, color: LEVO.up,
              borderRadius: 5, padding: '1px 5px' }}>@jack</span>
            <span style={{
              display: 'inline-block', width: 2, height: 18, background: LEVO.ink,
              marginLeft: 3, verticalAlign: -3, animation: 'blink 1s steps(2) infinite',
            }}/>
          </span>
          <span style={{ fontSize: 11, color: LEVO.mute }}>Press ↵ to confirm</span>
          <span style={{
            fontSize: 11, fontWeight: 500, color: LEVO.mute, padding: '3px 7px',
            background: LEVO.surface, borderRadius: 6,
          }}>⌘K</span>
        </div>

        <div style={{ padding: '8px 8px 12px' }}>
          {/* Section: Actions */}
          <div style={{ padding: '8px 14px 4px', fontSize: 10.5, color: LEVO.mute,
            letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
            Actions
          </div>

          {/* Selected */}
          <div style={{
            padding: '12px 14px', borderRadius: 12, background: LEVO.ink,
            display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0',
          }}>
            <span style={{
              width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.16)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{wico.send('#fff')}</span>
            <div style={{ flex: 1, color: '#fff' }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>Send $50 to @jack</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                One-time · resolves to <span style={{ fontFamily: LEVO.mono }}>0x7bca…1f9b</span> · ~$49.94 after fees
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
              padding: '3px 7px', background: 'rgba(255,255,255,0.14)', borderRadius: 6,
            }}>↵</span>
          </div>

          {[
            { i: wico.calendar(LEVO.ink), t: 'Send $50 to @jack every Friday',
              s: 'Create recurring rule · 12 weeks · stop with ⌘.' },
            { i: wico.refresh(LEVO.ink), t: 'Repeat last send to @jack',
              s: '$50.00 · 6 days ago · same coin, same caps' },
            { i: wico.search(LEVO.ink), t: 'Look up @jack',
              s: 'jack.eth on X · canonical Sui address verified' },
          ].map((r, i) => (
            <div key={i} style={{
              padding: '11px 14px', borderRadius: 12, display: 'flex', alignItems: 'center',
              gap: 12, margin: '1px 0',
            }}>
              <span style={{
                width: 32, height: 32, borderRadius: 9, background: LEVO.surface,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{r.i}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: LEVO.ink }}>{r.t}</div>
                <div style={{ fontSize: 11.5, color: LEVO.mute }}>{r.s}</div>
              </div>
              {wico.arrow(LEVO.mute)}
            </div>
          ))}

          <div style={{ padding: '12px 14px 4px', fontSize: 10.5, color: LEVO.mute,
            letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
            Or ask the agent
          </div>
          {[
            { i: wico.sparkle(LEVO.ink), t: 'Plan a mandate from this intent',
              s: 'Open conversation with structured preview' },
            { i: wico.shield(LEVO.ink), t: 'Show jack&rsquo;s recent payment history',
              s: 'Read-only · last 30 days' },
          ].map((r, i) => (
            <div key={i} style={{
              padding: '11px 14px', borderRadius: 12, display: 'flex', alignItems: 'center',
              gap: 12, margin: '1px 0',
            }}>
              <span style={{
                width: 32, height: 32, borderRadius: 9, background: LEVO.surface,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{r.i}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: LEVO.ink,
                  dangerouslySetInnerHTML: undefined }}>{r.t.replace('&rsquo;', '’')}</div>
                <div style={{ fontSize: 11.5, color: LEVO.mute }}>{r.s}</div>
              </div>
              {wico.arrow(LEVO.mute)}
            </div>
          ))}
        </div>

        <div style={{
          padding: '10px 16px', background: LEVO.sunk, fontSize: 11, color: LEVO.mute,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: `1px solid ${LEVO.border}`,
        }}>
          <span>↑↓ navigate · ↵ confirm · Tab for alternates</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {wico.shield(LEVO.mute)} Powered by Levo Agent · DeepSeek
          </span>
        </div>
      </div>

      <style>{`@keyframes blink { 50% { opacity: 0 } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 4) MANDATE DRILL-DOWN — table + slide drawer
// ─────────────────────────────────────────────────────────────
function WebScene_Drilldown() {
  return (
    <WebShell active="agent">
      <PageHeader
        subtitle="Agent"
        title="Mandates"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <CTA tone="ghost" style={{ height: 34, fontSize: 12.5, borderRadius: 9,
              boxShadow: `inset 0 0 0 1px ${LEVO.border}`, background: '#fff' }}>
              {wico.filter(LEVO.ink)} Filter
            </CTA>
            <CTA tone="ink" style={{ height: 34, fontSize: 12.5, borderRadius: 9 }}>
              {wico.plus('#fff')} New rule
            </CTA>
          </div>
        }
      />

      <div style={{ padding: '8px 32px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Summary tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { l: 'Active', v: '4', s: 'rules' },
            { l: 'Saved you', v: '23', s: 'taps this month' },
            { l: 'Earned for you', v: '$14.20', s: 'auto-compound' },
            { l: 'Next run', v: '4h 12m', s: 'Daily SUI harvest' },
          ].map((t, i) => (
            <Card key={i} padding={14} radius={12}>
              <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.06em',
                textTransform: 'uppercase', fontWeight: 500 }}>{t.l}</div>
              <div style={{ marginTop: 4, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums' }}>{t.v}</div>
              <div style={{ fontSize: 11.5, color: LEVO.mute, marginTop: 2 }}>{t.s}</div>
            </Card>
          ))}
        </div>

        {/* Table + drawer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', gap: 14 }}>
          {/* Table */}
          <Card padding={0} radius={14}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${LEVO.border}`,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>All mandates</span>
              <div style={{ flex: 1 }}/>
              <span style={{ fontSize: 11, color: LEVO.mute }}>5 rows</span>
            </div>
            <div style={{ padding: '6px 6px' }}>
              {[
                { sel: true, name: 'Daily SUI harvest', sub: 'Auto-compound', state: 'active', next: '4h 12m', cap: '$1.20 / $2.40' },
                { name: 'Pay @jack weekly', sub: 'Recurring · USDC', state: 'active', next: 'Fri 9am', cap: '$0 / $50' },
                { name: 'Yield-chaser', sub: 'APY > 5%', state: 'idle', next: 'Watching', cap: '— / $500' },
                { name: 'Withdraw $100/mo', sub: 'Recurring · paused', state: 'paused', next: 'Paused', cap: '— / $100' },
                { name: 'Round-up to vault', sub: 'Spare change', state: 'active', next: 'On send', cap: '$0.30 / $5' },
              ].map((r, i) => (
                <div key={i} style={{
                  padding: '12px 12px', borderRadius: 10,
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: r.sel ? LEVO.surface : 'transparent',
                  boxShadow: r.sel ? `inset 0 0 0 1px ${LEVO.border}` : 'none',
                  cursor: 'pointer',
                }}>
                  <StateDot state={r.state}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: LEVO.mute }}>{r.sub}</div>
                  </div>
                  <div style={{ width: 90, textAlign: 'right' }}>
                    <div style={{ fontSize: 11.5, color: LEVO.soft }}>{r.next}</div>
                    <div style={{ fontSize: 10.5, color: LEVO.mute, fontVariantNumeric: 'tabular-nums' }}>
                      {r.cap}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Drawer detail */}
          <Card padding={0} radius={14} style={{ background: '#fff',
            boxShadow: `inset 0 0 0 1px ${LEVO.border}` }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${LEVO.border}`,
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 9, background: LEVO.up, color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{wico.refresh('#fff')}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  Daily SUI harvest
                </div>
                <div style={{ fontSize: 11.5, color: LEVO.mute, fontFamily: LEVO.mono }}>
                  cmp7nm7zg0000zbsos90ieomr · 0x4fc1…ae37
                </div>
              </div>
              <Pill tone="up">Active</Pill>
              <button style={{
                height: 30, padding: '0 10px', borderRadius: 8, background: '#fff',
                color: LEVO.ink, border: `1px solid ${LEVO.border}`, fontSize: 12,
                fontFamily: LEVO.sans, fontWeight: 500, display: 'inline-flex',
                alignItems: 'center', gap: 5,
              }}>{wico.pause(LEVO.ink)} Pause</button>
            </div>

            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Plain English */}
              <div style={{
                padding: '12px 14px', background: LEVO.surface, borderRadius: 12,
                fontSize: 13, lineHeight: 1.5, letterSpacing: '-0.005em',
              }}>
                Every day at <Bold>9:00 AM</Bold>, harvest up to <Bold>$2.40</Bold> from
                <Bold> SUI vault</Bold> and re-deposit. Expires <Bold>Jun 16</Bold>.
              </div>

              {/* Capacity bars */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <CapBar label="Today" cur={1.20} max={2.40} unit="$"/>
                <CapBar label="This week" cur={9.40} max={20} unit="$"/>
              </div>

              {/* Timeline */}
              <div>
                <div style={{ fontSize: 11.5, color: LEVO.mute, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Recent runs</div>
                <div style={{ position: 'relative', paddingLeft: 16 }}>
                  <div style={{
                    position: 'absolute', left: 5, top: 8, bottom: 8, width: 1.5,
                    background: LEVO.border,
                  }}/>
                  {[
                    { t: 'Today, 9:00 AM', amt: '+ $0.42', sub: '0.42 SUI · tx 0x4fc1…ae37', ok: true },
                    { t: 'Yesterday, 9:00 AM', amt: '+ $0.40', sub: '0.40 SUI · tx 0xb112…7da9', ok: true },
                    { t: 'Sun, 9:00 AM', amt: '+ $0.39', sub: '0.39 SUI · tx 0x32e9…04c1', ok: true },
                    { t: 'Sat, 9:00 AM', amt: 'Skipped', sub: 'APY guard tripped · re-enabled at 9:42 AM', ok: false },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '8px 0', position: 'relative' }}>
                      <span style={{
                        width: 11, height: 11, borderRadius: 999,
                        background: r.ok ? LEVO.up : LEVO.fade,
                        boxShadow: `0 0 0 3px #fff`,
                        marginLeft: -16, marginTop: 4, flexShrink: 0,
                      }}/>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, color: LEVO.ink, fontWeight: 500 }}>{r.t}</div>
                        <div style={{ fontSize: 11.5, color: LEVO.mute, fontFamily: LEVO.mono }}>{r.sub}</div>
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        color: r.ok ? LEVO.up : LEVO.mute }}>{r.amt}</span>
                      {r.ok && wico.link(LEVO.mute)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </WebShell>
  );
}

function StateDot({ state }) {
  const c =
    state === 'active' ? LEVO.up :
    state === 'idle' ? LEVO.blue :
    state === 'paused' ? LEVO.fade : LEVO.mute;
  return (
    <span style={{
      width: 8, height: 8, borderRadius: 999, background: c,
      boxShadow: state === 'active' ? `0 0 0 3px ${LEVO.upSoft}` :
                 state === 'idle' ? `0 0 0 3px rgba(31,90,168,0.13)` : 'none',
      flexShrink: 0,
    }}/>
  );
}

function CapBar({ label, cur, max, unit }) {
  const pct = Math.min(100, (cur / max) * 100);
  return (
    <div style={{ padding: 12, background: LEVO.surface, borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.06em',
          textTransform: 'uppercase', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: LEVO.soft }}>
          <span style={{ color: LEVO.ink, fontWeight: 600 }}>{unit}{cur.toFixed(2)}</span> / {unit}{max.toFixed(2)}
        </span>
      </div>
      <div style={{ marginTop: 8, height: 5, borderRadius: 999, background: LEVO.raise, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: LEVO.ink, borderRadius: 999 }}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5) EARN PAGE WITH INLINE AI RAIL
// ─────────────────────────────────────────────────────────────
function WebScene_Earn() {
  return (
    <WebShell active="earn">
      <PageHeader
        subtitle="Earn"
        title="USDC · StableLayer vault"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Pill tone="up" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600 }}>
              APY 4.81% · ▲ 0.12 today
            </Pill>
          </div>
        }
      />

      <div style={{ padding: '8px 32px 32px', display: 'grid',
        gridTemplateColumns: '1.5fr 1fr', gap: 14 }}>

        {/* LEFT — chart + your position */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card padding={0} radius={14}>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontWeight: 500 }}>Your position</div>
                <div style={{ marginTop: 6 }}><Money value={840.00} size={32}/></div>
                <div style={{ fontSize: 12, color: LEVO.up, marginTop: 2,
                  fontVariantNumeric: 'tabular-nums' }}>
                  ▲ $11.42 lifetime · 4.81% APY
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['7D','30D','90D','1Y','All'].map((t, i) => (
                  <span key={t} style={{
                    padding: '5px 11px', borderRadius: 7,
                    background: i === 1 ? LEVO.ink : 'transparent',
                    color: i === 1 ? '#fff' : LEVO.soft, fontSize: 12, fontWeight: 500,
                  }}>{t}</span>
                ))}
              </div>
            </div>
            <SparklineSVG/>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0,
              borderTop: `1px solid ${LEVO.border}` }}>
              {[
                { l: 'Earned 30d', v: '$3.42' },
                { l: 'Earned all-time', v: '$11.42' },
                { l: 'Avg APY 30d', v: '4.72%' },
                { l: 'TVL in vault', v: '$48.2M' },
              ].map((s, i) => (
                <div key={s.l} style={{
                  padding: '14px 18px',
                  borderLeft: i ? `1px solid ${LEVO.border}` : 'none',
                }}>
                  <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.06em',
                    textTransform: 'uppercase', fontWeight: 500 }}>{s.l}</div>
                  <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{s.v}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card padding={0} radius={14}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${LEVO.border}`,
              fontSize: 13.5, fontWeight: 600 }}>Activity in this vault</div>
            {[
              { t: 'Deposit', amt: '+ $200.00', sub: 'You · 6 days ago', tone: 'ink' },
              { t: 'Harvest', amt: '+ $0.42', sub: 'Agent · Daily SUI harvest · today', tone: 'up' },
              { t: 'Deposit', amt: '+ $50.00', sub: 'Agent · Round-up · yesterday', tone: 'up' },
            ].map((r, i) => (
              <div key={i} style={{
                padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 10,
                borderTop: i ? `1px solid ${LEVO.border}` : 'none',
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: r.tone === 'up' ? LEVO.upSoft : LEVO.surface,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {r.tone === 'up' ? wico.sparkle(LEVO.up) : wico.plus(LEVO.ink)}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.t}</div>
                  <div style={{ fontSize: 11, color: LEVO.mute }}>{r.sub}</div>
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  color: r.tone === 'up' ? LEVO.up : LEVO.ink,
                }}>{r.amt}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* RIGHT — AI rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* AI rec card */}
          <Card padding={18} radius={14} surface={LEVO.ink}
            style={{ color: '#fff', position: 'relative', overflow: 'hidden', borderRadius: 14 }}>
            <div style={{ position: 'absolute', right: -30, bottom: -50, opacity: 0.06,
              fontFamily: LEVO.mono, fontSize: 180, fontWeight: 600, lineHeight: 1, color: '#fff',
              pointerEvents: 'none' }}>
              %
            </div>
            <Pill tone="ink" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}>
              {wico.sparkle('#fff')} Agent recommends
            </Pill>
            <div style={{ fontSize: 19, fontWeight: 600, marginTop: 10, lineHeight: 1.3,
              letterSpacing: '-0.015em' }}>
              Auto-harvest every 24h, top-up your position when idle.
            </div>
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12,
              background: 'rgba(255,255,255,0.08)', fontSize: 13, lineHeight: 1.45,
              color: 'rgba(255,255,255,0.86)' }}>
              Based on your 30-day pattern, this earns you{' '}
              <span style={{ fontWeight: 600, color: '#fff' }}>~$11 more / year</span>{' '}
              vs. manual harvests. Caps + APY guard included.
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <CTA tone="ink" style={{ background: '#fff', color: LEVO.ink, height: 40, borderRadius: 10,
                fontSize: 13, flex: 1 }}>
                Review &amp; activate {wico.arrow(LEVO.ink)}
              </CTA>
              <button style={{
                height: 40, padding: '0 14px', borderRadius: 10,
                background: 'transparent', color: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.18)', fontSize: 13,
                fontFamily: LEVO.sans, fontWeight: 500,
              }}>Customize</button>
            </div>
          </Card>

          {/* Quick add */}
          <Card padding={16} radius={14}>
            <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.06em',
              textTransform: 'uppercase', fontWeight: 500 }}>Deposit more</div>
            <div style={{ marginTop: 10, padding: '12px 14px', background: LEVO.surface,
              borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>$</span>
              <span style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em', color: LEVO.mute, flex: 1 }}>0.00</span>
              <span style={{ fontSize: 12, color: LEVO.mute }}>USDC</span>
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              {['$10','$50','$100','Max'].map(c => (
                <span key={c} style={{
                  flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 7,
                  background: LEVO.surface, fontSize: 12, fontWeight: 500, color: LEVO.soft,
                }}>{c}</span>
              ))}
            </div>
            <CTA tone="ink" style={{ marginTop: 10, height: 42, fontSize: 13.5, borderRadius: 11 }}>
              Deposit
            </CTA>
          </Card>

          {/* AI insights cards */}
          <Card padding={14} radius={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {wico.trend(LEVO.up)}
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>APY trending up</span>
            </div>
            <div style={{ fontSize: 12, color: LEVO.soft, marginTop: 6, lineHeight: 1.5 }}>
              +0.4% over the last 7 days. Agent will adjust harvest cadence automatically.
            </div>
          </Card>
          <Card padding={14} radius={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {wico.shield(LEVO.ink)}
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Audited & isolated</span>
            </div>
            <div style={{ fontSize: 12, color: LEVO.soft, marginTop: 6, lineHeight: 1.5 }}>
              StableLayer vaults are non-custodial. Levo agent can only act inside your signed mandate.
            </div>
          </Card>
        </div>
      </div>
    </WebShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 6) APPROVAL MODAL — desktop centered, with scope viz
// ─────────────────────────────────────────────────────────────
function WebScene_ApprovalModal() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative',
      fontFamily: LEVO.sans, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.55, pointerEvents: 'none',
        filter: 'blur(1px)' }}>
        <WebScene_SplitComposer/>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,14,16,0.55)' }}/>

      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        width: 760, background: '#fff', borderRadius: 22,
        boxShadow: '0 50px 140px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        <div style={{ padding: '22px 26px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: `1px solid ${LEVO.border}` }}>
          <span style={{
            width: 38, height: 38, borderRadius: 12, background: LEVO.ink,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{wico.sparkle('#fff')}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.08em',
              textTransform: 'uppercase', fontWeight: 500 }}>You&rsquo;re granting</div>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em' }}>
              Daily SUI harvest
            </div>
          </div>
          <Pill tone="line">Reversible · expires in 30d</Pill>
        </div>

        <div style={{ padding: 26, display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 18 }}>
          {/* LEFT — Can / Cannot */}
          <div>
            <div style={{
              padding: '14px 16px', borderRadius: 14, background: LEVO.surface,
              fontSize: 14.5, lineHeight: 1.55, letterSpacing: '-0.005em',
            }}>
              The agent may <Bold>harvest yield</Bold> from your <Bold>SUI vault</Bold>{' '}
              &mdash; up to <Bold>$2.40 per run</Bold>, <Bold>$20/week</Bold>, for <Bold>30 days</Bold>.
              Pauses automatically if APY drops below 3%.
            </div>

            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: LEVO.up, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Can</div>
                {[
                  'Harvest yield from SUI vault',
                  'Re-deposit harvested rewards',
                  'Pause itself if guard trips',
                ].map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 0', fontSize: 12.5, color: LEVO.ink }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 999, background: LEVO.upSoft,
                      color: LEVO.up, display: 'inline-flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 9, fontWeight: 700,
                    }}>✓</span>
                    {t}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, color: LEVO.down, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Cannot</div>
                {[
                  'Send to other addresses',
                  'Move funds off Levo',
                  'Exceed $20/week, ever',
                  'Run after Jun 16',
                ].map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 0', fontSize: 12.5, color: LEVO.soft }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 999, background: LEVO.downSoft,
                      color: LEVO.down, display: 'inline-flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 9, fontWeight: 700,
                    }}>✕</span>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — chain viz */}
          <div style={{ padding: 18, background: LEVO.sunk, borderRadius: 14,
            boxShadow: `inset 0 0 0 1px ${LEVO.border}` }}>
            <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.06em',
              textTransform: 'uppercase', fontWeight: 500, marginBottom: 10 }}>
              How it runs
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { i: wico.shield(LEVO.ink), t: 'Your X session signs this mandate', s: 'Privy authorization · one tap' },
                { i: wico.sparkle(LEVO.ink), t: 'Witness chain is committed on-chain', s: 'Each step pre-authorized, no surprises' },
                { i: wico.refresh(LEVO.ink), t: 'Scheduler fires daily at 9:00 AM', s: 'Levo agent KMS signs only inside caps' },
                { i: wico.check(LEVO.up), t: 'You see the receipt instantly', s: 'Revoke or pause from any screen' },
              ].map((r, i, arr) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: 9, background: '#fff',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `inset 0 0 0 1px ${LEVO.border}`,
                    }}>{r.i}</span>
                    {i < arr.length - 1 && (
                      <span style={{ width: 1.5, flex: 1, background: LEVO.border, margin: '2px 0' }}/>
                    )}
                  </div>
                  <div style={{ paddingBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.t}</div>
                    <div style={{ fontSize: 11.5, color: LEVO.mute }}>{r.s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{
          padding: '16px 26px 22px', display: 'flex', alignItems: 'center', gap: 10,
          borderTop: `1px solid ${LEVO.border}`, background: LEVO.bg,
        }}>
          <div style={{ flex: 1, fontSize: 12, color: LEVO.mute, display: 'flex',
            alignItems: 'center', gap: 6 }}>
            {wico.shield(LEVO.mute)}
            Signing via X session ·{' '}
            <span style={{ fontFamily: LEVO.mono, color: LEVO.soft }}>0x7bca…1f9b</span>
          </div>
          <CTA tone="ghost" style={{ height: 42, fontSize: 13.5, borderRadius: 11,
            background: LEVO.surface }}>Cancel</CTA>
          <CTA tone="ink" style={{ height: 42, fontSize: 13.5, borderRadius: 11, padding: '0 22px' }}>
            {wico.shield('#fff')} Sign &amp; activate
          </CTA>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  WebScene_Dashboard, WebScene_SplitComposer, WebScene_CmdK,
  WebScene_Drilldown, WebScene_Earn, WebScene_ApprovalModal,
});
