/* ---------- armazenamento (IndexedDB, com fallback em memória) ---------- */
const DB=(()=>{let db=null;const mem={};
  const ready=new Promise(res=>{try{const r=indexedDB.open('fichas-treino',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>res()}catch(e){res()}});
  return{
    async get(k){await ready;if(!db)return mem[k];return new Promise(res=>{try{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>res(mem[k])}catch(e){res(mem[k])}})},
    async set(k,v){mem[k]=v;await ready;if(!db)return;try{db.transaction('kv','readwrite').objectStore('kv').put(v,k)}catch(e){}}
  }})();

const $=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));

// logo: null = logo padrão do RSCA; '' = sem logo; dataURL = logo enviado
const DEFAULT_LOGO='logo-rsca.png';
const logoSrc=()=>settings.logo===''?null:settings.logo||DEFAULT_LOGO;
const DEFAULT_SETTINGS={logo:null,link:'https://forms.gle/YMqrSsEy1s6AHFSJ8',signature:'Víctor Delgado  (PT RSCA Anderlecht)',
  comments:'Medium weight, medium execution speed. When you finish the training, answer the questionnaire in the following link:'};
let settings,library=[],sheets=[],sheet;

function blankBlocks(){return[{key:'warm',label:'WARM-UP',type:'',items:[]},{key:'str',label:'STRENGTH',type:'',items:[]},{key:'calm',label:'CALM-DOWN',type:'',items:[]}]}
function sampleSheet(){return{id:uid(),num:'4.5',goal:'',from:'2026-07-20',to:'2026-07-26',comments:'',blocks:blankBlocks()}}

/* ---------- datas ---------- */
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const ord=n=>{const s=['th','st','nd','rd'],v=n%100;return s[(v-20)%10]||s[v]||s[0]};
const parseD=s=>{if(!s)return null;const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const isoD=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays=(s,n)=>{const d=parseD(s);if(!d)return s;d.setDate(d.getDate()+n);return isoD(d)};
function fmtRange(a,b){const A=parseD(a),B=parseD(b);if(!A)return'';
  if(!B)return`${MONTHS[A.getMonth()]} ${A.getDate()}<sup>${ord(A.getDate())}</sup>`;
  if(A.getMonth()===B.getMonth())return`${MONTHS[A.getMonth()]} ${A.getDate()}-${B.getDate()}<sup>${ord(B.getDate())}</sup>`;
  return`${MONTHS[A.getMonth()]} ${A.getDate()}<sup>${ord(A.getDate())}</sup> - ${MONTHS[B.getMonth()]} ${B.getDate()}<sup>${ord(B.getDate())}</sup>`}
const fmtPlain=(a,b)=>fmtRange(a,b).replace(/<\/?sup>/g,'');
const nextNum=n=>{const m=/^(\d+)\.(\d+)$/.exec(String(n||'').trim());return m?`${m[1]}.${+m[2]+1}`:n};

/* ---------- imagens ---------- */
function fileToData(file,max=640,type='image/jpeg'){return new Promise(res=>{const url=URL.createObjectURL(file);const img=new Image();
  img.onload=()=>{const s=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));
    const x=c.getContext('2d');if(type==='image/jpeg'){x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height)}x.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);res(c.toDataURL(type,.86))};
  img.onerror=()=>{URL.revokeObjectURL(url);res(null)};img.src=url})}
const cleanName=s=>s.normalize('NFC').replace(/\.[^.]+$/,'').replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
const libById=id=>library.find(e=>e.id===id);
// pasta do exercício: 'CORE/ANTIROTADORES'; sem pasta vai para OUTROS quando a biblioteca tem pastas
const catOf=dirs=>dirs.map(d=>d.normalize('NFC').trim().toUpperCase()).filter(Boolean).join('/');
const catLabel=c=>c.split('/').join(' › ');
const OUTROS='OTROS';
const hasCats=()=>library.some(x=>x.cat);
const catKey=x=>x.cat||(hasCats()?OUTROS:'');
// img: enviada neste navegador (tem prioridade); siteImg: da pasta imagens/ do site
const exImg=x=>x&&(x.img||x.siteImg);
const imgOf=item=>exImg(item.exId&&libById(item.exId));

/* ---------- salvar ---------- */
let draftT;const saveDraft=()=>{clearTimeout(draftT);draftT=setTimeout(()=>DB.set('draft',sheet),300)};
// exercícios que só existem no site não são salvos no navegador; voltam da lista a cada abertura
const localLib=()=>library.filter(x=>!x.site).map(({siteImg,...x})=>x);
const saveLib=()=>DB.set('library',localLib());
const saveSheets=()=>DB.set('sheets',sheets);
const saveSettings=()=>DB.set('settings',settings);
let toastT;function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2600)}

/* ---------- abas ---------- */
document.querySelector('nav.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;showTab(b.dataset.tab)});
function showTab(t){document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  ['ficha','biblioteca','historico'].forEach(v=>$('#view-'+v).hidden=v!==t);
  if(t==='ficha'){renderEditor();renderPreview()}if(t==='biblioteca')renderLibrary();if(t==='historico')renderHistory()}

/* ---------- editor ---------- */
function renderEditor(){
  const ex=$('#editor');
  let h=`<section class="card"><div class="grid2">
      <label class="f">Nº de entrenamiento<input data-f="num" value="${esc(sheet.num)}" placeholder="4.5"></label>
      <label class="f">Objetivo (goals)<input data-f="goal" value="${esc(sheet.goal)}"></label></div>
    <div class="grid2"><label class="f">Desde<input type="date" data-f="from" value="${esc(sheet.from)}"></label>
      <label class="f">Hasta<input type="date" data-f="to" value="${esc(sheet.to)}"></label></div>
    <div class="clear-row"><button class="link-btn" data-act="clear">Limpiar ficha</button></div></section>`;
  sheet.blocks.forEach((b,bi)=>{
    h+=`<section class="card"><div class="block-head"><span class="eyebrow">${b.label}</span>
      <input data-b="${bi}" data-bf="type" value="${esc(b.type)}" placeholder="Tipo (p. ej.: CORE)" aria-label="Tipo de ${b.label}"></div>`;
    if(b.items.length){h+=`<div class="item-labels"><span></span><span>Ejercicio</span><span>Series</span><span>Desc.</span><span></span></div><ol class="items">`;
      b.items.forEach((it,ii)=>{const img=imgOf(it);
        h+=`<li class="item"><button class="thumb ${img?'has':''}" data-act="img" data-b="${bi}" data-i="${ii}" title="${img?'Cambiar imagen':'Subir imagen'}">${img?`<img src="${img}" alt="">`:'+'}</button>
          <div class="ac"><input class="search" data-b="${bi}" data-i="${ii}" data-if="name" value="${esc(it.name)}" placeholder="Escribe para buscar" autocomplete="off" aria-label="Ejercicio"><div class="sugg" hidden></div></div>
          <input data-b="${bi}" data-i="${ii}" data-if="dose" value="${esc(it.dose)}" placeholder="4x12" aria-label="Series y repeticiones">
          <input data-b="${bi}" data-i="${ii}" data-if="rest" value="${esc(it.rest)}" placeholder="1'" aria-label="Descanso">
          <div class="ord"><button data-act="up" data-b="${bi}" data-i="${ii}" title="Subir">↑</button><button data-act="down" data-b="${bi}" data-i="${ii}" title="Bajar">↓</button><button data-act="del" data-b="${bi}" data-i="${ii}" title="Quitar">✕</button></div></li>`});
      h+=`</ol>`}
    else h+=`<div class="empty-note">Aún no hay ejercicios. Búscalos en la biblioteca aquí abajo.</div>`;
    h+=`<div class="adder"><input class="search" data-b="${bi}" placeholder="+ Añadir ejercicio (elige la carpeta o escribe)" autocomplete="off"><div class="sugg" hidden></div></div></section>`});
  h+=`<section class="card"><label class="f">Comentarios<textarea data-f="comments">${esc(sheet.comments)}</textarea></label></section>
  <details class="card"><summary>Datos fijos: logo, enlace y firma</summary><div class="stack">
    <div class="logo-row"><div class="logo-box">${logoSrc()?`<img src="${logoSrc()}" alt="Logo">`:'sin logo'}</div>
      <button class="btn" data-act="logo">${logoSrc()?'Cambiar logo':'Subir logo'}</button>${logoSrc()?'<button class="btn danger" data-act="logo-del">Quitar</button>':''}${settings.logo!=null?'<button class="btn" data-act="logo-def">Usar logo del RSCA</button>':''}</div>
    <label class="f">Enlace del cuestionario<input type="url" data-s="link" value="${esc(settings.link)}"></label>
    <label class="f">Firma<input data-s="signature" value="${esc(settings.signature)}"></label>
  </div></details>`;
  const open=ex.querySelector('details')?.open;ex.innerHTML=h;if(open)ex.querySelector('details').open=true;
}

const ed=$('#editor');
ed.addEventListener('input',e=>{const t=e.target,d=t.dataset;
  if(d.f){sheet[d.f]=t.value}
  else if(d.bf){sheet.blocks[d.b][d.bf]=t.value}
  else if(d.if){const it=sheet.blocks[d.b].items[d.i];it[d.if]=t.value;
    if(d.if==='name'){const x=library.find(l=>l.name===t.value.trim().toUpperCase());it.exId=x?x.id:null;
      const th=t.closest('.item').querySelector('.thumb'),img=imgOf(it);th.classList.toggle('has',!!img);th.innerHTML=img?`<img src="${img}" alt="">`:'+';showSugg(t)}}
  else if(d.s){settings[d.s]=t.value;saveSettings()}
  else if(t.classList.contains('search')){showSugg(t);return}
  else return;
  renderPreview();saveDraft()});
ed.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const{act}=b.dataset,bi=+b.dataset.b,ii=+b.dataset.i;
  if(act==='logo')return $('#fileLogo').click();
  if(act==='logo-del'){settings.logo='';saveSettings();renderEditor();renderPreview();return}
  if(act==='logo-def'){settings.logo=null;saveSettings();renderEditor();renderPreview();return}
  // limpa objetivo, tipos e exercícios; mantém número, datas e comentários
  if(act==='clear'){if(!b.classList.contains('confirm')){b.classList.add('confirm');b.textContent='Confirmar: borrar objetivo, tipos y ejercicios';setTimeout(()=>{b.classList.remove('confirm');b.textContent='Limpiar ficha'},3000);return}
    sheet.goal='';sheet.blocks=blankBlocks();renderEditor();renderPreview();saveDraft();return}
  const items=sheet.blocks[bi].items;
  if(act==='img'){pendingImg={bi,ii};$('#fileOne').value='';$('#fileOne').click();return}
  if(act==='del')items.splice(ii,1);
  if(act==='up'&&ii>0)[items[ii-1],items[ii]]=[items[ii],items[ii-1]];
  if(act==='down'&&ii<items.length-1)[items[ii+1],items[ii]]=[items[ii],items[ii+1]];
  renderEditor();renderPreview();saveDraft()});
// no campo de nome a lista só abre sozinha se ele estiver vazio; ao digitar, abre sempre
// a lista sempre abre nas pastas principais
ed.addEventListener('focusin',e=>{const t=e.target;if(t.classList.contains('search')&&(t.dataset.i==null||!t.value.trim())){t.dataset.path='';showSugg(t)}});
ed.addEventListener('focusout',e=>{if(e.target.classList.contains('search'))setTimeout(()=>{const s=e.target.nextElementSibling;if(s)s.hidden=true},150)});
ed.addEventListener('keydown',e=>{const t=e.target;if(!t.classList.contains('search'))return;const s=t.nextElementSibling;
  if(e.key==='Backspace'&&!t.value&&t.dataset.path){e.preventDefault();t.dataset.path=parentPath(t.dataset.path);showSugg(t);return}const opts=[...s.querySelectorAll('button')];if(!opts.length)return;
  let i=opts.findIndex(o=>o.classList.contains('on'));
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();i=e.key==='ArrowDown'?Math.min(opts.length-1,i+1):Math.max(0,i-1);opts.forEach((o,k)=>o.classList.toggle('on',k===i));opts[i].scrollIntoView({block:'nearest'})}
  if(e.key==='Enter'){e.preventDefault();if(s.hidden)return;if(i<0&&t.dataset.i!=null){s.hidden=true;return}pick(t,opts[Math.max(0,i)])}
  if(e.key==='Escape')s.hidden=true});
ed.addEventListener('mousedown',e=>{const o=e.target.closest('.sugg button');if(!o)return;e.preventDefault();pick(o.closest('.adder,.ac').querySelector('.search'),o)});

const FOLDER='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
const parentPath=p=>p.split('/').slice(0,-1).join('/');
function showSugg(inp){const s=inp.nextElementSibling;const q=inp.value.trim().toUpperCase();const inItem=inp.dataset.i!=null;const path=inp.dataset.path||'';
  const exBtn=(x,sub)=>`<button type="button" data-ex="${x.id}"><span class="mini">${exImg(x)?`<img src="${exImg(x)}" alt="" loading="lazy">`:'—'}</span><span class="lbl">${esc(x.name)}${sub?`<small>${esc(catLabel(sub))}</small>`:''}</span></button>`;
  let opts=[],head='';
  if(q){// digitando: busca em todas as pastas
    opts=library.filter(x=>x.name.includes(q)).sort((a,b)=>(b.name.startsWith(q))-(a.name.startsWith(q))||a.name.localeCompare(b.name)).slice(0,30).map(x=>exBtn(x,catKey(x)))}
  else if(hasCats()){// campo vazio: primeiro a pasta, depois o exercício
    const keys=library.map(catKey),pre=path?path+'/':'';
    const dirs=[...new Set(keys.filter(k=>k.startsWith(pre)&&k!==path).map(k=>k.slice(pre.length).split('/')[0]))].sort((a,b)=>(a===OUTROS)-(b===OUTROS)||a.localeCompare(b));
    if(path)head=`<button type="button" class="back" data-dir="${esc(parentPath(path))}">← Volver</button><div class="sugg-path">${esc(catLabel(path))}</div>`;
    opts=dirs.map(d=>{const full=pre+d,n=keys.filter(k=>k===full||k.startsWith(full+'/')).length;
      return`<button type="button" data-dir="${esc(full)}"><span class="mini dir">${FOLDER}</span><span class="lbl">${esc(d)}</span><span class="count">${n}</span></button>`})
      .concat(library.filter(x=>catKey(x)===path).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>exBtn(x)))}
  else opts=library.slice().sort((a,b)=>a.name.localeCompare(b.name)).slice(0,30).map(x=>exBtn(x));
  // no campo de nome nada vem pré-selecionado: Enter mantém o texto digitado
  if(!inItem&&opts.length)opts[0]=opts[0].replace('<button type="button"','<button type="button" class="on"');
  let h=head+opts.join('');const list=opts;
  if(inItem&&!opts.length){s.hidden=true;return}
  if(!inItem&&q&&!library.some(x=>x.name===q))h+=`<button type="button" data-new="${esc(q)}" class="${list.length?'':'on'}"><span class="mini">+</span>Añadir “${esc(q)}” (nuevo, sin imagen)</button>`;
  s.innerHTML=h||'<div class="empty-note" style="padding:8px">Biblioteca vacía. Importa las imágenes en la pestaña Biblioteca.</div>';s.hidden=false}
function pick(inp,opt){if(!opt)return;const bi=+inp.dataset.b;let item;
  if(opt.dataset.dir!=null){inp.dataset.path=opt.dataset.dir;showSugg(inp);inp.nextElementSibling.scrollTop=0;return}
  if(inp.dataset.i!=null){const ii=+inp.dataset.i,it=sheet.blocks[bi].items[ii];if(!opt.dataset.ex)return;const x=libById(opt.dataset.ex);it.exId=x.id;it.name=x.name;
    renderEditor();renderPreview();saveDraft();const ni=ed.querySelector(`input[data-b="${bi}"][data-i="${ii}"][data-if="dose"]`);if(ni){ni.focus();ni.select()}return}
  if(opt.dataset.ex){const x=libById(opt.dataset.ex);item={uid:uid(),exId:x.id,name:x.name,dose:'',rest:''}}
  else{const n=opt.dataset.new;const x={id:uid(),name:n,img:null};library.push(x);saveLib();item={uid:uid(),exId:x.id,name:n,dose:'',rest:''}}
  const items=sheet.blocks[bi].items;
  items.push(item);renderEditor();renderPreview();saveDraft();
  const ni=ed.querySelector(`input[data-b="${bi}"][data-i="${items.length-1}"][data-if="dose"]`);if(ni){ni.focus();ni.select()}}

let pendingImg=null;
$('#fileOne').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;const data=await fileToData(f);if(!data)return toast('No se ha podido leer esa imagen.');
  if(pendingImg&&pendingImg.lib){const x=libById(pendingImg.lib);if(x){x.img=data;delete x.example;delete x.site}saveLib();renderLibrary();pendingImg=null;return}
  if(!pendingImg)return;const it=sheet.blocks[pendingImg.bi].items[pendingImg.ii];
  let x=it.exId&&libById(it.exId);if(!x)x=library.find(l=>l.name===it.name.trim().toUpperCase());
  if(!x){x={id:uid(),name:it.name.trim().toUpperCase()||'NUEVO EJERCICIO',img:null};library.push(x)}
  x.img=data;delete x.example;delete x.site;it.exId=x.id;saveLib();saveDraft();pendingImg=null;renderEditor();renderPreview();toast('Imagen guardada en la biblioteca.')});
$('#fileLogo').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;settings.logo=await fileToData(f,320,'image/png');saveSettings();renderEditor();renderPreview()});

/* ---------- folha ---------- */
function renderPreview(){const s=$('#sheet');
  let h=`<div class="s-title">WORKOUT ${esc(sheet.num)}${logoSrc()?`<img src="${logoSrc()}" alt="">`:''}</div>
    <div class="s-sub"><span><b>GOALS:</b>${esc(sheet.goal)}</span><span><b>DATE:</b> ${fmtRange(sheet.from,sheet.to)}</span></div>`;
  sheet.blocks.forEach(b=>{h+=`<div class="s-band"><b>${b.label}:</b> ${esc(b.type)}</div>`;
    const n=b.items.length,cols=Math.max(1,Math.min(n,6));
    h+=`<div class="s-row" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">`;
    if(!n)h+=`<div class="s-empty">—</div>`;
    b.items.forEach((it,i)=>{const img=imgOf(it);const dose=[it.dose,it.rest?`R:${it.rest}`:''].filter(Boolean).join(' ');
      h+=`<div class="s-ex"><div class="s-name">${i+1}. ${esc(it.name)}</div><div class="s-img">${img?`<img src="${img}" alt="">`:'<div class="s-ph">sin imagen</div>'}</div><div class="s-dose">${esc(dose)}</div></div>`});
    h+=`</div>`});
  h+=`<div class="s-band s-comments"><b>COMMENTS:</b> ${esc(sheet.comments)}</div>
    <div class="s-foot"><span class="s-link" id="sLink">${esc(settings.link)}</span><span class="s-sign">${esc(settings.signature)}</span></div>`;
  s.innerHTML=h;fitSheet();scalePaper()}
function fitSheet(){const s=$('#sheet');let h=118;s.style.setProperty('--imgh',h+'px');
  const over=()=>{const kids=[...s.children];const last=kids[kids.length-1];return last&&(last.offsetTop+last.offsetHeight>794-20)};
  while(over()&&h>44){h-=6;s.style.setProperty('--imgh',h+'px')}}
function scalePaper(){const w=$('#paperWrap');const k=w.clientWidth/1123;$('#sheet').style.transform=`scale(${k})`;w.style.height=(794*k)+'px'}
new ResizeObserver(scalePaper).observe($('#paperWrap'));

/* ---------- PDF ---------- */
$('#btnPdf').addEventListener('click',async()=>{const btn=$('#btnPdf');if(!window.html2canvas||!window.jspdf)return toast('No se han cargado las librerías de PDF. Comprueba la conexión a internet.');
  btn.disabled=true;btn.textContent='Generando…';
  try{const src=$('#sheet');const c=src.cloneNode(true);c.style.transform='none';c.removeAttribute('id');
    const holder=document.createElement('div');holder.style.cssText='position:fixed;left:-20000px;top:0';holder.appendChild(c);document.body.appendChild(holder);
    const link=c.querySelector('.s-link');const lr={x:link.offsetLeft,y:link.offsetTop,w:link.offsetWidth,h:link.offsetHeight};
    const canvas=await html2canvas(c,{scale:2,backgroundColor:'#ffffff',width:1123,height:794,windowWidth:1400});holder.remove();
    const pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    pdf.addImage(canvas.toDataURL('image/jpeg',.92),'JPEG',0,0,297,210);
    const k=297/1123;if(settings.link)pdf.link(lr.x*k,lr.y*k,lr.w*k,lr.h*k,{url:settings.link});
    pdf.save(`Workout_${String(sheet.num).replace(/[^\w.-]+/g,'_')}.pdf`);
    upsertHistory(true);toast('PDF generado y ficha guardada en el historial.')}
  catch(err){console.error(err);toast('No se ha podido generar el PDF.')}
  finally{btn.disabled=false;btn.textContent='Generar PDF'}});

/* ---------- histórico ---------- */
function upsertHistory(silent){const copy=clone(sheet);copy.savedAt=Date.now();const i=sheets.findIndex(s=>s.id===sheet.id);if(i>=0)sheets[i]=copy;else sheets.push(copy);saveSheets();if(!silent)toast('Ficha guardada en el historial.');if(!$('#view-historico').hidden)renderHistory()}
const hasContent=s=>s.blocks.some(b=>b.items.some(it=>(it.name||'').trim()));
$('#btnSave').addEventListener('click',()=>upsertHistory());
$('#btnNext').addEventListener('click',()=>{if(hasContent(sheet))upsertHistory(true);
  const n=clone(sheet);n.id=uid();n.num=nextNum(sheet.num);n.from=addDays(sheet.from,7);n.to=addDays(sheet.to,7);sheet=n;saveDraft();showTab('ficha');toast(`Ficha ${n.num} creada a partir de la anterior.`)});
$('#histBlank').addEventListener('click',()=>{if(hasContent(sheet))upsertHistory(true);
  const last=sheets.slice().sort((a,b)=>(b.from||'').localeCompare(a.from||''))[0]||sheet;
  sheet={id:uid(),num:nextNum(last.num),goal:'',from:addDays(last.from,7),to:addDays(last.to,7),comments:last.comments??DEFAULT_SETTINGS.comments,blocks:blankBlocks()};saveDraft();showTab('ficha')});
function renderHistory(){const L=$('#histList');const list=sheets.slice().sort((a,b)=>(b.from||'').localeCompare(a.from||''));
  if(!list.length){L.innerHTML='<div class="card empty-note">Todavía no hay fichas guardadas. Usa "Guardar en el historial" o genera un PDF, que guarda la ficha automáticamente.</div>';return}
  L.innerHTML=list.map(s=>`<div class="hist-row"><div class="num">${esc(s.num)}</div><div class="meta"><div>${esc(s.goal)||'<i>Sin objetivo</i>'} ${s.id===sheet.id?'<span class="current">· abierta</span>':''}</div><div>${fmtPlain(s.from,s.to)} · ${s.blocks.reduce((a,b)=>a+b.items.length,0)} ejercicios</div></div>
    <div class="btns"><button class="btn" data-h="open" data-id="${s.id}">Abrir</button><button class="btn" data-h="dup" data-id="${s.id}">Duplicar</button><button class="link-btn" data-h="del" data-id="${s.id}">Eliminar</button></div></div>`).join('')}
$('#histList').addEventListener('click',e=>{const b=e.target.closest('[data-h]');if(!b)return;const s=sheets.find(x=>x.id===b.dataset.id);if(!s)return;
  if(b.dataset.h==='open'){sheet=clone(s);saveDraft();showTab('ficha')}
  if(b.dataset.h==='dup'){const n=clone(s);n.id=uid();n.num=nextNum(s.num);n.from=addDays(s.from,7);n.to=addDays(s.to,7);sheet=n;saveDraft();showTab('ficha');toast(`Ficha ${n.num} creada.`)}
  if(b.dataset.h==='del'){if(!b.classList.contains('confirm')){b.classList.add('confirm');b.textContent='Confirmar eliminación';setTimeout(()=>{b.classList.remove('confirm');b.textContent='Eliminar'},3000);return}
    sheets=sheets.filter(x=>x.id!==s.id);saveSheets();renderHistory()}});

/* ---------- biblioteca ---------- */
function renderLibrary(){const q=$('#libSearch').value.trim().toUpperCase();
  const list=library.filter(x=>!q||x.name.includes(q)||catKey(x).includes(q)).sort((a,b)=>(catKey(a)===OUTROS)-(catKey(b)===OUTROS)||catKey(a).localeCompare(catKey(b))||a.name.localeCompare(b.name));
  $('#libCount').textContent=`${library.length} ejercicios · ${library.filter(exImg).length} con imagen`;
  let last=null;
  $('#libGrid').innerHTML=list.length?list.map(x=>{const c=catKey(x),head=c!==last&&c?`<h3 class="lib-cat">${esc(catLabel(c))} <span>${list.filter(y=>catKey(y)===c).length}</span></h3>`:'';last=c;return head+`<figure class="ex-card"><button class="ex-img" data-l="img" data-id="${x.id}" title="Haz clic para ${exImg(x)?'cambiar':'subir'} la imagen">${exImg(x)?`<img src="${exImg(x)}" alt="${esc(x.name)}" loading="lazy">`:'Sin imagen<br>haz clic para subirla'}</button>
    <input data-lname="${x.id}" value="${esc(x.name)}" aria-label="Nombre del ejercicio"><div class="ex-foot">${x.siteImg&&!x.img?'<span class="tag">de la web</span>':x.example?'<span class="tag">ejemplo</span>':'<span></span>'}${x.site?'':`<button class="link-btn" data-l="del" data-id="${x.id}">Eliminar</button>`}</div></figure>`}).join('')
    :'<div class="empty-note">No se ha encontrado nada.</div>'}
$('#libSearch').addEventListener('input',renderLibrary);
$('#libGrid').addEventListener('input',e=>{const id=e.target.dataset.lname;if(!id)return;const x=libById(id);x.name=e.target.value.toUpperCase();delete x.site;
  sheet.blocks.forEach(b=>b.items.forEach(it=>{if(it.exId===id)it.name=x.name}));saveLib();saveDraft()});
$('#libGrid').addEventListener('click',e=>{const b=e.target.closest('[data-l]');if(!b)return;const id=b.dataset.id;
  if(b.dataset.l==='img'){pendingImg={lib:id};$('#fileOne').value='';$('#fileOne').click()}
  if(b.dataset.l==='del'){if(!b.classList.contains('confirm')){b.classList.add('confirm');b.textContent='Confirmar';setTimeout(()=>{b.classList.remove('confirm');b.textContent='Eliminar'},3000);return}
    library=library.filter(x=>x.id!==id);saveLib();renderLibrary()}});
$('#libNew').addEventListener('click',()=>{const x={id:uid(),name:'NUEVO EJERCICIO',img:null};library.push(x);saveLib();$('#libSearch').value='';renderLibrary();
  const inp=document.querySelector(`[data-lname="${x.id}"]`);if(inp){inp.focus();inp.select()}});
async function importFiles(files){files=[...files].filter(f=>/^image\//.test(f.type)||/\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name));if(!files.length)return toast('No se ha encontrado ninguna imagen.');
  toast(`Importando ${files.length} imágenes…`);const seen=new Set();let added=0,updated=0;
  for(const f of files){const parts=(f.webkitRelativePath||'').split('/');const name=cleanName(f.name),cat=catOf(parts.slice(1,-1)),key=cat+'/'+name;
    if(!name||seen.has(key))continue;seen.add(key);const data=await fileToData(f);if(!data)continue;
    const ex=library.find(x=>x.name===name&&(x.cat||'')===cat);if(ex){ex.img=data;delete ex.example;delete ex.site;updated++}else{library.push({id:uid(),name,...(cat?{cat}:{}),img:data});added++}}
  saveLib();renderLibrary();toast(`${added} nuevos, ${updated} actualizados.`)}
$('#impDir').addEventListener('change',e=>{importFiles(e.target.files);e.target.value=''});
$('#impFiles').addEventListener('change',e=>{importFiles(e.target.files);e.target.value=''});
const vb=$('#view-biblioteca');
vb.addEventListener('dragover',e=>{e.preventDefault();vb.classList.add('drop')});
vb.addEventListener('dragleave',e=>{if(e.target===vb)vb.classList.remove('drop')});
vb.addEventListener('drop',e=>{e.preventDefault();vb.classList.remove('drop');importFiles(e.dataTransfer.files)});

/* ---------- backup ---------- */
$('#bkExport').addEventListener('click',()=>{
  const data={app:'fichas-treino',version:1,exportedAt:new Date().toISOString(),settings,library:localLib(),sheets,draft:sheet};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
  a.download=`fichas-entrenamiento-copia-${isoD(new Date())}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast('Copia de seguridad exportada.')});
// importar junta com o que existe: nada é apagado e a imagem atual de um exercício nunca é substituída
$('#bkImport').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  let d;try{d=JSON.parse(await f.text())}catch(err){return toast('Archivo no válido.')}
  if(!d||d.app!=='fichas-treino'||!Array.isArray(d.library)||!Array.isArray(d.sheets))return toast('Este archivo no es una copia de seguridad de Fichas de Entrenamiento.');
  const idMap={};let exN=0,imgN=0,shN=0;
  for(const x of d.library){if(!x||!x.id||!x.name)continue;const cur=libById(x.id)||library.find(l=>l.name===x.name);
    if(cur){idMap[x.id]=cur.id;if(x.img&&!cur.img){cur.img=x.img;delete cur.example;delete cur.site;imgN++}}
    else{library.push({id:x.id,name:x.name,img:x.img||null,...(x.example?{example:true}:{})});idMap[x.id]=x.id;exN++}}
  const remap=s=>{s.blocks.forEach(b=>b.items.forEach(it=>{if(it.exId&&idMap[it.exId])it.exId=idMap[it.exId]}));return s};
  const incoming=d.sheets.slice();if(d.draft&&hasContent(d.draft)&&!incoming.some(s=>s.id===d.draft.id))incoming.push({...d.draft,savedAt:Date.parse(d.exportedAt)||Date.now()});
  for(const s of incoming){if(!s||!s.id||!Array.isArray(s.blocks))continue;const i=sheets.findIndex(x=>x.id===s.id);
    if(i<0){sheets.push(remap(clone(s)));shN++}else if((s.savedAt||0)>(sheets[i].savedAt||0))sheets[i]=remap(clone(s))}
  if(d.settings){for(const k of['logo','link','signature'])if(d.settings[k])settings[k]=d.settings[k]}
  saveLib();saveSheets();saveSettings();renderEditor();renderPreview();renderHistory();
  toast(`Copia importada: ${exN} ejercicios nuevos, ${imgN} imágenes, ${shN} fichas.`)});

/* ---------- imagens do site (pasta imagens/, lista gerada no deploy por scripts/gerar-lista.js) ---------- */
async function loadSiteImages(){let files;try{const r=await fetch('imagens/lista.json',{cache:'no-cache'});if(!r.ok)return;files=await r.json()}catch(e){return}
  if(!Array.isArray(files))return;const seen=new Set();
  for(const f of files){const parts=String(f).split('/');const name=cleanName(parts[parts.length-1]),cat=catOf(parts.slice(0,-1)),id='site:'+(cat?cat+'/':'')+name;
    if(!name||seen.has(id))continue;seen.add(id);const url='imagens/'+parts.map(encodeURIComponent).join('/');
    // um exercício do navegador sem pasta e com o mesmo nome passa a usar a imagem (e a pasta) do site
    const ex=libById(id)||library.find(x=>!x.siteImg&&!x.cat&&x.name===name);
    if(ex){ex.siteImg=url;if(!ex.cat&&cat)ex.cat=cat}else library.push({id,name,cat,img:null,siteImg:url,site:true})}}

/* ---------- início ---------- */
(async()=>{settings={...DEFAULT_SETTINGS,...(await DB.get('settings')||{})};
  library=(await DB.get('library')||[]).filter(x=>!(x.example&&!x.img));
  await loadSiteImages();
  sheets=await DB.get('sheets')||[];
  // ao abrir ou atualizar a página a ficha começa limpa (mantém só nº e datas);
  // a ficha anterior, se tinha exercícios, vai para o histórico para não se perder
  const draft=await DB.get('draft');
  if(draft&&hasContent(draft)){sheet=draft;upsertHistory(true)}
  sheet=draft?{id:uid(),num:draft.num,goal:'',from:draft.from,to:draft.to,comments:'',blocks:blankBlocks()}:sampleSheet();saveDraft();
  renderEditor();renderPreview()})();
