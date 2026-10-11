import {money,monthOffset,monthLabel,today} from './finance.js';
import {palette,graph} from './charts.js';
import {compareScenario,EVENT_TYPES} from './scenario.js';
import {aiReady} from './ai.js';

// "What if" tab of the future lab. Built on the UI helpers and state from app.js.

const SCENARIO_KEY='ofek-scenario-v1';
const SCENARIO_PRESETS={
  car:['Car','רכישת רכב',{type:'purchase',name:'רכישת רכב',amount:90000,month:3,funding:'loan',loanRate:6.5,loanYears:5,monthlyCost:900}],
  grant:['PiggyBank','מענק שחרור',{type:'grant',name:'מענק שחרור',amount:15000,month:1,target:'free'}],
  deposit:['Target','הגדלת ההפקדה',{type:'deposit',name:'הגדלת ההפקדה החודשית',amount:500,month:1,goal:'all'}],
  income:['TrendingUp','העלאה במשכורת',{type:'income',name:'העלאה במשכורת',amount:1500,month:2}],
  expense:['Receipt','הוצאה חודשית',{type:'expense',name:'שכר דירה חדש',amount:3500,month:2,duration:0}],
  bonus:['Sparkles','בונוס / ירושה',{type:'grant',name:'בונוס שנתי',amount:10000,month:4,target:'invest'}]
};
function scenarioState(){
  if(!ui.scenario){let saved=null;try{saved=JSON.parse(localStorage.getItem(SCENARIO_KEY)||'null');}catch{}ui.scenario=saved&&Array.isArray(saved.events)?{horizon:36,ret:5,...saved}:{events:[],horizon:36,ret:5};}
  return ui.scenario;
}
function saveScenario(){try{localStorage.setItem(SCENARIO_KEY,JSON.stringify(ui.scenario));}catch{}}
const monthChoices=horizon=>Array.from({length:horizon},(_,i)=>[i+1,monthLabel(monthOffset(today().slice(0,7),i+1))]);
const goalChoices=prefix=>data.goals.map(g=>[`${prefix}${g.id}`,g.name]);
function eventEditor(ev,i,horizon){
  const f=(label,html,cls='')=>field(label,html,'',cls),num=(key,extra='')=>`<input type="number" step="any" data-scn="${i}.${key}" value="${e(ev[key]??'')}" ${extra}>`,sel=(key,list)=>`<select data-scn="${i}.${key}">${options(list,ev[key])}</select>`;
  const amountLabel={deposit:'שינוי בהפקדה (₪ לחודש)',purchase:'מחיר (₪)',grant:'סכום (₪)',income:'שינוי בהכנסה (₪ לחודש)',expense:'סכום (₪ לחודש)'}[ev.type];
  let extra='';
  if(ev.type==='deposit')extra=f('לאיזה יעד',sel('goal',[['all','כל היעדים, לפי היחס'],...goalChoices('')]));
  if(ev.type==='purchase')extra=f('מימון',sel('funding',[['free','מהכסף הפנוי'],['loan','בהלוואה'],...goalChoices('goal:').map(([v,n])=>[v,`מתוך ״${n}״`])]))+(ev.funding==='loan'?f('ריבית ההלוואה (%)',num('loanRate','min="0"'))+f('תקופה (שנים)',num('loanYears','min="1" max="30"')):'')+f('עלות חודשית נוספת (₪)',num('monthlyCost','min="0"'));
  if(ev.type==='grant')extra=f('לאן הכסף הולך',sel('target',[['free','לכסף הפנוי'],['invest','להשקעה'],...goalChoices('goal:').map(([v,n])=>[v,`ליעד ״${n}״`])]));
  if(ev.type==='expense')extra=f('לכמה זמן',sel('duration',[[0,'ללא הגבלה'],[3,'3 חודשים'],[6,'6 חודשים'],[12,'שנה'],[24,'שנתיים'],[36,'3 שנים']]));
  return `<div class="scn-event"><div class="row-between"><input class="scn-name" type="text" data-scn="${i}.name" value="${e(ev.name||EVENT_TYPES[ev.type])}" aria-label="שם האירוע"><span class="scn-type">${e(EVENT_TYPES[ev.type])}</span>${ib('Trash2','הסרת האירוע','scn-remove:'+i)}</div><div class="scn-fields">${f(amountLabel,num('amount'))}${f(['purchase','grant'].includes(ev.type)?'מתי':'החל מ־',sel('month',monthChoices(horizon)))}${extra}</div></div>`;
}
function scenarioResults(){
  const s=scenarioState(),r=compareScenario(data,s.events,{horizon:s.horizon,annualReturn:s.ret}),years=s.horizon/12;
  const end=`בעוד ${years%1?s.horizon+' חודשים':years===1?'שנה':years+' שנים'}`,delta=(n,good=true)=>`<span class="${(n>=0)===good?'positive':'negative'}" dir="ltr">${n>=0?'+':'−'}${money(Math.abs(n))}</span> לעומת התוכנית הנוכחית`;
  const low=r.scenario.lowest,neg=r.scenario.negative,label=m=>monthLabel(monthOffset(r.scenario.nowMonth,m));
  const chart=r.scenario.points.map((p,i)=>({label:p.label,date:today(),scn:p.free,base:r.baseline.points[i].free}));
  const goalRow=g=>{const when=(m,missed)=>m==null?(missed?`לא מושג עד ${monthLabel(g.end)}`:`לא עד ${label(s.horizon)}`):m===0?'כבר הושג':label(m);const d=g.delta;return `<tr><td><b>${e(g.name)}</b>${g.target?`<small class="muted">${money(g.target)}</small>`:''}</td><td>${g.target?when(g.baseline,g.missedDeadline):'—'}</td><td><b>${g.target?when(g.scenario,g.scenarioMissed):'—'}</b></td><td>${!g.target?`<small class="muted">${money(g.savedAtEnd.scenario)} ${end}</small>`:d==null?(g.baseline==null&&g.scenario!=null?'<span class="positive">עכשיו יושג</span>':g.baseline!=null&&g.scenario==null?'<span class="negative">כבר לא יושג</span>':'—'):d===0?'<span class="muted">ללא שינוי</span>':`<span class="${d<0?'positive':'negative'}">${Math.abs(d)} חודשים ${d<0?'מוקדם יותר':'מאוחר יותר'}</span>`}</td></tr>`;};
  return `${s.events.length?'':notice('הוסף אירוע מימין — למשל רכישת רכב או מענק שחרור — וראה מיד איך הוא משנה את הכסף הפנוי ואת מועדי היעדים.')}
  <div class="three-metrics">${metric(`כסף פנוי ${end}`,money(r.scenario.final.free),s.events.length?delta(r.freeDelta):'לפי התוכנית הנוכחית','Wallet','green')}${metric(`שווי נקי ${end}`,money(r.scenario.final.netWorth),s.events.length?delta(r.netWorthDelta):`כולל צמיחת השקעות של ${s.ret}% בשנה`,'TrendingUp')}${metric('הנקודה הנמוכה',money(low.free),neg?`<span class="negative">חסר כסף פנוי ב${label(neg)}</span>`:low.month?`ב${label(low.month)}`:'היום','TrendingDown',neg?'red':'purple')}</div>
  ${card(head('הכסף הפנוי לאורך הזמן','קו מלא: עם האירועים · קו מקווקו: התוכנית הנוכחית')+graph(chart,[{key:'scn',name:'עם האירועים',color:neg?'#e29a9f':palette[0]},{key:'base',name:'התוכנית הנוכחית',color:palette[1]}],{height:250})+`<div class="chart-footer"><span>עודף חודשי ממוצע: ${money(r.baseline.surplus)}</span><span>כסף פנוי = כסף שלא הוקצה ליעדים</span></div>`)}
  ${data.goals.length?card(head('מתי תגיע ליעדים',`השוואה בין התוכנית הנוכחית לתרחיש`)+`<div class="table-wrap"><table><thead><tr><th>יעד</th><th>בתוכנית הנוכחית</th><th>בתרחיש</th><th>שינוי</th></tr></thead><tbody>${r.goals.map(goalRow).join('')}</tbody></table></div>`):''}`;
}
function scenarioView(){
  const s=scenarioState();
  return `<div class="scn-layout"><div class="scn-side">${card(head('האירועים בתרחיש','שנה ערכים — התוצאה מתעדכנת מיד.',s.events.length?btn('ניקוי','scn-clear','RotateCcw'):'')+`<div class="scn-presets">${Object.entries(SCENARIO_PRESETS).map(([key,[ic,label]])=>`<button type="button" class="ai-chip" data-action="scn-add:${key}">${icon(ic,15)}<span>${label}</span></button>`).join('')}</div><div class="scn-events">${s.events.map((ev,i)=>eventEditor(ev,i,s.horizon)).join('')}</div><div class="form-grid scn-settings">${field('טווח',`<select data-scn-setting="horizon">${options([[12,'שנה'],[24,'שנתיים'],[36,'3 שנים'],[60,'5 שנים'],[120,'10 שנים']],s.horizon)}</select>`)}${field('תשואה שנתית להשקעות (%)',`<input type="number" step="any" min="-10" max="20" data-scn-setting="ret" value="${e(s.ret)}">`)}</div>${aiReady()&&s.events.length?btn('ניתוח התרחיש עם Claude','scn-ai','Sparkles','primary'):''}`,'scn-card')}</div><div id="scenario-results" class="scn-results">${scenarioResults()}</div></div>${notice('התחזית מבוססת על העודף החודשי הממוצע שלך בשלושת החודשים האחרונים, על ההפקדות המתוכננות ליעדים ועל החובות הקיימים. זו הערכה פשוטה, לא ייעוץ פיננסי.')}`;
}
let scenarioFrame=0;
function refreshScenario(){
  if(scenarioFrame)cancelAnimationFrame(scenarioFrame);
  scenarioFrame=requestAnimationFrame(()=>{scenarioFrame=0;const box=document.querySelector('#scenario-results');if(box)box.innerHTML=scenarioResults();});
}
function describeScenario(){
  const s=scenarioState(),r=compareScenario(data,s.events,{horizon:s.horizon,annualReturn:s.ret});
  const lines=s.events.map(ev=>`- ${ev.name||EVENT_TYPES[ev.type]} (${EVENT_TYPES[ev.type]}): ${money(Number(ev.amount)||0)}, ${monthLabel(monthOffset(today().slice(0,7),Number(ev.month)||1))}${ev.funding==='loan'?`, בהלוואה ${ev.loanRate}% ל־${ev.loanYears} שנים`:''}${Number(ev.monthlyCost)>0?`, עלות חודשית ${money(ev.monthlyCost)}`:''}`);
  return `בניתי תרחיש "מה יקרה אם" לטווח של ${s.horizon} חודשים:\n${lines.join('\n')}\n\nלפי הסימולטור: כסף פנוי בסוף ${money(r.scenario.final.free)} (שינוי ${money(r.freeDelta)}), שווי נקי ${money(r.scenario.final.netWorth)} (שינוי ${money(r.netWorthDelta)})${r.scenario.negative?`, והכסף הפנוי נכנס למינוס בחודש ה־${r.scenario.negative}`:''}. ${r.goals.filter(g=>g.delta).map(g=>`${g.name}: ${g.delta>0?'מתעכב':'מקדים'} ב־${Math.abs(g.delta)} חודשים`).join(', ')}.\nהאם זה רעיון טוב? מה הסיכונים, ואיך אפשר לבנות את זה חכם יותר (מימון, תזמון, סכומים)?`;
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,a]=button.dataset.action.split(':');
  try{
    if(action==='lab-tab'){ui.labTab=a;render();}
    else if(action==='scn-add'){const preset=SCENARIO_PRESETS[a];if(preset){scenarioState().events.push({...preset[2]});saveScenario();render();}}
    else if(action==='scn-remove'){scenarioState().events.splice(+a,1);saveScenario();render();}
    else if(action==='scn-clear'){scenarioState().events=[];saveScenario();render();}
    else if(action==='scn-ai')sendCopilot(describeScenario(),[]);
  }catch(err){toast(err.message,true);}
});
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.dataset.scn&&el.tagName!=='SELECT'){const [i,key]=el.dataset.scn.split('.'),ev=scenarioState().events[+i];if(!ev)return;ev[key]=el.type==='number'?(el.value===''?'':Number(el.value)):el.value;saveScenario();refreshScenario();}
  else if(el.dataset.scnSetting&&el.tagName!=='SELECT'){scenarioState()[el.dataset.scnSetting]=Number(el.value)||0;saveScenario();refreshScenario();}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.dataset.scn&&el.tagName==='SELECT'){const [i,key]=el.dataset.scn.split('.'),ev=scenarioState().events[+i];if(!ev)return;ev[key]=['month','duration'].includes(key)?Number(el.value):el.value;saveScenario();if(key==='funding')render();else refreshScenario();}
  else if(el.dataset.scnSetting&&el.tagName==='SELECT'){scenarioState()[el.dataset.scnSetting]=Number(el.value);saveScenario();render();}
});
