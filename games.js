'use strict';

// Neox Arcade: three original retro games on a tiny pixel canvas — Packet Snake, Firewall and
// Riff Runner — plus `bruteforce`, a code-breaking game that runs in the terminal.

const AW = 240;
const AH = 180;
const STEP = 1000 / 60;
const rint = (n) => Math.floor(Math.random() * n);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A fixed, punchy palette so games look retro whatever the desktop theme; the player uses the accent.
const PAL = {
    bg: '#06080c', panel: '#10151d', fg: '#f2f2f2', dim: '#3a4150',
    red: '#ff4d6d', darkred: '#7a1f2e', green: '#7cff6b', yellow: '#ffd23f',
    cyan: '#4de1ff', magenta: '#c77dff', skin: '#f2c9a0', wood: '#2a1d14', fret: '#8a7356',
};
const accentColor = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4b8ef4';

// 3×5 pixel font.
const ARCADE_FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010',
    9: '010101011001110', ' ': '000000000000000', ':': '000010000010000', '!': '010010010000010', '-': '000000111000000',
    '.': '000000000000010', '/': '001001010100100', '?': '110001010000010', '>': '100010001010100', '<': '001010100010001',
    '=': '000111000111000', '+': '000010111010000', '(': '010100100100010', ')': '010001001001010', ',': '000000000010100',
    "'": '010010000000000', '*': '000101010101000',
};

function pixelText(ctx, str, x, y, color, scale = 1, align = 'left') {
    const text = String(str).toUpperCase();
    const width = text.length * 4 * scale - scale;
    if (align === 'center') x -= Math.floor(width / 2);
    else if (align === 'right') x -= width;
    ctx.fillStyle = color;
    for (const ch of text) {
        const glyph = ARCADE_FONT[ch];
        if (glyph) for (let i = 0; i < 15; i++) if (glyph[i] === '1') ctx.fillRect(x + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale);
        x += 4 * scale;
    }
}

// Sprites are string maps; each character picks a colour from `colors`, '.' is transparent.
function sprite(ctx, map, x, y, colors) {
    x = Math.round(x);
    y = Math.round(y);
    map.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
            const col = colors[row[i]];
            if (!col) continue;
            ctx.fillStyle = col;
            ctx.fillRect(x + i, y + j, 1, 1);
        }
    });
}

// ---------- sound ----------

const SFX = {
    eat: [[660, 0.05], [880, 0.06]], die: [[300, 0.1], [200, 0.12], [110, 0.28]], alarm: [[520, 0.08], [390, 0.08], [520, 0.08]],
    shoot: [[900, 0.025]], hit: [[220, 0.04]], boom: [[140, 0.14, 'sawtooth']], power: [[523, 0.06], [659, 0.06], [784, 0.1]],
    jump: [[440, 0.04], [620, 0.05]], note: [[988, 0.05], [1318, 0.08]], start: [[392, 0.08], [523, 0.08], [659, 0.12]],
    wave: [[659, 0.08], [784, 0.12]], select: [[700, 0.03]], gold: [[784, 0.05], [988, 0.05], [1318, 0.1]],
};
let audioCtx = null;
let arcadeMuted = localStorage.getItem('nsh_arcade_muted') === '1';
const soundOff = () => arcadeMuted || !!barEl.querySelector('.bar-audio')?.classList.contains('muted');

function playSfx(name) {
    if (soundOff() || !SFX[name]) return;
    try {
        audioCtx ??= new AudioContext();
        let t = audioCtx.currentTime;
        for (const [freq, dur, type = 'square'] of SFX[name]) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.035, t);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + dur);
            t += dur;
        }
    } catch {
        // No audio available; the games work silently.
    }
}

// ---------- Packet Snake ----------

const PACKET_SNAKE = {
    id: 'snake',
    cmd: 'packet-snake',
    name: 'Packet Snake',
    blurb: 'Route a packet through the network. Eat data, grab gold root shells, and dodge the firewalls that go up as you grow. Edges wrap.',
    controls: 'ARROWS / WASD  -  SWIPE ON TOUCH',
    create(api) {
        const COLS = 30;
        const ROWS = 21;
        const CELL = 8;
        const TOP = 12;
        const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
        let body = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
        let dir = DIRS.right;
        const queue = [];
        const walls = new Set();
        let food = null;
        let gold = null;
        let score = 0;
        let eaten = 0;
        let tick = 0;
        let over = false;
        let grow = 0;
        const key = (p) => `${p.x},${p.y}`;
        const occupied = (p) => walls.has(key(p)) || body.some((b) => b.x === p.x && b.y === p.y)
            || (food && food.x === p.x && food.y === p.y) || (gold && gold.x === p.x && gold.y === p.y);
        const free = () => {
            for (;;) {
                const p = { x: rint(COLS), y: rint(ROWS) };
                if (!occupied(p)) return p;
            }
        };
        food = free();

        function addFirewall() {
            const head = body[0];
            for (let tries = 0; tries < 60; tries++) {
                const p = free();
                const horiz = Math.random() < 0.5;
                const cells = Array.from({ length: 2 + rint(3) }, (_, i) => ({ x: (p.x + (horiz ? i : 0)) % COLS, y: (p.y + (horiz ? 0 : i)) % ROWS }));
                if (cells.some((cl) => occupied(cl) || Math.abs(cl.x - head.x) + Math.abs(cl.y - head.y) < 6)) continue;
                cells.forEach((cl) => walls.add(key(cl)));
                return;
            }
        }

        return {
            get score() { return score; },
            get over() { return over; },
            update(inp) {
                for (const d of ['up', 'down', 'left', 'right']) if (inp.pressed.has(d) && queue.length < 3) queue.push(d);
                if (++tick < Math.max(3, 8 - Math.floor(eaten / 4))) return;
                tick = 0;
                while (queue.length) {
                    const nd = DIRS[queue.shift()];
                    if (nd[0] === -dir[0] && nd[1] === -dir[1]) continue;
                    if (nd !== dir) {
                        dir = nd;
                        break;
                    }
                }
                const head = { x: (body[0].x + dir[0] + COLS) % COLS, y: (body[0].y + dir[1] + ROWS) % ROWS };
                if (walls.has(key(head)) || body.slice(0, -1).some((b) => b.x === head.x && b.y === head.y)) {
                    over = true;
                    return api.sfx('die');
                }
                body.unshift(head);
                if (head.x === food.x && head.y === food.y) {
                    score += 10;
                    eaten++;
                    grow += 1;
                    api.sfx('eat');
                    food = free();
                    if (eaten % 5 === 0) {
                        addFirewall();
                        api.sfx('alarm');
                    }
                    if (!gold && Math.random() < 0.3) gold = { ...free(), ttl: 45 };
                }
                if (gold && head.x === gold.x && head.y === gold.y) {
                    score += 50;
                    gold = null;
                    api.sfx('gold');
                }
                if (gold && --gold.ttl <= 0) gold = null;
                if (grow > 0) grow--;
                else body.pop();
            },
            draw(ctx, frame) {
                ctx.fillStyle = PAL.panel;
                for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) ctx.fillRect(x * CELL + 3, TOP + y * CELL + 3, 2, 2);
                for (const k of walls) {
                    const [x, y] = k.split(',').map(Number);
                    const px = x * CELL;
                    const py = TOP + y * CELL;
                    ctx.fillStyle = PAL.red;
                    ctx.fillRect(px, py, CELL, CELL);
                    ctx.fillStyle = PAL.darkred;
                    ctx.fillRect(px, py + 3, CELL, 1);
                    ctx.fillRect(px, py + 7, CELL, 1);
                    ctx.fillRect(px + 3, py, 1, 3);
                    ctx.fillRect(px + 6, py + 4, 1, 3);
                }
                ctx.fillStyle = PAL.cyan;
                ctx.fillRect(food.x * CELL + 1, TOP + food.y * CELL + 1, 6, 6);
                ctx.fillStyle = PAL.bg;
                ctx.fillRect(food.x * CELL + 3, TOP + food.y * CELL + 3, 2, 2);
                if (gold && (gold.ttl > 12 || frame % 10 < 5)) {
                    sprite(ctx, ['..#..', '.###.', '#####', '.###.', '..#..'], gold.x * CELL + 1.5, TOP + gold.y * CELL + 1.5, { '#': PAL.yellow });
                }
                const accent = accentColor();
                body.forEach((b, i) => {
                    ctx.fillStyle = i === 0 ? PAL.fg : i % 2 ? accent : PAL.cyan;
                    ctx.fillRect(b.x * CELL + 1, TOP + b.y * CELL + 1, 6, 6);
                });
                const h = body[0];
                ctx.fillStyle = PAL.bg;
                const ex = h.x * CELL + 3 + dir[0] * 2;
                const ey = TOP + h.y * CELL + 3 + dir[1] * 2;
                ctx.fillRect(ex - (dir[1] ? 1 : 0), ey - (dir[0] ? 1 : 0), 1, 1);
                ctx.fillRect(ex + (dir[1] ? 1 : 0), ey + (dir[0] ? 1 : 0), 1, 1);
            },
        };
    },
};

// ---------- Firewall ----------

const FW = {
    ship: ['....#....', '...###...', '..#####..', '.##.#.##.', '#########', '#.#...#.#'],
    worm: ['.###.', '##.##', '#####', '.#.#.', '#...#'],
    trojan: ['..###..', '.#####.', '##.#.##', '#######', '#.###.#', '..#.#..'],
    frag: ['.#.', '###', '.#.'],
    ransom: ['..###..', '.#...#.', '.#...#.', '#######', '###.###', '###.###', '#######'],
    patch: ['#####', '#.#.#', '##.##', '#.#.#', '#####'],
};
const FW_SIZE = { worm: 5, trojan: 7, frag: 3, ransom: 7 };
const FW_POINTS = { worm: 10, trojan: 25, frag: 5, ransom: 40 };
const FW_COLOR = { worm: PAL.green, trojan: PAL.magenta, frag: PAL.magenta, ransom: PAL.red };

const FIREWALL = {
    id: 'firewall',
    cmd: 'firewall',
    name: 'Firewall',
    blurb: 'Hold the line. Worms wriggle, trojans split when they break, ransomware drops locks. Grab patches for rapid fire. Anything that slips past is a breach.',
    controls: 'LEFT/RIGHT MOVE  -  SPACE FIRE  -  DRAG ON TOUCH',
    create(api) {
        const PY = 166;
        let px = AW / 2;
        let lives = 3;
        let score = 0;
        let wave = 0;
        let inv = 0;
        let cool = 0;
        let rapid = 0;
        let toSpawn = 0;
        let spawnT = 0;
        let banner = 0;
        let over = false;
        let enemies = [];
        let bullets = [];
        let bombs = [];
        let pickups = [];
        let sparks = [];

        function nextWave() {
            wave++;
            toSpawn = 5 + wave * 3;
            spawnT = 50;
            banner = 100;
            api.sfx('wave');
        }

        function spawn() {
            const r = Math.random();
            const type = wave >= 3 && r < 0.2 ? 'ransom' : wave >= 2 && r < 0.5 ? 'trojan' : 'worm';
            const x = 12 + Math.random() * (AW - 24);
            enemies.push({ type, x, x0: x, y: 10, hp: { worm: 1, trojan: 3, ransom: 4 }[type], t: rint(100), vx: 0 });
        }

        function burst(x, y, color, n = 10) {
            for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 18 + rint(12), color });
        }

        function hurt() {
            if (inv > 0 || over) return;
            lives--;
            inv = 100;
            burst(px, PY, accentColor(), 16);
            api.sfx('die');
            if (lives <= 0) over = true;
        }

        nextWave();
        return {
            get score() { return score; },
            get over() { return over; },
            update(inp) {
                if (inp.held.has('left')) px -= 2.2;
                if (inp.held.has('right')) px += 2.2;
                if (inp.pointer.down) px += clamp(inp.pointer.x - px, -2.6, 2.6);
                px = clamp(px, 5, AW - 5);
                if (cool > 0) cool--;
                if (rapid > 0) rapid--;
                if (inv > 0) inv--;
                if (banner > 0) banner--;
                if ((inp.held.has('fire') || inp.held.has('up') || inp.pointer.down) && !cool) {
                    bullets.push({ x: px, y: PY - 4 });
                    cool = rapid ? 5 : 12;
                    api.sfx('shoot');
                }
                if (toSpawn > 0 && --spawnT <= 0) {
                    spawn();
                    toSpawn--;
                    spawnT = Math.max(14, 46 - wave * 3) + rint(20);
                }
                for (const b of bullets) b.y -= 4;
                for (const e of enemies) {
                    e.t++;
                    if (e.type === 'worm') {
                        e.y += 0.42 + wave * 0.05;
                        e.x = e.x0 + Math.sin(e.t * 0.06) * 18;
                    } else if (e.type === 'trojan') {
                        e.y += 0.3 + wave * 0.03;
                    } else if (e.type === 'frag') {
                        e.x += e.vx;
                        e.y += 0.9;
                        if (e.x < 3 || e.x > AW - 3) e.vx *= -1;
                    } else {
                        e.y += 0.2;
                        if (e.t % 80 === 0) bombs.push({ x: e.x, y: e.y + 4 });
                    }
                    if (e.y > AH - 6) {
                        e.dead = true;
                        hurt();
                    }
                }
                for (const b of bombs) b.y += 1.5;
                for (const p of pickups) p.y += 0.7;
                for (const b of bullets) {
                    for (const e of enemies) {
                        if (b.dead || e.dead) continue;
                        const s = FW_SIZE[e.type] / 2;
                        if (Math.abs(b.x - e.x) > s + 1 || Math.abs(b.y - e.y) > s + 2) continue;
                        b.dead = true;
                        e.hp--;
                        api.sfx('hit');
                        if (e.hp > 0) continue;
                        e.dead = true;
                        score += FW_POINTS[e.type];
                        burst(e.x, e.y, FW_COLOR[e.type]);
                        api.sfx('boom');
                        if (e.type === 'trojan') {
                            enemies.push({ type: 'frag', x: e.x, y: e.y, vx: -0.9, hp: 1, t: 0 }, { type: 'frag', x: e.x, y: e.y, vx: 0.9, hp: 1, t: 0 });
                        }
                        if (Math.random() < 0.08) pickups.push({ x: e.x, y: e.y });
                    }
                }
                for (const e of enemies) {
                    if (!e.dead && Math.abs(e.x - px) < 6 && Math.abs(e.y - PY) < 6) {
                        e.dead = true;
                        hurt();
                    }
                }
                for (const b of bombs) {
                    if (!b.dead && Math.abs(b.x - px) < 5 && Math.abs(b.y - PY) < 5) {
                        b.dead = true;
                        hurt();
                    }
                }
                for (const p of pickups) {
                    if (!p.dead && Math.abs(p.x - px) < 7 && Math.abs(p.y - PY) < 7) {
                        p.dead = true;
                        rapid = 480;
                        score += 15;
                        api.sfx('power');
                    }
                }
                for (const s of sparks) {
                    s.x += s.vx;
                    s.y += s.vy;
                    s.life--;
                }
                bullets = bullets.filter((b) => !b.dead && b.y > 10);
                enemies = enemies.filter((e) => !e.dead);
                bombs = bombs.filter((b) => !b.dead && b.y < AH);
                pickups = pickups.filter((p) => !p.dead && p.y < AH);
                sparks = sparks.filter((s) => s.life > 0);
                if (!toSpawn && !enemies.length && !over) nextWave();
            },
            draw(ctx, frame) {
                for (let i = 0; i < 30; i++) {
                    ctx.fillStyle = i % 3 ? PAL.panel : PAL.dim;
                    ctx.fillRect((i * 53) % AW, (i * 37 + frame * (1 + (i % 3)) * 0.3) % (AH - 12) + 12, 1, 1);
                }
                for (const e of enemies) {
                    const s = FW_SIZE[e.type];
                    const flash = e.type === 'ransom' && e.hp < 4 && frame % 6 < 3;
                    sprite(ctx, FW[e.type], e.x - s / 2, e.y - s / 2, { '#': flash ? PAL.fg : FW_COLOR[e.type] });
                }
                ctx.fillStyle = PAL.yellow;
                for (const b of bombs) ctx.fillRect(b.x - 1, b.y - 2, 3, 4);
                for (const p of pickups) sprite(ctx, FW.patch, p.x - 2, p.y - 2, { '#': frame % 10 < 5 ? PAL.cyan : PAL.fg });
                ctx.fillStyle = rapid ? PAL.cyan : PAL.fg;
                for (const b of bullets) ctx.fillRect(b.x, b.y - 3, 1, 4);
                for (const s of sparks) {
                    ctx.fillStyle = s.color;
                    ctx.fillRect(s.x, s.y, 1, 1);
                }
                if (!over && (inv === 0 || frame % 8 < 4)) sprite(ctx, FW.ship, px - 4, PY - 3, { '#': accentColor() });
                for (let i = 0; i < lives; i++) sprite(ctx, FW.ship, AW - 12 - i * 11, AH - 8, { '#': PAL.dim });
                if (rapid) pixelText(ctx, 'PATCHED', 4, AH - 7, PAL.cyan);
                if (banner > 0 && frame % 20 < 14) pixelText(ctx, `WAVE ${wave}`, AW / 2, 70, PAL.yellow, 2, 'center');
            },
        };
    },
};

// ---------- Riff Runner ----------

const RR_RUN = [
    ['...hh...', '..hss...', '..sss...', '...b....', '..bbbyy.', '.b.bby..', '...bby..', '...b....', '..b.b...', '.b...b..', '.b...b..', '........'],
    ['...hh...', '..hss...', '..sss...', '...b....', '..bbbyy.', '..bbby..', '...bby..', '...b....', '...bb...', '...b.b..', '..b..b..', '........'],
];
const RR_JUMP = ['...hh...', '..hss...', '..sss...', '...b....', '.bbbbyy.', '...bby..', '...bby..', '...b....', '..bbb...', '.b...b..', '........', '........'];
const RR_NOTE = ['..##.', '..#.#', '..#..', '..#..', '###..', '###..'];
const RR_OBS = { amp: { w: 10, h: 12 }, pedal: { w: 8, h: 5 }, stack: { w: 11, h: 22 } };

const RIFF_RUNNER = {
    id: 'runner',
    cmd: 'riff-runner',
    name: 'Riff Runner',
    blurb: 'Late for the gig. Run the fretboard under the Himalayas, jump the amps and pedals (double jump works), and catch notes for bonus points.',
    controls: 'SPACE / UP / TAP TO JUMP  -  TWICE TO DOUBLE JUMP',
    create(api) {
        const GROUND = 152;
        const PX = 40;
        let y = GROUND;
        let vy = 0;
        let jumps = 0;
        let speed = 2.2;
        let dist = 0;
        let notes = 0;
        let t = 0;
        let over = false;
        let obstacles = [];
        let items = [];
        let nextObs = 160;
        let nextNote = 80;
        const peaks = Array.from({ length: 10 }, (_, i) => ({ x: i * 34, h: 28 + rint(40) }));
        const stars = Array.from({ length: 40 }, () => ({ x: rint(AW), y: 14 + rint(70) }));

        return {
            get score() { return Math.floor(dist / 6) + notes * 25; },
            get over() { return over; },
            update(inp) {
                t++;
                speed = Math.min(6, 2.2 + t * 0.0012);
                dist += speed;
                if ((inp.pressed.has('fire') || inp.pressed.has('up') || inp.pressed.has('tap')) && jumps < 2) {
                    vy = jumps ? -4.6 : -5.6;
                    jumps++;
                    api.sfx('jump');
                }
                vy += 0.32;
                y += vy;
                if (y >= GROUND) {
                    y = GROUND;
                    vy = 0;
                    jumps = 0;
                }
                nextObs -= speed;
                if (nextObs <= 0) {
                    const kinds = dist > 3000 ? ['amp', 'pedal', 'stack'] : ['amp', 'pedal'];
                    const k = kinds[rint(kinds.length)];
                    obstacles.push({ k, x: AW + 10, ...RR_OBS[k] });
                    nextObs = 110 + rint(130) + speed * 8;
                }
                nextNote -= speed;
                if (nextNote <= 0) {
                    items.push({ x: AW + 10, y: 98 + rint(30), ph: Math.random() * 6 });
                    nextNote = 140 + rint(160);
                }
                for (const o of obstacles) o.x -= speed;
                for (const n of items) n.x -= speed;
                for (const o of obstacles) {
                    if (PX + 2 < o.x + o.w && PX + 6 > o.x && y > GROUND - o.h + 2) {
                        over = true;
                        api.sfx('die');
                    }
                }
                for (const n of items) {
                    if (!n.got && Math.abs(n.x + 2 - (PX + 4)) < 7 && Math.abs(n.y + 3 - (y - 6)) < 9) {
                        n.got = true;
                        notes++;
                        api.sfx('note');
                    }
                }
                obstacles = obstacles.filter((o) => o.x > -20);
                items = items.filter((n) => n.x > -10 && !n.got);
            },
            draw(ctx, frame) {
                for (const s of stars) {
                    ctx.fillStyle = (s.x + s.y + Math.floor(frame / 20)) % 7 ? PAL.dim : PAL.fg;
                    ctx.fillRect((s.x - dist * 0.02 + AW * 10) % AW, s.y, 1, 1);
                }
                ctx.fillStyle = '#1b2230';
                for (const p of peaks) {
                    const x = ((p.x - dist * 0.1) % (AW + 40) + AW + 40) % (AW + 40) - 20;
                    for (let i = 0; i < p.h; i++) ctx.fillRect(x - i * 0.9, GROUND - 22 - p.h + i, i * 1.8 + 1, 1);
                    ctx.fillStyle = '#c9d3e0';
                    for (let i = 0; i < 6; i++) ctx.fillRect(x - i * 0.9, GROUND - 22 - p.h + i, i * 1.8 + 1, 1);
                    ctx.fillStyle = '#1b2230';
                }
                ctx.fillStyle = '#121a26';
                for (let i = 0; i < AW; i += 2) ctx.fillRect(i, GROUND - 12 - Math.abs(Math.sin((i + dist * 0.35) * 0.04)) * 10, 2, 40);
                ctx.fillStyle = PAL.wood;
                ctx.fillRect(0, GROUND, AW, AH - GROUND);
                ctx.fillStyle = PAL.fret;
                for (let s = 0; s < 4; s++) ctx.fillRect(0, GROUND + 4 + s * 6, AW, 1);
                for (let x = -(dist % 48); x < AW; x += 48) {
                    ctx.fillStyle = '#c0c0c0';
                    ctx.fillRect(Math.round(x), GROUND, 2, AH - GROUND);
                    ctx.fillStyle = PAL.fg;
                    ctx.fillRect(Math.round(x) + 23, GROUND + 12, 2, 2);
                }
                for (const o of obstacles) {
                    const ox = Math.round(o.x);
                    const oy = GROUND - o.h;
                    if (o.k === 'pedal') {
                        ctx.fillStyle = PAL.red;
                        ctx.fillRect(ox, oy, o.w, o.h);
                        ctx.fillStyle = PAL.fg;
                        ctx.fillRect(ox + 3, oy + 1, 2, 2);
                    } else {
                        for (let stack = 0; stack < (o.k === 'stack' ? 2 : 1); stack++) {
                            const sy = oy + stack * 11;
                            ctx.fillStyle = '#222833';
                            ctx.fillRect(ox, sy, o.w, 11);
                            ctx.fillStyle = PAL.dim;
                            for (let gy = sy + 4; gy < sy + 10; gy += 2) for (let gx = ox + 1; gx < ox + o.w - 1; gx += 2) ctx.fillRect(gx, gy, 1, 1);
                            ctx.fillStyle = PAL.yellow;
                            ctx.fillRect(ox + 1, sy + 1, o.w - 2, 1);
                        }
                    }
                }
                for (const n of items) sprite(ctx, RR_NOTE, n.x, n.y + Math.sin(frame * 0.1 + n.ph) * 2, { '#': PAL.yellow });
                const map = y < GROUND ? RR_JUMP : RR_RUN[Math.floor(t / 6) % 2];
                sprite(ctx, map, PX, y - 12, { h: accentColor(), s: PAL.skin, b: PAL.fg, y: PAL.yellow });
                pixelText(ctx, `NOTES ${notes}`, 4, AH - 7, PAL.yellow);
            },
        };
    },
};

// ---------- Night Shift ----------

// Build sites, mirrored on both sides of the mainframe at x = 0.
const NS_SLOTS = [
    { x: 28, kind: 'server' }, { x: 56, kind: 'server' }, { x: 92, kind: 'sentry' }, { x: 122, kind: 'wall' },
    { x: 168, kind: 'sentry' }, { x: 200, kind: 'wall' }, { x: 250, kind: 'server' },
];
const NS_COST = { server: [3, 6], sentry: [6, 12], wall: [4, 8, 14] };
const NS_LABEL = { server: 'SERVER', sentry: 'SENTRY', wall: 'FIREWALL' };
const NS_WALL_HP = [0, 60, 130, 260];
const NS_PLAYER = [
    ['..hhh..', '.hhhhh.', '.hsssh.', '..sss..', '.hhhhh.', 'hhhhhhh', 'h.hhh.h', '..hhh..', '..d.d..', '..d.d..', '.dd.dd.', '.......'],
    ['..hhh..', '.hhhhh.', '.hsssh.', '..sss..', '.hhhhh.', 'hhhhhhh', 'h.hhh.h', '..hhh..', '..dd...', '.d..d..', '.d..dd.', '.......'],
];
const NS_CRAWLER = [
    ['.#####.', '##o#o##', '#######', '.#.#.#.', '#.#.#.#'],
    ['.#####.', '##o#o##', '#######', '#.#.#.#', '.#.#.#.'],
];
const NS_BRUTE = ['..#####..', '.#######.', '##o###o##', '#########', '#.#####.#', '#########', '.##...##.', '##.....##'];

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => `rgb(${c1.map((v, i) => Math.round(lerp(v, c2[i], t))).join(',')})`;

const NIGHT_SHIFT = {
    id: 'nightshift',
    cmd: 'night-shift',
    name: 'Night Shift',
    blurb: 'Keep an edge datacenter in the Himalayas alive. By day, collect credits and build servers, firewalls and sentries. By night, botnets come from both sides.',
    controls: 'LEFT/RIGHT WALK  -  SPACE BUILD / ZAP',
    create(api) {
        const DAY = 1800;
        const NIGHT = 1500;
        const EDGE = 300;
        const GROUND = 150;
        const slots = NS_SLOTS.flatMap((s) => [-1, 1].map((side) => ({ ...s, x: s.x * side, tier: 0, hp: 0, timer: 0, cool: 0 })));
        let px = 0;
        let stun = 0;
        let credits = 10;
        let day = 1;
        let clock = 0;
        let night = false;
        let coreHp = 10;
        let kills = 0;
        let over = false;
        let zap = 0;
        let zapCool = 0;
        let walkFrame = 0;
        let bots = [];
        let coins = [];
        let sparks = [];
        let tracers = [];
        let spawns = [];
        let toast = { text: 'DAY 1 - BUILD BEFORE DARK', color: PAL.yellow, t: 180 };
        const peaks = Array.from({ length: 14 }, (_, i) => ({ x: i * 46 - 320, h: 30 + rint(45) }));
        const stars = Array.from({ length: 45 }, () => ({ x: rint(AW), y: 12 + rint(90) }));
        const shade = document.createElement('canvas');
        shade.width = AW;
        shade.height = AH;
        const sctx = shade.getContext('2d');

        const say = (text, color) => { toast = { text, color, t: 150 }; };
        const burst = (x, y, color, n = 10) => {
            for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 2.2, life: 20 + rint(15), color });
        };
        const nearSlot = () => slots.find((s) => Math.abs(s.x - px) < 9);

        // What pressing Space at a build site would do, or null when it's maxed out.
        function offer(s) {
            const top = NS_COST[s.kind].length;
            if (s.kind === 'wall' && s.tier && s.hp < NS_WALL_HP[s.tier] && s.tier === top) return { label: 'REPAIR', cost: 2, repair: true };
            if (s.tier < top) return { label: s.tier ? `UPGRADE ${NS_LABEL[s.kind]}` : NS_LABEL[s.kind], cost: NS_COST[s.kind][s.tier] };
            return null;
        }

        function startNight() {
            night = true;
            clock = 0;
            const list = [...Array(2 + day * 2).fill('crawler'), ...Array(Math.max(0, day - 2)).fill('brute')].sort(() => Math.random() - 0.5);
            spawns = list.map((type, i) => ({ type, at: Math.floor((i / list.length) * NIGHT * 0.6) + rint(60), side: Math.random() < 0.5 ? -1 : 1 }));
            say(`NIGHT ${day} - BOTNET INBOUND`, PAL.red);
            api.sfx('alarm');
        }

        function startDay() {
            night = false;
            clock = 0;
            for (const b of bots) burst(b.x, GROUND - 4, PAL.yellow, 6);
            bots = [];
            day++;
            const bonus = 3 + day;
            credits += bonus;
            coreHp = Math.min(10, coreHp + 2);
            say(`DAY ${day} - SLA BONUS +${bonus}`, PAL.yellow);
            api.sfx('power');
        }

        function act() {
            const s = nearSlot();
            if (s) {
                const o = offer(s);
                if (!o) return say('FULLY UPGRADED', PAL.fg);
                if (credits < o.cost) {
                    api.sfx('hit');
                    return say(`NEED ${o.cost} CREDITS`, PAL.red);
                }
                credits -= o.cost;
                if (!o.repair) s.tier++;
                if (s.kind === 'wall') s.hp = NS_WALL_HP[s.tier];
                burst(s.x, GROUND - 10, PAL.cyan, 10);
                api.sfx('power');
                return;
            }
            if (zapCool) return;
            zapCool = 40;
            zap = 12;
            api.sfx('shoot');
            for (const b of bots) {
                if (Math.abs(b.x - px) > 24) continue;
                b.hp -= 2;
                b.x += Math.sign(b.x - px || 1) * 8;
            }
        }

        return {
            get score() { return (day - 1) * 100 + kills * 5; },
            get over() { return over; },
            update(inp) {
                clock++;
                if (!night && clock >= DAY) startNight();
                else if (night && clock >= NIGHT) startDay();
                if (toast && --toast.t <= 0) toast = null;
                if (zap) zap--;
                if (zapCool) zapCool--;

                let dir = (inp.held.has('right') ? 1 : 0) - (inp.held.has('left') ? 1 : 0);
                if (inp.pointer.down && inp.pointer.x < AW * 0.35) dir = -1;
                else if (inp.pointer.down && inp.pointer.x > AW * 0.65) dir = 1;
                if (stun) {
                    stun--;
                    dir = 0;
                }
                px = clamp(px + dir * 1.3, -EDGE + 4, EDGE - 4);
                if (dir) walkFrame++;
                if (inp.pressed.has('fire') || inp.pressed.has('up') || inp.pressed.has('tap')) act();

                for (const s of spawns) {
                    if (s.done || clock < s.at) continue;
                    s.done = true;
                    const brute = s.type === 'brute';
                    bots.push({ type: s.type, x: s.side * EDGE, hp: brute ? 10 : 3, speed: brute ? 0.22 : 0.36 + Math.random() * 0.12, t: rint(60) });
                }

                for (const s of slots) {
                    if (!s.tier) continue;
                    if (s.kind === 'server' && !night && ++s.timer >= (s.tier === 1 ? 360 : 220)) {
                        s.timer = 0;
                        if (coins.filter((cn) => cn.from === s).length < 4) coins.push({ x: s.x + rint(9) - 4, y: GROUND - 14, vy: -1.6, from: s });
                    }
                    if (s.kind === 'sentry' && night && --s.cool <= 0) {
                        const range = 70 + s.tier * 15;
                        const target = bots.filter((b) => Math.abs(b.x - s.x) < range).sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0];
                        if (target) {
                            target.hp -= s.tier;
                            tracers.push({ x1: s.x, x2: target.x, t: 5, color: s.tier === 1 ? PAL.cyan : PAL.magenta });
                            s.cool = s.tier === 1 ? 55 : 32;
                        }
                    }
                }

                for (const cn of coins) {
                    if (cn.y < GROUND - 2) {
                        cn.vy += 0.15;
                        cn.y = Math.min(GROUND - 2, cn.y + cn.vy);
                    } else if (Math.abs(cn.x - px) < 5) {
                        cn.got = true;
                        credits++;
                        api.sfx('eat');
                    }
                }

                for (const b of bots) {
                    b.t++;
                    // The outermost standing firewall on the bot's side blocks it.
                    const wall = slots
                        .filter((s) => s.kind === 'wall' && s.tier && Math.sign(s.x) === Math.sign(b.x) && Math.abs(s.x) < Math.abs(b.x) + 1)
                        .sort((a, c) => Math.abs(c.x) - Math.abs(a.x))[0];
                    if (wall && Math.abs(b.x - wall.x) < 5) {
                        b.attacking = true;
                        wall.hp -= b.type === 'brute' ? 0.1 : 0.03;
                        if (wall.hp <= 0) {
                            wall.tier = 0;
                            wall.hp = 0;
                            burst(wall.x, GROUND - 10, PAL.red, 16);
                            api.sfx('boom');
                            say('FIREWALL DOWN!', PAL.red);
                        }
                    } else {
                        b.attacking = false;
                        b.x -= Math.sign(b.x) * b.speed;
                    }
                    if (b.hp <= 0) {
                        b.dead = true;
                        kills++;
                        burst(b.x, GROUND - 4, b.type === 'brute' ? PAL.magenta : PAL.red);
                        api.sfx('boom');
                    } else if (Math.abs(b.x) < 10) {
                        b.dead = true;
                        coreHp -= b.type === 'brute' ? 3 : 1;
                        burst(0, GROUND - 14, PAL.red, 14);
                        api.sfx('die');
                        say('MAINFRAME HIT!', PAL.red);
                        if (coreHp <= 0) over = true;
                    } else if (!stun && Math.abs(b.x - px) < 5) {
                        stun = 45;
                        px = clamp(px + Math.sign(px - b.x || 1) * 10, -EDGE + 4, EDGE - 4);
                        api.sfx('hit');
                    }
                }

                for (const s of sparks) {
                    s.x += s.vx;
                    s.y += s.vy;
                    s.vy += 0.08;
                    s.life--;
                }
                for (const t of tracers) t.t--;
                bots = bots.filter((b) => !b.dead);
                coins = coins.filter((cn) => !cn.got);
                sparks = sparks.filter((s) => s.life > 0);
                tracers = tracers.filter((t) => t.t > 0);
            },
            draw(ctx, frame) {
                const cam = clamp(px - AW / 2, -EDGE, EDGE - AW);
                const sx = (x) => Math.round(x - cam);
                // Daylight: ramps up at dawn, down at dusk, low all night.
                const light = night ? 0.1 : Math.min(1, 0.3 + clock / 120, 0.3 + (DAY - clock) / 260);
                const sky = [[6, 8, 18], [70, 118, 176]];
                for (let i = 0; i < 6; i++) {
                    ctx.fillStyle = mix(sky[0], sky[1], light * (0.6 + i * 0.08));
                    ctx.fillRect(0, 10 + i * 24, AW, 24);
                }
                if (light < 0.6) {
                    for (const st of stars) {
                        ctx.fillStyle = (st.x + Math.floor(frame / 25)) % 6 ? PAL.dim : PAL.fg;
                        ctx.fillRect(st.x, st.y, 1, 1);
                    }
                }
                const arc = night ? clock / NIGHT : clock / DAY;
                ctx.fillStyle = night ? '#dfe6f0' : PAL.yellow;
                const ox = 20 + arc * 200;
                const oy = 70 - Math.sin(arc * Math.PI) * 45;
                ctx.fillRect(ox - 3, oy - 2, 7, 5);
                ctx.fillRect(ox - 2, oy - 3, 5, 7);
                for (const p of peaks) {
                    const x = Math.round(p.x - cam * 0.2);
                    for (let i = 0; i < p.h; i++) {
                        ctx.fillStyle = i < 6 ? mix([90, 100, 115], [215, 225, 238], light) : mix([12, 16, 26], [40, 52, 72], light);
                        ctx.fillRect(x - i, GROUND - 26 - p.h + i, i * 2 + 1, 1);
                    }
                }
                ctx.fillStyle = mix([10, 14, 20], [30, 44, 40], light);
                for (let i = 0; i < AW; i += 2) ctx.fillRect(i, GROUND - 14 - Math.abs(Math.sin((i + cam * 0.5) * 0.03)) * 9, 2, 20);
                ctx.fillStyle = mix([14, 18, 14], [36, 52, 30], light);
                ctx.fillRect(0, GROUND, AW, AH - GROUND);
                ctx.fillStyle = mix([22, 40, 22], [80, 140, 60], light);
                ctx.fillRect(0, GROUND, AW, 1);
                ctx.fillStyle = '#ffffff22';
                ctx.fillRect(sx(-EDGE), GROUND - 40, 1, 40);
                ctx.fillRect(sx(EDGE), GROUND - 40, 1, 40);

                // Mainframe.
                const cx = sx(0);
                ctx.fillStyle = '#1a2230';
                ctx.fillRect(cx - 8, GROUND - 28, 16, 28);
                ctx.fillStyle = accentColor();
                ctx.fillRect(cx - 8, GROUND - 28, 16, 1);
                ctx.fillRect(cx - 8, GROUND - 28, 1, 28);
                ctx.fillRect(cx + 7, GROUND - 28, 1, 28);
                for (let r = 0; r < 7; r++) {
                    for (let k = 0; k < 4; k++) {
                        ctx.fillStyle = (r * 3 + k + Math.floor(frame / 7)) % 5 ? PAL.green : PAL.dim;
                        ctx.fillRect(cx - 5 + k * 3, GROUND - 24 + r * 3, 1, 1);
                    }
                }
                ctx.fillStyle = PAL.dim;
                ctx.fillRect(cx - 8, GROUND - 32, 16, 2);
                ctx.fillStyle = coreHp > 3 ? PAL.green : PAL.red;
                ctx.fillRect(cx - 8, GROUND - 32, Math.round((coreHp / 10) * 16), 2);

                for (const s of slots) {
                    const x = sx(s.x);
                    if (x < -12 || x > AW + 12) continue;
                    if (!s.tier) {
                        ctx.fillStyle = '#7a6a48';
                        ctx.fillRect(x, GROUND - 6, 1, 6);
                        ctx.fillStyle = s.kind === 'wall' ? PAL.red : s.kind === 'sentry' ? PAL.magenta : PAL.cyan;
                        ctx.fillRect(x + 1, GROUND - 6, 2, 2);
                    } else if (s.kind === 'server') {
                        const h = s.tier === 1 ? 14 : 20;
                        ctx.fillStyle = '#222833';
                        ctx.fillRect(x - 4, GROUND - h, 8, h);
                        ctx.fillStyle = '#3a4150';
                        ctx.fillRect(x - 4, GROUND - h, 8, 1);
                        for (let r = 0; r < h / 3 - 1; r++) {
                            ctx.fillStyle = (r + Math.floor(frame / 9) + s.x) % 4 ? PAL.green : accentColor();
                            ctx.fillRect(x - 2, GROUND - h + 3 + r * 3, 1, 1);
                            ctx.fillStyle = '#3a4150';
                            ctx.fillRect(x, GROUND - h + 3 + r * 3, 3, 1);
                        }
                    } else if (s.kind === 'sentry') {
                        ctx.fillStyle = '#5a6372';
                        ctx.fillRect(x - 1, GROUND - 12, 2, 12);
                        ctx.fillRect(x - 3, GROUND - 2, 6, 2);
                        ctx.fillStyle = s.tier === 1 ? PAL.cyan : PAL.magenta;
                        ctx.fillRect(x - 3, GROUND - 16, 6, 4);
                        ctx.fillStyle = PAL.fg;
                        ctx.fillRect(x - 1, GROUND - 15, 2, 1);
                    } else {
                        const h = [0, 16, 22, 28][s.tier];
                        ctx.fillStyle = s.tier === 3 ? '#ff8c42' : PAL.red;
                        ctx.fillRect(x - 3, GROUND - h, 6, h);
                        ctx.fillStyle = PAL.darkred;
                        for (let r = GROUND - h + 3; r < GROUND; r += 4) ctx.fillRect(x - 3, r, 6, 1);
                        const damage = 1 - s.hp / NS_WALL_HP[s.tier];
                        ctx.fillStyle = '#000000aa';
                        for (let k = 0; k < Math.floor(damage * 10); k++) ctx.fillRect(x - 3 + ((k * 5) % 6), GROUND - h + ((k * 7) % h), 2, 2);
                    }
                }

                ctx.fillStyle = PAL.yellow;
                for (const cn of coins) {
                    ctx.fillRect(sx(cn.x) - 1, Math.round(cn.y) - 1, 3, 3);
                    ctx.fillStyle = PAL.fg;
                    ctx.fillRect(sx(cn.x) - 1, Math.round(cn.y) - 1, 1, 1);
                    ctx.fillStyle = PAL.yellow;
                }

                for (const b of bots) {
                    const brute = b.type === 'brute';
                    const map = brute ? NS_BRUTE : NS_CRAWLER[Math.floor(b.t / 8) % 2];
                    const w = map[0].length;
                    const jitter = b.attacking && frame % 10 < 5 ? 1 : 0;
                    sprite(ctx, map, sx(b.x) - w / 2 + jitter, GROUND - map.length, { '#': brute ? PAL.magenta : PAL.red, o: PAL.yellow });
                }

                for (const t of tracers) {
                    ctx.strokeStyle = t.color;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(sx(t.x1) + 0.5, GROUND - 14.5);
                    ctx.lineTo(sx(t.x2) + 0.5, GROUND - 3.5);
                    ctx.stroke();
                }

                if (!stun || frame % 6 < 3) {
                    sprite(ctx, NS_PLAYER[Math.floor(walkFrame / 8) % 2], sx(px) - 3, GROUND - 12, { h: accentColor(), s: PAL.skin, d: '#2b3445' });
                }
                if (zap) {
                    ctx.strokeStyle = PAL.cyan;
                    ctx.beginPath();
                    ctx.arc(sx(px) + 0.5, GROUND - 6, (12 - zap) * 2 + 2, 0, Math.PI * 2);
                    ctx.stroke();
                }
                for (const s of sparks) {
                    ctx.fillStyle = s.color;
                    ctx.fillRect(Math.round(s.x - cam), Math.round(s.y), 1, 1);
                }

                // Darkness, with pools of light around the player, the mainframe and built machines.
                const dark = (1 - light) * 0.78;
                if (dark > 0.02) {
                    sctx.globalCompositeOperation = 'source-over';
                    sctx.clearRect(0, 0, AW, AH);
                    sctx.fillStyle = `rgba(2, 4, 12, ${dark})`;
                    sctx.fillRect(0, 10, AW, AH - 10);
                    sctx.globalCompositeOperation = 'destination-out';
                    const lamp = (x, y, r) => {
                        const g = sctx.createRadialGradient(x, y, 0, x, y, r);
                        g.addColorStop(0, 'rgba(0,0,0,1)');
                        g.addColorStop(1, 'rgba(0,0,0,0)');
                        sctx.fillStyle = g;
                        sctx.fillRect(x - r, y - r, r * 2, r * 2);
                    };
                    lamp(sx(px), GROUND - 8, 36);
                    lamp(cx, GROUND - 14, 30);
                    for (const s of slots) if (s.tier && s.kind !== 'wall') lamp(sx(s.x), GROUND - 10, s.kind === 'sentry' ? 20 : 12);
                    ctx.drawImage(shade, 0, 0);
                }

                const here = nearSlot();
                if (here) {
                    const o = offer(here);
                    const text = o ? `${o.label} ${o.cost}` : 'MAXED';
                    pixelText(ctx, text, clamp(sx(here.x), 30, AW - 30), GROUND - 40, !o ? PAL.dim : credits >= o.cost ? PAL.yellow : PAL.red, 1, 'center');
                }

                ctx.fillStyle = PAL.yellow;
                ctx.fillRect(4, 14, 3, 3);
                pixelText(ctx, `${credits}`, 10, 13, PAL.yellow);
                pixelText(ctx, `${night ? 'NIGHT' : 'DAY'} ${day}`, AW / 2, 13, night ? PAL.red : PAL.fg, 1, 'center');
                ctx.fillStyle = PAL.dim;
                ctx.fillRect(AW / 2 - 20, 20, 40, 1);
                ctx.fillStyle = night ? PAL.red : PAL.yellow;
                ctx.fillRect(AW / 2 - 20, 20, Math.round(arc * 40), 1);
                pixelText(ctx, `CORE ${coreHp}`, AW - 4, 13, coreHp > 3 ? PAL.green : PAL.red, 1, 'right');
                if (toast && (toast.t > 30 || frame % 8 < 5)) pixelText(ctx, toast.text, AW / 2, 32, toast.color, 1, 'center');
            },
        };
    },
};

// ---------- music helpers (Fretwork's backing band) ----------

const midiHz = (n) => 440 * 2 ** ((n - 69) / 12);

function audioOut() {
    if (soundOff()) return null;
    try {
        audioCtx ??= new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    } catch {
        return null;
    }
}

function tone(freq, at, dur, { type = 'square', vol = 0.03, to = null } = {}) {
    const a = audioOut();
    if (!a) return;
    at = Math.max(at, a.currentTime);
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
}

let noiseBuffer = null;
function noise(at, dur, vol, highpass) {
    const a = audioOut();
    if (!a) return;
    at = Math.max(at, a.currentTime);
    if (!noiseBuffer) {
        noiseBuffer = a.createBuffer(1, a.sampleRate / 2, a.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = a.createBufferSource();
    const filter = a.createBiquadFilter();
    const gain = a.createGain();
    src.buffer = noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start(at);
    src.stop(at + dur);
}

// ---------- Patch Panel ----------

const PP_DIRS = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]]; // dx, dy, bit, opposite bit
const PP_SIZES = [[5, 4], [6, 4], [6, 5], [7, 5], [8, 5], [8, 6]];

const PATCH_PANEL = {
    id: 'patch',
    cmd: 'patch-panel',
    name: 'Patch Panel',
    blurb: 'Rotate the cables until every server is wired back to the router. Each level is bigger, and the clock never stops.',
    controls: 'ARROWS MOVE  -  SPACE ROTATE  -  TAP A TILE',
    create(api) {
        const T = 20;
        const rotate = (m) => ((m << 1) | (m >> 3)) & 15;
        let level = 0;
        let cols;
        let rows;
        let tiles;
        let root;
        let cur;
        let time;
        let score = 0;
        let over = false;
        let banner = 0;
        let lit = new Set();
        const at = (x, y) => tiles[y * cols + x];
        const origin = () => ({ x: Math.floor((AW - cols * T) / 2), y: 24 + Math.floor((132 - rows * T) / 2) });

        // Everything reachable from the router through matching cable ends.
        function connected() {
            const seen = new Set([root.y * cols + root.x]);
            const queue = [root];
            while (queue.length) {
                const p = queue.shift();
                for (const [dx, dy, bit, opp] of PP_DIRS) {
                    const x = p.x + dx;
                    const y = p.y + dy;
                    if (x < 0 || y < 0 || x >= cols || y >= rows || seen.has(y * cols + x)) continue;
                    if (at(p.x, p.y).m & bit && at(x, y).m & opp) {
                        seen.add(y * cols + x);
                        queue.push({ x, y });
                    }
                }
            }
            return seen;
        }

        function build() {
            [cols, rows] = PP_SIZES[Math.min(level, PP_SIZES.length - 1)];
            tiles = Array.from({ length: cols * rows }, () => ({ m: 0 }));
            root = { x: Math.floor(cols / 2), y: Math.floor(rows / 2) };
            // A random spanning tree: picking from anywhere in the frontier gives a branchy network.
            const seen = new Set([root.y * cols + root.x]);
            const open = [root];
            while (open.length) {
                const i = rint(open.length);
                const p = open[i];
                const opts = PP_DIRS.filter(([dx, dy]) => {
                    const x = p.x + dx;
                    const y = p.y + dy;
                    return x >= 0 && y >= 0 && x < cols && y < rows && !seen.has(y * cols + x);
                });
                if (!opts.length) {
                    open.splice(i, 1);
                    continue;
                }
                const [dx, dy, bit, opp] = opts[rint(opts.length)];
                const n = { x: p.x + dx, y: p.y + dy };
                at(p.x, p.y).m |= bit;
                at(n.x, n.y).m |= opp;
                seen.add(n.y * cols + n.x);
                open.push(n);
            }
            for (const t of tiles) for (let r = rint(4); r > 0; r--) t.m = rotate(t.m);
            if (connected().size === tiles.length) at(0, 0).m = rotate(at(0, 0).m);
            cur = { ...root };
            time = 60 * (35 + level * 10);
            lit = connected();
        }

        function turn(x, y) {
            const t = at(x, y);
            t.m = rotate(t.m);
            t.spin = 6;
            api.sfx('select');
            lit = connected();
            if (lit.size < tiles.length) return;
            score += Math.ceil(time / 60) * 10 + (level + 1) * 100;
            level++;
            banner = 90;
            api.sfx('wave');
            build();
        }

        build();
        return {
            get score() { return score; },
            get over() { return over; },
            update(inp) {
                if (banner) banner--;
                if (--time <= 0) {
                    over = true;
                    return api.sfx('die');
                }
                for (const [k, dx, dy] of [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]]) {
                    if (inp.pressed.has(k)) cur = { x: clamp(cur.x + dx, 0, cols - 1), y: clamp(cur.y + dy, 0, rows - 1) };
                }
                if (inp.pressed.has('fire')) turn(cur.x, cur.y);
                if (inp.pressed.has('tap')) {
                    const o = origin();
                    const x = Math.floor((inp.pointer.x - o.x) / T);
                    const y = Math.floor((inp.pointer.y - o.y) / T);
                    if (x >= 0 && y >= 0 && x < cols && y < rows) {
                        cur = { x, y };
                        turn(x, y);
                    }
                }
                for (const t of tiles) if (t.spin) t.spin--;
            },
            draw(ctx, frame) {
                const o = origin();
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        const t = at(x, y);
                        const px = o.x + x * T;
                        const py = o.y + y * T;
                        const on = lit.has(y * cols + x);
                        ctx.fillStyle = t.spin ? '#1b2433' : PAL.panel;
                        ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
                        ctx.fillStyle = on ? PAL.green : PAL.dim;
                        const c = T / 2;
                        if (t.m & 1) ctx.fillRect(px + c - 1, py, 2, c);
                        if (t.m & 2) ctx.fillRect(px + c, py + c - 1, c, 2);
                        if (t.m & 4) ctx.fillRect(px + c - 1, py + c, 2, c);
                        if (t.m & 8) ctx.fillRect(px, py + c - 1, c, 2);
                        const isRoot = x === root.x && y === root.y;
                        const leaf = !isRoot && [1, 2, 4, 8].includes(t.m);
                        if (isRoot) {
                            ctx.fillStyle = accentColor();
                            ctx.fillRect(px + 5, py + 6, 10, 8);
                            ctx.fillStyle = frame % 20 < 10 ? PAL.green : PAL.fg;
                            ctx.fillRect(px + 7, py + 9, 2, 2);
                            ctx.fillRect(px + 11, py + 9, 2, 2);
                        } else if (leaf) {
                            ctx.fillStyle = '#2a3242';
                            ctx.fillRect(px + 6, py + 5, 8, 10);
                            ctx.fillStyle = on ? PAL.green : frame % 30 < 15 ? PAL.red : PAL.darkred;
                            ctx.fillRect(px + 8, py + 7, 2, 2);
                            ctx.fillStyle = PAL.dim;
                            ctx.fillRect(px + 8, py + 11, 4, 1);
                        } else {
                            ctx.fillStyle = on ? PAL.green : PAL.dim;
                            ctx.fillRect(px + c - 2, py + c - 2, 4, 4);
                        }
                    }
                }
                if (frame % 30 < 22) {
                    ctx.strokeStyle = PAL.yellow;
                    ctx.strokeRect(o.x + cur.x * T + 0.5, o.y + cur.y * T + 0.5, T - 1, T - 1);
                }
                const secs = Math.ceil(time / 60);
                pixelText(ctx, `LEVEL ${level + 1}`, 4, 162, PAL.fg);
                pixelText(ctx, `TIME ${secs}`, AW / 2, 162, secs <= 10 && frame % 20 < 10 ? PAL.red : PAL.yellow, 1, 'center');
                pixelText(ctx, `LINKED ${lit.size}/${tiles.length}`, AW - 4, 162, PAL.green, 1, 'right');
                if (banner && frame % 16 < 11) pixelText(ctx, 'NETWORK UP!', AW / 2, 14, PAL.green, 2, 'center');
            },
        };
    },
};

// ---------- Drone Drop ----------

const DRONE_DROP = {
    id: 'drone',
    cmd: 'drone-drop',
    name: 'Drone Drop',
    blurb: 'Deliver servers across Kathmandu by drone. Mind gravity, fuel and the wind, and touch down gently on the glowing pad.',
    controls: 'UP/SPACE THRUST  -  LEFT/RIGHT STRAFE  -  HOLD ON TOUCH',
    create(api) {
        const GROUND = 172;
        let level = 1;
        let lives = 3;
        let score = 0;
        let over = false;
        let d;
        let fuel;
        let wind;
        let buildings;
        let pad;
        let flags;
        let status;
        let timer;
        let t = 0;
        let message = null;
        let sparks = [];

        function setup() {
            buildings = [];
            for (let x = 0; x < AW;) {
                const w = 16 + rint(22);
                buildings.push({ x, w, h: 22 + rint(66), seed: rint(1000) });
                x += w + 1 + rint(3);
            }
            buildings[0].h = Math.min(buildings[0].h, 28);
            const b = buildings[2 + rint(buildings.length - 2)];
            const w = clamp(b.w - 2 - level, 10, b.w - 2);
            pad = { x: b.x + Math.floor((b.w - w) / 2), w, y: GROUND - b.h };
            flags = Array.from({ length: 3 }, () => {
                const i = rint(buildings.length - 1);
                return [buildings[i], buildings[i + 1]];
            });
            wind = (Math.random() - 0.5) * Math.min(0.022, 0.005 * level);
            d = { x: 14, y: 26, vx: 0, vy: 0 };
            fuel = 100;
            status = 'fly';
            timer = 0;
        }

        function crash() {
            status = 'crashed';
            timer = 90;
            lives--;
            for (let i = 0; i < 24; i++) sparks.push({ x: d.x, y: d.y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2.5, life: 30 + rint(20), color: i % 2 ? PAL.yellow : PAL.red });
            message = { text: 'CRASHED', color: PAL.red };
            api.sfx('die');
        }

        setup();
        return {
            get score() { return score; },
            get over() { return over; },
            update(inp) {
                t++;
                for (const s of sparks) {
                    s.x += s.vx;
                    s.y += s.vy;
                    s.vy += 0.08;
                    s.life--;
                }
                sparks = sparks.filter((s) => s.life > 0);
                if (status !== 'fly') {
                    if (--timer > 0) return;
                    message = null;
                    if (status === 'landed') level++;
                    if (lives <= 0) over = true;
                    else setup();
                    return;
                }
                const touch = inp.pointer.down;
                const up = inp.held.has('up') || inp.held.has('fire') || touch;
                const left = inp.held.has('left') || (touch && inp.pointer.x < d.x - 10);
                const right = inp.held.has('right') || (touch && inp.pointer.x > d.x + 10);
                if (fuel > 0) {
                    if (up) {
                        d.vy -= 0.085;
                        fuel -= 0.35;
                        if (t % 2) sparks.push({ x: d.x + rint(5) - 2, y: d.y + 4, vx: (Math.random() - 0.5) * 0.6, vy: 1.2, life: 8, color: t % 4 ? '#ff8c42' : PAL.yellow });
                    }
                    if (left) d.vx -= 0.045;
                    if (right) d.vx += 0.045;
                    if (left || right) fuel -= 0.12;
                }
                fuel = Math.max(0, fuel);
                d.vy += 0.04;
                d.vx += wind * (1 + Math.sin(t * 0.03) * 0.6);
                d.vx *= 0.995;
                d.x += d.vx;
                d.y += d.vy;
                if (d.x < 5 || d.x > AW - 5) {
                    d.x = clamp(d.x, 5, AW - 5);
                    d.vx = 0;
                }
                if (d.y < 14) {
                    d.y = 14;
                    d.vy = 0;
                }
                const bottom = d.y + 3;
                if (bottom >= GROUND) return crash();
                const under = buildings.filter((b) => d.x + 4 > b.x && d.x - 4 < b.x + b.w);
                if (!under.some((b) => bottom >= GROUND - b.h)) return;
                const onPad = d.x - 4 >= pad.x && d.x + 4 <= pad.x + pad.w;
                if (onPad && d.vy < 0.9 && Math.abs(d.vx) < 0.6) {
                    const gain = 100 + Math.round(fuel) + level * 25;
                    score += gain;
                    d.y = pad.y - 3;
                    status = 'landed';
                    timer = 100;
                    message = { text: `DELIVERED +${gain}`, color: PAL.green };
                    api.sfx('power');
                } else {
                    crash();
                }
            },
            draw(ctx, frame) {
                for (let i = 0; i < 6; i++) {
                    ctx.fillStyle = mix([8, 10, 26], [36, 30, 62], i / 6);
                    ctx.fillRect(0, 10 + i * 27, AW, 27);
                }
                for (let i = 0; i < 30; i++) {
                    ctx.fillStyle = (i + Math.floor(frame / 30)) % 5 ? PAL.dim : PAL.fg;
                    ctx.fillRect((i * 67) % AW, 14 + ((i * 29) % 70), 1, 1);
                }
                // A stupa in the distance: dome, harmika with the watching eyes, and a golden spire.
                const sx = 150;
                ctx.fillStyle = '#5b5f73';
                for (let i = 0; i < 16; i++) ctx.fillRect(sx - Math.round(Math.sqrt(256 - i * i) * 1.6), 120 - i, Math.round(Math.sqrt(256 - i * i) * 3.2), 1);
                ctx.fillStyle = '#6d7186';
                ctx.fillRect(sx - 6, 98, 12, 7);
                ctx.fillStyle = '#20232e';
                ctx.fillRect(sx - 4, 101, 3, 1);
                ctx.fillRect(sx + 1, 101, 3, 1);
                ctx.fillStyle = '#b8942f';
                for (let i = 0; i < 16; i++) ctx.fillRect(sx - Math.round((16 - i) / 4), 82 + i, Math.round((16 - i) / 2) + 1, 1);
                for (const b of buildings) {
                    const top = GROUND - b.h;
                    ctx.fillStyle = '#151a26';
                    ctx.fillRect(b.x, top, b.w, b.h);
                    ctx.fillStyle = '#232a3a';
                    ctx.fillRect(b.x, top, b.w, 1);
                    for (let wy = top + 4; wy < GROUND - 3; wy += 5) {
                        for (let wx = b.x + 2; wx < b.x + b.w - 2; wx += 4) {
                            const lit = (wx * 7 + wy * 13 + b.seed) % 9 < 3;
                            ctx.fillStyle = lit ? '#e8c46a' : '#1d2433';
                            ctx.fillRect(wx, wy, 2, 2);
                        }
                    }
                }
                const colors = ['#4d7cff', '#f2f2f2', '#ff4d6d', '#7cff6b', '#ffd23f'];
                for (const [a, b] of flags) {
                    const x1 = a.x + a.w / 2;
                    const y1 = GROUND - a.h;
                    const x2 = b.x + b.w / 2;
                    const y2 = GROUND - b.h;
                    for (let i = 1; i < 8; i++) {
                        const k = i / 8;
                        ctx.fillStyle = colors[i % 5];
                        ctx.fillRect(Math.round(lerp(x1, x2, k)), Math.round(lerp(y1, y2, k) + Math.sin(k * Math.PI) * 6), 2, 2);
                    }
                }
                ctx.fillStyle = PAL.dim;
                ctx.fillRect(0, GROUND, AW, AH - GROUND);
                ctx.fillStyle = frame % 30 < 15 ? accentColor() : PAL.cyan;
                ctx.fillRect(pad.x, pad.y - 1, pad.w, 1);
                ctx.fillStyle = frame % 20 < 10 ? PAL.green : PAL.red;
                ctx.fillRect(pad.x, pad.y - 2, 1, 1);
                ctx.fillRect(pad.x + pad.w - 1, pad.y - 2, 1, 1);
                for (const s of sparks) {
                    ctx.fillStyle = s.color;
                    ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
                }
                if (status !== 'crashed') {
                    const x = Math.round(d.x);
                    const y = Math.round(d.y);
                    ctx.fillStyle = PAL.fg;
                    ctx.fillRect(x - 4, y - 1, 9, 2);
                    ctx.fillStyle = frame % 4 < 2 ? PAL.dim : PAL.fg;
                    ctx.fillRect(x - 6, y - 3, 4, 1);
                    ctx.fillRect(x + 3, y - 3, 4, 1);
                    ctx.fillStyle = PAL.yellow;
                    ctx.fillRect(x - 2, y + 1, 5, 2);
                }
                ctx.fillStyle = PAL.dim;
                ctx.fillRect(4, 14, 40, 3);
                ctx.fillStyle = fuel < 25 ? PAL.red : accentColor();
                ctx.fillRect(4, 14, Math.round(fuel * 0.4), 3);
                pixelText(ctx, 'FUEL', 48, 13, PAL.dim);
                const windText = Math.abs(wind) < 0.002 ? 'CALM' : `WIND ${wind > 0 ? '>' : '<'}${Math.abs(wind) > 0.008 ? (wind > 0 ? '>' : '<') : ''}`;
                pixelText(ctx, windText, AW / 2, 13, PAL.cyan, 1, 'center');
                pixelText(ctx, `LEVEL ${level}`, AW - 4, 13, PAL.fg, 1, 'right');
                const safe = d.vy < 0.9 && Math.abs(d.vx) < 0.6;
                pixelText(ctx, `SPEED ${Math.hypot(d.vx, d.vy).toFixed(1)}`, 4, 21, safe ? PAL.green : PAL.red);
                for (let i = 0; i < lives; i++) {
                    ctx.fillStyle = PAL.fg;
                    ctx.fillRect(AW - 8 - i * 9, 21, 6, 2);
                }
                if (message) pixelText(ctx, message.text, AW / 2, 40, message.color, 2, 'center');
            },
        };
    },
};

// ---------- Fretwork ----------

const FW_LANES = ['#ff4d6d', '#ffd23f', '#7cff6b', '#4de1ff'];
const FW_LANE_X = 68;
const FW_LANE_W = 26;
const FW_CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]]; // Am F C G

const FRETWORK = {
    id: 'fret',
    cmd: 'fretwork',
    name: 'Fretwork',
    keys: ['d', 'f', 'j', 'k'],
    blurb: "Play lead on a chiptune jam. Hit each note as it reaches the line, chain hits for a multiplier, and keep the crowd on your side.",
    controls: 'D F J K  OR  ARROWS  -  TAP THE LANES',
    create(api) {
        const BEAT = 60 / 124;
        const STEP = BEAT / 2;
        const BARS = 44;
        const HIT_Y = 150;
        const SPEED = 110;
        const LEAD = 2;
        const notes = [];
        let prev = 0;
        for (let s = 16; s < BARS * 8; s++) {
            const bar = Math.floor(s / 8);
            const p = 0.22 + Math.min(0.42, bar * 0.012);
            if (Math.random() > (s % 2 ? p * 0.55 : p + 0.18)) continue;
            prev = (prev + 1 + rint(3)) % 4;
            notes.push({ t: s * STEP, lane: prev, bar });
            if (bar > 16 && Math.random() < 0.1) notes.push({ t: s * STEP, lane: (prev + 2) % 4, bar });
        }
        const end = BARS * 8 * STEP + 1;
        let ticks = 0;
        let nextStep = 0;
        let score = 0;
        let combo = 0;
        let best = 0;
        let meter = 70;
        let over = false;
        let judge = null;
        let flashes = [0, 0, 0, 0];
        const now = () => ticks / 60 - LEAD;
        const mult = () => 1 + Math.min(3, Math.floor(combo / 10));

        // Drums and bass are scheduled slightly ahead on the audio clock, step by step.
        function band(t) {
            const a = audioOut();
            if (!a) return;
            while (nextStep * STEP < t + 0.12 && nextStep < BARS * 8) {
                const at = a.currentTime + (nextStep * STEP - t);
                const pos = nextStep % 8;
                const chord = FW_CHORDS[Math.floor(nextStep / 8 / 2) % 4];
                if (pos === 0 || pos === 4) tone(140, at, 0.14, { type: 'sine', vol: 0.09, to: 40 });
                if (pos === 2 || pos === 6) noise(at, 0.1, 0.05, 1500);
                noise(at, 0.025, 0.015, 7000);
                if ([0, 3, 4, 6].includes(pos)) tone(midiHz(chord[0] - 24), at, STEP * 0.9, { type: 'triangle', vol: 0.06 });
                nextStep++;
            }
        }

        function hit(lane) {
            const t = now();
            flashes[lane] = 8;
            const note = notes.filter((n) => n.lane === lane && !n.done && Math.abs(n.t - t) < 0.13).sort((a, b) => a.t - b.t)[0];
            if (!note) {
                meter = Math.max(0, meter - 1);
                return;
            }
            note.done = true;
            const perfect = Math.abs(note.t - t) < 0.05;
            combo++;
            best = Math.max(best, combo);
            score += (perfect ? 100 : 50) * mult();
            meter = Math.min(100, meter + 3);
            judge = { text: perfect ? 'PERFECT' : 'GOOD', color: perfect ? PAL.yellow : PAL.fg, t: 30 };
            const chord = FW_CHORDS[Math.floor(note.bar / 2) % 4];
            tone(midiHz(chord[lane] + 12), audioOut()?.currentTime ?? 0, 0.22, { type: 'square', vol: 0.035 });
        }

        return {
            get score() { return score; },
            get over() { return over; },
            get endTitle() { return now() >= end ? 'ENCORE!' : 'BOOED OFF'; },
            update(inp) {
                ticks++;
                const t = now();
                if (t > -0.2) band(t);
                const lanes = new Set();
                [['left', 0], ['down', 1], ['up', 2], ['right', 3]].forEach(([k, l]) => inp.pressed.has(k) && lanes.add(l));
                FRETWORK.keys.forEach((k, l) => inp.keys.has(k) && lanes.add(l));
                if (inp.pressed.has('touch')) lanes.add(clamp(Math.floor((inp.pointer.x - FW_LANE_X) / FW_LANE_W), 0, 3));
                for (const l of lanes) hit(l);
                for (const n of notes) {
                    if (n.done || t - n.t < 0.13) continue;
                    n.done = true;
                    n.missed = true;
                    combo = 0;
                    meter -= 4;
                    judge = { text: 'MISS', color: PAL.red, t: 30 };
                }
                flashes = flashes.map((f) => Math.max(0, f - 1));
                if (judge && --judge.t <= 0) judge = null;
                if (meter <= 0) {
                    over = true;
                    api.sfx('die');
                }
                if (t >= end) over = true;
            },
            draw(ctx, frame) {
                const t = now();
                const beat = t > 0 ? (t / BEAT) % 1 : 0;
                ctx.fillStyle = '#07060d';
                ctx.fillRect(0, 10, AW, AH - 10);
                for (let i = 0; i < 4; i++) {
                    ctx.fillStyle = `${FW_LANES[(i + Math.floor(t / BEAT / 4)) % 4]}${beat < 0.25 ? '22' : '12'}`;
                    ctx.beginPath();
                    ctx.moveTo(20 + i * 66, 10);
                    ctx.lineTo(4 + i * 66 - 20, AH);
                    ctx.lineTo(36 + i * 66 + 20, AH);
                    ctx.fill();
                }
                ctx.fillStyle = '#0d1018';
                ctx.fillRect(FW_LANE_X, 10, FW_LANE_W * 4, AH - 10);
                for (let l = 0; l <= 4; l++) {
                    ctx.fillStyle = '#1d2433';
                    ctx.fillRect(FW_LANE_X + l * FW_LANE_W, 10, 1, AH - 10);
                }
                for (let b = Math.floor(t / BEAT); b < t / BEAT + 3; b++) {
                    const y = Math.round(HIT_Y - (b * BEAT - t) * SPEED);
                    ctx.fillStyle = b % 4 ? '#161c28' : '#232c3e';
                    if (y > 10 && y < AH) ctx.fillRect(FW_LANE_X, y, FW_LANE_W * 4, 1);
                }
                for (const n of notes) {
                    if (n.done && !n.missed) continue;
                    const y = Math.round(HIT_Y - (n.t - t) * SPEED);
                    if (y < 4 || y > AH + 4) continue;
                    const x = FW_LANE_X + n.lane * FW_LANE_W + 4;
                    ctx.fillStyle = n.missed ? PAL.dim : FW_LANES[n.lane];
                    ctx.fillRect(x, y - 3, FW_LANE_W - 8, 6);
                    ctx.fillStyle = n.missed ? PAL.dim : PAL.fg;
                    ctx.fillRect(x + 2, y - 2, FW_LANE_W - 12, 1);
                }
                for (let l = 0; l < 4; l++) {
                    const x = FW_LANE_X + l * FW_LANE_W + 2;
                    ctx.strokeStyle = FW_LANES[l];
                    ctx.strokeRect(x + 0.5, HIT_Y - 4.5, FW_LANE_W - 5, 9);
                    if (flashes[l]) {
                        ctx.fillStyle = `${FW_LANES[l]}${flashes[l] > 4 ? 'cc' : '66'}`;
                        ctx.fillRect(x + 1, HIT_Y - 4, FW_LANE_W - 6, 8);
                    }
                    pixelText(ctx, FRETWORK.keys[l], x + FW_LANE_W / 2 - 3, HIT_Y + 9, PAL.dim, 1, 'center');
                }
                ctx.fillStyle = PAL.dim;
                ctx.fillRect(8, 30, 6, 120);
                ctx.fillStyle = meter > 30 ? PAL.green : PAL.red;
                ctx.fillRect(8, 30 + Math.round(120 - meter * 1.2), 6, Math.round(meter * 1.2));
                pixelText(ctx, 'CROWD', 11, 154, PAL.dim, 1, 'center');
                pixelText(ctx, `${combo}`, 204, 40, PAL.fg, 2, 'center');
                pixelText(ctx, 'COMBO', 204, 54, PAL.dim, 1, 'center');
                pixelText(ctx, `X${mult()}`, 204, 70, [PAL.fg, PAL.cyan, PAL.green, PAL.yellow][mult() - 1], 2, 'center');
                ctx.fillStyle = PAL.dim;
                ctx.fillRect(FW_LANE_X, 13, FW_LANE_W * 4, 1);
                ctx.fillStyle = accentColor();
                ctx.fillRect(FW_LANE_X, 13, Math.round(clamp(t / end, 0, 1) * FW_LANE_W * 4), 1);
                if (t < 0) pixelText(ctx, `${Math.ceil(-t)}`, AW / 2, 70, PAL.yellow, 3, 'center');
                if (judge) pixelText(ctx, judge.text, AW / 2, 112, judge.color, 2, 'center');
            },
        };
    },
};

const GAMES = [PACKET_SNAKE, FIREWALL, RIFF_RUNNER, NIGHT_SHIFT, PATCH_PANEL, DRONE_DROP, FRETWORK];

// ---------- the arcade app ----------

const KEY_MAP = {
    arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
    ' ': 'fire', enter: 'fire', z: 'fire', x: 'fire', j: 'fire', escape: 'back', p: 'pause', m: 'mute',
};

const MENU_TOP = 42;
const MENU_ROW = 17;

const hiScores = () => JSON.parse(localStorage.getItem('nsh_arcade_hi') || '{}');

function arcadeApp(startId = null) {
    let el;
    let win;
    let canvas;
    let ctx;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let frame = 0;
    let menuSel = Math.max(0, GAMES.findIndex((g) => g.id === startId));
    let current = null;
    let game = null;
    let phase = 'menu'; // menu | ready | play | paused | over
    let overAt = 0;
    let newHi = false;
    const held = new Set();
    let pressed = new Set();
    let keys = new Set();
    const pointer = { down: false, x: 0, y: 0, sx: 0, sy: 0, moved: false };
    const menuStars = Array.from({ length: 50 }, () => ({ x: rint(AW), y: rint(AH), v: 0.2 + Math.random() * 0.6 }));

    const api = { sfx: playSfx };

    function startGame(def) {
        current = def;
        game = def.create(api);
        phase = 'ready';
        refreshTitle(win);
    }

    function toMenu() {
        phase = 'menu';
        current = null;
        game = null;
        refreshTitle(win);
    }

    function finish() {
        phase = 'over';
        overAt = frame;
        const scores = hiScores();
        newHi = game.score > (scores[current.id] || 0);
        if (newHi) {
            scores[current.id] = game.score;
            localStorage.setItem('nsh_arcade_hi', JSON.stringify(scores));
            notify('New high score!', `${current.name}: ${game.score}`);
        }
    }

    // Menu and flow keys act immediately, so quick sequences like Esc, Down, Enter never get merged
    // into one frame. Returns false for keys the running game should see.
    function control(k) {
        if (k === 'mute') {
            arcadeMuted = !arcadeMuted;
            localStorage.setItem('nsh_arcade_muted', arcadeMuted ? '1' : '0');
            return true;
        }
        if (phase === 'menu') {
            if (k === 'up' || k === 'down') {
                menuSel = (menuSel + (k === 'up' ? -1 : 1) + GAMES.length) % GAMES.length;
                playSfx('select');
            } else if (k === 'tap') {
                const i = Math.floor((pointer.y - MENU_TOP) / MENU_ROW);
                if (i >= 0 && i < GAMES.length) {
                    menuSel = i;
                    startGame(GAMES[i]);
                }
            } else if (k === 'fire') {
                startGame(GAMES[menuSel]);
            }
            return true;
        }
        if (k === 'back') {
            toMenu();
            return true;
        }
        if (phase === 'ready' || phase === 'paused') {
            if (['fire', 'tap', 'pause', 'up'].includes(k)) {
                if (phase === 'ready') playSfx('start');
                phase = 'play';
            }
            return true;
        }
        if (phase === 'over') {
            if ((k === 'fire' || k === 'tap') && frame - overAt > 40) {
                startGame(current);
                phase = 'play';
                playSfx('start');
            }
            return true;
        }
        if (k === 'pause') {
            phase = 'paused';
            return true;
        }
        return false;
    }

    function tick() {
        frame++;
        if (phase === 'menu') {
            for (const s of menuStars) s.y = (s.y + s.v) % AH;
        } else if (phase === 'play') {
            game.update({ held, pressed, pointer, keys });
            if (game.over) finish();
            // A game in play holds off the screensaver, like a video player would.
            if (frame % 60 === 0) resetIdle();
        }
        pressed = new Set();
        keys = new Set();
    }

    function overlay(lines) {
        ctx.fillStyle = 'rgba(6, 8, 12, 0.78)';
        ctx.fillRect(0, 50, AW, 82);
        lines.forEach(([text, y, color, scale = 1]) => pixelText(ctx, text, AW / 2, y, color, scale, 'center'));
    }

    function render() {
        const accent = accentColor();
        ctx.fillStyle = PAL.bg;
        ctx.fillRect(0, 0, AW, AH);
        if (phase === 'menu') {
            for (const s of menuStars) {
                ctx.fillStyle = s.v > 0.6 ? PAL.fg : PAL.dim;
                ctx.fillRect(s.x, s.y, 1, 1);
            }
            pixelText(ctx, 'NEOX ARCADE', AW / 2, 13, accent, 3, 'center');
            pixelText(ctx, 'ORIGINAL RETRO GAMES', AW / 2, 32, PAL.dim, 1, 'center');
            const scores = hiScores();
            GAMES.forEach((g, i) => {
                const y = MENU_TOP + i * MENU_ROW;
                const on = i === menuSel;
                if (on) {
                    ctx.fillStyle = accent;
                    ctx.fillRect(20, y, AW - 40, MENU_ROW - 2);
                    ctx.fillStyle = PAL.bg;
                    ctx.fillRect(21, y + 1, AW - 42, MENU_ROW - 4);
                }
                pixelText(ctx, `${on && frame % 40 < 28 ? '>' : ' '} ${g.name}`, 26, y + 2, on ? PAL.fg : PAL.dim, 2);
                pixelText(ctx, `HI ${scores[g.id] || 0}`, AW - 26, y + 5, on ? PAL.yellow : PAL.dim, 1, 'right');
            });
            pixelText(ctx, 'ENTER PLAY   M SOUND   ALT+F FULLSCREEN', AW / 2, AH - 10, PAL.dim, 1, 'center');
            return;
        }
        game.draw(ctx, frame);
        ctx.fillStyle = PAL.bg;
        ctx.fillRect(0, 0, AW, 10);
        pixelText(ctx, `SCORE ${game.score}`, 4, 3, PAL.fg);
        pixelText(ctx, `HI ${Math.max(game.score, hiScores()[current.id] || 0)}`, AW / 2, 3, PAL.yellow, 1, 'center');
        pixelText(ctx, soundOff() ? 'SOUND OFF' : 'ESC MENU', AW - 4, 3, PAL.dim, 1, 'right');
        if (phase === 'ready') {
            overlay([[current.name, 58, accent, 2], [current.controls, 80, PAL.fg], ['P PAUSE   M SOUND   ESC MENU', 94, PAL.dim],
                [frame % 40 < 28 ? 'PRESS SPACE OR TAP TO START' : '', 114, PAL.yellow]]);
        } else if (phase === 'paused') {
            overlay([['PAUSED', 70, PAL.fg, 3], [frame % 40 < 28 ? 'SPACE OR TAP TO RESUME' : '', 104, PAL.yellow]]);
        } else if (phase === 'over') {
            const title = game.endTitle || 'GAME OVER';
            overlay([[title, 58, title === 'GAME OVER' || title === 'BOOED OFF' ? PAL.red : PAL.green, 3], [`SCORE ${game.score}`, 86, PAL.fg, 2], [newHi ? 'NEW HIGH SCORE!' : '', 102, PAL.yellow],
                [frame - overAt > 40 && frame % 40 < 28 ? 'SPACE RETRY   ESC MENU' : '', 116, PAL.dim]]);
        }
    }

    function loop(ts) {
        raf = requestAnimationFrame(loop);
        acc += clamp(ts - (last || ts), 0, 100);
        last = ts;
        // Switching windows, workspaces or tabs pauses the game.
        const active = wm.focused === win && !document.hidden && saverEl.hidden;
        if (!active && phase === 'play') phase = 'paused';
        while (acc >= STEP) {
            acc -= STEP;
            tick();
        }
        render();
    }

    function fit() {
        const box = el.querySelector('.arcade-stage');
        const scale = Math.min(box.clientWidth / AW, box.clientHeight / AH);
        // Whole-number scaling keeps pixels crisp on big windows; small screens just fill the space.
        const s = scale >= 2 ? Math.floor(scale) : scale;
        canvas.style.width = `${AW * s}px`;
        canvas.style.height = `${AH * s}px`;
    }

    function toGame(e) {
        const r = canvas.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * AW, y: ((e.clientY - r.top) / r.height) * AH };
    }

    return {
        cls: 'arcade',
        title: () => (current ? `${current.name} — Neox Arcade` : 'Neox Arcade'),
        mount(node, w) {
            el = node;
            win = w;
            el.tabIndex = 0;
            el.innerHTML = '<div class="arcade-stage"><canvas width="240" height="180"></canvas></div>';
            canvas = el.querySelector('canvas');
            ctx = canvas.getContext('2d');
            new ResizeObserver(fit).observe(el.querySelector('.arcade-stage'));
            fit();
            el.addEventListener('keydown', (e) => {
                if (e.altKey || e.ctrlKey || e.metaKey) return;
                const raw = e.key.toLowerCase();
                if (phase === 'play' && current?.keys?.includes(raw)) {
                    e.preventDefault();
                    if (!e.repeat) keys.add(raw);
                    return;
                }
                const k = KEY_MAP[raw];
                if (!k) return;
                e.preventDefault();
                if (!e.repeat && !control(k)) pressed.add(k);
                held.add(k);
            });
            el.addEventListener('keyup', (e) => held.delete(KEY_MAP[e.key.toLowerCase()]));
            el.addEventListener('blur', () => held.clear());
            // Double-click toggles fullscreen for mouse players, outside of play so quick clicks stay game input.
            canvas.addEventListener('dblclick', () => phase !== 'play' && toggleFullscreen('full'));
            canvas.addEventListener('pointerdown', (e) => {
                Object.assign(pointer, toGame(e), { down: true, moved: false });
                pointer.sx = pointer.x;
                pointer.sy = pointer.y;
                canvas.setPointerCapture(e.pointerId);
                el.focus({ preventScroll: true });
                // Rhythm games need the moment of touch, not of release.
                if (phase === 'play') pressed.add('touch');
            });
            canvas.addEventListener('pointermove', (e) => {
                Object.assign(pointer, toGame(e));
                if (!pointer.down) return;
                const dx = pointer.x - pointer.sx;
                const dy = pointer.y - pointer.sy;
                // Swipes become direction presses, for Packet Snake on phones.
                if (Math.hypot(dx, dy) > 14) {
                    pressed.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
                    pointer.sx = pointer.x;
                    pointer.sy = pointer.y;
                    pointer.moved = true;
                }
            });
            canvas.addEventListener('pointerup', () => {
                if (!pointer.moved && !control('tap')) pressed.add('tap');
                pointer.down = false;
            });
            if (startId) startGame(GAMES[menuSel]);
            raf = requestAnimationFrame(loop);
        },
        focus() {
            el.focus({ preventScroll: true });
        },
        cleanup() {
            cancelAnimationFrame(raf);
        },
    };
}

// ---------- bruteforce (terminal) ----------

async function cmdBruteforce() {
    const pin = [...'0123456789ABCDEF'].sort(() => Math.random() - 0.5).slice(0, 4).join('');
    print([
        c('ok', 'BRUTEFORCE v1.0') + c('dim', ' — authorised targets only, obviously'),
        'Crack the 4-digit hex PIN in 10 attempts. Digits are unique (0-9, A-F).',
        `${c('ok', '●')} right digit, right place   ${c('y', '○')} right digit, wrong place   ${c('dim', 'Ctrl+C to give up')}`,
        '',
    ]);
    for (let n = 1; n <= 10; n++) {
        let guess;
        for (;;) {
            guess = (await ask(`attempt ${n}/10> `)).trim().toUpperCase();
            if (state.abort) return;
            if (/^[0-9A-F]{4}$/.test(guess) && new Set(guess).size === 4) break;
            print(c('err', '  need 4 unique hex digits, e.g. 3F9A'));
        }
        const exact = [...guess].filter((d, i) => pin[i] === d).length;
        const near = [...guess].filter((d, i) => pin[i] !== d && pin.includes(d)).length;
        print(`  ${esc(guess)}  ${c('ok', '●'.repeat(exact))}${c('y', '○'.repeat(near))}${exact + near ? '' : c('dim', '·')}`);
        if (exact === 4) {
            ctfSolve('pin');
            const scores = hiScores();
            const best = !scores.bruteforce || n < scores.bruteforce;
            if (best) {
                scores.bruteforce = n;
                localStorage.setItem('nsh_arcade_hi', JSON.stringify(scores));
            }
            return [c('ok', `ACCESS GRANTED in ${n} attempt${n === 1 ? '' : 's'}.`) + (best ? c('hl', ' New personal best!') : c('dim', ` Best: ${scores.bruteforce}.`))];
        }
    }
    state.status = 1;
    return [c('err', `LOCKED OUT. The PIN was ${pin}.`)];
}

// ---------- launcher, keybinding, commands ----------

LAUNCH.splice(6, 0,
    { name: 'Neox Arcade', hint: 'Alt+G', action: () => openApp(arcadeApp()) },
    ...GAMES.map((g) => ({ name: g.name, hint: 'game', action: () => openApp(arcadeApp(g.id)) })),
);
KEYBINDS.splice(7, 0, ['Alt+G', 'Neox Arcade (games)']);

window.addEventListener('keydown', (e) => {
    if (shared.booting || desktopEl.hidden || !launcherEl.hidden || !e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.code !== 'KeyG') return;
    e.preventDefault();
    e.stopPropagation();
    openApp(arcadeApp());
}, true);

const openGame = (id) => () => void openApp(arcadeApp(id), { fromCommand: true });

function cmdGames() {
    const scores = hiScores();
    return [
        c('hl', 'Neox Arcade') + c('dim', ' — original retro games (Alt+G)'),
        ...GAMES.map((g) => `  ${c('exe', g.cmd.padEnd(14))}${g.name.padEnd(14)}${c('dim', `hi ${scores[g.id] || 0}`)}`),
        `  ${c('exe', 'bruteforce'.padEnd(14))}${'Code breaker'.padEnd(14)}${c('dim', scores.bruteforce ? `best ${scores.bruteforce} tries` : 'runs in this terminal')}`,
    ];
}

Object.assign(COMMANDS, {
    games: { group: 'Games', usage: 'games', desc: 'list the games and your high scores', run: cmdGames },
    arcade: { group: 'Games', usage: 'arcade', desc: 'open Neox Arcade', run: openGame(null) },
    'packet-snake': { group: 'Games', usage: 'packet-snake', desc: 'route a packet, dodge the firewalls', run: openGame('snake') },
    snake: { group: 'Hidden', usage: 'snake', desc: 'Packet Snake', run: openGame('snake') },
    firewall: { group: 'Games', usage: 'firewall', desc: 'defend the network from waves of malware', run: openGame('firewall') },
    'riff-runner': { group: 'Games', usage: 'riff-runner', desc: 'endless runner across a guitar fretboard', run: openGame('runner') },
    'night-shift': { group: 'Games', usage: 'night-shift', desc: 'build by day, defend the datacenter by night', run: openGame('nightshift') },
    'patch-panel': { group: 'Games', usage: 'patch-panel', desc: 'rotate cables to wire every server to the router', run: openGame('patch') },
    'drone-drop': { group: 'Games', usage: 'drone-drop', desc: 'land a delivery drone on Kathmandu rooftops', run: openGame('drone') },
    fretwork: { group: 'Games', usage: 'fretwork', desc: 'rhythm game: play lead on a chiptune jam', run: openGame('fret') },
    bruteforce: { group: 'Games', usage: 'bruteforce', desc: 'crack a hex PIN by deduction, right here in the terminal', run: cmdBruteforce },
});
