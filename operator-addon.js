'use strict';

// Extensión para EBR Drill Viewer Mobile v1.1.1
// Operador: fuente principal round-*.txt -> tunnel_id -> OP:...
// Ejemplo validado: tunnel_id:GL:965 NV:4022 OP:RIVERA T:N
// Si no existe OP o viene vacío, se conserva en blanco, salvo que se reconozca
// inequívocamente uno de los apellidos conocidos como respaldo.

(function(){
  const KNOWN_OPERATORS = ['Osorio','Rivera','Celis','Cuchula'];

  function canonicalKnownOperator(value){
    const raw=String(value || '').trim();
    if (!raw) return '';
    const hit=KNOWN_OPERATORS.find(x=>x.toLowerCase()===raw.toLowerCase());
    return hit || raw;
  }

  function parseOperatorFromTunnelId(value){
    const raw=String(value || '').replace(/\s+/g,' ').trim();
    if (!raw) return '';

    // Regla principal: lee explícitamente el campo OP.
    // Admite OP:RIVERA, OP. RIVERA, OP=RIVERA, OP RIVERA y nombres con espacios.
    const m=raw.match(/(?:^|\s)OP\s*[:.=]?\s*(.*?)(?=\s+[A-Za-z]{1,8}\s*[:.=]|$)/i);
    if (m) {
      const parsed=String(m[1] || '')
        .replace(/^[\s:;.,=_\/-]+|[\s:;.,=_\/-]+$/g,'')
        .replace(/\s+/g,' ')
        .trim();
      if (parsed) return canonicalKnownOperator(parsed);
    }

    // Respaldo controlado: si por variación del formato no viene la etiqueta OP,
    // reconocer solo apellidos actualmente conocidos, como palabra completa.
    // Esta lista NO limita futuros operadores: cualquier valor bajo OP sigue aceptándose.
    for (const name of KNOWN_OPERATORS) {
      const re=new RegExp(`(?:^|[^A-Za-zÁÉÍÓÚÑáéíóúñ])${name}(?=$|[^A-Za-zÁÉÍÓÚÑáéíóúñ])`,'i');
      if (re.test(raw)) return name;
    }

    return '';
  }

  function addMetric(label,value,afterLabel){
    const root=document.getElementById('metrics');
    if (!root) return;
    const existing=[...root.querySelectorAll('.metric')].find(el=>
      (el.querySelector('.k')?.textContent || '').trim()===label
    );
    if (existing) existing.remove();

    const metric=document.createElement('div');
    metric.className='metric';
    const k=document.createElement('div');
    k.className='k';
    k.textContent=label;
    const v=document.createElement('div');
    v.className='v';
    v.textContent=value || '';
    metric.append(k,v);

    const anchor=[...root.querySelectorAll('.metric')].find(el=>
      (el.querySelector('.k')?.textContent || '').trim()===afterLabel
    );
    if (anchor) anchor.insertAdjacentElement('afterend',metric);
    else root.appendChild(metric);
  }

  function addDetail(label,value,afterLabel){
    const root=document.getElementById('detailGrid');
    if (!root) return;
    const rows=[...root.querySelectorAll('.detailRow')];
    const existing=rows.find(el=>(el.querySelector('.k')?.textContent || '').trim()===label);
    if (existing) existing.remove();

    const row=document.createElement('div');
    row.className='detailRow';
    const k=document.createElement('span');
    k.className='k';
    k.textContent=label;
    const v=document.createElement('span');
    v.className='v';
    v.textContent=value || '';
    row.append(k,v);

    const anchor=[...root.querySelectorAll('.detailRow')].find(el=>
      (el.querySelector('.k')?.textContent || '').trim()===afterLabel
    );
    if (anchor) anchor.insertAdjacentElement('afterend',row);
    else root.appendChild(row);
  }

  const baseProcessZda=window.processZda;
  if (typeof baseProcessZda==='function') {
    window.processZda=async function(file){
      const result=await baseProcessZda(file);
      const operador=parseOperatorFromTunnelId(result?.kv?.tunnel_id);
      if (result?.metadata) result.metadata.Operador=operador;
      return result;
    };
  }

  const baseRenderResult=window.renderResult;
  if (typeof baseRenderResult==='function') {
    window.renderResult=function(result){
      baseRenderResult(result);
      const operador=result?.metadata?.Operador || '';
      addMetric('Operador',operador,'Tipo de roca');
      addDetail('Operador',operador,'Tipo de roca');
    };
  }

  window.EBR_parseOperatorFromTunnelId=parseOperatorFromTunnelId;
  window.EBR_KNOWN_OPERATORS=[...KNOWN_OPERATORS];
})();
