#!/usr/bin/env node
/** Gold50 prospective RESEARCH Forward. No broker, orders or raw Tiingo OHLC persistence. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {buildShadowArtifact,sha256,STRATEGY_ID,STRATEGY_VERSION} from './shadow.mjs';
import {sanitizeArtifact,tiingoBarsFromResponse} from './phase-c-monitor.mjs';
import {canonicalDecision} from './audit.mjs';
import {isNyseSession,nextNyseSession} from './calendar.mjs';

export const START='2026-10-12';
export const BASELINE='gold50-prospective-forward-v1-20261012';
const REF_URL='https://api.github.com/repos/rinko0211/tqqq-signal-lab/git/ref/heads/ops-state';
const RAW='https://raw.githubusercontent.com/rinko0211/tqqq-signal-lab/';
const GLD='https://api.tiingo.com/tiingo/daily/GLD/prices';
const SHA40=/^[0-9a-f]{40}$/;
const isoDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'));
const before=(d,days)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-days);return x.toISOString().slice(0,10)};
const errorCode=e=>e instanceof SyntaxError?'INVALID_UPSTREAM_JSON':'SOURCE_OR_PROVIDER_UNAVAILABLE';
const makeStatus=(rows,now,attempt,code)=>({
 schemaVersion:1,baseline:BASELINE,startDate:START,
 state:attempt==='BLOCKED'?'CHECK_DATA':rows.length?'ACCUMULATING':'WAITING_FIRST_VALID_SESSION',
 validObservations:rows.length,lastRecordedSession:rows.at(-1)?.marketDataDate??null,
 lastAllocation:rows.at(-1)?.target??null,
 nextExpectedSession:rows.length?nextNyseSession(rows.at(-1).marketDataDate):START,
 attempt,reasonCode:code??null,evaluatedAt:now,
 performanceCertification:'NOT_AVAILABLE_SIGNAL_TRACK_ONLY',
 mode:'SHADOW_RESEARCH',authority:'NONE_SHADOW_ONLY',
 brokerOrderAllowed:false,manualUserOrdersOnly:true,rawTiingoOhlcPersisted:false
});
export function validateRows(rows){
 if(!Array.isArray(rows))throw Error('INVALID_FORWARD_LEDGER');
 for(let i=0;i<rows.length;i++){
  const r=rows[i];
  if(r?.baseline!==BASELINE||r.strategyId!==STRATEGY_ID||
   r.strategyVersion!==STRATEGY_VERSION||!isoDate(r.marketDataDate)||
   !isNyseSession(r.marketDataDate)||r.marketDataDate<START||
   !SHA40.test(r.sourceCommit)||r.brokerOrderAllowed!==false||
   r.mode!=='SHADOW_RESEARCH'||r.target==null||
   r.execution?.brokerOrderAllowed!==false||
   Math.abs(r.target.TQQQ+r.target.GLD+r.target.CASH-1)>1e-9)
   throw Error('INVALID_FORWARD_RECORD');
  if(i>0&&nextNyseSession(rows[i-1].marketDataDate)!==r.marketDataDate)
   throw Error('FORWARD_LEDGER_DATE_GAP_OR_DUPLICATE');
 }
 return rows;
}
async function load(path){
 let raw='';try{raw=await readFile(path,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
 return validateRows(raw.split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)));
}
async function get(fetcher,url,headers={}){
 const r=await fetcher(url,{method:'GET',redirect:'error',cache:'no-store',
  headers:{'User-Agent':'Gold50-Research-Forward/1',...headers}});
 if(!r||r.status!==200||r.ok!==true)throw Error('HTTP_UPSTREAM_FAILED');
 const body=await r.text();
 if(!body||body.length>1_500_000)throw Error('BODY_INVALID');
 return body;
}
/** GitHub ref is read once; Signal/Status are both read from that one immutable commit. */
export async function pinnedSource(fetcher=globalThis.fetch){
 const root=JSON.parse(await get(fetcher,REF_URL));
 const sha=root?.object?.sha;
 if(root?.ref!=='refs/heads/ops-state'||root.object?.type!=='commit'||!SHA40.test(sha))
  throw Error('UNTRUSTED_OPS_STATE_REF');
 const base=RAW+sha+'/github-pages/public/data/';
 const [signalBytes,statusBytes]=await Promise.all([
  get(fetcher,base+'signal.json'),get(fetcher,base+'status.json')
 ]);
 return{sha,signalBytes,statusBytes,signal:JSON.parse(signalBytes),status:JSON.parse(statusBytes)};
}
export function decideForward({now,source,gold,rows}){
 validateRows(rows);
 if(!source||!SHA40.test(source.sha)||!isoDate(source.signal?.dataDate))
  return{kind:'BLOCKED',code:'INVALID_TQQQ_SOURCE'};
 const d=source.signal.dataDate;
 if(d<START)return{kind:'WAIT',code:'BEFORE_PROSPECTIVE_START'};
 const last=rows.at(-1);
 if(last?.marketDataDate===d){
  return source.signalBytes&&source.statusBytes&&
   last.signalSha256===sha256(source.signalBytes)&&
   last.statusSha256===sha256(source.statusBytes)?
    {kind:'DUPLICATE',code:'EXACT_SESSION_ALREADY_RECORDED'}:
    {kind:'BLOCKED',code:'ORIGINAL_SOURCE_REVISED'};
 }
 const expected=last?nextNyseSession(last.marketDataDate):START;
 if(d!==expected)return{kind:'BLOCKED',code:d>expected?'MISSING_NYSE_SESSION_REQUIRES_REVIEW':'OUT_OF_ORDER_SESSION'};
 if(last&&source.signal?.signal?.previousTarget!==last.sourceTarget)
  return{kind:'BLOCKED',code:'SIGNAL_TARGET_CONTINUITY_MISMATCH'};
 const a=buildShadowArtifact({signal:source.signal,status:source.status,gold,sourceBytes:source.signalBytes,now});
 if(a.status!=='SHADOW_ONLY'||a.diagnostics.issues.length)
  return{kind:'BLOCKED',code:a.diagnostics.issues[0]??'SHADOW_NOT_READY'};
 const replay=buildShadowArtifact({signal:source.signal,status:source.status,gold,sourceBytes:source.signalBytes,now});
 if(sha256(JSON.stringify(canonicalDecision(a)))!==sha256(JSON.stringify(canonicalDecision(replay))))
  return{kind:'BLOCKED',code:'SHADOW_REPLAY_MISMATCH'};
 const safe=sanitizeArtifact(a);
 if(safe.execution.brokerOrderAllowed!==false||safe.diagnostics.authority!=='NONE_SHADOW_ONLY')
  return{kind:'BLOCKED',code:'UNEXPECTED_TRADING_AUTHORITY'};
 return{kind:'APPEND',record:{
  schemaVersion:1,baseline:BASELINE,mode:'SHADOW_RESEARCH',strategyId:STRATEGY_ID,
  strategyVersion:STRATEGY_VERSION,marketDataDate:d,observedAt:now,
  sourceCommit:source.sha,signalSha256:sha256(source.signalBytes),
  statusSha256:sha256(source.statusBytes),gldDataSha256:gold.dataSha256,
  sourceTarget:source.signal.signal.target,
  target:safe.target,execution:{earliestLegalDate:safe.execution.earliestLegalDate,
   estimatedManualOrderLegs:safe.execution.estimatedBrokerLegs,
   actionDay:safe.execution.actionDay,brokerOrderAllowed:false},
  status:'VALID_RESEARCH_SIGNAL',replayVerified:true,
  performanceStatus:'NOT_CERTIFIED_NO_PORTFOLIO_PNL_INFERRED',
  brokerOrderAllowed:false,rawTiingoOhlcPersisted:false
 }};
}
export async function runLongForward({
 now=new Date().toISOString(),token=process.env.TIINGO_API_TOKEN,
 rowsPath=resolve('forward/ledger.jsonl'),statusPath=resolve('forward/status.json'),
 fetcher=globalThis.fetch
}={}){
 const rows=await load(rowsPath);
 let d;
 try{
  const source=await pinnedSource(fetcher);
  if(source.signal.dataDate<START||source.signal.dataDate===rows.at(-1)?.marketDataDate){
   d=decideForward({now,source,gold:null,rows});
  }else if(!token){
   d={kind:'BLOCKED',code:'TIINGO_API_TOKEN_MISSING'};
  }else{
   const url=GLD+'?startDate='+before(source.signal.dataDate,14)+
    '&endDate='+source.signal.dataDate;
   const bytes=await get(fetcher,url,{Authorization:'Token '+token,Accept:'application/json'});
   const gold=tiingoBarsFromResponse(JSON.parse(bytes),now);
   gold.dataSha256=sha256(bytes);
   d=decideForward({now,source,gold,rows});
  }
 }catch(e){d={kind:'BLOCKED',code:errorCode(e)}}
 if(d.kind==='APPEND'){
  await mkdir(dirname(rowsPath),{recursive:true});
  await writeFile(rowsPath,JSON.stringify(d.record)+'\n',{flag:'a',encoding:'utf8'});
  rows.push(d.record);
 }
 const st=makeStatus(rows,now,d.kind,d.code);
 await mkdir(dirname(statusPath),{recursive:true});
 await writeFile(statusPath,JSON.stringify(st,null,2)+'\n','utf8');
 return{decision:d.kind,reason:d.code??null,status:st};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const result=await runLongForward();
 process.stdout.write(JSON.stringify({decision:result.decision,reason:result.reason,
  state:result.status.state,last:result.status.lastRecordedSession,
  brokerOrderAllowed:false})+'\n');
 if(result.decision==='BLOCKED')process.exitCode=1;
}
