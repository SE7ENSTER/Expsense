import {getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const auth=getAuth(getApp()),db=getFirestore(getApp());
const EDITABLE=['Draft','Revision Requested'];
let activeId='',activeStatus='Draft',patched=false,editorObserver=null;
const $=id=>document.getElementById(id);
const canonical=s=>['Finance Processing','Financial Processing'].includes(s)?'Reimbursement Processing':(s||'Draft');
const isLocked=()=>!!activeId&&!EDITABLE.includes(canonical(activeStatus));
async function statusOf(id){try{const s=await getDoc(doc(db,'expenseReports',id));return s.exists()?canonical(s.data().status):'Draft'}catch(e){console.warn('Report status check failed',e.message);return 'Draft'}}
function applyLockedState(){
  const editor=$('editor');if(!editor)return;
  const locked=isLocked();
  editor.dataset.readonly=locked?'true':'false';
  let b=$('editorReadonlyBanner');
  if(!b){b=document.createElement('div');b.id='editorReadonlyBanner';b.className='editor-readonly-banner';editor.prepend(b)}
  b.style.display=locked?'block':'none';
  b.innerHTML=locked?`<strong>Read-only report</strong><br>This report is ${canonical(activeStatus)}. Expense details cannot be edited after submission. Use the Review window for workflow actions.`:'';
  editor.querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=locked;el.setAttribute('aria-disabled',locked?'true':'false')});
  editor.querySelectorAll('input[type="file"]').forEach(el=>el.disabled=locked);
  editor.querySelectorAll('button[onclick*="saveReport"],button[onclick*="addItem"],button[onclick*="removeItem"],button[onclick*="clearForm"]').forEach(btn=>{btn.hidden=locked;btn.disabled=locked});
  document.body.classList.toggle('expense-report-locked',locked);
}
function validate(){const errors=[],bad=[],req=[['employee','Employee name'],['purpose','Business purpose'],['fromDate','Expense period from'],['toDate','Expense period to'],['destination','Destination']];document.querySelectorAll('.field-error').forEach(e=>e.classList.remove('field-error'));$('validationSummary')?.remove();req.forEach(([id,label])=>{const el=$(id);if(!el?.value?.trim()){errors.push(label+' is required.');bad.push(el)}});const from=$('fromDate')?.value,to=$('toDate')?.value;if(from&&to&&to<from){errors.push('To Date cannot be earlier than From Date.');bad.push($('toDate'))}const items=[...document.querySelectorAll('#items .item')];if(!items.length)errors.push('At least one expense item is required.');items.forEach((item,i)=>{const x=item.querySelectorAll('input'),date=x[0],desc=x[1],amount=x[2],fx=x[3];if(!date?.value){errors.push(`Item ${i+1}: date is required.`);bad.push(date)}if(!desc?.value?.trim()){errors.push(`Item ${i+1}: description is required.`);bad.push(desc)}if(!(Number(amount?.value)>0)){errors.push(`Item ${i+1}: amount must be greater than zero.`);bad.push(amount)}if(!(Number(fx?.value)>0)){errors.push(`Item ${i+1}: FX rate must be greater than zero.`);bad.push(fx)}if(date?.value&&from&&date.value<from)errors.push(`Item ${i+1}: date is before report period.`);if(date?.value&&to&&date.value>to)errors.push(`Item ${i+1}: date is after report period.`)});if(!errors.length)return true;bad.filter(Boolean).forEach(e=>e.classList.add('field-error'));const d=document.createElement('div');d.id='validationSummary';d.className='validation-summary';d.innerHTML='<strong>Please correct:</strong><br>'+[...new Set(errors)].map(e=>'• '+e).join('<br>');$('editor')?.prepend(d);alert([...new Set(errors)].join('\n'));return false}
function blockWhenLocked(name){const fn=window[name];if(typeof fn!=='function'||fn.__expenseLockWrapped)return;const wrapped=function(...args){if(isLocked()){alert(`This report is ${canonical(activeStatus)} and is read-only.`);return}return fn.apply(this,args)};wrapped.__expenseLockWrapped=true;window[name]=wrapped}
function patch(){
  if(patched||!window.openReport||!window.newReport||!window.saveReport)return;
  patched=true;
  const oldOpen=window.openReport;
  window.openReport=async id=>{activeId=id;activeStatus=await statusOf(id);oldOpen(id);setTimeout(applyLockedState,0);setTimeout(applyLockedState,150);setTimeout(applyLockedState,500)};
  const oldNew=window.newReport;
  window.newReport=(open=true)=>{activeId='';activeStatus='Draft';const result=oldNew(open);setTimeout(applyLockedState,0);return result};
  const oldSave=window.saveReport;
  window.saveReport=async(status='Draft')=>{const next=canonical(status);if(isLocked()){alert(`This report is ${canonical(activeStatus)} and is read-only.`);return}if(next==='Submitted'&&!validate())return;return oldSave(next)};
  ['addItem','removeItem','setVal','setFile','clearForm'].forEach(blockWhenLocked);
  if(window.financeAction){const f=window.financeAction;window.financeAction=(id,status)=>f(id,canonical(status))}
  const editor=$('editor');
  if(editor&&!editorObserver){editorObserver=new MutationObserver(()=>{if(isLocked())requestAnimationFrame(applyLockedState)});editorObserver.observe(editor,{childList:true,subtree:true})}
}
onAuthStateChanged(auth,u=>{if(!u)return;setTimeout(patch,1200);setTimeout(patch,2200)});
setInterval(()=>{if(!patched)patch()},1000);
console.log('ExpenseFlow staging report lock v0.28.4 active');