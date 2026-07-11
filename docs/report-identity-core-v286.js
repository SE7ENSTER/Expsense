import {getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,query,where,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const auth=getAuth(getApp());
const db=getFirestore(getApp());
let activeDocId='';
let activeSnapshot=null;
let patched=false;
let saving=false;
const $=id=>document.getElementById(id);

function formItems(){
  return [...document.querySelectorAll('#items .item')].map((item,index)=>{
    const inputs=item.querySelectorAll('input');
    const selects=item.querySelectorAll('select');
    const text=item.querySelector('textarea');
    const change=inputs[0]?.getAttribute('onchange')||'';
    const itemId=(change.match(/setVal\(['\"]([^'\"]+)/)||[])[1]||activeSnapshot?.items?.[index]?.id||crypto.randomUUID();
    const prior=activeSnapshot?.items?.find(x=>x.id===itemId)||activeSnapshot?.items?.[index]||{};
    const image=item.querySelector('.preview img')?.src||prior.receiptData||null;
    return {...prior,id:itemId,date:inputs[0]?.value||'',desc:inputs[1]?.value||'',category:selects[0]?.value||'Transportation',currency:selects[1]?.value||'HKD',amount:inputs[2]?.value||'',fx:Number(inputs[3]?.value||1),rateSource:selects[2]?.value||prior.rateSource||'XE manual',note:text?.value||'',receiptData:image,receiptName:prior.receiptName||''};
  });
}
function payload(status){
  const user=auth.currentUser,items=formItems(),totalHkd=items.reduce((sum,x)=>sum+(Number(x.amount)||0)*(Number(x.fx)||0),0);
  return {...(activeSnapshot||{}),id:activeDocId||activeSnapshot?.id||crypto.randomUUID(),status,userId:activeSnapshot?.userId||user.uid,userEmail:activeSnapshot?.userEmail||user.email,meta:{employee:$('employee')?.value||'',company:$('company')?.value||'',purpose:$('purpose')?.value||'',reportCurrency:'HKD',fromDate:$('fromDate')?.value||'',toDate:$('toDate')?.value||'',destination:$('destination')?.value||'',costCenter:$('costCenter')?.value||''},items,totalHkd,updatedAt:serverTimestamp(),createdAt:activeSnapshot?.createdAt||serverTimestamp(),submittedAt:status==='Submitted'?(activeSnapshot?.submittedAt||serverTimestamp()):(activeSnapshot?.submittedAt||null)};
}
async function resolveDocId(passedId){
  if(!passedId||!auth.currentUser)return '';
  const direct=await getDoc(doc(db,'expenseReports',passedId));
  if(direct.exists())return direct.id;
  const snap=await getDocs(query(collection(db,'expenseReports'),where('userId','==',auth.currentUser.uid)));
  const found=snap.docs.find(d=>d.data().id===passedId||d.data().docId===passedId);
  return found?.id||'';
}
async function loadSnapshot(docId){if(!docId)return null;const snap=await getDoc(doc(db,'expenseReports',docId));return snap.exists()?{...snap.data(),docId:snap.id}:null}
async function saveWithStableIdentity(status){
  if(saving)return alert('Please wait. The report is already being saved.');
  if(!auth.currentUser)return alert('Please sign in first.');
  saving=true;
  try{
    let targetId=activeDocId;
    if(!targetId){const ref=doc(collection(db,'expenseReports'));targetId=ref.id;activeDocId=targetId}
    const data=payload(status);data.id=targetId;data.docId=targetId;
    await setDoc(doc(db,'expenseReports',targetId),data,{merge:true});
    activeSnapshot={...data,docId:targetId,id:targetId};
    alert(status==='Submitted'?'Report submitted.':'Draft saved.');
    sessionStorage.setItem('expenseflow-last-report-id',targetId);
    location.reload();
  }catch(e){console.error('Stable save failed',e);alert('Save error: '+e.message)}finally{saving=false}
}
function patch(){
  if(patched||typeof window.openReport!=='function'||typeof window.newReport!=='function'||typeof window.saveReport!=='function')return;
  patched=true;
  const oldOpen=window.openReport;
  window.openReport=async id=>{const docId=await resolveDocId(id);activeDocId=docId;activeSnapshot=await loadSnapshot(docId);if(activeSnapshot&&activeSnapshot.id!==docId){await setDoc(doc(db,'expenseReports',docId),{id:docId,docId},{merge:true});activeSnapshot.id=docId}return oldOpen(id)};
  const oldNew=window.newReport;
  window.newReport=(open=true)=>{activeDocId='';activeSnapshot=null;return oldNew(open)};
  window.saveReport=async(status='Draft')=>saveWithStableIdentity(status);
  console.log('ExpenseFlow stable document identity v0.28.6 active');
}
setTimeout(patch,500);
const patchTimer=setInterval(()=>{patch();if(patched)clearInterval(patchTimer)},250);
