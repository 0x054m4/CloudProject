import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import serverless from 'serverless-http';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

test('API Gateway REST adapter parses JSON, rejects malformed/oversized bodies, and supports base64 payloads',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'margin-lambda-'));
 const handler=serverless(createApp({local:true,store:createStore({file:join(directory,'db.json')})}));
 const book={title:'Lambda payload',author:'Test author',genre:'Testing',status:'to-read'};
 const invoke=(body,isBase64Encoded=false)=>handler({httpMethod:'POST',path:'/api/books',headers:{'Content-Type':'application/json'},requestContext:{identity:{sourceIp:'127.0.0.1'}},body,isBase64Encoded},{});
 try {
  const response=await invoke(JSON.stringify(book));
  assert.equal(response.statusCode,201);
  assert.equal(JSON.parse(response.body).title,book.title);
  assert.equal((await invoke(Buffer.from(JSON.stringify(book)).toString('base64'),true)).statusCode,201);
  assert.equal((await invoke('{broken')).statusCode,400);
  assert.equal((await invoke(JSON.stringify({...book,title:'x'.repeat(40000)}))).statusCode,413);
 } finally {await rm(directory,{recursive:true,force:true});}
});
