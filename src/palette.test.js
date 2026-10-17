import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {APP_PALETTES,APP_PALETTE_KEY,DEFAULT_APP_PALETTE,normalizeAppPalette,appPaletteById,stepAppPalette,appThemeColor} from './palette.js';
import {parseColor,contrast,over,gradientSamples,paletteModel,checkStructure,themeColors,runCheck,PALETTE_TOKENS} from '../scripts/palette-check.mjs';

const css=fs.readFileSync(new URL('./ui/tokens.css',import.meta.url),'utf8');

test('the palette list: at least 12 colour palettes plus a calm one, unique ids, Hebrew names',()=>{
  assert.ok(APP_PALETTES.length>=13);
  assert.equal(new Set(APP_PALETTES.map(p=>p.id)).size,APP_PALETTES.length);
  for(const p of APP_PALETTES){assert.match(p.id,/^[a-z]+$/);assert.match(p.name,/[֐-׿]/);assert.match(p.hint,/[֐-׿]/);}
  assert.equal(APP_PALETTES.filter(p=>!p.calm).length>=12,true);
  assert.ok(APP_PALETTES.some(p=>p.id==='graphite'&&p.calm));
  assert.equal(APP_PALETTES[0].id,DEFAULT_APP_PALETTE);
  assert.equal(APP_PALETTE_KEY,'ofek-palette');
});

test('a missing, unknown or hostile stored value means the default palette',()=>{
  for(const v of [null,undefined,'','Ocean','nope','__proto__','constructor','toString',' ocean',42,{}])assert.equal(normalizeAppPalette(v),DEFAULT_APP_PALETTE);
  for(const p of APP_PALETTES)assert.equal(normalizeAppPalette(p.id),p.id);
  assert.equal(appPaletteById('sunset').name,'שקיעה');
  assert.equal(appPaletteById('???').id,DEFAULT_APP_PALETTE);
});

test('arrow keys walk the palettes and wrap at both ends',()=>{
  const ids=APP_PALETTES.map(p=>p.id);
  assert.equal(stepAppPalette(ids[0],1),ids[1]);
  assert.equal(stepAppPalette(ids[0],-1),ids.at(-1));
  assert.equal(stepAppPalette(ids.at(-1),1),ids[0]);
  assert.equal(stepAppPalette('unknown',1),ids[1]);
});

test('tokens.css defines exactly the listed palettes, each with every token in both themes',()=>{
  const model=paletteModel(css);
  assert.deepEqual(checkStructure(model,APP_PALETTES,DEFAULT_APP_PALETTE),[]);
  assert.deepEqual([...model.ids].sort(),APP_PALETTES.map(p=>p.id).sort());
  for(const id of model.ids)for(const theme of ['light','dark'])assert.deepEqual(Object.keys(model.blocks[id][theme]).sort(),[...PALETTE_TOKENS].sort());
});

test('drift is caught: a palette missing from the CSS, an extra one, or a missing token',()=>{
  const model=paletteModel(css);
  assert.ok(checkStructure(model,[...APP_PALETTES,{id:'neon',name:'ניאון',hint:'—'}],DEFAULT_APP_PALETTE).some(e=>e.includes('neon')));
  assert.ok(checkStructure(model,APP_PALETTES.filter(p=>p.id!=='mint'),DEFAULT_APP_PALETTE).some(e=>e.includes('mint')));
  const broken=css.replace(/(\[data-palette="desert"\] \{[^}]*?)--accent-grad:[^;]*;/,'$1');
  assert.ok(checkStructure(paletteModel(broken),APP_PALETTES,DEFAULT_APP_PALETTE).some(e=>e.includes('desert/light lacks --accent-grad')));
  assert.ok(checkStructure(model,APP_PALETTES,'sunset').some(e=>e.includes('Default palette')));
});

test('every palette passes the contrast check on the composited glass, in both themes',()=>{
  const {errors,rows}=runCheck(css,APP_PALETTES,DEFAULT_APP_PALETTE);
  assert.deepEqual(errors,[]);
  assert.equal(rows.length,APP_PALETTES.length*2);
});

test('the browser-bar colours: one per palette and theme, read from tokens.css',()=>{
  const map=themeColors(css);
  assert.deepEqual(Object.keys(map).sort(),APP_PALETTES.map(p=>p.id).sort());
  for(const row of Object.values(map))for(const v of [row.light,row.dark])assert.match(v,/^#[0-9A-F]{6}$/);
  assert.equal(appThemeColor(map,'forest','dark'),map.forest.dark);
  assert.equal(appThemeColor(map,'nope','light'),map[DEFAULT_APP_PALETTE].light);
  assert.equal(appThemeColor(null,'forest','light'),null);
});

test('colour maths: parsing, compositing, color-mix and gradients',()=>{
  assert.equal(contrast(parseColor('#FFFFFF'),parseColor('#000000')).toFixed(1),'21.0');
  assert.deepEqual(parseColor('#abc'),{r:170,g:187,b:204,a:1});
  assert.deepEqual(parseColor('rgba(10, 20, 30, .5)'),{r:10,g:20,b:30,a:.5});
  const mix=parseColor('color-mix(in srgb, #FFFFFF 60%, transparent)');
  assert.equal(mix.r,255);assert.ok(Math.abs(mix.a-.6)<1e-9);
  const half=over({r:0,g:0,b:0,a:.5},parseColor('#FFFFFF'));assert.equal(Math.round(half.r),128);
  const g=gradientSamples('linear-gradient(135deg, #000000 0%, #FFFFFF 100%)',3);
  assert.equal(g.length,3);assert.equal(Math.round(g[1].r),128);
});

test('the palette choice is a device preference, never part of the data',()=>{
  const src=fs.readFileSync(new URL('./palette-ui.js',import.meta.url),'utf8');
  assert.ok(src.includes('APP_PALETTE_KEY'));
  assert.ok(!/\bdata\.(palette|appPalette)\b/.test(src));
  for(const f of ['data.js','backup.js','sync.js'])assert.ok(!fs.readFileSync(new URL('./'+f,import.meta.url),'utf8').includes('ofek-palette'));
});
