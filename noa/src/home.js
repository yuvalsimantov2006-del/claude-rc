// נועה — the home screen. A frosted hero ("יחד כבר 642 ימים"), the next important day with a big countdown and the
// few after it, today's reminders, a gift nudge when an occasion is close, a small gesture for today, a starred fact
// to remember, "on this day" memories, milestones and the counts — then any cards the sections register
// (registerHomeCard). Useful with the foundation alone: each card hides itself when it has nothing to say.
// Private helpers are prefixed "hm".

const hmState={gestureSkip:0,factSkip:0,celebrated:false};
const HM_IMPORTANT=new Set(['birthday','anniversary','milestone','monthiversary','event','holiday','other']);

function hmGreeting(){
  const h=new Date().getHours();
  const part=h>=5&&h<12?'בוקר טוב':h>=12&&h<17?'צהריים טובים':h>=17&&h<21?'ערב טוב':'לילה טוב';
  const me=myName();return `${part}${me?`, ${me}`:''}`;
}
function hmUpcoming(d,today){return typeof upcoming==='function'?upcoming(d,today,400,{overdue:true}):[];}
function hmHebrew(iso){try{return typeof hebrewDate==='function'?hebrewDate(iso)||'':'';}catch{return '';}}
// Where an upcoming item leads when tapped.
function hmItemHref(it){
  const s=it.source||{};
  if(s.type==='date')return `#dates/date/${s.id}`;
  if(s.type==='plan')return `#plans/plan/${s.id}`;
  if(s.type==='person')return `#her/person/${s.id}`;
  if(s.type==='profile'&&s.id==='herBirthday')return '#her';
  return '#dates';
}
function hmDaysWord(n){return n===1?'יום':n===2?'יומיים':'ימים';}

// ---------- The hero: time together ----------
function hmHero(ctx){
  const d=ctx.data,p=d.profile,today=ctx.today;
  const dateLine=`${fmtDate(today,{weekday:true,year:false})}${hmHebrew(today)?` · ${hmHebrew(today)}`:''}`;
  const tb=p.together&&typeof togetherBreakdown==='function'?togetherBreakdown(p.together,today):null;
  const todayBig=hmUpcoming(d,today).find(it=>it.daysLeft===0&&(it.isHer||['anniversary','milestone','monthiversary'].includes(it.kind)));
  let main;
  if(tb){
    const n=tb.totalDays;
    main=`<p class="hero-kicker">${n===0?'היום הראשון שלכם':'יחד כבר'}</p><p class="hero-number"><b dir="ltr">${n.toLocaleString('he-IL')}</b><span>${hmDaysWord(n)}</span></p><p class="hero-line">${esc(n>0?tb.text:'מזל טוב!')}${n>0?` · מאז ${esc(fmtDate(p.together,{year:true}))}`:''}</p>`;
  }else{
    main=`<p class="hero-kicker">הסיפור שלכם</p><p class="hero-title">מתי הכול התחיל?</p><p class="hero-line">הוסף את התאריך שבו התחלתם — ואספור בשבילך את הימים, את החודשיות ואת ימי השנה.</p><div class="hero-actions">${button('הוספת התאריך','home-set-together',{icon:'CalendarHeart',variant:'hero-solid',size:'small'})}</div>`;
  }
  const celebrate=todayBig?`<div class="hero-today">${icon('PartyPopper',18)}<span><b>היום: ${esc(todayBig.title)}</b>${todayBig.subtitle?` · ${esc(todayBig.subtitle)}`:''}</span></div>`:'';
  return `<section class="card hero home-hero${todayBig?' celebrating':''}" aria-label="יחד">
    <div class="hero-glow" aria-hidden="true"></div>${hmHeartArt()}
    <div class="hero-top"><p class="hero-greet">${esc(hmGreeting())} 💛</p><p class="hero-date">${esc(dateLine)}</p></div>
    <div class="hero-main">${main}</div>${celebrate}</section>`;
}
// Two soft overlapping hearts floating in the hero (decoration).
function hmHeartArt(){
  const h='M24 41c-.6 0-1.2-.2-1.7-.6C14.6 34.7 6 28.2 6 19.4 6 13.6 10.5 9 16.2 9c3.2 0 6 1.5 7.8 4 1.8-2.5 4.6-4 7.8-4C37.5 9 42 13.6 42 19.4c0 8.8-8.6 15.3-16.3 21-.5.4-1.1.6-1.7.6z';
  return `<svg class="hero-hearts" viewBox="0 0 120 100" aria-hidden="true" focusable="false"><path class="h1" d="${h}" transform="translate(44 6) scale(1.5)"/><path class="h2" d="${h}" transform="translate(8 40) scale(.95)"/><path class="h3" d="${h}" transform="translate(88 58) scale(.55)"/></svg>`;
}

// ---------- Next up ----------
function hmNextUp(ctx){
  const d=ctx.data,list=hmUpcoming(d,ctx.today).filter(it=>!it.overdue);
  const main=list.find(it=>HM_IMPORTANT.has(it.kind));
  const overdue=hmUpcoming(d,ctx.today).filter(it=>it.overdue).slice(0,2);
  if(!main&&!list.length&&!overdue.length){
    if(d.profile.herBirthday||d.profile.together)return '';
    return card(emptyState({icon:'CalendarHeart',title:'מה התאריך הבא?',text:`הוסף את יום ההולדת של ${ctx.her} ותאריכים חשובים — ותמיד תדע מה מתקרב.`,compact:true,actions:button('הוספת יום הולדת','home-set-birthday',{icon:'Cake',variant:'primary',size:'small'})}),{cls:'next-card'});
  }
  const rest=list.filter(it=>it!==main).slice(0,4);
  const big=main?(()=>{
    const n=main.daysLeft,word=n===0?'היום':n===1?'מחר':'';
    const sub=[main.subtitle,fmtDate(main.date,{weekday:true,year:false})].filter(Boolean).join(' · ');
    return `<a class="next-main" href="${hmItemHref(main)}"><span class="next-count${word?' word':''}" aria-hidden="true">${word?`<b>${word}</b>`:`<small>עוד</small><b dir="ltr">${n}</b><small>${hmDaysWord(n)}</small>`}</span><span class="next-text"><span class="eyebrow">${icon(main.icon||'CalendarHeart',14)}הבא בתור</span><b>${esc(main.title)}</b><small>${esc(sub)}</small>${main.hebrew?`<small class="hebrew">${esc(main.hebrew)}</small>`:''}<span class="visually-hidden">${esc(countdownChipText(n))}</span></span></a>`;
  })():'';
  const row=it=>listRow({id:it.key,icon:it.icon||'CalendarDays',tone:it.kind==='task'||it.kind==='plan'?'3':it.isHer||it.kind==='birthday'?'1':'2',title:it.title,sub:[it.subtitle,fmtDate(it.date,{year:false})].filter(Boolean).join(' · '),meta:countdownChip(it.daysLeft,it.overdue?{text:'באיחור'}:{}),href:hmItemHref(it)});
  const rows=[...overdue,...rest].map(row);
  return card(`${big}${rows.length?listOf(rows,{cls:'next-list'}):''}`,{title:main?'':'מה מתקרב',cls:'next-card',attrs:'aria-label="מה מתקרב"'})+'';
}
function countdownChipText(n){return typeof countdownText==='function'?countdownText(n):fmtRelative(n);}

// ---------- Today's reminders ----------
function hmReminders(ctx){
  const due=typeof dueReminders==='function'?dueReminders(ctx.data,ctx.today).filter(it=>it.daysLeft>0):[];
  if(!due.length)return '';
  return `<div class="reminder-strip">${iconTile('BellRing','1',18)}<span><b>תזכורת</b><small>${due.slice(0,3).map(it=>esc(it.text)).join(' · ')}</small></span>${button('לתאריכים','',{href:'#dates',size:'small',variant:'soft'})}</div>`;
}

// ---------- Gift nudge ----------
// When an occasion (her birthday, an anniversary, a holiday, an event) is ≤ 30 days away and no gift is bought for it.
function hmOccasionWords(it){
  if(it.isHer||it.kind==='birthday')return ['יום הולדת','יומולדת','יום ההולדת'];
  if(it.kind==='anniversary')return ['שנה','יום נישואין','יום השנה','שנה ביחד'];
  if(it.kind==='holiday')return [it.title];
  return [it.title];
}
function hmGiftMatches(gifts,it){
  const words=hmOccasionWords(it).map(w=>typeof normalize==='function'?normalize(w):w);
  const norm=s=>typeof normalize==='function'?normalize(s||''):String(s||'');
  return gifts.filter(g=>{if(it.source?.type==='date'&&g.occasion===it.source.id)return true;const o=norm(g.occasion);return o&&words.some(w=>o.includes(w)||w.includes(o));});
}
function hmGiftNudge(ctx){
  const d=ctx.data;
  const soon=hmUpcoming(d,ctx.today).filter(it=>it.daysLeft>=0&&it.daysLeft<=30&&(it.isHer||['anniversary','holiday'].includes(it.kind)||(it.kind==='birthday'&&it.source?.type!=='person')||(it.kind==='event'&&hmGiftMatches(d.gifts,it).length)));
  for(const it of soon){
    const matches=hmGiftMatches(d.gifts,it);
    if(matches.some(g=>g.status==='bought'))continue;
    const ideas=matches.filter(g=>g.status==='idea').slice(0,3);
    const fallback=!ideas.length?d.gifts.filter(g=>g.status==='idea').slice(0,2):[];
    const list=(ideas.length?ideas:fallback);
    const rows=list.map(g=>listRow({id:g.id,icon:'Lightbulb',tone:'2',title:g.title,sub:[g.price?`₪${g.price.toLocaleString('he-IL')}`:'',g.whereToBuy].filter(Boolean).join(' · '),href:`#gifts/gift/${g.id}`}));
    return card(`<p class="card-lead">${esc(it.title)} ${esc(countdownChipText(it.daysLeft))}${ideas.length?' — והנה מה שכבר חשבת עליו:':list.length?'. אולי אחד מהרעיונות שלך?':'. עוד אין רעיון — בוא נרשום אחד.'}</p>${rows.length?listOf(rows):''}<div class="card-actions">${button('רעיון למתנה','home-add-gift',{icon:'Plus',variant:'primary',size:'small'})}${d.gifts.length?button('כל הרעיונות','',{href:'#gifts',size:'small',variant:'ghost',iconEnd:'ChevronLeft'}):''}</div>`,
      {title:'יש לך רעיון למתנה?',icon:'Gift',tone:'2',cls:'gift-nudge'});
  }
  return '';
}

// ---------- A small gesture for today ----------
function hmGestureList(){
  if(typeof GESTURES!=='undefined'&&Array.isArray(GESTURES))return GESTURES;
  if(typeof SMALL_GESTURES!=='undefined'&&Array.isArray(SMALL_GESTURES))return SMALL_GESTURES;
  return [];
}
function hmPick(list,key){
  if(!list.length)return null;
  if(typeof pickDaily==='function'){try{const r=pickDaily(list,key);if(r)return r;}catch{}}
  let h=0;for(const ch of String(key))h=(h*31+ch.charCodeAt(0))>>>0;return list[h%list.length];
}
function hmGesture(ctx){
  const all=hmGestureList();if(!all.length)return '';
  const done=ctx.data.gestures?.done||{};
  const fresh=all.filter(g=>!done[g.id]);const pool=fresh.length?fresh:all;
  const g=hmPick(pool,`${ctx.today}#${hmState.gestureSkip}`);if(!g)return '';
  const doneToday=done[g.id]===ctx.today;
  const effort=g.effort?`<span class="effort" aria-label="מאמץ ${g.effort} מתוך 3">${'●'.repeat(g.effort)}<i>${'●'.repeat(3-g.effort)}</i></span>`:'';
  return card(`<p class="gesture-text">${esc(g.text||g.title)}</p><div class="card-actions">${doneToday?badge('עשית את זה היום 💛','love'):button('עשיתי','gesture-done:'+g.id,{icon:'Check',variant:'primary',size:'small'})}${button('רעיון אחר','gesture-next',{icon:'Shuffle',size:'small',variant:'ghost'})}${effort}</div>`,
    {title:'רעיון קטן להיום',icon:'Sparkles',tone:'1',cls:'gesture-card'});
}

// ---------- Did you remember? ----------
function hmRemember(ctx){
  const starred=(ctx.data.facts||[]).filter(f=>f.starred&&f.title);
  if(!starred.length)return '';
  const f=hmPick(starred,`fact-${ctx.today}#${hmState.factSkip}`);
  const s=typeof SENTIMENTS!=='undefined'?SENTIMENTS.find(x=>x.id===f.sentiment):null;
  const cat=typeof FACT_CATEGORIES!=='undefined'?FACT_CATEGORIES.find(c=>c.id===f.category):null;
  const line=f.sentiment==='never'||f.sentiment==='dislike'?`${ctx.her} לא אוהבת`:f.sentiment==='love'?`${ctx.her} אוהבת`:'';
  return card(`<a class="remember" href="#her/fact/${esc(f.id)}"><span class="remember-emoji" aria-hidden="true">${esc(s?.emoji||'💭')}</span><span><small>${esc(line||cat?.label||'')}</small><b>${esc(f.title)}</b>${f.details?`<span class="remember-details">${esc(f.details)}</span>`:''}</span></a>${starred.length>1?`<div class="card-actions">${button('עוד אחד','fact-next',{icon:'Shuffle',size:'small',variant:'ghost'})}</div>`:''}`,
    {title:'זוכר?',icon:'Lightbulb',tone:'3',cls:'remember-card'});
}

// ---------- On this day ----------
function hmOnThisDay(ctx){
  const md=ctx.today.slice(5),y=Number(ctx.today.slice(0,4));
  const leapFix=md==='02-28'&&!(y%4===0&&(y%100!==0||y%400===0));
  const hits=(ctx.data.memories||[]).filter(m=>m.date<ctx.today&&(m.date.slice(5)===md||(leapFix&&m.date.slice(5)==='02-29'))).sort((a,b)=>b.date.localeCompare(a.date));
  if(!hits.length)return '';
  const m=hits[0],years=y-Number(m.date.slice(0,4));
  const when=years===1?'לפני שנה בדיוק':years===2?'לפני שנתיים בדיוק':`לפני ${years} שנים בדיוק`;
  const thumb=m.photos?.length?`<span class="otd-photo">${photoImg(m.photos[0],{size:'thumb',alt:''})}</span>`:`<span class="otd-mood" aria-hidden="true">${esc(m.mood||'💛')}</span>`;
  return card(`<a class="otd" href="#memories/memory/${esc(m.id)}">${thumb}<span><small>${esc(when)} · ${esc(fmtDate(m.date,{year:true}))}</small><b>${esc(m.title||'זיכרון')}</b>${m.text?`<span class="otd-text">${esc(m.text)}</span>`:''}</span></a>${hits.length>1?`<p class="card-note subtle">ועוד ${hits.length-1} זיכרונות מהיום הזה.</p>`:''}`,
    {title:'ביום הזה',icon:'History',tone:'1',cls:'otd-card'});
}

// ---------- Milestones ----------
function hmMilestones(ctx){
  const p=ctx.data.profile;if(!p.together||typeof milestones!=='function')return '';
  const ms=milestones(p.together,ctx.today,400).filter(m=>m.daysLeft>0).slice(0,3);
  if(!ms.length)return '';
  const rows=ms.map(m=>listRow({id:m.key,icon:m.kind==='anniversary'?'Heart':m.kind==='monthiversary'?'CalendarHeart':'Sparkles',tone:m.kind==='anniversary'?'1':'2',title:m.title,sub:fmtDate(m.date,{weekday:true}),meta:countdownChip(m.daysLeft)}));
  return card(listOf(rows),{title:'אבני דרך',sub:'נספרות לבד מהתאריך שבו התחלתם',icon:'Sparkles',tone:'2',cls:'milestones-card'});
}

// ---------- Counts ----------
function hmStats(ctx){
  const c=counts(ctx.data);
  const tiles=[{icon:'Heart',value:c.facts,label:'דברים עליה',tone:'1',href:'#her'},{icon:'MapPin',value:c.places,label:'מקומות',tone:'2',href:'#places'},{icon:'BookHeart',value:c.memories,label:'זיכרונות',tone:'3',href:'#memories'},{icon:'Gift',value:c.giftIdeas,label:'רעיונות למתנה',tone:'1',href:'#gifts'}];
  return `<div class="stats-row" aria-label="במספרים">${tiles.map(statTile).join('')}</div>`;
}

// ---------- Start here (nothing saved yet) ----------
function hmStartHere(ctx){
  if(!isEmptyData(ctx.data)||ctx.data.demo)return '';
  const her=ctx.her;
  const a=(ic,tone,title,sub,action)=>`<button type="button" class="start-item" data-action="${action}">${iconTile(ic,tone,22)}<span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${icon('ChevronLeft',18)}</button>`;
  return card(`<div class="start-list">${a('Heart','1',`משהו על ${her}`,'מה היא אוהבת, מה לא, מה היא אמרה','quick:fact')}${a('MapPin','2','מקום שהיא אוהבת','מסעדה, חוף, בית קפה','quick:place')}${a('CalendarHeart','3','תאריך חשוב','ימי הולדת, אירועים, ימי שנה','quick:date')}${a('Gift','1','רעיון למתנה','"היא אמרה שהיא רוצה…"','quick:gift')}</div><p class="card-note subtle center">רוצה לראות קודם איך זה נראה? ${button('טעינת נתוני דוגמה','demo-load',{variant:'ghost',size:'small',icon:'Sparkles'})}</p>`,
    {title:'מאיפה מתחילים?',sub:'כמה דברים קטנים — ומהר מאוד יהיה לך כאן הכול.',icon:'Sparkles',tone:'grad',cls:'start-card'});
}

// ---------- The view ----------
registerHomeCard({id:'hero',order:10,size:'full',render:hmHero,fixed:true});
registerHomeCard({id:'start',order:12,size:'full',render:hmStartHere,fixed:true});
registerHomeCard({id:'reminders',order:15,size:'full',render:hmReminders});
registerHomeCard({id:'next',order:20,size:'full',render:hmNextUp,label:'מה מתקרב'});
registerHomeCard({id:'onthisday',order:25,size:'half',render:hmOnThisDay,label:'ביום הזה'});
registerHomeCard({id:'gift',order:30,size:'half',render:hmGiftNudge,label:'תזכורת מתנה'});
registerHomeCard({id:'gesture',order:40,size:'half',render:hmGesture,label:'רעיון קטן להיום'});
registerHomeCard({id:'remember',order:50,size:'half',render:hmRemember,label:'זוכר?'});
registerHomeCard({id:'stats',order:60,size:'full',render:hmStats,label:'במספרים'});
registerHomeCard({id:'milestones',order:70,size:'half',render:hmMilestones,label:'אבני דרך'});
registerHomeCard({id:'backup',order:95,size:'full',render:()=>typeof backupReminderCard==='function'?backupReminderCard():'',fixed:true});

function homeView(ctx){
  const hidden=new Set(ctx.data.prefs?.homeHidden||[]);
  const parts=[];
  for(const c of homeCards()){
    if(hidden.has(c.id)&&!c.fixed)continue;
    let html='';try{html=c.render(ctx)||'';}catch(err){try{console.error(`home card ${c.id}:`,err);}catch{}}
    if(html)parts.push(`<div class="home-slot ${c.size==='half'?'half':'full'}" data-card="${esc(c.id)}">${html}</div>`);
  }
  return `<div class="home-grid">${parts.join('')}</div>`;
}
registerView({id:'home',title:'בית',icon:'House',nav:'tab',order:10,hideHead:true,render:homeView,
  afterRender(main,ctx){
    // A milestone, an anniversary or her birthday today: a little confetti, once a day.
    if(main.querySelector('.home-hero.celebrating')){
      let seen='';try{seen=localStorage.getItem('noa-celebrated')||'';}catch{}
      if(seen!==ctx.today){try{localStorage.setItem('noa-celebrated',ctx.today);}catch{}setTimeout(()=>celebrate(main.querySelector('.home-hero')),350);}
    }
  }});

// ---------- Home actions ----------
if(typeof document!=='undefined'&&document.addEventListener){
  onAction('gesture-done',(id,el)=>{
    update(d=>{d.gestures=d.gestures||{done:{}};d.gestures.done={...(d.gestures.done||{}),[id]:todayISO()};},{undo:false,silent:true});
    toast('איזה יופי 💛 עוד נקודה בשבילכם',{icon:'Heart'});
    celebrate(document.querySelector('.gesture-card')||el,{count:18});
  });
  onAction('gesture-next',()=>{hmState.gestureSkip++;renderApp();});
  onAction('fact-next',()=>{hmState.factSkip++;renderApp();});
  onAction('quick',id=>{const q=quickAdds().find(x=>x.id===id);if(q)runAction(q.run);});
  onAction('home-add-gift',()=>{const q=quickAdds().find(x=>x.id==='gift');if(q)runAction(q.run);});
  onAction('home-set-together',()=>openForm({title:'מתי התחלתם?',intro:'היום שבו הפכתם לזוג — ממנו נספרים הימים, החודשיות וימי השנה.',
    fields:[{name:'together',label:'התאריך',type:'date',required:true,max:todayISO()}],values:{together:getData().profile.together},submitLabel:'שמירה',
    onSubmit:v=>{setProfile({together:v.together},{message:'שמרתי 💛'});}}));
  onAction('home-set-birthday',()=>openForm({title:`יום ההולדת של ${herName()}`,
    fields:[{name:'herBirthday',label:'תאריך הלידה',type:'date',required:true,max:todayISO(),quickToday:false,hint:'השנה עוזרת לדעת בת כמה היא תהיה.'}],values:{herBirthday:getData().profile.herBirthday},
    onSubmit:v=>{setProfile({herBirthday:v.herBirthday},{message:'שמרתי 🎂'});}}));
}
