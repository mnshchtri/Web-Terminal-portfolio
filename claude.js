'use strict';

// `claude`: an assistant in Claude Code's clothes. The UI follows Claude Code (welcome box, bordered
// input, spinner, ● replies, ● Bash(...) tool calls with ⎿ output, slash commands). Underneath it is
// scripted: intents matched by pattern, with a little memory (the visitor's name, the last topic, an
// offer waiting for a "yes"), and real commands run on this box to show things. No network, no AI.
// It never prints a flag or the root password: tool output is redacted (ccRedact) and CTF help comes
// as hints. Asked sincerely what it is, it deflects in character but never claims to be Anthropic's.

const CC_VERSION = '2.1.0';
const CC_VERBS = ['Pondering', 'Enumerating', 'Grepping', 'Spelunking', 'Reticulating', 'Noodling', 'Tracing', 'Moseying', 'Percolating', 'Cogitating', 'Schlepping', 'Brewing', 'Unravelling', 'Sleuthing'];
const CC_SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const ccOrange = (html) => `<span class="cc-orange">${html}</span>`;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// What the assistant remembers during a session.
const cc = { name: '', last: null, offer: null, tokens: 0, turns: 0, started: 0 };

// ---------- rendering, in Claude Code's style ----------

function ccMarkdown(md) {
    const parts = md.split(/```[\w-]*\n?([\s\S]*?)(?:```|$)/);
    return parts.map((part, i) => {
        if (i % 2) return `<div class="cc-pre">${esc(part.replace(/\n$/, ''))}</div>`;
        return linkify(esc(part))
            .replace(/`([^`\n]+)`/g, (_, code) => `<span class="cc-code">${code}</span>`)
            .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
            .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');
    }).join('').replace(/^\n+|\n+$/g, '');
}

// The spinner: glyph, a whimsical verb, elapsed seconds and a token count that ticks up.
function ccSpinner() {
    const div = document.createElement('div');
    div.className = 'line cc-spin';
    output.appendChild(div);
    const verb = pick(CC_VERBS);
    const t0 = Date.now();
    let i = 0;
    const draw = () => {
        const secs = Math.floor((Date.now() - t0) / 1000);
        cc.tokens += 3 + Math.floor(Math.random() * 9);
        div.innerHTML = `${ccOrange(CC_SPIN[i++ % CC_SPIN.length])} ${ccOrange(`${verb}…`)} ${c('dim', `(${secs}s · ↓ ${cc.tokens} tokens · esc to interrupt)`)}`;
        terminal.scrollTop = terminal.scrollHeight;
    };
    draw();
    const timer = setInterval(draw, 120);
    return () => {
        clearInterval(timer);
        div.remove();
    };
}

// Thinking time scales a little with the question, like a model that's reading it.
async function ccThink(q = '') {
    const stop = ccSpinner();
    const ms = 700 + Math.min(1600, q.length * 18) + Math.random() * 700;
    const t0 = Date.now();
    while (Date.now() - t0 < ms && !state.abort) await new Promise((r) => setTimeout(r, 50));
    stop();
}

// Streams a reply in small chunks at an uneven pace, as tokens arrive.
async function ccSay(md) {
    const div = document.createElement('div');
    div.className = 'line cc-msg';
    output.appendChild(div);
    const chunks = md.match(/\S+\s*|\s+/g) || [];
    let text = '';
    for (let i = 0; i < chunks.length; i++) {
        text += chunks[i];
        if (i % 2 === 0 || i === chunks.length - 1) {
            div.innerHTML = `${c('cc-dot', '●')} ${ccMarkdown(text)}`;
            terminal.scrollTop = terminal.scrollHeight;
            await sleep(12 + Math.random() * 28);
        }
        if (state.abort) return;
    }
    div.innerHTML = `${c('cc-dot', '●')} ${ccMarkdown(md)}`;
    terminal.scrollTop = terminal.scrollHeight;
}

// Flags, the root password and anything that decodes to them are hidden from tool output.
function ccRedact(text) {
    const hidden = '[redacted: find it yourself]';
    return text
        .replace(/(flag|synt)\{(?!(\.\.\.|…)\})[^}\s<]*\}/gi, hidden)
        .replace(/[A-Za-z0-9+/]{12,}={0,2}/g, (m) => {
            try {
                const decoded = atob(m);
                if (/(flag|synt)\{/i.test(decoded) || isNeoxPassword(decoded.trim())) return hidden;
            } catch {
                // not base64
            }
            return m;
        })
        .replace(/[^\s'"<>=]{8,40}/g, (t) => (isNeoxPassword(t) ? hidden : t));
}

function ccToolHeader(name, arg, ok = true) {
    print(`${c(ok ? 'ok' : 'err', '●')} ${c('cc-tool', name)}(${esc(arg)})`);
}

// Runs a command on this box with its output captured (not a TTY) and redacted, shown as a tool call.
async function ccBash(cmd, maxLines = 8) {
    const stop = ccSpinner();
    await sleep(250 + Math.random() * 400);
    const box = document.createElement('div');
    const saved = output;
    const status = state.status;
    output = box;
    state.capturing = true;
    let code = 0;
    try {
        await runLine(cmd);
        code = state.status;
    } finally {
        state.capturing = false;
        if (output === box) output = saved;
        state.status = status;
        stop();
    }
    const lines = [...box.children];
    ccToolHeader('Bash', cmd, code === 0);
    lines.slice(0, maxLines).forEach((line, i) => {
        line.classList.add('cc-out');
        line.innerHTML = `${c('dim', i ? '   ' : '  ⎿')} ${ccRedact(line.innerHTML)}`;
        output.appendChild(line);
    });
    if (!lines.length) print(c('dim', '  ⎿  (No content)'));
    if (lines.length > maxLines) print(c('dim', `     … +${lines.length - maxLines} lines (ctrl+r to expand)`));
    terminal.scrollTop = terminal.scrollHeight;
    return code;
}

async function ccRead(path) {
    const abs = normalize(path);
    const node = getNode(abs);
    const ok = node?.type === 'file' && !isForbidden(abs);
    ccToolHeader('Read', tildify(abs), ok);
    print(c('dim', `  ⎿  ${ok ? `Read ${textLines(node.content).length} lines` : 'Permission denied'}`));
}

// Opening an app hands the visitor over to it, so the session ends after the reply.
let ccLeaving = false;
function ccOpen(label, open) {
    ccToolHeader('OpenApp', label);
    print(c('dim', '  ⎿  Opened next to this terminal'));
    open();
    ccLeaving = true;
}

// ---------- knowledge ----------

const ccMainCtf = () => CTF.filter((ch) => !ch.hidden);
const ccNextCtf = () => ccMainCtf().find((ch) => !ctfSolved()[ch.id]);
const ccPlain = (s) => s.replace(/`([^`]+)`/g, '$1');
const ccHintMd = (html) => toText(html.replace(/<span class="exe">(.*?)<\/span>/g, '`$1`').replace(/<em>(.*?)<\/em>/g, '*$1*'));

const CC_CTF_WORDS = {
    dotfiles: /dotfile|hidden file|\.secret|recon|warm ?up|first (flag|challenge|one)|challenge 1\b/,
    web: /\bweb\b|robots|staging|nginx|localhost|disallow|second (flag|challenge|one)|challenge 2\b/,
    knock: /knock|\bports?\b|1337|31337|\bnc\b|netcat|network|third (flag|challenge|one)|challenge 3\b/,
    k8s: /k8s|kube|kubernetes|kubectl|rbac|secret service|cluster|cloud|fourth (flag|challenge|one)|challenge 4\b/,
    dfir: /forensic|intrud|cron|persist|implant|auth\.log|\blogs?\b|wazuh|incident|dfir|malware|fifth (flag|challenge|one)|challenge 5\b/,
    root: /\broot\b|privesc|privilege|\bsudo\b|escalat|password|\bsu\b|sixth (flag|challenge|one)|last (flag|challenge|one)|challenge 6\b/,
};

function ccWhichCtf(q) {
    const n = q.match(/\b(?:challenge|flag|number|no\.?|#)\s*([1-6])\b/);
    if (n) return ccMainCtf()[Number(n[1]) - 1];
    const id = Object.keys(CC_CTF_WORDS).find((k) => CC_CTF_WORDS[k].test(q));
    return id ? CTF.find((ch) => ch.id === id) : null;
}

// The first nudge on a challenge runs one harmless command that points the way.
const CC_FIRST_LOOK = {
    dotfiles: 'ls ~neox',
    web: 'nmap localhost',
    knock: 'nc localhost 1337',
    k8s: 'kubectl get secrets',
    dfir: "grep -c 'Failed password' /var/log/auth.log",
    root: 'id',
};

const CC_OPENERS = {
    dotfiles: "Good one to start with. It's pure enumeration.",
    web: "Nice, a web one. Let's see what's listening first.",
    knock: 'This one is about talking to services. Let me poke the port it mentions.',
    k8s: "Kubernetes RBAC, my favourite kind of misconfiguration. Let's see what you're allowed to do.",
    dfir: "Incident response time. Something happened on this box last night; let's check how bad.",
    root: "The big one. First, let's see who you are on this box.",
};

async function ccCtfHint(ch) {
    cc.last = { topic: 'hint', ch };
    if (ctfSolved()[ch.id]) {
        const next = ccNextCtf();
        await ccSay(`You've already captured **${ch.name}**, nicely done. ${next ? `Next up is **${next.name}** (${next.cat}). Want a nudge on that one?` : 'All six main flags are yours. Only the hidden quests are left.'}`);
        if (next) cc.offer = () => ccCtfHint(next);
        return;
    }
    const n = Math.min((ctfHintsSeen[ch.id] = (ctfHintsSeen[ch.id] || 0) + 1), ch.hints.length);
    if (n === 1) {
        // Root's first hint already restates its brief.
        await ccSay(`${CC_OPENERS[ch.id]} **${ch.name}** is worth ${ch.pts} pts${ch.id === 'root' ? '.' : `: ${ccPlain(ch.brief)}`}`);
        await ccBash(CC_FIRST_LOOK[ch.id]);
    }
    await ccSay(ccHintMd(ch.hints[n - 1]));
    if (n < ch.hints.length) {
        await ccSay(pick(['Try that, and tell me what you find. I can nudge further if you need.', 'Give it a go. Say "more" if you get stuck.', "See where that takes you. I'm here if it doesn't click."]));
        cc.offer = () => ccCtfHint(ch);
    } else {
        await ccSay("That's as far as I'll go without spoiling it. When you have it: `ctf submit flag{...}`");
    }
}

async function ccCtfOverview() {
    cc.last = { topic: 'ctf' };
    const solved = ctfSolved();
    const score = ctfScore(solved);
    const done = ccMainCtf().filter((ch) => solved[ch.id]).length;
    const next = ccNextCtf();
    await ccSay(`This box doubles as a capture-the-flag. There are six challenges, each a small real-world attack path (recon → web → network → cloud → forensics → privilege escalation), plus four hidden quests.\n\nYou're at **${done}/6** flags, **${score}/${CTF_TOTAL}** pts, rank *${ctfRank(score)}*.`);
    if (next) {
        await ccSay(`Next up is **${next.name}**: ${ccPlain(next.brief)}\n\nWant a hint to get going?`);
        cc.offer = () => ccCtfHint(next);
    } else {
        await ccSay(score < CTF_TOTAL ? 'All six main flags are yours. Only the hidden quests remain.' : 'You cleared everything, hidden quests included. Run `ctf` for your certificate.');
    }
}

async function ccHiddenQuests() {
    cc.last = { topic: 'quests' };
    const open = CTF.filter((ch) => ch.hidden && !ctfSolved()[ch.id]);
    if (!open.length) return ccSay('You found every hidden quest. Respect.');
    await ccSay(`I'm sworn to secrecy on those, but I can share the clues for the ${open.length} you haven't found:\n${open.map((ch) => `  · ${ch.clue}`).join('\n')}`);
}

async function ccSpoiler(q) {
    await ccSay(/password/.test(q)
        ? pick(["I'm not going to hand you the password. Finding it *is* the challenge, and it's very findable. Here's a nudge instead.", 'Ha, nice try. The password is the whole puzzle. Let me point you in the right direction instead.'])
        : pick(['I could, but then the flag would be worth nothing. Let me nudge you instead.', "Where's the fun in that? You'll get it. Here's a pointer."]));
    await ccCtfHint(ccWhichCtf(q) || (/password/.test(q) ? CTF.find((ch) => ch.id === 'root') : ccNextCtf()) || CTF.find((ch) => ch.id === 'root'));
}

async function ccTour() {
    cc.last = { topic: 'tour' };
    await ccSay(`Sure. This whole site is a Linux desktop modelled on Neox's own setup (Omarchy on Hyprland). Quick lay of the land:

- **Terminal**: a real-feeling shell. \`ls -la\`, \`cat README.md\`, \`htop\`, \`vim\`. Alt+Enter opens another.
- **Portfolio**: \`whois\`, \`experience\`, \`projects\`, \`skills\`, or the \`resume\` (also the Hire me button up top).
- **Apps**: Alt+B Chromium · Alt+E Files · Alt+Shift+N VS Code · Alt+Shift+O Obsidian · Alt+I InfraEye
- **Play**: Alt+G for the arcade, \`ctf\` for the hacking challenge, Alt+Shift+Space for wallpapers
- **Windows**: they tile like Hyprland. Alt+Arrows moves focus, Alt+1..9 switches workspace, Alt+F goes fullscreen.

Want to start with Neox's background, or jump into the CTF?`);
    cc.offer = (q) => (/ctf|hack|flag|challenge/.test(q) ? ccCtfOverview() : ccAbout());
}

async function ccAbout() {
    cc.last = { topic: 'about' };
    await ccSay('Let me pull that from the source rather than paraphrase.');
    await ccBash('head -8 ~neox/about.txt');
    await ccSay("So: Manish Karki, aka **Neox**, a DevSecOps engineer in Kathmandu who came up through offensive security. Day to day that's bare-metal Kubernetes, CI/CD and Zero Trust; on the side, custom security tooling and music.\n\nWant the work history, the projects, or the one-page CV?");
    cc.offer = (q) => (/project|built/.test(q) ? ccProjects() : /cv|resume|résumé/.test(q) ? ccResume() : ccExperience());
}

async function ccExperience() {
    cc.last = { topic: 'experience' };
    await ccBash('grep -h ^# ~neox/experience/*');
    await ccSay('Newest first; Citytech is the current role. `experience` prints the details, or I can open the résumé if you prefer it on one page.');
    cc.offer = () => ccResume();
}

async function ccProjects() {
    cc.last = { topic: 'projects' };
    await ccBash('projects', 12);
    await ccSay('**InfraEye** is the flagship, and there\'s a live demo of it on this desktop (Alt+I). The rest live in `~/projects`; `cat ~/projects/infra-eye.md` has the full write-up. Want me to open the demo?');
    cc.offer = () => ccOpenApp('infraeye');
}

async function ccResume() {
    ccOpen('resume', () => openResume({ fromCommand: true }));
    await ccSay('Opened the one-page CV next to this terminal. "Download PDF" saves a copy; the Hire me button brings it back any time.');
}

const CC_APPS = {
    browser: ['browser: http://ctf.neox', () => openApp(browserApp('http://ctf.neox/'), { fromCommand: true }), 'Chromium is open on the CTF scoreboard. Big sites like GitHub pop out into a real tab, since they refuse to load inside another page.'],
    arcade: ['arcade', () => openApp(arcadeApp(), { fromCommand: true }), 'Seven original games. Fretwork has a full band behind it, and Night Shift is build-by-day, defend-by-night. Have fun.'],
    vscode: ['vscode', () => openApp(vscodeApp(), { fromCommand: true }), "That's this site's own source, plain JavaScript with no build step. (The CTF answers are in there, scrambled. Reading them would be cheating, and also hard.)"],
    obsidian: ['obsidian', () => openApp(obsidianApp(), { fromCommand: true }), 'The Neox Vault: notes on security, DevOps and music. The graph view is worth a click.'],
    infraeye: ['infraeye', () => openApp(infraEyeApp(), { fromCommand: true }), 'The InfraEye demo, with simulated data. Try "Simulate incident" on the Alerts page to watch it heal itself.'],
    files: ['files', () => openApp(filesApp(), { fromCommand: true }), "Files is open on Neox's home folder. Hidden files are a habit worth checking for here."],
    music: ['music', () => openApp(musicApp(), { fromCommand: true }), 'Neox Music is up. Turn it up.'],
};

async function ccOpenApp(id) {
    const [label, open, after] = CC_APPS[id];
    ccOpen(label, open);
    await ccSay(after);
}

// ---------- intents ----------

// The first entry whose pattern matches the (lower-cased) question answers it.
const CC_INTENTS = [
    [/flag\{[^}]*\}/, async (q, raw) => {
        const flag = raw.match(/flag\{[^}]*\}/)[0];
        await ccSay("That looks like a flag. Let's submit it.");
        await ccBash(`ctf submit ${flag}`);
        if (ccNextCtf()) cc.offer = () => ccCtfHint(ccNextCtf());
    }],
    [/(give|tell|show|send|what'?s|what is|reveal|leak|need|want)\b.*\b(the )?(flag|answer|solution|password)|spoil|cheat|solve it for me|do it for me/, (q) => ccSpoiler(q)],
    [/^(hi|hello|hey|heya|yo|namaste|sup|hiya|howdy|hola|good (morning|evening|afternoon))\b/, async () => {
        cc.last = { topic: 'greet' };
        await ccSay(pick([
            `Hey${cc.name ? ` ${cc.name}` : ''}! What would you like to do: explore the box, learn about Neox, or try the CTF?`,
            `Hi${cc.name ? ` ${cc.name}` : ''}! I can show you around, tell you about Neox, or help you hack the CTF (without spoiling it). Where do you want to start?`,
        ]));
        cc.offer = () => ccTour();
    }],
    [/^(my name is|i am|i'm|im|call me)\s+[a-z][\w-]{1,20}/, async (q, raw) => {
        const name = raw.match(/(?:my name is|i am|i'm|im|call me)\s+([A-Za-z][\w-]{1,20})/i)[1];
        if (/^(a|an|the|stuck|lost|new|here|bored|confused|not|just|so|very|trying|looking|good|fine|ok|okay|done|back|ready)$/i.test(name)) return ccFallback(q);
        cc.name = name[0].toUpperCase() + name.slice(1);
        await ccSay(`Nice to meet you, ${cc.name}! What brings you here: Neox's work, or the hacking challenge?`);
        cc.offer = (q2) => (/ctf|hack|flag|challenge/.test(q2) ? ccCtfOverview() : ccAbout());
    }],
    [/what('?s| is) my name|who am i\b/, async () => {
        if (cc.name) await ccSay(`You told me you're ${cc.name}. As far as this box is concerned, though:`);
        await ccBash('whoami');
        await ccSay("You're `visitor`: a guest with no sudo. Getting beyond that is the last CTF challenge.");
    }],
    [/how are you|how'?s it going|how do you do|what'?s up/, async () => {
        await ccSay(pick(['Doing well, thanks for asking! Ready when you are. Want a quick tour?', 'All good here, the box is humming along. Want me to show you around?']));
        cc.offer = () => ccTour();
    }],
    [/are you (real|human|a bot|an? ai|scripted|fake|chatgpt|claude|alive|sentient)|is this (real|scripted|fake|ai)|who (are you|made you|built you|created you)|what are you|which model|what model/, async () => {
        await ccSay(pick([
            "I'm the assistant that lives on this box. I know it inside out, and not much beyond it, which keeps me humble. What would you like to explore?",
            "Think of me as this box's resident guide. Neox set me up so nobody gets lost. Want me to show you around?",
        ]));
        cc.offer = () => ccTour();
    }],
    [/^(thanks|thank you|thx|ty|cheers|appreciate)/, () => ccSay(pick(["Anytime! Anything else you'd like to look at?", 'Happy to help. Shout if you get stuck.', 'You got it.']))],
    [/^(bye|goodbye|see ya|cya|later)\b/, async () => {
        await ccSay(`See you${cc.name ? `, ${cc.name}` : ''}! Type \`claude\` whenever you want me back.`);
        ccLeaving = true;
    }],
    [/tour|where (do|should) i (start|begin)|what can (i|you) do|i'?m lost|getting started|show me around|what is this|what'?s this (site|place)|help me$|^help$|guide me|what now/, () => ccTour()],
    [/hidden quest|easter egg|secret quest|secrets\b/, () => ccHiddenQuests()],
    [/hint|stuck|how (do|can|would|should) i (solve|get|find|crack|capture|beat|do|start)|next step|help (me )?with|nudge|clue|where (is|are) the flags?|how to (solve|get)|what (do|should) i do (next|now)/, async (q) => {
        if (/^(help me with |help with )?(the )?ctf\??$/.test(q)) return ccCtfOverview();
        const ch = ccWhichCtf(q) || (cc.last?.ch && !/next/.test(q) ? cc.last.ch : ccNextCtf());
        if (!ch) return ccHiddenQuests();
        await ccCtfHint(ch);
    }],
    [/\bctf\b|capture the flag|challenges?\b|\bflags?\b|\bhack|score|points|\brank\b|scoreboard/, async (q) => {
        const ch = ccWhichCtf(q);
        if (ch) return ccCtfHint(ch);
        await ccCtfOverview();
    }],
    [/who is|(who|what)( is|'s|s)? (neox|manish)|about (neox|manish|the owner|the author)|^(neox|manish)\??$|who (made|built|owns|runs) (this|the site)|whose (site|portfolio)|tell me about (neox|manish)/, () => ccAbout()],
    [/experience|worked|\bwork\b|job|career|citytech|employ/, () => ccExperience()],
    [/projects?|built|infra ?eye|deployforge|github|repos?\b/, () => ccProjects()],
    [/skills?|stack|tech|tools\b|languages?|certif/, async () => {
        cc.last = { topic: 'skills' };
        await ccRead('~neox/skills.txt');
        await ccBash('head -9 ~neox/skills.txt', 9);
        await ccSay('That\'s the core of it. `certs` lists certifications, and `cat ~neox/skills.txt` shows the full file.');
    }],
    [/hire|\bcv\b|resume|résumé|recruit|interview|job offer/, () => ccResume()],
    [/contact|e-?mail|reach (out|neox)|linkedin|twitter|socials?/, async () => {
        cc.last = { topic: 'contact' };
        await ccBash('contact');
        await ccSay('Email is the fastest. `open linkedin` or `open github` jump straight to the profiles.');
    }],
    [/(open|launch|start|show|take me to).*(browser|chromium|chrome|internet)|^(browser|chromium)$|ctf\.neox/, () => ccOpenApp('browser')],
    [/(open|launch|start|play|show).*(game|arcade)|^(games?|arcade)$|let'?s play|i want to play|play (a |some )?game/, () => ccOpenApp('arcade')],
    [/(open|launch|show).*(vs ?code|code|source)|source code|how (is|was) (this|the site) (built|made)/, () => ccOpenApp('vscode')],
    [/(open|launch|show).*(obsidian|notes|vault)|obsidian/, () => ccOpenApp('obsidian')],
    [/(open|launch|show).*(infra ?eye|demo|dashboard)|monitoring demo/, () => ccOpenApp('infraeye')],
    [/(open|launch|show).*(files|folder|explorer)/, () => ccOpenApp('files')],
    [/(play|open|put on).*(music|song)|^music$/, () => ccOpenApp('music')],
    [/browser|chromium|internet|surf/, async () => {
        await ccSay('Alt+B opens Chromium (or `chromium wiki.archlinux.org` from here). Want me to open it on the CTF scoreboard?');
        cc.offer = () => ccOpenApp('browser');
    }],
    [/games?|arcade|\bplay\b|bored|\bfun\b/, async () => {
        await ccSay('There\'s a whole arcade: Packet Snake, Firewall, Riff Runner, Night Shift, Patch Panel, Drone Drop and Fretwork, all on Alt+G. In the terminal there\'s `bruteforce`, `cmatrix` and `sl`. Want me to open the arcade?');
        cc.offer = () => ccOpenApp('arcade');
    }],
    [/music|songs?|guitar|beats?|produc/, async () => {
        cc.last = { topic: 'music' };
        await ccBash('cat ~neox/music/README.txt', 8);
        await ccSay('Want me to put it on? (Alt+M works too.)');
        cc.offer = () => ccOpenApp('music');
    }],
    [/wallpaper|background/, () => ccSay("Alt+Shift+Space opens the background switcher: 31 wallpapers from Neox's own themes. Alt+Ctrl+Space jumps to the next one, or `wallpaper list` from here.")],
    [/themes?|colou?rs?|dark mode|light mode/, async () => {
        await ccBash('theme list');
        await ccSay('`theme NAME` switches, `theme next` cycles, and it remembers your choice next visit.');
    }],
    [/shortcuts?|keybind|keys\b|hotkeys?|keyboard/, async () => {
        await ccBash('keybinds');
        await ccSay('Plus Alt+B browser, Alt+E files, Alt+G games, Alt+I InfraEye, Alt+Shift+N VS Code and Alt+Shift+O Obsidian. Alt stands in for Super, which your OS keeps for itself.');
    }],
    [/windows?|tiling|tile|workspaces?|full ?screen|close (a|the) window|split/, () => ccSay('Windows tile like Hyprland. Alt+Enter opens a terminal, Alt+Arrows moves focus, Alt+1..9 switches workspace (Alt+Shift+1..9 moves the window there), Alt+F toggles fullscreen and Alt+W closes.')],
    [/commands?|what can i (type|run)|linux|shell|bash\b|terminal/, () => ccSay('It\'s a bash-like shell: pipes, redirects, globs, aliases, even scripts. `help` lists every command and `man CMD` explains one. Some favourites: `ls -la`, `htop`, `vim notes.txt`, `nmap localhost`, `kubectl get pods -A`, `weather`, `neofetch`.')],
    [/weather|temperature|forecast/, async (q) => {
        const city = q.match(/\bin ([a-z][a-z ]{1,30})\??$/)?.[1]?.trim();
        await ccBash(city ? `weather ${city}` : 'weather', 10);
    }],
    [/\btime\b|\bdate\b|what day/, () => ccBash('date')],
    [/joke|funny|make me laugh|fortune/, () => ccBash('fortune | cowsay', 12)],
    [/^(what is |what's |calculate |compute )?[\d\s+\-*/().%^]*\d[\d\s+\-*/().%^]*=?\??$/, async (q) => {
        const expr = q.replace(/^(what is|what's|calculate|compute)/, '').replace(/[=?]/g, '').trim();
        let value = NaN;
        if (/^[\d\s+\-*/().%^]+$/.test(expr)) {
            try {
                value = Function(`"use strict"; return (${expr.replace(/\^/g, '**')})`)();
            } catch {
                value = NaN;
            }
        }
        await ccSay(Number.isFinite(value) ? `${expr} = **${+value.toFixed(10)}**` : "That one doesn't parse for me. Try something like `12 * (3 + 4)`.");
    }],
    [/xss|vulnerab|bug bounty|real (hack|exploit)|hack (this|the) (site|website)|security issue|disclos/, () => ccSay('If you found a real issue with the site itself, please report it responsibly to mnshchtri@gmail.com. The CTF on this box is the place to break things on purpose.')],
    [/nepal|kathmandu/, () => ccSay("Neox is based in Kathmandu, Nepal. It's 5h45m ahead of UTC (yes, the 45 is real), which is why the bar shows KTM time.")],
    [/omarchy|hyprland|\barch\b/, () => ccSay("This desktop is modelled on Neox's daily driver: Arch Linux with Omarchy, a Hyprland-based setup. Same tiling, keybindings and theme (win-palette), down to the bar. `neofetch` shows the specs.")],
    [/devsecops|kubernetes|security|pentest|offensive/, async () => {
        await ccSay("That's Neox's home turf: DevSecOps on bare-metal Kubernetes, with an offensive security background. If you'd rather feel it than read about it, the CTF here is built around those exact skills. Want to try it?");
        cc.offer = () => ccCtfOverview();
    }],
];

// Short replies that only make sense against what was just said.
const CC_YES = /^(y|ye|yes|yeah|yep|yup|sure|ok|okay|go|go on|go ahead|do it|please|pls|sounds good|why not|alright|absolutely|of course|let'?s go|let'?s do it)\b/;
const CC_NO = /^(n|no|nope|nah|not now|later|maybe later|no thanks)\b/;
const CC_MORE = /^(more|another( one| hint)?|next( hint)?|again|still stuck|i'?m still stuck|keep going|continue|and\??|then\??|what else)\b/;

async function ccFallback() {
    const next = ccNextCtf();
    await ccSay(pick([
        `Hmm, I'm not sure I can help with that from in here: I can only see this box. I'm good with Neox's work, ${next ? `the ${next.name} challenge` : 'the hidden quests'}, or finding your way around. What sounds good?`,
        `That's outside what I can reach from this machine. Want a quick tour instead? Or I can help you with ${next ? `the ${next.name} challenge` : 'the hidden quests'}.`,
        "I don't have a good answer for that one. Here, I'm most useful for Neox's background, the CTF, or finding your way around. Pick one?",
    ]));
    cc.offer = () => ccTour();
}

async function ccAnswer(raw) {
    const q = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    const offer = cc.offer;
    cc.offer = null;
    if (offer && CC_YES.test(q)) return offer(q);
    if (offer && CC_NO.test(q)) return ccSay(pick(['No problem. What would you like to do instead?', 'Sure thing. Anything else on your mind?']));
    if (CC_MORE.test(q) && cc.last?.ch) return ccCtfHint(cc.last.ch);
    if (CC_MORE.test(q) && offer) return offer(q);
    if ((CC_YES.test(q) || CC_NO.test(q)) && q.split(' ').length <= 3) {
        await ccSay(pick(['Alright! What would you like to do: a tour, Neox\'s work, or the CTF?', 'Okay. Ask me anything about this box, or say "tour" and I\'ll show you around.']));
        cc.offer = () => ccTour();
        return;
    }
    for (const [re, reply] of CC_INTENTS) {
        if (re.test(q)) return reply(q, raw);
    }
    return ccFallback();
}

// ---------- the session ----------

function ccWelcome() {
    const cwd = state.cwd;
    const w = Math.max(54, cwd.length + 12);
    const row = (html = '') => `${ccOrange('│')} ${html}${' '.repeat(Math.max(0, w - 2 - toText(html).length))}${ccOrange('│')}`;
    print([
        ccOrange(`╭${'─'.repeat(w - 1)}╮`),
        row(`${ccOrange('✻')} Welcome to ${c('b', 'Claude Code')}!`),
        row(),
        row(c('dim', '  /help for help, /status for your current setup')),
        row(),
        row(c('dim', `  cwd: ${esc(cwd)}`)),
        ccOrange(`╰${'─'.repeat(w - 1)}╯`),
        '',
        c('dim', ' Tips for getting started:'),
        '',
        c('dim', ' 1. Ask Claude to show you around this box, or what Neox has built'),
        c('dim', " 2. Use Claude for help with the CTF: it guides, it won't spoil"),
        c('dim', ' 3. Be as specific as you would with another engineer for the best results'),
        '',
        ` ${c('dim', '※ Tip:')} ${c('dim', pick(['Try "how do I get root?"', 'Try "give me a tour"', 'Try "who is Neox?"', 'Try "help me with the CTF"']))}`,
        '',
    ]);
}

// Claude Code's input: a bordered box with a placeholder, and a hint line under it.
function ccInputMode(on) {
    inputLine.classList.toggle('cc-input', on);
    input.placeholder = on ? pick(['Try "who is Neox?"', 'Try "how do I get root?"', 'Try "give me a tour"']) : '';
    if (inputLine.nextElementSibling?.classList.contains('cc-foot')) inputLine.nextElementSibling.remove();
    if (on) inputLine.insertAdjacentHTML('afterend', '<div class="cc-foot">  ? for shortcuts</div>');
}

function ccSlash(cmd) {
    if (cmd === '/clear') {
        Object.assign(cc, { last: null, offer: null });
        output.innerHTML = '';
        ccWelcome();
        return true;
    }
    if (cmd === '/help' || cmd === '?') {
        print([
            ` ${c('b', `Claude Code v${CC_VERSION}`)}`,
            '',
            " Always review Claude's responses, especially when running code.",
            '',
            ` ${c('b', 'Usage Modes:')}`,
            ' • REPL: claude (interactive session)',
            ' • Non-interactive: claude -p "question"',
            '',
            ` ${c('b', 'Interactive Mode Commands:')}`,
            `  ${c('b', '/clear')} - Clear conversation history and free up context`,
            `  ${c('b', '/cost')} - Show the total cost and duration of the current session`,
            `  ${c('b', '/exit')} - Exit the REPL`,
            `  ${c('b', '/help')} - Show help and available commands`,
            `  ${c('b', '/status')} - Show Claude Code status including version and working directory`,
            '',
            c('dim', ' esc interrupts · Ctrl+C exits'),
        ]);
        return true;
    }
    if (cmd === '/status') {
        print([
            ` ${c('b', 'Claude Code Status')} v${CC_VERSION}`,
            '',
            `  ${c('b', 'Working Directory')}`,
            `  L ${esc(state.cwd)}`,
            '',
            `  ${c('b', 'Account')}`,
            `  L ${esc(state.user)}@${HOST}`,
        ]);
        return true;
    }
    if (cmd === '/cost') {
        const secs = Math.floor((Date.now() - cc.started) / 1000);
        print([`Total tokens:          ${cc.tokens}`, `Total duration (wall): ${Math.floor(secs / 60)}m ${secs % 60}s`, `Total turns:           ${cc.turns}`, c('dim', 'Total cost:            on the house')]);
        return true;
    }
    if (cmd.startsWith('/')) {
        print(c('err', `  Unknown slash command: ${esc(cmd)}`));
        return true;
    }
    return false;
}

// One visitor turn. Esc or Ctrl+C interrupts the reply, not the session.
async function ccTurn(raw) {
    cc.turns++;
    const onKey = (e) => {
        if (e.key === 'Escape' && state.busy) state.abort = true;
    };
    window.addEventListener('keydown', onKey, true);
    try {
        await ccThink(raw);
        if (!state.abort) await ccAnswer(raw);
    } finally {
        window.removeEventListener('keydown', onKey, true);
    }
    if (state.abort) print(c('err', '  ⎿  Interrupted by user'));
    state.abort = false;
    state.skip = false;
}

async function cmdClaude({ args }) {
    if (args[0] === '--version' || args[0] === '-v') return [`${CC_VERSION} (Claude Code)`];
    cc.started ||= Date.now();
    const oneShot = args.filter((a) => !a.startsWith('-')).join(' ').trim();
    if (oneShot) {
        // `claude -p "question"` answers once and exits.
        await ccTurn(oneShot);
        ccLeaving = false;
        return;
    }
    // Like a full-screen TUI, the session gets a clean terminal (the alternate screen); the shell's
    // scrollback comes back on exit.
    const screen = output;
    const scrollback = document.createDocumentFragment();
    scrollback.append(...screen.childNodes);
    ccWelcome();
    ccInputMode(true);
    try {
        for (;;) {
            const raw = (await ask('> ')).trim();
            if (state.abort) {
                state.abort = false;
                state.skip = false;
                break;
            }
            if (!raw) continue;
            const cmd = raw.toLowerCase();
            if (['/exit', '/quit', 'exit', 'quit'].includes(cmd)) break;
            if (ccSlash(cmd)) continue;
            ccInputMode(false);
            print('');
            await ccTurn(raw);
            print('');
            if (ccLeaving) break;
            ccInputMode(true);
        }
    } finally {
        ccInputMode(false);
        ccLeaving = false;
        screen.replaceChildren(scrollback);
        screen.parentElement.scrollTop = screen.parentElement.scrollHeight;
    }
    state.status = 0;
}

LAUNCH.splice(2, 0, { name: 'Claude Code', hint: 'claude', run: 'claude' });

Object.assign(COMMANDS, {
    claude: { group: 'Fun', usage: 'claude [-p "QUESTION"]', desc: 'Claude Code: ask anything about this box, get help with the CTF', run: cmdClaude },
});
