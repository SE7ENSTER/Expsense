// Dashboard ordering uses saved report numbers, never last-edit timestamps.
export function reportNumber(report){return String(report.reportNo||report.runNumber||'').trim()}
export function compareReports(a,b){
  const left=reportNumber(a),right=reportNumber(b);
  if(Boolean(left)!==Boolean(right))return left?-1:1;
  const byNumber=left.localeCompare(right,'en',{numeric:true,sensitivity:'base'});
  if(byNumber)return byNumber;
  // Stable tie-breaker for duplicates and legacy reports without a number.
  return String(a.id||'').localeCompare(String(b.id||''),'en',{numeric:true});
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>'HKD '+Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nextStep=status=>({Draft:'Please complete and submit this report.',Submitted:'Waiting for Manager review.','Manager Approved':'Waiting for Finance processing.','Finance Processing':'Finance is processing reimbursement.','Reimbursement Processing':'Finance is processing reimbursement.',Rejected:'Rejected. Please review manager comment.','Revision Requested':'Revision required. Please revise and resubmit.'}[status]||'Waiting for next action.');
export function renderDashboardReports(list,reports){
  if(!list)return;
  list.removeAttribute('aria-busy');
  const active=reports.filter(r=>!['Reimbursed','Closed'].includes(r.status)).slice().sort(compareReports);
  const html=active.map(r=>{
    const m=r.meta||{},status=r.status||'Draft',number=reportNumber(r);
    const total=(r.items||[]).reduce((sum,item)=>sum+(Number(item.amount)||0)*(Number(item.fx)||0),0);
    return `<article class="card report-card" data-report-id="${esc(r.id)}" data-report-number="${esc(number)}" data-status="${esc(status)}"><span class="pill ${status==='Submitted'?'submitted':''}">${esc(status)}</span><h3>${esc(m.purpose||'Untitled report')}</h3><p class="muted"><span class="report-no">${esc(number||'Not assigned')}</span> · ${esc(m.destination||'No destination')} · ${esc(m.fromDate||'-')} to ${esc(m.toDate||'-')}</p><p class="small muted">${esc(r.userEmail||'')}</p><div class="row"><strong>${money(total)}</strong><span class="muted">${(r.items||[]).length} items</span></div><span class="report-view-tag">${status==='Draft'||status==='Revision Requested'?'Edit draft':'View'}</span><div class="next-step"><b>Next step:</b> ${esc(nextStep(status))}</div></article>`;
  }).join('')||'<div class="card empty">No active reports. Completed reports are available in History.</div>';
  // Compare the source markup, since presentation helpers may decorate the DOM.
  if(list.dashboardMarkup===html)return;
  list.dashboardMarkup=html;
  list.innerHTML=html;
  list.querySelectorAll('[data-report-id]').forEach(card=>card.addEventListener('click',()=>window.openReport?.(card.dataset.reportId)));
}
