// Minimal .xlsx reader: enough to read the first worksheet of bank, card and broker exports.
// An .xlsx file is a zip of XML parts; entries are stored or deflated (DecompressionStream).

let utf8Decoder=null;
const decodeUtf8=bytes=>(utf8Decoder ||=new TextDecoder()).decode(bytes);
const u16=(b,o)=>b[o]|b[o+1]<<8;
const u32=(b,o)=>(b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24)>>>0;

function zipEntries(bytes){
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(bytes,i)===0x06054b50){eocd=i;break;}
  if(eocd<0)throw new Error('הקובץ אינו קובץ Excel תקין (xlsx).');
  const count=u16(bytes,eocd+10),entries=new Map();
  let p=u32(bytes,eocd+16);
  for(let i=0;i<count;i++){
    if(u32(bytes,p)!==0x02014b50)throw new Error('מבנה קובץ ה־Excel פגום.');
    const method=u16(bytes,p+10),size=u32(bytes,p+20),nameLength=u16(bytes,p+28),extraLength=u16(bytes,p+30),commentLength=u16(bytes,p+32),offset=u32(bytes,p+42);
    entries.set(decodeUtf8(bytes.subarray(p+46,p+46+nameLength)),{method,size,offset});
    p+=46+nameLength+extraLength+commentLength;
  }
  return entries;
}
async function inflateRaw(data){
  const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readEntry(bytes,entry){
  const start=entry.offset+30+u16(bytes,entry.offset+26)+u16(bytes,entry.offset+28),data=bytes.subarray(start,start+entry.size);
  if(entry.method===0)return decodeUtf8(data);
  if(entry.method===8)return decodeUtf8(await inflateRaw(data));
  throw new Error('שיטת הדחיסה של הקובץ אינה נתמכת.');
}
const unescapeXml=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,c)=>c[0]==='#'?String.fromCodePoint(c[1].toLowerCase()==='x'?parseInt(c.slice(2),16):parseInt(c.slice(1),10)):{amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[c.toLowerCase()]);
const textOf=xml=>[...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>unescapeXml(m[1])).join('');
function columnIndex(ref){let n=0;for(const ch of ref.replace(/\d+/g,''))n=n*26+ch.charCodeAt(0)-64;return n-1;}

export function isXlsx(bytes){return bytes.length>4&&u32(bytes,0)===0x04034b50;}

// Returns the first worksheet that has data, as an array of rows (arrays of strings/numbers).
export async function readXlsx(buffer){
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  if(!isXlsx(bytes)){
    if(bytes.length>8&&u32(bytes,0)===0xe011cfd0)throw new Error('קבצי Excel ישנים (xls) אינם נתמכים. שמור את הקובץ כ־xlsx או CSV ונסה שוב.');
    throw new Error('הקובץ אינו קובץ Excel תקין (xlsx).');
  }
  const entries=zipEntries(bytes),read=name=>entries.has(name)?readEntry(bytes,entries.get(name)):Promise.resolve('');
  const shared=[...(await read('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>textOf(m[1]));
  const sheets=[...entries.keys()].filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
  for(const name of sheets){
    const xml=await read(name),rows=[];
    for(const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)){
      const row=[];
      for(const c of r[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
        const attrs=c[1],body=c[2]||'',ref=attrs.match(/\br="([A-Z]+)\d+"/),type=(attrs.match(/\bt="(\w+)"/)||[])[1],raw=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
        let value='';
        if(type==='s')value=shared[Number(raw)]??'';
        else if(type==='inlineStr')value=textOf(body);
        else if(type==='str'||type==='e')value=unescapeXml(raw??'');
        else if(type==='b')value=raw==='1';
        else if(raw!=null&&raw!=='')value=Number(raw);
        row[ref?columnIndex(ref[1]):row.length]=value;
      }
      rows.push(Array.from(row,v=>v??''));
    }
    if(rows.some(r=>r.some(v=>v!==''&&v!=null)))return rows;
  }
  return [];
}

// Excel stores dates as days since 1899-12-30.
export const excelDate=serial=>new Date(Date.UTC(1899,11,30)+Math.round(Number(serial)*86400000)).toISOString().slice(0,10);

// Numbers as they appear in exports: "1,234.56", "1.234,56", "12,5", "-120", "120-", "(120)", "₪ 89.90", "−3%".
export function parseNumber(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  let s=String(value??'').trim();
  if(!s)return null;
  const compact=s.replace(/[\s‎‏₪$€£%]/g,''),negative=/^\(.*\)$/.test(compact)||/^[-−–]/.test(compact)||/[-−–]$/.test(compact);
  s=compact.replace(/[^\d.,]/g,'');
  if(!/\d/.test(s))return null;
  const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
  if(comma>-1&&dot>-1)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(comma>-1){const parts=s.split(',');s=parts.length===2&&parts[1].length!==3?parts.join('.'):s.replace(/,/g,'');}
  else if((s.match(/\./g)||[]).length>1)s=s.replace(/\./g,'');
  const n=Number(s);
  return Number.isFinite(n)?(negative?-n:n):null;
}

function splitDelimited(text,delimiter){
  const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}
    else if(c===delimiter&&!quote){row.push(cell.trim());cell='';}
    else if(c==='\n'&&!quote){row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  return rows;
}
// Text copied from a web table or Excel (tabs), CSV/semicolon exports, or columns aligned with spaces.
export function textToRows(text){
  const clean=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),lines=clean.split('\n').filter(l=>l.trim());
  if(!lines.length)return [];
  const head=lines.slice(0,25),most=test=>head.filter(test).length>=Math.ceil(head.length*.8);
  const consistent=ch=>{const counts=head.map(l=>splitDelimited(l,ch)[0]?.length||1);return counts[0]>1&&most((l,i)=>counts[head.indexOf(l)]===counts[0]);};
  const thousandsOnly=head.every(l=>!l.replace(/\d,\d{3}(?!\d)/g,'').includes(','));
  if(head.some(l=>l.includes('\t')))return lines.map(l=>l.split('\t').map(c=>c.trim()));
  if(most(l=>/\S\s{2,}\S/.test(l.trim())))return lines.map(l=>l.trim().split(/\s{2,}|\s*\|\s*/).map(c=>c.trim()).filter(Boolean));
  if(consistent(';'))return splitDelimited(clean,';');
  if(!thousandsOnly&&consistent(','))return splitDelimited(clean,',');
  // Single spaces: the trailing numeric tokens are values, everything before them is the name.
  return lines.map(l=>{const tokens=l.trim().split(/\s+/);let i=tokens.length;while(i>1&&parseNumber(tokens[i-1])!=null)i--;return [tokens.slice(0,i).join(' '),...tokens.slice(i)];});
}
