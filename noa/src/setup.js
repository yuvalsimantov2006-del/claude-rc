// נועה — the first run: a warm welcome and three small steps (her name, when you started, her birthday). Every
// step can be skipped, and "להציץ בדוגמה" loads the demo data instead. Shown full screen (a "bare" view) until he
// finishes or skips; settings can change everything later. Private helpers are prefixed "su".

const suState={step:0,values:null};
const SU_STEPS=3;
function setupNeeded(){const d=getData();return !store.loadError&&!d.demo&&!d.prefs?.setupDone&&isEmptyData(d)&&!d.profile?.together&&!d.profile?.herBirthday;}
function suValues(){if(!suState.values){const p=getData().profile;suState.values={her:p.her||'נועה',me:p.me||'',together:p.together||'',herBirthday:p.herBirthday||''};}return suState.values;}
function suDots(){return `<div class="su-dots" aria-label="שלב ${suState.step} מתוך ${SU_STEPS}">${Array.from({length:SU_STEPS},(_,i)=>`<span class="${i<suState.step?'on':''}${i===suState.step-1?' now':''}"></span>`).join('')}</div>`;}
function suStepHTML(){
  const v=suValues(),her=v.her.trim()||'נועה';
  const nav=(next='המשך')=>`<div class="su-actions">${button(next,'su-next',{variant:'primary',size:'big',full:true,type:'submit',iconEnd:'ChevronLeft'})}${button('דילוג','su-skip',{variant:'ghost',full:true})}</div>`;
  switch(suState.step){
    case 0:return `<div class="su-hero">${brandMark(84)}</div><h1 class="su-title">ברוך הבא 💛</h1><p class="su-lead">כאן תשמור את כל מה שחשוב לדעת עליה ולעשות בשבילה: מה היא אוהבת, תאריכים, מקומות, רעיונות למתנות וזיכרונות.</p>
      <ul class="su-points"><li>${icon('ShieldCheck',18)}<span>הכול נשאר רק בטלפון שלך. בלי חשבון ובלי שרתים.</span></li><li>${icon('BellRing',18)}<span>תזכורות לימי הולדת, ימי שנה ומה שחשוב לה.</span></li><li>${icon('Lock',18)}<span>אפשר לנעול בקוד — שההפתעות יישארו הפתעות.</span></li></ul>
      <div class="su-actions">${button('בוא נתחיל','su-next',{variant:'primary',size:'big',full:true,iconEnd:'ChevronLeft'})}${button('להציץ קודם בדוגמה','su-demo',{variant:'ghost',full:true,icon:'Sparkles'})}</div>`;
    case 1:return `${suDots()}<h1 class="su-title">איך קוראים לה?</h1><p class="su-lead">השם יופיע בכל האפליקציה — גם בשם שלה למעלה.</p>
      <form class="su-form" data-su-form><label class="field"><span class="field-label">השם שלה</span><input type="text" name="her" value="${esc(v.her)}" maxlength="40" autocomplete="off" required></label><label class="field"><span class="field-label">ואיך קוראים לך? <small>(לא חובה)</small></span><input type="text" name="me" value="${esc(v.me)}" maxlength="40" autocomplete="given-name"></label><small class="field-error" aria-live="polite"></small>${nav()}</form>`;
    case 2:return `${suDots()}<h1 class="su-title">מתי התחלתם?</h1><p class="su-lead">מהיום הזה אספור את הימים ביחד, את החודשיות ואת ימי השנה — ואזכיר לך לפני כל אחד.</p>
      <form class="su-form" data-su-form><label class="field"><span class="field-label">היום שבו הפכתם לזוג</span><input type="date" name="together" value="${esc(v.together)}" max="${todayISO()}"></label><small class="field-error" aria-live="polite"></small>${nav()}</form>`;
    case 3:return `${suDots()}<h1 class="su-title">מתי יום ההולדת של ${esc(her)}?</h1><p class="su-lead">אזכיר לך שבועיים, שבוע ויום לפני — ואראה לך את רעיונות המתנה שאספת.</p>
      <form class="su-form" data-su-form><label class="field"><span class="field-label">תאריך הלידה</span><input type="date" name="herBirthday" value="${esc(v.herBirthday)}" max="${todayISO()}"></label><small class="field-error" aria-live="polite"></small>${nav('סיום')}</form>`;
  }
  return '';
}
function setupView(){return `<div class="su-wrap"><section class="card su-card su-step-${suState.step}" aria-live="polite">${suStepHTML()}</section><p class="su-foot">${icon('Heart',13)} נשמר רק במכשיר שלך</p></div>`;}
function suRead(){const f=document.querySelector('[data-su-form]');if(!f)return true;const v=suValues();const err=f.querySelector('.field-error');
  for(const el of f.querySelectorAll('input[name]')){
    if(el.type==='date'){if(el.value&&!isIsoDate(el.value)){err.textContent='התאריך לא תקין';return false;}if(el.value&&el.value>todayISO()){err.textContent='התאריך הזה עוד לא הגיע';return false;}if(el.validity?.badInput){err.textContent='התאריך לא שלם';return false;}}
    v[el.name]=el.value.trim();
  }
  if(suState.step===1&&!v.her){err.textContent='צריך שם, אפילו כינוי 🙂';f.querySelector('[name=her]')?.focus();return false;}
  return true;}
function suFinish(){
  const v=suValues();
  update(d=>{d.profile={...d.profile,her:v.her.trim()||'נועה',me:v.me.trim(),together:v.together||null,herBirthday:v.herBirthday||null};d.prefs={...d.prefs,setupDone:true};},{undo:false,silent:true});
  suState.step=0;suState.values=null;
  go('home');
  toast(`הכול מוכן. ${v.her.trim()||'נועה'} בידיים טובות 💛`,{icon:'Heart'});
  setTimeout(()=>celebrate(document.querySelector('.home-hero')),300);
}
function suGo(step){suState.step=step;renderApp();setTimeout(()=>{const t=document.querySelector('.su-card input')||document.querySelector('.su-title');try{t?.focus({preventScroll:true});}catch{}},30);}
registerView({id:'setup',title:'ברוך הבא',icon:'Heart',nav:'none',bare:true,render:setupView});
if(typeof document!=='undefined'&&document.addEventListener){
  onAction('su-next',(a,el,event)=>{event?.preventDefault?.();if(!suRead())return;if(suState.step>=SU_STEPS)suFinish();else suGo(suState.step+1);});
  onAction('su-skip',()=>{if(suState.step>=SU_STEPS)suFinish();else suGo(suState.step+1);});
  onAction('su-demo',()=>{store.commit(demoData(todayISO()),{undo:null});suState.step=0;go('home');toast('אלה נתוני דוגמה — אפשר לנקות בלחיצה אחת',{icon:'Sparkles'});});
  // Enter in a step = continue.
  document.addEventListener('submit',event=>{if(!event.target.matches?.('[data-su-form]'))return;event.preventDefault();if(!suRead())return;if(suState.step>=SU_STEPS)suFinish();else suGo(suState.step+1);});
}
