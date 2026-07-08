function qs(id){return document.getElementById(id)}
function buildHybridShell(){
  const app=qs('appView');
  const header=document.querySelector('#appView > .top');
  const main=document.querySelector('#appView > main.wrap');
  if(!app||!header||!main||document.querySelector('.app-shell'))return;
  const shell=document.createElement('div');
  shell.className='app-shell';
  const aside=document.createElement('aside');
  aside.className='app-sidebar';
  aside.innerHTML=`<div><p class="sidebar-title">Workspace</p><div class="side-nav"><button data-view="dashboard" class="active">Dashboard</button><button data-view="editor">Expense Report</button><button data-view="admin" id="side-admin">Management Portal</button><button data-view="firebase">System Status</button></div></div><div class="side-footer"><strong>ExpenseFlow</strong><br>Dashboard and Management Portal follow the control-center layout, while Expense Report stays focused for easy user submission.</div>`;
  main.classList.add('main-workspace');
  header.after(shell);
  shell.appendChild(aside);
  shell.appendChild(main);
  aside.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.id==='side-admin'&&qs('tab-admin')?.classList.contains('hide'))return;window.showView&&window.showView(btn.dataset.view);updateSideNav(btn.dataset.view)}));
  updateSideVisibility();
}
function updateSideNav(view){
  document.querySelectorAll('.side-nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
}
function updateSideVisibility(){
  const sideAdmin=qs('side-admin');
  if(sideAdmin&&qs('tab-admin')) sideAdmin.classList.toggle('hide',qs('tab-admin').classList.contains('hide'));
}
const oldShow=window.showView;
window.showView=function(view){oldShow&&oldShow(view);updateSideNav(view);setTimeout(updateSideVisibility,50)};
setInterval(updateSideVisibility,1000);
setTimeout(buildHybridShell,200);
console.log('ExpenseFlow hybrid shell active');
