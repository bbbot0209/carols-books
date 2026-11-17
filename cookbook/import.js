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

// ---------- text → recipe fields: STRICT section parser (v20261116c) ----------
// A line that is a KNOWN header starts a section; its content runs until the next known header line.
// Unknown header-looking lines are just content. Headers may carry content on the same line
// ("Ingredients: 2 cups flour", "INGREDIENTS 2 cups flour", "Serves 4", "Prep time: 10 min | Cook time: 1 hr").
// Text before the first header = title (first line) + intro (→ notes). Only when there are NO ingredient/step
// headers at all do we fall back to guessing (quantity-looking lines → ingredients, the rest → steps).
const AP="(?:'|’)?";
const HDRS=[
  ['ing','ingredients?|ingredient\\s*list'],
  ['stp','instructions?|steps?|directions?|methods?|preparations?'],
  ['notes',`cook${AP}s\\s*notes?|chef${AP}s\\s*notes?|recipe\\s*notes?|notes?|tips?`],
  ['time','(?:prep(?:aration)?|cook(?:ing)?|total|bake|baking|active|inactive|chill(?:ing)?|rest(?:ing)?|ready\\s*in)\\s*times?|times?'],
  ['time2','prep|cook|total|ready\\s*in'],           // short forms: need a colon
  ['servings','servings?|serves|yields?|makes|portions?'],
  ['category','categor(?:y|ies)|course'],
  ['cuisine','cuisines?'],
  ['from',`from|source|recipe\\s*from|submitted\\s*by|courtesy\\s*of`],
].map(([k,src])=>[k,new RegExp('^('+src+')','i')]);
const META=new Set(['time','servings','category','cuisine','from']);
const BULLET_RE=/^\s*(?:[-–—•*·▪▢□☐◦‣○●]|\[\s?\])\s*/;
const NUM_RE=/^\s*(?:step\s*)?\d{1,2}\s*[.):]\s*|^\s*step\s*\d{1,2}\s*[:.)-]?\s*/i;
const FRAC='½¼¾⅓⅔⅛⅜⅝⅞';
const UNIT='(?:cups?|c\\.|tbsps?|tablespoons?|tbs|tsps?|teaspoons?|t\\.|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|litres?|quarts?|qt|pints?|pt|gallons?|cans?|cloves?|sticks?|slices?|pinch(?:es)?|dash(?:es)?|packages?|pkgs?|envelopes?|bunch(?:es)?|heads?|large|medium|small|whole|handful)';
const QTY_RE=new RegExp(`^(?:\\d+(?:[./]\\d+)?(?:\\s*-\\s*\\d+)?|[${FRAC}]|\\d+\\s*[${FRAC}]|(?:a|one|two|three|four|five|six|half)\\s+${UNIT}\\b)\\s*(?:${UNIT}\\b|[a-z]|\\()`,'i');
const isQty=l=>QTY_RE.test(l.replace(BULLET_RE,''))&&!/^\s*\d{1,2}\s*[.)]\s/.test(l)&&l.length<=120
  ||/^(?:salt|pepper|salt and pepper|salt & pepper)\b/i.test(l.replace(BULLET_RE,''))&&l.length<40;
const clean=l=>l.replace(BULLET_RE,'').replace(NUM_RE,'').trim();
const capWord=w=>w[0].toUpperCase()+w.slice(1).toLowerCase();
// split "20 minutes Cook Time: 3 hours" before the next meta keyword
const META_IN=/\s+(?=(?:(?:prep(?:aration)?|cook(?:ing)?|total|bake|baking|active|inactive|chill(?:ing)?|rest(?:ing)?)\s*time\b|(?:serves|servings?|yields?|makes|cuisines?|categor(?:y|ies)|course|source|from|prep|cook|total)\s*[:：]))/i;

function header(line,joined){
  let s=line.replace(/\*\*|__/g,'').replace(/^[\s#>*_]+/,'').trim();
  let best=null;
  for(const [kind,re] of HDRS){const m=s.match(re);if(m&&(!best||m[1].length>best.word.length))best={kind,word:m[1]}}
  if(!best)return joined?null:(line.length<=30&&/\s/.test(line.trim())?header(line.replace(/\s+/g,''),true):null);
  let rest=s.slice(best.word.length);
  if(/^[a-z]/.test(rest))return null;                    // "Notebook", "Stepsister", "Ingredientsflour"
  const glued=/^[A-Z]/.test(rest);                        // "IngredientsFor the crust:" (merged by the reader)
  rest=rest.replace(/^\s*\([^)]{0,40}\)/,'');            // "Ingredients (for 4)"
  const sep=rest.match(/^\s*[:：=–—-]\s*/);
  rest=(sep?rest.slice(sep[0].length):rest).replace(/^[\s*_]+|[\s*_]+$/g,'');
  let kind=best.kind;
  if(kind==='time2'){if(!sep)return null;kind='time'}
  if(rest&&!sep){
    const caps=best.word===best.word.toUpperCase()&&/[A-Z]{3}/.test(best.word);
    let ok=false;
    if(kind==='servings')ok=/^(?:about\s+|approx\.?\s+|up to\s+)?[\d½¼¾⅓⅔]|^(?:one|two|three|four|five|six|eight|ten|twelve|a dozen|about)\b/i.test(rest);
    else if(kind==='time')ok=!/^times?$/i.test(best.word)&&/^(?:about\s+|approx\.?\s+|under\s+)?\d/i.test(rest);
    else if(kind==='ing'||kind==='stp'||kind==='notes'){
      if(/^steps?$/i.test(best.word)&&/^\d/.test(rest))return null;   // "Step 1 …" is a step, not a header
      ok=caps||glued||/^[\d½¼¾⅓⅔⅛•·*(–-]/.test(rest)||(rest.endsWith(':')&&rest.length<=40);
    }
    if(!ok)return null;
  }
  return{kind,word:best.word.replace(/\s+/g,' '),rest};
}
const timeLabel=w=>{w=w.toLowerCase().replace(/\s*times?$/,'').replace(/^preparation$/,'prep').replace(/^cooking$/,'cook').replace(/^baking$/,'bake').replace(/^chilling$/,'chill').replace(/^resting$/,'rest');return w?capWord(w):''};
const splitTags=v=>v.split(/\s*[,;/|•·]\s*|\s+(?:and|&)\s+/).map(x=>x.replace(/^[\s*_-]+|[\s*_.]+$/g,'')).filter(x=>x&&x.length<=60);
function normTags(list,sug){const out=[],seen=new Set();
  for(let v of list){v=v.trim();const k=sug.find(x=>x.toLowerCase()===v.toLowerCase());v=k||v.replace(/^\p{Ll}/u,c=>c.toUpperCase());
    if(v&&!seen.has(v.toLowerCase())){seen.add(v.toLowerCase());out.push(v)}}
  return out.slice(0,12)}

// Join wrapped lines: when a section uses markers (bullets/numbers), unmarked lines continue the previous item.
function joinWrapped(lines){
  const mk=l=>BULLET_RE.test(l)||NUM_RE.test(l);
  if(lines.filter(mk).length<2)return lines;
  const out=[];
  for(const l of lines){
    if(out.length&&!mk(l)&&!/:$/.test(l)&&!/:$/.test(out[out.length-1]))out[out.length-1]+=' '+l.trim();
    else out.push(l);
  }
  return out;
}

function parseText(text,fallbackTitle=''){
  const raw=String(text||'').replace(/\r\n?/g,'\n').replace(/[   ]/g,' ').replace(/[​﻿]/g,'');
  const r={title:'',ingredients:'',steps:'',servings:'',time:'',notes:'',from:'',categories:[],cuisines:[]};
  const sec={pre:[],ing:[],stp:[],notes:[]},times=[];
  let main='pre',meta=null,sawMain=false;
  const apply=(kind,word,val)=>{
    for(const part of String(val).split(META_IN)){       // "20 minutes Cook Time: 3 hours"
      const h=part!==val?header(part):null;
      if(h&&META.has(h.kind)){apply(h.kind,h.word,h.rest);continue}
      const v=part.trim().replace(/[.;,]+$/,'');if(!v)continue;
      if(kind==='servings'){if(!r.servings)r.servings=v}
      else if(kind==='time'){const lb=timeLabel(word);times.push(lb?lb+' '+v:v)}
      else if(kind==='category')r.categories.push(...splitTags(v));
      else if(kind==='cuisine')r.cuisines.push(...splitTags(v));
      else if(kind==='from'){if(!r.from)r.from=v}
    }
  };
  for(const rawLine of raw.split('\n')){
    const l=rawLine.replace(/[ \t]+/g,' ').trim();
    if(!l){if(meta)meta.blank=true;sec[main].push('');continue}
    if(/^[-=_*#~.]{3,}$/.test(l))continue;
    // "Prep time: 15 min | Cook time: 1 hr | Serves: 8" (or tab / wide-space separated)
    const segs=rawLine.trim().split(/\s*[|•·\t]\s*|\s{3,}/).map(x=>x.trim()).filter(Boolean);
    if(segs.length>1){const h0=header(segs[0]);
      if(h0&&META.has(h0.kind)&&h0.kind!=='category'&&h0.kind!=='cuisine'){const extra=[];
        for(const sg of segs){const h=header(sg);if(h&&META.has(h.kind)){if(h.rest)apply(h.kind,h.word,h.rest)}else extra.push(sg)}
        if(extra.length)sec[main].push(extra.join(' '));meta=null;continue}}
    const h=header(l);
    if(h){
      if(META.has(h.kind)){meta=null;if(h.rest)apply(h.kind,h.word,h.rest);else meta={kind:h.kind,word:h.word,n:0};continue}
      main=h.kind;meta=null;if(main!=='notes')sawMain=true;
      if(h.rest)sec[main].push(h.rest);
      continue;
    }
    if(meta){   // a standalone meta header ("Cuisine" ⏎ "Italian") takes the short line(s) right after it
      const multi=meta.kind==='category'||meta.kind==='cuisine';
      if(l.length<=60&&(meta.n===0||(multi&&!meta.blank))){apply(meta.kind,meta.word,l);meta.n++;if(!multi)meta=null;continue}
      meta=null;
    }
    sec[main].push(l);
  }
  const nb=a=>a.filter(Boolean);
  const pre=[...sec.pre];while(pre.length&&!pre[0])pre.shift();
  if(pre.length&&pre[0].length<=120)r.title=pre.shift().replace(/^#+\s*/,'').replace(/\*\*|__/g,'').replace(/^recipe\s*:\s*/i,'').trim();
  if(/\p{Lu}{3}/u.test(r.title)&&r.title===r.title.toUpperCase())r.title=r.title.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu,(m,a,c)=>a+c.toUpperCase());   // MANDEL BREAD → Mandel Bread
  let intro=pre;
  if(!sawMain){   // no Ingredients/Steps headers anywhere → guess from the body
    const body=nb(intro);
    if(body.some(isQty)){sec.ing=body.filter(isQty);sec.stp=body.filter(l=>!isQty(l));intro=[]}
  }
  r.ingredients=joinWrapped(nb(sec.ing)).map(clean).filter(Boolean).join('\n');
  r.steps=joinWrapped(nb(sec.stp)).map(clean).filter(Boolean).join('\n');
  const tidy=a=>a.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  r.notes=[tidy(intro),tidy(sec.notes)].filter(Boolean).join('\n\n');
  r.time=[...new Set(times)].join(', ').slice(0,120);
  r.servings=r.servings.slice(0,60);r.from=r.from.slice(0,100);
  r.categories=normTags(r.categories,CATS);r.cuisines=normTags(r.cuisines,CUISINES);
  if(!r.title)r.title=fallbackTitle;
  r.title=r.title.slice(0,200);
  r.ok=!!(r.ingredients||r.steps);
  if(!r.ok){r.notes=raw.replace(/\n{3,}/g,'\n\n').trim();r.ingredients=r.steps=''}
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
  const tags=v=>(Array.isArray(v)?v:[v]).filter(Boolean).flatMap(x=>splitTags(decodeEnt(x)));
  const catMap=c=>CATS.find(x=>x.toLowerCase()===c.toLowerCase())||(/^(main|entr[eé]e|dinner)/i.test(c)?'Main':/^(dessert|sweet)/i.test(c)?'Dessert':/^(appetizer|starter)/i.test(c)?'Appetizer':/^(side)/i.test(c)?'Side':/^(drink|beverage|cocktail)/i.test(c)?'Drinks':c);
  const r={title:decodeEnt(rc.name||''),ingredients:ings.join('\n'),steps:stepsOf(rc.recipeInstructions).map(clean).join('\n'),
    servings:serv.slice(0,60),time:times.join(', ').slice(0,120),notes:decodeEnt(rc.description||''),from:'',
    categories:normTags(tags(rc.recipeCategory).map(catMap),CATS),cuisines:normTags(tags(rc.recipeCuisine),CUISINES)};
  r.ok=!!(r.ingredients||r.steps);
  return r;
}

// ---------- HTML → readable text ----------
function htmlText(root){
  const BLOCK=/^(P|DIV|LI|H[1-6]|BR|TR|TD|TH|SECTION|ARTICLE|HEADER|FOOTER|UL|OL|TABLE|BLOCKQUOTE|PRE|DT|DD|FIGCAPTION)$/;
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
    for(const k of ['title','from','servings','time','ingredients','steps','notes'])if(fields[k])$('#f-'+k).value=fields[k];
    tagAdd('categories',(fields.categories||[]).join(','));tagAdd('cuisines',(fields.cuisines||[]).join(','));
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
