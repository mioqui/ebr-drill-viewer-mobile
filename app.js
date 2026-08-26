'use strict';

const APP_VERSION = '1.1.0';
const TIPOS = ['Bottom','Easer','Cut','Contour','Reaming','Casing'];
const JUMBOS = {'125D114796':'JUMB001','125D98943':'JUMB002'};
const FRONT_TYPES = new Set(['Bottom','Easer','Cut','Contour']);

const $ = id => document.getElementById(id);
const fmt = (v,d=1) => v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toFixed(d);
const pct = (a,b) => (a == null || b == null || b <= 0) ? null : (a/b)*100;

let current = null;
let canvasState = {holes:[], section:null, labels:false, segments:true, contour:true, transform:null};
let boxState = {groups:[], points:[], transform:null};

$('version').textContent = `v${APP_VERSION}`;
window.addEventListener('online', updateNetBadge);
window.addEventListener('offline', updateNetBadge);
updateNetBadge();

$('zdaInput').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  await handleFile(file);
});
$('newFileBtn').addEventListener('click', resetUI);
$('toggleLabels').addEventListener('change', e => { canvasState.labels = e.target.checked; drawNavigation(); });
$('toggleSegments').addEventListener('change', e => { canvasState.segments = e.target.checked; drawNavigation(); });
$('toggleContour').addEventListener('change', e => { canvasState.contour = e.target.checked; drawNavigation(); });
$('fullBtn').addEventListener('click', () => toggleCardFullscreen('navCard', drawNavigation));
$('boxFullBtn').addEventListener('click', () => toggleCardFullscreen('boxPlotCard', drawBoxPlot));
document.addEventListener('fullscreenchange', () => {
  setTimeout(() => {
    if (current) { drawNavigation(); drawBoxPlot(); }
  }, 100);
});
window.addEventListener('resize', () => {
  if (current) { drawNavigation(); drawBoxPlot(); }
});
$('navCanvas').addEventListener('pointerup', onCanvasTap);
$('boxCanvas').addEventListener('pointerup', onBoxTap);

function updateNetBadge(){
  $('offlineBadge').textContent = navigator.onLine ? 'Local' : 'Offline';
}

async function toggleCardFullscreen(cardId, redraw){
  const el=$(cardId);
  if (!el) return;

  // Si el navegador soporta Fullscreen API, la usamos. En algunos iPhone/iPad
  // la PWA puede no ofrecerla para elementos HTML; allí usamos un modo visual
  // de pantalla completa como respaldo.
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch (_) {}
    return;
  }
  if (el.classList.contains('pseudoFullscreen')) {
    el.classList.remove('pseudoFullscreen');
    document.body.classList.remove('lockScroll');
    setTimeout(redraw,80);
    return;
  }
  if (typeof el.requestFullscreen === 'function') {
    try {
      await el.requestFullscreen();
      setTimeout(redraw,100);
      return;
    } catch (_) {}
  }
  document.querySelectorAll('.pseudoFullscreen').forEach(x=>x.classList.remove('pseudoFullscreen'));
  el.classList.add('pseudoFullscreen');
  document.body.classList.add('lockScroll');
  setTimeout(redraw,80);
}

function setStatus(text, cls=''){
  $('status').textContent = text;
  $('status').className = `status ${cls}`.trim();
}

function resetUI(){
  current = null;
  canvasState = {holes:[], section:null, labels:false, segments:true, contour:true, transform:null};
  boxState = {groups:[], points:[], transform:null};
  $('zdaInput').value = '';
  $('startCard').classList.remove('hidden');
  $('result').classList.add('hidden');
  $('toggleLabels').checked = false;
  $('toggleSegments').checked = true;
  $('toggleContour').checked = true;
  setStatus('Listo para analizar.');
  window.scrollTo({top:0,behavior:'smooth'});
}

async function handleFile(file){
  // En iOS/iPadOS la extensión .ZDA no tiene un MIME reconocido por el selector
  // de Archivos. Por eso no filtramos por extensión: dejamos elegir el archivo
  // y validamos su estructura interna como ZDA/ZIP.
  if (!file || file.size === 0) {
    setStatus('El archivo seleccionado está vacío o no se pudo leer.', 'error');
    return;
  }
  if (typeof JSZip === 'undefined') {
    setStatus('No se pudo cargar el lector ZIP local.', 'error');
    return;
  }
  setStatus(`Analizando ${file.name || 'archivo'}…`, 'busy');
  try {
    const result = await processZda(file);
    current = result;
    renderResult(result);
    setStatus('Análisis completado.');
  } catch (err) {
    console.error(err);
    const msg = err?.message || String(err);
    if (/zip|central directory|end of data|corrupt/i.test(msg)) {
      setStatus('El archivo seleccionado no tiene una estructura ZDA válida o no pudo abrirse como contenedor ZIP.', 'error');
    } else {
      setStatus(`No se pudo analizar el ZDA: ${msg}`, 'error');
    }
  }
}

function zdaKeyValues(text){
  const out = {};
  String(text || '').split(/\r?\n/).forEach(line => {
    const i = line.indexOf(':');
    if (i < 0) return;
    out[line.slice(0,i).trim()] = line.slice(i+1).trim();
  });
  return out;
}

function baseSerieZda(rig){
  return String(rig || '').replace(/-(?:\d+|L)$/i,'');
}

function identifyJumbo(serie){
  return JUMBOS[serie] || serie || 'JUMBO';
}

function zdaParseDateTime(s){
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]) / 1000;
}

function zdaFmtDate(ts){
  if (ts == null || !Number.isFinite(Number(ts))) return null;
  const d = new Date(Number(ts)*1000);
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
}

function zdaFmtTime(ts){
  if (ts == null || !Number.isFinite(Number(ts))) return null;
  const d = new Date(Number(ts)*1000);
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:${String(d.getUTCSeconds()).padStart(2,'0')}`;
}

function zdaFmtDateTime(ts){
  const f=zdaFmtDate(ts), h=zdaFmtTime(ts);
  return f && h ? `${f} ${h}` : null;
}

function formatDurationSec(sec){
  if (sec == null || !Number.isFinite(Number(sec)) || sec < 0) return '-';
  sec = Math.round(Number(sec));
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function zdaAscii(view,start,len){
  const bytes=[];
  for (let i=0;i<len && start+i<view.byteLength;i++) {
    const b=view.getUint8(start+i);
    if (b===0) break;
    if (b>=32 && b<=126) bytes.push(b);
  }
  return String.fromCharCode(...bytes).trim();
}

function zdaTypeFromCode(code){
  return ({0:'Reaming',1:'Contour',4:'Cut',5:'Easer',8:'Bottom',9:'Casing'})[Number(code)] || null;
}

function parseZdaBoom(buffer, metadata){
  const view = new DataView(buffer);
  const RECORD_SIZE=297, FIRST_RECORD=4;
  const holes=[];
  const unknownCodes=new Map();
  let rawRecords=0, invalidRecords=0;

  for (let start=FIRST_RECORD; start+RECORD_SIZE<=view.byteLength; start+=RECORD_SIZE) {
    rawRecords++;
    try {
      const boom0=view.getUint8(start+159);
      const sec=view.getUint8(start+160);
      const startTs=view.getUint32(start+163,true);
      const endTs=view.getUint32(start+240,true);
      const typeCode=view.getUint8(start+175);
      const tipo=zdaTypeFromCode(typeCode);
      const x=view.getFloat64(start+183,true);
      const y=view.getFloat64(start+191,true);
      const z=view.getFloat64(start+199,true);
      const x2=view.getFloat64(start+257,true);
      const y2=view.getFloat64(start+265,true);
      const z2=view.getFloat64(start+273,true);
      const length=Math.hypot(x2-x,y2-y,z2-z);

      const tsOk=startTs>1577836800 && startTs<2051222400 && endTs>=startTs && endTs<2051222400;
      const geomOk=[x,y,z,x2,y2,z2,length].every(Number.isFinite) && length>0.10 && length<20;
      const boomOk=(boom0===0 || boom0===1) && sec>0 && sec<100;

      if (!tipo) {
        if (tsOk && geomOk && boomOk) unknownCodes.set(typeCode,(unknownCodes.get(typeCode)||0)+1);
        continue;
      }
      if (!(tsOk && geomOk && boomOk)) { invalidRecords++; continue; }

      const boom=boom0+1;
      let id=zdaAscii(view,start+26,30);
      if (!id) id = tipo==='Reaming' ? `R${boom}-${sec}` : `S${boom}-${sec}`;

      holes.push({
        ID:String(id), Tipo:tipo, Boom:boom, Secuencia:sec,
        X:Number(x.toFixed(2)), Y:Number(y.toFixed(2)), Z:Number(z.toFixed(2)),
        X2:Number(x2.toFixed(2)), Y2:Number(y2.toFixed(2)), Z2:Number(z2.toFixed(2)),
        Longitud_roca_m:Number(length.toFixed(2)),
        Inicio_Barreno_TS:startTs, Fin_Barreno_TS:endTs,
        Inicio_Barreno:zdaFmtDateTime(startTs), Fin_Barreno:zdaFmtDateTime(endTs),
        Codigo_Tipo_ZDA:typeCode,
        Jumbo:metadata.Jumbo, Ciclo:metadata.Ciclo
      });
    } catch (_) { invalidRecords++; }
  }

  const order=Object.fromEntries(TIPOS.map((t,i)=>[t,i]));
  holes.sort((a,b)=>(order[a.Tipo]-order[b.Tipo]) || String(a.ID).localeCompare(String(b.ID),undefined,{numeric:true}));
  return {holes,rawRecords,invalidRecords,unknownCodes:[...unknownCodes.entries()].map(([Codigo,N])=>({Codigo,N}))};
}

function parseZdaCounters(buffer){
  const view=new DataView(buffer);
  const HEADER=25, EXPECTED_VALUES=464;
  if (view.byteLength < HEADER + EXPECTED_VALUES*8) return {ok:false,motivo:`counters.dat corto: ${view.byteLength} bytes`};
  const val=i=>view.getFloat64(HEADER+i*8,true);
  const hToDisplayedMin=i=>{
    const h=val(i);
    return Number.isFinite(h) && h>=0 && h<24 ? Math.round(h*60) : null;
  };
  const ab1=hToDisplayedMin(43), mb1=hToDisplayedMin(47), ab2=hToDisplayedMin(131), mb2=hToDisplayedMin(135);
  if (![ab1,mb1,ab2,mb2].every(v=>v!=null)) return {ok:false,motivo:'No se pudieron recuperar los cuatro tiempos de movimiento.'};
  const auto=ab1+ab2, manual=mb1+mb2, total=auto+manual;
  return {
    ok:true,
    Auto_Brazo1_min:ab1, Auto_Brazo2_min:ab2, Auto_Total_min:auto,
    Manual_Brazo1_min:mb1, Manual_Brazo2_min:mb2, Manual_Total_min:manual,
    Pct_Movimiento_Automatico:total>0?auto/total*100:null,
    Pct_Movimiento_Manual:total>0?manual/total*100:null,
    Pct_Automatico_Brazo1:pct(ab1,ab1+mb1),
    Pct_Automatico_Brazo2:pct(ab2,ab2+mb2)
  };
}

function mwdParts(name){
  const m=String(name||'').match(/-mwd-(\d+)-(\d+)\.dat$/i);
  return m ? {boom:Number(m[1])+1,seq:Number(m[2])} : null;
}

async function parseMwd(zip,names){
  const mwdNames=names.filter(n=>mwdParts(n)).sort((a,b)=>{
    const A=mwdParts(a),B=mwdParts(b); return A.boom-B.boom || A.seq-B.seq;
  });
  let firstTs=null,lastTs=null,validHoles=0,shortAttempts=0,empty=0,badLayouts=0,totalSamples=0,totalMeters=0;

  for (const name of mwdNames) {
    const buf=await zip.file(name).async('arraybuffer');
    const view=new DataView(buf);
    if (view.byteLength<131) { badLayouts++; continue; }
    const payload=view.byteLength-131;
    if (payload%122!==0) badLayouts++;
    const nrec=Math.floor(payload/122);
    let hFirst=null,hLast=null,maxPos=null,samples=0;
    for (let i=0;i<nrec;i++) {
      const off=131+i*122;
      if (off+122>view.byteLength) break;
      const lo=view.getUint32(off,true), hi=view.getUint32(off+4,true);
      const ts=lo + hi*4294967296;
      const pos=view.getFloat32(off+8,true);
      const tsOk=Number.isFinite(ts) && ts>1577836800 && ts<2051222400;
      const posOk=Number.isFinite(pos) && pos>=0 && pos<30;
      if (!tsOk || !posOk) continue;
      samples++; totalSamples++;
      if (hFirst==null || ts<hFirst) hFirst=ts;
      if (hLast==null || ts>hLast) hLast=ts;
      if (maxPos==null || pos>maxPos) maxPos=pos;
    }
    if (maxPos!=null && maxPos>0) {
      totalMeters += maxPos;
      if (maxPos>1) validHoles++; else shortAttempts++;
      if (firstTs==null || hFirst<firstTs) firstTs=hFirst;
      if (lastTs==null || hLast>lastTs) lastTs=hLast;
    } else empty++;
  }
  return {mwdNames,firstTs,lastTs,validHoles,shortAttempts,empty,badLayouts,totalSamples,totalMeters};
}

function parseSection(plan){
  const m=String(plan||'').replace(/,/g,'.').match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const w=Number(m[1]),h=Number(m[2]);
  if (!(w>1 && w<20 && h>1 && h<20)) return null;
  return {w,h,label:`${trimNum(w)} x ${trimNum(h)}`};
}

function trimNum(v){
  return Number(v).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
}

function classifyRound(n){
  if (!Number.isFinite(n)) return 'SIN CLASIFICAR';
  if (n>45) return 'FRENTE';
  if (n>=25) return 'SELLADA';
  return 'ESTOCADA Y/O CORRECCIONES';
}

async function processZda(file){
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir);
  const roundName=names.find(n=>/(^|\/)round-[^/]+\.txt$/i.test(n) && !/hole_comment/i.test(n));
  if (!roundName) throw new Error('El ZDA no contiene round-*.txt.');
  const kv=zdaKeyValues(await zip.file(roundName).async('string'));
  if (!kv.rig || !kv.round) throw new Error('round.txt no contiene rig/round.');

  const serie=baseSerieZda(kv.rig);
  const navigationTs=zdaParseDateTime(kv.navigation);
  const declaredStartTs=zdaParseDateTime(kv.start);
  const declaredEndTs=zdaParseDateTime(kv.end);
  const cycleTs=navigationTs ?? declaredStartTs;
  const metadata={
    Archivo:file.name, Rig:kv.rig, Numero_Serie:serie, Jumbo:identifyJumbo(serie), Ciclo:Number(kv.round),
    Fecha:zdaFmtDate(cycleTs), Hora_Navegacion:zdaFmtTime(navigationTs), Plan:kv.drill_plan || '-',
    Labor:kv.tunnel_id || '-', Tabla_Curvas:kv.curve_table || '-', PEG:kv.peg || '-', Section:parseSection(kv.drill_plan)
  };

  const boomName=names.find(n=>/-boom\.dat$/i.test(n));
  if (!boomName) throw new Error('El ZDA no contiene boom.dat.');
  const boom=parseZdaBoom(await zip.file(boomName).async('arraybuffer'),metadata);
  if (!boom.holes.length) throw new Error('No se encontraron barrenos válidos en boom.dat.');

  const countersName=names.find(n=>/-counters\.dat$/i.test(n));
  const counters=countersName ? parseZdaCounters(await zip.file(countersName).async('arraybuffer')) : {ok:false,motivo:'counters.dat no encontrado'};
  const mwd=await parseMwd(zip,names);

  const actualStartTs=mwd.firstTs ?? declaredStartTs ?? navigationTs;
  const actualEndTs=mwd.lastTs ?? declaredEndTs;
  const duration=(actualStartTs!=null && actualEndTs!=null && actualEndTs>=actualStartTs) ? actualEndTs-actualStartTs : null;
  const frontCount=boom.holes.filter(h=>FRONT_TYPES.has(h.Tipo)).length;
  const totalMeters=boom.holes.reduce((s,h)=>s+Number(h.Longitud_roca_m||0),0);
  const drilledDeclared=(kv.drilled_holes!==undefined && kv.drilled_holes!=='') ? Number(kv.drilled_holes) : null;
  const countOk=drilledDeclared==null ? true : drilledDeclared===boom.holes.length;
  const readingOk=!!kv.rig && !!kv.round && boom.holes.length>0 && countOk && boom.unknownCodes.length===0;

  return {
    file, metadata, kv, holes:boom.holes, section:metadata.Section,
    frontCount, totalHoles:boom.holes.length, totalMeters:Number(totalMeters.toFixed(2)),
    type:classifyRound(frontCount), counters, mwd,
    actualStartTs, actualEndTs, duration,
    actualStart:zdaFmtDateTime(actualStartTs), actualEnd:zdaFmtDateTime(actualEndTs),
    drilledDeclared, readingOk, countOk,
    diagnostics:{rawRecords:boom.rawRecords,invalidRecords:boom.invalidRecords,unknownCodes:boom.unknownCodes}
  };
}

function renderResult(r){
  $('startCard').classList.add('hidden');
  $('result').classList.remove('hidden');
  $('cycleTitle').textContent=`${r.metadata.Jumbo} · Ciclo ${r.metadata.Ciclo}`;
  $('cycleSub').textContent=`${r.metadata.Fecha || '-'} · ${r.metadata.Plan || '-'}`;
  $('navCaption').textContent=`Plano referencial reconstruido desde ZDA${r.section?` · sección ${r.section.label}`:''}`;
  $('boxCaption').textContent=`${r.metadata.Jumbo} · Serie ${r.metadata.Numero_Serie} · Ciclo ${r.metadata.Ciclo} · ${r.metadata.Fecha || '-'}`;

  const c=r.counters;
  const metrics=[
    ['Serie',r.metadata.Numero_Serie],
    ['Sección',r.section?.label || '-'],
    ['Tipo de disparo',r.type],
    ['Barrenos',String(r.frontCount)],
    ['Metros perforados',`${fmt(r.totalMeters,2)} m`],
    ['Lectura',r.readingOk?'OK':'REVISAR',r.readingOk?'ok':'review'],
    ['Movimiento automático',c.ok?`${fmt(c.Pct_Movimiento_Automatico,1)}%`:'-'],
    ['Movimiento manual',c.ok?`${fmt(c.Pct_Movimiento_Manual,1)}%`:'-'],
    ['Brazo 1 automático',c.ok?`${fmt(c.Pct_Automatico_Brazo1,1)}%`:'-'],
    ['Brazo 2 automático',c.ok?`${fmt(c.Pct_Automatico_Brazo2,1)}%`:'-'],
    ['Inicio perforación real',r.actualStart || '-','','small'],
    ['Fin perforación real',r.actualEnd || '-','','small'],
    ['Tiempo de perforación',formatDurationSec(r.duration)],
  ];
  $('metrics').innerHTML=metrics.map(([k,v,cls='',size=''])=>`<div class="metric"><div class="k">${esc(k)}</div><div class="v ${cls} ${size}">${esc(v)}</div></div>`).join('');

  const details=[
    ['Archivo',r.file.name],['Plan de perforación',r.metadata.Plan],['Labor / ID auxiliar',r.metadata.Labor],['Tabla de curvas',r.metadata.Tabla_Curvas],
    ['Barrenos ZDA totales',String(r.totalHoles)],['Barrenos de frente',String(r.frontCount)],['drilled_holes declarado',r.drilledDeclared==null?'-':String(r.drilledDeclared)],
    ['MWD válidos',String(r.mwd.validHoles)],['Intentos MWD cortos',String(r.mwd.shortAttempts)],['Muestras MWD',String(r.mwd.totalSamples)],
    ['Auto B1',r.counters.ok?`${r.counters.Auto_Brazo1_min} min`:'-'],['Manual B1',r.counters.ok?`${r.counters.Manual_Brazo1_min} min`:'-'],
    ['Auto B2',r.counters.ok?`${r.counters.Auto_Brazo2_min} min`:'-'],['Manual B2',r.counters.ok?`${r.counters.Manual_Brazo2_min} min`:'-']
  ];
  $('detailGrid').innerHTML=details.map(([k,v])=>`<div class="detailRow"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');

  const unknown=r.diagnostics.unknownCodes.length ? r.diagnostics.unknownCodes.map(x=>`${x.Codigo} (${x.N})`).join(', ') : 'ninguno';
  $('diagnostic').innerHTML=`
    <div>boom.dat: ${r.diagnostics.rawRecords} registros leídos · ${r.totalHoles} válidos · ${r.diagnostics.invalidRecords} inválidos.</div>
    <div>Códigos de tipo no reconocidos: ${esc(unknown)}.</div>
    <div>Conteo boom.dat vs drilled_holes: <strong class="${r.countOk?'':'warn'}">${r.countOk?'OK':'REVISAR'}</strong>.</div>
    <div>counters.dat: <strong class="${r.counters.ok?'':'warn'}">${r.counters.ok?'OK':esc(r.counters.motivo||'REVISAR')}</strong>.</div>
    <div>MWD: ${r.mwd.mwdNames.length} archivos · ${r.mwd.badLayouts} con layout no estándar.</div>
    <div>El plano mostrado es una reconstrucción referencial a partir de coordenadas X/Z de boom.dat; no es una captura del plano original del software del equipo.</div>`;

  canvasState.holes=r.holes;
  canvasState.section=r.section;
  boxState.groups=buildBoxGroups(r.holes);
  drawNavigation();
  drawBoxPlot();
  $('holeInfo').textContent='Toque un barreno para ver su detalle.';
  $('boxInfo').textContent='Toque un punto para ver el barreno y su longitud.';
  window.scrollTo({top:0,behavior:'smooth'});
}

function percentile(sorted,p){
  if (!sorted.length) return null;
  if (sorted.length===1) return sorted[0];
  const pos=(sorted.length-1)*p;
  const lo=Math.floor(pos), hi=Math.ceil(pos), f=pos-lo;
  return sorted[lo]*(1-f)+sorted[hi]*f;
}

function statsFor(values){
  const v=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
  if (!v.length) return null;
  const mean=v.reduce((a,b)=>a+b,0)/v.length;
  return {
    n:v.length, values:v, min:v[0], q1:percentile(v,.25), median:percentile(v,.5),
    q3:percentile(v,.75), max:v[v.length-1], mean
  };
}

function buildBoxGroups(holes){
  return TIPOS.map(tipo=>{
    const items=holes.filter(h=>h.Tipo===tipo && Number.isFinite(Number(h.Longitud_roca_m)) && Number(h.Longitud_roca_m)>0)
      .map(h=>({hole:h,value:Number(h.Longitud_roca_m)}));
    const stats=statsFor(items.map(x=>x.value));
    return stats ? {tipo,items,stats} : null;
  }).filter(Boolean);
}

function niceStep(range){
  if (range<=1.25) return .25;
  if (range<=2.5) return .5;
  if (range<=5) return 1;
  return 2;
}

function boxDomain(groups){
  const vals=groups.flatMap(g=>g.items.map(x=>x.value)).filter(Number.isFinite);
  if (!vals.length) return {ymin:0,ymax:5,step:1};
  let min=Math.min(...vals), max=Math.max(...vals);
  let range=Math.max(max-min,.5);
  const step=niceStep(range);
  let ymin=Math.floor((min-step*.55)/step)*step;
  let ymax=Math.ceil((max+step*.55)/step)*step;
  if (ymax-ymin<step*3) {
    const mid=(ymax+ymin)/2;
    ymin=Math.floor((mid-step*1.75)/step)*step;
    ymax=Math.ceil((mid+step*1.75)/step)*step;
  }
  ymin=Math.max(0,ymin);
  return {ymin,ymax,step};
}

function setupBoxCanvas(){
  const canvas=$('boxCanvas'), wrap=$('boxPlotWrap'), scroll=$('boxPlotScroll');
  const isExpanded=document.fullscreenElement===$('boxPlotCard') || $('boxPlotCard').classList.contains('pseudoFullscreen');
  const viewport=Math.max(300,Math.floor(scroll.getBoundingClientRect().width));
  const natural=Math.max(690,boxState.groups.length*145+95);
  const cssW=isExpanded ? Math.max(320,Math.floor(wrap.getBoundingClientRect().width || viewport)) : Math.max(viewport,natural);
  const cssH=isExpanded ? Math.max(390,Math.floor(wrap.getBoundingClientRect().height || (window.innerHeight-145))) : 475;
  wrap.style.width=isExpanded?'100%':`${cssW}px`;
  canvas.style.width=`${cssW}px`; canvas.style.height=`${cssH}px`;
  const dpr=Math.min(window.devicePixelRatio||1,3);
  canvas.width=Math.floor(cssW*dpr); canvas.height=Math.floor(cssH*dpr);
  const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  return {canvas,ctx,w:cssW,h:cssH};
}

function jitterFromKey(key,index){
  const str=String(key ?? index);
  let h=2166136261;
  for (let i=0;i<str.length;i++) { h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  const u=((h>>>0)%10000)/9999;
  return u*2-1;
}

function drawBoxPlot(){
  if (!current || !boxState.groups.length) return;
  const {ctx,w,h}=setupBoxCanvas();
  ctx.clearRect(0,0,w,h); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);

  const groups=boxState.groups;
  const domain=boxDomain(groups);
  const margin={l:58,r:18,t:82,b:70};
  const pw=w-margin.l-margin.r, ph=h-margin.t-margin.b;
  const Y=v=>margin.t+(domain.ymax-v)/(domain.ymax-domain.ymin)*ph;
  const groupW=pw/groups.length;
  const X=i=>margin.l+groupW*(i+.5);
  boxState.points=[];
  boxState.transform={X,Y,groupW,margin,domain,w,h};

  // Título y subtítulo dentro del gráfico, para que también aparezcan en pantalla completa.
  ctx.fillStyle='#20262d'; ctx.textAlign='center'; ctx.font='600 15px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Distribución de longitud perforada en roca por tipo de barreno',w/2,22);
  ctx.font='600 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${current.metadata.Jumbo} | Serie ${current.metadata.Numero_Serie} | Ciclo ${current.metadata.Ciclo} | ${current.metadata.Fecha || '-'}`,w/2,41);

  // Eje y y grilla.
  ctx.textAlign='right'; ctx.font='10px -apple-system, sans-serif';
  for (let v=domain.ymin;v<=domain.ymax+1e-9;v+=domain.step){
    const y=Y(v);
    ctx.strokeStyle='#e0e5ea'; ctx.lineWidth=.8; ctx.beginPath();ctx.moveTo(margin.l,y);ctx.lineTo(w-margin.r,y);ctx.stroke();
    ctx.fillStyle='#4c5966'; ctx.fillText(v.toFixed(domain.step<1?2:1),margin.l-7,y+3.5);
  }
  ctx.strokeStyle='#333';ctx.lineWidth=1.15;ctx.beginPath();ctx.moveTo(margin.l,margin.t);ctx.lineTo(margin.l,h-margin.b);ctx.lineTo(w-margin.r,h-margin.b);ctx.stroke();

  ctx.save(); ctx.translate(16,margin.t+ph/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center';ctx.fillStyle='#28333d';ctx.font='600 11px -apple-system, sans-serif';ctx.fillText('Longitud perforada en roca (m)',0,0);ctx.restore();

  groups.forEach((g,i)=>{
    const x=X(i), bw=Math.min(78,groupW*.55), cap=Math.min(46,bw*.68), s=g.stats;

    // Texto estadístico superior por grupo.
    ctx.textAlign='center';ctx.fillStyle='#2f3841';ctx.font='10.5px -apple-system, sans-serif';
    ctx.fillText(`Min ${fmt(s.min,2)} | Máx ${fmt(s.max,2)}`,x,58);
    ctx.fillText(`Prom ${fmt(s.mean,2)} | Med ${fmt(s.median,2)}`,x,71);

    // Bigotes = mínimo y máximo real.
    ctx.strokeStyle='#2d3339';ctx.lineWidth=1.4;
    ctx.beginPath();ctx.moveTo(x,Y(s.min));ctx.lineTo(x,Y(s.max));ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-cap/2,Y(s.min));ctx.lineTo(x+cap/2,Y(s.min));ctx.moveTo(x-cap/2,Y(s.max));ctx.lineTo(x+cap/2,Y(s.max));ctx.stroke();

    // Caja Q1-Q3. Si n=1 o Q1=Q3, dejamos una línea compacta visible.
    const yQ1=Y(s.q1), yQ3=Y(s.q3), top=Math.min(yQ1,yQ3), bh=Math.abs(yQ1-yQ3);
    ctx.strokeStyle='#2d3339';ctx.lineWidth=1.4;ctx.fillStyle='rgba(255,255,255,.88)';
    if (bh<1.5) {
      ctx.beginPath();ctx.moveTo(x-bw/2,Y(s.median));ctx.lineTo(x+bw/2,Y(s.median));ctx.stroke();
    } else {
      ctx.fillRect(x-bw/2,top,bw,bh);ctx.strokeRect(x-bw/2,top,bw,bh);
    }

    // Mediana.
    ctx.strokeStyle='#ff7f0e';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(x-bw/2,Y(s.median));ctx.lineTo(x+bw/2,Y(s.median));ctx.stroke();

    // Puntos individuales con jitter determinista.
    g.items.forEach((item,j)=>{
      const jitter=jitterFromKey(item.hole.ID,j)*bw*.34;
      const px=x+jitter, py=Y(item.value);
      ctx.beginPath();ctx.arc(px,py,4.1,0,Math.PI*2);ctx.fillStyle='rgba(46,91,67,.78)';ctx.fill();
      ctx.strokeStyle='rgba(33,66,49,.48)';ctx.lineWidth=.55;ctx.stroke();
      boxState.points.push({x:px,y:py,item,group:g});
    });

    // Etiquetas de categoría.
    ctx.fillStyle='#313b45';ctx.textAlign='center';ctx.font='600 11px -apple-system, sans-serif';
    ctx.fillText(g.tipo,x,h-margin.b+22);
    ctx.font='10.5px -apple-system, sans-serif';ctx.fillText(`(n=${s.n})`,x,h-margin.b+38);
  });

  // Leyenda compacta.
  if (w>=650) drawBoxLegend(ctx,margin.l+8,h-margin.b-68);
}

function drawBoxLegend(ctx,x,y){
  const W=236,H=61;
  ctx.fillStyle='rgba(255,255,255,.94)';ctx.strokeStyle='#cfd6dd';ctx.lineWidth=1;ctx.fillRect(x,y,W,H);ctx.strokeRect(x,y,W,H);
  ctx.font='9.5px -apple-system, sans-serif';ctx.textAlign='left';ctx.fillStyle='#3f4a54';
  ctx.beginPath();ctx.arc(x+12,y+14,3.7,0,Math.PI*2);ctx.fillStyle='rgba(46,91,67,.78)';ctx.fill();ctx.fillStyle='#3f4a54';ctx.fillText('Punto: valor de cada barreno',x+22,y+17);
  ctx.strokeStyle='#2d3339';ctx.strokeRect(x+7,y+25,12,8);ctx.fillText('Caja: 50% central (Q1–Q3)',x+22,y+33);
  ctx.strokeStyle='#ff7f0e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+7,y+43);ctx.lineTo(x+19,y+43);ctx.stroke();ctx.fillStyle='#3f4a54';ctx.fillText('Mediana',x+22,y+46);
  ctx.strokeStyle='#2d3339';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x+7,y+54);ctx.lineTo(x+19,y+54);ctx.stroke();ctx.fillStyle='#3f4a54';ctx.fillText('Bigotes: mínimo y máximo real',x+22,y+57);
}

function onBoxTap(e){
  if (!boxState.transform || !boxState.groups.length) return;
  const canvas=$('boxCanvas'), rect=canvas.getBoundingClientRect();
  const scaleX=canvasStateDummyScale(rect.width,boxState.transform.w), scaleY=canvasStateDummyScale(rect.height,boxState.transform.h);
  const px=(e.clientX-rect.left)/scaleX, py=(e.clientY-rect.top)/scaleY;
  let best=null,bestD=Infinity;
  for (const p of boxState.points){
    const d=Math.hypot(p.x-px,p.y-py);
    if (d<bestD){bestD=d;best=p;}
  }
  if (best && bestD<=18){
    const h=best.item.hole;
    $('boxInfo').innerHTML=`<strong>${esc(h.ID)}</strong> · ${esc(h.Tipo)} · Brazo ${h.Boom} · Sec. ${h.Secuencia} · <strong>${fmt(best.item.value,2)} m</strong>`;
    return;
  }
  const {margin,groupW}=boxState.transform;
  const idx=Math.floor((px-margin.l)/groupW);
  if (idx>=0 && idx<boxState.groups.length){
    const g=boxState.groups[idx],s=g.stats;
    $('boxInfo').innerHTML=`<strong>${esc(g.tipo)}</strong> · n=${s.n} · Min ${fmt(s.min,2)} · Q1 ${fmt(s.q1,2)} · Med ${fmt(s.median,2)} · Q3 ${fmt(s.q3,2)} · Máx ${fmt(s.max,2)} · Prom ${fmt(s.mean,2)} m`;
  }
}

function canvasStateDummyScale(display,internalCss){
  return internalCss>0 ? display/internalCss : 1;
}

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function getDomain(holes,section){
  let xs=[], zs=[];
  holes.forEach(h=>{xs.push(h.X,h.X2);zs.push(h.Z,h.Z2);});
  if (section){xs.push(-section.w/2,section.w/2);zs.push(0,section.h);}
  let xmin=Math.min(...xs), xmax=Math.max(...xs), zmin=Math.min(...zs), zmax=Math.max(...zs);
  if (!Number.isFinite(xmin)) {xmin=-2.5;xmax=2.5;zmin=0;zmax=5;}
  const dx=Math.max(xmax-xmin,1), dz=Math.max(zmax-zmin,1);
  const padX=Math.max(.35,dx*.09), padZ=Math.max(.35,dz*.09);
  return {xmin:xmin-padX,xmax:xmax+padX,zmin:zmin-padZ,zmax:zmax+padZ};
}

function setupCanvas(){
  const canvas=$('navCanvas'), wrap=$('canvasWrap');
  const rect=wrap.getBoundingClientRect();
  const cssW=Math.max(280,Math.floor(rect.width));
  const cssH=Math.max(290,Math.floor(rect.height));
  const dpr=Math.min(window.devicePixelRatio||1,3);
  canvas.style.width=`${cssW}px`; canvas.style.height=`${cssH}px`;
  canvas.width=Math.floor(cssW*dpr); canvas.height=Math.floor(cssH*dpr);
  const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  return {canvas,ctx,w:cssW,h:cssH};
}

function drawNavigation(){
  if (!canvasState.holes.length) return;
  const {canvas,ctx,w,h}=setupCanvas();
  ctx.clearRect(0,0,w,h); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);

  const domain=getDomain(canvasState.holes,canvasState.section);
  const margin={l:34,r:14,t:28,b:30};
  const pw=w-margin.l-margin.r, ph=h-margin.t-margin.b;
  const sx=pw/(domain.xmax-domain.xmin), sz=ph/(domain.zmax-domain.zmin), s=Math.min(sx,sz);
  const usedW=(domain.xmax-domain.xmin)*s, usedH=(domain.zmax-domain.zmin)*s;
  const ox=margin.l+(pw-usedW)/2, oy=margin.t+(ph-usedH)/2;
  const X=x=>ox+(x-domain.xmin)*s;
  const Y=z=>oy+usedH-(z-domain.zmin)*s;
  canvasState.transform={X,Y,domain,s,ox,oy,usedW,usedH,w,h};

  drawGrid(ctx,domain,X,Y,s);
  if (canvasState.contour && canvasState.section) drawSectionContour(ctx,canvasState.section,X,Y);

  // Direction segments first
  if (canvasState.segments){
    ctx.strokeStyle='#ff5a57'; ctx.lineWidth=1.1; ctx.globalAlpha=.88;
    for (const hole of canvasState.holes){
      ctx.beginPath(); ctx.moveTo(X(hole.X),Y(hole.Z)); ctx.lineTo(X(hole.X2),Y(hole.Z2)); ctx.stroke();
    }
    ctx.globalAlpha=1;
  }

  // Collars
  for (const hole of canvasState.holes){
    const x=X(hole.X), y=Y(hole.Z);
    ctx.beginPath(); ctx.arc(x,y,3.0,0,Math.PI*2); ctx.fillStyle='#e31717'; ctx.fill();
    ctx.strokeStyle='#8d0c0c'; ctx.lineWidth=.45; ctx.stroke();
    if (canvasState.labels){
      ctx.font='9px -apple-system, sans-serif'; ctx.fillStyle='#4d5966';
      ctx.fillText(String(hole.ID),x+4,y-4);
    }
  }

  ctx.fillStyle='#4b5563'; ctx.font='italic 11px -apple-system, sans-serif';
  ctx.fillText('Barrenos perforados, Plano de navegación',margin.l,16);
}

function drawGrid(ctx,d,X,Y,s){
  const step=s<55?1:.5;
  const x0=Math.ceil(d.xmin/step)*step, z0=Math.ceil(d.zmin/step)*step;
  ctx.lineWidth=.7;
  for (let x=x0;x<=d.xmax+1e-9;x+=step){
    ctx.strokeStyle=Math.abs(x)<1e-9?'#aab4bd':'#dce9f3';
    ctx.lineWidth=Math.abs(x)<1e-9?1.1:.65;
    ctx.beginPath();ctx.moveTo(X(x),Y(d.zmin));ctx.lineTo(X(x),Y(d.zmax));ctx.stroke();
  }
  for (let z=z0;z<=d.zmax+1e-9;z+=step){
    ctx.strokeStyle=Math.abs(z)<1e-9?'#aab4bd':'#dce9f3';
    ctx.lineWidth=Math.abs(z)<1e-9?1.1:.65;
    ctx.beginPath();ctx.moveTo(X(d.xmin),Y(z));ctx.lineTo(X(d.xmax),Y(z));ctx.stroke();
  }
}

function drawSectionContour(ctx,section,X,Y){
  const w=section.w,h=section.h;
  const left=-w/2,right=w/2,floor=0;
  const spring=Math.min(h*.62,h-0.5);
  ctx.strokeStyle='#374151';ctx.lineWidth=1.35;ctx.beginPath();
  ctx.moveTo(X(left),Y(floor));
  ctx.lineTo(X(left),Y(spring));
  ctx.bezierCurveTo(X(left),Y(h*.82),X(-w*.28),Y(h),X(0),Y(h));
  ctx.bezierCurveTo(X(w*.28),Y(h),X(right),Y(h*.82),X(right),Y(spring));
  ctx.lineTo(X(right),Y(floor));
  ctx.lineTo(X(left),Y(floor));
  ctx.stroke();
}

function onCanvasTap(e){
  if (!canvasState.transform || !canvasState.holes.length) return;
  const canvas=$('navCanvas');
  const rect=canvas.getBoundingClientRect();
  const px=e.clientX-rect.left, py=e.clientY-rect.top;
  const {X,Y,s}=canvasState.transform;
  let best=null,bestD=Infinity;
  for (const h of canvasState.holes){
    const dx=X(h.X)-px,dy=Y(h.Z)-py,d=Math.hypot(dx,dy);
    if (d<bestD){bestD=d;best=h;}
  }
  if (!best || bestD>Math.max(18,s*.18)) {
    $('holeInfo').textContent='Toque más cerca de un punto rojo para ver el barreno.';
    return;
  }
  $('holeInfo').innerHTML=`<strong>${esc(best.ID)}</strong> · ${esc(best.Tipo)} · Brazo ${best.Boom} · Sec. ${best.Secuencia}<br>X ${fmt(best.X,2)} · Z ${fmt(best.Z,2)} · Longitud ${fmt(best.Longitud_roca_m,2)} m`;
}
