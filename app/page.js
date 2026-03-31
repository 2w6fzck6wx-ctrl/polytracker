"use client";
import { useState, useEffect, useCallback, useRef } from "react";

// === CONFIG ===
var GAMMA="https://gamma-api.polymarket.com";
var CLOB="https://clob.polymarket.com";
var CATS=["All","Politics","Crypto","Sports","Science","Culture","Business"];

// === MATH ===
function calcRSI(prices,n){if(prices.length<n+1)return 50;var gains=0,losses=0;for(var i=prices.length-n;i<prices.length;i++){var d=prices[i]-prices[i-1];if(d>0)gains+=d;else losses+=Math.abs(d);}var ag=gains/n,al=losses/n;if(al===0)return 100;var rs=ag/al;return 100-100/(1+rs);}
function calcSMA(prices,n){if(prices.length<n)return prices[prices.length-1]||0;var s=0;for(var i=prices.length-n;i<prices.length;i++)s+=prices[i];return s/n;}
function calcEMA(prices,n){if(prices.length<n)return prices[prices.length-1]||0;var k=2/(n+1),ema=calcSMA(prices.slice(0,n),n);for(var i=n;i<prices.length;i++)ema=prices[i]*k+ema*(1-k);return ema;}
function calcVWAP(prices,volumes){if(!prices.length)return 0;var tv=0,tpv=0;for(var i=0;i<prices.length;i++){tpv+=prices[i]*(volumes[i]||1);tv+=(volumes[i]||1);}return tv>0?tpv/tv:0;}
function calcVolatility(prices,n){if(prices.length<n)return 0;var sl=prices.slice(-n);var avg=sl.reduce(function(a,b){return a+b;},0)/sl.length;var variance=sl.reduce(function(a,b){return a+Math.pow(b-avg,2);},0)/sl.length;return Math.sqrt(variance);}
function signalScore(rsi,maCross,volSpike,momentum){var s=0;if(rsi<25)s+=30;else if(rsi<35)s+=15;else if(rsi>75)s-=30;else if(rsi>65)s-=15;if(maCross==="golden")s+=25;else if(maCross==="death")s-=25;if(volSpike)s+=15;s+=momentum*50;return Math.max(-100,Math.min(100,Math.round(s)));}

function merge(a,b){var r={};for(var k in a)r[k]=a[k];for(var k2 in b)r[k2]=b[k2];return r;}
function lsGet(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function fmt$(v){return v>=1e6?(v/1e6).toFixed(1)+"M":v>=1e3?(v/1e3).toFixed(0)+"K":v.toFixed(0);}

// === COLORS ===
var C={bg:"#04060a",p1:"#070b12",p2:"#0a0f18",bd:"#0d1520",bl:"#12202f",ac:"#8b5cf6",ag:"rgba(139,92,246,0.1)",gn:"#10b981",gd:"rgba(16,185,129,0.1)",rd:"#ef4444",yl:"#f59e0b",yd:"rgba(245,158,11,0.08)",pk:"#ec4899",tx:"#e2e8f0",ts:"#94a3b8",mt:"#475569",dm:"#1e293b",or:"#f97316",cy:"#06b6d4"};

export default function App(){
  var _m=useState([]),markets=_m[0],setMarkets=_m[1];
  var _l=useState(false),loading=_l[0],setLoading=_l[1];
  var _e=useState(null),err=_e[0],setErr=_e[1];
  var _s=useState(null),sel=_s[0],setSel=_s[1];
  var _t=useState("signal"),tab=_t[0],setTab=_t[1];
  var _p=useState("markets"),pg=_p[0],setPg=_p[1];
  var _c=useState("All"),cat=_c[0],setCat=_c[1];
  var _u=useState(null),upd=_u[0],setUpd=_u[1];
  var _w=useState(function(){return lsGet("poly_watchlist",[]);}),watchlist=_w[0],setWatchlistR=_w[1];
  var setWatchlist=function(v){setWatchlistR(v);lsSet("poly_watchlist",v);};
  var _tr=useState(function(){return lsGet("poly_trades",[]);}),trades=_tr[0],setTradesR=_tr[1];
  var setTrades=function(v){setTradesR(v);lsSet("poly_trades",v);};
  var _h=useState({}),history=_h[0],setHistory=_h[1];
  var _sb=useState(false),sidebar=_sb[0],setSidebar=_sb[1];
  var _sort=useState("signal"),sortBy=_sort[0],setSortBy=_sort[1];

  // Fetch markets from Gamma API
  var loadMarkets=useCallback(function(){
    setLoading(true);setErr(null);
    fetch(GAMMA+"/events?closed=false&active=true&limit=100&order=volume24hr&ascending=false")
    .then(function(r){return r.json();})
    .then(function(events){
      var parsed=[];
      (events||[]).forEach(function(ev){
        if(!ev.markets||!ev.markets.length)return;
        ev.markets.forEach(function(mk){
          if(!mk.active||mk.closed)return;
          var prices=mk.outcomePrices?JSON.parse(mk.outcomePrices):[];
          var yesPrice=parseFloat(prices[0])||0.5;
          var noPrice=parseFloat(prices[1])||0.5;
          var vol=parseFloat(mk.volume)||0;
          var vol24=parseFloat(mk.volume24hr||ev.volume24hr)||0;
          var liq=parseFloat(mk.liquidity)||0;
          parsed.push({
            id:mk.id||mk.conditionId,slug:mk.slug||ev.slug,
            question:mk.question||ev.title,
            category:ev.category||mk.category||"Other",
            yes:yesPrice,no:noPrice,vol:vol,vol24:vol24,liq:liq,
            endDate:mk.endDate||ev.endDate,
            image:ev.image||mk.image,
            tokenId:mk.clobTokenIds?JSON.parse(mk.clobTokenIds)[0]:null,
            // Placeholders until we fetch history
            rsi:50,smaFast:yesPrice,smaSlow:yesPrice,emaFast:yesPrice,emaSlow:yesPrice,
            maCross:null,volSpike:false,momentum:0,signal:0,
            volatility:0,vwap:yesPrice,
            priceHistory:[],volHistory:[]
          });
        });
      });
      // Sort by volume
      parsed.sort(function(a,b){return b.vol24-a.vol24;});
      setMarkets(parsed.slice(0,80));
      setUpd(new Date());
      setLoading(false);
      // Fetch price history for top markets
      parsed.slice(0,20).forEach(function(mk){
        if(mk.tokenId)fetchHistory(mk);
      });
    })
    .catch(function(e){setErr(e.message);setLoading(false);});
  },[]);

  var fetchHistory=function(mk){
    if(!mk.tokenId)return;
    fetch(CLOB+"/prices-history?market="+mk.tokenId+"&interval=1d&fidelity=60")
    .then(function(r){return r.json();})
    .then(function(data){
      if(!data||!data.history||!data.history.length)return;
      var prices=data.history.map(function(h){return parseFloat(h.p);});
      var vols=data.history.map(function(h){return parseFloat(h.v||0);});
      // Calculate indicators
      var rsi=calcRSI(prices,14);
      var smaFast=calcSMA(prices,7);
      var smaSlow=calcSMA(prices,25);
      var emaFast=calcEMA(prices,9);
      var emaSlow=calcEMA(prices,21);
      var prevEmaFast=prices.length>10?calcEMA(prices.slice(0,-1),9):emaFast;
      var prevEmaSlow=prices.length>10?calcEMA(prices.slice(0,-1),21):emaSlow;
      var maCross=null;
      if(prevEmaFast<=prevEmaSlow&&emaFast>emaSlow)maCross="golden";
      if(prevEmaFast>=prevEmaSlow&&emaFast<emaSlow)maCross="death";
      var avgVol=vols.length>5?vols.slice(-20).reduce(function(a,b){return a+b;},0)/Math.min(20,vols.length):0;
      var lastVol=vols.length?vols[vols.length-1]:0;
      var volSpike=avgVol>0&&lastVol>avgVol*2;
      var momentum=prices.length>5?(prices[prices.length-1]-prices[prices.length-6])/(prices[prices.length-6]||1):0;
      var volatility=calcVolatility(prices,14);
      var vwap=calcVWAP(prices.slice(-20),vols.slice(-20));
      var sig=signalScore(rsi,maCross,volSpike,momentum);

      setMarkets(function(prev){return prev.map(function(m){
        if(m.id!==mk.id)return m;
        return merge(m,{rsi:rsi,smaFast:smaFast,smaSlow:smaSlow,emaFast:emaFast,emaSlow:emaSlow,maCross:maCross,volSpike:volSpike,momentum:momentum,signal:sig,volatility:volatility,vwap:vwap,priceHistory:prices,volHistory:vols});
      });});
      setHistory(function(prev){var n={};for(var k in prev)n[k]=prev[k];n[mk.id]=data.history;return n;});
    }).catch(function(){});
  };

  useEffect(function(){loadMarkets();},[]);

  var logTrade=function(mk,side,amount){
    var t={id:Date.now(),date:new Date().toISOString(),question:mk.question.substring(0,60),slug:mk.slug,side:side,price:side==="YES"?mk.yes:mk.no,amount:amount||10,signal:mk.signal,rsi:mk.rsi,result:null};
    setTrades([t].concat(trades));
  };
  var settleTrade=function(idx,won){setTrades(trades.map(function(t,i){return i===idx?merge(t,{result:won?"win":"loss"}):t;}));};
  var toggleWatch=function(mk){
    var exists=watchlist.some(function(w){return w.id===mk.id;});
    if(exists)setWatchlist(watchlist.filter(function(w){return w.id!==mk.id;}));
    else setWatchlist([{id:mk.id,q:mk.question.substring(0,50),yes:mk.yes}].concat(watchlist));
  };

  var filtered=markets.filter(function(m){
    if(cat!=="All"&&m.category!==cat)return false;
    return true;
  });
  var sorted=filtered.slice().sort(function(a,b){
    if(sortBy==="signal")return Math.abs(b.signal)-Math.abs(a.signal);
    if(sortBy==="volume")return b.vol24-a.vol24;
    if(sortBy==="rsi")return Math.abs(a.rsi-50)-Math.abs(b.rsi-50);
    return 0;
  });

  var settled=trades.filter(function(t){return t.result;});
  var totalIn=settled.reduce(function(s,t){return s+t.amount;},0);
  var totalOut=settled.reduce(function(s,t){return s+(t.result==="win"?t.amount/t.price:0);},0);
  var roi=totalIn>0?((totalOut-totalIn)/totalIn*100).toFixed(1):0;

  return(
    <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif",background:C.bg,minHeight:"100vh",color:C.tx,display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto",position:"relative"}}>
      <style>{["*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}","body{background:#04060a;}","::-webkit-scrollbar{display:none;}",".r:active{opacity:.7;transform:scale(.98);} .r{transition:all .12s;}","@keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}","@keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,.4)}60%{box-shadow:0 0 0 5px rgba(139,92,246,0)}}","@keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}",".blink{animation:blink 1.4s infinite;} .glow{animation:glow 2s infinite;} .slideUp{animation:slideUp .2s ease;}","input,button{font-family:inherit;outline:none;}"].join("\n")}</style>

      {/* HEADER */}
      <div style={{background:C.p1,borderBottom:"1px solid "+C.bd,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontWeight:700,fontSize:15,letterSpacing:".08em",color:C.ac}}>{"POLY"}</span>
          <span style={{fontWeight:700,fontSize:15,color:C.tx}}>{"TRACKER"}</span>
          <span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:C.ag,color:C.ac,fontWeight:600}}>{"BETA"}</span>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={function(){loadMarkets();}} className="r" style={{background:"rgba(255,255,255,.04)",border:"none",color:C.ts,padding:"6px 10px",borderRadius:6,fontSize:12}}>{loading?"...":"Skanna"}</button>
        </div>
      </div>

      {err&&<div style={{background:"rgba(239,68,68,.08)",padding:"8px 16px",fontSize:11,color:C.rd}}>{err}</div>}

      {/* NAV */}
      <div style={{display:"flex",borderBottom:"1px solid "+C.bd,background:C.p1,position:"sticky",top:56,zIndex:90}}>
        {[["markets","Marknader"],["trades","Trades"],["info","Info"]].map(function(t){return <button key={t[0]} onClick={function(){setPg(t[0]);}} className="r" style={{flex:1,padding:"10px",background:"none",border:"none",borderBottom:pg===t[0]?"2px solid "+C.ac:"2px solid transparent",color:pg===t[0]?"#a78bfa":C.mt,fontSize:12,fontWeight:pg===t[0]?600:400}}>{t[1]}</button>;})}
      </div>

      {/* MARKETS PAGE */}
      {pg==="markets"&&<div style={{flex:1,overflowY:"auto",paddingBottom:40}}>
        {/* Category filter */}
        <div style={{padding:"8px 16px",display:"flex",gap:6,overflowX:"auto",borderBottom:"1px solid "+C.bd}}>
          {CATS.map(function(c){return <button key={c} onClick={function(){setCat(c);}} className="r" style={{fontSize:11,padding:"4px 10px",borderRadius:12,background:cat===c?C.ag:"rgba(255,255,255,.03)",border:cat===c?"1px solid rgba(139,92,246,.3)":"1px solid transparent",color:cat===c?"#a78bfa":C.mt,whiteSpace:"nowrap"}}>{c}</button>;})}
        </div>
        {/* Sort */}
        <div style={{padding:"8px 16px",display:"flex",gap:8,alignItems:"center",borderBottom:"1px solid "+C.bd}}>
          <span style={{fontSize:10,color:C.mt}}>{"Sortera:"}</span>
          {[["signal","Signal"],["volume","Volym"],["rsi","RSI"]].map(function(s){return <button key={s[0]} onClick={function(){setSortBy(s[0]);}} className="r" style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:sortBy===s[0]?C.ag:"transparent",border:"none",color:sortBy===s[0]?"#a78bfa":C.mt}}>{s[1]}</button>;})}
        </div>

        {loading&&!sorted.length?<div style={{padding:40,textAlign:"center",color:C.mt,fontSize:12}} className="blink">{"Skannar Polymarket..."}</div>
        :sorted.length===0?<div style={{padding:40,textAlign:"center",color:C.mt,fontSize:12}}>{"Inga marknader"}</div>
        :sorted.map(function(m){var act=sel&&sel.id===m.id;var sigColor=m.signal>20?C.gn:m.signal<-20?C.rd:C.mt;var isWatched=watchlist.some(function(w){return w.id===m.id;});
        return <div key={m.id}>
          <div onClick={function(){setSel(act?null:m);setTab("signal");}} className="r" style={{padding:"12px 16px",borderBottom:"1px solid "+C.bd,background:act?"rgba(139,92,246,.04)":m.maCross==="golden"?"rgba(16,185,129,.02)":m.maCross==="death"?"rgba(239,68,68,.02)":"transparent"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div style={{flex:1,marginRight:8}}>
                <div style={{fontSize:13,fontWeight:500,lineHeight:1.3}}>{m.question.length>65?m.question.substring(0,65)+"...":m.question}</div>
                <div style={{display:"flex",gap:6,marginTop:4}}>
                  <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"rgba(255,255,255,.04)",color:C.mt}}>{m.category}</span>
                  {m.maCross==="golden"&&<span className="glow" style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:C.gd,color:C.gn,fontWeight:600}}>{"GOLDEN"}</span>}
                  {m.maCross==="death"&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"rgba(239,68,68,.1)",color:C.rd,fontWeight:600}}>{"DEATH"}</span>}
                  {m.volSpike&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"rgba(249,115,22,.1)",color:C.or,fontWeight:600}}>{"VOL"}</span>}
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:18,fontWeight:700,color:m.yes>0.7?C.gn:m.yes<0.3?C.rd:C.tx}}>{(m.yes*100).toFixed(0)+"%"}</div>
                <div style={{fontSize:10,color:sigColor,fontWeight:600}}>{(m.signal>0?"+":"")+m.signal}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:4}}>
              {[{v:"RSI "+m.rsi.toFixed(0),c:m.rsi<30?C.gn:m.rsi>70?C.rd:C.ts},{v:"$"+fmt$(m.vol24),c:C.cy,l:"24h"},{v:"$"+fmt$(m.liq),c:C.mt,l:"Liq"}].map(function(cell,ci){
                return <div key={ci} style={{flex:1,background:"rgba(255,255,255,.03)",borderRadius:4,padding:"5px 2px",textAlign:"center"}}>
                  <div style={{fontSize:11,fontWeight:500,color:cell.c}}>{cell.v}</div>
                  {cell.l&&<div style={{fontSize:8,color:C.dm}}>{cell.l}</div>}
                </div>;
              })}
            </div>
          </div>

          {/* DETAIL */}
          {act&&<div className="slideUp" style={{background:C.p2,borderBottom:"1px solid "+C.bd}}>
            <div style={{display:"flex",borderBottom:"1px solid "+C.bd}}>
              {["signal","book","chart"].map(function(t){return <button key={t} onClick={function(){setTab(t);}} className="r" style={{flex:1,padding:"10px 0",background:"none",border:"none",borderBottom:tab===t?"2px solid "+C.ac:"2px solid transparent",color:tab===t?"#a78bfa":C.mt,fontSize:11,textTransform:"uppercase",fontWeight:tab===t?600:400}}>{t}</button>;})}
            </div>
            <div style={{padding:14}}>
              {tab==="signal"&&<div>
                {/* Signal summary */}
                <div style={{display:"flex",gap:6,marginBottom:12}}>
                  <div style={{flex:1,background:m.signal>20?"rgba(16,185,129,.06)":m.signal<-20?"rgba(239,68,68,.06)":"rgba(255,255,255,.03)",border:"1px solid "+(m.signal>20?"rgba(16,185,129,.2)":m.signal<-20?"rgba(239,68,68,.2)":"transparent"),borderRadius:6,padding:10,textAlign:"center"}}>
                    <div style={{fontSize:9,color:C.mt}}>{"Signal"}</div>
                    <div style={{fontSize:24,fontWeight:700,color:m.signal>20?C.gn:m.signal<-20?C.rd:C.ts}}>{(m.signal>0?"+":"")+m.signal}</div>
                    <div style={{fontSize:10,color:C.mt}}>{m.signal>30?"Stark k\u00f6p":m.signal>10?"Svag k\u00f6p":m.signal<-30?"Stark s\u00e4lj":m.signal<-10?"Svag s\u00e4lj":"Neutral"}</div>
                  </div>
                  <div style={{flex:1,background:"rgba(255,255,255,.03)",borderRadius:6,padding:10,textAlign:"center"}}>
                    <div style={{fontSize:9,color:C.mt}}>{"YES pris"}</div>
                    <div style={{fontSize:24,fontWeight:700,color:C.ac}}>{(m.yes*100).toFixed(1)+"%"}</div>
                    <div style={{fontSize:10,color:C.mt}}>{"NO "+(m.no*100).toFixed(1)+"%"}</div>
                  </div>
                </div>
                {/* Indicators */}
                {[{l:"RSI (14)",v:m.rsi.toFixed(1),c:m.rsi<30?C.gn:m.rsi>70?C.rd:C.ts,note:m.rsi<30?"\u00d6vers\u00e5ld \u2014 k\u00f6psignal":m.rsi>70?"\u00d6verk\u00f6pt \u2014 s\u00e4ljsignal":"Neutral"},
                  {l:"EMA 9/21",v:m.emaFast.toFixed(3)+" / "+m.emaSlow.toFixed(3),c:m.maCross==="golden"?C.gn:m.maCross==="death"?C.rd:C.ts,note:m.maCross==="golden"?"Golden Cross \u2014 k\u00f6p":m.maCross==="death"?"Death Cross \u2014 s\u00e4lj":"Ingen korsning"},
                  {l:"Volatilitet",v:(m.volatility*100).toFixed(1)+"%",c:m.volatility>0.05?C.or:C.ts,note:m.volatility>0.05?"H\u00f6g \u2014 st\u00f6rre risk/m\u00f6jlighet":"L\u00e5g"},
                  {l:"VWAP",v:(m.vwap*100).toFixed(1)+"%",c:m.yes>m.vwap?C.gn:C.rd,note:m.yes>m.vwap?"Pris \u00f6ver VWAP \u2014 styrka":"Pris under VWAP \u2014 svaghet"},
                  {l:"Volym 24h",v:"$"+fmt$(m.vol24),c:m.volSpike?C.or:C.cy,note:m.volSpike?"Volymspik! 2x normalt":"Normal"}
                ].map(function(ind){return <div key={ind.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+C.bd}}>
                  <div><div style={{fontSize:12,color:C.ts}}>{ind.l}</div><div style={{fontSize:10,color:C.dm}}>{ind.note}</div></div>
                  <div style={{fontSize:14,fontWeight:600,color:ind.c}}>{ind.v}</div>
                </div>;})}
                {/* Trade buttons */}
                <div style={{display:"flex",gap:8,marginTop:14}}>
                  <button onClick={function(e){e.stopPropagation();logTrade(m,"YES",10);}} className="r" style={{flex:1,background:C.gd,border:"1px solid rgba(16,185,129,.3)",color:C.gn,padding:"12px",borderRadius:6,fontSize:13,fontWeight:600}}>{"K\u00d6P YES @ "+(m.yes*100).toFixed(0)+"\u00a2"}</button>
                  <button onClick={function(e){e.stopPropagation();logTrade(m,"NO",10);}} className="r" style={{flex:1,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",color:C.rd,padding:"12px",borderRadius:6,fontSize:13,fontWeight:600}}>{"K\u00d6P NO @ "+(m.no*100).toFixed(0)+"\u00a2"}</button>
                </div>
                <button onClick={function(e){e.stopPropagation();toggleWatch(m);}} className="r" style={{marginTop:8,width:"100%",background:isWatched?"rgba(245,158,11,.08)":"rgba(255,255,255,.03)",border:"1px solid "+(isWatched?"rgba(245,158,11,.2)":C.bd),color:isWatched?C.yl:C.mt,padding:"10px",borderRadius:6,fontSize:12}}>{isWatched?"\u2605 I watchlist":"\u2606 L\u00e4gg till watchlist"}</button>
              </div>}

              {tab==="book"&&<div>
                <div style={{display:"flex",gap:6,marginBottom:12}}>
                  {[{l:"Volym total",v:"$"+fmt$(m.vol)},{l:"Likviditet",v:"$"+fmt$(m.liq)},{l:"Slutdatum",v:m.endDate?new Date(m.endDate).toLocaleDateString("sv-SE"):"?"}].map(function(s){return <div key={s.l} style={{flex:1,background:"rgba(255,255,255,.03)",borderRadius:6,padding:8,textAlign:"center"}}><div style={{fontSize:9,color:C.mt}}>{s.l}</div><div style={{fontSize:14,fontWeight:600,color:C.tx}}>{s.v}</div></div>;})}
                </div>
                <div style={{background:C.ag,borderRadius:6,padding:"10px 12px",fontSize:11,color:C.ts,lineHeight:1.7}}>
                  <span style={{color:C.ac,fontWeight:600}}>{"Orderbok"}</span><br/>
                  {"F\u00f6r att se fullst\u00e4ndig orderbok kr\u00e4vs CLOB API-autentisering. Gamma API ger realtidspriser och volymer."}
                </div>
              </div>}

              {tab==="chart"&&<div>
                {m.priceHistory.length>5?<div>
                  <div style={{fontSize:10,color:C.mt,fontWeight:600,marginBottom:8}}>{"PRISHISTORIK ("+m.priceHistory.length+" datapunkter)"}</div>
                  {/* Mini chart using divs */}
                  <div style={{display:"flex",alignItems:"flex-end",gap:1,height:80,marginBottom:12,background:"rgba(255,255,255,.02)",borderRadius:6,padding:"8px 4px",overflow:"hidden"}}>
                    {m.priceHistory.slice(-40).map(function(p,i,arr){
                      var min=Math.min.apply(null,arr),max=Math.max.apply(null,arr);
                      var range=max-min||0.01;
                      var h=((p-min)/range)*60+4;
                      var isLast=i===arr.length-1;
                      return <div key={i} style={{flex:1,height:h,background:isLast?C.ac:p>arr[0]?"rgba(16,185,129,.4)":"rgba(239,68,68,.4)",borderRadius:1,minWidth:2}}/>;
                    })}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.dm}}>
                    <span>{(m.priceHistory[0]*100).toFixed(0)+"%"}</span>
                    <span>{"Nu: "+(m.priceHistory[m.priceHistory.length-1]*100).toFixed(0)+"%"}</span>
                  </div>
                </div>
                :<div style={{padding:20,textAlign:"center",color:C.dm,fontSize:12}}>{"H\u00e4mtar prishistorik..."}</div>}
              </div>}
            </div>
          </div>}
        </div>;})}
      </div>}

      {/* TRADES PAGE */}
      {pg==="trades"&&<div style={{flex:1,overflowY:"auto",padding:16,paddingBottom:60}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>{"Trade Tracker"}</div>
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {[{l:"Trades",v:trades.length,c:C.ac},{l:"Avgjorda",v:settled.length,c:C.ts},{l:"ROI",v:roi+"%",c:+roi>0?C.gn:+roi<0?C.rd:C.ts}].map(function(s){return <div key={s.l} style={{flex:1,background:"rgba(255,255,255,.03)",borderRadius:6,padding:"10px 6px",textAlign:"center"}}><div style={{fontSize:9,color:C.mt}}>{s.l}</div><div style={{fontSize:16,fontWeight:700,color:s.c}}>{s.v}</div></div>;})}
        </div>
        {/* Watchlist */}
        {watchlist.length>0&&<div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:C.mt,fontWeight:600,letterSpacing:".1em",marginBottom:8}}>{"WATCHLIST"}</div>
          {watchlist.map(function(w){return <div key={w.id} style={{padding:"8px 12px",background:"rgba(255,255,255,.02)",border:"1px solid "+C.bd,borderRadius:6,marginBottom:4,fontSize:12,color:C.ts}}>{w.q}</div>;})}
        </div>}
        {trades.length===0?<div style={{padding:30,textAlign:"center",color:C.dm,fontSize:12}}>{"Tryck K\u00d6P YES/NO p\u00e5 en marknad f\u00f6r att logga."}</div>
        :trades.map(function(t,idx){return <div key={t.id} style={{background:t.result==="win"?"rgba(16,185,129,.04)":t.result==="loss"?"rgba(239,68,68,.04)":"rgba(255,255,255,.02)",border:"1px solid "+(t.result==="win"?"rgba(16,185,129,.2)":t.result==="loss"?"rgba(239,68,68,.2)":C.bd),borderRadius:6,padding:12,marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:12,fontWeight:600}}>{t.question}</div><div style={{fontSize:11,color:C.ts,marginTop:2}}>{t.side+" @ "+(t.price*100).toFixed(0)+"\u00a2 | Signal: "+t.signal}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:700,color:t.result==="win"?C.gn:t.result==="loss"?C.rd:C.ac}}>{t.result?t.result.toUpperCase():"$"+t.amount}</div></div></div>
          {!t.result&&<div style={{display:"flex",gap:8,marginTop:8}}><button onClick={function(){settleTrade(idx,true);}} className="r" style={{flex:1,background:C.gd,border:"1px solid rgba(16,185,129,.3)",color:C.gn,padding:"8px",borderRadius:6,fontSize:12,fontWeight:600}}>{"VINST"}</button><button onClick={function(){settleTrade(idx,false);}} className="r" style={{flex:1,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",color:C.rd,padding:"8px",borderRadius:6,fontSize:12,fontWeight:600}}>{"F\u00d6RL."}</button></div>}
          <div style={{fontSize:9,color:C.dm,marginTop:6}}>{new Date(t.date).toLocaleDateString("sv-SE")}</div>
        </div>;})}
        {trades.length>0&&<button onClick={function(){if(confirm("Radera alla trades?"))setTrades([]);}} className="r" style={{marginTop:16,background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.15)",color:C.rd,padding:"10px",borderRadius:6,fontSize:12,width:"100%"}}>{"Rensa historik"}</button>}
      </div>}

      {/* INFO PAGE */}
      {pg==="info"&&<div style={{flex:1,overflowY:"auto",padding:16,paddingBottom:60}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>{"Strategi & Signaler"}</div>
        {[{t:"RSI (Relative Strength Index)",d:"M\u00e4ter om en marknad \u00e4r \u00f6verk\u00f6pt eller \u00f6vers\u00e5ld. RSI < 30 = k\u00f6psignal (marknaden har sjunkit f\u00f6r mycket). RSI > 70 = s\u00e4ljsignal. Vi anv\u00e4nder 14-perioders RSI.",c:C.cy},
          {t:"MA Crossover (Golden/Death Cross)",d:"N\u00e4r snabb EMA (9) korsar \u00f6ver l\u00e5ngsam EMA (21) = Golden Cross (k\u00f6p). N\u00e4r den korsar under = Death Cross (s\u00e4lj). Identifierar trendskiften.",c:C.gn},
          {t:"Volymspik",d:"N\u00e4r volymen \u00e4r 2x normalt indikerar det att stora akt\u00f6rer r\u00f6r sig. Kombinerat med RSI/MA ger det starkare signaler.",c:C.or},
          {t:"VWAP (Volume Weighted Average Price)",d:"Genomsnittspris viktat mot volym. Om nuvarande pris > VWAP = styrka (k\u00f6parna dominerar). Under VWAP = svaghet.",c:C.ac},
          {t:"Signalpo\u00e4ng (-100 till +100)",d:"Kombinerar RSI, MA, volym och momentum till en enda siffra. +30 eller h\u00f6gre = stark k\u00f6psignal. -30 eller l\u00e4gre = stark s\u00e4ljsignal. Anv\u00e4nd som snabbfilter.",c:C.yl}
        ].map(function(item){return <div key={item.t} style={{marginBottom:16,padding:"12px",background:"rgba(255,255,255,.02)",border:"1px solid "+C.bd,borderRadius:8}}>
          <div style={{fontSize:13,fontWeight:600,color:item.c,marginBottom:6}}>{item.t}</div>
          <div style={{fontSize:12,color:C.ts,lineHeight:1.7}}>{item.d}</div>
        </div>;})}
        <div style={{background:C.ag,borderRadius:8,padding:"12px",marginTop:8,fontSize:12,color:C.ts,lineHeight:1.7}}>
          <span style={{color:C.ac,fontWeight:600}}>{"Fas 1: Scanner"}</span><br/>
          {"Du ser nu signaler fr\u00e5n Polymarket i realtid. K\u00f6p/s\u00e4lj-knappar loggar trades lokalt. F\u00f6r automatisk execution (Fas 2) kr\u00e4vs Polygon-wallet med USDC och CLOB API-nycklar."}
        </div>
        <div style={{background:"rgba(255,255,255,.02)",borderRadius:6,padding:"10px 12px",marginTop:16,fontSize:11,color:C.dm}}>{"PolyTracker v1 | RSI | EMA Cross | VWAP | Volymanalys | Polymarket Gamma API"}</div>
      </div>}

      {upd&&<div style={{position:"fixed",bottom:0,left:0,right:0,maxWidth:480,margin:"0 auto",background:C.p1,borderTop:"1px solid "+C.bd,padding:"6px 16px",fontSize:9,color:C.dm,textAlign:"center",zIndex:50}}>{"Skannad: "+upd.toLocaleTimeString("sv-SE")+" | "+markets.length+" marknader"}</div>}
    </div>
  );
}
