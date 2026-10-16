// French typography for text the page writes at runtime: a non-breaking space before
// : ; ! ? % € » and after «, and between a number and its unit, so a line never starts with
// ": 0 %" and "0" never sits apart from its "%". Times like 18:00 have no space and are left alone.
export const NBSP = '\u00A0';
export const NNBSP = '\u202F'; // narrow no-break space, the French thousands separator

export function typo(text) {
  return String(text)
    .replace(/ ([:;!?%€»])/g, `${NBSP}$1`)
    .replace(/« /g, `«${NBSP}`)
    .replace(/(\d) (L|k|km|h|min|ans|USDC)(?![\p{L}\d])/gu, `$1${NBSP}$2`)
    .replace(/(\d) (\$)(?![A-Za-z])/g, `$1${NBSP}$2`)
    .replace(/(\d) ×/g, `$1${NBSP}×`)
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NNBSP}`);
}
