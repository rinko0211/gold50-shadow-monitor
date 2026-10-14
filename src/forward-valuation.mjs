#!/usr/bin/env node
/**
 * Research-only prospective Gold50 equity/DD sub-ledger. Starts 2026-10-14.
 * Uses previous-close Gold50 target at next-session open. Shares are fractional
 * model units, not orders. NEVER persists Tiingo OHLC or revises signal rows.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {sha256} from "./shadow.mjs";
import {pinnedSource,validateRows,BASELINE} from "./long-forward.mjs";
import {nextNyseSession,isCompletedNyseSession,isNyseSession} from "./calendar.mjs";

export const START="2026-10-14", VERSION="gold50-valuation-v1";
const INITIAL=100, COST=0.0008; // 3 bp commission + 5 bp slippage
const good=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
const pos=x=>good(x)&&x>0;
const date=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(Date.parse(x+"T12:00:00Z"))&&new Date(x+"T12:00:00Z").toISOString().slice(0,10)===x;
const sha=x=>typeof x==="string"&&/^[0-9a-f]{64}$/.test(x);
const commit=x=>typeof x==="string"&&/^[0-9a-f]{40}$/.test(x);
const validWeights=w=>w&&["TQQQ","GLD","CASH"].every(k=>good(w[k]))&&
 Math.abs(w.TQQQ+w.GLD+w.CASH-1)<1e-9;
const failure=e=>/^[A-Z0-9_]+$/.test(e?.message||"")?e.message:"PERFORMANCE_SOURCE_UNAVAILABLE";
async function ledger(path,validator){
 let s="";try{s=await readFile(path,"utf8")}catch(e){if(e.code!=="ENOENT")throw e}
 return validator(s.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)));
}
export function validateValuations(rows){
 if(!Array.isArray(rows))throw Error("PERFORMANCE_LEDGER_INVALID");
 for(let i=0;i<rows.length;i++){
  const r=rows[i],prior=rows[i-1],expected=prior?nextNyseSession(prior.marketDataDate):START;
  const continuity=!prior?(r.marketDataDate===START?"INITIAL":"GAP_RESET"):
    r.marketDataDate===expected?"CONTIGUOUS":"GAP_RESET";
  if(r?.version!==VERSION||!date(r.marketDataDate)||r.marketDataDate<START||
   !isNyseSession(r.marketDataDate)||!date(r.signalDate)||nextNyseSession(r.signalDate)!==r.marketDataDate||
   r.marketDataDate<expected||r.continuity?.kind!==continuity||
   r.continuity?.expectedDate!==expected||!commit(r.sourceCommit)||!sha(r.pricesSha256)||
   !validWeights(r.appliedTarget)||!pos(r.index)||!pos(r.peak)||r.index>r.peak+1e-8||
   !good(-r.dd)||!good(-r.maxDd)||r.dd<r.maxDd-1e-10||
   !good(r.shares?.TQQQ)||!good(r.shares?.GLD)||!good(r.cash)||
   !good(r.costs)||!good(r.turnover)||!Number.isSafeInteger(r.orderLegs)||r.orderLegs<0||r.orderLegs>2||
   r.mode!=="SHADOW_RESEARCH"||r.brokerOrderAllowed!==false||
   r.performanceCertification!=="INDICATIVE_NOT_COMPARABLE"||
   r.rawTiingoOhlcPersisted!==false)throw Error("PERFORMANCE_ROW_INVALID");
  if(continuity==="CONTIGUOUS"&&(r.maxDd>prior.maxDd+1e-10||r.costs+1e-9<prior.costs))
   throw Error("PERFORMANCE_RISK_REWIND");
 }
 return rows;
}
export function validateBar(input,session){
 if(!Array.isArray(input)||input.length!==1)throw Error("PRICE_BARS_INVALID");
 const r=input[0],d=typeof r?.date==="string"?r.date.slice(0,10):"";
 if(d!==session||![r.open,r.high,r.low,r.close].every(pos)||
  r.high<Math.max(r.open,r.close)||r.low>Math.min(r.open,r.close)||
  r.splitFactor!==undefined&&Math.abs(r.splitFactor-1)>1e-10||
  r.close/r.open<.5||r.close/r.open>2)throw Error("PRICE_BAR_INVALID_OR_SPLIT");
 return {open:r.open,close:r.close};
}
async function fetchPrice(fetcher,ticker,session,token){
 const url="https://api.tiingo.com/tiingo/daily/"+ticker+"/prices?startDate="+session+"&endDate="+session;
 const r=await fetcher(url,{method:"GET",redirect:"error",cache:"no-store",headers:{
  Authorization:"Token "+token,Accept:"application/json","User-Agent":"Gold50-Risk-Shadow/1"}});
 if(!r?.ok||r.status!==200)throw Error("PRICE_HTTP_INVALID");
 const bytes=await r.text();
 if(!bytes||bytes.length>50000)throw Error("PRICE_RESPONSE_INVALID");
 return {bar:validateBar(JSON.parse(bytes),session),hash:sha256(bytes)};
}
/** No look-ahead: use only previous market day's immutable Gold50 signal. */
export function valueSession({session,previousSignal,prices,previous=null,sourceCommit,pricesSha256}){
 if(!date(session)||session<START||nextNyseSession(previousSignal.marketDataDate)!==session||
  !validWeights(previousSignal.target)||!commit(sourceCommit)||!sha(pricesSha256)||
  !["TQQQ","GLD"].every(k=>pos(prices[k]?.open)&&pos(prices[k]?.close)))throw Error("UNSAFE_VALUATION_INPUT");
 const expected=previous?nextNyseSession(previous.marketDataDate):START;
 if(previous&&session<=previous.marketDataDate)throw Error("PERFORMANCE_SESSION_REORDERED");
 const contiguous=previous?.marketDataDate===previousSignal.marketDataDate&&session===expected;
 const reset=!contiguous;
 const oldT=reset?0:previous.shares.TQQQ,oldG=reset?0:previous.shares.GLD,oldCash=reset?INITIAL:previous.cash;
 const openEquity=oldCash+oldT*prices.TQQQ.open+oldG*prices.GLD.open;
 if(!pos(openEquity))throw Error("PERFORMANCE_OPEN_EQUITY_INVALID");
 const w=previousSignal.target,priorW=contiguous?previous.appliedTarget:null;
 const rebalance=!priorW||["TQQQ","GLD","CASH"].some(k=>Math.abs(priorW[k]-w[k])>1e-12);
 let sharesT=oldT,sharesG=oldG,cash=oldCash,fee=0,turnover=0,legs=0;
 if(rebalance){
  const beforeT=oldT*prices.TQQQ.open,beforeG=oldG*prices.GLD.open;
  for(let n=0;n<24;n++){
   const net=openEquity-fee;
   const candidate=COST*(Math.abs(net*w.TQQQ-beforeT)+Math.abs(net*w.GLD-beforeG));
   if(Math.abs(candidate-fee)<1e-12){fee=candidate;break}fee=candidate;
  }
  const net=openEquity-fee;
  if(!pos(net))throw Error("PERFORMANCE_COST_OVERFLOW");
  const tradeT=net*w.TQQQ-beforeT,tradeG=net*w.GLD-beforeG;
  turnover=Math.abs(tradeT)+Math.abs(tradeG);
  legs=Number(Math.abs(tradeT)>1e-10)+Number(Math.abs(tradeG)>1e-10);
  sharesT=net*w.TQQQ/prices.TQQQ.open;
  sharesG=net*w.GLD/prices.GLD.open;
  cash=net*w.CASH;
 }
 const index=sharesT*prices.TQQQ.close+sharesG*prices.GLD.close+cash;
 if(!pos(index)||!good(cash))throw Error("PERFORMANCE_EQUITY_INVALID");
 const peak=Math.max(reset?INITIAL:previous.peak,index);
 const dd=index/peak-1,maxDd=Math.min(reset?0:previous.maxDd,dd);
 return {schemaVersion:1,version:VERSION,marketDataDate:session,
  signalDate:previousSignal.marketDataDate,sourceCommit,pricesSha256,
  continuity:{kind:!previous&&session===START?"INITIAL":reset?"GAP_RESET":"CONTIGUOUS",expectedDate:expected},
  appliedTarget:w,shares:{TQQQ:sharesT,GLD:sharesG},cash,index,peak,dd,maxDd,
  costs:(reset?0:previous.costs)+fee,turnover,orderLegs:legs,
  mode:"SHADOW_RESEARCH",performanceCertification:"INDICATIVE_NOT_COMPARABLE",
  brokerOrderAllowed:false,rawTiingoOhlcPersisted:false};
}
function status(rows,now,attempt,reason){
 const last=rows.at(-1);
 return {schemaVersion:1,version:VERSION,startDate:START,
  state:attempt==="BLOCKED"?"CHECK_DATA":rows.length?"ACCUMULATING":"WAITING",
  recordCount:rows.length,lastMarketDate:last?.marketDataDate??null,
  index:last?.index??null,dd:last?.dd??null,maxDd:last?.maxDd??null,
  segments:rows.filter(r=>r.continuity.kind!=="CONTIGUOUS").length,
  attempt,reasonCode:reason??null,evaluatedAt:now,mode:"SHADOW_RESEARCH",
  brokerOrderAllowed:false,rawTiingoOhlcPersisted:false,
  performanceCertification:"INDICATIVE_NOT_COMPARABLE"};
}
export async function runPerformance({now=new Date().toISOString(),token=process.env.TIINGO_API_TOKEN,
 fetcher=globalThis.fetch,signalsPath=resolve("forward/ledger.jsonl"),
 signalStatusPath=resolve("forward/status.json"),
 rowsPath=resolve("forward/performance-ledger.jsonl"),
 statusPath=resolve("forward/performance-status.json")}={}){
 const rows=await ledger(rowsPath,validateValuations);
 let attempt="WAIT",reason=null;
 try{
  const source=await pinnedSource(fetcher),d=source.signal.dataDate;
  const signals=await ledger(signalsPath,validateRows);
  const s=JSON.parse(await readFile(signalStatusPath,"utf8"));
  if(s.baseline!==BASELINE||s.state!=="ACCUMULATING"||
   s.lastRecordedSession!==d||s.validObservations!==signals.length||
   signals.at(-1)?.marketDataDate!==d)throw Error("SIGNAL_SOURCE_NOT_READY");
  if(d<START){reason="BEFORE_PERFORMANCE_START"}
  else if(!isCompletedNyseSession(d,now))throw Error("MARKET_NOT_CLOSED");
  else if(rows.at(-1)?.marketDataDate===d){attempt="DUPLICATE";reason="SESSION_ALREADY_RECORDED"}
  else if(!token)throw Error("PRICE_TOKEN_MISSING");
  else{
   const previousSignal=signals.at(-2);
   if(!previousSignal||nextNyseSession(previousSignal.marketDataDate)!==d||
    signals.at(-1).continuity?.kind==="UNOBSERVED_GAP")
    throw Error("MISSING_PREVIOUS_SIGNAL");
   const [a,b]=await Promise.all(["TQQQ","GLD"].map(t=>fetchPrice(fetcher,t,d,token)));
   const incumbentClose=source.signal.assetClose??source.signal.tqqqClose;
   if(!pos(incumbentClose)||Math.abs(a.bar.close/incumbentClose-1)>0.005)
    throw Error("TQQQ_PRICE_SOURCE_MISMATCH");
   const row=valueSession({session:d,previousSignal,previous:rows.at(-1)??null,
    prices:{TQQQ:a.bar,GLD:b.bar},sourceCommit:source.sha,
    pricesSha256:sha256(a.hash+":"+b.hash)});
   await mkdir(dirname(rowsPath),{recursive:true});
   await writeFile(rowsPath,JSON.stringify(row)+"\n",{flag:"a",encoding:"utf8"});
   rows.push(row);attempt="APPEND";
  }
 }catch(e){attempt="BLOCKED";reason=failure(e)}
 const st=status(rows,now,attempt,reason);
 await mkdir(dirname(statusPath),{recursive:true});
 let prior=null;try{prior=JSON.parse(await readFile(statusPath,"utf8"))}catch{}
 if(attempt==="APPEND"||prior?.state!==st.state||prior?.reasonCode!==st.reasonCode||
  prior?.recordCount!==st.recordCount)
  await writeFile(statusPath,JSON.stringify(st,null,2)+"\n","utf8");
 return {decision:attempt,status:st,reason};
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 const r=await runPerformance();
 process.stdout.write(JSON.stringify({decision:r.decision,state:r.status.state,reason:r.reason,
  count:r.status.recordCount,dd:r.status.dd,brokerOrderAllowed:false})+"\n");
 if(r.decision==="BLOCKED")process.exitCode=1;
}
