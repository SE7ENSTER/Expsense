/* ExpenseFlow functional staging mobile behavior v0.29.0 */
(function(){
  const MOBILE=900;
  function applyMobile(){
    const mobile=window.innerWidth<=MOBILE;
    document.documentElement.classList.toggle('ef-mobile',mobile);
    document.body.classList.toggle('ef-mobile',mobile);
    if(!mobile)return;
    try{localStorage.setItem('expenseflow_report_view_mode','cards')}catch(e){}
    document.body.classList.add('report-card-mode');
    document.body.classList.remove('report-table-mode');
    const cardsBtn=document.querySelector('[data-report-view="cards"]');
    if(cardsBtn&&!cardsBtn.classList.contains('active'))cardsBtn.click();
    const tableWrap=document.getElementById('reportTableWrap');
    if(tableWrap)tableWrap.style.display='none';
    const list=document.getElementById('reportList');
    if(list)list.style.display='flex';
  }
  let timer;
  window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(applyMobile,120)},{passive:true});
  document.addEventListener('DOMContentLoaded',applyMobile);
  setTimeout(applyMobile,500);
  setTimeout(applyMobile,1800);
  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(applyMobile,100)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  console.log('ExpenseFlow mobile responsive behavior v0.29.0 active');
})();
