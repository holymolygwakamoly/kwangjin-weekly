/* IR 경영 실적 탭 — 현대차·기아 분기 실적발표·가이던스·공시·IR 일정 (data/irsite.json, tools/irsite/build.py가 생성) */
(function(){
"use strict";
const ECHARTS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js';
const CO = {H:'현대차', K:'기아'};
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, d = 0) => n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('ko-KR', {minimumFractionDigits: d, maximumFractionDigits: d});
const jo = b => b == null ? '—' : (Math.abs(b) >= 1000 ? fmt(b / 1000, 1) + '조' : fmt(b * 10) + '억');        // 십억원 → '2.9조' / '8,280억'
const sjo = b => b == null ? '—' : (b > 0 ? '+' : b < 0 ? '−' : '') + jo(Math.abs(b));
const sgn = (n, d = 0) => n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + fmt(n, d);
const pct = (a, b) => a == null || !b ? null : (a - b) / Math.abs(b) * 100;
const qLabel = q => q ? `${q.slice(2, 4)}년 ${q[5]}분기` : '';
const qShort = q => q ? `${q[5]}Q${q.slice(2, 4)}` : '';
const qShift = (q, k) => { const i = +q.slice(0, 4) * 4 + (+q[5] - 1) + k; return `${Math.floor(i / 4)}Q${i % 4 + 1}`; };
const store = { get(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} } };

let D = null, loading = null, root = null, view = 'summary', charts = [], pending = [];
const st = Object.assign({co: 'H', q: null, tag: ''}, store.get('kj.irs') || {});
const save = () => store.set('kj.irs', {co: st.co, q: st.q, tag: st.tag});

function loadScript(src){ return new Promise((ok, fail) => { if (window.echarts) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); }); }
function load(){
  if (!loading) loading = Promise.all([
    fetch('data/irsite.json', {cache: 'no-cache'}).then(r => { if (!r.ok) throw new Error('irsite ' + r.status); return r.json(); }),
    loadScript(ECHARTS_URL),
  ]).then(([d]) => { D = d; if (!st.q || !QS().includes(st.q)) st.q = latestQ(); });
  return loading;
}
const qmap = c => Object.fromEntries((D.quarters[c] || []).map(x => [x.q, x]));
const QS = () => Array.from(new Set([...D.quarters.H, ...D.quarters.K].map(x => x.q))).sort();  // 한 회사만 발표한 분기도 포함
const latestQ = () => { const qs = QS(); return qs[qs.length - 1]; };

/* ---------- 색·차트 공통 (ir.js와 같은 토큰) ---------- */
function C(){
  const cs = getComputedStyle(root || document.documentElement); const g = n => cs.getPropertyValue(n).trim();
  return {s: [1,2,3,4,5,6,7,8].map(i => g('--viz-' + i)), prev: g('--viz-prev'), pos: g('--viz-pos'), neg: g('--viz-neg'), grid: g('--viz-grid'), axis: g('--viz-axis'), muted: g('--viz-muted'), ink: g('--viz-ink'), ink2: g('--viz-ink2'), surface: g('--viz-surface')};
}
const coColor = (c, k) => c === 'H' ? k.s[0] : k.s[1];
const tt = (k, o) => Object.assign({trigger: 'axis', backgroundColor: k.surface, borderColor: k.grid, textStyle: {color: k.ink, fontSize: 12}, axisPointer: {type: 'line', lineStyle: {color: k.axis}}}, o || {});
const base = (k, o) => Object.assign({animationDuration: 300, textStyle: {fontFamily: getComputedStyle(document.body).fontFamily, color: k.ink2},
  grid: {left: 8, right: 22, top: o.legend ? 40 : 16, bottom: 6, containLabel: true},
  toolbox: {right: 0, top: 0, itemSize: 13, feature: {saveAsImage: {title: '이미지 저장', name: 'IR경영실적', backgroundColor: k.surface, pixelRatio: 2}}, iconStyle: {borderColor: k.muted}}}, o);
const legend = k => ({top: 0, left: 0, right: 40, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 14, textStyle: {color: k.ink2, fontSize: 12}});
const vAxis = (k, x) => Object.assign({type: 'value', axisLine: {show: false}, axisTick: {show: false}, splitLine: {lineStyle: {color: k.grid}}, axisLabel: {color: k.muted, fontSize: 11}}, x || {});
const cAxis = (k, data, x) => Object.assign({type: 'category', data, axisLine: {lineStyle: {color: k.axis}}, axisTick: {show: false}, axisLabel: {color: k.muted, fontSize: 11}}, x || {});
const line = (name, data, color, x) => Object.assign({name, type: 'line', data, showSymbol: true, symbol: 'circle', symbolSize: 7, lineStyle: {width: 2, color}, itemStyle: {color, borderColor: 'transparent'}, emphasis: {focus: 'series'}}, x || {});
const bar = (name, data, color, x) => Object.assign({name, type: 'bar', data, barMaxWidth: 18, itemStyle: {color, borderRadius: [4,4,0,0]}}, x || {});

function card(o){
  const id = 'irs' + Math.random().toString(36).slice(2, 9);
  if (o.opt) pending.push({id, opt: o.opt, click: o.click});
  return `<section class="ir-card${o.wide ? ' wide' : ''}">
    <div class="ir-card-h"><div><h3>${esc(o.title)}</h3>${o.sub ? `<p>${o.sub}</p>` : ''}</div>
      <div class="ir-card-act">${o.more ? `<button type="button" class="ir-mini" data-irs-go="${o.more}">자세히 →</button>` : ''}${o.table && o.opt ? `<button type="button" class="ir-mini" data-irs-act="table" data-irs-for="${id}" aria-pressed="false">표 보기</button>` : ''}${o.table ? `<button type="button" class="ir-mini" data-irs-act="csv" data-irs-for="${id}">CSV</button>` : ''}</div></div>
    ${o.opt ? `<div class="ir-chart" id="${id}" style="height:${o.h || 300}px" role="img" aria-label="${esc(o.title)}"></div>` : ''}
    ${o.html || ''}
    ${o.table ? `<div class="ir-tbl" id="${id}-t"${o.opt ? ' hidden' : ''} data-csv="${esc(o.title)}">${tableHtml(o.table)}</div>` : ''}
  </section>`;
}
function tableHtml(t){
  return `<table><thead><tr>${t.cols.map((h, i) => `<th${t.num && t.num[i] ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((v, i) => `<td${t.num && t.num[i] ? ' class="n"' : ''}>${v && v.html != null ? v.html : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function draw(){
  for (const ch of charts) try{ ch.dispose(); }catch(e){}
  charts = [];
  for (const p of pending){
    const el = document.getElementById(p.id); if (!el) continue;
    const ch = window.echarts.init(el, null, {renderer: 'svg'}); ch.setOption(p.opt);
    if (p.click) ch.on('click', p.click);
    charts.push(ch);
  }
  pending = [];
}

/* ---------- 지표·신호 ---------- */
function metrics(c, q){
  const m = qmap(c), x = m[q], y = m[qShift(q, -4)];
  if (!x) return null;
  return {x, y,
    rev: x.rev, revY: pct(x.rev, y && y.rev), op: x.op, opY: pct(x.op, y && y.op),
    opm: x.opm, opmD: y ? x.opm - y.opm : null, cogs: x.cogs_ratio, cogsD: y ? x.cogs_ratio - y.cogs_ratio : null,
    ws: x.wholesale, wsY: pct(x.wholesale, y && y.wholesale), xev: x.xev, xevD: y ? x.xev - y.xev : null,
    tariff: (x.bridge ? x.bridge.items.filter(i => i.cat === '관세').reduce((a, i) => a + i.v, 0) : 0)};
}
function signals(c, q){
  const m = metrics(c, q); if (!m) return [];
  const s = [], items = (m.x.bridge || {}).items || [];
  const by = cat => items.filter(i => i.cat === cat).reduce((a, i) => a + i.v, 0);
  if (m.cogsD != null && m.cogsD >= 1) s.push({lv: 'warn', ic: '▲', t: `매출원가율 ${fmt(m.cogs, 1)}% (전년比 ${sgn(m.cogsD, 1)}%p) — 원가 부담이 커져 협력사 단가 인하 요구로 이어질 수 있음`});
  if (m.opmD != null && m.opmD <= -1.5) s.push({lv: 'warn', ic: '▼', t: `영업이익률 ${fmt(m.opm, 1)}% (${sgn(m.opmD, 1)}%p) — 수익성 하락`});
  if (m.tariff <= -300) s.push({lv: 'warn', ic: '◆', t: `美 관세가 영업이익을 ${jo(-m.tariff)}원 깎음`});
  const inc = items.filter(i => /Incentive/.test(i.k)).reduce((a, i) => a + i.v, 0);
  const incPrice = items.some(i => /Incentive·Price/.test(i.k));
  if (inc <= -300) s.push({lv: 'warn', ic: '◆', t: `${incPrice ? '인센티브·가격' : '인센티브(판촉비)'} 부담 ${jo(-inc)}원 — 판매 경쟁 심화`});
  const mat = items.filter(i => i.k === 'Material Cost').reduce((a, i) => a + i.v, 0);
  if (mat) s.push({lv: mat > 0 ? 'ok' : 'warn', ic: mat > 0 ? '●' : '▲', t: `재료비 ${mat > 0 ? '하락' : '상승'} 효과 ${mat > 0 ? '+' : '−'}${jo(Math.abs(mat))}원 — 원자재 시세 변동이 OEM 손익에 직접 반영됨`});
  if (m.wsY != null && m.wsY <= -3) s.push({lv: 'warn', ic: '▼', t: `도매 판매 ${fmt(m.ws)}천 대 (${sgn(m.wsY, 1)}%) — 물량 감소`});
  if (m.wsY != null && m.wsY >= 3) s.push({lv: 'ok', ic: '▲', t: `도매 판매 ${fmt(m.ws)}천 대 (${sgn(m.wsY, 1)}%) — 물량 증가`});
  if (m.xevD != null && m.xevD >= 3) s.push({lv: 'ok', ic: '▲', t: `친환경차 비중 ${fmt(m.xev, 1)}% (${sgn(m.xevD, 1)}%p) — 하이브리드·전기차 차종 비중 확대`});
  const fx = by('환율'); if (fx >= 300) s.push({lv: 'info', ic: '●', t: `환율 효과 +${jo(fx)}원 — 원화 약세가 이익을 받쳐 줌(환율이 바뀌면 사라지는 이익)`});
  return s;
}
const kpiTile = (label, val, unit, delta, deltaUnit, sub, goodWhenUp) => {
  const cls = delta == null || Math.abs(delta) < 0.05 ? '' : ((delta > 0) === goodWhenUp ? 'up' : 'down');
  const d = delta == null ? '<span class="ir-delta">전년 비교 없음</span>' : `<span class="ir-delta ${cls}">${delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} ${sgn(delta, 1)}${deltaUnit}<span class="ir-delta-sub"> 전년 동기 대비</span></span>`;
  return `<div class="ir-kpi"><div class="ir-kpi-l">${esc(label)}</div><div class="ir-kpi-v">${val}<small>${unit}</small></div>${d}${sub ? `<div class="ir-kpi-s">${esc(sub)}</div>` : ''}</div>`;
};
function coPanel(c, q){
  const m = metrics(c, q); if (!m) return `<div class="empty">${CO[c]} ${qLabel(q)} 자료가 없습니다.</div>`;
  const sig = signals(c, q);
  return `<section class="irs-co irs-${c}">
    <div class="irs-co-h"><h3><span class="irs-dot" style="background:var(--viz-${c === 'H' ? 1 : 2})"></span>${CO[c]}</h3><span class="ir-sub">${qLabel(q)} · 연결 기준</span></div>
    <div class="ir-kpis irs-kpis">
      ${kpiTile('영업이익', fmt(m.op / 1000, 2), '조', m.opY, '%', `매출 ${fmt(m.rev / 1000, 1)}조 (${sgn(m.revY, 1)}%)`, true)}
      ${kpiTile('영업이익률', fmt(m.opm, 1), '%', m.opmD, '%p', '', true)}
      ${kpiTile('매출원가율', fmt(m.cogs, 1), '%', m.cogsD, '%p', '오를수록 원가 압박', false)}
      ${kpiTile('도매 판매', fmt(m.ws), '천 대', m.wsY, '%', '', true)}
      ${kpiTile('친환경차 비중', fmt(m.xev, 1), '%', m.xevD, '%p', c === 'H' ? '도매 기준(EV·HEV·PHEV·FCEV)' : '소매 기준(HEV·PHEV·BEV)', true)}
    </div>
    ${sig.length ? `<ul class="sig">${sig.map(x => `<li class="${x.lv}"><b aria-hidden="true">${x.ic}</b>${esc(x.t)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

/* ---------- 폭포형(영업이익 증감) ---------- */
function waterfall(k, c, q, compact){
  const b = (qmap(c)[q] || {}).bridge; if (!b) return null;
  const names = [qShort(qShift(q, -4)) + ' 영업이익', ...b.items.map(i => i.label), qShort(q) + ' 영업이익'];
  let run = b.start; const base_ = [0], up = [b.start], down = [null], lab = [b.start];
  for (const i of b.items){
    if (i.v >= 0){ base_.push(run); up.push(i.v); down.push(null); run += i.v; }
    else { run += i.v; base_.push(run); up.push(null); down.push(-i.v); }
    lab.push(i.v);
  }
  base_.push(0); up.push(b.end); down.push(null); lab.push(b.end);
  const isEdge = j => j === 0 || j === names.length - 1;
  const H = compact;  // 요약 화면은 가로 막대(항목 이름이 겹치지 않게)
  const bw = H ? 14 : 40, rUp = H ? [0,3,3,0] : [3,3,0,0];
  const cat = cAxis(k, names, H ? {inverse: true, axisLabel: {color: k.ink2, fontSize: 11, interval: 0}} : {axisLabel: {color: k.ink2, fontSize: 11, interval: 0, width: 70, overflow: 'break'}});
  const val = vAxis(k, {axisLabel: {color: k.muted, fontSize: 11, formatter: v => v >= 1000 ? (v / 1000) + '조' : v}, splitNumber: H ? 3 : 5});
  return base(k, {grid: {left: 8, right: H ? 44 : 12, top: H ? 4 : 26, bottom: 4, containLabel: true},
    tooltip: {trigger: 'axis', axisPointer: {type: 'shadow', shadowStyle: {color: 'rgba(127,127,127,.08)'}}, backgroundColor: k.surface, borderColor: k.grid, textStyle: {color: k.ink, fontSize: 12},
      formatter: ps => { const j = ps[0].dataIndex; const it = b.items[j - 1]; return isEdge(j) ? `<b>${esc(names[j])}</b><br>${jo(lab[j])}원` : `<b>${esc(names[j])}</b> (${esc(it.cat)})<br>${sjo(it.v)}원<br><span style="color:${k.muted}">원문: ${esc(it.k)}</span>`; }},
    xAxis: H ? val : cat, yAxis: H ? cat : val,
    ...(H ? {toolbox: {show: false}} : {}),
    series: [
      {type: 'bar', stack: 'w', data: base_, itemStyle: {color: 'transparent'}, emphasis: {disabled: true}, barMaxWidth: bw},
      {type: 'bar', stack: 'w', data: up.map((v, j) => v == null ? null : {value: v, itemStyle: {color: isEdge(j) ? k.prev : k.pos, borderRadius: rUp}}), barMaxWidth: bw,
        label: {show: true, position: H ? 'right' : 'top', color: k.ink2, fontSize: 11, formatter: p => isEdge(p.dataIndex) ? fmt(lab[p.dataIndex]) : sgn(lab[p.dataIndex])}},
      {type: 'bar', stack: 'w', data: down.map(v => v == null ? null : {value: v, itemStyle: {color: k.neg, borderRadius: H ? [3,0,0,3] : [3,3,0,0]}}), barMaxWidth: bw,
        label: {show: true, position: H ? 'left' : 'bottom', color: k.ink2, fontSize: 11, formatter: p => sgn(lab[p.dataIndex])}},
    ]});
}

/* ---------- 화면들 ---------- */
function head(){
  const qs = QS();
  const up = (D.upcoming_results || []).map(x => `${CO[x.c]} ${qLabel(x.q)}`);
  return `<div class="ir-filters" role="group" aria-label="분기 선택">
    ${view === 'events' || view === 'docs' ? '' : `<div class="ir-f"><span class="ir-fl">기준 분기</span><select data-irs-set="q" aria-label="기준 분기">${qs.slice().reverse().map(q => `<option value="${q}"${q === st.q ? ' selected' : ''}>${qLabel(q)}</option>`).join('')}</select>
      <button type="button" class="ir-mini" data-irs-act="latest">최근 분기</button></div>`}
    <p class="ir-fnote">출처: 현대차·기아 IR 분기 실적발표(연결 기준, 금액 단위 십억원) · ${up.length ? `다음 발표 예정: ${esc(up.join(', '))} · ` : ''}자료 수집 ${esc((D.fetched || '').slice(0, 10))}</p>
  </div>`;
}
function vSummary(k){
  const q = st.q, qs = QS();
  const opm = base(k, {legend: legend(k), tooltip: tt(k, {valueFormatter: v => v == null ? '—' : v + '%'}),
    xAxis: cAxis(k, qs.map(qShort)), yAxis: vAxis(k, {axisLabel: {color: k.muted, fontSize: 11, formatter: '{value}%'}}),
    series: ['H', 'K'].map(c => line(CO[c], qs.map(x => (qmap(c)[x] || {}).opm ?? null), coColor(c, k), {markLine: undefined}))});
  const cum = c => (D.quarters[c] || []).reduce((a, x) => a + ((x.bridge || {}).items || []).filter(i => i.cat === '관세').reduce((s, i) => s + i.v, 0), 0);
  const ev = upcomingEvents().slice(0, 5), dis = (D.disclosures || []).filter(d => d.tag !== '기타').slice(0, 5);
  return `<div class="irs-cos">${coPanel('H', q)}${coPanel('K', q)}</div>
    <div class="ir-grid">
      ${card({title: '영업이익률 추이', sub: '분기별 · 점을 누르면 그 분기로', opt: opm, h: 260, more: 'profit', click: p => { st.q = qs[p.dataIndex]; save(); rerender(); }})}
      ${card({title: '영업이익 증감 — ' + qLabel(q), sub: '전년 같은 분기 대비 무엇이 이익을 늘리고 줄였나 (파랑 = 증가, 빨강 = 감소)', more: 'bridge', html: `<div class="irs-mini-w">${['H', 'K'].map(c => { const o = waterfall(k, c, q, true); if (!o) return ''; const id = 'irsw' + c + Math.random().toString(36).slice(2, 6); pending.push({id, opt: o}); return `<div><div class="irs-mini-t">${CO[c]}</div><div id="${id}" style="height:${40 + 24 * ((qmap(c)[q].bridge.items.length) + 2)}px"></div></div>`; }).join('')}</div>`})}
      ${card({title: '美 관세 누적 영향', sub: '영업이익 증감 요인 중 관세 항목 합계 (2025년 2분기~)', more: 'bridge', html: `<div class="irs-big2">${['H', 'K'].map(c => `<div><span class="ir-sub">${CO[c]}</span><b>${jo(-cum(c))}원</b><span class="ir-sub">영업이익 감소</span></div>`).join('')}</div>`})}
      ${card({title: '다가오는 일정 · 최근 주요 공시', more: 'events', html: `<ul class="irs-list">${ev.map(e => `<li><span class="mono">${esc(e.start || '')}</span> <b>${CO[e.c]}</b> ${esc(e.title)}</li>`).join('') || '<li class="ir-sub">예정된 일정 없음</li>'}${dis.map(d => `<li><span class="mono">${esc(d.date)}</span> <span class="tagx">${esc(d.tag)}</span> <a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a></li>`).join('')}</ul>`})}
    </div>
    ${guideCards(k, true)}`;
}
function vProfit(k){
  const qs = QS(), cats = qs.map(qShort);
  const two = (key, unit, ax) => ['H', 'K'].map(c => line(CO[c], qs.map(x => (qmap(c)[x] || {})[key] ?? null), coColor(c, k)));
  const pctAxis = vAxis(k, {scale: true, axisLabel: {color: k.muted, fontSize: 11, formatter: '{value}%'}});
  const click = p => { st.q = qs[p.dataIndex]; save(); view = 'bridge'; rerender(true); };
  const opmO = base(k, {legend: legend(k), tooltip: tt(k, {valueFormatter: v => v == null ? '—' : v + '%'}), xAxis: cAxis(k, cats), yAxis: pctAxis, series: two('opm')});
  const cogsO = base(k, {legend: legend(k), tooltip: tt(k, {valueFormatter: v => v == null ? '—' : v + '%'}), xAxis: cAxis(k, cats), yAxis: pctAxis, series: two('cogs_ratio')});
  const opO = base(k, {legend: legend(k), tooltip: tt(k, {valueFormatter: v => v == null ? '—' : jo(v) + '원'}), xAxis: cAxis(k, cats), yAxis: vAxis(k, {axisLabel: {color: k.muted, fontSize: 11, formatter: v => v >= 1000 ? (v / 1000) + '조' : v}}),
    series: ['H', 'K'].map(c => bar(CO[c], qs.map(x => (qmap(c)[x] || {}).op ?? null), coColor(c, k)))});
  const revO = base(k, {legend: legend(k), tooltip: tt(k, {valueFormatter: v => v == null ? '—' : fmt(v / 1000, 1) + '조원'}), xAxis: cAxis(k, cats), yAxis: vAxis(k, {axisLabel: {color: k.muted, fontSize: 11, formatter: v => (v / 1000) + '조'}}),
    series: ['H', 'K'].map(c => bar(CO[c], qs.map(x => (qmap(c)[x] || {}).rev ?? null), coColor(c, k)))});
  const rows = []; for (const c of ['H', 'K']) for (const x of D.quarters[c]) rows.push([CO[c], qLabel(x.q), fmt(x.rev), fmt(x.op), fmt(x.opm, 1) + '%', fmt(x.cogs_ratio, 1) + '%', x.sga_ratio != null ? fmt(x.sga_ratio, 1) + '%' : '—', fmt(x.np), srcTag(x)]);
  return `<div class="ir-grid">
    ${card({title: '영업이익률', sub: '점을 누르면 그 분기의 영업이익 증감 요인으로', opt: opmO, h: 300, click})}
    ${card({title: '매출원가율', sub: '매출 대비 원가 비중 — 오르면 OEM이 원가 절감(협력사 단가)을 더 강하게 요구할 가능성', opt: cogsO, h: 300, click})}
    ${card({title: '영업이익', sub: '십억원', opt: opO, h: 280, click})}
    ${card({title: '매출', sub: '조원', opt: revO, h: 280, click})}
    ${card({title: '분기 손익 표', wide: true, table: {cols: ['회사', '분기', '매출', '영업이익', '영업이익률', '원가율', '판관비율', '순이익', '출처'], num: [false, false, true, true, true, true, true, true, false], rows}})}
  </div>`;
}
function srcTag(x){
  const v = Object.values(x.src || {}); const n = v.filter(s => s !== '자동').length;
  return {html: n ? `<span class="tagx" title="${esc(Object.entries(x.src).map(([k, s]) => k + ':' + s).join(', '))}">${v.some(s => s === '확인') ? '그림 확인' : '다른 분기 자료'}</span>` : '<span class="ir-sub">자동 추출</span>'};
}
function vBridge(k){
  const q = st.q, c = st.co, qs = QS();
  const o = waterfall(k, c, q, false);
  const x = qmap(c)[q] || {}, b = x.bridge;
  const recent = qs.slice(-4);
  const cats = ['관세', '환율', '물량', '차종·가격', '원가·비용', '기타'];
  const agg = (cc) => cats.map(cat => recent.reduce((a, qq) => a + (((qmap(cc)[qq] || {}).bridge || {}).items || []).filter(i => i.cat === cat).reduce((s, i) => s + i.v, 0), 0));
  const aggO = base(k, {legend: legend(k), tooltip: tt(k, {axisPointer: {type: 'shadow', shadowStyle: {color: 'rgba(127,127,127,.08)'}}, valueFormatter: v => sjo(v) + '원'}),
    xAxis: cAxis(k, cats, {axisLabel: {color: k.ink2, fontSize: 12, interval: 0}}), yAxis: vAxis(k, {axisLabel: {color: k.muted, fontSize: 11, formatter: v => Math.abs(v) >= 1000 ? (v / 1000) + '조' : v}}),
    series: ['H', 'K'].map(cc => bar(CO[cc], agg(cc), coColor(cc, k), {itemStyle: {color: coColor(cc, k), borderRadius: 3}}))});
  return `<div class="ir-toolbar"><span class="ir-fl">회사</span><div class="seg">${['H', 'K'].map(cc => `<button type="button" data-irs-co="${cc}" aria-pressed="${c === cc}">${CO[cc]}</button>`).join('')}</div>
    <span class="ir-fl">분기</span><div class="seg irs-qseg">${qs.map(qq => `<button type="button" data-irs-q="${qq}" aria-pressed="${qq === q}">${qShort(qq)}</button>`).join('')}</div></div>
    <div class="ir-grid">
    ${o ? card({title: `${CO[c]} ${qLabel(q)} 영업이익 증감 요인`, sub: `${qLabel(qShift(q, -4))} ${fmt(b.start)} → ${qLabel(q)} ${fmt(b.end)} (십억원) · ${esc((D.bridge_notes || {})[c] || '')}`, opt: o, h: 380, wide: true,
      table: {cols: ['항목', '분류', '증감(십억원)', '원문 항목'], num: [false, false, true, false], rows: b.items.map(i => [i.label, i.cat, sgn(i.v), i.k])}}) : '<div class="empty">이 분기의 증감 요인 자료가 없습니다.</div>'}
    ${card({title: '최근 4개 분기 요인 합계', sub: `${qLabel(recent[0])}~${qLabel(recent[recent.length - 1])} · 분류별로 두 회사 비교 (현대 '차종·가격'에는 인센티브 포함)`, opt: aggO, h: 300, wide: true,
      table: {cols: ['분류', '현대차', '기아'], num: [false, true, true], rows: cats.map((cat, j) => [cat, sgn(agg('H')[j]), sgn(agg('K')[j])])}})}
    </div>`;
}
function vSales(k){
  const qs = QS(), cats = qs.map(qShort);
  const wsO = base(k, {legend: legend(k), tooltip: tt(k, {valueFormatter: v => v == null ? '—' : fmt(v) + '천 대'}), xAxis: cAxis(k, cats), yAxis: vAxis(k),
    series: ['H', 'K'].map(c => bar(CO[c], qs.map(x => (qmap(c)[x] || {}).wholesale ?? null), coColor(c, k)))});
  const yoy = c => qs.map(x => { const a = qmap(c)[x], b = qmap(c)[qShift(x, -4)]; return a && b ? +pct(a.wholesale, b.wholesale).toFixed(1) : null; });
  const yoyO = base(k, {legend: legend(k), tooltip: tt(k, {valueFormatter: v => v == null ? '—' : sgn(v, 1) + '%'}), xAxis: cAxis(k, cats), yAxis: vAxis(k, {axisLabel: {color: k.muted, fontSize: 11, formatter: '{value}%'}}),
    series: ['H', 'K'].map(c => line(CO[c], yoy(c), coColor(c, k), {markLine: {silent: true, symbol: 'none', lineStyle: {color: k.axis, type: 'solid', width: 1}, label: {show: false}, data: [{yAxis: 0}]}}))});
  const xevO = base(k, {legend: legend(k), tooltip: tt(k, {valueFormatter: v => v == null ? '—' : v + '%'}), xAxis: cAxis(k, cats), yAxis: vAxis(k, {axisLabel: {color: k.muted, fontSize: 11, formatter: '{value}%'}}),
    series: ['H', 'K'].map(c => line(CO[c], qs.map(x => (qmap(c)[x] || {}).xev ?? null), coColor(c, k)))});
  const pt = c => base(k, {legend: legend(k), tooltip: tt(k, {valueFormatter: v => v == null ? '—' : v + '%'}), xAxis: cAxis(k, cats), yAxis: vAxis(k, {axisLabel: {color: k.muted, fontSize: 11, formatter: '{value}%'}}),
    series: [['hev', '하이브리드', k.s[2]], ['bev', '전기차', k.s[3]]].map(([key, name, col]) => bar(name, qs.map(x => (qmap(c)[x] || {})[key] ?? null), col, {stack: 'p', itemStyle: {color: col, borderColor: k.surface, borderWidth: 1, borderRadius: 0}}))});
  return `<div class="ir-grid">
    ${card({title: '도매 판매(출고)', sub: '천 대 · 분기별', opt: wsO, h: 280})}
    ${card({title: '도매 판매 전년 대비 증감률', sub: '0선 아래 = 전년보다 적게 출고', opt: yoyO, h: 280})}
    ${card({title: '친환경차 비중', sub: '현대 = 도매 기준(EV·HEV·PHEV·FCEV), 기아 = 소매 기준(HEV·PHEV·BEV) — 기준이 달라 수준 비교보다 추세를 보세요', opt: xevO, h: 280, wide: true})}
    ${card({title: '현대차 하이브리드·전기차 비중', sub: '도매 기준', opt: pt('H'), h: 260})}
    ${card({title: '기아 하이브리드·전기차 비중', sub: '소매 기준', opt: pt('K'), h: 260})}
    ${card({title: '판매·전동화 표', wide: true, table: {cols: ['회사', '분기', '도매(천 대)', '전년比', '친환경 비중', '하이브리드', '전기차'], num: [false, false, true, true, true, true, true],
      rows: ['H', 'K'].flatMap(c => D.quarters[c].map(x => { const y = qmap(c)[qShift(x.q, -4)]; return [CO[c], qLabel(x.q), fmt(x.wholesale), y ? sgn(pct(x.wholesale, y.wholesale), 1) + '%' : '—', fmt(x.xev, 1) + '%', fmt(x.hev, 1) + '%', fmt(x.bev, 1) + '%']; }))}})}
  </div>`;
}
function ytd(c, year){
  const xs = (D.quarters[c] || []).filter(x => x.q.startsWith(String(year)));
  const s = k => xs.reduce((a, x) => a + (x[k] || 0), 0);
  return {n: xs.length, rev: s('rev'), op: s('op'), ws: s('wholesale'), opm: s('rev') ? s('op') / s('rev') * 100 : null, last: xs.length ? xs[xs.length - 1].q : null};
}
function bulletRow(label, actual, plan, show, unit, note, mark){
  const p = plan ? Math.min(140, actual / plan * 100) : 0;
  return `<div class="bul"><div class="bul-l">${esc(label)}<span class="ir-sub">${esc(note || '')}</span></div>
    <div class="bul-bar" role="img" aria-label="${esc(label)} 계획 대비 ${fmt(p, 1)}%"><i style="width:${Math.min(100, p)}%"></i><span class="bul-mark" style="left:${mark}"></span></div>
    <div class="bul-v"><b>${fmt(p, 1)}%</b><span class="ir-sub">${esc(show[0])} / ${esc(show[1])}${esc(unit)}</span></div></div>`;
}
function guideCards(k, compact){
  const g = (D.guidance || {})['2026'] || {}; const year = 2026;
  const blocks = ['H', 'K'].map(c => {
    const gg = g[c]; if (!gg) return '';
    const y = ytd(c, year); const frac = y.n / 4;
    const mark = (frac * 100) + '%';
    const rows = [];
    rows.push(bulletRow('도매 판매', y.ws, gg.wholesale, [fmt(y.ws), fmt(gg.wholesale)], '천 대', `계획 ${fmt(gg.wholesale)}천 대 (전년 ${fmt(gg.wholesale_prev)})`, mark));
    if (gg.rev) rows.push(bulletRow('매출', y.rev / 1000, gg.rev, [fmt(y.rev / 1000, 1), fmt(gg.rev, 1)], '조원', `계획 ${fmt(gg.rev, 1)}조원`, mark));
    if (gg.op) rows.push(bulletRow('영업이익', y.op / 1000, gg.op, [fmt(y.op / 1000, 2), fmt(gg.op, 1)], '조원', `계획 ${fmt(gg.op, 1)}조원`, mark));
    const inRange = y.opm != null && y.opm >= gg.opm_low - 0.05 && y.opm <= gg.opm_high + 0.05;
    const opmTxt = `<div class="irs-opm"><span>영업이익률 ${y.n}개 분기 누적 <b>${fmt(y.opm, 1)}%</b></span><span>가이던스 <b>${esc(gg.opm)}</b></span><span class="ir-delta ${inRange ? 'up' : 'down'}">${inRange ? '● 범위 안' : (y.opm < gg.opm_low ? '▼ 범위 아래' : '▲ 범위 위')}</span></div>`;
    return `<div class="irs-guide"><div class="irs-co-h"><h3><span class="irs-dot" style="background:var(--viz-${c === 'H' ? 1 : 2})"></span>${CO[c]} ${year} 계획 대비 ${y.n}개 분기 진척</h3><span class="ir-sub">${esc(gg.src)}</span></div>
      ${rows.join('')}${opmTxt}<p class="ir-note">세로선 = 연간 기준 경과 비율(${fmt(frac * 100)}%) — 막대가 선보다 짧으면 계획보다 느림</p></div>`;
  }).join('');
  return card({title: `${year} 연간 가이던스 대비 진척`, sub: '회사가 연초에 발표한 계획과 지금까지의 실적', more: compact ? 'guide' : null, wide: true, html: `<div class="irs-guides">${blocks}</div>`});
}
function vGuide(k){
  const t = (D.targets || {}).K || {}, th = (D.targets || {}).H || {};
  const k25 = ytd('K', 2025);
  const cagr = (a, b, n) => (Math.pow(b / a, 1 / n) - 1) * 100;
  const path = t.sales ? base(k, {legend: legend(k), tooltip: tt(k, {valueFormatter: v => v == null ? '—' : fmt(v) + '천 대'}),
    xAxis: cAxis(k, ['2025', '2026', '2027', '2028', '2029', '2030']),
    yAxis: vAxis(k, {min: v => Math.floor(v.min * 0.9 / 100) * 100}),
    series: [line('목표 경로(연평균 ' + fmt(cagr(t.sales_base, t.sales, 5), 1) + '%)', [0, 1, 2, 3, 4, 5].map(i => Math.round(t.sales_base * Math.pow(t.sales / t.sales_base, i / 5))), k.prev, {symbolSize: 6}),
      line('기아 2026 계획(도매)', [null, ((D.guidance || {})['2026'] || {}).K ? D.guidance['2026'].K.wholesale : null, null, null, null, null], k.s[1], {symbolSize: 10})]}) : null;
  return `${guideCards(k, false)}
    <div class="ir-grid">
    ${t.sales ? card({title: `기아 ${t.year} 중장기 목표`, sub: `${esc(t.src)}`, opt: path, h: 280,
      html: `<div class="irs-big2"><div><span class="ir-sub">판매</span><b>${fmt(t.sales_base / 10, 0)}만 → ${fmt(t.sales / 10, 0)}만 대</b><span class="ir-sub">연평균 ${fmt(cagr(t.sales_base, t.sales, 5), 1)}% 성장 필요 · M/S ${esc(t.share)}</span></div>
        <div><span class="ir-sub">영업이익</span><b>${fmt(k25.op / 1000, 1)}조 → ${fmt(t.op)}조</b><span class="ir-sub">2025 실적 대비 연평균 ${fmt(cagr(k25.op / 1000, t.op, 5), 1)}% · 이익률 ${esc(t.opm)}</span></div></div>`}) : ''}
    ${card({title: '현대차 중장기 목표', html: `<p class="ir-note">${esc(th.note || '')}</p><p><a class="btn" href="${esc(th.url || '#')}" target="_blank" rel="noopener noreferrer">CEO Investor Day 자료 열기 ↗</a></p>
      <p class="ir-note">현대차 2026 가이던스: 도매 ${fmt(((D.guidance['2026'] || {}).H || {}).wholesale)}천 대, 매출 성장 ${esc(((D.guidance['2026'] || {}).H || {}).rev_growth || '')}, 영업이익률 ${esc(((D.guidance['2026'] || {}).H || {}).opm || '')}, 투자 ${esc(((D.guidance['2026'] || {}).H || {}).capex || '')}</p>`})}
    </div>`;
}
function upcomingEvents(){
  const today = new Date().toISOString().slice(0, 10);
  const up = (D.events || []).filter(e => e.upcoming || (e.start && e.start >= today));
  const res = (D.upcoming_results || []).map(x => ({c: x.c, start: '', title: `${qLabel(x.q)} 실적발표 (예정, 날짜 미공개)`}));
  return [...res, ...up];
}
function vEvents(k){
  const tags = ['', '생산', '실적', '투자', '주주환원', 'IR', '기타'];
  const dis = (D.disclosures || []).filter(d => !st.tag || d.tag === st.tag);
  const ev = (D.events || []).slice(0, 30);
  return `<div class="ir-grid">
    ${card({title: '다가오는 일정', html: `<ul class="irs-list">${upcomingEvents().map(e => `<li><span class="mono">${esc(e.start || '미정')}</span> <b>${CO[e.c]}</b> ${esc(e.title)}</li>`).join('') || '<li class="ir-sub">예정된 일정 없음</li>'}</ul>`})}
    ${card({title: '공시를 보는 법', html: `<ul class="ir-how"><li><b>생산</b>: 생산 중단·재개 — 파업·셧다운 신호, 납품 일정에 직결</li><li><b>실적</b>: 매월 1일 영업(잠정)실적 — 전월 판매 대수</li><li><b>투자</b>: 공장·지분 투자 — 신규 거점·물량 이동</li><li>기아는 IR 사이트에 공시 목록이 없어 <a href="https://dart.fss.or.kr/" target="_blank" rel="noopener noreferrer">금감원 DART</a>에서 '기아' 검색</li></ul>`})}
    ${card({title: '현대차 공시', sub: '금감원 DART 원문으로 연결 · 최근 60건', wide: true,
      html: `<div class="ir-toolbar"><div class="seg">${tags.map(t => `<button type="button" data-irs-tag="${t}" aria-pressed="${st.tag === t}">${t || '전체'}</button>`).join('')}</div></div>
        <ul class="irs-list cols">${dis.map(d => `<li><span class="mono">${esc(d.date)}</span> <span class="tagx t-${esc(d.tag)}">${esc(d.tag)}</span> <a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a></li>`).join('') || '<li class="ir-sub">해당 공시 없음</li>'}</ul>`})}
    ${card({title: 'IR 활동 (컨퍼런스·해외 설명회·실적발표)', sub: '기아는 행사별 투자자 발표자료 PDF 포함', wide: true,
      html: `<ul class="irs-list cols">${ev.map(e => `<li><span class="mono">${esc(e.start || '')}</span> <b>${CO[e.c]}</b> ${esc(e.title)}${e.place ? ` <span class="ir-sub">${esc(e.place)}</span>` : ''}${e.file ? ` <a href="${esc(e.file.url)}" target="_blank" rel="noopener noreferrer">발표자료 PDF ↗</a>` : ''}</li>`).join('')}</ul>`})}
  </div>`;
}
function vDocs(k){
  const qs = Array.from(new Set([...D.quarters.H.map(x => x.q), ...D.quarters.K.map(x => x.q)])).sort().reverse();
  const link = (u, t) => u ? {html: `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`} : '—';
  const rows = qs.map(q => { const h = qmap('H')[q] || {}, kk = qmap('K')[q] || {}; return [qLabel(q), link(h.deck, '현대 실적발표'), link(h.webcast, '현대 웹캐스트'), link(kk.deck, '기아 실적발표'), {html: srcTag(h).html + ' / ' + srcTag(kk).html}]; });
  const gu = Object.entries(D.guidance_urls || {}).map(([key, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(key.replace('H:', '현대차 ').replace('guidance-', '') + '년 연간 가이던스')} ↗</a></li>`).join('');
  const rep = (D.reports || []).filter(r => !r.guess).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8).map(r => `<li><span class="mono">${esc(r.date || '')}</span> ${CO[r.c]} <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a></li>`).join('');
  const mon = (D.monthly || []).map(m => `<li>${CO[m.c]} <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.title)} ↗</a></li>`).join('');
  return `<div class="ir-grid">
    ${card({title: '분기 실적발표 원문', sub: '영문 발표자료 · 자동 추출이 안 된 분기는 페이지 그림을 확인해 입력(출처 열 표시)', wide: true, table: {cols: ['분기', '현대차', '현대차 녹화', '기아', '데이터 출처(현대/기아)'], num: [false, false, false, false, false], rows}})}
    ${card({title: '가이던스·보고서', html: `<ul class="irs-list">${gu}${rep}</ul>`})}
    ${card({title: '월별 판매 엑셀 (현대기아 판매 현황 탭 원본)', html: `<ul class="irs-list">${mon}</ul>`})}
    ${card({title: '데이터를 만드는 방식', wide: true, html: `<ul class="ir-how">
      <li>매주 자동 업데이트 때 두 IR 사이트에서 새 실적발표·엑셀·공시·일정을 받아옵니다(<span class="mono">tools/irsite/fetch.js</span>).</li>
      <li>실적발표 PDF에서 매출·영업이익·원가·도매·친환경 비중을 자동으로 읽고, 다음 해 자료에 실린 '전년 같은 분기' 값과 대조해 어긋나면 경고합니다(<span class="mono">tools/irsite/build.py</span>).</li>
      <li>영업이익 증감 요인처럼 그림으로만 있는 값은 페이지를 그림으로 확인해 입력하고, '시작값 + 요인 합계 = 끝값'으로 검산합니다(<span class="mono">data/irsite/manual.json</span>).</li>
      <li>기아 2024년 3분기~2025년 3분기 실적발표는 글자가 없는 이미지형이라, 해당 분기는 그림 확인 또는 다음 해 자료의 전년 값으로 채웠습니다.</li></ul>`})}
  </div>`;
}

/* ---------- 렌더·이벤트 ---------- */
const VIEWS = {summary: vSummary, profit: vProfit, bridge: vBridge, sales: vSales, guide: vGuide, events: vEvents, docs: vDocs};
function render(){
  if (!root || !D) return;
  const k = C(); pending = [];
  root.innerHTML = head() + `<div class="ir-body">${(VIEWS[view] || vSummary)(k)}</div>`;
  draw();
}
function rerender(top){ const y = window.scrollY; render(); window.scrollTo(0, top ? 0 : y); }
function go(sub){ const b = document.querySelector(`#subnav button[data-sub="${sub}"]`); if (b) b.click(); else { view = sub; rerender(true); } }
function onClick(e){
  const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
  const d = b.dataset;
  if (d.irsGo){ go(d.irsGo); return; }
  if (d.irsCo){ st.co = d.irsCo; }
  else if (d.irsQ){ st.q = d.irsQ; }
  else if (d.irsTag != null){ st.tag = d.irsTag; }
  else if (d.irsAct === 'latest'){ st.q = latestQ(); }
  else if (d.irsAct === 'table'){
    const t = document.getElementById(d.irsFor + '-t'), ch = document.getElementById(d.irsFor);
    const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); b.textContent = on ? '그래프 보기' : '표 보기';
    if (t) t.hidden = !on; if (ch) ch.hidden = on; return;
  }
  else if (d.irsAct === 'csv'){ csv(document.getElementById(d.irsFor + '-t')); return; }
  else return;
  save(); rerender();
}
function onChange(e){ if (e.target.dataset.irsSet === 'q'){ st.q = e.target.value; save(); rerender(); } }
function csv(box){
  if (!box) return;
  const rows = [...box.querySelectorAll('tr')].map(tr => [...tr.children].map(td => { const v = td.textContent.trim(); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(','));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], {type: 'text/csv;charset=utf-8'}));
  a.download = (box.dataset.csv || 'IR경영실적').replace(/[\\/:*?"<>|\s]+/g, '_') + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => charts.forEach(ch => { try{ ch.resize(); }catch(e){} }), 150); });
try{ window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (root && document.body.contains(root)) render(); }); }catch(e){}

window.IRS = {
  mount(el, sub){
    root = el; view = VIEWS[sub] ? sub : 'summary';
    root.addEventListener('click', onClick); root.addEventListener('change', onChange);
    if (!D) root.innerHTML = '<div class="empty">IR 실적 자료를 불러오는 중…</div>';
    load().then(() => { if (root === el) render(); }).catch(err => { el.innerHTML = `<div class="notice">IR 실적 자료를 불러오지 못했습니다 (${esc(err.message)}).</div>`; loading = null; });
  },
  latest(){ return load().then(() => { const q = latestQ(); return {q, label: qLabel(q), H: metrics('H', q), K: metrics('K', q)}; }); },
};
})();
