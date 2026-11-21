import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';
import { statistics } from '../src/domain.js';
const sample={title:'The Dispossessed',author:'Ursula K. Le Guin',genre:'Science fiction',status:'paused',rating:null,finishedAt:null,nextUp:true,coverKey:null};
test('library lifecycle, persistence, validation and public privacy',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'margin-'));const file=join(dir,'db.json');const store=createStore({file});
 const server=createApp({store,local:true}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function request(path,method='GET',data){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {status:r.status,body:r.status===204?null:await r.json()};}
 try{
  assert.equal((await request('/books','POST',{...sample,title:''})).status,400);
  assert.equal((await request('/books','POST',{...sample,status:'finished'})).status,400);
  assert.equal((await request('/books','POST',{...sample,status:'finished',finishedAt:'2026-02-30'})).status,400);
  const created=await request('/books','POST',sample);assert.equal(created.status,201);const id=created.body.id;
  const other=await store.put({...sample,id:'other',pk:'USER#someone-else',sk:'BOOK#other'});
  assert.equal((await request('/books/other','PUT',sample)).status,404);
  assert.equal((await request('/books/other/entries')).status,404);
  assert.equal((await request('/books')).body.length,1);
  assert.equal((await createStore({file}).get('USER#local-reader','BOOK#'+id)).title,sample.title);
  const entry=await request(`/books/${id}/entries`,'POST',{kind:'highlight',text:'Private words',page:12});assert.equal(entry.status,201);
  assert.equal((await request(`/books/${id}/entries`)).body[0].text,'Private words');
  const share=await request('/share','POST');const pub=await request('/public/'+share.body.token);assert.deepEqual(Object.keys(pub.body.books[0]).sort(),['author','genre','status','title']);assert.equal(JSON.stringify(pub).includes('Private words'),false);
  assert.equal((await request(`/books/${id}`,'PUT',{...sample,coverKey:'covers/another/book/cover'})).status,403);
  await request(`/books/${id}`,'PUT',{...sample,status:'finished',finishedAt:'2026-11-21',rating:5});
  const stats=(await request('/stats')).body;assert.equal(stats.finished,1);assert.equal(stats.averageRating,5);assert.deepEqual(stats.months,[{month:'2026-11',count:1}]);assert.equal((await request('/public/'+share.body.token)).body.books.length,0);
  await request('/share','DELETE');assert.equal((await request('/public/'+share.body.token)).status,404);
  await request('/books/'+id,'DELETE');assert.equal((await request('/books')).body.length,0);assert.equal((await store.list('USER#local-reader#BOOK#'+id)).length,0);assert.ok(await store.get(other.pk,other.sk));
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
test('statistics exclude unrated books and group ratings correctly',()=>{
 const result=statistics([{...sample,rating:4,status:'finished',finishedAt:'2026-01-02'},{...sample,rating:2,status:'finished',finishedAt:'2026-01-20'},{...sample,rating:null},{...sample,genre:'History',rating:5,status:'paused'}]);assert.equal(result.averageRating,11/3);assert.equal(result.genres[0].average,3);assert.equal(result.months[0].count,2);assert.equal(result.nextUp.length,2);
});
test('local authentication is blocked on Lambda',()=>{process.env.AWS_LAMBDA_FUNCTION_NAME='test';try{assert.throws(()=>createApp({local:true}),/cannot run on Lambda/);}finally{delete process.env.AWS_LAMBDA_FUNCTION_NAME;}});
