import {today,validDate} from './finance.js';

// Today's prices for the daily update (4.1). Only free sources that answer a browser directly (CORS), so no
// server is involved:
// - crypto: CoinGecko's public price API (no key), with Coinbase's public spot price as the fallback;
// - US stocks and ETFs: Finnhub or Twelve Data, each with a free personal key that the user pastes in the
//   settings (kept only on this device, never in the data, backups or sync). Without a key they are typed.
// Neither free tier covers the Tel Aviv exchange, Israeli mutual funds or provident funds, so those are always
// typed from the report. Only the ticker is sent (never a quantity or anything personal), every value is
// sanity-checked before it is offered, and a failure only ever falls back to typing the price.

export const QUOTES_KEY='ofek-quotes-v1';
export const QUOTE_PROVIDERS={
  finnhub:{label:'Finnhub',signup:'https://finnhub.io/register',limit:'60 בקשות בדקה',cover:'מניות וקרנות סל בבורסות ארה״ב'},
  twelvedata:{label:'Twelve Data',signup:'https://twelvedata.com/register',limit:'800 בקשות ביום ו־8 בדקה',cover:'מניות וקרנות סל בבורסות ארה״ב'}
};
// Ticker → CoinGecko id. A ticker counts as crypto only when the holding is marked as crypto (LINK and LTC are
// also US stock tickers).
export const CRYPTO_IDS={BTC:'bitcoin',ETH:'ethereum',SOL:'solana',XRP:'ripple',ADA:'cardano',DOGE:'dogecoin',LTC:'litecoin',BNB:'binancecoin',DOT:'polkadot',AVAX:'avalanche-2',LINK:'chainlink',TRX:'tron',TON:'the-open-network',XLM:'stellar',BCH:'bitcoin-cash',USDT:'tether',USDC:'usd-coin'};
export const QUOTE_REASONS={
  value:'שווי כולל — מקלידים מהדוח',
  tase:'נייר בשקלים (בורסת ת״א) — אין מקור חינמי, מקלידים',
  'needs-key':'מניה בארה״ב — אפשר לחבר מפתח חינמי בהגדרות',
  'no-ticker':'אין סימול — מקלידים',
  'not-found':'הסימול לא נמצא במקור המחירים',
  auth:'מקור המחירים דחה את המפתח — כדאי לבדוק אותו בהגדרות',
  limit:'עברנו את מגבלת הבקשות של המקור — אפשר לנסות שוב בעוד דקה',
  'no-access':'המקור לא נותן את הנייר הזה בתוכנית החינמית — מקלידים',
  network:'אין חיבור למקור המחירים כרגע',
  far:'המחיר רחוק מאוד מהקודם — ייתכן שזה נייר אחר, ולכן לא מילאנו אותו',
  stale:'המקור החזיר מחיר ישן — לא מילאנו אותו',
  currency:'המקור מחזיר מחיר במטבע אחר מהנכס',
  bad:'המקור החזיר תשובה לא תקינה'
};

const QT_STOCK_TICKER=/^[A-Z][A-Z0-9.\-]{0,9}$/;
const qtTicker=t=>String(t||'').toUpperCase().replace(/\s+/g,'');
const qtIsCrypto=a=>a.type==='קריפטו'||/קריפטו|crypto|bitcoin|ביטקוין|ethereum/i.test(`${a.name||''} ${a.sector||''}`);
// Where today's price of a holding can come from: {kind:'crypto'|'stock'|'manual', symbol, why}.
export function quoteRoute(a,settings={}){
  if(a.mode==='value')return {kind:'manual',why:'value'};
  const ticker=qtTicker(a.ticker),coin=ticker.replace(/[-/]?(USDT|USD|ILS)$/,'');
  if(!ticker)return {kind:'manual',why:'no-ticker'};
  if(CRYPTO_IDS[coin]&&qtIsCrypto(a))return {kind:'crypto',symbol:CRYPTO_IDS[coin],code:coin};
  if(a.currency!=='USD')return {kind:'manual',why:'tase'};
  if(!QT_STOCK_TICKER.test(ticker))return {kind:'manual',why:'no-ticker'};
  if(!settings.key||!QUOTE_PROVIDERS[settings.provider])return {kind:'manual',why:'needs-key'};
  return {kind:'stock',symbol:ticker};
}

const qtUnixDate=t=>Number(t)>0?new Date(Number(t)*1000).toISOString().slice(0,10):null;
const qtIsoDay=v=>typeof v==='string'&&validDate(v.slice(0,10))?v.slice(0,10):null;
// ---------- URLs and response parsers (pure; each throws a coded error the UI can explain) ----------
export const coingeckoUrl=ids=>`https://api.coingecko.com/api/v3/simple/price?ids=${ids.map(encodeURIComponent).join(',')}&vs_currencies=usd,ils&include_last_updated_at=true`;
export const coinbaseUrl=(code,currency)=>`https://api.coinbase.com/v2/prices/${encodeURIComponent(code)}-${currency}/spot`;
export const finnhubUrl=(symbol,key)=>`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`;
export const twelveDataUrl=(symbols,key)=>`https://api.twelvedata.com/quote?symbol=${symbols.map(encodeURIComponent).join(',')}&apikey=${encodeURIComponent(key)}`;
const qtFail=(why,detail='')=>Object.assign(new Error(why+(detail?`: ${detail}`:'')),{why});
// {bitcoin:{usd:67000,ils:245000,last_updated_at:…}} → the price in the holding's currency.
export function parseCoinGecko(json,id,currency){
  const row=json?.[id],price=Number(row?.[currency==='ILS'?'ils':'usd']);
  if(!row)throw qtFail('not-found');
  return {price,date:qtUnixDate(row.last_updated_at),currency};
}
// {data:{amount:"67000.12",base:"BTC",currency:"USD"}}
export function parseCoinbase(json,currency){
  const amount=Number(json?.data?.amount);
  if(json?.data?.currency&&json.data.currency!==currency)throw qtFail('currency');
  if(!json?.data)throw qtFail('not-found');
  return {price:amount,date:null,currency};
}
// {c:current,pc:previous close,t:unix}; an unknown symbol answers all zeros.
export function parseFinnhub(json){
  if(json?.error)throw qtFail(/access|plan/i.test(json.error)?'no-access':/key|token/i.test(json.error)?'auth':/limit/i.test(json.error)?'limit':'not-found',json.error);
  const price=Number(json?.c);
  if(!(price>0)&&!(Number(json?.t)>0))throw qtFail('not-found');
  return {price,date:qtUnixDate(json.t),previous:Number(json.pc)||null};
}
// One symbol answers a quote object; several answer {SYMBOL:quote}. An error is {status:'error',code,message}.
const qtTwelveError=j=>qtFail(j.code===401?'auth':j.code===403?'no-access':j.code===429?'limit':j.code===404||/symbol/i.test(j.message||'')?'not-found':'bad',j.message);
export function parseTwelveData(json,symbols){
  if(json?.status==='error'&&(symbols.length===1||!symbols.some(s=>json[s])))throw qtTwelveError(json);
  const one=symbols.length===1&&!json?.[symbols[0]],out={};
  for(const s of symbols){
    const q=one?json:json?.[s];
    if(!q){out[s]=qtFail('not-found');continue;}
    if(q.status==='error'){out[s]=qtTwelveError(q);continue;}
    out[s]={price:Number(q.close),date:qtIsoDay(q.datetime),currency:q.currency||null,previous:Number(q.previous_close)||null};
  }
  return out;
}

// ---------- Sanity check ----------
// A price is offered only when it is a positive number in the holding's currency, from the last ten days and
// within 5× of the previous price (outside that it is most likely another security, or agorot). A move of more
// than 25% (40% for crypto) is offered with a warning.
export function checkQuote(a,q,now=today(),{crypto=false}={}){
  const price=Number(q?.price);
  if(!Number.isFinite(price)||!(price>0)||price>1e9)return {ok:false,why:'bad'};
  if(q.currency&&q.currency!==a.currency)return {ok:false,why:'currency'};
  const date=qtIsoDay(q.date)||now,age=Math.round((new Date(now)-new Date(date))/864e5);
  if(age>10)return {ok:false,why:'stale',date};
  if(age<-1)return {ok:false,why:'bad'};
  const old=Number(a.currentPrice),ratio=old>0?price/old:null;
  if(ratio!=null&&(ratio<.2||ratio>5))return {ok:false,why:'far',price};
  const flags=ratio!=null&&Math.abs(ratio-1)>(crypto?.4:.25)?['jump']:[];
  return {ok:true,price:Math.round(price*1e6)/1e6,date:date>now?now:date,flags,change:ratio==null?null:ratio-1};
}

// ---------- Fetching ----------
async function qtGetJSON(url,{fetchImpl,timeout}){
  let timer=null;
  try{
    const controller=typeof AbortController==='function'?new AbortController():null;
    if(controller&&typeof setTimeout==='function')timer=setTimeout(()=>controller.abort(),timeout);
    const res=await fetchImpl(url,{cache:'no-store',signal:controller?.signal});
    let json=null;try{json=await res.json();}catch{}
    if(res.status===401||(res.status===403&&!/access|plan|upgrade/i.test(json?.error||json?.message||'')))throw qtFail('auth',json?.error||json?.message||'');
    if(res.status===403)throw qtFail('no-access',json?.error||json?.message||'');
    if(res.status===429)throw qtFail('limit');
    if(!res.ok&&!json)throw qtFail(res.status===404?'not-found':'network',`HTTP ${res.status}`);
    return json;
  }catch(err){throw err.why?err:qtFail('network',err.name==='AbortError'?'timeout':err.message);}
  finally{if(timer)clearTimeout(timer);}
}
const qtSettle=(a,q,source,now,crypto)=>{const c=checkQuote(a,q,now,{crypto});return c.ok?{status:'ok',source,...c}:{status:'error',source,why:c.why};};
const qtFailed=(err,source)=>({status:'error',source,why:err.why||'network'});

// Fetches today's price of every holding it can. `onResult(assetId,result)` is called as each one arrives;
// the promise resolves to a Map assetId → {status:'ok',price,date,source,flags,change} | {status:'error',why} |
// {status:'manual',why}. It never throws.
export async function fetchQuotes(assets,settings={},{fetchImpl=globalThis.fetch,now=today(),timeout=8000,onResult=()=>{}}={}){
  const results=new Map(),put=(id,r)=>{results.set(id,r);try{onResult(id,r);}catch{}};
  const routed=assets.map(a=>({a,r:quoteRoute(a,settings)}));
  for(const {a,r} of routed)if(r.kind==='manual')put(a.id,{status:'manual',why:r.why});
  if(typeof fetchImpl!=='function'){for(const {a,r} of routed)if(r.kind!=='manual')put(a.id,{status:'error',why:'network'});return results;}
  const opts={fetchImpl,timeout};
  // Crypto: one CoinGecko request for all of them; Coinbase one by one for whatever it misses.
  const crypto=routed.filter(x=>x.r.kind==='crypto');
  const cryptoJob=(async()=>{
    if(!crypto.length)return;
    let json=null;try{json=await qtGetJSON(coingeckoUrl([...new Set(crypto.map(x=>x.r.symbol))]),opts);}catch{}
    await Promise.all(crypto.map(async({a,r})=>{
      try{if(!json)throw qtFail('network');put(a.id,qtSettle(a,parseCoinGecko(json,r.symbol,a.currency),'CoinGecko',now,true));return;}catch{}
      try{put(a.id,qtSettle(a,parseCoinbase(await qtGetJSON(coinbaseUrl(r.code,a.currency),opts),a.currency),'Coinbase',now,true));}
      catch(err){put(a.id,qtFailed(err,'Coinbase'));}
    }));
  })();
  // Stocks: Finnhub one symbol per request (60 a minute, four at a time); Twelve Data up to 8 symbols a request.
  const stocks=routed.filter(x=>x.r.kind==='stock'),label=QUOTE_PROVIDERS[settings.provider]?.label||'';
  const stockJob=(async()=>{
    if(!stocks.length)return;
    if(settings.provider==='twelvedata'){
      for(let i=0;i<stocks.length;i+=8){
        const batch=stocks.slice(i,i+8),symbols=[...new Set(batch.map(x=>x.r.symbol))];
        try{const out=parseTwelveData(await qtGetJSON(twelveDataUrl(symbols,settings.key),opts),symbols);
          for(const {a,r} of batch){const q=out[r.symbol];put(a.id,q instanceof Error?qtFailed(q,label):qtSettle(a,q,label,now,false));}}
        catch(err){for(const {a} of batch)put(a.id,qtFailed(err,label));}
      }
      return;
    }
    const queue=[...stocks];let stop=null;
    await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
      while(queue.length){
        const {a,r}=queue.shift();
        if(stop){put(a.id,{status:'error',source:label,why:stop});continue;}
        try{put(a.id,qtSettle(a,parseFinnhub(await qtGetJSON(finnhubUrl(r.symbol,settings.key),opts)),label,now,false));}
        catch(err){if(err.why==='auth'||err.why==='limit')stop=err.why;put(a.id,qtFailed(err,label));}
      }
    }));
  })();
  await Promise.all([cryptoJob,stockJob]);
  return results;
}
