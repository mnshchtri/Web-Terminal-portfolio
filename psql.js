'use strict';

// psql against a small PostgreSQL 17 that lives in the page. The `portfolio` database holds the CV
// (RESUME in resume.js) as tables, so `SELECT * FROM projects;` works. The SQL engine covers SELECT
// with WHERE, GROUP BY, ORDER BY, LIMIT and the usual functions, plus the backslash commands people
// reach for first. The server is a hot standby (writes go to a primary that isn't on this box), so
// every write fails the way it does on a real replica: in a read-only transaction.

const PG_VERSION = '17.6';
const PG_SOCKET = '/run/postgresql/.s.PGSQL.5432';

const PG_ROLES = {
    postgres: { attrs: 'Superuser, Create role, Create DB, Replication, Bypass RLS', su: true },
    neox: { attrs: 'Create DB' },
    visitor: { attrs: '' },
    infraeye: { attrs: '' },
    deployforge: { attrs: '' },
};

const pgErr = (msg, pos, extra = []) => Object.assign(new Error(msg), { pg: true, pos, extra });

// ---------- the data ----------

const firstSentence = (s) => s.split(/\.\s/)[0].replace(/\.$/, '');

function pgDatabases() {
    const r = RESUME;
    const table = (owner, cols, rows, shared = true) => ({ owner, shared, cols: cols.map((col) => col.split(':')), rows });
    return {
        portfolio: {
            owner: 'neox',
            tables: {
                projects: table('neox', ['id:integer', 'name:text', 'description:text', 'url:text', 'public:boolean'],
                    r.projects.map(([name, desc, url], i) => [i + 1, name, firstSentence(desc), url, !!url])),
                experience: table('neox', ['id:integer', 'role:text', 'company:text', 'period:text', 'location:text'],
                    r.experience.map((e, i) => [i + 1, e.role, e.org, e.when, e.where])),
                skills: table('neox', ['id:integer', 'category:text', 'skill:text'],
                    r.skills.flatMap(([cat, list]) => list.split(/,\s*(?![^(]*\))/).map((s) => [cat, s])).map((row, i) => [i + 1, ...row])),
                education: table('neox', ['id:integer', 'degree:text', 'school:text', 'status:text'],
                    r.education.map((e, i) => [i + 1, ...e])),
                certifications: table('neox', ['id:integer', 'issuer:text', 'name:text'],
                    r.certifications.map((s, i) => [i + 1, s.split(': ')[0], s.split(': ').slice(1).join(': ')])),
                contact: table('neox', ['kind:text', 'value:text'],
                    [['email', r.email], ['location', r.location], ...r.links.map(([k, v]) => [k.toLowerCase(), v])]),
                secrets: table('neox', ['id:integer', 'name:text', 'value:text'],
                    [[1, 'note', 'Real secrets live in a vault, not in a table called secrets.']], false),
            },
        },
        infraeye: {
            owner: 'infraeye',
            tables: {
                servers: table('infraeye', ['id:integer', 'hostname:text', 'address:text', 'status:text'],
                    [[1, 'neox', '127.0.0.1', 'healthy'], [2, 'k8s-node-1', '10.20.0.11', 'healthy'], [3, 'k8s-node-2', '10.20.0.12', 'healthy']], false),
            },
        },
        deployforge: {
            owner: 'deployforge',
            tables: {
                deployments: table('deployforge', ['id:integer', 'app:text', 'commit:text', 'status:text'],
                    [[41, 'portfolio-web', 'b31a14c', 'live'], [40, 'portfolio-web', '9ce0f98', 'superseded']], false),
            },
        },
        postgres: { owner: 'postgres', tables: {} },
        template1: { owner: 'postgres', tables: {} },
        template0: { owner: 'postgres', tables: {}, noConnect: true },
    };
}

// System catalogs every database can see.
function pgCatalog(sess) {
    const view = (cols, rows, suOnly) => ({ owner: 'postgres', shared: true, suOnly, view: true, cols: cols.map((col) => col.split(':')), rows });
    const dbs = pgDatabases();
    return {
        pg_roles: view(['rolname:text', 'rolsuper:boolean', 'rolcreatedb:boolean', 'rolcanlogin:boolean'],
            Object.entries(PG_ROLES).map(([n, r]) => [n, !!r.su, !!r.su || n === 'neox', true])),
        pg_database: view(['datname:text', 'datallowconn:boolean'], Object.entries(dbs).map(([n, d]) => [n, !d.noConnect])),
        pg_tables: view(['schemaname:text', 'tablename:text', 'tableowner:text'],
            Object.entries(dbs[sess.db].tables).map(([n, t]) => ['public', n, t.owner])),
        pg_stat_activity: view(['pid:integer', 'usename:text', 'datname:text', 'application_name:text', 'client_addr:text', 'state:text', 'query:text'], [
            [4711, 'infraeye', 'infraeye', 'infra-eye', '127.0.0.1', 'idle', 'COMMIT'],
            [4712, 'deployforge', 'deployforge', 'deployforge-api', '127.0.0.1', 'idle', 'SELECT 1'],
            [sess.pid, sess.role, sess.db, 'psql', null, 'active', sess.lastQuery || ''],
        ]),
        pg_shadow: view(['usename:text', 'passwd:text'], Object.keys(PG_ROLES).filter((n) => n !== 'visitor').map((n) => [n, `SCRAM-SHA-256$4096:${btoa(n + 'salt').slice(0, 22)}$${btoa(n).repeat(4).slice(0, 43)}=`]), true),
    };
}

// ---------- SQL: tokens and parsing ----------

const SQL_RESERVED = new Set(['from', 'where', 'group', 'order', 'limit', 'offset', 'as', 'and', 'or', 'not', 'on', 'join', 'having', 'union', 'by', 'asc', 'desc', 'is', 'in', 'like', 'ilike', 'null', 'true', 'false', 'select', 'distinct', 'left', 'inner', 'right', 'full', 'cross', 'natural']);

function sqlTokens(sql) {
    const out = [];
    const re = /\s+|--[^\n]*|'((?:[^']|'')*)'|"((?:[^"]|"")*)"|(\d+(?:\.\d+)?)|([A-Za-z_][\w$]*)|(<>|!=|<=|>=|\|\||::|[(),.*=<>+\-/%;])/y;
    while (re.lastIndex < sql.length) {
        const pos = re.lastIndex;
        const m = re.exec(sql);
        if (!m) {
            if (sql[pos] === "'") throw pgErr(`unterminated quoted string at or near "${sql.slice(pos)}"`, pos);
            throw pgErr(`syntax error at or near "${sql[pos]}"`, pos);
        }
        if (m[1] !== undefined) out.push({ t: 'str', v: m[1].replace(/''/g, "'"), pos });
        else if (m[2] !== undefined) out.push({ t: 'id', v: m[2].replace(/""/g, '"'), quoted: true, pos });
        else if (m[3]) out.push({ t: 'num', v: Number(m[3]), pos });
        else if (m[4]) out.push({ t: 'id', v: m[4].toLowerCase(), pos });
        else if (m[5]) out.push({ t: 'op', v: m[5], pos });
    }
    out.push({ t: 'eof', v: '', pos: sql.length });
    return out;
}

function sqlParser(sql) {
    const toks = sqlTokens(sql);
    let i = 0;
    const peek = (o = 0) => toks[i + o];
    const next = () => toks[i++];
    const near = (tok = peek()) => pgErr(tok.t === 'eof' ? 'syntax error at end of input' : `syntax error at or near "${sql.slice(tok.pos).match(/^('(?:[^']|'')*'|"[^"]*"|\w+|.)/)[0]}"`, tok.pos);
    const isKw = (w, o = 0) => peek(o).t === 'id' && !peek(o).quoted && peek(o).v === w;
    const kw = (w) => isKw(w) && next();
    const op = (v) => peek().t === 'op' && peek().v === v && next();
    const expectKw = (w) => kw(w) || (() => { throw near(); })();
    const expectOp = (v) => op(v) || (() => { throw near(); })();

    function primary() {
        const tok = next();
        if (tok.t === 'num') return { k: 'lit', v: tok.v };
        if (tok.t === 'str') return { k: 'lit', v: tok.v };
        if (tok.t === 'op' && tok.v === '(') {
            const e = expr();
            expectOp(')');
            return e;
        }
        if (tok.t === 'op' && tok.v === '*') return { k: 'star' };
        if (tok.t !== 'id' || (!tok.quoted && SQL_RESERVED.has(tok.v) && !['null', 'true', 'false'].includes(tok.v))) throw near(tok);
        if (!tok.quoted && tok.v === 'null') return { k: 'lit', v: null };
        if (!tok.quoted && (tok.v === 'true' || tok.v === 'false')) return { k: 'lit', v: tok.v === 'true' };
        if (!tok.quoted && ['current_user', 'session_user', 'user', 'current_date', 'current_timestamp', 'current_schema', 'current_catalog'].includes(tok.v) && !(peek().t === 'op' && peek().v === '(')) {
            return { k: 'fn', name: tok.v, args: [], pos: tok.pos, bare: true };
        }
        if (op('(')) {
            const args = [];
            let distinct = false;
            if (op('*')) args.push({ k: 'star' });
            else if (!(peek().t === 'op' && peek().v === ')')) {
                distinct = !!kw('distinct');
                do args.push(expr()); while (op(','));
            }
            expectOp(')');
            return { k: 'fn', name: tok.v, args, distinct, pos: tok.pos };
        }
        if (op('.')) {
            if (op('*')) return { k: 'star', table: tok.v };
            const col = next();
            if (col.t !== 'id') throw near(col);
            return { k: 'col', name: col.v, table: tok.v, pos: col.pos };
        }
        return { k: 'col', name: tok.v, pos: tok.pos };
    }
    function postfix() {
        let e = primary();
        while (op('::')) {
            const type = next();
            if (type.t !== 'id') throw near(type);
            e = { k: 'cast', e, type: type.v };
        }
        return e;
    }
    function unary() {
        if (op('-')) return { k: 'neg', e: unary() };
        if (op('+')) return unary();
        return postfix();
    }
    function binary(sub, ops) {
        return () => {
            let l = sub();
            for (;;) {
                const tok = peek();
                if (tok.t !== 'op' || !ops.includes(tok.v)) return l;
                next();
                l = { k: 'bin', op: tok.v, l, r: sub(), pos: tok.pos };
            }
        };
    }
    const mul = binary(unary, ['*', '/', '%']);
    const add = binary(mul, ['+', '-']);
    const concat = binary(add, ['||']);
    function compare() {
        const l = concat();
        if (kw('is')) {
            const not = !!kw('not');
            expectKw('null');
            return { k: 'isnull', e: l, not };
        }
        const not = isKw('not') && ['like', 'ilike', 'in', 'between'].some((w) => isKw(w, 1)) && !!next();
        if (kw('like') || (isKw('ilike') && next())) {
            const ci = toks[i - 1].v === 'ilike';
            return { k: 'like', e: l, pat: concat(), ci, not };
        }
        if (kw('in')) {
            expectOp('(');
            const list = [];
            do list.push(expr()); while (op(','));
            expectOp(')');
            return { k: 'in', e: l, list, not };
        }
        if (kw('between')) {
            const lo = concat();
            expectKw('and');
            const hi = concat();
            const e = { k: 'bin', op: 'and', l: { k: 'bin', op: '>=', l, r: lo }, r: { k: 'bin', op: '<=', l, r: hi } };
            return not ? { k: 'not', e } : e;
        }
        const tok = peek();
        if (tok.t === 'op' && ['=', '<>', '!=', '<', '>', '<=', '>='].includes(tok.v)) {
            next();
            return { k: 'bin', op: tok.v, l, r: concat(), pos: tok.pos };
        }
        return l;
    }
    function negation() {
        if (kw('not')) return { k: 'not', e: negation() };
        return compare();
    }
    function conj() {
        let l = negation();
        while (kw('and')) l = { k: 'bin', op: 'and', l, r: negation() };
        return l;
    }
    function expr() {
        let l = conj();
        while (kw('or')) l = { k: 'bin', op: 'or', l, r: conj() };
        return l;
    }

    function select() {
        const q = { items: [], order: [], group: [] };
        q.distinct = !!kw('distinct');
        kw('all');
        do {
            const e = expr();
            let alias = null;
            if (kw('as')) alias = next().v;
            else if (peek().t === 'id' && (peek().quoted || !SQL_RESERVED.has(peek().v))) alias = next().v;
            q.items.push({ e, alias });
        } while (op(','));
        if (kw('from')) {
            const tok = next();
            if (tok.t !== 'id') throw near(tok);
            let name = tok.v;
            if (op('.')) {
                if (!['public', 'pg_catalog', 'information_schema'].includes(name)) throw pgErr(`schema "${name}" does not exist`, tok.pos);
                name = next().v;
            }
            q.from = { name, pos: tok.pos };
            if (kw('as') || (peek().t === 'id' && !SQL_RESERVED.has(peek().v))) q.from.alias = next().v;
            if (isKw('join') || isKw('left') || isKw('inner') || isKw('cross') || op(',')) {
                throw pgErr('joins are not supported on this server', peek().pos, ['HINT:  Query one table at a time.']);
            }
        }
        if (kw('where')) q.where = expr();
        if (kw('group')) {
            expectKw('by');
            do q.group.push(expr()); while (op(','));
        }
        if (kw('having')) q.having = expr();
        if (kw('order')) {
            expectKw('by');
            do {
                const e = expr();
                const desc = !!kw('desc');
                if (!desc) kw('asc');
                q.order.push({ e, desc });
            } while (op(','));
        }
        for (;;) {
            if (kw('limit')) q.limit = isKw('all') ? (next(), undefined) : intArg();
            else if (kw('offset')) q.offset = intArg();
            else break;
        }
        op(';');
        if (peek().t !== 'eof') throw near();
        return q;
    }
    function intArg() {
        const tok = next();
        if (tok.t !== 'num') throw near(tok);
        return tok.v;
    }
    return { select, peek, next, kw, isKw, near };
}

// ---------- SQL: evaluation ----------

const PG_AGGS = new Set(['count', 'min', 'max', 'sum', 'avg', 'string_agg', 'array_agg', 'bool_and', 'bool_or']);
const hasAgg = (e) => !!e && typeof e === 'object' && ((e.k === 'fn' && PG_AGGS.has(e.name)) || Object.values(e).some((v) => (Array.isArray(v) ? v.some(hasAgg) : v && typeof v === 'object' && hasAgg(v))));

function likeRegex(pat, ci) {
    const src = [...pat].map((ch) => (ch === '%' ? '.*' : ch === '_' ? '.' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
    return new RegExp(`^${src}$`, ci ? 'is' : 's');
}

function pgCompare(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b);
    // en_US.UTF-8 collation: case is only a tie-breaker.
    return String(a).localeCompare(String(b), 'en-US');
}

function pgEval(e, ctx) {
    const { sess } = ctx;
    switch (e.k) {
        case 'lit': return e.v;
        case 'star': throw pgErr('syntax error at or near "*"', 0);
        case 'col': {
            const row = ctx.row;
            if (!row || !(e.name in row) || (e.table && ctx.tables && !ctx.tables.includes(e.table))) {
                if (e.table && ctx.tables && !ctx.tables.includes(e.table)) throw pgErr(`missing FROM-clause entry for table "${e.table}"`, e.pos);
                throw pgErr(`column "${e.name}" does not exist`, e.pos);
            }
            if (ctx.group && !ctx.inAgg && !ctx.groupCols.has(e.name)) {
                throw pgErr(`column "${ctx.fromName}.${e.name}" must appear in the GROUP BY clause or be used in an aggregate function`, e.pos);
            }
            return row[e.name];
        }
        case 'cast': {
            const v = pgEval(e.e, ctx);
            if (v == null) return null;
            if (['int', 'integer', 'int4', 'int8', 'bigint', 'smallint'].includes(e.type)) {
                const n = Number(v);
                if (!Number.isFinite(n)) throw pgErr(`invalid input syntax for type integer: "${v}"`, 0);
                return Math.round(n);
            }
            if (['numeric', 'float', 'real', 'decimal'].includes(e.type)) return Number(v);
            if (['bool', 'boolean'].includes(e.type)) return ['t', 'true', '1', 'yes', 'on'].includes(String(v).toLowerCase());
            if (['text', 'varchar', 'char', 'name'].includes(e.type)) return pgFormat(v);
            if (e.type === 'date') return v instanceof Date ? pgFormat(v).slice(0, 10) : v;
            throw pgErr(`type "${e.type}" does not exist`, 0);
        }
        case 'neg': return -pgEval(e.e, ctx);
        case 'not': {
            const v = pgEval(e.e, ctx);
            return v == null ? null : !v;
        }
        case 'isnull': return (pgEval(e.e, ctx) == null) !== e.not;
        case 'like': {
            const v = pgEval(e.e, ctx);
            const p = pgEval(e.pat, ctx);
            if (v == null || p == null) return null;
            return likeRegex(String(p), e.ci).test(String(v)) !== e.not;
        }
        case 'in': {
            const v = pgEval(e.e, ctx);
            if (v == null) return null;
            return e.list.some((x) => pgCompare(v, pgEval(x, ctx)) === 0) !== e.not;
        }
        case 'bin': {
            if (e.op === 'and') {
                const l = pgEval(e.l, ctx);
                if (l === false) return false;
                const r = pgEval(e.r, ctx);
                return l == null || r == null ? (r === false ? false : null) : !!(l && r);
            }
            if (e.op === 'or') {
                const l = pgEval(e.l, ctx);
                if (l === true) return true;
                const r = pgEval(e.r, ctx);
                return r === true ? true : l == null || r == null ? null : false;
            }
            const l = pgEval(e.l, ctx);
            const r = pgEval(e.r, ctx);
            if (l == null || r == null) return null;
            if (e.op === '||') return pgFormat(l) + pgFormat(r);
            if (['+', '-', '*', '/', '%'].includes(e.op)) {
                const [a, b] = [Number(l), Number(r)];
                if (!Number.isFinite(a) || !Number.isFinite(b)) throw pgErr(`operator does not exist: text ${e.op} ${typeof r === 'number' ? 'integer' : 'text'}`, e.pos, ['HINT:  No operator matches the given name and argument types. You might need to add explicit type casts.']);
                if ((e.op === '/' || e.op === '%') && b === 0) throw pgErr('division by zero', e.pos);
                const both = Number.isInteger(a) && Number.isInteger(b);
                return e.op === '+' ? a + b : e.op === '-' ? a - b : e.op === '*' ? a * b : e.op === '%' ? a % b : both ? Math.trunc(a / b) : a / b;
            }
            const cmp = pgCompare(l, r);
            return { '=': cmp === 0, '<>': cmp !== 0, '!=': cmp !== 0, '<': cmp < 0, '>': cmp > 0, '<=': cmp <= 0, '>=': cmp >= 0 }[e.op];
        }
        case 'fn': return pgCall(e, ctx);
        default: throw pgErr('syntax error', 0);
    }
}

function pgCall(e, ctx) {
    const { sess } = ctx;
    if (PG_AGGS.has(e.name)) {
        if (!ctx.group) throw pgErr(`aggregate functions are not allowed in ${ctx.clause || 'WHERE'}`, e.pos);
        if (ctx.inAgg) throw pgErr('aggregate function calls cannot be nested', e.pos);
        if (e.name === 'count' && e.args[0]?.k === 'star') return ctx.group.length;
        let vals = ctx.group.map((row) => pgEval(e.args[0], { ...ctx, row, inAgg: true })).filter((v) => v != null);
        if (e.distinct) vals = [...new Map(vals.map((v) => [JSON.stringify(v), v])).values()];
        if (e.name === 'count') return vals.length;
        if (!vals.length) return null;
        if (e.name === 'min') return vals.reduce((a, b) => (pgCompare(a, b) <= 0 ? a : b));
        if (e.name === 'max') return vals.reduce((a, b) => (pgCompare(a, b) >= 0 ? a : b));
        if (e.name === 'sum') return vals.reduce((a, b) => a + Number(b), 0);
        if (e.name === 'avg') return vals.reduce((a, b) => a + Number(b), 0) / vals.length;
        if (e.name === 'bool_and') return vals.every(Boolean);
        if (e.name === 'bool_or') return vals.some(Boolean);
        if (e.name === 'array_agg') return `{${vals.map((v) => (/[\s,{}"]/.test(pgFormat(v)) ? `"${pgFormat(v)}"` : pgFormat(v))).join(',')}}`;
        const sep = pgEval(e.args[1] ?? { k: 'lit', v: '' }, { ...ctx, inAgg: true });
        return vals.map(pgFormat).join(sep);
    }
    const args = e.args.map((a) => pgEval(a, ctx));
    const str = (n = 0) => (args[n] == null ? null : pgFormat(args[n]));
    const fns = {
        version: () => `PostgreSQL ${PG_VERSION} on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.1 20250813, 64-bit`,
        current_user: () => sess.role,
        session_user: () => sess.role,
        user: () => sess.role,
        current_database: () => sess.db,
        current_catalog: () => sess.db,
        current_schema: () => 'public',
        current_date: () => pgFormat(new Date()).slice(0, 10),
        current_timestamp: () => new Date(),
        now: () => new Date(),
        pg_backend_pid: () => sess.pid,
        inet_server_port: () => (sess.host ? 5432 : null),
        inet_server_addr: () => (sess.host ? '127.0.0.1' : null),
        inet_client_addr: () => (sess.host ? '127.0.0.1' : null),
        pg_postmaster_start_time: () => new Date(BOOT_TIME),
        pg_is_in_recovery: () => true,
        lower: () => str()?.toLowerCase() ?? null,
        upper: () => str()?.toUpperCase() ?? null,
        initcap: () => str()?.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()) ?? null,
        length: () => (args[0] == null ? null : [...str()].length),
        char_length: () => (args[0] == null ? null : [...str()].length),
        reverse: () => (args[0] == null ? null : [...str()].reverse().join('')),
        trim: () => str()?.trim() ?? null,
        replace: () => (args.some((a) => a == null) ? null : str().split(str(1)).join(str(2))),
        substr: () => (args[0] == null ? null : str().substr(Math.max(0, args[1] - 1), args[2] ?? undefined)),
        substring: () => (args[0] == null ? null : str().substr(Math.max(0, args[1] - 1), args[2] ?? undefined)),
        left: () => (args[0] == null ? null : str().slice(0, args[1])),
        right: () => (args[0] == null ? null : str().slice(-args[1])),
        split_part: () => (args[0] == null ? null : str().split(str(1))[args[2] - 1] ?? ''),
        concat: () => args.filter((a) => a != null).map(pgFormat).join(''),
        concat_ws: () => args.slice(1).filter((a) => a != null).map(pgFormat).join(str()),
        coalesce: () => args.find((a) => a != null) ?? null,
        nullif: () => (pgCompare(args[0], args[1]) === 0 ? null : args[0]),
        abs: () => Math.abs(args[0]),
        round: () => Number(Number(args[0]).toFixed(args[1] ?? 0)),
        floor: () => Math.floor(args[0]),
        ceil: () => Math.ceil(args[0]),
        random: () => Math.random(),
        gen_random_uuid: () => crypto.randomUUID(),
        pg_sleep: () => ({ sleep: Number(args[0]) || 0 }),
        has_table_privilege: () => {
            const t = sess.tables()[str(args.length > 2 ? 1 : 0)];
            return !!t && pgCanRead(sess, t);
        },
    };
    if (e.name === 'sha256') {
        if (args[0] == null) return null;
        return `\\x${sha256(str())}`;
    }
    const fn = Object.hasOwn(fns, e.name) && fns[e.name];
    if (!fn) {
        const types = e.args.map((a) => (a.k === 'lit' ? (typeof a.v === 'number' ? 'integer' : 'unknown') : 'text'));
        throw pgErr(`function ${e.name}(${types.join(', ')}) does not exist`, e.pos, ['HINT:  No function matches the given name and argument types. You might need to add explicit type casts.']);
    }
    return fn();
}

function pgFormat(v) {
    if (v == null) return '';
    if (v === true) return 't';
    if (v === false) return 'f';
    if (v instanceof Date) {
        const pad = (n, w = 2) => String(n).padStart(w, '0');
        const off = -v.getTimezoneOffset();
        const tz = `${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}${Math.abs(off) % 60 ? `:${pad(Math.abs(off) % 60)}` : ''}`;
        return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}.${pad(v.getMilliseconds(), 3)}${pad(Math.floor(Math.random() * 1000), 3)}${tz}`;
    }
    return String(v);
}

const colName = (e) => (e.k === 'col' ? e.name : e.k === 'fn' ? e.name : e.k === 'cast' ? colName(e.e) : '?column?');

function pgCanRead(sess, t) {
    if (PG_ROLES[sess.role].su) return true;
    if (t.suOnly) return false;
    return t.owner === sess.role || t.shared;
}

async function pgSelect(sess, sql) {
    const p = sqlParser(sql);
    p.kw('select');
    const q = p.select();
    let rows = [{}];
    let cols = [];
    let fromName = null;
    if (q.from) {
        const t = sess.tables()[q.from.name];
        if (!t) throw pgErr(`relation "${q.from.name}" does not exist`, q.from.pos);
        if (!pgCanRead(sess, t)) throw pgErr(`permission denied for ${t.view ? 'view' : 'table'} ${q.from.name}`);
        cols = t.cols.map(([n]) => n);
        rows = t.rows.map((r) => Object.fromEntries(cols.map((n, i) => [n, r[i]])));
        fromName = q.from.alias || q.from.name;
    }
    const base = { sess, tables: q.from ? [q.from.name, q.from.alias].filter(Boolean) : null, fromName };
    if (q.where) {
        if (hasAgg(q.where)) throw pgErr('aggregate functions are not allowed in WHERE', 0);
        rows = rows.filter((row) => pgEval(q.where, { ...base, row }) === true);
    }

    // SELECT * expands to the table's columns.
    const items = q.items.flatMap((it) => {
        if (it.e.k !== 'star') return [it];
        if (!q.from) throw pgErr('SELECT * with no tables specified is not valid', 0);
        return cols.map((n) => ({ e: { k: 'col', name: n }, alias: null }));
    });
    const names = items.map((it) => it.alias ?? colName(it.e));

    const grouped = q.group.length || items.some((it) => hasAgg(it.e)) || (q.having && hasAgg(q.having));
    let units;
    if (grouped) {
        const groupCols = new Set(q.group.filter((g) => g.k === 'col').map((g) => g.name));
        const keyOf = (row) => JSON.stringify(q.group.map((g) => (g.k === 'lit' && typeof g.v === 'number' ? pgEval(items[g.v - 1].e, { ...base, row }) : pgEval(g, { ...base, row }))));
        const groups = new Map();
        for (const row of rows) {
            const key = keyOf(row);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        }
        if (!q.group.length && !groups.size) groups.set('[]', []);
        q.group.forEach((g) => g.k === 'lit' && items[g.v - 1]?.e.k === 'col' && groupCols.add(items[g.v - 1].e.name));
        units = [...groups.values()].map((group) => ({ ...base, row: group[0] ?? Object.fromEntries(cols.map((n) => [n, null])), group, groupCols, clause: 'SELECT' }));
        if (q.having) units = units.filter((ctx) => pgEval(q.having, ctx) === true);
    } else {
        units = rows.map((row) => ({ ...base, row }));
    }

    let out = units.map((ctx) => ({ ctx, vals: items.map((it) => pgEval(it.e, ctx)) }));
    if (q.distinct) out = [...new Map(out.map((o) => [JSON.stringify(o.vals.map(pgFormat)), o])).values()];
    if (q.order.length) {
        const key = (o, { e }) => {
            if (e.k === 'lit' && typeof e.v === 'number') {
                if (!names[e.v - 1]) throw pgErr(`ORDER BY position ${e.v} is not in select list`, 0);
                return o.vals[e.v - 1];
            }
            // Output column names win over input columns, as in PostgreSQL.
            if (e.k === 'col' && !e.table && names.includes(e.name)) {
                return o.vals[names.indexOf(e.name)];
            }
            return pgEval(e, { ...o.ctx, clause: 'ORDER BY' });
        };
        const keyed = out.map((o) => ({ o, keys: q.order.map((ob) => key(o, ob)) }));
        keyed.sort((a, b) => {
            for (let k = 0; k < q.order.length; k++) {
                const [x, y] = [a.keys[k], b.keys[k]];
                if (x == null || y == null) {
                    if (x == y) continue;
                    return (x == null ? 1 : -1) * (q.order[k].desc ? -1 : 1);
                }
                const d = pgCompare(x, y);
                if (d) return q.order[k].desc ? -d : d;
            }
            return 0;
        });
        out = keyed.map((k) => k.o);
    }
    out = out.slice(q.offset ?? 0, q.limit === undefined ? undefined : (q.offset ?? 0) + q.limit);

    for (const o of out) {
        const nap = o.vals.find((v) => v && typeof v === 'object' && 'sleep' in v);
        if (nap) {
            for (let t = 0; t < nap.sleep * 10 && !state.abort; t++) await new Promise((r) => setTimeout(r, 100));
            if (state.abort) throw pgErr('canceling statement due to user request');
            o.vals = o.vals.map((v) => (v === nap ? '' : v));
        }
    }
    const numeric = items.map((_, i) => out.some((o) => typeof o.vals[i] === 'number'));
    return { names, rows: out.map((o) => o.vals.map(pgFormat)), numeric };
}

// ---------- statements ----------

const PG_SETTINGS = {
    server_version: PG_VERSION, server_encoding: 'UTF8', client_encoding: 'UTF8', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    transaction_read_only: 'on', default_transaction_read_only: 'on', search_path: '"$user", public', max_connections: '100',
    shared_buffers: '128MB', data_directory: '/var/lib/postgres/data', listen_addresses: '*', port: '5432', ssl: 'on',
    password_encryption: 'scram-sha-256', log_connections: 'on',
};

async function pgStatement(sess, sql) {
    sess.lastQuery = sql.trim();
    const words = sql.trim().replace(/^\(+/, '').split(/\s+/).map((w) => w.toLowerCase().replace(/;$/, ''));
    const verb = words[0];
    if (verb === 'select' || verb === 'with' || verb === 'table' || verb === 'values') {
        if (verb === 'table') return pgSelect(sess, `select * from ${sql.trim().slice(5)}`);
        if (verb !== 'select') throw pgErr(`${verb.toUpperCase()} is not supported on this server`, 0, ['HINT:  Plain SELECT works: SELECT * FROM projects;']);
        return pgSelect(sess, sql);
    }
    if (['insert', 'update', 'delete', 'truncate', 'create', 'drop', 'alter', 'grant', 'revoke', 'copy', 'comment', 'vacuum', 'reindex'].includes(verb)) {
        const tag = ['create', 'drop', 'alter'].includes(verb) ? `${verb} ${words[1] === 'or' ? 'function' : words[1] ?? ''}`.trim().toUpperCase() : verb.toUpperCase();
        throw pgErr(`cannot execute ${tag} in a read-only transaction`);
    }
    if (['begin', 'start'].includes(verb)) return { tag: 'BEGIN' };
    if (['commit', 'end'].includes(verb)) return { tag: 'COMMIT', notice: 'WARNING:  there is no transaction in progress' };
    if (['rollback', 'abort'].includes(verb)) return { tag: 'ROLLBACK', notice: 'WARNING:  there is no transaction in progress' };
    if (verb === 'set') {
        if (/read[\s_]*only\s*(=|to)?\s*'?(off|false)|read\s+write/i.test(sql)) throw pgErr('cannot set transaction read-write mode during recovery');
        return { tag: 'SET' };
    }
    if (verb === 'show') {
        const name = (words[1] || '').replace(/;$/, '');
        if (name === 'all') return { names: ['name', 'setting'], rows: Object.entries(PG_SETTINGS), numeric: [false, false] };
        if (!(name in PG_SETTINGS)) throw pgErr(`unrecognized configuration parameter "${name}"`);
        return { names: [name], rows: [[PG_SETTINGS[name]]], numeric: [false] };
    }
    if (verb === 'explain') {
        const target = (sql.match(/\bfrom\s+(?:public\.)?(\w+)/i) || [])[1]?.toLowerCase();
        const t = target && sess.tables()[target];
        if (target && !t) throw pgErr(`relation "${target}" does not exist`);
        const plan = t ? `Seq Scan on ${target}  (cost=0.00..1.${String(t.rows.length).padStart(2, '0')} rows=${t.rows.length} width=${t.cols.length * 32})` : 'Result  (cost=0.00..0.01 rows=1 width=32)';
        const rows = [[plan]];
        if (/\bwhere\b/i.test(sql) && t) rows.push(['  Filter: (...)']);
        if (/\banalyze\b/i.test(words[1] || '')) rows.push(['Planning Time: 0.051 ms'], [`Execution Time: 0.0${10 + (Date.now() % 80)} ms`]);
        return { names: ['QUERY PLAN'], rows, numeric: [false] };
    }
    if (verb === 'listen' || verb === 'notify' || verb === 'discard' || verb === 'reset') return { tag: verb.toUpperCase() };
    const p = sqlParser(sql);
    throw p.near();
}

// ---------- output ----------

function pgTable(res, opts, title, footer = !title) {
    const { names, rows, numeric } = res;
    if (opts.unaligned) {
        return [...(opts.tuplesOnly ? [] : [names.join('|')]), ...rows.map((r) => r.join('|')), ...(opts.tuplesOnly ? [] : [`(${rows.length} row${rows.length === 1 ? '' : 's'})`])];
    }
    if (opts.expanded) {
        if (!rows.length) return opts.tuplesOnly ? [] : ['(0 rows)'];
        const kw = Math.max(...names.map((n) => n.length));
        const vw = Math.max(...rows.flat().map((v) => v.length), 0);
        return rows.flatMap((r, i) => [
            ...(opts.tuplesOnly ? (i ? [''] : []) : [`-[ RECORD ${i + 1} ]`.padEnd(kw + 1, '-') + '+' + '-'.repeat(Math.max(0, vw + 1))]),
            ...r.map((v, j) => `${names[j].padEnd(kw)} | ${v}`.trimEnd()),
        ]);
    }
    const w = names.map((n, i) => Math.max(n.length, ...rows.map((r) => r[i].length)));
    const center = (s, n) => ' '.repeat(Math.floor((n - s.length) / 2)) + s + ' '.repeat(Math.ceil((n - s.length) / 2));
    const line = (cells) => cells.map((v, i) => ` ${numeric[i] ? v.padStart(w[i]) : v.padEnd(w[i])} `).join('|').trimEnd();
    const out = [];
    if (!opts.tuplesOnly) {
        if (title) out.push(center(title, w.reduce((a, b) => a + b + 3, -1)).trimEnd());
        out.push(names.map((n, i) => ` ${center(n, w[i])} `).join('|').trimEnd(), w.map((n) => '-'.repeat(n + 2)).join('+'));
    }
    out.push(...rows.map(line));
    if (!opts.tuplesOnly && footer) out.push(`(${rows.length} row${rows.length === 1 ? '' : 's'})`);
    if (!opts.tuplesOnly) out.push('');
    return out;
}

function pgErrorLines(e, sql) {
    const out = [`ERROR:  ${e.message}`];
    if (e.pos !== undefined && sql) {
        const before = sql.slice(0, e.pos);
        const n = before.split('\n').length;
        const text = sql.split('\n')[n - 1];
        const col = before.length - before.lastIndexOf('\n') - 1;
        const prefix = `LINE ${n}: `;
        out.push(prefix + text, ' '.repeat(prefix.length + col) + '^');
    }
    return [...out, ...(e.extra || [])];
}

// Runs one statement; returns lines for stdout, prints errors (stderr) itself.
async function pgRun(sess, sql) {
    const started = performance.now();
    try {
        const res = await pgStatement(sess, sql);
        const out = [];
        if (res.notice) err(res.notice);
        if (res.tag) out.push(...(sess.opts.quiet ? [] : [res.tag]));
        else out.push(...pgTable(res, sess.opts));
        if (sess.opts.timing) out.push(`Time: ${(performance.now() - started + 0.2).toFixed(3)} ms`);
        return out.map(esc);
    } catch (e) {
        if (!e.pg) throw e;
        for (const l of pgErrorLines(e, sql)) err(l);
        return [];
    }
}

// ---------- backslash commands ----------

function pgMeta(sess, line) {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    const arg = rest[0];
    const opts = { ...sess.opts, expanded: false };
    const list = (title, names, rows, footer = false) => pgTable({ names, rows, numeric: names.map(() => false) }, opts, title, footer).map(esc);
    const dbs = pgDatabases();
    const name = cmd.replace(/\+$/, '');
    switch (name) {
        case '\\q': return 'quit';
        case '\\?': return [
            'General', '  \\copyright             show PostgreSQL usage and distribution terms', '  \\h [NAME]              help on syntax of SQL commands', '  \\q                     quit psql', '',
            'Informational', '  \\d[S+]                 list tables, views, and sequences', '  \\d[S+]  NAME           describe table, view, sequence, or index',
            '  \\dn[S+] [PATTERN]      list schemas', '  \\dt[S+] [PATTERN]      list tables', '  \\du[S+] [PATTERN]      list roles', '  \\l[+]   [PATTERN]      list databases', '',
            'Formatting', '  \\x [on|off|auto]       toggle expanded output (currently ' + (sess.opts.expanded ? 'on' : 'off') + ')', '  \\timing [on|off]       toggle timing of commands (currently ' + (sess.opts.timing ? 'on' : 'off') + ')', '',
            'Connection', '  \\c[onnect] [DBNAME|- USER]', '                         connect to new database (currently "' + sess.db + '")', '  \\conninfo              display information about current connection', '',
            'Input/Output', '  \\echo [-n] [STRING]    write string to standard output', '',
        ].map(esc);
        case '\\copyright': return ['PostgreSQL Database Management System', '(also known as Postgres, formerly known as Postgres95)', '', 'Portions Copyright (c) 1996-2025, PostgreSQL Global Development Group'];
        case '\\h': return ['Available help:', '  ALTER TABLE   BEGIN   COMMIT   CREATE TABLE   DELETE   DROP TABLE   EXPLAIN   INSERT', '  ROLLBACK   SELECT   SET   SHOW   TABLE   UPDATE', '', esc('SELECT [ DISTINCT ] expression [ [ AS ] name ] [, ...] [ FROM table ] [ WHERE condition ]'), esc('    [ GROUP BY expression [, ...] ] [ HAVING condition ] [ ORDER BY expression [ ASC | DESC ] [, ...] ]'), esc('    [ LIMIT count ] [ OFFSET start ]')];
        case '\\l': case '\\list':
            return list('List of databases', ['Name', 'Owner', 'Encoding', 'Locale Provider', 'Collate', 'Ctype', 'Access privileges'],
                Object.entries(dbs).sort(([x], [y]) => x.localeCompare(y)).map(([n, d]) => [n, d.owner, 'UTF8', 'libc', 'en_US.UTF-8', 'en_US.UTF-8', n.startsWith('template') ? '=c/postgres' : n === 'portfolio' ? '=Tc/neox' : n === 'postgres' ? '' : `${d.owner}=CTc/${d.owner}`]), true);
        case '\\c': case '\\connect': {
            if (!arg) return [esc(`You are now connected to database "${sess.db}" as user "${sess.role}".`)];
            const role = rest[1] && rest[1] !== '-' ? rest[1] : sess.role;
            const db = arg === '-' ? sess.db : arg;
            const problem = pgConnectError(db, role, sess.osUser, sess.host);
            if (problem) {
                err(`connection to server on socket "${PG_SOCKET}" failed: ${problem}`);
                err('Previous connection kept');
                return [];
            }
            Object.assign(sess, { db, role });
            return [esc(`You are now connected to database "${db}" as user "${role}".`)];
        }
        case '\\conninfo':
            return [esc(sess.host
                ? `You are connected to database "${sess.db}" as user "${sess.role}" on host "${sess.host}" (address "127.0.0.1") at port "5432".`
                : `You are connected to database "${sess.db}" as user "${sess.role}" via socket in "/run/postgresql" at port "5432".`)];
        case '\\d': case '\\dt': {
            const tables = dbs[sess.db].tables;
            if (arg && name === '\\d') {
                const rel = arg.replace(/^(public|pg_catalog)\./, '').toLowerCase();
                const t = tables[rel] || pgCatalog(sess)[rel];
                if (!t) return err(`Did not find any relation named "${arg}".`);
                const out = list(`${t.view ? 'View "pg_catalog' : 'Table "public'}.${rel}"`, ['Column', 'Type', 'Collation', 'Nullable', 'Default'],
                    t.cols.map(([n, type]) => [n, type, '', n === 'id' && !t.view ? 'not null' : '', n === 'id' && !t.view ? `nextval('${rel}_id_seq'::regclass)` : '']));
                out.pop();
                if (t.cols[0][0] === 'id' && !t.view) out.push('Indexes:', esc(`    "${rel}_pkey" PRIMARY KEY, btree (id)`));
                return [...out, ''];
            }
            const rows = Object.entries(tables).sort(([x], [y]) => x.localeCompare(y)).filter(([n]) => !arg || likeRegex(arg.replace(/\*/g, '%'), false).test(n)).map(([n, t]) => ['public', n, 'table', t.owner]);
            if (!rows.length) return [arg ? esc(`Did not find any relation named "${arg}".`) : 'Did not find any relations.'];
            return list('List of relations', ['Schema', 'Name', 'Type', 'Owner'], rows, true);
        }
        case '\\du': case '\\dg':
            return list('List of roles', ['Role name', 'Attributes'], Object.entries(PG_ROLES).map(([n, r]) => [n, r.attrs]));
        case '\\dn':
            return list('List of schemas', ['Name', 'Owner'], [['public', 'pg_database_owner']]);
        case '\\dx':
            return list('List of installed extensions', ['Name', 'Version', 'Schema', 'Description'], [['plpgsql', '1.0', 'pg_catalog', 'PL/pgSQL procedural language']], true);
        case '\\x': {
            sess.opts.expanded = arg ? ['on', 'auto'].includes(arg) : !sess.opts.expanded;
            return [`Expanded display is ${sess.opts.expanded ? 'on' : 'off'}.`];
        }
        case '\\timing': {
            sess.opts.timing = arg ? arg === 'on' : !sess.opts.timing;
            return [`Timing is ${sess.opts.timing ? 'on' : 'off'}.`];
        }
        case '\\echo': return [esc(rest.join(' '))];
        case '\\!': return [];
        default:
            err(`invalid command ${cmd}`);
            err('Try \\? for help.');
            return [];
    }
}

// ---------- connecting ----------

function pgConnectError(db, role, osUser, host) {
    if (!PG_ROLES[role]) return `FATAL:  role "${role}" does not exist`;
    if (!host && role !== osUser) return `FATAL:  Peer authentication failed for user "${role}"`;
    const d = pgDatabases()[db];
    if (!d) return `FATAL:  database "${db}" does not exist`;
    if (d.noConnect) return `FATAL:  database "${db}" is not currently accepting connections`;
    if (!PG_ROLES[role].su && d.owner !== role && !['portfolio', 'postgres', 'template1'].includes(db)) {
        return `FATAL:  permission denied for database "${db}"\nDETAIL:  User does not have CONNECT privilege.`;
    }
    return null;
}

function psqlSplit(buf) {
    const stmts = [];
    let start = 0;
    let quote = null;
    for (let i = 0; i < buf.length; i++) {
        const ch = buf[i];
        if (quote) {
            if (ch === quote) quote = null;
        } else if (ch === "'" || ch === '"') {
            quote = ch;
        } else if (ch === '-' && buf[i + 1] === '-') {
            const nl = buf.indexOf('\n', i);
            if (nl < 0) break;
            i = nl;
        } else if (ch === ';') {
            if (buf.slice(start, i).trim()) stmts.push(buf.slice(start, i + 1).trim());
            start = i + 1;
        }
    }
    const rest = buf.slice(start);
    return { stmts, rest: rest.replace(/--[^\n]*/g, '').trim() ? rest.replace(/^\s*\n/, '') : '', quote };
}

async function cmdPsql({ args, stdin }) {
    const opts = {};
    const commands = [];
    const pos = [];
    let db;
    let role;
    let host;
    let file;
    let listDbs = false;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        const val = () => (a.length > 2 && !a.startsWith('--') ? a.slice(2) : a.includes('=') ? a.split('=').slice(1).join('=') : args[++i]);
        if (a === '-V' || a === '--version') return [`psql (PostgreSQL) ${PG_VERSION}`];
        else if (/^(-c|--command)/.test(a)) commands.push(val());
        else if (/^(-d|--dbname)/.test(a)) db = val();
        else if (/^(-U|--username)/.test(a)) role = val();
        else if (/^(-h|--host)/.test(a)) host = val();
        else if (/^(-p|--port)/.test(a)) {
            const port = val();
            if (port !== '5432') return err(`psql: error: connection to server on socket "/run/postgresql/.s.PGSQL.${port}" failed: No such file or directory\n\tIs the server running locally and accepting connections on that socket?`);
        } else if (/^(-f|--file)/.test(a)) file = val();
        else if (a === '-l' || a === '--list') listDbs = true;
        else if (/^-[tAxXqwW]+$/.test(a)) {
            if (a.includes('t')) opts.tuplesOnly = true;
            if (a.includes('A')) opts.unaligned = true;
            if (a.includes('x')) opts.expanded = true;
            if (a.includes('q')) opts.quiet = true;
        } else if (/^postgres(ql)?:\/\//.test(a)) {
            try {
                const u = new URL(a);
                host = u.hostname || undefined;
                role = decodeURIComponent(u.username) || role;
                db = u.pathname.slice(1) || db;
            } catch {
                return err(`psql: error: invalid URI: "${a}"`);
            }
        } else if (a.startsWith('-')) {
            err(`psql: error: invalid option -- '${a.replace(/^-+/, '')}'`);
            return err('psql: hint: Try "psql --help" for more information.');
        } else pos.push(a);
    }
    db ??= pos[0];
    role ??= pos[1] ?? state.env.PGUSER ?? state.user;
    db ??= state.env.PGDATABASE ?? role;
    host ??= state.env.PGHOST;
    if (host?.startsWith('/')) host = undefined;

    const where = host ? `connection to server at "${host}" (${resolve(host) ?? host}), port 5432 failed` : `connection to server on socket "${PG_SOCKET}" failed`;
    if (host && !resolve(host)) return err(`psql: error: could not translate host name "${host}" to address: Name or service not known`);
    if (UNITS.postgresql?.active === false) {
        return err(host ? `psql: error: ${where}: Connection refused\n\tIs the server running on that host and accepting TCP/IP connections?` : `psql: error: ${where}: No such file or directory\n\tIs the server running locally and accepting connections on that socket?`);
    }
    if (host && !resolve(host).startsWith('127.')) {
        await sleep(1500);
        return err(`psql: error: ${where}: Connection timed out\n\tIs the server running on that host and accepting TCP/IP connections?`);
    }
    if (host) {
        // pg_hba.conf: peer for the local socket, scram-sha-256 over TCP. No password is on this box.
        if (!PG_ROLES[role]) return err(`psql: error: ${where}: FATAL:  role "${role}" does not exist`);
        const pw = await ask(`Password for user ${role}: `, true);
        if (state.abort) return;
        await sleep(300);
        journal('postgres', `FATAL:  password authentication failed for user "${role}"`);
        return err(`psql: error: ${where}: ${pw ? `FATAL:  password authentication failed for user "${role}"` : 'fe_sendauth: no password supplied'}`);
    }
    const problem = pgConnectError(listDbs ? 'postgres' : db, role, state.user, host);
    if (problem) return err(`psql: error: ${where}: ${problem}`);

    const sess = { db: listDbs ? 'postgres' : db, role, osUser: state.user, host, opts, pid: 5000 + Math.floor(Math.random() * 4000) };
    sess.tables = () => ({ ...pgDatabases()[sess.db].tables, ...pgCatalog(sess) });
    journal('postgres', `connection authorized: user=${role} database=${sess.db} application_name=psql`);

    // Scripted runs: -l, -c, -f, or SQL piped in.
    const script = file ? readFile(file, 'psql') : stdin;
    if (file && script == null) return;
    if (listDbs || commands.length || script != null) {
        const out = [];
        if (listDbs) out.push(...pgMeta(sess, '\\l'));
        for (const cmd of commands) {
            if (cmd.trim().startsWith('\\')) out.push(...(await pgMeta(sess, cmd) || []));
            else {
                const { stmts, rest } = psqlSplit(cmd);
                for (const s of rest.trim() ? [...stmts, rest.trim()] : stmts) out.push(...(await pgRun(sess, s)));
            }
        }
        if (script != null) {
            for (const line of script.split('\n').filter((l) => l.trim().startsWith('\\'))) {
                const r = await pgMeta(sess, line);
                if (r === 'quit') break;
                out.push(...(r || []));
            }
            for (const s of psqlSplit(script.split('\n').filter((l) => !l.trim().startsWith('\\')).join('\n')).stmts) out.push(...(await pgRun(sess, s)));
        }
        return out;
    }

    setTitle(`psql ${sess.db}`);
    print([`psql (${PG_VERSION})`, 'Type "help" for help.', '']);
    if (!shared.psqlTipShown) {
        shared.psqlTipShown = true;
        print(c('dim', esc('-- the CV lives here as tables: \\dt lists them, then try SELECT * FROM projects;')));
    }
    let buf = '';
    let quote = null;
    while (!state.abort) {
        const mark = quote ? quote : buf ? '-' : '=';
        const line = await ask(`${sess.db}${mark}${PG_ROLES[sess.role].su ? '#' : '>'} `);
        if (state.abort) break;
        if (!buf && /^\s*\\/.test(line)) {
            const res = await pgMeta(sess, line);
            if (res === 'quit') break;
            if (res?.length) print(res);
            continue;
        }
        if (!buf && /^\s*(quit|exit)\s*;?\s*$/i.test(line)) break;
        if (!buf && /^\s*help\s*;?\s*$/i.test(line)) {
            print(['You are using psql, the command-line interface to PostgreSQL.', 'Type:  \\copyright for distribution terms', '       \\h for help with SQL commands',
                '       \\? for help with psql commands', '       \\g or terminate with semicolon to execute query', '       \\q to quit'].map(esc));
            continue;
        }
        // A trailing \g runs the buffer, like a semicolon.
        const full = (buf ? `${buf}\n` : '') + line.replace(/\\g\s*$/, ';');
        const split = psqlSplit(full);
        for (const s of split.stmts) {
            const out = await pgRun(sess, s);
            if (out.length) print(out);
            if (state.abort) break;
        }
        buf = split.rest;
        quote = split.quote;
    }
}

function cmdPgIsready() {
    if (UNITS.postgresql?.active === false) {
        state.status = 2;
        return ['/run/postgresql:5432 - no response'];
    }
    return ['/run/postgresql:5432 - accepting connections'];
}

Object.assign(COMMANDS, {
    psql: { group: 'DevOps', usage: 'psql [DBNAME] | psql -c SQL | psql -l', desc: 'PostgreSQL interactive terminal — the CV as a read-only database', run: cmdPsql },
    pg_isready: { group: 'Hidden', usage: 'pg_isready', desc: 'check the connection status of a PostgreSQL server', run: cmdPgIsready },
});
