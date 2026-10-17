// Station $PLEIN · settings the team sets once and changes rarely.
// What changes on launch day and every week (contract, wallets, dashboard) lives in
// /live.json instead: the page re-reads that file while it is open, so visitors waiting on
// the countdown see the contract appear at the opening without reloading. Once open, the
// dashboard comes from /api/chain; live.json stays its fallback.
window.PLEIN_CONFIG = {
  // Saturday 17 October 2026, 15:30 Paris, on pump.fun. Before this moment, or while live.json
  // has no contract, the site shows its pre-opening state.
  launchAt: '2026-10-17T15:30:00+02:00',

  // The weekly plein is every Saturday at 18:00 Paris, starting one week after the launch: on
  // launch day the countdown after opening points here, not to 18:00 the same evening.
  firstPleinAt: '2026-10-24T18:00:00+02:00',

  // Where $PLEIN trades. Fees as pump.fun publishes them on pump.fun/docs/fees (read on
  // 17 October 2026); Tier 2 until the first ticket shows them on-chain. The tier tables and
  // the arithmetic live in public/js/fees.js. The page's fee copy quotes the scale of the pair
  // chosen here (public/index.html is written for USDC; the scale sentences follow this key).
  launchpad: {
    name: 'pump.fun',
    // quote asset chosen at creation; must match what the founders pick on pump.fun
    quote: 'USDC',
    coinUrl: 'https://pump.fun/coin/',
  },

  // Official weekly national average for diesel (ministry survey, DGEC), used for Saturday's
  // buyback rate: the latest survey published before Saturday 17:45. Update it every week and
  // keep the date honest.
  // 9 Oct 2026 survey: 2.3283 €/L as quoted by Le Figaro (12 Oct) and Selectra (15 Oct, "2,33 €").
  // Tier 2 until checked against the ministry's own weekly note (NPG-2026.10.09).
  // The previous survey (2 Oct) was 2.356, the figure used in the design files and docs.
  official: {
    gazole: 2.3283,
    weekLabel: '9 oct.',
    source: 'Relevé hebdomadaire officiel du 9 octobre 2026',
  },

  // Official channels. Leave empty until the accounts exist.
  links: {
    xHandle: '',        // e.g. 'stationplein' (without @)
    telegram: '',       // e.g. 'https://t.me/stationplein'
  },

  // Jupiter Plugin (integrated mode, output locked to $PLEIN). Visitors sign in their own wallet.
  jupiter: {
    pluginSrc: 'https://plugin.jup.ag/plugin-v1.js',
    inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    referralAccount: '', // leave empty: the site takes 0 %
    referralFeeBps: 0,
  },

  // Public address of the site (Vercel, live since 17 October 2026). Change it if the site moves to
  // its own domain. Printed on the PNG cards made in L'Atelier.
  siteUrl: 'https://station-plein.vercel.app',
};
