import {getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,getDocs,query,where} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const auth=getAuth(getApp());
const db=getFirestore(getApp());
let activeReportId='';
let patched=false;
let saving=false;

const $=id=>document.getElementById(id);
const norm=v=>String(v||'').trim().toLowerCase();

function readFormFingerprint(){
  const items=[...document.querySelectorAll('#items .item')].map(item=>{
    const inputs=item.querySelectorAll('input');
    const selects=item.querySelectorAll('select');
    return {
      date:inputs[0]?.value||'',
      desc:norm(inputs[1]?.value),
      category:selects[0]?.value||'',
      currency:selects[1]?.value||'',
      amount:Number(inputs[2]?.value||0),
      fx:Number(inputs[3]?.value||0)
    };
  });
  return {
    employee:norm($('employee')?.value),
    purpose:norm($('purpose')?.value),
    fromDate:$('fromDate')?.value||'',
    toDate:$('toDate')?.value||'',
    destination:norm($('destination')?.value),
    items
  };
}

function reportFingerprint(r){
  const m=r.meta||{};
  return {
    employee:norm(m.employee),
    purpose:norm(m.purpose),
    fromDate:m.fromDate||'',
    toDate:m.toDate||'',
    destination:norm(m.destination),
    items:(r.items||[]).map(i=>({
      date:i.date||'',
      desc:norm(i.desc),
      category:i.category||'',
      currency:i.currency||'',
      amount:Number(i.amount||0),
      fx:Number(i.fx||0)
    }))
  };
}

function sameFingerprint(a,b){
  if(a.employee!==b.employee||a.purpose!==b.purpose||a.fromDate!==b.fromDate||a.toDate!==b.toDate||a.destination!==b.destination)return false;
  if(a.items.length!==b.items.length)return false;
  return a.items.every((x,i)=>{
    const y=b.items[i];
    return x.date===y.date&&x.desc===y.desc&&x.category===y.category&&x.currency===y.currency&&x.amount===y.amount&&x.fx===y.fx;
  });
}

async function matchingDrafts(){
  const user=auth.currentUser;
  if(!user)return [];
  const snap=await getDocs(query(collection(db,'expenseReports'),where('userId','==',user.uid)));
  const form=readFormFingerprint();
  return snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.status==='Draft'&&sameFingerprint(form,reportFingerprint(r)));
}

async function syncActiveIdFromDraft(){
  try{
    const drafts=await matchingDrafts();
    if(drafts.length===1)activeReportId=drafts[0].id;
  }catch(e){console.warn('Draft identity sync failed',e.message)}
}

function patch(){
  if(patched||typeof window.saveReport!=='function'||typeof window.openReport!=='function'||typeof window.newReport!=='function')return;
  patched=true;

  const oldOpen=window.openReport;
  window.openReport=id=>{activeReportId=id||'';return oldOpen(id)};

  const oldNew=window.newReport;
  window.newReport=(open=true)=>{activeReportId='';return oldNew(open)};

  const oldSave=window.saveReport;
  window.saveReport=async(status='Draft')=>{
    if(saving)return alert('Please wait. The report is already being saved.');
    saving=true;
    try{
      if(status==='Submitted'){
        const drafts=await matchingDrafts();
        if(!activeReportId&&drafts.length===1){
          activeReportId=drafts[0].id;
          await oldOpen(activeReportId);
          await new Promise(resolve=>setTimeout(resolve,120));
        }else if(drafts.length>1){
          alert('Multiple matching drafts were found. Please open the intended Draft from Dashboard before submitting.');
          return;
        }
      }
      const result=await oldSave(status);
      if(status==='Draft')await syncActiveIdFromDraft();
      return result;
    }finally{
      saving=false;
    }
  };
}

setTimeout(patch,2200);
setInterval(patch,1500);
console.log('ExpenseFlow save identity guard v0.28.5 active');
