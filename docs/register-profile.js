import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth,createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore,doc,setDoc,serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const auth=getAuth(getApp());
const db=getFirestore(getApp());
const id=x=>document.getElementById(x);
function val(x){return (id(x)?.value||'').trim()}
function ensureRegisterModal(){
  if(id('registerModal'))return;
  const m=document.createElement('div');m.id='registerModal';m.className='register-modal hide';
  m.innerHTML=`<div class="register-card"><div class="register-head"><div><h2>Register New User</h2><p class="muted">Create a new ExpenseFlow user profile. The account will be created in Firebase Authentication and saved to the users collection.</p></div><button class="ghost" type="button" onclick="closeRegisterUser()">Close</button></div><div class="register-grid"><label>Company Email<input id="regEmail" type="email" placeholder="name@company.com" autocomplete="email"></label><label>Password<input id="regPassword" type="password" placeholder="Set initial password" autocomplete="new-password"></label><label>Name<input id="regFirstName" placeholder="Name"></label><label>Last Name<input id="regLastName" placeholder="Last name"></label><label>Employee ID<input id="regEmployeeId" placeholder="Employee ID"></label><label>Office Location<input id="regOfficeLocation" placeholder="Office location"></label><label class="full">Department<input id="regDepartment" placeholder="Department"></label></div><div class="register-actions"><button class="ghost" type="button" onclick="closeRegisterUser()">Cancel</button><button type="button" onclick="submitRegisterUser()">Submit Registration</button></div><p id="registerMsg" class="small muted"></p></div>`;
  document.body.appendChild(m);
}
window.openRegisterUser=()=>{ensureRegisterModal();id('regEmail').value=val('email');id('regPassword').value=val('password');id('registerMsg').textContent='';id('registerModal').classList.remove('hide')};
window.closeRegisterUser=()=>id('registerModal')?.classList.add('hide');
window.signUp=()=>window.openRegisterUser();
window.submitRegisterUser=async()=>{
  ensureRegisterModal();
  const msg=id('registerMsg');
  const email=val('regEmail'),password=val('regPassword'),firstName=val('regFirstName'),lastName=val('regLastName'),employeeId=val('regEmployeeId'),officeLocation=val('regOfficeLocation'),department=val('regDepartment');
  if(!email||!password||!firstName||!lastName||!employeeId||!officeLocation||!department){msg.textContent='Please complete all registration fields.';return}
  msg.textContent='Creating user account...';
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,password);
    await setDoc(doc(db,'users',cred.user.uid),{email,firstName,lastName,displayName:`${firstName} ${lastName}`,employeeId,officeLocation,department,role:'user',active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
    msg.textContent='User registered successfully. Signing in...';
    setTimeout(()=>window.closeRegisterUser(),700);
  }catch(e){msg.textContent=e.message}
};
setTimeout(()=>{ensureRegisterModal();const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Register New User');if(btn)btn.onclick=window.openRegisterUser},200);
console.log('ExpenseFlow register profile flow active');
