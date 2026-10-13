// Automatic USD→ILS exchange rate from free public sources that need no key and allow browser
// requests. Sources are tried in order and every value is sanity-checked, so one source changing or
// going away does not break the app. Rates for past dates are cached forever (they do not change).

export const FX_SOURCES=[
  {id:'frankfurter',label:'Frankfurter',latest:'https://api.frankfurter.dev/v2/rate/USD/ILS',on:date=>`https://api.frankfurter.dev/v2/rate/USD/ILS?date=${date}`,parse:j=>({rate:j?.rate,date:j?.date})},
  {id:'frankfurter-ecb',label:'Frankfurter (ECB)',latest:'https://api.frankfurter.dev/v1/latest?base=USD&symbols=ILS',on:date=>`https://api.frankfurter.dev/v1/${date}?base=USD&symbols=ILS`,parse:j=>({rate:j?.rates?.ILS,date:j?.date})},
  {id:'currency-api',label:'Currency API',latest:'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',on:date=>`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`,parse:j=>({rate:j?.usd?.ils,date:j?.date})},
  {id:'er-api',label:'ExchangeRate-API',latest:'https://open.er-api.com/v6/latest/USD',on:null,parse:j=>({rate:j?.rates?.ILS,date:j?.time_last_update_unix?new Date(j.time_last_update_unix*1000).toISOString().slice(0,10):null})}
];

// A dollar has been worth between 2.5 and 5.5 shekels for decades; anything far outside is a bad response.
export const plausibleRate=rate=>Number.isFinite(rate)&&rate>1.5&&rate<8;
export const roundRate=rate=>Math.round(rate*10000)/10000;
const isoDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10):null;

export async function fetchUsdIls({date=null,fetchImpl=globalThis.fetch,timeout=7000,sources=FX_SOURCES}={}){
  const errors=[];
  for(const source of sources){
    const url=date?source.on?.(date):source.latest;
    if(!url)continue;
    let timer=null;
    try{
      const controller=typeof AbortController==='function'?new AbortController():null;
      if(controller)timer=setTimeout(()=>controller.abort(),timeout);
      const res=await fetchImpl(url,{cache:'no-store',signal:controller?.signal});
      if(!res.ok)throw Error(`HTTP ${res.status}`);
      const parsed=source.parse(await res.json()),rate=Number(parsed.rate);
      if(!plausibleRate(rate))throw Error('implausible rate');
      const rateDate=isoDate(parsed.date)||date;
      // A historical answer must not come from a later day than asked (a source ignoring the date).
      if(date&&rateDate&&rateDate>date)throw Error('date mismatch');
      return {rate:roundRate(rate),date:rateDate,source:source.label};
    }catch(err){errors.push(`${source.id}: ${err.name==='AbortError'?'timeout':err.message}`);}
    finally{if(timer)clearTimeout(timer);}
  }
  throw Object.assign(new Error('לא הצלחנו לקבל את שער הדולר כרגע. נסה שוב כשיש חיבור לאינטרנט.'),{errors});
}

// Cache: {latest:{rate,date,source,at}, days:{'YYYY-MM-DD':{rate,date,source}}}
export function cachedRate(cache,date){return cache?.days?.[date]||null;}
export function rememberRate(cache,date,result,max=400){
  const next={latest:cache?.latest||null,days:{...(cache?.days||{})}};
  if(date)next.days[date]={rate:result.rate,date:result.date||date,source:result.source};
  else next.latest={...result,at:new Date().toISOString()};
  const keys=Object.keys(next.days).sort();
  for(const key of keys.slice(0,Math.max(0,keys.length-max)))delete next.days[key];
  return next;
}
