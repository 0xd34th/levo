/**
 * "Levo" wordmark — round 1 placeholder.
 * Renders as an IBM Plex Sans 700 wordmark; fill is driven by `.main-color`
 * via Logo.style.ts (palette.logoPrimary), so dark/light mode and partner
 * themes pick up the correct color automatically.
 */
export const JumperLogoBase = () => (
  <text
    x="0"
    y="38"
    className="main-color"
    fontFamily="'IBM Plex Sans','system-ui',sans-serif"
    fontWeight={700}
    fontSize={44}
    letterSpacing={-1.6}
  >
    Levo
  </text>
);
