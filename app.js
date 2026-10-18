/* 광진 주간 동향 대시보드 — 뉴스·이슈·브리핑 화면. IR 탭은 ir.js·irsite.js, 데이터는 data/*.json(읽기 전용). */
(function(){
"use strict";
const TABS = {
  brief:{name:'주간 브리핑', lede:'월요일 회의용 요약 — 이어지는 이슈, 세 영역의 핵심, IR 최신 숫자를 한 화면에서.'},
  oem:{name:'완성차 동향', lede:'현대차·기아 글로벌(해외공장 포함) + GM그룹(한국GM 포함) 동향, 폭스바겐그룹·스텔란티스·르노(르노코리아 포함)의 주요 동향과 신기술.',
       cats:['신차/생산','판매/실적','전략/투자','신기술','구매/공급망','정책/통상','노사']},
  competitor:{name:'도어모듈 경쟁사', lede:'PHA · 대동하이렉스 · 하이렉스 · 브로제 · 인테바의 동향, 신기술, 해외사업 현황.',
       cats:['동향','신기술','해외사업'], subs:[['news','주간 뉴스'],['background','배경 자료'],['profiles','경쟁사 프로필'],['matrix','차종별 공급사']]},
  industry:{name:'국내 부품업계', lede:'현대/기아 1차~2차 벤더의 M&A, 신사업 진출, 공장·투자, 실적 동향.',
       cats:['M&A','신사업','공장/투자','실적/재무','정책/지원','기타'], subs:[['news','주간 뉴스'],['directory','업체 현황']]},
  issues:{name:'이슈 추적', lede:'주차를 넘어 이어지는 사안을 한 줄기로 — 첫 보도부터 최신 보도까지, 그리고 광진에 미치는 영향.'},
  ir:{name:'현대기아 판매 현황', lede:'현대차·기아 IR 월별 판매 실적(2025~2026)을 회사·기간·기준을 바꿔가며 비교합니다. 모든 그래프는 표로 볼 수 있고 CSV·이미지로 저장할 수 있습니다.',
       subs:[['overview','요약'],['explore','자유 분석'],['global','국내·해외 생산'],['export','수출 지역'],['momentum','뜨는 차·지는 차'],['monthly','월별 변동'],['door','도어모듈 물량']]},
  irs:{name:'IR 경영 실적', lede:'현대차·기아 IR 사이트의 분기 실적발표·가이던스·공시·IR 일정 — 고객사의 수익성·원가 압박·물량·전동화 흐름을 협력사 관점에서 봅니다.',
       subs:[['summary','한눈에'],['profit','수익성·원가'],['bridge','영업이익 요인'],['sales','판매·전동화'],['guide','가이던스·목표'],['events','공시·일정'],['docs','원문 자료']]},
};
const TAB_ORDER = ['brief','oem','competitor','industry','issues','ir','irs'];
const NEWS_TABS = ['oem','competitor','industry'];
const IMP_RANK = {'상':0,'중':1,'하':2};
const TAG_KINDS = [['models','차종'],['projects','프로젝트'],['regions','지역']];
const STATUS_CLASS = s => (s || '').startsWith('진행') ? '진행' : (s || '').startsWith('확정') ? '확정' : (s || '').startsWith('종료') ? '종료' : '관찰';

const S = {
  dbState:'loading',
  weeks:[], week:null, tab:'brief', sub:{competitor:'news', industry:'news', ir:'overview', irs:'summary'},
  news:[], background:[], competitors:[], supply:[], suppliers:[], issues:[],
  f:{q:'', cat:null, company:null, imp:null, tags:new Set(), issue:null}, allWeeks:false,
  mx:{oem:null, status:null, supplier:null}, dir:{tier:null},
  issue:null, q:'', irParams:null,
  expandAll:false, openIds:new Set(),
};
let ALL_NEWS = [];
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^https?:\/\//i.test(String(u||'')) ? String(u) : '';
const arr = v => Array.isArray(v) ? v : [];
const store = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };
const freshFilters = () => ({q:'',cat:null,company:null,imp:null,tags:new Set(),issue:null});

/* ---------- 날짜 ---------- */
function toDate(s){ return new Date(s + 'T00:00:00Z'); }
function ymd(d){ return d.toISOString().slice(0,10); }
function addDays(s,n){ const d = toDate(s); d.setUTCDate(d.getUTCDate()+n); return ymd(d); }
function mondayOf(s){ const d = toDate(s); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate()-(day-1)); return ymd(d); }
function todayStr(){ const n = new Date(); return ymd(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))); }
const md = s => s ? s.slice(5).replace('-','.') : '';
// 주차는 업데이트한 날(그 주가 끝난 다음 월요일)로 부른다 — 예: 10/5~10/11 기사 → '10월 12일'
const updDay = w => addDays(w,7);
function weekLabel(w){ const d = updDay(w); return `${+d.slice(5,7)}월 ${+d.slice(8,10)}일`; }
const wShort = w => md(updDay(w));

/* ---------- 데이터 ---------- */
const weekIds = () => S.weeks.map(w => w.id).sort().reverse();
const weekDoc = (id = S.week) => S.weeks.find(w => w.id === id) || null;
const prevWeekId = () => { const ids = weekIds(); const i = ids.indexOf(S.week); return i >= 0 && i < ids.length-1 ? ids[i+1] : null; };
function tabNews(tab, all = S.allWeeks){ return (all ? ALL_NEWS.filter(n => n.week !== 'background') : S.news).filter(n => n.tab === tab); }
function sortNews(list){ return list.slice().sort((a,b) => (IMP_RANK[a.importance]??3) - (IMP_RANK[b.importance]??3) || String(b.date).localeCompare(String(a.date))); }
const hay = n => [n.title,n.summary,n.company,n.source,n.meeting_point,...arr(n.details),...TAG_KINDS.flatMap(([k]) => arr(n.tags?.[k])),...arr(n.issues).map(issueTitle)].join(' ').toLowerCase();
function applyFilters(list){
  const f = S.f, q = f.q.trim().toLowerCase();
  return list.filter(n => {
    if (f.cat && n.category !== f.cat) return false;
    if (f.company && n.company !== f.company) return false;
    if (f.imp && n.importance !== f.imp) return false;
    if (f.issue && !arr(n.issues).includes(f.issue)) return false;
    for (const t of f.tags){ const [k,v] = t.split('::'); if (!arr(n.tags?.[k]).includes(v)) return false; }
    if (q && !hay(n).includes(q)) return false;
    return true;
  });
}
function countBy(list, fn){ const m = new Map(); list.forEach(x => { const ks = fn(x); for (const k of (Array.isArray(ks) ? ks : [ks])) if (k) m.set(k,(m.get(k)||0)+1); }); return m; }
const issueOf = id => S.issues.find(i => i.id === id) || null;
const issueTitle = id => (issueOf(id) || {}).title || id;
const issueNews = id => ALL_NEWS.filter(n => n.week !== 'background' && arr(n.issues).includes(id));
function issueStats(id){
  const list = issueNews(id), ids = weekIds().slice().reverse();
  const perWeek = ids.map(w => list.filter(n => n.week === w).length);
  const weeksWith = ids.filter((w, i) => perWeek[i]);
  return {list, ids, perWeek, total: list.length, first: weeksWith[0] || null, last: weeksWith[weeksWith.length-1] || null, thisWeek: list.filter(n => n.week === S.week).length, prevWeek: list.filter(n => n.week === prevWeekId()).length};
}
const sparkHtml = (perWeek, ids, cur) => { const max = Math.max(1, ...perWeek); return `<span class="spark" aria-hidden="true">${perWeek.map((v, i) => `<i style="height:${Math.max(2, v/max*22)}px"${ids[i]===cur?' class="cur"':''}></i>`).join('')}</span>`; };

/* ---------- 라우팅 (#tab/sub?week=…&issue=…) ---------- */
function readHash(){
  const h = (location.hash || '').slice(1); if (!h) return;
  const [pathPart, qs] = h.split('?'); const [tab, sub] = pathPart.split('/');
  const p = new URLSearchParams(qs || '');
  if (TABS[tab]) S.tab = tab;
  if (tab === 'issues' && sub) S.issue = sub;
  else if (sub && TABS[tab]?.subs?.some(([k]) => k === sub)) S.sub[tab] = sub;
  if (p.get('week')) S.week = p.get('week');
  if (p.get('all') === '1') S.allWeeks = true;
  if (p.get('q')) S.q = p.get('q');
  if (tab === 'ir'){ const o = {}; for (const k of ['ds','by','pick']) if (p.get(k)) o[k] = p.get(k); if (Object.keys(o).length) S.irParams = o; }
}
function writeHash(){
  let h = S.tab;
  if (S.tab === 'issues' && S.issue) h += '/' + S.issue;
  else if (TABS[S.tab].subs) h += '/' + S.sub[S.tab];
  const p = new URLSearchParams();
  if (S.week && S.week !== weekIds()[0] && S.tab !== 'ir' && S.tab !== 'irs' && S.tab !== 'issues') p.set('week', S.week);
  if (S.allWeeks && NEWS_TABS.includes(S.tab)) p.set('all', '1');
  if (S.q) p.set('q', S.q);
  const qs = p.toString();
  const next = '#' + h + (qs ? '?' + qs : '');
  if (location.hash !== next) history.replaceState(null, '', next);
}

/* ---------- 렌더 ---------- */
function render(){ renderRail(); renderHead(); renderSubnav(); renderFilters(); renderContent(); writeHash(); }
function renderRail(){
  const sel = $('#wkSel'), ids = weekIds();
  sel.innerHTML = ids.length ? ids.map(id => `<option value="${esc(id)}"${id===S.week?' selected':''}>${esc(weekLabel(id))}</option>`).join('') : '<option>—</option>';
  const i = ids.indexOf(S.week);
  $('#wkPrev').disabled = i < 0 || i >= ids.length-1;
  $('#wkNext').disabled = i <= 0;
  $('#wkRange').textContent = S.week ? `${updDay(S.week).slice(0,4)}년 ${weekLabel(S.week)} 업데이트` : '';
  const strip = ids.slice().reverse().slice(-10);
  const counts = strip.map(w => ALL_NEWS.filter(n => n.week === w).length), max = Math.max(1, ...counts);
  $('#wkStrip').innerHTML = strip.map((w, k) => `<button type="button" data-week="${esc(w)}" aria-current="${w===S.week}" title="${esc(weekLabel(w))} · ${counts[k]}건" style="height:${Math.max(4, counts[k]/max*26)}px"></button>`).join('');
  $('#wkBlock').hidden = S.tab === 'ir' || S.tab === 'irs' || S.tab === 'issues';
  const prev = prevWeekId();
  $('#tabs').innerHTML = TAB_ORDER.map(t => {
    let c = '';
    if (t === 'brief') c = S.news.length; else if (NEWS_TABS.includes(t)) c = tabNews(t, false).length;
    else if (t === 'issues') c = S.issues.filter(i => issueNews(i.id).some(n => n.week === S.week)).length;
    const isNew = t === 'issues' && S.issues.some(i => { const st = issueStats(i.id); return st.first === S.week && st.thisWeek; });
    return `<button class="tab" role="tab" type="button" data-tab="${t}" aria-selected="${S.tab===t}"><span>${esc(TABS[t].name)}</span><span class="count">${S.dbState==='ok'?c:''}${isNew ? ' <span class="new">NEW</span>' : ''}</span></button>`;
  }).join('');
  const st = $('#dbStatus');
  st.innerHTML = S.dbState === 'ok' ? `<span class="dot ok"></span>${S.weeks.length}개 주차 · 뉴스 ${ALL_NEWS.filter(n => n.week !== 'background').length}건 · 이슈 ${S.issues.length}개`
    : S.dbState === 'none' ? '<span class="dot bad"></span>데이터를 불러오지 못함' : '<span class="dot"></span>불러오는 중…';
  const wd = weekDoc();
  $('#lastUpd').textContent = wd?.updated_at ? `이 주차 업데이트: ${String(wd.updated_at).slice(0,10)}` : '';
  $('#expandAll').checked = S.expandAll;
  void prev;
}
function renderHead(){
  const t = TABS[S.tab];
  $('#eyebrow').textContent = S.tab === 'ir' ? '현대차·기아 IR 월별 판매 실적' : S.tab === 'irs' ? '현대차·기아 IR 분기 실적발표 · 연결 기준' : S.tab === 'issues' ? `${S.weeks.length}개 주차 · ${ALL_NEWS.filter(n => n.week !== 'background').length}건의 기사에서 추린 ${S.issues.length}개 이슈` : S.week ? weekLabel(S.week) : '';
  $('#title').textContent = t.name;
  $('#lede').textContent = t.lede;
  $('#gq').value = S.q;
}
function renderSubnav(){
  const t = TABS[S.tab];
  $('#subnav').innerHTML = t.subs && !S.q ? `<div class="seg" role="group" aria-label="보기 선택">${t.subs.map(([k,l]) => `<button type="button" data-sub="${k}" aria-pressed="${S.sub[S.tab]===k}">${esc(l)}</button>`).join('')}</div>` : '';
}
function chipRow(label, map, key, cur){
  if (!map.size) return '';
  const items = [...map.entries()].sort((a,b) => b[1]-a[1]);
  return `<div class="frow"><span class="flabel">${esc(label)}</span>${items.map(([v,n]) => `<button type="button" class="chip" data-f="${key}" data-v="${esc(v)}" aria-pressed="${cur===v}">${esc(key==='issue'?issueTitle(v):v)}<span class="n">${n}</span></button>`).join('')}</div>`;
}
function renderFilters(){
  const el = $('#filters'), sub = S.sub[S.tab];
  if (!NEWS_TABS.includes(S.tab) || S.q || S.dbState !== 'ok' || (sub && sub !== 'news' && sub !== 'background')){ el.innerHTML = ''; return; }
  const list = sub === 'background' ? S.background : tabNews(S.tab);
  const catMap = new Map(TABS[S.tab].cats.map(c => [c,0])); list.forEach(n => catMap.set(n.category,(catMap.get(n.category)||0)+1));
  [...catMap].forEach(([k,v]) => { if (!v) catMap.delete(k); });
  const tagMap = new Map();
  list.forEach(n => TAG_KINDS.forEach(([k]) => arr(n.tags?.[k]).forEach(v => { const key = `${k}::${v}`; tagMap.set(key,(tagMap.get(key)||0)+1); })));
  const tagsHtml = [...tagMap.entries()].sort((a,b) => b[1]-a[1]).slice(0,40).map(([key,n]) => {
    const [k,v] = key.split('::'); const l = TAG_KINDS.find(x => x[0]===k)[1];
    return `<button type="button" class="tagchip" data-tag="${esc(key)}" aria-pressed="${S.f.tags.has(key)}"><b>${esc(l)}</b>${esc(v)} <span class="mono" style="opacity:.6">${n}</span></button>`;
  }).join('');
  const active = S.f.q || S.f.cat || S.f.company || S.f.imp || S.f.issue || S.f.tags.size;
  el.innerHTML = `<div class="filters">
    <div class="frow"><input class="search" id="q" type="search" placeholder="${sub === 'background' ? '배경 자료 검색' : S.allWeeks ? '전체 기간에서 검색' : '이 주차에서 검색 (전체 기간은 오른쪽 위 검색창)'}" value="${esc(S.f.q)}" aria-label="검색">
      ${sub !== 'background' ? `<button type="button" class="chip toggle" data-act="all-weeks" aria-pressed="${S.allWeeks}">${S.allWeeks ? '전체 기간 보는 중' : '전체 기간 보기'}<span class="n">${tabNews(S.tab, true).length}</span></button>` : ''}
      ${active ? `<button type="button" class="linkbtn" data-act="clear-filters">필터 초기화</button>` : ''}</div>
    ${chipRow('분류', catMap, 'cat', S.f.cat)}
    ${chipRow('회사', countBy(list, n => n.company), 'company', S.f.company)}
    ${chipRow('이슈', countBy(list, n => arr(n.issues)), 'issue', S.f.issue)}
    ${chipRow('중요도', new Map(['상','중','하'].map(k => [k, list.filter(n => n.importance===k).length]).filter(x => x[1])), 'imp', S.f.imp)}
    ${tagsHtml ? `<div class="frow"><span class="flabel">태그</span>${tagsHtml}</div>` : ''}
  </div>`;
}
function tagButtons(n){
  return TAG_KINDS.flatMap(([k,l]) => arr(n.tags?.[k]).map(v => {
    const key = `${k}::${v}`;
    if (k === 'models') return `<button type="button" class="tagchip irlink" data-ir-model="${esc(v)}" title="현대기아 판매 현황에서 ${esc(v)} 보기"><b>${esc(l)}</b>${esc(v)}</button>`;
    return `<button type="button" class="tagchip" data-tag="${esc(key)}" aria-pressed="${S.f.tags.has(key)}"><b>${esc(l)}</b>${esc(v)}</button>`;
  })).join('');
}
function newsCard(n, opt = {}){
  const url = safeUrl(n.url), open = S.expandAll || S.openIds.has(n.id), details = arr(n.details);
  const issues = arr(n.issues).map(id => `<button type="button" class="issue-chip" data-issue="${esc(id)}">${esc(issueTitle(id))}</button>`).join('');
  return `<article class="news imp-${esc(n.importance)}" id="n-${esc(n.id)}" data-id="${esc(n.id)}">
    <div class="news-side"><div class="news-date mono">${esc(md(n.date))}</div><span class="imp ${esc(n.importance)}">${esc(n.importance||'—')}</span></div>
    <div class="news-body">
      <div class="meta"><span class="co">${esc(n.company)}</span><span class="cat">${esc(n.category)}</span><span>${esc(n.source)}</span>${opt.showTab ? `<span class="cat">${esc(TABS[n.tab]?.name||'')}</span>` : ''}</div>
      <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}<span class="ext" aria-hidden="true">↗</span></a>` : esc(n.title)}</h3>
      ${n.summary ? `<p class="sum">${esc(n.summary)}</p>` : ''}
      ${n.meeting_point ? `<div class="mp"><b>회의 포인트</b>${esc(n.meeting_point)}</div>` : ''}
      ${details.length ? `<details class="det" data-id="${esc(n.id)}"${open?' open':''}><summary>상세 ${details.length}건</summary><ul>${details.map(d => `<li>${esc(d)}</li>`).join('')}</ul></details>` : ''}
      <div class="tags">${issues}${tagButtons(n)}</div>
    </div>
  </article>`;
}
function stateBlock(){
  if (S.dbState === 'loading') return '<div class="empty">데이터를 불러오는 중…</div>';
  if (S.dbState === 'none') return '<div class="notice">데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</div>';
  return '';
}
function renderContent(){
  const el = $('#content');
  if (S.tab === 'ir'){
    el.innerHTML = '<div class="ir"></div>';
    if (window.IR) window.IR.mount(el.firstChild, S.sub.ir, S.irParams); else el.innerHTML = '<div class="notice">분석 화면을 불러오지 못했습니다. 새로고침해 주세요.</div>';
    S.irParams = null; return;
  }
  if (S.tab === 'irs'){
    el.innerHTML = '<div class="ir irs"></div>';
    if (window.IRS) window.IRS.mount(el.firstChild, S.sub.irs); else el.innerHTML = '<div class="notice">IR 경영 실적 화면을 불러오지 못했습니다. 새로고침해 주세요.</div>';
    return;
  }
  const sb = stateBlock(); if (sb){ el.innerHTML = sb; return; }
  if (S.q) el.innerHTML = renderSearch();
  else if (S.tab === 'brief') el.innerHTML = renderBrief();
  else if (S.tab === 'issues') el.innerHTML = renderIssues();
  else {
    const sub = S.sub[S.tab] || 'news';
    if (sub === 'profiles') el.innerHTML = renderProfiles();
    else if (sub === 'matrix') el.innerHTML = renderMatrix();
    else if (sub === 'directory') el.innerHTML = renderDirectory();
    else if (sub === 'background') el.innerHTML = renderBackground();
    else el.innerHTML = renderNews();
  }
}
function groupedByWeek(items, opt){
  const weeks = [...new Set(items.map(n => n.week))].sort().reverse();
  return weeks.map(w => `<div class="week-h"><b>${esc(weekLabel(w))}</b><span>${items.filter(n => n.week === w).length}건</span></div><div class="list">${sortNews(items.filter(n => n.week === w)).map(n => newsCard(n, opt)).join('')}</div>`).join('');
}
function renderNews(){
  const base = tabNews(S.tab), items = applyFilters(base);
  if (!items.length) return `<div class="empty">${base.length ? '조건에 맞는 항목이 없습니다. 필터를 초기화해 보세요.' : S.allWeeks ? '등록된 항목이 없습니다.' : '이 주차에 등록된 항목이 없습니다. <button type="button" class="linkbtn" data-act="all-weeks">전체 기간 보기</button>'}</div>`;
  return S.allWeeks ? groupedByWeek(items) : `<div class="list">${sortNews(items).map(n => newsCard(n)).join('')}</div>`;
}
function renderBackground(){
  const bg = applyFilters(S.background).sort((a,b) => String(b.date).localeCompare(String(a.date)));
  return `<div class="section-h"><h2>배경 자료</h2><span class="sub">주차와 무관하게 참고할 경쟁사 주요 이슈 (최근 1년) · ${bg.length}건</span></div>
    ${bg.length ? `<div class="list">${bg.map(n => newsCard(n)).join('')}</div>` : `<div class="empty">${S.background.length ? '조건에 맞는 배경 자료가 없습니다.' : '등록된 배경 자료가 없습니다.'}</div>`}`;
}

/* ---------- 전체 검색 ---------- */
function highlight(text, q){ const t = esc(text); if (!q) return t; const i = t.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? t : t.slice(0,i) + '<mark>' + t.slice(i, i+q.length) + '</mark>' + t.slice(i+q.length); }
function renderSearch(){
  const q = S.q.trim().toLowerCase();
  const hits = ALL_NEWS.filter(n => hay(n).includes(q)).sort((a,b) => String(b.week).localeCompare(String(a.week)) || String(b.date).localeCompare(String(a.date)));
  const issues = S.issues.filter(i => (i.title + ' ' + i.summary + ' ' + i.kj_impact).toLowerCase().includes(q));
  return `<div class="section-h"><h2>"${esc(S.q)}" 검색 결과</h2><span class="sub">기사 ${hits.length}건 · 이슈 ${issues.length}개 · 전체 기간 <button type="button" class="linkbtn" data-act="clear-q">검색 닫기</button></span></div>
    ${issues.length ? `<div class="issue-grid">${issues.map(i => issueCard(i, {compact:true})).join('')}</div>` : ''}
    <div class="sres">${hits.map(n => `<button type="button" class="hit" data-goto="${esc(n.id)}">
      <span class="w">${n.week === 'background' ? '배경' : esc(wShort(n.week))}<br><span style="color:var(--muted)">${esc(md(n.date))}</span></span>
      <span><b>${highlight(n.title, S.q)}</b><br><span class="s">${esc(n.company)} · ${esc(TABS[n.tab]?.name||'')} — ${highlight(n.summary || n.meeting_point || '', S.q)}</span></span></button>`).join('') || '<div class="empty">일치하는 기사가 없습니다.</div>'}</div>`;
}

/* ---------- 브리핑 ---------- */
function issueCard(i, opt = {}){
  const st = issueStats(i.id);
  const fresh = st.first === S.week;
  const newArts = sortNews(st.list.filter(n => n.week === S.week)).slice(0, 2);
  return `<button type="button" class="icard" data-issue="${esc(i.id)}">
    <div class="icard-h"><h3>${esc(i.title)}</h3><span class="status ${STATUS_CLASS(i.status)}">${esc(i.status)}</span></div>
    <div class="icard-m">${sparkHtml(st.perWeek, st.ids, S.week)}<span>${fresh ? '<span class="new-badge">NEW</span> ' : ''}이번 주 <b>${st.thisWeek}</b>건${st.prevWeek ? ` · 지난주 ${st.prevWeek}건` : ''} · 누적 <b>${st.total}</b>건</span><span>${st.first ? `${wShort(st.first)}부터` : ''}</span></div>
    ${opt.compact ? `<p>${esc(i.summary)}</p>` : newArts.length ? `<ul>${newArts.map(n => `<li>${esc(n.title)}</li>`).join('')}</ul>` : `<p>${esc(i.summary)}</p>`}
    ${!opt.compact && i.kj_impact ? `<p><b style="color:var(--accent);font-weight:600">광진 영향</b> ${esc(i.kj_impact)}</p>` : ''}
  </button>`;
}
function snapHtml(snap){
  if (!snap) return `<div class="snap"><div class="snap-h"><span>IR 최신 판매 숫자</span><a href="#ir/overview" data-tab="ir">자세히 →</a></div><div class="snap-t" style="grid-column:1/-1"><div class="snap-l">불러오는 중…</div></div></div>`;
  const d = (v, unit) => v == null ? '' : `<div class="snap-d ${v > 0.05 ? 'up' : v < -0.05 ? 'down' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : '■'} ${Math.abs(v).toFixed(1)}${unit} <span style="font-weight:400">전년 대비</span></div>`;
  const co = (k, label) => snap[k] ? `<div class="snap-t"><div class="snap-l">${label} ${snap[k].m}월 글로벌 판매</div><div class="snap-v">${Math.round(snap[k].sales/1000).toLocaleString()}<small>천 대</small></div>${d(snap[k].yoy, '%')}</div>` : '';
  return `<div class="snap"><div class="snap-h"><span>IR 최신 판매 숫자 · ${esc(snap.asof)}</span><a href="#ir/overview" data-tab="ir">자세히 →</a></div>
    ${co('H', '현대차')}${co('K', '기아')}
    <div class="snap-t"><div class="snap-l">해외 생산 비중 (연초~최근)</div><div class="snap-v">${snap.osShare.v.toFixed(1)}<small>%</small></div>${d(snap.osShare.d, '%p')}</div>
    <div class="snap-t"><div class="snap-l">수출 중 미국 비중</div><div class="snap-v">${snap.usShare.v.toFixed(1)}<small>%</small></div>${d(snap.usShare.d, '%p')}</div></div>`;
}
function renderBrief(){
  const wd = weekDoc() || {};
  const byId = new Map(S.news.map(n => [n.id,n]));
  let top = arr(wd.top_ids).map(id => byId.get(id)).filter(Boolean);
  if (!top.length) top = sortNews(S.news.filter(n => n.importance === '상')).slice(0,3);
  const active = S.issues.map(i => ({i, st: issueStats(i.id)})).filter(x => x.st.thisWeek).sort((a,b) => b.st.thisWeek - a.st.thisWeek || b.st.total - a.st.total);
  const quiet = S.issues.filter(i => !active.some(a => a.i.id === i.id) && issueStats(i.id).prevWeek);
  const kpi = t => {
    const list = tabNews(t, false); const hi = list.filter(n => n.importance==='상').length;
    const cats = [...countBy(list, n => n.category).entries()].sort((a,b) => b[1]-a[1]);
    return `<button type="button" class="kpi" data-tab="${t}">
      <div class="kpi-top"><span class="kpi-name">${esc(TABS[t].name)}</span><span class="kpi-num">${list.length}<small>건 · 상 ${hi}</small></span></div>
      ${wd['brief_'+t] ? `<p class="kpi-brief">${esc(wd['brief_'+t])}</p>` : ''}
      <div class="kpi-cats">${cats.map(([c,n]) => `<span>${esc(c)} ${n}</span>`).join('')}</div>
    </button>`;
  };
  const rows = t => sortNews(tabNews(t, false)).map(n => `<tr>
      <td class="mono" style="white-space:nowrap">${esc(md(n.date))}</td><td><span class="imp ${esc(n.importance)}">${esc(n.importance)}</span></td>
      <td style="white-space:nowrap;font-weight:500">${esc(n.company)}</td>
      <td class="t">${safeUrl(n.url) ? `<a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title)}</td>
      <td class="mpc hide-sm">${esc(n.meeting_point)}</td></tr>`).join('');
  const hi = S.news.filter(n => n.importance === '상').length;
  const hero = `<section class="hero"><div><div class="eyebrow">${esc(weekLabel(S.week))} · 이번 주 한 줄 요약</div>
      <h2>${esc(wd.headline || '이 주차의 요약이 아직 없습니다.')}</h2>
      <div class="hero-meta"><span>기사 <b>${S.news.length}</b>건</span><span>중요도 상 <b>${hi}</b>건</span><span>이어지는 이슈 <b>${active.length}</b>개${active.filter(a => a.st.first === S.week).length ? ` (새 이슈 ${active.filter(a => a.st.first === S.week).length})` : ''}</span>${wd.updated_at ? `<span>업데이트 ${esc(String(wd.updated_at).slice(0,10))}</span>` : ''}</div></div>
      <div id="snap">${snapHtml(window.__irSnap)}</div></section>`;
  if (!S.news.length) return hero + '<div class="empty">이 주차에 등록된 뉴스가 없습니다.</div>';
  return `<div style="display:flex;flex-direction:column;gap:16px">
    ${hero}
    ${active.length ? `<div class="section-h"><h2>이번 주 달라진 것 — 이어지는 이슈</h2><span class="sub">주차를 넘어 계속되는 사안 · 카드를 누르면 전체 흐름 · <button type="button" class="linkbtn" data-tab="issues">이슈 추적 탭 →</button></span></div>
    <div class="issue-grid">${active.slice(0, 6).map(a => issueCard(a.i)).join('')}</div>
    ${active.length > 6 ? `<p class="sub" style="margin:-6px 0 0;font-size:12.5px;color:var(--muted)">이번 주 새 보도가 있는 다른 이슈 ${active.length - 6}개: ${active.slice(6).map(a => `<button type="button" class="linkbtn" data-issue="${esc(a.i.id)}">${esc(a.i.title)}</button> <span class="mono">${a.st.thisWeek}</span>`).join(' · ')}</p>` : ''}
    ${quiet.length ? `<p class="sub" style="margin:-6px 0 0;font-size:12.5px;color:var(--muted)">지난주엔 있었지만 이번 주 새 보도가 없는 이슈: ${quiet.map(i => `<button type="button" class="linkbtn" data-issue="${esc(i.id)}">${esc(i.title)}</button>`).join(', ')}</p>` : ''}` : ''}
    <div class="section-h"><h2>영역별 요약</h2><span class="sub">카드를 누르면 해당 탭으로</span></div>
    <div class="kpis">${NEWS_TABS.map(kpi).join('')}</div>
    ${top.length ? `<div class="section-h"><h2>이번 주 핵심</h2><span class="sub">회의에서 먼저 다룰 이슈</span></div>
    <div class="top">${top.map(n => `<div class="topcard">
      <div class="meta"><span class="co">${esc(n.company)}</span><span class="cat">${esc(TABS[n.tab]?.name||'')}</span><span class="mono">${esc(md(n.date))}</span></div>
      <h3>${safeUrl(n.url) ? `<a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title)}</h3>
      <p>${esc(n.summary)}</p>${n.meeting_point ? `<div class="mp"><b>회의 포인트</b>${esc(n.meeting_point)}</div>` : ''}
    </div>`).join('')}</div>` : ''}
    ${NEWS_TABS.filter(t => tabNews(t, false).length).map(t => `
      <div class="section-h"><h2>${esc(TABS[t].name)}</h2><button type="button" class="linkbtn" data-tab="${t}">탭에서 자세히 보기 →</button></div>
      <div class="tbl-wrap"><table class="brief-table"><thead><tr><th>날짜</th><th>중요</th><th>회사</th><th>내용</th><th class="hide-sm">회의 포인트</th></tr></thead><tbody>${rows(t)}</tbody></table></div>`).join('')}
  </div>`;
}

/* ---------- 이슈 추적 ---------- */
function renderIssues(){
  const list = S.issues.map(i => ({i, st: issueStats(i.id)})).sort((a,b) => String(b.st.last).localeCompare(String(a.st.last)) || b.st.total - a.st.total);
  if (!S.issue || !issueOf(S.issue)) S.issue = list[0]?.i.id || null;
  const cur = issueOf(S.issue); if (!cur) return '<div class="empty">등록된 이슈가 없습니다.</div>';
  const st = issueStats(cur.id);
  const side = `<nav class="ilist" aria-label="이슈 목록"><div class="ilist-h"><span>${list.length}개 이슈 · 최근 보도 순</span></div>
    ${list.map(({i, st}) => `<button type="button" class="irow" data-issue-sel="${esc(i.id)}" aria-current="${i.id===cur.id}"><b>${esc(i.title)}</b><span class="status ${STATUS_CLASS(i.status)}">${esc(i.status)}</span>
      <span class="m">${sparkHtml(st.perWeek, st.ids, st.last)}<span>${st.total}건 · 최근 ${st.last ? wShort(st.last) : '—'}</span></span></button>`).join('')}</nav>`;
  const max = Math.max(1, ...st.perWeek);
  const chart = `<div class="ichart" role="img" aria-label="주차별 보도 건수">${st.ids.map((w, k) => `<button type="button" class="ibar" data-goto-week="${esc(w)}" title="${esc(weekLabel(w))} · ${st.perWeek[k]}건" aria-current="${w===S.week}"><i style="height:${Math.max(2, st.perWeek[k]/max*40)}px"></i><span>${esc(wShort(w))}</span></button>`).join('')}</div>`;
  const models = arr(cur.models).map(m => `<button type="button" class="tagchip irlink" data-ir-model="${esc(m)}"><b>차종</b>${esc(m)}</button>`).join('');
  const detail = `<div class="idetail">
    <section class="ihead">
      <div class="icard-h"><h2>${esc(cur.title)}</h2><span class="status ${STATUS_CLASS(cur.status)}">${esc(cur.status)}</span></div>
      <div class="meta"><span>첫 보도 <b>${st.first ? esc(weekLabel(st.first)) : '—'}</b></span><span>최근 <b>${st.last ? esc(weekLabel(st.last)) : '—'}</b></span><span>기사 <b>${st.total}</b>건</span><span>이번 주 <b>${st.thisWeek}</b>건</span>${cur.updated_at ? `<span>요약 기준 ${esc(String(cur.updated_at).slice(0,10))}</span>` : ''}</div>
      <p>${esc(cur.summary)}</p>
      ${cur.kj_impact ? `<div class="impact"><b>광진 영향</b>${esc(cur.kj_impact)}</div>` : ''}
      ${models ? `<div class="tags">${models}<span class="sub" style="font-size:11.5px;color:var(--muted)">↗ 누르면 IR 판매 숫자로</span></div>` : ''}
      ${chart}
    </section>
    <div class="section-h"><h2>타임라인</h2><span class="sub">최근 주차부터 · ${st.total}건</span></div>
    <div class="tl">${st.total ? groupedByWeek(st.list, {}) : '<div class="empty">연결된 기사가 없습니다.</div>'}</div>
  </div>`;
  return `<div class="issues">${side}${detail}</div>`;
}

/* ---------- 프로필 · 공급사 표 · 업체 현황 ---------- */
function renderProfiles(){
  if (!S.competitors.length) return '<div class="empty">등록된 경쟁사 프로필이 없습니다.</div>';
  const order = ['pha','daedong-hilex','hilex','brose','inteva','kwangjin'];
  const list = S.competitors.slice().sort((a,b) => (order.indexOf(a.id)+99)%99 - (order.indexOf(b.id)+99)%99);
  return `<div class="profiles">${list.map(p => `<article class="pcard${p.self?' self':''}">
    <div class="pcard-h"><h3>${esc(p.name)}${p.self?'<span class="badge">자사</span>':''}</h3></div>
    ${p.overview ? `<p>${esc(p.overview)}</p>` : ''}
    <dl class="kv">
      ${p.ownership ? `<dt>지분구조</dt><dd>${esc(p.ownership)}</dd>` : ''}
      ${p.revenue ? `<dt>매출</dt><dd>${esc(p.revenue)}</dd>` : ''}
      ${p.hq ? `<dt>본사</dt><dd>${esc(p.hq)}</dd>` : ''}
      ${arr(p.customers).length ? `<dt>고객사</dt><dd><div class="chips">${arr(p.customers).map(c => `<span>${esc(c)}</span>`).join('')}</div></dd>` : ''}
      ${arr(p.products).length ? `<dt>제품</dt><dd><div class="chips">${arr(p.products).map(c => `<span>${esc(c)}</span>`).join('')}</div></dd>` : ''}
      ${arr(p.technologies).length ? `<dt>신기술</dt><dd><div class="chips tech">${arr(p.technologies).map(c => `<span>${esc(c)}</span>`).join('')}</div></dd>` : ''}
      ${arr(p.plants).length ? `<dt>거점</dt><dd><ul class="plist">${arr(p.plants).map(x => `<li><b style="font-weight:500">${esc(x.country)}</b> ${esc(x.location)}${x.note?` — ${esc(x.note)}`:''}</li>`).join('')}</ul></dd>` : ''}
      ${p.overseas_summary ? `<dt>해외사업</dt><dd>${esc(p.overseas_summary)}</dd>` : ''}
      ${arr(p.recent_issues).length ? `<dt>최근 이슈</dt><dd><ul class="plist">${arr(p.recent_issues).map(x => `<li>${esc(x)}</li>`).join('')}</ul></dd>` : ''}
    </dl>
    ${arr(p.sources).length ? `<div class="srcs">출처: ${arr(p.sources).filter(s => safeUrl(s.url)).map(s => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label||'링크')}</a>`).join('')}</div>` : ''}
    ${p.updated ? `<div class="srcs">기준일 ${esc(p.updated)}</div>` : ''}
  </article>`).join('')}</div>`;
}
// 현대기아 판매 현황 → 도어모듈 물량에서 지정한 공급사(data/door_assign.json + 이 브라우저의 게시 전 변경)를 표에 덧입힌다
function mineSupply(){
  const L = window.IR && window.IR.doorLinks && window.IR.doorLinks();
  if (!L) return S.supply;
  const plLabel = pl => pl === '국내공장' ? '국내' : (pl.match(/\(([^)]+)\)/) || [])[1] || pl;
  const join = es => { const u = [...new Set(es.map(e => e.supplier))]; return u.length === 1 ? u[0] : es.map(e => `${e.supplier}(${plLabel(e.pl)})`).join(', '); };
  const rows = S.supply.map(r => { const es = L.bySupply[r.id]; return es ? Object.assign({}, r, {pub: r, supplier: join(es), status: '지정'}) : r; });
  const oemOf = e => e.c === 'K' ? '기아' : /^G(V)?\d/.test(e.m) ? '제네시스' : '현대';
  return rows.concat(L.extra.map(e => ({id: `mine-${e.c}-${e.m}-${e.pl}`, oem: oemOf(e), model: e.m, plant: plLabel(e.pl), supplier: e.supplier, status: '지정', evidence: '', note: '공급사 표에 없는 차종 — 판매 현황에서 지정'})));
}
function renderMatrix(){
  const all = mineSupply();
  if (!all.length) return '<div class="empty">등록된 차종이 없습니다.</div>';
  const OEMS = ['현대','기아','제네시스','GM'], sts = ['지정','확인','추정','미확인'].filter(s => s !== '지정' || all.some(r => r.status === s));
  const stCount = sts.map(s => [s, all.filter(r => (r.status||'미확인')===s).length]);
  const col = {'지정':'var(--accent)','확인':'var(--ok)','추정':'var(--mid)','미확인':'var(--lo-soft)'};
  const supMap = new Map();
  all.filter(r => r.status !== '미확인' && r.supplier).forEach(r => String(r.supplier).split(/[,/]/).map(s => s.replace(/\(.*\)$/, '').trim()).filter(Boolean).forEach(s => supMap.set(s,(supMap.get(s)||0)+1)));
  const suppliers = [...supMap.keys()].sort();
  const mx = S.mx;
  const rows = all.filter(r => (!mx.oem || r.oem===mx.oem) && (!mx.status || (r.status||'미확인')===mx.status) && (!mx.supplier || String(r.supplier||'').includes(mx.supplier)));
  const groups = OEMS.concat([...new Set(rows.map(r => r.oem))].filter(o => !OEMS.includes(o)));
  const body = groups.map(o => {
    const g = rows.filter(r => r.oem === o).sort((a,b) => String(a.model).localeCompare(String(b.model),'ko'));
    if (!g.length) return '';
    return `<tr class="grp"><td colspan="6">${esc(o)} · ${g.length}개 차종</td></tr>` + g.map(r => `<tr>
      <td class="strong">${esc(r.model)}</td><td>${esc(r.plant)}</td><td class="strong">${esc(r.supplier || '—')}${r.pub ? `<div class="pub-was">공개 자료: ${esc(r.pub.supplier || '—')} · ${esc(r.pub.status || '미확인')}</div>` : ''}</td>
      <td><span class="st ${r.status === '지정' ? 'mine' : esc(r.status||'미확인')}">${esc(r.status||'미확인')}</span></td>
      <td>${esc(r.evidence)}${safeUrl(r.evidence_url) ? ` <a href="${esc(safeUrl(r.evidence_url))}" target="_blank" rel="noopener noreferrer" class="ext">출처↗</a>` : ''}</td>
      <td style="color:var(--muted)">${esc(r.note)}</td></tr>`).join('');
  }).join('');
  const segBtn = (key,v,l) => `<button type="button" class="chip" data-mx="${key}" data-v="${esc(v)}" aria-pressed="${(S.mx[key]||'')===v}">${esc(l)}</button>`;
  return `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="filters">
      <div class="frow"><span class="flabel">현황</span><div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px">
        <div class="bar" role="img" aria-label="${stCount.map(([s,n]) => `${s} ${n}`).join(', ')}">${stCount.map(([s,n]) => n ? `<span style="width:${n/all.length*100}%;background:${col[s]}"></span>` : '').join('')}</div>
        <div class="legend">${stCount.map(([s,n]) => `<span><i style="background:${col[s]}${s==='미확인'?';border:1px dashed var(--lo)':''}"></i>${s} <b class="mono" style="font-weight:500">${n}</b></span>`).join('')}<span style="color:var(--muted)">전체 ${all.length}개 차종</span></div>
      </div></div>
      ${suppliers.length ? `<div class="frow"><span class="flabel">공급사</span><div class="sup-share">${suppliers.map(s => `<span>${esc(s)}<b>${supMap.get(s)}</b></span>`).join('')}</div><span style="font-size:11.5px;color:var(--muted)">${all.some(r => r.status === '지정') ? '지정·' : ''}확인·추정 기준</span></div>` : ''}
      <div class="frow"><span class="flabel">OEM</span>${segBtn('oem','','전체')}${OEMS.map(o => segBtn('oem',o,o)).join('')}</div>
      <div class="frow"><span class="flabel">상태</span>${segBtn('status','','전체')}${sts.map(s => segBtn('status',s,s)).join('')}</div>
      ${suppliers.length ? `<div class="frow"><span class="flabel">공급사</span>${segBtn('supplier','','전체')}${suppliers.map(s => segBtn('supplier',s,s)).join('')}</div>` : ''}
    </div>
    <p class="lede" style="font-size:12.5px">공개 자료로 확인된 경우만 <b>확인</b>, 간접 근거(공장 위치·업계 보도 등)는 <b>추정</b>입니다. 물량 기준 점유율은 <button type="button" class="linkbtn" data-tab="ir" data-ir-sub="door">현대기아 판매 현황 → 도어모듈 물량</button>에서 직접 지정해 계산할 수 있고, 거기서 지정한 공급사는 이 표에 <b>지정</b>으로 표시됩니다.</p>
    <div class="tbl-wrap"><table class="grid"><thead><tr><th>차종</th><th>생산공장</th><th>도어모듈 공급사</th><th>상태</th><th>근거</th><th>메모</th></tr></thead><tbody>${body || `<tr><td colspan="6" style="color:var(--muted)">조건에 맞는 차종이 없습니다.</td></tr>`}</tbody></table></div>
  </div>`;
}
function renderDirectory(){
  const all = S.suppliers;
  if (!all.length) return '<div class="empty">등록된 업체가 없습니다.</div>';
  const rows = all.filter(r => !S.dir.tier || r.tier === S.dir.tier).sort((a,b) => String(a.tier).localeCompare(String(b.tier)) || String(a.name).localeCompare(String(b.name),'ko'));
  const n1 = all.filter(r => r.tier==='1차').length, n2 = all.filter(r => r.tier==='2차').length;
  const tb = (v,l) => `<button type="button" class="chip" data-dir="${esc(v)}" aria-pressed="${(S.dir.tier||'')===v}">${esc(l)}</button>`;
  const related = name => ALL_NEWS.filter(n => n.week !== 'background' && String(n.company).includes(name)).length;
  return `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="filters"><div class="frow"><span class="flabel">구분</span>${tb('','전체 '+all.length)}${tb('1차','1차 벤더 '+n1)}${tb('2차','2차 벤더 '+n2)}</div></div>
    <div class="tbl-wrap"><table class="grid" style="min-width:1100px"><thead><tr><th>업체</th><th>구분</th><th>주력 품목</th><th>주요 고객사</th><th>매출</th><th>본사</th><th>해외 거점</th><th>최근 이슈</th><th>광진과의 관련성</th><th>기사</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td class="strong">${safeUrl(r.source_url) ? `<a href="${esc(safeUrl(r.source_url))}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">${esc(r.name)}</a>` : esc(r.name)}</td>
      <td><span class="st ${r.tier==='1차'?'확인':'추정'}">${esc(r.tier)}</span></td>
      <td>${esc(arr(r.products).join(', '))}</td><td>${esc(arr(r.customers).join(', '))}</td><td>${esc(r.revenue)}</td>
      <td style="white-space:nowrap">${esc(r.hq)}</td><td>${esc(r.overseas)}</td><td>${esc(r.recent_issue)}</td>
      <td style="color:var(--ink-2)">${esc(r.relevance)}</td>
      <td>${related(r.name) ? `<button type="button" class="linkbtn" data-search="${esc(r.name)}">${related(r.name)}건</button>` : '<span style="color:var(--muted)">—</span>'}</td>
    </tr>`).join('') || `<tr><td colspan="10" style="color:var(--muted)">조건에 맞는 업체가 없습니다.</td></tr>`}</tbody></table></div>
  </div>`;
}

/* ---------- 이벤트 ---------- */
function setTab(t, opts = {}){
  if (!TABS[t]) return;
  S.tab = t; S.f = freshFilters(); S.q = '';
  if (opts.sub) S.sub[t] = opts.sub;
  if (opts.issue !== undefined) S.issue = opts.issue;
  store.set('kj.tab', t); render(); if (!opts.keepScroll) window.scrollTo({top:0});
}
function selectWeekNews(){ S.news = ALL_NEWS.filter(n => n.week === S.week); }
function setWeek(w){ if (!w || w === S.week) return; S.week = w; S.openIds.clear(); selectWeekNews(); render(); }
function gotoArticle(id){
  const n = ALL_NEWS.find(x => x.id === id); if (!n) return;
  S.q = ''; S.f = freshFilters(); S.allWeeks = false;
  if (n.week === 'background'){ S.tab = 'competitor'; S.sub.competitor = 'background'; }
  else { S.tab = n.tab; if (TABS[n.tab].subs) S.sub[n.tab] = 'news'; if (n.week !== S.week){ S.week = n.week; selectWeekNews(); } }
  S.openIds.add(id); render();
  requestAnimationFrame(() => { const el = document.getElementById('n-' + id); if (el){ el.scrollIntoView({block:'center'}); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1700); } });
}
function openIR(model){ S.irParams = model ? {ds:'prod', by:'m', pick:model} : null; setTab('ir', {sub: model ? 'explore' : S.sub.ir}); }
document.addEventListener('click', e => {
  const b = e.target.closest('button,[data-tab],a[data-tab]'); if (!b) return;
  const d = b.dataset;
  if (d.irModel){ e.preventDefault(); openIR(d.irModel); return; }
  if (d.tab){ e.preventDefault(); setTab(d.tab, {sub: d.irSub}); return; }
  if (d.issueSel){ S.issue = d.issueSel; render(); return; }
  if (d.issue){ setTab('issues', {issue: d.issue}); return; }
  if (d.goto){ gotoArticle(d.goto); return; }
  if (d.gotoWeek){ S.week = d.gotoWeek; selectWeekNews(); setTab('brief'); return; }
  if (d.week){ setWeek(d.week); return; }
  if (d.search){ S.q = d.search; render(); window.scrollTo({top:0}); return; }
  if (d.sub){ S.sub[S.tab] = d.sub; S.f = freshFilters(); render(); return; }
  if (d.f){ const k = d.f; S.f[k] = S.f[k] === d.v ? null : d.v; renderFilters(); renderContent(); return; }
  if (d.tag){ const k = d.tag; S.f.tags.has(k) ? S.f.tags.delete(k) : S.f.tags.add(k); renderFilters(); renderContent(); return; }
  if (d.mx){ S.mx[d.mx] = d.v || null; renderContent(); return; }
  if ('dir' in d){ S.dir.tier = d.dir || null; renderContent(); return; }
  const act = d.act;
  if (act === 'clear-filters'){ S.f = freshFilters(); renderFilters(); renderContent(); }
  else if (act === 'all-weeks'){ S.allWeeks = !S.allWeeks; store.set('kj.all', S.allWeeks ? '1' : '0'); render(); }
  else if (act === 'clear-q'){ S.q = ''; render(); }
  else if (act === 'print') window.print();
});
let qT, gT;
document.addEventListener('input', e => {
  if (e.target.id === 'q'){ clearTimeout(qT); const v = e.target.value; qT = setTimeout(() => { S.f.q = v; renderContent(); }, 180); }
  if (e.target.id === 'gq'){ clearTimeout(gT); const v = e.target.value; gT = setTimeout(() => { const was = !!S.q; S.q = v.trim().length >= 2 ? v.trim() : ''; if (S.q || was){ renderSubnav(); renderFilters(); renderContent(); writeHash(); } }, 220); }
});
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape' && S.q){ S.q = ''; $('#gq').value = ''; render(); return; }
  if (e.key === '/' && !typing){ e.preventDefault(); $('#gq').focus(); return; }
  if (typing || S.tab === 'ir' || S.tab === 'irs' || S.tab === 'issues') return;
  if (e.key === 'ArrowLeft'){ const w = prevWeekId(); if (w) setWeek(w); }
  if (e.key === 'ArrowRight'){ const ids = weekIds(), i = ids.indexOf(S.week); if (i > 0) setWeek(ids[i-1]); }
});
document.addEventListener('toggle', e => { const d = e.target; if (!d.classList || !d.classList.contains('det')) return; d.open ? S.openIds.add(d.dataset.id) : S.openIds.delete(d.dataset.id); }, true);
$('#wkSel').addEventListener('change', e => setWeek(e.target.value));
$('#wkPrev').addEventListener('click', () => { const w = prevWeekId(); if (w) setWeek(w); });
$('#wkNext').addEventListener('click', () => { const ids = weekIds(); const i = ids.indexOf(S.week); if (i > 0) setWeek(ids[i-1]); });
$('#expandAll').addEventListener('change', e => { S.expandAll = e.target.checked; store.set('kj.expand', S.expandAll ? '1' : '0'); renderContent(); });
window.addEventListener('hashchange', () => { const before = JSON.stringify([S.tab, S.sub, S.week, S.issue, S.q]); readHash(); if (JSON.stringify([S.tab, S.sub, S.week, S.issue, S.q]) !== before){ selectWeekNews(); render(); } });

/* ---------- 시작 ---------- */
async function loadJson(name){ const r = await fetch('data/' + name + '.json', {cache:'no-cache'}); if (!r.ok) throw new Error(name + ' ' + r.status); return r.json(); }
async function boot(){
  const saved = store.get('kj.tab'); if (saved && TABS[saved]) S.tab = saved;
  S.expandAll = store.get('kj.expand') === '1';
  S.allWeeks = store.get('kj.all') === '1';
  readHash();
  render();
  try{
    const [news, weeks, competitors, supply, suppliers, issues] = await Promise.all([...['news','weeks','competitors','supply','suppliers'].map(loadJson), loadJson('issues').catch(() => [])]);
    // 끝나지 않은 주(이번 주)는 보여주지 않는다 — 주차는 월~일 보도 기사가 모두 모인 뒤에만 공개
    const thisMonday = mondayOf(todayStr());
    ALL_NEWS = news.filter(n => n.week === 'background' || n.week < thisMonday);
    S.weeks = weeks.filter(w => w.id < thisMonday).sort((a,b) => b.id.localeCompare(a.id));
    S.background = news.filter(n => n.week === 'background');
    S.competitors = competitors; S.supply = supply; S.suppliers = suppliers; S.issues = issues;
    if (!S.week || !S.weeks.some(w => w.id === S.week)) S.week = S.weeks[0] ? S.weeks[0].id : addDays(thisMonday,-7);
    selectWeekNews();
    S.dbState = 'ok';
  }catch(e){ S.dbState = 'none'; }
  render();
  if (window.IR && window.IR.snapshot){
    window.IR.snapshot().then(snap => { window.__irSnap = snap; const el = document.getElementById('snap'); if (el) el.innerHTML = snapHtml(snap); if (S.tab === 'competitor' && S.sub.competitor === 'matrix' && !S.q) renderContent(); }).catch(() => {});
  }
}
boot();
})();
