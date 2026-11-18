// Browser tab name (18 Nov 2026): live site = "Widebed PMS", Vercel preview (testing) = "PMS Testing",
// localhost = "Widebed LH". The tab shows only this name, not the page name.
const host = location.hostname;
export const SITE_TITLE =
  host === 'localhost' || host === '127.0.0.1' ? 'Widebed LH'
  : host === 'widebed-pms.vercel.app' ? 'Widebed PMS'
  : host.endsWith('.vercel.app') ? 'PMS Testing'
  : 'Widebed PMS';
