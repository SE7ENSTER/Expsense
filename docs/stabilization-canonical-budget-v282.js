import {getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,getDocs,doc,getDoc} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const auth=getAuth(getApp()),db=getFirestore(getApp());
const USED=new Set(['Manager Approved','Reimbursement Processing','Finance Processing','Financial Processing','Reimbursed','Closed']);
let me=null,profile={role:'user'},timer=null;
const $=id=>document.getElementById(id),money=n=>'HKD '+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fyOf=r=>r.fiscalYear||(()=>{const x=new Date(r.meta?.fromDate||Date.now());return 'FY'+(x.getMonth()>=10?x.getFullYear()+1:x.getFullYear())})();
const total=r=>+(r.totalHkd||(r.items||[]).reduce((s,i)=>s+(+i.amount||0)*(+i.fx||0),0));
function normalize(){document.querySelectorAll('.pill,.mgmt-chip,option,.next-step').forEach(el=>{el.textContent=el.textContent.replace(/Finance Processing|Financial Processing/g,'Reimbursement Processing')});['totalHero','sideTotal'].forEach(id=>{const el=$(id);if(el&&/^[A-Z]{3}\s/.test(el.textContent))el.textContent=el.textContent.replace(/^[A-Z]{3}\s/,'HKD ')})}
async function verifyBudget(){if(!me||!['admin','manager','finance'].includes(profile.role))return;const fy=$('budgetFySelect')?.value;if(!fy)return;try{const [rs,bs]=await Promise.all([getDocs(collection(db,'expenseReports')),getDocs(collection(db,'budgets'))]);const reports=rs.docs.map(d=>d.data()),budgets=bs.docs.map(d=>d.data());document.querySelectorAll('#budgetRows input[id^="budget-"]').forEach(inp=>{const uid=inp.id.slice(7),b=budgets.find(x=>x.userId===uid&&x.fiscalYear===fy),amount=+(b?.budgetAmount||0),mine=reports.filter(r=>r.userId===uid&&fyOf(r)===fy),used=mine.filter(r=>USED.has(r.status)).reduce((s,r)=>s+total(r),0),pending=mine.filter(r=>r.status==='Submitted').reduce((s,r)=>s+total(r),0),cells=inp.closest('tr')?.querySelectorAll('td');if(cells?.length>=6){cells[3].textContent=money(used);cells[4].textContent=money(pending);cells[5].textContent=money(amount-used-pending)}})}catch(e){console.warn('Budget verification failed',e.message)}}
function run(){normalize();verifyBudget()}
onAuthStateChanged(auth,async u=>{me=u;if(!u)return;try{const s=await getDoc(doc(db,'users',u.uid));profile=s.exists()?s.data():{role:'user'}}catch(e){}setTimeout(run,1800)});
new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,180)}).observe(document.body,{childList:true,subtree:true});
