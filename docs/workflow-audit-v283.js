import {getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getFirestore,collection,getDocs,query,where} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const db=getFirestore(getApp());
let activeReviewId='',observerTimer=null;
const esc=v=>String(v||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const tsValue=v=>v?.seconds?new Date(v.seconds*1000):null;
const fmt=v=>{const d=tsValue(v);return d?d.toLocaleString():'-'};
function rememberReview(event){const btn=event.target.closest('[onclick*="reviewReport"],[data-history-btn],[data-report-open]');if(!btn)return;const inline=btn.getAttribute('onclick')||'';activeReviewId=(inline.match(/reviewReport\(['\"]([^'\"]+)/)||[])[1]||btn.dataset.historyBtn||btn.closest('[data-report-id]')?.dataset.reportId||''}
async function loadLogs(reportId){const results=[];for(const name of ['approvalLogs','paymentLogs']){try{const snap=await getDocs(query(collection(db,name),where('reportId','==',reportId)));snap.docs.forEach(d=>results.push({id:d.id,source:name,...d.data()}))}catch(e){console.warn(name+' timeline load failed',e.message)}}return results.sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0))}
function label(log){if(log.source==='paymentLogs')return log.action||'Finance action';return log.action||'Approval action'}
function actor(log){return log.actionByEmail||log.createdByEmail||log.actionBy||'-'}
function detail(log){return log.comment||log.reference||log.paymentReference||''}
async function enhanceModal(modal){if(!modal||modal.dataset.auditReady==='true'||!activeReviewId)return;modal.dataset.auditReady='true';const box=modal.querySelector('.review-box');if(!box)return;const panel=document.createElement('section');panel.className='audit-panel';panel.innerHTML='<div class="audit-head"><h3>Approval & Payment Timeline</h3><span>Loading…</span></div>';box.appendChild(panel);const logs=await loadLogs(activeReviewId);panel.innerHTML=`<div class="audit-head"><h3>Approval & Payment Timeline</h3><span>${logs.length} event(s)</span></div>${logs.length?`<div class="audit-list">${logs.map(log=>`<div class="audit-event"><div class="audit-dot"></div><div><strong>${esc(label(log))}</strong><p>${esc(actor(log))} · ${esc(fmt(log.createdAt))}</p>${detail(log)?`<small>${esc(detail(log))}</small>`:''}</div></div>`).join('')}</div>`:'<p class="muted">No approval or payment log has been recorded for this report yet.</p>'}`}
function scan(){document.querySelectorAll('.review-modal').forEach(enhanceModal)}
document.addEventListener('click',event=>{rememberReview(event);clearTimeout(observerTimer);observerTimer=setTimeout(scan,180)},true);
new MutationObserver(m=>{if(!m.some(x=>[...x.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('.review-modal')||n.querySelector?.('.review-modal')))))return;clearTimeout(observerTimer);observerTimer=setTimeout(scan,100)}).observe(document.body,{childList:true,subtree:true});
console.log('ExpenseFlow workflow audit v0.28.3 active');