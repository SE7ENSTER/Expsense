import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth,onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore,doc,getDoc,setDoc,addDoc,collection,serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const auth=getAuth(getApp());
const db=getFirestore(getApp());
let me=null,profile={role:'user'};
const $=id=>document.getElementById(id);
const canBudget=()=>['admin','finance'].includes(profile.role);
const canApprove=()=>['admin','manager'].includes(profile.role);
function getReportIdFromRow(row){
  const btn=[...row.querySelectorAll('button')].find(b=>(b.getAttribute('onclick')||'').includes('managerAction')||(b.getAttribute('onclick')||'').includes('managerApprove'));
  const code=btn?.getAttribute('onclick')||'';
  const m=code.match(/['\"]([^'\"]+)['\"]/);
  return m?m[1]:'';
}
function updateWording(){
  document.querySelectorAll('*').forEach(el=>{
    if(el.children.length===0&&el.textContent){
      let t=el.textContent;
      if(t.trim()==='Remaining') t='Budget Remaining';
      t=t.replace(/\bRemain\s+HKD/g,'Budget Remaining HKD').replace(/Finance Processing/g,'Reimbursement Processing').replace(/Financial Processing/g,'Reimbursement Processing');
      if(t!==el.textContent) el.textContent=t;
    }
  });
  const sideEditor=document.querySelector('.side-nav [data-view="editor"]');
  if(sideEditor) sideEditor.textContent='Create Expense Report';
}
function styleActionButtons(){
  document.querySelectorAll('button').forEach(btn=>{
    const t=btn.textContent.trim().toLowerCase();
    btn.classList.toggle('btn-approve',t==='approve');
    btn.classList.toggle('btn-reject',t==='reject');
    btn.classList.toggle('btn-revision',t==='revision'||t.includes('revision'));
    btn.classList.toggle('btn-review',t==='review'||t==='review report');
    btn.classList.toggle('btn-receipt',t==='receipt'||t==='receipts');
    btn.classList.toggle('btn-process',t==='process'||t.includes('reimbursement')||t==='reimbursed');
  });
}
function enableBudgetForFinance(){
  if(!canBudget())return;
  document.querySelectorAll('#budgetRows input[id^="budget-"]').forEach(input=>{
    input.disabled=false;
    const uid=input.id.replace('budget-','');
    const row=input.closest('tr');
    const actionCell=row?.lastElementChild;
    if(actionCell&&!actionCell.querySelector('button')) actionCell.innerHTML=`<button class="secondary" onclick="saveBudget('${uid}')">Save</button>`;
  });
}
window.saveBudget=async uid=>{
  if(!canBudget())return alert('Admin or Finance only.');
  const input=$('budget-'+uid), fy=$('budgetFySelect')?.value||'FY2026';
  const amount=+(input?.value||0);
  try{
    await setDoc(doc(db,'budgets',uid+'_'+fy),{userId:uid,fiscalYear:fy,currency:'HKD',budgetAmount:amount,updatedAt:serverTimestamp(),updatedBy:me?.uid||'',updatedByEmail:me?.email||''},{merge:true});
    alert('Budget saved and will be recalculated.');
    if(window.refreshAdmin) setTimeout(()=>window.refreshAdmin(),500);
  }catch(e){alert('Cannot save budget: '+e.message+'\nPlease publish the latest Firestore Rules.')}
};
function addBatchApprove(){
  const note=document.querySelector('#reviewReports')?.closest('.table-card')?.querySelector('.admin-note');
  if(note&&canApprove()&&!$('batchApproveBtn')){
    const wrap=document.createElement('div');
    wrap.className='batch-toolbar';
    wrap.innerHTML='<button id="batchApproveBtn" class="btn-approve" onclick="batchApproveSelected()">Batch Approve Selected</button><span class="muted small">Select submitted reports below, then approve together.</span>';
    note.appendChild(wrap);
  }
  document.querySelectorAll('#reviewReports tr').forEach(row=>{
    if(row.classList.contains('category-row')||row.querySelector('.batch-select'))return;
    const id=getReportIdFromRow(row);
    if(!id)return;
    const first=row.cells[0];
    if(first) first.insertAdjacentHTML('afterbegin',`<input type="checkbox" class="batch-select" data-report-id="${id}"> `);
  });
}
window.batchApproveSelected=async()=>{
  if(!canApprove())return alert('Admin or Manager only.');
  const selected=[...document.querySelectorAll('.batch-select:checked')].map(x=>x.dataset.reportId).filter(Boolean);
  if(!selected.length)return alert('Please select at least one submitted report.');
  const comment=prompt('Batch approval comment:')||'';
  for(const id of selected){
    await setDoc(doc(db,'expenseReports',id),{status:'Manager Approved',managerStatus:'Approved',managerId:me.uid,managerEmail:me.email,managerComment:comment,managerActionAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
    await addDoc(collection(db,'approvalLogs'),{reportId:id,action:'Manager Approved',actionBy:me.uid,actionByEmail:me.email,comment,createdAt:serverTimestamp()});
  }
  alert(selected.length+' report(s) approved.');
  if(window.refreshAdmin) setTimeout(()=>window.refreshAdmin(),500);
};
function groupVisibleReports(){
  const tbody=$('adminReports');
  if(!tbody||tbody.dataset.grouping==='1')return;
  const rows=[...tbody.querySelectorAll('tr')].filter(r=>!r.classList.contains('category-row')&&r.cells.length>1);
  if(rows.length<2)return;
  tbody.dataset.grouping='1';
  const active=[],completed=[];
  rows.forEach(r=>{
    const text=r.textContent.toLowerCase();
    if(text.includes('reimbursed')||text.includes('closed')) completed.push(r); else active.push(r);
  });
  tbody.innerHTML='';
  const addGroup=(name,items)=>{ if(!items.length)return; const tr=document.createElement('tr'); tr.className='category-row'; tr.innerHTML=`<td colspan="8">${name} (${items.length})</td>`; tbody.appendChild(tr); items.forEach(x=>tbody.appendChild(x)); };
  addGroup('Active / In Progress Reports',active);
  addGroup('Completed / Reimbursed Reports',completed);
  setTimeout(()=>{tbody.dataset.grouping='0'},800);
}
function addPrintButtons(){
  document.querySelectorAll('.review-modal').forEach(modal=>{
    const head=modal.querySelector('.review-head');
    if(!head||head.querySelector('.btn-print'))return;
    const btn=document.createElement('button');
    btn.className='btn-print';
    btn.textContent='Print / Save PDF';
    btn.onclick=()=>printReviewModal(modal);
    head.appendChild(btn);
  });
}
function printReviewModal(modal){
  const box=modal.querySelector('.review-box');
  const w=window.open('','_blank','width=1100,height=800');
  if(!w)return alert('Please allow pop-ups to print this report.');
  w.document.write(`<html><head><title>Expense Report Review</title><style>body{font-family:Arial,sans-serif;color:#0f172a;margin:24px}.review-head{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;margin-bottom:18px}.ghost,.btn-print{display:none}.review-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.review-field{border:1px solid #ddd;border-radius:10px;padding:10px}.review-field b{display:block;color:#64748b;font-size:12px;margin-bottom:6px}.admin-table{width:100%;border-collapse:collapse}.admin-table th,.admin-table td{padding:9px;border-bottom:1px solid #ddd;text-align:left}.receipt-grid{display:grid;grid-template-columns:1fr;gap:18px}.receipt-item{page-break-inside:avoid;border:1px solid #ddd;border-radius:12px;padding:12px}.receipt-item img{max-width:100%;height:auto}@media print{body{margin:12mm}}</style></head><body>${box.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(()=>{w.focus();w.print()},500);
}
function applyFixes(){updateWording();styleActionButtons();enableBudgetForFinance();addBatchApprove();groupVisibleReports();addPrintButtons();}
onAuthStateChanged(auth,async user=>{me=user;if(user){try{const snap=await getDoc(doc(db,'users',user.uid));profile=snap.exists()?snap.data():{role:'user'}}catch(e){} setTimeout(applyFixes,900)}});
setInterval(applyFixes,1200);
new MutationObserver(()=>setTimeout(applyFixes,100)).observe(document.body,{childList:true,subtree:true,characterData:true});
console.log('ExpenseFlow management portal fixes v20 active');
