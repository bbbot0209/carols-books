// Family Cookbook — import a recipe from a file (Import button or drag-and-drop). Parsing is 100% client-side:
// free libraries load from jsDelivr only when needed (pdf.js, mammoth for .docx, tesseract.js for OCR).
// The result always opens the normal Add form prefilled; nothing is saved until she taps Save.
'use strict';
const LIB={
  pdf:'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  pdfWorker:'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  mammoth:'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
  tesseract:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
};
const loaded={};
const loadScript=src=>loaded[src]||(loaded[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.async=true;
  s.onload=res;s.onerror=()=>{delete loaded[src];rej(new Error('Could not load the file reader — check the connection'))};document.head.append(s)}));

// ---------- busy overlay ----------
function busy(t){const b=$('#busy');if(t===false){b.hidden=true;return}b.hidden=false;$('#busyt').textContent=t}

// ---------- text → recipe fields ----------
const HEAD_RE=/^(?:#+\s*)?(ingredients?|directions?|instructions?|method|preparation|steps?|notes?|tips?|for the [\w ]{2,30})\s*:?\s*$/i;
const secKind=h=>{h=h.toLowerCase();return /^ingredient/.test(h)?'ing':/^(direction|instruction|method|preparation|step)/.test(h)?'stp':/^(note|tip)/.test(h)?'notes':'sub'};
const BULLET_RE=/^\s*(?:[-–—•*·▪▢□☐◦‣○●]|\[\s?\])\s*/;
const NUM_RE=/^\s*(?:step\s*)?\d{1,2}\s*[.)]\s+|^\s*step\s*\d{1,2}\s*[:.)-]?\s*/i;
const FRAC='½¼¾⅓⅔⅛⅜⅝⅞';
const UNIT='(?:cups?|c\\.|tbsps?|tablespoons?|tbs|tsps?|teaspoons?|t\\.|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|litres?|quarts?|qt|pints?|pt|gallons?|cans?|cloves?|sticks?|slices?|pinch(?:es)?|dash(?:es)?|packages?|pkgs?|envelopes?|bunch(?:es)?|heads?|large|medium|small|whole|handful)';
const QTY_RE=new RegExp(`^(?:\\d+(?:[./]\\d+)?(?:\\s*-\\s*\\d+)?|[${FRAC}]|\\d+\\s*[${FRAC}]|(?:a|one|two|three|four|five|six|half)\\s+${UNIT}\\b)\\s*(?:${UNIT}\\b|[a-z]|\\()`,'i');
const isQty=l=>QTY_RE.test(l.replace(BULLET_RE,''))&&!/^\s*\d{1,2}\s*[.)]\s/.test(l)&&l.length<=120
  ||/^(?:salt|pepper|salt and pepper|salt & pepper)\b/i.test(l.replace(BULLET_RE,''))&&l.length<40;
const clean=l=>l.replace(BULLET_RE,'').replace(NUM_RE,'').trim();
// a value runs until a separator, the end, or the next meta keyword ("Prep Time: 20 min   Cook Time: 3 hr")
const END='(?=\\s*(?:[|•;,]|$)|\\s+(?:prep|preparation|cook|cooking|total|bake|baking|active|inactive|chill|serves|servings?|yields?|makes)\\b)';
const SERV_RE=new RegExp('\\b(?:serves|servings?|yields?|makes)\\b\\s*:?\\s*([^|•;\\n]{1,40}?)'+END.replace('|serves|servings?',''),'i');
const TIME_RE=new RegExp('\\b(prep(?:aration)?|cook(?:ing)?|total|bake|baking|active|inactive|chill(?:ing)?)\\s*(?:time)?\\s*:\\s*([^|•;\\n,]{1,30}?)'+END+
  '|\\b(prep(?:aration)?|cook(?:ing)?|total|bake|baking)\\s+time\\s*:?\\s*([^|•;\\n,]{1,30}?)'+END+'|^\\s*time\\s*:\\s*([^|•;\\n]{1,40}?)'+END,'gi');
const capWord=w=>w[0].toUpperCase()+w.slice(1).toLowerCase();

function metaOf(line){
  // pull servings/time out of a line; returns {servings, times[], rest}
  let rest=line,servings='',times=[];
  const sm=line.match(SERV_RE);if(sm){servings=sm[1].trim().replace(/[.\s]+$/,'');rest=rest.replace(sm[0],' ')}
  for(const m of line.matchAll(TIME_RE)){
    const k=m[1]||m[3],v=(m[2]||m[4]||m[5]||'').trim().replace(/[.\s]+$/,'');if(!v)continue;
    times.push(k?capWord(k.replace(/^preparation$/i,'prep').replace(/^cooking$/i,'cook'))+' '+v:v);rest=rest.replace(m[0],' ')}
  return{servings,times,rest:rest.replace(/[|•;,\s]+/g,' ').trim()};
}

// Join wrapped lines: when a section uses markers (bullets/numbers), unmarked lines continue the previous item.
function joinWrapped(lines){
  const marked=lines.filter(l=>BULLET_RE.test(l)||NUM_RE.test(l)).length;
  if(marked<2)return lines;
  const out=[];
  for(const l of lines){
    if(out.length&&!(BULLET_RE.test(l)||NUM_RE.test(l))&&!/:$/.test(l)&&!/:$/.test(out[out.length-1]))out[out.length-1]+=' '+l.trim();
    else out.push(l);
  }
  return out;
}

function parseText(text,fallbackTitle=''){
  const raw=String(text||'').replace(/\r\n?/g,'\n').replace(/ /g,' ');
  const lines=raw.split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(l=>l&&!/^[-=_*#~.]{3,}$/.test(l));
  const r={title:'',ingredients:'',steps:'',servings:'',time:'',notes:'',category:''};
  const times=[],pre=[],secs={ing:[],stp:[],notes:[]};
  let cur=null,sawHead=false,lastMain=null;
  for(let l of lines){
    l=l.replace(/^#+\s*/,'');
    const h=l.match(HEAD_RE);
    if(h){const k=secKind(h[1]);sawHead=true;
      if(k==='sub'){const tgt=cur==='stp'||lastMain==='stp'?'stp':'ing';cur=cur||tgt;secs[cur==='notes'?'ing':cur].push(capWord(h[1])+':');}
      else{cur=k;if(k!=='notes')lastMain=k}
      continue}
    const nm=l.match(/^(?:notes?|tips?)\s*:\s*(.+)$/i);
    if(nm){cur='notes';secs.notes.push(nm[1]);continue}
    const m=metaOf(l);
    if((m.servings||m.times.length)&&m.rest.length<12&&cur!=='stp'){if(m.servings&&!r.servings)r.servings=m.servings;times.push(...m.times);continue}
    if(!r.title&&!cur&&/\p{L}{2}/u.test(l)&&l.length<=100&&!/^https?:/i.test(l)){r.title=l.replace(/^recipe\s*:\s*/i,'');continue}
    if(cur)secs[cur].push(l);else pre.push(l);
  }
  if(sawHead&&!secs.ing.length&&secs.stp.length){       // steps had a heading but the ingredients didn't
    const q=pre.filter(isQty);if(q.length>=2){secs.ing=q;for(const l of q)pre.splice(pre.indexOf(l),1)}
  }
  if(!sawHead||(!secs.ing.length&&!secs.stp.length)){
    // no headings: quantity-looking lines → ingredients, the rest → steps
    const all=[...pre,...secs.ing,...secs.stp];pre.length=0;secs.ing=[];secs.stp=[];
    for(const l of all)(isQty(l)?secs.ing:secs.stp).push(l);
    if(!secs.ing.length){secs.stp=[];pre.push(...all)}   // nothing recipe-like → leave it all for notes
  }
  r.ingredients=joinWrapped(secs.ing).map(clean).filter(Boolean).join('\n');
  r.steps=joinWrapped(secs.stp).map(clean).filter(Boolean).join('\n');
  r.notes=[...pre,...secs.notes].join('\n');
  r.time=[...new Set(times)].join(', ').slice(0,120);
  r.servings=r.servings.slice(0,60);
  if(!r.title)r.title=fallbackTitle;
  r.title=r.title.slice(0,200);
  r.ok=!!(r.ingredients||r.steps);
  if(!r.ok){r.notes=raw.trim();r.ingredients=r.steps=''}
  return r;
}

// ---------- schema.org Recipe (JSON-LD / .json) ----------
function findRecipe(o,depth=0){
  if(!o||typeof o!=='object'||depth>6)return null;
  if(Array.isArray(o)){for(const x of o){const f=findRecipe(x,depth+1);if(f)return f}return null}
  const t=o['@type'];if(t==='Recipe'||(Array.isArray(t)&&t.includes('Recipe')))return o;
  for(const k of ['@graph','mainEntity','mainEntityOfPage','itemListElement']){const f=findRecipe(o[k],depth+1);if(f)return f}
  return null;
}
const decodeEnt=s=>{const t=document.createElement('textarea');t.innerHTML=String(s||'');return t.value.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()};
function isoDur(s){const m=String(s||'').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);if(!m||!(m[1]||m[2]||m[3]))return String(s||'').trim();
  let h=+(m[2]||0)+24*+(m[1]||0),mi=+(m[3]||0);if(mi>=60){h+=Math.floor(mi/60);mi%=60}
  return [h?`${h} hr`:'',mi?`${mi} min`:''].filter(Boolean).join(' ')}
function stepsOf(x,out=[]){
  if(!x)return out;
  if(typeof x==='string'){x.split(/\n+/).map(decodeEnt).filter(Boolean).forEach(s=>out.push(s));return out}
  if(Array.isArray(x)){x.forEach(y=>stepsOf(y,out));return out}
  if(x['@type']==='HowToSection'||x.itemListElement){if(x.name)out.push(decodeEnt(x.name).replace(/:?$/,':'));stepsOf(x.itemListElement,out);return out}
  if(x.text||x.name)out.push(decodeEnt(x.text||x.name));
  return out;
}
function fromLd(rc){
  const one=v=>Array.isArray(v)?v.filter(Boolean)[0]:v;
  const y=rc.recipeYield;let serv=Array.isArray(y)?(y.find(v=>/\D/.test(String(v)))||y[0]):y;serv=decodeEnt(serv||'');
  const times=[['Prep',rc.prepTime],['Cook',rc.cookTime],['Total',rc.totalTime]].filter(([,v])=>v).map(([k,v])=>k+' '+isoDur(v));
  const ings=(Array.isArray(rc.recipeIngredient||rc.ingredients)?rc.recipeIngredient||rc.ingredients:[rc.recipeIngredient||rc.ingredients]).filter(Boolean).map(decodeEnt);
  const cat=decodeEnt(one(rc.recipeCategory)||'');
  const catMatch=CATS.find(c=>c.toLowerCase()===cat.toLowerCase()||cat.toLowerCase().startsWith(c.toLowerCase()))||(/main|entr[eé]e|dinner/i.test(cat)?'Main':/dessert|sweet/i.test(cat)?'Dessert':cat);
  const r={title:decodeEnt(rc.name||''),ingredients:ings.join('\n'),steps:stepsOf(rc.recipeInstructions).map(clean).join('\n'),
    servings:serv.slice(0,60),time:times.join(', ').slice(0,120),category:catMatch.slice(0,60),notes:decodeEnt(rc.description||'')};
  r.ok=!!(r.ingredients||r.steps);
  return r;
}

// ---------- HTML → readable text ----------
function htmlText(root){
  const BLOCK=/^(P|DIV|LI|H[1-6]|BR|TR|SECTION|ARTICLE|HEADER|FOOTER|UL|OL|TABLE|BLOCKQUOTE|PRE|DT|DD|FIGCAPTION)$/;
  let out='';
  (function walk(n){
    for(const c of n.childNodes){
      if(c.nodeType===3)out+=c.nodeValue.replace(/\s+/g,' ');
      else if(c.nodeType===1){
        if(/^(SCRIPT|STYLE|NOSCRIPT|NAV|ASIDE|FORM|BUTTON|SVG|IFRAME|TEMPLATE)$/.test(c.tagName))continue;
        const b=BLOCK.test(c.tagName);if(b)out+='\n';if(c.tagName==='LI')out+='- ';
        walk(c);if(b)out+='\n';
      }
    }
  })(root);
  return out;
}
function parseHtml(src,name){
  const doc=new DOMParser().parseFromString(src,'text/html');
  for(const s of doc.querySelectorAll('script[type="application/ld+json"]')){
    try{const rc=findRecipe(JSON.parse(s.textContent));if(rc){const r=fromLd(rc);if(r.ok||r.title)return r}}catch{}
  }
  const main=doc.querySelector('[itemtype*="schema.org/Recipe"]')||doc.querySelector('article')||doc.querySelector('main')||doc.body;
  if(!main)return parseText('',name);
  const ttl=(doc.querySelector('h1')||{}).textContent;
  const r=parseText(htmlText(main),(ttl||doc.title||name).trim());
  return r;
}

// ---------- file readers ----------
const ext=f=>(f.name.match(/\.([a-z0-9]+)$/i)||[,''])[1].toLowerCase();
const baseName=f=>f.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
async function ocr(img,label){
  await loadScript(LIB.tesseract);
  busy(label+'…');
  const res=await Tesseract.recognize(img,'eng',{logger:m=>{if(m.status==='recognizing text')busy(`${label}… ${Math.round(m.progress*100)}%`)}});
  return res.data.text||'';
}
async function readPdf(f){
  await loadScript(LIB.pdf);
  const lib=window.pdfjsLib;lib.GlobalWorkerOptions.workerSrc=LIB.pdfWorker;
  const pdf=await lib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;
  const pages=[];
  for(let i=1;i<=Math.min(pdf.numPages,30);i++){
    busy(`Reading page ${i} of ${pdf.numPages}…`);
    const pg=await pdf.getPage(i),tc=await pg.getTextContent();
    let t='',lastY=null;
    for(const it of tc.items){
      const y=it.transform?it.transform[5]:null;
      if(lastY!==null&&y!==null&&Math.abs(y-lastY)>2&&!t.endsWith('\n'))t+='\n';
      t+=it.str;if(it.hasEOL)t+='\n';if(y!==null)lastY=y;
    }
    if(t.replace(/\s/g,'').length<20){        // scanned page → OCR it
      const vp=pg.getViewport({scale:2}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
      await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
      t=await ocr(c,`Reading page ${i} (scan)`);
    }
    pages.push(t);
  }
  return pages.join('\n');
}
async function decodeImage(f){
  const url=URL.createObjectURL(f);
  try{const img=new Image();img.src=url;await img.decode();
    const s=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');
    c.width=Math.round(img.naturalWidth*s);c.height=Math.round(img.naturalHeight*s);
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);return c}
  catch{throw new Error('Can’t open that picture — try a JPEG or PNG')}
  finally{URL.revokeObjectURL(url)}
}

// returns {fields, photoBlob?}
async function parseFile(f){
  const e=ext(f),type=(f.type||'').toLowerCase(),name=baseName(f);
  if(f.size>40*1024*1024)throw new Error('That file is too big');
  if(e==='pdf'||type==='application/pdf')return{fields:parseText(await readPdf(f),name)};
  if(e==='docx'||type.includes('wordprocessingml')){
    await loadScript(LIB.mammoth);busy('Reading document…');
    const out=await mammoth.convertToHtml({arrayBuffer:await f.arrayBuffer()});
    const doc=new DOMParser().parseFromString('<body>'+out.value+'</body>','text/html');
    return{fields:parseText(htmlText(doc.body),name)};
  }
  if(e==='doc')throw new Error('Old .doc files can’t be read — save it as .docx or PDF');
  if(/^(html?|xhtml)$/.test(e)||type.includes('html'))return{fields:parseHtml(await f.text(),name)};
  if(e==='json'||type.includes('json')){
    const t=await f.text();let rc=null;try{rc=findRecipe(JSON.parse(t))}catch{}
    return{fields:rc?fromLd(rc):parseText(t,name)};
  }
  if(type.startsWith('image/')||/^(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/.test(e)){
    busy('Opening picture…');
    const c=await decodeImage(f);
    const fields=parseText(await ocr(c,'Reading picture'),name);
    return{fields,image:f};
  }
  if(/^(txt|md|markdown|text|rtf)$/.test(e)||type.startsWith('text/')||!e){
    let t=await f.text();
    if(e==='rtf')t=t.replace(/\\par[d]?/g,'\n').replace(/\{\\[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/gi,'');
    return{fields:parseText(t,name)};
  }
  throw new Error('Can’t read that kind of file');
}

// ---------- queue: one file at a time, each through the Add form ----------
const importQ=[];
let importing=false;
function queueFiles(files){
  const fs=[...files].filter(f=>f&&f.size>0);if(!fs.length)return;
  importQ.push(...fs);if(!importing&&!ed&&$('#edit').hidden)nextImport();
}
async function nextImport(){
  if(importing||!importQ.length||!tok)return;
  importing=true;
  const f=importQ.shift();
  try{
    busy('Reading '+f.name+'…');
    const {fields,image}=await parseFile(f);
    busy(false);
    openEdit('');ed.fromImport=true;
    for(const k of ['title','from','category','servings','time','ingredients','steps','notes'])if(fields[k])$('#f-'+k).value=fields[k];
    catSug();
    if(image&&confirm('Use this picture as the recipe photo?')){
      try{const b=await shrink(image);if(ed){ed.blob=b;ed.blobUrl=URL.createObjectURL(b);showPhoto()}}catch{}
    }
    const left=importQ.length?` (${importQ.length} more after this)`:'';
    if(!fields.ok)msg('Couldn’t find the parts — check the fields'+left,7000);
    else msg('Check it over, then Save'+left,5000);
  }catch(e){
    busy(false);msg((e&&e.message)||'Couldn’t read that file',6000);
    importing=false;if(importQ.length)setTimeout(nextImport,600);return;
  }
  importing=false;
}

// ---------- wiring ----------
$('#imp').onclick=()=>$('#impf').click();
$('#impf').onchange=e=>{const fs=[...e.target.files];e.target.value='';queueFiles(fs)};
// drag-and-drop anywhere on the list screen
let dragDepth=0;
const hasFiles=e=>e.dataTransfer&&[...(e.dataTransfer.types||[])].includes('Files');
const onList=()=>!$('#app').hidden&&$('#view').hidden&&$('#edit').hidden;
window.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();if(onList()){dragDepth++;$('#drop').hidden=false}});
window.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect=onList()?'copy':'none'});
window.addEventListener('dragleave',e=>{if(!hasFiles(e))return;dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('#drop').hidden=true});
window.addEventListener('drop',e=>{if(!hasFiles(e)&&!(e.dataTransfer&&e.dataTransfer.files.length))return;e.preventDefault();dragDepth=0;$('#drop').hidden=true;
  if(onList())queueFiles(e.dataTransfer.files)});
