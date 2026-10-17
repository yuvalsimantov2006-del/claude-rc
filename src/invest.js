import {toILS,assetValue,balances,dietz,portfolioValue,assetProfit,investAccounts,investType,assetContainerId,cashContainerId,containerAssets,containerCash,DEFAULT_CONTAINER_NAME,today} from './finance.js';
import {averageMonth} from './smart.js';
import {parseNumber} from './xlsx.js';

// Investment risk, diversification and stress tests; parsing broker holdings reports.

export const SECTORS=['מניות ארה״ב','טכנולוגיה','מניות ישראל','שווקים בינלאומיים','אג״ח','נדל״ן','קריפטו','סחורות וזהב','מזומן ופיקדונות','חיסכון ארוך טווח','אחר'];
const TICKER_SECTORS={VOO:'מניות ארה״ב',SPY:'מניות ארה״ב',IVV:'מניות ארה״ב',VTI:'מניות ארה״ב',SPLG:'מניות ארה״ב',CSPX:'מניות ארה״ב',SXR8:'מניות ארה״ב',QQQ:'טכנולוגיה',QQQM:'טכנולוגיה',VGT:'טכנולוגיה',XLK:'טכנולוגיה',AAPL:'טכנולוגיה',MSFT:'טכנולוגיה',NVDA:'טכנולוגיה',GOOGL:'טכנולוגיה',GOOG:'טכנולוגיה',AMZN:'טכנולוגיה',META:'טכנולוגיה',TSLA:'טכנולוגיה',VXUS:'שווקים בינלאומיים',VEA:'שווקים בינלאומיים',VWO:'שווקים בינלאומיים',ACWI:'שווקים בינלאומיים',VT:'שווקים בינלאומיים',VWRA:'שווקים בינלאומיים',BND:'אג״ח',AGG:'אג״ח',TLT:'אג״ח',SHY:'אג״ח',BIL:'אג״ח',BTC:'קריפטו',ETH:'קריפטו',SOL:'קריפטו',IBIT:'קריפטו',GLD:'סחורות וזהב',IAU:'סחורות וזהב',VNQ:'נדל״ן',TA125:'מניות ישראל',TA35:'מניות ישראל'};
export function assetSector(a){
  if(a.sector&&SECTORS.includes(a.sector))return a.sector;
  const ticker=String(a.ticker||'').toUpperCase().trim();
  if(TICKER_SECTORS[ticker])return TICKER_SECTORS[ticker];
  const text=`${a.name||''} ${a.type||''} ${ticker}`.toLowerCase();
  if(/קריפטו|bitcoin|ביטקוין|ethereum|crypto/.test(text))return 'קריפטו';
  if(/אג"ח|אג״ח|אגח|bond|treasury|מק"מ|מק״מ|שקלית/.test(text))return 'אג״ח';
  if(['פנסיה','קרן השתלמות','קופת גמל להשקעה'].includes(a.type))return 'חיסכון ארוך טווח';
  if(a.type==='מזומן'||/פיקדון|כספית|money market/.test(text))return 'מזומן ופיקדונות';
  if(/זהב|gold|כסף טהור|silver|סחורות|commodit/.test(text))return 'סחורות וזהב';
  if(/נדל"ן|נדל״ן|reit|real estate/.test(text))return 'נדל״ן';
  if(/ת"א|ת״א|תל אביב|tase|ישראל|israel/.test(text))return 'מניות ישראל';
  if(/nasdaq|נאסד"ק|נאסד״ק|tech|טכנולוג|semiconductor/.test(text))return 'טכנולוגיה';
  if(/s&p|500|total market|ארה"ב|ארה״ב|us market|russell/.test(text))return 'מניות ארה״ב';
  if(/world|global|עולמי|emerging|אירופה|europe|international|msci/.test(text))return 'שווקים בינלאומיים';
  return 'אחר';
}
// Rough sensitivity of each sector to a broad stock-market move (1 = moves with the market).
export const SENSITIVITY={'מניות ארה״ב':1,'טכנולוגיה':1.3,'מניות ישראל':.95,'שווקים בינלאומיים':1,'אג״ח':.15,'נדל״ן':.9,'קריפטו':2.2,'סחורות וזהב':.1,'מזומן ופיקדונות':0,'חיסכון ארוך טווח':.55,'אחר':.8};

const group=(items,key)=>{const map=new Map();for(const x of items)map.set(x[key],(map.get(x[key])||0)+x.value);return map;};
const containerName=(d,id)=>investAccounts(d).find(a=>a.id===id)?.name||DEFAULT_CONTAINER_NAME;
export function riskProfile(d){
  const holdings=d.assets.map(a=>({id:a.id,name:a.ticker||a.name,fullName:a.name,currency:a.currency,type:a.type||'אחר',sector:assetSector(a),container:containerName(d,assetContainerId(d,a)),value:toILS(assetValue(a),a.currency,d.fx)})).filter(h=>h.value>0).sort((a,b)=>b.value-a.value);
  const cashIn=containerName(d,cashContainerId(d));
  const cash=[{name:'מזומן בתיק',currency:'ILS',type:'מזומן',sector:'מזומן ופיקדונות',container:cashIn,value:Math.max(0,d.wallets?.ILS||0)},{name:'דולרים בתיק',currency:'USD',type:'מזומן',sector:'מזומן ופיקדונות',container:cashIn,value:Math.max(0,(d.wallets?.USD||0)*d.fx)}].filter(c=>c.value>0);
  const invested=holdings.reduce((s,h)=>s+h.value,0),all=[...holdings,...cash],total=all.reduce((s,h)=>s+h.value,0);
  const hhi=invested?holdings.reduce((s,h)=>s+(h.value/invested)**2,0):0;
  const usd=all.filter(h=>h.currency==='USD').reduce((s,h)=>s+h.value,0);
  const toList=map=>[...map].map(([name,value])=>({name,value,share:total?value/total:0})).sort((a,b)=>b.value-a.value);
  const largest=holdings[0]||null,top3=holdings.slice(0,3).reduce((s,h)=>s+h.value,0);
  return {total,invested,cash:total-invested,holdings:holdings.map(h=>({...h,share:total?h.value/total:0})),largest:largest?{name:largest.name,fullName:largest.fullName,share:total?largest.value/total:0}:null,top3Share:total?top3/total:0,effective:hhi?1/hhi:0,usd,usdShare:total?usd/total:0,bySector:toList(group(all,'sector')),byType:toList(group(all,'type')),byContainer:toList(group(all,'container')),concentration:!largest?'none':largest.value/total>.4?'high':largest.value/total>.25?'medium':'low'};
}

export const STRESS_SCENARIOS=[
  {id:'dip',name:'תיקון בשוק המניות',detail:'ירידה של 10% במניות',market:-.1},
  {id:'bear',name:'שוק דובי',detail:'ירידה של 25% במניות',market:-.25},
  {id:'crash',name:'משבר כמו 2008',detail:'ירידה של 45% במניות',market:-.45},
  {id:'shekel',name:'השקל מתחזק',detail:'הדולר יורד ב־10% מול השקל',usd:-.1},
  {id:'crypto',name:'קריסת קריפטו',detail:'ירידה של 60% בקריפטו בלבד',crypto:-.6},
  {id:'combo',name:'ירידה ושקל חזק',detail:'מניות −20% ודולר −5%',market:-.2,usd:-.05}
];
export function stressTest(d,scenario){
  const profile=riskProfile(d),avg=averageMonth(d,new Date().toISOString().slice(0,7),3);let change=0;
  for(const h of profile.holdings){
    let move=scenario.crypto!=null?(h.sector==='קריפטו'?scenario.crypto:0):(scenario.market||0)*(SENSITIVITY[h.sector]??.8);
    move=Math.max(-.95,move);
    const after=h.value*(1+move)*(h.currency==='USD'?1+(scenario.usd||0):1);
    change+=after-h.value;
  }
  if(scenario.usd)change+=Math.max(0,(d.wallets?.USD||0)*d.fx)*scenario.usd;
  const net=balances(d).net;
  return {...scenario,change,share:profile.total?change/profile.total:0,netWorthAfter:net+change,months:avg.expenses>0?-change/avg.expenses:null};
}

// One entry per investment container (or the virtual "התיק שלי" before any exists): its holdings, value,
// lifetime profit and return in ₪ (a dollar holding's profit at today's rate), its cash and its share of the
// portfolio. The values add up to portfolioValue exactly.
export function containerSummary(d){
  const list=investAccounts(d),total=portfolioValue(d),cashId=cashContainerId(d);
  const groups=list.length?list.map(a=>({id:a.id,account:a,name:a.name,type:investType(a),institution:a.institution||'',virtual:false})):[{id:'',account:null,name:DEFAULT_CONTAINER_NAME,type:'broker',institution:'',virtual:true}];
  return groups.map(g=>{
    const holdings=containerAssets(d,g.id).map(a=>{const p=assetProfit(d,a),rate=a.currency==='USD'?d.fx:1;return {asset:a,value:toILS(assetValue(a),a.currency,d.fx),profit:p.profit*rate,invested:p.invested*rate,return:p.return};}).sort((x,y)=>y.value-x.value);
    const cash=containerCash(d,g.id),value=holdings.reduce((s,h)=>s+h.value,0)+cash,profit=holdings.reduce((s,h)=>s+h.profit,0),invested=holdings.reduce((s,h)=>s+h.invested,0);
    return {...g,holdings,cash,value,profit,invested,return:invested>0?profit/invested:null,share:total>0?value/total:0,holdsCash:g.id===cashId&&(d.wallets.ILS||d.wallets.USD)?true:false};
  });
}

// Volatility and drawdown measured from the monthly snapshots (flow-adjusted returns).
export function historyRisk(d){
  const snaps=[...d.snapshots].sort((a,b)=>a.date.localeCompare(b.date)),returns=[];
  for(let i=1;i<snaps.length;i++){const r=dietz(snaps[i-1],snaps[i],d.activities).return;if(r!=null)returns.push(r);}
  if(returns.length<2)return null;
  const mean=returns.reduce((s,r)=>s+r,0)/returns.length,sd=Math.sqrt(returns.reduce((s,r)=>s+(r-mean)**2,0)/(returns.length-1));
  let index=1,peak=1,maxDrawdown=0;
  for(const r of returns){index*=1+r;peak=Math.max(peak,index);maxDrawdown=Math.min(maxDrawdown,index/peak-1);}
  return {months:returns.length,annualVolatility:sd*Math.sqrt(12),best:Math.max(...returns),worst:Math.min(...returns),maxDrawdown,positiveShare:returns.filter(r=>r>0).length/returns.length};
}

// ---------- Broker reports ----------
const HEADERS={
  symbol:/סימול|מס['׳]? ?נייר|מספר נייר|מספר ני"ע|מספר ני״ע|symbol|ticker|isin/i,
  name:/שם נייר|שם הנייר|שם ני"ע|שם ני״ע|^שם$|נייר ערך|name|description|instrument|תיאור/i,
  quantity:/כמות|יחידות|quantity|qty|shares|units|position|amount held/i,
  price:/שער|מחיר|last|price|close|rate|quote/i,
  value:/שווי|market value|value|שווי שוק|שווי נוכחי|סה"כ שווי|סה״כ שווי/i,
  currency:/מטבע|currency|ccy/i
};
const SKIP=/עלות|cost|רווח|הפסד|p&l|gain|תשואה|change|שינוי|%|weight|משקל/i;
function headerMap(row){
  const map={};
  row.forEach((cell,i)=>{
    const text=String(cell??'').trim();if(!text)return;
    for(const [key,re] of Object.entries(HEADERS)){
      if(map[key]!=null||!re.test(text))continue;
      if(key!=='currency'&&SKIP.test(text)&&!(key==='value'&&/שווי/.test(text)&&!/עלות/.test(text)))continue;
      if(key==='name'&&map.symbol===i)continue;
      map[key]=i;
      if(key==='price'&&/אג['׳]|אגורות|agorot/i.test(text))map.agorot=true;
      break;
    }
  });
  return map;
}
// Rows of a pasted or exported holdings table → [{symbol,name,quantity,price,value,currency}].
export function parseHoldingsRows(rows){
  const clean=rows.map(r=>r.map(c=>typeof c==='string'?c.replace(/[‎‏]/g,'').trim():c)).filter(r=>r.some(c=>c!==''&&c!=null));
  let headerIndex=-1,map={};
  for(let i=0;i<Math.min(clean.length,15);i++){const m=headerMap(clean[i]);if(Object.keys(m).filter(k=>k!=='agorot').length>=2&&(m.quantity!=null||m.price!=null||m.value!=null)){headerIndex=i;map=m;break;}}
  const out=[];
  for(const row of clean.slice(headerIndex+1)){
    const label=String(row[map.name??-1]??'').trim(),symbol=String(row[map.symbol??-1]??'').trim();
    const texts=row.filter(c=>typeof c==='string'&&c&&parseNumber(c)==null);
    const name=label||texts.find(t=>t!==symbol)||'',sym=symbol||(texts.find(t=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t))||'');
    if(/סה"כ|סה״כ|total|^סך/i.test(`${name} ${sym}`))continue;
    const pick=key=>map[key]!=null?parseNumber(row[map[key]]):null;
    let quantity=pick('quantity'),price=pick('price'),value=pick('value');
    if(headerIndex<0){const nums=row.map(parseNumber).filter((n,i)=>n!=null&&!(typeof row[i]==='string'&&/^[A-Z]/.test(row[i])));if(!nums.length)continue;[quantity,price,value]=nums.length>=3?nums.slice(-3):nums.length===2?[nums[0],nums[1],null]:[null,null,nums[0]];}
    if(quantity==null&&price==null&&value==null)continue;
    if(!name&&!sym)continue;
    out.push({symbol:sym,name:name||sym,quantity,price,value,currency:String(row[map.currency??-1]??'').trim(),noHeader:headerIndex<0,agorot:!!map.agorot});
  }
  return out;
}

const norm=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function findAsset(assets,row){
  const sym=String(row.symbol||'').toUpperCase().trim(),name=norm(row.name);
  return assets.find(a=>sym&&String(a.ticker||'').toUpperCase()===sym)
    ||assets.find(a=>a.ticker&&(String(row.name||'').toUpperCase().split(/[^A-Z0-9.]+/).includes(String(a.ticker).toUpperCase())))
    ||assets.find(a=>{const n=norm(a.name);return n&&name&&(n===name||n.includes(name)||name.includes(n));})
    ||assets.find(a=>{const words=norm(a.name).split(' ').filter(w=>w.length>2);return words.length&&words.filter(w=>name.includes(w)).length>=Math.min(2,words.length);});
}
// Matches report rows to existing holdings and proposes new prices or values for review. A report usually comes
// from one account (a broker's holdings page), so `accountId` limits the match to that container's holdings.
export function matchHoldings(d,rows,{accountId=null}={}){
  const matches=[],unmatched=[],used=new Set(),assets=accountId==null?d.assets:containerAssets(d,accountId);
  for(const row of rows){
    const asset=findAsset(assets,row);
    if(!asset||used.has(asset.id)){unmatched.push(row);continue;}
    used.add(asset.id);
    let {quantity,price,value}=row;const flags=[];
    if(row.noHeader&&quantity!=null&&price!=null&&asset.mode==='price'&&Math.abs(quantity-asset.quantity)>1e-6&&Math.abs(price-asset.quantity)<1e-6)[quantity,price]=[price,quantity];
    if(asset.mode==='price'){
      if(price==null&&value!=null)price=value/((quantity||asset.quantity)||NaN);
      // Tel Aviv prices are often quoted in agorot; foreign holdings in the same column are not.
      if(price!=null&&asset.currency==='ILS'){const ratio=asset.currentPrice>0?price/asset.currentPrice:null;if(row.agorot&&!(ratio!=null&&ratio<3)||ratio!=null&&ratio>60&&ratio<160){price/=100;flags.push('agorot');}}
      if(!(price>0)){unmatched.push(row);continue;}
      if(quantity!=null&&Math.abs(quantity-asset.quantity)>Math.max(1e-6,asset.quantity*1e-4))flags.push('quantity');
      const oldValue=asset.quantity*asset.currentPrice,newValue=asset.quantity*price;
      matches.push({asset,row,field:'currentPrice',old:asset.currentPrice,next:Math.round(price*1e6)/1e6,oldValue,newValue,change:asset.currentPrice?price/asset.currentPrice-1:null,flags,reportQuantity:quantity});
    }else{
      if(value==null&&price!=null&&quantity!=null)value=price*quantity;
      if(!(value>=0)||value==null){unmatched.push(row);continue;}
      matches.push({asset,row,field:'currentValue',old:asset.currentValue,next:Math.round(value*100)/100,oldValue:asset.currentValue,newValue:value,change:asset.currentValue?value/asset.currentValue-1:null,flags,reportQuantity:quantity});
    }
    if(matches.at(-1).change!=null&&Math.abs(matches.at(-1).change)>.35)matches.at(-1).flags.push('jump');
  }
  return {matches,unmatched,missing:assets.filter(a=>!used.has(a.id))};
}

// ---------- 4.2: today's price, the daily update and the per-holding "מחיר היום" ----------
// Both write a holding exactly the same way (quotes-ui.js): a price-tracked holding gets its price per unit, a
// value-tracked one (a provident fund typed as a total) its total value; the date it was updated, the trading
// date of the price and where it came from (the source of a fetched price, or "ידני" when it was typed).
export const todayPriceField=a=>a.mode==='price'?'currentPrice':'currentValue';
// value: what was typed or fetched; fetched: the fetch result for this holding ({status:'ok',price,date,source})
// or nothing. Returns whether the holding changed: an unchanged typed value is not a change. Throws on a bad value.
export function setTodayPrice(a,value,fetched,now=today()){
  const v=Number(value),key=todayPriceField(a);
  if(String(value??'').trim()===''||!Number.isFinite(v)||v<0||(a.mode==='price'&&v===0))throw Error(`יש להזין ${a.mode==='price'?'מחיר':'שווי'} תקין ל״${a.name}״.`);
  const auto=fetched?.status==='ok'&&Math.abs(fetched.price-v)<1e-9;
  if(Math.abs(v-a[key])<1e-9&&!auto)return false;
  a[key]=Math.round(v*1e6)/1e6;a.date=now;a.priceDate=auto?fetched.date:now;a.priceSource=auto?fetched.source:'ידני';
  return true;
}
// The daily update on a copy of the data: values {assetId: typed value}, results Map assetId → fetch result.
// strict: a bad value throws (on save); otherwise that holding is skipped (the live total while typing).
export function dailyPricesDraft(d,values,results=new Map(),now=today(),strict=true){
  const next=structuredClone(d),changes=[];
  for(const a of next.assets){
    if(!Object.hasOwn(values,a.id))continue;
    try{if(setTodayPrice(a,values[a.id],results.get(a.id),now))changes.push(a.id);}catch(err){if(strict)throw err;}
  }
  return {next,changes};
}
// One holding's price for today: the daily update with that holding alone, so the saved data is identical.
export function todayPriceDraft(d,assetId,value,fetched=null,now=today()){
  if(!d.assets.some(a=>a.id===assetId))throw Error('הנכס לא נמצא. ייתכן שנמחק.');
  const {next,changes}=dailyPricesDraft(d,{[assetId]:value},new Map(fetched?[[assetId,fetched]]:[]),now,true);
  return {next,changed:changes.length>0};
}
// The home "השקעות" tile: the portfolio value, its lifetime gain in ₪ and %, and how fresh the prices are
// (the latest update, and whether any holding is overdue: a week for market prices, ~5 weeks for typed values).
export function portfolioGlance(d,now=today()){
  const list=containerSummary(d),profit=list.reduce((s,c)=>s+c.profit,0),invested=list.reduce((s,c)=>s+c.invested,0);
  const age=date=>date?Math.round((new Date(now)-new Date(date))/864e5):null,latest=d.assets.map(a=>a.date).filter(Boolean).sort().at(-1)||null;
  const stale=d.assets.some(a=>{const days=age(a.date);return days==null||days>(a.mode==='value'?35:7);});
  return {value:portfolioValue(d),profit,invested,return:invested>0?profit/invested:null,count:d.assets.length,latest,days:age(latest),stale,updatedToday:d.assets.filter(a=>a.date===now).length};
}
