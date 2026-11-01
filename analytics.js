'use strict';

// Visitor analytics with Cloudflare Web Analytics: cookie-free and aggregate-only. It reports page
// views, referrers, countries, browsers, devices and page-load speed, and nothing about what people
// do inside the desktop. The beacon isn't loaded until CLOUDFLARE_ANALYTICS_TOKEN is set, and never on
// localhost, with Do Not Track or Global Privacy Control, or after `analytics off`.

// From Cloudflare: Analytics & Logs → Web Analytics → your site → JS snippet, the value of "token".
const CLOUDFLARE_ANALYTICS_TOKEN = 'fb7cf8068f1c4d6c98965bcfa1e2d3f9';

const analyticsOptedOut = () => localStorage.getItem('nsh_analytics') === 'off';
const analyticsBlockedByBrowser = () => navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
const analyticsLocal = () => !/^https?:$/.test(location.protocol) || /^(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/.test(location.hostname);
const analyticsActive = () => !!CLOUDFLARE_ANALYTICS_TOKEN && !analyticsOptedOut() && !analyticsBlockedByBrowser() && !analyticsLocal();

function loadAnalytics() {
    if (!analyticsActive() || document.getElementById('cf-beacon')) return;
    const beacon = document.createElement('script');
    beacon.id = 'cf-beacon';
    beacon.type = 'module';
    beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    beacon.dataset.cfBeacon = JSON.stringify({ token: CLOUDFLARE_ANALYTICS_TOKEN });
    document.head.appendChild(beacon);
}

loadAnalytics();

function analyticsStatus() {
    if (!CLOUDFLARE_ANALYTICS_TOKEN) return 'not configured on this copy of the site, so nothing is sent';
    if (analyticsOptedOut()) return 'off — you opted out on this browser';
    if (analyticsBlockedByBrowser()) return 'off — your browser sends Do Not Track / Global Privacy Control, and that is respected';
    if (analyticsLocal()) return 'off — running locally';
    return 'on';
}

function cmdPrivacy() {
    return [
        c('hl', 'Privacy on NeoxOS'),
        '',
        'This site counts visits with Cloudflare Web Analytics, which uses no cookies.',
        '',
        `${c('ok', 'Counted:')} page views, the referring site, country, browser, device and page-load speed.`,
        `${c('err', 'Never:')}  cookies, tracking across sites, or anything you do or type in here.`,
        '',
        `${c('hl', 'Kept in this browser only:')} shell history, CTF progress, settings, and claude's memory of your chat (${c('exe', '/clear')} inside claude forgets it).`,
        '',
        `Status:  ${esc(analyticsStatus())}`,
        `Opt out: ${c('exe', 'analytics off')}   (Do Not Track and Global Privacy Control are honoured automatically)`,
    ];
}

function cmdAnalytics({ args }) {
    const [arg] = args;
    if (arg === 'off') {
        localStorage.setItem('nsh_analytics', 'off');
        return ['Analytics turned off for this browser. Nothing more will be sent. Thanks for visiting.'];
    }
    if (arg === 'on') {
        localStorage.removeItem('nsh_analytics');
        loadAnalytics();
        return [`Analytics: ${esc(analyticsStatus())}`];
    }
    return [`Analytics: ${esc(analyticsStatus())}`, c('dim', 'analytics on | off · details: privacy')];
}

Object.assign(COMMANDS, {
    privacy: { group: 'System', usage: 'privacy', desc: 'what this site measures, and how to opt out', run: cmdPrivacy },
    analytics: { group: 'Hidden', usage: 'analytics [on | off]', desc: 'turn visitor analytics on or off for this browser', run: cmdAnalytics },
});
