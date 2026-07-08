import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth,onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore,doc,getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const auth=getAuth(getApp());
const db=getFirestore(getApp());
let profile={};
function el(id){return document.getElementById(id)}
function esc(v){return String(v||'-').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function initials(){const a=(profile.firstName||profile.displayName||profile.email||'U').trim()[0]||'U';return a.toUpperCase()}
function buildProfileButton(user){
  const actions=document.querySelector('.top-actions');
  if(!actions||el('profileBtn'))return;
  const btn=document.createElement('button');
  btn.id='profileBtn';
  btn.type='button';
  btn.className='profile-btn';
  btn.onclick=()=>openUserProfile();
  btn.innerHTML=`<span class="profile-avatar-small">${initials()}</span><span><b>User Profile</b><small>${esc(user.email)}</small></span>`;
  actions.prepend(btn);
}
function updateProfileButton(user){
  const btn=el('profileBtn');
  if(!btn)return;
  btn.innerHTML=`<span class="profile-avatar-small">${initials()}</span><span><b>User Profile</b><small>${esc(user.email)}</small></span>`;
}
function ensureProfileModal(){
  if(el('userProfileModal'))return;
  const m=document.createElement('div');
  m.id='userProfileModal';
  m.className='profile-modal hide';
  m.innerHTML=`<div class="profile-modal-card"><div class="profile-modal-head"><div><h2>User Profile</h2><p class="muted">Signed-in user details from the users collection.</p></div><button class="ghost" onclick="closeUserProfile()">Close</button></div><div id="profileDetails" class="profile-details"></div></div>`;
  document.body.appendChild(m);
}
window.openUserProfile=()=>{
  ensureProfileModal();
  const detail=el('profileDetails');
  const role=profile.role||'user';
  detail.innerHTML=`<div class="profile-hero"><div class="profile-avatar-large">${initials()}</div><div><h3>${esc(profile.displayName || [profile.firstName,profile.lastName].filter(Boolean).join(' ') || profile.email)}</h3><span class="pill ${role}">${esc(role)}</span></div></div><div class="profile-grid"><div><b>Email</b><span>${esc(profile.email)}</span></div><div><b>Name</b><span>${esc(profile.firstName)}</span></div><div><b>Last Name</b><span>${esc(profile.lastName)}</span></div><div><b>Employee ID</b><span>${esc(profile.employeeId)}</span></div><div><b>Office Location</b><span>${esc(profile.officeLocation)}</span></div><div><b>Department</b><span>${esc(profile.department)}</span></div></div>`;
  el('userProfileModal').classList.remove('hide');
};
window.closeUserProfile=()=>el('userProfileModal')?.classList.add('hide');

onAuthStateChanged(auth,async user=>{
  if(!user)return;
  try{const snap=await getDoc(doc(db,'users',user.uid));profile=snap.exists()?snap.data():{email:user.email,role:'user'};profile.email=profile.email||user.email}catch(e){profile={email:user.email,role:'user'}}
  buildProfileButton(user);updateProfileButton(user);
});
console.log('ExpenseFlow profile and dashboard fixes active');
