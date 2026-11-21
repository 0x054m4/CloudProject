import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogService } from '../src/services/catalog.js';
import { statistics } from '../src/domain.js';

test('catalog retrieves usable book metadata, limits output, caches searches and rejects unsafe source links',async()=>{
 let calls=0;
 const catalog=createCatalogService({fetcher:async(url,options)=>{
  calls++;assert.equal(url.origin,'https://openlibrary.org');assert.equal(url.searchParams.get('q'),'Le Guin');assert.equal(url.searchParams.get('limit'),'8');assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>({docs:[{key:'/works/OL123W',title:'The Dispossessed',author_name:['Ursula K. Le Guin']},{key:'https://attacker.example',title:'Bad source'}]})};
 }});
 const results=await catalog.search('Le Guin');assert.deepEqual(results,[{title:'The Dispossessed',author:'Ursula K. Le Guin',sourceUrl:'https://openlibrary.org/works/OL123W'}]);
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
