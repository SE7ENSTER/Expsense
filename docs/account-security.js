import {auth} from './firebase-client.js';
import {getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
import {signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {on} from './app-events.js';
import {formatReportTimestamp} from './report-timeline.js';
const functions=getFunctions(getApp(),'asia-southeast1');
async function call(name,data={}){
 try{return(await httpsCallable(functions,name)(data)).data}
 catch(error){if(['functions/not-found','functions/unavailable'].includes(error.code))throw Error('Account security service is unavailable. Deploy the Server functions and refresh the app.');throw error;}
}
export const generateTemporaryPassword=(uid,expectedEmail)=>call('expensioGenerateTemporaryPassword',{uid,expectedEmail});
export const applyEmailBranding=()=>call('expensioApplyEmailBranding');
function clearDialogs(){
 for(const modal of document.querySelectorAll('.temporary-password-dialog')){modal.querySelectorAll('input').forEach(input=>input.value='');modal.remove();}
 document.getElementById('appView').inert=false;
}
export function showTemporaryPassword(result){
 clearDialogs();const modal=document.createElement('div');modal.className='review-modal temporary-password-dialog';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Temporary password');
 modal.innerHTML='<div class="review-box security-box"><h2>Temporary password</h2><p data-temp-email></p><label>Copy this password now<input data-temp-password readonly autocomplete="off" spellcheck="false"></label><p data-temp-expiry></p><p>The password is shown only here. The user must set a new password before accessing reports.</p><div class="inline-actions"><button type="button" data-temp-copy>Copy password</button><button type="button" class="review-close" data-temp-close>✕ Close</button></div><p data-temp-message role="status"></p></div>';
 const input=modal.querySelector('[data-temp-password]');input.value=result.temporaryPassword;result.temporaryPassword='';
 modal.querySelector('[data-temp-email]').textContent=result.email;modal.querySelector('[data-temp-expiry]').textContent='Expires: '+formatReportTimestamp(result.expiresAt)+' (UTC+7)';
 modal.querySelector('[data-temp-copy]').onclick=async()=>{
  try{await navigator.clipboard.writeText(input.value);modal.querySelector('[data-temp-message]').textContent='Copied. Share the temporary password through your approved private channel.';}
  catch{input.focus();input.select?.();modal.querySelector('[data-temp-message]').textContent='Select and copy the password manually.';}
 };
 modal.querySelector('[data-temp-close]').onclick=clearDialogs;
 document.body.appendChild(modal);document.getElementById('appView').inert=true;modal.querySelector('[data-temp-copy]').focus?.();
}
export async function requirePasswordChange(user){
 const status=await call('expensioPasswordChangeStatus');
 if(auth.currentUser?.uid!==user.uid)return false;
 if(!status.mustChangePassword)return true;
 const section=document.createElement('section');section.id='passwordChangeView';section.className='auth security-password-view';
 section.innerHTML='<form class="login-card security-password-card"><h2>Set a new password</h2><p data-security-email></p><p data-security-help>Change your temporary password before accessing EXPENSiO.</p><label>New password<input type="password" name="newPassword" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Confirm new password<input type="password" name="confirmPassword" autocomplete="new-password" minlength="12" maxlength="128" required></label><p class="small muted">Use 12–128 characters, including uppercase, lowercase, a number and a symbol.</p><button type="submit">Update password</button><button type="button" class="secondary" data-security-signout>Sign out</button><p role="status" data-security-message></p></form>';
 section.querySelector('[data-security-email]').textContent=user.email;
 const form=section.querySelector('form'),submit=form.querySelector('[type=submit]');
 if(status.expired||status.phase!=='issued'){
  submit.disabled=true;form.querySelectorAll('input').forEach(input=>input.disabled=true);
  section.querySelector('[data-security-help]').textContent=status.expired?'Temporary password expired. Ask Admin for a new one.':'Password reset did not complete. Ask Admin for a new temporary password.';
 }
 form.onsubmit=async event=>{
  event.preventDefault();const password=form.querySelector('[name=newPassword]').value,confirmation=form.querySelector('[name=confirmPassword]').value,message=section.querySelector('[data-security-message]');
  if(password!==confirmation){message.textContent='The passwords do not match.';return;}
  if(password.length<12||password.length>128||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!/[^A-Za-z0-9\s]/.test(password)){message.textContent='Use uppercase, lowercase, a number and a symbol, with at least 12 characters.';return;}
  submit.disabled=true;form.querySelectorAll('input').forEach(input=>input.value='');message.textContent='Updating password…';
  try{await call('expensioCompleteTemporaryPassword',{newPassword:password,challenge:status.challenge});await signOut(auth);document.getElementById('authMsg').textContent='Password updated. Sign in with your new password.';}
  catch(error){message.textContent=error.message;submit.disabled=false;}
 };
 section.querySelector('[data-security-signout]').onclick=()=>signOut(auth);
 document.getElementById('authView').classList.add('hide');document.getElementById('appView').classList.add('hide');document.getElementById('authView').after(section);return false;
}
on('session',({user})=>{if(!user){clearDialogs();document.getElementById('passwordChangeView')?.remove();}});
