const { randomInt, randomUUID, createHash, timingSafeEqual } = require('node:crypto');
const digest=(uid,version,password)=>createHash('sha256').update(uid+':'+version+':'+password).digest('hex');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');
class SecurityError extends Error { constructor(code,message){super(message);this.code=code;} }
const fail=(code,message)=>{throw new SecurityError(code,message)};
const passwordValid=value=>typeof value==='string'&&value.length>=12&&value.length<=128&&/[a-z]/.test(value)&&/[A-Z]/.test(value)&&/[0-9]/.test(value)&&/[^A-Za-z0-9\s]/.test(value)&&!/[\r\n]/.test(value);
function temporaryPassword(){
 const groups=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghijkmnopqrstuvwxyz','23456789','!@#$%*-_+'];const all=groups.join('');
 const chars=groups.map(group=>group[randomInt(group.length)]);while(chars.length<32)chars.push(all[randomInt(all.length)]);
 for(let index=chars.length-1;index>0;index--){const other=randomInt(index+1);[chars[index],chars[other]]=[chars[other],chars[index]];}return chars.join('');
}
function createSecurity({auth,db,now=()=>Date.now()}){
 const state=uid=>db.doc('accountSecurity/'+uid);
 async function identity(request){
  if(!request.uid||!request.bearer)fail('unauthenticated','Sign in again.');
  let token;try{token=await auth.verifyIdToken(request.bearer,true)}catch{fail('unauthenticated','Your session has expired. Sign in again.')}
  if(token.uid!==request.uid)fail('unauthenticated','Sign in again.');
  const profile=await db.doc('users/'+token.uid).get();
  if(!profile.exists||profile.data().active===false||!['user','manager','finance','admin'].includes(profile.data().role))fail('permission-denied','This account is not active.');
  return {token,profile:profile.data()};
 }
 async function admin(request){
  const caller=await identity(request),snapshot=await state(request.uid).get();
  if(caller.profile.role!=='admin')fail('permission-denied','Admin access required.');
  if(snapshot.exists&&(snapshot.data().mustChangePassword||snapshot.data().requiredVersion!==caller.token.passwordVersion))fail('permission-denied','Complete your password change and sign in again.');
  return caller;
 }
 async function generate(request){
  await admin(request);const {uid,expectedEmail}=request.data||{};
  if(typeof uid!=='string'||!uid||uid.length>128||uid.includes('/')||typeof expectedEmail!=='string')fail('invalid-argument','Select a valid user.');
  if(uid===request.uid)fail('failed-precondition','Use the email reset option for your own account.');
  let target;try{target=await auth.getUser(uid)}catch{fail('not-found','Authentication account not found.')}
  const targetProfile=await db.doc('users/'+uid).get();
  if(!targetProfile.exists||targetProfile.data().active===false||targetProfile.data().role==='disabled'||target.disabled)fail('failed-precondition','Activate this account before resetting its password.');
  if((target.email||'').toLowerCase()!==expectedEmail.trim().toLowerCase())fail('failed-precondition','User email changed. Refresh the user list before resetting.');
  if(!(target.providerData||[]).some(provider=>provider.providerId==='password'))fail('failed-precondition','This user signs in with another provider. Use that provider to recover access.');
  const version=randomUUID(),operation=randomUUID(),password=temporaryPassword(),issued=now(),expires=issued+24*3600000;
  const ref=state(uid),audit=db.collection('passwordResetAudit').doc(operation);
  await db.runTransaction(async transaction=>{
   const previous=await transaction.get(ref),record=previous.exists?previous.data():{};
   if(['issuing','changing'].includes(record.phase)&&record.lockUntil?.toMillis()>now())fail('aborted','A password operation is already running. Please wait.');
   if(record.resetIssuedAt?.toMillis()>now()-10000)fail('resource-exhausted','A password was just generated. Wait 10 seconds before generating another.');
   transaction.set(ref,{mustChangePassword:true,phase:'issuing',requiredVersion:version,temporaryDigest:digest(uid,version,password),operation,resetIssuedAt:Timestamp.fromMillis(issued),temporaryExpiresAt:Timestamp.fromMillis(expires),lockUntil:Timestamp.fromMillis(issued+5*60000),resetBy:request.uid},{merge:true});
   transaction.set(audit,{action:'temporary_password',targetUid:uid,actorUid:request.uid,status:'started',createdAt:FieldValue.serverTimestamp()});
  });
  try{
   await auth.updateUser(uid,{password});await auth.revokeRefreshTokens(uid);
   const latest=await auth.getUser(uid);await auth.setCustomUserClaims(uid,{...latest.customClaims,passwordVersion:version});
   await db.runTransaction(async transaction=>{
    const current=await transaction.get(ref);if(current.data()?.operation!==operation)fail('aborted','Password operation changed. Generate a new temporary password.');
    transaction.update(ref,{phase:'issued',lockUntil:FieldValue.delete(),issuedAt:FieldValue.serverTimestamp()});transaction.update(audit,{status:'issued',completedAt:FieldValue.serverTimestamp()});
   });
   return {uid,email:target.email,temporaryPassword:password,expiresAt:new Date(expires).toISOString()};
  }catch(error){
   await db.runTransaction(async transaction=>{const current=await transaction.get(ref);if(current.data()?.operation===operation){transaction.update(ref,{phase:'failed',lockUntil:FieldValue.delete()});transaction.update(audit,{status:'failed',completedAt:FieldValue.serverTimestamp()});}}).catch(()=>{});
   fail('internal','The reset did not complete. Generate a new temporary password before this user signs in.');
  }
 }
 async function status(request){
  const {token}=await identity(request),snapshot=await state(request.uid).get();if(!snapshot.exists)return{mustChangePassword:false};
  const record=snapshot.data();if(token.passwordVersion!==record.requiredVersion)fail('unauthenticated','Your password has changed. Sign in again.');
  return {mustChangePassword:record.mustChangePassword===true,challenge:record.requiredVersion,expired:record.mustChangePassword&&record.temporaryExpiresAt?.toMillis()<=now(),phase:record.phase};
 }
 async function complete(request){
  const {token}=await identity(request),{newPassword,challenge}=request.data||{};
  if(!passwordValid(newPassword))fail('invalid-argument','Use 12–128 characters with uppercase, lowercase, a number and a symbol.');
  if(token.firebase?.sign_in_provider!=='password')fail('failed-precondition','Sign in with your temporary password first.');
  const ref=state(request.uid),operation=randomUUID(),version=randomUUID();
  await db.runTransaction(async transaction=>{
   const snapshot=await transaction.get(ref),record=snapshot.data();
   if(!record?.mustChangePassword||record.phase!=='issued'||record.requiredVersion!==challenge||token.passwordVersion!==challenge)fail('failed-precondition','This password change request is no longer valid. Sign in again.');
   if(record.temporaryExpiresAt.toMillis()<=now())fail('deadline-exceeded','Temporary password expired. Ask Admin for a new one.');
   if(!record.temporaryDigest)fail('failed-precondition','Ask Admin to generate a new temporary password.');
   if(timingSafeEqual(Buffer.from(record.temporaryDigest,'hex'),Buffer.from(digest(request.uid,challenge,newPassword),'hex')))fail('invalid-argument','Choose a password different from the temporary password.');
   transaction.update(ref,{phase:'changing',operation,lockUntil:Timestamp.fromMillis(now()+5*60000)});
  });
  try{
   await auth.updateUser(request.uid,{password:newPassword});await auth.revokeRefreshTokens(request.uid);
   const latest=await auth.getUser(request.uid);await auth.setCustomUserClaims(request.uid,{...latest.customClaims,passwordVersion:version});
   await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);if(snapshot.data()?.operation!==operation)fail('aborted','Password operation changed. Contact Admin.');
    transaction.update(ref,{mustChangePassword:false,phase:'ready',requiredVersion:version,temporaryDigest:FieldValue.delete(),lockUntil:FieldValue.delete(),passwordChangedAt:FieldValue.serverTimestamp()});
    transaction.set(db.collection('passwordResetAudit').doc(operation),{action:'password_changed',targetUid:request.uid,actorUid:request.uid,status:'completed',createdAt:FieldValue.serverTimestamp()});
   });return{completed:true,signInAgain:true};
  }catch{await db.runTransaction(async transaction=>{const snapshot=await transaction.get(ref);if(snapshot.data()?.operation===operation)transaction.update(ref,{phase:'failed',mustChangePassword:true,lockUntil:FieldValue.delete()});}).catch(()=>{});fail('internal','Password change did not complete. Contact Admin for a new temporary password.');}
 }
 return {generate,status,complete,admin};
}
module.exports={createSecurity,SecurityError,passwordValid,temporaryPassword};
