const STORAGE_KEY='expenseflow_report_view_mode';
let reportViewObserverTimer=null;
let lastTableSignature='';
function preferredMode(){
  const saved=localStorage.getItem(STORAGE_KEY);
  if(saved==='cards'||saved==='table')return saved;
  const title=(document.getElementById('reportTitle')?.textContent||'').toLowerCase();
  return title.includes('all')||title.includes('submitted')?'table':'cards';
}
function parseCard(card){
  const click=card.getAttribute('onclick')||'';
  const id=(click.match(/openReport\(['\"]([^'\"]+)['\"]\)/)||[])[1]||card.dataset.reportId||'';
  const status=card.querySelector('.pill')?.textContent?.trim()||'-';
  const purpose=card.querySelector('h3')?.textContent?.trim()||'Untitled report';
  const trip=card.querySelector('p.muted:not(.small)')?.textContent?.trim()||'-';
  const email=card.querySelector('p.small.muted')?.textContent?.trim()||'-';
  const amount=card.querySelector('.row strong')?.textContent?.trim()||'-';
  const items=card.querySelector('.row .muted')?.textContent?.trim()||'-';
  const next=card.querySelector('.next-step')?.textContent?.replace(/^Next step:\s*/i,'').trim()||'-';
  return {id,click,status,purpose,trip,email,amount,items,next};
}
function signature(rows){return JSON.stringify(rows.map(r=>[r.id,r.status,r.purpose,r.trip,r.email,r.amount,r.items,r.next]))}
function reviewReport(id){
  if(!id)return;
  if(typeof window.reviewReport==='function')window.reviewReport(id);
  else if(typeof window.openReport==='function')window.openReport(id);
}
function buildTable(force=false){
  const list=document.getElementById('reportList');
  if(!list)return;
  let wrap=document.getElementById('reportTableWrap');
  if(!wrap){wrap=document.createElement('div');wrap.id='reportTableWrap';list.after(wrap)}
  const cards=[...list.querySelectorAll('.report-card')].filter(c=>!c.classList.contains('history-hidden'));
  if(!cards.length){const empty='No reports found.';if(force||wrap.dataset.signature!==empty){wrap.innerHTML='<div class="report-grid-empty">No reports found.</div>';wrap.dataset.signature=empty;lastTableSignature=empty}return}
  const rows=cards.map(parseCard),sig=signature(rows);
  if(!force&&sig===lastTableSignature&&wrap.dataset.signature===sig)return;
  lastTableSignature=sig;wrap.dataset.signature=sig;
  wrap.innerHTML=`<div class="report-table-scroll"><table class="report-grid"><thead><tr><th>Status</th><th>Purpose / Trip</th><th>User</th><th>Total</th><th>Items</th><th>Next Step</th><th>Action</th></tr></thead><tbody>${rows.map((r,i)=>`<tr data-report-row="${i}" data-report-id="${escapeHtml(r.id)}"><td><span class="pill ${r.status==='Submitted'?'submitted':''}">${escapeHtml(r.status)}</span></td><td class="cell-purpose">${escapeHtml(r.purpose)}<span class="cell-sub">${escapeHtml(r.trip)}</span></td><td>${escapeHtml(r.email)}</td><td class="cell-total">${escapeHtml(r.amount)}</td><td>${escapeHtml(r.items)}</td><td class="cell-next">${escapeHtml(r.next)}</td><td><button class="secondary review-btn" type="button" data-report-review="${escapeHtml(r.id)}">Review</button></td></tr>`).join('')}</tbody></table></div>`;
  wrap.querySelectorAll('[data-report-row]').forEach(tr=>tr.addEventListener('click',ev=>{if(ev.target.closest('button'))return;const r=rows[Number(tr.dataset.reportRow)];if(r?.id&&window.openReport)window.openReport(r.id);else if(r?.click)Function(r.click)()}));
  wrap.querySelectorAll('[data-report-review]').forEach(btn=>btn.addEventListener('click',ev=>{ev.stopPropagation();reviewReport(btn.dataset.reportReview)}));
}
function escapeHtml(value){return String(value||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c))}
function applyMode(mode,force=false){
  const finalMode=mode==='table'?'table':'cards';
  document.body.classList.toggle('report-table-mode',finalMode==='table');
  document.body.classList.toggle('report-card-mode',finalMode==='cards');
  document.querySelectorAll('.report-view-toggle button').forEach(btn=>btn.classList.toggle('active',btn.dataset.reportView===finalMode));
  if(finalMode==='table')buildTable(force);
}
function setMode(mode){localStorage.setItem(STORAGE_KEY,mode);applyMode(mode,true)}
function injectToggle(){
  const toolbar=document.querySelector('#dashboard>.toolbar');if(!toolbar)return;
  const titleBox=toolbar.querySelector('div');if(titleBox&&!titleBox.classList.contains('report-title-wrap'))titleBox.classList.add('report-title-wrap');
  if(!document.getElementById('reportViewToggle')){const toggle=document.createElement('div');toggle.id='reportViewToggle';toggle.className='report-view-toggle';toggle.innerHTML='<button type="button" data-report-view="cards">Cards</button><button type="button" data-report-view="table">Table</button>';if(titleBox)titleBox.after(toggle);else toolbar.prepend(toggle);toggle.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.reportView)))}
  applyMode(preferredMode(),false);
}
function patchViewChanges(){
  const oldShow=window.showView;if(oldShow&&!window.__reportViewShowPatched){window.__reportViewShowPatched=true;window.showView=view=>{oldShow(view);if(view==='dashboard')setTimeout(()=>{injectToggle();applyMode(preferredMode(),false)},350)}}
  const oldRefresh=window.refreshAdmin;if(oldRefresh&&!window.__reportViewRefreshPatched){window.__reportViewRefreshPatched=true;window.refreshAdmin=async()=>{await oldRefresh();setTimeout(()=>{lastTableSignature='';injectToggle();applyMode(preferredMode(),true)},450)}}
}
function observeReports(){
  const list=document.getElementById('reportList');if(!list||list.__reportViewObserved)return;list.__reportViewObserved=true;
  new MutationObserver(mutations=>{if(!mutations.some(m=>m.type==='childList'&&m.target===list))return;clearTimeout(reportViewObserverTimer);reportViewObserverTimer=setTimeout(()=>applyMode(preferredMode(),false),400)}).observe(list,{childList:true,subtree:false});
}
function init(){patchViewChanges();injectToggle();observeReports()}
setTimeout(init,1700);
console.log('ExpenseFlow report view toggle v27 stable review active');