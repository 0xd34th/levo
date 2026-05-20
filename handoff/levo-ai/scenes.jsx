// scenes.jsx — 8 frictionless AI UX scenarios for Levo
// Each scene returns a body element to drop inside <IOSDevice>.

const { LEVO, Wordmark, Sparkle, Pill, Money, Avatar, Tabs, Card,
  LevoShell, IconTile, CTA, Row, BackChevron, STATUS_OFFSET } = window;

// ─────────────────────────────────────────────────────────────
// Small icon set (Lucide-style minimal)
// ─────────────────────────────────────────────────────────────
const ico = {
  send: (c = '#fff') => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>
  ),
  plus: (c = '#fff') => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
  ),
  arrow: (c) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
  ),
  check: (c = '#fff') => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
  ),
  clock: (c) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
  ),
  bolt: (c = '#fff') => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
  ),
  shield: (c) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  x: (c) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
  ),
  pause: (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill={c}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
  ),
  play: (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill={c}><path d="M6 4v16l14-8z"/></svg>
  ),
  search: (c) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
  ),
  cmdk: (c) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>
  ),
  twitter: (c) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={c}><path d="M18.244 2H21.55l-7.224 8.26L23 22h-6.84l-5.36-7.005L4.7 22H1.392l7.728-8.835L1 2h7.012l4.84 6.4L18.244 2zm-1.16 18h1.84L7.04 4H5.07l12.014 16z"/></svg>
  ),
  trend: (c) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 7-9.5 9.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>
  ),
  refresh: (c) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
  ),
  vault: (c) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9V7M12 17v-2M9 12H7M17 12h-2"/></svg>
  ),
  calendar: (c) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  ),
  mic: (c) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/></svg>
  ),
};

// ─────────────────────────────────────────────────────────────
// 1) HOME — Ambient AI suggestion (replaces floating ✨)
// ─────────────────────────────────────────────────────────────
function Scene_AmbientHome() {
  return (
    <LevoShell tab="home">
      {/* Balance */}
      <div style={{ paddingTop: 4 }}>
        <div className="eyebrow" style={{
          fontSize: 11, letterSpacing: '0.08em', color: LEVO.mute,
          fontWeight: 500, textTransform: 'uppercase', marginBottom: 6,
        }}>Total balance</div>
        <Money value={1242.18} size={40} ccy="USDC"/>
        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Pill tone="up">▲ $4.20 today</Pill>
          <Pill tone="line">earning 4.8% APY</Pill>
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {['Send', 'Deposit', 'Earn', 'Lookup'].map((t, i) => (
          <div key={t} style={{
            flex: 1, height: 64, borderRadius: 14, background: LEVO.surface,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 4,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, background: LEVO.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {i === 0 ? ico.send() : i === 1 ? ico.plus() : i === 2 ? ico.trend('#fff') : ico.search('#fff')}
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: LEVO.soft }}>{t}</span>
          </div>
        ))}
      </div>

      {/* ⭐ THE AMBIENT AI CARD — the centerpiece of this scene */}
      <Card padding={14} surface={LEVO.ink} radius={18}
        style={{ color: '#fff', position: 'relative', overflow: 'hidden' }}>
        {/* Subtle sparkle decoration */}
        <div style={{
          position: 'absolute', right: -10, top: -10, opacity: 0.08,
        }}>
          <Sparkle size={120} color="#fff" stroke={1.2}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.12)', padding: '3px 8px',
            borderRadius: 999, fontSize: 10.5, fontWeight: 500,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            <Sparkle size={11} color="#fff"/> Agent suggests
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.3, marginTop: 10,
          letterSpacing: '-0.01em' }}>
          You have <span style={{ fontWeight: 600 }}>$1,242 idle</span>. Auto-compound
          daily and earn ~<span style={{ fontWeight: 600 }}>$58/year</span>?
        </div>
        <div style={{
          marginTop: 12, display: 'flex', gap: 6, fontSize: 11,
          color: 'rgba(255,255,255,0.7)', alignItems: 'center',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {ico.vault('rgba(255,255,255,0.7)')} StableLayer · USDC
          </span>
          <span>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {ico.shield('rgba(255,255,255,0.7)')} You stay in control
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <CTA tone="ink" style={{
            background: '#fff', color: LEVO.ink, height: 40, flex: 1, borderRadius: 10,
            fontSize: 13.5,
          }}>
            Set & forget {ico.arrow(LEVO.ink)}
          </CTA>
          <button style={{
            height: 40, padding: '0 14px', borderRadius: 10,
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(255,255,255,0.18)', fontSize: 13,
            fontFamily: LEVO.sans, fontWeight: 500,
          }}>Not now</button>
        </div>
      </Card>

      {/* Recent activity preview */}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: LEVO.soft }}>Recent activity</span>
          <span style={{ fontSize: 13, color: LEVO.mute }}>See all</span>
        </div>
        <Card padding={0} radius={16}>
          {[
            { who: '@nikitabier', amt: '+ 120.00', dir: 'in' },
            { who: '@_brentbum', amt: '− 35.00', dir: 'out' },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '13px 14px',
              borderTop: i ? `1px solid ${LEVO.border}` : 'none',
            }}>
              <Avatar size={32} label={r.who.slice(1, 3).toUpperCase()} bg={LEVO.raise} color={LEVO.ink}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.who}</div>
                <div style={{ fontSize: 11, color: LEVO.mute }}>Just now · Confirmed</div>
              </div>
              <span style={{
                fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                color: r.dir === 'in' ? LEVO.up : LEVO.ink,
              }}>{r.amt} <span style={{ color: LEVO.mute, fontWeight: 500, fontSize: 11 }}>USDC</span></span>
            </div>
          ))}
        </Card>
      </div>
    </LevoShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 2) NL COMPOSER — chat sheet with suggestion chips + streaming
// ─────────────────────────────────────────────────────────────
function Scene_Composer() {
  const suggestions = [
    { icon: ico.refresh(LEVO.ink), label: 'Auto-compound my idle USDC' },
    { icon: ico.calendar(LEVO.ink), label: 'Pay @jack $50 every Friday' },
    { icon: ico.trend(LEVO.ink), label: 'Move funds when APY > 5%' },
    { icon: ico.bolt(LEVO.ink), label: 'Withdraw $100 to my account' },
  ];

  return (
    <div style={{
      width: '100%', height: '100%', background: LEVO.bg,
      paddingTop: STATUS_OFFSET, fontFamily: LEVO.sans, color: LEVO.ink,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Slide-over header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 20px 14px', borderBottom: `1px solid ${LEVO.border}`,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 10, background: LEVO.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkle size={15} color="#fff"/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Levo Agent</div>
          <div style={{ fontSize: 11, color: LEVO.mute }}>Plans actions, never moves funds without you</div>
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: LEVO.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{ico.x(LEVO.soft)}</div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '18px 20px', display: 'flex',
        flexDirection: 'column', gap: 14, overflow: 'auto' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            What should we<br/>handle for you?
          </div>
          <div style={{ fontSize: 13.5, color: LEVO.soft, marginTop: 6, lineHeight: 1.45 }}>
            Describe a goal in your own words.<br/>
            We&rsquo;ll draft the rules &mdash; you approve before anything runs.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {suggestions.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '12px 14px', background: LEVO.surface, borderRadius: 12,
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 8, background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `inset 0 0 0 1px ${LEVO.border}`,
              }}>{s.icon}</span>
              <span style={{ fontSize: 13.5, fontWeight: 500, flex: 1 }}>{s.label}</span>
              {ico.arrow(LEVO.mute)}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto' }}>
          <div style={{ fontSize: 11, color: LEVO.mute, marginBottom: 8, display: 'flex',
            alignItems: 'center', gap: 5 }}>
            {ico.shield(LEVO.mute)} Caps & expiry are baked in on-chain
          </div>
        </div>
      </div>

      {/* Composer — tall, single-tap */}
      <div style={{
        padding: '10px 14px 18px', borderTop: `1px solid ${LEVO.border}`,
        background: LEVO.bg,
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          background: LEVO.surface, borderRadius: 18, padding: '10px 12px',
          minHeight: 56,
        }}>
          <span style={{ fontSize: 14, color: LEVO.mute, paddingBottom: 4, flex: 1 }}>
            Try &ldquo;harvest yield daily at 9am&rdquo;…
          </span>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: LEVO.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${LEVO.border}`,
          }}>{ico.mic(LEVO.soft)}</div>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: LEVO.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{ico.send('#fff')}</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3) PROPOSAL CARD — human-readable mandate proposal
// ─────────────────────────────────────────────────────────────
function Scene_Proposal() {
  return (
    <div style={{
      width: '100%', height: '100%', background: LEVO.bg,
      paddingTop: STATUS_OFFSET, fontFamily: LEVO.sans, color: LEVO.ink,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 20px 12px',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 9, background: LEVO.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Sparkle size={13} color="#fff"/></div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Levo Agent</div>
        <div style={{ flex: 1 }}/>
        <Pill tone="line">Draft</Pill>
      </div>

      <div style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10,
        overflow: 'auto', paddingBottom: 12 }}>
        {/* user bubble */}
        <div style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
          <div style={{
            background: LEVO.ink, color: '#fff', borderRadius: 14,
            padding: '9px 13px', fontSize: 13.5, lineHeight: 1.4,
          }}>auto-compound my SUI yield every morning</div>
        </div>

        {/* agent text */}
        <div style={{ maxWidth: '85%' }}>
          <div style={{
            background: LEVO.surface, color: LEVO.ink, borderRadius: 14,
            padding: '10px 13px', fontSize: 13.5, lineHeight: 1.45,
          }}>
            Here&rsquo;s a draft. Adjust anything &mdash; I&rsquo;ll only act inside these limits.
          </div>
        </div>

        {/* THE STRUCTURED PROPOSAL CARD */}
        <div style={{
          background: '#fff', borderRadius: 18,
          boxShadow: `inset 0 0 0 1px ${LEVO.borderStrong}, 0 12px 30px -10px rgba(14,14,16,0.18)`,
          padding: 16, marginTop: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 8, background: LEVO.upSoft,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{ico.refresh(LEVO.up)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                Daily SUI harvest
              </div>
              <div style={{ fontSize: 11, color: LEVO.mute }}>StableLayer · SUI vault</div>
            </div>
          </div>

          {/* Plain-English summary */}
          <div style={{
            marginTop: 12, padding: '12px 12px', borderRadius: 12,
            background: LEVO.sunk, fontSize: 13, lineHeight: 1.5, color: LEVO.ink,
          }}>
            <span style={{ color: LEVO.mute }}>Every day at </span>
            <span style={{ fontWeight: 600 }}>9:00 AM</span>
            <span style={{ color: LEVO.mute }}>, harvest up to </span>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>~$2.40</span>
            <span style={{ color: LEVO.mute }}> of yield and re-deposit it. Max </span>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>$20/week</span>
            <span style={{ color: LEVO.mute }}>. Expires </span>
            <span style={{ fontWeight: 600 }}>Jun 16</span>
            <span style={{ color: LEVO.mute }}>.</span>
          </div>

          {/* Editable knobs */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: LEVO.mute, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Cap per run</span>
                <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>$2.40</span>
              </div>
              <div style={{
                height: 5, borderRadius: 999, background: LEVO.raise, overflow: 'hidden',
              }}>
                <div style={{ width: '24%', height: '100%', background: LEVO.ink, borderRadius: 999 }}/>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ padding: 10, background: LEVO.surface, borderRadius: 12 }}>
                <div style={{ fontSize: 10.5, color: LEVO.mute, letterSpacing: '0.04em',
                  textTransform: 'uppercase', fontWeight: 500 }}>Schedule</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, display: 'flex',
                  alignItems: 'center', gap: 5 }}>
                  {ico.clock(LEVO.ink)} Daily 9:00 AM
                </div>
              </div>
              <div style={{ padding: 10, background: LEVO.surface, borderRadius: 12 }}>
                <div style={{ fontSize: 10.5, color: LEVO.mute, letterSpacing: '0.04em',
                  textTransform: 'uppercase', fontWeight: 500 }}>Expires</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, display: 'flex',
                  alignItems: 'center', gap: 5 }}>
                  {ico.calendar(LEVO.ink)} In 30 days
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <CTA tone="ghost" style={{ flex: 1, height: 44 }}>Tweak</CTA>
            <CTA tone="ink" style={{ flex: 2, height: 44 }}>
              {ico.check('#fff')} Approve & start
            </CTA>
          </div>
        </div>
      </div>

      {/* composer (collapsed) */}
      <div style={{
        padding: '10px 14px 18px', borderTop: `1px solid ${LEVO.border}`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: LEVO.surface, borderRadius: 999, padding: '6px 6px 6px 14px',
        }}>
          <span style={{ fontSize: 13, color: LEVO.mute, flex: 1 }}>Make it weekly instead…</span>
          <div style={{
            width: 32, height: 32, borderRadius: 999, background: LEVO.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{ico.send('#fff')}</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 4) SEND — NL augmented (recognizes recurring intent)
// ─────────────────────────────────────────────────────────────
function Scene_NLSend() {
  return (
    <LevoShell navTitle="Send" hideTabs>
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.08em',
          textTransform: 'uppercase', fontWeight: 500, marginBottom: 6 }}>To</div>
        <div style={{
          padding: '11px 14px', background: LEVO.surface, borderRadius: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Avatar size={32} label="JK" bg={LEVO.ink}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              {ico.twitter(LEVO.ink)} @jack
            </div>
            <div style={{ fontSize: 11, color: LEVO.mute, fontFamily: LEVO.mono }}>0x7bca…1f9b</div>
          </div>
          <Pill tone="up">{ico.check(LEVO.up)} Verified</Pill>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.08em',
          textTransform: 'uppercase', fontWeight: 500, marginBottom: 6 }}>Amount</div>
        <div style={{
          padding: '16px 16px', background: LEVO.surface, borderRadius: 14,
        }}>
          <Money value={50.00} size={36} ccy="USDC"/>
          <div style={{ marginTop: 6, fontSize: 12, color: LEVO.mute }}>
            ≈ <span style={{ fontVariantNumeric: 'tabular-nums' }}>49.94</span> after fees
          </div>
        </div>
      </div>

      {/* The AI augmentation: detected intent banner */}
      <div style={{
        background: '#fff', borderRadius: 16,
        boxShadow: `inset 0 0 0 1.5px ${LEVO.ink}`,
        padding: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkle size={13} color={LEVO.ink}/>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase' }}>Detected from your note</span>
        </div>
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 10,
          background: LEVO.sunk, fontFamily: LEVO.mono, fontSize: 12,
          color: LEVO.soft,
        }}>
          &ldquo;send <span style={{ background: LEVO.upSoft, color: LEVO.up,
            padding: '1px 4px', borderRadius: 4 }}>50 to @jack</span>{' '}
          <span style={{ background: '#FFF4D6', color: '#8a6a00',
            padding: '1px 4px', borderRadius: 4 }}>every Friday</span>&rdquo;
        </div>
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 12,
          background: LEVO.surface, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8, background: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `inset 0 0 0 1px ${LEVO.border}`,
          }}>{ico.calendar(LEVO.ink)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>Make this recurring</div>
            <div style={{ fontSize: 11, color: LEVO.mute }}>
              Every Friday · max $50/wk · stops after 12 weeks
            </div>
          </div>
          <div style={{
            width: 36, height: 22, background: LEVO.ink, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            padding: 2,
          }}>
            <span style={{ width: 18, height: 18, borderRadius: 999, background: '#fff' }}/>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }}/>
      <CTA tone="ink" height={54} style={{ borderRadius: 16 }}>
        Send $50 & start recurring {ico.arrow('#fff')}
      </CTA>
    </LevoShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 5) MANDATES TICKER — clean, calm list with countdowns
// ─────────────────────────────────────────────────────────────
function Scene_MandatesTicker() {
  const items = [
    {
      icon: ico.refresh('#fff'), iconBg: LEVO.up,
      name: 'Daily SUI harvest',
      subtitle: 'Auto-compound · StableLayer',
      next: 'Next run in 4h 12m',
      capLabel: 'Today', capValue: 1.20, capMax: 2.40,
      state: 'active',
    },
    {
      icon: ico.send('#fff'), iconBg: LEVO.ink,
      name: 'Pay @jack weekly',
      subtitle: 'Recurring · USDC',
      next: 'Next Fri · $50',
      capLabel: 'This week', capValue: 0, capMax: 50,
      state: 'active',
    },
    {
      icon: ico.trend('#fff'), iconBg: LEVO.blue,
      name: 'Yield-chaser',
      subtitle: 'Moves when APY > 5%',
      next: 'Watching — APY 4.81%',
      capLabel: 'Per move', capValue: 0, capMax: 500,
      state: 'idle',
    },
    {
      icon: ico.pause(LEVO.mute), iconBg: LEVO.raise,
      name: 'Withdraw $100 monthly',
      subtitle: 'Paused 2 days ago',
      next: 'Paused',
      capLabel: '', capValue: 0, capMax: 100,
      state: 'paused',
    },
  ];

  return (
    <LevoShell tab="home" hideTabs navTitle="Agent">
      <div style={{ marginTop: 2 }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>4 active rules</div>
        <div style={{ fontSize: 13, color: LEVO.soft, marginTop: 2 }}>
          Saved you <span style={{ fontWeight: 600, color: LEVO.ink }}>23 taps</span>{' '}
          and earned <span style={{ fontWeight: 600, color: LEVO.up }}>$14.20</span> this month.
        </div>
      </div>

      {items.map((it, i) => (
        <Card key={i} padding={14} radius={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <IconTile bg={it.iconBg} size={36}>{it.icon}</IconTile>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' }}>{it.name}</div>
              <div style={{ fontSize: 11.5, color: LEVO.mute, marginTop: 1 }}>{it.subtitle}</div>
            </div>
            {it.state === 'paused' ? (
              <button style={{
                width: 32, height: 32, borderRadius: 10, border: `1px solid ${LEVO.border}`,
                background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{ico.play(LEVO.ink)}</button>
            ) : (
              <button style={{
                width: 32, height: 32, borderRadius: 10, border: `1px solid ${LEVO.border}`,
                background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{ico.pause(LEVO.soft)}</button>
            )}
          </div>
          <div style={{ marginTop: 11, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 11.5, color: it.state === 'paused' ? LEVO.mute : LEVO.soft,
              display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {it.state !== 'paused' && (
                <span style={{
                  width: 6, height: 6, borderRadius: 999, background: LEVO.up,
                  boxShadow: `0 0 0 3px ${LEVO.upSoft}`,
                }}/>
              )}
              {it.next}
            </span>
            {it.capLabel && (
              <span style={{ fontSize: 11, color: LEVO.mute, fontVariantNumeric: 'tabular-nums' }}>
                {it.capLabel}: ${it.capValue.toFixed(2)} / ${it.capMax.toFixed(2)}
              </span>
            )}
          </div>
          {it.capLabel && (
            <div style={{
              height: 3, borderRadius: 999, background: LEVO.raise, marginTop: 7, overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(100, (it.capValue / it.capMax) * 100)}%`, height: '100%',
                background: it.state === 'paused' ? LEVO.fade : LEVO.ink, borderRadius: 999,
              }}/>
            </div>
          )}
        </Card>
      ))}

      <CTA tone="ghost" height={48} style={{ marginTop: 4, borderRadius: 14,
        boxShadow: `inset 0 0 0 1px ${LEVO.border}`, background: '#fff' }}>
        {ico.plus(LEVO.ink)} New rule
      </CTA>
    </LevoShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 6) RECEIPT — push-style transparency banner on Home
// ─────────────────────────────────────────────────────────────
function Scene_Receipt() {
  // Pre-built banner riding on top of the home shell
  const banner = (
    <div style={{
      margin: '4px 14px 0', padding: '11px 12px', borderRadius: 14,
      background: LEVO.upSoft, display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: `inset 0 0 0 1px rgba(31,122,62,0.18)`,
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 10, background: LEVO.up,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{ico.check('#fff')}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: LEVO.up, letterSpacing: '-0.005em' }}>
          Agent harvested $0.42 yield
        </div>
        <div style={{ fontSize: 11, color: LEVO.up, opacity: 0.78 }}>
          12 seconds ago · Daily SUI harvest · Tap for receipt
        </div>
      </div>
      {ico.arrow(LEVO.up)}
    </div>
  );

  return (
    <LevoShell tab="home" topBanner={banner}>
      <div style={{ paddingTop: 4 }}>
        <div className="eyebrow" style={{
          fontSize: 11, letterSpacing: '0.08em', color: LEVO.mute,
          fontWeight: 500, textTransform: 'uppercase', marginBottom: 6,
        }}>Total balance</div>
        <Money value={1242.60} size={40} ccy="USDC"/>
        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Pill tone="up">▲ $4.62 today</Pill>
          <Pill tone="line">earning 4.8% APY</Pill>
        </div>
      </div>

      {/* Agent activity timeline */}
      <Card padding={0} radius={16}>
        <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: `1px solid ${LEVO.border}` }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600 }}>
            <Sparkle size={13} color={LEVO.ink}/> Agent timeline
          </span>
          <span style={{ fontSize: 12, color: LEVO.mute }}>Last 24h</span>
        </div>

        {[
          { time: 'Just now', label: 'Harvested 0.42 SUI', sub: 'Daily SUI harvest', amt: '+$0.42', tone: 'up' },
          { time: '6h ago', label: 'Deposited $50.00', sub: 'Round-up · USDC', amt: '+$0.30 APY', tone: 'soft' },
          { time: '1d ago', label: 'Sent $50.00 to @jack', sub: 'Pay @jack weekly · run 3 of 12', amt: '−$50.00', tone: 'ink' },
        ].map((r, i) => (
          <div key={i} style={{
            padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11,
            borderTop: i ? `1px solid ${LEVO.border}` : 'none',
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 999,
              background: r.tone === 'up' ? LEVO.upSoft : LEVO.surface,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {r.tone === 'up' ? ico.check(LEVO.up) :
                r.tone === 'ink' ? ico.send(LEVO.ink) : ico.plus(LEVO.ink)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{r.label}</div>
              <div style={{ fontSize: 11, color: LEVO.mute }}>{r.time} · {r.sub}</div>
            </div>
            <span style={{
              fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: r.tone === 'up' ? LEVO.up : LEVO.ink,
            }}>{r.amt}</span>
          </div>
        ))}
      </Card>

      <div style={{
        marginTop: 4, padding: '12px 14px', background: LEVO.surface, borderRadius: 14,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {ico.shield(LEVO.soft)}
        <span style={{ fontSize: 12, color: LEVO.soft, flex: 1 }}>
          Every action is signed on-chain. You can pause or revoke at any time.
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: LEVO.ink }}>Manage</span>
      </div>
    </LevoShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 7) PERMISSION PREVIEW — pre-approval scope sheet
// ─────────────────────────────────────────────────────────────
function Scene_Permission() {
  return (
    <div style={{
      width: '100%', height: '100%', background: 'rgba(14,14,16,0.32)',
      paddingTop: STATUS_OFFSET, fontFamily: LEVO.sans, position: 'relative',
      overflow: 'hidden',
    }}>
      {/* dim shadow of underlying screen */}
      <div style={{
        position: 'absolute', inset: STATUS_OFFSET + 'px 0 0', opacity: 0.3,
        padding: '6px 20px',
      }}>
        <Wordmark size={22} color="#fff"/>
      </div>

      {/* Bottom sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: '12px 22px 36px',
        boxShadow: '0 -20px 60px rgba(14,14,16,0.25)',
      }}>
        {/* Grabber */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <span style={{ width: 38, height: 4, borderRadius: 999, background: LEVO.raise }}/>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 12, background: LEVO.ink,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><Sparkle size={16} color="#fff"/></span>
          <div>
            <div style={{ fontSize: 11, color: LEVO.mute, letterSpacing: '0.08em',
              textTransform: 'uppercase', fontWeight: 500 }}>You&rsquo;re granting</div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
              Daily SUI harvest
            </div>
          </div>
        </div>

        {/* Big plain-English summary */}
        <div style={{
          marginTop: 16, padding: '14px 14px', borderRadius: 14,
          background: LEVO.surface, fontSize: 14.5, lineHeight: 1.5, color: LEVO.ink,
          letterSpacing: '-0.005em',
        }}>
          The agent may <span style={{ fontWeight: 600 }}>harvest yield</span> from
          your <span style={{ fontWeight: 600 }}>SUI vault</span> &mdash; up
          to <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>$2.40 per run</span>,
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}> $20/week</span>,
          for <span style={{ fontWeight: 600 }}>30 days</span>.
        </div>

        {/* Can / cannot */}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { ok: true, t: 'Harvest yield from StableLayer SUI vault' },
            { ok: true, t: 'Re-deposit harvested rewards' },
            { ok: false, t: 'Send to other addresses' },
            { ok: false, t: 'Move funds off Levo' },
            { ok: false, t: 'Exceed $20/week, ever' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9,
              padding: '6px 0', fontSize: 13, color: r.ok ? LEVO.ink : LEVO.soft }}>
              <span style={{
                width: 18, height: 18, borderRadius: 999,
                background: r.ok ? LEVO.upSoft : LEVO.downSoft,
                color: r.ok ? LEVO.up : LEVO.down,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
              }}>{r.ok ? '✓' : '✕'}</span>
              {r.t}
            </div>
          ))}
        </div>

        {/* Expiry mini-bar */}
        <div style={{ marginTop: 14, padding: '11px 12px', borderRadius: 12,
          background: LEVO.sunk, display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: `inset 0 0 0 1px ${LEVO.border}` }}>
          {ico.clock(LEVO.soft)}
          <span style={{ fontSize: 12, color: LEVO.soft, flex: 1 }}>
            Auto-expires <span style={{ color: LEVO.ink, fontWeight: 600 }}>Jun 16</span>{' '}
            &mdash; you can revoke anytime
          </span>
        </div>

        <CTA tone="ink" height={52} style={{ marginTop: 16, borderRadius: 14 }}>
          {ico.shield('#fff')} Sign with X &amp; activate
        </CTA>
        <button style={{
          width: '100%', height: 44, marginTop: 8, border: 'none', background: 'transparent',
          color: LEVO.soft, fontFamily: LEVO.sans, fontSize: 14, fontWeight: 500,
        }}>Cancel</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 8) SPOTLIGHT — universal AI command from anywhere
// ─────────────────────────────────────────────────────────────
function Scene_Spotlight() {
  return (
    <div style={{
      width: '100%', height: '100%', background: 'rgba(14,14,16,0.55)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      paddingTop: STATUS_OFFSET, fontFamily: LEVO.sans, position: 'relative',
    }}>
      {/* The command palette, anchored near top */}
      <div style={{
        margin: '20px 16px 0', background: '#fff', borderRadius: 22,
        boxShadow: '0 30px 80px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.3)',
        overflow: 'hidden',
      }}>
        {/* Input row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', borderBottom: `1px solid ${LEVO.border}` }}>
          <Sparkle size={17} color={LEVO.ink}/>
          <span style={{ fontSize: 16, color: LEVO.ink, letterSpacing: '-0.01em', flex: 1 }}>
            send 50 to <span style={{ background: LEVO.upSoft, color: LEVO.up,
              borderRadius: 5, padding: '1px 4px' }}>@jack</span>
            <span style={{
              display: 'inline-block', width: 1.5, height: 17, background: LEVO.ink,
              marginLeft: 2, verticalAlign: -3, animation: 'blink 1s steps(2) infinite',
            }}/>
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500, color: LEVO.mute, padding: '2px 7px',
            background: LEVO.surface, borderRadius: 6,
          }}>⌘K</span>
        </div>

        {/* Result rows */}
        <div style={{ padding: '6px 6px 8px' }}>
          {/* Primary action */}
          <div style={{
            padding: '10px 12px', borderRadius: 12, background: LEVO.ink,
            display: 'flex', alignItems: 'center', gap: 11, margin: '4px 0',
          }}>
            <span style={{
              width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.16)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{ico.send('#fff')}</span>
            <div style={{ flex: 1, color: '#fff' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Send $50 to @jack</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                One-time · ≈ $49.94 after fees
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
              padding: '3px 7px', background: 'rgba(255,255,255,0.14)', borderRadius: 6,
            }}>↵</span>
          </div>

          {/* Secondary actions */}
          {[
            { icon: ico.calendar(LEVO.ink), title: 'Send $50 to @jack every Friday',
              sub: 'Create recurring rule · expires in 12 weeks' },
            { icon: ico.search(LEVO.ink), title: 'Look up @jack',
              sub: 'jack.eth on X · verified Sui address' },
            { icon: ico.refresh(LEVO.ink), title: 'Last send to @jack: $50.00, 6 days ago',
              sub: 'Repeat this transfer' },
          ].map((r, i) => (
            <div key={i} style={{
              padding: '10px 12px', borderRadius: 12, display: 'flex', alignItems: 'center',
              gap: 11, margin: '2px 0',
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 8, background: LEVO.surface,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{r.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: LEVO.ink }}>{r.title}</div>
                <div style={{ fontSize: 11, color: LEVO.mute }}>{r.sub}</div>
              </div>
              {ico.arrow(LEVO.mute)}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '8px 14px', background: LEVO.sunk, fontSize: 10.5, color: LEVO.mute,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          letterSpacing: '0.02em',
        }}>
          <span>↑↓ to navigate · ↵ to confirm</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {ico.shield(LEVO.mute)} Powered by Levo Agent
          </span>
        </div>
      </div>

      {/* Below: hint about how to summon */}
      <div style={{
        margin: '14px auto 0', maxWidth: 280, textAlign: 'center',
        fontSize: 11, color: 'rgba(255,255,255,0.7)',
      }}>
        Swipe down from any screen or hit ⌘K
      </div>

      <style>{`@keyframes blink { 50% { opacity: 0 } }`}</style>
    </div>
  );
}

Object.assign(window, {
  Scene_AmbientHome, Scene_Composer, Scene_Proposal, Scene_NLSend,
  Scene_MandatesTicker, Scene_Receipt, Scene_Permission, Scene_Spotlight,
});
