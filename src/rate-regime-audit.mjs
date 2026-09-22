#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mapGold50, SOURCE_VERSION, STRATEGY_ID, STRATEGY_VERSION } from "./shadow.mjs";

const TQQQ_BASELINE_SHA = "fa77469d85ac7f37b74500e15afc6793eca6e432";
const MARKET_URL = `https://raw.githubusercontent.com/rinko0211/tqqq-signal-lab/${TQQQ_BASELINE_SHA}/github-pages/public/data/market-data.json`;
const PHASE2_URL = `https://raw.githubusercontent.com/rinko0211/tqqq-signal-lab/${TQQQ_BASELINE_SHA}/github-pages/public/data/phase-2a-core.json`;
const ENGINE_URL = `https://raw.githubusercontent.com/rinko0211/tqqq-signal-lab/${TQQQ_BASELINE_SHA}/lib/engine.ts`;
const TIINGO_ENDPOINT = "https://api.tiingo.com/tiingo/daily/GLD/prices";
const OUTPUT = resolve("audit/rate-regime-2026-09-23.json");
const COST_BPS = 8;
const EPS = 1e-9;

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const mean = (a) => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
const stdev = (a) => {
  if (a.length < 2) return 0;
  const m=mean(a);
  return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));
};
const clamp=(x,lo=0,hi=100)=>Math.max(lo,Math.min(hi,x));
const sma=(x,i,n)=>i<0||i+1<n?Number.NaN:mean(x.slice(i-n+1,i+1));
const change=(x,i,n)=>i<n?0:x[i]/x[i-n]-1;
function rsi(x,i,n=14){
  if(i<n)return 50;
  let up=0,down=0;
  for(let j=i-n+1;j<=i;j++){const d=x[j]-x[j-1];if(d>0)up+=d;else down-=d;}
  return down?100-100/(1+up/down):100;
}
function atrPct(days,i,n=20){
  if(i<n)return 0;
  const tr=[];
  for(let j=i-n+1;j<=i;j++){
    const q=days[j].qqq,prev=days[j-1].qqq.close;
    tr.push(Math.max(q.high-q.low,Math.abs(q.high-prev),Math.abs(q.low-prev))/q.close);
  }
  return mean(tr)*100;
}
function realized(x,i,n=20){
  if(i<n)return 0;
  const a=x.slice(i-n+1,i+1).map((v,j,z)=>j?v/z[j-1]-1:0).slice(1);
  return stdev(a)*Math.sqrt(252)*100;
}

const VS13 = Object.freeze({
  key:"defensive", name:"Volatility Shield", version:SOURCE_VERSION,
  weights:{trend:.27,momentum:.16,volatility:.37,market:.2},
  entry:70, exit:48, strong:82, confirmDays:2, minHold:6, cooldown:8,
  trailStop:.13, mode:"five", ablation:"none"
});

function mapPosition(score,regime){
  if(["急落・危機","下降トレンド"].includes(regime)||score<VS13.exit)return 0;
  return score>=VS13.strong?1:
    score>=VS13.entry+6?.75:
    score>=VS13.entry?.5:
    score>=VS13.exit+8?.25:0;
}

function sourceSignals(days){
  const q=days.map(d=>d.qqq.close),t=days.map(d=>d.tqqq.close),spy=days.map(d=>d.spy.close),out=[];
  let target=0,hold=0,cool=0,trail=0;
  for(let i=0;i<days.length;i++){
    const d=days[i],m50=sma(q,i,50),m200=sma(q,i,200),m200old=sma(q,i-20,200),
      mom=change(q,i,63),spy200=sma(spy,i,200),spyMom=change(spy,i,63),rs=rsi(q,i),
      rv=realized(q,i),at=atrPct(days,i),v=d.vix.close;
    const trend=Number.isFinite(m200)
      ?clamp((q[i]>m200?38:8)+(Number.isFinite(m50)&&m50>m200?31:8)+(Number.isFinite(m200old)&&m200>m200old?31:8))
      :25;
    const momentum=clamp(50+mom*190+(rs>=48&&rs<=70?10:rs>78?-18:rs<35?-8:0));
    const volatility=clamp(100-(Math.max(0,rv-12)*2.1+Math.max(0,v-15)*2.2+Math.max(0,at-1)*10));
    const market=Number.isFinite(spy200)
      ?clamp(20+(spy[i]>spy200?42:5)+(spyMom>0?28:5)+clamp(spyMom*80,-10,10))
      :25;
    const score=Math.round(trend*.27+momentum*.16+volatility*.37+market*.2);
    const regime=v>=38||(Number.isFinite(m200)&&q[i]<m200&&mom<-.12)?"急落・危機":
      v>=28?"高ボラ":
      Number.isFinite(m50)&&q[i]>m50&&m50>m200&&mom>.04?"強い上昇":
      Number.isFinite(m200)&&q[i]>m200?"弱い上昇":
      Number.isFinite(m200)&&q[i]<m200&&m200<m200old?"下降トレンド":"レンジ";
    const previousTarget=target;
    if(target>0){hold++;trail=Math.max(trail,t[i]);}else{hold=0;if(cool>0)cool--;}
    let desired=i<200?0:mapPosition(score,regime);
    const crisis=regime==="急落・危機"||(target>0&&trail>0&&t[i]/trail-1<-VS13.trailStop);
    if(crisis)desired=0;
    if(desired>target&&cool>0)desired=target;
    const threshold=desired>target?VS13.entry:VS13.exit;
    const confirmed=out.slice(-VS13.confirmDays)
      .filter(s=>desired>target?s.score>=threshold:s.score<threshold).length>=Math.max(1,VS13.confirmDays-1);
    if(desired!==target&&!crisis&&!confirmed)desired=target;
    if(desired<target&&desired===0&&hold<VS13.minHold&&!crisis)desired=target;
    if(target>0&&desired===0){cool=VS13.cooldown;trail=0;}
    target=desired;
    out.push({date:d.date,score,regime,target,previousTarget});
  }
  return out;
}

function parseMarket(payload){
  const symbols=["TQQQ","QQQ","SPY","VIX"];
  const maps=Object.fromEntries(symbols.map(s=>[s,new Map(payload.series[s].map(x=>[x.date,x]))]));
  const dates=[...maps.TQQQ.keys()].filter(d=>symbols.every(s=>maps[s].has(d))).sort();
  return dates.map(date=>({date,tqqq:maps.TQQQ.get(date),qqq:maps.QQQ.get(date),spy:maps.SPY.get(date),vix:maps.VIX.get(date)}));
}

function sourceBacktest(days,signals){
  let position=0,equity=1;
  const daily=[];
  for(let i=1;i<days.length;i++){
    const d=days[i],prev=days[i-1],execSignal=signals[i-1],start=equity;
    equity*=1+position*(d.tqqq.open/prev.tqqq.close-1);
    let action=false,turnover=0;
    if(execSignal&&execSignal.target!==position){
      turnover=Math.abs(execSignal.target-position);
      equity*=1-turnover*COST_BPS/10000;
      position=execSignal.target;
      action=true;
    }
    equity*=1+position*(d.tqqq.close/d.tqqq.open-1);
    daily.push({date:d.date,dailyReturn:equity/start-1,equity,position,action,turnover});
  }
  return daily;
}

function overlayBacktest(days,signals,gldByDate){
  const missing=days.filter(d=>d.date>="2016-09-21"&&!gldByDate.has(d.date)).map(d=>d.date);
  if(missing.length) throw new Error(`GLD_COVERAGE_GAP:${missing.slice(0,10).join(",")} total=${missing.length}`);
  let sourceTarget=0,equity=1;
  const daily=[];
  for(let i=1;i<days.length;i++){
    const d=days[i],prev=days[i-1],execSignal=signals[i-1],
      g=gldByDate.get(d.date),pg=gldByDate.get(prev.date),start=equity;
    if(!g||!pg) continue;
    const before=mapGold50(sourceTarget);
    equity*=1+before.TQQQ*(d.tqqq.open/prev.tqqq.close-1)+before.GLD*(g.open/pg.close-1);
    let action=false,turnover=0;
    if(execSignal&&execSignal.target!==sourceTarget){
      const after=mapGold50(execSignal.target);
      turnover=Math.abs(after.TQQQ-before.TQQQ)+Math.abs(after.GLD-before.GLD);
      equity*=1-turnover*COST_BPS/10000;
      sourceTarget=execSignal.target;
      action=true;
    }
    const weights=mapGold50(sourceTarget);
    equity*=1+weights.TQQQ*(d.tqqq.close/d.tqqq.open-1)+weights.GLD*(g.close/g.open-1);
    daily.push({
      date:d.date,dailyReturn:equity/start-1,equity,sourceTarget,
      weights,action,turnover
    });
  }
  return daily;
}

function summarize(daily,start,end){
  const x=daily.filter(d=>d.date>=start&&d.date<=end);
  if(!x.length)return {start,end,sessions:0};
  let growth=1,curve=1,peak=1,maxDd=0,totalTurnover=0;
  for(const d of x){
    growth*=1+d.dailyReturn;curve*=1+d.dailyReturn;peak=Math.max(peak,curve);
    maxDd=Math.min(maxDd,curve/peak-1);totalTurnover+=d.turnover??0;
  }
  const years=x.length/252;
  const tqqqWeights=x.map(d=>d.weights?.TQQQ??d.position??0);
  const gldWeights=x.map(d=>d.weights?.GLD??0);
  const cashWeights=x.map(d=>d.weights?.CASH??(1-(d.position??0)));
  return {
    start,end,sessions:x.length,totalReturn:growth-1,
    cagr:years>0?growth**(1/years)-1:null,maxDd,
    annualizedVolatility:stdev(x.map(d=>d.dailyReturn))*Math.sqrt(252),
    avgTqqqWeight:mean(tqqqWeights),avgGldWeight:mean(gldWeights),avgCashWeight:mean(cashWeights),
    actionDays:x.filter(d=>d.action).length,totalTurnover
  };
}

function yearly(daily,year){
  return summarize(daily,`${year}-01-01`,`${year}-12-31`);
}

function closeEnough(a,b,tol=1e-8){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol;}

async function fetchText(url,options={}){
  const r=await fetch(url,{...options,redirect:"error",headers:{"User-Agent":"gold50-rate-regime-audit/1.0",...(options.headers??{})}});
  if(!r.ok)throw new Error(`HTTP_${r.status}_${url}`);
  return r.text();
}

async function main(){
  const token=process.env.TIINGO_API_TOKEN;
  if(!token)throw new Error("TIINGO_API_TOKEN_MISSING");
  const [marketText,phase2Text,engineText]=await Promise.all([fetchText(MARKET_URL),fetchText(PHASE2_URL),fetchText(ENGINE_URL)]);
  const market=JSON.parse(marketText),phase2=JSON.parse(phase2Text),days=parseMarket(market),signals=sourceSignals(days);
  const start=days[0].date,end="2026-09-21";
  const tiingoUrl=`${TIINGO_ENDPOINT}?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&resampleFreq=daily`;
  const tiingoText=await fetchText(tiingoUrl,{headers:{Authorization:`Token ${token}`,Accept:"application/json"}});
  const rows=JSON.parse(tiingoText);
  if(!Array.isArray(rows)||!rows.length)throw new Error("TIINGO_GLD_EMPTY");
  const gldByDate=new Map();
  for(const row of rows){
    const date=typeof row?.date==="string"?row.date.slice(0,10):null;
    const bar={date,open:row?.open,high:row?.high,low:row?.low,close:row?.close};
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date??"")||![bar.open,bar.high,bar.low,bar.close].every(x=>Number.isFinite(x)&&x>0))throw new Error("TIINGO_GLD_INVALID");
    if(bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close)||bar.high<bar.low)throw new Error("TIINGO_GLD_OHLC_INVALID");
    gldByDate.set(date,bar);
  }

  const sourceDaily=sourceBacktest(days,signals);
  const overlayDaily=overlayBacktest(days,signals,gldByDate);

  const ref=phase2.rows.find(x=>x.ticker==="TQQQ"&&x.family==="VS13_FIXED");
  if(!ref)throw new Error("PHASE2_REFERENCE_MISSING");
  const y2022=yearly(sourceDaily,2022);
  const y2023=yearly(sourceDaily,2023);
  const y2024=yearly(sourceDaily,2024);
  const refs=[
    {year:2022,actual:y2022.totalReturn,expected:ref.yearly.find(x=>x.year===2022)?.metrics.totalReturn},
    {year:2023,actual:y2023.totalReturn,expected:ref.yearly.find(x=>x.year===2023)?.metrics.totalReturn},
    {year:2024,actual:y2024.totalReturn,expected:ref.yearly.find(x=>x.year===2024)?.metrics.totalReturn}
  ];
  const referenceCheck={pass:refs.every(x=>closeEnough(x.actual,x.expected,1e-8)),rows:refs};
  if(!referenceCheck.pass)throw new Error(`VS13_REFERENCE_MISMATCH:${JSON.stringify(refs)}`);

  const regimes=[
    {id:"ZERO_RATE",label:"Zero-rate / pre-hike",start:"2020-03-17",end:"2022-03-16"},
    {id:"RAPID_HIKES",label:"Rapid hiking cycle",start:"2022-03-17",end:"2023-07-26"},
    {id:"PEAK_HOLD",label:"5.25-5.50% peak hold",start:"2023-07-27",end:"2024-09-18"},
    {id:"EASING_STILL_HIGH",label:"Easing but still restrictive",start:"2024-09-19",end:"2026-09-16"},
    {id:"REHIKE_2026",label:"2026 re-hike observed window",start:"2026-09-17",end:"2026-09-21"}
  ];

  const results=regimes.map(r=>({
    ...r,
    vs13:summarize(sourceDaily,r.start,r.end),
    gold50:summarize(overlayDaily,r.start,r.end)
  }));

  const audit={
    schemaVersion:1,
    audit:"GOLD50_RATE_REGIME_REPLAY",
    generatedAt:new Date().toISOString(),
    evidenceMode:"READ_ONLY_RESEARCH_REPLAY",
    productionAuthority:false,
    brokerOrderAllowed:false,
    source:{
      tqqqRepository:"rinko0211/tqqq-signal-lab",
      tqqqBaselineCommit:TQQQ_BASELINE_SHA,
      tqqqStrategyVersion:SOURCE_VERSION,
      goldStrategyId:STRATEGY_ID,
      goldStrategyVersion:STRATEGY_VERSION,
      mapper:"TQQQ=VS13 target; GLD=CASH=(1-target)/2",
      execution:"t close signal -> t+1 open rebalance",
      transactionCostBpsPerTradedAssetWeight:COST_BPS,
      gldProvider:"Tiingo EOD",
      rawGldPersisted:false
    },
    hashes:{
      tqqqMarketData:sha256(marketText),
      phase2Reference:sha256(phase2Text),
      tqqqEngineSource:sha256(engineText),
      tiingoGldResponse:sha256(tiingoText)
    },
    coverage:{
      sourceStart:days[0].date,
      sourceEnd:days.at(-1).date,
      gldRows:rows.length,
      evaluatedThrough:end
    },
    referenceCheck,
    regimes:results,
    notes:[
      "This audit does not retune VS13 or Gold50.",
      "Only sanitized aggregate metrics and input hashes are persisted; raw Tiingo OHLC is not persisted.",
      "The 2026 re-hike window is too short for performance inference and is retained only as an observed-current-state slice."
    ]
  };
  await mkdir(dirname(OUTPUT),{recursive:true});
  await writeFile(OUTPUT,JSON.stringify(audit,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({referenceCheck:audit.referenceCheck.pass,regimes:audit.regimes.map(x=>({id:x.id,vs13:x.vs13.totalReturn,gold50:x.gold50.totalReturn,vs13MaxDd:x.vs13.maxDd,gold50MaxDd:x.gold50.maxDd}))},null,2)+"\n");
}
await main();
