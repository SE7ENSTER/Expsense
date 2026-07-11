/* ExpenseFlow v0.28.1 - use Management Portal review action from dashboard/history tables */
(function(){
  function review(id){
    if(!id)return;
    if(typeof window.reviewReport==='function'){
      window.reviewReport(id);
      return;
    }
    if(typeof window.openReport==='function')window.openReport(id);
  }

  function updateButtons(){
    document.querySelectorAll('[data-history-btn]').forEach(btn=>{
      btn.textContent='Review';
      btn.classList.add('review-btn');
      btn.setAttribute('aria-label','Review expense report');
    });
    document.querySelectorAll('[data-report-open]').forEach(btn=>{
      btn.textContent='Review';
      btn.classList.add('review-btn');
      btn.setAttribute('aria-label','Review expense report');
    });
  }

  document.addEventListener('click',event=>{
    const historyBtn=event.target.closest('[data-history-btn]');
    if(historyBtn){
      event.preventDefault();
      event.stopImmediatePropagation();
      review(historyBtn.dataset.historyBtn);
      return;
    }
    const tableBtn=event.target.closest('[data-report-open]');
    if(tableBtn){
      const row=tableBtn.closest('[data-report-row]');
      const cardIndex=Number(tableBtn.dataset.reportOpen);
      const cards=[...document.querySelectorAll('#reportList .report-card')];
      const card=cards[cardIndex];
      const click=card?.getAttribute('onclick')||'';
      const id=(click.match(/openReport\(['\"]([^'\"]+)['\"]\)/)||[])[1]||row?.dataset.reportId||'';
      if(id){
        event.preventDefault();
        event.stopImmediatePropagation();
        review(id);
      }
    }
  },true);

  let timer=null;
  new MutationObserver(()=>{
    clearTimeout(timer);
    timer=setTimeout(updateButtons,80);
  }).observe(document.body,{childList:true,subtree:true});

  setTimeout(updateButtons,1800);
  console.log('ExpenseFlow report review action v0.28.1 active');
})();
