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

const GAMES = [PACKET_SNAKE, FIREWALL, RIFF_RUNNER];

// ---------- the arcade app ----------

const KEY_MAP = {
    arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
    ' ': 'fire', enter: 'fire', z: 'fire', x: 'fire', j: 'fire', escape: 'back', p: 'pause', m: 'mute',
};

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
                const i = Math.floor((pointer.y - 62) / 28);
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
            game.update({ held, pressed, pointer });
            if (game.over) finish();
        }
        pressed = new Set();
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
            pixelText(ctx, 'NEOX ARCADE', AW / 2, 14, accent, 3, 'center');
            pixelText(ctx, 'ORIGINAL RETRO GAMES', AW / 2, 36, PAL.dim, 1, 'center');
            const scores = hiScores();
            GAMES.forEach((g, i) => {
                const y = 62 + i * 28;
                const on = i === menuSel;
                if (on) {
                    ctx.fillStyle = accent;
                    ctx.fillRect(20, y, AW - 40, 22);
                    ctx.fillStyle = PAL.bg;
                    ctx.fillRect(21, y + 1, AW - 42, 20);
                }
                pixelText(ctx, `${on && frame % 40 < 28 ? '>' : ' '} ${g.name}`, 28, y + 6, on ? PAL.fg : PAL.dim, 2);
                pixelText(ctx, `HI ${scores[g.id] || 0}`, AW - 26, y + 14, on ? PAL.yellow : PAL.dim, 1, 'right');
            });
            pixelText(ctx, 'ENTER PLAY   M SOUND   ALT+W QUIT', AW / 2, AH - 10, PAL.dim, 1, 'center');
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
            overlay([['GAME OVER', 58, PAL.red, 3], [`SCORE ${game.score}`, 86, PAL.fg, 2], [newHi ? 'NEW HIGH SCORE!' : '', 102, PAL.yellow],
                [frame - overAt > 40 && frame % 40 < 28 ? 'SPACE RETRY   ESC MENU' : '', 116, PAL.dim]]);
        }
    }

    function loop(ts) {
        raf = requestAnimationFrame(loop);
        acc += Math.min(100, ts - (last || ts));
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
                const k = KEY_MAP[e.key.toLowerCase()];
                if (!k) return;
                e.preventDefault();
                if (!e.repeat && !control(k)) pressed.add(k);
                held.add(k);
            });
            el.addEventListener('keyup', (e) => held.delete(KEY_MAP[e.key.toLowerCase()]));
            el.addEventListener('blur', () => held.clear());
            canvas.addEventListener('pointerdown', (e) => {
                Object.assign(pointer, toGame(e), { down: true, moved: false });
                pointer.sx = pointer.x;
                pointer.sy = pointer.y;
                canvas.setPointerCapture(e.pointerId);
                el.focus({ preventScroll: true });
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
        ...GAMES.map((g) => `  ${c('exe', `${g.id === 'snake' ? 'packet-snake' : g.id === 'runner' ? 'riff-runner' : g.id}`.padEnd(14))}${g.name.padEnd(14)}${c('dim', `hi ${scores[g.id] || 0}`)}`),
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
    bruteforce: { group: 'Games', usage: 'bruteforce', desc: 'crack a hex PIN by deduction, right here in the terminal', run: cmdBruteforce },
});
