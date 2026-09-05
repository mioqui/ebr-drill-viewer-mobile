'use strict';

// Extensión para EBR Drill Viewer Mobile v1.1.1
// Operador: se toma exclusivamente de round-*.txt -> tunnel_id -> OP:...
// Ejemplo validado: tunnel_id:GL:965 NV:4022 OP:RIVERA T:N
// Si no existe OP o viene vacío, se conserva en blanco.

(function(){
  function parseOperatorFromTunnelId(value){
    const raw=String(value || '').replace(/\s+/g,' ').trim();
    if (!raw) return '';

    // Admite OP:RIVERA, OP. RIVERA, OP=RIVERA, OP RIVERA.
    // Captura hasta el siguiente campo tipo T:, TURN:, NV:, RMR:, etc.
    const m=raw.match(/(?:^|\s)OP\s*[:.=]?\s*(.*?)(?=\s+[A-Za-z]{1,8}\s*[:.=]|$)/i);
    if (!m) return '';

    return String(m[1] || '')
      .replace(/^[\s:;.,=_\/-]+|[\s:;.,=_\/-]+$/g,'')
      .replace(/\s+/g,' ')
      .trim();
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
})();
