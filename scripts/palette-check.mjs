// Colour palettes (4.2): checks src/ui/tokens.css against the list in src/palette.js, and the contrast of every
// text colour on the glass it really sits on — the frosted fill composited over the saturated glow mesh over the
// page colour — for every palette × theme. Run: node scripts/palette-check.mjs   (exit code 1 on any failure)
// The helpers are exported for src/palette.test.js and scripts/build.mjs (the pre-paint theme-color map).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

// ---------- Colour values ----------
const clamp=(v,lo=0,hi=255)=>Math.min(hi,Math.max(lo,v));
// Split on commas that are not inside parentheses.
export function splitTop(str,sep=','){
  const out=[];let depth=0,cur='';
  for(const ch of str){if(ch==='(')depth++;else if(ch===')')depth--;if(ch===sep&&depth===0){out.push(cur.trim());cur='';}else cur+=ch;}
  if(cur.trim())out.push(cur.trim());return out;
}
// {r,g,b,a}: channels 0–255, alpha 0–1. Supports #rgb/#rrggbb/#rrggbbaa, rgb()/rgba() (comma or space syntax),
// transparent, and color-mix(in srgb, A p%, B q%) with premultiplied alpha, as browsers mix.
export function parseColor(str){
  const s=String(str).trim();
  if(s==='transparent')return {r:0,g:0,b:0,a:0};
  if(s==='white')return {r:255,g:255,b:255,a:1};
  if(s==='black')return {r:0,g:0,b:0,a:1};
  let m=s.match(/^#([0-9a-f]{3,8})$/i);
  if(m){let h=m[1];if(h.length===3)h=[...h].map(c=>c+c).join('');
    if(h.length!==6&&h.length!==8)return null;
    return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16),a:h.length===8?parseInt(h.slice(6,8),16)/255:1};}
  m=s.match(/^rgba?\((.*)\)$/i);
  if(m){const parts=m[1].includes(',')?m[1].split(',').map(x=>x.trim()):m[1].replace('/',' / ').split(/\s+/).filter(x=>x&&x!=='/');
    const n=v=>v.endsWith('%')?parseFloat(v)/100:parseFloat(v);
    const [r,g,b,a=1]=parts.map((v,i)=>i<3?(v.endsWith('%')?parseFloat(v)*2.55:parseFloat(v)):n(v));
    return {r,g,b,a};}
  m=s.match(/^color-mix\(\s*in\s+srgb\s*,(.*)\)$/i);
  if(m){const [x,y]=splitTop(m[1]);
    const part=t=>{const mm=t.match(/^(.*?)(?:\s+([\d.]+)%)?$/);return {c:parseColor(mm[1]),p:mm[2]!=null?parseFloat(mm[2])/100:null};};
    const A=part(x),B=part(y);if(!A.c||!B.c)return null;
    let pa=A.p,pb=B.p;if(pa==null&&pb==null)pa=pb=.5;else if(pa==null)pa=1-pb;else if(pb==null)pb=1-pa;
    const sum=pa+pb,mult=Math.min(1,sum);pa/=sum;pb/=sum;
    const a=A.c.a*pa+B.c.a*pb;if(a===0)return {r:0,g:0,b:0,a:0};
    const ch=k=>(A.c[k]*A.c.a*pa+B.c[k]*B.c.a*pb)/a;
    return {r:ch('r'),g:ch('g'),b:ch('b'),a:a*mult};}
  return null;
}
export const hex=c=>'#'+[c.r,c.g,c.b].map(v=>Math.round(clamp(v)).toString(16).padStart(2,'0')).join('').toUpperCase();
// Source-over compositing in sRGB (how browsers blend by default).
export function over(fg,bg){
  const a=fg.a+bg.a*(1-fg.a);if(a===0)return {r:0,g:0,b:0,a:0};
  const ch=k=>(fg[k]*fg.a+bg[k]*bg.a*(1-fg.a))/a;
  return {r:ch('r'),g:ch('g'),b:ch('b'),a};
}
// The CSS saturate() filter matrix (applied by backdrop-filter to what is behind the glass).
export function saturate(c,s){
  const {r,g,b}=c;
  return {r:clamp((.213+.787*s)*r+(.715-.715*s)*g+(.072-.072*s)*b),
    g:clamp((.213-.213*s)*r+(.715+.285*s)*g+(.072-.072*s)*b),
    b:clamp((.213-.213*s)*r+(.715-.715*s)*g+(.072+.928*s)*b),a:c.a};
}
const lin=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};
export const luminance=c=>.2126*lin(c.r)+.7152*lin(c.g)+.0722*lin(c.b);
// WCAG contrast; a translucent foreground is first composited over the background.
export function contrast(fg,bg){
  const f=fg.a<1?over(fg,bg):fg,l1=luminance(f),l2=luminance(bg);
  return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
}
// Samples of a linear-gradient(angle, c1 [p1], c2 [p2], …) from start to end (premultiplied interpolation).
export function gradientSamples(str,n=11){
  const m=String(str).trim().match(/^linear-gradient\((.*)\)$/i);if(!m)return null;
  let parts=splitTop(m[1]);if(/^(-?[\d.]+deg|to\s)/.test(parts[0]))parts=parts.slice(1);
  const stops=parts.map((p,i)=>{const mm=p.match(/^(.*?)(?:\s+([\d.]+)%)?$/);return {c:parseColor(mm[1]),pos:mm[2]!=null?parseFloat(mm[2])/100:null};});
  if(stops.some(s=>!s.c))return null;
  stops.forEach((s,i)=>{if(s.pos==null)s.pos=stops.length===1?0:i/(stops.length-1);});
  const at=t=>{let i=0;while(i<stops.length-1&&t>stops[i+1].pos)i++;
    const A=stops[i],B=stops[Math.min(i+1,stops.length-1)];const span=B.pos-A.pos,k=span>0?clamp((t-A.pos)/span,0,1):0;
    return mixRGBA(A.c,B.c,k);};
  return Array.from({length:n},(_,i)=>at(i/(n-1)));
}
function mixRGBA(A,B,k){const a=A.a*(1-k)+B.a*k;if(!a)return {r:0,g:0,b:0,a:0};const ch=x=>(A[x]*A.a*(1-k)+B[x]*B.a*k)/a;return {r:ch('r'),g:ch('g'),b:ch('b'),a};}

// ---------- tokens.css ----------
const stripComments=css=>css.replace(/\/\*[\s\S]*?\*\//g,'');
// Top-level rules as {selector, body, at} (at = the enclosing at-rule prelude, '' at top level).
export function cssRules(css,at=''){
  const src=stripComments(css),out=[];let i=0;
  while(i<src.length){
    const open=src.indexOf('{',i);if(open<0)break;
    const prelude=src.slice(i,open).trim();let depth=1,j=open+1;
    while(j<src.length&&depth){if(src[j]==='{')depth++;else if(src[j]==='}')depth--;j++;}
    const body=src.slice(open+1,j-1);
    if(prelude.startsWith('@'))out.push(...cssRules(body,(at?at+' ':'')+prelude));
    else out.push({selector:prelude.replace(/\s+/g,' '),body,at});
    i=j;
  }
  return out;
}
export function declarations(body){
  const out={};
  for(const d of splitTop(body,';')){const k=d.indexOf(':');if(k<0)continue;const name=d.slice(0,k).trim();if(name.startsWith('--'))out[name]=d.slice(k+1).trim();}
  return out;
}
// Every palette token a [data-palette] block must define, in both themes.
export const PALETTE_TOKENS=['--bg','--glass-tint','--theme-color','--accent','--accent-hover','--accent-contrast','--accent-text','--accent-soft','--accent-vivid',
  '--accent-2','--accent-2-soft','--accent-2-vivid','--accent-3','--accent-3-soft','--accent-3-vivid','--accent-grad','--hero-gradient',
  '--mesh-1','--mesh-2','--mesh-3','--chart-1','--chart-2','--chart-3','--chart-4','--chart-5','--chart-6','--focus-color'];
// The palette blocks of tokens.css: {default, ids, blocks:{id:{light:{…}, dark:{…}}}, base, themes:{light, dark}}.
export function paletteModel(css){
  const rules=cssRules(css).filter(r=>!r.at),blocks={};let def=null;
  const base={},themes={light:{},dark:{}};
  for(const r of rules){
    const sels=splitTop(r.selector);
    const ids=[...new Set(sels.flatMap(s=>[...s.matchAll(/\[data-palette="([\w-]+)"\]/g)].map(m=>m[1])))];
    const decl=declarations(r.body);
    if(ids.length){
      if(ids.length!==1)throw new Error(`One palette per rule: ${r.selector}`);
      const id=ids[0],theme=sels.some(s=>s.includes('[data-theme="dark"]'))?'dark':'light';
      blocks[id]=blocks[id]||{};
      if(blocks[id][theme])throw new Error(`Palette ${id} has two ${theme} blocks`);
      blocks[id][theme]=decl;
      if(sels.includes(':root')||sels.includes('[data-theme="dark"]')){if(def&&def!==id)throw new Error(`Two default palettes: ${def}, ${id}`);def=id;}
    }
    else if(r.selector===':root')Object.assign(base,decl);
    else if(sels.includes('[data-theme="light"]'))Object.assign(themes.light,decl);
    else if(r.selector==='[data-theme="dark"]')Object.assign(themes.dark,decl);
  }
  return {default:def,ids:Object.keys(blocks),blocks,base,themes};
}
// The custom properties in effect on <html> for one palette and theme (the same cascade as the browser's).
export function tokensFor(model,id,theme){
  return {...model.base,...model.themes[theme],...model.blocks[model.default]?.[theme],...model.blocks[id]?.[theme]};
}
export function resolve(value,tokens,seen=new Set()){
  return String(value).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))*[^()]*))?\)/g,(all,name,fb)=>{
    if(seen.has(name))throw new Error(`Circular ${name}`);
    if(tokens[name]==null){if(fb!=null)return resolve(fb,tokens,seen);throw new Error(`Undefined ${name}`);}
    return resolve(tokens[name],tokens,new Set([...seen,name]));
  });
}
export function colorOf(tokens,name){
  const raw=resolve(`var(${name})`,tokens),c=parseColor(raw);
  if(!c)throw new Error(`${name} is not a colour: ${raw}`);return c;
}
// {id:{light:'#…', dark:'#…'}} for the meta theme-color, read from each palette's --theme-color.
export function themeColors(css){
  const model=paletteModel(css),out={};
  for(const id of model.ids)out[id]={light:hex(colorOf(tokensFor(model,id,'light'),'--theme-color')),dark:hex(colorOf(tokensFor(model,id,'dark'),'--theme-color'))};
  return out;
}

// ---------- The surfaces text sits on ----------
// Where the page shows: the plain page colour, the centre of each glow at its full strength, and the zones where
// two glows overlap (each at 60% of its peak — the radial glows sit in different corners and fade out, so their
// peaks never meet).
export function surfaces(tokens){
  const col=n=>colorOf(tokens,n),sat=parseFloat(resolve('var(--glass-sat)',tokens))/100;
  const bg=col('--bg'),m=[col('--mesh-1'),col('--mesh-2'),col('--mesh-3')],part=c=>({...c,a:c.a*.6});
  const backs={page:bg,glow1:over(m[0],bg),glow2:over(m[1],bg),glow3:over(m[2],bg),
    glow12:over(part(m[1]),over(part(m[0]),bg)),glow23:over(part(m[2]),over(part(m[1]),bg)),glow13:over(part(m[2]),over(part(m[0]),bg))};
  const out=[];
  for(const [where,B] of Object.entries(backs)){
    const card=over(col('--glass'),saturate(B,sat));
    const dialog=over(col('--elevated'),saturate(over(col('--scrim'),B),sat));
    out.push({name:`page/${where}`,c:B,kind:'page'},{name:`card/${where}`,c:card,kind:'card'},
      {name:`tile/${where}`,c:over(col('--glass-tile'),card),kind:'tile'},{name:`field/${where}`,c:over(col('--surface'),card),kind:'field'},
      {name:`bar/${where}`,c:over(col('--glass-strong'),saturate(B,sat)),kind:'bar'},
      {name:`dialog/${where}`,c:dialog,kind:'dialog'},{name:`dialog-tile/${where}`,c:over(col('--glass-tile'),dialog),kind:'tile'});
  }
  return out;
}

// ---------- The checks ----------
const TEXT=4.5,GRAPHIC=3;
export function checkPalette(model,id,theme){
  const t=tokensFor(model,id,theme),fails=[],col=n=>colorOf(t,n),S=surfaces(t);
  let worst=Infinity,count=0;
  const need=(label,fg,bg,min=TEXT)=>{const r=contrast(fg,bg);count++;worst=Math.min(worst,r);if(r<min-1e-9)fails.push(`${id}/${theme}: ${label} ${r.toFixed(2)} < ${min}`);};
  const on=(name,kinds,min=TEXT)=>{const fg=col(name);for(const s of S)if(kinds.includes(s.kind))need(`${name} on ${s.name} (${hex(s.c)})`,fg,s.c,min);};
  const all=['page','card','tile','field','bar','dialog'];
  for(const n of ['--text','--text-muted','--text-subtle'])on(n,all);
  on('--chart-axis',['card','tile']);
  on('--accent-text',all);
  for(const n of ['--accent-2','--accent-3','--positive','--negative','--warning'])on(n,['card','tile','dialog']);
  // Tinted chips: the colour as text on its own soft tint over a card.
  const cards=S.filter(s=>s.kind==='card');
  for(const [fg,soft] of [['--accent-text','--accent-soft'],['--accent-2','--accent-2-soft'],['--accent-3','--accent-3-soft'],['--positive','--positive-soft'],['--negative','--negative-soft'],['--warning','--warning-soft']])
    for(const s of cards)need(`${fg} on ${soft} over ${s.name}`,col(fg),over(col(soft),s.c));
  // Text on the accent fills: the solid accent, its hover and every point along the gradient.
  const ink=col('--accent-contrast');
  need('--accent-contrast on --accent',ink,col('--accent'));need('--accent-contrast on --accent-hover',ink,col('--accent-hover'));
  const grad=gradientSamples(resolve('var(--accent-grad)',t));if(!grad)fails.push(`${id}/${theme}: --accent-grad is not a linear-gradient`);
  else grad.forEach((c,i)=>need(`--accent-contrast on --accent-grad @${i*10}%`,ink,c));
  const hero=gradientSamples(resolve('var(--hero-gradient)',t));if(!hero)fails.push(`${id}/${theme}: --hero-gradient is not a linear-gradient`);
  else for(const n of ['--hero-text','--hero-text-muted'])hero.forEach((c,i)=>need(`${n} on --hero-gradient @${i*10}%`,col(n),c));
  for(const n of ['--toast-text','--toast-muted','--toast-accent','--toast-ok','--toast-err'])need(`${n} on --toast-bg`,col(n),col('--toast-bg'));
  // Marks (chart series, focus ring) against the card: 3:1 for graphics.
  for(const n of ['--chart-1','--chart-2','--chart-3','--chart-4','--chart-5','--chart-6','--focus-color'])for(const s of cards)need(`${n} vs ${s.name}`,col(n),s.c,GRAPHIC);
  return {fails,worst,count};
}
// Structure: the CSS palettes are exactly the JS list, each with every token in both themes, and the theme blocks
// never define a palette token (they would fight the palette blocks, which share their specificity).
export function checkStructure(model,list,defaultId){
  const errs=[],ids=list.map(p=>p.id);
  if(model.default!==defaultId)errs.push(`Default palette in CSS is ${model.default}, in JS ${defaultId}`);
  for(const id of ids)if(!model.blocks[id])errs.push(`Palette ${id} is in src/palette.js but not in tokens.css`);
  for(const id of model.ids)if(!ids.includes(id))errs.push(`Palette ${id} is in tokens.css but not in src/palette.js`);
  for(const id of model.ids)for(const theme of ['light','dark']){
    const b=model.blocks[id][theme];if(!b){errs.push(`Palette ${id} has no ${theme} block`);continue;}
    for(const k of PALETTE_TOKENS)if(!(k in b))errs.push(`Palette ${id}/${theme} lacks ${k}`);
    for(const k of Object.keys(b))if(!PALETTE_TOKENS.includes(k))errs.push(`Palette ${id}/${theme} defines ${k}, which is not a palette token`);
  }
  for(const theme of ['light','dark'])for(const k of PALETTE_TOKENS)if(k in model.themes[theme]||k in model.base)errs.push(`${k} is defined outside the palette blocks (${theme})`);
  return errs;
}

export function runCheck(css=fs.readFileSync(path.join(root,'src/ui/tokens.css'),'utf8'),list,defaultId){
  const model=paletteModel(css),errors=checkStructure(model,list,defaultId),rows=[];
  if(!errors.length)for(const p of list)for(const theme of ['light','dark']){const r=checkPalette(model,p.id,theme);errors.push(...r.fails);rows.push({id:p.id,name:p.name,theme,worst:r.worst,count:r.count});}
  return {errors,rows};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const {APP_PALETTES,DEFAULT_APP_PALETTE}=await import(pathToFileURL(path.join(root,'src/palette.js')).href);
  const {errors,rows}=runCheck(undefined,APP_PALETTES,DEFAULT_APP_PALETTE);
  for(const r of rows)console.log(`${r.id.padEnd(14)} ${r.theme.padEnd(5)} ${String(r.count).padStart(4)} pairs, lowest ${r.worst.toFixed(2)}:1  ${r.name}`);
  if(errors.length){console.error(`\n${errors.length} problem(s):\n`+errors.slice(0,80).join('\n'));process.exit(1);}
  console.log(`\nPASS: ${rows.length/2} palettes × 2 themes, every text pair ≥ ${TEXT}:1 and every mark ≥ ${GRAPHIC}:1 on the composited glass.`);
}
