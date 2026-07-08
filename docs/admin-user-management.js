import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth,onAuthStateChanged,signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore,collection,doc,getDoc,getDocs,setDoc,serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const firebaseConfig={apiKey:'AIzaSyByUZX7ScSa__yrkmOjh9sbviKg1Qppcl4'};
const auth=getAuth(getApp());
const db=getFirestore(getApp());
let me=null,myProfile={role:'user'},users=[];
const $=id=>document.getElementById(id);
const esc=v=>String(v||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const isAdmin=()=>myProfile.role==='admin';
async function loadMe(user){
  me=user;
  const snap=await getDoc(doc(db,'users',user.uid));
  myProfile=snap.exists()?snap.data():{email:user.email,role:'user'};
  if(myProfile.active===false||myProfile.role==='disabled'){
    alert('This account has been disabled. Please contact Admin.');
    await signOut(auth);
    return;
  }
  if(isAdmin()) setTimeout(loadUsers,700);
}
async function loadUsers(){
  if(!isAdmin())return;
  try{
    const snap=await getDocs(collection(db,'users'));
    users=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.email||'').localeCompare(b.email||''));
    renderAdminUserTools();
  }catch(e){console.warn('Admin user load failed',e)}
}
function userLabel(u){return esc(u.displayName||[u.firstName,u.lastName].filter(Boolean).join(' ')||u.email||u.id)}
function roleOptions(role){return ['user','manager','finance','admin','disabled'].map(r=>`<option value="${r}" ${role===r?'selected':''}>${r}</option>`).join('')}
function renderAdminUserTools(){
  const card=$('adminUsersCard');
  if(!card||!isAdmin())return;
  card.innerHTML=`<div class="admin-note"><h3>Admin Tools: User Management</h3><p class="muted">Create new users, update roles, and deactivate accounts from Management Portal.</p></div><div class="admin-create-user"><h4>Create User</h4><div class="admin-create-grid"><label>Email<input id="adminNewEmail" type="email" placeholder="name@company.com"></label><label>Temporary Password<input id="adminNewPassword" type="password" placeholder="Minimum 6 characters"></label><label>Name<input id="adminNewFirstName" placeholder="Name"></label><label>Last Name<input id="adminNewLastName" placeholder="Last name"></label><label>Employee ID<input id="adminNewEmployeeId" placeholder="Employee ID"></label><label>Office Location<input id="adminNewOfficeLocation" placeholder="Office location"></label><label>Department<input id="adminNewDepartment" placeholder="Department"></label><label>Role<select id="adminNewRole"><option>user</option><option>manager</option><option>finance</option><option>admin</option></select></label></div><div class="admin-create-actions"><button onclick="adminCreateUser()">Create User</button><button class="secondary" onclick="adminClearCreateUser()">Clear</button></div><p id="adminUserMsg" class="small muted"></p></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>User</th><th>Employee ID</th><th>Office</th><th>Department</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>${users.map(u=>`<tr><td><strong>${userLabel(u)}</strong><br><span class="muted small">${esc(u.email||'-')}</span></td><td>${esc(u.employeeId||'-')}</td><td>${esc(u.officeLocation||'-')}</td><td>${esc(u.department||'-')}</td><td><select class="role-select" id="adminRole-${u.id}">${roleOptions(u.role||'user')}</select></td><td><span class="mgmt-chip ${u.active===false||u.role==='disabled'?'red':'ok'}">${u.active===false||u.role==='disabled'?'Disabled':'Active'}</span></td><td><div class="inline-actions"><button class="secondary" onclick="adminSaveUserRole('${u.id}')">Save</button>${u.active===false||u.role==='disabled'?`<button class="secondary" onclick="adminActivateUser('${u.id}')">Activate</button>`:`<button class="danger" onclick="adminDeactivateUser('${u.id}')">Delete / Disable</button>`}</div></td></tr>`).join('')||'<tr><td colspan="7">No users found.</td></tr>'}</tbody></table></div>`;
}
window.adminClearCreateUser=()=>['adminNewEmail','adminNewPassword','adminNewFirstName','adminNewLastName','adminNewEmployeeId','adminNewOfficeLocation','adminNewDepartment'].forEach(id=>$(id)&&($(id).value=''));
window.adminCreateUser=async()=>{
  if(!isAdmin())return alert('Admin only.');
  const msg=$('adminUserMsg');
  const email=$('adminNewEmail').value.trim(),password=$('adminNewPassword').value,firstName=$('adminNewFirstName').value.trim(),lastName=$('adminNewLastName').value.trim(),employeeId=$('adminNewEmployeeId').value.trim(),officeLocation=$('adminNewOfficeLocation').value.trim(),department=$('adminNewDepartment').value.trim(),role=$('adminNewRole').value;
  if(!email||!password||!firstName||!lastName||!employeeId||!officeLocation||!department){msg.textContent='Please complete all create user fields.';return}
  msg.textContent='Creating Firebase Authentication user...';
  try{
    const res=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error?.message||'Cannot create user');
    await setDoc(doc(db,'users',data.localId),{email,firstName,lastName,displayName:`${firstName} ${lastName}`,employeeId,officeLocation,department,role,active:true,createdBy:me.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
    msg.textContent='User created successfully.';
    window.adminClearCreateUser();
    await loadUsers();
  }catch(e){msg.textContent='Create user failed: '+e.message}
};
window.adminSaveUserRole=async uid=>{
  if(!isAdmin())return alert('Admin only.');
  const role=$('adminRole-'+uid).value;
  await setDoc(doc(db,'users',uid),{role,active:role!=='disabled',updatedBy:me.uid,updatedAt:serverTimestamp()},{merge:true});
  await loadUsers();
};
window.adminDeactivateUser=async uid=>{
  if(!isAdmin())return alert('Admin only.');
  if(!confirm('Disable this user? The user will not be able to continue using the app.'))return;
  await setDoc(doc(db,'users',uid),{active:false,role:'disabled',disabledBy:me.uid,disabledAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
  await loadUsers();
};
window.adminActivateUser=async uid=>{
  if(!isAdmin())return alert('Admin only.');
  await setDoc(doc(db,'users',uid),{active:true,role:'user',updatedBy:me.uid,updatedAt:serverTimestamp()},{merge:true});
  await loadUsers();
};
window.refreshAdminUsers=loadUsers;
onAuthStateChanged(auth,u=>{if(u)loadMe(u)});
setInterval(()=>{if(isAdmin())renderAdminUserTools()},4000);
console.log('ExpenseFlow admin user management active');
