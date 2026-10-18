// נועה — placeholders until the section modules arrive. Each section route gets a polished "בקרוב" page, and the
// "+" gets simple working quick-add forms that save straight into the data (so the home, the search and the
// calendar export already use what he adds). Everything here is registered with stub:true: a real registerView /
// registerQuickAdd / registerHomeCard with the same id replaces it, whatever the load order, so section lanes never
// need to edit this file (they may delete it once every section exists). Private helpers are prefixed "sb".

const SB_PAGES={
  her:{icon:'Heart',title:'כל מה שחשוב לדעת עליה',text:'מה היא אוהבת ומה פחות, המידות שלה, האנשים שחשובים לה ושפות האהבה שלה — הכול במקום אחד.',list:'facts',noun:'דברים עליה',add:'fact'},
  places:{icon:'MapPin',title:'המקומות שלכם',text:'מסעדות, חופים, בתי קפה ומקומות שרוצים לנסות — עם דירוג, ביקורים, ניווט והגרלה "לאן נלך?".',list:'places',noun:'מקומות',add:'place'},
  dates:{icon:'CalendarHeart',title:'כל התאריכים החשובים',text:'ימי הולדת, ימי שנה, אבני דרך וחגים — ברשימה, בלוח שנה, ובקובץ ליומן של הטלפון.',list:'dates',noun:'תאריכים',add:'date'},
  gifts:{icon:'Gift',title:'רעיונות למתנות',text:'"היא אמרה שהיא רוצה…", מה כבר נקנה, מה ניתן ואיך היא הגיבה — כדי שכל מתנה תפגע בול.',list:'gifts',noun:'רעיונות',add:'gift'},
  plans:{icon:'ListChecks',title:'תוכניות ורעיונות',text:'משימות, דייטים, הפתעות ורשימת חלומות משותפת — עם מחולל דייטים כשאין רעיון.',list:'plans',noun:'תוכניות',add:'plan'},
  memories:{icon:'BookHeart',title:'הזיכרונות שלכם',text:'ציר זמן של רגעים ביחד, עם תמונות, מקום ומצב רוח — ו"לפני שנה בדיוק…" בבית.',list:'memories',noun:'זיכרונות',add:'memory'},
  questions:{icon:'MessagesSquare',title:'שאלות לשיחה',text:'חפיסה של שאלות — קלילות, עמוקות, מצחיקות ו־36 השאלות — לערב של שיחה אמיתית.',list:null,noun:'',add:null}
};
function sbView(id){
  const s=SB_PAGES[id];
  return ctx=>{
    const n=s.list?(ctx.data[s.list]||[]).length:0;
    const add=s.add?quickAdds().find(q=>q.id===s.add):null;
    return card(`<div class="soon">${emptyState({icon:s.icon,title:s.title,text:s.text,actions:add?button(add.label,`quick:${s.add}`,{icon:'Plus',variant:'primary'}):''})}<p class="soon-note">${icon('Sparkles',15)}<span>${n?`כבר שמרת כאן ${n} ${s.noun}. המסך המלא בדרך — הכול יחכה לך שם.`:'המסך המלא בדרך. בינתיים אפשר כבר להוסיף מה־"+".'}</span></p></div>`,{cls:'soon-card'});
  };
}
for(const id of Object.keys(SB_PAGES))registerView({...navSection(id),stub:true,render:sbView(id)});

// ---------- Working quick-add forms ----------
const sbOpts=list=>list.map(x=>({id:x.id,label:x.label,icon:x.icon,emoji:x.emoji}));
const SB_REMIND=[{id:'1',label:'יום לפני'},{id:'3',label:'3 ימים'},{id:'7',label:'שבוע'},{id:'14',label:'שבועיים'},{id:'30',label:'חודש'}];
const SB_MOODS=['🥰','😍','😂','🥹','🌅','✨','🎉','😌','💛','😅'].map(e=>({id:e,label:e,emoji:e}));
registerQuickAdd({id:'fact',label:'משהו עליה',hint:'מה היא אוהבת, מה לא',icon:'Heart',order:10,stub:true,run:()=>openForm({title:`משהו על ${herName()}`,submitLabel:'שמירה',
  fields:[{name:'title',label:'מה?',required:true,maxLength:120,placeholder:'למשל: הפוך על שיבולת שועל',autofocus:true},
    {name:'sentiment',label:'מה היא מרגישה כלפי זה',type:'chips',options:sbOpts(SENTIMENTS),required:true},
    {name:'category',label:'קטגוריה',type:'select',options:sbOpts(FACT_CATEGORIES),required:true},
    {name:'details',label:'פרטים',type:'textarea',rows:2,placeholder:'איך, איפה, מתי…'},
    {name:'starred',label:'חשוב לזכור',type:'switch',sub:'יופיע בבית ב"זוכר?"'}],
  values:{sentiment:'love',category:'food'},onSubmit:v=>{saveItem('facts',v);}})});
registerQuickAdd({id:'place',label:'מקום',hint:'שהיא אוהבת, שאתם רוצים לנסות',icon:'MapPin',order:20,stub:true,run:()=>openForm({title:'מקום חדש',
  fields:[{name:'name',label:'שם המקום',required:true,maxLength:80,autofocus:true},
    {name:'lovedBy',label:'של מי?',type:'chips',options:sbOpts(PLACE_LOVED_BY),required:true},
    {name:'kind',label:'סוג',type:'select',options:sbOpts(PLACE_KINDS),required:true},
    {name:'area',label:'אזור',placeholder:'תל אביב, הצפון…'},
    {name:'notes',label:'הערות',type:'textarea',rows:2}],
  values:{lovedBy:'her',kind:'restaurant'},onSubmit:v=>{saveItem('places',{...v,address:'',link:'',rating:0,priceLevel:0,visits:[]});}})});
registerQuickAdd({id:'date',label:'תאריך',hint:'יום הולדת, אירוע, יום שנה',icon:'CalendarHeart',order:30,stub:true,run:()=>openForm({title:'תאריך חשוב',
  fields:[{name:'title',label:'מה קורה?',required:true,maxLength:80,placeholder:'למשל: יום ההולדת של אמא שלה',autofocus:true},
    {name:'date',label:'תאריך',type:'date',required:true},
    {name:'kind',label:'סוג',type:'chips',options:sbOpts(DATE_KINDS),required:true},
    {name:'yearly',label:'חוזר כל שנה',type:'switch'},
    {name:'remindDays',label:'להזכיר לי',type:'multichips',options:SB_REMIND,numeric:true}],
  values:{kind:'event',yearly:false,remindDays:[1,7]},onSubmit:v=>{saveItem('dates',{title:v.title,date:v.date,kind:v.kind,recurring:v.yearly?'yearly':'none',remindDays:v.remindDays,personId:null});}})});
registerQuickAdd({id:'gift',label:'רעיון למתנה',hint:'"היא אמרה שהיא רוצה…"',icon:'Gift',order:40,stub:true,run:()=>openForm({title:'רעיון למתנה',
  fields:[{name:'title',label:'מה?',required:true,maxLength:120,autofocus:true},
    {name:'heard',label:'היא אמרה שהיא רוצה את זה',type:'switch',sub:'אשמור את התאריך של היום'},
    {name:'occasion',label:'לאיזה אירוע?',placeholder:'יום הולדת, סתם כי בא לי…'},
    {name:'price',label:'מחיר משוער',type:'price',min:0},
    {name:'whereToBuy',label:'איפה קונים',placeholder:'חנות, אתר…'}],
  values:{},onSubmit:v=>{saveItem('gifts',{title:v.title,status:'idea',occasion:v.occasion,price:v.price,whereToBuy:v.whereToBuy,link:'',heardOn:v.heard?todayISO():null,givenOn:null,reaction:null});}})});
registerQuickAdd({id:'plan',label:'משימה / רעיון',hint:'לזכור, לתכנן, להפתיע',icon:'ListChecks',order:50,stub:true,run:()=>openForm({title:'משימה או רעיון',
  fields:[{name:'title',label:'מה?',required:true,maxLength:120,autofocus:true},
    {name:'type',label:'סוג',type:'chips',options:sbOpts(PLAN_TYPES),required:true},
    {name:'due',label:'עד מתי?',type:'date',hint:'לא חובה'},
    {name:'notes',label:'הערות',type:'textarea',rows:2}],
  values:{type:'task'},onSubmit:v=>{saveItem('plans',{...v,done:false,doneOn:null,placeId:null,budget:null});}})});
registerQuickAdd({id:'memory',label:'זיכרון',hint:'רגע שלא רוצים לשכוח',icon:'BookHeart',order:60,stub:true,run:()=>openForm({title:'זיכרון',
  fields:[{name:'title',label:'כותרת',required:true,maxLength:80,autofocus:true},
    {name:'date',label:'מתי?',type:'date',required:true,max:todayISO()},
    {name:'text',label:'מה היה?',type:'textarea',rows:3},
    {name:'mood',label:'איך זה הרגיש',type:'emoji',options:SB_MOODS},
    {name:'photos',label:'תמונות',type:'photos',max:12}],
  values:{date:todayISO()},onSubmit:v=>{saveItem('memories',{...v,placeId:null});}})});
