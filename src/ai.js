import {today,toILS,balances,portfolioValue,assetValue,assetProfit,monthlySummary,categorySpend,monthOffset,performance,validDate} from './finance.js';
import {healthScore,detectRecurring,detectAnomalies,monthPace,monteCarlo,monthlySeries,averageMonth,shiftDate} from './smart.js';
import {effectiveGoalSavings,freeMoney} from './savings.js';
import {compareScenario} from './scenario.js';
import {riskProfile,stressTest,historyRisk,STRESS_SCENARIOS,matchHoldings} from './invest.js';
import {IL_TAX_2026,netSalary,grossForNet,loanSchedule,debtPayoff,feeImpact,purchaseCheck,cashflowForecast,safeToSpend,groupSummary,monthlyFixed,scheduledItems,wishlistSummary,BILL_STEPS} from './money.js';

// Claude integration. The app is a single static file with no build-time dependencies,
// so it talks to the Messages API with fetch + server-sent events instead of the SDK.
export const AI_SETTINGS_KEY='ofek-ai-v1';
export const AI_CHAT_KEY='ofek-ai-chat-v1';
export const AI_LETTERS_KEY='ofek-ai-letters-v1';
export const AI_MODELS=[
  ['claude-opus-5-5','Claude Opus 5.5 · הכי חכם (מומלץ)',{input:4,output:20}],
  ['claude-sonnet-5-5','Claude Sonnet 5.5 · מהיר וחסכוני',{input:2,output:10}],
  ['claude-haiku-4-5','Claude Haiku 4.5 · הכי מהיר וזול',{input:1,output:5}]
];
const DEFAULT_SETTINGS={apiKey:'',model:'claude-opus-5-5',effort:'medium',baseUrl:'https://api.anthropic.com',usage:{input:0,output:0,cost:0}};

export function aiSettings(){
  try{return {...DEFAULT_SETTINGS,...JSON.parse(localStorage.getItem(AI_SETTINGS_KEY)||'{}')};}catch{return {...DEFAULT_SETTINGS};}
}
export function saveAiSettings(next){localStorage.setItem(AI_SETTINGS_KEY,JSON.stringify({...aiSettings(),...next}));}
export const aiReady=()=>!!aiSettings().apiKey;
export const modelPricing=model=>(AI_MODELS.find(m=>m[0]===model)||AI_MODELS[0])[2];
const supportsAdaptive=model=>!/haiku/.test(model);

export function addUsage(usage,model){
  if(!usage)return;
  const s=aiSettings(),price=modelPricing(model),input=(usage.input_tokens||0)+(usage.cache_creation_input_tokens||0)*1.25+(usage.cache_read_input_tokens||0)*.1,output=usage.output_tokens||0;
  const u=s.usage||{input:0,output:0,cost:0};
  saveAiSettings({usage:{input:u.input+input,output:u.output+output,cost:u.cost+(input*price.input+output*price.output)/1e6}});
}

export const AI_SYSTEM=`You are "אופק AI" — the personal financial copilot built into Ofek (אופק), a Hebrew, right-to-left personal finance app. The user's data lives only on their device; you see it through the context block in their messages and through your tools.

How to work:
- Always answer in natural, warm, concise Hebrew. Currency is the Israeli shekel (₪) unless an amount is in dollars.
- Ground every number in the user's real data. Call the read tools whenever the context block is not enough — never invent transactions, balances or returns.
- Be specific and actionable: name categories, amounts and dates; compare to the user's own history; end with one or two concrete next steps when it helps.
- You can draw charts inside the chat with render_chart. Use one when a trend, comparison or breakdown is clearer visually (keep labels short, Hebrew, at most 12 points).
- To change data you must use a propose_* tool. The user sees a confirmation card and decides; never claim something was saved until the tool result says it was approved.
- When the user attaches a receipt, invoice, bank or credit-card statement (image, PDF or CSV): read it carefully, extract every transaction (date, amount, merchant/description, a category from the user's category list) and call propose_transactions once with all of them. Skip lines that are totals, balances or duplicates of transactions already in the data. If the year is missing, infer it from context and never use a future date.
- Ofek also runs a bills calendar with a cash-flow forecast, shared-expense groups (trips, roommates) and a wishlist with a 30-day cooling-off period. Use get_cashflow_forecast for questions like "will I be overdrawn?" or "how much can I spend?", get_split_groups for who owes whom, and money_calculator for Israeli net salary (2026 brackets, credit points, National Insurance), mortgages and loans (incl. CPI-linked), debt payoff strategies, pension-fee impact and "should I buy it?" checks.
- When the user shares a broker screenshot or holdings report, read every holding's price or value (and the USD/ILS rate if shown) and call propose_investment_update once; the user reviews it in the monthly update before saving.
- When the user wants to split a shared receipt, call propose_split_expense; when you discover a fixed payment, offer propose_bill; when the user hesitates about a purchase, suggest propose_wishlist_item instead of buying now.
- You are not a licensed investment advisor. For investment questions, explain principles, risks and the user's own numbers; avoid recommending a specific security, and mention this briefly only when relevant.
- Formatting: short paragraphs, **bold** for key figures, "-" bullets, numbered steps, "###" small headings and simple Markdown tables. No HTML.`;

// ---------- Financial context (attached to the user's turns, never to the system prompt) ----------
const round=n=>Math.round(n);
export function financialContext(d,month=today().slice(0,7),now=today()){
  const b=balances(d),h=healthScore(d,month),avg=averageMonth(d,month,3);
  const lines=[
    `today: ${now}${d.profile?` · name: ${d.profile}`:''}${d.demo?' · NOTE: this is demo data':''}`,
    `usd_ils_rate: ${d.fx} (manual, updated ${d.fxDate})`,
    `net_worth: ${round(b.net)} ₪ = cash ${round(b.cash)} + savings ${round(b.savings)} + investments ${round(b.investments)} − debt ${round(b.debt)}`,
    `health_score: ${h.score}/100 (${h.factors.map(f=>`${f.key} ${Math.round(f.score)}`).join(', ')})`,
    `monthly_spending_target: ${round(d.overallBudget)} ₪`,
    'last_6_months (income / expenses / saved, ₪): '+monthlySeries(d,month,6).map(s=>`${s.month}: ${round(s.income)} / ${round(s.expenses)} / ${round(s.saved)}`).join(' | '),
    avg.months?`average_of_previous_${avg.months}_months: income ${round(avg.income)}, expenses ${round(avg.expenses)}`:'',
    'accounts: '+d.accounts.map(a=>`${a.name} [id ${a.id}, ${a.kind}, ${a.currency}] ${round(a.kind==='investment'?portfolioValue(d):a.balance)}${a.kind==='debt'?` (payment ${a.payment}/mo, ${a.interest}% interest)`:''}`).join('; '),
    'budgets_this_month: '+(d.budgets.map(x=>`${x.category} ${round(categorySpend(d,x.category,month))}/${round(x.limit)}`).join('; ')||'none'),
    'goals: '+(d.goals.map(g=>`${g.name} saved ${round(effectiveGoalSavings(d,g))}${g.target?` of ${round(g.target)}`:''}, ${round(g.monthly)}/mo until ${g.date}${g.accountId?` (in ${d.accounts.find(a=>a.id===g.accountId)?.name||'account'}${g.allocation!=null?`, allocated ${round(g.allocation)}`:''})`:''}`).join('; ')||'none'),
    `free_money: ${round(freeMoney(d).total)} ₪ unallocated in bank, cash and savings accounts`,
    'investments: '+(d.assets.map(a=>`${a.ticker||a.name} ${round(toILS(assetValue(a),a.currency,d.fx))} ₪`).join('; ')||'none'),
    (d.bills||[]).length?`fixed_payments: ${round(monthlyFixed(d))} ₪/month · next 30 days: `+scheduledItems(d,shiftDate(now,1),shiftDate(now,30)).filter(x=>!x.paid).slice(0,8).map(x=>`${x.date} ${x.name} ${x.type==='income'?'+':'−'}${round(x.amount)}`).join('; '):'',
    (d.groups||[]).length?'split_groups: '+d.groups.map(g=>{const x=groupSummary(g);return `${g.name} (total ${round(x.total)}, user balance ${round(x.myBalance)})`;}).join('; '):'',
    (d.wishlist||[]).length?(w=>`wishlist: ${w.count} waiting (${round(w.waiting)} ₪), skipped so far ${round(w.skipped)} ₪`)(wishlistSummary(d)):'',
    `categories: ${d.categories.join(', ')}`,
    `transactions_on_record: ${d.transactions.length} (${d.transactions.length?d.transactions.map(t=>t.date).sort()[0]:'—'} → ${d.transactions.length?d.transactions.map(t=>t.date).sort().at(-1):'—'})`,
    `selected_month_in_app: ${month}`
  ];
  return '<financial_context>\n'+lines.filter(Boolean).join('\n')+'\n</financial_context>';
}

// ---------- Tools ----------
const S=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const str=description=>({type:'string',description}),num=description=>({type:'number',description});
const txItem=S({type:{type:'string',enum:['expense','income']},amount:num('Positive amount'),currency:{type:'string',enum:['ILS','USD']},date:str('YYYY-MM-DD, not in the future'),category:str('One of the user categories when possible'),description:str('Merchant or short Hebrew description'),account:str('Account id or name; optional')},['type','amount','date','category','description']);
export const AI_TOOLS=[
  {name:'get_financial_overview',description:'Current balances, health score with factor tips, this month vs. typical month, budgets status, recurring charges and unusual spending. Read-only.',input_schema:S({month:str('YYYY-MM; defaults to the month selected in the app')})},
  {name:'query_transactions',description:'Search transactions with filters. Returns matching rows (newest first) and totals in ₪. Read-only.',input_schema:S({from:str('YYYY-MM-DD'),to:str('YYYY-MM-DD'),type:{type:'string',enum:['expense','income']},category:str('Exact category name'),search:str('Text to find in description, category or tags'),min_amount:num('Minimum amount'),max_amount:num('Maximum amount'),limit:{type:'integer',description:'Max rows to return, default 40, max 200'}})},
  {name:'spending_breakdown',description:'Aggregate income or expenses between two dates, grouped by category, month or account. Read-only.',input_schema:S({from:str('YYYY-MM-DD'),to:str('YYYY-MM-DD'),group_by:{type:'string',enum:['category','month','account']},type:{type:'string',enum:['expense','income']}},['from','to','group_by'])},
  {name:'get_investments',description:'Investment holdings with value, lifetime profit and return, plus portfolio performance from monthly snapshots (Modified Dietz, XIRR). Read-only.',input_schema:S({})},
  {name:'simulate_future',description:'Monte Carlo simulation (1000 runs, in today\'s money) of investable wealth with monthly contributions. Returns P10/P50/P90 per year and probability of reaching a target.',input_schema:S({years:{type:'integer',description:'1-60'},start:num('Starting amount in ₪; default = savings + investments'),monthly_contribution:num('₪ per month; default = average monthly savings'),annual_return:num('Expected nominal annual return, e.g. 0.07'),volatility:num('Annual volatility, e.g. 0.15'),inflation:num('Annual inflation, e.g. 0.025'),target:num('Optional target in today\'s ₪')},['years'])},
  {name:'render_chart',description:'Draw a chart inside the chat for the user. Use for trends (line), comparisons (bar) and shares (donut).',input_schema:S({chart_type:{type:'string',enum:['bar','line','donut']},title:str('Short Hebrew title'),labels:{type:'array',items:{type:'string'},description:'X-axis labels or slice names (max 12)'},series:{type:'array',description:'One or more series; donut uses the first',items:S({name:str('Series name'),values:{type:'array',items:{type:'number'}}},['name','values'])},unit:{type:'string',enum:['ILS','percent','number'],description:'ILS (default) for shekel amounts; percent means values are percentages such as 12.5 for 12.5%'}},['chart_type','title','labels','series'])},
  {name:'propose_transactions',description:'Propose adding one or more transactions (e.g. extracted from a receipt or statement, or dictated by the user). The user reviews and approves or declines; the result says what happened.',input_schema:S({transactions:{type:'array',items:txItem},note:str('Optional short note shown above the list, e.g. the document source')},['transactions'])},
  {name:'propose_budget',description:'Propose creating or updating a monthly budget for a category. Requires user approval.',input_schema:S({category:str('Category name'),monthly_limit:num('₪ per month'),reason:str('One short sentence why')},['category','monthly_limit'])},
  {name:'propose_goal',description:'Propose a new savings plan. Requires user approval.',input_schema:S({name:str('Hebrew name'),type:{type:'string',enum:['קרן חירום','רכב','חופשה','דירה','לימודים','מטרה אישית']},target:num('Optional target ₪'),saved:num('Already saved ₪, default 0'),monthly:num('Planned monthly deposit ₪'),date:str('Target date YYYY-MM-DD')},['name','monthly','date'])}
  ,{name:'get_cashflow_forecast',description:'Upcoming fixed payments and incomes (bills calendar and recurring transactions), planned monthly goal deposits, projected bank+cash balance day by day with a summary per month, the lowest point, overdraft risk, and how much is safe to spend per day for the rest of this month. Read-only.',input_schema:S({days:{type:'integer',description:'Days ahead, 7-365, default 90'}})},
  {name:'money_calculator',description:'Israeli money calculators. salary: net pay from gross (or gross needed for a net target) with 2026 tax brackets, credit points, National Insurance, health tax and pension. loan: mortgage/loan schedule (spitzer or equal principal, optional CPI linkage and extra monthly payments). debt_payoff: avalanche vs snowball over the user\'s tracked debts. fees: impact of pension/savings management fees vs a low-fee benchmark. purchase: should-I-buy check of a price against this user\'s budget, cushion and goals.',input_schema:S({calculator:{type:'string',enum:['salary','loan','debt_payoff','fees','purchase']},gross_salary:num('Monthly gross ₪'),net_salary_target:num('Find the gross needed for this monthly net'),credit_points:num('Default 2.25; women usually 2.75'),pension_rate:num('Employee pension rate, default 0.06'),study_fund_rate:num('Employee study-fund rate, e.g. 0.025'),principal:num('Loan amount ₪'),annual_rate_percent:num('Annual interest %, e.g. 4.8'),years:num('Loan term or projection years'),method:{type:'string',enum:['shpitzer','equal']},cpi_linked:{type:'boolean'},inflation_percent:num('Expected annual CPI %, default 2.5'),extra_monthly:num('Extra monthly payment ₪ (loan or debts)'),price:num('Purchase price ₪'),installments:{type:'integer',description:'Number of payments for a purchase'},balance:num('Current savings balance ₪ (fees)'),monthly_deposit:num('Monthly deposit ₪ (fees)'),annual_return_percent:num('Gross annual return %, default 5'),accumulation_fee_percent:num('Annual fee on balance %, e.g. 0.5'),deposit_fee_percent:num('Fee on deposits %, e.g. 2')},['calculator'])},
  {name:'get_split_groups',description:'Shared-expense groups (trips, roommates, events): members, recent expenses, balances and the minimal transfers to settle up. Read-only.',input_schema:S({})},
  {name:'propose_split_expense',description:'Propose adding a shared expense to a split group, e.g. from a restaurant receipt. Split equally among participants (default: all members). The user approves.',input_schema:S({group:str('Group name or id'),description:str('What was paid for'),amount:num('Total ₪'),paid_by:str('Name of the member who paid; "אני" for the user'),participants:{type:'array',items:{type:'string'},description:'Names sharing the cost; default all members'},date:str('YYYY-MM-DD; default today')},['group','description','amount','paid_by'])},
  {name:'propose_bill',description:'Propose adding a fixed payment or income to the bills calendar (rent, arnona, insurance, subscriptions, salary). The user approves.',input_schema:S({name:str('Hebrew name'),amount:num('₪ per occurrence'),frequency:{type:'string',enum:['monthly','bimonthly','quarterly','yearly']},day:{type:'integer',description:'Day of month 1-31'},type:{type:'string',enum:['expense','income']},category:str('Category'),autopay:{type:'boolean',description:'Charged automatically (standing order or card)'},start_month:str('YYYY-MM of a known occurrence, needed for non-monthly bills')},['name','amount','frequency','day'])},
  {name:'propose_investment_update',description:'Propose new prices or values for existing holdings (e.g. read from a broker screenshot or report). Approved values are filled into the monthly investment update for review; nothing is saved until the user saves the snapshot.',input_schema:S({holdings:{type:'array',items:S({asset:str('Ticker or name of an existing holding'),price:num('Price per unit in the holding currency (shekels for TASE, not agorot)'),value:num('Total value, for holdings tracked by value'),quantity:num('Units shown in the report, if any')},['asset']),description:'One entry per holding'},usd_ils_rate:num('USD/ILS rate shown in the report, if any'),date:str('Report date YYYY-MM-DD, if shown')},['holdings'])},
  {name:'simulate_scenario',description:'What-if simulator over the user\'s real plan, month by month: free money (not allocated to goals), goal achievement dates and net worth, comparing the current plan with events. Event types: deposit (change in monthly goal deposits, optionally for one goal), purchase (one-time purchase funded from free money, a goal or a loan, with an optional monthly running cost), grant (one-time money to free money, a goal or investments, e.g. an IDF discharge grant or a bonus), income (monthly income change), expense (new monthly expense, optional duration).',input_schema:S({events:{type:'array',items:S({type:{type:'string',enum:['deposit','purchase','grant','income','expense']},name:str('Short Hebrew label'),amount:num('₪; monthly for deposit/income/expense, one-time for purchase/grant; negative allowed for deposit/income'),month:{type:'integer',description:'When it starts: 1 = next month'},goal:str('Goal name, for deposit changes (omit = all goals)'),funding:str('Purchase funding: free, loan, or a goal name'),target:str('Grant destination: free, invest, or a goal name'),loan_rate:num('Annual loan interest %'),loan_years:num('Loan term in years'),monthly_cost:num('Monthly running cost after a purchase (e.g. car insurance and fuel)'),duration:{type:'integer',description:'Months a new expense lasts; 0 = ongoing'}},['type','amount','month'])},horizon_months:{type:'integer',description:'12-120, default 36'},annual_return_percent:num('Expected investment return, default 5')},['events'])},
  {name:'propose_wishlist_item',description:'Propose adding an item to the wishlist with a 30-day cooling-off period instead of buying it now. The user approves.',input_schema:S({name:str('Item'),price:num('Price ₪'),note:str('Why it is wanted, a link, or alternatives')},['name','price'])}
].map(t=>({...t,eager_input_streaming:true}));

const sumILS=(d,list)=>list.reduce((s,t)=>s+toILS(t.amount,t.currency||'ILS',t.fx||d.fx),0);
const accountName=(d,id)=>d.accounts.find(a=>a.id===id)?.name||'—';
export function resolveAccount(d,ref){
  const usable=d.accounts.filter(a=>!['investment','debt'].includes(a.kind));
  if(ref){const r=String(ref).trim();const hit=usable.find(a=>a.id===r||a.name===r)||usable.find(a=>a.name.includes(r)||r.includes(a.name));if(hit)return hit;if(/מזומן|cash/i.test(r))return usable.find(a=>a.kind==='cash')||null;}
  return usable.find(a=>a.kind==='bank')||usable[0]||null;
}

// Validates a proposed transaction and returns a normalized draft or an error string.
export function normalizeProposedTransaction(d,raw,now=today()){
  const amount=Number(raw?.amount),date=String(raw?.date||''),type=raw?.type==='income'?'income':raw?.type==='expense'?'expense':null;
  if(!type)return {error:'type must be expense or income'};
  if(!(amount>0)||!Number.isFinite(amount))return {error:'amount must be positive'};
  if(!validDate(date))return {error:`invalid date "${date}"`};
  if(date>now)return {error:`date ${date} is in the future`};
  const account=resolveAccount(d,raw.account);
  if(!account)return {error:'no bank, cash or savings account exists'};
  const category=String(raw.category||'').trim()||'קניות';
  return {draft:{type,amount,currency:raw.currency==='USD'?'USD':account.currency,date,category,description:String(raw.description||'').trim().slice(0,120),accountId:account.id,subcategory:'',tags:['AI'],recurring:false}};
}

export async function executeAiTool(name,input,ctx){
  const d=ctx.data,month=ctx.month||today().slice(0,7),now=ctx.now||today();input=input||{};
  if(name==='get_financial_overview'){
    const m=/^\d{4}-\d{2}$/.test(input.month||'')?input.month:month,h=healthScore(d,m),pace=monthPace(d,m,now);
    return {month:m,balances:balances(d),free_money_not_allocated_to_goals:round(freeMoney(d).total),this_month:monthlySummary(d,m),typical_month:averageMonth(d,m,3),pace_projection:pace,health:{score:h.score,grade:h.grade,factors:h.factors.map(f=>({factor:f.label,score:Math.round(f.score),tip:f.tip}))},budgets:d.budgets.map(x=>({category:x.category,limit:x.limit,spent:categorySpend(d,x.category,m)})),recurring_charges:detectRecurring(d,m).slice(0,12).map(r=>({name:r.name,category:r.category,monthly:round(r.average),yearly:round(r.annual),next:r.nextDate})),unusual:detectAnomalies(d,m).slice(0,8)};
  }
  if(name==='query_transactions'){
    const q=String(input.search||'').trim(),limit=Math.max(1,Math.min(200,Number(input.limit)||40));
    const list=d.transactions.filter(t=>(!input.from||t.date>=input.from)&&(!input.to||t.date<=input.to)&&(!input.type||t.type===input.type)&&(!input.category||t.category===input.category)&&(!q||[t.description,t.category,t.subcategory,...(t.tags||[])].join(' ').includes(q))&&(input.min_amount==null||t.amount>=input.min_amount)&&(input.max_amount==null||t.amount<=input.max_amount)).sort((a,b)=>b.date.localeCompare(a.date));
    return {count:list.length,total_income:round(sumILS(d,list.filter(t=>t.type==='income'))),total_expense:round(sumILS(d,list.filter(t=>t.type==='expense'))),shown:Math.min(limit,list.length),transactions:list.slice(0,limit).map(t=>({date:t.date,type:t.type,amount:t.amount,currency:t.currency||'ILS',category:t.category,description:t.description,account:accountName(d,t.accountId)}))};
  }
  if(name==='spending_breakdown'){
    if(!validDate(input.from)||!validDate(input.to))throw new Error('from and to must be YYYY-MM-DD');
    const type=input.type||'expense',list=d.transactions.filter(t=>t.type===type&&t.date>=input.from&&t.date<=input.to),groups=new Map();
    for(const t of list){const key=input.group_by==='month'?t.date.slice(0,7):input.group_by==='account'?accountName(d,t.accountId):t.category;groups.set(key,(groups.get(key)||0)+toILS(t.amount,t.currency||'ILS',t.fx||d.fx));}
    const rows=[...groups.entries()].map(([key,total])=>({key,total:round(total)}));
    rows.sort(input.group_by==='month'?(a,b)=>a.key.localeCompare(b.key):(a,b)=>b.total-a.total);
    return {type,from:input.from,to:input.to,total:round(sumILS(d,list)),rows};
  }
  if(name==='get_investments'){
    const snaps=[...d.snapshots].sort((a,b)=>a.date.localeCompare(b.date)),p=snaps.length>1?performance(d,snaps[0].date,snaps.at(-1).date):null;
    const risk=riskProfile(d),history=historyRisk(d);
    return {risk:{largest_holding:risk.largest,top3_share:risk.top3Share,effective_number_of_holdings:Math.round(risk.effective*10)/10,usd_share:risk.usdShare,by_sector:risk.bySector.map(x=>({sector:x.name,share:Math.round(x.share*1000)/1000})),stress_tests:STRESS_SCENARIOS.map(x=>stressTest(d,x)).map(t=>({scenario:t.name,detail:t.detail,change_ils:round(t.change),share:Math.round(t.share*1000)/1000})),history:history&&{annual_volatility:history.annualVolatility,max_drawdown:history.maxDrawdown,months:history.months}},portfolio_value_ils:round(portfolioValue(d)),cash_in_portfolio:d.wallets,holdings:d.assets.map(a=>{const pr=assetProfit(d,a);return {name:a.name,ticker:a.ticker,type:a.type,currency:a.currency,value_ils:round(toILS(assetValue(a),a.currency,d.fx)),profit:round(pr.profit),return:pr.return};}),performance_since_first_snapshot:p?{from:p.start?.date,to:p.end?.date,time_weighted_return:p.return,xirr_annual:p.annual,profit:p.profit,benchmarks_percent:p.benchmarks}:'need at least two monthly snapshots',snapshots:snaps.slice(-12).map(s=>({date:s.date,value:round(s.value),net_worth:round(s.netWorth)}))};
  }
  if(name==='simulate_future'){
    const b=balances(d),avg=averageMonth(d,month,3);
    const r=monteCarlo({years:Number(input.years)||20,start:Number.isFinite(input.start)?input.start:b.savings+b.investments,monthly:Number.isFinite(input.monthly_contribution)?input.monthly_contribution:Math.max(0,avg.saved),annualReturn:Number.isFinite(input.annual_return)?input.annual_return:.07,volatility:Number.isFinite(input.volatility)?input.volatility:.15,inflation:Number.isFinite(input.inflation)?input.inflation:.025,target:Number.isFinite(input.target)?input.target:null});
    return {note:'values in today\'s ₪ (after inflation)',probability_of_target:r.probability,years:r.points.map(p=>({year:p.year,p10:round(p.p10),median:round(p.p50),p90:round(p.p90),contributed:round(p.contributed)}))};
  }
  if(name==='render_chart'){
    const labels=Array.isArray(input.labels)?input.labels:[],series=Array.isArray(input.series)?input.series:[];
    if(!labels.length||!series.length||series.some(s=>!Array.isArray(s.values)))throw new Error('labels and series[].values are required');
    return {rendered:true,shown_to_user:true};
  }
  if(name==='propose_transactions'){
    const items=(Array.isArray(input.transactions)?input.transactions:[]).map(t=>normalizeProposedTransaction(d,t,now));
    const valid=items.filter(x=>x.draft).map(x=>x.draft),errors=items.map((x,i)=>x.error?`#${i+1}: ${x.error}`:null).filter(Boolean);
    if(!valid.length)throw new Error('No valid transactions. '+errors.join('; '));
    const outcome=await ctx.approve({id:ctx.toolUseId,kind:'transactions',items:valid,note:input.note||'',errors});
    return outcome.approved?{approved:true,saved:outcome.saved??valid.length,skipped_invalid:errors}:{approved:false,message:'The user declined. Nothing was saved.'};
  }
  if(name==='propose_budget'){
    const limit=Number(input.monthly_limit),category=String(input.category||'').trim();
    if(!category||!(limit>0))throw new Error('category and a positive monthly_limit are required');
    const outcome=await ctx.approve({id:ctx.toolUseId,kind:'budget',category,limit:Math.round(limit),reason:input.reason||'',existing:d.budgets.find(b=>b.category===category)?.limit??null});
    return outcome.approved?{approved:true}:{approved:false,message:'The user declined.'};
  }
  if(name==='propose_goal'){
    const monthly=Number(input.monthly),target=input.target==null?null:Number(input.target),saved=Number(input.saved)||0;
    if(!input.name||!(monthly>=0)||!validDate(input.date)||input.date<=now)throw new Error('name, monthly >= 0 and a future date are required');
    if(target!=null&&!(target>0))throw new Error('target must be positive when given');
    const outcome=await ctx.approve({id:ctx.toolUseId,kind:'goal',goal:{name:String(input.name),type:input.type||'מטרה אישית',target,saved,monthly,date:input.date,accountId:''}});
    return outcome.approved?{approved:true}:{approved:false,message:'The user declined.'};
  }
  if(name==='get_cashflow_forecast'){
    const days=Math.max(7,Math.min(365,Number(input.days)||90)),f=cashflowForecast(d,{days,now}),s=safeToSpend(d,now);
    return {today:now,safe_to_spend_per_day:round(s.perDay),left_in_monthly_target:round(s.available),fixed_payments_left_this_month:round(s.upcomingFixed),days_left_in_month:s.daysLeft,liquid_balance_now:round(f.start),projected_balance_at_end:round(f.end),lowest_point:{date:f.lowest.date,balance:round(f.lowest.balance)},overdraft_date:f.overdraft,variable_spending_per_day:round(f.variableDaily),fixed_monthly_costs:round(f.fixed),income_is_estimated_from_history:f.estimatedIncome,planned_goal_deposits:round(f.deposits),monthly_summary:f.months.map(m=>({month:m.month,start:round(m.start),income:round(m.income),fixed_payments:round(m.fixed),goal_deposits:round(m.deposits),variable_spending:round(m.variable),end:round(m.end),lowest:round(m.lowest.balance)})),upcoming:f.items.slice(0,30).map(x=>({date:x.date,name:x.name,amount:round(x.amount),type:x.type,autopay:x.autopay,source:x.source}))};
  }
  if(name==='money_calculator'){
    const c=input.calculator,fin=(v,fallback)=>Number.isFinite(v)?v:fallback;
    if(c==='salary'){
      const opts={creditPoints:fin(input.credit_points,2.25),pensionRate:fin(input.pension_rate,.06),studyFundRate:fin(input.study_fund_rate,0)};
      const gross=Number.isFinite(input.net_salary_target)?grossForNet(input.net_salary_target,opts):Number(input.gross_salary);
      const x=netSalary({...opts,gross});
      return {tax_year:IL_TAX_2026.year,gross:round(x.gross),net:round(x.net),income_tax:round(x.tax),national_insurance:round(x.ni),health_tax:round(x.health),pension_employee:round(x.pension),study_fund_employee:round(x.studyFund),credit_points_value:round(x.credits),pension_tax_credit:round(x.pensionCredit),mandatory_deductions_rate:x.effectiveRate,marginal_tax_rate:x.marginal,net_per_hour:round(x.hourly),note:'Estimate for a resident employee; excludes taxable benefits, reimbursements and personal credits beyond the points given.'};
    }
    if(c==='loan'){
      const base={principal:input.principal,annualRate:input.annual_rate_percent,years:input.years,method:input.method||'shpitzer',cpiLinked:!!input.cpi_linked,inflation:fin(input.inflation_percent,2.5)};
      const a=loanSchedule(base),b=Number(input.extra_monthly)>0?loanSchedule({...base,extraMonthly:Number(input.extra_monthly)}):null;
      return {first_payment:round(a.firstPayment),max_payment:round(a.maxPayment),months:a.months,total_interest:round(a.totalInterest),total_cpi_indexation:round(a.totalIndexation),total_paid:round(a.totalPaid),with_extra_payment:b?{months:b.months,months_saved:a.months-b.months,interest_and_indexation_saved:round(a.totalInterest+a.totalIndexation-b.totalInterest-b.totalIndexation)}:null};
    }
    if(c==='debt_payoff'){
      const debts=d.accounts.filter(a=>a.kind==='debt'&&a.balance>0).map(a=>({name:a.name,balance:toILS(a.balance,a.currency,d.fx),rate:a.interest,payment:toILS(a.payment,a.currency,d.fx)}));
      if(!debts.length)return {message:'No debts are tracked in Ofek.'};
      const extra=Number(input.extra_monthly)||0,pack=r=>({feasible:r.feasible,months:r.months,total_interest:r.totalInterest==null?null:round(r.totalInterest),payoff_order:r.order.map(o=>`${o.name} (month ${o.month})`)});
      return {debts,monthly_budget:round(debts.reduce((s,x)=>s+x.payment,0)+extra),avalanche:pack(debtPayoff(debts,{extra,strategy:'avalanche'})),snowball:pack(debtPayoff(debts,{extra,strategy:'snowball'}))};
    }
    if(c==='fees'){
      const f=feeImpact({balance:fin(input.balance,0),monthly:fin(input.monthly_deposit,0),years:fin(input.years,30),annualReturn:fin(input.annual_return_percent,5),accumulationFee:fin(input.accumulation_fee_percent,.5),depositFee:fin(input.deposit_fee_percent,2)});
      return {final_with_these_fees:round(f.yours.final),final_with_low_fees:round(f.better.final),cost_of_these_fees:round(f.difference),fees_paid:round(f.yours.fees),low_fee_benchmark:'0.15% of balance, 1% of deposits',contributed:round(f.contributed)};
    }
    if(c==='purchase'){
      const x=purchaseCheck(d,{price:input.price,installments:input.installments||1,now});
      return {price:x.price,installments:x.installments,monthly_cost:round(x.monthlyCost),work_hours:x.hours==null?null:Math.round(x.hours),left_in_monthly_target:round(x.available),share_of_what_is_left:x.shareOfAvailable,emergency_months_after:x.coverAfter,opportunity_cost_10y:round(x.opportunity10),opportunity_cost_20y:round(x.opportunity20),opportunity_note:'If invested at 5% real per year',delays_goal:x.goal,verdict:x.verdict};
    }
    throw new Error('calculator must be salary, loan, debt_payoff, fees or purchase');
  }
  if(name==='get_split_groups'){
    return {groups:(d.groups||[]).map(g=>{const x=groupSummary(g),who=id=>g.members.find(m=>m.id===id)?.name||id;return {id:g.id,name:g.name,members:g.members.map(m=>m.me?`${m.name} (the user)`:m.name),total:round(x.total),balances:Object.fromEntries(Object.entries(x.net).map(([id,v])=>[who(id),round(v)])),settle_up:x.transfers.map(t=>`${who(t.from)} → ${who(t.to)}: ${t.amount} ₪`),recent_expenses:(g.expenses||[]).slice(-15).map(e=>({date:e.date,description:e.description,amount:e.amount,paid_by:who(e.paidBy)}))};})};
  }
  if(name==='propose_split_expense'){
    const groups=d.groups||[],ref=String(input.group||'').trim(),g=groups.find(x=>x.id===ref||x.name===ref)||groups.find(x=>ref&&(x.name.includes(ref)||ref.includes(x.name)));
    if(!g)throw new Error(`No split group "${ref}". Existing groups: ${groups.map(x=>x.name).join(', ')||'none'}`);
    const member=who=>{const r=String(who||'').trim();if(/^(אני|me|i|user|המשתמש)$/i.test(r))return g.members.find(m=>m.me);return g.members.find(m=>m.name===r)||g.members.find(m=>r&&(m.name.includes(r)||r.includes(m.name)));};
    const payer=member(input.paid_by),amount=Math.round(Number(input.amount)*100)/100;
    if(!payer)throw new Error(`paid_by "${input.paid_by}" is not a member of ${g.name}: ${g.members.map(m=>m.name).join(', ')}`);
    if(!(amount>0))throw new Error('amount must be positive');
    const participants=(Array.isArray(input.participants)?input.participants:[]).map(p=>{const m=member(p);if(!m)throw new Error(`participant "${p}" is not a member of ${g.name}`);return m.id;});
    const date=validDate(input.date||'')&&input.date<=now?input.date:now;
    const expense={description:String(input.description||'הוצאה משותפת').slice(0,120),amount,paidBy:payer.id,date,...(participants.length?{participants:[...new Set(participants)]}:{})};
    const outcome=await ctx.approve({id:ctx.toolUseId,kind:'split',groupId:g.id,groupName:g.name,members:g.members,expense});
    return outcome.approved?{approved:true}:{approved:false,message:'The user declined.'};
  }
  if(name==='propose_bill'){
    const amount=Number(input.amount),day=Math.round(Number(input.day)),frequency=BILL_STEPS[input.frequency]?input.frequency:'monthly';
    if(!input.name||!(amount>0)||!(day>=1&&day<=31))throw new Error('name, a positive amount and a day between 1 and 31 are required');
    const bill={name:String(input.name).slice(0,80),amount,currency:'ILS',frequency,day,type:input.type==='income'?'income':'expense',category:String(input.category||(input.type==='income'?'משכורת':'חשבונות')),autopay:!!input.autopay,accountId:resolveAccount(d)?.id||'',paid:[],...(/^\d{4}-(0[1-9]|1[0-2])$/.test(input.start_month||'')?{startMonth:input.start_month}:{})};
    const outcome=await ctx.approve({id:ctx.toolUseId,kind:'bill',bill});
    return outcome.approved?{approved:true}:{approved:false,message:'The user declined.'};
  }
  if(name==='propose_investment_update'){
    const rows=(Array.isArray(input.holdings)?input.holdings:[]).map(h=>({symbol:String(h.asset||''),name:String(h.asset||''),price:Number.isFinite(h.price)?h.price:null,value:Number.isFinite(h.value)?h.value:null,quantity:Number.isFinite(h.quantity)?h.quantity:null}));
    const {matches,unmatched}=matchHoldings(d,rows);
    if(!matches.length)throw new Error(`No holdings matched. Existing holdings: ${d.assets.map(a=>a.ticker||a.name).join(', ')||'none'}`);
    const fx=Number(input.usd_ils_rate)>0?Number(input.usd_ils_rate):null,date=validDate(input.date||'')&&input.date<=now?input.date:null;
    const outcome=await ctx.approve({id:ctx.toolUseId,kind:'holdings',fx,date,unmatched:unmatched.map(r=>r.name),items:matches.map(m=>({assetId:m.asset.id,name:m.asset.name,currency:m.asset.currency,field:m.field,old:m.old,next:m.next,change:m.change,flags:m.flags}))});
    return outcome.approved?{approved:true,applied_to_monthly_update:outcome.saved,unmatched:unmatched.map(r=>r.name)}:{approved:false,message:'The user declined.'};
  }
  if(name==='simulate_scenario'){
    const goalRef=ref=>{const r=String(ref||'').trim();if(!r||r==='all')return null;const g=d.goals.find(x=>x.id===r||x.name===r)||d.goals.find(x=>x.name.includes(r)||r.includes(x.name));if(!g)throw new Error(`No goal named "${r}". Goals: ${d.goals.map(x=>x.name).join(', ')||'none'}`);return g.id;};
    const where=(ref,fallback)=>{const r=String(ref||fallback).trim();return ['free','loan','invest'].includes(r)?r:`goal:${goalRef(r)}`;};
    const events=(Array.isArray(input.events)?input.events:[]).map(x=>({type:x.type,name:x.name||x.type,amount:Number(x.amount)||0,month:Math.max(1,Math.round(Number(x.month)||1)),goal:x.type==='deposit'?goalRef(x.goal)||'all':undefined,funding:x.type==='purchase'?where(x.funding,'free'):undefined,target:x.type==='grant'?where(x.target,'free'):undefined,loanRate:Number(x.loan_rate)||0,loanYears:Number(x.loan_years)||5,monthlyCost:Number(x.monthly_cost)||0,duration:Math.round(Number(x.duration)||0)}));
    const r=compareScenario(d,events,{horizon:Number(input.horizon_months)||36,annualReturn:Number.isFinite(input.annual_return_percent)?input.annual_return_percent:5,now});
    const pack=p=>({free_money:round(p.final.free),net_worth:round(p.final.netWorth),lowest_free_money:round(p.lowest.free),lowest_month:p.lowest.month,first_negative_month:p.negative});
    return {horizon_months:r.scenario.horizon,average_monthly_surplus:round(r.baseline.surplus),current_plan:pack(r.baseline),with_events:pack(r.scenario),free_money_change:round(r.freeDelta),net_worth_change:round(r.netWorthDelta),goals:r.goals.map(g=>({goal:g.name,target:g.target,current_plan_month:g.baselineMonth,with_events_month:g.scenarioMonth,months_change:g.delta})),note:'Month 1 = next month. Free money excludes money allocated to goals.'};
  }
  if(name==='propose_wishlist_item'){
    const price=Number(input.price);
    if(!input.name||!(price>0))throw new Error('name and a positive price are required');
    const outcome=await ctx.approve({id:ctx.toolUseId,kind:'wish',item:{name:String(input.name).slice(0,80),price,note:String(input.note||'').slice(0,200),priority:2,url:''}});
    return outcome.approved?{approved:true}:{approved:false,message:'The user declined.'};
  }
  throw new Error('Unknown tool '+name);
}

// ---------- Streaming client ----------
export class AiError extends Error{constructor(message,status){super(message);this.status=status;}}

function friendlyError(status,body){
  const raw=body?.error?.message||'';
  if(status===401)return 'מפתח ה־API אינו תקין. אפשר לעדכן אותו בהגדרות ה־AI.';
  if(status===403)return 'למפתח אין הרשאה לפעולה הזו. '+raw;
  if(status===404)return 'המודל שנבחר אינו זמין לחשבון שלך. נסה מודל אחר בהגדרות.';
  if(status===413)return 'הבקשה גדולה מדי. נסה קובץ קטן יותר.';
  if(status===429)return 'הגעת למגבלת הקצב או התקציב של ה־API. נסה שוב בעוד רגע.';
  if(status===529||status===503)return 'השירות של Claude עמוס כרגע. נסה שוב בעוד רגע.';
  if(status>=500)return 'שגיאה זמנית בשירות של Claude. נסה שוב.';
  return raw||'הבקשה ל־Claude נכשלה ('+status+').';
}

export async function* sseEvents(body){
  const reader=body.getReader(),decoder=new TextDecoder();let buffer='';
  for(;;){
    const {value,done}=await reader.read();
    buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
    let index;
    while((index=buffer.search(/\r?\n\r?\n/))>=0){
      const chunk=buffer.slice(0,index);buffer=buffer.slice(index).replace(/^\r?\n\r?\n/,'');
      let event='message',data='';
      for(const line of chunk.split(/\r?\n/)){if(line.startsWith('event:'))event=line.slice(6).trim();else if(line.startsWith('data:'))data+=line.slice(5).trim();}
      if(data)yield {event,data:JSON.parse(data)};
    }
    if(done)return;
  }
}

export function buildRequest(settings,{system,messages,tools,maxTokens=32000}){
  // Top-level automatic prompt caching: the static system prompt, tools and history prefix are reused across turns.
  const body={model:settings.model,max_tokens:maxTokens,stream:true,cache_control:{type:'ephemeral'},system,messages};
  if(tools?.length)body.tools=tools;
  const headers={'content-type':'application/json','x-api-key':settings.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'};
  if(supportsAdaptive(settings.model)){
    body.thinking={type:'adaptive',display:'summarized'};
    body.output_config={effort:settings.effort||'medium'};
    // Route safety-classifier declines to Anthropic's recommended fallback model server-side.
    body.fallbacks='default';
    headers['anthropic-beta']='server-side-fallback-2026-07-01';
  }
  return {url:settings.baseUrl.replace(/\/$/,'')+'/v1/messages',headers,body};
}

// Streams one assistant message and rebuilds its content blocks exactly as sent.
export async function streamMessage(settings,request,{onEvent=()=>{},signal,fetchImpl=globalThis.fetch}={}){
  const {url,headers,body}=buildRequest(settings,request);
  let response;
  try{response=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(body),signal});}
  catch(err){if(err?.name==='AbortError')throw err;throw new AiError('אין חיבור לשירות של Claude. בדוק את החיבור לאינטרנט.',0);}
  if(!response.ok){let parsed=null;try{parsed=await response.json();}catch{}throw new AiError(friendlyError(response.status,parsed),response.status);}
  const message={content:[],stop_reason:null,usage:{}},json=new Map();
  for await (const {event,data} of sseEvents(response.body)){
    if(event==='error'||data.type==='error')throw new AiError(friendlyError(data.error?.type==='overloaded_error'?529:500,data),500);
    if(data.type==='message_start'){message.id=data.message.id;message.model=data.message.model;message.usage={...data.message.usage};}
    else if(data.type==='content_block_start'){
      const block=structuredClone(data.content_block);
      if(block.type==='tool_use'){block.input={};json.set(data.index,'');}
      message.content[data.index]=block;onEvent({type:'block_start',block,index:data.index});
    }
    else if(data.type==='content_block_delta'){
      const block=message.content[data.index],delta=data.delta;
      if(delta.type==='text_delta'){block.text=(block.text||'')+delta.text;onEvent({type:'text',text:delta.text,index:data.index});}
      else if(delta.type==='thinking_delta'){block.thinking=(block.thinking||'')+delta.thinking;onEvent({type:'thinking',text:delta.thinking});}
      else if(delta.type==='signature_delta')block.signature=(block.signature||'')+delta.signature;
      else if(delta.type==='input_json_delta'){json.set(data.index,json.get(data.index)+delta.partial_json);onEvent({type:'tool_input',index:data.index,name:block.name});}
      else if(delta.type==='citations_delta'){block.citations=[...(block.citations||[]),delta.citation];}
    }
    else if(data.type==='content_block_stop'){
      const block=message.content[data.index];
      if(block?.type==='tool_use'){
        const raw=json.get(data.index)||'';
        try{block.input=raw?JSON.parse(raw):{};}catch{block.input={};block.invalidInput=true;}
      }
      onEvent({type:'block_stop',block,index:data.index});
    }
    else if(data.type==='message_delta'){message.stop_reason=data.delta?.stop_reason??message.stop_reason;message.stop_details=data.delta?.stop_details;Object.assign(message.usage,data.usage||{});}
  }
  message.content=message.content.filter(Boolean);
  return message;
}

// Strips client-only markers so blocks go back to the API byte-for-byte as received.
const cleanBlock=b=>{if(b.type!=='tool_use'||!('invalidInput' in b))return b;const {invalidInput,...rest}=b;return rest;};

// Agent loop: stream, run requested tools, send all results back in one user message, repeat.
export async function runAgent({settings,messages,system=AI_SYSTEM,tools=AI_TOOLS,ctx,onEvent=()=>{},signal,maxTurns=14,fetchImpl}){
  for(let turn=0;turn<maxTurns;turn++){
    const message=await streamMessage(settings,{system,messages,tools},{onEvent,signal,fetchImpl});
    addUsage(message.usage,settings.model);
    if(message.stop_reason==='refusal')throw new AiError('Claude לא יכול לעזור בבקשה הזו. אפשר לנסח אותה אחרת.',200);
    const toolUses=message.content.filter(b=>b.type==='tool_use');
    if(message.stop_reason==='max_tokens'&&toolUses.length)throw new AiError('התשובה נקטעה לפני שהסתיימה. נסה בקשה ממוקדת יותר.',200);
    messages.push({role:'assistant',content:message.content.map(cleanBlock)});
    onEvent({type:'assistant_message',message});
    if(message.stop_reason==='pause_turn')continue;
    if(message.stop_reason!=='tool_use'||!toolUses.length)return {message,messages,stop:message.stop_reason};
    const results=await Promise.all(toolUses.map(async block=>{
      if(block.invalidInput)return {type:'tool_result',tool_use_id:block.id,is_error:true,content:'INVALID_JSON: the tool input could not be parsed. Please call the tool again with valid JSON.'};
      onEvent({type:'tool_run',block});
      try{
        const result=await executeAiTool(block.name,block.input,{...ctx,toolUseId:block.id});
        onEvent({type:'tool_done',block,result});
        return {type:'tool_result',tool_use_id:block.id,content:JSON.stringify(result)};
      }catch(err){
        if(err?.name==='AbortError')throw err;
        onEvent({type:'tool_done',block,error:err.message});
        return {type:'tool_result',tool_use_id:block.id,is_error:true,content:String(err.message||err)};
      }
    }));
    messages.push({role:'user',content:results});
  }
  throw new AiError('Claude ביצע יותר מדי צעדים בתשובה אחת. נסה לפצל את הבקשה.',200);
}

// ---------- Attachments ----------
export const ATTACHMENT_LIMIT=8*1024*1024;
export function attachmentBlock(file){
  if(file.kind==='image')return {type:'image',source:{type:'base64',media_type:file.mediaType,data:file.data}};
  if(file.kind==='pdf')return {type:'document',source:{type:'base64',media_type:'application/pdf',data:file.data},title:file.name};
  return {type:'document',source:{type:'text',media_type:'text/plain',data:file.text},title:file.name};
}

// Persisted copy: attachment payloads become placeholders and thinking blocks are dropped,
// so a restored conversation never replays a thinking block whose prefix changed.
export function storableConversation(messages){
  return messages.map(m=>{
    if(typeof m.content==='string')return m;
    const content=m.content.filter(b=>!(m.role==='assistant'&&(b.type==='thinking'||b.type==='redacted_thinking'))).map(b=>b.type==='image'||b.type==='document'?{type:'text',text:`[קובץ מצורף${b.title?': '+b.title:''} — התוכן אינו נשמר במכשיר]`}:b);
    return {...m,content:content.length?content:[{type:'text',text:'…'}]};
  });
}

// ---------- Safe Markdown subset for assistant replies ----------
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g,'$1<i>$2</i>').replace(/`([^`]+)`/g,'<code>$1</code>');
export function markdownLite(text){
  const lines=String(text||'').replace(/\r/g,'').split('\n'),out=[];let list=null,para=[];
  const flush=()=>{if(para.length){out.push(`<p>${para.map(inline).join('<br>')}</p>`);para=[];}if(list){out.push(`</${list}>`);list=null;}};
  for(let i=0;i<lines.length;i++){
    const line=lines[i],trim=line.trim();
    if(!trim){flush();continue;}
    if(/^\|.*\|$/.test(trim)&&/^\|?\s*:?-{2,}/.test((lines[i+1]||'').trim())){
      flush();const cells=r=>r.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      const header=cells(trim);i++;const rows=[];
      while(i+1<lines.length&&/^\|.*\|$/.test(lines[i+1].trim())){rows.push(cells(lines[++i]));}
      out.push(`<div class="table-wrap ai-table"><table><thead><tr>${header.map(c=>`<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue;
    }
    const h=trim.match(/^(#{1,4})\s+(.*)$/);
    if(h){flush();out.push(`<h4>${inline(h[2])}</h4>`);continue;}
    const bullet=trim.match(/^[-*•]\s+(.*)$/),ordered=trim.match(/^\d+[.)]\s+(.*)$/);
    if(bullet||ordered){
      if(para.length){out.push(`<p>${para.map(inline).join('<br>')}</p>`);para=[];}
      const tag=bullet?'ul':'ol';if(list!==tag){if(list)out.push(`</${list}>`);out.push(`<${tag}>`);list=tag;}
      out.push(`<li>${inline((bullet||ordered)[1])}</li>`);continue;
    }
    if(list){out.push(`</${list}>`);list=null;}
    para.push(trim);
  }
  flush();
  return out.join('');
}
