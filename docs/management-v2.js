import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth,onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore,collection,doc,getDoc,getDocs,query,where,setDoc,addDoc,serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const app=getApp(),auth=getAuth(app),db=getFirestore(app);
let me=null,profile={role:'user'},reports=[],users=[],budgets=[];
const $=id=>document.getElementById(id);
const esc=v=>String(v||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>'HKD '+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const role=()=>profile.role||'user';
const isAdmin=()=>role()==='admin';
const isManager=()=>role()==='manager';
const isFinance=()=>role()==='finance';
const canManage=()=>isAdmin()||isManager()||isFinance();
function total(r){return +(r.totalHkd||(r.items||[]).reduce((s,i)=>s+(+i.amount||0)*(+i.fx||0),0))}
function fyFromDate(d){const x=d?new Date(d):new Date();return 'FY'+(x.getMonth()>=10?x.getFullYear()+1:x.getFullYear())}
function reportFy(r){return r.fiscalYear||fyFromDate(r.meta?.fromDate)}
function runNo(r){return r.runNumber||('ER-'+reportFy(r)+'-'+String(r.id||'000000').slice(0,6).toUpperCase())}
function fyList(){const n=+fyFromDate().replace('FY','');return ['FY'+(n-1),'FY'+n,'FY'+(n+1)]}
const css=`
.mgmt-filter{display:grid;grid-template-columns:150px 180px minmax(180px,1fr) auto auto;gap:12px;align-items:end;padding:18px;margin-top:20px}.mgmt-filter label{font-size:12px}.mgmt-filter select,.mgmt-filter input{margin-top:7px}.mgmt-actions{display:flex;gap:8px;flex-wrap:wrap}.mgmt-chip{display:inline-flex;border-radius:999px;padding:7px 11px;font-weight:900;font-size:12px;background:#eef6ff;color:#0b6bff}.mgmt-chip.ok{background:#ecfdf3;color:#027a48}.mgmt-chip.warn{background:#fff8e6;color:#b7791f}.mgmt-chip.red{background:#fff1f3;color:#b42336}.mgmt-chip.gray{background:#f2f4f7;color:#475467}.run-no{font-size:12px;font-weight:950;color:#0b6bff}.review-modal{position:fixed;inset:0;background:#10233ab3;z-index:1200;display:grid;place-items:center;padding:22px}.review-box{background:white;border-radius:28px;max-width:1180px;width:96vw;max-height:92vh;overflow:auto;padding:24px;box-shadow:0 30px 90px #0005}.review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid #d9e4f2;padding-bottom:16px}.review-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.review-field{background:#f8fbff;border:1px solid #e4ebf5;border-radius:16px;padding:13px}.review-field b{display:block;font-size:12px;color:#667085;margin-bottom:4px}.receipt-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.receipt-item{border:1px solid #d9e4f2;border-radius:18px;padding:14px;background:#fbfdff}.receipt-item img{width:100%;max-height:460px;object-fit:contain;border-radius:14px;background:#f2f4f7}.comment-box{width:100%;min-height:80px}.budget-save-all{margin-left:auto}.csv-hidden{display:none}@media(max-width:900px){.mgmt-filter,.review-grid,.receipt-grid{grid-template-columns:1fr}.mgmt-actions{justify-content:flex-start}}`;
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

async function loadProfile(u){
  const s=await getDoc(doc(db,'users',u.uid));
  profile=s.exists()?s.data():{email:u.email,role:'user'};
  $('tab-admin')?.classList.toggle('hide',!canManage());
  if($('myRoleText')) $('myRoleText').textContent=role();
}
async function loadData(){
  if(!me)return;
  let rq;
  if(isAdmin()) rq=collection(db,'expenseReports');
  else if(isManager()) rq=query(collection(db,'expenseReports'),where('status','in',['Submitted','Manager Approved','Rejected','Revision Requested']));
  else if(isFinance()) rq=query(collection(db,'expenseReports'),where('status','in',['Manager Approved','Finance Processing','Reimbursed','Closed']));
  else rq=query(collection(db,'expenseReports'),where('userId','==',me.uid));
  reports=(await getDocs(rq)).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
  try{users=(await getDocs(collection(db,'users'))).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.email||'').localeCompare(b.email||''))}catch(e){users=[]}
  try{budgets=(await getDocs(collection(db,'budgets'))).docs.map(d=>({id:d.id,...d.data()}))}catch(e){budgets=[]}
  await ensureRunNumbers();
  renderDashboardList();
  renderManagementTools();
}
async function ensureRunNumbers(){
  for(const r of reports){
    const patch={};
    if(!r.runNumber) patch.runNumber=runNo(r);
    if(!r.fiscalYear) patch.fiscalYear=reportFy(r);
    if(!r.totalHkd) patch.totalHkd=total(r);
    if(Object.keys(patch).length){try{await setDoc(doc(db,'expenseReports',r.id),patch,{merge:true});Object.assign(r,patch)}catch(e){}}
  }
}
function budgetFor(uid,year){
  const b=budgets.find(x=>x.userId===uid&&x.fiscalYear===year);
  const amount=+(b?.budgetAmount||0);
  const mine=reports.filter(r=>r.userId===uid&&reportFy(r)===year);
  const used=mine.filter(r=>['Manager Approved','Finance Processing','Reimbursed','Closed'].includes(r.status)).reduce((s,r)=>s+total(r),0);
  const pending=mine.filter(r=>r.status==='Submitted').reduce((s,r)=>s+total(r),0);
  return{amount,used,pending,available:amount-used-pending};
}
function currentFilter(){
  return{fy:$('mgmtFyFilter')?.value||'All',status:$('mgmtStatusFilter')?.value||'All',employee:($('mgmtEmployeeFilter')?.value||'').toLowerCase().trim()};
}
function filteredReports(){
  const f=currentFilter();
  return reports.filter(r=>{
    const m=r.meta||{};
    const emp=(m.employee||r.userEmail||'').toLowerCase();
    return (f.fy==='All'||reportFy(r)===f.fy)&&(f.status==='All'||r.status===f.status)&&(!f.employee||emp.includes(f.employee));
  });
}
function renderDashboardList(){
  const list=$('reportList'); if(!list||!reports.length)return;
  list.innerHTML=reports.map(r=>{const m=r.meta||{},st=r.status||'Draft',rn=runNo(r);return `<article class="card report-card" onclick="openReport('${r.id}')" data-report-id="${r.id}" data-status="${esc(st)}"><span class="pill ${st==='Submitted'?'submitted':''}">${esc(st)}</span><h3>${esc(m.purpose||'Untitled report')}</h3><p class="muted"><span class="run-no">${rn}</span> · ${esc(m.destination||'No destination')} · ${m.fromDate||'-'} to ${m.toDate||'-'}</p><p class="small muted">${esc(r.userEmail||'')}</p><div class="row"><strong>${money(total(r))}</strong><span class="muted">${(r.items||[]).length} items</span></div><span class="report-view-tag">${st==='Draft'?'Edit draft':'View'}</span></article>`}).join('');
}
function injectFilters(){
  if($('mgmtFilterBox'))return;
  const grid=document.querySelector('#admin .admin-grid'); if(!grid)return;
  const box=document.createElement('div'); box.id='mgmtFilterBox'; box.className='card mgmt-filter';
  box.innerHTML=`<label>Fiscal Year<select id="mgmtFyFilter"><option>All</option>${fyList().map(f=>`<option>${f}</option>`).join('')}</select></label><label>Status<select id="mgmtStatusFilter"><option>All</option><option>Submitted</option><option>Manager Approved</option><option>Revision Requested</option><option>Rejected</option><option>Finance Processing</option><option>Reimbursed</option><option>Closed</option></select></label><label>Employee / Email<input id="mgmtEmployeeFilter" placeholder="Search employee or email"></label><div class="mgmt-actions"><button class="secondary" id="mgmtApplyFilter">Apply</button><button class="secondary" id="mgmtClearFilter">Clear</button></div><div class="mgmt-actions"><button id="exportCsvBtn">Export CSV</button></div>`;
  grid.after(box);
  $('mgmtApplyFilter').onclick=renderManagementTools;
  $('mgmtClearFilter').onclick=()=>{$('mgmtFyFilter').value='All';$('mgmtStatusFilter').value='All';$('mgmtEmployeeFilter').value='';renderManagementTools()};
  $('exportCsvBtn').onclick=exportCsv;
}
function renderManagementTools(){
  if(!canManage())return;
  injectFilters();
  renderBudgetManagement();
  renderReviewQueue();
  renderAllReportsTable();
  if($('adminSubmittedCount')) $('adminSubmittedCount').textContent=reports.filter(r=>r.status==='Submitted').length;
  if($('adminUserCount')) $('adminUserCount').textContent=users.length;
}
function renderBudgetManagement(){
  const fySel=$('budgetFySelect'),body=$('budgetRows'); if(!fySel||!body)return;
  if(!fySel.options.length){fyList().forEach(f=>fySel.add(new Option(f,f)));fySel.value=fyFromDate()}
  fySel.onchange=renderBudgetManagement;
  const year=fySel.value||fyFromDate();
  const people=(users.length?users:reports.map(r=>({id:r.userId,email:r.userEmail,role:'user'})).filter((v,i,a)=>v.id&&a.findIndex(x=>x.id===v.id)===i));
  body.innerHTML=people.map(u=>{const b=budgetFor(u.id,year);return `<tr><td>${esc(u.email||u.id)}</td><td><span class="pill ${u.role||'user'}">${u.role||'user'}</span></td><td><input id="budget-${u.id}" class="budget-input" type="number" min="0" step="0.01" value="${b.amount||''}" ${isAdmin()?'':'disabled'}></td><td>${money(b.used)}</td><td>${money(b.pending)}</td><td>${money(b.available)}</td><td>${isAdmin()?`<button class="secondary" onclick="saveBudget('${u.id}')">Save</button>`:'View only'}</td></tr>`}).join('')||'<tr><td colspan="7">No users found.</td></tr>';
  const note=document.querySelector('#budgetAdminCard .admin-note');
  if(note&&!$('saveAllBudgetBtn')&&isAdmin()){const b=document.createElement('button');b.id='saveAllBudgetBtn';b.className='secondary budget-save-all';b.textContent='Save All Budgets';b.onclick=saveAllBudgets;note.appendChild(b)}
}
window.saveBudget=async uid=>{
  if(!isAdmin())return alert('Admin only.');
  const year=$('budgetFySelect')?.value||fyFromDate(); const user=users.find(x=>x.id===uid)||{}; const val=+($('budget-'+uid)?.value||0);
  try{await setDoc(doc(db,'budgets',uid+'_'+year),{userId:uid,userEmail:user.email||'',fiscalYear:year,currency:'HKD',budgetAmount:val,updatedAt:serverTimestamp(),updatedBy:me.uid},{merge:true});await loadData();alert('Budget saved and recalculated.')}catch(e){alert('Cannot save budget: '+e.message+'\nPlease confirm Firestore rules are published.')}
};
async function saveAllBudgets(){
  if(!isAdmin())return;
  const inputs=[...document.querySelectorAll('.budget-input')];
  for(const input of inputs){const uid=input.id.replace('budget-','');await window.saveBudget(uid)}
}
function renderReviewQueue(){
  const tb=$('reviewReports'); if(!tb)return;
  const table=tb.closest('table'); if(table) table.querySelector('thead').innerHTML='<tr><th>Run No.</th><th>Employee</th><th>Purpose</th><th>FY</th><th>Total</th><th>Budget</th><th>Status</th><th>Review</th><th>Approval / Finance</th></tr>';
  const rows=filteredReports().filter(r=>isAdmin()||isManager()?['Submitted','Manager Approved','Rejected','Revision Requested'].includes(r.status):isFinance()?['Manager Approved','Finance Processing','Reimbursed','Closed'].includes(r.status):false);
  tb.innerHTML=rows.map(r=>{const m=r.meta||{},b=budgetFor(r.userId,reportFy(r)),after=b.available-total(r),impact=after<0?'Over '+money(Math.abs(after)):'Remain '+money(after);let actions='';
    if((isAdmin()||isManager())&&r.status==='Submitted')actions=`<button class="secondary" onclick="managerAction('${r.id}','Manager Approved')">Approve</button><button class="danger" onclick="managerAction('${r.id}','Rejected')">Reject</button><button class="ghost" onclick="managerAction('${r.id}','Revision Requested')">Revision</button>`;
    if((isAdmin()||isFinance())&&r.status==='Manager Approved')actions=`<button class="secondary" onclick="financeAction('${r.id}','Finance Processing')">Process</button>`;
    if((isAdmin()||isFinance())&&r.status==='Finance Processing')actions=`<button class="secondary" onclick="financeAction('${r.id}','Reimbursed')">Reimbursed</button>`;
    return `<tr><td><span class="run-no">${runNo(r)}</span></td><td>${esc(m.employee||r.userEmail||'-')}</td><td>${esc(m.purpose||'-')}</td><td>${reportFy(r)}</td><td>${money(total(r))}</td><td>${impact}</td><td><span class="mgmt-chip ${r.status==='Manager Approved'?'ok':r.status==='Submitted'?'warn':r.status==='Rejected'?'red':'gray'}">${esc(r.status||'Draft')}</span></td><td><button class="ghost" onclick="reviewReport('${r.id}')">Review report</button><button class="ghost" onclick="showReceipts('${r.id}')">Receipts</button></td><td><div class="inline-actions">${actions||'-'}</div></td></tr>`}).join('')||'<tr><td colspan="9">No report found for selected filters.</td></tr>';
}
function renderAllReportsTable(){
  const tb=$('adminReports'); if(!tb)return;
  const rows=filteredReports();
  const table=tb.closest('table'); if(table) table.querySelector('thead').innerHTML='<tr><th>Run No.</th><th>Employee</th><th>Purpose</th><th>FY</th><th>Status</th><th>User</th><th>Total</th><th>Action</th></tr>';
  tb.innerHTML=rows.map(r=>{const m=r.meta||{};return `<tr><td><span class="run-no">${runNo(r)}</span></td><td>${esc(m.employee||'-')}</td><td>${esc(m.purpose||'-')}</td><td>${reportFy(r)}</td><td><span class="mgmt-chip gray">${esc(r.status||'Draft')}</span></td><td>${esc(r.userEmail||'-')}</td><td>${money(total(r))}</td><td><button class="ghost" onclick="reviewReport('${r.id}')">Review</button></td></tr>`}).join('')||'<tr><td colspan="8">No reports found.</td></tr>';
}
window.reviewReport=id=>{
  const r=reports.find(x=>x.id===id); if(!r)return; const m=r.meta||{},items=r.items||[],b=budgetFor(r.userId,reportFy(r));
  const modal=document.createElement('div'); modal.className='review-modal';
  modal.innerHTML=`<div class="review-box"><div class="review-head"><div><h2>Expense Report Review</h2><p class="muted"><span class="run-no">${runNo(r)}</span> · ${esc(r.status||'Draft')} · ${reportFy(r)}</p></div><button class="ghost" onclick="this.closest('.review-modal').remove()">Close</button></div><div class="review-grid"><div class="review-field"><b>Employee</b>${esc(m.employee||r.userEmail||'-')}</div><div class="review-field"><b>Purpose</b>${esc(m.purpose||'-')}</div><div class="review-field"><b>Destination</b>${esc(m.destination||'-')}</div><div class="review-field"><b>Period</b>${m.fromDate||'-'} to ${m.toDate||'-'}</div><div class="review-field"><b>Total</b>${money(total(r))}</div><div class="review-field"><b>Budget</b>${money(b.amount)}</div><div class="review-field"><b>Used + Pending</b>${money(b.used+b.pending)}</div><div class="review-field"><b>Available after this claim</b>${money(b.available-total(r))}</div></div><h3>Expense Items</h3><div class="table-wrap"><table class="admin-table"><thead><tr><th>Ref</th><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>HKD</th><th>Receipt</th></tr></thead><tbody>${items.map((it,i)=>`<tr><td>${runNo(r)}-R${String(i+1).padStart(2,'0')}</td><td>${it.date||'-'}</td><td>${esc(it.category||'-')}</td><td>${esc(it.desc||'-')}</td><td>${esc(it.currency||'')} ${Number(it.amount||0).toFixed(2)}</td><td>${money((+it.amount||0)*(+it.fx||0))}</td><td>${it.receiptData?'Attached':'Missing'}</td></tr>`).join('')}</tbody></table></div><h3>Receipts</h3><div class="receipt-grid">${items.filter(x=>x.receiptData).map((it,i)=>`<div class="receipt-item"><p><b>${runNo(r)}-R${String(i+1).padStart(2,'0')}</b><br><span class="muted">${esc(it.desc||'Expense item')}</span></p><img src="${it.receiptData}"></div>`).join('')||'<p class="muted">No receipt attached.</p>'}</div></div>`;
  document.body.appendChild(modal);
};
window.showReceipts=id=>window.reviewReport(id);
window.managerAction=async(id,status)=>{
  if(!(isAdmin()||isManager()))return alert('Manager/Admin only.');
  const r=reports.find(x=>x.id===id); if(!r)return;
  const b=budgetFor(r.userId,reportFy(r)); const over=total(r)>b.available;
  let comment=prompt(status==='Manager Approved'?(over?'Approval comment is required because this claim exceeds available budget.':'Approval comment optional:'):'Comment is required:');
  if((status!=='Manager Approved'||over)&&!comment)return alert('Comment is required.');
  await setDoc(doc(db,'expenseReports',id),{status,managerStatus:status==='Manager Approved'?'Approved':status,managerId:me.uid,managerEmail:me.email,managerComment:comment||'',managerActionAt:serverTimestamp(),updatedAt:serverTimestamp(),runNumber:runNo(r),fiscalYear:reportFy(r),totalHkd:total(r)},{merge:true});
  await addDoc(collection(db,'approvalLogs'),{reportId:id,runNumber:runNo(r),action:status,actionBy:me.uid,actionByEmail:me.email,comment:comment||'',createdAt:serverTimestamp()});
  await loadData(); alert('Manager action saved.');
};
window.managerApprove=id=>window.managerAction(id,'Manager Approved');
window.financeAction=async(id,status)=>{
  if(!(isAdmin()||isFinance()))return alert('Finance/Admin only.');
  const r=reports.find(x=>x.id===id); if(!r)return;
  const ref=prompt(status==='Reimbursed'?'Payment reference is required:':'Finance processing remark:');
  if(status==='Reimbursed'&&!ref)return alert('Payment reference is required.');
  await setDoc(doc(db,'expenseReports',id),{status,financeStatus:status,financeBy:me.uid,financeEmail:me.email,paymentReference:status==='Reimbursed'?ref:(r.paymentReference||''),financeRemark:ref||'',financeActionAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
  await addDoc(collection(db,'paymentLogs'),{reportId:id,runNumber:runNo(r),action:status,actionBy:me.uid,actionByEmail:me.email,reference:ref||'',createdAt:serverTimestamp()});
  await loadData(); alert('Finance status updated.');
};
function exportCsv(){
  const rows=filteredReports();
  const headers=['Run No','Fiscal Year','Status','Employee','User Email','Purpose','Destination','From','To','Total HKD','Payment Reference'];
  const lines=[headers.join(',')].concat(rows.map(r=>{const m=r.meta||{};return [runNo(r),reportFy(r),r.status||'',m.employee||'',r.userEmail||'',m.purpose||'',m.destination||'',m.fromDate||'',m.toDate||'',total(r),r.paymentReference||''].map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')}));
  const blob=new Blob([lines.join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='expense-reimbursement-summary.csv'; a.click(); URL.revokeObjectURL(url);
}
window.refreshAdmin=loadData;
onAuthStateChanged(auth,async u=>{me=u;if(u){await loadProfile(u);setTimeout(loadData,1000)}});
console.log('ExpenseFlow management v2 active');
