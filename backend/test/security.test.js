import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

// Real signature verification using a locally generated RSA key, never a network stub.
const pool='us-east-1_TestPool',client='test-client',issuer=`https://cognito-idp.us-east-1.amazonaws.com/${pool}`;
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const verifier=CognitoJwtVerifier.create({userPoolId:pool,clientId:client,tokenUse:'id'});
verifier.cacheJwks({keys:[{...publicKey.export({format:'jwk'}),kid:'test-key',use:'sig',alg:'RS256'}]});
function token(sub,overrides={}) {
 const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const content=encode({alg:'RS256',kid:'test-key'})+'.'+encode({sub,iss:issuer,aud:client,token_use:'id',exp:Math.floor(Date.now()/1000)+300,...overrides});
 return content+'.'+sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url');
}
const book={title:'A reading plan',author:'A writer',genre:'Fiction',status:'to-read',rating:null,finishedAt:null,nextUp:true,coverKey:null};
test('backend rejects invalid JWTs and isolates two authenticated users across all private workflows',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'margin-auth-'));
 const store=createStore({file:join(dir,'db.json')});
 const server=createApp({store,local:false,tokenVerifier:verifier}).listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 async function request(path,method='GET',data,auth=token('alice')){
  const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:data?JSON.stringify(data):undefined});
  return {status:r.status,body:r.status===204?null:await r.json()};
 }
 try {
  for(const auth of [null,'not-a-token',token('alice',{exp:1}),token('alice',{aud:'wrong-client'}),token('alice',{iss:'https://wrong-issuer.example'}),token('alice',{token_use:'access'})]) {
   assert.equal((await request('/books','GET',null,auth)).status,401);
  }
  const forged=token('alice').split('.');forged[1]=Buffer.from(JSON.stringify({sub:'bob',iss:issuer,aud:client,token_use:'id',exp:9999999999})).toString('base64url');
  assert.equal((await request('/books','GET',null,forged.join('.'))).status,401);
  const created=await request('/books','POST',book);assert.equal(created.status,201);const id=created.body.id;
  assert.equal((await request(`/books/${id}/entries`,'POST',{kind:'highlight',text:'Too early'})).status,409);
  const note=await request(`/books/${id}/entries`,'POST',{kind:'note',text:'A private planning note'});assert.equal(note.status,201);
  const bob=token('bob');
  for(const [path,method,data] of [[`/books/${id}`,'PUT',book],[`/books/${id}`,'DELETE'],[`/books/${id}/entries`,'GET'],[`/books/${id}/entries`,'POST',{kind:'note',text:'Intrusion'}],[`/books/${id}/entries/${note.body.id}`,'DELETE'],[`/books/${id}/cover`,'GET'],[`/books/${id}/cover`,'POST',{contentType:'image/jpeg',size:10}]]) {
   assert.equal((await request(path,method,data,bob)).status,404,`${method} ${path}`);
  }
  assert.deepEqual((await request('/books','GET',null,bob)).body,[]);
  assert.equal((await request('/stats','GET',null,bob)).body.total,0);
  const bobsBook=(await request('/books','POST',book,bob)).body;
  assert.equal((await request(`/books/${bobsBook.id}/entries/${note.body.id}`,'DELETE',null,bob)).status,404);
  assert.equal((await request(`/books/${id}/entries`)).body.length,1);
  const share=(await request('/share','POST')).body;
  await request('/share','DELETE',null,bob);
  assert.equal((await request('/public/'+share.token,'GET',null,null)).status,200);
  await request('/share','DELETE');assert.equal((await request('/public/'+share.token,'GET',null,null)).status,404);
  const reading=await request(`/books/${id}`,'PUT',{...book,status:'reading'});assert.equal(reading.body.nextUp,false);
  assert.equal((await request(`/books/${id}/entries`,'POST',{kind:'highlight',text:'Now reading'})).status,201);
  assert.equal((await request(`/books/${id}`,'PUT',{...book,coverKey:`covers/bob/${id}/image`})).status,403);
 } finally {await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
