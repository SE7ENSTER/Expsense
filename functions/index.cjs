const functions=require('firebase-functions/v1');
const {initializeApp,getApp,applicationDefault}=require('firebase-admin/app');const {getAuth}=require('firebase-admin/auth');const {getFirestore}=require('firebase-admin/firestore');
const {createSecurity,SecurityError}=require('./security.cjs');
initializeApp();const handlers=createSecurity({auth:getAuth(),db:getFirestore()});
const callable=handler=>functions.region('asia-southeast1').runWith({memory:'256MB',timeoutSeconds:60,maxInstances:2,minInstances:0}).https.onCall(async(data,context)=>{
 try{return await handler({uid:context.auth?.uid,bearer:(context.rawRequest.headers.authorization||'').replace(/^Bearer\s+/i,''),data})}
 catch(error){if(error instanceof SecurityError)throw new functions.https.HttpsError(error.code,error.message);throw new functions.https.HttpsError('internal','Account security service could not complete this request.');}
});
exports.expensioGenerateTemporaryPassword=callable(handlers.generate);
exports.expensioPasswordChangeStatus=callable(handlers.status);
exports.expensioCompleteTemporaryPassword=callable(handlers.complete);
exports.expensioApplyEmailBranding=callable(async request=>{
 await handlers.admin(request);
 const {applyEmailBranding}=require('./email-branding.cjs'),token=await applicationDefault().getAccessToken();
 return applyEmailBranding({projectId:getApp().options.projectId||process.env.GCLOUD_PROJECT,accessToken:token.access_token});
});
