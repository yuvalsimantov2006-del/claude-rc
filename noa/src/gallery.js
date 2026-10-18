// נועה — #gallery: every shared component in its states, for the section lanes (and for screenshots). Hidden from the
// navigation; reachable from settings → "גלריית רכיבים". Nothing here touches the data. Private helpers: "gl".

function glBlock(title,html,note=''){return `<section class="gl-block"><h2 class="gl-title">${esc(title)}</h2>${note?`<p class="gl-note">${esc(note)}</p>`:''}<div class="gl-demo">${html}</div></section>`;}
const GL_FORM_FIELDS=[
  {name:'title',label:'טקסט (חובה)',required:true,placeholder:'למשל: סושי'},
  {name:'price',label:'מחיר (חצי שורה)',type:'price',min:0,half:true},
  {name:'date',label:'תאריך (חצי שורה)',type:'date',half:true},
  {name:'kind',label:'בחירה מרשימה',type:'select',options:[{id:'a',label:'מסעדה'},{id:'b',label:'בית קפה'}]},
  {name:'sentiment',label:'צ׳יפים — בחירה אחת',type:'chips',options:[{id:'love',label:'אוהבת',emoji:'❤️'},{id:'like',label:'מחבבת',emoji:'👍'},{id:'neutral',label:'ככה־ככה',emoji:'😐'},{id:'dislike',label:'לא אוהבת',emoji:'👎'},{id:'never',label:'בשום אופן',emoji:'🚫'}]},
  {name:'remind',label:'צ׳יפים — כמה',type:'multichips',options:[{id:'1',label:'יום לפני'},{id:'7',label:'שבוע'},{id:'30',label:'חודש'}],numeric:true},
  {name:'rating',label:'דירוג',type:'stars'},
  {name:'mood',label:'אימוג׳י',type:'emoji',options:['🥰','😂','🌅','✨'].map(e=>({id:e,label:e,emoji:e}))},
  {name:'yearly',label:'מתג',type:'switch',sub:'עם שורת הסבר'},
  {name:'tags',label:'תגיות',type:'tags'},
  {name:'notes',label:'טקסט ארוך',type:'textarea',rows:2,hint:'רמז קטן מתחת לשדה'},
  {name:'photos',label:'תמונות',type:'photos'}
];
function galleryView(){
  const tones=['accent','tone-2','tone-3','love','positive','warning','negative','neutral'];
  const blocks=[
    glBlock('כפתורים',`<div class="gl-row">${button('ראשי','gl-toast',{variant:'primary',icon:'Heart'})}${button('רגיל','gl-toast')}${button('רך','gl-toast',{variant:'soft',icon:'Sparkles'})}${button('שקוף','gl-toast',{variant:'ghost'})}${button('מחיקה','gl-toast',{variant:'danger',icon:'Trash2'})}${button('מחיקה מלאה','gl-toast',{variant:'danger-solid'})}${button('מושבת','',{disabled:true})}</div>
      <div class="gl-row">${button('קטן','gl-toast',{size:'small',variant:'primary'})}${button('קטן','gl-toast',{size:'small'})}${button('גדול','gl-toast',{size:'big',variant:'primary',iconEnd:'ChevronLeft'})}${button('קישור','',{href:'#home',variant:'soft',icon:'House'})}</div>
      <div class="gl-row">${iconButton('Pencil','עריכה','gl-toast')}${iconButton('Trash2','מחיקה','gl-toast',{variant:'soft'})}${iconButton('Share2','שיתוף','gl-toast',{variant:'outline'})}${heartButton('gallery','x',false)}${heartButton('gallery','y',true)}</div>`,'button(label, action, {variant, size, icon}) · iconButton · heartButton(list, id, on)'),
    glBlock('תגיות וצ׳יפים',`<div class="gl-row">${tones.map(t=>badge(t,t)).join('')}${badge('עם אייקון','positive',{icon:'Check'})}</div>
      ${chipRow([chip('הכול',{active:true,count:12}),chip('אוהבת',{emoji:'❤️',count:5}),chip('לא אוהבת',{emoji:'👎'}),chip('מועדפים',{icon:'Heart'}),chip('עוד צ׳יפ'),chip('ועוד אחד ארוך במיוחד')])}
      ${filterChips([{id:'a',label:'היא אוהבת'},{id:'b',label:'אני אוהב'},{id:'c',label:'שנינו'},{id:'d',label:'רוצים לנסות'}],'c','gl-toast')}
      <div class="gl-row">${segmented([{id:'list',label:'רשימה',icon:'List'},{id:'cal',label:'לוח שנה',icon:'CalendarDays'}],'list','gl-toast')}</div>
      ${segmented([{id:'1',label:'רעיונות',count:4},{id:'2',label:'נקנו',count:1},{id:'3',label:'ניתנו'}],'2','gl-toast',{full:true})}
      ${subTabs([{id:'a',label:'עובדות',icon:'Heart',href:'#gallery'},{id:'b',label:'המידות שלה',icon:'Ruler',href:'#gallery'},{id:'c',label:'אנשים',icon:'Users',href:'#gallery',count:6}],'a')}`,'badge(text, tone) · chip(label, {active, emoji, icon, count}) · chipRow · filterChips · segmented · subTabs'),
    glBlock('כרטיסים',`<div class="gl-cards">${card('<p class="card-lead">כרטיס זכוכית רגיל עם כותרת, אייקון ופעולה.</p>',{title:'כותרת',sub:'שורת משנה',icon:'Gift',tone:'2',actions:iconButton('Ellipsis','עוד','gl-toast')})}${card(`<p class="hero-kicker">כרטיס ראשי</p><p class="hero-number"><b dir="ltr">642</b><span>ימים</span></p><p class="hero-line">על הגרדיאנט של הפלטה</p>`,{hero:true})}${card(emptyState({icon:'MapPin',title:'עוד אין כאן מקומות',text:'מצב ריק ידידותי, עם פעולה אחת ברורה.',actions:button('הוספת מקום','gl-toast',{icon:'Plus',variant:'primary'})}))}</div>`,'card(bodyHtml, {title, sub, icon, tone, actions, hero}) · emptyState({icon, title, text, actions})'),
    glBlock('שורות ורשימות',listOf([
      listRow({id:'r1',icon:'Utensils',tone:'1',title:'סושי — ניגירי סלמון',sub:'אוכל · אוהבת',meta:badge('❤️ אוהבת','love'),action:'gl-toast',heart:{list:'gallery',on:true}}),
      listRow({id:'r2',icon:'Cake',tone:'2',title:'יום ההולדת של שירה',sub:'2 בדצמבר · אחות',meta:countdownChip(5),href:'#gallery'}),
      listRow({id:'r3',emoji:'🌅',title:'פיקניק על החוף',sub:'לפני שנה',meta:starsDisplay(4),actions:iconButton('Pencil','עריכה','gl-toast',{variant:'quiet'})}),
      listRow({id:'r4',icon:'ListChecks',tone:'3',title:'משימה שבוצעה',sub:'אתמול',done:true,meta:badge('בוצע','positive',{icon:'Check'})})
    ]),'listRow({id, icon, tone, emoji, title, sub, meta, action|href, heart:{list,on}, actions, done}) · listOf(rows)'),
    glBlock('מספרים, ספירות ודירוגים',`<div class="stats-row">${statTile({icon:'Heart',value:39,label:'דברים עליה',tone:'1'})}${statTile({icon:'MapPin',value:12,label:'מקומות',tone:'2'})}${statTile({icon:'BookHeart',value:7,label:'זיכרונות',tone:'3'})}${statTile({icon:'Gift',value:4,label:'רעיונות',tone:'1'})}</div>
      <div class="gl-row">${countdownChip(0)}${countdownChip(1)}${countdownChip(5)}${countdownChip(21)}${countdownChip(90)}${countdownChip(-3)}</div>
      <div class="gl-row">${starsDisplay(0)}${starsDisplay(3)}${starsDisplay(5,{size:18})}${priceLevel(1)}${priceLevel(2)}${priceLevel(3)}</div>
      <div class="gl-row">${['1','2','3','love','grad','neutral'].map(t=>iconTile('Sparkles',t)).join('')}${avatar('נועה')}${avatar('איתי',{size:'big'})}</div>
      ${progressBar(64,100,{label:'התקדמות'})}`,'statTile · countdownChip(days) · starsDisplay(n) · priceLevel(n) · iconTile(name, tone) · avatar · progressBar'),
    glBlock('הודעות',`${notice('הודעת מידע רגילה.',{})}${notice('נשמר בהצלחה.',{tone:'success'})}${notice('כדאי לגבות את הנתונים.',{tone:'warning',title:'שים לב',actions:button('גיבוי','gl-toast',{size:'small',variant:'soft'})})}${notice('משהו השתבש.',{tone:'error'})}${notice('היא אוהבת הפתעות קטנות.',{tone:'love'})}${infoRows([['חולצה','S'],['נעליים','38'],['הערות','אוהבת גזרות רחבות']])}`,'notice(text, {tone, title, actions}) · infoRows([[label, value]])'),
    glBlock('טופס (שדות בכל המצבים)',`<form class="gl-form" novalidate data-gl-form><div class="form-error" role="alert" hidden></div><div class="form-grid">${formFields(GL_FORM_FIELDS,{sentiment:'love',remind:[7],rating:3,yearly:true,tags:['קיץ','ים']},'glf')}</div><div class="card-actions">${button('בדיקת השדות','',{variant:'primary',type:'submit',icon:'Check'})}</div></form>`,'openForm({title, fields, values, onSubmit}) — this block uses formFields + validateForm directly'),
    glBlock('דיאלוגים, גיליונות והודעות קופצות',`<div class="gl-row">${button('דיאלוג טופס','gl-form',{variant:'primary',icon:'SquarePen'})}${button('אישור','gl-confirm',{icon:'CircleHelp'})}${button('אישור מחיקה','gl-confirm-danger',{variant:'danger',icon:'Trash2'})}${button('תפריט פעולות','gl-menu',{icon:'Ellipsis'})}${button('הודעה','gl-toast',{icon:'Bell'})}${button('הודעה עם ביטול','gl-toast-undo',{icon:'Undo2'})}${button('שגיאה','gl-toast-error',{variant:'soft',icon:'TriangleAlert'})}${button('קונפטי','gl-confetti',{variant:'soft',icon:'PartyPopper'})}</div>`,'openDialog · openForm · confirmAsk · openMenu · toast(message, {undo, error}) · celebrate(el)'),
    glBlock('אייקונים',`<div class="gl-icons">${Object.keys(ICON_PATHS).map(n=>`<span title="${esc(n)}">${icon(n,20)}<small>${esc(n)}</small></span>`).join('')}</div>`,'icon(name, size) — Lucide names, see src/icons.js'),
    glBlock('צבעים',paletteGrid(),'html[data-palette] · tokens.css')
  ];
  return `<div class="gallery">${blocks.join('')}</div>`;
}
registerView({id:'gallery',title:'גלריית רכיבים',icon:'LayoutGrid',nav:'none',order:999,subtitle:'כל הרכיבים המשותפים במצביהם. עמוד פנימי לבניית המסכים.',render:galleryView,
  afterRender(main){
    const f=main.querySelector('[data-gl-form]');
    f?.addEventListener('submit',e=>{e.preventDefault();if(validateForm(f,GL_FORM_FIELDS))toast('הכול תקין ✓');});
    uiBindFields(f,GL_FORM_FIELDS);
  }});
if(typeof document!=='undefined'&&document.addEventListener){
  onAction('gl-toast',()=>toast('זו הודעה קצרה 💛'));
  onAction('gl-toast-undo',()=>toast('הפריט נמחק',{action:{label:'ביטול',run:()=>toast('בוטל ✓')}}));
  onAction('gl-toast-error',()=>toast('משהו לא הסתדר — נסה שוב',{error:true}));
  onAction('gl-confetti',(a,el)=>celebrate(el));
  onAction('gl-confirm',async()=>{const ok=await confirmAsk({title:'לשמור את זה?',text:'דיאלוג אישור רגיל, עם כפתור ראשי ו"ביטול".',confirm:'כן, לשמור'});toast(ok?'אישרת':'ביטלת');});
  onAction('gl-confirm-danger',async()=>{const ok=await confirmAsk({title:'מחיקת הכול',text:'דיאלוג מחיקה שדורש להקליד מילה.',confirm:'מחיקה',danger:true,requireWord:'מחיקה',icon:'Trash2'});toast(ok?'אישרת':'ביטלת');});
  onAction('gl-menu',()=>openMenu({title:'סושי בר בפלורנטין',items:[{label:'עריכה',icon:'Pencil',run:()=>toast('עריכה')},{label:'היינו פה היום',icon:'MapPinned',sub:'מוסיף ביקור',run:()=>toast('נוסף ביקור')},{label:'מחיקה',icon:'Trash2',danger:true,run:()=>toast('נמחק')}]}));
  onAction('gl-form',()=>openForm({title:'דיאלוג טופס',intro:'כל סוגי השדות, עם בדיקה בעברית.',fields:GL_FORM_FIELDS,values:{sentiment:'like'},onSubmit:v=>{toast('נשלח: '+(v.title||''));}}));
}
