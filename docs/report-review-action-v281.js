/* ExpenseFlow v0.28.1 - stable delegated Review actions without DOM rewriting */
(function(){
  function review(id){
    if(!id)return;
    if(typeof window.reviewReport==='function')window.reviewReport(id);
    else if(typeof window.openReport==='function')window.openReport(id);
  }

  document.addEventListener('click',event=>{
    const historyBtn=event.target.closest('[data-history-review],[data-history-btn]');
    if(historyBtn){
      const id=historyBtn.dataset.historyReview||historyBtn.dataset.historyBtn||'';
      if(id){
        event.preventDefault();
        event.stopImmediatePropagation();
        review(id);
      }
      return;
    }

    const tableBtn=event.target.closest('[data-report-review],[data-report-open]');
    if(tableBtn){
      const row=tableBtn.closest('[data-report-row]');
      let id=tableBtn.dataset.reportReview||row?.dataset.reportId||'';
      if(!id&&tableBtn.dataset.reportOpen!==undefined){
        const cardIndex=Number(tableBtn.dataset.reportOpen);
        const cards=[...document.querySelectorAll('#reportList .report-card')].filter(c=>!c.classList.contains('history-hidden'));
        const card=cards[cardIndex];
        const click=card?.getAttribute('onclick')||'';
        id=(click.match(/openReport\(['\"]([^'\"]+)['\"]\)/)||[])[1]||'';
      }
      if(id){
        event.preventDefault();
        event.stopImmediatePropagation();
        review(id);
      }
    }
  },true);

  console.log('ExpenseFlow report review action v0.28.1 stable active');
})();