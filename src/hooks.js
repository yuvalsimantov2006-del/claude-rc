// Module hooks (4.1). Core files call moduleHook(name,fallback,...args); 4.1 module UI files register
// handlers at top level with onModuleHook(name,fn). This file loads right after finance.js (build order),
// so the registry exists before any module registers. A failing handler is logged and skipped, never fatal.
// Results: a string fallback concatenates the handlers' strings; an array fallback concatenates their arrays;
// a boolean fallback ORs them; any other fallback is replaced by the last result that is not undefined.
const MODULE_HOOKS=new Map();
export function onModuleHook(name,fn){if(!MODULE_HOOKS.has(name))MODULE_HOOKS.set(name,[]);MODULE_HOOKS.get(name).push(fn);}
export function moduleHook(name,fallback,...args){
  let out=Array.isArray(fallback)?[...fallback]:fallback;
  for(const fn of MODULE_HOOKS.get(name)||[]){
    try{const v=fn(...args);if(v===undefined)continue;
      if(Array.isArray(fallback))out=out.concat(Array.isArray(v)?v:[v]);
      else if(typeof fallback==='string')out+=String(v);
      else if(typeof fallback==='boolean')out=out||!!v;
      else out=v;}
    catch(err){try{console.error(`moduleHook ${name}:`,err);}catch{}}
  }
  return out;
}
