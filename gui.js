'use strict';

// Graphical apps for the desktop: Chromium, Files (Nautilus), Image Viewer (imv), Text Editor,
// Neox Music and the background switcher. They all run as the guest user.

const guestSession = newSession();

// Filesystem permission checks read the current user from `state`, so GUI apps borrow a guest session.
function asGuest(fn) {
    const prev = state;
    state = guestSession;
    try {
        return fn();
    } finally {
        state = prev;
    }
}

const GI = (paths, cls = 'gicon') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${paths}</svg>`;
const G = {
    back: GI('<path d="M15 18l-6-6 6-6"/>'),
    fwd: GI('<path d="M9 18l6-6-6-6"/>'),
    up: GI('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'),
    reload: GI('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    home: GI('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    ext: GI('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v6H4V6h6"/>'),
    plus: GI('<path d="M12 5v14"/><path d="M5 12h14"/>'),
    image: GI('<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>'),
    folder: GI('<path d="M3 6h6l2 2h10v11H3z"/>', 'ficon folder'),
    file: GI('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6"/><path d="M9 16h6"/>', 'ficon'),
    exe: GI('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M7 10l3 2-3 2"/><path d="M12 15h4"/>', 'ficon exe'),
    pic: GI('<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>', 'ficon pic'),
    link: GI('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>', 'ficon lnk'),
    lock: GI('<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 'ficon locked'),
    sad: GI('<circle cx="12" cy="12" r="9"/><path d="M8 16c2-2 6-2 8 0"/><path d="M9 9h.01"/><path d="M15 9h.01"/>', 'sad'),
};

// ---------- wallpapers ----------

const WALLPAPERS = [
    'anime-girl', 'anon', 'apple', 'arch', 'arch-nord', 'enso', 'evangelion', 'fantasy', 'ghibli',
    'green', 'guitar', 'guitarvinci', 'infraeye-1', 'infraeye-2', 'infraeye-3', 'infraeye-4', 'jungle',
    'jungle-ghibli', 'lake', 'nature', 'nature-anime', 'nixos', 'reddevil', 'roads', 'skull', 'solitude',
    'torii', 'tree', 'win-palette', 'window', 'windows', 'yozakura',
];
const DEFAULT_WALLPAPER = 'yozakura';
const WALLPAPER_DIR = `${HOME}/Pictures/Wallpapers`;
const wallpaperUrl = (name) => `assets/wallpapers/${name}.webp`;
const currentWallpaper = () => {
    const saved = localStorage.getItem('nsh_wallpaper');
    return WALLPAPERS.includes(saved) ? saved : DEFAULT_WALLPAPER;
};

// The wallpapers live in ~/Pictures/Wallpapers too, so ls, Files and imv can all find them.
getNode(HOME).children.Pictures = {
    type: 'dir',
    children: {
        Wallpapers: {
            type: 'dir',
            children: Object.fromEntries(WALLPAPERS.map((name) => [`${name}.webp`, {
                type: 'file', image: wallpaperUrl(name), content: 'RIFF\0\0\0\0WEBPVP8 \0\0\0\0',
            }])),
        },
    },
};

function setWallpaper(name) {
    if (!WALLPAPERS.includes(name)) return false;
    localStorage.setItem('nsh_wallpaper', name);
    // Swap only once the image has loaded, so the desktop never flashes black.
    const img = new Image();
    img.onload = () => document.documentElement.style.setProperty('--desktop-wall', `url('${wallpaperUrl(name)}')`);
    img.src = wallpaperUrl(name);
    return true;
}

function stepWallpaper(step) {
    const i = WALLPAPERS.indexOf(currentWallpaper());
    const next = WALLPAPERS[(i + step + WALLPAPERS.length) % WALLPAPERS.length];
    setWallpaper(next);
    return next;
}

// The background switcher: a thumbnail grid, like omarchy-menu-images.
const pickerEl = document.createElement('div');
pickerEl.id = 'picker';
pickerEl.hidden = true;
document.body.appendChild(pickerEl);
let pickerSel = 0;

function openWallpaperSwitcher() {
    if (shared.booting) return;
    pickerSel = WALLPAPERS.indexOf(currentWallpaper());
    pickerEl.hidden = false;
    pickerEl.innerHTML = `<div class="picker-box"><div class="picker-head">Background <span class="dim">— arrows to browse, Enter to set, Esc to close</span></div>
        <div class="picker-grid">${WALLPAPERS.map((name, i) => `<button class="picker-item" data-i="${i}" title="${name}">
            <img src="assets/wallpapers/thumbs/${name}.webp" alt="" loading="lazy"><span>${name}</span></button>`).join('')}</div></div>`;
    renderPicker();
}

function renderPicker() {
    pickerEl.querySelectorAll('.picker-item').forEach((item, i) => {
        item.classList.toggle('sel', i === pickerSel);
        item.classList.toggle('current', WALLPAPERS[i] === currentWallpaper());
    });
    pickerEl.querySelector('.picker-item.sel')?.scrollIntoView({ block: 'nearest' });
}

function closeWallpaperSwitcher() {
    pickerEl.hidden = true;
    pickerEl.innerHTML = '';
    if (wm.focused?.shell && !state?.app) input?.focus();
}

pickerEl.addEventListener('click', (e) => {
    const item = e.target.closest('.picker-item');
    if (item) setWallpaper(WALLPAPERS[+item.dataset.i]);
    if (item || e.target === pickerEl) closeWallpaperSwitcher();
});

function pickerKey(e) {
    e.preventDefault();
    e.stopPropagation();
    const grid = pickerEl.querySelector('.picker-grid');
    const cols = Math.max(1, Math.round(grid.clientWidth / grid.firstElementChild.offsetWidth));
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    if (move) {
        pickerSel = Math.min(WALLPAPERS.length - 1, Math.max(0, pickerSel + move));
        return renderPicker();
    }
    if (e.key === 'Enter') setWallpaper(WALLPAPERS[pickerSel]);
    if (e.key === 'Enter' || e.key === 'Escape') closeWallpaperSwitcher();
}

// ---------- Chromium ----------

const START = 'neox://start';
const NEOX_MUSIC = 'https://www.youtube-nocookie.com/embed/videoseries?list=UU-mDZYCxqOW0JfRIcU0ofRw';
// Sites that refuse to be shown inside another page (X-Frame-Options / CSP frame-ancestors), plus the
// Arch wiki, whose bot protection can't complete inside a frame.
const FRAME_BLOCKED = ['github.com', 'linkedin.com', 'medium.com', 'x.com', 'twitter.com', 'duckduckgo.com',
    'google.com', 'facebook.com', 'instagram.com', 'reddit.com', 'stackoverflow.com', 'youtube.com', 'archlinux.org',
    'messenger.com', 'whatsapp.com', 'tiktok.com', 'discord.com', 'netflix.com', 'amazon.com', 'paypal.com',
    'microsoft.com', 'apple.com', 'twitch.tv', 'pinterest.com', 'chatgpt.com', 'claude.ai', 'gmail.com'];
// What the server says when asked, for the error page. Sites not listed get the general form.
const FRAME_HEADERS = {
    'facebook.com': 'x-frame-options: DENY', 'github.com': 'x-frame-options: deny', 'google.com': 'x-frame-options: SAMEORIGIN',
    'linkedin.com': 'x-frame-options: sameorigin', 'stackoverflow.com': 'x-frame-options: SAMEORIGIN', 'youtube.com': 'x-frame-options: SAMEORIGIN',
};

// Sites served from inside the page (the CTF's localhost and ctf.neox, in ctf.js). Each handler gets a
// URL and returns null or { html } (a page of this app's own UI), { doc, base } (a web page) or { text }.
const LOCAL_SITES = [];
const localSite = (url) => LOCAL_SITES.reduce((page, handler) => page || handler(url), null);

const SPEED_DIAL = [
    ['NeoxCTF', 'http://ctf.neox/'],
    ['Website', 'https://manishkarki7.com.np'],
    ['InfraEye', 'https://infraeye.manishkarki7.com.np'],
    ['Neox Music', 'https://www.youtube.com/@lynthrax'],
    ['BeatStars', 'https://www.beatstars.com/kazibaubeat'],
    ['GitHub', 'https://github.com/mnshchtri'],
    ['LinkedIn', 'https://www.linkedin.com/in/manish-karki-959107171/'],
    ['Medium', 'https://medium.com/@neox.exploit'],
    ['X', 'https://x.com/N30xMnsh'],
    ['Arch Wiki', 'https://wiki.archlinux.org/'],
    ['Omarchy', 'https://omarchy.org'],
    ['Weather', 'https://wttr.in/Kathmandu'],
    ['Wikipedia', 'https://en.wikipedia.org/wiki/Linux'],
];

function resolveAddress(text) {
    text = text.trim();
    if (!text || text === START) return START;
    if (/^view-source:/i.test(text)) return `view-source:${resolveAddress(text.slice(12))}`;
    if (/^https?:\/\//i.test(text)) return text;
    // Local addresses are plain http, like a real browser's guess.
    if (/^(localhost|127(\.\d+){3}|neox|[\w-]+\.neox)(:\d+)?(\/\S*)?$/i.test(text)) return `http://${text}`;
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(text)) return `https://${text}`;
    return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(text)}`;
}

function hostOf(url) {
    if (url.startsWith('view-source:')) return `view-source:${hostOf(url.slice(12))}`;
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

function frameBlocked(url) {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    if (/youtube(-nocookie)?\.com$/.test(host) && pathname.startsWith('/embed/')) return false;
    return FRAME_BLOCKED.some((d) => host === d || host.endsWith(`.${d}`));
}

function browserApp(startUrl = START) {
    let addr;
    let views;
    let strip;
    let backBtn;
    let fwdBtn;
    let win;
    // Each tab keeps its own history and page, so switching tabs doesn't reload anything.
    const tabs = [];
    let active = null;
    let view = null;
    const current = (t = active) => t?.hist[t.pos] || START;
    const tabLabel = (t) => (current(t) === START ? 'New Tab' : hostOf(current(t)));

    function startPage() {
        return `<div class="start">
            <div class="start-logo">${LOGO_SVG}</div>
            <form class="start-search"><input placeholder="Search Wikipedia or type a URL" spellcheck="false" autocomplete="off"></form>
            <div class="dial">${SPEED_DIAL.map(([label, url]) => `<button class="dial-item" data-url="${url}">
                <span class="dial-icon">${esc(label[0])}</span><span>${esc(label)}</span></button>`).join('')}</div>
        </div>`;
    }

    // Big sites forbid being shown inside other pages, so they open in a real tab instead (see go),
    // and this page says why, the way a security engineer would check it.
    function refusedPage(url, opened) {
        const host = hostOf(url);
        const known = Object.keys(FRAME_HEADERS).find((d) => host === d || host.endsWith(`.${d}`));
        const bot = /archlinux\.org$/.test(host);
        const prompt = `<span class="ok">visitor@neox</span>:<span class="dir">~</span>$ `;
        const check = bot
            ? `${prompt}curl -s https://${esc(host)} | grep -o '&lt;title&gt;.*'\n&lt;title&gt;Making sure you're not a bot!&lt;/title&gt;`
            : `${prompt}curl -sI https://${esc(host)} | grep -iE 'x-frame-options|frame-ancestors'\n${known
                ? `<mark>${esc(FRAME_HEADERS[known])}</mark>`
                : `<mark>x-frame-options</mark> / <mark>content-security-policy: frame-ancestors</mark> <span class="dim"># one of these</span>`}`;
        const why = bot
            ? "Its bot check can't complete inside another page."
            : `${esc(host)} tells browsers never to show it inside another site. That blocks clickjacking (an invisible frame under a fake button that makes you click "Like" or "Delete"), and every browser enforces it, so no portfolio can embed it. Nor should one.`;
        const status = opened === true
            ? `<p class="refused-opened">${G.ext} Opened ${esc(host)} in a new tab for you.</p>`
            : opened === false
                ? `<p class="refused-opened bad">Your browser blocked the pop-up. Use the button below (or allow pop-ups for this site).</p>`
                : '';
        return `<div class="refused">${G.sad}<h2>${esc(host)} refused to connect.</h2>
            ${status}
            <pre class="refused-term">${check}</pre>
            <p>${why}</p>
            <p class="dim">ERR_BLOCKED_BY_RESPONSE</p>
            <button class="btn" data-open="${esc(url)}">${G.ext} Open ${esc(host)} in a new tab</button></div>`;
    }

    // Pages from LOCAL_SITES. Web pages render in a sandbox without scripts; their links are followed here.
    function renderLocal(url, page) {
        if (page.html != null) {
            view.innerHTML = `<div class="local-page">${page.html}</div>`;
            page.mount?.(view.firstElementChild, { go, reload: render });
        } else if (page.source != null) {
            view.innerHTML = `<pre class="page-text view-source">${page.source.split('\n').map((l, i) => `<span class="ln">${i + 1}</span>${esc(l)}`).join('\n')}</pre>`;
        } else if (page.text != null) {
            view.innerHTML = `<pre class="page-text">${esc(page.text)}</pre>`;
        } else {
            view.innerHTML = '<iframe class="local-frame" sandbox="allow-same-origin"></iframe>';
            const frame = view.firstElementChild;
            const target = view;
            frame.srcdoc = page.doc;
            frame.addEventListener('load', () => {
                const doc = frame.contentDocument;
                doc?.addEventListener('click', (e) => {
                    const a = e.target.closest('a[href]');
                    if (!a) return;
                    e.preventDefault();
                    go(new URL(a.getAttribute('href'), page.base || url).href);
                });
                // Keys pressed inside the page (Ctrl+U, Ctrl+T...) reach the browser's own shortcuts.
                doc?.addEventListener('keydown', (e) => {
                    if (!e.ctrlKey || !['u', 'l', 't', 'w', 'Tab'].includes(e.key)) return;
                    e.preventDefault();
                    target.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, ctrlKey: true, shiftKey: e.shiftKey, bubbles: true }));
                });
            });
        }
    }

    function render() {
        const url = current();
        const local = url === START ? null : localSite(url);
        if (local) {
            renderLocal(url, local);
            // Keep keyboard focus in the window so Ctrl+U works again on the new page.
            if (wm.focused === win && !win.el.contains(document.activeElement)) view.focus({ preventScroll: true });
        } else if (url.startsWith('view-source:')) {
            view.innerHTML = refusedPage(url);
        } else if (url === START) {
            view.innerHTML = startPage();
            view.querySelector('.start-search').addEventListener('submit', (e) => {
                e.preventDefault();
                go(resolveAddress(e.target.querySelector('input').value));
            });
        } else if (frameBlocked(url)) {
            view.innerHTML = refusedPage(url, active.opened?.url === url ? active.opened.ok : undefined);
            active.opened = null;
        } else {
            view.innerHTML = `<iframe src="${esc(url)}" referrerpolicy="no-referrer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"></iframe>`;
        }
        chrome();
    }

    // Updates everything around the page: tab strip, address bar, back/forward, window title.
    function chrome() {
        strip.innerHTML = tabs.map((t) => `<div class="tab${t === active ? ' active' : ''}" data-tab="${t.id}" title="${esc(tabLabel(t))}">
            <span class="tab-title">${esc(tabLabel(t))}</span><button class="tab-close" data-close="${t.id}" title="Close tab (or middle-click)">×</button></div>`).join('');
        const url = current();
        if (document.activeElement !== addr) addr.value = url === START ? '' : url;
        backBtn.disabled = active.pos <= 0;
        fwdBtn.disabled = active.pos >= active.hist.length - 1;
        refreshTitle(win);
    }

    function go(url) {
        // Neox Music's channel page can't be framed, but its uploads playlist can.
        if (/youtube\.com\/@lynthrax/i.test(url)) url = NEOX_MUSIC;
        active.hist.splice(active.pos + 1);
        active.hist.push(url);
        active.pos = active.hist.length - 1;
        // Going to a site that can't be framed opens it for real. This runs inside the click or Enter
        // that asked for it, so pop-up blockers allow it; back/forward/reload only show the explanation.
        if (!url.startsWith('view-source:') && /^https?:/.test(url) && frameBlocked(url)) {
            // Without 'noopener' window.open reports whether the tab opened; the opener link is cut by hand.
            const tab = window.open(url, '_blank');
            if (tab) tab.opener = null;
            active.opened = { url, ok: !!tab };
        }
        addr.blur();
        render();
    }

    function select(t) {
        active = t;
        view = t.view;
        for (const x of tabs) x.view.hidden = x !== t;
        chrome();
        if (current() === START) view.querySelector('.start-search input')?.focus();
    }

    function newTab(url = START) {
        const view = document.createElement('div');
        view.className = 'view';
        view.tabIndex = -1;
        views.appendChild(view);
        const t = { id: tabs.length ? Math.max(...tabs.map((x) => x.id)) + 1 : 1, hist: [], pos: -1, view };
        tabs.splice(active ? tabs.indexOf(active) + 1 : tabs.length, 0, t);
        select(t);
        go(url);
        if (url === START) view.querySelector('.start-search input')?.focus();
    }

    function closeTab(t) {
        const i = tabs.indexOf(t);
        tabs.splice(i, 1);
        t.view.remove();
        if (!tabs.length) return closeWindow(win);
        if (t === active) select(tabs[Math.min(i, tabs.length - 1)]);
        else chrome();
    }

    const byId = (id) => tabs.find((t) => t.id === Number(id));

    return {
        cls: 'chromium',
        title: () => `${current() === START ? 'New Tab' : hostOf(current())} - Chromium`,
        mount(el, w) {
            win = w;
            el.innerHTML = `<div class="tabs"><div class="tab-strip"></div><button class="tab-new" title="New tab">${G.plus}</button></div>
                <div class="toolbar">
                    <button data-act="back" title="Back">${G.back}</button><button data-act="fwd" title="Forward">${G.fwd}</button>
                    <button data-act="reload" title="Reload">${G.reload}</button><button data-act="home" title="Home">${G.home}</button>
                    <input class="addr" spellcheck="false" autocomplete="off" placeholder="Search Wikipedia or type a URL">
                    <button data-act="ext" title="Open in a real browser tab">${G.ext}</button>
                </div><div class="views"></div>`;
            addr = el.querySelector('.addr');
            views = el.querySelector('.views');
            strip = el.querySelector('.tab-strip');
            backBtn = el.querySelector('[data-act="back"]');
            fwdBtn = el.querySelector('[data-act="fwd"]');
            addr.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') go(resolveAddress(addr.value));
                if (e.key === 'Escape') {
                    addr.value = current() === START ? '' : current();
                    addr.blur();
                }
            });
            addr.addEventListener('focus', () => addr.select());
            el.querySelector('.tab-new').addEventListener('click', () => newTab());
            // Middle-click closes a tab, as in every browser.
            strip.addEventListener('auxclick', (e) => {
                const t = e.button === 1 && byId(e.target.closest('[data-tab]')?.dataset.tab);
                if (t) closeTab(t);
            });
            strip.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());
            el.addEventListener('click', (e) => {
                const close = e.target.closest('[data-close]');
                if (close) return closeTab(byId(close.dataset.close));
                const tabEl = e.target.closest('[data-tab]');
                if (tabEl) return select(byId(tabEl.dataset.tab));
                const dial = e.target.closest('[data-url]');
                if (dial) return go(dial.dataset.url);
                const ext = e.target.closest('[data-open]');
                if (ext) return window.open(ext.dataset.open, '_blank', 'noopener');
                if (e.target.closest('.local-page')) return;
                const act = e.target.closest('[data-act]')?.dataset.act;
                if (act === 'back' && active.pos > 0) active.pos--;
                if (act === 'fwd' && active.pos < active.hist.length - 1) active.pos++;
                if (act === 'home') return go(START);
                if (act === 'ext') return window.open(current() === START || localSite(current()) ? 'https://github.com/mnshchtri' : current(), '_blank', 'noopener');
                if (act) render();
            });
            el.addEventListener('keydown', (e) => {
                if (!e.ctrlKey || e.altKey || e.metaKey) return;
                const key = e.key.toLowerCase();
                if (key === 'l') {
                    addr.focus();
                // Real Chrome and Brave keep Ctrl+T/W/Tab for themselves; these only fire where the page gets them.
                } else if (key === 't') {
                    newTab();
                } else if (key === 'w') {
                    closeTab(active);
                } else if (e.key === 'Tab') {
                    select(tabs[(tabs.indexOf(active) + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]);
                } else if (key === 'u') {
                    // View source, as in any browser (pages served from this box only).
                    const url = current();
                    if (url.startsWith('view-source:')) go(url.slice(12));
                    else if (url !== START) go(`view-source:${url}`);
                } else {
                    return;
                }
                e.preventDefault();
            });
            newTab(startUrl);
        },
        focus() {
            if (current() === START) (view.querySelector('.start-search input') || addr).focus();
        },
    };
}

// Clicking into an iframe doesn't bubble a mousedown to the window, but it does blur the page.
window.addEventListener('blur', () => setTimeout(() => {
    const frame = document.activeElement;
    if (frame?.tagName !== 'IFRAME') return;
    const win = wm.windows.find((w) => w.el.contains(frame));
    if (win && wm.focused !== win) focusWindow(win);
}));

// ---------- Files ----------

const PLACES = [
    ['Home', HOME], ['Projects', `${HOME}/projects`], ['Experience', `${HOME}/experience`], ['Music', `${HOME}/music`],
    ['Pictures', `${HOME}/Pictures/Wallpapers`], ['Links', `${HOME}/links`], ['Computer', '/'], ['root', '/root'],
];

function fileIcon(node, abs) {
    if (asGuest(() => isForbidden(abs))) return G.lock;
    if (node.type === 'dir') return G.folder;
    if (node.type === 'link') return G.link;
    if (node.image) return `<img class="fthumb" src="${node.image.replace('wallpapers/', 'wallpapers/thumbs/')}" alt="" loading="lazy">`;
    if (node.exe) return G.exe;
    return G.file;
}

function openPath(abs) {
    const node = getNode(abs);
    if (!node) return notify('File not found', abs);
    if (node.type === 'dir') return openApp(filesApp(abs));
    if (node.type === 'link') return openApp(browserApp(node.target));
    if (node.image) return openApp(imageApp(abs));
    if (node.bin) return notify('Cannot open file', `“${basename(abs)}” is a program — run it from a terminal.`);
    return openApp(textApp(abs));
}

function filesApp(startPath = HOME) {
    let cwd = startPath;
    let showHidden = false;
    let main;
    let crumbs;
    let side;
    let foot;
    let win;
    const back = [];

    function cd(abs, remember = true) {
        if (remember && abs !== cwd) back.push(cwd);
        cwd = abs;
        render();
    }

    function render() {
        side.querySelectorAll('[data-path]').forEach((b) => b.classList.toggle('active', b.dataset.path === cwd));
        const parts = cwd.split('/').filter(Boolean);
        crumbs.innerHTML = [`<button data-path="/">/</button>`, ...parts.map((p, i) => (
            `<button data-path="/${parts.slice(0, i + 1).join('/')}">${esc(p)}</button>`
        ))].join('<span class="dim">›</span>');
        const node = getNode(cwd);
        if (asGuest(() => isForbidden(cwd))) {
            main.innerHTML = `<div class="empty-state">${G.lock}<p>You don't have the required permissions to view the contents of “${esc(basename(cwd))}”.</p>
                <p class="dim">Files runs as ${GUEST}. A terminal with root could look inside…</p></div>`;
            foot.textContent = '';
        } else {
            const names = Object.keys(node.children)
                .filter((n) => showHidden || !n.startsWith('.'))
                .sort((a, b) => (node.children[b].type === 'dir') - (node.children[a].type === 'dir') || a.localeCompare(b));
            main.innerHTML = names.length
                ? names.map((n) => `<button class="fitem" data-name="${esc(n)}">${fileIcon(node.children[n], `${cwd}/${n}`.replace('//', '/'))}<span>${esc(n)}</span></button>`).join('')
                : '<div class="empty-state"><p>Folder is Empty</p></div>';
            foot.textContent = `${names.length} item${names.length === 1 ? '' : 's'}${showHidden ? ' · showing hidden files' : ''} · Ctrl+H toggles hidden files`;
        }
        refreshTitle(win);
    }

    return {
        cls: 'nautilus',
        title: () => `${cwd === HOME ? 'Home' : basename(cwd)} — Files`,
        mount(el, w) {
            win = w;
            el.innerHTML = `<div class="files-head"><button data-act="back" title="Back">${G.back}</button><button data-act="up" title="Parent folder">${G.up}</button>
                <div class="crumbs"></div></div>
                <div class="files-body"><nav class="places">${PLACES.map(([label, path]) => `<button data-path="${path}">${label}</button>`).join('')}</nav>
                <div class="fgrid" tabindex="0"></div></div><div class="files-foot dim"></div>`;
            main = el.querySelector('.fgrid');
            crumbs = el.querySelector('.crumbs');
            side = el.querySelector('.places');
            foot = el.querySelector('.files-foot');
            el.addEventListener('click', (e) => {
                const place = e.target.closest('[data-path]');
                if (place) return cd(place.dataset.path);
                const act = e.target.closest('[data-act]')?.dataset.act;
                if (act === 'back' && back.length) cd(back.pop(), false);
                if (act === 'up' && cwd !== '/') cd(parentOf(cwd));
                const item = e.target.closest('.fitem');
                if (!item) return;
                main.querySelectorAll('.fitem.sel').forEach((i) => i.classList.remove('sel'));
                item.classList.add('sel');
                if (isMobile()) item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            });
            el.addEventListener('dblclick', (e) => {
                const item = e.target.closest('.fitem');
                if (!item) return;
                const abs = `${cwd}/${item.dataset.name}`.replace('//', '/');
                if (getNode(abs).type === 'dir') cd(abs);
                else openPath(abs);
            });
            el.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'h') {
                    e.preventDefault();
                    showHidden = !showHidden;
                    render();
                } else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
                    if (cwd !== '/') cd(parentOf(cwd));
                } else if (e.key === 'Enter') {
                    main.querySelector('.fitem.sel')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                }
            });
            render();
        },
        focus: () => main.focus(),
    };
}

// ---------- Text Editor ----------

function textApp(abs) {
    let area;
    let status;
    let dirty = false;
    let win;
    const name = basename(abs);
    const denied = asGuest(() => isForbidden(abs));
    const readonly = denied || !asGuest(() => canModify(abs));

    function save() {
        if (readonly) return notify('Read-only file', `${GUEST} can't write “${name}” — it belongs to neox.`);
        asGuest(() => writeFile(abs, area.value));
        dirty = false;
        status.textContent = 'Saved';
        refreshTitle(win);
    }

    return {
        cls: 'text-editor',
        title: () => `${dirty ? '• ' : ''}${name} — Text Editor`,
        mount(el, w) {
            win = w;
            el.innerHTML = `<div class="ed-head"><div><b>${esc(name)}</b> <span class="dim">${esc(asGuest(() => tildify(parentOf(abs))))}</span>
                ${readonly ? '<span class="badge">Read-Only</span>' : ''}</div>
                <button class="btn" data-act="save"${readonly ? ' disabled' : ''}>Save</button></div>
                <textarea class="ed-text" spellcheck="false"></textarea><div class="ed-foot dim"></div>`;
            area = el.querySelector('.ed-text');
            status = el.querySelector('.ed-foot');
            area.value = denied ? '' : getNode(abs).content;
            area.readOnly = readonly;
            status.textContent = denied ? `Permission denied: ${GUEST} can't read this file.` : readonly ? 'Opened read-only' : 'Ctrl+S to save';
            area.addEventListener('input', () => {
                dirty = true;
                status.textContent = 'Unsaved changes';
                refreshTitle(win);
            });
            el.querySelector('[data-act="save"]').addEventListener('click', save);
            el.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 's') {
                    e.preventDefault();
                    save();
                }
            });
        },
        focus: () => area.focus(),
    };
}

// ---------- Image Viewer ----------

function imageApp(abs) {
    let dir = parentOf(abs);
    let images = [];
    let idx = 0;
    let img;
    let label;
    let win;

    function load() {
        const node = getNode(dir);
        images = Object.keys(node.children).filter((n) => node.children[n].image).sort();
        idx = Math.max(0, images.indexOf(basename(abs)));
    }

    function show() {
        const node = getNode(`${dir}/${images[idx]}`);
        img.src = node.image;
        label.textContent = `${images[idx]}  ·  ${idx + 1}/${images.length}`;
        refreshTitle(win);
    }

    function step(d) {
        idx = (idx + d + images.length) % images.length;
        show();
    }

    function setAsWallpaper() {
        const name = images[idx].replace(/\.webp$/, '');
        if (setWallpaper(name)) notify('Background changed', name);
    }

    return {
        cls: 'imv',
        title: () => `imv - [${idx + 1}/${images.length}] [${images[idx] || ''}]`,
        mount(el, w) {
            win = w;
            el.innerHTML = `<div class="imv-stage"><img alt=""></div>
                <div class="imv-bar"><button data-act="prev" title="Previous (←)">${G.back}</button><span class="imv-label"></span>
                <button data-act="next" title="Next (→)">${G.fwd}</button><button class="btn" data-act="wall">Set as wallpaper</button></div>`;
            img = el.querySelector('img');
            label = el.querySelector('.imv-label');
            el.tabIndex = 0;
            el.addEventListener('click', (e) => {
                const act = e.target.closest('[data-act]')?.dataset.act;
                if (act === 'prev') step(-1);
                if (act === 'next') step(1);
                if (act === 'wall') setAsWallpaper();
            });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft' || e.key === 'h') step(-1);
                if (e.key === 'ArrowRight' || e.key === 'l' || e.key === ' ') step(1);
                if (e.key === 'w' || e.key === 'Enter') setAsWallpaper();
            });
            load();
            show();
        },
        focus() {
            win.el.focus({ preventScroll: true });
        },
    };
}

// ---------- Neox Music ----------

function musicApp() {
    return {
        cls: 'music',
        title: () => 'Neox Music',
        mount(el) {
            el.innerHTML = `<div class="music-head"><div><b>Neox Music</b><div class="dim">Guitar, beats and experiments — YouTube @lynthrax</div></div>
                <div class="music-links"><button class="btn" data-open="https://www.youtube.com/@lynthrax">YouTube ${G.ext}</button>
                <button class="btn" data-open="https://www.beatstars.com/kazibaubeat">Buy beats ${G.ext}</button></div></div>
                <iframe src="${NEOX_MUSIC}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
            el.addEventListener('click', (e) => {
                const ext = e.target.closest('[data-open]');
                if (ext) window.open(ext.dataset.open, '_blank', 'noopener');
            });
        },
    };
}

// ---------- launcher, bar, keybindings, commands ----------

LAUNCH.splice(1, 0,
    { name: 'Chromium', hint: 'Alt+B', action: () => openApp(browserApp()) },
    { name: 'Files', hint: 'Alt+E', action: () => openApp(filesApp()) },
    { name: 'Neox Music', hint: 'Alt+M', action: () => openApp(musicApp()) },
    { name: 'Image Viewer', hint: 'wallpapers', action: () => openApp(imageApp(`${WALLPAPER_DIR}/${currentWallpaper()}.webp`)) },
    { name: 'Background Switcher', hint: 'Alt+Shift+Space', action: openWallpaperSwitcher },
    { name: 'Next Background', hint: 'Alt+Ctrl+Space', action: () => stepWallpaper(1) },
    { name: 'Resume / About', hint: 'text editor', action: () => openApp(textApp(`${HOME}/about.txt`)) },
);

KEYBINDS.splice(2, 0,
    ['Alt+B', 'Browser (Chromium)'],
    ['Alt+E', 'Files'],
    ['Alt+M', 'Neox Music'],
    ['Alt+Shift+Space', 'Background switcher'],
    ['Alt+Ctrl+Space', 'Next background'],
);

barEl.querySelector('.bar-right').insertAdjacentHTML('afterbegin', `<button class="bar-bg" title="Background (Alt+Shift+Space)">${G.image.replace('gicon', 'icon')}</button>`);
barEl.querySelector('.bar-bg').addEventListener('click', openWallpaperSwitcher);

window.addEventListener('keydown', (e) => {
    if (!pickerEl.hidden) return pickerKey(e);
    if (shared.booting || desktopEl.hidden || !launcherEl.hidden || !e.altKey || e.metaKey) return;
    const job = e.code === 'Space' && e.shiftKey ? openWallpaperSwitcher
        : e.code === 'Space' && e.ctrlKey ? () => stepWallpaper(1)
            : e.ctrlKey ? null
                : { KeyB: () => openApp(browserApp()), KeyE: () => openApp(filesApp()), KeyM: () => openApp(musicApp()) }[e.code];
    if (!job) return;
    e.preventDefault();
    e.stopPropagation();
    job();
}, true);

function cmdWallpaper({ args }) {
    const [arg] = args;
    if (!arg || arg === 'list') {
        return WALLPAPERS.map((n) => (n === currentWallpaper() ? `${c('ok', '*')} ${c('hl', n)}` : `  ${n}`));
    }
    if (arg === 'next' || arg === 'prev') return [`Background: ${c('hl', stepWallpaper(arg === 'next' ? 1 : -1))}`];
    if (arg === 'random') {
        const others = WALLPAPERS.filter((n) => n !== currentWallpaper());
        const pick = others[Math.floor(Math.random() * others.length)];
        setWallpaper(pick);
        return [`Background: ${c('hl', pick)}`];
    }
    const name = basename(arg).replace(/\.webp$/, '');
    if (!setWallpaper(name)) return err(`wallpaper: unknown background '${arg}' (try: wallpaper list)`);
    return [`Background: ${c('hl', name)}`];
}

function cmdChromium({ args }) {
    openApp(browserApp(args.length ? resolveAddress(args.join(' ')) : START), { fromCommand: true });
}

function cmdNautilus({ name, args }) {
    const abs = normalize(args[0] || '.');
    if (getNode(abs)?.type !== 'dir') return err(`${name}: ${args[0]}: not a directory`);
    openApp(filesApp(abs), { fromCommand: true });
}

function cmdImv({ args }) {
    const abs = normalize(args[0] || `${WALLPAPER_DIR}/${currentWallpaper()}.webp`);
    const node = getNode(abs);
    if (!node?.image) return err(`imv: ${args[0]}: not an image (try: imv ~neox/Pictures/Wallpapers/tree.webp)`);
    openApp(imageApp(abs), { fromCommand: true });
}

function cmdTextEditor({ name, args }) {
    if (!args.length) return err(`${name}: missing file operand`);
    const abs = normalize(args[0]);
    const node = getNode(abs);
    if (node?.type !== 'file' || node.image || node.bin) return err(`${name}: ${args[0]}: not a text file`);
    openApp(textApp(abs), { fromCommand: true });
}

// xdg-open now picks the right desktop app; links still open in a real browser tab.
const openInBrowserTab = COMMANDS.open.run;
function cmdXdgOpen(ctx) {
    const target = ctx.args[0];
    const abs = target && !/^https?:\/\//.test(target) ? normalize(target) : null;
    const node = abs && getNode(abs);
    if (!node || node.type === 'link') return openInBrowserTab(ctx);
    if (asGuest(() => isForbidden(abs))) return err(`xdg-open: ${target}: Permission denied`);
    if (node.type === 'dir') return void openApp(filesApp(abs), { fromCommand: true });
    if (node.image) return void openApp(imageApp(abs), { fromCommand: true });
    if (node.bin) return err(`xdg-open: no application registered for '${target}'`);
    openApp(textApp(abs), { fromCommand: true });
}
COMMANDS.open.run = cmdXdgOpen;
COMMANDS['xdg-open'].run = cmdXdgOpen;

Object.assign(COMMANDS, {
    chromium: { group: 'Desktop', usage: 'chromium [URL | search]', desc: 'open the web browser', run: cmdChromium },
    brave: { group: 'Hidden', usage: 'brave [URL]', desc: 'open the web browser', run: cmdChromium },
    firefox: { group: 'Hidden', usage: 'firefox [URL]', desc: 'open the web browser', run: cmdChromium },
    nautilus: { group: 'Desktop', usage: 'nautilus [DIR]', desc: 'open the Files app', run: cmdNautilus },
    imv: { group: 'Desktop', usage: 'imv [IMAGE]', desc: 'image viewer (← → browse, w sets wallpaper)', run: cmdImv },
    'gnome-text-editor': { group: 'Desktop', usage: 'gnome-text-editor FILE', desc: 'graphical text editor', run: cmdTextEditor },
    music: { group: 'Desktop', usage: 'music', desc: 'play Neox Music (YouTube @lynthrax)', run: () => void openApp(musicApp(), { fromCommand: true }) },
    spotify: { group: 'Hidden', usage: 'spotify', desc: 'play Neox Music', run: () => void openApp(musicApp(), { fromCommand: true }) },
    wallpaper: { group: 'Desktop', usage: 'wallpaper [list | next | prev | random | NAME]', desc: 'change the desktop background (saved across visits)', run: cmdWallpaper },
    'omarchy-theme-bg-next': { group: 'Hidden', usage: 'omarchy-theme-bg-next', desc: 'cycle to the next background', run: () => cmdWallpaper({ args: ['next'] }) },
    'omarchy-theme-bg-switcher': { group: 'Hidden', usage: 'omarchy-theme-bg-switcher', desc: 'open the background switcher', run: () => void openWallpaperSwitcher() },
});
