// נועה — the data model (pure: no DOM, no storage). One JSON object under localStorage 'noa-data-v1'.
// emptyData · uid · validateData (normalises, or throws with a Hebrew message) · migrate · demoData · counts,
// and the fixed vocabularies every screen shares (categories, sentiments, kinds…, each with a Hebrew label and an
// icon name from src/icons.js). Unknown fields are preserved everywhere: a newer screen may add fields and an older
// one must never drop them. Private helpers here are prefixed "md" (the build shares one scope across files).

export const DATA_VERSION=1;
export const DATA_KEY='noa-data-v1';

// ---------- Vocabularies ----------
export const FACT_CATEGORIES=[
  {id:'food',label:'אוכל',icon:'Utensils'},
  {id:'drinks',label:'שתייה וקפה',icon:'Coffee'},
  {id:'sweets',label:'מתוקים',icon:'IceCreamCone'},
  {id:'music',label:'מוזיקה',icon:'Music'},
  {id:'shows',label:'סרטים וסדרות',icon:'Clapperboard'},
  {id:'books',label:'ספרים',icon:'BookOpen'},
  {id:'style',label:'סטייל ובגדים',icon:'Shirt'},
  {id:'beauty',label:'טיפוח',icon:'Sparkles'},
  {id:'flowers',label:'פרחים',icon:'Flower2'},
  {id:'colors',label:'צבעים',icon:'Palette'},
  {id:'brands',label:'מותגים וחנויות',icon:'ShoppingBag'},
  {id:'hobbies',label:'תחביבים',icon:'Puzzle'},
  {id:'sport',label:'ספורט',icon:'Dumbbell'},
  {id:'health',label:'בריאות ואלרגיות',icon:'HeartPulse'},
  {id:'calm',label:'מה מרגיע אותה',icon:'Leaf'},
  {id:'upset',label:'מה מעצבן אותה',icon:'CloudLightning'},
  {id:'dreams',label:'חלומות ושאיפות',icon:'Rocket'},
  {id:'work',label:'עבודה ולימודים',icon:'GraduationCap'},
  {id:'said',label:'דברים שהיא אמרה',icon:'Quote'},
  {id:'other',label:'אחר',icon:'Shapes'}
];
// tone: the colour family the chip uses (CSS .tone-love … .tone-never in components.css).
export const SENTIMENTS=[
  {id:'love',label:'אוהבת',emoji:'❤️',tone:'love'},
  {id:'like',label:'מחבבת',emoji:'👍',tone:'like'},
  {id:'neutral',label:'ככה־ככה',emoji:'😐',tone:'neutral'},
  {id:'dislike',label:'לא אוהבת',emoji:'👎',tone:'dislike'},
  {id:'never',label:'בשום אופן',emoji:'🚫',tone:'never'}
];
export const PLACE_KINDS=[
  {id:'restaurant',label:'מסעדה',icon:'Utensils'},
  {id:'cafe',label:'בית קפה',icon:'Coffee'},
  {id:'bar',label:'בר',icon:'Wine'},
  {id:'beach',label:'חוף',icon:'Waves'},
  {id:'nature',label:'טבע',icon:'Trees'},
  {id:'hike',label:'מסלול',icon:'Footprints'},
  {id:'city',label:'עיר',icon:'Building2'},
  {id:'abroad',label:'חו״ל',icon:'Plane'},
  {id:'hotel',label:'מלון וצימר',icon:'BedDouble'},
  {id:'culture',label:'תרבות',icon:'Drama'},
  {id:'shop',label:'חנות',icon:'Store'},
  {id:'other',label:'אחר',icon:'MapPin'}
];
export const PLACE_LOVED_BY=[
  {id:'her',label:'היא אוהבת',short:'שלה',icon:'Heart'},
  {id:'me',label:'אני אוהב',short:'שלי',icon:'ThumbsUp'},
  {id:'us',label:'שנינו',short:'שלנו',icon:'HeartHandshake'},
  {id:'want',label:'רוצים לנסות',short:'לנסות',icon:'Sparkle'}
];
export const DATE_KINDS=[
  {id:'birthday',label:'יום הולדת',icon:'Cake'},
  {id:'anniversary',label:'יום שנה',icon:'Heart'},
  {id:'holiday',label:'חג',icon:'Sparkles'},
  {id:'event',label:'אירוע',icon:'PartyPopper'},
  {id:'other',label:'אחר',icon:'CalendarDays'}
];
export const GIFT_STATUSES=[
  {id:'idea',label:'רעיון',plural:'רעיונות',icon:'Lightbulb'},
  {id:'bought',label:'נקנתה',plural:'נקנו',icon:'ShoppingBag'},
  {id:'given',label:'ניתנה',plural:'ניתנו',icon:'Gift'}
];
export const PLAN_TYPES=[
  {id:'task',label:'משימה',plural:'משימות',icon:'ListChecks'},
  {id:'date',label:'דייט',plural:'דייטים',icon:'Wine'},
  {id:'surprise',label:'הפתעה',plural:'הפתעות',icon:'Gift'},
  {id:'bucket',label:'חלום משותף',plural:'רשימת חלומות',icon:'Rocket'}
];
// The five love languages: the label, one line of what it means to her, and the icon.
export const LOVE_LANGUAGE_TYPES=[
  {id:'words',label:'מילים טובות',line:'מחמאות, הודעה מפתיעה, להגיד בקול מה אתה מעריך בה.',icon:'MessageCircleHeart'},
  {id:'time',label:'זמן איכות',line:'זמן רק שלכם — בלי טלפונים, עם תשומת לב מלאה.',icon:'Hourglass'},
  {id:'gifts',label:'מתנות',line:'לא המחיר — המחשבה: משהו קטן שאומר "חשבתי עלייך".',icon:'Gift'},
  {id:'service',label:'מעשים',line:'לעשות בשבילה: לסדר, לבשל, לחסוך לה טרחה.',icon:'HandHeart'},
  {id:'touch',label:'מגע',line:'חיבוק, יד ביד, להתכרבל על הספה.',icon:'Hand'}
];
export const SIZE_FIELDS=[
  {id:'top',label:'חולצה'},{id:'bottom',label:'מכנסיים'},{id:'dress',label:'שמלה'},
  {id:'shoes',label:'נעליים'},{id:'ring',label:'טבעת'},{id:'bra',label:'חזייה'}
];
// Every list in the data, with its Hebrew name (validation messages, backup previews, search groups).
export const DATA_LISTS=[
  {id:'facts',label:'עובדות עליה'},{id:'people',label:'אנשים'},{id:'places',label:'מקומות'},
  {id:'dates',label:'תאריכים'},{id:'gifts',label:'מתנות'},{id:'plans',label:'תוכניות ורעיונות'},
  {id:'memories',label:'זיכרונות'}
];
export const vocabLabel=(list,id,fallback='')=>list.find(x=>x.id===id)?.label??fallback;
export const vocabItem=(list,id)=>list.find(x=>x.id===id)||list[list.length-1];

// ---------- Ids, dates ----------
// A short random id: time + randomness (crypto when available). Always a string.
export function uid(){
  let r='';
  try{const b=new Uint8Array(6);globalThis.crypto.getRandomValues(b);r=[...b].map(x=>x.toString(36).padStart(2,'0')).join('').slice(0,9);}
  catch{r=Math.random().toString(36).slice(2,11);}
  return Date.now().toString(36)+r;
}
const mdIsoRe=/^(\d{4})-(\d{2})-(\d{2})$/;
// A real calendar date in 'YYYY-MM-DD' (rejects 2026-02-30).
export function isIsoDate(v){
  if(typeof v!=='string')return false;const m=v.match(mdIsoRe);if(!m)return false;
  const y=+m[1],mo=+m[2],d=+m[3];if(mo<1||mo>12||d<1)return false;
  return d<=new Date(Date.UTC(y,mo,0)).getUTCDate();
}
export function localToday(now=new Date()){
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
function mdShift(iso,days){const [y,m,d]=iso.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d+days));return t.toISOString().slice(0,10);}
function mdYears(iso,years){const [y,m,d]=iso.split('-').map(Number);const last=new Date(Date.UTC(y+years,m,0)).getUTCDate();return `${y+years}-${String(m).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;}

// ---------- Empty data ----------
export function emptyData(){
  return {
    version:DATA_VERSION,
    profile:{her:'נועה',me:'',together:null,herBirthday:null,loveLanguages:[],sizes:{},photo:null},
    facts:[],people:[],places:[],dates:[],gifts:[],plans:[],memories:[],
    gestures:{done:{}},asked:{},
    prefs:{notifyHour:9,homeHidden:[],holidays:true,setupDone:false,lastBackup:null}
  };
}

// ---------- Validation ----------
const mdFail=msg=>{const err=new Error(msg);err.noaInvalid=true;throw err;};
const mdObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const mdStr=(v,fb='')=>v==null?fb:typeof v==='string'?v:typeof v==='number'||typeof v==='boolean'?String(v):fb;
const mdNum=(v,lo,hi,fb=null)=>{if(v===''||v==null)return fb;const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):fb;};
const mdEnum=(v,list,fb)=>list.some(x=>x.id===v)?v:fb;
const mdTags=v=>Array.isArray(v)?[...new Set(v.map(t=>mdStr(t).trim()).filter(Boolean))]:[];
const mdStamp=v=>typeof v==='string'&&v&&!Number.isNaN(Date.parse(v))?v:null;
// A date field: null/'' → null; a real ISO date stays; anything else rejects the whole object (a bad date is a
// sign of a broken or foreign file, and silently dropping it would lose information).
function mdDate(v,where){
  if(v==null||v==='')return null;
  if(isIsoDate(v))return v;
  if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&isIsoDate(v.slice(0,10)))return v.slice(0,10);
  return mdFail(`תאריך לא תקין (${where}): ${String(v).slice(0,24)}`);
}
// The fields every list item has; then each list's own normalisation.
function mdItem(raw,listLabel,i,seen,nowIso){
  const where=`${listLabel}, פריט ${i+1}`;
  if(!mdObj(raw))mdFail(`הרשימה "${listLabel}" פגומה: פריט ${i+1} אינו פריט תקין.`);
  const id=typeof raw.id==='number'?String(raw.id):raw.id;
  if(typeof id!=='string'||!id.trim())mdFail(`הרשימה "${listLabel}" פגומה: לפריט ${i+1} אין מזהה.`);
  if(seen.has(id))mdFail(`הרשימה "${listLabel}" פגומה: המזהה "${id.slice(0,20)}" מופיע פעמיים.`);
  seen.add(id);
  const out={...raw,id,created:mdStamp(raw.created)||nowIso,updated:mdStamp(raw.updated)||mdStamp(raw.created)||nowIso,notes:mdStr(raw.notes)};
  out.starred=raw.starred===true;
  out.tags=mdTags(raw.tags);
  return {out,where};
}
const MD_LIST_RULES={
  facts(x,where){x.category=mdEnum(x.category,FACT_CATEGORIES,'other');x.title=mdStr(x.title);x.details=mdStr(x.details);x.sentiment=mdEnum(x.sentiment,SENTIMENTS,'neutral');},
  people(x,where){x.name=mdStr(x.name);x.relation=mdStr(x.relation);x.birthday=mdDate(x.birthday,where);x.phone=x.phone==null||x.phone===''?null:mdStr(x.phone);},
  places(x,where){
    x.name=mdStr(x.name);x.kind=mdEnum(x.kind,PLACE_KINDS,'other');x.lovedBy=mdEnum(x.lovedBy,PLACE_LOVED_BY,'us');
    x.area=mdStr(x.area);x.address=mdStr(x.address);x.link=mdStr(x.link);
    x.rating=Math.round(mdNum(x.rating,0,5,0));x.priceLevel=Math.round(mdNum(x.priceLevel,0,3,0));
    x.visits=Array.isArray(x.visits)?[...new Set(x.visits.map(v=>mdDate(v,where)).filter(Boolean))].sort():[];
  },
  dates(x,where){
    x.title=mdStr(x.title);x.kind=mdEnum(x.kind,DATE_KINDS,'other');
    x.date=mdDate(x.date,where);if(!x.date)mdFail(`חסר תאריך (${where}).`);
    x.recurring=x.recurring==='yearly'?'yearly':'none';
    x.remindDays=Array.isArray(x.remindDays)?[...new Set(x.remindDays.map(n=>Math.round(Number(n))).filter(n=>Number.isFinite(n)&&n>=0&&n<=365))].sort((a,b)=>b-a):[];
    x.personId=x.personId==null||x.personId===''?null:mdStr(x.personId);
  },
  gifts(x,where){
    x.title=mdStr(x.title);x.status=mdEnum(x.status,GIFT_STATUSES,'idea');x.occasion=mdStr(x.occasion);
    x.price=mdNum(x.price,0,1e7,null);x.link=mdStr(x.link);x.whereToBuy=mdStr(x.whereToBuy);
    x.heardOn=mdDate(x.heardOn,where);x.givenOn=mdDate(x.givenOn,where);
    x.reaction=x.reaction==null||x.reaction===''?null:Math.round(mdNum(x.reaction,0,5,0));
  },
  plans(x,where){
    x.title=mdStr(x.title);x.type=mdEnum(x.type,PLAN_TYPES,'task');x.due=mdDate(x.due,where);
    x.done=x.done===true;x.doneOn=mdDate(x.doneOn,where);x.placeId=x.placeId==null||x.placeId===''?null:mdStr(x.placeId);
    x.budget=mdNum(x.budget,0,1e7,null);
  },
  memories(x,where){
    x.date=mdDate(x.date,where);if(!x.date)mdFail(`חסר תאריך (${where}).`);
    x.title=mdStr(x.title);x.text=mdStr(x.text);x.placeId=x.placeId==null||x.placeId===''?null:mdStr(x.placeId);
    x.photos=Array.isArray(x.photos)?[...new Set(x.photos.filter(p=>typeof p==='string'&&p))]:[];
    x.mood=x.mood==null||x.mood===''?null:mdStr(x.mood).slice(0,16);
  }
};
// A date map ({id: 'YYYY-MM-DD'}): bad entries are dropped (they only mark "done"/"asked").
function mdDateMap(v){const out={};if(mdObj(v))for(const [k,d] of Object.entries(v))if(isIsoDate(typeof d==='string'?d.slice(0,10):''))out[k]=d.slice(0,10);return out;}

// Returns a normalised deep copy, or throws Error (err.noaInvalid) with a Hebrew message. Accepts older versions
// (it migrates first) and rejects files from a newer version.
export function validateData(input,nowIso=new Date().toISOString()){
  if(!mdObj(input))mdFail('הקובץ לא נראה כמו נתונים של נועה.');
  let d;try{d=structuredClone(input);}catch{mdFail('הנתונים פגומים ואי אפשר לקרוא אותם.');}
  d=migrate(d);
  if(d.version>DATA_VERSION)mdFail('הנתונים נוצרו בגרסה חדשה יותר של האפליקציה. עדכן את האפליקציה ונסה שוב.');
  const base=emptyData();
  if(d.profile!=null&&!mdObj(d.profile))mdFail('פרטי הפרופיל פגומים.');
  const p={...base.profile,...(d.profile||{})};
  p.her=mdStr(p.her,'נועה').trim().slice(0,40);
  p.me=mdStr(p.me).trim().slice(0,40);
  p.together=mdDate(p.together,'תאריך ההיכרות');
  p.herBirthday=mdDate(p.herBirthday,'יום ההולדת שלה');
  p.loveLanguages=Array.isArray(p.loveLanguages)?[...new Set(p.loveLanguages.filter(x=>LOVE_LANGUAGE_TYPES.some(l=>l.id===x)))]:[];
  const sizes=mdObj(p.sizes)?{...p.sizes}:{};
  for(const k of Object.keys(sizes))sizes[k]=mdStr(sizes[k]).slice(0,80);
  p.sizes=sizes;
  p.photo=typeof p.photo==='string'&&p.photo?p.photo:null;
  d.profile=p;
  for(const {id,label} of DATA_LISTS){
    if(d[id]==null){d[id]=[];continue;}
    if(!Array.isArray(d[id]))mdFail(`הרשימה "${label}" פגומה.`);
    const seen=new Set();
    d[id]=d[id].map((raw,i)=>{const {out,where}=mdItem(raw,label,i,seen,nowIso);MD_LIST_RULES[id](out,where);return out;});
  }
  d.gestures=mdObj(d.gestures)?{...d.gestures,done:mdDateMap(d.gestures.done)}:{done:{}};
  d.asked=mdDateMap(d.asked);
  const pr={...base.prefs,...(mdObj(d.prefs)?d.prefs:{})};
  pr.notifyHour=Math.round(mdNum(pr.notifyHour,0,23,9));
  pr.homeHidden=Array.isArray(pr.homeHidden)?pr.homeHidden.filter(x=>typeof x==='string'):[];
  pr.holidays=pr.holidays!==false;pr.setupDone=pr.setupDone===true;
  pr.lastBackup=mdStamp(pr.lastBackup);
  d.prefs=pr;
  if('demo' in d)d.demo=d.demo===true;
  d.version=DATA_VERSION;
  return d;
}

// Upgrades older shapes to the current version. Version 0 (no version field: an early draft) had `her` and
// `together` at the top level and `ideas` instead of `plans`; anything it does not know it leaves alone.
export function migrate(input){
  if(!mdObj(input))return input;
  const d={...input};
  const v=d.version==null?0:Number(d.version);
  if(!Number.isFinite(v)||v<0)mdFail('גרסת הנתונים לא תקינה.');
  if(v<1){
    const profile=mdObj(d.profile)?{...d.profile}:{};
    for(const k of ['her','me','together','herBirthday'])if(k in d&&!(k in profile)){profile[k]=d[k];delete d[k];}
    d.profile=profile;
    if(Array.isArray(d.ideas)&&!Array.isArray(d.plans)){d.plans=d.ideas.map(x=>mdObj(x)?{type:'task',...x}:x);delete d.ideas;}
    d.version=1;
  }
  else d.version=v;
  return d;
}

// ---------- Counts ----------
export function counts(d){
  const n=k=>Array.isArray(d?.[k])?d[k].length:0;
  const gifts=Array.isArray(d?.gifts)?d.gifts:[],plans=Array.isArray(d?.plans)?d.plans:[],mem=Array.isArray(d?.memories)?d.memories:[];
  return {facts:n('facts'),people:n('people'),places:n('places'),dates:n('dates'),gifts:gifts.length,
    giftIdeas:gifts.filter(g=>g.status==='idea').length,plans:plans.length,openPlans:plans.filter(p=>!p.done).length,
    memories:mem.length,photos:mem.reduce((s,m)=>s+(Array.isArray(m.photos)?m.photos.length:0),0),
    starred:['facts','people','places','gifts','plans','memories'].reduce((s,k)=>s+(Array.isArray(d?.[k])?d[k].filter(x=>x?.starred).length:0),0)};
}
// True when there is nothing of his own yet (setup screens and the "start here" home use it).
export function isEmptyData(d){const c=counts(d);return !c.facts&&!c.people&&!c.places&&!c.dates&&!c.gifts&&!c.plans&&!c.memories;}

// ---------- Demo data ----------
// Clearly fake (demo:true, a banner says so, one tap clears it) but believable, and relative to `today` so the
// countdowns, the "on this day" card and the gift reminder always have something to show.
export function demoData(today=localToday()){
  const d=emptyData();d.demo=true;
  const stamp=days=>mdShift(today,-days)+'T10:00:00.000Z';
  const together=mdShift(today,-642);
  const nextBirthday=mdShift(today,12);
  d.profile={her:'נועה',me:'איתי',together,herBirthday:mdYears(nextBirthday,-23),
    loveLanguages:['time','words','touch','gifts','service'],
    sizes:{top:'S',bottom:'36 (מותן 27)',dress:'36',shoes:'38',ring:'52',bra:'',notes:'אוהבת גזרות רחבות בחולצות, צמודות במכנסיים. לא לובשת צהוב.'},photo:null};
  let n=0;
  const item=(o,ageDays=30)=>({id:`demo-${++n}`,created:stamp(ageDays),updated:stamp(Math.max(0,ageDays-3)),starred:false,tags:[],notes:'',...o});
  const F=(category,title,sentiment,details='',more={})=>item({category,title,details,sentiment,...more},60-(n%50));
  d.facts=[
    F('food','סושי — במיוחד ניגירי סלמון','love','הכי שמחה כשמזמינים מגש גדול לחלוק.',{starred:true}),
    F('food','כוסברה','never','"טעם של סבון". לבקש בלי, בכל מקום.',{starred:true}),
    F('food','פסטה קצ׳ו א פפה','love','מזמינה תמיד כשיש בתפריט.'),
    F('food','שקשוקה של שבת בבוקר','like','עם הרבה לחם וטחינה.'),
    F('food','חריף','dislike','קצת חריף זה בסדר, אבל לא "חריף אמיתי".'),
    F('drinks','הפוך על שיבולת שועל, בלי סוכר','love','גדול. בבוקר — לפני שמדברים איתה 😅',{starred:true}),
    F('drinks','יין לבן קר','like','לא אוהבת יין אדום, מעדיפה משהו קליל.'),
    F('drinks','תה קמומיל לפני השינה','love'),
    F('sweets','כל דבר עם פיסטוק','love','גלידת פיסטוק, קרואסון פיסטוק, בקלאווה.',{starred:true}),
    F('sweets','שוקולד מריר 70%','like'),
    F('sweets','מרשמלו','dislike'),
    F('music','טיילור סוויפט — כל האלבומים','love','שרה בקולי קולות באוטו.'),
    F('music','שירים של עידן רייכל לנסיעות ארוכות','like'),
    F('music','טכנו','dislike'),
    F('shows','חברים — יכולה לראות שוב ושוב','love'),
    F('shows','סרטי אימה','never','לא משנה כמה "הוא לא באמת מפחיד".'),
    F('shows','סדרות קוריאניות','like','כרגע באמצע אחת, לא לעשות לה ספוילרים.'),
    F('books','ספרים של סאלי רוני','love'),
    F('style','צבעי אדמה וירוק מרווה','love','סוודרים גדולים, ג׳ינס רחב.'),
    F('style','צהוב','never'),
    F('beauty','בושם עם וניל','dislike','"ריח של סבתא שלי". עדיף משהו פרחוני ורענן.'),
    F('flowers','אדמוניות','love','הפרח האהוב עליה. בעונה: אפריל–יוני.',{starred:true}),
    F('flowers','ורדים אדומים','dislike','"קלישאה". עדיף זר פרחי בר.'),
    F('colors','ירוק מרווה ולבן שמנת','love'),
    F('brands','חנויות וינטג׳ ושוק הפשפשים','love','מעדיפה מציאות על פני קניונים.'),
    F('hobbies','צילום במצלמת פילם','love','מפתחת במעבדה ביפו.'),
    F('hobbies','קרמיקה','like','עשתה סדנה אחת ומאז מדברת על זה.'),
    F('sport','פילאטיס פעמיים בשבוע','like','ראשון ורביעי בערב — לא לקבוע אז.'),
    F('health','אלרגית לאגוזי לוז','never','כולל נוטלה! לבדוק רכיבים בעוגות.',{starred:true}),
    F('health','רגישה ללקטוז','dislike','חלב שקדים או שיבולת שועל.'),
    F('calm','מקלחת חמה, שמיכה ופרק של חברים','love'),
    F('calm','כשאני פשוט מקשיב בלי לתת פתרונות','love','',{starred:true}),
    F('upset','כשמאחרים בלי להודיע','never','הודעה קצרה מספיקה.'),
    F('upset','רעש בבוקר לפני הקפה','dislike'),
    F('dreams','לטייל ביפן בעונת הדובדבן','love'),
    F('dreams','סטודיו קטן לקרמיקה משלה','love'),
    F('work','סטודנטית לעיצוב, שנה ג׳','neutral','הגשת פרויקט גדולה בסוף הסמסטר — לפנות לה זמן.'),
    F('said','"אני אוהבת כשאתה מתכנן לי הפתעות קטנות"','love'),
    F('said','רוצה לנסות שיעור סלסה ביחד','like')
  ];
  const P=(id,name,relation,birthday,notes,more={})=>({...item({name,relation,birthday,phone:null,notes,...more},120),id});
  const momBirthday=mdYears(mdShift(today,20),-54);
  d.people=[
    P('demo-person-mom','מיכל','אמא',momBirthday,'אוהבת סחלבים. מבשלת את המג׳דרה הכי טובה בעולם.'),
    P('demo-person-dad','אבי','אבא','1969-03-11','אוהד מכבי חיפה. אוהב שמביאים לו בירה בלגית.'),
    P('demo-person-sister','שירה','אחות','1999-12-02','אחותה הגדולה, מורה לאנגלית. השותפה לכל הפתעה.',{starred:true}),
    P('demo-person-yael','יעל','חברה טובה','2003-08-19','החברה הכי טובה מהצבא. מתחתנת בקרוב עם תומר.'),
    P('demo-person-grandma','סבתא רחל','סבתא','1946-05-07','מכינה לנועה עוגת שמרים בכל ביקור.'),
    P('demo-person-dog','ליבי','הכלבה','2021-04-01','פודל קטנה ומפונקת. מתה על חטיפי עוף.')
  ];
  const L=(id,name,kind,lovedBy,area,rating,priceLevel,visits,notes,more={})=>({...item({name,kind,lovedBy,area,address:'',link:'',rating,priceLevel,visits,notes,...more},200),id});
  d.places=[
    L('demo-place-sushi','הסושי בר הקטן בפלורנטין','restaurant','her','תל אביב',5,2,[mdShift(today,-75),mdShift(today,-21)],'לבקש את הפינה ליד החלון. בלי כוסברה ברוטב!',{starred:true}),
    L('demo-place-cafe','בית הקפה בנווה צדק','cafe','us','תל אביב',4,1,[mdShift(today,-662),mdShift(today,-9)],'פה היה הדייט הראשון שלנו.',{starred:true}),
    L('demo-place-yarkon','פארק הירקון','nature','us','תל אביב',5,0,[mdShift(today,-40)],'פיקניק בשקיעה, ליד האגם.'),
    L('demo-place-gordon','חוף גורדון','beach','her','תל אביב',4,0,[mdShift(today,-365)],'השקיעה הכי יפה. להביא שמיכה.'),
    L('demo-place-ramon','מכתש רמון','nature','us','מצפה רמון',5,1,[mdShift(today,-200)],'לילה של כוכבים. לבוא בירח חדש.'),
    L('demo-place-jaffa','נמל יפו','city','us','יפו',4,1,[mdShift(today,-130)],'גלידה בטיילת ואז מעבדת הפילם.'),
    L('demo-place-carmel','שוק הכרמל','city','me','תל אביב',4,1,[],'סיור אוכל ביום שישי בבוקר.'),
    L('demo-place-ceramic','סטודיו לקרמיקה בגבעתיים','culture','her','גבעתיים',5,2,[mdShift(today,-90)],'הסדנה הזוגית — היא רוצה עוד אחת.'),
    L('demo-place-burger','הבורגר של רוטשילד','restaurant','me','תל אביב',4,2,[mdShift(today,-14)],''),
    L('demo-place-zfat','צימר בגליל העליון','hotel','want','ראש פינה',0,3,[],'ג׳קוזי עם נוף. שירה המליצה.'),
    L('demo-place-rome','רומא','abroad','want','איטליה',0,3,[],'היא חולמת על קצ׳ו א פפה ברומא עצמה.'),
    L('demo-place-museum','מוזיאון תל אביב לאמנות','culture','her','תל אביב',4,1,[mdShift(today,-300)],'התערוכות המתחלפות + קפה בגינה.')
  ];
  const D=(title,kind,date,recurring,remindDays,more={})=>item({title,kind,date,recurring,remindDays,personId:null,...more},150);
  d.dates=[
    D('הדייט הראשון','anniversary',mdShift(together,-20),'yearly',[7,1],{notes:'קפה בנווה צדק, ודיברנו ארבע שעות.'}),
    D('ההופעה בפארק הירקון','event',mdShift(today,25),'none',[3],{notes:'הכרטיסים במייל. להגיע מוקדם בשביל מקום טוב.'}),
    D('החתונה של יעל ותומר','event',mdShift(today,40),'none',[14,3],{personId:'demo-person-yael',notes:'קוד לבוש: לבן־בז׳. לקנות מתנה משותפת.'}),
    D('סיום הסמסטר שלה','event',mdShift(today,70),'none',[7]),
    D('הטיסה לרומא','event',mdShift(today,95),'none',[30,7],{notes:'לבדוק דרכונים!'}),
    D('יום השנה לסבא יוסף','other','1950-02-14','yearly',[3],{notes:'יום קשה לה. להיות שם, בלי הרבה מילים.'})
  ];
  const G=(title,status,occasion,price,more={})=>item({title,status,occasion,price,link:'',whereToBuy:'',heardOn:null,givenOn:null,reaction:null,...more},80);
  d.gifts=[
    G('שרשרת עדינה עם תליון ירח','idea','יום הולדת',380,{heardOn:mdShift(today,-50),whereToBuy:'חנות התכשיטים בדיזנגוף',starred:true,notes:'ראתה בחלון ראווה ואמרה "וואו".'}),
    G('זר אדמוניות ופתק בכתב יד','idea','יום הולדת',180,{whereToBuy:'משתלה בכרם'}),
    G('סדנת קרמיקה זוגית שנייה','idea','סתם כי בא לי',450,{whereToBuy:'הסטודיו בגבעתיים'}),
    G('מצלמת פילם משומשת','idea','',650,{heardOn:mdShift(today,-120),notes:'דגם קומפקטי, היא אמרה שהמצלמה שלה נתקעת.'}),
    G('ספר צילום של ויויאן מאייר','bought','יום הולדת',220),
    G('צמיד כסף עם חריטה','given','שנה ביחד',420,{givenOn:mdShift(together,365),reaction:5,notes:'בכתה. לובשת כל יום.',starred:true}),
    G('סוודר צמר ירוק מרווה','given','חנוכה',260,{givenOn:mdShift(today,-310),reaction:4}),
    G('בושם וניל','given','יום הולדת',340,{givenOn:mdShift(nextBirthday,-365),reaction:2,notes:'"ריח של סבתא שלי" 🙈 — לא לחזור על זה.'})
  ];
  const T=(title,type,due,more={})=>item({title,type,due,done:false,doneOn:null,placeId:null,budget:null,...more},25);
  d.plans=[
    T('להזמין מקום בסושי בר ליום ההולדת','task',mdShift(today,3),{placeId:'demo-place-sushi',starred:true}),
    T('לקנות כרטיסים להופעה','task',mdShift(today,6)),
    T('לתאם עם שירה את ההפתעה','task',mdShift(today,8)),
    T('לאסוף את השמלה מהתופרת','task',mdShift(today,-3),{done:true,doneOn:mdShift(today,-2)}),
    T('פיקניק בשקיעה בפארק הירקון','date',mdShift(today,10),{placeId:'demo-place-yarkon',budget:120}),
    T('ערב סושי ביתי','date',null,{budget:200,notes:'לקנות סלמון טרי ואורז סושי. בלי כוסברה.'}),
    T('ארוחת בוקר במיטה ביום ההולדת','surprise',nextBirthday,{notes:'הפוך על שיבולת שועל + קרואסון פיסטוק.'}),
    T('פתקים קטנים בתוך הספרים שלה','surprise',null),
    T('זריחה במצדה','bucket',null),
    T('טיול ליפן בעונת הדובדבן','bucket',null,{starred:true}),
    T('לישון באוהל במכתש רמון','bucket',null,{done:true,doneOn:mdShift(today,-200),placeId:'demo-place-ramon'})
  ];
  const M=(date,title,text,mood,more={})=>item({date,title,text,placeId:null,photos:[],mood,...more},10);
  d.memories=[
    M(mdShift(together,-20),'הדייט הראשון','קפה בנווה צדק. תכננו חצי שעה ונשארנו עד שסגרו את המקום.','🥰',{placeId:'demo-place-cafe',starred:true}),
    M(together,'היום שהפכנו לזוג','הליכה ארוכה על הטיילת, והיא אמרה "אז מה אנחנו?".','💛'),
    M(mdYears(today,-1),'פיקניק על החוף בגורדון','שקיעה, ענבים קרים ושמיכה שהעפנו בטעות לים.','🌅',{placeId:'demo-place-gordon'}),
    M(mdShift(today,-200),'לילה במכתש רמון','ספרנו כוכבים נופלים. היא ראתה שבעה, אני שלושה.','✨',{placeId:'demo-place-ramon'}),
    M(mdShift(today,-90),'הסדנה בקרמיקה','יצאה לה קערה מושלמת, לי משהו שאולי היה ספל.','😂',{placeId:'demo-place-ceramic'}),
    M(mdShift(nextBirthday,-365),'יום ההולדת שלה בשנה שעברה','הפתעה עם שירה ויעל בבית. היא חשבה שכולם שכחו.','🎂'),
    M(mdShift(today,-30),'ארוחת שישי אצל ההורים שלה','אבא שלה הסכים סוף סוף לדבר איתי על כדורגל.','😅')
  ];
  d.gestures={done:{}};d.asked={};
  d.prefs={notifyHour:9,homeHidden:[],holidays:true,setupDone:true,lastBackup:null};
  return d;
}
