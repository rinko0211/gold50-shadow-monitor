import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForFreshSource} from '../src/long-forward.mjs';

const SHA='a'.repeat(40);
const respond=body=>({status:200,ok:true,text:async()=>JSON.stringify(body)});
function mockFeed(dates){
 let reads=0;
 const fetcher=async url=>{
  if(url.includes('/git/ref/'))return respond({ref:'refs/heads/ops-state',object:{type:'commit',sha:SHA}});
  if(url.endsWith('/signal.json')){
   const date=dates[Math.min(reads++,dates.length-1)];
   return respond({dataDate:date,generatedAt:date+'T22:00:00Z'});
  }
  return respond({});
 };
 return {fetcher,reads:()=>reads};
}
test('waits for upstream to advance without synthesizing a session',async()=>{
 const feed=mockFeed(['2026-11-19','2026-11-20']);
 let waits=0;
 const source=await waitForFreshSource({fetcher:feed.fetcher,now:'2026-11-23T12:00:00Z',
  lastSession:'2026-11-19',sleep:async()=>{waits++},delayMs:0});
 assert.equal(source.signal.dataDate,'2026-11-20');
 assert.equal(waits,1);
});
test('fails closed with specific code when source never advances',async()=>{
 const feed=mockFeed(['2026-11-19']);
 await assert.rejects(waitForFreshSource({fetcher:feed.fetcher,now:'2026-11-23T12:00:00Z',
  lastSession:'2026-11-19',sleep:async()=>{},delayMs:0}),{code:'GITHUB_SIGNAL_NOT_UPDATED_AFTER_WAIT'});
});
