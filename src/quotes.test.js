import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteRoute,checkQuote,fetchQuotes,parseCoinGecko,parseCoinbase,parseFinnhub,parseTwelveData,coingeckoUrl,finnhubUrl,twelveDataUrl,QUOTE_REASONS,CRYPTO_IDS} from './quotes.js';

const NOW='2026-10-14';
const holding=(id,extra={})=>({id,name:id,ticker:id.toUpperCase(),type:'קרן סל',currency:'USD',quantity:10,averagePrice:100,invested:1000,currentPrice:100,currentValue:0,mode:'price',date:'2026-10-01',...extra});
const finnhub={provider:'finnhub',key:'k-123'},twelve={provider:'twelvedata',key:'t-456'};
const unix=date=>Date.parse(date+'T20:00:00Z')/1000;
// A fake fetch: routes by host, records every URL, answers {status, body}.
function fakeFetch(routes){
  const calls=[];
  const impl=async url=>{calls.push(url);const u=new URL(url);const r=routes(u);if(r instanceof Error)throw r;const {status=200,body=null}=r||{status:404};return {ok:status>=200&&status<300,status,json:async()=>{if(body==null)throw new Error('no json');return body;}};};
  impl.calls=calls;return impl;
}

test('routes: value-tracked, shekel (TASE) and ticker-less holdings are typed; crypto needs no key; US stocks need one',()=>{
  assert.deepEqual(quoteRoute(holding('fund',{mode:'value'})),{kind:'manual',why:'value'});
  assert.deepEqual(quoteRoute(holding('ta125',{currency:'ILS'}),finnhub),{kind:'manual',why:'tase'});
  assert.deepEqual(quoteRoute(holding('x',{ticker:''}),finnhub),{kind:'manual',why:'no-ticker'});
  assert.deepEqual(quoteRoute(holding('btc',{type:'קריפטו'})),{kind:'crypto',symbol:'bitcoin',code:'BTC'});
  assert.deepEqual(quoteRoute(holding('eth',{ticker:'ETH-USD',name:'Ethereum'})),{kind:'crypto',symbol:'ethereum',code:'ETH'});
  assert.deepEqual(quoteRoute(holding('btc',{type:'קריפטו',currency:'ILS'})).kind,'crypto','crypto has a shekel price too');
  assert.deepEqual(quoteRoute(holding('link')),{kind:'manual',why:'needs-key'},'LINK is a stock ticker unless the holding is crypto');
  assert.deepEqual(quoteRoute(holding('voo'),finnhub),{kind:'stock',symbol:'VOO'});
  assert.deepEqual(quoteRoute(holding('brk.b'),twelve),{kind:'stock',symbol:'BRK.B'});
  assert.deepEqual(quoteRoute(holding('voo'),{provider:'nope',key:'x'}),{kind:'manual',why:'needs-key'});
  for(const r of ['value','tase','needs-key','no-ticker','not-found','auth','limit','network','far','stale','currency','bad','no-access'])assert.ok(QUOTE_REASONS[r],r);
  assert.equal(CRYPTO_IDS.BTC,'bitcoin');
});

test('parsers read each source and reject what is not a price',()=>{
  assert.deepEqual(parseCoinGecko({bitcoin:{usd:67000,ils:245000,last_updated_at:unix('2026-10-14')}},'bitcoin','ILS'),{price:245000,date:'2026-10-14',currency:'ILS'});
  assert.throws(()=>parseCoinGecko({},'bitcoin','USD'),e=>e.why==='not-found');
  assert.equal(parseCoinbase({data:{amount:'67000.5',base:'BTC',currency:'USD'}},'USD').price,67000.5);
  assert.throws(()=>parseCoinbase({data:{amount:'1',currency:'EUR'}},'USD'),e=>e.why==='currency');
  assert.deepEqual(parseFinnhub({c:541.2,pc:538,t:unix('2026-10-13')}),{price:541.2,date:'2026-10-13',previous:538});
  assert.throws(()=>parseFinnhub({c:0,d:null,pc:0,t:0}),e=>e.why==='not-found');
  assert.throws(()=>parseFinnhub({error:'Invalid API key'}),e=>e.why==='auth');
  assert.throws(()=>parseFinnhub({error:"You don't have access to this resource."}),e=>e.why==='no-access');
  assert.deepEqual(parseTwelveData({symbol:'VOO',close:'541.20',datetime:'2026-10-13',currency:'USD',previous_close:'538'},['VOO']),{VOO:{price:541.2,date:'2026-10-13',currency:'USD',previous:538}});
  const batch=parseTwelveData({VOO:{close:'541.2',datetime:'2026-10-13',currency:'USD'},ZZZZ:{status:'error',code:404,message:'symbol not found'}},['VOO','ZZZZ']);
  assert.equal(batch.VOO.price,541.2);assert.equal(batch.ZZZZ.why,'not-found');
  assert.throws(()=>parseTwelveData({status:'error',code:401,message:'apikey is incorrect'},['VOO']),e=>e.why==='auth');
  assert.throws(()=>parseTwelveData({status:'error',code:429,message:'run out of API credits'},['VOO','QQQ']),e=>e.why==='limit');
  assert.match(coingeckoUrl(['bitcoin','ethereum']),/ids=bitcoin,ethereum&vs_currencies=usd,ils/);
  assert.match(finnhubUrl('BRK.B','a b'),/symbol=BRK\.B&token=a%20b$/);
  assert.match(twelveDataUrl(['VOO','QQQ'],'k'),/quote\?symbol=VOO,QQQ&apikey=k$/);
});

test('sanity check: positive, same currency, recent, and within 5× of the last price; big moves are flagged',()=>{
  const a=holding('voo',{currentPrice:500});
  const c=checkQuote(a,{price:510,date:'2026-10-13'},NOW);assert.deepEqual({...c,change:Math.round(c.change*1e6)/1e6},{ok:true,price:510,date:'2026-10-13',flags:[],change:.02});
  assert.deepEqual(checkQuote(a,{price:650,date:NOW},NOW).flags,['jump']);
  assert.equal(checkQuote(holding('btc',{currentPrice:500}),{price:650,date:NOW},NOW,{crypto:true}).flags.length,0,'crypto moves more before a warning');
  assert.equal(checkQuote(a,{price:50000},NOW).why,'far','agorot or another security');
  assert.equal(checkQuote(a,{price:90},NOW).why,'far');
  assert.equal(checkQuote(a,{price:0},NOW).why,'bad');assert.equal(checkQuote(a,{price:NaN},NOW).why,'bad');assert.equal(checkQuote(a,{price:-3},NOW).why,'bad');
  assert.equal(checkQuote(a,{price:510,currency:'EUR'},NOW).why,'currency');
  assert.equal(checkQuote(a,{price:510,date:'2026-09-20'},NOW).why,'stale');
  assert.equal(checkQuote(a,{price:510,date:'2026-10-15'},NOW).date,NOW,'a source a day ahead (time zones) is dated today');
  assert.equal(checkQuote(a,{price:510,date:'2026-11-15'},NOW).why,'bad');
  assert.equal(checkQuote(holding('new',{currentPrice:0}),{price:12},NOW).ok,true,'no previous price: accepted');
});

test('fetchQuotes: crypto in one CoinGecko request, stocks from Finnhub, manual ones never fetched, results as they arrive',async()=>{
  const assets=[holding('voo',{currentPrice:500}),holding('qqq',{currentPrice:480}),holding('btc',{type:'קריפטו',currentPrice:60000}),holding('eth',{type:'קריפטו',currentPrice:2500,currency:'ILS'}),holding('ta125',{currency:'ILS'}),holding('fund',{mode:'value'})];
  const fetchImpl=fakeFetch(u=>{
    if(u.hostname==='api.coingecko.com')return {body:{bitcoin:{usd:61000,ils:223000,last_updated_at:unix(NOW)},ethereum:{usd:2600,ils:9500,last_updated_at:unix(NOW)}}};
    if(u.hostname==='finnhub.io'){assert.equal(u.searchParams.get('token'),'k-123');return {body:u.searchParams.get('symbol')==='VOO'?{c:510.5,pc:505,t:unix('2026-10-13')}:{c:0,pc:0,t:0}};}
  });
  const seen=[];
  const r=await fetchQuotes(assets,finnhub,{fetchImpl,now:NOW,onResult:id=>seen.push(id)});
  assert.equal(fetchImpl.calls.filter(u=>u.includes('coingecko')).length,1,'one request for all coins');
  assert.equal(fetchImpl.calls.length,3,'two stocks and one crypto request — nothing for the typed ones');
  assert.ok(!fetchImpl.calls.some(u=>/TA125|fund/i.test(u)));
  assert.deepEqual({...r.get('voo'),change:Math.round(r.get('voo').change*1e4)/1e4},{status:'ok',source:'Finnhub',ok:true,price:510.5,date:'2026-10-13',flags:[],change:.021});
  assert.deepEqual([r.get('qqq').status,r.get('qqq').why],['error','not-found']);
  assert.equal(r.get('btc').price,61000);assert.equal(r.get('btc').source,'CoinGecko');
  assert.equal(r.get('eth').price,9500,'a shekel holding gets the shekel price');assert.deepEqual(r.get('eth').flags,['jump']);
  assert.deepEqual(r.get('ta125'),{status:'manual',why:'tase'});assert.deepEqual(r.get('fund'),{status:'manual',why:'value'});
  assert.equal(seen.length,6);assert.deepEqual(seen.slice(0,2),['ta125','fund'],'the typed rows are known at once');
});

test('fetchQuotes: Coinbase is the crypto fallback; a refused key stops the other stock requests; offline is a clean error',async()=>{
  const assets=[holding('btc',{type:'קריפטו',currentPrice:60000}),holding('voo'),holding('qqq'),holding('spy'),holding('dia'),holding('iwm')];
  const fetchImpl=fakeFetch(u=>{
    if(u.hostname==='api.coingecko.com')return {status:429,body:{status:{error_code:429}}};
    if(u.hostname==='api.coinbase.com')return {body:{data:{amount:'61234.5',base:'BTC',currency:'USD'}}};
    if(u.hostname==='finnhub.io')return {status:401,body:{error:'Invalid API key'}};
  });
  const r=await fetchQuotes(assets,finnhub,{fetchImpl,now:NOW});
  assert.equal(r.get('btc').source,'Coinbase');assert.equal(r.get('btc').price,61234.5);
  for(const id of ['voo','qqq','spy','dia','iwm'])assert.equal(r.get(id).why,'auth',id);
  assert.ok(fetchImpl.calls.filter(u=>u.includes('finnhub')).length<=4,'at most the four in flight before the refusal');
  const offline=await fetchQuotes(assets,finnhub,{fetchImpl:fakeFetch(()=>new TypeError('Failed to fetch')),now:NOW});
  assert.ok([...offline.values()].every(x=>x.status==='error'&&x.why==='network'));
  const none=await fetchQuotes(assets,finnhub,{fetchImpl:null,now:NOW});
  assert.ok([...none.values()].every(x=>x.status==='error'));
});

test('fetchQuotes: Twelve Data in batches of eight, with per-symbol errors and the shekel guard',async()=>{
  const ids=['a','b','c','d','e','f','g','h','i'],assets=ids.map(id=>holding(id,{currentPrice:100}));
  const fetchImpl=fakeFetch(u=>{
    assert.equal(u.hostname,'api.twelvedata.com');assert.equal(u.searchParams.get('apikey'),'t-456');
    const symbols=u.searchParams.get('symbol').split(',');
    if(symbols.length===1)return {body:{status:'error',code:429,message:'You have run out of API credits for the current minute.'}};
    return {body:Object.fromEntries(symbols.map(s=>[s,s==='C'?{status:'error',code:404,message:'symbol not found'}:s==='D'?{close:'101',datetime:NOW,currency:'EUR'}:{close:'102.5',datetime:'2026-10-13 15:59:00',currency:'USD'}]))};
  });
  const r=await fetchQuotes(assets,twelve,{fetchImpl,now:NOW});
  assert.equal(fetchImpl.calls.length,2);assert.equal(fetchImpl.calls[0].split('symbol=')[1].split('&')[0].split(',').length,8);
  assert.equal(r.get('a').price,102.5);assert.equal(r.get('a').date,'2026-10-13');assert.equal(r.get('a').source,'Twelve Data');
  assert.equal(r.get('c').why,'not-found');assert.equal(r.get('d').why,'currency');assert.equal(r.get('i').why,'limit');
});

test('fetchQuotes: a hung source times out into the typed path',async()=>{
  const fetchImpl=(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))));
  const r=await fetchQuotes([holding('voo')],finnhub,{fetchImpl,now:NOW,timeout:30});
  assert.deepEqual([r.get('voo').status,r.get('voo').why],['error','network']);
});
