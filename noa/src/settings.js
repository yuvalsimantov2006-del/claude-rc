// נועה — settings: her and your details, the look (theme + colours), reminders (the .ics calendar file, in-app and
// system notifications, built-in holidays), which home cards show, privacy & lock, backup, and "about". Sections
// can add their own cards with registerSettingsCard(). Private helpers are prefixed "st".

const ST_NOTIFIED_KEY='noa-notified';
function stProfileCard(ctx){
  const p=ctx.data.profile;
  const rows=[['השם שלה',p.her||'נועה'],['השם שלך',p.me||'—'],['יחד מאז',p.together?fmtDate(p.together,{year:true}):'—'],['יום ההולדת שלה',p.herBirthday?fmtDate(p.herBirthday,{year:true}):'—']];
  return card(`${infoRows(rows,{cls:'profile-rows'})}<div class="card-actions">${button('עריכה','settings-profile',{icon:'Pencil',variant:'primary'})}</div>`,
    {title:'הפרטים',sub:'השם שלה הוא גם השם של האפליקציה.',icon:'Heart',tone:'1',id:'profile'});
}
function stLookCard(){
  return card(`<div class="look-theme"><span class="field-label">מראה</span>${themeSegmented()}</div><span class="field-label">צבעים</span>${paletteGrid()}<p class="card-note subtle">${icon('Smartphone',14)} המראה והצבעים נשמרים רק במכשיר הזה.</p>`,
    {title:'מראה וצבעים',sub:'שלושה צבעים שהולכים יחד, בבהיר או בכהה.',icon:'Palette',tone:'2',cls:'look-card',id:'look'});
}
function stNotifyState(){if(typeof Notification==='undefined')return 'unsupported';return Notification.permission;}
function stRemindCard(ctx){
  const pr=ctx.data.prefs,perm=stNotifyState();
  const permRow=perm==='granted'?`<p class="card-note">${icon('BellRing',15)} התראות פעילות: כשהאפליקציה נפתחת, תזכורת של היום תופיע גם כהתראה.</p>`
    :perm==='unsupported'?`<p class="card-note subtle">${icon('Info',14)} הדפדפן הזה לא תומך בהתראות. קובץ היומן עדיין עובד.</p>`
    :`<div class="action-row"><span><b>התראות בטלפון</b><small>${perm==='denied'?'ההתראות חסומות בהגדרות הדפדפן.':'כשהאפליקציה נפתחת ויש תזכורת להיום.'}</small></span>${perm==='denied'?'':button('הפעלה','notify-ask',{size:'small',icon:'Bell'})}</div>`;
  const hours=Array.from({length:24},(_,h)=>`<option value="${h}"${pr.notifyHour===h?' selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('');
  const body=`<div class="ics-box">${iconTile('CalendarDays','grad',22)}<div><b>ייצוא ליומן של הטלפון</b><p>קובץ אחד עם כל התאריכים והתזכורות. מוסיפים אותו ליומן Google או Samsung — והטלפון יזכיר לך גם כשהאפליקציה סגורה.</p>${button('הורדת קובץ היומן (.ics)','export-ics',{icon:'Download',variant:'primary',size:'small'})}</div></div>
    <div class="setting-rows divided">${permRow}
    <label class="select-row"><span><b>שעת התזכורת</b><small>באיזו שעה ביום התזכורות קופצות ביומן</small></span><select data-change="notify-hour" aria-label="שעת התזכורת">${hours}</select></label>
    <label class="switch-row"><span><b>חגים וימים מיוחדים</b><small>ט״ו באב, ולנטיין, ראש השנה, חנוכה, פסח ועוד — בתאריכים ובבית.</small></span><input type="checkbox" class="switch" data-change="pref-holidays" ${pr.holidays!==false?'checked':''}></label></div>`;
  return card(body,{title:'תזכורות',sub:'כדי שאף תאריך חשוב לא יפתיע אותך.',icon:'BellRing',tone:'3',id:'reminders'});
}
function stHomeCard(ctx){
  const hidden=new Set(ctx.data.prefs.homeHidden||[]);
  const list=homeCards().filter(c=>!c.fixed&&c.label);
  if(!list.length)return '';
  return card(`<div class="setting-rows">${list.map(c=>`<label class="switch-row"><span><b>${esc(c.label)}</b></span><input type="checkbox" class="switch" data-change="home-card:${esc(c.id)}" ${hidden.has(c.id)?'':'checked'}></label>`).join('')}</div>`,
    {title:'מה מופיע בבית',icon:'LayoutGrid',tone:'1',id:'home-cards'});
}
function stAboutCard(){
  const v=typeof NOA_VERSION!=='undefined'?NOA_VERSION:'';
  return card(`<p class="card-lead">אפליקציה פרטית, רק שלך. אין חשבון, אין שרת ואין מעקב: הכול נשמר בדפדפן של הטלפון הזה (והתמונות באחסון שלו). קישורים למפות או לאתרים נפתחים רק כשאתה לוחץ עליהם.</p>
    <div class="card-actions">${button('התקנה למסך הבית','install-app',{icon:'Smartphone',size:'small',variant:'soft',cls:'install-btn'})}${button('גלריית רכיבים','',{href:'#gallery',size:'small',variant:'ghost'})}</div>
    <p class="card-note subtle">גרסה ${esc(v)} · אייקונים: Lucide (ISC) · גופן עברי: SIL OFL</p>`,{title:'על האפליקציה',icon:'Info',tone:'2',id:'about'});
}
registerSettingsCard({id:'profile',order:10,render:stProfileCard});
registerSettingsCard({id:'look',order:20,render:stLookCard});
registerSettingsCard({id:'reminders',order:30,render:stRemindCard});
registerSettingsCard({id:'home',order:40,render:stHomeCard});
registerSettingsCard({id:'lock',order:50,render:()=>lockCard()});
registerSettingsCard({id:'backup',order:60,render:()=>backupCard()});
registerSettingsCard({id:'about',order:990,render:stAboutCard});
function settingsView(ctx){
  return `<div class="settings-grid">${settingsCards().map(c=>{let h='';try{h=c.render(ctx)||'';}catch(err){try{console.error(err);}catch{}}return h?`<div class="settings-slot" data-card="${esc(c.id)}">${h}</div>`:'';}).join('')}</div>`;
}
registerView({id:'settings',title:'הגדרות',icon:'Settings',nav:'more',order:900,subtitle:'הפרטים, המראה, התזכורות, הפרטיות והגיבוי.',render:settingsView,
  afterRender(main,ctx){if(typeof bkCheckStorage==='function'&&!stSettingsChecked){stSettingsChecked=true;bkCheckStorage();}
    const sec=ctx.params[0];if(sec){const el=main.querySelector(`#${CSS.escape(sec)}`);if(el)setTimeout(()=>el.scrollIntoView({block:'start',behavior:'smooth'}),60);}},
  openItem(){}});
let stSettingsChecked=false;

// ---------- Notifications ----------
// At start (and when he grants permission): today's reminders as system notifications, once per item per day.
function notifyDue(){
  if(stNotifyState()!=='granted'||typeof dueReminders!=='function')return;
  const today=todayISO(),items=dueReminders(getData(),today);
  let shown={};try{shown=JSON.parse(localStorage.getItem(ST_NOTIFIED_KEY)||'{}')||{};}catch{}
  for(const k of Object.keys(shown))if(shown[k]!==today)delete shown[k];
  for(const it of items){
    const key=`${it.key}:${it.daysLeft}`;if(shown[key]===today)continue;
    const body=it.daysLeft===0?`היום: ${it.title}`:`${countdownText(it.daysLeft)}: ${it.title}`;
    const opts={body,tag:key,dir:'rtl',lang:'he',icon:'icons/icon-192.png',badge:'icons/badge-96.png',data:{url:'./#dates'}};
    try{
      if(navigator.serviceWorker?.controller)navigator.serviceWorker.ready.then(r=>r.showNotification(herName(),opts)).catch(()=>{});
      else new Notification(herName(),opts);
      shown[key]=today;
    }catch{}
  }
  try{localStorage.setItem(ST_NOTIFIED_KEY,JSON.stringify(shown));}catch{}
}
// The install prompt (Chrome on Android): kept until he taps "התקנה".
let stInstallEvent=null;
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();stInstallEvent=e;document.documentElement.classList.add('can-install');});
  window.addEventListener('appinstalled',()=>{stInstallEvent=null;document.documentElement.classList.remove('can-install');toast('הותקן למסך הבית 💛');});
}

if(typeof document!=='undefined'&&document.addEventListener){
  onAction('settings-profile',()=>{
    const p=getData().profile;
    openForm({title:'הפרטים',fields:[
      {name:'her',label:'השם שלה',required:true,maxLength:40,autofocus:false},
      {name:'me',label:'השם שלך',maxLength:40,hint:'לא חובה — בשביל "בוקר טוב, …"'},
      {name:'together',label:'יחד מאז',type:'date',max:todayISO(),hint:'היום שבו הפכתם לזוג'},
      {name:'herBirthday',label:'יום ההולדת שלה',type:'date',max:todayISO(),quickToday:false}],
      values:p,onSubmit:v=>{setProfile({her:v.her,me:v.me,together:v.together,herBirthday:v.herBirthday},{message:'הפרטים נשמרו'});}});
  });
  onChange('notify-hour',v=>{setPrefs({notifyHour:Number(v)});toast('נשמר. בקובץ היומן הבא התזכורות יקפצו בשעה הזו.');});
  onChange('pref-holidays',on=>{setPrefs({holidays:!!on});toast(on?'החגים יופיעו בתאריכים':'החגים הוסתרו');});
  onChange('home-card',(on,el,event,id)=>{const cur=new Set(getData().prefs.homeHidden||[]);if(on)cur.delete(id);else cur.add(id);setPrefs({homeHidden:[...cur]});});
  onAction('notify-ask',async()=>{
    if(typeof Notification==='undefined')return;
    const r=await Notification.requestPermission();
    toast(r==='granted'?'התראות הופעלו 🔔':'ההתראות לא אושרו. אפשר לשנות בהגדרות הדפדפן.',{error:r!=='granted'});
    if(r==='granted')notifyDue();
    renderApp();
  });
  onAction('export-ics',()=>{
    if(typeof buildICS!=='function'){toast('ייצוא היומן עוד לא זמין.',{error:true});return;}
    const d=getData(),text=buildICS(d,{alarmHour:d.prefs.notifyHour});
    const n=typeof icsEventCount==='function'?icsEventCount(text):0;
    downloadFile(typeof icsFileName==='function'?icsFileName(todayISO()):`noa-${todayISO()}.ics`,text,'text/calendar');
    toast(n?`קובץ היומן ירד (${n} תאריכים). פתח אותו כדי להוסיף ליומן.`:'קובץ היומן ירד.',{icon:'CalendarDays'});
  });
  onAction('install-app',async()=>{
    if(stInstallEvent){stInstallEvent.prompt();try{await stInstallEvent.userChoice;}catch{}stInstallEvent=null;return;}
    toast('בכרום: תפריט ⋮ ← "הוספה למסך הבית" (או "התקנת אפליקציה").',{icon:'Smartphone',ms:7000});
  });
}
