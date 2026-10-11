import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pinnedSource,decideForward,runLongForward,validateRows,START,BASELINE} from '../src/long-forward.mjs';
import {tiingoBarsFromResponse} from '../src/phase-c-monitor.mjs';
const SHA='a'.repeat(40);
const NOW='2026-10-13T03:37:00.000Z';
function fixture(){
 const signal={
  generatedAt:'2026-10-12T21:30:00.000Z',dataDate:'2026-10-12',
  platformMode:'RESEARCH',assetTicker:'TQQQ',strategyVersion:'VS13-v1.0',state:'latest',
  signal:{date:'2026-10-12',target:0.75,previousTarget:0.75,executionDate:'2026-10-13'}
 };
 const status={generatedAt:signal.generatedAt,actionStatus:'success',
  marketDataDate:signal.dataDate,signalDate:signal.dataDate,state:'latest',errors:[]};
 const bars=[{date:'2026-10-09T00:00:00Z',open:400,high:410,low:399,close:405,splitFactor:1},
  {date:'2026-10-12T00:00:00Z',open:406,high:414,low:405,close:412,splitFactor:1}];
 const signalBytes=JSON.stringify(signal),statusBytes=JSON.stringify(status);
 const source={sha:SHA,signal,status,signalBytes,statusBytes};
 const gold=tiingoBarsFromResponse(bars,NOW);gold.dataSha256='b'.repeat(64);
 return {source,gold,bars};
}
function mockFetch(f){
 const visited=[];
 const fetcher=async(url,options)=>{
  visited.push({url,options});
  let result;
  if(url.endsWith('/git/ref/heads/ops-state'))
   result={ref:'refs/heads/ops-state',object:{type:'commit',sha:SHA}};
  else if(url.endsWith('/signal.json'))result=f.source.signal;
  else if(url.endsWith('/status.json'))result=f.source.status;
  else if(url.startsWith('https://api.tiingo.com/'))result=f.bars;
  else throw new Error('UNEXPECTED_NETWORK_URL');
  return new Response(JSON.stringify(result),{status:200});
 };
 return {fetcher,visited};
}
test('first future eligible NYSE session is 2026-10-12',()=>{
 assert.equal(START,'2026-10-12');assert.equal(BASELINE.includes('20261012'),true);
});
test('pinned ops-state source fetched from ONE immutable SHA, not stale main',async()=>{
 const f=fixture(),m=mockFetch(f),result=await pinnedSource(m.fetcher);
 assert.equal(result.sha,SHA);assert.equal(result.signal.dataDate,'2026-10-12');
 assert.equal(m.visited.length,3);
 assert.ok(m.visited.slice(1).every(x=>x.url.includes('/'+SHA+'/')));
 assert.ok(m.visited.every(x=>x.options.method==='GET'&&x.options.redirect==='error'));
});
test('valid frozen mapper result is appended once and is nonexecuting',()=>{
 const f=fixture(),r=decideForward({now:NOW,...f,rows:[]});
 assert.equal(r.kind,'APPEND');
 assert.deepEqual(r.record.target,{TQQQ:0.75,GLD:0.125,CASH:0.125});
 assert.equal(r.record.execution.earliestLegalDate,'2026-10-13');
 assert.equal(r.record.brokerOrderAllowed,false);
 assert.equal(r.record.rawTiingoOhlcPersisted,false);
 assert.equal(r.record.performanceStatus,'NOT_CERTIFIED_NO_PORTFOLIO_PNL_INFERRED');
 assert.equal('open' in r.record,false);
});
test('prestart historical September source is NOT backfilled',()=>{
 const f=fixture();f.source.signal.dataDate='2026-09-21';
 assert.equal(decideForward({now:NOW,...f,rows:[]}).kind,'WAIT');
});
function shiftTo(f,d,next,now){
 f.source.signal.dataDate=d;
 f.source.signal.generatedAt=d+'T21:30:00.000Z';
 f.source.signal.signal.date=d;
 f.source.signal.signal.executionDate=next;
 f.source.status.generatedAt=f.source.signal.generatedAt;
 f.source.status.marketDataDate=d;
 f.source.status.signalDate=d;
 f.source.signalBytes=JSON.stringify(f.source.signal);
 f.source.statusBytes=JSON.stringify(f.source.status);
 f.gold.retrievedAt=now;
 f.gold.bars.at(-1).date=d;
}
test('missed initial October 12 session may start a NEW labelled segment, no retrospective fill',()=>{
 const f=fixture(),now='2026-10-14T03:37:00.000Z';
 shiftTo(f,'2026-10-13','2026-10-14',now);
 const r=decideForward({now,...f,rows:[]});
 assert.equal(r.kind,'APPEND');
 assert.equal(r.record.continuity.kind,'UNOBSERVED_GAP');
 assert.equal(r.record.continuity.expectedDate,'2026-10-12');
 assert.equal(r.record.execution.estimatedManualOrderLegs,null);
 assert.equal(r.record.execution.manualLegEstimateReliable,false);
 assert.equal(r.record.brokerOrderAllowed,false);
 validateRows([r.record]);
});
test('retry of an exact already persisted session is idempotent',()=>{
 const f=fixture(),first=decideForward({now:NOW,...f,rows:[]});
 const second=decideForward({now:NOW,...f,rows:[first.record]});
 assert.equal(second.kind,'DUPLICATE');
});
test('upstream same-day revision after append halts, preserving original row',()=>{
 const f=fixture(),first=decideForward({now:NOW,...f,rows:[]});
 f.source.statusBytes+=' ';
 assert.equal(decideForward({now:NOW,...f,rows:[first.record]}).code,'ORIGINAL_SOURCE_REVISED');
});
test('later missed NYSE session starts explicit noncontiguous segment with no implied returns',()=>{
 const f=fixture(),first=decideForward({now:NOW,...f,rows:[]});
 const now='2026-10-15T03:37:00.000Z';
 shiftTo(f,'2026-10-14','2026-10-15',now);
 f.source.signal.signal.previousTarget=0.5;
 f.source.signalBytes=JSON.stringify(f.source.signal);
 const r=decideForward({now,...f,rows:[first.record]});
 assert.equal(r.kind,'APPEND');
 assert.equal(r.record.continuity.kind,'UNOBSERVED_GAP');
 assert.equal(r.record.continuity.expectedDate,'2026-10-13');
 assert.equal(r.record.execution.actionDay,null);
 assert.equal(r.record.execution.estimatedManualOrderLegs,null);
 assert.doesNotMatch(JSON.stringify(r.record),/"equity"|"portfolioReturn"/);
 validateRows([first.record,r.record]);
});
test('missing gap annotation and forged contiguous gap record fail immutability',()=>{
 const f=fixture(),first=decideForward({now:NOW,...f,rows:[]});
 const now='2026-10-15T03:37:00.000Z';
 shiftTo(f,'2026-10-14','2026-10-15',now);
 const r=decideForward({now,...f,rows:[first.record]});
 assert.equal(r.kind,'APPEND');
 assert.throws(()=>validateRows([first.record,{...r.record,continuity:undefined}]),/UNATTESTED_FORWARD_GAP/);
 assert.throws(()=>validateRows([first.record,{...r.record,continuity:{...r.record.continuity,expectedDate:'2026-10-12'}}]),/UNATTESTED_FORWARD_GAP/);
});
test('upstream VS13 previous target mismatch blocks new session',()=>{
 const f=fixture(),first=decideForward({now:NOW,...f,rows:[]});
 f.source.signal.dataDate='2026-10-13';
 f.source.signal.signal.previousTarget=0.5;
 assert.equal(decideForward({now:NOW,...f,rows:[first.record]}).code,'SIGNAL_TARGET_CONTINUITY_MISMATCH');
});
test('invalid ledger duplicates or gaps cause validation hard failure',()=>{
 const f=fixture(),first=decideForward({now:NOW,...f,rows:[]});
 assert.throws(()=>validateRows([first.record,first.record]),/FORWARD_LEDGER_DATE_GAP_OR_DUPLICATE/);
});
test('Gold GLD mismatch causes no record to be persisted',()=>{
 const f=fixture();f.gold.bars.at(-1).date='2026-10-09';
 const r=decideForward({now:NOW,...f,rows:[]});
 assert.equal(r.kind,'BLOCKED');
});
test('future retrieved GLD bars must not be used',()=>{
 const f=fixture();f.gold.retrievedAt='2026-10-14T00:00:00.000Z';
 const r=decideForward({now:NOW,...f,rows:[]});
 assert.equal(r.kind,'BLOCKED');
});
test('provider pending source fails closed',()=>{
 const f=fixture();f.source.signal.state='provider_pending';f.source.status.state='provider_pending';
 const r=decideForward({now:NOW,...f,rows:[]});
 assert.equal(r.kind,'BLOCKED');
});
test('runner writes prospective row once and preserves completed Phase C files',async()=>{
 const f=fixture(),m=mockFetch(f),dir=await mkdtemp(join(tmpdir(),'gold-long-forward-'));
 const rowsPath=join(dir,'ledger.jsonl'),statusPath=join(dir,'status.json');
 const a=await runLongForward({now:NOW,token:'fixture-only',rowsPath,statusPath,fetcher:m.fetcher});
 assert.equal(a.decision,'APPEND');assert.equal(a.status.validObservations,1);
 assert.equal(a.status.brokerOrderAllowed,false);
 const b=await runLongForward({now:NOW,token:'fixture-only',rowsPath,statusPath,fetcher:m.fetcher});
 assert.equal(b.decision,'DUPLICATE');assert.equal(b.status.validObservations,1);
 const rows=(await readFile(rowsPath,'utf8')).trim().split('\n');
 assert.equal(rows.length,1);assert.equal(JSON.parse(rows[0]).marketDataDate,'2026-10-12');
 assert.equal(m.visited.filter(x=>x.url.includes('tiingo.com')).length,1);
});
test('missing Tiingo token fails without advancing Forward',async()=>{
 const f=fixture(),m=mockFetch(f),dir=await mkdtemp(join(tmpdir(),'gold-long-no-token-'));
 const r=await runLongForward({now:NOW,token:'',rowsPath:join(dir,'ledger.jsonl'),
  statusPath:join(dir,'status.json'),fetcher:m.fetcher});
 assert.equal(r.decision,'BLOCKED');assert.equal(r.reason,'TIINGO_API_TOKEN_MISSING');
 assert.equal(r.status.validObservations,0);
});
test('untrusted GitHub ref fails closed without reading any price source',async()=>{
 const f=fixture(),m=mockFetch(f),dir=await mkdtemp(join(tmpdir(),'gold-long-badref-'));
 const fetcher=async(url,opts)=>url.includes('/git/ref/heads/ops-state')?
  new Response(JSON.stringify({ref:'refs/heads/main',object:{type:'commit',sha:SHA}}),{status:200}):m.fetcher(url,opts);
 const r=await runLongForward({now:NOW,token:'fixture-only',rowsPath:join(dir,'ledger.jsonl'),
  statusPath:join(dir,'status.json'),fetcher});
 assert.equal(r.decision,'BLOCKED');assert.equal(r.status.validObservations,0);
 assert.equal(m.visited.length,0);
});
test('source fetch outage still leaves an explicit nontrade CHECK_DATA status',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gold-long-offline-'));
 const r=await runLongForward({now:NOW,token:'fixture',rowsPath:join(dir,'ledger.jsonl'),
  statusPath:join(dir,'status.json'),fetcher:async()=>{throw Error('network down')}});
 assert.equal(r.status.state,'CHECK_DATA');assert.equal(r.status.brokerOrderAllowed,false);
 assert.equal(r.status.manualUserOrdersOnly,true);
});
