// Disposable production smoke test. No emails are sent; credentials stay in memory.
// Usage: AWS_PROFILE=margin node scripts/smoke-admin.mjs
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminAddUserToGroupCommand, AdminRemoveUserFromGroupCommand, AdminDeleteUserCommand, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
const region=process.env.AWS_REGION||'us-east-1',stack=process.argv[2]||'margin';
const raw=JSON.parse(execFileSync('aws',['configure','export-credentials','--format','process'],{encoding:'utf8'}));
const client=new CognitoIdentityProviderClient({region,credentials:{accessKeyId:raw.AccessKeyId,secretAccessKey:raw.SecretAccessKey,sessionToken:raw.SessionToken}});
const outputs=JSON.parse(execFileSync('aws',['cloudformation','describe-stacks','--stack-name',stack,'--region',region,'--query','Stacks[0].Outputs','--output','json'],{encoding:'utf8'}));
const config=Object.fromEntries(outputs.map(o=>[o.OutputKey,o.OutputValue]));
const users=[];
const send=(Command,data)=>client.send(new Command({UserPoolId:config.CognitoUserPoolId,...data}));
async function request(path,token,method='GET',body){
 const response=await fetch(config.ApiUrl+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json()};
}
try{
 for(let i=0;i<2;i++){
  const email=`margin-admin-smoke-${randomUUID()}@example.com`,password='Aa1!'+randomBytes(32).toString('base64url');
  const created=await send(AdminCreateUserCommand,{Username:email,MessageAction:'SUPPRESS',UserAttributes:[{Name:'email',Value:email}]});
  const username=created.User.Username;users.push({username});
  await send(AdminSetUserPasswordCommand,{Username:username,Password:password,Permanent:true});
  if(i===0)await send(AdminAddUserToGroupCommand,{Username:username,GroupName:'administrators'});
  const auth=await client.send(new InitiateAuthCommand({ClientId:config.CognitoClientId,AuthFlow:'USER_PASSWORD_AUTH',AuthParameters:{USERNAME:email,PASSWORD:password}}));
  users[i].token=auth.AuthenticationResult.IdToken;
 }
 const [admin,reader]=users;
 assert.equal((await request('/api/me',reader.token)).body.role,'reader');
 assert.equal((await request('/api/admin/users',reader.token)).status,403);
 assert.equal((await request('/api/admin/users/'+reader.username+'/access',reader.token,'PUT',{enabled:false})).status,403);
 console.log('PASS: readers cannot use admin endpoints');
 assert.equal((await request('/api/me',admin.token)).body.role,'admin');
 const listed=await request('/api/admin/users',admin.token);assert.equal(listed.status,200);assert.ok(Array.isArray(listed.body.users));
 console.log('PASS: administrator role and live account listing');
 assert.equal((await request('/api/admin/users/'+admin.username+'/access',admin.token,'PUT',{enabled:false})).status,409);
 const path='/api/admin/users/'+reader.username+'/access';
 assert.equal((await request(path,admin.token,'PUT',{enabled:false})).status,200);
 assert.equal((await request(path,admin.token,'PUT',{enabled:true})).status,200);
 console.log('PASS: disable and enable disposable reader; self-disable blocked');
 await send(AdminRemoveUserFromGroupCommand,{Username:admin.username,GroupName:'administrators'});
 assert.equal((await request('/api/admin/users',admin.token)).status,403);
 console.log('PASS: group removal revokes admin access with existing token');
}finally{
 for(const user of users)await send(AdminDeleteUserCommand,{Username:user.username});
 console.log('Cleaned up disposable smoke-test accounts');
}
