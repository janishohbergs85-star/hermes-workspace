#!/usr/bin/env node
// ── Mission Control · personal token-burn dashboard ──────────────
//
// Inspired by Nate B. Jones' token-burn dashboard. The whole point:
// you can't trust one token number across your tools, so this reads
// the REAL local usage logs each AI tool writes on your Mac and shows
// one lens per tool plus a reconciled combined view.
//
//   node mission-control.mjs              # scan + open dashboard
//   node mission-control.mjs --days 7     # last 7 days (default 30)
//   node mission-control.mjs --port 5000  # pick a port (default 4317)
//   node mission-control.mjs --json       # print JSON, don't serve
//   node mission-control.mjs --no-open    # don't auto-open browser
//
// Zero dependencies. Needs Node 18+. No servers, no accounts, no
// network — it only reads files already on your machine.
//
// Data sources it auto-detects:
//   • Claude Code   ~/.claude/projects/**/*.jsonl   (exact token usage)
//   • Codex CLI     ~/.codex/sessions/**/*.jsonl    (best-effort)
// Tools that keep usage server-side (ChatGPT web/desktop, Gemini web,
// etc.) have no local log to read — they'll simply not appear. The
// console prints exactly what was found and where.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { exec } from 'node:child_process'

// ── args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const DAYS = Math.max(1, Number(arg('--days', '30')) || 30)
const PORT = Number(arg('--port', '4317')) || 4317
const JSON_ONLY = args.includes('--json')
const NO_OPEN = args.includes('--no-open')
const HOME = homedir()
const SINCE = Date.now() - DAYS * 86400_000

// ── file walking (no glob deps) ──────────────────────────────────
function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    try {
      if (e.isDirectory()) walk(p, out)
      else if (e.isFile() && p.endsWith('.jsonl')) out.push(p)
    } catch {
      /* unreadable entry — skip */
    }
  }
  return out
}

function readLines(file) {
  try {
    return readFileSync(file, 'utf8').split('\n')
  } catch {
    return []
  }
}

function dayKey(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

// A record: { tool, model, day, input, output, cacheRead, cacheCreate, reasoning, session }
const records = []
const found = {} // tool -> { files, sessions:Set, tokens }

function note(tool, file) {
  found[tool] ??= { files: 0, sessions: new Set(), tokens: 0 }
  found[tool].files += 1
}
function tally(tool, session, tokens) {
  found[tool].sessions.add(session)
  found[tool].tokens += tokens
}

// ── source: Claude Code ──────────────────────────────────────────
function scanClaude() {
  const root = join(HOME, '.claude', 'projects')
  if (!existsSync(root)) return
  for (const file of walk(root)) {
    note('Claude Code', file)
    for (const line of readLines(file)) {
      if (!line) continue
      let o
      try {
        o = JSON.parse(line)
      } catch {
        continue
      }
      const u = o?.message?.usage
      if (!u) continue
      const ts = Date.parse(o.timestamp ?? o.ts ?? '') || statSync(file).mtimeMs
      if (ts < SINCE) continue
      const day = dayKey(ts)
      if (!day) continue
      const input = Number(u.input_tokens) || 0
      const output = Number(u.output_tokens) || 0
      const cacheRead = Number(u.cache_read_input_tokens) || 0
      const cacheCreate = Number(u.cache_creation_input_tokens) || 0
      const tokens = input + output + cacheRead + cacheCreate
      if (tokens === 0) continue
      const session = file
      records.push({
        tool: 'Claude Code',
        model: String(o.message?.model ?? 'claude'),
        day,
        input,
        output,
        cacheRead,
        cacheCreate,
        reasoning: 0,
        session,
      })
      tally('Claude Code', session, tokens)
    }
  }
}

// ── source: Codex CLI (best-effort) ──────────────────────────────
// Codex writes rollout JSONL under ~/.codex/sessions/YYYY/MM/DD/.
// Token usage shows up in token_count events. We sum per-turn deltas
// (`last_token_usage`) when present; otherwise we take the final
// cumulative (`total_token_usage`) per file. Model is whatever the
// session most recently reported.
function pickUsage(o) {
  const p = o?.payload ?? o
  const info = p?.info ?? p
  return (
    info?.last_token_usage ??
    p?.last_token_usage ??
    info?.total_token_usage ??
    p?.total_token_usage ??
    p?.token_usage ??
    o?.token_usage ??
    o?.usage ??
    null
  )
}
function isUsage(u) {
  return (
    u &&
    typeof u === 'object' &&
    ('input_tokens' in u || 'output_tokens' in u || 'total_tokens' in u)
  )
}
function findModel(o) {
  const cands = [
    o?.model,
    o?.payload?.model,
    o?.payload?.info?.model,
    o?.turn_context?.model,
    o?.payload?.turn_context?.model,
  ]
  for (const c of cands) if (typeof c === 'string' && c) return c
  return null
}
function scanCodex() {
  const root = join(HOME, '.codex')
  if (!existsSync(root)) return
  const files = walk(root)
  for (const file of files) {
    note('Codex', file)
    let model = null
    let cumulative = null // last seen total_token_usage object
    let usedDeltas = false
    const session = file
    const ftime = (() => {
      try {
        return statSync(file).mtimeMs
      } catch {
        return Date.now()
      }
    })()
    for (const line of readLines(file)) {
      if (!line) continue
      let o
      try {
        o = JSON.parse(line)
      } catch {
        continue
      }
      const m = findModel(o)
      if (m) model = m
      const ts =
        Date.parse(o?.timestamp ?? o?.ts ?? o?.payload?.timestamp ?? '') ||
        ftime
      const isTokenCount =
        o?.payload?.type === 'token_count' || o?.type === 'token_count'
      // Prefer per-turn deltas when the event carries them.
      const delta =
        o?.payload?.info?.last_token_usage ?? o?.last_token_usage ?? null
      const u = delta ?? pickUsage(o)
      if (!isUsage(u)) {
        // remember cumulative even if attached elsewhere
        const cum =
          o?.payload?.info?.total_token_usage ?? o?.total_token_usage ?? null
        if (isUsage(cum)) cumulative = { u: cum, ts }
        continue
      }
      if (ts < SINCE) {
        if (isTokenCount) cumulative = { u, ts }
        continue
      }
      if (delta && isUsage(delta)) {
        usedDeltas = true
        pushCodex(session, model, ts, delta)
      } else {
        // keep the latest cumulative snapshot as fallback
        cumulative = { u, ts }
      }
    }
    // If we never saw per-turn deltas, fall back to the final
    // cumulative snapshot as the session total.
    if (!usedDeltas && cumulative && cumulative.ts >= SINCE) {
      pushCodex(session, model, cumulative.ts, cumulative.u)
    }
  }
}
function pushCodex(session, model, ts, u) {
  const day = dayKey(ts)
  if (!day) return
  const input = Number(u.input_tokens) || 0
  const output = Number(u.output_tokens) || 0
  const cacheRead = Number(u.cached_input_tokens ?? u.cache_read_input_tokens) || 0
  const reasoning = Number(u.reasoning_output_tokens ?? u.reasoning_tokens) || 0
  let tokens = input + output + cacheRead + reasoning
  if (tokens === 0) tokens = Number(u.total_tokens) || 0
  if (tokens === 0) return
  records.push({
    tool: 'Codex',
    model: String(model ?? 'gpt-codex'),
    day,
    input,
    output,
    cacheRead,
    cacheCreate: 0,
    reasoning,
    session,
  })
  tally('Codex', session, tokens)
}

// ── run scanners ─────────────────────────────────────────────────
scanClaude()
scanCodex()

// ── build payload for the UI ─────────────────────────────────────
function buildPayload() {
  // flat day list for the window
  const days = []
  for (let i = DAYS - 1; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10))
  }
  return { generatedAt: Date.now(), windowDays: DAYS, days, records }
}

const summary = Object.entries(found).map(([tool, f]) => ({
  tool,
  files: f.files,
  sessions: f.sessions.size,
  tokens: f.tokens,
}))

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}

// ── console summary ──────────────────────────────────────────────
console.log('\n  Mission Control · token burn (last ' + DAYS + ' days)\n')
if (summary.length === 0) {
  console.log('  No local AI usage logs found.')
  console.log('  Looked in: ~/.claude/projects  and  ~/.codex')
  console.log(
    '  (Tools that keep usage on their servers — ChatGPT web/desktop,\n' +
      '   Gemini web — leave nothing local to read.)\n',
  )
} else {
  for (const s of summary) {
    console.log(
      '  ' +
        s.tool.padEnd(14) +
        fmt(s.tokens).padStart(8) +
        ' tokens  ·  ' +
        s.sessions +
        ' sessions  ·  ' +
        s.files +
        ' files',
    )
  }
  console.log('')
}

if (JSON_ONLY) {
  console.log(JSON.stringify(buildPayload(), null, 2))
  process.exit(0)
}

// ── HTML (self-contained, offline) ───────────────────────────────
function html(payload) {
  const data = JSON.stringify(payload)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Mission Control · Token Burn</title>
<style>
  :root{
    --bg:#0b0d12; --card:#141821; --card2:#1b2030; --border:#262d3d;
    --text:#e8ebf2; --muted:#8b93a7; --accent:#6aa3ff; --accent2:#b58bff;
    --success:#36d399; --warning:#f5b942; --danger:#f87171;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .wrap{max-width:1100px;margin:0 auto;padding:28px 22px 80px}
  h1{font-size:24px;letter-spacing:-.02em;margin:0 0 2px}
  .sub{color:var(--muted);font-size:13px;margin-bottom:20px}
  .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:18px}
  .tabs,.period{display:flex;flex-wrap:wrap;gap:6px}
  button{font:inherit;cursor:pointer;border-radius:9px;border:1px solid var(--border);
    background:var(--card);color:var(--muted);padding:7px 13px;
    text-transform:uppercase;font-size:11px;font-weight:700;letter-spacing:.05em;
    transition:.12s}
  button:hover{transform:translateY(-1px)}
  button.on{border-color:var(--accent);color:var(--accent);
    background:color-mix(in srgb,var(--accent) 14%,transparent)}
  .grid{display:grid;gap:12px}
  .kpis{grid-template-columns:repeat(4,1fr)}
  @media(max-width:680px){.kpis{grid-template-columns:repeat(2,1fr)}}
  .card{background:var(--card);border:1px solid var(--border);border-radius:14px;
    padding:14px 16px;position:relative;overflow:hidden}
  .card .bar{position:absolute;top:0;left:0;right:0;height:2px;
    background:linear-gradient(90deg,var(--accent),transparent)}
  .lab{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);font-weight:700}
  .big{font:700 26px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:3px}
  .tiny{font-size:11px;color:var(--muted);margin-top:2px}
  .two{grid-template-columns:2fr 1fr}
  @media(max-width:820px){.two{grid-template-columns:1fr}}
  .mixbar{display:flex;height:11px;border-radius:7px;overflow:hidden;background:var(--card2);margin:10px 0}
  .legend{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px;color:var(--muted)}
  .legend b{color:var(--text);font:600 11px ui-monospace,monospace}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:1px}
  .mdl{display:flex;flex-direction:column;gap:9px;margin-top:4px}
  .mdl .t{display:flex;justify-content:space-between;font-size:12px}
  .mdl .track{height:3px;border-radius:3px;background:var(--border);overflow:hidden}
  .mdl .fill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
  .rules{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
  @media(max-width:820px){.rules{grid-template-columns:1fr}}
  ol,ul{margin:6px 0 0;padding-left:0;list-style:none}
  .rule{margin-bottom:11px}
  .rule b{display:block;font-size:12px;color:var(--text)}
  .rule span{font-size:11px;color:var(--muted)}
  .chk{display:flex;gap:10px;align-items:flex-start;padding:6px 4px;border-radius:8px;cursor:pointer}
  .chk:hover{background:var(--card2)}
  .box{width:16px;height:16px;border-radius:4px;border:1px solid var(--border);
    display:flex;align-items:center;justify-content:center;font-size:10px;flex:0 0 auto;margin-top:2px}
  .box.on{background:var(--success);border-color:var(--success);color:#06281c}
  .chk.on span{color:var(--muted);text-decoration:line-through}
  .note{font-size:10px;color:var(--muted);margin-top:10px;line-height:1.6}
  svg text{fill:var(--muted);font-size:10px}
  .empty{padding:40px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:14px}
</style></head><body><div class="wrap">
<h1>Mission Control</h1>
<div class="sub">Token burn across your AI tools · last ${payload.windowDays} days · one number per tool, never one number total</div>
<div class="row">
  <div class="tabs" id="tabs"></div>
</div>
<div id="app"></div>
<div class="rules">
  <div class="card"><div class="bar" style="background:linear-gradient(90deg,var(--warning),transparent)"></div>
    <div class="lab">Five rules for reading the chart</div><ol id="rules"></ol></div>
  <div class="card"><div class="bar" style="background:linear-gradient(90deg,var(--success),transparent)"></div>
    <div class="lab">15-minute weekly review</div><ul id="review"></ul></div>
</div>
<div class="note">Reads local logs only: Claude Code (~/.claude) exact · Codex (~/.codex) best-effort. Tools that keep usage server-side (ChatGPT, Gemini web) don't appear because there's nothing local to read.</div>
</div>
<script>
const DATA = ${data};
const C = {input:'var(--accent)',output:'var(--success)',cache:'var(--accent2)',reasoning:'var(--warning)'};
function fmt(n){n=Math.round(n);if(n>=1e9)return (n/1e9).toFixed(2)+'B';if(n>=1e6)return (n/1e6).toFixed(1)+'M';if(n>=1e3)return (n/1e3).toFixed(1)+'K';return ''+n}
function tok(r){return r.input+r.output+r.cacheRead+r.cacheCreate+r.reasoning}

// build variants: Combined + one per tool
function variants(){
  const tools=[...new Set(DATA.records.map(r=>r.tool))];
  const mk=(label,recs)=>{
    const t=recs.reduce((a,r)=>a+tok(r),0);
    const sessions=new Set(recs.map(r=>r.session)).size;
    const models={};
    for(const r of recs){models[r.model]=(models[r.model]||0)+tok(r)}
    const top=Object.entries(models).map(([id,tokens])=>({id,tokens})).sort((a,b)=>b.tokens-a.tokens);
    const mix={input:0,output:0,cache:0,reasoning:0};
    for(const r of recs){mix.input+=r.input;mix.output+=r.output;mix.cache+=r.cacheRead+r.cacheCreate;mix.reasoning+=r.reasoning}
    const byDay={};
    for(const r of recs){byDay[r.day]=(byDay[r.day]||0)+tok(r)}
    const daily=DATA.days.map(d=>({day:d,tokens:byDay[d]||0}));
    return {label,tokens:t,sessions,top,mix,daily};
  };
  const all=DATA.records;
  const out=[Object.assign({id:'combined'},mk('Combined',all))];
  for(const tl of tools) out.push(Object.assign({id:tl},mk(tl,all.filter(r=>r.tool===tl))));
  return out.filter(v=>v.tokens>0);
}
const VS=variants();
let active = VS[0] ? VS[0].id : null;

function areaChart(daily){
  const w=620,h=200,pl=44,pb=22,pt=10,pr=12;
  const max=Math.max(1,...daily.map(d=>d.tokens));
  const iw=w-pl-pr, ih=h-pt-pb;
  const x=i=>pl+(daily.length<=1?iw/2:i/(daily.length-1)*iw);
  const y=v=>pt+ih-(v/max)*ih;
  let line='',area='M '+x(0)+' '+y(daily[0]?daily[0].tokens:0);
  daily.forEach((d,i)=>{const px=x(i),py=y(d.tokens);line+=(i?' L ':'M ')+px+' '+py;area+=' L '+px+' '+py});
  area+=' L '+x(daily.length-1)+' '+(pt+ih)+' L '+x(0)+' '+(pt+ih)+' Z';
  const ticks=[0,.5,1].map(f=>{const v=max*f;return '<line x1="'+pl+'" y1="'+y(v)+'" x2="'+(w-pr)+'" y2="'+y(v)+'" stroke="var(--border)" stroke-dasharray="3 3" opacity=".5"/><text x="'+(pl-6)+'" y="'+(y(v)+3)+'" text-anchor="end">'+fmt(v)+'</text>'}).join('');
  const step=Math.ceil(daily.length/8);
  const labs=daily.map((d,i)=>i%step===0?'<text x="'+x(i)+'" y="'+(h-6)+'" text-anchor="middle">'+d.day.slice(5)+'</text>':'').join('');
  return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" preserveAspectRatio="none" style="height:200px">'
    +'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
    +ticks+'<path d="'+area+'" fill="url(#g)"/><path d="'+line+'" fill="none" stroke="var(--accent)" stroke-width="2"/>'+labs+'</svg>';
}

function render(){
  const v=VS.find(x=>x.id===active);
  const app=document.getElementById('app');
  if(!v){app.innerHTML='<div class="empty">No local token usage found in this window.<br/>Run Claude Code or Codex on this Mac, then re-run mission-control.mjs.</div>';return}
  const mixTotal=v.mix.input+v.mix.output+v.mix.cache+v.mix.reasoning||1;
  const seg=(k)=>{const p=v.mix[k]/mixTotal*100;return p<.5?'':'<div style="width:'+p+'%;background:'+C[k]+'" title="'+k+' '+fmt(v.mix[k])+'"></div>'};
  const leg=(k,lbl)=>'<div><span class="dot" style="background:'+C[k]+'"></span>'+lbl+' <b>'+fmt(v.mix[k])+'</b> · '+(v.mix[k]/mixTotal*100).toFixed(0)+'%</div>';
  const maxm=Math.max(1,...v.top.map(m=>m.tokens));
  const models=v.top.slice(0,6).map(m=>'<div><div class="t"><span style="font-family:ui-monospace,monospace">'+m.id+'</span><span style="color:var(--muted)">'+fmt(m.tokens)+'</span></div><div class="track"><div class="fill" style="width:'+Math.max(2,m.tokens/maxm*100)+'%"></div></div></div>').join('');
  app.innerHTML=
    '<div class="grid kpis" style="margin-bottom:12px">'
    +kpi('Tokens',fmt(v.tokens),v.id==='combined'?'across every tool':'this tool')
    +kpi('Sessions',v.sessions,'')
    +kpi('Tokens / session',v.sessions?fmt(v.tokens/v.sessions):'—','burn per session')
    +kpi('Cache share',(v.mix.cache/mixTotal*100).toFixed(0)+'%','re-read context')
    +'</div>'
    +'<div class="grid two">'
    +'<div class="card"><div class="bar"></div><div class="lab">Daily burn</div>'+areaChart(v.daily)+'</div>'
    +'<div style="display:flex;flex-direction:column;gap:12px">'
    +'<div class="card"><div class="lab">Token mix</div><div class="mixbar">'+seg('cache')+seg('input')+seg('output')+seg('reasoning')+'</div>'
    +'<div class="legend">'+leg('cache','cache')+leg('input','input')+leg('output','output')+leg('reasoning','reasoning')+'</div></div>'
    +'<div class="card"><div class="lab">Top models</div><div class="mdl">'+(models||'<div class="tiny">—</div>')+'</div></div>'
    +'</div></div>';
}
function kpi(l,val,sub){return '<div class="card"><div class="bar"></div><div class="lab">'+l+'</div><div class="big">'+val+'</div>'+(sub?'<div class="tiny">'+sub+'</div>':'')+'</div>'}

function tabs(){
  document.getElementById('tabs').innerHTML=VS.map(v=>'<button class="'+(v.id===active?'on':'')+'" data-id="'+v.id+'">'+v.label+'</button>').join('');
  document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{active=b.dataset.id;tabs();render()});
}

const RULES=[
 ['1 · One number per tool','Each tool counts differently. Read every tab before trusting a combined figure.'],
 ['2 · Watch the cache','On long runs cache reads dwarf fresh input. A rising cache share is context being re-read.'],
 ['3 · Output/input is your “chatty” gauge','High output per prompt — spikes flag runaway loops or over-long generations.'],
 ['4 · Burn follows work','Compare daily burn to what you shipped. Tokens with no artifact is the waste to hunt.'],
 ['5 · Trust the source, not a dollar','Subscription runs cost ≈ $0 on the meter. Know which tool actually bills you.'],
];
document.getElementById('rules').innerHTML=RULES.map(r=>'<li class="rule"><b>'+r[0]+'</b><span>'+r[1]+'</span></li>').join('');

const STEPS=[
 ['per-tool','Skim each tool tab — any one burning out of proportion to its value?'],
 ['cache','Check the cache share. Climbing? Find the context that keeps getting re-read.'],
 ['spikes','Open the daily burn. Circle every spike and name what caused it.'],
 ['model','Is the top model the one you meant to use? Re-route if not.'],
 ['waste','Find tokens with no artifact attached — that’s the waste.'],
 ['workflow','Turn one good one-off run into a reusable workflow this week.'],
];
function review(){
  let st={};try{st=JSON.parse(localStorage.getItem('mc.review')||'{}')}catch{}
  document.getElementById('review').innerHTML=STEPS.map(s=>'<li class="chk '+(st[s[0]]?'on':'')+'" data-id="'+s[0]+'"><span class="box '+(st[s[0]]?'on':'')+'">'+(st[s[0]]?'✓':'')+'</span><span>'+s[1]+'</span></li>').join('');
  document.querySelectorAll('#review .chk').forEach(li=>li.onclick=()=>{st[li.dataset.id]=!st[li.dataset.id];localStorage.setItem('mc.review',JSON.stringify(st));review()});
}

tabs();render();review();
</script></body></html>`
}

// ── serve ────────────────────────────────────────────────────────
const payload = buildPayload()
const page = html(payload)
const server = createServer((req, res) => {
  if (req.url === '/data.json') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(payload))
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(page)
})
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`
  console.log('  Dashboard → ' + url + '   (Ctrl+C to stop)\n')
  if (!NO_OPEN) {
    const cmd =
      process.platform === 'darwin'
        ? `open "${url}"`
        : process.platform === 'win32'
          ? `start "" "${url}"`
          : `xdg-open "${url}"`
    exec(cmd, () => {})
  }
})
