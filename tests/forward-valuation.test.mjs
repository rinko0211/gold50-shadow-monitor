import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {START,VERSION,valueSession,validateBar,validateValuations,runPerformance} from "../src/forward-valuation.mjs";

const COMMIT="a".repeat(40),HASH="b".repeat(64);
const signal=(date,target={TQQQ:1,GLD:0,CASH:0})=>({marketDataDate:date,target});
const prices=(to=100,tc=98,go=200,gc=202)=>({TQQQ:{open:to,close:tc},GLD:{open:go,close:gc}});
function params(d="2026-10-14",prior=signal("2026-10-13")){return{session:d,previousSignal:prior,prices:prices(),sourceCommit:COMMIT,pricesSha256:HASH}}
test("valuation is prospective; no Oct12/13 retrospective simulated DD",()=>{
 assert.equal(START,"2026-10-14");assert.equal(VERSION,"gold50-valuation-v1");
 assert.throws(()=>valueSession({...params("2026-10-13",signal("2026-10-12"))}),/UNSAFE/);
});
test("first next-open TQQQ shadow exposure pays 8bp and records an actual hypothetical intraday loss",()=>{
 const r=valueSession(params());
 assert.equal(r.signalDate,"2026-10-13");
 assert.equal(r.marketDataDate,"2026-10-14");
 assert.equal(r.continuity.kind,"INITIAL");
 assert.ok(r.index<98&&r.index>97.8);
 assert.ok(r.dd<0&&r.maxDd<0);
 assert.ok(r.costs>0);
 assert.equal(r.orderLegs,1);
 assert.equal(r.brokerOrderAllowed,false);
 assert.equal(r.rawTiingoOhlcPersisted,false);
 assert.equal(JSON.stringify(r).includes('"open"'),false);
 assert.equal(JSON.stringify(r).includes('"close"'),false);
 assert.equal(validateValuations([r]).length,1);
});
test("overnight down gap and unchanged target are marked, not rebalanced every day",()=>{
 const one=valueSession({...params(),prices:prices(100,110,200,201)});
 const two=valueSession({...params("2026-10-15",signal("2026-10-14")),prices:prices(90,92,201,202),previous:one});
 assert.equal(two.continuity.kind,"CONTIGUOUS");
 assert.equal(two.orderLegs,0);
 assert.equal(two.turnover,0);
 assert.equal(two.costs,one.costs);
 assert.ok(two.index<one.index);assert.ok(two.dd<0);
 assert.equal(validateValuations([one,two]).length,2);
});
test("Gold50 50/50 complement only uses frozen previous-day signal, NEVER today's target",()=>{
 const target={TQQQ:0.5,GLD:0.25,CASH:0.25};
 const x=valueSession({...params(),previousSignal:signal("2026-10-13",target),prices:prices(100,100,200,200)});
 assert.ok(Math.abs(x.index-99.94)<.01);
 assert.ok(x.shares.TQQQ>0&&x.shares.GLD>0&&x.cash>0);
 assert.equal(x.orderLegs,2);assert.deepEqual(x.appliedTarget,target);
});
test("noncontiguous market session explicitly resets epoch, never bridges a missing return",()=>{
 const one=valueSession(params());
 const later=valueSession({...params("2026-10-16",signal("2026-10-15")),previous:one});
 assert.equal(later.continuity.kind,"GAP_RESET");
 assert.ok(later.index<100&&later.index>97);
 assert.equal(validateValuations([one,later]).length,2);
 assert.throws(()=>validateValuations([one,{...later,continuity:{kind:"CONTIGUOUS",expectedDate:"2026-10-15"}}]),/PERFORMANCE_ROW_INVALID/);
});
test("never accept current signal as previous close, stale current open, or arbitrary future date",()=>{
 assert.throws(()=>valueSession({...params(),previousSignal:signal("2026-10-14")}),/UNSAFE/);
 assert.throws(()=>valueSession({...params(),prices:prices(0,100,200,202)}),/UNSAFE/);
 assert.throws(()=>valueSession({...params("2026-10-13",signal("2026-10-12"))}),/UNSAFE/);
});
test("bar validation fail-closed for splits, stale, inconsistent OHLC or malformed API",()=>{
 const bar={date:"2026-10-14T00:00:00.000Z",open:100,high:105,low:95,close:103,splitFactor:1};
 assert.deepEqual(validateBar([bar],"2026-10-14"),{open:100,close:103});
 assert.throws(()=>validateBar([{...bar,splitFactor:2}],"2026-10-14"));
 assert.throws(()=>validateBar([{...bar,close:107}],"2026-10-14"));
 assert.throws(()=>validateBar([bar],"2026-10-13"));
 assert.throws(()=>validateBar([bar,bar],"2026-10-14"));
});
test("identity and risk tampering fail close; no trade authority or raw OHLC allowed",()=>{
 const r=valueSession(params());
 assert.throws(()=>validateValuations([{...r,brokerOrderAllowed:true}]));
 assert.throws(()=>validateValuations([{...r,rawTiingoOhlcPersisted:true}]));
 assert.throws(()=>validateValuations([{...r,maxDd:.1}]));
 assert.throws(()=>validateValuations([{...r,sourceCommit:"main"}]));
});
test("prestart script never backfills, never requires price providers, remains nonexecuting",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gold50-risk-"));
 const prefix=join(dir,"");
 await writeFile(join(dir,"ledger.jsonl"),"");
 const goldStatusPath=join(dir,"signal-status.json");
 await writeFile(goldStatusPath,JSON.stringify({baseline:"gold50-prospective-forward-v1-20261012",state:"ACCUMULATING",validObservations:1,lastRecordedSession:"2026-10-13"}));
 const golden={baseline:"gold50-prospective-forward-v1-20261012",strategyId:"TQQQ-Gold50-Research-v0.1",strategyVersion:"gold-overlay-shadow-0.1.0",marketDataDate:"2026-10-13"};
 // Only test source guard through a prestart mocked immutable source. Prior
 // signal ledger not valid here, so this must BLOCK before writing model rows.
 let count=0;
 const fetcher=async()=>{count++;throw Error("NETWORK_OFFLINE")};
 const r=await runPerformance({now:"2026-10-14T09:00:00Z",token:"test",fetcher,
  signalsPath:join(dir,"ledger.jsonl"),signalStatusPath:goldStatusPath,
  rowsPath:join(dir,"performance.jsonl"),statusPath:join(dir,"performance-status.json")});
 assert.equal(r.decision,"BLOCKED");
 assert.equal(r.status.brokerOrderAllowed,false);
 assert.equal(r.status.recordCount,0);
 assert.ok(count>0);
 const s=JSON.parse(await readFile(join(dir,"performance-status.json"),"utf8"));
 assert.equal(s.performanceCertification,"INDICATIVE_NOT_COMPARABLE");
});
