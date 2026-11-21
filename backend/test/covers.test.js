import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoverClient, signCoverUpload } from '../src/services/covers.js';

test('browser upload signature binds MIME type and size without signing an empty-body checksum',async()=>{
 const client=createCoverClient({region:'us-east-1',credentials:{accessKeyId:'test',secretAccessKey:'test'}});
 const url=new URL(await signCoverUpload(client,{bucket:'test-bucket',key:'covers/user/book/image',contentType:'image/png',size:100}));
 const signed=url.searchParams.get('X-Amz-SignedHeaders').split(';');
 assert.ok(signed.includes('content-type'));
 assert.ok(signed.includes('content-length'));
 assert.equal(url.searchParams.get('X-Amz-Expires'),'300');
 assert.equal([...url.searchParams.keys()].some(k=>k.includes('checksum')),false);
});
