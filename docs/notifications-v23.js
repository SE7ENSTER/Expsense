import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth,onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore,collection,addDoc,doc,getDoc,getDocs,setDoc,query,where,serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const auth=getAuth(getApp());
const db=getFirestore(getApp());
let me=null,profile={role:'user'},notifications=[];
const $=id=>document.getElementById(id);
const esc=v=>String(v||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function nowText(ts){const s=ts?.seconds?ts.seconds*1000:Date.now();const diff=Math.max(1,Math.round((Date.now()-s)/60000));if(diff<60)return diff+' min ago';const h=Math.round(diff/60);if(h<24)return h+' hr ago';return Math.round(h/24)+' day ago'}
function buildBell(){
  const actions=document.querySelector('.top-actions');
  if(!actions||$('notifWrap'))return;
  const wrap=document.createElement('div');
  wrap.id='notifWrap';wrap.className='notif-wrap';
  wrap.innerHTML='<button id="notifBell" class="notif-bell" type="button" title="Notifications">🔔<span id="notifBadge" class="notif-badge hide">0</span></button><div id="notifPanel" class="notif-panel hide"><div class="notif-head"><h3>Notifications</h3><div class="notif-actions"><button class="ghost" id="markAllReadBtn">Mark all read</button><button class="ghost" id="closeNotifBtn">Close</button></div></div><div id="notifList" class="notif-list"><div class="notif-empty">No notifications yet.</div></div></div>';
  actions.prepend(wrap);
  $('notifBell').onclick=()=>{$('notifPanel').classList.toggle('hide');renderNotifications()};
  $('closeNotifBtn').onclick=()=>$('notifPanel').classList.add('hide');
  $('markAllReadBtn').onclick=markAllRead;
}
async function loadProfile(user){try{const snap=await getDoc(doc(db,'users',user.uid));profile=snap.exists()?snap.data():{role:'user',email:user.email}}catch(e){profile={role:'user',email:user.email}}}
async function loadNotifications(){
  if(!me)return;
  const all=[];
  try{const own=await getDocs(query(collection(db,'notifications'),where('recipientUserId','==',me.uid)));own.docs.forEach(d=>all.push({id:d.id,...d.data()}))}catch(e){console.warn('Own notification load failed',e.message)}
  try{const roleQ=await getDocs(query(collection(db,'notifications'),where('recipientRole','==',profile.role||'user')));roleQ.docs.forEach(d=>{if(!all.some(x=>x.id===d.id))all.push({id:d.id,...d.data()})})}catch(e){console.warn('Role notification load failed',e.message)}
  if(profile.role==='admin'){
    try{const adminQ=await getDocs(query(collection(db,'notifications'),where('recipientRole','==','admin')));adminQ.docs.forEach(d=>{if(!all.some(x=>x.id===d.id))all.push({id:d.id,...d.data()})})}catch(e){}
  }
  notifications=all.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,40);
  renderNotifications();
}
function renderNotifications(){
  const list=$('notifList'),badge=$('notifBadge'); if(!list||!badge)return;
  const unread=notifications.filter(n=>n.status!=='read').length;
  badge.textContent=unread>99?'99+':String(unread); badge.classList.toggle('hide',unread===0);
  if(!notifications.length){list.innerHTML='<div class="notif-empty">No notifications yet.</div>';return}
  list.innerHTML=notifications.map(n=>`<div class="notif-item ${n.status==='read'?'':'unread'}" onclick="openNotification('${n.id}')"><span class="notif-dot"></span><div><div class="notif-title">${esc(n.title)}</div><div class="notif-msg">${esc(n.message)}</div><span class="notif-kind">${esc(n.type)}</span><div class="notif-time">${nowText(n.createdAt)}</div></div></div>`).join('');
}
async function createNotification(data){
  try{await addDoc(collection(db,'notifications'),{...data,status:'unread',createdBy:me?.uid||'',createdByEmail:me?.email||'',createdAt:serverTimestamp()})}catch(e){console.warn('Notification create failed',e.message)}
}
async function getReport(id){try{const snap=await getDoc(doc(db,'expenseReports',id));return snap.exists()?{id:snap.id,...snap.data()}:null}catch(e){return null}}
function reportNo(r){return r?.reportNo||r?.runNumber||('Report '+String(r?.id||'').slice(0,6))}
function employeeName(r){return r?.meta?.employee||r?.userEmail||'A user'}
async function notifySubmit(){
  let latest=null;
  try{const snap=await getDocs(query(collection(db,'expenseReports'),where('userId','==',me.uid)));snap.docs.forEach(d=>{const r={id:d.id,...d.data()};if(r.status==='Submitted'&&(!latest||(r.updatedAt?.seconds||0)>(latest.updatedAt?.seconds||0)))latest=r})}catch(e){}
  if(!latest)return;
  const rn=reportNo(latest), emp=employeeName(latest);
  await createNotification({recipientRole:'manager',reportId:latest.id,reportNo:rn,type:'report_submitted',title:'New expense report submitted',message:`${emp} submitted ${rn} and is waiting for manager review.`});
  await createNotification({recipientRole:'admin',reportId:latest.id,reportNo:rn,type:'report_submitted',title:'New expense report submitted',message:`${emp} submitted ${rn} and is waiting for review.`});
}
async function notifyManagerAction(id,status){
  const r=await getReport(id); if(!r)return; const rn=reportNo(r), emp=employeeName(r);
  if(status==='Manager Approved'){
    await createNotification({recipientRole:'finance',reportId:id,reportNo:rn,type:'manager_approved',title:'Report ready for reimbursement',message:`${rn} from ${emp} was approved by Manager and is ready for Finance processing.`});
    await createNotification({recipientRole:'admin',reportId:id,reportNo:rn,type:'manager_approved',title:'Report approved by Manager',message:`${rn} from ${emp} was approved by Manager.`});
  } else if(status==='Rejected') {
    await createNotification({recipientUserId:r.userId,reportId:id,reportNo:rn,type:'manager_rejected',title:'Expense report rejected',message:`${rn} was rejected by Manager. Please review the manager comment.`});
  } else if(status==='Revision Requested') {
    await createNotification({recipientUserId:r.userId,reportId:id,reportNo:rn,type:'revision_requested',title:'Revision requested',message:`${rn} requires revision before approval.`});
  }
}
async function notifyFinanceAction(id,status){
  const r=await getReport(id); if(!r)return; const rn=reportNo(r);
  if(status==='Finance Processing'||status==='Reimbursement Processing'){
    await createNotification({recipientUserId:r.userId,reportId:id,reportNo:rn,type:'reimbursement_processing',title:'Reimbursement processing',message:`Finance is processing reimbursement for ${rn}.`});
  }
  if(status==='Reimbursed'){
    await createNotification({recipientUserId:r.userId,reportId:id,reportNo:rn,type:'reimbursed',title:'Reimbursement completed',message:`${rn} has been reimbursed.`});
  }
}
window.openNotification=async id=>{
  const n=notifications.find(x=>x.id===id); if(!n)return;
  try{await setDoc(doc(db,'notifications',id),{status:'read',readAt:serverTimestamp()},{merge:true})}catch(e){}
  $('notifPanel')?.classList.add('hide');
  await loadNotifications();
  if(n.reportId){
    if((profile.role==='manager'||profile.role==='finance'||profile.role==='admin')&&window.showView){window.showView('admin');setTimeout(()=>{if(window.reviewReport)window.reviewReport(n.reportId)},500)}
    else if(window.openReport) window.openReport(n.reportId);
  }
};
async function markAllRead(){
  for(const n of notifications.filter(x=>x.status!=='read')){try{await setDoc(doc(db,'notifications',n.id),{status:'read',readAt:serverTimestamp()},{merge:true})}catch(e){}}
  await loadNotifications();
}
function patchWorkflow(){
  if(window.__notifPatched)return; window.__notifPatched=true;
  const oldSave=window.saveReport;
  if(oldSave) window.saveReport=async(status='Draft')=>{await oldSave(status); if(status==='Submitted') setTimeout(notifySubmit,900)};
  const oldManager=window.managerAction;
  if(oldManager) window.managerAction=async(id,status)=>{await oldManager(id,status); setTimeout(()=>notifyManagerAction(id,status),900)};
  const oldFinance=window.financeAction;
  if(oldFinance) window.financeAction=async(id,status)=>{await oldFinance(id,status); setTimeout(()=>notifyFinanceAction(id,status),900)};
}
onAuthStateChanged(auth,async user=>{me=user;if(user){await loadProfile(user);buildBell();setTimeout(patchWorkflow,1400);setTimeout(loadNotifications,1600);setInterval(loadNotifications,30000)}});
console.log('ExpenseFlow notifications v23 active');
