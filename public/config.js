// Station $PLEIN · settings the team sets once and changes rarely.
// What changes on launch day and every week (contract, wallets, dashboard) lives in
// /live.json instead: the page re-reads that file while it is open, so visitors waiting on
// the countdown see the contract appear at 18:00 without reloading.
window.PLEIN_CONFIG = {
  // Saturday 17 October 2026, 18:00 Paris. Before this moment, or while live.json has no
  // contract, the site shows its pre-opening state.
  launchAt: '2026-10-17T18:00:00+02:00',

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

  // Public address of the site once it has a domain, e.g. 'https://stationplein.fr'.
  // Printed on the PNG cards made in L'Atelier.
  siteUrl: '',
};
