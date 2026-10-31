'use strict';

// `claude`: a scripted guide in the style of Claude Code, for visitors who don't know where to start.
// It answers from a fixed set of topics (no AI, no network), runs harmless commands on this box to show
// people around, opens apps, and nudges through the CTF one hint at a time. It never prints a flag or
// the root password; that rule lives in spoilerReply and in which commands it is willing to run.

const CC_VERBS = ['Pondering', 'Enumerating', 'Grepping', 'Spelunking', 'Reticulating', 'Decoding', 'Tracing', 'Moseying', 'Hacking (ethically)', 'Consulting the man pages'];
const CC_SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const ccOrange = (html) => `<span class="cc-orange">${html}</span>`;
const ccCode = (cmd) => c('exe', esc(cmd));

// A line the guide is writing, revealed a few words at a time like streamed output.
async function ccSay(text, { bullet = true } = {}) {
    const div = document.createElement('div');
    div.className = 'line cc-msg';
    output.appendChild(div);
    const html = text.replace(/`([^`]+)`/g, (_, code) => ccCode(code)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const words = html.split(/(?<=\s)(?![^<]*>)/);
    const head = bullet ? `${c('cc-dot', '●')} ` : '  ';
    for (let i = 1; i <= words.length; i += 3) {
        div.innerHTML = head + words.slice(0, i).join('');
        terminal.scrollTop = terminal.scrollHeight;
        await sleep(14);
        if (state.abort) break;
    }
    div.innerHTML = head + html;
    terminal.scrollTop = terminal.scrollHeight;
}

async function ccThink() {
    const div = document.createElement('div');
    div.className = 'line';
    output.appendChild(div);
    const verb = CC_VERBS[Math.floor(Math.random() * CC_VERBS.length)];
    const steps = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < steps && !state.abort && !state.skip; i++) {
        div.innerHTML = `${ccOrange(CC_SPIN[i % CC_SPIN.length])} ${ccOrange(`${verb}…`)} ${c('dim', '(ctrl+c to interrupt)')}`;
        terminal.scrollTop = terminal.scrollHeight;
        await new Promise((r) => setTimeout(r, 110));
    }
    div.remove();
}

// Runs a real command on this box and shows it as a tool call, output indented under it.
async function ccBash(cmd, maxLines = 10) {
    print(`${c('ok', '●')} ${c('hl', 'Bash')}(${esc(cmd)})`);
    const box = document.createElement('div');
    const saved = output;
    const status = state.status;
    output = box;
    try {
        await runLine(cmd);
    } finally {
        if (output === box) output = saved;
        state.status = status;
    }
    const lines = [...box.children];
    const shown = lines.slice(0, maxLines);
    shown.forEach((line, i) => {
        line.classList.add('cc-out');
        line.innerHTML = `${c('dim', i ? '   ' : '  ⎿')} ${line.innerHTML}`;
        output.appendChild(line);
    });
    if (!lines.length) print(c('dim', '  ⎿  (no output)'));
    if (lines.length > maxLines) print(c('dim', `     … +${lines.length - maxLines} lines (run it yourself to see everything)`));
    terminal.scrollTop = terminal.scrollHeight;
}

// Opening an app ends the session: windows can't take focus while a command runs, and the visitor
// wants to use what just opened. `claude` brings the guide back.
let ccLeaving = false;
function ccOpen(label, open) {
    print(`${c('ok', '●')} ${c('hl', 'Open')}(${esc(label)})`);
    print(c('dim', '  ⎿  opened next to this terminal; switching to it'));
    open();
    ccLeaving = true;
}

// ---------- what the guide knows ----------

const ccMainCtf = () => CTF.filter((ch) => !ch.hidden);
const ccNextCtf = () => ccMainCtf().find((ch) => !ctfSolved()[ch.id]);

// Which challenge a question is about, by number or by the words people use for it.
const CC_CTF_WORDS = {
    dotfiles: /dotfile|hidden file|\.secret|recon|warm ?up|first (flag|challenge)|challenge 1|#1\b/,
    web: /web|robots|staging|nginx|localhost|website|disallow|challenge 2|#2\b/,
    knock: /knock|port|1337|31337|nc\b|netcat|network|challenge 3|#3\b/,
    k8s: /k8s|kube|kubernetes|kubectl|rbac|secret service|cluster|cloud|challenge 4|#4\b/,
    dfir: /forensic|intrud|cron|persist|implant|auth\.log|log|wazuh|incident|dfir|malware|challenge 5|#5\b/,
    root: /root|privesc|privilege|sudo|escalat|password|su\b|challenge 6|#6\b/,
};

function ccWhichCtf(q) {
    const n = q.match(/\b(?:challenge|flag|number|no\.?)\s*([1-6])\b/) || q.match(/^\s*([1-6])\s*$/);
    if (n) return ccMainCtf()[Number(n[1]) - 1];
    const id = Object.keys(CC_CTF_WORDS).find((k) => CC_CTF_WORDS[k].test(q));
    return id ? CTF.find((ch) => ch.id === id) : null;
}

// The first nudge for each challenge also runs one safe, non-spoiling command to point the way.
const CC_FIRST_LOOK = {
    dotfiles: 'ls ~neox',
    web: 'nmap localhost',
    knock: 'nc localhost 1337',
    k8s: 'kubectl get secrets',
    dfir: "grep -c 'Failed password' /var/log/auth.log",
    root: 'id',
};

async function ccCtfHint(ch) {
    const solved = ctfSolved();
    if (solved[ch.id]) {
        const next = ccNextCtf();
        await ccSay(`You've already captured **${esc(ch.name)}**. ${next ? `Next up is ${ccMainCtf().indexOf(next) + 1}. **${esc(next.name)}** (${next.cat}): ask me about it whenever you like.` : 'All six main flags are yours. Only hidden quests left.'}`);
        return;
    }
    const n = Math.min((ctfHintsSeen[ch.id] = (ctfHintsSeen[ch.id] || 0) + 1), ch.hints.length);
    const i = ccMainCtf().indexOf(ch) + 1;
    if (n === 1) await ccSay(`**${esc(ch.name)}** (challenge ${i}, ${ch.cat}, ${ch.pts} pts): ${esc(ch.brief).replace(/`([^`]+)`/g, '$1')}`);
    if (n === 1 && CC_FIRST_LOOK[ch.id]) {
        await ccSay("Let's look before we touch anything:");
        await ccBash(CC_FIRST_LOOK[ch.id]);
    }
    await ccSay(`Hint ${n}/${ch.hints.length}: ${ch.hints[n - 1]}`);
    await ccSay(n < ch.hints.length
        ? c('dim', 'Ask for another hint if you need it. I\'ll never hand over the flag itself, that\'s the fun part.')
        : c('dim', `That's every hint I have for this one. Once you've got it: ${ccCode('ctf submit flag{...}')}`), { bullet: false });
}

async function ccCtfOverview() {
    const solved = ctfSolved();
    const score = ctfScore(solved);
    const done = ccMainCtf().filter((ch) => solved[ch.id]).length;
    const next = ccNextCtf();
    await ccSay(`This box is a capture-the-flag: six challenges, each a small real attack path (recon, web, network, cloud, forensics, privesc), plus four hidden quests. You've captured **${done}/6** and have **${score}/${CTF_TOTAL}** pts (rank: ${esc(ctfRank(score))}).`);
    if (next) {
        await ccSay(`Next up: **${ccMainCtf().indexOf(next) + 1}. ${esc(next.name)}**. ${esc(next.brief).replace(/`([^`]+)`/g, '$1')}`);
        await ccSay(`Say "hint" and I'll nudge you. The scoreboard is ${ccCode('ctf')} here, or ${ccCode('http://ctf.neox')} in Chromium (Alt+B).`);
    } else {
        await ccSay(`Every main flag is yours. ${score < CTF_TOTAL ? 'Hidden quests remain: ask me about "hidden quests".' : 'And every hidden quest. Run `ctf` for your certificate.'}`);
    }
}

async function ccHiddenQuests() {
    const open = CTF.filter((ch) => ch.hidden && !ctfSolved()[ch.id]);
    if (!open.length) return ccSay('You found every hidden quest. Respect.');
    await ccSay(`I'm sworn to secrecy on these, but here are the clues for the ${open.length} you haven't found:`);
    for (const ch of open) print(`  ${c('dim', '?')} ${esc(ch.clue)}`);
}

async function spoilerReply(q) {
    await ccSay(/password/.test(q)
        ? "I won't hand out the root password. Finding it is the whole point, and it's very findable. Here's a nudge instead:"
        : 'I could, but then the flag would be worth nothing. Guiding, not spoiling. Here\'s a nudge instead:');
    await ccCtfHint(ccWhichCtf(q) || ccNextCtf() || CTF.find((ch) => ch.id === 'root'));
}

async function ccTour() {
    await ccSay("Here's the lay of the land. This whole site is a Linux desktop modelled on Neox's own (Omarchy on Hyprland):");
    print([
        `   ${c('y', 'Terminal')}    real-feeling shell: ${ccCode('ls -la')}, ${ccCode('cat README.md')}, ${ccCode('htop')}, ${ccCode('vim')}. Alt+Enter opens another.`,
        `   ${c('y', 'Portfolio')}   ${ccCode('whois')}, ${ccCode('experience')}, ${ccCode('projects')}, ${ccCode('skills')}, or the ${ccCode('resume')} (Hire me, top bar).`,
        `   ${c('y', 'Apps')}        Alt+B Chromium · Alt+E Files · Alt+Shift+N VS Code · Alt+Shift+O Obsidian · Alt+I InfraEye`,
        `   ${c('y', 'Play')}        Alt+G arcade (7 games) · ${ccCode('ctf')} the hacking challenge · Alt+Shift+Space wallpapers`,
        `   ${c('y', 'Windows')}     they tile like Hyprland: Alt+Arrows to move focus, Alt+1..9 workspaces, Alt+F fullscreen`,
    ]);
    await ccSay('Ask me about any of it, or say "help me with the CTF" to start hacking.');
}

async function ccAbout() {
    await ccSay("Neox is Manish Karki, a DevSecOps engineer in Kathmandu who came up through offensive security. Let me read the source rather than paraphrase:");
    await ccBash('head -8 ~neox/about.txt', 8);
    await ccSay(`More: ${ccCode('experience')}, ${ccCode('projects')}, ${ccCode('skills')}. In a hurry? ${ccCode('resume')} opens the one-page CV.`);
}

// Ordered: the first topic whose pattern matches answers. Each gets the lower-cased question.
const CC_TOPICS = [
    [/flag\{[^}]*\}/, async (q, raw) => {
        const flag = raw.match(/flag\{[^}]*\}/)[0];
        await ccSay('That looks like a flag. Submitting it:');
        await ccBash(`ctf submit ${flag}`);
    }],
    [/(give|tell|show|send|what'?s|what is|reveal|leak|need)\b.*\b(flag|answer|solution|root password|password)|spoil|cheat/, (q) => spoilerReply(q)],
    [/^(hi|hello|hey|yo|namaste|sup|hiya|howdy|good (morning|evening|afternoon))[!.,\s]*(there|claude)?[!.\s]*$/, async () => {
        await ccSay('Hey! I\'m the guide on this box. I can show you around, tell you about Neox, or help you hack the CTF without spoiling it.');
        await ccSay(`Try: "give me a tour", "who is Neox?", "help me with the CTF", or "how do I open the browser?"`);
    }],
    [/(who|what) are you|are you (real|claude|an? ai|chatgpt|human)|real claude|which model|api key|is this ai/, async () => {
        await ccSay("I'm a scripted guide in the style of Claude Code, not the real Claude. No AI and no network calls: every answer is written into this site's source and runs in your browser, so nothing you type here leaves it.");
        await ccSay(`The real thing lives at https://claude.com/claude-code. Neox uses it; this is a tribute.`);
    }],
    [/^(thanks|thank you|thx|ty|cheers)\b/, () => ccSay('Anytime. Type /exit when you\'re done, or keep asking.')],
    [/tour|where (do|should) i (start|begin)|what can i do|lost|getting started|show me around|what is this|what's this/, () => ccTour()],
    [/hidden quest|easter egg|secret quest|\?\?\?/, () => ccHiddenQuests()],
    [/hint|stuck|how (do|can) i (solve|get|find|crack|capture)|next step|help me with|nudge|clue|where is the flag|how to (solve|get)/, async (q) => {
        if (/^(help me with )?(the )?ctf\??$/.test(q)) return ccCtfOverview();
        const ch = ccWhichCtf(q) || ccNextCtf();
        if (!ch) return ccSay('All six main flags are captured. Ask me about "hidden quests" for the rest.');
        await ccCtfHint(ch);
    }],
    [/\bctf\b|capture the flag|challenge|flags?\b|hack|score|points|rank|scoreboard/, async (q) => {
        const ch = ccWhichCtf(q);
        if (ch && /about|what|explain|tell/.test(q)) return ccCtfHint(ch);
        await ccCtfOverview();
    }],
    [/who is|about (neox|manish)|^(neox|manish)\??$|who (made|built|owns|created)|author|owner|whose (site|portfolio)/, () => ccAbout()],
    [/experience|work(ed)?\b|job|career|citytech|employ/, async () => {
        await ccSay("Here's the work history, newest first:");
        await ccBash('grep -h ^# ~neox/experience/*');
        await ccSay(`${ccCode('experience')} prints the details, or open the ${ccCode('resume')}.`);
    }],
    [/project|built|infra ?eye|deployforge|portfolio|github|repo/, async () => {
        await ccSay('These are the projects, straight from ~/projects:');
        await ccBash('projects', 12);
        await ccSay(`InfraEye has a live demo on this desktop: Alt+I or ${ccCode('infraeye')}. Public repos: ${ccCode('gh repo list')}.`);
    }],
    [/skill|stack|tech|tools?\b|language|know/, async () => {
        await ccBash('head -9 ~neox/skills.txt', 9);
        await ccSay(`Full list: ${ccCode('skills')}. Certifications: ${ccCode('certs')}.`);
    }],
    [/hire|cv\b|resume|résumé|job offer|recruit|interview/, async () => {
        ccOpen('Résumé', () => openResume({ fromCommand: true }));
        await ccSay('There it is, the one-page CV. "Download PDF" saves it; the Hire me button in the top bar opens it any time.');
    }],
    [/contact|email|mail|reach|linkedin|twitter|\bx\b|social/, async () => {
        await ccBash('contact');
        await ccSay(`Links live in ~/links too: ${ccCode('open linkedin')}, ${ccCode('open github')}.`);
    }],
    [/(open|launch|start|show).*(browser|chromium|chrome|internet)|^(browser|chromium)$|ctf\.neox|website/, async () => {
        ccOpen('Chromium → ctf.neox', () => openApp(browserApp('http://ctf.neox/'), { fromCommand: true }));
        await ccSay('Chromium is open on the CTF scoreboard. Alt+B opens it any time. Big sites like GitHub refuse to load inside another page, so those pop out into a real tab.');
    }],
    [/browser|chromium|internet|surf/, () => ccSay(`Alt+B opens Chromium, or ${ccCode('chromium wiki.archlinux.org')}. Say "open the browser" and I'll do it.`)],
    [/(open|launch|start|show).*(game|arcade)|^(games?|arcade|play)$/, async () => {
        ccOpen('Neox Arcade', () => openApp(arcadeApp(), { fromCommand: true }));
        await ccSay('Seven original games. Fretwork has a full band playing; Night Shift is build-by-day, defend-by-night. Alt+G opens the arcade any time.');
    }],
    [/game|arcade|play|fun|bored/, () => ccSay(`Alt+G opens Neox Arcade: Packet Snake, Firewall, Riff Runner, Night Shift, Patch Panel, Drone Drop and Fretwork. In the terminal: ${ccCode('bruteforce')}, ${ccCode('cmatrix')}, ${ccCode('sl')}, ${ccCode('fortune | cowsay')}.`)],
    [/vs ?code|code editor|source( code)?|editor|how (is|was) (this|the site) (built|made)/, async () => {
        ccOpen('VS Code', () => openApp(vscodeApp(), { fromCommand: true }));
        await ccSay("That's this site's own source, plain JavaScript with no build step. Alt+Shift+N opens it again. (Yes, the CTF answers are in there, scrambled. Reading them would be cheating, and also hard.)");
    }],
    [/obsidian|notes?\b|vault|blog|writing/, async () => {
        ccOpen('Obsidian', () => openApp(obsidianApp(), { fromCommand: true }));
        await ccSay('The Neox Vault: notes on security, DevOps and music, with a graph view. Alt+Shift+O opens it.');
    }],
    [/infra ?eye|monitor|observab|dashboard/, async () => {
        ccOpen('InfraEye', () => openApp(infraEyeApp(), { fromCommand: true }));
        await ccSay('A demo of InfraEye with simulated data. Try "Simulate incident" on the Alerts page to watch it heal itself.');
    }],
    [/music|song|guitar|beats?|spotify|youtube/, async () => {
        await ccBash('cat ~neox/music/README.txt', 8);
        await ccSay('Alt+M opens Neox Music.');
    }],
    [/files?|folder|explorer|nautilus|directory/, async () => {
        await ccSay(`Alt+E opens Files. In the terminal: ${ccCode('ls -la')}, ${ccCode('tree')}, ${ccCode('cd projects')}. Dotfiles hide from plain ls, by the way.`);
    }],
    [/wallpaper|background/, () => ccSay(`Alt+Shift+Space opens the background switcher (31 wallpapers from Neox's own themes), Alt+Ctrl+Space jumps to the next one, or ${ccCode('wallpaper list')}.`)],
    [/theme|colou?r|dark|light/, async () => {
        await ccBash('theme list');
        await ccSay(`${ccCode('theme NAME')} switches, ${ccCode('theme next')} cycles. It's remembered next visit.`);
    }],
    [/shortcut|keybind|keys|hotkey|keyboard/, async () => {
        await ccBash('keybinds');
        await ccSay('Plus Alt+B browser, Alt+E files, Alt+G games, Alt+I InfraEye, Alt+Shift+N VS Code, Alt+Shift+O Obsidian. Alt stands in for Super, which your OS keeps.');
    }],
    [/window|tile|tiling|workspace|fullscreen|full screen|close|move/, () => ccSay('Windows tile like Hyprland. Alt+Enter: new terminal. Alt+Arrows: move focus. Alt+1..9: workspaces (Alt+Shift+1..9 moves a window). Alt+F: fullscreen. Alt+W: close.')],
    [/command|what can i (type|run)|linux|shell|bash|terminal/, async () => {
        await ccSay(`It's a bash-like shell with pipes, redirects, globs and aliases. ${ccCode('help')} lists every command, ${ccCode('man CMD')} explains one. Some favourites:`);
        print(`   ${['ls -la', 'cat README.md', 'htop', 'vim notes.txt', 'nmap localhost', 'kubectl get pods -A', 'weather', 'gh repo list', 'neofetch'].map(ccCode).join('  ')}`);
    }],
    [/xss|vuln|bug bounty|real (hack|exploit)|hack (this|the) (site|website)|security issue|disclos/, () => ccSay('Found a real issue with the site itself? Responsible disclosure, please: mnshchtri@gmail.com. (This box\'s CTF is the place to break things on purpose.)')],
    [/weather/, async () => {
        await ccBash('weather', 8);
    }],
];

async function ccAnswer(raw) {
    const q = raw.toLowerCase().trim();
    for (const [re, reply] of CC_TOPICS) {
        if (re.test(q)) return reply(q, raw);
    }
    const next = ccNextCtf();
    await ccSay("I'm a scripted guide, so I only know this box. Things I can help with:");
    print([
        `   ${c('dim', '›')} "give me a tour"`,
        `   ${c('dim', '›')} "who is Neox?" · "projects" · "open the resume"`,
        `   ${c('dim', '›')} ${next ? `"hint for ${esc(next.name.toLowerCase())}"` : '"hidden quests"'} · "how does the CTF work?"`,
        `   ${c('dim', '›')} "open the browser" · "shortcuts" · "play a game"`,
    ]);
}

function ccWelcome() {
    const w = 58;
    const row = (html = '') => `${ccOrange('│')} ${html}${' '.repeat(Math.max(0, w - 2 - toText(html).length))}${ccOrange('│')}`;
    const cwd = tildify(state.cwd);
    print([
        ccOrange(`╭${'─'.repeat(w - 1)}╮`),
        row(`${ccOrange('✻')} Welcome to ${c('hl', 'Claude Code')} ${c('dim', '(simulated)')}`),
        row(),
        row(c('dim', '/help for help · /exit or Ctrl+C to leave')),
        row(),
        row(c('dim', `cwd: ${esc(cwd)}`)),
        ccOrange(`╰${'─'.repeat(w - 1)}╯`),
        '',
        ' Tips for getting started:',
        '',
        ` 1. Ask for a tour, or who Neox is and what Neox has built`,
        ` 2. Ask for help with the CTF: I'll guide, not spoil`,
        ` 3. Ask how to get around: browser, games, themes, shortcuts`,
        '',
        c('dim', ' ※ A scripted guide on this portfolio, not the real Claude. No AI, nothing leaves your browser.'),
        '',
    ]);
}

async function cmdClaude({ args }) {
    if (args[0] === '--version' || args[0] === '-v') return ['2.1.0 (Claude Code, simulated)'];
    const oneShot = args.filter((a) => !a.startsWith('-')).join(' ').trim();
    if (oneShot) {
        // `claude "question"` answers once and exits, like `claude -p`.
        await ccThink();
        if (!state.abort) await ccAnswer(oneShot);
        ccLeaving = false;
        return;
    }
    ccWelcome();
    for (;;) {
        const raw = (await ask('> ')).trim();
        if (state.abort) {
            state.abort = false;
            state.skip = false;
            break;
        }
        if (!raw) continue;
        const cmd = raw.toLowerCase();
        if (['/exit', '/quit', 'exit', 'quit', 'q', 'bye', 'goodbye'].includes(cmd)) {
            print(c('dim', '  Bye! Type claude any time.'));
            break;
        }
        if (cmd === '/clear') {
            output.innerHTML = '';
            continue;
        }
        if (cmd === '/help' || cmd === '?') {
            print([
                ` ${c('hl', 'Ask anything about this box.')} Slash commands:`,
                `   ${ccCode('/tour')}     the lay of the land`,
                `   ${ccCode('/ctf')}      your CTF progress and what's next`,
                `   ${ccCode('/hint')}     a nudge on your next challenge`,
                `   ${ccCode('/clear')}    clear the screen`,
                `   ${ccCode('/exit')}     back to the shell (or Ctrl+C)`,
            ]);
            continue;
        }
        const slash = { '/tour': 'tour', '/ctf': 'ctf', '/hint': 'hint' }[cmd];
        if (cmd.startsWith('/') && !slash) {
            print(c('err', `  Unknown command: ${esc(raw)}. Try /help.`));
            continue;
        }
        print('');
        await ccThink();
        if (state.abort) {
            // Ctrl+C while thinking interrupts the answer, not the session.
            state.abort = false;
            state.skip = false;
            print(c('dim', '  ⎿  Interrupted by user'));
            continue;
        }
        await ccAnswer(slash || raw);
        state.abort = false;
        state.skip = false;
        print('');
        if (ccLeaving) {
            print(c('dim', '  Leaving the guide so you can use it. Type claude to come back.'));
            break;
        }
    }
    ccLeaving = false;
    state.status = 0;
}

LAUNCH.splice(2, 0, { name: 'Claude Code (guide)', hint: 'claude', run: 'claude' });

Object.assign(COMMANDS, {
    claude: { group: 'Fun', usage: 'claude ["QUESTION"]', desc: 'a Claude Code-style guide: tours, help with the CTF, how to get around', run: cmdClaude },
});
