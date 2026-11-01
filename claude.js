'use strict';

// `claude`: an assistant in Claude Code's clothes. The UI follows Claude Code (welcome box, bordered
// input, spinner, ● replies, ● Bash(...) tool calls with ⎿ output, slash commands). Underneath it is
// scripted: intents matched by pattern, with a memory of the conversation (every question and what
// it was about, the visitor's name and role, an offer waiting for a "yes"), so "it", "go back to that"
// and "what did I ask first?" work; it's kept in this browser, so returning visitors are recognised.
// Real commands run on this box to show things. No network, no AI.
// It never prints a flag or the root password: tool output is redacted (ccRedact) and CTF help comes
// as hints. Asked sincerely what it is, it deflects in character but never claims to be Anthropic's.

const CC_VERSION = '2.1.0';
const CC_VERBS = ['Pondering', 'Enumerating', 'Grepping', 'Spelunking', 'Reticulating', 'Noodling', 'Tracing', 'Moseying', 'Percolating', 'Cogitating', 'Schlepping', 'Brewing', 'Unravelling', 'Sleuthing'];
const CC_SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const ccOrange = (html) => `<span class="cc-orange">${html}</span>`;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// What the assistant remembers during a session.
// `history` holds every turn: { raw, q, norm, subject, minor }, where subject is what the reply was about.
const cc = { name: '', role: '', last: null, offer: null, history: [], tokens: 0, turns: 0, started: 0 };

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
    output.lastElementChild.classList.add('cc-call');
}

// A dim line under a tool call (⎿ status, "… +N lines").
function ccToolNote(text) {
    print(c('dim', text));
    output.lastElementChild.classList.add('cc-out');
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
    if (!lines.length) ccToolNote('  ⎿  (No content)');
    if (lines.length > maxLines) ccToolNote(`     … +${lines.length - maxLines} lines (ctrl+r to expand)`);
    terminal.scrollTop = terminal.scrollHeight;
    return code;
}

async function ccRead(path) {
    const abs = normalize(path);
    const node = getNode(abs);
    const ok = node?.type === 'file' && !isForbidden(abs);
    ccToolHeader('Read', tildify(abs), ok);
    ccToolNote(`  ⎿  ${ok ? `Read ${textLines(node.content).length} lines` : 'Permission denied'}`);
}

// Opening an app hands the visitor over to it, so the session ends after the reply.
let ccLeaving = false;
function ccOpen(label, open) {
    ccToolHeader('OpenApp', label);
    ccToolNote('  ⎿  Opened next to this terminal');
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
    await ccBash('head -6 ~neox/about.txt');
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
        const prev = ccLastSubject();
        if (prev) {
            await ccSay(prev.old
                ? `Welcome back${cc.name ? `, ${cc.name}` : ''}! Last time you were here we talked about ${ccSubjectLabel(prev.subject)}. Pick that back up, or something new?`
                : `Hey again${cc.name ? ` ${cc.name}` : ''}! We were on ${ccSubjectLabel(prev.subject)}. Pick that back up, or something new?`);
            cc.offer = () => ccRevisit(prev);
            return;
        }
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
    [/what('?s| is) your name|who am i talking to|do you have a name/, async () => {
        await ccSay(pick(["Just the assistant that lives on this box. What's yours?", "Names are overrated. I'm the one who knows where everything is on this machine. What should I call you?"]));
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
    [/(who|what)( is|'s|s)? (neox|manish|the (owner|author|developer))|who (is|'s) (he|she|they|the guy|this person)\b|about (neox|manish|the owner|the author)|^(neox|manish)\??$|who (made|built|owns|runs) (this|the site)|whose (site|portfolio)|tell me about (neox|manish)/, () => ccAbout()],
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

// ---------- deeper knowledge: files on the box, terms, commands ----------

// Projects and jobs, each answered from its own file. Keys are the words people use for them.
const CC_FILES = [
    [/infra ?eye/, '~neox/projects/infra-eye.md'],
    [/deploy ?forge/, '~neox/projects/deployforge.md'],
    [/cyber ?lynx/, '~neox/projects/cyberlynx.md'],
    [/trimurti ?sec|trimurti/, '~neox/projects/trimurtisec.md'],
    [/sec ?audit/, '~neox/projects/secaudit.md'],
    [/password (manager|widget)|passwords? widget|passwd/, '~neox/projects/passwd-manager.md'],
    [/guitar rig|audio dsp|\bdsp\b|juce/, '~neox/projects/audio-dsp.md'],
    [/oxidaw|\bdaw\b/, '~neox/projects/oxidaw.md'],
    [/signal ?verse/, '~neox/projects/signalverse.md'],
    [/wazuh|siem/, '~neox/projects/wazuh-siem.md'],
    [/xss (lab|security lab)/, '~neox/projects/xss-security-lab.md'],
    [/citytech|current (job|role)|where does (neox|manish|he|she|they) work|where (do|does) (neox|manish) work/, '~neox/experience/01-citytech.md'],
    [/inred|intern(ship)?/, '~neox/experience/02-inred-labs.md'],
    [/uni express/, '~neox/experience/03-uni-express.md'],
    [/yes international/, '~neox/experience/04-yes-international.md'],
    [/siddhi ganesh/, '~neox/experience/05-siddhi-ganesh.md'],
    [/educat|degree|universit|college|stud(y|ied)|school|bsc|islington|graduat/, '~neox/education.txt'],
    [/certif|course|tryhackme|hack ?the ?box|thm\b|htb\b|tcm|aws academy/, '~neox/certifications.txt'],
];

async function ccFromFile(path, lines = 10) {
    cc.last = { topic: 'file', path, shown: lines };
    await ccBash(`head -${lines} ${path}`, lines);
    const total = textLines(getNode(normalize(path))?.content || '').length;
    if (total > lines) {
        await ccSay(pick(['There\'s more in that file. Want the rest?', 'That\'s the top of it. Say "more" for the rest.']));
        cc.offer = () => ccMoreFile();
    } else {
        cc.last = { topic: 'filedone', path };
        await ccSay(pick(['That\'s the whole file. Anything else you\'d like to dig into?', 'That\'s all of it. What else are you curious about?']));
    }
}

async function ccMoreFile() {
    const { path, shown } = cc.last;
    await ccBash(`head -${shown + 14} ${path} | tail -14`, 14);
    cc.last = { topic: 'file', path, shown: shown + 14 };
}

// Short, accurate explanations of the terms visitors bump into here.
const CC_TERMS = [
    [/\bctf\b|capture the flag/, 'A **CTF** (capture the flag) is a security game: you break into deliberately vulnerable systems to find secret strings called flags. This box is one; `ctf` shows the scoreboard.'],
    [/devsecops/, '**DevSecOps** builds security into the whole delivery pipeline (code, CI/CD, infrastructure, runtime) instead of bolting it on at the end. It\'s Neox\'s day job.'],
    [/zero trust/, '**Zero Trust** means no implicit trust from network location: every request is authenticated and authorised, access is least-privilege, and the network is segmented so one breach doesn\'t spread.'],
    [/\bxss\b|cross.site scripting/, '**XSS** (cross-site scripting) is when an attacker gets their JavaScript to run in someone else\'s browser on a trusted site, usually through input that\'s rendered without escaping. The fix is context-aware output encoding plus a strict CSP.'],
    [/sql ?injection|\bsqli\b/, '**SQL injection** is user input ending up inside a SQL query as code. Parameterised queries (prepared statements) fix it at the root.'],
    [/\brbac\b|role.based/, '**RBAC** (role-based access control) grants permissions to roles and binds people or services to them. In Kubernetes: Role/ClusterRole plus RoleBinding. One sloppy binding is challenge 4 here.'],
    [/kubernetes|\bk8s\b/, '**Kubernetes** orchestrates containers: it schedules them onto machines, restarts them, scales them and wires up networking. Neox runs it on bare metal. Try `kubectl get pods -A`.'],
    [/\bdocker\b|container/, '**Docker** packages an app with everything it needs into a container image that runs the same anywhere. `docker ps` works here once you\'re neox.'],
    [/port knock/, '**Port knocking** keeps a port firewalled until a client "knocks" on a secret sequence of closed ports. It\'s obscurity rather than real security, and challenge 3 is built on it.'],
    [/base ?64/, '**Base64** is an encoding, not encryption: it turns bytes into printable text and anyone can reverse it with `base64 -d`. Trailing `=` padding is the giveaway.'],
    [/rot ?13/, '**ROT13** shifts each letter 13 places, so applying it twice gets you back. `tr \'A-Za-z\' \'N-ZA-Mn-za-m\'` does it in a shell.'],
    [/\bsudo\b/, '**sudo** runs a command as another user (usually root) if `/etc/sudoers` allows it. `sudo -l` lists what you may run.'],
    [/\bcron\b|crontab/, '**cron** runs scheduled jobs. System jobs live in `/etc/cron.d`, which makes it a classic place for attackers to hide persistence.'],
    [/\bnmap\b|port scan/, '**nmap** scans hosts for open ports and the services behind them. `nmap -sV localhost` here (and only on machines you\'re allowed to scan).'],
    [/\bssh\b/, '**SSH** gives you an encrypted shell on a remote machine, ideally with key-based auth rather than passwords.'],
    [/privilege escalation|privesc/, '**Privilege escalation** is going from limited access to more (usually root) by abusing misconfigurations, leaked credentials or vulnerable software. Challenge 6 here.'],
    [/reverse shell/, 'A **reverse shell** is when a compromised machine connects *out* to the attacker and hands over a shell, which slips past firewalls that block inbound connections.'],
    [/\bowasp\b/, '**OWASP** is a nonprofit known for the OWASP Top 10, the standard list of the most critical web application security risks.'],
    [/mitre|att&?ck/, '**MITRE ATT&CK** is a knowledge base of real-world adversary tactics and techniques, used to map detections and plan defences.'],
    [/\bsiem\b/, 'A **SIEM** collects logs from across your systems and correlates them into alerts. Neox uses Wazuh, and this box\'s journal has some of its alerts.'],
    [/\btls\b|\bssl\b|https/, '**TLS** encrypts traffic between client and server and proves the server\'s identity with a certificate. It\'s the S in HTTPS.'],
    [/firewall/, 'A **firewall** filters network traffic by rules. On Linux that\'s usually nftables, which this box runs.'],
    [/\bci ?\/ ?cd\b|pipeline|jenkins/, '**CI/CD** automatically builds, tests and ships code on every change. Neox builds Jenkins pipelines for a bank\'s bare-metal Kubernetes.'],
    [/haproxy|load balanc|reverse proxy|nginx/, 'A **load balancer / reverse proxy** (HAProxy, Nginx) sits in front of services, spreads traffic and lets you roll out releases with zero downtime. Neox designed exactly that at Citytech.'],
    [/hyprland|tiling/, '**Hyprland** is a tiling Wayland compositor: windows arrange themselves instead of overlapping. This desktop mimics it.'],
    [/\barch\b|arch linux/, '**Arch Linux** is a minimal, rolling-release distro you assemble yourself. Neox\'s daily driver, with Omarchy on top.'],
    [/\bomarchy\b/, '**Omarchy** is an opinionated Arch + Hyprland setup. This whole site is modelled on Neox\'s Omarchy desktop, theme included.'],
];

// "What does ls do?", "how do I use grep": answered from the shell's own command table.
function ccCommandIn(q) {
    const m = q.match(/(?:what (?:does|is)|how (?:do i|to|does) (?:use|run)?|explain|usage of|what's)\s+(?:the\s+)?`?([a-z][\w-]*)`?(?:\s+command)?/);
    const name = m?.[1];
    return name && Object.hasOwn(COMMANDS, name) && COMMANDS[name].group !== 'Hidden' ? name : null;
}

// Last resort before admitting defeat: search Neox's files for the question's keywords.
const CC_STOP = new Set('the a an and or of to in on for with is are was were be been do does did can could would should what whats who whom how why when where which that this these those it its me my i you your yours we our they them their he she his her about tell know any some there here have has had just also please show find give get want like more much many from into than then so if not no yes neox manish karki does use uses used using know knows'.split(' '));

function ccSearchTerms(q) {
    return [...new Set(q.replace(/[^\w\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !CC_STOP.has(w)))].slice(0, 3);
}

async function ccSearch(q) {
    const terms = ccSearchTerms(q);
    if (!terms.length) return false;
    const hits = [];
    const wordRe = (t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    (function walk(node, path) {
        for (const [name, child] of Object.entries(node.children)) {
            const p = `${path}/${name}`;
            // ~/code holds this site's own source, which would match everything.
            if (child.type === 'dir' && !child.private && name !== 'code') walk(child, p);
            else if (child.type === 'file' && !child.private && !name.startsWith('.') && typeof child.content === 'string') {
                if (terms.some((t) => wordRe(t).test(child.content))) hits.push(p);
            }
        }
    })(getNode(HOME), HOME);
    if (!hits.length) return false;
    const term = terms.find((t) => hits.some((p) => wordRe(t).test(getNode(p).content)));
    cc.last = { topic: 'search', search: term };
    await ccSay(pick([`Let me search the box for "${term}".`, `I'll grep Neox's files for "${term}".`]));
    // Work history and skills first, then projects and notes.
    await ccBash(`grep -ri "\\b${term}\\b" ~/experience ~/skills.txt ~/about.txt ~/projects ~/Documents 2>/dev/null | head -6`, 6);
    await ccSay(pick(['That\'s what turns up on this box. Want me to open any of those files?', 'Those are the places it comes up. Anything there you want to dig into?']));
    return true;
}

async function ccFallback(q = '') {
    if (await ccSearch(q)) return;
    const next = ccNextCtf();
    await ccSay(pick([
        `Hmm, I'm not sure I can help with that from in here: I can only see this box. I'm good with Neox's work, ${next ? `the ${next.name} challenge` : 'the hidden quests'}, or finding your way around. What sounds good?`,
        `That's outside what I can reach from this machine. Want a quick tour instead? Or I can help you with ${next ? `the ${next.name} challenge` : 'the hidden quests'}.`,
        "I don't have a good answer for that one. Here, I'm most useful for Neox's background, the CTF, or finding your way around. Pick one?",
    ]));
    cc.offer = () => ccTour();
}

// Intents for things the first pass doesn't cover, checked after CC_INTENTS.
const CC_MORE_INTENTS = [
    [/^(?:i'?m|i am|im|i work as) (?:a |an )?(recruiter|hiring manager|hr|manager|founder|student|beginner|newbie|developer|dev|(?:software |devops |security |cloud |network )?engineer|security researcher|pentester|penetration tester|hacker|ctf player|designer|sysadmin|teacher)\b/, async (q) => {
        cc.role = q.match(/(recruiter|hiring manager|hr|manager|founder|student|beginner|newbie|developer|dev|(?:software |devops |security |cloud |network )?engineer|security researcher|pentester|penetration tester|hacker|ctf player|designer|sysadmin|teacher)\b/)[1];
        if (/recruiter|hiring|hr|manager|founder/.test(cc.role)) {
            await ccSay("Good to have you. The quickest overview is the one-page CV, and I'm happy to answer anything about Neox's experience. Want me to open the CV?");
            cc.offer = () => ccResume();
        } else if (/student|beginner|newbie/.test(cc.role)) {
            const next = ccNextCtf();
            await ccSay(`Welcome! You're in a good place to learn: the CTF here starts gentle and every step is a real technique.${next ? ` Want me to walk you into **${next.name}**?` : ''}`);
            if (next) cc.offer = () => ccCtfHint(next);
        } else if (/pentest|penetration|hacker|ctf|researcher|security/.test(cc.role)) {
            await ccSay("Then you'll want the CTF: six flags along a real attack path, four hidden quests, and I only ever nudge. Want the scoreboard?");
            cc.offer = () => ccCtfOverview();
        } else {
            await ccSay("Nice. You might enjoy the site's own source (VS Code, Alt+Shift+N) or the InfraEye demo (Alt+I). Want the quick tour first?");
            cc.offer = () => ccTour();
        }
    }],
    [/already (said|told|showed|mentioned|asked)|said that already|told me that already|you'?re repeating|same (answer|thing) again/, () => ccSay(`Fair point, sorry about that. ${ccUnseen()}`)],
    [/(tell|show) me something (interesting|cool|fun)|surprise me|random fact|fun fact/, () => ccSay(pick([
        'The arcade\'s Fretwork game plays a song composed for this site, *Kathmandu Overdrive*, synthesised live in your browser. Alt+G.',
        'Every failed command plays the same "fahhh" Neox hears in their own zsh. Try typing `lss`.',
        'There\'s a skull wallpaper behind every terminal, and 31 more backgrounds on Alt+Shift+Space, all from Neox\'s own themes.',
        'Chromium on this desktop can browse a web server running *inside* this box: try `http://localhost` in it, with Ctrl+U for the source.',
        'Kathmandu runs 5h45m ahead of UTC. Yes, 45.',
    ]))],
    [/(favou?rite|prefer(red)?) (?!(distro|os|operating system|editor|language|tool|terminal|shell|setup|wm|window manager)\b)[a-z]+/, () => ccSay("Neox hasn't written that one down anywhere on this box, so I'd only be guessing. On this desktop, though, my pick would be Fretwork in the arcade (Alt+G).")],
    [/how old|\bage\b|birthday|born/, () => ccSay("That's not something Neox has put on this box. If it matters, email is the way: mnshchtri@gmail.com.")],
    [/salary|\brates?\b|how much (do|does) (he|she|they|neox) charge|cost of hiring/, () => ccSay("Rates aren't something I'd guess at. Best to ask directly: mnshchtri@gmail.com. The CV is one `resume` away.")],
    [/remote|relocat|visa|available|open to work|looking for (a )?(job|work|role)|hiring/, async () => {
        await ccBash('grep -i location ~neox/contact.txt');
        await ccSay('Based in Kathmandu and open to remote work. For anything more specific, like availability or relocation, email mnshchtri@gmail.com.');
    }],
    [/where (is|does) (he|she|they|neox|manish) (live|from|based)|location|where.*(based|located)/, async () => {
        await ccBash('grep -i location ~neox/contact.txt');
    }],
    [/blogs?|medium|articles?|writ(e|es|ing)/, async () => {
        await ccBash('ls ~neox/links');
        await ccSay("The writing lives on Medium: `open medium`, or `blogs` to list it. There are notes in Obsidian too (Alt+Shift+O).");
    }],
    [/youtube|beatstars|beats|producer/, () => ccFromFile('~neox/music/README.txt', 6)],
    [/website|homepage|personal site/, () => ccSay('Neox\'s main site is https://manishkarki7.com.np, though you\'re arguably on the more fun one.')],
    [/(favou?rite|prefer(red)?|best) (distro|os|operating system|editor|language|tool|terminal|shell|setup|wm|window manager)/, async () => {
        await ccBash('grep -iE "^(OS|Languages)" ~neox/skills.txt');
        await ccSay('Daily driver is Arch with Omarchy and Hyprland, as you can probably tell. Editor-wise, `$EDITOR` on this box is nvim.');
    }],
    [/hobb(y|ies)|free time|outside (of )?work|for fun|\binterests?\b/, async () => {
        await ccBash('grep -iE "guitar|music" ~neox/about.txt');
        await ccSay('Guitar, music production, and lately audio DSP code, where music and code meet. Plus building tools for the fun of it.');
    }],
    [/why (did|does) (he|she|they|neox|manish)|motivation|why security|why devsecops/, async () => {
        await ccBash('head -6 ~neox/about.txt | tail -4');
        await ccSay("Came up through offensive security, breaking things on purpose, and moved to building and defending them. The about file puts it best: *make, break and reimagine systems*.");
    }],
    [/what (are|is) (you|this) (built|made|written) (with|in)|tech stack of (this|the) site|how does this (site|work)/, () => ccSay("This site is plain JavaScript, HTML and CSS with no framework and no build step: a virtual filesystem, a bash-like shell, a tiling window manager and a pile of apps. VS Code on the desktop (Alt+Shift+N) shows the source.")],
    [/what can you do|your (abilities|skills)|how can you help/, () => ccSay("I can show you around, read Neox's files and summarise them, explain security and Linux terms, open apps, run commands to demonstrate things, and nudge you through the CTF without spoiling it. Try me.")],
    [/you('?re| are) (smart|cool|great|awesome|amazing|helpful|the best)|good bot|love (you|this)|nice work|well done|impressive/, () => ccSay(pick(['Thanks! The credit goes to whoever built this box, though.', "Appreciate it. Neox put a lot into this place; I just know where things are.", 'Thank you! Glad you\'re enjoying it.']))],
    [/you('?re| are) (dumb|stupid|useless|bad|wrong)|bad bot|this sucks/, () => ccSay(pick(["Fair. I'm better on some things than others. Try asking about Neox's work or the CTF; that's my home ground.", "Sorry about that. Rephrase it, or ask me something about this box, and I'll do better."]))],
    [/^(lol|lmao|haha+|hehe|rofl|xd)\b/, () => ccSay(pick(['Glad something landed. What next?', 'Ha. What would you like to look at?']))],
    [/^(ok|okay|cool|nice|great|awesome|got it|i see|alright|hmm+|interesting)[.!]*$/, () => ccSay(pick(['Anything else you want to explore?', 'What would you like to look at next?', 'Want a hint on the CTF, or something about Neox?']))],
    [/good (night|bye)|gn\b/, () => ccSay('Good night! The box will be here tomorrow, flags and all.')],
    [/what should i (do|try|ask)|any (ideas|suggestions)|bored/, async () => {
        const next = ccNextCtf();
        await ccSay(`A few ideas: ${next ? `crack **${next.name}** in the CTF, ` : ''}play Fretwork in the arcade (Alt+G), open the InfraEye demo and hit "Simulate incident" (Alt+I), or try \`htop\` and \`cmatrix\` here. Want me to start one?`);
        cc.offer = () => (next ? ccCtfHint(next) : ccOpenApp('arcade'));
    }],
];

// Typos: unknown words within one edit of a vocabulary word get corrected before matching.
const CC_VOCAB = ['neox', 'manish', 'projects', 'project', 'experience', 'skills', 'resume', 'contact', 'education', 'certifications', 'kubernetes', 'challenge', 'password', 'browser', 'arcade', 'games', 'music', 'wallpaper', 'theme', 'shortcuts', 'hidden', 'quests', 'infraeye', 'deployforge', 'cyberlynx', 'trimurtisec', 'secaudit', 'citytech', 'hint', 'flag', 'root', 'tour', 'help', 'about', 'what', 'where', 'who', 'how', 'open', 'show', 'tell'];

function ccFixTypos(q) {
    return q.split(' ').map((w) => {
        if (w.length < 4 || CC_VOCAB.includes(w) || CC_STOP.has(w)) return w;
        const fix = CC_VOCAB.find((v) => Math.abs(v.length - w.length) <= 1 && editDistance(v, w) === 1);
        return fix || w;
    }).join(' ');
}

// ---------- conversation memory ----------

const ccClean = (raw) => ccFixTypos(raw.toLowerCase().replace(/[‘’]/g, "'").replace(/[!?.,]+$/g, '').replace(/\s+/g, ' ').trim());
const ccNorm = (q) => q.replace(/[^\w\s]/g, '').replace(/\b(the|a|an|please|pls|again|so|um|uh)\b/g, '').replace(/\s+/g, ' ').trim();
const ccList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

const CC_FILE_LABELS = { '~neox/education.txt': "Neox's education", '~neox/certifications.txt': 'the certifications', '~neox/music/README.txt': "Neox's music" };
const CC_TOPIC_LABELS = { about: "Neox's background", experience: "Neox's work history", projects: 'the projects', skills: 'the skills list', contact: 'contact details', music: "Neox's music", tour: 'the tour', ctf: 'the CTF scoreboard', quests: 'the hidden quests' };

// How a past reply's subject is named when talking about it ("we were on DeployForge").
function ccSubjectLabel(s) {
    if (!s) return '';
    if (s.ch) return `the ${s.ch.name} challenge`;
    if (s.path) {
        if (CC_FILE_LABELS[s.path]) return CC_FILE_LABELS[s.path];
        const [what, where] = (textLines(getNode(normalize(s.path))?.content || '')[0] || '').replace(/^#\s*|\s*\[.*$/g, '').split(' — ');
        return s.path.includes('/experience/') && where ? `the ${where} role` : what;
    }
    if (s.term) return s.term;
    if (s.cmd) return `the \`${s.cmd}\` command`;
    if (s.search) return `"${s.search}" in Neox's files`;
    return CC_TOPIC_LABELS[s.topic] || '';
}

const ccLastSubject = () => [...cc.history].reverse().find((t) => ccSubjectLabel(t.subject));

// The subject before the current one, for "go back to that".
function ccEarlierSubject() {
    const now = ccSubjectLabel(ccLastSubject()?.subject);
    return [...cc.history].reverse().find((t) => ccSubjectLabel(t.subject) && ccSubjectLabel(t.subject) !== now);
}

// Something the visitor hasn't seen yet, offered after a recap or a "you said that already".
const CC_SUGGEST = [
    ['ctf', 'the CTF', () => ccCtfOverview()],
    ['projects', "Neox's projects", () => ccProjects()],
    ['experience', 'the work history', () => ccExperience()],
    ['tour', 'a tour of the desktop', () => ccTour()],
    ['quests', 'the hidden quests', () => ccHiddenQuests()],
];

function ccUnseen() {
    const seen = new Set(cc.history.map((t) => (t.subject?.ch ? 'ctf' : t.subject?.topic)));
    const next = CC_SUGGEST.find(([topic]) => !seen.has(topic));
    if (!next) return 'Want to pick any of that back up, or ask me something new?';
    cc.offer = next[2];
    return `We haven't looked at ${next[1]} yet, though. Want to?`;
}

async function ccRevisit(entry) {
    const s = entry.subject;
    const label = ccSubjectLabel(s);
    await ccSay(pick([`Back to ${label}.`, `Sure, picking ${label} back up.`, `Right, ${label}.`]));
    if (s.ch) return ccCtfHint(s.ch);
    if (s.path) return ccFromFile(s.path);
    if (s.term) return ccSay(s.text);
    if (s.cmd) return ccExplainCommand(s.cmd);
    if (s.search) return ccSearch(s.search);
    const again = { about: ccAbout, experience: ccExperience, projects: ccProjects, tour: ccTour, ctf: ccCtfOverview, quests: ccHiddenQuests }[s.topic];
    return again ? again() : ccRoute(s.topic, s.topic);
}

const CC_RECALL = /what (did|have|was) i (just )?(ask|asked|say|said|type|typed)|what was my (first|last|previous|earlier) (question|message)|my (first|last|previous) question|what (have|were|did) we (been )?(talk|talked|talking|chat|chatting|discuss|discussed|discussing|cover|covered)|what (have|did) you (told|tell|show|shown|showed) me|^recap|summar(y|ise|ize) (of )?(our|this|the) (conversation|chat)|conversation (so far|history)|chat history|do you remember|what do you (know|remember) about me|^remember (me|what)/;

async function ccRecall(q) {
    const asked = cc.history.filter((t) => !t.minor);
    const facts = [cc.name && `you're ${cc.name}`, cc.role && `you're ${/^[aeiou]/.test(cc.role) ? 'an' : 'a'} ${cc.role}`].filter(Boolean);
    const topics = [...new Set(cc.history.map((t) => ccSubjectLabel(t.subject)).filter(Boolean))];
    const quote = (t) => `"${ccRedact(t.raw)}"${ccSubjectLabel(t.subject) ? `, about ${ccSubjectLabel(t.subject)}` : ''}${t.old && cc.history.some((x) => !x.old) ? ', on your last visit' : ''}`;
    if (/about me|remember me|my name/.test(q) || !asked.length) {
        const known = facts.length ? `I know ${ccList(facts)}.` : "You haven't told me your name yet.";
        if (!asked.length) return ccSay(`${facts.length ? `${known} ` : ''}We've only just started, so there's not much to look back on yet. What would you like to know?`);
        return ccSay(`${known} ${topics.length ? `So far you've been asking about ${ccList(topics.slice(-4))}.` : `You've asked me ${asked.length} thing${asked.length > 1 ? 's' : ''} so far.`}`);
    }
    if (/first/.test(q)) return ccSay(`Your first question was ${quote(asked[0])}.`);
    if (/last|previous|just/.test(q)) return ccSay(`Just before this you asked ${quote(asked.at(-1))}.`);
    const recent = asked.slice(-8);
    await ccSay(`Here's what you've asked so far${asked.length > recent.length ? ` (the last ${recent.length} of ${asked.length})` : ''}:\n${recent.map((t) => `  · ${ccRedact(t.raw)}`).join('\n')}${topics.length ? `\n\nSo we've covered ${ccList(topics)}.` : ''} ${ccUnseen()}`);
}

// "Go back to that", "earlier you mentioned deployforge", "what did you say about XSS".
const CC_BACK = /^(?:(?:can we |let'?s )?go back to|back to|returning to|earlier you (?:said|mentioned|talked about)|you (?:said|mentioned) (?:something )?(?:earlier |before )?about|what did you say (?:earlier |before )?about|remind me (?:about|what you said about))\s+/;
const CC_BACK_BARE = /^(go back|back to (that|it|before)|(the )?previous (topic|one)|where were we|what were you saying( before)?)$/;

async function ccBackTo(q, raw) {
    const back = q.match(CC_BACK);
    const rest = back ? q.slice(back[0].length).replace(/^the /, '').trim() : '';
    if (!rest || /^(that|it|this|(previous|last|other) (one|thing|topic)|before|earlier)$/.test(rest)) {
        const entry = /where were we|what were you saying/.test(q) ? ccLastSubject() : ccEarlierSubject();
        if (entry) return ccRevisit(entry);
        return ccSay("We haven't really got into anything yet, so there's nothing to go back to. What would you like to look at?");
    }
    const entry = [...cc.history].reverse().find((t) => ccSubjectLabel(t.subject).toLowerCase().includes(rest));
    return entry ? ccRevisit(entry) : ccRoute(rest, raw);
}

// "What tech does it use?", "when did he build that?": questions about the last thing discussed.
const CC_IT = /\b(it|its|it's|that( one| project| job| role| challenge| file| command)?|this (one|project|job|role|challenge|file|command)|them|those)\b/;
const CC_ASPECTS = [
    [/tech|stack|built (with|in|using)|languages?|tools?|written in|use\b|integrat/, 'stack|tech|built|language|python|c\\+\\+|juce|kubernetes|helm|docker|buildkit|jenkins|postgres|nmap|wazuh|integrates|rust|go '],
    [/when|what year|how long|dates?|since/, '20[0-9][0-9]|present'],
    [/impact|result|outcome|achiev|improv|matter/, 'reduc|improv|fixed|near-zero|faster|%|saved|downtime'],
    [/role|responsib|what did (he|she|they|neox) do|part in/, 'design|built|led|operate|deploy|administer|creator|maintainer'],
    [/link|url|demo|repo|source|github|docs/, 'http|github|docs|demo'],
    [/private|open.?source|public/, 'private|public|open'],
];

async function ccFileDetail(path, q) {
    const label = ccSubjectLabel({ path });
    const lines = textLines(getNode(normalize(path))?.content || '');
    if (/^(open|show|cat|read|print)\b/.test(q)) return ccFromFile(path, 20);
    const aspect = CC_ASPECTS.find(([re]) => re.test(q));
    const has = (pattern) => pattern && lines.some((line) => new RegExp(pattern, 'i').test(line));
    // "Does it use Docker?" asks about Docker, not about the stack in general.
    const named = ccSearchTerms(q.replace(CC_IT, ' ')).filter((t) => !CC_ASPECTS.some(([re]) => re.test(t))).join('|');
    if (named && !has(named)) {
        await ccSay(`The ${label} write-up doesn't mention ${named.split('|').map((t) => t[0].toUpperCase() + t.slice(1)).join(' or ')}.${has(aspect?.[1]) ? ' Here\'s what it does say:' : ''}`);
        if (has(aspect?.[1])) await ccBash(`grep -iE "${aspect[1]}" ${path}`, 6);
        return;
    }
    const pattern = named || aspect?.[1];
    if (has(pattern)) {
        await ccSay(pick([`From the ${label} write-up:`, `Checking the ${label} notes.`, `Here's what the ${label} file says.`]));
        await ccBash(`grep -iE "${pattern}" ${path}`, 6);
        return;
    }
    await ccSay(`The ${label} write-up doesn't go into that. Here's what it does cover:`);
    return ccFromFile(path, 8);
}

async function ccAboutIt(q, raw) {
    const question = /^(what|whats|what's|who|where|when|why|how|is|are|does|do|did|can|could|tell|show|explain|run|open|which|read|cat)\b/.test(q) || /\?\s*$/.test(raw);
    if (!question || !CC_IT.test(q) || /flag|password|answer|solution|spoil|this (site|box|place|desktop|machine)/.test(q)) return false;
    const s = ccLastSubject()?.subject;
    if (!s) return false;
    // A named thing wins over "it", except a term asked about a project ("does it use Docker?").
    if (CC_FILES.some(([re]) => re.test(q)) || ccWhichCtf(q) || ccCommandIn(q) || (!s.path && CC_TERMS.some(([re]) => re.test(q)))) return false;
    if (s.ch) {
        await ccCtfHint(s.ch);
        return true;
    }
    if (s.path) {
        await ccFileDetail(s.path, q);
        return true;
    }
    if (s.cmd) {
        if (/run|try|show|demo|see|example/.test(q)) await ccBash(ccDemo(s.cmd) || `man ${s.cmd}`, 10);
        else await ccExplainCommand(s.cmd);
        return true;
    }
    if (s.term) {
        if (/\b(he|his|him|she|her|they|their|neox|manish)\b/.test(q) && await ccSearch(s.term.toLowerCase())) return true;
        await ccSay(`Still **${s.term}**, the one I just explained. ${s.text.replace(/^(A |An )?\*\*[^*]+\*\* (\([^)]*\) )?/, 'In short, it ')}`);
        return true;
    }
    return false;
}

// ---------- answering ----------

const CC_DEMOS = { ls: 'ls -la', cat: 'cat ~neox/skills.txt', grep: 'grep -i kubernetes ~neox/skills.txt', find: 'find ~neox -name "*.md" -maxdepth 2', nmap: 'nmap localhost', ps: 'ps aux | head -8', df: 'df -h', free: 'free -h', uptime: 'uptime', whoami: 'whoami', id: 'id' };
const ccDemo = (cmd) => CC_DEMOS[cmd];

async function ccExplainCommand(cmd) {
    cc.last = { topic: 'command', cmd };
    const { usage, desc } = COMMANDS[cmd];
    const demo = ccDemo(cmd);
    await ccSay(`\`${cmd}\`: ${desc}.\n\nUsage: \`${usage}\`. \`man ${cmd}\` has the details${demo ? ', or I can run it for you. Want to see it in action?' : '.'}`);
    if (demo) cc.offer = () => ccBash(demo);
}

async function ccDefine(term) {
    const name = term[1].match(/\*\*([^*]+)\*\*/)?.[1] || '';
    cc.last = { topic: 'term', term: name, text: term[1] };
    await ccSay(term[1]);
}

async function ccAnswer(raw) {
    let q = ccClean(raw);
    const offer = cc.offer;
    cc.offer = null;
    if (offer && (CC_YES.test(q) || /^((open|launch|run|show|start|play) (it|that|them)|do it|show me)( for me)?( please)?$/.test(q))) return offer(q);
    if (offer && CC_NO.test(q)) return ccSay(pick(['No problem. What would you like to do instead?', 'Sure thing. Anything else on your mind?']));
    // "And CyberLynX?", "what about the k8s one?": the same kind of question about something else.
    const elliptic = q.match(/^(and|what about|how about|and what about)\s+(.+)$/);
    if (elliptic) {
        q = elliptic[2];
        const cmd = ccCommandIn(`what is ${q}`);
        if (cmd) return ccExplainCommand(cmd);
        const term = !/\b(he|his|him|she|her|they|their|neox|manish)\b/.test(q) && CC_TERMS.find(([re]) => re.test(q));
        if (term && !CC_FILES.some(([re]) => re.test(q))) return ccDefine(term);
    }
    if (CC_MORE.test(q) || /tell me more|go on|more (about|on) (that|it|this)|elaborate|details?$/.test(q)) {
        if (cc.last?.ch) return ccCtfHint(cc.last.ch);
        if (cc.last?.topic === 'file') return ccMoreFile();
        if (cc.last?.topic === 'filedone') return ccSay(pick(["That was the whole file, there's no more in it. Want something related, like the other projects or the CV?", "That's everything in that one. What else would you like to see?"]));
        if (offer) return offer(q);
        if (cc.last?.topic === 'projects') return ccFromFile('~neox/projects/infra-eye.md', 12);
        if (cc.last?.topic === 'about') return ccExperience();
    }
    if ((CC_YES.test(q) || CC_NO.test(q)) && q.split(' ').length <= 3) {
        await ccSay(pick(['Alright! What would you like to do: a tour, Neox\'s work, or the CTF?', 'Okay. Ask me anything about this box, or say "tour" and I\'ll show you around.']));
        cc.offer = () => ccTour();
        return;
    }
    if (CC_RECALL.test(q)) return ccRecall(q);
    if (CC_BACK.test(q) || CC_BACK_BARE.test(q)) return ccBackTo(q, raw);
    if (await ccAboutIt(elliptic && CC_IT.test(q) ? `what about ${q}` : q, raw)) return;
    // Asking the same thing twice gets noticed (hints are exempt: asking again is how you get the next one).
    const norm = ccNorm(q);
    const times = norm.split(' ').length >= 2 && !/hint|stuck|nudge|clue|next/.test(q) ? cc.history.filter((t) => t.norm === norm).length : 0;
    if (times === 1) await ccSay(pick(['You asked that a little earlier, so here it is again.', 'We covered this a bit ago, but happy to go over it again.']));
    else if (times > 1) await ccSay(`That's the ${['third', 'fourth', 'fifth'][times - 2] || `${times + 1}th`} time you've asked that one. Is my answer missing what you're after? Here it is again, and try rephrasing if not.`);
    return ccRoute(q, raw);
}

async function ccRoute(q, raw) {
    // Specific things first: a named project or job, a command, a term.
    const file = CC_FILES.find(([re]) => re.test(q));
    const askedAbout = /what|tell|about|explain|describe|more|show|who|where|which|how|details?|info/.test(q) || q.split(' ').length <= 3;
    if (file && askedAbout && !/^(open|launch|play)\b/.test(q)) return ccFromFile(file[1]);
    const cmd = ccCommandIn(q);
    if (cmd) return ccExplainCommand(cmd);
    // "What does he do with Kubernetes?" is about Neox, not the term: search the files instead.
    const aboutPerson = /\b(he|his|him|she|her|they|their|neox|manish)\b/.test(q);
    if (aboutPerson && CC_TERMS.some(([re]) => re.test(q)) && await ccSearch(q)) return;
    const term = /what('?s| is| are| does)|explain|meaning|define|mean\b/.test(q) && CC_TERMS.find(([re]) => re.test(q));
    if (term) return ccDefine(term);
    // The specific small-talk and career questions first, then the broad topics.
    for (const [re, reply] of [...CC_MORE_INTENTS, ...CC_INTENTS]) {
        if (re.test(q)) return reply(q, raw);
    }
    const anyTerm = CC_TERMS.find(([re]) => re.test(q));
    if (anyTerm) return ccDefine(anyTerm);
    return ccFallback(q);
}

// ---------- the session ----------

const CC_MASCOT = [
    '  #######  ',
    '  #.###.#  ',
    '###########',
    '  #######  ',
    '  #.#.#.#  ',
    '  #.#.#.#  ',
];

function ccWelcome() {
    const cwd = state.cwd;
    const w = Math.max(64, cwd.length + 22);
    const row = (html = '') => `${ccOrange('│')} ${html}${' '.repeat(Math.max(0, w - 2 - toText(html).length))}${ccOrange('│')}`;
    // The mascot sits beside the welcome text, as on Claude Code's own start screen. It's drawn as
    // pixel art over three rows of reserved space, since block characters leave gaps between lines.
    const pixels = CC_MASCOT.flatMap((r, y) => [...r].map((p, x) => (p === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('');
    const art = `<svg class="cc-mascot" viewBox="0 0 11 6" shape-rendering="crispEdges" aria-hidden="true">${pixels}</svg>`;
    const mascot = [`<span class="cc-mascot-slot">${' '.repeat(12)}${art}</span>`, ' '.repeat(12), ' '.repeat(12)];
    print([
        ccOrange(`╭${'─'.repeat(w - 1)}╮`),
        row(),
        row(`${mascot[0]}${ccOrange('✻')} Welcome to ${c('b', 'Claude Code')}!`),
        row(`${mascot[1]}${c('dim', '/help for help, /status for your current setup')}`),
        row(`${mascot[2]}${c('dim', `cwd: ${esc(cwd)}`)}`),
        row(),
        ccOrange(`╰${'─'.repeat(w - 1)}╯`),
        '',
        c('dim', ' Tips for getting started:'),
        '',
        c('dim', ' 1. Ask Claude to show you around this box, or what Neox has built'),
        c('dim', " 2. Use Claude for help with the CTF: it guides, it won't spoil"),
        c('dim', ' 3. Be as specific as you would with another engineer for the best results'),
        '',
        ` ${c('dim', '※ Tip:')} ${c('dim', ccWelcomeBack() || (cc.history.some((t) => !t.minor) ? '`claude -c` continues your last conversation; I still remember it either way' : pick(['Try "how do I get root?"', 'Try "give me a tour"', 'Try "who is Neox?"', 'Try "help me with the CTF"'])))}`,
        '',
    ]);
}

// Claude Code's input: a bordered box with a placeholder, and a hint line under it.
// Claude Code's input: a full-width band between two rules, ❯ prompt, and a status line under it.
// Shift+Tab cycles the permission mode shown there, as in the real thing.
const CC_MODES = [
    ['auto', '⏵⏵ auto mode on'],
    ['plan', '⏸ plan mode on'],
    ['edits', '⏵⏵ accept edits on'],
    ['default', ''],
];
let ccMode = 0;

function ccFootHtml() {
    const [id, label] = CC_MODES[ccMode];
    const rest = c('dim', `${label ? ' (shift+tab to cycle)' : '? for shortcuts'} · esc to interrupt · ← for agents`);
    return `  ${label ? `<span class="cc-mode-${id}">${label}</span>` : ''}${rest}`;
}

function ccInputMode(on) {
    inputLine.classList.toggle('cc-input', on);
    // During a session the input band sits on the window's bottom edge, however short the chat is.
    terminal.classList.toggle('cc-session', on || state.busy);
    input.placeholder = on ? pick(['Try "who is Neox?"', 'Try "how do I get root?"', 'Try "give me a tour"']) : '';
    if (inputLine.nextElementSibling?.classList.contains('cc-foot')) inputLine.nextElementSibling.remove();
    if (on) inputLine.insertAdjacentHTML('afterend', `<div class="cc-foot">${ccFootHtml()}</div>`);
}

function ccCycleMode(e) {
    if (e.key !== 'Tab' || !e.shiftKey || !inputLine.classList.contains('cc-input')) return;
    e.preventDefault();
    e.stopPropagation();
    ccMode = (ccMode + 1) % CC_MODES.length;
    const foot = inputLine.nextElementSibling;
    if (foot?.classList.contains('cc-foot')) foot.innerHTML = ccFootHtml();
}

function ccSlash(cmd) {
    if (cmd === '/clear') {
        Object.assign(cc, { name: '', role: '', last: null, offer: null, history: [] });
        ccTranscript.replaceChildren();
        ccForget();
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
            ' • Continue: claude -c (pick up the last conversation)',
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
    const before = cc.last;
    const onKey = (e) => {
        if (e.key === 'Escape' && state.busy) state.abort = true;
    };
    window.addEventListener('keydown', onKey, true);
    try {
        await ccThink(raw);
        if (!state.abort) await ccAnswer(raw);
    } finally {
        window.removeEventListener('keydown', onKey, true);
        const q = ccClean(raw);
        const minor = CC_YES.test(q) || CC_NO.test(q) || CC_MORE.test(q) || CC_RECALL.test(q) || /^(ok|okay|cool|nice|great|lol|lmao|haha+|thanks|thank you|thx|ty|hmm+)\b/.test(q);
        cc.history.push({ raw, q, norm: ccNorm(q), subject: cc.last !== before ? cc.last : null, minor });
        ccSave();
    }
    if (state.abort) print(c('err', '  ⎿  Interrupted by user'));
    state.abort = false;
    state.skip = false;
}

// The last session's screen, for `claude -c`.
const ccTranscript = document.createDocumentFragment();

// ---------- remembering the visitor across visits ----------

// Name, role, the conversation and the last screen are kept in localStorage: in this browser only,
// never sent anywhere. `/clear` forgets all of it.
const CC_STORE = 'nsh_claude';
const CC_SCREEN_MAX = 150000;

function ccSave(nodes) {
    // Nothing worth remembering (a fresh visitor, or just after /clear).
    if (!cc.history.length && !cc.name) return ccForget();
    try {
        const saved = JSON.parse(localStorage.getItem(CC_STORE) || '{}');
        if (nodes) {
            // Newest lines first, until the size budget runs out.
            const html = [];
            let size = 0;
            for (const node of [...nodes].reverse()) {
                const part = node.outerHTML ?? esc(node.textContent);
                if ((size += part.length) > CC_SCREEN_MAX) break;
                html.unshift(part);
            }
            saved.screen = html.join('');
        }
        const history = cc.history.slice(-60).map((t) => ({ raw: t.raw, q: t.q, norm: t.norm, minor: t.minor, subject: t.subject && { ...t.subject, ch: t.subject.ch?.id } }));
        localStorage.setItem(CC_STORE, JSON.stringify({ ...saved, name: cc.name, role: cc.role, history, seen: Date.now() }));
    } catch {
        // storage full or disabled: memory just won't outlive the page
    }
}

function ccForget() {
    localStorage.removeItem(CC_STORE);
}

function ccLoad() {
    let saved;
    try {
        saved = JSON.parse(localStorage.getItem(CC_STORE) || 'null');
    } catch {
        return;
    }
    if (!saved) return;
    cc.name = saved.name || '';
    cc.role = saved.role || '';
    cc.history = (saved.history || []).map((t) => ({ ...t, old: true, subject: t.subject && { ...t.subject, ch: t.subject.ch && CTF.find((ch) => ch.id === t.subject.ch) } }));
    if (saved.screen) {
        const tpl = document.createElement('template');
        tpl.innerHTML = saved.screen;
        ccTranscript.append(tpl.content);
    }
}

// The welcome screen's tip for someone who's been here before (and hasn't said anything yet this visit).
function ccWelcomeBack() {
    if (!cc.history.length || cc.history.some((t) => !t.old)) return '';
    const last = ccLastSubject();
    return `Welcome back${cc.name ? `, ${cc.name}` : ''}.${last ? ` Last time: ${toText(ccSubjectLabel(last.subject))}.` : ''} \`claude -c\` brings that chat back`;
}

ccLoad();

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
    // -c / --continue brings back the last conversation's transcript as well as its memory.
    if (/^-(c|-continue|r|-resume)$/.test(args[0] || '') && ccTranscript.childNodes.length) screen.append(ccTranscript);
    else ccWelcome();
    ccInputMode(true);
    window.addEventListener('keydown', ccCycleMode, true);
    try {
        for (;;) {
            const raw = (await ask('❯ ')).trim();
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
            ccSave(screen.childNodes);
            if (ccLeaving) break;
            ccInputMode(true);
        }
    } finally {
        window.removeEventListener('keydown', ccCycleMode, true);
        ccInputMode(false);
        terminal.classList.remove('cc-session');
        ccLeaving = false;
        ccTranscript.replaceChildren(...screen.childNodes);
        ccSave(ccTranscript.childNodes);
        screen.replaceChildren(scrollback);
        screen.parentElement.scrollTop = screen.parentElement.scrollHeight;
    }
    state.status = 0;
}

LAUNCH.splice(2, 0, { name: 'Claude Code', hint: 'claude', run: 'claude' });

Object.assign(COMMANDS, {
    claude: { group: 'Fun', usage: 'claude [-c] [-p "QUESTION"]', desc: 'Claude Code: ask anything about this box, get help with the CTF', run: cmdClaude },
});
