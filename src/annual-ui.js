// Annual check 4.1 UI: the insights card, the yearly bell reminder and palette entries (WS-MODULES).
import {onModuleHook} from './hooks.js';
import {today,dateLabel} from './finance.js';
import {annualStatus,annualAlert} from './annual.js';
const AN_SCAM='זהירות מאתרים מתחזים ומחברות ״החזרים״: השירותים הרשמיים חינמיים, וכתובתם מסתיימת ב־gov.il — חוץ מ־creditdata.org.il של בנק ישראל ו־swiftness.co.il של המסלקה הפנסיונית. גוף רשמי לא יתקשר כדי ללחוץ עליך ש״היום זה היום האחרון״.';
const AN_COLORS={done:'green',due:'gold',skip:'neutral'};
function anRow(item){
  const status=item.state==='skip'?badge('לא רלוונטי','neutral'):item.state==='done'?badge(`נבדק ב־${dateLabel(item.done)}`,'green'):badge('לא נבדק השנה','gold');
  const link=`<a class="text-button an-link" href="${e(item.url)}" target="_blank" rel="noopener noreferrer">לאתר הרשמי<bdi dir="ltr" class="an-domain">${e(item.domain)}</bdi></a>`;
  const actions=item.state==='skip'?textBtn('בכל זאת רלוונטי','annual-skip:'+item.id)
    :`${link}${item.state==='done'?textBtn('ביטול הסימון','annual-undo:'+item.id):btn('בדקתי','annual-done:'+item.id,'Check','small')}${textBtn('לא רלוונטי לי','annual-skip:'+item.id)}`;
  return `<div class="an-row an-${item.state}" data-annual="${e(item.id)}"><span class="asset-icon ${AN_COLORS[item.state]}">${icon(item.icon,18)}</span>`
    +`<div class="an-text"><b>${e(item.title)}</b><small>${e(item.why)}</small><small class="an-cost">${e(item.cost)}</small></div>`
    +`<div class="an-status">${status}</div><div class="an-actions">${actions}</div></div>`;
}
function anCard(){
  if(typeof data==='undefined'||!data)return '';
  const {items,due}=annualStatus(data,today());
  return card(head('הבדיקה השנתית שלך','שש בדיקות קצרות שכדאי לעשות פעם בשנה. רובן חינמיות, וכל אחת לוקחת כמה דקות.',due?badge(`${due} לבדיקה`,'gold'):badge('הכול נבדק השנה','green'))
    +notice(AN_SCAM,'warning')+`<div class="an-list">${items.map(anRow).join('')}</div>`,'an-card');
}
onModuleHook('insights',()=>anCard());
onModuleHook('alerts',now=>{if(typeof data==='undefined'||!data)return [];const a=annualAlert(data,now);return a?[a]:[];});
onModuleHook('palette',()=>[{icon:'ClipboardCheck',title:'הבדיקה השנתית',sub:'דוח אשראי, הר הביטוח, הר הכסף ועוד',run:()=>{closeDialog();navigate('insights');setTimeout(()=>document.querySelector('.an-card')?.scrollIntoView({block:'start'}),60);}}]);
// annual-done / annual-skip / annual-undo: one small change to data.annualChecks each.
function anUpdate(id,change,message){
  mutate(next=>{
    const all=next.annualChecks&&typeof next.annualChecks==='object'&&!Array.isArray(next.annualChecks)?{...next.annualChecks}:{};
    const rec={...(all[id]&&typeof all[id]==='object'?all[id]:{})};change(rec);
    for(const k of Object.keys(rec))if(rec[k]==null||rec[k]===false)delete rec[k];
    if(Object.keys(rec).length)all[id]=rec;else delete all[id];
    next.annualChecks=all;
  },message);
  // Keep the place: the card re-renders, so bring the same row back into focus.
  document.querySelector(`.an-row[data-annual="${id}"] [data-action]`)?.focus({preventScroll:true});
}
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-action]');if(!button)return;
  const [action,id]=button.dataset.action.split(':');
  if(!['annual-done','annual-skip','annual-undo'].includes(action))return;
  const item=annualStatus(data,today()).items.find(i=>i.id===id);if(!item)return;
  try{
    if(action==='annual-done')anUpdate(id,r=>{r.done=today();r.skip=false;},`${item.title}: נבדק היום`);
    else if(action==='annual-undo')anUpdate(id,r=>{r.done=null;},'הסימון בוטל');
    else anUpdate(id,r=>{r.skip=!item.skip;},item.skip?'הבדיקה חזרה לרשימה':'סומן כלא רלוונטי');
  }catch(err){toast(err.message,true);}
});
