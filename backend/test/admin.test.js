import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminService } from '../src/services/admin.js';
import { createApp } from '../src/app.js';

test('admin service paginates accounts, checks live group membership, and protects administrators',async()=>{
 const calls=[];
 const client={async send(command){calls.push(command);switch(command.constructor.name){
  case 'AdminGetUserCommand':return {Enabled:command.input.Username!=='disabled'};
  case 'AdminListGroupsForUserCommand':return command.input.Username==='admin'?{Groups:[{GroupName:'administrators'}]}:{Groups:[]};
  case 'ListUsersCommand':return {Users:[{Username:'reader',Attributes:[{Name:'email',Value:'reader@example.test'},{Name:'custom:private',Value:'secret'}],Enabled:true,UserStatus:'CONFIRMED',UserCreateDate:new Date('2026-11-01')}],PaginationToken:'next'};
  default:return {};
 }}};
 const admin=createAdminService({client,pool:'pool'});
 assert.equal(await admin.authorize('admin'),true);assert.equal(await admin.authorize('reader'),false);assert.equal(await admin.authorize('disabled'),false);
 const page=await admin.list('cursor');assert.equal(page.nextToken,'next');assert.equal(calls.at(-1).input.PaginationToken,'cursor');assert.equal(JSON.stringify(page).includes('secret'),false);
 await assert.rejects(admin.list(['bad']),e=>e.name==='ZodError');
 await assert.rejects(admin.setEnabled('admin','admin',{enabled:false}),e=>e.status===409);
 await assert.rejects(admin.setEnabled('other','admin',{enabled:false}),e=>e.status===409);
 await assert.rejects(admin.setEnabled('admin','reader',{enabled:'false'}),e=>e.name==='ZodError');
 await admin.setEnabled('admin','reader',{enabled:false});assert.equal(calls.at(-1).constructor.name,'AdminDisableUserCommand');
 await admin.setEnabled('admin','reader',{enabled:true});assert.equal(calls.at(-1).constructor.name,'AdminEnableUserCommand');
});

test('admin endpoints reject readers and stale group claims before invoking operations',async()=>{
 let writes=0;
 const admin={authorize:async username=>username==='admin',list:async()=>({users:[],nextToken:null}),setEnabled:async()=>{writes++;return {enabled:false};}};
 const tokenVerifier={verify:async token=>({sub:token,'cognito:username':token,'cognito:groups':token==='reader'?[]:['administrators']})};
 const server=createApp({local:false,tokenVerifier,admin}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const request=(path,user,method='GET')=>fetch(base+path,{method,headers:{Authorization:'Bearer '+user,'Content-Type':'application/json'},...(method==='PUT'?{body:JSON.stringify({enabled:false})}:{})});
 try{
  for(const user of ['reader','removed']){
   assert.equal((await request('/admin/users',user)).status,403);
   assert.equal((await request('/admin/users/reader/access',user,'PUT')).status,403);
   assert.equal((await (await request('/me',user)).json()).role,'reader');
  }
  assert.equal(writes,0);
  assert.equal((await (await request('/me','admin')).json()).role,'admin');
  assert.equal((await request('/admin/users','admin')).status,200);
  assert.equal((await request('/admin/users/reader/access','admin','PUT')).status,200);assert.equal(writes,1);
 }finally{await new Promise(r=>server.close(r));}
});
