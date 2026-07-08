function groupCompletedReports(){
  const tbody=document.getElementById('adminReports');
  if(!tbody)return;
  if(tbody.querySelector('.category-row'))return;
  const rows=[...tbody.querySelectorAll(':scope > tr')].filter(row=>row.cells.length>1 && !row.classList.contains('category-row'));
  if(!rows.length)return;
  const active=[];
  const completed=[];
  rows.forEach(row=>{
    const text=row.textContent.toLowerCase();
    if(text.includes('reimbursed')||text.includes('closed')) completed.push(row);
    else active.push(row);
  });
  tbody.innerHTML='';
  const addGroup=(name,items)=>{
    if(!items.length)return;
    const tr=document.createElement('tr');
    tr.className='category-row';
    tr.innerHTML=`<td colspan="8">${name} (${items.length})</td>`;
    tbody.appendChild(tr);
    items.forEach(item=>tbody.appendChild(item));
  };
  addGroup('Active / In Progress Reports',active);
  addGroup('Completed / Reimbursed Reports',completed);
}
const oldRefreshCompleted=window.refreshAdmin;
window.refreshAdmin=async()=>{
  if(oldRefreshCompleted) await oldRefreshCompleted();
  setTimeout(groupCompletedReports,350);
};
const oldShowCompleted=window.showView;
window.showView=view=>{
  if(oldShowCompleted) oldShowCompleted(view);
  if(view==='admin') setTimeout(groupCompletedReports,350);
};
setTimeout(groupCompletedReports,1600);
console.log('ExpenseFlow completed report group v22 active');
