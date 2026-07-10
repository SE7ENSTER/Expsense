import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth,onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore,collection,doc,getDoc,getDocs,query,where } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const auth=getAuth(getApp());
const db=getFirestore(getApp());
let me=null,profile={role:'user'},historyReports=[];
let timer=null;
const DONE=['Reimbursed','Closed'];
const $=id=>document.getElementById(id);
const esc=v=>String(v||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>'HKD '+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function isDone(status){return DONE.includes(String(status||'').trim())}
function total(r){return +(r.totalHkd||(r.items||[]).reduce((s,i)=>s+(+i.amount||0)*(+i.fx||0),0))}
function receipts(r){return (r.items||[]).filter(i=>i.receiptData||i.receiptFileData||i.receiptName).length}
function period(r){const m=r.meta||{};return `${m.destination||'No destination'} · ${m.fromDate||'-'} to ${m.toDate||'-'}`}
function reportNo(r){return r.reportNo||r.runNumber||r.id||'-'}
function doneDate(r){const ts=r.paymentAt||r.reimbursedAt||r.updatedAt||r.createdAt;return ts?.seconds?new Date(ts.seconds*1000).toLocaleDateString():'-'}
async function loadProfile(){if(!me)return;try{const snap=await getDoc(doc(db,'users',me.uid));profile=snap.exists()?snap.data():{role:'user'}}catch(e){profile={role:'user'}}}
async function loadHistory(){if(!me)return;try{let rq;if(profile.role==='admin')rq=collection(db,'expenseReports');else if(profile.role==='finance')rq=query(collection(db,'expenseReports'),where('status','in',DONE));else rq=query(collection(db,'expenseReports'),where('userId','==',me.uid));const snap=await getDocs(rq);historyReports=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>isDone(r.status)).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));renderHistory()}catch(e){console.warn('History load failed',e.message)}}
function parseDomStatus(card){return card.querySelector('.pill')?.textContent?.trim()||card.dataset.status||''}
function filterActiveList(){const list=$('reportList');if(!list)return;let removed=0;list.querySelectorAll('.report-card').forEach(card=>{if(isDone(parseDomStatus(card))){card.classList.add('history-hidden');removed++}});const activeCards=[...list.querySelectorAll('.report-card')].filter(c=>!c.classList.contains('history-hidden'));let empty=$('activeReportEmpty');if(activeCards.length===0&&removed>0){if(!empty){empty=document.createElement('div');empty.id='activeReportEmpty';empty.className='active-empty';empty.textContent='No active reports. Completed / reimbursed reports are available in History below.';list.appendChild(empty)}}else if(empty){empty.remove()}const title=$('reportTitle');if(title){title.textContent=(title.textContent||'').replace(/^All Reports$/,'Current Reports').replace(/^My Reports$/,'My Active Reports')}}
function ensureSection(){const dashboard=$('dashboard'),list=$('reportList');if(!dashboard||!list)return null;let section=$('reportHistorySection');if(!section){section=document.createElement('section');section.id='reportHistorySection';section.className='history-section';list.after(section)}return section}
function renderHistory(){const section=ensureSection();if(!section)return;if(!historyReports.length){section.innerHTML='';section.classList.add('hide');return}section.classList.remove('hide');section.innerHTML=`<div class="history-card"><div class="history-head"><div><h2>History / Reimbursed Reports</h2><p>Completed reports moved from the active dashboard for easier tracking.</p></div><span class="history-badge">${historyReports.length} completed</span></div><div class="history-table-wrap"><table class="history-table"><thead><tr><th>Report No.</th><th>Status</th><th>Purpose / Trip</th><th>User</th><th>Total</th><th>Receipts</th><th>Completed</th><th>Action</th></tr></thead><tbody>${historyReports.map(r=>`<tr data-history-open="${esc(r.id)}"><td>${esc(reportNo(r))}</td><td><span class="pill">${esc(r.status||'Reimbursed')}</span></td><td class="history-purpose"><strong>${esc(r.meta?.purpose||'Untitled report')}</strong><span>${esc(period(r))}</span></td><td>${esc(r.userEmail||'')}</td><td class="history-total">${money(total(r))}</td><td>${receipts(r)}</td><td>${doneDate(r)}</td><td><button type="button" class="secondary" data-history-btn="${esc(r.id)}">Open</button></td></tr>`).join('')}</tbody></table></div></div>`;section.querySelectorAll('[data-history-open]').forEach(row=>row.addEventListener('click',ev=>{if(ev.target.closest('button'))return;openHistory(row.dataset.historyOpen)}));section.querySelectorAll('[data-history-btn]').forEach(btn=>btn.addEventListener('click',ev=>{ev.stopPropagation();openHistory(btn.dataset.historyBtn)}))}
function openHistory(id){if(!id)return;if(window.openReport)window.openReport(id)}
function refreshHistory(){filterActiveList();loadHistory()}
function patch(){const oldShow=window.showView;if(oldShow&&!window.__historyShowPatched){window.__historyShowPatched=true;window.showView=view=>{oldShow(view);if(view==='dashboard')setTimeout(refreshHistory,700)}}const oldRefresh=window.refreshAdmin;if(oldRefresh&&!window.__historyRefreshPatched){window.__historyRefreshPatched=true;window.refreshAdmin=async()=>{await oldRefresh();setTimeout(refreshHistory,800)}}}
onAuthStateChanged(auth,async user=>{me=user;if(user){await loadProfile();setTimeout(()=>{patch();refreshHistory()},1800)}});
new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(filterActiveList,150)}).observe(document.body,{childList:true,subtree:true});
console.log('ExpenseFlow report history v28 active');
