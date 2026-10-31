'use strict';

// Privacy-friendly visitor analytics. No cookies, nothing personal, never what anyone types.
// Page views come from GoatCounter's script; the rest are one-per-visit events like "resume-open".
// Nothing is sent when ANALYTICS.goatcounter is empty, on localhost, with Do Not Track or Global
// Privacy Control, or after a visitor runs `analytics off`. Run `privacy` for the visitor-facing story.

const ANALYTICS = {
    // Your GoatCounter site code: for https://neox.goatcounter.com this is 'neox'.
    goatcounter: '',
    // Optional: a Cloudflare Web Analytics token, for Core Web Vitals alongside the events.
    cloudflareToken: '',
};

const analyticsOptedOut = () => localStorage.getItem('nsh_analytics') === 'off';
const analyticsBlockedByBrowser = () => navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
const analyticsLocal = () => !/^https?:$/.test(location.protocol) || /^(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/.test(location.hostname);
const analyticsActive = () => !!ANALYTICS.goatcounter && !analyticsOptedOut() && !analyticsBlockedByBrowser() && !analyticsLocal();

const pendingEvents = [];

// Records an event once per visit, so the dashboard reads as "how many visitors did X".
function track(name, title = name) {
    const key = `nsh_ev_${name}`;
    if (!analyticsActive() || sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const send = () => window.goatcounter.count({ path: name, title, event: true });
    if (window.goatcounter?.count) send();
    else pendingEvents.push(send);
}

function loadAnalytics() {
    if (!analyticsActive() || document.getElementById('goatcounter')) return;
    const gc = document.createElement('script');
    gc.id = 'goatcounter';
    gc.async = true;
    gc.src = 'https://gc.zgo.at/count.js';
    gc.dataset.goatcounter = `https://${ANALYTICS.goatcounter}.goatcounter.com/count`;
    gc.onload = () => pendingEvents.splice(0).forEach((send) => send());
    document.head.appendChild(gc);
    if (ANALYTICS.cloudflareToken) {
        const cf = document.createElement('script');
        cf.defer = true;
        cf.src = 'https://static.cloudflareinsights.com/beacon.min.js';
        cf.dataset.cfBeacon = JSON.stringify({ token: ANALYTICS.cloudflareToken });
        document.head.appendChild(cf);
    }
}

loadAnalytics();

function analyticsStatus() {
    if (!ANALYTICS.goatcounter) return 'not configured on this copy of the site, so nothing is sent';
    if (analyticsOptedOut()) return 'off — you opted out on this browser';
    if (analyticsBlockedByBrowser()) return 'off — your browser sends Do Not Track / Global Privacy Control, and that is respected';
    if (analyticsLocal()) return 'off — running locally';
    return 'on';
}

function cmdPrivacy() {
    return [
        c('hl', 'Privacy on NeoxOS'),
        '',
        'This site counts visits with GoatCounter, an open-source, cookie-free analytics service.',
        '',
        `${c('ok', 'Counted:')} page views, the referring site, country, browser and screen size,`,
        '         and events like "résumé opened", "got root" or "played Fretwork" (once per visit).',
        `         Command ${c('b', 'names')} you run are counted too, never their arguments.`,
        `${c('err', 'Never:')}  cookies, tracking across sites, IP addresses, or what you type beyond a command's name.`,
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
