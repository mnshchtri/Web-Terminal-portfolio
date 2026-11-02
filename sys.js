'use strict';

// System tools, networking, DevOps toys, the top bar, themes and the root challenge.

// ---------- simulated machine ----------

const SYS = {
    memTotal: 15872, // MiB
    cpu: Array.from({ length: Math.min(navigator.hardwareConcurrency || 8, 16) }, () => 2 + Math.random() * 8),
    procs: [
        [1, 'root', 0.0, 0.1, '/sbin/init'],
        [312, 'root', 0.0, 0.2, '/usr/lib/systemd/systemd-journald'],
        [348, 'root', 0.0, 0.1, '/usr/lib/systemd/systemd-udevd'],
        [360, 'systemd-resolve', 0.0, 0.1, '/usr/lib/systemd/systemd-resolved'],
        [380, 'root', 0.1, 0.1, '/usr/lib/iwd/iwd'],
        [401, 'root', 0.0, 0.1, 'sshd: /usr/bin/sshd -D'],
        [420, 'root', 0.4, 0.6, '/usr/bin/dockerd -H fd://'],
        [433, 'root', 0.3, 0.3, '/usr/bin/containerd'],
        [450, 'root', 0.1, 0.2, 'nginx: master process /usr/bin/nginx'],
        [470, 'postgres', 0.2, 1.1, '/usr/bin/postgres -D /var/lib/postgres/data'],
        [512, 'root', 1.2, 0.9, '/usr/bin/kubelet --config=/var/lib/kubelet/config.yaml'],
        [530, 'wazuh', 0.3, 0.2, '/var/ossec/bin/wazuh-agentd'],
        [601, 'neox', 2.4, 1.9, 'Hyprland'],
        [622, 'neox', 0.6, 0.3, 'waybar'],
        [640, 'neox', 0.7, 0.4, '/usr/bin/pipewire'],
        [655, 'neox', 0.2, 0.2, '/usr/bin/wireplumber'],
        [666, 'neox', 0.0, 0.0, 'curiosity --never-stop'],
        [700, 'neox', 1.6, 2.1, '/usr/bin/infra-eye --agentless'],
        [714, 'neox', 0.9, 1.3, 'deployforge-api --port 8443'],
        [1336, 'neox', 0.0, 0.1, 'nsh-relay --port 1337'],
        [1337, GUEST, 0.0, 0.1, '-nsh'],
    ].map(([pid, user, cpu, mem, cmd]) => ({ pid, user, base: cpu, cpu, mem, cmd, time: Math.random() * 400 })),
    tick() {
        this.cpu = this.cpu.map((v) => Math.min(70, Math.max(0.5, v * 0.6 + (2 + Math.random() * 14) * 0.4)));
        for (const p of this.procs) {
            p.cpu = p.base * (0.3 + Math.random() * 1.6);
            p.time += p.cpu * 0.015;
        }
    },
    cpuAvg() {
        return this.cpu.reduce((a, b) => a + b, 0) / this.cpu.length;
    },
    memUsed() {
        return 2900 + this.procs.reduce((sum, p) => sum + p.mem, 0) / 100 * this.memTotal;
    },
    load() {
        const l = (this.cpuAvg() / 100) * this.cpu.length;
        return [l, l * 0.8, l * 0.6].map((n) => n.toFixed(2));
    },
};
setInterval(() => SYS.tick(), 1500);

const dynamic = (fn) => ({ type: 'file', get content() { return fn(); }, set content(_) {} });

FS.children.proc = {
    type: 'dir',
    children: {
        cpuinfo: dynamic(() => SYS.cpu.map((_, i) => `processor\t: ${i}\nvendor_id\t: AuthenticAMD\nmodel name\t: AMD Ryzen 7 7840U w/ Radeon 780M Graphics\ncpu MHz\t\t: ${(1400 + Math.random() * 3700).toFixed(3)}\ncache size\t: 1024 KB\n`).join('\n')),
        meminfo: dynamic(() => {
            const kb = (mib) => `${String(Math.round(mib * 1024)).padStart(8)} kB`;
            return `MemTotal:       ${kb(SYS.memTotal)}\nMemFree:        ${kb(SYS.memTotal - SYS.memUsed() - 1400)}\nMemAvailable:   ${kb(SYS.memTotal - SYS.memUsed())}\nCached:         ${kb(1400)}\nSwapTotal:      ${kb(8192)}\nSwapFree:       ${kb(8192)}\n`;
        }),
        uptime: dynamic(() => `${((Date.now() - BOOT_TIME) / 1000).toFixed(2)} ${((Date.now() - BOOT_TIME) / 1000 * SYS.cpu.length * 0.9).toFixed(2)}\n`),
        loadavg: dynamic(() => `${SYS.load().join(' ')} 1/${SYS.procs.length + 300} 1400\n`),
        version: dynamic(() => `Linux version ${KERNEL} (neox@neox) (gcc (GCC) 15.2.1, GNU ld 2.45) #1 SMP PREEMPT_DYNAMIC\n`),
    },
};

// ---------- themes ----------

const THEMES = ['yozakura', 'win-palette', 'tokyo-night', 'catppuccin', 'gruvbox', 'nord', 'everforest', 'rose-pine', 'matrix'];
const THEME_WALLPAPERS = { yozakura: 'yozakura', 'win-palette': 'win-palette' };
const currentTheme = () => (THEMES.includes(document.documentElement.dataset.theme) ? document.documentElement.dataset.theme : THEMES[0]);

function cmdTheme({ args }) {
    let name = args[0] === 'set' ? args[1] : args[0];
    if (name === 'next') name = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    if (!name || name === 'list') {
        return THEMES.map((t) => (t === currentTheme() ? `${c('ok', '*')} ${c('hl', t)}` : `  ${t}`));
    }
    if (!THEMES.includes(name)) return err(`theme: unknown theme '${name}' (try: theme list)`);
    document.documentElement.dataset.theme = name;
    localStorage.setItem('nsh_theme', name);
    // Like omarchy-theme-set, a theme that ships its own background brings it along.
    if (THEME_WALLPAPERS[name]) setWallpaper(THEME_WALLPAPERS[name]);
    return [`Theme set to ${c('hl', name)}`];
}

// ---------- system info ----------

function cmdUptime() {
    return [` ${new Date().toTimeString().slice(0, 8)} up ${fmtUptime()},  1 user,  load average: ${SYS.load().join(', ')}`];
}

function cmdPs({ args }) {
    const all = args.some((a) => /a|x|e/.test(a));
    if (!all) {
        return ['    PID TTY          TIME CMD', `   1337 pts/0    00:00:00 nsh`, `   ${1400 + (Date.now() % 97)} pts/0    00:00:00 ps`];
    }
    const rows = SYS.procs.map((p) => {
        const rss = Math.round((p.mem / 100) * SYS.memTotal * 1024 + 2048);
        const tty = p.pid === 1337 ? 'pts/0' : '?';
        const start = new Date(BOOT_TIME).toTimeString().slice(0, 5);
        const time = `${Math.floor(p.time / 60)}:${String(Math.floor(p.time % 60)).padStart(2, '0')}`;
        return `${p.user.padEnd(9)}${String(p.pid).padStart(6)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(rss * 3).padStart(7)} ${String(rss).padStart(6)} ${tty.padEnd(8)} ${p.cpu > 2 ? 'R' : 'S'}s   ${start}   ${time.padStart(5)} ${p.cmd}`;
    });
    return ['USER         PID %CPU %MEM     VSZ    RSS TTY      STAT START   TIME COMMAND', ...rows.map(esc)];
}

async function cmdKill({ args }) {
    const pids = args.filter((a) => /^\d+$/.test(a)).map(Number);
    if (!pids.length) return err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]');
    for (const pid of pids) {
        const proc = SYS.procs.find((p) => p.pid === pid);
        if (!proc) {
            err(`kill: (${pid}) - No such process`);
        } else if (proc.user !== state.user && !isRoot()) {
            err(`kill: (${pid}) - Operation not permitted`);
        } else if (pid === 1) {
            return meltdown(false);
        } else if (pid === 1337) {
            return cmdExit();
        } else if (pid === 666) {
            print(c('dim', 'curiosity --never-stop respawned (pid 666). Some things you just can\'t kill.'));
        } else {
            SYS.procs.splice(SYS.procs.indexOf(proc), 1);
            journal('kernel', `process ${pid} (${proc.cmd.split(' ')[0]}) killed by signal 15`);
        }
    }
}

function cmdFree() {
    const gi = (mib) => (mib >= 1024 ? `${(mib / 1024).toFixed(1)}Gi` : `${Math.round(mib)}Mi`);
    const used = SYS.memUsed();
    const row = (label, cells) => label.padEnd(8) + cells.map((v) => v.padStart(12)).join('');
    return [
        '               total        used        free      shared  buff/cache   available',
        row('Mem:', [gi(SYS.memTotal), gi(used), gi(SYS.memTotal - used - 1400), gi(512), gi(1400), gi(SYS.memTotal - used)]),
        row('Swap:', [gi(8192), '0B', gi(8192)]),
    ];
}

function cmdDf() {
    return [
        ['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'],
        ['/dev/mapper/root', '476G', '182G', '292G', '39%', '/'],
        ['devtmpfs', '4.0M', '0', '4.0M', '0%', '/dev'],
        ['tmpfs', '7.8G', '12M', '7.8G', '1%', '/dev/shm'],
        ['tmpfs', '7.8G', '4.0K', '7.8G', '1%', '/tmp'],
        ['/dev/nvme0n1p1', '1022M', '214M', '809M', '21%', '/boot'],
    ].map(([fs, ...cols]) => fs.padEnd(17) + cols.slice(0, 4).map((v) => v.padStart(5)).join(' ') + ' ' + cols[4]);
}

function cmdLsblk() {
    return [
        'NAME        MAJ:MIN RM   SIZE RO TYPE  MOUNTPOINTS',
        'nvme0n1     259:0    0 476.9G  0 disk',
        '├─nvme0n1p1 259:1    0     1G  0 part  /boot',
        '└─nvme0n1p2 259:2    0 475.9G  0 part',
        '  └─root    254:0    0 475.9G  0 crypt /',
    ];
}

function cmdWho() {
    const d = new Date(BOOT_TIME);
    const stamp = `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
    return [`${GUEST.padEnd(9)}pts/0        ${stamp} (127.0.0.1)`];
}

function cmdCal() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const title = `${now.toLocaleString('en-US', { month: 'long' })} ${y}`;
    const out = [' '.repeat(Math.floor((20 - title.length) / 2)) + title, 'Su Mo Tu We Th Fr Sa'];
    let week = Array(new Date(y, m, 1).getDay()).fill('  ');
    const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
        const cell = String(d).padStart(2);
        week.push(d === now.getDate() ? c('inverse', cell) : cell);
        if (week.length === 7 || d === days) {
            out.push(week.join(' '));
            week = [];
        }
    }
    return out;
}

function cmdDmesg() {
    if (!isRoot()) return err('dmesg: read kernel buffer failed: Operation not permitted');
    const lines = [
        `Linux version ${KERNEL} (neox@neox) (gcc (GCC) 15.2.1) #1 SMP PREEMPT_DYNAMIC`,
        'Command line: initrd=\\initramfs-linux.img cryptdevice=PARTUUID=4e1d:root root=/dev/mapper/root rw quiet',
        'x86/fpu: Supporting XSAVE feature 0x001: \'x87 floating point registers\'',
        `smpboot: Allowing ${SYS.cpu.length} CPUs, 0 hotplug CPUs`,
        'Memory: 16252928K/16777216K available',
        'nvme nvme0: 16/0/0 default/read/poll queues',
        ' nvme0n1: p1 p2',
        'device-mapper: crypt: xts(aes) using implementation "xts-aes-vaes-avx2"',
        'EXT4-fs (dm-0): mounted filesystem with ordered data mode.',
        'iwlwifi 0000:01:00.0: Detected Intel(R) Wi-Fi 6E AX211 160MHz',
        'docker0: port 1(veth3f2a1c9) entered forwarding state',
        'nf_tables: (C) 2007-2009 Patrick McHardy <kaber@trash.net>',
    ];
    return lines.map((l, i) => `${c('ok', `[${(i * 0.37 + i * i * 0.05).toFixed(6).padStart(12)}]`)} ${esc(l)}`);
}

// ---------- services & logs ----------

const UNITS = {
    sshd: { desc: 'OpenSSH Daemon', pid: 401, bin: '/usr/bin/sshd -D' },
    docker: { desc: 'Docker Application Container Engine', pid: 420, bin: '/usr/bin/dockerd -H fd://' },
    containerd: { desc: 'containerd container runtime', pid: 433, bin: '/usr/bin/containerd' },
    nginx: { desc: 'A high performance web server and a reverse proxy server', pid: 450, bin: 'nginx: master process /usr/bin/nginx' },
    postgresql: { desc: 'PostgreSQL database server', pid: 470, bin: '/usr/bin/postgres -D /var/lib/postgres/data' },
    kubelet: { desc: 'kubelet: The Kubernetes Node Agent', pid: 512, bin: '/usr/bin/kubelet' },
    'wazuh-agent': { desc: 'Wazuh agent', pid: 530, bin: '/var/ossec/bin/wazuh-agentd' },
    'infra-eye': { desc: 'InfraEye agentless collector', pid: 700, bin: '/usr/bin/infra-eye --agentless' },
    iwd: { desc: 'Wireless service', pid: 380, bin: '/usr/lib/iwd/iwd' },
    nftables: { desc: 'Netfilter Tables', oneshot: true },
    bluetooth: { desc: 'Bluetooth service', pid: 395, bin: '/usr/lib/bluetooth/bluetoothd' },
    'systemd-journald': { desc: 'Journal Service', pid: 312, bin: '/usr/lib/systemd/systemd-journald' },
    'systemd-resolved': { desc: 'Network Name Resolution', pid: 360, bin: '/usr/lib/systemd/systemd-resolved' },
};
for (const unit of Object.values(UNITS)) unit.active = true;

const unitName = (arg) => arg.replace(/\.service$/, '');

async function cmdSystemctl({ args }) {
    const [verb = 'list-units', target] = args.filter((a) => !a.startsWith('-'));
    if (verb === 'list-units') {
        const rows = Object.entries(UNITS).map(([n, u]) => {
            const sub = !u.active ? 'dead' : u.oneshot ? 'exited' : 'running';
            return `  ${`${n}.service`.padEnd(26)} loaded ${(u.active ? 'active' : 'inactive').padEnd(8)} ${sub.padEnd(7)} ${u.desc}`;
        });
        return ['  UNIT                       LOAD   ACTIVE   SUB     DESCRIPTION', ...rows.map(esc), '', `${rows.length} loaded units listed.`];
    }
    if (!target) return err(`Too few arguments.`);
    const name = unitName(target);
    const unit = UNITS[name];
    if (verb === 'status') {
        if (!unit) return err(`Unit ${name}.service could not be found.`);
        const since = fmtDate(new Date(BOOT_TIME));
        const dot = unit.active ? c('ok', '●') : '○';
        const out = [
            `${dot} ${esc(name)}.service - ${esc(unit.desc)}`,
            `     Loaded: loaded (/usr/lib/systemd/system/${esc(name)}.service; enabled; preset: disabled)`,
            `     Active: ${unit.active ? c('ok', unit.oneshot ? 'active (exited)' : 'active (running)') : 'inactive (dead)'} since ${since}; ${fmtUptime()} ago`,
        ];
        if (unit.active && !unit.oneshot) {
            out.push(
                `   Main PID: ${unit.pid} (${esc(unit.bin.split(' ')[0].split('/').pop().replace(':', ''))})`,
                `      Tasks: ${3 + (unit.pid % 9)} (limit: 18898)`,
                `     Memory: ${(12 + (unit.pid % 60)).toFixed(1)}M (peak: ${(20 + (unit.pid % 70)).toFixed(1)}M)`,
                `     CGroup: /system.slice/${esc(name)}.service`,
                `             └─${unit.pid} ${esc(unit.bin)}`,
            );
        }
        return out;
    }
    if (!['start', 'stop', 'restart', 'enable', 'disable', 'reload'].includes(verb)) return err(`Unknown command verb '${verb}'.`);
    if (!unit) return err(`Failed to ${verb} ${name}.service: Unit ${name}.service not found.`);
    if (!isRoot()) {
        // polkit lets an admin authorise the action, which makes neox's leaked password useful here too.
        print([
            c('hl', '==== AUTHENTICATING FOR org.freedesktop.systemd1.manage-units ===='),
            `Authentication is required to ${verb} '${esc(name)}.service'.`,
            'Authenticating as: Manish Karki (neox)',
        ]);
        const pw = await ask('Password: ', true);
        if (state.abort) return;
        await sleep(700);
        if (!isNeoxPassword(pw)) {
            print(c('err', '==== AUTHENTICATION FAILED ===='));
            return err(`Failed to ${verb} ${name}.service: Access denied`);
        }
        print(c('ok', '==== AUTHENTICATION COMPLETE ===='));
    }
    if (verb === 'stop') unit.active = false;
    if (verb === 'start' || verb === 'restart') unit.active = true;
    const done = { start: 'Started', stop: 'Stopped', restart: 'Started', reload: 'Reloaded' }[verb];
    if (done) journal('systemd', `${done} ${unit.desc}.`);
}

function cmdJournalctl({ args, piped }) {
    const { opts } = parseFlags(args);
    const uIdx = args.indexOf('-u');
    const unitFilter = uIdx >= 0 ? unitName(args[uIdx + 1] || '') : null;
    const privileged = isRoot() || state.user === 'neox';
    const fmt = (t) => `${fmtTime(t).slice(0, 6)} ${t.toTimeString().slice(0, 8)}`;
    const entries = [
        ...BOOT_UNITS.map((u, i) => ({ time: new Date(BOOT_TIME - (BOOT_UNITS.length - i) * 90), unit: 'systemd', msg: `${u}.` })),
        ...shared.journal,
    ].filter((e) => privileged || e.unit === 'systemd-logind')
        .filter((e) => !unitFilter || e.unit === unitFilter || e.msg.toLowerCase().includes(UNITS[unitFilter]?.desc.toLowerCase() ?? unitFilter));
    const lines = entries.map((e) => `${c('dim', fmt(e.time))} ${HOST} ${c('p', esc(e.unit))}[${e.unit === 'systemd' ? 1 : 1300 + (e.msg.length % 90)}]: ${esc(e.msg)}`);
    const out = opts.n ? lines.slice(-opts.n) : lines;
    if (!privileged) {
        out.unshift(c('dim', 'Hint: You are currently not seeing messages from other users and the system.'),
            c('dim', "      Users in groups 'adm', 'systemd-journal', 'wheel' can see all messages."));
    }
    if (!out.length) out.push('-- No entries --');
    return piped || args.includes('-n') || args.includes('-u') ? out : openPager(out, 'journalctl');
}

// ---------- networking ----------

const HOSTS = {
    localhost: '127.0.0.1', neox: '127.0.1.1', 'github.com': '140.82.121.4', 'google.com': '142.250.183.14',
    'cloudflare.com': '104.16.132.229', 'one.one.one.one': '1.1.1.1', 'archlinux.org': '95.217.163.246',
};

function resolve(host) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
    if (HOSTS[host]) return HOSTS[host];
    if (!/\.[a-z]{2,}$/i.test(host)) return null;
    let h = 0;
    for (const ch of host) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `${(h >> 24 & 127) + 20}.${h >> 16 & 255}.${h >> 8 & 255}.${(h & 253) + 1}`;
}

async function cmdPing({ args }) {
    const { rest, opts } = parseFlags(args.map((a) => (a === '-c' ? '-n' : a)));
    const count = opts.n ?? Infinity;
    const host = rest[0];
    if (!host) return err('ping: usage error: Destination address required');
    const ip = resolve(host);
    if (!ip) return err(`ping: ${host}: Name or service not known`);
    const local = ip.startsWith('127.');
    const base = local ? 0.04 : 8 + (parseInt(ip.split('.')[1], 10) % 60);
    print(`PING ${esc(host)} (${ip}) 56(84) bytes of data.`);
    const times = [];
    const started = Date.now();
    while (times.length < count && !state.abort) {
        const t = base * (0.85 + Math.random() * 0.4);
        times.push(t);
        print(`64 bytes from ${esc(local || HOSTS[host] ? host : ip)} (${ip}): icmp_seq=${times.length} ttl=${local ? 64 : 57} time=${t.toFixed(local ? 3 : 1)} ms`);
        if (times.length < count) {
            await new Promise((r) => {
                const until = Date.now() + 1000;
                const poll = setInterval(() => (state.abort || Date.now() > until) && (clearInterval(poll), r()), 50);
            });
        }
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const mdev = Math.sqrt(times.reduce((a, b) => a + (b - avg) ** 2, 0) / times.length);
    print([
        `--- ${esc(host)} ping statistics ---`,
        `${times.length} packets transmitted, ${times.length} received, 0% packet loss, time ${Date.now() - started}ms`,
        `rtt min/avg/max/mdev = ${[Math.min(...times), avg, Math.max(...times), mdev].map((n) => n.toFixed(3)).join('/')} ms`,
    ]);
}

function cmdIp({ args }) {
    const sub = args[0] || '';
    if ('route'.startsWith(sub) && sub) {
        return [
            'default via 192.168.1.1 dev wlan0 proto dhcp src 192.168.1.42 metric 600',
            '172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown',
            '192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.42 metric 600',
        ];
    }
    if (!sub || !['a', 'addr', 'address'].includes(sub)) return err('Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\n       where  OBJECT := { address | route }');
    const ifc = (n) => c('p', n);
    return [
        `1: ${ifc('lo')}: &lt;LOOPBACK,UP,LOWER_UP&gt; mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000`,
        '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00',
        `    inet ${c('y', '127.0.0.1')}/8 scope host lo`,
        '       valid_lft forever preferred_lft forever',
        `2: ${ifc('wlan0')}: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1500 qdisc noqueue state ${c('ok', 'UP')} group default qlen 1000`,
        '    link/ether 3c:7c:3f:4e:0e:1a brd ff:ff:ff:ff:ff:ff',
        `    inet ${c('y', '192.168.1.42')}/24 brd 192.168.1.255 scope global dynamic noprefixroute wlan0`,
        '       valid_lft 85967sec preferred_lft 85967sec',
        `3: ${ifc('docker0')}: &lt;NO-CARRIER,BROADCAST,MULTICAST,UP&gt; mtu 1500 qdisc noqueue state ${c('err', 'DOWN')} group default`,
        '    link/ether 02:42:ac:11:00:01 brd ff:ff:ff:ff:ff:ff',
        `    inet ${c('y', '172.17.0.1')}/16 brd 172.17.255.255 scope global docker0`,
    ];
}

// Real HTTP from the browser. Anything that blocks CORS looks like a refused connection from here.
async function fetchText(url, opts = {}) {
    const ctrl = new AbortController();
    const poll = setInterval(() => state.abort && ctrl.abort(), 100);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
        clearInterval(poll);
    }
}

async function cmdCurl({ args }) {
    const target = args.find((a) => !a.startsWith('-'));
    if (!target) return err("curl: try 'curl --help' or 'curl --manual' for more information");
    const head = args.includes('-I') || args.includes('--head');
    let url;
    try {
        url = new URL(/^https?:\/\//.test(target) ? target : `https://${target}`);
    } catch {
        return err('curl: (3) URL rejected: Malformed input to a URL function');
    }
    let res;
    try {
        res = await fetchText(url, { method: head ? 'HEAD' : 'GET' });
    } catch {
        if (state.abort) return;
        if (!resolve(url.hostname)) return err(`curl: (6) Could not resolve host: ${url.hostname}`);
        return err(`curl: (7) Failed to connect to ${url.hostname} port ${url.port || 443}: Couldn't connect to server`);
    }
    if (head) return [`HTTP/2 ${res.status}`, ...[...res.headers].map(([k, v]) => esc(`${k}: ${v}`))];
    let text = await res.text();
    if (/^\s*(<!doctype html|<html)/i.test(text) && url.hostname === 'wttr.in') {
        // wttr.in serves browsers an HTML page; the terminal output lives in .term-container.
        text = new DOMParser().parseFromString(text, 'text/html').querySelector('pre, .term-container')?.textContent.trim() + '\n' || text;
    }
    return textLines(text).map((l) => linkify(esc(l)));
}

function cmdWeather({ args }) {
    const city = args.join('+') || 'Kathmandu';
    return cmdCurl({ args: [`https://wttr.in/${encodeURIComponent(city)}?0&T&lang=en`] });
}

async function cmdSsh({ args }) {
    const target = args.filter((a) => !a.startsWith('-')).pop();
    if (!target) return err('usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-l login_name] [-p port] destination [command]');
    const [user, host] = target.includes('@') ? target.split('@') : [state.user, target];
    if (host === 'github.com') {
        await sleep(600);
        // Only neox has a key in ~/.ssh.
        if (state.user === 'neox' || isRoot()) return [`Hi mnshchtri! You've successfully authenticated, but GitHub does not provide shell access.`];
        return err(`${user}@github.com: Permission denied (publickey).`);
    }
    if (!resolve(host)) return err(`ssh: Could not resolve hostname ${host}: Name or service not known`);
    if (resolve(host).startsWith('127.')) {
        await sleep(400);
        return err(`${user}@${host}: Permission denied (publickey).`);
    }
    for (let i = 0; i < 40 && !state.abort; i++) await new Promise((r) => setTimeout(r, 100));
    if (!state.abort) err(`ssh: connect to host ${host} port 22: Connection timed out`);
}

async function cmdNmap({ args }) {
    const target = args.filter((a) => !a.startsWith('-')).pop();
    const versions = args.includes('-sV') || args.includes('-A');
    const stamp = `${new Date().toLocaleString('sv-SE').slice(0, 16)} ${new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop()}`;
    print(`Starting Nmap 7.98 ( https://nmap.org ) at ${stamp}`);
    if (!target) return print('WARNING: No targets were specified, so 0 hosts scanned.\nNmap done: 0 IP addresses (0 hosts up) scanned in 0.03 seconds');
    const ip = resolve(target);
    if (!ip?.startsWith('127.')) {
        await sleep(900);
        print([
            c('y', 'This box only scans itself — scanning hosts without written permission is how pentesters end up in court.'),
            `Try: ${c('exe', 'nmap -sV localhost')}`,
            'Nmap done: 0 IP addresses (0 hosts up) scanned in 0.91 seconds',
        ]);
        return;
    }
    await sleep(1400);
    const ports = [
        ['22/tcp', 'ssh', 'OpenSSH 10.2 (protocol 2.0)'],
        ['80/tcp', 'http', 'nginx 1.29.1'],
        ['443/tcp', 'ssl/http', 'nginx 1.29.1'],
        ['1337/tcp', 'waste?', 'nsh 1.1 (neox terminal portfolio)'],
        ['5432/tcp', 'postgresql', 'PostgreSQL DB 17.6'],
        ['8443/tcp', 'https-alt', 'DeployForge API'],
        ['9092/tcp', 'kafka', 'Apache Kafka 4.1 (KRaft)'],
        ['9100/tcp', 'jetdirect?', 'InfraEye collector'],
    ];
    return [
        `Nmap scan report for ${esc(target)} (${ip})`,
        'Host is up (0.000047s latency).',
        `Not shown: ${1000 - ports.length} closed tcp ports (conn-refused)`,
        `PORT     STATE SERVICE    ${versions ? 'VERSION' : ''}`,
        ...ports.map(([p, s, v]) => `${p.padEnd(9)}${c('ok', 'open')}  ${s.padEnd(11)}${versions ? esc(v) : ''}`),
        '',
        `Nmap done: 1 IP address (1 host up) scanned in ${versions ? '6.42' : '0.08'} seconds`,
    ];
}

// ss: the sockets behind the services above. A socket disappears when its unit is stopped.
// [proto, state, local, peer, pid, process name, fd, unit]
const SOCKETS = [
    ['udp', 'UNCONN', '127.0.0.54:53', '0.0.0.0:*', 360, 'systemd-resolve', 21, 'systemd-resolved'],
    ['udp', 'UNCONN', '127.0.0.53%lo:53', '0.0.0.0:*', 360, 'systemd-resolve', 19, 'systemd-resolved'],
    ['udp', 'UNCONN', '0.0.0.0:5355', '0.0.0.0:*', 360, 'systemd-resolve', 12, 'systemd-resolved'],
    ['udp', 'UNCONN', '[::]:5355', '[::]:*', 360, 'systemd-resolve', 14, 'systemd-resolved'],
    ['tcp', 'LISTEN', '127.0.0.54:53', '0.0.0.0:*', 360, 'systemd-resolve', 22, 'systemd-resolved'],
    ['tcp', 'LISTEN', '127.0.0.53%lo:53', '0.0.0.0:*', 360, 'systemd-resolve', 20, 'systemd-resolved'],
    ['tcp', 'LISTEN', '0.0.0.0:22', '0.0.0.0:*', 401, 'sshd', 3, 'sshd'],
    ['tcp', 'LISTEN', '[::]:22', '[::]:*', 401, 'sshd', 4, 'sshd'],
    ['tcp', 'LISTEN', '0.0.0.0:80', '0.0.0.0:*', 450, 'nginx', 6, 'nginx'],
    ['tcp', 'LISTEN', '0.0.0.0:443', '0.0.0.0:*', 450, 'nginx', 7, 'nginx'],
    ['tcp', 'LISTEN', '[::]:80', '[::]:*', 450, 'nginx', 8, 'nginx'],
    ['tcp', 'LISTEN', '0.0.0.0:1337', '0.0.0.0:*', 1336, 'nsh-relay', 3],
    ['tcp', 'LISTEN', '0.0.0.0:5432', '0.0.0.0:*', 470, 'postgres', 7, 'postgresql'],
    ['tcp', 'LISTEN', '[::]:5432', '[::]:*', 470, 'postgres', 8, 'postgresql'],
    ['tcp', 'LISTEN', '0.0.0.0:8443', '0.0.0.0:*', 714, 'deployforge-api', 11],
    ['tcp', 'LISTEN', '0.0.0.0:9092', '0.0.0.0:*', 610, 'java', 142, 'kafka'],
    ['tcp', 'LISTEN', '127.0.0.1:9093', '0.0.0.0:*', 610, 'java', 139, 'kafka'],
    ['tcp', 'LISTEN', '0.0.0.0:9100', '0.0.0.0:*', 700, 'infra-eye', 8, 'infra-eye'],
    ['tcp', 'LISTEN', '127.0.0.1:10248', '0.0.0.0:*', 512, 'kubelet', 21, 'kubelet'],
    ['tcp', 'LISTEN', '127.0.0.1:34719', '0.0.0.0:*', 433, 'containerd', 12, 'containerd'],
    ['tcp', 'LISTEN', '*:10250', '*:*', 512, 'kubelet', 23, 'kubelet'],
    ['tcp', 'ESTAB', '127.0.0.1:41862', '127.0.0.1:5432', 700, 'infra-eye', 14, 'infra-eye'],
    ['tcp', 'ESTAB', '127.0.0.1:5432', '127.0.0.1:41862', 4711, 'postgres', 9, 'postgresql'],
    ['tcp', 'ESTAB', '127.0.0.1:41870', '127.0.0.1:5432', 714, 'deployforge-api', 15],
    ['tcp', 'ESTAB', '127.0.0.1:5432', '127.0.0.1:41870', 4712, 'postgres', 9, 'postgresql'],
    ['tcp', 'ESTAB', '192.168.1.42:22', '192.168.1.17:51544', 3301, 'sshd-session', 4, 'sshd'],
    ['tcp', 'ESTAB', '192.168.1.42:48216', '10.20.0.5:1514', 530, 'wazuh-agentd', 6, 'wazuh-agent'],
    ['tcp', 'ESTAB', '192.168.1.42:39004', '140.82.112.25:443', 700, 'infra-eye', 17, 'infra-eye'],
    ['u_str', 'LISTEN', '/run/postgresql/.s.PGSQL.5432 18842', '* 0', 470, 'postgres', 9, 'postgresql'],
    ['u_str', 'LISTEN', '/run/docker.sock 17110', '* 0', 1, 'systemd', 51, 'docker'],
    ['u_str', 'LISTEN', '/run/containerd/containerd.sock 17305', '* 0', 433, 'containerd', 10, 'containerd'],
    ['u_str', 'LISTEN', '/run/user/1000/hypr/.socket.sock 23187', '* 0', 601, 'Hyprland', 25],
    ['u_str', 'LISTEN', '/run/user/1000/pipewire-0 22964', '* 0', 640, 'pipewire', 5],
].map(([proto, st, local, peer, pid, name, fd, unit]) => ({ proto, st, local, peer, pid, name, fd, unit }));

const SERVICES = { 22: 'ssh', 53: 'domain', 80: 'http', 443: 'https', 1514: 'fujitsu-dtcns', 5355: 'llmnr', 5432: 'postgresql', 8443: 'pcsync-https', 9092: 'XmlIpcRegSvc', 9093: 'copycat', 9100: 'jetdirect', 10250: '10250', 10248: '10248' };
// Short-lived processes that ps doesn't list: postgres backends and an ssh session.
const SOCK_OWNERS = { 3301: 'root', 4711: 'postgres', 4712: 'postgres' };
const sockOwner = (sock) => SYS.procs.find((p) => p.pid === sock.pid)?.user ?? SOCK_OWNERS[sock.pid];

function cmdSs({ args }) {
    const { flags } = parseFlags(args.filter((a) => /^-[a-zA-Z0-9]+$/.test(a)));
    if (args.some((a) => a === '-h' || a === '--help')) {
        return ['Usage: ss [ OPTIONS ]', '   -n  don\'t resolve service names', '   -a  display all sockets', '   -l  display listening sockets',
            '   -p  show process using socket', '   -s  show socket usage summary', '   -t  display only TCP sockets', '   -u  display only UDP sockets',
            '   -x  display only Unix domain sockets', '   -4  display only IP version 4 sockets', '   -6  display only IP version 6 sockets', '   -H  suppress header line'];
    }
    const live = SOCKETS.filter((s) => !s.unit || UNITS[s.unit]?.active !== false);
    if (flags.has('s')) {
        const count = (p, st) => live.filter((s) => s.proto === p && (!st || s.st === st)).length;
        return [
            `Total: ${live.length + 214}`,
            `TCP:   ${count('tcp') + 3} (estab ${count('tcp', 'ESTAB')}, closed 2, orphaned 0, timewait 1)`,
            '',
            'Transport Total     IP        IPv6',
            `RAW\t  1         0         1`,
            `UDP\t  ${count('udp')}         ${live.filter((s) => s.proto === 'udp' && !s.local.startsWith('[')).length}         ${live.filter((s) => s.proto === 'udp' && s.local.startsWith('[')).length}`,
            `TCP\t  ${count('tcp')}        ${live.filter((s) => s.proto === 'tcp' && !s.local.startsWith('[')).length}        ${live.filter((s) => s.proto === 'tcp' && s.local.startsWith('[')).length}`,
            `INET\t  ${count('tcp') + count('udp') + 1}        ${live.filter((s) => s.proto !== 'u_str' && !s.local.startsWith('[')).length}        ${live.filter((s) => s.local.startsWith('[')).length + 1}`,
            'FRAG\t  0         0         0',
        ];
    }
    const protos = ['t', 'u', 'x'].filter((f) => flags.has(f)).map((f) => ({ t: 'tcp', u: 'udp', x: 'u_str' }[f]));
    let rows = live.filter((s) => (protos.length ? protos.includes(s.proto) : s.proto !== 'u_str' || flags.has('a') || flags.has('l')));
    if (flags.has('4')) rows = rows.filter((s) => s.proto !== 'u_str' && !s.local.startsWith('['));
    if (flags.has('6')) rows = rows.filter((s) => s.local.startsWith('['));
    // Like the real ss: established sockets by default, listening ones with -l, both with -a.
    if (!flags.has('a')) rows = rows.filter((s) => (flags.has('l') ? ['LISTEN', 'UNCONN'].includes(s.st) : s.st === 'ESTAB'));
    const name = (addr) => (flags.has('n') ? addr : addr.replace(/:(\d+)$/, (m, port) => `:${SERVICES[port] ?? port}`));
    // Without root, ss can only name the processes you own.
    const proc = (s) => (isRoot() || sockOwner(s) === state.user ? `users:(("${s.name}",pid=${s.pid},fd=${s.fd}))` : '');
    const cols = rows.map((s) => [s.proto, s.st, '0', s.st === 'LISTEN' ? '4096' : '0', name(s.local), name(s.peer), flags.has('p') ? proc(s) : '']);
    const netid = protos.length !== 1;
    const head = ['Netid', 'State', 'Recv-Q', 'Send-Q', 'Local Address:Port', 'Peer Address:Port', flags.has('p') ? 'Process' : ''];
    const all = flags.has('H') ? cols : [head, ...cols];
    const width = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
    return all.map((r) => r.map((v, i) => (i === 2 || i === 3 ? v.padStart(width[i]) : v.padEnd(width[i])))
        .filter((_, i) => netid || i > 0).join(' ').trimEnd()).map(esc);
}

// ---------- DevOps ----------

const PODS = [
    ['default', 'portfolio-web', '6b8d9c7f5d-qk2xz', '42d'],
    ['observability', 'infra-eye', '7d9f8b6c4d-x2kqp', '12d'],
    ['observability', 'infra-eye-collector', '5c6d7f8b9-7wq4n', '12d'],
    ['platform', 'deployforge-api', '5f7c9d8b9-lm4zt', '3d4h'],
    ['platform', 'deployforge-builder', '84c5b6d7f-hs8kd', '3d4h'],
    ['platform', 'postgres', '0', '42d'],
    ['security', 'cyberlynx', '7b9c8d6f5-pp3nr', '8d'],
    ['security', 'wazuh-manager', '0', '42d'],
].map(([ns, app, suffix, age]) => ({ ns, app, name: suffix === '0' ? `${app}-0` : `${app}-${suffix}`, age }));

const randSuffix = () => `${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 7)}`;

function cmdKubectl({ args }) {
    const [verb, kind = '', name] = args.filter((a) => !a.startsWith('-') && !['default', 'observability', 'platform', 'security', 'kube-system'].includes(a));
    const nIdx = args.indexOf('-n');
    const ns = nIdx >= 0 ? args[nIdx + 1] : 'default';
    const all = args.includes('-A') || args.includes('--all-namespaces');
    if (!verb) return ['kubectl controls the Kubernetes cluster manager.', '', 'Try: kubectl get pods -A | kubectl get nodes | kubectl get ns'];
    if (verb === 'version') return ['Client Version: v1.34.1', 'Kustomize Version: v5.7.1', 'Server Version: v1.34.1'];
    if (verb === 'cluster-info') return [`Kubernetes control plane is running at ${c('y', 'https://127.0.0.1:6443')}`, `CoreDNS is running at ${c('y', 'https://127.0.0.1:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy')}`];
    if (verb === 'delete' && kind.startsWith('pod')) {
        const pod = PODS.find((p) => p.name === name && (all || p.ns === ns));
        if (!pod) return err(`Error from server (NotFound): pods "${name}" not found`);
        if (!isRoot()) return err(`Error from server (Forbidden): pods "${name}" is forbidden: User "${state.user}" cannot delete resource "pods" in API group "" in the namespace "${pod.ns}"`);
        if (!pod.name.endsWith('-0')) pod.name = `${pod.app}-${randSuffix()}`;
        pod.age = '1s';
        return [`pod "${esc(name)}" deleted`];
    }
    if (verb !== 'get') return err(`error: unknown command "${verb}" for "kubectl"`);
    if (/^(nodes?|no)$/.test(kind)) {
        return ['NAME   STATUS   ROLES           AGE   VERSION', `neox   ${c('ok', 'Ready')}    control-plane   42d   v1.34.1`];
    }
    if (/^(namespaces?|ns)$/.test(kind)) {
        return ['NAME              STATUS   AGE', ...['default', 'kube-system', 'observability', 'platform', 'security'].map((n) => `${n.padEnd(18)}Active   42d`)];
    }
    if (/^(pods?|po)$/.test(kind)) {
        const pods = PODS.filter((p) => all || p.ns === ns);
        if (!pods.length) return [`No resources found in ${esc(ns)} namespace.`];
        const width = Math.max(...pods.map((p) => p.name.length)) + 3;
        return [
            `${all ? 'NAMESPACE       ' : ''}${'NAME'.padEnd(width)}READY   STATUS    RESTARTS   AGE`,
            ...pods.map((p) => `${all ? p.ns.padEnd(16) : ''}${p.name.padEnd(width)}1/1     ${c('ok', 'Running')}   0          ${p.age}`),
        ];
    }
    if (/^(services?|svc)$/.test(kind)) {
        return ['NAME            TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE',
            'kubernetes      ClusterIP   10.96.0.1      &lt;none&gt;        443/TCP   42d',
            'portfolio-web   ClusterIP   10.96.41.137   &lt;none&gt;        80/TCP    42d'];
    }
    return err(`error: the server doesn't have a resource type "${kind}"`);
}

function cmdDocker({ args }) {
    if (!['neox', 'root'].includes(state.user)) {
        // visitor isn't in the docker group, exactly like on a real box.
        return err('permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.51/containers/json": dial unix /var/run/docker.sock: connect: permission denied');
    }
    const [sub, image] = args;
    if (sub === 'ps') {
        return [
            'CONTAINER ID   IMAGE                              COMMAND                  CREATED       STATUS       PORTS                    NAMES',
            'a3f1c9e2b7d4   ghcr.io/mnshchtri/infra-eye:1.8    "/infra-eye serve"       2 weeks ago   Up 12 days   0.0.0.0:9100->9100/tcp   infra-eye',
            '7e2d4b1a9c03   postgres:17-alpine                 "docker-entrypoint.s…"   6 weeks ago   Up 12 days   5432/tcp                 postgres',
            'c41b8e7f2a65   wazuh/wazuh-agent:4.13.1           "/init"                  6 weeks ago   Up 12 days                            wazuh-agent',
        ];
    }
    if (sub === 'images') {
        return [
            'REPOSITORY                    TAG         IMAGE ID       CREATED       SIZE',
            'ghcr.io/mnshchtri/infra-eye   1.8         9c2e41f7d0b3   2 weeks ago   48.2MB',
            'postgres                      17-alpine   b1a7c3e9f2d4   6 weeks ago   278MB',
            'wazuh/wazuh-agent             4.13.1      e7d2c9a1b4f6   6 weeks ago   512MB',
        ];
    }
    if (sub === 'run' && image === 'hello-world') {
        return [
            '', 'Hello from Docker!', 'This message shows that your installation appears to be working correctly.', '',
            'To generate this message, Docker took the following steps:',
            ' 1. The Docker client contacted the Docker daemon.',
            ' 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.',
            ' 3. The Docker daemon created a new container from that image which runs the',
            '    executable that produces the output you are currently reading.',
            ' 4. The Docker daemon streamed that output to the Docker client, which sent it',
            '    to your terminal.',
        ];
    }
    return ['Usage:  docker [OPTIONS] COMMAND', '', 'Try: docker ps | docker images | docker run hello-world'];
}

// ---------- packages ----------

const PACKAGES = {
    base: '3-2', linux: '6.17.0-neox', coreutils: '9.8-2', 'util-linux': '2.41.2-1', iproute2: '6.17.0-1', curl: '8.16.0-1',
    git: '2.51.1-1', openssh: '10.2p1-1', hyprland: '0.51.1-1', waybar: '0.14.0-1', neovim: '0.11.4-1', nano: '8.6-1',
    htop: '3.4.1-1', docker: '1:28.5.1-1', kubectl: '1.34.1-1', nmap: '7.98-1', 'wazuh-agent': '4.13.1-1', nginx: '1.29.1-1',
    postgresql: '17.6-1', cowsay: '3.8.4-2', sl: '5.05-4', cmatrix: '2.0-3', fastfetch: '2.53.0-1', 'github-cli': '2.82.0-1',
};

async function progress(label, size) {
    print('');
    const line = output.lastElementChild;
    for (let p = 0; p <= 100; p += 20) {
        const hashes = '#'.repeat(Math.round(p / 5)).padEnd(20, '-');
        line.textContent = ` ${label.padEnd(24)} ${size.padStart(10)}  [${hashes}] ${String(p).padStart(3)}%`;
        await sleep(90);
    }
}

async function cmdPacman({ args }) {
    const op = args.find((a) => a.startsWith('-')) || '';
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!op) return err('error: no operation specified (use -h for help)');
    if (op.startsWith('-Q')) {
        const list = Object.entries(PACKAGES).filter(([n]) => !targets.length || targets.includes(n));
        return list.map(([n, v]) => `${c('b', esc(n))} ${c('ok', esc(v))}`);
    }
    if (op.startsWith('-Ss')) {
        const q = targets[0] || '';
        return Object.entries(PACKAGES).filter(([n]) => n.includes(q))
            .flatMap(([n, v]) => [`${c('hl', 'extra/')}${c('b', esc(n))} ${c('ok', esc(v))} ${c('p', '[installed]')}`, '    (part of the neox workstation)']);
    }
    if (!isRoot()) return err('error: you cannot perform this operation unless you are root.');
    if (op.startsWith('-R')) {
        print('checking dependencies...');
        return err(`error: failed to prepare transaction (could not satisfy dependencies)\n:: removing ${targets[0] || 'base'} breaks dependency '${targets[0] || 'base'}' required by base`);
    }
    if (op.startsWith('-S')) {
        if (op.includes('y')) {
            print(c('hl', ':: Synchronizing package databases...'));
            await progress('core', '117.5 KiB');
            await progress('extra', '8.4 MiB');
        }
        if (op.includes('u') && !targets.length) return [c('hl', ':: Starting full system upgrade...'), ' there is nothing to do'];
        const missing = targets.filter((t) => !PACKAGES[t]);
        if (missing.length) return err(missing.map((t) => `error: target not found: ${t}`).join('\n'));
        if (!targets.length) return;
        print(targets.map((t) => c('y', `warning: ${esc(t)}-${PACKAGES[t]} is up to date -- reinstalling`)));
        print(['resolving dependencies...', 'looking for conflicting packages...', '', `Packages (${targets.length}) ${targets.map((t) => `${t}-${PACKAGES[t]}`).join('  ')}`, '']);
        const answer = await ask(':: Proceed with installation? [Y/n] ');
        if (state.abort || /^n/i.test(answer)) return;
        for (const t of targets) await progress(`(1/1) reinstalling ${t}`, '');
        // Reinstalling restores any binaries root deleted from /bin.
        for (const [name, cmd] of Object.entries(COMMANDS)) {
            if (!cmd.builtin && !getNode(`/bin/${name}`)) FS.children.bin.children[name] = { type: 'file', exe: true, bin: true, content: '\x7fELF\x02\x01\x01' + '\0'.repeat(25) };
        }
        return [':: Running post-transaction hooks...', '(1/1) Arming ConditionNeedsUpdate...'];
    }
    return err(`error: invalid option '${op}'`);
}

// ---------- git & GitHub (live, via the GitHub API) ----------

function ago(date) {
    const s = (Date.now() - new Date(date)) / 1000;
    const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [u, n] of units) if (s >= n) return `about ${Math.floor(s / n)} ${u}${Math.floor(s / n) > 1 ? 's' : ''} ago`;
    return 'less than a minute ago';
}

async function github(path, raw) {
    const res = await fetchText(`https://api.github.com${path}`, raw ? { headers: { Accept: 'application/vnd.github.raw' } } : {});
    if (res.status === 403) throw new Error('API rate limit exceeded (60 requests/hour unauthenticated)');
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return raw ? res.text() : res.json();
}

async function cmdGh({ args }) {
    const [area, verb, arg] = args;
    if (area === 'repo' && verb === 'list') {
        const owner = arg || 'mnshchtri';
        let repos;
        try {
            repos = await github(`/users/${encodeURIComponent(owner)}/repos?sort=pushed&per_page=12`);
        } catch (e) {
            return err(e.status === 404 ? `GraphQL: Could not resolve to a User with the login of '${owner}'.` : `gh: ${e.message}`);
        }
        const width = Math.max(...repos.map((r) => r.full_name.length), 4) + 2;
        return [
            '', `Showing ${repos.length} of ${owner}'s most recently pushed public repositories`, '',
            c('dim', `${'NAME'.padEnd(width)}${'DESCRIPTION'.padEnd(42)}${'INFO'.padEnd(9)}UPDATED`),
            ...repos.map((r) => `${c('exe', esc(r.full_name.padEnd(width)))}${esc((r.description || '').slice(0, 40).padEnd(42))}${(r.fork ? 'fork' : 'public').padEnd(9)}${c('dim', ago(r.pushed_at))}`),
        ];
    }
    if (area === 'api' && verb) {
        try {
            return JSON.stringify(await github(verb.startsWith('/') ? verb : `/${verb}`), null, 2).split('\n').map((l) => linkify(esc(l)));
        } catch (e) {
            return err(`gh: ${e.message}`);
        }
    }
    return ['Work seamlessly with GitHub from the command line.', '', 'USAGE', '  gh repo list [OWNER]     live list of public repositories', '  gh api PATH              raw GitHub API request (e.g. gh api users/mnshchtri)'];
}

// Cloned repos remember their origin, so git commands inside them can talk to the API.
function repoAt(abs) {
    for (let p = abs; ; p = parentOf(p)) {
        const node = getNode(p);
        if (node?.repo) return node.repo;
        if (p === '/') return null;
    }
}

async function cmdGit({ args }) {
    const [sub, ...rest] = args;
    if (!sub) return ['usage: git [--version] [--help] [-C &lt;path&gt;] &lt;command&gt; [&lt;args&gt;]', '', 'Try: git clone https://github.com/mnshchtri/infra-eye'];
    if (sub === '--version' || sub === 'version') return ['git version 2.51.1'];
    if (sub === 'clone') {
        const url = rest.find((a) => !a.startsWith('-'));
        const m = url?.match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
        if (!m) return err('fatal: You must specify a repository to clone.');
        const [, owner, name] = m;
        const dirName = rest.filter((a) => !a.startsWith('-'))[1] || name;
        const abs = normalize(dirName);
        if (getNode(abs)) return err(`fatal: destination path '${dirName}' already exists and is not an empty directory.`);
        if (!canModify(abs)) return err(`fatal: could not create work tree dir '${dirName}': Permission denied`);
        print(`Cloning into '${esc(dirName)}'...`);
        let meta;
        let readme = '';
        try {
            meta = await github(`/repos/${owner}/${name}`);
            readme = await github(`/repos/${owner}/${name}/readme`, true).catch(() => '');
        } catch (e) {
            if (state.abort) return;
            if (e.status === 404) return err(`remote: Repository not found.\nfatal: repository 'https://github.com/${owner}/${name}.git/' not found`);
            return err(`fatal: unable to access 'https://github.com/${owner}/${name}.git/': ${e.message}`);
        }
        const objects = Math.max(12, Math.round(meta.size / 3));
        for (const step of [`remote: Enumerating objects: ${objects}, done.`, `remote: Counting objects: 100% (${objects}/${objects}), done.`,
            `remote: Compressing objects: 100% (${Math.round(objects * 0.6)}/${Math.round(objects * 0.6)}), done.`,
            `Receiving objects: 100% (${objects}/${objects}), ${(meta.size / 1024).toFixed(2)} MiB | 4.20 MiB/s, done.`,
            `Resolving deltas: 100% (${Math.round(objects * 0.4)}/${Math.round(objects * 0.4)}), done.`]) {
            print(esc(step));
            await sleep(220);
        }
        const children = {
            '.git': { type: 'dir', owner: state.user, mtime: new Date(), children: { config: { type: 'file', owner: state.user, mtime: new Date(), content: `[remote "origin"]\n\turl = ${meta.clone_url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch "${meta.default_branch}"]\n\tremote = origin\n` } } },
        };
        if (readme) children['README.md'] = { type: 'file', owner: state.user, mtime: new Date(), content: readme };
        getNode(parentOf(abs)).children[basename(abs)] = { type: 'dir', owner: state.user, mtime: new Date(), children, repo: { owner, name, branch: meta.default_branch } };
        return;
    }
    const repo = repoAt(state.cwd);
    if (!repo) return err('fatal: not a git repository (or any of the parent directories): .git');
    switch (sub) {
        case 'status':
            return [`On branch ${repo.branch}`, `Your branch is up to date with 'origin/${repo.branch}'.`, '', 'nothing to commit, working tree clean'];
        case 'log': {
            let commits;
            try {
                commits = await github(`/repos/${repo.owner}/${repo.name}/commits?per_page=10`);
            } catch (e) {
                return err(`fatal: ${e.message}`);
            }
            if (rest.includes('--oneline')) return commits.map((cm) => `${c('y', cm.sha.slice(0, 7))} ${esc(cm.commit.message.split('\n')[0])}`);
            return commits.flatMap((cm) => [
                c('y', `commit ${cm.sha}`),
                esc(`Author: ${cm.commit.author.name} <${cm.commit.author.email}>`),
                `Date:   ${fmtDate(new Date(cm.commit.author.date))}`,
                '',
                ...cm.commit.message.split('\n').map((l) => `    ${esc(l)}`),
                '',
            ]);
        }
        case 'pull':
        case 'fetch':
            return ['Already up to date.'];
        case 'push':
            return err(`ERROR: Permission to ${repo.owner}/${repo.name}.git denied to ${state.user}.\nfatal: Could not read from remote repository.`);
        case 'commit':
            return [`On branch ${repo.branch}`, 'nothing to commit, working tree clean'];
        case 'branch':
            return [`* ${c('ok', repo.branch)}`];
        case 'remote':
            return rest.includes('-v') ? [`origin\thttps://github.com/${repo.owner}/${repo.name}.git (fetch)`, `origin\thttps://github.com/${repo.owner}/${repo.name}.git (push)`] : ['origin'];
        default:
            return err(`git: '${sub}' is not a git command. See 'git --help'.`);
    }
}

// ---------- fun ----------

function cmdLolcat({ args, stdin }) {
    const files = args.filter((a) => !a.startsWith('-'));
    const text = files.length ? files.map((f) => readFile(f, 'lolcat') ?? '').join('') : stdin ?? '';
    const seed = Math.random() * 360;
    return textLines(text).map((line, row) => [...line].map((ch, col) => (
        `<span style="color:hsl(${(seed + row * 8 + col * 6) % 360} 90% 65%)">${esc(ch)}</span>`
    )).join(''));
}

async function cmdYes({ args }) {
    const word = esc(args.join(' ') || 'y');
    while (!state.abort) {
        print(Array(40).fill(word));
        await new Promise((r) => setTimeout(r, 30));
    }
}

const HINTS = [
    `There's a flag in ${c('y', '/root')}, and you're a guest without sudo. Start the way every pentest starts: enumeration. Who else has an account here? (${c('exe', 'cat /etc/passwd')}, ${c('exe', 'cat /etc/group')})`,
    `Look at neox's home properly — dotfiles too. (${c('exe', 'ls -la ~neox')})`,
    "Shell history is a goldmine. People paste passwords into commands they shouldn't.",
    `That string doesn't look like a password because it's encoded. The \`=\` padding at the end is a giveaway: try ${c('exe', "echo '…' | base64 -d")}.`,
    `Found a password? Become its owner (${c('exe', 'su neox')}), then ask what that user may run (${c('exe', 'sudo -l')}).`,
    `${c('exe', 'sudo -i')}, then ${c('exe', 'cat /root/flag.txt')}. Root's own history is worth a read too... carefully.`,
];

function cmdHint() {
    if (isRoot()) return [`You're already root. ${c('exe', 'cat /root/flag.txt')} 🏁`];
    const n = Math.min(shared.hintsSeen += 1, HINTS.length);
    return [`${c('hl', `hint ${n}/${HINTS.length}:`)} ${HINTS[n - 1]}`];
}

Object.assign(COMMANDS, {
    uptime: { group: 'System', usage: 'uptime', desc: 'tell how long the system has been running', run: cmdUptime },
    ps: { group: 'System', usage: 'ps [aux]', desc: 'report a snapshot of the current processes', run: cmdPs },
    kill: { group: 'System', usage: 'kill PID...', desc: 'send a signal to a process', builtin: true, run: cmdKill },
    free: { group: 'System', usage: 'free [-h]', desc: 'display amount of free and used memory', run: cmdFree },
    df: { group: 'System', usage: 'df [-h]', desc: 'report file system space usage', run: cmdDf },
    lsblk: { group: 'System', usage: 'lsblk', desc: 'list block devices', run: cmdLsblk },
    who: { group: 'System', usage: 'who', desc: 'show who is logged on', run: cmdWho },
    cal: { group: 'System', usage: 'cal', desc: 'display a calendar', run: cmdCal },
    dmesg: { group: 'System', usage: 'dmesg', desc: 'print the kernel ring buffer', run: cmdDmesg },
    systemctl: { group: 'System', usage: 'systemctl [status|start|stop|restart] UNIT', desc: 'control the systemd system and service manager', run: cmdSystemctl },
    journalctl: { group: 'System', usage: 'journalctl [-u UNIT] [-n N]', desc: 'print log entries from the systemd journal', run: cmdJournalctl },
    pacman: { group: 'System', usage: 'pacman -Q | -Ss QUERY | -Syu | -S PKG', desc: 'package manager utility', run: cmdPacman },
    yay: { group: 'Hidden', usage: 'yay', desc: 'AUR helper', run: () => (isRoot() ? err('-> Avoid running yay as root/sudo.') : [':: Searching AUR for updates...', ' there is nothing to do']) },
    theme: { group: 'System', usage: 'theme [list | NAME | next]', desc: 'switch the color theme (saved across visits)', run: cmdTheme },
    'omarchy-theme-set': { group: 'Hidden', usage: 'omarchy-theme-set NAME', desc: 'switch the color theme', run: cmdTheme },
    ip: { group: 'Network', usage: 'ip [address | route]', desc: 'show network devices and routing', run: cmdIp },
    ifconfig: { group: 'Hidden', usage: 'ifconfig', desc: 'deprecated', run: () => {
        state.status = 127;
        print(c('err', 'nsh: command not found: ifconfig') + c('dim', " — net-tools is deprecated on Arch, try 'ip a'"));
    } },
    ss: { group: 'Network', usage: 'ss [-tulnpa | -s]', desc: 'another utility to investigate sockets (try: ss -tulnp)', run: cmdSs },
    netstat: { group: 'Hidden', usage: 'netstat', desc: 'deprecated', run: () => {
        state.status = 127;
        print(c('err', 'nsh: command not found: netstat') + c('dim', " — net-tools is deprecated on Arch, try 'ss -tulnp'"));
    } },
    ping: { group: 'Network', usage: 'ping [-c N] HOST', desc: 'send ICMP ECHO_REQUEST to network hosts (Ctrl+C stops)', run: cmdPing },
    curl: { group: 'Network', usage: 'curl [-I] URL', desc: 'transfer a URL — real requests, e.g. curl wttr.in/Kathmandu', run: cmdCurl },
    weather: { group: 'Network', usage: 'weather [CITY]', desc: 'live weather from wttr.in', run: cmdWeather },
    ssh: { group: 'Network', usage: 'ssh [user@]host', desc: 'OpenSSH remote login client', run: cmdSsh },
    nmap: { group: 'Network', usage: 'nmap [-sV] TARGET', desc: 'network exploration tool and security scanner', run: cmdNmap },
    git: { group: 'DevOps', usage: 'git clone URL | log | status', desc: 'the stupid content tracker — clone pulls real READMEs from GitHub', run: cmdGit },
    gh: { group: 'DevOps', usage: 'gh repo list [OWNER] | gh api PATH', desc: 'GitHub CLI (live data)', run: cmdGh },
    kubectl: { group: 'DevOps', usage: 'kubectl get pods|nodes|ns|svc [-A]', desc: 'control the Kubernetes cluster', run: cmdKubectl },
    docker: { group: 'DevOps', usage: 'docker ps | images | run hello-world', desc: 'container engine', run: cmdDocker },
    lolcat: { group: 'Fun', usage: 'lolcat [FILE]', desc: 'rainbows and unicorns (try: fortune | cowsay | lolcat)', run: cmdLolcat },
    yes: { group: 'Hidden', usage: 'yes [STRING]', desc: 'output a string repeatedly until killed', run: cmdYes },
    hint: { group: 'Fun', usage: 'hint', desc: 'progressive hints for getting root on this box', builtin: true, run: cmdHint },
});
