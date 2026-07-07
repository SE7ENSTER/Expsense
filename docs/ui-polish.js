const style=document.createElement('style');
style.textContent=`
.top{min-height:72px}.top>.logo-wrap{display:flex;align-items:center}.profile-card{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #d9e8ff;border-radius:22px;padding:10px 14px;box-shadow:0 10px 24px #10233a0c}.profile-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#eef6ff;color:#0b6bff;font-weight:950}.profile-label{font-size:11px;color:#667085;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.profile-card #userLine{font-size:13px;color:#475467}.hero.compact-hero{grid-template-columns:1fr 300px}.hero-card.blank-banner{min-height:148px;background:linear-gradient(135deg,#ffffff,#f7fbff);color:#101828;border:1px dashed #c9d8ea;box-shadow:0 14px 34px #10233a0f;display:flex;align-items:center;justify-content:center;text-align:center}.hero-card.blank-banner h1{font-size:24px;color:#98a2b3;margin:0}.hero-card.blank-banner p{display:none}.hero-card.blank-banner .eyebrow{border:1px solid #d9e4f2;color:#98a2b3;background:#fff}.pill.manager-approved,.mgmt-chip.manager-approved{background:#ecfdf3!important;color:#027a48!important}.pill.reimbursement-processing,.mgmt-chip.reimbursement-processing{background:#eef4ff!important;color:#3538cd!important}.pill.reimbursed,.mgmt-chip.reimbursed{background:#f0fdf4!important;color:#15803d!important}.pill.rejected,.mgmt-chip.rejected{background:#fff1f3!important;color:#b42336!important}.pill.revision,.mgmt-chip.revision{background:#fff8e6!important;color:#b7791f!important}@media(max-width:900px){.hero.compact-hero{grid-template-columns:1fr}.profile-card{width:100%}.top{gap:12px;flex-wrap:wrap}}
`;
document.head.appendChild(style);
function polishHeader(){
  const top=document.querySelector('.top');
  const actions=document.querySelector('.top-actions');
  const userLine=document.getElementById('userLine');
  if(!top||!actions||!userLine||actions.querySelector('.profile-card'))return;
  const logo=top.querySelector('.logo');
  if(logo&&!logo.parentElement.classList.contains('logo-wrap')){const w=document.createElement('div');w.className='logo-wrap';logo.replaceWith(w);w.appendChild(logo)}
  actions.innerHTML='';
  const card=document.createElement('div');card.className='profile-card';
  card.innerHTML='<div class="profile-avatar">U</div><div><div class="profile-label">User Profile</div></div>';
  card.querySelector('div:last-child').appendChild(userLine);
  const logout=document.createElement('button');logout.className='ghost';logout.textContent='Logout';logout.onclick=()=>window.logout&&window.logout();
  actions.appendChild(card);actions.appendChild(logout);
}
function polishHero(){
  const hero=document.querySelector('.hero');
  const card=document.querySelector('.hero-card');
  if(!hero||!card||card.classList.contains('blank-banner'))return;
  hero.classList.add('compact-hero');card.classList.add('blank-banner');
  card.innerHTML='<div><span class="eyebrow">Banner Area</span><h1>Ready for update</h1></div>';
}
function renameTabs(){
  const d=document.getElementById('tab-dashboard'); if(d)d.textContent='Dashboard';
  const e=document.getElementById('tab-editor'); if(e)e.textContent='Expense Report';
}
function statusText(t){return t==='Finance Processing'||t==='Financial Processing'?'Reimbursement Processing':t}
function statusClass(t){
  const s=String(t||'').toLowerCase();
  if(s.includes('manager approved'))return 'manager-approved';
  if(s.includes('finance processing')||s.includes('financial processing')||s.includes('reimbursement processing'))return 'reimbursement-processing';
  if(s.includes('reimbursed'))return 'reimbursed';
  if(s.includes('rejected'))return 'rejected';
  if(s.includes('revision'))return 'revision';
  return '';
}
function polishStatuses(){
  document.querySelectorAll('.pill,.mgmt-chip').forEach(el=>{
    const old=el.textContent.trim();
    const cls=statusClass(old);
    if(old==='Finance Processing'||old==='Financial Processing')el.textContent=statusText(old);
    if(cls)el.classList.add(cls);
  });
  document.querySelectorAll('td').forEach(td=>{
    if(td.textContent.trim()==='Finance Processing'||td.textContent.trim()==='Financial Processing')td.textContent='Reimbursement Processing';
  });
}
function applyAll(){polishHeader();polishHero();renameTabs();polishStatuses()}
applyAll();
new MutationObserver(applyAll).observe(document.body,{childList:true,subtree:true,characterData:true});
console.log('ExpenseFlow UI polish active');
