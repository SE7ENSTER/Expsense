/* ExpenseFlow modern dashboard layout - staging only */
(function(){
  const $=id=>document.getElementById(id);
  function sideNav(){
    if($('efSideNav'))return;
    const nav=document.createElement('aside');nav.id='efSideNav';nav.className='ef-side-nav';
    nav.innerHTML=`<div class="ef-brand">Expense<span>Flow</span></div><div class="ef-menu"><button data-view="dashboard" class="active">⌂ Dashboard</button><button data-view="editor">＋ Create Expense Report</button><button data-view="admin">▦ Management Portal</button><button data-view="dashboard" data-history-jump="1">◷ History</button><button data-view="firebase">⚙ Settings</button></div><div class="ef-help"><strong>Need help?</strong><br>Visit the Help Center or contact support.</div>`;
    document.body.appendChild(nav);
    nav.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{
      const view=btn.dataset.view;
      if(view==='editor'&&window.newReport)window.newReport(true);else window.showView?.(view);
      nav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===btn));
      if(btn.dataset.historyJump)setTimeout(()=>$('reportHistorySection')?.scrollIntoView({behavior:'smooth'}),300);
    }));
  }
  function statusOrder(status){return ['Draft','Submitted','Manager Approved','Reimbursement Processing','Reimbursed'].indexOf(status)}
  function renderDetail(row){
    const panel=$('efDetailPanel');if(!panel||!row)return;
    const status=row.querySelector('.pill')?.textContent?.trim()||'Draft';
    const purpose=row.querySelector('.cell-purpose')?.childNodes[0]?.textContent?.trim()||'Expense Report';
    const sub=row.querySelector('.cell-sub')?.textContent?.trim()||'';
    const total=row.querySelector('.cell-total')?.textContent?.trim()||'HKD 0.00';
    const itemCells=row.querySelectorAll('td');const items=itemCells[4]?.textContent?.trim()||'-';
    const id=row.dataset.reportId||'';
    const current=statusOrder(status);
    const steps=['Draft','Submitted','Manager Review','Finance Processing','Reimbursed'];
    panel.innerHTML=`<h3>${purpose}</h3><div class="ef-detail-meta">${sub}</div><div class="ef-detail-summary"><span><b>${status}</b></span><span>▧ ${items}</span><span>◷ ${total}</span></div><div class="ef-workflow"><h4>Report Workflow</h4>${steps.map((s,i)=>`<div class="ef-step ${i===Math.max(0,current)?'current':''}"><b>${s}</b><br><span>${i<current?'Completed':i===current?'Current':'Pending'}</span></div>`).join('')}</div><button class="ef-open-btn" type="button">${status==='Draft'?'Open Report':'Review Report'}</button>`;
    panel.querySelector('button').onclick=()=>{if(id&&window.reviewReport&&status!=='Draft')window.reviewReport(id);else if(id&&window.openReport)window.openReport(id)};
  }
  function detailPanel(){
    const dash=$('dashboard');if(!dash)return;
    let panel=$('efDetailPanel');if(!panel){panel=document.createElement('aside');panel.id='efDetailPanel';panel.className='ef-detail-panel';dash.appendChild(panel)}
    const rows=[...document.querySelectorAll('#reportTableWrap [data-report-row]')];
    rows.forEach(row=>{if(row.__efDetailBound)return;row.__efDetailBound=true;row.addEventListener('click',()=>{rows.forEach(r=>r.classList.remove('ef-selected'));row.classList.add('ef-selected');renderDetail(row)})});
    const first=rows[0];if(first&&!panel.dataset.ready){panel.dataset.ready='1';first.classList.add('ef-selected');renderDetail(first)}
    if(!first)panel.innerHTML='<h3>No active reports</h3><p class="muted">Create a report to get started.</p>';
  }
  function forceTable(){localStorage.setItem('expenseflow_report_view_mode','table');document.body.classList.add('report-table-mode');document.body.classList.remove('report-card-mode')}
  function init(){sideNav();forceTable();setTimeout(detailPanel,500)}
  const obs=new MutationObserver(()=>{clearTimeout(window.__efModernTimer);window.__efModernTimer=setTimeout(()=>{sideNav();forceTable();detailPanel()},250)});
  obs.observe(document.body,{childList:true,subtree:true});
  setTimeout(init,1800);
  console.log('ExpenseFlow modern dashboard v0.28.6 active');
})();
