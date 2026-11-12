const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const serverRequire=createRequire(require('node:path').resolve('functions/package.json'));
const {initializeApp:adminApp}=serverRequire('firebase-admin/app');
const {getAuth:adminAuth}=serverRequire('firebase-admin/auth');
const {getFirestore:adminDb,Timestamp}=serverRequire('firebase-admin/firestore');
const {initializeApp,deleteApp}=require('firebase/app');
const {getAuth,connectAuthEmulator,signInWithEmailAndPassword,signOut}=require('firebase/auth');
const {getFirestore,connectFirestoreEmulator,getDocFromServer,doc,setDoc}=require('firebase/firestore');
const {getFunctions,connectFunctionsEmulator,httpsCallable}=require('firebase/functions');
const project='demo-expensio-security';
assert.equal(process.env.GCLOUD_PROJECT,project);assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9199');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8280');
const app=adminApp({projectId:project}),auth=adminAuth(app),db=adminDb(app),clients=[];
const core=process.env.SECURITY_CORE_ONLY==='1'?serverRequire('./security.cjs').createSecurity({auth,db}):null;
const handlers={GenerateTemporaryPassword:'generate',PasswordChangeStatus:'status',CompleteTemporaryPassword:'complete'};
let checks=0;function ok(condition,message){assert.ok(condition,message);checks++;console.log('PASS '+message)}
async function denied(task,code){await assert.rejects(task,error=>!code||String(error.code).includes(code));checks++}
function client(name){const app=initializeApp({projectId:project,apiKey:'fake-key',authDomain:project+'.firebaseapp.com'},name);clients.push(app);const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9199',{disableWarnings:true});const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8280);const fn=getFunctions(app,'asia-southeast1');connectFunctionsEmulator(fn,'127.0.0.1',5002);return{app,auth,db,call:async(name,data={})=>core?core[handlers[name]]({uid:auth.currentUser?.uid,bearer:await auth.currentUser?.getIdToken(),data}):httpsCallable(fn,'expensio'+name)(data).then(response=>response.data)}}
const initial='Initial-Example9!',final='Final-Example9!Changed';
async function login(c,uid,password=initial){await signOut(c.auth);return signInWithEmailAndPassword(c.auth,uid+'@example.test',password)}
(async()=>{try{
 for(const [uid,role]of [['admin','admin'],['owner','user'],['manager','manager'],['disabled','user']]){await auth.createUser({uid,email:uid+'@example.test',password:initial});await db.doc('users/'+uid).set({role,active:uid!=='disabled'});}
 await db.doc('expenseReports/sample').set({userId:'owner',status:'Submitted',totalHkd:50});
 const a=client('admin'),o=client('owner'),m=client('manager'),anonymous=client('anonymous');await login(a,'admin');await login(o,'owner');await login(m,'manager');
 ok((await getDocFromServer(doc(o.db,'expenseReports/sample'))).exists(),'owner initially reads own report');
 ok(!(await o.call('PasswordChangeStatus')).mustChangePassword,'existing account needs no change');
 const args={uid:'owner',expectedEmail:'owner@example.test'};
 await denied(()=>anonymous.call('GenerateTemporaryPassword',args),'unauthenticated');
 await denied(()=>m.call('GenerateTemporaryPassword',args),'permission-denied');
 await denied(()=>a.call('GenerateTemporaryPassword',{uid:'admin',expectedEmail:'admin@example.test'}),'failed-precondition');
 await denied(()=>a.call('GenerateTemporaryPassword',{...args,expectedEmail:'wrong@example.test'}),'failed-precondition');
 await denied(()=>a.call('GenerateTemporaryPassword',{uid:'disabled',expectedEmail:'disabled@example.test'}),'failed-precondition');
 const beforeToken=await o.auth.currentUser.getIdToken(),result=await a.call('GenerateTemporaryPassword',args),temp=result.temporaryPassword;
 ok(typeof temp==='string'&&temp.length===32,'temporary password generated once');
 await denied(()=>a.call('GenerateTemporaryPassword',args),'resource-exhausted');
 await denied(()=>getDocFromServer(doc(o.db,'expenseReports/sample')),'permission-denied');
 await denied(()=>signInWithEmailAndPassword(o.auth,'owner@example.test',initial));
 await login(o,'owner',temp);let pending=await o.call('PasswordChangeStatus');ok(pending.mustChangePassword&&pending.phase==='issued'&&!pending.expired,'temporary login requires password change');
 await denied(()=>getDocFromServer(doc(o.db,'expenseReports/sample')),'permission-denied');
 await denied(()=>o.call('CompleteTemporaryPassword',{newPassword:'weak',challenge:pending.challenge}),'invalid-argument');
 await denied(()=>o.call('CompleteTemporaryPassword',{newPassword:final,challenge:'wrong'}),'failed-precondition');
 await denied(()=>o.call('CompleteTemporaryPassword',{newPassword:temp,challenge:pending.challenge}),'invalid-argument');
 await denied(()=>getDocFromServer(doc(a.db,'accountSecurity/owner')),'permission-denied');
 await denied(()=>setDoc(doc(o.db,'accountSecurity/owner'),{mustChangePassword:false}),'permission-denied');
 await denied(()=>getDocFromServer(doc(a.db,'passwordResetAudit/private')),'permission-denied');
 await db.doc('accountSecurity/owner').update({temporaryExpiresAt:Timestamp.fromMillis(Date.now()-1000)});
 ok((await o.call('PasswordChangeStatus')).expired,'expiry reported');
 await denied(()=>o.call('CompleteTemporaryPassword',{newPassword:final,challenge:pending.challenge}),'deadline-exceeded');
 await db.doc('accountSecurity/owner').update({temporaryExpiresAt:Timestamp.fromMillis(Date.now()+600000)});
 ok((await o.call('CompleteTemporaryPassword',{newPassword:final,challenge:pending.challenge})).signInAgain,'password change requires fresh login');
 await denied(()=>getDocFromServer(doc(o.db,'expenseReports/sample')),'permission-denied');
 await denied(()=>signInWithEmailAndPassword(o.auth,'owner@example.test',temp));
 await login(o,'owner',final);ok(!(await o.call('PasswordChangeStatus')).mustChangePassword,'fresh final password clears change gate');ok((await getDocFromServer(doc(o.db,'expenseReports/sample'))).exists(),'new session can read reports');
 const record=(await db.doc('accountSecurity/owner').get()).data(),audits=await db.collection('passwordResetAudit').get(),serialized=JSON.stringify([record,...audits.docs.map(d=>d.data())]);
 ok(!serialized.includes(temp)&&!serialized.includes(final)&&!record.temporaryDigest,'no plaintext passwords retained in state or audit');
 let oldBlocked=false;try{const decoded=await auth.verifyIdToken(beforeToken);oldBlocked=decoded.passwordVersion!==record.requiredVersion;}catch(error){oldBlocked=error.code==='auth/id-token-revoked';}ok(oldBlocked,'old JWT is revoked or fails required password version');
 await db.doc('accountSecurity/owner').update({resetIssuedAt:Timestamp.fromMillis(Date.now()-11000)});
 const concurrent=await Promise.allSettled([a.call('GenerateTemporaryPassword',args),a.call('GenerateTemporaryPassword',args)]);
 ok(concurrent.filter(r=>r.status==='fulfilled').length===1,'concurrent reset returns one password');
 const winner=concurrent.find(r=>r.status==='fulfilled').value;
 await login(o,'owner',winner.temporaryPassword);ok((await o.call('PasswordChangeStatus')).mustChangePassword,'regenerated password requires a new change');winner.temporaryPassword='';result.temporaryPassword='';
 const failedServer=serverRequire('./security.cjs').createSecurity({db,auth:{verifyIdToken:auth.verifyIdToken.bind(auth),getUser:auth.getUser.bind(auth),updateUser:async()=>{throw Error('Synthetic failure')}}});
 const bearer=await a.auth.currentUser.getIdToken();await denied(()=>failedServer.generate({uid:'admin',bearer,data:{uid:'manager',expectedEmail:'manager@example.test'}}),'internal');
 const failedRecord=(await db.doc('accountSecurity/manager').get()).data();ok(failedRecord.phase==='failed'&&failedRecord.mustChangePassword,'Auth write failure leaves account locked for Admin recovery');
 await denied(()=>getDocFromServer(doc(m.db,'expenseReports/sample')),'permission-denied');
 await db.doc('users/admin').update({role:'user'});await denied(()=>a.call('GenerateTemporaryPassword',args),'permission-denied');
 console.log('ACCOUNT_SECURITY_EMULATOR_CHECKS='+checks);
 }finally{await Promise.all(clients.map(deleteApp));await db.terminate();}})().then(()=>process.exit(0),error=>{console.error('Account security check failed:',error.code||error.name,error.message);process.exit(1)});
