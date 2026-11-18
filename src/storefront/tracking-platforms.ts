export interface TrackingPlatform {
  key: string;
  label: string;
  placeholder: string;
  /** Builds the real, official base tracking snippet for this platform, given the business's own ID. */
  buildSnippet: (trackingId: string) => string;
}

// This is the ONE place that knows what HTML to inject for each
// platform. Everything else - the admin form, the public storefront
// page - is driven off this list and the keys inside it, so adding a
// 9th platform later is exactly one new entry here, nothing else to
// touch. These are each platform's standard current base pixel code;
// Datacrux hasn't verified every one against that platform's live docs
// at build time, so it's worth a quick spot-check against the real
// platform before heavy ad spend relies on it.
export const TRACKING_PLATFORMS: TrackingPlatform[] = [
  {
    key: 'tiktok',
    label: 'TikTok Pixel',
    placeholder: 'e.g. CABCDEFGH1234567890',
    buildSnippet: (id) => `<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
  ttq.load('${id}');
  ttq.page();
}(window, document, 'ttq');
</script>`,
  },
  {
    key: 'meta',
    label: 'Meta Pixel (Facebook & Instagram)',
    placeholder: 'e.g. 1234567890123456',
    buildSnippet: (id) => `<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${id}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"/></noscript>`,
  },
  {
    key: 'googleAds',
    label: 'Google Ads Conversion Tracking',
    placeholder: 'e.g. AW-123456789',
    buildSnippet: (id) => `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${id}');
</script>`,
  },
  {
    key: 'googleAnalytics',
    label: 'Google Analytics (GA4)',
    placeholder: 'e.g. G-XXXXXXXXXX',
    buildSnippet: (id) => `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${id}');
</script>`,
  },
  {
    key: 'linkedin',
    label: 'LinkedIn Insight Tag',
    placeholder: 'e.g. 1234567',
    buildSnippet: (id) => `<script type="text/javascript">
_linkedin_partner_id = "${id}";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script><script type="text/javascript">
(function(l) {
if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
window.lintrk.q=[]}
var s = document.getElementsByTagName("script")[0];
var b = document.createElement("script");
b.type = "text/javascript";b.async = true;
b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
s.parentNode.insertBefore(b, s);})(window.lintrk);
</script>
<noscript>
<img height="1" width="1" style="display:none;" alt="" src="https://px.ads.linkedin.com/collect/?pid=${id}&fmt=gif" />
</noscript>`,
  },
  {
    key: 'pinterest',
    label: 'Pinterest Tag',
    placeholder: 'e.g. 1234567890123',
    buildSnippet: (id) => `<script>
!function(e){if(!window.pintrk){window.pintrk = function () {
window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var
n=window.pintrk;n.queue=[],n.version="3.0";var
t=document.createElement("script");t.async=!0,t.src=e;var
r=document.getElementsByTagName("script")[0];
r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");
pintrk('load', '${id}');
pintrk('page');
</script>
<noscript>
<img height="1" width="1" style="display:none;" alt="" src="https://ct.pinterest.com/v3/?event=init&tid=${id}&noscript=1" />
</noscript>`,
  },
  {
    key: 'snapchat',
    label: 'Snapchat Pixel',
    placeholder: 'e.g. 12345678-1234-1234-1234-123456789012',
    buildSnippet: (id) => `<script type='text/javascript'>
(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function()
{a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;
r.src=n;var u=t.getElementsByTagName(s)[0];
u.parentNode.insertBefore(r,u);})(window,document,
'https://sc-static.net/scevent.min.js');
snaptr('init', '${id}');
snaptr('track', 'PAGE_VIEW');
</script>`,
  },
  {
    key: 'microsoftUet',
    label: 'Microsoft Advertising UET Tag',
    placeholder: 'e.g. 12345678',
    buildSnippet: (id) => `<script>
(function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${id}", enableAutoSpaTracking: true};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");
</script>`,
  },
];

export const TRACKING_PLATFORM_KEYS = TRACKING_PLATFORMS.map((p) => p.key);

/** For the public storefront page: one ready-to-inject HTML string per platform the business has actually configured. */
export function buildTrackingSnippets(trackingConfig: Record<string, string | undefined>): string[] {
  return TRACKING_PLATFORMS.filter((platform) => !!trackingConfig[platform.key]?.trim()).map((platform) =>
    platform.buildSnippet(trackingConfig[platform.key]!.trim()),
  );
}
