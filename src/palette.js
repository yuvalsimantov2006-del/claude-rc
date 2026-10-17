// Colour palettes (4.2): the list, its Hebrew names and the device-only choice. Pure: no DOM, no storage access.
// The colours live in src/ui/tokens.css, one [data-palette="id"] block per theme; src/palette.test.js and
// scripts/palette-check.mjs fail when the two drift apart, and check every palette's contrast on the glass.
// The choice is a device preference like the light/dark theme ('ofek-palette' in localStorage), never part of
// the data, backups or sync. The pre-paint script in scripts/build.mjs applies it before the first frame.
export const APP_PALETTE_KEY='ofek-palette';
export const DEFAULT_APP_PALETTE='ocean';
// Twelve palettes of three colours that go together, then one calm neutral (graphite).
export const APP_PALETTES=[
  {id:'ocean',name:'אוקיינוס',hint:'כחול, תכלת וטורקיז'},
  {id:'sunset',name:'שקיעה',hint:'כתום, ורוד וסגול'},
  {id:'forest',name:'יער',hint:'ירוק, ליים וטורקיז'},
  {id:'lavender',name:'לבנדר',hint:'סגול, אינדיגו וורוד'},
  {id:'aurora',name:'אורורה',hint:'אמרלד, סגול ותכלת'},
  {id:'embers',name:'גחלים',hint:'אדום, ענבר וכתום'},
  {id:'bloom',name:'פריחה',hint:'ורד, אפרסק ואלמוג'},
  {id:'midnight',name:'חצות',hint:'אינדיגו, שמיים וסגול'},
  {id:'mint',name:'מנטה',hint:'מנטה, טורקיז וליים'},
  {id:'desert',name:'מדבר',hint:'טרקוטה, חול וזית'},
  {id:'cherry',name:'דובדבן',hint:'דובדבן, מג׳נטה ושזיף'},
  {id:'mediterranean',name:'ים תיכון',hint:'תכלת, טורקיז ושמש'},
  {id:'graphite',name:'גרפיט',hint:'אפור שקט עם כחול אחד',calm:true}
];
// Any stored value that is not a known palette id (missing, old, tampered) means the default.
export function normalizeAppPalette(value){return APP_PALETTES.some(p=>p.id===value)?value:DEFAULT_APP_PALETTE;}
export function appPaletteById(id){const want=normalizeAppPalette(id);return APP_PALETTES.find(p=>p.id===want);}
// Arrow-key movement in the swatch grid (a radio group): wraps around at both ends.
export function stepAppPalette(id,delta){
  const i=APP_PALETTES.findIndex(p=>p.id===normalizeAppPalette(id)),n=APP_PALETTES.length;
  return APP_PALETTES[((i+delta)%n+n)%n].id;
}
// The browser-bar colour for a palette and theme, from a {id:{light,dark}} map (built from tokens.css).
export function appThemeColor(map,id,theme){
  const row=map?.[normalizeAppPalette(id)]||map?.[DEFAULT_APP_PALETTE];
  return row?.[theme==='dark'?'dark':'light']||null;
}
