import {uid,today,money,minusMoney,plainText,pct,pctPrecise,dateLabel,monthLabel,balances,monthlySummary,applyTransaction,TX_TYPE_LABELS} from './finance.js';
import {transferProblem} from './ledger.js';
import {palette,graph,donut,barChart,fanChart,scoreRing,shortAmount} from './charts.js';
import {markDuplicates} from './capture.js';
import {healthScore,detectRecurring,detectAnomalies,monthPace,monteCarlo,fireNumber,yearsToTarget,whatIfCut,parseQuickEntry,suggestCategory,averageMonth} from './smart.js';
import {AI_MODELS,AI_MODEL_HINT,AI_TOOLS,AI_CHAT_KEY,AI_LETTERS_KEY,ATTACHMENT_LIMIT,aiSettings,saveAiSettings,aiReady,financialContext,runAgent,attachmentBlock,storableConversation,markdownLite} from './ai.js';
import {moduleHook} from './hooks.js';

// New experiences: the Claude copilot, the future lab, the command palette and smart widgets.
// Rendered inside the shell from app.js and built on its shared helpers (e, icon, btn, card…).

const copilot={messages:null,busy:false,live:null,attachments:[],abort:null,pending:new Map(),error:null,draft:'',lastContext:'',status:''};
const toolLabels={get_financial_overview:'סקר את התמונה הפיננסית',query_transactions:'חיפש בתנועות',spending_breakdown:'ניתח את ההוצאות',get_investments:'בדק את תיק ההשקעות',simulate_future:'הריץ סימולציית עתיד',render_chart:'צייר גרף',propose_transactions:'מכין הצעה לתנועות',propose_budget:'מכין הצעת תקציב',propose_goal:'מכין תוכנית חיסכון',get_cashflow_forecast:'בדק את התזרים הצפוי',money_calculator:'הפעיל מחשבון פיננסי',get_split_groups:'בדק את חלוקות ההוצאות',propose_split_expense:'מכין הוצאה משותפת',propose_bill:'מכין תשלום קבוע',propose_transfer:'מכין העברה בין חשבונות',propose_wishlist_item:'מכין פריט לרשימת המשאלות',propose_investment_update:'מכין עדכון השקעות',simulate_scenario:'הריץ סימולציית ״מה יקרה אם״'};
const aiPrompts={
  month:'איך אני עומד החודש לעומת החודשים הקודמים? מה בולט?',
  save:'איפה אני יכול לחסוך 1,000 ₪ בחודש בלי לוותר על מה שחשוב לי? תן הצעות קונקרטיות לפי ההוצאות שלי.',
  chart:'צייר לי גרף של ההוצאות לפי קטגוריה ב־6 החודשים האחרונים, והסבר מה המגמה.',
  fire:'מתי אוכל להגיע לחופש כלכלי בקצב הנוכחי? הרץ סימולציה והסבר את הסיכונים.',
  budget:'בנה לי תקציב חודשי חכם לפי ההרגלים שלי, והצע לשמור אותו.',
  invest:'תנתח את תיק ההשקעות שלי: ביצועים, פיזור וסיכונים. בלי המלצה על נייר ספציפי.',
  health:'הציון הפיננסי שלי מוצג באפליקציה. מה שלושת הצעדים שישפרו אותו הכי הרבה בחצי השנה הקרובה?',
  recurring:'עבור על החיובים החוזרים שלי. מה כדאי לבדוק, לבטל או למקח עליו? כמה אחסוך בשנה?',
  anomalies:'מה החריגות בהוצאות החודש ולמה כדאי לשים לב אליהן?',
  bills:'האם צפוי לי מינוס בעו״ש בחודשיים הקרובים? עבור על התשלומים הקבועים שלי ותגיד מה אפשר להוזיל או לבטל.',
  split:'סכם לי את חלוקות ההוצאות: מי חייב למי וכמה, ונסח הודעה קצרה ונעימה לכל קבוצה כדי לסגור חשבון.',
  risk:'נתח את הסיכון והפיזור בתיק ההשקעות שלי: ריכוז, חשיפה לדולר ותרחישי ירידה. מה הייתי צריך לשקול? בלי המלצה על נייר ספציפי.',
  salary:'חשב את השכר נטו שלי לפי ההכנסה שאני מקבל, הסבר לי את התלוש ומה יכול להגדיל את הנטו.'
};
const aiSuggestions=[['month','TrendingUp','איך החודש שלי?'],['save','PiggyBank','איפה לחסוך 1,000 ₪'],['chart','BarChart3','גרף הוצאות חצי שנתי'],['fire','FlaskConical','מתי חופש כלכלי?'],['budget','Wallet','תקציב חכם עבורי'],['invest','Activity','ניתוח תיק ההשקעות'],['bills','CalendarDays','האם צפוי לי מינוס?'],['split','Users','מי חייב למי?']];
const voiceSupported=()=>!!(window.SpeechRecognition||window.webkitSpeechRecognition);
const modelName=id=>'Claude '+(AI_MODELS.find(m=>m[0]===id)||AI_MODELS[0])[1].split(' · ')[0];
try{if(localStorage.getItem('ofek-privacy'))document.documentElement.classList.add('privacy');}catch{}

// ---------- Conversation state ----------
function copilotMessages(){
  if(copilot.messages)return copilot.messages;
  let list=[];try{list=JSON.parse(localStorage.getItem(AI_CHAT_KEY)||'[]');}catch{}
  if(!Array.isArray(list))list=[];
  // A conversation must end with a finished assistant reply; drop any interrupted tail.
  while(list.length&&!(list.at(-1).role==='assistant'&&!(list.at(-1).content||[]).some(b=>b.type==='tool_use')))list.pop();
  return copilot.messages=list;
}
function saveConversation(){
  const list=copilotMessages();
  for(let start=0;start<list.length||start===0;){
    try{localStorage.setItem(AI_CHAT_KEY,JSON.stringify(storableConversation(list.slice(start))));return;}
    catch{start=list.findIndex((m,i)=>i>start&&m.role==='user'&&!(Array.isArray(m.content)&&m.content.every(b=>b.type==='tool_result')));if(start<0)break;}
  }
  try{localStorage.removeItem(AI_CHAT_KEY);}catch{}
}
function toolResultFor(id){
  for(const m of copilotMessages())if(m.role==='user'&&Array.isArray(m.content))for(const b of m.content)if(b.type==='tool_result'&&b.tool_use_id===id)return b;
  return null;
}
function parsedResult(block){if(!block||block.is_error)return null;try{return JSON.parse(typeof block.content==='string'?block.content:block.content?.[0]?.text||'{}');}catch{return null;}}

// ---------- Conversation rendering ----------
function userBubble(m){
  const blocks=typeof m.content==='string'?[{type:'text',text:m.content}]:m.content;
  if(blocks.every(b=>b.type==='tool_result'))return '';
  const files=blocks.map(b=>b.type==='image'?`<img class="ai-thumb" alt="תמונה מצורפת" src="data:${e(b.source.media_type)};base64,${e(b.source.data)}">`:b.type==='document'?`<span class="ai-file">${icon('Paperclip',13)}${e(b.title||'מסמך')}</span>`:b.type==='text'&&b.text.startsWith('[קובץ מצורף')?`<span class="ai-file">${icon('Paperclip',13)}${e(b.text.replace(/^\[קובץ מצורף:?\s*/,'').replace(/\s*—.*$/,'')||'קובץ')}</span>`:'').join('');
  const text=blocks.filter(b=>b.type==='text'&&!b.text.startsWith('<financial_context>')&&!b.text.startsWith('[קובץ מצורף')).map(b=>b.text).join('\n');
  return `<div class="ai-msg user"><div class="ai-bubble">${files?`<div class="ai-files">${files}</div>`:''}${text?`<p>${e(text).replace(/\n/g,'<br>')}</p>`:''}</div></div>`;
}
function aiChartCard(input){
  try{
    const labels=(input.labels||[]).slice(0,24).map(String),series=(input.series||[]).slice(0,4).map((s,j)=>({name:String(s.name||''),values:(s.values||[]).map(Number),color:palette[j%palette.length]})),unit=input.unit||'ILS';
    if(!labels.length||!series.length)return '';
    let chart;
    if(input.chart_type==='donut'){const rows=labels.map((name,i)=>({name,value:Math.max(0,series[0].values[i]||0),color:palette[i%palette.length]}));chart=donut(rows,rows.reduce((s,r)=>s+r.value,0),'סה״כ',150);}
    else if(input.chart_type==='line')chart=graph(labels.map((label,i)=>Object.assign({label,date:today()},...series.map((s,j)=>({['s'+j]:Number.isFinite(s.values[i])?s.values[i]:null})))),series.map((s,j)=>({key:'s'+j,name:s.name,color:s.color})),{height:220,percent:unit==='percent',area:series.length===1});
    else chart=barChart(labels,series,{unit,height:230});
    const legend=series.length>1&&input.chart_type!=='donut'?`<div class="ai-chart-legend">${series.map(s=>`<span class="legend-name"><i style="background:${s.color}"></i>${e(s.name)}</span>`).join('')}</div>`:'';
    return `<figure class="ai-chart"><figcaption>${icon('BarChart3',15)}${e(input.title||'גרף')}</figcaption>${chart}${legend}</figure>`;
  }catch{return '';}
}
function proposalRows(kind,items,id,selectable){
  if(kind!=='transactions')return '';
  // Duplicates are checked only while the proposal waits for approval: once approved, the rows are in the data.
  const checked=selectable?markDuplicates(data,items.map(t=>({...t,amount:Number(t.amount)||0}))):items.map(()=>({status:'new'}));
  return `<div class="table-wrap"><table class="ai-proposal-table tx"><thead><tr>${selectable?'<th aria-label="בחירה"></th>':''}<th>תאריך</th><th>תיאור</th><th>קטגוריה</th><th>סכום</th></tr></thead><tbody>${items.map((t,i)=>{const dup=checked[i].status;return `<tr>${selectable?`<td><input type="checkbox" ${dup==='duplicate'?'':'checked'} data-ai-row="${e(id)}" value="${i}" aria-label="לכלול את ${e(t.description||t.category)}"></td>`:''}<td class="muted">${dateLabel(t.date)}</td><td><b>${e(t.description||'—')}</b>${dup==='duplicate'?`<small class="negative">כבר קיימת: ${e(checked[i].matchedLabel)}</small>`:dup==='possible'?'<small class="muted">ייתכן כפילות — בדוק</small>':''}${t.accountId?`<small class="muted">${e(data.accounts.find(a=>a.id===t.accountId)?.name||t.account||'')}</small>`:''}</td><td><span class="category-pill">${e(t.category)}</span>${data.categories.includes(t.category)?'':'<small class="muted">קטגוריה חדשה</small>'}${t.type&&t.type!=='expense'?`<small class="muted">${e(TX_TYPE_LABELS[t.type]||t.type)}</small>`:''}</td><td><b dir="ltr" class="${t.type==='income'||t.type==='refund'?'positive':''}">${t.type==='income'||t.type==='refund'?'+':'−'}${money(t.amount,t.currency||'ILS',t.amount%1?2:0)}</b></td></tr>`;}).join('')}</tbody></table></div>`;
}
function proposalCard(b,live){
  const pending=copilot.pending.get(b.id),result=toolResultFor(b.id),parsed=parsedResult(result),input=b.input||{};
  const kind={propose_transactions:'transactions',propose_budget:'budget',propose_goal:'goal',propose_split_expense:'split',propose_bill:'bill',propose_wishlist_item:'wish',propose_investment_update:'holdings',propose_transfer:'transfer'}[b.name]||'goal';
  if(!pending&&!result)return `<div class="ai-proposal waiting">${icon('Sparkles',16)}<span>${live?'Claude מכין הצעה…':'ההצעה לא הושלמה.'}</span></div>`;
  if(result?.is_error)return `<div class="ai-tool">${icon('Info',13)}<span>ההצעה לא הייתה תקינה ו־Claude תיקן אותה</span></div>`;
  const req=pending?.request,status=pending?'':parsed?.approved?badge(kind==='transactions'?`נשמרו ${parsed.saved} תנועות`:kind==='holdings'?'הועבר לעדכון החודשי':'נשמר באישורך','green'):badge('נדחה — לא נשמר דבר','neutral');
  let title,body='';
  if(kind==='transactions'){const items=req?.items||input.transactions||[];title=`${items.length} תנועות מוכנות להוספה`;body=(req?.note||input.note?`<p class="muted">${e(req?.note||input.note)}</p>`:'')+proposalRows(kind,items,b.id,!!pending)+(req?.errors?.length?notice(`${req.errors.length} שורות לא תקינות לא נכללו.`):'');}
  if(kind==='budget'){const category=req?.category||input.category,limit=req?.limit||input.monthly_limit;title=`תקציב ל${category}`;body=`<div class="ai-proposal-figure"><b dir="ltr">${money(limit)}</b><span>בחודש${req?.existing?` · במקום ${amt(req.existing)}`:''}</span></div>${input.reason?`<p class="muted">${e(input.reason)}</p>`:''}`;}
  if(kind==='goal'){const g=req?.goal||input;title=`תוכנית חיסכון: ${g.name}`;body=`<div class="goal-details">${[['הפקדה חודשית',safe(amt(g.monthly))],['עד תאריך',validDateText(g.date)],['סכום יעד',g.target?safe(amt(g.target)):'תחזית אוטומטית'],['כבר נחסך',safe(amt(g.saved||0))]].map(([l,v])=>`<div><span>${l}</span><b>${e(v)}</b></div>`).join('')}</div>`;}
  if(kind==='split'){const x=req?.expense||{description:input.description,amount:Number(input.amount)||0},members=req?.members||[],who=id=>{const m=members.find(v=>v.id===id);return m?(m.me?'אני':m.name):'';};title=`הוצאה משותפת ב״${req?.groupName||input.group||''}״`;body=`<div class="ai-proposal-figure"><b dir="ltr">${money(x.amount,'ILS',x.amount%1?2:0)}</b><span>${e(x.description)}</span></div><p class="muted">שילם/ה: ${e(req?who(x.paidBy):input.paid_by||'')} · מתחלק בין: ${e(req?(x.participants?.length?x.participants.map(who).join(', '):'כל חברי הקבוצה'):(input.participants||[]).join(', ')||'כל חברי הקבוצה')}</p>`;}
  if(kind==='bill'){const x=req?.bill||input;title=`תשלום קבוע: ${x.name||''}`;body=`<div class="ai-proposal-figure"><b dir="ltr">${money(Number(x.amount)||0)}</b><span>${e(freqLabels[x.frequency]||'כל חודש')} · ב־${e(x.day)} לחודש${x.autopay?' · חיוב אוטומטי':''}</span></div>`;}
  if(kind==='holdings'){const items=req?.items||(input.holdings||[]).map(h=>({name:h.asset,next:h.price??h.value,currency:'ILS'}));title=`עדכון ${items.length} נכסים בתיק`;body=`<div class="table-wrap"><table class="ai-proposal-table"><thead><tr><th>נכס</th><th>עכשיו</th><th>חדש</th><th>שינוי</th></tr></thead><tbody>${items.map(x=>`<tr><td><b>${e(x.name)}</b></td><td dir="ltr">${x.old!=null?money(x.old,x.currency,2):'—'}</td><td dir="ltr"><b>${money(Number(x.next)||0,x.currency,2)}</b></td><td dir="ltr" class="${(x.change||0)>=0?'positive':'negative'}">${x.change==null?'—':pctPrecise(x.change)}</td></tr>`).join('')}</tbody></table></div>${req?.fx?`<p class="muted">שער דולר מהדוח: ${money(req.fx,'ILS',3)}</p>`:''}${req?.unmatched?.length?`<p class="muted">לא זוהו: ${e(req.unmatched.join(', '))}</p>`:''}${!pending&&parsed?.approved?btn('למסך העדכון החודשי','navigate:monthly','CalendarDays'):''}`;}
  if(kind==='transfer'){const x=req?.transfer,name=id=>data.accounts.find(a=>a.id===id)?.name||'';title=x?`העברה: מ־${name(x.accountId)} ל־${name(x.toAccountId)}`:`העברה: מ־${input.from||''} ל־${input.to||''}`;body=`<div class="ai-proposal-figure"><b dir="ltr">${money(Number(x?.amount??input.amount)||0,x?.currency||'ILS')}</b><span>${e([x?dateLabel(x.date):'',x?.description||input.description||''].filter(Boolean).join(' · '))}</span></div><p class="muted">העברה בין החשבונות שלך — לא הכנסה ולא הוצאה.</p>`;}
  if(kind==='wish'){const x=req?.item||input;title=`לרשימת המשאלות: ${x.name||''}`;body=`<div class="ai-proposal-figure"><b dir="ltr">${money(Number(x.price)||0)}</b><span>תקופת צינון של ${COOLING_DAYS} ימים</span></div>${x.note?`<p class="muted">${e(x.note)}</p>`:''}`;}
  const actions=pending?`<div class="actions">${btn(kind==='transactions'?'אישור והוספה':kind==='holdings'?'העברה לעדכון החודשי':'אישור ושמירה','ai-approve:'+b.id,'Check','primary')}${btn('לא תודה','ai-decline:'+b.id)}</div>`:'';
  return `<div class="ai-proposal ${pending?'pending':''}"><div class="ai-proposal-head"><span class="asset-icon ${pending?'gold':'purple'}">${icon({transactions:'ScanLine',budget:'Wallet',goal:'Target',split:'Users',bill:'Receipt',wish:'ShoppingBag',holdings:'TrendingUp',transfer:'ArrowLeftRight'}[kind],18)}</span><b>${e(title)}</b>${status}</div>${body}${actions}</div>`;
}
const validDateText=d=>{try{return dateLabel(d);}catch{return d||'—';}};
function toolBlock(b,live){
  if(b.name==='render_chart'){const r=toolResultFor(b.id);return live&&!r?`<div class="ai-tool running">${icon('BarChart3',13)}<span>מצייר גרף…</span></div>`:r?.is_error?'':aiChartCard(b.input||{});}
  if(b.name.startsWith('propose_'))return proposalCard(b,live);
  const r=toolResultFor(b.id);
  return `<div class="ai-tool ${r?'done':'running'}">${icon(r?(r.is_error?'Info':'Check'):'Sparkles',13)}<span>${e(toolLabels[b.name]||b.name)}${r?.is_error?' · נכשל, מנסה אחרת':r?'':'…'}</span></div>`;
}
function assistantBlocks(blocks,live=false){
  return blocks.filter(Boolean).map((b,i,all)=>{
    if(b.type==='text')return b.text?`<div class="ai-text">${markdownLite(b.text)}</div>`:'';
    if(b.type==='thinking')return b.thinking?`<details class="ai-thinking" ${live&&i===all.length-1?'open':''}><summary>${icon('Brain',14)}${live&&i===all.length-1?'Claude חושב…':'כך Claude חשב על זה'}</summary><div>${markdownLite(b.thinking)}</div></details>`:'';
    if(b.type==='tool_use')return toolBlock(b,live);
    return '';
  }).join('');
}
function liveHTML(){
  const blocks=copilot.live?.blocks||[],hasText=blocks.some(b=>b?.type==='text'&&b.text);
  return assistantBlocks(blocks,true)+(hasText?'':`<div class="ai-typing"><span></span><span></span><span></span><small>${e(copilot.status||'Claude חושב…')}</small></div>`);
}
function conversationHTML(){
  const messages=copilotMessages();
  if(!messages.length&&!copilot.busy&&!copilot.error)return `<div class="ai-welcome"><span class="ai-orb">${icon('Sparkles',30)}</span><h2>מה תרצה לדעת על הכסף שלך?</h2><p>Claude רואה את התמונה המלאה: תנועות, תקציבים, יעדים והשקעות. הוא מנתח, משווה, מצייר גרפים, סורק קבלות ומציע שינויים — שנשמרים רק באישורך.</p><div class="ai-chips">${aiSuggestions.map(([key,ic,label])=>`<button type="button" class="ai-chip" data-action="ai-prompt:${key}">${icon(ic,15)}<span>${e(label)}</span></button>`).join('')}<button type="button" class="ai-chip accent" data-action="ai-attach">${icon('ScanLine',15)}<span>סריקת קבלה או דף חשבון</span></button></div></div>`;
  let html='',group='';
  const flush=()=>{if(group){html+=`<div class="ai-msg assistant"><span class="ai-avatar small">${icon('Sparkles',15)}</span><div class="ai-answer">${group}</div></div>`;group='';}};
  for(const m of messages){
    if(m.role==='user'){const bubble=userBubble(m);if(bubble){flush();html+=bubble;}}
    else group+=assistantBlocks(m.content);
  }
  if(copilot.busy){group+=`<div id="ai-live">${liveHTML()}</div>`;}
  flush();
  if(copilot.error)html+=`<div class="ai-error ${copilot.error.soft?'soft':''}">${icon(copilot.error.soft?'Info':'TriangleAlert',17)}<span>${e(copilot.error.text)}</span>${copilot.error.prompt||copilot.error.files?.length?btn('ניסיון חוזר','ai-retry','RotateCcw'):''}</div>`;
  return html;
}
function attachmentsHTML(){
  return copilot.attachments.map((f,i)=>`<span class="ai-attachment">${f.kind==='image'?`<img alt="" src="data:${e(f.mediaType)};base64,${e(f.data)}">`:icon('Paperclip',14)}<span>${e(f.name)}</span><button type="button" class="icon-button" aria-label="הסרת ${e(f.name)}" data-action="ai-unattach:${i}">${icon('X',14)}</button></span>`).join('');
}
function composerActions(){
  return `${voiceSupported()?`<button type="button" class="icon-button ai-mic" aria-label="הקלטה קולית" title="הקלטה קולית" data-action="voice:ai-input">${icon('Mic',19)}</button>`:''}<button type="button" class="icon-button" aria-label="צירוף קבלה, תמונה או מסמך" title="צירוף קבלה, תמונה או מסמך" data-action="ai-attach">${icon('Paperclip',19)}</button>${copilot.busy?`<button type="button" class="ai-send stop" aria-label="עצירה" data-action="ai-stop">${icon('Square',17)}</button>`:`<button type="button" class="ai-send" aria-label="שליחה" data-action="ai-send">${icon('Send',17)}</button>`}`;
}
function refreshCopilot(forceScroll=false){
  const log=document.querySelector('#ai-log');if(!log)return;
  const near=log.scrollHeight-log.scrollTop-log.clientHeight<140;
  log.innerHTML=conversationHTML();
  const actions=document.querySelector('#ai-actions');if(actions)actions.innerHTML=composerActions();
  const files=document.querySelector('#ai-attachments');if(files)files.innerHTML=attachmentsHTML();
  if(forceScroll||near)log.scrollTop=log.scrollHeight;
}
let liveFrame=0;
function scheduleLive(){
  if(liveFrame)return;
  liveFrame=requestAnimationFrame(()=>{liveFrame=0;const el=document.querySelector('#ai-live'),log=document.querySelector('#ai-log');if(!el||!log)return;const near=log.scrollHeight-log.scrollTop-log.clientHeight<160;el.innerHTML=liveHTML();if(near)log.scrollTop=log.scrollHeight;});
}

// ---------- Talking to Claude ----------
function copilotEvent(ev){
  if(!copilot.live)return;
  if(ev.type==='block_start'){copilot.live.blocks[ev.index]=ev.block;if(ev.block.type==='tool_use')copilot.status=toolLabels[ev.block.name]||'עובד…';scheduleLive();}
  else if(['text','thinking','tool_input','block_stop'].includes(ev.type))scheduleLive();
  else if(ev.type==='assistant_message'){copilot.live={blocks:[]};copilot.status='Claude ממשיך…';refreshCopilot();}
  else if(ev.type==='tool_run'){copilot.status=toolLabels[ev.block.name]||'עובד…';refreshCopilot();}
  else if(ev.type==='tool_done')refreshCopilot();
}
async function sendCopilot(text,files=copilot.attachments){
  text=plainText(text).trim();
  if(copilot.busy){toast('Claude עדיין עונה. אפשר לעצור את התשובה הנוכחית.',true);return;}
  if(!aiReady()){navigate('copilot');toast('כדי לשאול את Claude יש לחבר מפתח API.',true);return;}
  if(!text&&!files.length)return;
  const messages=copilotMessages(),base=messages.length,context=financialContext(data,ui.month),content=[];
  if(context!==copilot.lastContext)content.push({type:'text',text:context});
  for(const f of files)content.push(attachmentBlock(f));
  content.push({type:'text',text:text||'צירפתי מסמך. חלץ ממנו את התנועות והצע להוסיף אותן.'});
  messages.push({role:'user',content});
  Object.assign(copilot,{attachments:[],draft:'',error:null,busy:true,live:{blocks:[]},status:'Claude חושב…',abort:new AbortController()});
  const box=document.querySelector('#ai-input');if(box){box.value='';autosize(box);}
  if(ui.page!=='copilot')navigate('copilot');else refreshCopilot(true);
  try{
    await runAgent({settings:aiSettings(),messages,signal:copilot.abort.signal,onEvent:copilotEvent,ctx:{get data(){return data;},month:ui.month,approve:req=>new Promise(resolve=>{copilot.pending.set(req.id,{request:req,resolve});refreshCopilot();})}});
    copilot.lastContext=context;
  }catch(err){
    messages.splice(base);
    copilot.error=err?.name==='AbortError'?{text:'התשובה נעצרה. השאלה לא נשלחה להמשך.',prompt:text,files,soft:true}:{text:err?.message||'משהו השתבש. נסה שוב.',prompt:text,files};
  }finally{
    for(const p of copilot.pending.values())p.resolve({approved:false});
    copilot.pending.clear();
    Object.assign(copilot,{busy:false,live:null,abort:null,status:''});
    saveConversation();refreshCopilot(true);
    if(ui.page!=='copilot'&&!copilot.error)toast('Claude סיים לענות — התשובה מחכה לך במסך אופק AI');
  }
}
function resolveProposal(id,approved){
  const p=copilot.pending.get(id);if(!p)return;
  if(approved){
    const rows=[...document.querySelectorAll(`[data-ai-row="${CSS.escape(id)}"]`)],selected=rows.length?rows.filter(r=>r.checked).map(r=>+r.value):null;
    const saved=applyProposal(p.request,selected);
    copilot.pending.delete(id);p.resolve({approved:true,saved});
  }else{copilot.pending.delete(id);p.resolve({approved:false});}
  refreshCopilot();
}
function applyProposal(req,selected){
  const next=structuredClone(data);
  if(req.kind==='transactions'){
    const items=req.items.filter((_,i)=>!selected||selected.includes(i));
    if(!items.length)throw Error('לא נבחרו תנועות לשמירה. אפשר לסמן שורות או ללחוץ ״לא תודה״.');
    for(const t of items){if(!next.categories.includes(t.category))next.categories.push(t.category);const tx={...t,id:uid(),fx:next.fx};applyTransaction(next,tx);next.transactions.push(tx);}
    commit(next,`${items.length} תנועות נוספו בעזרת Claude`,false,{undo:true});return items.length;
  }
  if(req.kind==='transfer'){
    const t={...req.transfer,id:uid()},name=id=>next.accounts.find(a=>a.id===id)?.name||'';
    const problem=transferProblem(next,t);if(problem)throw Error(problem);
    applyTransaction(next,t);next.transactions.push(t);
    commit(next,`ההעברה נרשמה: ${name(t.accountId)} ← ${name(t.toAccountId)}`,false,{undo:true});return 1;
  }
  if(req.kind==='budget'){
    if(!next.categories.includes(req.category))next.categories.push(req.category);
    const existing=next.budgets.find(b=>b.category===req.category);
    if(existing)existing.limit=req.limit;else next.budgets.push({id:uid(),category:req.category,limit:req.limit});
    commit(next,`התקציב ל${req.category} נשמר`);return 1;
  }
  if(req.kind==='holdings'){const chosen=req.items.filter((_,i)=>!selected||selected.includes(i));if(ui.page==='monthly')captureMonthly();initMonthly();for(const x of chosen)ui.monthly.values[x.assetId]=x.next;if(req.fx)ui.monthly.fx=req.fx;if(req.date)ui.monthly.date=req.date;ui.monthly.imported=chosen.map(x=>x.assetId);toast(`${chosen.length} נכסים הועברו לעדכון החודשי — בדוק ושמור תמונת מצב`);return chosen.length;}
  if(req.kind==='split'){const g=(next.groups||[]).find(x=>x.id===req.groupId);if(!g)throw Error('הקבוצה כבר לא קיימת.');g.expenses.push({id:uid(),...req.expense});commit(next,`ההוצאה נוספה לקבוצה ״${g.name}״`);return 1;}
  if(req.kind==='bill'){next.bills=[...(next.bills||[]),{id:uid(),...req.bill}];commit(next,`״${req.bill.name}״ נוסף ללוח התשלומים`);return 1;}
  if(req.kind==='wish'){next.wishlist=[...(next.wishlist||[]),{id:uid(),...req.item,added:today(),status:'waiting'}];commit(next,`״${req.item.name}״ נוסף לרשימת המשאלות`);return 1;}
  next.goals.push({id:uid(),...req.goal});commit(next,`תוכנית החיסכון ״${req.goal.name}״ נוספה`);return 1;
}

// ---------- Attachments & voice ----------
const fileToBase64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('קריאת הקובץ נכשלה.'));r.readAsDataURL(blob);});
async function imagePayload(file){
  const supported=['image/jpeg','image/png','image/webp','image/gif'];
  try{
    const bitmap=await createImageBitmap(file),scale=Math.min(1,1568/Math.max(bitmap.width,bitmap.height));
    if(scale<1||!supported.includes(file.type)){
      const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.88));
      return {mediaType:'image/jpeg',data:await fileToBase64(blob)};
    }
  }catch{if(!supported.includes(file.type))throw Error('לא ניתן לקרוא את התמונה. נסה JPG או PNG.');}
  return {mediaType:file.type,data:await fileToBase64(file)};
}
async function readAttachment(file){
  const name=file.name||'קובץ',type=file.type||'';
  if(file.size>ATTACHMENT_LIMIT)throw Error(`הקובץ ${name} גדול מ־8MB.`);
  if(type.startsWith('image/'))return {kind:'image',name,...await imagePayload(file)};
  if(type==='application/pdf'||/\.pdf$/i.test(name))return {kind:'pdf',name,data:await fileToBase64(file)};
  if(type.startsWith('text/')||/\.(csv|tsv|txt|json)$/i.test(name)){const text=await file.text();if(text.length>400000)throw Error(`הקובץ ${name} ארוך מדי. אפשר לפצל אותו לכמה קבצים.`);return {kind:'text',name,text};}
  throw Error(`סוג הקובץ ${name} אינו נתמך. אפשר לצרף תמונה, PDF, CSV או טקסט.`);
}
async function addAttachments(list){
  const files=[...list];
  if(copilot.attachments.length+files.length>5)toast('אפשר לצרף עד 5 קבצים להודעה.',true);
  for(const file of files.slice(0,5-copilot.attachments.length)){try{copilot.attachments.push(await readAttachment(file));}catch(err){toast(err.message,true);}}
  const el=document.querySelector('#ai-attachments');if(el)el.innerHTML=attachmentsHTML();
  document.querySelector('#ai-input')?.focus();
}
let voice=null;
function toggleVoice(targetId,button){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('הדפדפן הזה אינו תומך בהקלטה קולית.',true);return;}
  if(voice){voice.stop();return;}
  const el=document.getElementById(targetId);if(!el)return;
  const base=el.value?el.value.trim()+' ':'';
  voice=new SR();voice.lang='he-IL';voice.interimResults=true;voice.continuous=false;
  voice.onresult=ev=>{el.value=base+[...ev.results].map(r=>r[0].transcript).join('');el.dispatchEvent(new Event('input',{bubbles:true}));};
  voice.onerror=ev=>{if(!['aborted','no-speech'].includes(ev.error))toast('ההקלטה נכשלה. בדוק הרשאת מיקרופון.',true);};
  voice.onend=()=>{voice=null;document.querySelectorAll('.listening').forEach(b=>b.classList.remove('listening'));};
  voice.start();button?.classList.add('listening');
}
function autosize(el){el.style.height='auto';el.style.height=Math.min(180,el.scrollHeight)+'px';}

// ---------- Copilot page ----------
function copilotSetup(){
  const s=aiSettings();
  return `<section class="ai-hero card"><div class="ai-hero-copy"><span class="eyebrow">${icon('Sparkles',15)} חדש באופק</span><h2>יועץ פיננסי אישי, שמכיר כל שקל שלך.</h2><p>חבר את Claude לאופק ותקבל שותף שמנתח את ההוצאות, משווה לחודשים קודמים, מצייר גרפים, סורק קבלות ודפי חשבון, בונה תקציב ומריץ סימולציות לעתיד — בעברית, ובהתבסס על הנתונים האמיתיים שלך.</p>
  <form id="ai-key-form" class="ai-key-form">${field('מפתח API של Anthropic',input('apiKey','','password','required autocomplete="off" dir="ltr" placeholder="sk-ant-…" spellcheck="false"'),'המפתח נשמר רק בדפדפן הזה ואינו נכלל בגיבויים.')}${field('מודל',select('model',AI_MODELS.map(([id,label])=>[id,label]),s.model),AI_MODEL_HINT)}<div class="form-actions">${submit('חיבור Claude','Sparkles')}<a class="text-button" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">איך משיגים מפתח?${icon('ChevronLeft',14)}</a></div></form></div>
  <div class="ai-hero-grid">${[['Brain','שיחה עם הנתונים','״למה ההוצאות עלו?״ — Claude בודק בעצמו את התנועות ועונה עם מספרים.'],['ScanLine','סריקת קבלות ודפי חשבון','מצלמים, גוררים PDF או CSV — והתנועות מוכנות לאישור.'],['BarChart3','גרפים בתוך השיחה','מגמות, השוואות והתפלגויות, מצוירים לפי הבקשה.'],['Wallet','תקציב ויעדים באישורך','Claude מציע — אתה מאשר. שום דבר לא נשמר בלי לחיצה שלך.'],['FlaskConical','סימולציות עתיד','מונטה־קרלו על ההון שלך: מתי חופש כלכלי, ובאיזה סיכוי.'],['Mail','מכתב חודשי אישי','סיכום חכם של החודש וצעדים ברורים לחודש הבא.']].map(([ic,t,d])=>`<div><span class="asset-icon purple">${icon(ic,19)}</span><b>${t}</b><p>${d}</p></div>`).join('')}</div></section>
  ${notice('פרטיות: הנתונים נשארים במכשיר. רק כשאתה שואל את Claude, נשלח ישירות מהדפדפן ל־Anthropic סיכום פיננסי ותוצאות של כלים שהוא מפעיל, וכן קבצים שצירפת. אין שרת ביניים. כל השאר באופק — כולל הציון הפיננסי, זיהוי החיובים החוזרים והסימולציות — עובד גם ללא חיבור.')}`;
}
function copilotSide(){
  const s=aiSettings(),u=s.usage||{};
  return `${card(head('מה אפשר לבקש?')+`<div class="ai-capabilities">${[['Brain','ניתוח והשוואה','״למה ההוצאות עלו החודש?״'],['ScanLine','סריקת מסמכים','גרור קבלה, צילום מסך או PDF'],['BarChart3','גרפים','״הראה לי גרף של מסעדות לאורך השנה״'],['Wallet','שינויים באישורך','״בנה לי תקציב ושמור אותו״'],['FlaskConical','סימולציות','״מה אם אחסוך 2,000 ₪ יותר?״']].map(([ic,t,d])=>`<div><span class="asset-icon purple">${icon(ic,17)}</span><div><b>${t}</b><small>${d}</small></div></div>`).join('')}</div>`)}
  ${card(head('החיבור שלך','',textBtn('הגדרות','navigate:settings'))+`<div class="ai-usage"><div><span>מודל</span><b>${e(modelName(s.model))}</b></div><div><span>עלות משוערת עד כה</span><b dir="ltr">${money(u.cost||0,'USD',2)}</b></div><div><span>טוקנים</span><b dir="ltr">${Math.round((u.input||0)+(u.output||0)).toLocaleString('he-IL')}</b></div></div><p class="small muted">הנתונים נשלחים ל־Anthropic רק כשאתה שואל. הפקודות לשינוי נתונים דורשות את אישורך.</p>`)}`;
}
function copilotView(){
  if(!aiReady())return copilotSetup();
  const messages=copilotMessages();
  return `<div class="ai-layout"><section class="card ai-chat" data-ai-drop>
    <div class="ai-chat-head"><div class="ai-identity"><span class="ai-avatar">${icon('Sparkles',20)}</span><div><b>אופק AI</b><small>${e(modelName(aiSettings().model))} · מבוסס על הנתונים שלך</small></div></div>${messages.length&&!copilot.busy?btn('שיחה חדשה','ai-clear','RotateCcw'):''}</div>
    <div class="ai-log" id="ai-log" aria-live="polite">${conversationHTML()}</div>
    <div class="ai-composer"><div id="ai-attachments" class="ai-attachments">${attachmentsHTML()}</div><div class="ai-input-row"><textarea id="ai-input" rows="1" placeholder="שאל כל דבר על הכסף שלך, או צרף קבלה…" aria-label="הודעה ל־Claude">${e(copilot.draft)}</textarea><div id="ai-actions" class="ai-actions">${composerActions()}</div></div><input id="ai-file" class="visually-hidden" type="file" multiple accept="image/*,application/pdf,.pdf,.csv,.tsv,.txt,.json" aria-label="צירוף קובץ"><small class="ai-hint">Enter לשליחה · Shift+Enter לשורה חדשה · אפשר לגרור או להדביק לכאן צילום קבלה או דף חשבון</small></div>
    <div class="ai-drop-overlay">${icon('ScanLine',34)}<b>שחרר כאן — Claude יקרא את המסמך</b></div>
  </section><aside class="ai-side">${copilotSide()}</aside></div>`;
}

// ---------- Settings card ----------
function aiSettingsCard(){
  const s=aiSettings(),masked=s.apiKey?'••••'+s.apiKey.slice(-4):'';
  return card(head('Claude · אופק AI','חיבור ישיר מהדפדפן ל־Anthropic. המפתח נשמר רק במכשיר הזה ואינו נכלל בגיבוי.',s.apiKey?badge('מחובר','green'):badge('לא מחובר','neutral'))+`<form id="ai-settings-form"><div class="form-grid">${field('מפתח API',input('apiKey','','password',`autocomplete="off" dir="ltr" spellcheck="false" placeholder="${s.apiKey?e(masked)+' · השאר ריק כדי לשמור':'sk-ant-…'}"`))}${field('מודל',select('model',AI_MODELS.map(([id,label])=>[id,label]),s.model),AI_MODEL_HINT)}${field('עומק חשיבה',select('effort',[['low','מהיר'],['medium','מאוזן (מומלץ)'],['high','מעמיק']],s.effort),'רלוונטי ל־Opus ול־Sonnet. חשיבה מעמיקה איטית ויקרה יותר.')}<div class="field"><span>שימוש מצטבר</span><div class="ai-usage-inline"><b dir="ltr">${money(s.usage?.cost||0,'USD',2)}</b><small>${Math.round((s.usage?.input||0)+(s.usage?.output||0)).toLocaleString('he-IL')} טוקנים · הערכה לפי מחירון רשמי</small></div></div></div><div class="form-actions">${submit('שמירת הגדרות AI')}${s.apiKey?btn('ניתוק Claude','ai-disconnect','','danger'):''}${btn('איפוס מונה','ai-reset-usage')}${btn('מחיקת היסטוריית השיחה','ai-clear-history')}</div></form>`,'ai-settings-card');
}

// ---------- Smart widgets (offline) ----------
function healthCard(){
  const h=healthScore(data,ui.month);
  return card(head('הציון הפיננסי שלך','חמישה מדדים, מחושבים במכשיר מהנתונים שלך.',aiReady()?btn('איך לשפר עם Claude','ai-prompt:health','Sparkles'):'')+`<div class="health"><div class="health-ring">${scoreRing(h.score,138)}<b>${e(h.grade)}</b></div><div class="health-factors">${h.factors.map(f=>`<div class="health-factor"><div class="row-between"><span>${e(f.label)}</span><b>${Math.round(f.score)}</b></div>${progress(f.score,f.score<45?'red':f.score<70?'':'green')}<small>${e(f.tip)}</small></div>`).join('')}</div></div>`,'health-card');
}
function recurringCard(){
  const list=detectRecurring(data,ui.month),yearly=list.reduce((s,r)=>s+r.annual,0);
  return card(head('תשלומים חוזרים שזוהו',list.length?safe(`${list.length} חיובים קבועים · כ־${amt(yearly)} בשנה`):'מזוהים אוטומטית מתוך התנועות שלך',list.length&&aiReady()?btn('מה כדאי לבטל?','ai-prompt:recurring','Sparkles'):'')+(list.length?`<div class="table-wrap"><table><thead><tr><th>חיוב</th><th>קטגוריה</th><th>בחודש</th><th>בשנה</th></tr></thead><tbody>${list.slice(0,10).map(r=>`<tr><td><div class="transaction-name">${categoryBadge(r.category,16)}<div><b>${e(r.name)}</b><small>${r.months} חודשים ברצף${r.automatic?' · תנועה חוזרת':''} · הבא ב־${dateLabel(r.nextDate)}</small></div></div></td><td><span class="category-pill">${e(r.category)}</span></td><td class="amount"><b dir="ltr">${minusMoney(r.average)}</b></td><td dir="ltr">${minusMoney(r.annual)}</td></tr>`).join('')}</tbody></table></div>`:empty('עוד לא זוהו חיובים חוזרים','כשיצטברו כמה חודשים של תנועות, נזהה כאן מנויים וחיובים קבועים.')));
}
function anomaliesCard(){
  const list=detectAnomalies(data,ui.month);
  return card(head('חריגות החודש',`השוואה להתנהגות שלך בחצי השנה האחרונה`,list.length&&aiReady()?btn('הסבר לי','ai-prompt:anomalies','Sparkles'):'')+(list.length?`<div class="anomalies">${list.slice(0,6).map(a=>`<div><span class="asset-icon ${a.ratio>2?'red':'gold'}">${icon(a.kind==='category'?'TrendingUp':'TriangleAlert',18)}</span><div><b>${e(a.kind==='category'?`ההוצאות על ${a.title} גבוהות מהרגיל`:a.title)}</b><small>${a.kind==='category'?`${amt(a.amount)} החודש, לעומת ממוצע של ${amt(a.typical)}`:`${dateLabel(a.date)} · ${e(a.category)} · בדרך כלל כ־${amt(a.typical)}`}</small></div><b class="negative" dir="ltr">×${a.ratio.toLocaleString('he-IL',{maximumFractionDigits:1})}</b></div>`).join('')}</div>`:`<div class="all-clear">${icon('ShieldCheck',22)}<div><b>הכול נראה רגיל החודש</b><small>לא נמצאו הוצאות חריגות ביחס להיסטוריה שלך.</small></div></div>`));
}
function paceCard(compact=false){
  const p=monthPace(data,ui.month),ratio=p.budget?p.projected/p.budget:0,over=p.projected>p.budget;
  const body=`<div class="pace-numbers"><div><span>${p.complete?'הוצאות החודש':'הוצאת עד היום'}</span><b dir="ltr">${money(p.spent)}</b></div><div><span>${p.complete?'יעד ההוצאות':'צפי לסוף החודש'}</span><b dir="ltr" class="${over&&!p.complete?'negative':''}">${money(p.complete?p.budget:p.projected)}</b></div></div>${progress(p.budget?p.spent/p.budget*100:0,p.spent>p.budget?'red':'')}${p.complete?'':`<div class="pace-marker" style="--at:${Math.min(100,ratio*100)}%" title="צפי לסוף החודש"></div>`}<p class="muted small">${p.complete?(p.spent<=p.budget?`סיימת את החודש ${amt(p.budget-p.spent)} מתחת ליעד.`:`החודש הסתיים ${amt(p.spent-p.budget)} מעל היעד.`):p.elapsed===0?'החודש עוד לא התחיל.':over?`בקצב הנוכחי תחרוג מהיעד בכ־${amt(p.projected-p.budget)}. ${p.method==='history'?'התחזית מבוססת על מה שקורה בדרך כלל בהמשך החודש.':''}`:`בקצב הנוכחי תסיים כ־${amt(p.budget-p.projected)} מתחת ליעד.`}</p>`;
  return card((compact?`<div class="row-between"><span class="eyebrow">${icon('Gauge',15)} קצב ההוצאות</span>${p.complete?badge('חודש שהסתיים','neutral'):badge(`יום ${p.elapsed} מתוך ${p.days}`,'purple')}</div>`:head('תחזית לסוף החודש','ההוצאה בפועל עד היום, ועוד מה שקורה בדרך כלל בהמשך החודש.'))+body,'pace-card');
}
function healthMiniCard(){
  const h=healthScore(data,ui.month),weakest=[...h.factors].sort((a,b)=>a.score-b.score)[0];
  return card(`<div class="row-between"><span class="eyebrow">${icon('HeartPulse',15)} הציון הפיננסי</span>${textBtn('פירוט','navigate:insights')}</div><div class="health-mini">${scoreRing(h.score,104)}<div><b>${e(h.grade)}</b><small>${e(weakest.label)}: ${e(weakest.tip)}</small></div></div>`,'health-mini-card');
}
function askClaudeCard(){
  const ask=aiReady()?`<form id="ai-quick-form" class="ai-quick"><input name="q" autocomplete="off" placeholder="למשל: למה ההוצאות עלו החודש?" aria-label="שאלה ל־Claude"><button class="ai-send" aria-label="שליחה" type="submit">${icon('Send',16)}</button></form><div class="ai-chips compact">${aiSuggestions.slice(0,3).map(([key,ic,label])=>`<button type="button" class="ai-chip" data-action="ai-prompt:${key}">${icon(ic,14)}<span>${e(label)}</span></button>`).join('')}</div>`:`<p class="muted">חבר את Claude כדי לשאול שאלות על הכסף שלך, לסרוק קבלות ולקבל מכתב חודשי אישי.</p>${btn('חיבור Claude','navigate:copilot','Sparkles','primary')}`;
  return card(`<div class="row-between"><span class="eyebrow">${icon('Sparkles',15)} שאל את Claude</span><kbd class="kbd-hint">Ctrl K</kbd></div>${ask}`,'ai-ask-card');
}

// ---------- Monthly letter ----------
const letterState={month:null,text:'',busy:false,error:null,abort:null};
function storedLetters(){try{return JSON.parse(localStorage.getItem(AI_LETTERS_KEY)||'{}')||{};}catch{return {};}}
function letterBody(){
  const saved=storedLetters()[ui.month],busy=letterState.busy&&letterState.month===ui.month;
  if(busy)return letterState.text?markdownLite(letterState.text):`<div class="ai-typing"><span></span><span></span><span></span><small>Claude עובר על החודש שלך…</small></div>`;
  if(letterState.error&&letterState.month===ui.month)return `<div class="ai-error">${icon('TriangleAlert',17)}<span>${e(letterState.error)}</span></div>`;
  return saved?markdownLite(saved.text)+`<small class="muted letter-date">נכתב ב־${new Date(saved.date).toLocaleString('he-IL')}</small>`:`<p class="muted">מכתב אישי על ${monthLabel(ui.month)}: מה הלך טוב, מה כדאי לשים לב, ושלושה צעדים ברורים לחודש הבא.</p>`;
}
function letterCard(){
  const busy=letterState.busy&&letterState.month===ui.month,saved=storedLetters()[ui.month];
  const action=!aiReady()?btn('חיבור Claude','navigate:copilot','Sparkles','primary'):busy?btn('עצירה','ai-letter-stop','Square'):btn(saved?'כתיבה מחדש':'כתוב לי את המכתב',`ai-letter`,'Mail',saved?'':'primary');
  return card(head('המכתב החודשי שלך מ־Claude',monthLabel(ui.month),action)+`<div id="ai-letter" class="ai-letter">${letterBody()}</div>`,'ai-letter-card');
}
async function writeLetter(){
  if(letterState.busy)return;
  const month=ui.month;Object.assign(letterState,{month,text:'',busy:true,error:null,abort:new AbortController()});render();
  const update=()=>{const el=document.querySelector('#ai-letter');if(el&&ui.month===month)el.innerHTML=letterBody();};
  const messages=[{role:'user',content:[{type:'text',text:financialContext(data,month)},{type:'text',text:`כתוב לי "מכתב חודשי" אישי על ${monthLabel(month)} (${month}). קודם בדוק בעזרת הכלים: השוואה לחודשים קודמים, תקציבים, חיובים חוזרים, חריגות, התקדמות ביעדים ובהשקעות. מבנה: שורת פתיחה חמה ואישית, ### מה הלך טוב, ### למה כדאי לשים לב, ### שלושה צעדים לחודש הבא (ממוספרים, עם סכומים). עד 260 מילים, בלי גרפים ובלי הקדמות על הבדיקות שעשית.`}]}];
  try{
    const r=await runAgent({settings:aiSettings(),messages,tools:AI_TOOLS.filter(t=>!t.name.startsWith('propose_')&&t.name!=='render_chart'),signal:letterState.abort.signal,ctx:{get data(){return data;},month,approve:async()=>({approved:false})},onEvent:ev=>{if(ev.type==='block_start'&&ev.block.type==='text'&&letterState.text)letterState.text+='\n\n';if(ev.type==='text'){letterState.text+=ev.text;update();}if(ev.type==='assistant_message'&&ev.message.stop_reason==='tool_use'){letterState.text='';update();}}});
    const text=r.message.content.filter(b=>b.type==='text').map(b=>b.text).join('\n\n').trim();
    if(!text)throw Error('Claude לא החזיר מכתב. נסה שוב.');
    const all=storedLetters();all[month]={text,date:new Date().toISOString()};try{localStorage.setItem(AI_LETTERS_KEY,JSON.stringify(all));}catch{}
  }catch(err){letterState.error=err?.name==='AbortError'?'הכתיבה נעצרה.':err.message;}
  finally{letterState.busy=false;letterState.abort=null;render();}
}
function smartInsights(){return `${healthCard()}${letterCard()}<div class="two-columns">${anomaliesCard()}${paceCard()}</div>${recurringCard()}${moduleHook('insights','')}`;}

// ---------- Future lab ----------
// The lab starts from the user's own numbers. A starting value the user has not changed follows the data (an
// income, a price update or a sync meanwhile), so the lab never works from a stale balance.
function labDefaults(){
  const b=balances(data),avg=averageMonth(data,ui.month,3),cur=monthlySummary(data,ui.month),expenses=avg.expenses||cur.expenses;
  return {start:Math.round(b.savings+b.investments),monthly:Math.max(0,Math.round(avg.months?avg.saved:cur.saved)),target:Math.round(fireNumber(expenses*12)||1000000)};
}
function labState(){
  if(!ui.lab){
    const top=data.categories.map(c=>[c,whatIfCut(data,c,100,1,0,ui.month).average]).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).find(([c])=>!['חשבונות','משכורת'].includes(c)),auto=labDefaults();
    ui.lab={...auto,years:20,ret:7,vol:15,inf:2.5,cutCategory:top?.[0]||data.categories[0]||'',cutPct:25,cutYears:10,auto,dataRef:data};
  }else if(ui.lab.dataRef!==data){
    const auto=labDefaults();for(const k of Object.keys(auto))if(ui.lab[k]===ui.lab.auto?.[k])ui.lab[k]=auto[k];
    Object.assign(ui.lab,{auto,dataRef:data});
  }
  return ui.lab;
}
const labFields=[['start','סכום התחלתי (₪)',0,null,1000],['monthly','הפקדה חודשית (₪)',0,null,100],['target','יעד (₪, בכסף של היום)',0,null,10000]];
const labSliders=[['years','אופק בשנים',1,50,1,v=>`${v} שנים`],['ret','תשואה שנתית צפויה',0,15,.5,v=>`${v}%`],['vol','תנודתיות שנתית',0,35,1,v=>`${v}%`],['inf','אינפלציה שנתית',0,8,.5,v=>`${v}%`]];
function labResults(){
  const s=labState(),mc=monteCarlo({start:+s.start||0,monthly:+s.monthly||0,years:+s.years,annualReturn:s.ret/100,volatility:s.vol/100,inflation:s.inf/100,target:+s.target||null}),f=mc.final;
  const yt=s.target?yearsToTarget(+s.start||0,+s.monthly||0,+s.target,s.ret/100,s.inf/100):null;
  return `<div class="three-metrics">${metric(`תרחיש סביר בעוד ${s.years} שנים`,money(f.p50),`טווח של 80% מהתרחישים: <span class="amt" style="white-space:nowrap">${shortAmount(f.p10)}–${shortAmount(f.p90)} ₪</span>`,'TrendingUp')}${metric('סיכוי להגיע ליעד',s.target?pct(mc.probability):'—',s.target?`יעד של ${amt(+s.target)} תוך ${s.years} שנים`:'הגדר יעד כדי לחשב סיכוי','Target','green')}${metric('זמן משוער ליעד',yt==null?'מעל 100 שנה':yt===0?'כבר שם':`${yt.toLocaleString('he-IL',{maximumFractionDigits:1})} שנים`,'לפי תשואה ממוצעת קבועה, אחרי אינפלציה','FlaskConical','purple')}</div>${card(head('טווח העתידים האפשריים',`${mc.runs.toLocaleString('he-IL')} תרחישים · בכסף של היום`)+fanChart(mc.points,{target:+s.target||null})+`<div class="chart-footer"><span><i class="gold-dot"></i>תרחיש חציוני</span><span><i class="purple-dot"></i>80% מהתרחישים</span><span>קו מקווקו: סך ההפקדות</span></div>`,'lab-chart')}`;
}
function whatIfHTML(){
  const s=labState(),r=whatIfCut(data,s.cutCategory,+s.cutPct,+s.cutYears,s.ret/100,ui.month);
  return r.average>0?`<div class="whatif-result"><div><span>ממוצע חודשי היום</span><b dir="ltr">${money(r.average)}</b></div><div><span>חיסכון בחודש</span><b dir="ltr" class="positive">${money(r.monthly)}</b></div><div><span>אחרי ${r.years} שנים בהשקעה</span><b dir="ltr" class="gold">${money(r.future)}</b></div></div><p class="muted small">${amt(r.contributed)} הופקדו בפועל — השאר הוא ריבית דריבית בתשואה של ${s.ret}% בשנה.</p>`:`<p class="muted">אין הוצאות בקטגוריה הזו בשלושת החודשים האחרונים.</p>`;
}
function labView(){
  const tab=ui.labTab||'whatif';
  return `<div class="segmented lab-tabs" role="tablist">${[['market','סימולציית שוק','FlaskConical'],['whatif','מה יקרה אם','Sparkles']].map(([id,label,ic])=>`<button type="button" role="tab" aria-selected="${tab===id}" class="${tab===id?'active':''}" data-action="lab-tab:${id}">${icon(ic,15)}<span>${label}</span></button>`).join('')}</div>`+(tab==='whatif'?scenarioView():marketLabView());
}
function marketLabView(){
  const s=labState(),avg=averageMonth(data,ui.month,3),expenses=(avg.expenses||monthlySummary(data,ui.month).expenses)*12,fire=fireNumber(expenses),b=balances(data),investable=b.savings+b.investments,fireYears=yearsToTarget(investable,Math.max(0,avg.saved||0),fire||Infinity,s.ret/100,s.inf/100);
  return `<section class="lab-intro"><div><span class="eyebrow">${icon('FlaskConical',15)} מעבדת העתיד</span><h2>אלף עתידים אפשריים. החלטה אחת היום.</h2><p>הסימולציה מריצה ${(1000).toLocaleString('he-IL')} תרחישים של שוק תנודתי, חודש אחר חודש, ומראה את טווח האפשרויות — לא רק את הממוצע.</p></div>${aiReady()?btn('ניתוח התוכנית עם Claude','ai-lab','Sparkles','primary'):''}</section>
  <div class="lab-layout">${card(head('ההנחות שלך','שנה ערכים וראה את התוצאה מתעדכנת מיד.',btn('איפוס','lab-reset','RotateCcw'))+`<div class="lab-controls">${labFields.map(([k,l])=>field(l,`<input type="number" min="0" step="any" value="${e(s[k])}" data-lab="${k}" dir="ltr">`)).join('')}${labSliders.map(([k,l,min,max,step,fmt])=>`<label class="lab-slider"><span>${l}<output data-lab-out="${k}">${fmt(s[k])}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${e(s[k])}" data-lab="${k}"></label>`).join('')}</div>`,'lab-controls-card')}<div id="lab-results" class="lab-results">${labResults()}</div></div>
  <div class="two-columns">${card(head('חופש כלכלי (FIRE)','כלל ה־4%: הון של פי 25 מההוצאות השנתיות.')+`<div class="fire"><div><span>הוצאות שנתיות</span><b dir="ltr">${money(expenses)}</b></div><div><span>המספר שלך</span><b dir="ltr" class="gold">${money(fire||0)}</b></div><div><span>חסכונות והשקעות היום</span><b dir="ltr">${money(investable)}</b></div><div><span>בקצב החיסכון הנוכחי</span><b>${fireYears==null?'מעל 100 שנה':fireYears===0?'כבר הגעת!':`כ־${fireYears.toLocaleString('he-IL',{maximumFractionDigits:1})} שנים`}</b></div></div>${progress(fire?investable/fire*100:0,'purple')}<div class="actions">${btn('הגדר כיעד בסימולציה','lab-fire','Target')}</div>`)}${card(head('מה אם…?','צמצום קטן בקטגוריה אחת, מושקע לאורך זמן.')+`<div class="form-grid">${field('קטגוריה',select('cutCategory',data.categories,s.cutCategory,'data-lab="cutCategory"'))}<label class="lab-slider"><span>צמצום<output data-lab-out="cutPct">${s.cutPct}%</output></span><input type="range" min="5" max="100" step="5" value="${e(s.cutPct)}" data-lab="cutPct"></label><label class="lab-slider"><span>לאורך<output data-lab-out="cutYears">${s.cutYears} שנים</output></span><input type="range" min="1" max="40" step="1" value="${e(s.cutYears)}" data-lab="cutYears"></label></div><div id="lab-whatif">${whatIfHTML()}</div>`)}</div>
  ${notice('הסימולציה היא מודל סטטיסטי (תשואות לוג־נורמליות, הפקדה בסוף כל חודש) ולא ייעוץ השקעות. העבר אינו מבטיח את העתיד; מיסים ודמי ניהול אינם נכללים. כל הערכים מוצגים בכסף של היום, אחרי אינפלציה.')}`;
}
const labFormat={years:v=>`${v} שנים`,ret:v=>`${v}%`,vol:v=>`${v}%`,inf:v=>`${v}%`,cutPct:v=>`${v}%`,cutYears:v=>`${v} שנים`};
let labFrame=0;
function updateLab(el){
  const s=labState(),key=el.dataset.lab;
  s[key]=key==='cutCategory'?el.value:el.value===''?'':+el.value;
  const out=document.querySelector(`[data-lab-out="${key}"]`);if(out&&labFormat[key])out.textContent=labFormat[key](el.value);
  if(labFrame)cancelAnimationFrame(labFrame);
  labFrame=requestAnimationFrame(()=>{labFrame=0;if(['cutCategory','cutPct','cutYears','ret'].includes(key)){const w=document.querySelector('#lab-whatif');if(w)w.innerHTML=whatIfHTML();}if(!['cutCategory','cutPct','cutYears'].includes(key)){const r=document.querySelector('#lab-results');if(r)r.innerHTML=labResults();}});
}

// ---------- Command palette ----------
const paletteState={query:'',index:0,items:[]};
function openPalette(initial=''){
  Object.assign(paletteState,{query:initial,index:0,items:[]});
  const el=showDialog('פעולה מהירה',`<div class="palette"><div class="palette-input">${icon('Search',18)}<input id="palette-input" autocomplete="off" spellcheck="false" placeholder="״קפה 18 אתמול במזומן״, שם של מסך, או שאלה ל־Claude" aria-label="פקודה, חיפוש או הוספה מהירה" value="${e(initial)}">${voiceSupported()?`<button type="button" class="icon-button" aria-label="הקלטה קולית" data-action="voice:palette-input">${icon('Mic',18)}</button>`:''}</div><div id="palette-results" class="palette-results" role="listbox" aria-label="תוצאות"></div><div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> ניווט</span><span><kbd>Enter</kbd> ביצוע</span><span><kbd>Esc</kbd> סגירה</span><span>${icon('Zap',13)} נסה: ״משכורת 15,000״ או ״סופר 230 שלשום״</span></div></div>`);
  el.classList.add('palette-modal');refreshPalette();
  setTimeout(()=>document.querySelector('#palette-input')?.focus());
}
function quickSave(draft){
  const next=structuredClone(data),t={id:uid(),type:draft.type,amount:draft.amount,currency:draft.currency,date:draft.date,category:draft.category,subcategory:'',accountId:draft.accountId,description:draft.description,tags:[],recurring:false,fx:next.fx};
  applyTransaction(next,t);next.transactions.push(t);closeDialog();
  commit(next,`${t.type==='refund'?'נוסף החזר':`נוספה ${TX_TYPE_LABELS[t.type]}`}: ${money(t.amount,t.currency,t.amount%1?2:0)} · ${t.category}`,false,{undo:true});
}
function paletteItems(q){
  const query=q.trim(),items=[];
  if(query){
    const draft=parseQuickEntry(query,data);
    if(draft?.valid){
      const account=data.accounts.find(a=>a.id===draft.accountId)?.name||'';
      items.push({icon:'Zap',title:`${TX_TYPE_LABELS[draft.type]||'הוצאה'} של ${money(draft.amount,draft.currency,draft.amount%1?2:0)} · ${draft.category}`,sub:`${draft.description||'ללא תיאור'} · ${account} · ${dateLabel(draft.date)} — Enter לשמירה`,run:()=>quickSave(draft),accent:true});
      items.push({icon:'Edit3',title:'עריכה לפני שמירה',sub:'טופס התנועה ייפתח עם הפרטים שזוהו',run:()=>{closeDialog();openEntity('transaction',null,{type:draft.type,amount:draft.amount,date:draft.date,category:draft.category,accountId:draft.accountId,description:draft.description});}});
    }
    if(aiReady()&&query.length>2)items.push({icon:'Sparkles',title:`שאל את Claude: ״${query}״`,sub:'תשובה מבוססת על הנתונים שלך',run:()=>{closeDialog();sendCopilot(query);},accent:!draft?.valid});
  }
  const actions=[
    {icon:'Plus',title:'תנועה חדשה',run:()=>{closeDialog();openEntity('transaction');}},
    {icon:'ScanLine',title:'סריקת קבלה או דף חשבון',sub:aiReady()?'Claude יחלץ את התנועות':'דורש חיבור Claude',run:()=>{closeDialog();navigate('copilot');if(aiReady())setTimeout(()=>document.querySelector('#ai-file')?.click(),60);}},
    {icon:'ArrowLeftRight',title:'העברה בין חשבונות',sub:'עו״ש, מזומן, חיסכון, כרטיס או הלוואה',run:()=>{closeDialog();openEntity('transaction',null,{type:'transfer'});}},
    {icon:'Banknote',title:'משיכה מכספומט',sub:'מהעו״ש למזומן',run:()=>{closeDialog();const bank=data.accounts.find(a=>a.kind==='bank'),cash=data.accounts.find(a=>a.kind==='cash');if(bank&&cash)openQuickAdd({type:'transfer',fromId:bank.id,toId:cash.id});else openEntity('transaction',null,{type:'transfer',accountId:bank?.id||'',toAccountId:cash?.id||''});}},
    {icon:'Receipt',title:'תשלום קבוע חדש',sub:'שכירות, ארנונה, ביטוח, מנוי',run:()=>{closeDialog();navigate('bills');openBillForm();}},
    {icon:'Users',title:'הוצאה משותפת עם חברים',sub:'חלוקת הוצאות בקבוצה',run:()=>{closeDialog();navigate('split');}},
    {icon:'ShoppingBag',title:'האם כדאי לקנות?',sub:'בדיקה מול התקציב והיעדים',run:()=>{closeDialog();navigate('wishlist');setTimeout(()=>document.querySelector('[data-buy="price"]')?.focus(),60);}},
    {icon:'Calculator',title:'מחשבון שכר נטו 2026',run:()=>{closeDialog();toolState().tab='salary';navigate('tools');}},
    {icon:'Landmark',title:'מחשבון משכנתא והלוואות',run:()=>{closeDialog();toolState().tab='loan';navigate('tools');}},
    {icon:'ScanLine',title:'קליטת הוצאות מקובץ או צילום',sub:'פירוט אשראי, דף בנק או קבלה',run:()=>{closeDialog();navigate('capture');}},
    {icon:'Mail',title:'המכתב החודשי מ־Claude',run:()=>{closeDialog();navigate('insights');}},
    {icon:document.documentElement.classList.contains('privacy')?'Eye':'EyeOff',title:document.documentElement.classList.contains('privacy')?'הצגת סכומים':'מצב פרטיות — הסתרת סכומים',run:()=>{closeDialog();togglePrivacy();}},
    {icon:'RefreshCw',title:'עדכון יומי של מחירי ההשקעות',sub:'המחירים של היום — אוטומטית או בהקלדה',run:()=>{closeDialog();navigate('investments');setTimeout(()=>openDailyUpdate(),60);}},
    {icon:'CalendarDays',title:'עדכון השקעות חודשי',run:()=>{closeDialog();navigate('monthly');}},
    {icon:'Download',title:'הורדת גיבוי מלא',run:()=>{closeDialog();exportData('backup');}},
    {icon:'FlaskConical',title:'מה יקרה אם…',sub:'רכב, מענק שחרור או שינוי בהפקדה החודשית',run:()=>{closeDialog();ui.labTab='whatif';navigate('lab');}},
    {icon:'Upload',title:'עדכון השקעות מהדבקת דוח',sub:'טבלה מבית ההשקעות או קובץ Excel',run:()=>{closeDialog();navigate('investments');setTimeout(()=>openHoldingsImport(),60);}},
    {icon:'LayoutGrid',title:'התאמת דף הבית',sub:'אילו כרטיסים יופיעו ובאיזה סדר',run:()=>{closeDialog();ui.homeEdit=true;navigate('dashboard');}},
    {icon:'Repeat',title:'סנכרון בין מכשירים',sub:'טלפון ומחשב, מוצפן',run:()=>{closeDialog();navigate('settings');setTimeout(()=>document.querySelector('#sync-card')?.scrollIntoView({block:'start'}),60);}},
    {icon:'Sparkles',title:'מה חדש באופק 4.2',run:()=>{closeDialog();openWhatsNew();}}
  ];
  actions.push(...moduleHook('palette',[]));
  // Screens: the sidebar names plus the short sub-tab names (PAGE_LABELS), so "תזרים" or "יעדים" finds them too.
  const nav=[...routes,['settings','הגדרות וגיבוי','Settings']].map(([id,label,ic])=>({icon:PAGE_ICONS[id]||ic,title:label,sub:'מעבר למסך',alias:PAGE_LABELS[id]||'',run:()=>{closeDialog();navigate(id);}}));
  for(const [id,label] of Object.entries(PAGE_LABELS))if(!nav.some(n=>n.title===label||n.alias===label)&&!routes.some(r=>r[0]===id)&&id!=='settings')nav.push({icon:PAGE_ICONS[id]||'LayoutGrid',title:label,sub:'מעבר למסך',run:()=>{closeDialog();navigate(id);}});
  const has=(item,w)=>item.title.includes(w)||item.alias?.includes(w);
  const match=item=>!query||has(item,query)||query.split(' ').every(w=>has(item,w));
  const rest=[...actions,...nav].filter(match);
  // Transactions whose description or category matches (newest first), opening the transaction.
  const words=query.split(/\s+/).filter(Boolean),found=query.length>=2?data.transactions.filter(t=>{const text=`${t.description||''} ${t.category||''} ${t.subcategory||''}`;return words.every(w=>text.includes(w));}).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(t=>({icon:categoryIcon(t.category),title:t.description||t.category||'תנועה',sub:`${TX_TYPE_LABELS[t.type]||t.type} · ${t.type==='expense'?minusMoney(t.amount,t.currency||'ILS',t.amount%1?2:0):money(t.amount,t.currency||'ILS',t.amount%1?2:0)} · ${dateLabel(t.date)}${t.category&&t.description?' · '+t.category:''}`,run:()=>{closeDialog();openEntity('transaction',t);}})):[];
  return [...items,...found,...(query&&(items.length||found.length)?rest.slice(0,4):rest)].slice(0,10);
}
function refreshPalette(){
  const el=document.querySelector('#palette-results');if(!el)return;
  paletteState.items=paletteItems(paletteState.query);
  paletteState.index=Math.min(paletteState.index,Math.max(0,paletteState.items.length-1));
  el.innerHTML=paletteState.items.length?paletteState.items.map((it,i)=>`<button type="button" class="palette-item ${i===paletteState.index?'active':''} ${it.accent?'accent':''}" role="option" aria-selected="${i===paletteState.index}" data-action="palette-run:${i}">${icon(it.icon,18)}<span><b>${e(it.title)}</b>${it.sub?`<small>${e(it.sub)}</small>`:''}</span>${i===paletteState.index?icon('CornerDownLeft',15):''}</button>`).join(''):`<p class="muted palette-empty">לא נמצאה פעולה. נסה לכתוב סכום ותיאור, למשל ״דלק 300״.</p>`;
  el.querySelector('.active')?.scrollIntoView({block:'nearest'});
}
function togglePrivacy(){
  const on=!document.documentElement.classList.contains('privacy');
  document.documentElement.classList.toggle('privacy',on);
  try{localStorage.setItem('ofek-privacy',on?'1':'');}catch{}
  render();toast(on?'מצב פרטיות פעיל — הסכומים מוסתרים. מעבר עם העכבר חושף אותם.':'הסכומים מוצגים שוב');
}
function afterRender(){
  const log=document.querySelector('#ai-log');if(log)log.scrollTop=log.scrollHeight;
  const box=document.querySelector('#ai-input');if(box)autosize(box);
  motionAfterRender();
}

// ---------- Events ----------
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,a]=button.dataset.action.split(':');
  try{
    if(action==='palette')openPalette();
    else if(action==='palette-run')paletteState.items[+a]?.run();
    else if(action==='privacy')togglePrivacy();
    else if(action==='ai-prompt'){if(aiPrompts[a])sendCopilot(aiPrompts[a],[]);}
    else if(action==='ai-send'){const box=document.querySelector('#ai-input');sendCopilot(box?.value||'');}
    else if(action==='ai-stop'){copilot.abort?.abort();for(const p of copilot.pending.values())p.resolve({approved:false});copilot.pending.clear();}
    else if(action==='ai-attach'){if(!aiReady()){navigate('copilot');return;}if(ui.page!=='copilot')navigate('copilot');setTimeout(()=>document.querySelector('#ai-file')?.click());}
    else if(action==='ai-unattach'){copilot.attachments.splice(+a,1);document.querySelector('#ai-attachments').innerHTML=attachmentsHTML();}
    else if(action==='ai-approve')resolveProposal(a,true);
    else if(action==='ai-decline')resolveProposal(a,false);
    else if(action==='ai-retry'){const err=copilot.error;copilot.error=null;sendCopilot(err?.prompt||'',err?.files||[]);}
    else if(action==='ai-clear'){if(copilot.busy)return;copilot.messages=[];copilot.error=null;copilot.lastContext='';saveConversation();render();}
    else if(action==='ai-clear-history')confirm('מחיקת היסטוריית השיחה','השיחה עם Claude תימחק מהמכשיר. הנתונים הפיננסיים לא יושפעו.',()=>{copilot.messages=[];copilot.lastContext='';try{localStorage.removeItem(AI_CHAT_KEY);localStorage.removeItem(AI_LETTERS_KEY);}catch{}toast('היסטוריית השיחה נמחקה');render();},true);
    else if(action==='ai-disconnect')confirm('ניתוק Claude','מפתח ה־API יימחק מהמכשיר. אפשר להתחבר שוב בכל עת.',()=>{saveAiSettings({apiKey:''});toast('Claude נותק');render();},true);
    else if(action==='ai-reset-usage'){saveAiSettings({usage:{input:0,output:0,cost:0}});render();}
    else if(action==='ai-letter')writeLetter();
    else if(action==='ai-letter-stop')letterState.abort?.abort();
    else if(action==='ai-lab'){const s=labState();sendCopilot(`נתח את תוכנית העתיד שלי ממעבדת העתיד: סכום התחלתי ${money(+s.start)}, הפקדה חודשית ${money(+s.monthly)}, אופק ${s.years} שנים, תשואה צפויה ${s.ret}%, תנודתיות ${s.vol}%, אינפלציה ${s.inf}%, יעד ${money(+s.target)}. הרץ סימולציה, הסבר את הסיכויים ואת הסיכונים, והצע 2–3 שינויים שיגדילו את הסיכוי להגיע ליעד.`,[]);}
    else if(action==='lab-reset'){ui.lab=null;render();}
    else if(action==='lab-fire'){const avg=averageMonth(data,ui.month,3);labState().target=Math.round(fireNumber((avg.expenses||monthlySummary(data,ui.month).expenses)*12)||0);render();}
    else if(action==='voice')toggleVoice(a,button);
  }catch(err){toast(err.message,true);}
});
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(document.querySelector('.palette-modal'))closeDialog();else openPalette();return;}
  if(event.target.id==='palette-input'){
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const n=paletteState.items.length;if(n){paletteState.index=(paletteState.index+(event.key==='ArrowDown'?1:-1)+n)%n;refreshPalette();}}
    else if(event.key==='Enter'&&!event.isComposing){event.preventDefault();try{paletteState.items[paletteState.index]?.run();}catch(err){toast(err.message,true);}}
    return;
  }
  if(event.target.id==='ai-input'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();sendCopilot(event.target.value);}
});
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='palette-input'){paletteState.query=el.value;paletteState.index=0;refreshPalette();}
  else if(el.id==='ai-input'){copilot.draft=el.value;autosize(el);}
  else if(el.dataset.lab)updateLab(el);
  else if(el.name==='description'&&el.closest('#entity-form')&&dialogState?.kind==='transaction'&&dialogState.v.type!=='transfer'&&!dialogState.entity&&!dialogState.categoryTouched){
    const category=suggestCategory(data,el.value,dialogState.v.type),box=document.querySelector('#entity-form [name=category]');
    if(category&&box&&box.value!==category){box.value=category;dialogState.v.category=category;box.closest('.field')?.classList.add('ai-suggested');}
  }
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='ai-file'){addAttachments(el.files);el.value='';}
  else if(el.name==='category'&&el.closest('#entity-form')&&dialogState)dialogState.categoryTouched=true;
  else if(el.dataset.lab)updateLab(el);
});
document.addEventListener('submit',event=>{
  const form=event.target;
  try{
    if(form.id==='ai-key-form'||form.id==='ai-settings-form'){
      event.preventDefault();const f=new FormData(form),key=String(f.get('apiKey')||'').trim();
      if(form.id==='ai-key-form'&&!key)throw Error('יש להזין מפתח API.');
      if(key&&!/^sk-ant-/.test(key))toast('המפתח לא נראה כמו מפתח של Anthropic (sk-ant-…). נשמר בכל זאת.',true);
      saveAiSettings({...(key?{apiKey:key}:{}),model:f.get('model')||aiSettings().model,...(f.get('effort')?{effort:f.get('effort')}:{})});
      if(form.id==='ai-key-form'){toast('Claude מחובר! אפשר לשאול כל דבר.');render();setTimeout(()=>document.querySelector('#ai-input')?.focus());}else{toast('הגדרות ה־AI נשמרו');render();}
    }else if(form.id==='ai-quick-form'){event.preventDefault();const q=new FormData(form).get('q');if(String(q||'').trim())sendCopilot(q,[]);}
  }catch(err){toast(err.message,true);}
});
document.addEventListener('dragover',event=>{const zone=event.target.closest?.('[data-ai-drop]');if(zone&&event.dataTransfer?.types?.includes('Files')){event.preventDefault();zone.classList.add('dragging');}});
document.addEventListener('dragleave',event=>{const zone=event.target.closest?.('[data-ai-drop]');if(zone&&!zone.contains(event.relatedTarget))zone.classList.remove('dragging');});
document.addEventListener('drop',event=>{const zone=event.target.closest?.('[data-ai-drop]');if(!zone)return;event.preventDefault();zone.classList.remove('dragging');if(event.dataTransfer?.files?.length)addAttachments(event.dataTransfer.files);});
document.addEventListener('paste',event=>{if(event.target.id!=='ai-input')return;const files=[...(event.clipboardData?.files||[])];if(files.length){event.preventDefault();addAttachments(files);}});
