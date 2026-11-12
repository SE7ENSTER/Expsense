const {SecurityError}=require('./security.cjs');
const TEMPLATE={senderDisplayName:'SLG EXPENSiO',subject:'Reset your EXPENSiO password',bodyFormat:'PLAIN_TEXT',body:'Hello,\n\nFollow this link to reset your EXPENSiO password for your %EMAIL% account:\n\n%LINK%\n\nIf you did not request a password reset, you can ignore this email.\n\nThanks,\nSLG EXPENSiO'};
async function applyEmailBranding({projectId,accessToken,fetcher=fetch}){
 if(!/^[a-z][a-z0-9-]{4,40}$/.test(projectId||''))throw new SecurityError('failed-precondition','Project configuration is unavailable.');
 const prefix='notification.sendEmail.resetPasswordTemplate',mask=Object.keys(TEMPLATE).map(key=>prefix+'.'+key).join(',');
 const response=await fetcher('https://identitytoolkit.googleapis.com/admin/v2/projects/'+projectId+'/config?updateMask='+encodeURIComponent(mask),{method:'PATCH',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({notification:{sendEmail:{resetPasswordTemplate:TEMPLATE}}})});
 if(!response.ok)throw new SecurityError(response.status===403?'permission-denied':'internal','Email branding could not be saved. Configure the sender name and reset template in Firebase Authentication > Templates, or grant the function service account permission to update Auth configuration.');
 const config=await response.json(),saved=config.notification?.sendEmail?.resetPasswordTemplate;
 if(saved?.senderDisplayName!==TEMPLATE.senderDisplayName||saved?.subject!==TEMPLATE.subject||saved?.body!==TEMPLATE.body)throw new SecurityError('internal','Email branding was not confirmed. Check Firebase Authentication > Templates.');
 return{applied:true,senderName:TEMPLATE.senderDisplayName,appName:'EXPENSiO'};
}
module.exports={applyEmailBranding,TEMPLATE};
