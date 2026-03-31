"use client";
import { useState, useEffect, useCallback, useRef } from "react";

var GAMMA="https://gamma-api.polymarket.com";
var CATS=["All","Politics","Crypto","Sports","Science","Culture","Business"];

function calcRSI(prices,n){if(prices.length<n+1)return 50;var gains=0,losses=0;for(var i=prices.length-n;i<prices.length;i++){var d=prices[i]-prices[i-1];if(d>0)gains+=d;else losses+=Math.abs(d);}var ag=gains/n,al=losses/n;if(al===0)return 100;return 100-100/(1+ag/al);}
function calcEMA(prices,n){if(prices.length<n)return prices[prices.length-1]||0;var k=2/(n+1),ema=prices.slice(0,n).reduce(function(a,b){return a+b;},0)/n;for(var i=n;i<prices.length;i++)ema=prices[i]*k+ema*(1-k);return ema;}
function calcVWAP(prices,volumes){if(!prices.length)return 0;var tv=0,tpv=0;for(var i=0;i<prices.length;i++){tpv+=prices[i]*(volumes[i]||1);tv+=(volumes[i]||1);}return tv>0?tpv/tv:0;}
function signalScore(rsi,maCross,volSpike,momentum){var s=0;if(rsi<25)s+=30;else if(rsi<35)s+=15;else if(rsi>75)s-=30;else if(rsi>65)s-=15;if(maCross==="golden")s+=25;else if(maCross==="death")s-=25;if(volSpike)s+=15;s+=momentum*50;return Math.max(-100,Math.min(100,Math.round(s)));}
function merge(a,b){var r={};for(var k in a)r[k]=a[k];for(var k2 in b)r[k2]=b[k2];return r;}
function lsGet(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function fmt$(v){if(v==null)return"$0";v=parseFloat(v)||0;return v>=1e6?"$"+(v/1e6).toFixed(1)+"M":v>=1e3?"$"+(v/1e3).toFixed(0)+"K":"$"+v.toFixed(0);}

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
  var _w=useState(function(){return lsGet("poly_watch",[]);}),watchlist=_w[0],setWatchR=_w[1];
  var setWatch=function(v){setWatchR(v);lsSet("poly_watch",v);};
  var _tr=useState(function(){return lsGet("poly_trades",[]);}),trades=_tr[0],setTradesR=_tr[1];
  var setTrades=function(v){setTradesR(v);lsSet("poly_trades",v);};
  var _sort=useState("signal"),sortBy=_sort[0],setSortBy=_sort[1];
  // Wallet intelligence
  var _wl=useState([]),whales=_wl[0],setWhales=_wl[1];
  var _wp=useState(null),walletSel=_wp[0],setWalletSel=_wp[1];
  var _wa=useState([]),walletAct=_wa[0],setWalletAct=_wa[1];
  var _wpos=useState([]),walletPos=_wpos[0],setWalletPos=_wpos[1];
  var _wl2=useState(false),whalesLoading=_wl2[0],setWhalesLoading=_wl2[1];

  var loadMarkets=useCallback(function(){
    setLoading(true);setErr(null);
    fetch("/api/markets").then(function(r){return r.json();}).then(function(events){
      var parsed=[];
      (events||[]).forEach(function(ev){if(!ev.markets)return;
        ev.markets.forEach(function(mk){if(!mk.active||mk.closed)return;
          var prices=mk.outcomePrices?JSON.parse(mk.outcomePrices):[];
          var yes=parseFloat(prices[0])||0.5,no=parseFloat(prices[1])||0.5;
          parsed.push({id:mk.id||mk.conditionId,slug:mk.slug||ev.slug,question:mk.question||ev.title,category:ev.category||mk.category||"Other",yes:yes,no:no,vol:parseFloat(mk.volume)||0,vol24:parseFloat(mk.volume24hr||ev.volume24hr)||0,liq:parseFloat(mk.liquidity)||0,endDate:mk.endDate||ev.endDate,tokenId:mk.clobTokenIds?JSON.parse(mk.clobTokenIds)[0]:null,rsi:50,emaFast:yes,emaSlow:yes,maCross:null,volSpike:false,momentum:0,signal:0,volatility:0,vwap:yes,priceHistory:[],volHistory:[]});
        });});
      parsed.sort(function(a,b){return b.vol24-a.vol24;});
      setMarkets(parsed.slice(0,80));setUpd(new Date());setLoading(false);
      parsed.slice(0,25).forEach(function(mk){if(mk.tokenId)fetchHist(mk);});
    }).catch(function(e){setErr(e.message);setLoading(false);});
  },[]);

  var fetchHist=function(mk){
    if(!mk.tokenId)return;
    fetch("/api/history?token="+mk.tokenId).then(function(r){return r.json();}).then(function(data){
      if(!data||!data.history||!data.history.length)return;
      var prices=data.history.map(function(h){return parseFloat(h.p);});
      var vols=data.history.map(function(h){return parseFloat(h.v||0);});
      var rsi=calcRSI(prices,14);
      var emaFast=calcEMA(prices,9),emaSlow=calcEMA(prices,21);
      var prevF=prices.length>10?calcEMA(prices.slice(0,-1),9):emaFast;
      var prevS=prices.length>10?calcEMA(prices.slice(0,-1),21):emaSlow;
      var maCross=null;
      if(prevF<=prevS&&emaFast>emaSlow)maCross="golden";
      if(prevF>=prevS&&emaFast<emaSlow)maCross="death";
      var avgV=vols.length>5?vols.slice(-20).reduce(function(a,b){return a+b;},0)/Math.min(20,vols.length):0;
      var volSpike=avgV>0&&vols.length>0&&vols[vols.length-1]>avgV*2;
      var mom=prices.length>5?(prices[prices.length-1]-prices[prices.length-6])/(prices[prices.length-6]||1):0;
      var vol2=0;if(prices.length>=14){var sl=prices.slice(-14),av=sl.reduce(function(a,b){return a+b;},0)/sl.length;vol2=Math.sqrt(sl.reduce(function(a,b){return a+Math.pow(b-av,2);},0)/sl.length);}
      var vwap=calcVWAP(prices.slice(-20),vols.slice(-20));
      var sig=signalScore(rsi,maCross,volSpike,mom);
      setMarkets(function(prev){return prev.map(function(m){return m.id===mk.id?merge(m,{rsi:rsi,emaFast:emaFast,emaSlow:emaSlow,maCross:maCross,volSpike:volSpike,momentum:mom,signal:sig,volatility:vol2,vwap:vwap,priceHistory:prices,volHistory:vols}):m;});});
    }).catch(function(){});
  };

  // Wallet Intelligence
  var loadWhales=function(){
    setWhalesLoading(true);
    fetch("/api/wallets?type=leaderboard&period=30d&window=profit").then(function(r){return r.json();}).then(function(data){
      setWhales(Array.isArray(data)?data.slice(0,25):[]);setWhalesLoading(false);
    }).catch(function(){setWhalesLoading(false);});
  };
  var loadWalletDetail=function(addr){
    setWalletSel(addr);setWalletPos([]);setWalletAct([]);
    Promise.all([
      fetch("/api/wallets?type=positions&user="+addr).then(function(r){return r.json();}),
      fetch("/api/wallets?type=activity&user="+addr).then(function(r){return r.json();})
    ]).then(function(r){
      setWalletPos(Array.isArray(r[0])?r[0].slice(0,15):[]);
      setWalletAct(Array.isArray(r[1])?r[1].slice(0,20):[]);
    }).catch(function(){});
  };

  useEffect(function(){loadMarkets();},[]);

  var logTrade=function(mk,side){var t={id:Date.now(),date:new Date().toISOString(),question:mk.question.substring(0,60),side:side,price:side==="YES"?mk.yes:mk.no,amount:10,signal:mk.signal,rsi:mk.rsi,result:null};setTrades([t].concat(trades));};
  var settleTrade=function(idx,won){setTrades(trades.map(function(t,i){return i===idx?merge(t,{result:won?"win":"loss"}):t;}));};
  var toggleWatch=function(mk){var ex=watchlist.some(function(w){return w.id===mk.id;});if(ex)setWatch(watchlist.filter(function(w){return w.id!==mk.id;}));else setWatch([{id:mk.id,q:mk.question.substring(0,50)}].concat(watchlist));};

  var filtered=markets.filter(function(m){return cat==="All"||m.category===cat;});
  var sorted=filtered.slice().sort(function(a,b){if(sortBy==="signal")return Math.abs(b.signal)-Math.abs(a.signal);if(sortBy==="volume")return b.vol24-a.vol24;return Math.abs(a.rsi-50)-Math.abs(b.rsi-50);});
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
          <span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:C.ag,color:C.ac,fontWeight:600}}>{"v2"}</span>
        </div>
        <button onClick={function(){loadMarkets();}} className="r" style={{background:"rgba(255,255,255,.04)",border:"none",color:C.ts,padding:"6px 10px",borderRadius:6,fontSize:12}}>{loading?"...":"Skanna"}</button>
      </div>

      {err&&<div style={{background:"rgba(239,68,68,.08)",padding:"8px 16px",fontSize:11,color:C.rd}}>{err}</div>}

      {/* NAV */}
      <div style={{display:"flex",borderBottom:"1px solid "+C.bd,background:C.p1,position:"sticky",top:56,zIndex:90}}>
        {[["markets","Marknader"],["whales","Whales"],["trades","Trades"],["info","Info"]].map(function(t){return <button key={t[0]} onClick={function(){setPg(t[0]);if(t[0]==="whales"&&!whales.length)loadWhales();}} className="r" style={{flex:1,padding:"10px",background:"none",border:"none",borderBottom:pg===t[0]?"2px solid "+C.ac:"2px solid transparent",color:pg===t[0]?"#a78bfa":C.mt,fontSize:11,fontWeight:pg===t[0]?600:400}}>{t[1]}</button>;})}
      </div>

      {/* === MARKETS === */}
      {pg==="markets"&&<div style={{flex:1,overflowY:"auto",paddingBottom:40}}>
        <div style={{padding:"8px 16px",display:"flex",gap:6,overflowX:"auto",borderBottom:"1px solid "+C.bd}}>
          {CATS.map(function(c){return <button key={c} onClick={function(){setCat(c);}} className="r" style={{fontSize:11,padding:"4px 10px",borderRadius:12,background:cat===c?C.ag:"rgba(255,255,255,.03)",border:cat===c?"1px solid rgba(139,92,246,.3)":"1px solid transparent",color:cat===c?"#a78bfa":C.mt,whiteSpace:"nowrap"}}>{c}</button>;})}
        </div>
        <div style={{padding:"8px 16px",display:"flex",gap:8,alignItems:"center",borderBottom:"1px solid "+C.bd}}>
          <span style={{fontSize:10,color:C.mt}}>{"Sortera:"}</span>
          {[["signal","Signal"],["volume","Volym"],["rsi","RSI"]].map(function(s){return <button key={s[0]} onClick={function(){setSortBy(s[0]);}} className="r" style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:sortBy===s[0]?C.ag:"transparent",border:"none",color:sortBy===s[0]?"#a78bfa":C.mt}}>{s[1]}</button>;})}
        </div>

        {loading&&!sorted.length?<div style={{padding:40,textAlign:"center",color:C.mt,fontSize:12}} className="blink">{"Skannar Polymarket..."}</div>
        :sorted.map(function(m){var act=sel&&sel.id===m.id;var sigC=m.signal>20?C.gn:m.signal<-20?C.rd:C.mt;var isW=watchlist.some(function(w){return w.id===m.id;});
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
                <div style={{fontSize:10,color:sigC,fontWeight:600}}>{(m.signal>0?"+":"")+m.signal}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:4}}>
              {[{v:"RSI "+m.rsi.toFixed(0),c:m.rsi<30?C.gn:m.rsi>70?C.rd:C.ts},{v:fmt$(m.vol24),c:C.cy,l:"24h"},{v:fmt$(m.liq),c:C.mt,l:"Liq"}].map(function(cell,ci){return <div key={ci} style={{flex:1,background:"rgba(255,255,255,.03)",borderRadius:4,padding:"5px 2px",textAlign:"center"}}><div style={{fontSize:11,fontWeight:500,color:cell.c}}>{cell.v}</div>{cell.l&&<div style={{fontSize:8,color:C.dm}}>{cell.l}</div>}</div>;})}
            </div>
          </div>

          {act&&<div className="slideUp" style={{background:C.p2,borderBottom:"1px solid "+C.bd}}>
            <div style={{display:"flex",borderBottom:"1px solid "+C.bd}}>
              {["signal","chart"].map(function(t){return <button key={t} onClick={function(){setTab(t);}} className="r" style={{flex:1,padding:"10px 0",background:"none",border:"none",borderBottom:tab===t?"2px solid "+C.ac:"2px solid transparent",color:tab===t?"#a78bfa":C.mt,fontSize:11,textTransform:"uppercase"}}>{t}</button>;})}
            </div>
            <div style={{padding:14}}>
              {tab==="signal"&&<div>
                <div style={{display:"flex",gap:6,marginBottom:12}}>
                  <div style={{flex:1,background:m.signal>20?"rgba(16,185,129,.06)":m.signal<-20?"rgba(239,68,68,.06)":"rgba(255,255,255,.03)",border:"1px solid "+(m.signal>20?"rgba(16,185,129,.2)":m.signal<-20?"rgba(239,68,68,.2)":"transparent"),borderRadius:6,padding:10,textAlign:"center"}}>
                    <div style={{fontSize:9,color:C.mt}}>{"Signal"}</div>
                    <div style={{fontSize:24,fontWeight:700,color:m.signal>20?C.gn:m.signal<-20?C.rd:C.ts}}>{(m.signal>0?"+":"")+m.signal}</div>
                    <div style={{fontSize:10,color:C.mt}}>{m.signal>30?"Stark k\u00f6p":m.signal>10?"Svag k\u00f6p":m.signal<-30?"Stark s\u00e4lj":m.signal<-10?"Svag s\u00e4lj":"Neutral"}</div>
                  </div>
                  <div style={{flex:1,background:"rgba(255,255,255,.03)",borderRadius:6,padding:10,textAlign:"center"}}>
                    <div style={{fontSize:9,color:C.mt}}>{"YES"}</div>
                    <div style={{fontSize:24,fontWeight:700,color:C.ac}}>{(m.yes*100).toFixed(1)+"%"}</div>
                    <div style={{fontSize:10,color:C.mt}}>{"NO "+(m.no*100).toFixed(1)+"%"}</div>
                  </div>
                </div>
                {[{l:"RSI (14)",v:m.rsi.toFixed(1),c:m.rsi<30?C.gn:m.rsi>70?C.rd:C.ts,n:m.rsi<30?"\u00d6vers\u00e5ld":m.rsi>70?"\u00d6verk\u00f6pt":"Neutral"},
                  {l:"EMA 9/21",v:m.emaFast.toFixed(3)+" / "+m.emaSlow.toFixed(3),c:m.maCross==="golden"?C.gn:m.maCross==="death"?C.rd:C.ts,n:m.maCross==="golden"?"Golden Cross":m.maCross==="death"?"Death Cross":"Ingen"},
                  {l:"VWAP",v:(m.vwap*100).toFixed(1)+"%",c:m.yes>m.vwap?C.gn:C.rd,n:m.yes>m.vwap?"Styrka":"Svaghet"},
                  {l:"Volym 24h",v:fmt$(m.vol24),c:m.volSpike?C.or:C.cy,n:m.volSpike?"Volymspik!":"Normal"}
                ].map(function(ind){return <div key={ind.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+C.bd}}><div><div style={{fontSize:12,color:C.ts}}>{ind.l}</div><div style={{fontSize:10,color:C.dm}}>{ind.n}</div></div><div style={{fontSize:14,fontWeight:600,color:ind.c}}>{ind.v}</div></div>;})}
                <div style={{display:"flex",gap:8,marginTop:14}}>
                  <button onClick={function(e){e.stopPropagation();logTrade(m,"YES");}} className="r" style={{flex:1,background:C.gd,border:"1px solid rgba(16,185,129,.3)",color:C.gn,padding:"12px",borderRadius:6,fontSize:13,fontWeight:600}}>{"K\u00d6P YES "+(m.yes*100).toFixed(0)+"\u00a2"}</button>
                  <button onClick={function(e){e.stopPropagation();logTrade(m,"NO");}} className="r" style={{flex:1,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",color:C.rd,padding:"12px",borderRadius:6,fontSize:13,fontWeight:600}}>{"K\u00d6P NO "+(m.no*100).toFixed(0)+"\u00a2"}</button>
                </div>
                <button onClick={function(e){e.stopPropagation();toggleWatch(m);}} className="r" style={{marginTop:8,width:"100%",background:isW?"rgba(245,158,11,.08)":"rgba(255,255,255,.03)",border:"1px solid "+(isW?"rgba(245,158,11,.2)":C.bd),color:isW?C.yl:C.mt,padding:"10px",borderRadius:6,fontSize:12}}>{isW?"\u2605 Watchlist":"\u2606 Bevaka"}</button>
              </div>}
              {tab==="chart"&&<div>
                {m.priceHistory.length>5?<div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:1,height:80,marginBottom:12,background:"rgba(255,255,255,.02)",borderRadius:6,padding:"8px 4px",overflow:"hidden"}}>
                    {m.priceHistory.slice(-40).map(function(p,i,arr){var min=Math.min.apply(null,arr),max=Math.max.apply(null,arr),range=max-min||0.01;return <div key={i} style={{flex:1,height:((p-min)/range)*60+4,background:i===arr.length-1?C.ac:p>arr[0]?"rgba(16,185,129,.4)":"rgba(239,68,68,.4)",borderRadius:1,minWidth:2}}/>;
                    })}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.dm}}><span>{(m.priceHistory[0]*100).toFixed(0)+"%"}</span><span>{"Nu: "+(m.priceHistory[m.priceHistory.length-1]*100).toFixed(0)+"%"}</span></div>
                </div>:<div style={{padding:20,textAlign:"center",color:C.dm,fontSize:12}}>{"H\u00e4mtar..."}</div>}
              </div>}
            </div>
          </div>}
        </div>;})}
      </div>}

      {/* === WHALES === */}
      {pg==="whales"&&<div style={{flex:1,overflowY:"auto",padding:16,paddingBottom:60}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{"Wallet Intelligence"}</div>
        <div style={{fontSize:11,color:C.ts,marginBottom:16}}>{"Top traders senaste 30 dagarna. Tryck f\u00f6r att se positioner."}</div>

        {!walletSel?<div>
          <button onClick={loadWhales} className="r" style={{width:"100%",background:C.ag,border:"1px solid rgba(139,92,246,.2)",color:"#a78bfa",padding:"10px",borderRadius:6,fontSize:12,fontWeight:600,marginBottom:16}}>{whalesLoading?"Laddar...":"Uppdatera leaderboard"}</button>

          {whales.length===0&&!whalesLoading&&<div style={{padding:30,textAlign:"center",color:C.dm,fontSize:12}}>{"Tryck Uppdatera f\u00f6r att h\u00e4mta top traders"}</div>}

          {whales.map(function(w,i){
            var addr=w.proxyWallet||w.address||w.user||"";
            var name=w.name||w.pseudonym||w.username||(addr.substring(0,6)+"..."+addr.substring(addr.length-4));
            var pnl=parseFloat(w.pnl||w.profit||w.cashPnl||0);
            var volume=parseFloat(w.volume||0);
            var positions=parseInt(w.positions||w.totalPositions||0);
            return <div key={i} onClick={function(){loadWalletDetail(addr);}} className="r" style={{padding:"12px",background:"rgba(255,255,255,.02)",border:"1px solid "+C.bd,borderRadius:6,marginBottom:6,cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:C.tx}}>{"#"+(i+1)+" "+name}</div>
                  <div style={{fontSize:10,color:C.dm,marginTop:2}}>{addr.substring(0,10)+"..."+(positions?" | "+positions+" pos.":"")}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:16,fontWeight:700,color:pnl>0?C.gn:C.rd}}>{(pnl>0?"+":"")+fmt$(pnl)}</div>
                  {volume>0&&<div style={{fontSize:9,color:C.mt}}>{"Vol "+fmt$(volume)}</div>}
                </div>
              </div>
            </div>;
          })}
        </div>

        :<div>
          {/* Wallet detail view */}
          <button onClick={function(){setWalletSel(null);}} className="r" style={{background:"rgba(255,255,255,.04)",border:"none",color:C.ts,padding:"8px 14px",borderRadius:6,fontSize:12,marginBottom:16}}>{"< Tillbaka"}</button>
          <div style={{fontSize:13,fontWeight:600,color:C.ac,marginBottom:4}}>{walletSel.substring(0,8)+"..."+walletSel.substring(walletSel.length-6)}</div>

          {walletPos.length>0&&<div>
            <div style={{fontSize:10,color:C.mt,fontWeight:600,letterSpacing:".1em",marginTop:16,marginBottom:8}}>{"AKTIVA POSITIONER"}</div>
            {walletPos.map(function(pos,i){
              var pnl=parseFloat(pos.cashPnl||pos.pnl||0);
              var pctPnl=parseFloat(pos.percentPnl||0);
              return <div key={i} style={{padding:"10px 12px",background:pnl>0?"rgba(16,185,129,.04)":"rgba(239,68,68,.04)",border:"1px solid "+(pnl>0?"rgba(16,185,129,.15)":"rgba(239,68,68,.15)"),borderRadius:6,marginBottom:4}}>
                <div style={{fontSize:12,fontWeight:500,lineHeight:1.3}}>{(pos.title||pos.question||"").substring(0,60)}</div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                  <span style={{fontSize:10,color:C.ts}}>{(pos.outcome||pos.side||"")+" @ "+(parseFloat(pos.avgPrice||0)*100).toFixed(0)+"\u00a2"}</span>
                  <span style={{fontSize:12,fontWeight:700,color:pnl>0?C.gn:C.rd}}>{(pnl>0?"+":"")+fmt$(pnl)+" ("+(pctPnl>0?"+":"")+pctPnl.toFixed(0)+"%)"}</span>
                </div>
              </div>;
            })}
          </div>}

          {walletAct.length>0&&<div>
            <div style={{fontSize:10,color:C.mt,fontWeight:600,letterSpacing:".1em",marginTop:16,marginBottom:8}}>{"SENASTE TRADES"}</div>
            {walletAct.map(function(act,i){
              return <div key={i} style={{padding:"8px 12px",borderBottom:"1px solid "+C.bd,fontSize:11}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{color:C.ts}}>{(act.title||"").substring(0,45)}</span>
                  <span style={{color:act.side==="BUY"?C.gn:C.rd,fontWeight:600}}>{act.side}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
                  <span style={{color:C.dm}}>{(act.outcome||"")+" @ "+(parseFloat(act.price||0)*100).toFixed(0)+"\u00a2"}</span>
                  <span style={{color:C.dm}}>{act.timestamp?new Date(act.timestamp*1000).toLocaleDateString("sv-SE"):""}</span>
                </div>
              </div>;
            })}
          </div>}

          {!walletPos.length&&!walletAct.length&&<div style={{padding:20,textAlign:"center",color:C.dm,fontSize:12}} className="blink">{"H\u00e4mtar positioner..."}</div>}
        </div>}
      </div>}

      {/* === TRADES === */}
      {pg==="trades"&&<div style={{flex:1,overflowY:"auto",padding:16,paddingBottom:60}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>{"Trade Tracker"}</div>
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {[{l:"Trades",v:trades.length,c:C.ac},{l:"Avgjorda",v:settled.length,c:C.ts},{l:"ROI",v:roi+"%",c:+roi>0?C.gn:+roi<0?C.rd:C.ts}].map(function(s){return <div key={s.l} style={{flex:1,background:"rgba(255,255,255,.03)",borderRadius:6,padding:"10px 6px",textAlign:"center"}}><div style={{fontSize:9,color:C.mt}}>{s.l}</div><div style={{fontSize:16,fontWeight:700,color:s.c}}>{s.v}</div></div>;})}
        </div>
        {watchlist.length>0&&<div style={{marginBottom:16}}><div style={{fontSize:10,color:C.mt,fontWeight:600,marginBottom:8}}>{"WATCHLIST"}</div>{watchlist.map(function(w){return <div key={w.id} style={{padding:"8px 12px",background:"rgba(255,255,255,.02)",border:"1px solid "+C.bd,borderRadius:6,marginBottom:4,fontSize:12,color:C.ts}}>{w.q}</div>;})}</div>}
        {trades.length===0?<div style={{padding:30,textAlign:"center",color:C.dm,fontSize:12}}>{"Logga trades via K\u00d6P YES/NO"}</div>
        :trades.map(function(t,idx){return <div key={t.id} style={{background:t.result==="win"?"rgba(16,185,129,.04)":t.result==="loss"?"rgba(239,68,68,.04)":"rgba(255,255,255,.02)",border:"1px solid "+(t.result==="win"?"rgba(16,185,129,.2)":t.result==="loss"?"rgba(239,68,68,.2)":C.bd),borderRadius:6,padding:12,marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:12,fontWeight:600}}>{t.question}</div><div style={{fontSize:11,color:C.ts,marginTop:2}}>{t.side+" @ "+(t.price*100).toFixed(0)+"\u00a2 | Sig: "+t.signal}</div></div><div style={{fontSize:14,fontWeight:700,color:t.result==="win"?C.gn:t.result==="loss"?C.rd:C.ac}}>{t.result?t.result.toUpperCase():"$"+t.amount}</div></div>
          {!t.result&&<div style={{display:"flex",gap:8,marginTop:8}}><button onClick={function(){settleTrade(idx,true);}} className="r" style={{flex:1,background:C.gd,border:"1px solid rgba(16,185,129,.3)",color:C.gn,padding:"8px",borderRadius:6,fontSize:12,fontWeight:600}}>{"VINST"}</button><button onClick={function(){settleTrade(idx,false);}} className="r" style={{flex:1,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",color:C.rd,padding:"8px",borderRadius:6,fontSize:12,fontWeight:600}}>{"F\u00d6RL."}</button></div>}
        </div>;})}
        {trades.length>0&&<button onClick={function(){if(confirm("Radera?"))setTrades([]);}} className="r" style={{marginTop:16,background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.15)",color:C.rd,padding:"10px",borderRadius:6,fontSize:12,width:"100%"}}>{"Rensa"}</button>}
      </div>}

      {/* === INFO === */}
      {pg==="info"&&<div style={{flex:1,overflowY:"auto",padding:16,paddingBottom:60}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>{"Strategi & Signaler"}</div>
        {[{t:"RSI (14)",d:"< 30 = \u00f6vers\u00e5ld (k\u00f6p). > 70 = \u00f6verk\u00f6pt (s\u00e4lj).",c:C.cy},
          {t:"Golden/Death Cross (EMA 9/21)",d:"Golden = k\u00f6p (snabb EMA \u00f6ver l\u00e5ngsam). Death = s\u00e4lj.",c:C.gn},
          {t:"Volymspik",d:"2x normal volym = stora akt\u00f6rer r\u00f6r sig.",c:C.or},
          {t:"VWAP",d:"Pris \u00f6ver VWAP = styrka. Under = svaghet.",c:C.ac},
          {t:"Signal (-100 till +100)",d:"Kombinerar RSI, MA, volym, momentum. \u00b130 = stark signal.",c:C.yl},
          {t:"Wallet Intelligence (NY)",d:"Analyserar top traders p\u00e5 Polymarket. Se deras positioner, PnL, och senaste trades. F\u00f6lj smart money.",c:C.pk}
        ].map(function(item){return <div key={item.t} style={{marginBottom:12,padding:12,background:"rgba(255,255,255,.02)",border:"1px solid "+C.bd,borderRadius:8}}><div style={{fontSize:13,fontWeight:600,color:item.c,marginBottom:4}}>{item.t}</div><div style={{fontSize:12,color:C.ts,lineHeight:1.6}}>{item.d}</div></div>;})}
        <div style={{background:"rgba(255,255,255,.02)",borderRadius:6,padding:"10px 12px",marginTop:8,fontSize:11,color:C.dm}}>{"PolyTracker v2 | RSI | EMA Cross | VWAP | Volym | Wallet Intelligence | Polymarket API"}</div>
      </div>}

      {upd&&<div style={{position:"fixed",bottom:0,left:0,right:0,maxWidth:480,margin:"0 auto",background:C.p1,borderTop:"1px solid "+C.bd,padding:"6px 16px",fontSize:9,color:C.dm,textAlign:"center",zIndex:50}}>{"Skannad: "+upd.toLocaleTimeString("sv-SE")+" | "+markets.length+" marknader"}</div>}
    </div>
  );
}
