import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogService } from '../src/services/catalog.js';
import { statistics } from '../src/domain.js';

test('catalog retrieves usable book metadata, limits output, caches searches and rejects unsafe source links',async()=>{
 let calls=0;
 const catalog=createCatalogService({fetcher:async(url,options)=>{
  calls++;assert.equal(url.origin,'https://openlibrary.org');assert.equal(url.searchParams.get('fields'),'key,title,author_name,number_of_pages_median');assert.equal(url.searchParams.get('q'),'Le Guin');assert.equal(url.searchParams.get('limit'),'8');assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>({docs:[{key:'/works/OL123W',title:'The Dispossessed',author_name:['Ursula K. Le Guin'],number_of_pages_median:387},{key:'https://attacker.example',title:'Bad source'}]})};
 }});
 const results=await catalog.search('Le Guin');assert.deepEqual(results,[{title:'The Dispossessed',author:'Ursula K. Le Guin',sourceUrl:'https://openlibrary.org/works/OL123W',pages:387}]);
 await catalog.search('Le Guin');assert.equal(calls,1);
 await assert.rejects(catalog.search('x'),{status:400});
});
test('catalog failures do not return invented results',async()=>{
 for(const fetcher of [async()=>{throw new Error('timeout');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({})})]) {
  await assert.rejects(createCatalogService({fetcher}).search('Fiction'),{status:502});
 }
});
test('genre names cannot modify object prototypes or corrupt statistics',()=>{
 const result=statistics([{genre:'__proto__',rating:5,status:'finished',finishedAt:'2026-11-21'},{genre:'constructor',rating:3,status:'finished',finishedAt:'2026-11-21'}]);
 assert.deepEqual(result.genres,[{genre:'__proto__',average:5,count:1},{genre:'constructor',average:3,count:1}]);
 assert.equal(result.averageRating,4);
});

test('catalog page counts from Open Library are validated before use',async()=>{
 const pages=[412,0,-5,2.5,'300',1000001,null];
 const catalog=createCatalogService({fetcher:async()=>({ok:true,json:async()=>({docs:pages.map((p,i)=>({key:`/works/OL${i+1}W`,title:'Book '+i,author_name:['A'],number_of_pages_median:p}))})})});
 const results=await catalog.search('Book');
 assert.deepEqual(results.map(r=>r.pages),[412,null,null,null,null,null,null]);
});
