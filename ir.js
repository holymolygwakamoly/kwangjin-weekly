/* IR 판매 분석 탭 — 현대차·기아 IR 월별 판매 실적(data/ir.json, tools/build_ir.py가 생성)을 기준을 바꿔가며 보는 화면 */
(function(){
"use strict";
const ECHARTS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js';
const CO_NAME = {H:'현대차', K:'기아', HK:'현대차+기아'};
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const Z = new Array(12).fill(0);
const COMMERCIAL = new Set(['봉고','버스','군용','마이티','카운티','쏠라티','유니버스','포터','상용차(HTBC)','소형상용(LCV)','대형상용(HCV)','CKD','CKD 승용','CKD 상용']);
const PGROUP_OF = {'한국':'국내','미국':'미국','인도':'인도','중국':'중국','체코':'유럽','튀르키예':'유럽','슬로바키아':'유럽','러시아':'유럽','멕시코':'중남미','브라질':'중남미','인도네시아':'아시아 기타','베트남':'아시아 기타','싱가포르':'아시아 기타'};
const PGROUPS = ['국내','미국','유럽','인도','중남미','중국','아시아 기타','기타'];
const AREAS = ['북미','유럽','아시아·태평양','중동·아프리카','중남미','러시아·동유럽·CIS'];
const BRANDS = ['현대','기아','제네시스'];
const SUPPLIERS = ['광진','PHA','대동하이렉스','하이렉스','브로제','기타'];

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n == null || !isFinite(n) ? '—' : Math.round(n).toLocaleString('ko-KR');
const pct = (a, b) => b ? (a - b) / b * 100 : null;
const fmtPct = x => x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + x.toFixed(1) + '%';
const fmtPp = x => x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + x.toFixed(1) + '%p';
const fmtD = n => n == null ? '—' : (n > 0 ? '+' : '') + fmt(n);
// 받침 유무로 조사 선택 — '인도(HMI)'처럼 괄호가 붙으면 괄호 앞 글자로 판단
function josa(word, withBatchim, without){
  const base = String(word).replace(/\s*\(.*\)\s*$/, '').trim();
  const ch = base.charCodeAt(base.length - 1);
  if (ch >= 0xAC00 && ch <= 0xD7A3) return (ch - 0xAC00) % 28 ? withBatchim : without;
  return /[136780lmnLMN]$/.test(base) ? withBatchim : without;
}
const short = v => Math.abs(v) >= 10000 ? (v / 10000).toFixed(Math.abs(v) >= 100000 || v % 10000 === 0 ? 0 : 1) + '만' : fmt(v);
const store = {
  get(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};

let D = null, PROD = null, SUPPLY = [], loading = null, dataLoading = null, root = null, view = 'overview';
let charts = [], pending = [];
const st = Object.assign({
  co:'HK', y:null, m0:1, m1:null, ckd:false,
  ex:{ds:'prod', by:'pl', chart:'bar', sel:null, top:10, cond:{}},
  gl:{}, xp:{}, mo:{scope:'all', pt:false, min:1000}, mm:{by:'m', val:'pct'}, dr:{pv:true, q:''},
}, store.get('kj.ir') || {});
st.ex.cond = st.ex.cond || {};
const doorMine = store.get('kj.ir.door') || {};
const slotMap = new Map(); // 자유 분석: 항목 -> 색 슬롯 (선택 순서대로 고정, 다른 항목을 빼도 다시 칠하지 않음)
const save = () => store.set('kj.ir', st);

/* ---------- 로딩 ---------- */
function loadScript(src){
  return new Promise((ok, fail) => { if (window.echarts) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}
function loadData(){
  if (!dataLoading) dataLoading = Promise.all([
    fetch('data/ir.json', {cache:'no-cache'}).then(r => { if (!r.ok) throw new Error('ir ' + r.status); return r.json(); }),
    fetch('data/supply.json', {cache:'no-cache'}).then(r => r.ok ? r.json() : []).catch(() => []),
  ]).then(([ir, supply]) => {
    D = ir; SUPPLY = supply;
    PROD = D.series.filter(s => s.d === 'model' || s.d === 'plant').map(s => s.d === 'model' ? Object.assign({}, s, {ct: s.loc === 'CKD' ? 'CKD' : '한국'}) : s);
    const ys = years();
    if (!ys.includes(st.y)) st.y = ys[ys.length - 1];
    clampMonths();
  });
  return dataLoading;
}
function load(){ if (!loading) loading = Promise.all([loadData(), loadScript(ECHARTS_URL)]); return loading; }
/* 브리핑 상단용 최신 숫자: 회사별 최신 공개월 글로벌 판매와 전년 동월 대비, 연초~공통 최근월의 해외 생산·미국 수출 비중 */
async function snapshot(){
  await loadData();
  const saved = {co: st.co, y: st.y, m0: st.m0, m1: st.m1, ckd: st.ckd};
  const out = {};
  const yAll = years(), y = yAll[yAll.length - 1];
  for (const c of ['H', 'K']){
    const m = D.last['model|' + c + '|' + y] || 0; if (!m) continue;
    const list = PROD.filter(s => s.c === c && s.loc !== 'CKD');
    const cur = monthsSum(list, y)[m - 1], prev = monthsSum(list, y - 1)[m - 1];
    out[c] = {y, m, sales: cur, yoy: prev ? (cur - prev) / prev * 100 : null};
  }
  Object.assign(st, {co: 'HK', y, m0: 1, ckd: false}); st.m1 = null; clampMonths();
  const prod = prodList().filter(s => s.loc !== 'CKD');
  const os = tot(monthsSum(prod.filter(s => s.loc === '해외'), y)), g = tot(monthsSum(prod, y));
  const osP = tot(monthsSum(prod.filter(s => s.loc === '해외'), y - 1)), gP = tot(monthsSum(prod, y - 1));
  const ex = D.series.filter(s => s.d === 'export' && s.s !== 'CKD');
  const us = tot(monthsSum(ex.filter(s => s.rg === '미국'), y)), exT = tot(monthsSum(ex, y));
  const usP = tot(monthsSum(ex.filter(s => s.rg === '미국'), y - 1)), exTP = tot(monthsSum(ex, y - 1));
  out.osShare = {v: g ? os / g * 100 : 0, d: gP ? os / g * 100 - osP / gP * 100 : null};
  out.usShare = {v: exT ? us / exT * 100 : 0, d: exTP ? us / exT * 100 - usP / exTP * 100 : null};
  out.asof = `${y}년 1~${st.m1}월 기준`;
  Object.assign(st, saved); clampMonths();
  return out;
}

/* ---------- 기간·집계 ---------- */
const years = () => [...new Set(D.series.map(s => s.y))].sort();
const hasPrev = () => years().includes(st.y - 1);
const cos = () => st.co === 'HK' ? ['H','K'] : [st.co];
const lastM = y => Math.min(...cos().map(c => D.last['model|' + c + '|' + y] || 0));
const coOk = s => st.co === 'HK' || s.c === st.co;
function clampMonths(){
  const L = lastM(st.y) || 12;
  if (!st.m1 || st.m1 > L) st.m1 = L;
  if (!st.m0 || st.m0 > st.m1) st.m0 = 1;
}
const periodLabel = (y = st.y) => st.m0 === st.m1 ? `${y}년 ${st.m1}월` : `${y}년 ${st.m0}~${st.m1}월`;
function tot(v){ let t = 0; for (let i = st.m0 - 1; i < st.m1; i++) t += v[i] || 0; return t; }
function groupBy(list, key, y){
  const m = new Map();
  for (const s of list){
    if (s.y !== y) continue;
    const k = typeof key === 'function' ? key(s) : s[key];
    if (k == null || k === '') continue;
    let a = m.get(k); if (!a){ a = new Array(12).fill(0); m.set(k, a); }
    for (let i = 0; i < 12; i++) a[i] += s.v[i];
  }
  return m;
}
function compare(list, key){
  const cur = groupBy(list, key, st.y), prev = hasPrev() ? groupBy(list, key, st.y - 1) : new Map();
  let total = 0; for (const v of cur.values()) total += tot(v);
  const rows = [...new Set([...cur.keys(), ...prev.keys()])].map(k => {
    const cv = cur.get(k) || Z, pv = prev.get(k) || Z, c = tot(cv), p = tot(pv);
    return {k, c, p, d: c - p, r: hasPrev() ? pct(c, p) : null, cv, pv, sh: total ? c / total * 100 : 0};
  }).filter(r => r.c || r.p);
  return rows.sort((a, b) => b.c - a.c || b.p - a.p);
}
const sumRows = rows => rows.reduce((a, r) => ({c: a.c + r.c, p: a.p + r.p}), {c:0, p:0});
const monthsSum = (list, y) => { const a = new Array(12).fill(0); for (const s of list) if (s.y === y) for (let i = 0; i < 12; i++) a[i] += s.v[i]; return a; };
const prodList = () => PROD.filter(s => coOk(s) && (st.ckd || s.loc !== 'CKD'));
const coLabel = c => c === 'H' ? '현대차' : '기아';

/* ---------- 색 (CSS 변수에서 읽어 라이트/다크 모두 대응) ---------- */
function C(){
  const cs = getComputedStyle(root || document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  return {
    s: [1,2,3,4,5,6,7,8].map(i => g('--viz-' + i)), prev: g('--viz-prev'), pos: g('--viz-pos'), neg: g('--viz-neg'), mid: g('--viz-mid'),
    seq: [g('--viz-seq-1'), g('--viz-seq-2'), g('--viz-seq-3')],
    grid: g('--viz-grid'), axis: g('--viz-axis'), muted: g('--viz-muted'), ink: g('--viz-ink'), ink2: g('--viz-ink2'), surface: g('--viz-surface'),
    up: g('--viz-up'), down: g('--viz-down'),
  };
}
const fixedColor = (list, k, c) => { const i = list.indexOf(k); return i >= 0 && i < 8 ? c.s[i] : c.prev; };

/* ---------- 차트 공통 ---------- */
function baseOpt(c, o){
  return Object.assign({
    animationDuration: 300,
    textStyle: {fontFamily: getComputedStyle(document.body).fontFamily, color: c.ink2},
    grid: {left: 8, right: 18, top: o.legend ? 40 : 16, bottom: 6, containLabel: true},
    tooltip: {trigger: 'axis', backgroundColor: c.surface, borderColor: c.grid, textStyle: {color: c.ink, fontSize: 12}, axisPointer: {type: 'line', lineStyle: {color: c.axis}}, valueFormatter: v => fmt(v) + '대'},
    toolbox: {right: 0, top: 0, itemSize: 13, feature: {saveAsImage: {title: '이미지 저장', name: 'IR분석', backgroundColor: c.surface, pixelRatio: 2}}, iconStyle: {borderColor: c.muted}},
  }, o);
}
const legend = c => ({top: 0, left: 0, right: 40, type: 'scroll', icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 14, textStyle: {color: c.ink2, fontSize: 12}, pageTextStyle: {color: c.muted}});
const valAxis = (c, extra) => Object.assign({type: 'value', axisLine: {show: false}, axisTick: {show: false}, splitLine: {lineStyle: {color: c.grid}}, axisLabel: {color: c.muted, fontSize: 11, formatter: short}}, extra || {});
const catAxis = (c, data, extra) => Object.assign({type: 'category', data, axisLine: {lineStyle: {color: c.axis}}, axisTick: {show: false}, axisLabel: {color: c.muted, fontSize: 11}}, extra || {});
const lineS = (name, data, color, extra) => Object.assign({name, type: 'line', data, smooth: false, showSymbol: false, symbol: 'circle', symbolSize: 8, lineStyle: {width: 2, color}, itemStyle: {color, borderColor: 'transparent'}, emphasis: {focus: 'series'}}, extra || {});
const barS = (name, data, color, horizontal, extra) => Object.assign({name, type: 'bar', data, barMaxWidth: 22, itemStyle: {color, borderRadius: horizontal ? [0,4,4,0] : [4,4,0,0]}}, extra || {});

/* 카드: 차트 + 표 보기 + CSV */
function card(o){
  const id = 'irc' + Math.random().toString(36).slice(2, 9);
  if (o.opt) pending.push({id, opt: o.opt});
  const tbl = o.table ? tableHtml(o.table) : '';
  return `<section class="ir-card${o.wide ? ' wide' : ''}">
    <div class="ir-card-h"><div><h3>${esc(o.title)}</h3>${o.sub ? `<p>${esc(o.sub)}</p>` : ''}</div>
      ${o.table ? `<div class="ir-card-act">${o.opt ? `<button type="button" class="ir-mini" data-ir-act="table" data-ir-for="${id}" aria-pressed="false">표 보기</button>` : ''}<button type="button" class="ir-mini" data-ir-act="csv" data-ir-for="${id}">CSV</button></div>` : ''}</div>
    ${o.opt ? `<div class="ir-chart" id="${id}" style="height:${o.h || 320}px" role="img" aria-label="${esc(o.title)}"></div>` : ''}
    ${o.html || ''}
    ${o.table ? `<div class="ir-tbl" id="${id}-t"${o.opt ? ' hidden' : ''} data-csv="${esc(o.table.csv || o.title)}">${tbl}</div>` : ''}
  </section>`;
}
function tableHtml(t){
  return `<table><thead><tr>${t.cols.map((h, i) => `<th${t.num && t.num[i] ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    t.rows.map(r => `<tr>${r.map((v, i) => `<td${t.num && t.num[i] ? ' class="n"' : ''}>${v && v.html != null ? v.html : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const cmpCols = name => [name, `${periodLabel()}`, hasPrev() ? `${periodLabel(st.y - 1)}` : null, hasPrev() ? '증감' : null, hasPrev() ? '증감률' : null, '비중'].filter(Boolean);
const cmpRow = (r, label) => [label ?? r.k, fmt(r.c), ...(hasPrev() ? [fmt(r.p), fmtD(r.d), fmtPct(r.r)] : []), r.sh.toFixed(1) + '%'];
const cmpNum = () => [false, true, ...(hasPrev() ? [true, true, true] : []), true];
const deltaHtml = (r, unit) => {
  if (r == null || !isFinite(r)) return '<span class="ir-delta">전년 비교 없음</span>';
  const up = r > 0, flat = Math.abs(r) < 0.05;
  return `<span class="ir-delta ${flat ? '' : up ? 'up' : 'down'}">${flat ? '■ 변동 없음' : (up ? '▲ ' : '▼ ') + (unit === 'pp' ? fmtPp(r) : fmtPct(r))}<span class="ir-delta-sub"> 전년 동기 대비</span></span>`;
};

function drawPending(){
  for (const ch of charts) try{ ch.dispose(); }catch(e){}
  charts = [];
  for (const p of pending){
    const el = document.getElementById(p.id); if (!el) continue;
    const ch = window.echarts.init(el, null, {renderer: 'svg'});
    ch.setOption(p.opt); charts.push(ch);
  }
  pending = [];
}

/* ---------- 필터 줄 ---------- */
function filterRow(){
  const ys = years();
  const L = lastM(st.y) || 12;
  const avail = ['H','K'].map(c => `${coLabel(c)} ${D.last['model|' + c + '|' + st.y] || 0}월`).join(' · ');
  const mopt = (sel, max) => MONTHS.slice(0, max).map((m, i) => `<option value="${i + 1}"${i + 1 === sel ? ' selected' : ''}>${m}</option>`).join('');
  return `<div class="ir-filters" role="group" aria-label="분석 조건">
    <div class="ir-f"><span class="ir-fl">회사</span><div class="seg">${['HK','H','K'].map(k => `<button type="button" data-ir-co="${k}" aria-pressed="${st.co === k}">${CO_NAME[k]}</button>`).join('')}</div></div>
    <div class="ir-f"><span class="ir-fl">연도</span><select data-ir-set="y" aria-label="기준 연도">${ys.map(y => `<option value="${y}"${y === st.y ? ' selected' : ''}>${y}년</option>`).join('')}</select></div>
    <div class="ir-f"><span class="ir-fl">기간</span><select data-ir-set="m0" aria-label="시작 월">${mopt(st.m0, L)}</select><span class="ir-dash">~</span><select data-ir-set="m1" aria-label="끝 월">${mopt(st.m1, L)}</select>
      <button type="button" class="ir-mini" data-ir-act="ytd">연초~최근</button><button type="button" class="ir-mini" data-ir-act="last1">최근 1개월</button></div>
    <p class="ir-fnote">${hasPrev() ? `비교 기준: ${periodLabel(st.y - 1)} (전년 같은 기간)` : '전년 자료 없음 — 증감 비교 생략'} · ${st.y}년 공개 범위 ${avail}${st.co === 'HK' && D.last['model|H|' + st.y] !== D.last['model|K|' + st.y] ? ' (합산은 두 회사 공통 월까지만)' : ''}</p>
  </div>`;
}

/* ---------- 뷰: 요약 ---------- */
function vOverview(c){
  const prod = prodList();
  const loc = compare(prod.filter(s => s.loc !== 'CKD'), 'loc');
  const kr = loc.find(r => r.k === '국내') || {c:0, p:0, r:null}, os = loc.find(r => r.k === '해외') || {c:0, p:0, r:null};
  const g = {c: kr.c + os.c, p: kr.p + os.p}; g.r = hasPrev() ? pct(g.c, g.p) : null;
  const osSh = g.c ? os.c / g.c * 100 : 0, osShP = g.p ? os.p / g.p * 100 : null;
  const ex = compare(D.series.filter(s => s.d === 'export' && coOk(s) && s.s !== 'CKD'), 'rg');
  const exT = sumRows(ex), us = ex.find(r => r.k === '미국') || {c:0, p:0};
  const usSh = exT.c ? us.c / exT.c * 100 : 0, usShP = exT.p ? us.p / exT.p * 100 : null;
  const md = compare(D.series.filter(s => s.d === 'model' && s.loc === '국내' && coOk(s)), 'p');
  const mdT = sumRows(md), ev = md.find(r => r.k === 'EV') || {c:0, p:0};
  const evSh = mdT.c ? ev.c / mdT.c * 100 : 0, evShP = mdT.p ? ev.p / mdT.p * 100 : null;
  const kpi = (label, val, sub, delta) => `<div class="ir-kpi"><div class="ir-kpi-l">${esc(label)}</div><div class="ir-kpi-v">${val}</div>${delta}<div class="ir-kpi-s">${esc(sub)}</div></div>`;
  const kpis = `<div class="ir-kpis">
    ${kpi('글로벌 판매', fmt(g.c) + '<small>대</small>', '국내공장 + 해외공장 (CKD 제외)', deltaHtml(g.r))}
    ${kpi('국내공장 판매', fmt(kr.c) + '<small>대</small>', '내수 + 수출', deltaHtml(kr.r))}
    ${kpi('해외공장 판매', fmt(os.c) + '<small>대</small>', '현지 판매 + 제3국 수출', deltaHtml(os.r))}
    ${kpi('해외 생산 비중', osSh.toFixed(1) + '<small>%</small>', '글로벌 판매 중 해외공장', deltaHtml(hasPrev() ? osSh - osShP : null, 'pp'))}
    ${kpi('수출 중 미국 비중', usSh.toFixed(1) + '<small>%</small>', '국내공장 수출 대수 기준', deltaHtml(hasPrev() ? usSh - usShP : null, 'pp'))}
    ${kpi('전기차(EV) 비중', evSh.toFixed(1) + '<small>%</small>', '국내공장 판매 기준', deltaHtml(hasPrev() ? evSh - evShP : null, 'pp'))}
  </div>`;

  // 자동 분석 문장 — 모두 IR 숫자에서 계산
  const ins = [];
  const P = periodLabel();
  ins.push(`<b>${CO_NAME[st.co]} ${P} 글로벌 판매 ${fmt(g.c)}대</b>${hasPrev() ? ` — 전년 동기 대비 ${fmtPct(g.r)} (${fmtD(g.c - g.p)}대)` : ''}.`);
  if (hasPrev()) ins.push(`국내공장 ${fmtPct(kr.r)}, 해외공장 ${fmtPct(os.r)} → <b>해외 생산 비중 ${osSh.toFixed(1)}% (${fmtPp(osSh - osShP)})</b>. ${osSh - osShP > 0.5 ? '국내 협력사 물량이 해외공장으로 옮겨가는 흐름입니다.' : osSh - osShP < -0.5 ? '국내공장 비중이 오히려 커졌습니다.' : '국내·해외 비중은 큰 변화가 없습니다.'}`);
  if (hasPrev()){
    const pl = compare(prod.filter(s => s.loc !== 'CKD'), 'pl').filter(r => r.p > 0 || r.c > 0);
    const upP = pl.slice().sort((a, b) => b.d - a.d)[0], dnP = pl.slice().sort((a, b) => a.d - b.d)[0];
    if (upP && dnP && upP.d > 0 && dnP.d < 0) ins.push(`공장별로는 <b>${esc(upP.k)}</b>${josa(upP.k, '이', '가')} ${fmtD(upP.d)}대(${fmtPct(upP.r)})로 가장 많이 늘었고, <b>${esc(dnP.k)}</b>${josa(dnP.k, '은', '는')} ${fmtD(dnP.d)}대(${fmtPct(dnP.r)})로 가장 많이 줄었습니다.`);
    const mm = compare(prod.filter(s => s.loc !== 'CKD' && !COMMERCIAL.has(s.m)), s => s.m);
    const upM = mm.slice().sort((a, b) => b.d - a.d).slice(0, 3).filter(r => r.d > 0), dnM = mm.slice().sort((a, b) => a.d - b.d).slice(0, 3).filter(r => r.d < 0);
    if (upM.length) ins.push(`차종(국내+해외 공장 합산) 증가 상위: ${upM.map(r => `<b>${esc(r.k)}</b> ${fmtD(r.d)}`).join(', ')}.`);
    if (dnM.length) ins.push(`감소 상위: ${dnM.map(r => `<b>${esc(r.k)}</b> ${fmtD(r.d)}`).join(', ')}.`);
    ins.push(`국내공장 수출 중 미국 비중 <b>${usSh.toFixed(1)}%</b> (전년 ${usShP == null ? '—' : usShP.toFixed(1) + '%'}) — 관세 영향을 직접 받는 물량 비중입니다.`);
    const gm = monthsSum(prod.filter(s => s.loc !== 'CKD'), st.y), gp = monthsSum(prod.filter(s => s.loc !== 'CKD'), st.y - 1);
    let worst = null;
    for (let i = st.m0 - 1; i < st.m1; i++){ const r = pct(gm[i], gp[i]); if (r != null && (worst == null || r < worst.r)) worst = {i, r}; }
    if (worst && st.m1 > st.m0) ins.push(`월별로는 <b>${worst.i + 1}월</b>이 전년 같은 달보다 ${fmtPct(worst.r)}로 가장 약했습니다${worst.r < -15 ? ' — 파업·셧다운 등 일시적 요인이 있었는지 납품 실적과 함께 확인할 만합니다' : ''}.`);
    if (st.co === 'HK'){
      const byCo = compare(prod.filter(s => s.loc !== 'CKD'), s => coLabel(s.c));
      ins.push(`회사별: ${byCo.map(r => `${r.k} ${fmtPct(r.r)}`).join(', ')}.`);
    }
  }

  const gm = monthsSum(prod.filter(s => s.loc !== 'CKD'), st.y), L = lastM(st.y);
  const series = [lineS(`${st.y}년`, gm.map((v, i) => i < L ? v : null), c.s[0], {endLabel: {show: true, formatter: p => short(p.value), color: c.ink2, fontSize: 11}})];
  if (hasPrev()) series.unshift(lineS(`${st.y - 1}년`, monthsSum(prod.filter(s => s.loc !== 'CKD'), st.y - 1), c.prev));
  const trend = baseOpt(c, {legend: legend(c), xAxis: catAxis(c, MONTHS), yAxis: valAxis(c), series});

  const keyFn = st.co === 'HK' ? s => `${coLabel(s.c)} ${s.loc === '국내' ? '국내공장' : '해외공장'}` : s => s.loc === '국내' ? '국내공장' : '해외공장';
  const lc = compare(prod.filter(s => s.loc !== 'CKD'), keyFn).sort((a, b) => a.k.localeCompare(b.k, 'ko'));
  const bs = [barS(`${periodLabel()}`, lc.map(r => r.c), c.s[0])];
  if (hasPrev()) bs.unshift(barS(`${periodLabel(st.y - 1)}`, lc.map(r => r.p), c.prev));
  const bar = baseOpt(c, {legend: legend(c), tooltip: Object.assign(baseOpt(c, {}).tooltip, {axisPointer: {type: 'shadow', shadowStyle: {color: 'rgba(127,127,127,.08)'}}}), xAxis: catAxis(c, lc.map(r => r.k), {axisLabel: {color: c.muted, fontSize: 11, interval: 0}}), yAxis: valAxis(c), series: bs});

  return kpis + `<section class="ir-card wide ir-insight"><div class="ir-card-h"><div><h3>자동 분석</h3><p>IR 숫자에서 바로 계산한 문장입니다 — 기간·회사를 바꾸면 다시 계산됩니다.</p></div></div><ul>${ins.map(t => `<li>${t}</li>`).join('')}</ul></section>
    <div class="ir-grid">
      ${card({title: '월별 글로벌 판매', sub: `${CO_NAME[st.co]} · 국내공장+해외공장 · 전년과 같은 달 비교`, opt: trend, h: 300,
        table: {cols: ['월', `${st.y}년`, ...(hasPrev() ? [`${st.y - 1}년`, '증감률'] : [])], num: [false, true, true, true], csv: '월별글로벌판매',
          rows: MONTHS.map((m, i) => [m, i < L ? fmt(gm[i]) : '—', ...(hasPrev() ? [fmt(monthsSum(prod.filter(s => s.loc !== 'CKD'), st.y - 1)[i]), i < L ? fmtPct(pct(gm[i], monthsSum(prod.filter(s => s.loc !== 'CKD'), st.y - 1)[i])) : '—'] : [])])}})}
      ${card({title: '국내공장 vs 해외공장', sub: `${periodLabel()}${hasPrev() ? ' · 전년 동기 비교' : ''}`, opt: bar, h: 300,
        table: {cols: cmpCols('구분'), num: cmpNum(), csv: '국내해외공장', rows: lc.map(r => cmpRow(r))}})}
    </div>`;
}

/* ---------- 뷰: 자유 분석 ---------- */
const DS = {
  prod: {label: '공장별 판매 (국내+해외)', src: () => prodList(),
    dims: {pl: '공장', ct: '생산 국가', loc: '국내/해외', m: '차종', b: '브랜드', p: '파워트레인', c: '회사'}},
  model: {label: '국내공장 차종별 판매', src: () => D.series.filter(s => s.d === 'model' && s.loc === '국내' && coOk(s)),
    dims: {m: '차종', b: '브랜드', p: '파워트레인', k: '내수/수출', s: '차급', c: '회사'}},
  export: {label: '국내공장 지역별 수출', src: () => D.series.filter(s => s.d === 'export' && coOk(s) && (st.ckd || s.s !== 'CKD')),
    dims: {rg: '수출 지역', ar: '권역', s: '차급', c: '회사'}},
  retail: {label: '현지 소매 판매', src: () => D.series.filter(s => s.d === 'retail' && coOk(s)),
    dims: {ct: '판매 시장', m: '차종', pl: '생산지(기아)', p: '파워트레인', c: '회사'}},
};
const dimVal = (s, d) => d === 'c' ? coLabel(s.c) : d === 'k' ? s.k : d === 's' ? (s.s || '미구분') : s[d];
function slotOf(k){
  if (slotMap.has(k)) return slotMap.get(k);
  const used = new Set(slotMap.values());
  for (let i = 0; i < 8; i++) if (!used.has(i)){ slotMap.set(k, i); return i; }
  return -1;
}
function vExplore(c){
  const ex = st.ex, ds = DS[ex.ds] || DS.prod;
  if (!ds.dims[ex.by]) ex.by = Object.keys(ds.dims)[0];
  let list = ds.src();
  const condDims = Object.keys(ds.dims).filter(d => d !== ex.by);
  for (const d of condDims){ const v = ex.cond[d]; if (v) list = list.filter(s => dimVal(s, d) === v); }
  const rows = compare(list, s => dimVal(s, ex.by));
  const allKeys = rows.map(r => r.k);
  let items = ex.sel && ex.sel.length ? ex.sel.filter(k => allKeys.includes(k)) : allKeys.slice(0, ex.top);
  if (ex.chart === 'line' || ex.chart === 'stack') items = items.slice(0, 8);
  for (const k of [...slotMap.keys()]) if (!items.includes(k)) slotMap.delete(k);
  items.forEach(slotOf);
  const byK = new Map(rows.map(r => [r.k, r]));
  const sel = items.map(k => byK.get(k)).filter(Boolean);
  const dimName = ds.dims[ex.by];
  const L = lastM(st.y), months = MONTHS.slice(st.m0 - 1, st.m1);

  let opt, h = 360, note = '';
  if (ex.chart === 'bar'){
    const rs = sel.slice().reverse();
    const s = [barS(periodLabel(), rs.map(r => r.c), c.s[0], true)];
    if (hasPrev()) s.unshift(barS(periodLabel(st.y - 1), rs.map(r => r.p), c.prev, true));
    h = Math.max(260, rs.length * (hasPrev() ? 34 : 24) + 70);
    opt = baseOpt(c, {legend: legend(c), tooltip: Object.assign(baseOpt(c, {}).tooltip, {axisPointer: {type: 'shadow', shadowStyle: {color: 'rgba(127,127,127,.08)'}}}),
      xAxis: valAxis(c), yAxis: catAxis(c, rs.map(r => r.k), {axisLabel: {color: c.ink2, fontSize: 12, width: 130, overflow: 'truncate'}}), series: s});
  } else if (ex.chart === 'delta'){
    const rs = sel.slice().sort((a, b) => a.d - b.d);
    h = Math.max(260, rs.length * 26 + 50);
    opt = hasPrev() ? baseOpt(c, {tooltip: {trigger: 'item', backgroundColor: c.surface, borderColor: c.grid, textStyle: {color: c.ink, fontSize: 12}, formatter: p => { const r = rs[p.dataIndex]; return `<b>${esc(r.k)}</b><br>${fmtD(r.d)}대 (${fmtPct(r.r)})<br>${periodLabel()} ${fmt(r.c)} · 전년 ${fmt(r.p)}`; }},
      xAxis: valAxis(c), yAxis: catAxis(c, rs.map(r => r.k), {axisLabel: {color: c.ink2, fontSize: 12, width: 130, overflow: 'truncate'}}),
      grid: {left: 8, right: 70, top: 28, bottom: 6, containLabel: true}, series: [{type: 'bar', barMaxWidth: 18, data: rs.map(r => ({value: r.d, itemStyle: {color: r.d >= 0 ? c.pos : c.neg, borderRadius: r.d >= 0 ? [0,4,4,0] : [4,0,0,4]}})),
        label: {show: rs.length <= 15, position: 'right', formatter: p => fmtD(p.value), color: c.ink2, fontSize: 11}}]}) : null;
    if (!hasPrev()) note = '<div class="empty">전년 자료가 없어 증감을 계산할 수 없습니다.</div>';
  } else if (ex.chart === 'pie'){
    const top = sel.slice(0, 6), rest = rows.filter(r => !top.includes(r)).reduce((a, r) => a + r.c, 0);
    const data = top.map(r => ({name: r.k, value: r.c, itemStyle: {color: c.s[slotMap.get(r.k)] || c.prev}}));
    if (rest > 0) data.push({name: '기타', value: rest, itemStyle: {color: c.prev}});
    opt = baseOpt(c, {legend: Object.assign(legend(c), {type: 'plain', top: 'auto', bottom: 0, right: 0}), tooltip: {trigger: 'item', backgroundColor: c.surface, borderColor: c.grid, textStyle: {color: c.ink, fontSize: 12}, formatter: p => `<b>${esc(p.name)}</b><br>${fmt(p.value)}대 · ${p.percent}%`},
      series: [{type: 'pie', radius: ['38%', '62%'], center: ['50%', '46%'], data, itemStyle: {borderColor: c.surface, borderWidth: 2}, label: {color: c.ink2, formatter: p => p.percent >= 4 ? `${p.name}\n${p.percent}%` : ''}, labelLine: {lineStyle: {color: c.axis}}}]});
    note = sel.length > 6 ? '<p class="ir-note">구성비 도넛은 상위 6개 + 기타로 묶어 보여줍니다.</p>' : '';
  } else {
    const share = ex.chart === 'stack' && ex.unit === 'share';
    const totals = months.map((_, j) => rows.reduce((a, r) => a + r.cv[st.m0 - 1 + j], 0));
    const ser = sel.map(r => {
      const col = c.s[slotMap.get(r.k)] || c.prev;
      const data = months.map((_, j) => { const i = st.m0 - 1 + j; if (i >= L) return null; const v = r.cv[i]; return share ? (totals[j] ? +(v / totals[j] * 100).toFixed(1) : 0) : v; });
      return ex.chart === 'line' ? lineS(r.k, data, col, {showSymbol: months.length <= 3})
        : barS(r.k, data, col, false, {stack: 'a', itemStyle: {color: col, borderColor: c.surface, borderWidth: 1, borderRadius: 0}});
    });
    if (ex.chart === 'stack'){
      const restKeys = rows.filter(r => !items.includes(r.k));
      if (restKeys.length){
        const data = months.map((_, j) => { const i = st.m0 - 1 + j; if (i >= L) return null; const v = restKeys.reduce((a, r) => a + r.cv[i], 0); return share ? (totals[j] ? +(v / totals[j] * 100).toFixed(1) : 0) : v; });
        ser.push(barS('기타', data, c.prev, false, {stack: 'a', itemStyle: {color: c.prev, borderColor: c.surface, borderWidth: 1}}));
      }
      if (ser.length) ser[ser.length - 1].itemStyle.borderRadius = [4,4,0,0];
    }
    const tt = Object.assign(baseOpt(c, {}).tooltip, share ? {valueFormatter: v => v == null ? '—' : v + '%'} : {});
    opt = baseOpt(c, {legend: legend(c), tooltip: tt, xAxis: catAxis(c, months), yAxis: valAxis(c, share ? {max: 100, axisLabel: {color: c.muted, fontSize: 11, formatter: '{value}%'}} : {}), series: ser});
    if ((ex.sel || []).length > 8) note = '<p class="ir-note">선 그래프·누적 막대는 색을 구분할 수 있도록 최대 8개 항목까지 그립니다.</p>';
  }

  const missingPick = (ex.sel || []).filter(k => !allKeys.includes(k));
  if (missingPick.length) note = `<p class="ir-note">'${esc(missingPick.join(', '))}'은(는) 현재 조건의 IR 자료에 없는 이름입니다 — 아래 항목에서 비슷한 이름을 고르거나 데이터·기간을 바꿔 보세요.</p>` + note;
  const chips = rows.slice(0, 60).map(r => {
    const on = items.includes(r.k), slot = slotMap.get(r.k);
    return `<button type="button" class="ir-chip" data-ir-pick="${esc(r.k)}" aria-pressed="${on}">${on && slot != null && slot >= 0 && ex.chart !== 'bar' && ex.chart !== 'delta' ? `<i style="background:var(--viz-${slot + 1})"></i>` : ''}${esc(r.k)}<span>${short(r.c)}</span></button>`;
  }).join('');
  const condSel = condDims.map(d => {
    const vals = [...new Set(ds.src().map(s => dimVal(s, d)).filter(v => v != null && v !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'ko'));
    if (vals.length < 2) return '';
    return `<label class="ir-cond"><span>${esc(ds.dims[d])}</span><select data-ir-cond="${d}"><option value="">전체</option>${vals.map(v => `<option${ex.cond[d] === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
  }).join('');
  const charts = [['bar','기간 합계 비교'],['line','월별 추이'],['stack','월별 구성'],['delta','전년 대비 증감'],['pie','구성비']];
  const T = sumRows(rows);
  return `<section class="ir-card wide ir-builder">
    <div class="ir-b-row"><span class="ir-fl">데이터</span><div class="seg">${Object.entries(DS).map(([k, d]) => `<button type="button" data-ir-ex="ds" data-ir-v="${k}" aria-pressed="${ex.ds === k}">${esc(d.label)}</button>`).join('')}</div></div>
    <div class="ir-b-row"><span class="ir-fl">묶는 기준</span><div class="seg">${Object.entries(ds.dims).map(([k, l]) => `<button type="button" data-ir-ex="by" data-ir-v="${k}" aria-pressed="${ex.by === k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="ir-b-row"><span class="ir-fl">그래프</span><div class="seg">${charts.map(([k, l]) => `<button type="button" data-ir-ex="chart" data-ir-v="${k}" aria-pressed="${ex.chart === k}">${l}</button>`).join('')}</div>
      ${ex.chart === 'stack' ? `<div class="seg"><button type="button" data-ir-ex="unit" data-ir-v="abs" aria-pressed="${ex.unit !== 'share'}">대수</button><button type="button" data-ir-ex="unit" data-ir-v="share" aria-pressed="${ex.unit === 'share'}">비중 %</button></div>` : ''}</div>
    ${condSel ? `<div class="ir-b-row"><span class="ir-fl">조건</span><div class="ir-conds">${condSel}${Object.values(ex.cond).some(Boolean) ? '<button type="button" class="ir-mini" data-ir-act="cond-clear">조건 초기화</button>' : ''}</div></div>` : ''}
    <div class="ir-b-row ir-b-items"><span class="ir-fl">항목</span><div class="ir-items">
      <div class="ir-items-h"><input type="search" class="ir-search" placeholder="${esc(dimName)} 찾기" data-ir-filter aria-label="항목 찾기">
        <span class="ir-note">${ex.sel && ex.sel.length ? `직접 고른 ${items.length}개` : `상위 ${Math.min(ex.top, rows.length)}개 자동`}</span>
        <select data-ir-ex-top aria-label="상위 개수">${[5,8,10,15,20,30].map(n => `<option value="${n}"${ex.top === n && !(ex.sel && ex.sel.length) ? ' selected' : ''}>상위 ${n}</option>`).join('')}</select>
        ${ex.sel && ex.sel.length ? '<button type="button" class="ir-mini" data-ir-act="sel-clear">자동 선택으로</button>' : ''}</div>
      <div class="ir-chips">${chips}${rows.length > 60 ? `<span class="ir-note">외 ${rows.length - 60}개는 표에서 확인</span>` : ''}</div></div></div>
  </section>
  ${card({title: `${ds.label} — ${dimName}별`, sub: `${CO_NAME[st.co]} · ${periodLabel()} · 전체 ${fmt(T.c)}대${hasPrev() ? ` (전년 동기 ${fmtPct(pct(T.c, T.p))})` : ''}`, wide: true, opt, h, html: note,
    table: {cols: cmpCols(dimName), num: cmpNum(), csv: `자유분석_${ds.label}_${dimName}`, rows: rows.map(r => cmpRow(r))}})}`;
}

/* ---------- 뷰: 국내·해외 생산 ---------- */
function vGlobal(c){
  const prod = prodList().filter(s => s.loc !== 'CKD' || st.ckd);
  const grp = s => s.loc === 'CKD' ? '기타' : (PGROUP_OF[s.ct] || '기타');
  const cur = groupBy(prod, grp, st.y), L = lastM(st.y);
  const present = PGROUPS.filter(g => cur.has(g));
  const stack = present.map((g, idx) => barS(g, cur.get(g).map((v, i) => i < L ? v : null), fixedColor(PGROUPS, g, c), false,
    {stack: 'a', itemStyle: {color: fixedColor(PGROUPS, g, c), borderColor: c.surface, borderWidth: 1, borderRadius: idx === present.length - 1 ? [4,4,0,0] : 0}}));
  const stackOpt = baseOpt(c, {legend: legend(c), xAxis: catAxis(c, MONTHS), yAxis: valAxis(c), series: stack});

  const share = y => { const a = monthsSum(prod.filter(s => s.loc === '해외'), y), t = monthsSum(prod.filter(s => s.loc !== 'CKD'), y); return a.map((v, i) => t[i] ? +(v / t[i] * 100).toFixed(1) : null); };
  const sc = share(st.y).map((v, i) => i < L ? v : null);
  const ss = [lineS(`${st.y}년`, sc, c.s[0], {endLabel: {show: true, formatter: p => p.value + '%', color: c.ink2, fontSize: 11}})];
  if (hasPrev()) ss.unshift(lineS(`${st.y - 1}년`, share(st.y - 1), c.prev));
  const shareOpt = baseOpt(c, {legend: legend(c), tooltip: Object.assign(baseOpt(c, {}).tooltip, {valueFormatter: v => v == null ? '—' : v + '%'}), xAxis: catAxis(c, MONTHS), yAxis: valAxis(c, {scale: true, axisLabel: {color: c.muted, fontSize: 11, formatter: '{value}%'}}), series: ss});

  const pl = compare(prod, s => s.pl);
  const plC = new Map(prod.map(s => [s.pl, s.ct]));
  let dOpt = null;
  if (hasPrev()){
    const rs = pl.filter(r => r.d !== 0).sort((a, b) => a.d - b.d);
    dOpt = baseOpt(c, {tooltip: {trigger: 'item', backgroundColor: c.surface, borderColor: c.grid, textStyle: {color: c.ink, fontSize: 12}, formatter: p => { const r = rs[p.dataIndex]; return `<b>${esc(r.k)}</b><br>${fmtD(r.d)}대 (${fmtPct(r.r)})`; }},
      xAxis: valAxis(c), yAxis: catAxis(c, rs.map(r => r.k), {axisLabel: {color: c.ink2, fontSize: 12}}),
      grid: {left: 8, right: 70, top: 28, bottom: 6, containLabel: true}, series: [{type: 'bar', barMaxWidth: 16, data: rs.map(r => ({value: r.d, itemStyle: {color: r.d >= 0 ? c.pos : c.neg, borderRadius: r.d >= 0 ? [0,4,4,0] : [4,0,0,4]}})), label: {show: true, position: 'right', formatter: p => fmtD(p.value), color: c.ink2, fontSize: 11}}]});
    dOpt._h = Math.max(260, rs.length * 24 + 40);
  }
  return `<div class="ir-toolbar"><label class="ir-check"><input type="checkbox" data-ir-toggle="ckd"${st.ckd ? ' checked' : ''}> CKD(반조립 수출) 포함</label></div>
    <div class="ir-grid">
    ${card({title: `월별 생산지 구성 — ${st.y}년`, sub: '국내공장과 해외공장을 지역으로 묶은 월별 판매 대수', opt: stackOpt, h: 340,
      table: {cols: ['생산지', ...MONTHS.slice(0, L)], num: [false, ...MONTHS.slice(0, L).map(() => true)], csv: '월별생산지구성', rows: present.map(g => [g, ...cur.get(g).slice(0, L).map(fmt)])}})}
    ${card({title: '해외 생산 비중 (월별)', sub: '글로벌 판매 중 해외공장 비중 — 올라갈수록 국내 협력사 물량이 줄어드는 신호', opt: shareOpt, h: 340,
      table: {cols: ['월', `${st.y}년`, ...(hasPrev() ? [`${st.y - 1}년`] : [])], num: [false, true, true], csv: '해외생산비중', rows: MONTHS.map((m, i) => [m, sc[i] == null ? '—' : sc[i] + '%', ...(hasPrev() ? [(share(st.y - 1)[i] ?? '—') + '%'] : [])])}})}
    ${dOpt ? card({title: '공장별 전년 대비 증감', sub: `${periodLabel()} vs ${periodLabel(st.y - 1)} · 대수`, opt: dOpt, h: dOpt._h, wide: true,
      table: {cols: ['공장', '국가', ...cmpCols('').slice(1)], num: [false, false, ...cmpNum().slice(1)], csv: '공장별증감', rows: pl.map(r => [r.k, plC.get(r.k) || '', ...cmpRow(r).slice(1)])}}) : ''}
    </div>`;
}

/* ---------- 뷰: 수출 지역 ---------- */
function vExport(c){
  const list = D.series.filter(s => s.d === 'export' && coOk(s) && (st.ckd || s.s !== 'CKD'));
  const ar = compare(list, 'ar');
  const donut = baseOpt(c, {legend: Object.assign(legend(c), {type: 'plain', top: 'auto', bottom: 0, right: 0}), tooltip: {trigger: 'item', backgroundColor: c.surface, borderColor: c.grid, textStyle: {color: c.ink, fontSize: 12}, formatter: p => `<b>${esc(p.name)}</b><br>${fmt(p.value)}대 · ${p.percent}%`},
    series: [{type: 'pie', radius: ['38%', '62%'], center: ['50%', '46%'], itemStyle: {borderColor: c.surface, borderWidth: 2},
      data: ar.filter(r => r.c > 0).map(r => ({name: r.k, value: r.c, itemStyle: {color: fixedColor(AREAS, r.k, c)}})),
      label: {color: c.ink2, formatter: p => p.percent >= 4 ? `${p.name}\n${p.percent}%` : ''}, labelLine: {lineStyle: {color: c.axis}}}]});
  const rgKey = st.co === 'HK' ? 'ar' : 'rg', rgName = st.co === 'HK' ? '권역' : '지역';
  const rg = compare(list, rgKey), rs = rg.slice().reverse();
  const bs = [barS(periodLabel(), rs.map(r => r.c), c.s[0], true)];
  if (hasPrev()) bs.unshift(barS(periodLabel(st.y - 1), rs.map(r => r.p), c.prev, true));
  const barOpt = baseOpt(c, {legend: legend(c), tooltip: Object.assign(baseOpt(c, {}).tooltip, {axisPointer: {type: 'shadow', shadowStyle: {color: 'rgba(127,127,127,.08)'}}}), xAxis: valAxis(c), yAxis: catAxis(c, rs.map(r => r.k), {axisLabel: {color: c.ink2, fontSize: 12}}), series: bs});
  const L = lastM(st.y);
  const usShare = y => { const u = monthsSum(list.filter(s => s.rg === '미국'), y), t = monthsSum(list, y); return u.map((v, i) => t[i] ? +(v / t[i] * 100).toFixed(1) : null); };
  const uc = usShare(st.y).map((v, i) => i < L ? v : null);
  const ls = [lineS(`${st.y}년`, uc, c.s[0], {endLabel: {show: true, formatter: p => p.value + '%', color: c.ink2, fontSize: 11}})];
  if (hasPrev()) ls.unshift(lineS(`${st.y - 1}년`, usShare(st.y - 1), c.prev));
  const usOpt = baseOpt(c, {legend: legend(c), tooltip: Object.assign(baseOpt(c, {}).tooltip, {valueFormatter: v => v == null ? '—' : v + '%'}), xAxis: catAxis(c, MONTHS), yAxis: valAxis(c, {scale: true, axisLabel: {color: c.muted, fontSize: 11, formatter: '{value}%'}}), series: ls});
  const hasCkd = D.series.some(s => s.d === 'export' && coOk(s) && s.s === 'CKD');
  return `<div class="ir-toolbar">${hasCkd ? `<label class="ir-check"><input type="checkbox" data-ir-toggle="ckd"${st.ckd ? ' checked' : ''}> CKD(반조립) 포함 — 기아만 해당</label>` : ''}
    <span class="ir-note">국내공장에서 만들어 해외로 보낸 대수입니다. 현대·기아의 지역 구분이 달라 '권역'으로 묶어 비교합니다.</span></div>
    <div class="ir-grid">
    ${card({title: '권역별 수출 구성', sub: `${CO_NAME[st.co]} · ${periodLabel()}`, opt: donut, h: 320,
      table: {cols: cmpCols('권역'), num: cmpNum(), csv: '권역별수출', rows: ar.map(r => cmpRow(r))}})}
    ${card({title: '수출 중 미국 비중 (월별)', sub: '관세에 직접 노출되는 물량 비중', opt: usOpt, h: 320,
      table: {cols: ['월', `${st.y}년`, ...(hasPrev() ? [`${st.y - 1}년`] : [])], num: [false, true, true], csv: '미국수출비중', rows: MONTHS.map((m, i) => [m, uc[i] == null ? '—' : uc[i] + '%', ...(hasPrev() ? [(usShare(st.y - 1)[i] ?? '—') + '%'] : [])])}})}
    ${card({title: `${rgName}별 수출 대수`, sub: `${periodLabel()}${hasPrev() ? ' vs 전년 동기' : ''}${st.co === 'HK' ? ' · 두 회사의 지역 구분이 달라 권역으로 묶음 (회사를 하나 고르면 세부 지역)' : ''}`, opt: barOpt, h: Math.max(280, rs.length * 34 + 70), wide: true,
      table: {cols: cmpCols(rgName), num: cmpNum(), csv: `${rgName}별수출`, rows: rg.map(r => cmpRow(r))}})}
    </div>`;
}

/* ---------- 뷰: 뜨는 차·지는 차 ---------- */
function vMomentum(c){
  const mo = st.mo;
  let list = prodList().filter(s => s.loc !== 'CKD' && !COMMERCIAL.has(s.m));
  if (mo.scope === 'kr') list = list.filter(s => s.loc === '국내');
  if (mo.scope === 'os') list = list.filter(s => s.loc === '해외');
  const key = s => mo.pt && s.p !== '미구분' ? `${s.m} ${s.p}` : s.m;
  const rows = compare(list, key);
  const brandOf = new Map(list.map(s => [key(s), s.b]));
  const scope = `<div class="ir-toolbar"><span class="ir-fl">범위</span><div class="seg">${[['all','국내+해외 공장'],['kr','국내공장'],['os','해외공장']].map(([k, l]) => `<button type="button" data-ir-mo="scope" data-ir-v="${k}" aria-pressed="${mo.scope === k}">${l}</button>`).join('')}</div>
    <label class="ir-check"><input type="checkbox" data-ir-toggle="mo.pt"${mo.pt ? ' checked' : ''}> 파워트레인 나눠 보기</label>
    <label class="ir-check">전년 동기 <select data-ir-mo-min>${[0,500,1000,5000,10000].map(n => `<option value="${n}"${mo.min === n ? ' selected' : ''}>${fmt(n)}대</option>`).join('')}</select> 이상만 증감률 비교</label></div>`;
  if (!hasPrev()) return scope + '<div class="empty">전년 자료가 없어 증감을 계산할 수 없습니다. 기준 연도를 바꿔 보세요.</div>';
  const ups = rows.filter(r => r.d > 0).sort((a, b) => b.d - a.d).slice(0, 10), dns = rows.filter(r => r.d < 0).sort((a, b) => a.d - b.d).slice(0, 10);
  const rs = [...dns, ...ups].sort((a, b) => a.d - b.d);
  const dOpt = baseOpt(c, {tooltip: {trigger: 'item', backgroundColor: c.surface, borderColor: c.grid, textStyle: {color: c.ink, fontSize: 12}, formatter: p => { const r = rs[p.dataIndex]; return `<b>${esc(r.k)}</b><br>${fmtD(r.d)}대 (${fmtPct(r.r)})<br>${periodLabel()} ${fmt(r.c)} · 전년 ${fmt(r.p)}`; }},
    xAxis: valAxis(c), yAxis: catAxis(c, rs.map(r => r.k), {axisLabel: {color: c.ink2, fontSize: 12}}),
    grid: {left: 8, right: 70, top: 28, bottom: 6, containLabel: true}, series: [{type: 'bar', barMaxWidth: 16, data: rs.map(r => ({value: r.d, itemStyle: {color: r.d >= 0 ? c.pos : c.neg, borderRadius: r.d >= 0 ? [0,4,4,0] : [4,0,0,4]}})), label: {show: true, position: 'right', formatter: p => fmtD(p.value), color: c.ink2, fontSize: 11}}]});
  const sc = rows.filter(r => r.p >= Math.max(mo.min, 1) && r.c > 0);
  const maxC = Math.max(1, ...sc.map(r => r.c)), CAP = 200;
  const scSeries = BRANDS.map((b, i) => ({name: b, type: 'scatter', data: sc.filter(r => brandOf.get(r.k) === b).map(r => ({name: r.k, value: [r.p, Math.min(+r.r.toFixed(1), CAP), r.c, +r.r.toFixed(1)], symbol: r.r > CAP ? 'triangle' : 'circle'})),
    symbolSize: v => 8 + Math.sqrt(v[2] / maxC) * 30, itemStyle: {color: c.s[i], opacity: .85, borderColor: c.surface, borderWidth: 2},
    emphasis: {label: {show: true, formatter: p => p.name, position: 'top', color: c.ink, fontSize: 11}}})).filter(s => s.data.length);
  if (scSeries[0]) scSeries[0].markLine = {silent: true, symbol: 'none', lineStyle: {color: c.axis, type: 'solid', width: 1}, label: {show: false}, data: [{yAxis: 0}]};
  const top3 = new Set([...sc.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5).map(r => r.k), ...sc.filter(r => r.r > CAP).map(r => r.k)]);
  for (const s of scSeries){ s.label = {show: true, formatter: p => !top3.has(p.name) ? '' : p.value[3] > CAP ? `${p.name} ${fmtPct(p.value[3])}` : p.name, position: 'top', color: c.ink2, fontSize: 11}; s.labelLayout = {hideOverlap: true}; }
  const scOpt = baseOpt(c, {legend: Object.assign(legend(c), {type: 'plain', top: 'auto', bottom: 0, right: 0}), tooltip: {trigger: 'item', backgroundColor: c.surface, borderColor: c.grid, textStyle: {color: c.ink, fontSize: 12}, formatter: p => `<b>${esc(p.name)}</b> (${esc(p.seriesName)})<br>전년 동기 ${fmt(p.value[0])}대 → ${fmt(p.value[2])}대<br>증감률 ${fmtPct(p.value[3])}${p.value[3] > CAP ? ' (그래프는 +200%에서 자름)' : ''}`},
    grid: {left: 8, right: 24, top: 44, bottom: 28, containLabel: true},
    xAxis: valAxis(c, {type: 'log', name: '전년 동기 대수 (로그)', nameLocation: 'middle', nameGap: 26, nameTextStyle: {color: c.muted, fontSize: 11}, splitLine: {lineStyle: {color: c.grid}}}),
    yAxis: valAxis(c, {max: v => Math.min(CAP, Math.max(20, Math.ceil(v.max / 20) * 20)), axisLabel: {color: c.muted, fontSize: 11, formatter: '{value}%'}}), series: scSeries});
  const fresh = rows.filter(r => r.p === 0 && r.c > 0);
  return scope + `<div class="ir-grid">
    ${card({title: '증가·감소 상위 차종', sub: `${periodLabel()} vs 전년 동기 · 대수 증감 (상용·CKD 제외)`, opt: dOpt, h: Math.max(300, rs.length * 24 + 40),
      table: {cols: cmpCols('차종'), num: cmpNum(), csv: '차종증감', rows: rows.map(r => cmpRow(r))}})}
    ${card({title: '규모 vs 성장률', sub: '가로: 전년 동기 대수(로그) · 세로: 증감률 · 원 크기: 올해 대수 · ▲는 +200% 초과 — 오른쪽 위가 "크고 커지는 차"', opt: scOpt, h: Math.max(300, rs.length * 24 + 40)})}
    </div>${fresh.length ? `<section class="ir-card wide"><div class="ir-card-h"><div><h3>전년 같은 기간에 없던 차종 (신차·신규 생산지)</h3><p>증감률 대신 올해 대수만 표시합니다.</p></div></div><div class="ir-chips static">${fresh.map(r => `<span class="ir-chip">${esc(r.k)}<span>${fmt(r.c)}대</span></span>`).join('')}</div></section>` : ''}`;
}

/* ---------- 뷰: 월별 변동 ---------- */
function vMonthly(c){
  const mm = st.mm;
  const bys = {m: ['차종', () => prodList().filter(s => s.loc !== 'CKD' && !COMMERCIAL.has(s.m)), s => s.m], pl: ['공장', () => prodList(), s => s.pl], rg: ['수출 지역', () => D.series.filter(s => s.d === 'export' && coOk(s) && s.s !== 'CKD'), s => s.rg]};
  const [label, src, key] = bys[mm.by] || bys.m;
  const list = src();
  const rows = compare(list, key).slice(0, 15);
  const L = lastM(st.y);
  const ms = MONTHS.slice(0, L);
  const usePct = mm.val === 'pct' && hasPrev();
  const data = [];
  rows.forEach((r, yi) => ms.forEach((_, xi) => {
    const v = usePct ? pct(r.cv[xi], r.pv[xi]) : r.cv[xi];
    data.push([xi, yi, v == null || !isFinite(v) ? '-' : +(+v).toFixed(usePct ? 1 : 0)]);
  }));
  const ys = rows.map(r => r.k);
  const heat = baseOpt(c, {tooltip: {trigger: 'item', backgroundColor: c.surface, borderColor: c.grid, textStyle: {color: c.ink, fontSize: 12},
      formatter: p => { const r = rows[p.value[1]], i = p.value[0]; return `<b>${esc(r.k)}</b> · ${MONTHS[i]}<br>${st.y}년 ${fmt(r.cv[i])}대${hasPrev() ? `<br>${st.y - 1}년 ${fmt(r.pv[i])}대 (${fmtPct(pct(r.cv[i], r.pv[i]))})` : ''}`; }},
    grid: {left: 8, right: 16, top: 16, bottom: 54, containLabel: true},
    xAxis: catAxis(c, ms, {splitArea: {show: false}}), yAxis: catAxis(c, ys, {inverse: true, axisLabel: {color: c.ink2, fontSize: 12}}),
    visualMap: usePct ? {type: 'continuous', min: -40, max: 40, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 160, itemWidth: 10, text: ['+40% 이상', '−40% 이하'], textStyle: {color: c.muted, fontSize: 11}, inRange: {color: [c.neg, c.mid, c.pos]}}
      : {type: 'continuous', min: 0, max: Math.max(1, ...data.map(d => d[2] === '-' ? 0 : d[2])), orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 160, itemWidth: 10, text: ['많음', '적음'], textStyle: {color: c.muted, fontSize: 11}, inRange: {color: c.seq}, formatter: short},
    series: [{type: 'heatmap', data, itemStyle: {borderColor: c.surface, borderWidth: 2, borderRadius: 3}, label: {show: ms.length <= 9 && rows.length <= 15, color: c.ink, fontSize: 10, formatter: p => p.value[2] === '-' ? '' : usePct ? (p.value[2] > 0 ? '+' : '') + Math.round(p.value[2]) : short(p.value[2])}}]});
  const tm = monthsSum(list, st.y), tp = hasPrev() ? monthsSum(list, st.y - 1) : null;
  const deltas = ms.map((_, i) => tp ? pct(tm[i], tp[i]) : null);
  let worst = -1; deltas.forEach((d, i) => { if (d != null && (worst < 0 || d < deltas[worst])) worst = i; });
  const ls = [lineS(`${st.y}년`, tm.map((v, i) => i < L ? v : null), c.s[0], {markPoint: worst >= 0 ? {symbol: 'circle', symbolSize: 10, itemStyle: {color: c.s[0], borderColor: c.surface, borderWidth: 2}, label: {show: true, position: 'bottom', distance: 8, color: c.ink, fontSize: 11, formatter: `${worst + 1}월 ${fmtPct(deltas[worst])}`}, data: [{coord: [worst, tm[worst]]}]} : undefined})];
  if (tp) ls.unshift(lineS(`${st.y - 1}년`, tp, c.prev));
  const lineOpt = baseOpt(c, {legend: legend(c), xAxis: catAxis(c, MONTHS), yAxis: valAxis(c), series: ls});
  return `<div class="ir-toolbar"><span class="ir-fl">기준</span><div class="seg">${Object.entries(bys).map(([k, v]) => `<button type="button" data-ir-mm="by" data-ir-v="${k}" aria-pressed="${mm.by === k}">${v[0]}</button>`).join('')}</div>
    <span class="ir-fl">값</span><div class="seg"><button type="button" data-ir-mm="val" data-ir-v="pct" aria-pressed="${usePct}"${hasPrev() ? '' : ' disabled'}>전년 같은 달 대비 %</button><button type="button" data-ir-mm="val" data-ir-v="abs" aria-pressed="${!usePct}">대수</button></div>
    <span class="ir-note">월별 히트맵은 ${st.y}년 공개된 모든 달(1~${L}월)을 보여줍니다.</span></div>
    <div class="ir-grid">
    ${card({title: `${label} × 월 ${usePct ? '전년 대비 증감률' : '판매 대수'}`, sub: `상위 ${rows.length}개 (${periodLabel()} 대수 순) · ${usePct ? '파랑 = 늘어남, 빨강 = 줄어듦, 회색 = 비슷' : '진할수록 많음'}`, opt: heat, h: rows.length * 28 + 100, wide: true,
      table: {cols: [label, ...ms], num: [false, ...ms.map(() => true)], csv: `월별_${label}`, rows: rows.map(r => [r.k, ...ms.map((_, i) => usePct ? fmtPct(pct(r.cv[i], r.pv[i])) : fmt(r.cv[i]))])}})}
    ${card({title: `월별 합계 — ${label} 기준 전체`, sub: worst >= 0 ? `${worst + 1}월이 전년 같은 달 대비 가장 약함 (${fmtPct(deltas[worst])})` : '', opt: lineOpt, h: 300, wide: true,
      table: {cols: ['월', `${st.y}년`, ...(tp ? [`${st.y - 1}년`, '증감률'] : [])], num: [false, true, true, true], csv: `월별합계_${label}`, rows: MONTHS.map((m, i) => [m, i < L ? fmt(tm[i]) : '—', ...(tp ? [fmt(tp[i]), i < L ? fmtPct(pct(tm[i], tp[i])) : '—'] : [])])}})}
    </div>`;
}

/* ---------- 뷰: 도어모듈 물량 ---------- */
function supplyFor(row){
  const want = row.loc === '국내' ? 'KR' : (row.ct === '미국' ? 'US' : 'X');
  for (const s of SUPPLY){
    const base = String(s.model || '').replace(/\s*\(미국 생산\)\s*/, '').trim();
    const plant = String(s.plant || '');
    const scope = /\(미국 생산\)/.test(s.model) || /^(HMGMA|HMMA|미국)/.test(plant) ? 'US' : 'KR';
    const oem = s.oem === '기아' ? 'K' : (s.oem === '현대' || s.oem === '제네시스') ? 'H' : null;
    if (oem !== row.c || base !== row.m || scope !== want) continue;
    if (scope === 'US' && row.c === 'H'){
      if (/HMGMA/.test(plant) && !/HMGMA/.test(row.pl)) continue;
      if (/HMMA/.test(plant) && !/HMMA/.test(row.pl)) continue;
    }
    return s;
  }
  return null;
}
function vDoor(c){
  const dr = st.dr;
  let list = prodList().filter(s => s.loc !== 'CKD');
  if (dr.pv) list = list.filter(s => !COMMERCIAL.has(s.m) && s.s !== '상용' && s.s !== '특장');
  const keyOf = s => `${s.c}|${s.m}|${s.pl}`;
  const meta = new Map(list.map(s => [keyOf(s), s]));
  let rows = compare(list, keyOf).map(r => {
    const s = meta.get(r.k), pub = supplyFor(s), mine = doorMine[r.k] || '';
    const pubSup = pub && pub.supplier && (pub.status === '확인' || pub.status === '추정') ? pub.supplier : '';
    return Object.assign(r, {co: s.c, m: s.m, pl: s.pl, loc: s.loc, pub, mine, eff: mine || pubSup || '미확인', src: mine ? '내 입력' : pubSup ? `공개 자료(${pub.status})` : '—'});
  });
  const q = (dr.q || '').trim();
  const shown = q ? rows.filter(r => (r.m + ' ' + r.pl).includes(q)) : rows;
  const sup = compare(rows.map(r => ({y: st.y, v: r.cv, eff: r.eff})).concat(hasPrev() ? rows.map(r => ({y: st.y - 1, v: r.pv, eff: r.eff})) : []), 'eff');
  const supOrder = [...SUPPLIERS, ...sup.map(r => r.k).filter(k => !SUPPLIERS.includes(k) && k !== '미확인')];
  const colorSup = k => k === '미확인' ? c.prev : (c.s[supOrder.indexOf(k)] || c.prev);
  const T = sumRows(sup), kj = sup.find(r => r.k === '광진'), un = sup.find(r => r.k === '미확인');
  const donut = baseOpt(c, {legend: Object.assign(legend(c), {type: 'plain', top: 'auto', bottom: 0, right: 0}), tooltip: {trigger: 'item', backgroundColor: c.surface, borderColor: c.grid, textStyle: {color: c.ink, fontSize: 12}, formatter: p => `<b>${esc(p.name)}</b><br>${fmt(p.value)}대 · ${p.percent}%`},
    series: [{type: 'pie', radius: ['38%', '62%'], center: ['50%', '46%'], itemStyle: {borderColor: c.surface, borderWidth: 2},
      data: sup.filter(r => r.c > 0).map(r => ({name: r.k, value: r.c, itemStyle: {color: colorSup(r.k)}})), label: {color: c.ink2, formatter: p => p.percent >= 3 ? `${p.name}\n${p.percent}%` : ''}, labelLine: {lineStyle: {color: c.axis}}}]});
  const supList = `<datalist id="irSupList">${SUPPLIERS.map(s => `<option value="${s}">`).join('')}</datalist>`;
  const tRows = shown.map(r => [
    {html: `<b>${esc(r.m)}</b> <span class="ir-sub">${coLabel(r.co)}</span>`}, r.pl, fmt(r.c), ...(hasPrev() ? [fmt(r.p), fmtPct(r.r)] : []),
    {html: r.pub ? `${esc(r.pub.supplier || '—')} <span class="st ${esc(r.pub.status)}">${esc(r.pub.status)}</span>` : '<span class="ir-sub">표에 없음</span>'},
    {html: `<input class="ir-sup" list="irSupList" data-ir-door="${esc(r.k)}" value="${esc(r.mine)}" placeholder="입력" aria-label="${esc(r.m)} ${esc(r.pl)} 공급사">`},
    {html: `<b>${esc(r.eff)}</b>`},
  ]);
  const kpi = (l, v, s) => `<div class="ir-kpi"><div class="ir-kpi-l">${esc(l)}</div><div class="ir-kpi-v">${v}</div><div class="ir-kpi-s">${esc(s)}</div></div>`;
  return `<div class="notice ir-door-note"><b>공급사는 이 화면에서 직접 입력할 수 있습니다.</b> 입력값은 <b>이 브라우저에만 저장</b>되고 공개 사이트에는 올라가지 않습니다. 입력이 없으면 '차종별 공급사' 표의 공개 자료(확인·추정)를 씁니다. 물량은 차량 대수 기준입니다(도어 수 아님).</div>
    <div class="ir-toolbar"><label class="ir-check"><input type="checkbox" data-ir-toggle="dr.pv"${dr.pv ? ' checked' : ''}> 승용·RV만 (상용·특장 제외)</label>
      <input type="search" class="ir-search" placeholder="차종·공장 찾기" value="${esc(q)}" data-ir-door-q aria-label="차종 찾기">
      ${Object.keys(doorMine).length ? `<button type="button" class="ir-mini" data-ir-act="door-export">내 입력 내보내기(JSON)</button><button type="button" class="ir-mini" data-ir-act="door-reset">내 입력 모두 지우기 (${Object.keys(doorMine).length}건)</button>` : ''}</div>
    <div class="ir-kpis three">
      ${kpi('대상 물량', fmt(T.c) + '<small>대</small>', `${CO_NAME[st.co]} · ${periodLabel()}`)}
      ${kpi('광진 물량', kj ? fmt(kj.c) + '<small>대</small>' : '—', kj ? `점유율 ${(kj.c / T.c * 100).toFixed(1)}%${hasPrev() && kj.p ? ` · 전년 동기 ${fmtPct(kj.r)}` : ''}` : '아래 표에서 광진 공급 차종을 입력하면 계산됩니다')}
      ${kpi('공급사 미확인', un ? (un.c / T.c * 100).toFixed(1) + '<small>%</small>' : '0<small>%</small>', '입력이 늘수록 추정이 정확해집니다')}
    </div>
    <div class="ir-grid">
    ${card({title: '공급사별 물량 추정', sub: '차종·공장별 대수를 공급사에 배분한 합계', opt: donut, h: 320,
      table: {cols: cmpCols('공급사'), num: cmpNum(), csv: '공급사별물량', rows: sup.map(r => cmpRow(r))}})}
    <section class="ir-card"><div class="ir-card-h"><div><h3>이렇게 쓰세요</h3></div></div><ol class="ir-how">
      <li>아래 표에서 차종·공장별 <b>'내 입력'</b> 칸에 공급사를 적습니다 (목록에서 고르거나 직접 입력).</li>
      <li>왼쪽 도넛과 위 카드가 바로 다시 계산됩니다 — 광진 점유율, 경쟁사 물량.</li>
      <li>기간·회사를 바꾸면 같은 입력으로 다른 기간 물량을 볼 수 있습니다.</li>
      <li>표 오른쪽 위 <b>CSV</b>로 내려받아 보고서에 붙일 수 있습니다.</li></ol></section>
    </div>
    ${supList}
    ${card({title: '차종·공장별 물량과 공급사', sub: `${shown.length}개 행 · ${periodLabel()}`, wide: true,
      table: {cols: ['차종', '생산 공장', periodLabel(), ...(hasPrev() ? [periodLabel(st.y - 1), '증감률'] : []), '공개 자료', '내 입력', '적용'], num: [false, false, true, true, true, false, false, false], csv: '도어모듈물량', rows: tRows}})}`;
}

/* ---------- 렌더 ---------- */
const VIEWS = {overview: vOverview, explore: vExplore, global: vGlobal, export: vExport, momentum: vMomentum, monthly: vMonthly, door: vDoor};
function render(){
  if (!root || !D) return;
  clampMonths();
  const c = C();
  pending = [];
  const body = (VIEWS[view] || vOverview)(c);
  root.innerHTML = filterRow() + `<div class="ir-body">${body}</div>
    <p class="ir-src">출처: 현대자동차·기아 IR 월별 판매 실적 (${esc(D.sources.length)}개 파일, ${esc(D.generated)} 변환). 국내공장 = 국내 공장 생산분의 내수+수출, 해외공장 = 해외 공장 출하. 합계는 IR 원본의 합계 행과 대조해 검증했습니다.</p>`;
  drawPending();
}
function rerenderKeepScroll(){ const y = window.scrollY; render(); window.scrollTo(0, y); }

function onClick(e){
  const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
  const d = b.dataset;
  if (d.irCo){ const atEnd = st.m1 === lastM(st.y); st.co = d.irCo; if (atEnd) st.m1 = lastM(st.y); clampMonths(); }
  else if (d.irEx){ st.ex[d.irEx] = d.irV; if (d.irEx === 'ds'){ st.ex.cond = {}; st.ex.sel = null; slotMap.clear(); } if (d.irEx === 'by'){ st.ex.sel = null; slotMap.clear(); } }
  else if (d.irMo){ st.mo[d.irMo] = d.irV; }
  else if (d.irMm){ st.mm[d.irMm] = d.irV; }
  else if (d.irPick != null){
    const k = d.irPick; const cur = st.ex.sel && st.ex.sel.length ? st.ex.sel.slice() : [...root.querySelectorAll('.ir-chip[aria-pressed="true"]')].map(x => x.dataset.irPick);
    const i = cur.indexOf(k); if (i >= 0) cur.splice(i, 1); else cur.push(k);
    st.ex.sel = cur.length ? cur : null;
  }
  else if (d.irAct === 'table'){
    const t = document.getElementById(d.irFor + '-t'), ch = document.getElementById(d.irFor);
    const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); b.textContent = on ? '그래프 보기' : '표 보기';
    if (t) t.hidden = !on; if (ch) ch.hidden = on;
    if (!on){ const inst = charts.find(x => x.getDom() === ch); if (inst) inst.resize(); }
    return;
  }
  else if (d.irAct === 'csv'){ downloadCsv(document.getElementById(d.irFor + '-t')); return; }
  else if (d.irAct === 'ytd'){ st.m0 = 1; st.m1 = lastM(st.y); }
  else if (d.irAct === 'last1'){ st.m1 = lastM(st.y); st.m0 = st.m1; }
  else if (d.irAct === 'cond-clear'){ st.ex.cond = {}; }
  else if (d.irAct === 'sel-clear'){ st.ex.sel = null; slotMap.clear(); }
  else if (d.irAct === 'door-export'){
    const rows = Object.entries(doorMine).map(([k, v]) => { const [c, m, pl] = k.split('|'); return {company: c === 'H' ? '현대' : '기아', model: m, plant: pl, supplier: v}; });
    const blob = new Blob([JSON.stringify(rows, null, 1)], {type: 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'door-suppliers-입력.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0); return;
  }
  else if (d.irAct === 'door-reset'){ if (!confirm('이 브라우저에 저장한 공급사 입력을 모두 지울까요?')) return; for (const k of Object.keys(doorMine)) delete doorMine[k]; store.set('kj.ir.door', doorMine); }
  else return;
  save(); rerenderKeepScroll();
}
function onChange(e){
  const t = e.target, d = t.dataset;
  if (d.irSet === 'y'){ st.y = +t.value; st.m1 = null; clampMonths(); }
  else if (d.irSet){ st[d.irSet] = +t.value; if (st.m0 > st.m1){ if (d.irSet === 'm0') st.m1 = st.m0; else st.m0 = st.m1; } }
  else if (d.irCond){ st.ex.cond[d.irCond] = t.value; }
  else if ('irExTop' in d){ st.ex.top = +t.value; st.ex.sel = null; slotMap.clear(); }
  else if ('irMoMin' in d){ st.mo.min = +t.value; }
  else if (d.irToggle){ const [a, b] = d.irToggle.split('.'); if (b) st[a][b] = t.checked; else st[a] = t.checked; }
  else if (d.irDoor){ const v = t.value.trim(); if (v) doorMine[d.irDoor] = v; else delete doorMine[d.irDoor]; store.set('kj.ir.door', doorMine); }
  else return;
  save(); rerenderKeepScroll();
}
let qT;
function onInput(e){
  const t = e.target;
  if ('irFilter' in t.dataset){ const q = t.value.trim().toLowerCase(); root.querySelectorAll('.ir-chip[data-ir-pick]').forEach(ch => { ch.hidden = q && !ch.dataset.irPick.toLowerCase().includes(q); }); }
  if ('irDoorQ' in t.dataset){ clearTimeout(qT); qT = setTimeout(() => { st.dr.q = t.value; save(); const pos = t.selectionStart; rerenderKeepScroll(); const n = root.querySelector('[data-ir-door-q]'); if (n){ n.focus(); try{ n.setSelectionRange(pos, pos); }catch(e){} } }, 250); }
}
function downloadCsv(box){
  if (!box) return;
  const rows = [...box.querySelectorAll('tr')].map(tr => [...tr.children].map(td => { const inp = td.querySelector('input'); const v = inp ? inp.value : td.textContent.trim(); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(','));
  const blob = new Blob(['﻿' + rows.join('\r\n')], {type: 'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${box.dataset.csv || 'IR'}_${CO_NAME[st.co]}_${periodLabel()}.csv`.replace(/[\\/:*?"<>|\s]+/g, '_');
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => charts.forEach(ch => { try{ ch.resize(); }catch(e){} }), 150); });
try{ window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (root && document.body.contains(root)) render(); }); }catch(e){}

window.IR = {
  snapshot,
  mount(el, sub, params){
    root = el; view = VIEWS[sub] ? sub : 'overview';
    if (params && params.pick){
      st.ex.ds = DS[params.ds] ? params.ds : 'prod'; st.ex.by = params.by || 'm'; st.ex.sel = [params.pick]; st.ex.cond = {}; st.ex.chart = st.ex.chart === 'pie' ? 'bar' : st.ex.chart; slotMap.clear(); save();
    }
    root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('input', onInput);
    if (!D) root.innerHTML = '<div class="empty">IR 데이터를 불러오는 중…</div>';
    load().then(() => { if (root === el) render(); }).catch(err => { el.innerHTML = `<div class="notice">IR 데이터를 불러오지 못했습니다 (${esc(err.message)}). 잠시 후 새로고침해 주세요.</div>`; loading = null; });
  },
};
})();
