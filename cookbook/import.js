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
  // v20261117a: "Preparation" is a Steps header like Instructions/Steps/Directions/Method, incl. the two-word forms
  ['stp','(?:preparation|cooking|baking)\\s*(?:steps?|instructions?|directions?|methods?)|methods?\\s*of\\s*preparation|instructions?|steps?|directions?|methods?|preparations?'],
  ['special','special\\s*instructions?'],          // v20261116f: its own field
  ['modifications','my\\s*modifications?|modifications?|my\\s*changes|changes|variations?'],   // v20261117a: its own field
  ['notes',`cook${AP}s\\s*notes?|chef${AP}s\\s*notes?|recipe\\s*notes?|notes?|tips?`],
  ['time','(?:prep(?:aration)?|cook(?:ing)?|total|bake|baking|active|inactive|chill(?:ing)?|rest(?:ing)?|ready\\s*in)\\s*times?|times?'],
  ['time2','prep|cook|total|ready\\s*in'],           // short forms: need a colon
  ['servings','servings?|serves|yields?|makes|portions?'],
  ['category','categor(?:y|ies)|course'],
  ['cuisine','cuisines?'],
  ['from',`from|source|recipe\\s*from|submitted\\s*by|courtesy\\s*of|author`],
  ['skip','nutrition(?:\\s*(?:facts|information|info))?|qr\\s*code|private\\s*notes?'],   // printed-page extras: content dropped until the next header
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
const META_IN=/\s+(?=(?:(?:prep(?:aration)?|cook(?:ing)?|total|bake|baking|active|inactive|chill(?:ing)?|rest(?:ing)?)\s*time\b|(?:serves|servings?|yields?|makes|cuisines?|categor(?:y|ies)|course|source|from|author|prep|cook|total)\s*[:：]))/i;

// Whole lines that are web/print boilerplate, never recipe content (ratings, shop ads, QR / print / pin prompts).
const DROP_RE=/^(?:\d(?:\.\d+)?\s+(?:from|stars? from)\s+[\d,]+\s+(?:votes?|ratings?|reviews?)$|(?:visit our shop|scan (?:this|the) qr code|did you make this recipe|tried this recipe|pin (?:this )?recipe|print (?:this )?recipe|rate this recipe|jump to (?:recipe|video|comments?|instructions|ingredients|nutrition)|watch (?:the |this )?(?:recipe )?video|leave a (?:private )?(?:comment|note|review))\b|ratings?\s*:?\s*\(?[\d.,]+\)?(?:\s*(?:ratings?|reviews?|votes?|stars?))?$|(?:last\s+)?(?:updated|published|posted)(?:\s+on)?\s*:?\s+(?:[a-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})$)/i;
// The PDF reader marks a positional gap between two text runs that has no space character (WPRM "onion|finely chopped").
const GLUE='\u2063';
// In an ingredient line the first such gap after a comma-free name becomes ", " (onion, finely chopped); any other gap a space.
const unglue=l=>{let first=true;return l.replace(/\u2063/g,(m,i,str)=>{const pre=str.slice(0,i).replace(/\u2063/g,' ');
  const c=first&&!pre.includes(',')&&/[A-Za-z)]$/.test(pre)&&/^[a-z]/.test(str.slice(i+1));first=false;return c?', ':' '})};
const DUR_RE=/^(?:about\s+|approx\.?\s+|under\s+)?\d+(?:[.,\/]\d+)?(?:\s*[-–]\s*\d+)?\s*(?:min(?:ute)?s?|hrs?|hours?)\b\.?(?:\s*(?:and\s+)?\d+\s*min(?:ute)?s?\b\.?)?$/i;
// A header word split by the PDF reader ("Prep aration", "Ingre dients") still counts — but only as a bare header
// (nothing else on the line), so "Notes From Grandma" never becomes a "Notes" header.
function header(line,joined){
  const h=header1(line,joined);
  if(h||joined||line.length>30||!/\s/.test(line.trim()))return h;
  const j=header1(line.replace(/\s+/g,''),true);
  return j&&!j.rest?j:null;
}
function header1(line,joined){
  let s=line.replace(/\*\*|__/g,'').replace(/^[\s#>*_]+/,'').trim();
  let best=null;
  for(const [kind,re] of HDRS){const m=s.match(re);if(m&&(!best||m[1].length>best.word.length))best={kind,word:m[1]}}
  if(!best)return joined?null:(line.length<=30&&/\s/.test(line.trim())?header1(line.replace(/\s+/g,''),true):null);
  let rest=s.slice(best.word.length);
  if(/^[a-z]/.test(rest))return null;                    // "Notebook", "Stepsister", "Ingredientsflour"
  const glued=/^[A-Z]/.test(rest);                        // "IngredientsFor the crust:" (merged by the reader)
  rest=rest.replace(/^\s*\([^)]{0,40}\)/,'');            // "Ingredients (for 4)"
  const sep=rest.match(/^\s*[:：=–—-]\s*/);
  rest=(sep?rest.slice(sep[0].length):rest).replace(/^[\s*_]+|[\s*_]+$/g,'');
  let kind=best.kind;
  if(kind==='time2'){if(!sep)return null;kind='time'}
  if(kind==='stp'&&/^preparations?$/i.test(best.word)&&DUR_RE.test(rest))kind='time';   // "Preparation: 20 minutes" is a time
  if(rest&&!sep){
    const caps=best.word===best.word.toUpperCase()&&/[A-Z]{3}/.test(best.word);
    let ok=false;
    if(kind==='servings')ok=/^(?:about\s+|approx\.?\s+|up to\s+)?[\d½¼¾⅓⅔]|^(?:one|two|three|four|five|six|eight|ten|twelve|a dozen|about)\b/i.test(rest);
    else if(kind==='time')ok=!/^times?$/i.test(best.word)&&/^(?:about\s+|approx\.?\s+|under\s+)?\d/i.test(rest);
    else if(kind==='ing'||kind==='stp'||kind==='notes'||kind==='special'||kind==='modifications'){
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
  const r={title:'',ingredients:'',steps:'',special:'',modifications:'',servings:'',time:'',notes:'',from:'',categories:[],cuisines:[]};
  const sec={pre:[],ing:[],stp:[],special:[],modifications:[],notes:[],skip:[]},times=[];
  let main='pre',meta=null,sawMain=false;
  const apply=(kind,word,val)=>{
    for(const part of String(val).split(META_IN)){       // "20 minutes Cook Time: 3 hours"
      const h=part!==val?header(part):null;
      if(h&&META.has(h.kind)){apply(h.kind,h.word,h.rest);continue}
      const v=part.trim().replace(/[.;,]+$/,'');if(!v)continue;
      if(kind==='servings'){if(!r.servings)r.servings=v.replace(/\s*\(up to\)$/i,'').replace(/^(\d+(?:\s*[-–]\s*\d+)?)\s+(?:people|persons)$/i,'$1')}
      else if(kind==='time'){const lb=timeLabel(word);times.push(lb?lb+' '+v:v)}
      else if(kind==='category')r.categories.push(...splitTags(v));
      else if(kind==='cuisine')r.cuisines.push(...splitTags(v));
      else if(kind==='from'){if(!r.from)r.from=v}
    }
  };
  for(const glued of raw.split('\n')){
    const rawLine=glued.replace(/\u2063/g,' ');
    const l=rawLine.replace(/[ \t]+/g,' ').trim();
    if(!l){if(meta)meta.blank=true;sec[main].push('');continue}
    if(/^[-=_*#~.]{3,}$/.test(l)||DROP_RE.test(l))continue;
    // "Prep time: 15 min | Cook time: 1 hr | Serves: 8" (or tab / wide-space separated)
    const segs=rawLine.trim().split(/\s*[|•·\t]\s*|\s{3,}/).map(x=>x.trim()).filter(Boolean);
    if(segs.length>1){const h0=header(segs[0]);
      if(h0&&META.has(h0.kind)&&h0.kind!=='category'&&h0.kind!=='cuisine'){const extra=[];
        for(let k=0;k<segs.length;k++){const sg=segs[k],h=header(sg);
          if(h&&META.has(h.kind)){if(h.rest)apply(h.kind,h.word,h.rest);else if(k+1<segs.length&&!header(segs[k+1]))apply(h.kind,h.word,segs[++k])}   // "Total Time   45 minutes"
          else if(!DROP_RE.test(sg))extra.push(sg)}
        if(extra.length)sec[main].push(extra.join(' '));meta=null;continue}}
    const by=main==='pre'&&!r.from&&l.match(/^[Bb][Yy]\s+(\p{Lu}[\p{L}.'’-]*(?:\s+\p{Lu}[\p{L}.'’-]*){0,3})$/u);   // "By Melissa Clark" byline
    if(by){r.from=by[1];meta=null;continue}
    const h=header(l);
    if(h){
      if(META.has(h.kind)){meta=null;if(h.rest)apply(h.kind,h.word,h.rest);else meta={kind:h.kind,word:h.word,n:0};continue}
      main=h.kind;meta=null;if(main==='ing'||main==='stp')sawMain=true;
      if(h.rest)sec[main].push(h.rest);
      continue;
    }
    if(meta){   // a standalone meta header ("Cuisine" ⏎ "Italian") takes the short line(s) right after it
      const multi=meta.kind==='category'||meta.kind==='cuisine';
      if(l.length<=60&&(meta.n===0||(multi&&!meta.blank))){apply(meta.kind,meta.word,l);meta.n++;if(!multi)meta=null;continue}
      meta=null;
    }
    sec[main].push(main==='ing'&&glued.includes(GLUE)?unglue(glued.replace(/[ \t]+/g,' ').trim()):l);
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
  r.special=tidy(sec.special);
  r.modifications=tidy(sec.modifications);
  r.time=[...new Set(times)].join(', ').slice(0,120);
  r.servings=r.servings.slice(0,60);r.from=r.from.slice(0,100);
  r.categories=normTags(r.categories,CATS);r.cuisines=normTags(r.cuisines,CUISINES);
  if(!r.title)r.title=fallbackTitle;
  r.title=r.title.slice(0,200);
  r.ok=!!(r.ingredients||r.steps);
  if(!r.ok){r.notes=raw.replace(/\u2063/g,' ').replace(/\n{3,}/g,'\n\n').trim();r.ingredients=r.steps=r.special=r.modifications=''}
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
// recipe photo: JSON-LD `image` (string | [..] | ImageObject), else the page's og:image
const ldImage=v=>!v?'':typeof v==='string'?v:Array.isArray(v)?ldImage(v.find(Boolean)):(v.url||v.contentUrl||'');
function parseHtml(src,name){
  const doc=new DOMParser().parseFromString(src,'text/html');
  const og=(doc.querySelector('meta[property="og:image"],meta[name="og:image"]')||{}).content||'';
  for(const s of doc.querySelectorAll('script[type="application/ld+json"]')){
    try{const rc=findRecipe(JSON.parse(s.textContent));if(rc){const r=fromLd(rc);if(r.ok||r.title){r.image=ldImage(rc.image)||og;return r}}}catch{}
  }
  const main=doc.querySelector('[itemtype*="schema.org/Recipe"]')||doc.querySelector('article')||doc.querySelector('main')||doc.body;
  if(!main)return parseText('',name);
  const ttl=(doc.querySelector('h1')||{}).textContent;
  const r=parseText(htmlText(main),(ttl||doc.title||name).trim());
  r.image=og;
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
// ---------- PDF: rebuild reading order from text positions ----------
// pdf.js hands back text runs in content-stream order, which for web "print recipe" pages (WP Recipe Maker etc.)
// can put every header and label first and the content after. So: cluster runs into rows by baseline, read rows
// top→bottom (two-column blocks column by column), split a row at wide gaps, pair a label row with the value row
// under it ("Prep Time | Cook Time" over "15 mins | 45 mins"), drop repeated/browser print headers + footers,
// and merge prose lines that visibly wrap at the right margin.
const FOOT_RE=/^(?:\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[AP]M)?\b|(?:https?:\/\/|www\.)\S+(?:\s+\d+\s*\/\s*\d+)?$|(?:page\s*)?\d+\s*(?:\/|of)\s*\d+$)/i;
const MARK_RE=/^(?:[-–—•*·▪▢□☐◦‣○●]\s|\d{1,2}\s*[.)]\s|[\u0000�]+\s*[.)]?\s*)/;
const normRun=t=>t.replace(/[ \t]+/g,' ').replace(/^[\s\u2063]+|[\s\u2063]+$/g,'');
function pdfRows(items){
  const its=[];
  for(const it of items){
    if(!it.str||!it.transform)continue;
    const t=it.transform,size=Math.hypot(t[2],t[3])||it.height||10;
    its.push({s:it.str,x:t[4],y:t[5],w:it.width||0,size,ws:!it.str.trim()});
  }
  its.sort((a,b)=>b.y-a.y||a.x-b.x);
  const rows=[];
  for(const it of its){
    const r=rows[rows.length-1];
    if(r&&Math.abs(r.y-it.y)<=Math.max(1.5,0.4*Math.min(r.size,it.size)))r.items.push(it);
    else rows.push({y:it.y,size:it.size,items:[it]});
  }
  const out=[];
  for(const r of rows){
    r.items.sort((a,b)=>a.x-b.x);
    const real=r.items.some(i=>/\s/.test(i.s));      // row uses space characters → a bare gap is a span boundary
    const segs=[];let cur=null,space=false,size=0;
    for(const it of r.items){
      if(it.ws){if(cur)space=true;continue}
      size=Math.max(size,it.size);
      const x1=it.x+it.w;
      if(cur){
        const gap=it.x-cur.x1,em=Math.max(it.size,cur.size);
        if(gap>2.5*em){segs.push(cur);cur=null}
        else if(gap<-0.5*em&&cur.t.endsWith(it.s))continue;       // overprinted (fake-bold) duplicate
        else{
          const sep=space||/\s$/.test(cur.t)||/^\s/.test(it.s)?' ':gap>0.2*em?(real?GLUE:' '):'';
          if(gap>=em)cur.cuts.push({x:it.x,px1:cur.x1,at:cur.t.length+sep.length});   // a visible gap inside the run: a narrow gutter can be split here
          cur.t+=sep+it.s;cur.x1=Math.max(cur.x1,x1);cur.size=Math.max(cur.size,it.size);
        }
      }
      if(!cur)cur={x0:it.x,x1,t:it.s,size:it.size,cuts:[]};
      space=false;
    }
    if(cur)segs.push(cur);
    for(const sg of segs){sg.raw=sg.t;sg.t=normRun(sg.t)}
    const ss=segs.filter(sg=>sg.t);
    if(ss.length)out.push({y:r.y,size:size||r.size,segs:ss,x0:ss[0].x0,x1:ss[ss.length-1].x1});
  }
  return out;
}
// Two-column blocks: ≥3 rows sharing an empty vertical gutter with text on both sides → left column, then right.
function pdfColumns(rows){
  const out=[];let i=0;
  const part=(r,segs)=>({...r,segs,x0:segs[0].x0,x1:segs[segs.length-1].x1});
  while(i<rows.length){
    let reg=null;
    for(let g=0;g<rows[i].segs.length-1&&!reg;g++){
      let ga=rows[i].segs[g].x1,gb=rows[i].segs[g+1].x0,j=i,both=0;
      for(;j<rows.length;j++){
        const r=rows[j];
        if(j>i&&rows[j-1].y-r.y>3.5*Math.max(r.size,rows[j-1].size))break;
        let na=ga,nb=gb,L=0,R=0,ok=true;
        for(const sg of r.segs){
          if(sg.x1<=nb-1){na=Math.max(na,sg.x1);L++}
          else if(sg.x0>=na+1){nb=Math.min(nb,sg.x0);R++}
          else{ok=false;break}
        }
        if(!ok||nb-na<0.8*r.size)break;
        ga=na;gb=nb;if(L&&R)both++;
      }
      if(both>=3)reg={j,mid:(ga+gb)/2};
    }
    if(!reg){out.push(rows[i++]);continue}
    const left=[],right=[];
    for(let k=i;k<reg.j;k++){
      const r=rows[k],l=r.segs.filter(sg=>sg.x1<=reg.mid),rt=r.segs.filter(sg=>sg.x1>reg.mid);
      if(l.length)left.push(part(r,l));if(rt.length)right.push(part(r,rt));
    }
    const colR=a=>Math.max(...a.map(r=>r.x1));
    if(left.length){const cr=colR(left);left.forEach(r=>r.colR=cr)}
    if(right.length){const cr=colR(right);right.forEach(r=>r.colR=cr)}
    if(left.length&&right.length)right[0].gapBefore=true;
    out.push(...left,...right);i=reg.j;
  }
  return out;
}
// v20261117b: header-anchored columns. A bare section header (Ingredients / Preparation / Notes …) that starts well
// right of the page's left edge marks a column: everything from that row down is split at the header x positions —
// columns may start on different baselines, a narrow gutter that pdf.js merged into one run is split at the item gap,
// and a block that runs off the bottom of a page continues at the top of the next one (left column of both pages,
// then right column of both). The block ends at a run that spans the gutter (a full-width line) or a big vertical gap.
const SECT=new Set(['ing','stp','special','modifications','notes']);
const bareSect=t=>{if(t.length>40)return false;const h=header(t);return !!(h&&SECT.has(h.kind)&&!h.rest)};
function cutSeg(sg,x,tol){   // split a merged run at the first item gap at/after x
  for(const c of sg.cuts||[]){
    if(c.x<x-tol)continue;
    const a=normRun(sg.raw.slice(0,c.at)),b=normRun(sg.raw.slice(c.at));
    if(!a||!b)return null;
    return [{x0:sg.x0,x1:c.px1,t:a,raw:sg.raw.slice(0,c.at),size:sg.size,cuts:sg.cuts.filter(d=>d.at<c.at)},
            {x0:c.x,x1:sg.x1,t:b,raw:sg.raw.slice(c.at),size:sg.size,cuts:sg.cuts.filter(d=>d.at>c.at).map(d=>({...d,at:d.at-c.at}))}];
  }
  return null;
}
// one row → its runs per column, or null when a run spans a column boundary / sits left of its column
function colSplit(r,cx,min){
  const em=r.size,tol=1.5*em,parts=cx.map(()=>[]),q=[...r.segs];
  while(q.length){
    const sg=q.shift();let k=0;
    for(let j=1;j<cx.length;j++)if(sg.x0>=cx[j]-tol)k=j;
    if(k+1<cx.length&&sg.x1>cx[k+1]-0.5*em){const sp=cutSeg(sg,cx[k+1],tol);if(!sp)return null;q.unshift(...sp);continue}
    if(min&&sg.x0<min[k]-tol)return null;
    parts[k].push(sg);
  }
  return parts;
}
// rows[start..] that fit the columns → {parts:[per-row column parts], n:rows used, end:'page'|'cross'|'gap'}
function colBlock(rows,start,cx,min){
  const parts=[];let j=start,end='page';
  for(;j<rows.length;j++){
    const r=rows[j];
    if(j>start&&rows[j-1].y-r.y>4.5*Math.max(r.size,rows[j-1].size)){end='gap';break}
    const p=colSplit(r,cx,min);if(!p){end='cross';break}
    parts.push(p);
  }
  // a lone header (Notes, Nutrition …) right above a full-width section belongs to that section, not to a column
  if(end!=='page')while(parts.length){const p=parts[parts.length-1],sg=p.flat();
    if(sg.length===1&&segText(sg[0]).length<=40&&(h=>h&&!h.rest)(header(segText(sg[0])))){parts.pop();j--}else break}
  return{parts,n:j-start,end};
}
const colRow=(r,segs)=>({...r,segs,x0:segs[0].x0,x1:segs[segs.length-1].x1});
function addBlock(reg,rows,start,parts){
  parts.forEach((p,k)=>p.forEach((segs,c)=>{if(segs.length)reg.cols[c].push(colRow(rows[start+k],segs))}));
}
// one page's rows → [row | {cols}] in reading order; `cont` = a column block left open at the bottom of the previous page
function pdfLayout(rows,cont){
  const out=[];let i=0;
  if(cont){
    const b=colBlock(rows,0,cont.cx,cont.min);
    addBlock(cont,rows,0,b.parts);i=b.n;
    if(b.end==='page')return{out,open:cont};
  }
  const rest=rows.slice(i);
  const left=Math.min(...rest.map(r=>r.x0));
  // candidate column headers: bare section headers (also inside a merged run) well right of the left edge
  const cands=[];
  rest.forEach((r,k)=>{for(const sg of r.segs){
    const em=sg.size||r.size;
    if(sg.x0>left+6*em&&bareSect(segText(sg)))cands.push({k,x:sg.x0,em});
    for(const c of sg.cuts||[])if(c.x>left+6*em&&bareSect(normRun(sg.raw.slice(c.at)).replace(/⁣/g,' ')))cands.push({k,x:c.x,em});
  }});
  for(const a of cands){
    const cx=[-Infinity];
    for(const c of cands.filter(c=>c.k>=a.k).sort((p,q)=>p.x-q.x))if(c.x-cx[cx.length-1]>4*c.em)cx.push(c.x);
    const b=colBlock(rest,a.k,cx,null);
    const reg={cols:cx.map(()=>[]),cx};
    addBlock(reg,rest,a.k,b.parts);
    // a real column layout: every column has ≥2 rows, and the right ones have ≥2 rows starting at the header x
    const ok=reg.cols.every((c,k)=>c.length>=2&&(k===0||c.filter(r=>r.segs.some(sg=>Math.abs(sg.x0-cx[k])<=2*r.size)).length>=2));
    if(!ok)continue;
    reg.min=reg.cols.map(c=>Math.min(...c.map(r=>r.x0)));
    out.push(...pdfColumns(rest.slice(0,a.k)),reg);
    if(b.end==='page')return{out,open:reg};
    const sub=pdfLayout(rest.slice(a.k+b.n),null);
    return{out:out.concat(sub.out),open:sub.open};
  }
  out.push(...pdfColumns(rest));
  return{out,open:null};
}
// [row | {cols}] → rows, columns one after the other
function flatCols(seq){
  const out=[];
  for(const x of seq){
    if(!x.cols){out.push(x);continue}
    x.cols.filter(c=>c.length).forEach((c,k)=>{const cr=Math.max(...c.map(r=>r.x1));
      c.forEach((r,j)=>{r.colR=cr;r.gapBefore=k>0&&j===0;out.push(r)})});
  }
  return out;
}
const segText=sg=>sg.t.replace(/⁣/g,' ');
function isLabel(sg){const t=segText(sg);if(t.length>30)return false;const h=header(t);return h&&META.has(h.kind)&&!h.rest||/^[A-Z][\w ]{1,24}:$/.test(t)}
// rows → text lines for parseText
function pdfLines(rows){
  // label row over a value row, columns aligned → "Label: value | Label: value"
  const rs=[];
  for(let i=0;i<rows.length;i++){
    const r=rows[i],n=rows[i+1];
    if(n&&!n.gapBefore&&r.segs.length===n.segs.length&&r.segs.every(isLabel)&&!n.segs.some(isLabel)&&r.y-n.y<=2.5*Math.max(r.size,n.size)
       &&r.segs.every((sg,k)=>Math.min(sg.x1,n.segs[k].x1)>Math.max(sg.x0,n.segs[k].x0))){
      rs.push({...n,segs:[{x0:r.x0,x1:n.x1,t:r.segs.map((sg,k)=>segText(sg).replace(/\s*:$/,'')+': '+n.segs[k].t).join(' | ')}]});i++;continue;
    }
    rs.push(r);
  }
  // right margin: only trusted when ≥3 single-run lines reach it (wrapped prose), so a lone long line doesn't count
  const one=rs.filter(r=>r.segs.length===1),x1s=one.map(r=>r.x1).sort((a,b)=>b-a);
  const left=Math.min(...rs.map(r=>r.x0)),rmax=x1s[0]||0;
  const margin=x1s.length>=3&&rmax-x1s[2]<=1.5*(one[0]||{size:12}).size?rmax:null;
  const lines=[];let prev=null;
  for(const r0 of rs){
    let t=r0.segs.map(sg=>sg.t).join('   ').replace(/^[\u0000�]+\s*[.)]?\s*/,'• ').replace(/[\u0000�]/g,'');
    const r={...r0,t};
    if(prev){
      const dy=prev.y-r.y,em=Math.max(prev.size,r.size),pt=segText(prev),bt=segText(r);
      const cw=(r.x1-r.x0)/Math.max(1,bt.length),w1=(bt.split(' ')[0]||'').length*cw+cw;
      const full=margin&&prev.x1+w1>margin;
      const colL=prev.colR?prev.x0:left,colR=prev.colR||margin||rmax;
      const lower=/^[a-z]/.test(bt)&&!/[.!?:]$/.test(pt)&&(prev.x1-colL)>=0.75*(colR-colL);
      if(!r.gapBefore&&prev.segs.length===1&&r.segs.length===1&&dy>0&&dy<=1.7*em&&r.x0>=prev.x0-2&&r.x0<=prev.x0+3*em
         &&!/:$/.test(pt)&&!MARK_RE.test(bt)&&!header(pt)&&!header(bt)&&(full||lower)){
        prev.t+=' '+r.t;prev.x1=r.x1;prev.y=r.y;continue;
      }
      if(r.gapBefore||dy>1.8*em||dy<0)lines.push('');
    }
    lines.push(prev=r);
  }
  return lines.map(l=>typeof l==='string'?l:l.t);
}
async function readPdf(f){
  await loadScript(LIB.pdf);
  const lib=window.pdfjsLib;lib.GlobalWorkerOptions.workerSrc=LIB.pdfWorker;
  const pdf=await lib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;
  const pages=[];
  for(let i=1;i<=Math.min(pdf.numPages,30);i++){
    busy(`Reading page ${i} of ${pdf.numPages}…`);
    const pg=await pdf.getPage(i),tc=await pg.getTextContent(),h=pg.getViewport({scale:1}).height;
    const rows=pdfRows(tc.items);
    if(rows.reduce((n,r)=>n+r.segs.map(sg=>sg.t).join('').replace(/\s/g,'').length,0)<20){   // scanned page → OCR it
      const vp=pg.getViewport({scale:2}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
      await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
      pages.push({text:await ocr(c,`Reading page ${i} (scan)`)});
    }else pages.push({rows,h});
  }
  return pdfText(pages);
}
// pages: [{rows, h} | {text}] → one text for parseText.
// Print headers/footers: rows in the top/bottom 8% that repeat on several pages (digits ignored) or look like
// a browser print stamp (date + time, bare URL, "1/2", "Page 1 of 2") are dropped.
function pdfText(pages){
  const inMargin=(r,h)=>r.y>h*0.92||r.y<h*0.08,key=r=>r.segs.map(segText).join(' ').replace(/\d+/g,'#');
  const seen={};
  for(const p of pages)if(p.rows)for(const k of new Set(p.rows.filter(r=>inMargin(r,p.h)).map(key)))seen[k]=(seen[k]||0)+1;
  // pages → chunks of text; a column block continued onto the next page stays in the chunk of the page it started on
  const chunks=[];let open=null;
  for(const p of pages){
    if(!p.rows){chunks.push(p.text);open=null;continue}
    const rows=p.rows.filter(r=>!(inMargin(r,p.h)&&(seen[key(r)]>=2||FOOT_RE.test(segText(r.segs[0])))));
    const lay=pdfLayout(rows,open);
    chunks.push(lay.out);open=lay.open;
  }
  return chunks.map(c=>typeof c==='string'?c:pdfLines(flatCols(c)).join('\n')).join('\n\n');
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

// Open the Add form prefilled (never saved until Save). Values are cut to the form/server limits.
const IMP_MAX={title:200,from:100,servings:60,time:120,ingredients:12000,steps:24000,special:4000,modifications:4000,notes:12000};
function fillImported(fields){
  openEdit('');ed.fromImport=true;
  for(const [k,n] of Object.entries(IMP_MAX))if(fields[k])$('#f-'+k).value=String(fields[k]).slice(0,n);
  tagAdd('categories',(fields.categories||[]).join(','));tagAdd('cuisines',(fields.cuisines||[]).join(','));
}

// ---------- import from a web page link (v20261116f) ----------
// The cookbook server fetches the page (guarded, see server.py import-url); it is parsed here with the same
// JSON-LD-first / readable-text parser as a saved .html file. The link goes into Notes as "Source: <url>".
function linkOf(v){v=String(v||'').trim();const m=v.match(/https?:\/\/\S+/i);if(m)return m[0];
  if(/^(www\.|[a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(v))return 'https://'+v;return ''}
let urlBusy=false;
async function importUrl(raw){
  const url=linkOf(raw);
  if(!url){msg('Paste a link to a recipe page (starts with https://)',6000);return false}
  if(urlBusy||!tok)return false;
  urlBusy=true;busy('Getting the recipe…');
  try{
    const d=await api('POST',`/books/${tok}/import-url`,{url},null,40000);
    const page=d.url||url,host=(()=>{try{return new URL(page).hostname.replace(/^www\./,'')}catch{return ''}})();
    const fields=parseHtml(d.html||'',host);
    let blob=null;
    if(fields.image){
      busy('Getting the photo…');
      try{const im=await api('POST',`/books/${tok}/import-url`,{url:new URL(fields.image,page).href,kind:'image'},null,40000);
        const b=Uint8Array.from(atob(im.data),c=>c.charCodeAt(0));blob=await shrink(new Blob([b],{type:im.type}))}catch{}
    }
    busy(false);
    const src='Source: '+page;   // no separate link field → the page goes at the end of Notes (kept within the limit)
    fields.notes=[fields.ok?String(fields.notes||'').slice(0,Math.max(0,IMP_MAX.notes-src.length-2)).trim():'',src].filter(Boolean).join('\n\n');
    if(!fields.ok){fields.ingredients=fields.steps=fields.special=fields.modifications=''}
    if(!fields.title)fields.title=host;
    fillImported(fields);
    if(blob&&ed){ed.blob=blob;ed.blobUrl=URL.createObjectURL(blob);showPhoto()}
    msg(fields.ok?'Check it over, then Save':'Couldn’t find the recipe on that page — fill it in or try another link',fields.ok?5000:8000);
    return true;
  }catch(e){
    busy(false);
    msg(e.data&&e.data.blocked?'That site blocked the import — save the page (or print to PDF) and use Import.':(e.message||'Couldn’t import that link'),9000);
    return false;
  }finally{urlBusy=false}
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
    fillImported(fields);
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
// Import button → small sheet: a file/photo, or a web page link
const sheet=on=>{$('#isheet').hidden=!on;if(on)$('#ishurl').value=''};
$('#imp').onclick=()=>sheet(true);
$('#ishfile').onclick=()=>{sheet(false);$('#impf').click()};
$('#ufile').onclick=()=>$('#impf').click();
$('#ishx').onclick=()=>sheet(false);
$('#isheet').onclick=e=>{if(e.target.id==='isheet')sheet(false)};
$('#ishf').onsubmit=async e=>{e.preventDefault();const v=$('#ishurl').value;if(!linkOf(v)){msg('Paste a link to a recipe page (starts with https://)',6000);return}
  sheet(false);await importUrl(v)};
$('#uf').onsubmit=async e=>{e.preventDefault();if(await importUrl($('#uq').value))$('#uq').value=''};
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
