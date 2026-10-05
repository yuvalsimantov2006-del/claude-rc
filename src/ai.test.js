import test from 'node:test';
import assert from 'node:assert/strict';
import {demoData} from './data.js';

const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const {buildRequest,streamMessage,runAgent,executeAiTool,financialContext,storableConversation,markdownLite,normalizeProposedTransaction,aiSettings,AI_TOOLS,AiError}=await import('./ai.js');

const settings={...aiSettings(),apiKey:'sk-test',model:'claude-opus-5-5'};
const sse=events=>events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
function fakeResponse(text,{status=200,chunk=17}={}){
  const bytes=new TextEncoder().encode(text);let i=0;
  return {ok:status<300,status,json:async()=>JSON.parse(text),body:new ReadableStream({pull(c){if(i>=bytes.length)return c.close();c.enqueue(bytes.slice(i,i+chunk));i+=chunk;}})};
}
const textReply=(text,extra=[])=>sse([{type:'message_start',message:{id:'m1',model:'claude-opus-5-5',usage:{input_tokens:100,output_tokens:1}}},...extra,{type:'content_block_start',index:extra.length?1:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:extra.length?1:0,delta:{type:'text_delta',text:text.slice(0,4)}},{type:'ping'},{type:'content_block_delta',index:extra.length?1:0,delta:{type:'text_delta',text:text.slice(4)}},{type:'content_block_stop',index:extra.length?1:0},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:20}},{type:'message_stop'}]);
const toolReply=(name,input,id='tu1')=>sse([{type:'message_start',message:{id:'m0',model:'claude-opus-5-5',usage:{input_tokens:50,output_tokens:1}}},{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'',signature:''}},{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'בודק נתונים'}},{type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'sig=='}},{type:'content_block_stop',index:0},{type:'content_block_start',index:1,content_block:{type:'tool_use',id,name,input:{}}},{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:JSON.stringify(input).slice(0,5)}},{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:JSON.stringify(input).slice(5)}},{type:'content_block_stop',index:1},{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:30}},{type:'message_stop'}]);

test('request carries browser headers, adaptive thinking, effort and server-side fallbacks',()=>{
  const r=buildRequest(settings,{system:'s',messages:[],tools:AI_TOOLS});
  assert.equal(r.url,'https://api.anthropic.com/v1/messages');
  assert.equal(r.headers['anthropic-dangerous-direct-browser-access'],'true');
  assert.equal(r.headers['anthropic-version'],'2023-06-01');
  assert.equal(r.headers['anthropic-beta'],'server-side-fallback-2026-07-01');
  assert.equal(r.body.fallbacks,'default');
  assert.deepEqual(r.body.thinking,{type:'adaptive',display:'summarized'});
  assert.equal(r.body.output_config.effort,'medium');
  assert.ok(r.body.tools.every(t=>t.eager_input_streaming===true&&t.input_schema.additionalProperties===false));
  const haiku=buildRequest({...settings,model:'claude-haiku-4-5'},{system:'s',messages:[]});
  assert.equal(haiku.body.thinking,undefined);assert.equal(haiku.body.fallbacks,undefined);assert.equal(haiku.headers['anthropic-beta'],undefined);
});

test('stream assembles text across chunk boundaries and reports usage',async()=>{
  const seen=[];
  const m=await streamMessage(settings,{system:'s',messages:[{role:'user',content:'hi'}]},{fetchImpl:async()=>fakeResponse(textReply('שלום לך, דניאל')),onEvent:e=>e.type==='text'&&seen.push(e.text)});
  assert.equal(m.content[0].text,'שלום לך, דניאל');
  assert.equal(seen.join(''),'שלום לך, דניאל');
  assert.equal(m.stop_reason,'end_turn');assert.equal(m.usage.output_tokens,20);
});

test('HTTP errors become friendly Hebrew messages',async()=>{
  await assert.rejects(streamMessage(settings,{system:'s',messages:[]},{fetchImpl:async()=>fakeResponse(JSON.stringify({error:{type:'authentication_error',message:'bad'}}),{status:401})}),err=>err instanceof AiError&&err.status===401&&/מפתח/.test(err.message));
});

test('agent loop runs a tool, keeps thinking blocks and sends one tool_result message',async()=>{
  const bodies=[];let call=0;
  const fetchImpl=async(url,init)=>{bodies.push(JSON.parse(init.body));return fakeResponse(call++===0?toolReply('get_financial_overview',{month:'2026-09'}):textReply('החיסכון שלך מצוין'));};
  const messages=[{role:'user',content:[{type:'text',text:'איך אני עומד?'}]}];
  const r=await runAgent({settings,messages,ctx:{data:demoData(),month:'2026-09',now:'2026-09-30',approve:async()=>({approved:false})},fetchImpl});
  assert.equal(r.stop,'end_turn');
  assert.equal(messages.length,4);
  assert.equal(messages[1].content[0].type,'thinking');assert.equal(messages[1].content[0].signature,'sig==');
  assert.equal(messages[1].content[1].input.month,'2026-09');
  assert.equal(messages[2].role,'user');assert.equal(messages[2].content[0].type,'tool_result');
  const result=JSON.parse(messages[2].content[0].content);
  assert.ok(result.health.score>0);
  assert.deepEqual(bodies[1].messages[1],messages[1],'assistant turn is echoed back unchanged');
});

test('invalid streamed tool JSON returns an INVALID_JSON error result',async()=>{
  const broken=sse([{type:'message_start',message:{id:'x',usage:{}}},{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'t9',name:'query_transactions',input:{}}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{"lim'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{}}]);
  let call=0;const messages=[{role:'user',content:'x'}];
  await runAgent({settings,messages,ctx:{data:demoData()},fetchImpl:async()=>fakeResponse(call++?textReply('ok'):broken)});
  assert.equal(messages[2].content[0].is_error,true);assert.match(messages[2].content[0].content,/INVALID_JSON/);
  assert.equal('invalidInput' in messages[1].content[0],false);
});

test('refusals stop the loop',async()=>{
  const refusal=sse([{type:'message_start',message:{id:'r',usage:{}}},{type:'message_delta',delta:{stop_reason:'refusal'},usage:{}}]);
  await assert.rejects(runAgent({settings,messages:[{role:'user',content:'x'}],ctx:{data:demoData()},fetchImpl:async()=>fakeResponse(refusal)}),AiError);
});

test('read tools answer from local data',async()=>{
  const d=demoData(),ctx={data:d,month:'2026-09',now:'2026-09-30'};
  const q=await executeAiTool('query_transactions',{category:'מסעדות',from:'2026-09-01',to:'2026-09-30'},ctx);
  assert.equal(q.count,4);assert.ok(q.total_expense>0);
  const b=await executeAiTool('spending_breakdown',{from:'2026-04-01',to:'2026-09-30',group_by:'month'},ctx);
  assert.equal(b.rows.length,6);assert.ok(b.rows[0].key<b.rows[1].key);
  const inv=await executeAiTool('get_investments',{},ctx);
  assert.equal(inv.holdings.length,4);assert.ok(inv.performance_since_first_snapshot.time_weighted_return>0);
  const sim=await executeAiTool('simulate_future',{years:10,target:1000000},ctx);
  assert.equal(sim.years.length,11);assert.ok(sim.probability_of_target>=0);
  await assert.rejects(executeAiTool('render_chart',{chart_type:'bar',title:'x',labels:[],series:[]},ctx));
});

test('propose_transactions validates, waits for approval and reports the outcome',async()=>{
  const d=demoData();let asked;
  const ctx={data:d,now:'2026-09-30',approve:async req=>{asked=req;return {approved:true,saved:req.items.length};}};
  const r=await executeAiTool('propose_transactions',{transactions:[{type:'expense',amount:42.9,date:'2026-09-28',category:'קניות בסופר',description:'שופרסל',account:'מזומן'},{type:'expense',amount:10,date:'2099-01-01',category:'x',description:'future'}]},ctx);
  assert.equal(r.approved,true);assert.equal(r.saved,1);assert.equal(r.skipped_invalid.length,1);
  assert.equal(asked.items[0].accountId,'cash');assert.deepEqual(asked.items[0].tags,['AI']);
  const declined=await executeAiTool('propose_budget',{category:'מסעדות',monthly_limit:600},{data:d,approve:async()=>({approved:false})});
  assert.equal(declined.approved,false);
  assert.ok(normalizeProposedTransaction(d,{type:'expense',amount:-1,date:'2026-01-01'}).error);
});

test('financial context is compact and grounded',()=>{
  const c=financialContext(demoData(),'2026-09','2026-09-30');
  assert.match(c,/^<financial_context>/);assert.match(c,/net_worth/);assert.match(c,/demo data/);
  assert.ok(c.length<6000);
});

test('stored conversations drop attachments and thinking blocks',()=>{
  const stored=storableConversation([{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/png',data:'AAAA'}},{type:'text',text:'קבלה'}]},{role:'assistant',content:[{type:'thinking',thinking:'',signature:'s'},{type:'text',text:'ok'}]}]);
  assert.equal(stored[0].content[0].type,'text');assert.doesNotMatch(JSON.stringify(stored),/AAAA/);
  assert.deepEqual(stored[1].content,[{type:'text',text:'ok'}]);
});

test('markdown renderer escapes HTML and supports lists and tables',()=>{
  const html=markdownLite('### סיכום\n**חשוב** <img src=x onerror=alert(1)>\n- אחת\n- שתיים\n\n| קטגוריה | סכום |\n|---|---|\n| אוכל | 100 |');
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
  assert.match(html,/<h4>סיכום<\/h4>/);assert.match(html,/<b>חשוב<\/b>/);assert.match(html,/<ul><li>אחת<\/li><li>שתיים<\/li><\/ul>/);assert.match(html,/<td>אוכל<\/td>/);
});
