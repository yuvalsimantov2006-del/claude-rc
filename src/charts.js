// Chart colours are theme tokens (src/ui/tokens.css), so every chart follows light and dark mode.
// They are written as inline styles: SVG presentation attributes cannot hold var().
export const palette=['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)','var(--chart-6)','var(--chart-5)'];
export const paletteSoft=palette.map(c=>c.replace(')','-soft)'));
export const tone={positive:'var(--positive-vivid)',negative:'var(--negative-vivid)',warning:'var(--warning-vivid)',muted:'var(--chart-muted)'};
// Round axis values (1, 2, 2.5 or 5 × 10ⁿ) instead of arbitrary quarters of the data range.
// minStep keeps whole shekels on money axes (no "0.25 ₪" ticks when every value is zero).
export function niceScale(lo,hi,floor=null,count=4,minStep=0){
  if(!(hi>lo))hi=lo+Math.max(1,minStep*count);
  const raw=(hi-lo)/count,mag=10**Math.floor(Math.log10(raw)),norm=raw/mag,step=Math.max(minStep,(norm<=1?1:norm<=2?2:norm<=2.5?2.5:norm<=5?5:10)*mag);
  let nlo=Math.floor(lo/step+1e-9)*step;if(floor!=null&&nlo<floor)nlo=floor;
  const nhi=Math.ceil(hi/step-1e-9)*step,ticks=[];
  for(let v=nlo;v<=nhi+step/1e6;v+=step)ticks.push(Math.round(v*1e6)/1e6);
  return {lo:nlo,hi:nhi,ticks};
}
// Short axis amounts: "2.5 אלף", "1.2 מ׳".
export const shortAmount=v=>Math.abs(v)>=1e6?`${(v/1e6).toLocaleString('he-IL',{maximumFractionDigits:2})} מ׳`:Math.abs(v)>=1000?`${(v/1000).toLocaleString('he-IL',{maximumFractionDigits:1})} אלף`:Math.round(v).toLocaleString('he-IL');
// The charts are dir=ltr; an RLM keeps Hebrew labels such as "47 אלף" or "פבר׳ 26" in Hebrew reading order.
const svgText=html=>html.replace(/(<text\b[^>]*>)([^<]*[\u0590-\u05ff][^<]*)(<\/text>)/g,(m,open,text,close)=>open+'\u200f'+text+close);
export function graph(data,series=[{key:'net',name:'שווי נקי',color:palette[0]}],{height=230,percent=false,area=false,floor=null}={}){if(!data.length)return empty('ההיסטוריה שלך תתחיל כאן','שמור תמונות מצב כדי לראות את ההתקדמות לאורך זמן.');const W=720,H=height,left=65,right=15,top=22,bottom=35,values=data.flatMap(d=>series.map(s=>d[s.key]).filter(v=>v!=null&&Number.isFinite(v))),min=Math.min(...values),max=Math.max(...values),pad=Math.max((max-min)*.16,max*.02,1),{lo,hi,ticks}=niceScale(floor!=null?Math.max(floor,min-pad):min-pad,max+pad,floor,4,percent?0:1),px=i=>left+(W-left-right)*i/Math.max(1,data.length-1),py=v=>top+(H-top-bottom)*(hi-v)/(hi-lo);const format=v=>percent?`${v.toLocaleString('he-IL',{maximumFractionDigits:1})}%`:shortAmount(v);const grid=ticks.map(v=>{const y=py(v);return `<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" style="stroke:var(--chart-grid)"/><text x="${left-12}" y="${y+4}" style="fill:var(--chart-axis)" text-anchor="end" font-size="12">${format(v)}</text>`;}).join('');const labelStep=Math.max(1,Math.ceil(data.length/6)),labels=data.map((d,i)=>(i%labelStep===0&&data.length-1-i>=labelStep/2)||i===data.length-1?`<text x="${px(i)}" y="${H-5}" text-anchor="middle" style="fill:var(--chart-axis)" font-size="12">${e(d.label||d.date)}</text>`:'').join('');const paths=series.map((s,j)=>{const pts=data.map((d,i)=>d[s.key]==null?null:[px(i),py(d[s.key])]);let line='',started=false;for(const p of pts){if(!p){started=false;continue;}line+=(started?' L ':' M ')+p.join(' ');started=true;}const valid=pts.filter(Boolean);const fill=area&&valid.length?`<path d="${line} L ${valid.at(-1)[0]} ${H-bottom} L ${valid[0][0]} ${H-bottom} Z" fill="url(#chart-fill)"/>`:'';return fill+`<path d="${line}" fill="none" style="stroke:${s.color}" stroke-width="${j?1.6:2.6}" ${j?'stroke-dasharray="5 5"':''} vector-effect="non-scaling-stroke"/>`;}).join('');const points=data.map((d,i)=>{const title=(d.label||dateLabel(d.date))+' · '+series.filter(s=>d[s.key]!=null).map(s=>s.name+': '+(percent?pct(d[s.key]/100):money(d[s.key]))).join(' · ');const value=d[series[0].key];return value==null?'':`<g class="graph-point" tabindex="0" role="img" aria-label="${e(title)}" data-tip="${e(title)}"><circle cx="${px(i)}" cy="${py(value)}" r="14" fill="transparent"/><circle class="point-dot" cx="${px(i)}" cy="${py(value)}" r="4" style="stroke:${series[0].color};fill:var(--surface)"/></g>`;}).join('');return svgText(`<div class="chart native-chart${data.length>14?' dense':''}" style="height:${height}px" dir="ltr"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="גרף ${e(series.map(s=>s.name).join(', '))}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--chart-1)" stop-opacity=".2"/><stop offset="1" style="stop-color:var(--chart-1)" stop-opacity="0"/></linearGradient></defs>${grid}${labels}${paths}${points}</svg><div class="chart-hover" role="status"></div></div>`);}
export function donut(data,total,label='סה״כ',size=168){const sum=data.reduce((s,d)=>s+d.value,0);let offset=0;const rings=data.map((d,i)=>{const value=sum?d.value/sum*100:0,result=`<circle cx="60" cy="60" r="50" pathLength="100" style="stroke:${d.color||palette[i%palette.length]}" stroke-width="8" stroke-dasharray="${Math.max(0,value-1.6)} ${100-Math.max(0,value-1.6)}" stroke-dashoffset="${-offset}" fill="none" stroke-linecap="round"><title>${e(d.name)}: ${money(d.value)}</title></circle>`;offset+=value;return result;}).join('');return `<div class="donut-wrap"><div class="donut" style="width:${size}px;height:${size}px" dir="ltr"><svg viewBox="0 0 120 120" role="img" aria-label="חלוקה לפי נכס או קטגוריה"><g transform="rotate(-90 60 60)">${rings}</g></svg><div class="donut-center"><small>${e(label)}</small><b>${money(total)}</b></div></div><div class="donut-legend">${data.slice(0,6).map((d,i)=>`<div><span class="legend-name"><i style="background:${d.color||palette[i%palette.length]}"></i>${e(d.name)}</span><b dir="ltr">${pct(total?d.value/total:0)}</b></div>`).join('')}</div></div>`;}
export function formatUnit(v,unit='ILS'){return unit==='percent'?pct(v/100):unit==='number'?Number(v).toLocaleString('he-IL',{maximumFractionDigits:2}):money(v);}
export function barChart(labels,series,{unit='ILS',height=240}={}){
  if(!labels.length||!series.length)return empty('אין נתונים לגרף');
  const W=720,H=height,left=65,right=15,top=18,bottom=38,values=series.flatMap(s=>s.values.map(Number).filter(Number.isFinite)),{lo,hi,ticks}=niceScale(Math.min(0,...values),Math.max(0,...values)||1,null,4,unit==='ILS'||unit==='USD'?1:0),py=v=>top+(H-top-bottom)*(hi-v)/(hi-lo||1);
  const slot=(W-left-right)/labels.length,bw=Math.min(46,slot*.72/series.length);
  const axis=v=>unit==='percent'?`${v.toLocaleString('he-IL',{maximumFractionDigits:1})}%`:unit==='number'?v.toLocaleString('he-IL',{maximumFractionDigits:2}):shortAmount(v);
  const grid=ticks.map(v=>{const y=py(v);return `<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" style="stroke:var(--chart-grid)"/><text x="${left-12}" y="${y+4}" style="fill:var(--chart-axis)" text-anchor="end" font-size="12">${axis(v)}</text>`;}).join('');
  const bars=labels.map((label,i)=>{const x0=left+slot*i+(slot-bw*series.length)/2;return series.map((s,j)=>{const v=Number(s.values[i])||0,y=Math.min(py(v),py(0)),h=Math.max(1.5,Math.abs(py(v)-py(0))),tip=`${label} · ${series.length>1?s.name+': ':''}${formatUnit(v,unit)}`;return `<g class="graph-point" tabindex="0" role="img" aria-label="${e(tip)}" data-tip="${e(tip)}"><rect x="${x0+j*bw}" y="${y}" width="${bw-3}" height="${h}" rx="4" style="fill:${s.color||palette[j%palette.length]}" opacity="${v<0?.55:.9}"/></g>`;}).join('')+`<text x="${left+slot*i+slot/2}" y="${H-12}" text-anchor="middle" style="fill:var(--chart-axis)" font-size="${labels.length>8?10:12}">${e(String(label).slice(0,14))}</text>`;}).join('');
  return svgText(`<div class="chart native-chart bar-chart" style="height:${height}px" dir="ltr"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${e('גרף עמודות: '+series.map(s=>s.name).join(', '))}">${grid}<line x1="${left}" x2="${W-right}" y1="${py(0)}" y2="${py(0)}" style="stroke:var(--chart-zero)"/>${bars}</svg><div class="chart-hover" role="status"></div></div>`);
}
export function fanChart(points,{target=null,height=300}={}){
  if(!points.length)return empty('אין נתונים לסימולציה');
  const W=720,H=height,left=70,right=15,top=20,bottom=35,{hi,ticks}=niceScale(0,Math.max(...points.map(p=>p.p90),target||0)*1.04||1,0,4,1),px=i=>left+(W-left-right)*i/Math.max(1,points.length-1),py=v=>top+(H-top-bottom)*(hi-Math.max(0,v))/hi;
  const line=key=>points.map((p,i)=>`${i?'L':'M'} ${px(i)} ${py(p[key])}`).join(' ');
  const band=`${points.map((p,i)=>`${i?'L':'M'} ${px(i)} ${py(p.p90)}`).join(' ')} ${[...points].reverse().map((p,i)=>`L ${px(points.length-1-i)} ${py(p.p10)}`).join(' ')} Z`;
  const fmt=shortAmount;
  const grid=ticks.map(v=>{const y=py(v);return `<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" style="stroke:var(--chart-grid)"/><text x="${left-12}" y="${y+4}" style="fill:var(--chart-axis)" text-anchor="end" font-size="12">${fmt(v)}</text>`;}).join('');
  const step=Math.max(1,Math.ceil(points.length/8)),labels=points.map((p,i)=>i%step===0||i===points.length-1?`<text x="${px(i)}" y="${H-8}" text-anchor="middle" style="fill:var(--chart-axis)" font-size="12">${p.year?'שנה '+p.year:'היום'}</text>`:'').join('');
  const goal=target?`<line x1="${left}" x2="${W-right}" y1="${py(target)}" y2="${py(target)}" style="stroke:var(--positive-vivid)" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/>`:'';
  // The goal label sits at the start of the line (the median starts low there) and is drawn last, with a halo.
  const goalLabel=target?`<text x="${left+6}" y="${py(target)-7}" class="chart-goal" style="fill:var(--positive-vivid);paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round" font-size="12" text-anchor="start">היעד</text>`:'';
  const dots=points.map((p,i)=>{const tip=`${p.year?'בעוד '+p.year+' שנים':'היום'} · תרחיש סביר: ${money(p.p50)} · טווח: ${money(p.p10)} – ${money(p.p90)} · הופקד: ${money(p.contributed)}`;return `<g class="graph-point" tabindex="0" role="img" aria-label="${e(tip)}" data-tip="${e(tip)}"><circle cx="${px(i)}" cy="${py(p.p50)}" r="13" fill="transparent"/><circle class="point-dot" cx="${px(i)}" cy="${py(p.p50)}" r="3.5" style="stroke:${palette[0]};fill:var(--surface)"/></g>`;}).join('');
  return svgText(`<div class="chart native-chart fan-chart${points.length>14?' dense':''}" style="height:${height}px" dir="ltr"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="תחזית הון: טווח תרחישים">${grid}${labels}<path d="${band}" style="fill:var(--chart-2)" opacity=".16"/><path d="${line('p90')}" fill="none" style="stroke:var(--chart-2)" stroke-opacity=".45" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="${line('p10')}" fill="none" style="stroke:var(--chart-2)" stroke-opacity=".45" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="${line('contributed')}" fill="none" style="stroke:var(--chart-axis)" stroke-width="1.4" stroke-dasharray="4 5" vector-effect="non-scaling-stroke"/>${goal}<path d="${line('p50')}" fill="none" style="stroke:${palette[0]}" stroke-width="2.8" vector-effect="non-scaling-stroke"/>${dots}${goalLabel}</svg><div class="chart-hover" role="status"></div></div>`);
}
// Line, bar and fan charts draw on a fixed 720-wide grid that stretches to the card (preserveAspectRatio=none),
// so lines and bars fill any width. Text and dots must not stretch with it, so fitChart (run on every size
// change, see polish-ui.js):
// 1. counter-scales each text and dot horizontally around its own anchor, keeping its true shape;
// 2. hides x-axis labels that would collide at this width (always keeping the last one);
// 3. insets the plot so no label sticks out of the chart box.
export function fitChart(svg){
  const box=svg?.viewBox?.baseVal,w=svg?.clientWidth,h=svg?.clientHeight;
  if(!box?.width||!box.height||!w||!h)return;
  const k=(h/box.height)/(w/box.width);
  if(Math.abs(k-(Number(svg.dataset.fit)||0))>=.004){
    svg.dataset.fit=k.toFixed(4);
    svg.querySelectorAll('text,circle').forEach(el=>{
      const isText=el.tagName==='text',x=Number(el.getAttribute(isText?'x':'cx'))||0,y=Number(el.getAttribute(isText?'y':'cy'))||0;
      el.setAttribute('transform',`translate(${x} ${y}) scale(${k.toFixed(4)} 1) translate(${-x} ${-y})`);
    });
  }
  const xLabels=[...svg.querySelectorAll('text[text-anchor="middle"]')].map(el=>({el,r:el.getBoundingClientRect()})).sort((a,b)=>a.r.left-b.r.left),gap=8;
  const shown=[];
  for(const label of xLabels){if(!shown.length||label.r.left>=shown.at(-1).r.right+gap)shown.push(label);}
  const end=xLabels.at(-1);
  if(end&&shown.at(-1)!==end){while(shown.length&&shown.at(-1).r.right+gap>end.r.left)shown.pop();shown.push(end);}
  xLabels.forEach(label=>label.el.style.visibility=shown.includes(label)?'':'hidden');
  // Inset the plot just enough that every label sits inside the chart box (recomputed from the current
  // layout each time, so it also shrinks back on wider screens).
  const host=svg.parentElement?.getBoundingClientRect();if(!host)return;
  let minLeft=Infinity,maxRight=-Infinity;
  svg.querySelectorAll('text').forEach(el=>{if(el.style.visibility==='hidden')return;const t=el.getBoundingClientRect();if(!t.width)return;minLeft=Math.min(minLeft,t.left);maxRight=Math.max(maxRight,t.right);});
  if(!Number.isFinite(minLeft))return;
  const curL=parseFloat(svg.style.marginLeft)||0,curR=parseFloat(svg.style.marginRight)||0,edge=2;
  const nextL=Math.max(0,Math.ceil(curL+edge-(minLeft-host.left))),nextR=Math.max(0,Math.ceil(curR+edge-(host.right-maxRight)));
  if(Math.abs(nextL-curL)<1&&Math.abs(nextR-curR)<1)return;
  // Applied on the next frame: resizing inside a ResizeObserver callback would loop.
  requestAnimationFrame(()=>{svg.style.marginLeft=nextL+'px';svg.style.marginRight=nextR+'px';svg.style.width=nextL||nextR?`calc(100% - ${nextL+nextR}px)`:'';});
}
export function scoreRing(score,size=128,label='מתוך 100'){
  const color=score>=70?tone.positive:score>=45?tone.warning:tone.negative,v=Math.max(0,Math.min(100,score));
  return `<div class="score-ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" style="stroke:var(--track)" stroke-width="9" fill="none"/><circle cx="60" cy="60" r="52" pathLength="100" style="stroke:${color}" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="${v} ${100-v}" transform="rotate(-90 60 60)"/></svg><div><b>${Math.round(score)}</b><small>${e(label)}</small></div></div>`;
}
