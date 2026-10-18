// נועה — the build. Concatenates noa/src/*.js in a fixed order into ONE shared top-level scope (import lines are
// stripped and `export` dropped, exactly like Ofek's scripts/build.mjs), and noa/src/ui/*.css in a fixed order;
// embeds the Hebrew font from ../vendor (SIL OFL); adds the pre-paint script (theme LIGHT and palette rose by
// default, the browser-bar colour, and a cover while the lock screen is coming); writes noa/dist/index.html AND
// noa/index.html, and copies noa/public/* (manifest, service worker, icons) next to both.
//   NOA_OUT=<file> node noa/scripts/build.mjs   writes only that HTML file (private builds for design and QA).
// Files in the lists that do not exist yet are skipped (the section lanes add theirs later), and every top-level
// name must be unique across files: a duplicated `function` would otherwise silently replace the earlier one.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {paletteModel,checkStructure,themeColors} from './palette-check.mjs';
import {NOA_PALETTES,DEFAULT_PALETTE,PALETTE_KEY,THEME_KEY,DEFAULT_THEME} from '../src/palette.js';

const root=path.resolve(import.meta.dirname,'..');
const repo=path.resolve(root,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const exists=f=>fs.existsSync(path.join(root,f));

// Logic first (pure, tested), then the foundation, then the sections, then the stubs (they fill any section route
// nobody has registered yet), then app.js (boot). scripts/qa.mjs may read this list from here.
export const JS_FILES=[
  'model.js','dates.js','content.js','search.js','ics.js',
  'icons.js','core.js','photos.js','ui.js','palette.js','lock.js','backup.js','shell.js',
  'home.js','setup.js','settings.js','gallery.js',
  'her.js','gifts.js','plans.js','questions.js','places.js','dates-ui.js','memories.js',
  'stubs.js','app.js'
];
export const CSS_FILES=['tokens.css','base.css','components.css','home.css','settings.css',
  'her.css','gifts.css','plans.css','questions.css','places.css','dates.css','memories.css'];

export function build(){
  // Palettes: the CSS palette blocks must match src/palette.js; the pre-paint script gets each palette's
  // browser-bar colour per theme (read from tokens.css, so raw colours stay in that one file).
  const tokensCss=fs.readFileSync(path.join(root,'src/ui/tokens.css'),'utf8');
  const paletteErrors=checkStructure(paletteModel(tokensCss),NOA_PALETTES,DEFAULT_PALETTE);
  if(paletteErrors.length)throw new Error('Palettes out of step (run node noa/scripts/palette-check.mjs):\n'+paletteErrors.join('\n'));
  const barColors=themeColors(tokensCss);

  const font=name=>fs.readFileSync(path.join(repo,'vendor',name)).toString('base64');
  const cssFiles=CSS_FILES.filter(f=>exists('src/ui/'+f));
  const css=`@font-face{font-family:Noa;src:url(data:font/ttf;base64,${font('hebrew-regular.ttf')}) format('truetype');font-weight:400 600;font-display:swap}@font-face{font-family:Noa;src:url(data:font/ttf;base64,${font('hebrew-bold.ttf')}) format('truetype');font-weight:700 900;font-display:swap}\n`
    +cssFiles.map(f=>`/* ${f} */\n`+fs.readFileSync(path.join(root,'src/ui',f),'utf8')).join('\n');

  const files=JS_FILES.filter(f=>exists('src/'+f));
  const sources=files.map(f=>[f,fs.readFileSync(path.join(root,'src',f),'utf8')]);
  const owners=new Map(),clashes=[];
  for(const [file,src] of sources)
    for(const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)|(?:const|let|var|class)\s+([A-Za-z_$][\w$]*))/gm)){
      const name=m[1]||m[2];if(owners.has(name))clashes.push(`${name}: ${owners.get(name)} and ${file}`);else owners.set(name,file);}
  if(clashes.length)throw new Error('Duplicate top-level names (rename one of them):\n'+clashes.join('\n'));
  const js=sources.map(([file,src])=>`// ---- ${file} ----\n`+src.replace(/^import\s[^;]*?;\s*$/gm,'').replace(/^export\s*\{[^}]*\};?\s*$/gm,'').replace(/\bexport\s+(?=(const|function|class|let|var|async))/g,'')).join('\n');
  new Function(js); // syntax check of the whole bundle
  const appJs=`const NOA_VERSION=${JSON.stringify(pkg.version)};\n`+js;

  const favicon=fs.readFileSync(path.join(root,'public/icons/favicon.svg'),'utf8');
  // Pre-paint: theme (light unless he chose dark, or "system" and the device is dark), palette, browser bar, and a
  // cover over the app while a lock is set (lock.js replaces it with the lock screen; no flash of content).
  const prepaint=`(function(){var d=document.documentElement,B=${JSON.stringify(barColors)},t='${DEFAULT_THEME}',c='${DEFAULT_PALETTE}';try{var p=localStorage.getItem('${THEME_KEY}')||'${DEFAULT_THEME}';t=p==='light'||p==='dark'?p:(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var s=localStorage.getItem('${PALETTE_KEY}');if(s&&Object.prototype.hasOwnProperty.call(B,s))c=s;if(localStorage.getItem('noa-lock-v1'))d.classList.add('lock-pending')}catch(e){}d.setAttribute('data-theme',t);d.setAttribute('data-palette',c);try{document.querySelector('meta[name=theme-color]').setAttribute('content',B[c][t])}catch(e){}})()`;
  const html=`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="${barColors[DEFAULT_PALETTE].light}"><meta name="color-scheme" content="light dark"><script>${prepaint}</script><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="נועה"><meta name="robots" content="noindex"><link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png"><meta name="description" content="נועה — כל מה שחשוב לדעת עליה ולעשות בשבילה. נשמר רק במכשיר שלך."><title>נועה</title><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(favicon)}"><style>${css}</style></head><body><div id="root"></div><script>(()=>{"use strict";${appJs.replace(/<\/script/gi,'<\\/script')}\n})();</script></body></html>`;
  return {html,files,cssFiles};
}

export function main(){
const {html,files,cssFiles}=build();
const size=Buffer.byteLength(html).toLocaleString('en-US');
if(process.env.NOA_OUT){
  fs.mkdirSync(path.dirname(path.resolve(process.env.NOA_OUT)),{recursive:true});
  fs.writeFileSync(process.env.NOA_OUT,html);
  console.log(`Built ${process.env.NOA_OUT}: ${size} bytes · ${files.length} js · ${cssFiles.length} css.`);
  return;
}
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist/index.html'),html);
fs.writeFileSync(path.join(root,'index.html'),html);
// The installable-app files sit next to both copies, so either noa/ or noa/dist/ can be served (GitHub Pages: /noa/).
const sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8').replace(/const CACHE='noa-[^']*';/,`const CACHE='noa-${pkg.version}';`);
const icons=fs.readdirSync(path.join(root,'public/icons'));
for(const dir of ['dist','.']){
  const out=path.join(root,dir);fs.mkdirSync(path.join(out,'icons'),{recursive:true});
  fs.copyFileSync(path.join(root,'public/manifest.webmanifest'),path.join(out,'manifest.webmanifest'));
  fs.writeFileSync(path.join(out,'sw.js'),sw);
  for(const f of icons)fs.copyFileSync(path.join(root,'public/icons',f),path.join(out,'icons',f));
}
console.log(`Built noa/index.html and noa/dist/index.html: ${size} bytes · ${files.length} js (${files.join(', ')}) · ${cssFiles.length} css. No runtime dependencies; no network calls.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
