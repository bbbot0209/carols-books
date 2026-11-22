// Family Cookbook — one shared cookbook per link (#<token>); everyone with the link can view and edit.
// v20261122a: a separate view-only link (#<view token>): the server answers readonly:true and 403s every write;
// here `ro` (html.ro) hides all add/edit/delete/import UI (.eo) and the edit/import entry points refuse.
// Server: projects/family-cookbook/server/server.py behind Tailscale Funnel /cookbook-api.
'use strict';
const APPV='20261122a';
const DEFAULT_API='https://bbs-mac-mini.tail532c1c.ts.net/cookbook-api';
// Tests point the page at a local server with ?api=http://127.0.0.1:<port> (localhost only; ?api=default clears).
const API=(()=>{const u=new URLSearchParams(location.search).get('api');
  if(u==='default')localStorage.removeItem('fc-api');
  else if(u&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u))localStorage.setItem('fc-api',u);
  const s=localStorage.getItem('fc-api');return s&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(s)?s:DEFAULT_API})();
const CATS=['Breakfast','Appetizer','Soup','Salad','Main','Side','Dessert','Baking','Drinks','Other'];
const CUISINES=['American','Italian','Mexican','Chinese','Indian','French','Jewish','Mediterranean','Greek','Japanese','Thai','Middle Eastern'];
// categories/cuisines are lists (v20261116c); recipes saved earlier may only carry a single `category` string
const catsOf=r=>Array.isArray(r.categories)?r.categories:(r.category?[r.category]:[]);
const cuisOf=r=>Array.isArray(r.cuisines)?r.cuisines:[];
const TAGS={categories:{of:catsOf,sug:CATS},cuisines:{of:cuisOf,sug:CUISINES}};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const linkify=s=>esc(s).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const words=s=>fold(s).replace(/[‘’']/g,'').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const photoUrl=id=>id?API+'/photos/'+encodeURIComponent(id)+'.jpg':'';

function msg(t,ms=4000){const m=$('#msg');m.textContent=t;m.classList.add('on');clearTimeout(msg.t);msg.t=setTimeout(()=>m.classList.remove('on'),ms)}

async function api(method,path,body,raw,ms){
  const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),ms||(raw?45000:15000));
  try{
    const r=await fetch(API+path,{method,signal:ctl.signal,cache:'no-store',
      headers:raw?{'Content-Type':'image/jpeg'}:body?{'Content-Type':'application/json'}:{},
      body:raw||(body?JSON.stringify(body):undefined)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(d.error||'HTTP '+r.status);e.status=r.status;e.data=d;throw e}
    return d;
  }catch(e){if(!e.status)e.message='No connection — try again';throw e}
  finally{clearTimeout(tm)}
}

// ---------- state ----------
let tok='',book={name:'',recipes:[]};
let ro=false;      // view-only link (server said readonly:true)
function setRO(v){ro=!!v;document.documentElement.classList.toggle('ro',ro);$('#share').textContent=ro?'Share':'Share with family'}
const st={q:'',sort:localStorage.getItem('fc-sort2')||'title',cat:'',cui:'',from:'',by:'',sel:null};  // sel = Set of ids in Select mode
let cur=null;      // recipe id open in the view
let ed=null;       // edit state {id, updated, photo, blob, blobUrl}
const byId=id=>book.recipes.find(r=>r.id===id);
const cacheKey=()=>'fc-cache-'+tok;
const saveCache=()=>{try{localStorage.setItem(cacheKey(),JSON.stringify(book))}catch{}};

// ---------- helpers for recipe text ----------
const lines=s=>String(s||'').split('\n').map(l=>l.trim()).filter(Boolean);
const isSub=l=>/:$/.test(l)&&l.length<=60;                 // "For the frosting:" → sub-heading
const stripBullet=l=>l.replace(/^([-•*·–]\s+)/,'');
const stripNum=l=>l.replace(/^(step\s*)?\d{1,2}\s*[.):-]\s+/i,'');
const ingHtml=s=>lines(s).map(l=>isSub(l)?`<li class="sub">${esc(l)}</li>`:`<li>${esc(stripBullet(l))}</li>`).join('');
const stepHtml=s=>lines(s).map(l=>isSub(l)?`<li class="sub">${esc(l)}</li>`:`<li>${esc(stripNum(stripBullet(l)))}</li>`).join('');
const fromTxt=r=>r.from?'From '+r.from:'';
const byTxt=r=>r.addedBy?'Added by '+r.addedBy:'';   // the family member who entered it (v20261116e)
const AB_KEY='fc-addedby';   // last “Added by” typed on this device

// ---------- search / sort / filter ----------
function matches(r,qw){
  if(!qw.length)return true;
  const ws=words([r.title,r.ingredients,r.from,r.addedBy,...catsOf(r),...cuisOf(r),r.notes].join(' '));
  return qw.every(q=>ws.some(w=>w.startsWith(q)));
}
const cmpTxt=(a,b)=>a.localeCompare(b,undefined,{sensitivity:'base',numeric:true});
function sorted(list){
  const t=(a,b)=>cmpTxt(a.title,b.title),blankLast=g=>(a,b)=>{const x=g(a),y=g(b);return (!x)-(!y)||cmpTxt(x||'',y||'')||t(a,b)};
  const first=of=>r=>[...of(r)].sort(cmpTxt)[0]||'';   // sort by the alphabetically-first value
  const f={added:(a,b)=>(b.added||0)-(a.added||0)||t(a,b),title:t,category:blankLast(first(catsOf)),cuisine:blankLast(first(cuisOf)),from:blankLast(r=>r.from),addedby:blankLast(r=>r.addedBy)}[st.sort]||t;
  return [...list].sort(f);
}
function visible(){
  const qw=words(st.q);
  return sorted(book.recipes.filter(r=>matches(r,qw)&&(!st.cat||catsOf(r).includes(st.cat))&&(!st.cui||cuisOf(r).includes(st.cui))&&(!st.from||(r.from||'')===st.from)&&(!st.by||(r.addedBy||'')===st.by)));
}
const uniq=k=>[...new Set(book.recipes.map(r=>(r[k]||'').trim()).filter(Boolean))].sort(cmpTxt);
const uniqL=of=>[...new Set(book.recipes.flatMap(r=>of(r).map(x=>String(x).trim())).filter(Boolean))].sort(cmpTxt);

// ---------- list ----------
function fillFilters(){
  const cats=uniqL(catsOf),cuis=uniqL(cuisOf),froms=uniq('from'),bys=uniq('addedBy');
  if(st.cat&&!cats.includes(st.cat))st.cat='';
  if(st.cui&&!cuis.includes(st.cui))st.cui='';
  if(st.from&&!froms.includes(st.from))st.from='';
  if(st.by&&!bys.includes(st.by))st.by='';
  const opts=(all,list,v)=>`<option value="">${all}</option>`+list.map(c=>`<option${c===v?' selected':''}>${esc(c)}</option>`).join('');
  $('#fcat').innerHTML=opts('Category',cats,st.cat);$('#fcui').innerHTML=opts('Cuisine',cuis,st.cui);$('#ffrom').innerHTML=opts('From',froms,st.from);$('#fby').innerHTML=opts('Added by',bys,st.by);
  $('#fcat').classList.toggle('on',!!st.cat);$('#fcui').classList.toggle('on',!!st.cui);$('#ffrom').classList.toggle('on',!!st.from);$('#fby').classList.toggle('on',!!st.by);
  $('#sort').value=st.sort;
  $('#froms').innerHTML=froms.map(c=>`<option value="${esc(c)}">`).join('');
  $('#addedbys').innerHTML=bys.map(c=>`<option value="${esc(c)}">`).join('');
}
function cardHtml(r){
  const th=r.photo?`<img class="th" src="${esc(photoUrl(r.photo))}" alt="" loading="lazy">`:`<div class="th ph0">${esc((r.title||'?').trim()[0]||'?').toUpperCase()}</div>`;
  const sel=st.sel&&st.sel.has(r.id);
  return `<button class="card${sel?' sel':''}" data-id="${esc(r.id)}">${st.sel?'<span class="tick">✓</span>':''}${th}<div class="cb"><div class="ct">${esc(r.title)}</div>`+
    (r.from?`<div class="cf">${esc(fromTxt(r))}</div>`:'')+(r.addedBy?`<div class="ab">${esc(byTxt(r))}</div>`:'')+
    ((catsOf(r).length||cuisOf(r).length||r.time)?`<div class="meta">${catsOf(r).map(c=>`<span class="pill c">${esc(c)}</span>`).join('')}${cuisOf(r).map(c=>`<span class="pill u">${esc(c)}</span>`).join('')}${r.time?`<span class="pill">${esc(r.time)}</span>`:''}</div>`:'')+`</div></button>`;
}
function render(){
  $('#bname').textContent=book.name||'Family Cookbook';
  document.title=book.name||'Family Cookbook';
  fillFilters();
  const v=visible(),n=book.recipes.length,filt=st.q||st.cat||st.cui||st.from||st.by;
  $('#count').textContent=filt?`${v.length} of ${n} recipe${n===1?'':'s'}`:`${n} recipe${n===1?'':'s'}`;
  $('#prall').hidden=!v.length||!!st.sel;$('#selbtn').hidden=!n||!!st.sel;
  $('#list').innerHTML=v.length?v.map(cardHtml).join(''):`<div class="empty">${n?'No matches':'No recipes yet'}`+
    (st.q.trim()&&!ro?`<button class="btn" id="qweb">Search the web for “${esc(st.q.trim())}”</button>`:'')+`</div>`;
  if($('#qweb'))$('#qweb').onclick=()=>webSearch(st.q);
  $('#qx').hidden=!st.q;
  $('#fabs').hidden=!!st.sel;$('#selbar').hidden=!st.sel;
  if(st.sel){const k=st.sel.size;$('#seln').textContent=k?`${k} selected`:'Tap recipes';$('#prsel').disabled=!k}
}

// ---------- screens (history-backed so the phone's back gesture closes them) ----------
const scrOpen=()=>!$('#view').hidden||!$('#edit').hidden;
const modal=()=>document.documentElement.classList.toggle('modal',scrOpen());
function push(name){history.pushState({fc:name},'');}
window.addEventListener('popstate',()=>{
  if(!$('#edit').hidden){closeEdit(true);return}
  if(!$('#view').hidden){$('#view').hidden=true;cur=null;modal()}
});
function back(){history.back()}

function openView(id,pushIt=true){
  const r=byId(id);if(!r)return;
  cur=id;renderView();$('#view').hidden=false;$('#view').scrollTop=0;modal();
  if(pushIt)push('view');
}
function recipeHtml(r,pr){
  const cs=catsOf(r).join(', '),us=cuisOf(r).join(', ');
  const facts=[cs&&[catsOf(r).length>1?'Categories':'Category',cs],us&&['Cuisine',us],r.time&&['Time',r.time],r.servings&&['Serves',r.servings]].filter(Boolean)
    .map(([k,v])=>`<span class="fact"><span>${k}</span>${esc(v)}</span>`).join('');
  const ing=ingHtml(r.ingredients),stp=stepHtml(r.steps);
  if(pr)return `<article class="pr">${r.photo?`<img src="${esc(photoUrl(r.photo))}" alt="">`:''}<h2>${esc(r.title)}</h2>${r.from?`<div class="cf">${esc(fromTxt(r))}</div>`:''}${r.addedBy?`<div class="ab">${esc(byTxt(r))}</div>`:''}`+
    (facts?`<div class="facts">${[cs&&(catsOf(r).length>1?'Categories: ':'Category: ')+cs,us&&'Cuisine: '+us,r.time&&'Time: '+r.time,r.servings&&'Serves: '+r.servings].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ')}</div>`:'')+
    (ing?`<h3>Ingredients</h3><ul>${ing}</ul>`:'')+(stp?`<h3>Steps</h3><ol>${stp}</ol>`:'')+
    (r.notes?`<h3>Notes</h3><div class="notes">${esc(r.notes)}</div>`:'')+`<div class="clear"></div></article>`;
  return (r.photo?`<img class="hero" src="${esc(photoUrl(r.photo))}" alt="">`:'')+`<div class="rv"><h2>${esc(r.title)}</h2>${r.from?`<div class="cf">${esc(fromTxt(r))}</div>`:''}${r.addedBy?`<div class="ab">${esc(byTxt(r))}</div>`:''}`+
    (facts?`<div class="facts">${facts}</div>`:'')+
    (ing?`<h3>Ingredients</h3><ul class="ing">${ing}</ul>`:'')+(stp?`<h3>Steps</h3><ol class="stp">${stp}</ol>`:'')+
    (r.notes?`<h3>Notes</h3><div class="notes">${linkify(r.notes)}</div>`:'')+
    `<div class="vact"><button class="btn" id="vprint">Print</button>${ro?'':'<button class="btn pri" id="vedit2">Edit</button>'}</div></div>`;
}
function renderView(){
  const r=byId(cur);if(!r)return;
  $('#vtt').textContent=r.title;$('#vbody').innerHTML=recipeHtml(r);
  $('#vprint').onclick=()=>printRecipes([r]);if($('#vedit2'))$('#vedit2').onclick=()=>openEdit(r.id);
}

// ---------- edit ----------
const FIELDS=['title','from','addedBy','servings','time','ingredients','steps','notes'];
function fillForm(r){
  FIELDS.forEach(k=>$('#f-'+k).value=r[k]||'');
  ed.categories=[...catsOf(r)];ed.cuisines=[...cuisOf(r)];
  if(ed.blobUrl)URL.revokeObjectURL(ed.blobUrl);
  ed.blob=null;ed.blobUrl='';ed.photo=r.photo||'';ed.updated=r.updated;ed.abBase=r.addedBy||'';
  showPhoto();pickers();
}
function showPhoto(){
  const src=ed.blobUrl||photoUrl(ed.photo);
  $('#f-phimg').hidden=!src;if(src)$('#f-phimg').src=src;
  $('#f-phbtn').textContent=src?'Change photo':'Add photo';$('#f-phrm').hidden=!src;
}
// Toggle pills for categories / cuisines: suggestions + every value already used in the book + the recipe's own.
function pickers(){
  for(const [k,T] of Object.entries(TAGS)){
    const sel=ed[k],lc=new Set(sel.map(x=>x.toLowerCase())),seen=new Set(),all=[];
    for(const v of [...T.sug,...uniqL(T.of),...sel])if(!seen.has(v.toLowerCase())){seen.add(v.toLowerCase());all.push(v)}
    $('#pk-'+k+' .pks').innerHTML=all.map(v=>`<button type="button" data-v="${esc(v)}" class="${lc.has(v.toLowerCase())?'on':''}">${esc(v)}</button>`).join('');
  }
}
function tagAdd(k,text){
  for(let v of String(text||'').split(/[,;\n]/)){v=v.trim().slice(0,60);if(!v)continue;
    const known=[...TAGS[k].sug,...uniqL(TAGS[k].of)].find(x=>x.toLowerCase()===v.toLowerCase());v=known||v;
    if(!ed[k].some(x=>x.toLowerCase()===v.toLowerCase())&&ed[k].length<12)ed[k].push(v)}
  pickers();
}
const flushTags=()=>{for(const k of Object.keys(TAGS)){const i=$('#pk-'+k+' input');if(i.value.trim()){tagAdd(k,i.value);i.value=''}}};
function openEdit(id,pushIt=true){
  if(ro){msg('This is a view-only link');return}
  const r=id?byId(id):{};
  ed={id:id||'',photo:'',blob:null,blobUrl:''};
  $('#ett').textContent=id?'Edit recipe':'New recipe';$('#edel').hidden=!id;
  fillForm(r);
  // new recipes start with this device's last “Added by”; editing keeps the recipe's own (even if blank)
  ed.abTyped=false;if(!id){ed.abBase=localStorage.getItem(AB_KEY)||'';$('#f-addedBy').value=ed.abBase}
  $('#edit').hidden=false;$('#edit').scrollTop=0;modal();
  if(pushIt)push('edit');
  if(!id)setTimeout(()=>$('#f-title').focus(),50);
}
let afterClose=null;   // runs once the edit screen's history entry has been popped
function closeEdit(fromPop,then){
  if(!fromPop){afterClose=then||null;back();return}
  $('#edit').hidden=true;if(ed&&ed.blobUrl)URL.revokeObjectURL(ed.blobUrl);ed=null;modal();
  if(cur)renderView();
  const f=afterClose;afterClose=null;if(f)f();
  if(typeof importQ!=='undefined'&&importQ.length)setTimeout(nextImport,350);   // next dropped/picked file
}
const dirty=()=>{if(!ed)return false;const r=ed.id?byId(ed.id)||{}:{};
  return !!ed.blob||ed.photo!==(r.photo||'')||FIELDS.some(k=>$('#f-'+k).value.trim()!==(k==='addedBy'?ed.abBase:(r[k]||'')).trim())
    ||ed.categories.join('\n')!==catsOf(r).join('\n')||ed.cuisines.join('\n')!==cuisOf(r).join('\n')||Object.keys(TAGS).some(k=>$('#pk-'+k+' input').value.trim())};

// Downscale a picked photo to ≤1200px JPEG under ~590 KB.
async function shrink(file){
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=url;await img.decode();
    let w=img.naturalWidth,h=img.naturalHeight,max=1200;
    for(let tries=0;tries<6;tries++){
      const s=Math.min(1,max/Math.max(w,h)),cw=Math.max(1,Math.round(w*s)),ch=Math.max(1,Math.round(h*s));
      const c=document.createElement('canvas');c.width=cw;c.height=ch;
      const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cw,ch);x.drawImage(img,0,0,cw,ch);
      for(const q of [0.8,0.7,0.6]){
        const b=await new Promise(res=>c.toBlob(res,'image/jpeg',q));
        if(b&&b.size<=590*1024)return b;
      }
      max=Math.round(max*0.8);
    }
    throw new Error('Photo too large');
  }finally{URL.revokeObjectURL(url)}
}

let saving=false;
async function save(){
  if(saving||!ed||ro)return;
  flushTags();
  const data={};FIELDS.forEach(k=>data[k]=$('#f-'+k).value.trim());
  data.categories=[...ed.categories];data.cuisines=[...ed.cuisines];
  if(!data.title){msg('Add a title');$('#f-title').focus();return}
  if(ed.abTyped){try{data.addedBy?localStorage.setItem(AB_KEY,data.addedBy):localStorage.removeItem(AB_KEY)}catch{}}
  saving=true;['#esave','#esave2'].forEach(s=>{$(s).disabled=true});$('#esave').textContent='Saving…';
  try{
    if(ed.blob){const p=await api('POST',`/books/${tok}/photos`,null,ed.blob);ed.photo=p.photo;URL.revokeObjectURL(ed.blobUrl);ed.blob=null;ed.blobUrl=''}
    data.photo=ed.photo;
    let r;
    if(ed.id){
      try{r=await api('PUT',`/books/${tok}/recipes/${ed.id}`,{...data,updatedAt:ed.updated})}
      catch(e){
        if(e.status===409&&e.data&&e.data.recipe){
          const i=book.recipes.findIndex(x=>x.id===ed.id);if(i>=0)book.recipes[i]=e.data.recipe;saveCache();render();
          fillForm(e.data.recipe);msg('Someone else just changed this — reloaded',6000);return;
        }
        if(e.status===404){book.recipes=book.recipes.filter(x=>x.id!==ed.id);saveCache();msg('Someone else deleted this recipe',6000);
          cur=null;$('#view').hidden=true;closeEdit();render();return}
        throw e;
      }
      const i=book.recipes.findIndex(x=>x.id===r.id);if(i>=0)book.recipes[i]=r;else book.recipes.push(r);
    }else{
      r=await api('POST',`/books/${tok}/recipes`,data);book.recipes.push(r);
      if(!visible().some(x=>x.id===r.id)){st.q='';$('#q').value='';st.cat=st.cui=st.from=st.by=''}
    }
    saveCache();render();
    closeEdit(false,ed.id||(ed.fromImport&&importQ.length)?null:()=>openView(r.id));
    msg('Saved',2000);
  }catch(e){msg(e.message||'Could not save')}
  finally{saving=false;['#esave','#esave2'].forEach(s=>{$(s).disabled=false});$('#esave').textContent='Save'}
}
async function del(){
  if(!ed||!ed.id||ro)return;
  const r=byId(ed.id);if(!confirm(`Delete “${r?r.title:'this recipe'}”?`))return;
  try{await api('DELETE',`/books/${tok}/recipes/${ed.id}`)}catch(e){if(e.status!==404){msg(e.message);return}}
  book.recipes=book.recipes.filter(x=>x.id!==ed.id);saveCache();cur=null;
  $('#view').hidden=true;$('#edit').hidden=true;ed=null;modal();
  history.go(-2);render();msg('Deleted',2500);
}

// ---------- print ----------
async function printRecipes(list){
  if(!list.length)return;
  const p=$('#print');p.innerHTML=list.map(r=>recipeHtml(r,true)).join('');
  // wait (briefly) for photos so they make it onto paper
  await Promise.race([Promise.all([...p.querySelectorAll('img')].map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,4000))]);
  window.print();
}

// ---------- find recipes online ----------
// Opens a Google search in a new tab — no API, no key. The recipe found there comes back via “Import from a link”.
const webUrl=q=>'https://www.google.com/search?q='+encodeURIComponent(q.trim().replace(/\s+recipes?$/i,'')+' recipe');
function webSearch(q){q=String(q||'').trim();if(!q){msg('Type what to look for');$('#wq').focus();return}
  window.open(webUrl(q),'_blank','noopener')}

// ---------- share ----------
const shareUrl=t=>location.origin+location.pathname+'#'+(t||tok);
const ssheet=on=>{$('#ssheet').hidden=!on};
// Editors choose: the full edit link or the view-only link. A view-only visitor can only pass on the view-only link.
function share(){
  if(!ro&&book.view){ssheet(true);return}
  shareLink(tok,false);
}
async function shareLink(t,view){
  ssheet(false);
  const url=shareUrl(t),title=(book.name||'Family Cookbook')+(view?' (view only)':'');
  if(navigator.share){try{await navigator.share({title,url});return}catch(e){if(e.name==='AbortError')return}}
  try{await navigator.clipboard.writeText(url);msg(view?'View-only link copied':'Link copied')}catch{prompt(view?'Copy this view-only link':'Copy this link',url)}
}

// ---------- loading ----------
async function refresh(){
  if(!tok)return;
  const t=tok;
  try{
    const d=await api('GET','/books/'+t);if(t!==tok)return;
    book={name:d.name,recipes:d.recipes||[],view:d.view||'',readonly:!!d.readonly};setRO(book.readonly);saveCache();
    if(ro&&ed){$('#edit').hidden=true;ed=null;modal()}
    if(st.sel)st.sel=new Set([...st.sel].filter(byId));
    render();
    if(cur&&!$('#view').hidden){if(byId(cur))renderView();else if(!ed){msg('This recipe was deleted');back()}}
  }catch(e){
    if(t!==tok)return;
    if(e.status===404){localStorage.removeItem(cacheKey());if(localStorage.getItem('fc-last')===t)localStorage.removeItem('fc-last');tok='';showStart();msg('That cookbook link didn’t work',6000)}
    else if(!book.recipes.length)msg(e.message);
  }
}
function showStart(){$('#app').hidden=true;$('#start').hidden=false;document.title='Family Cookbook'}
function boot(){
  const h=decodeURIComponent(location.hash.slice(1)).trim();
  if(!h){
    const last=localStorage.getItem('fc-last');
    if(last){location.replace('#'+last);return}   // hashchange → boot
    tok='';showStart();return;
  }
  if(!/^[A-Za-z0-9_-]{24,64}$/.test(h)){tok='';showStart();msg('That cookbook link didn’t work',6000);return}
  if(h!==tok){tok=h;st.q='';st.cat=st.cui=st.from=st.by='';st.sel=null;$('#q').value='';
    // no cache yet → start view-only until the server says otherwise (caches from before v20261122a are edit links)
    try{book=JSON.parse(localStorage.getItem(cacheKey())||'null')||{name:'',recipes:[],readonly:true}}catch{book={name:'',recipes:[],readonly:true}}
    setRO(book.readonly)}
  localStorage.setItem('fc-last',tok);
  $('#start').hidden=true;$('#app').hidden=false;render();refresh();
}
window.addEventListener('hashchange',boot);

// ---------- wiring ----------
$('#newf').onsubmit=async e=>{e.preventDefault();const name=$('#newname').value.trim()||'Family Cookbook';
  $('#newbtn').disabled=true;
  try{const d=await api('POST','/books',{name});book={name:d.name,recipes:[],view:d.view||'',readonly:false};tok=d.token;localStorage.setItem(cacheKey(),JSON.stringify(book));location.hash=d.token}
  catch(e){msg(e.message)}finally{$('#newbtn').disabled=false}};
$('#openf').onsubmit=e=>{e.preventDefault();const v=$('#openlink').value.trim(),m=v.match(/#?([A-Za-z0-9_-]{24,64})\s*$/);
  if(m)location.hash=m[1];else msg('That link didn’t work')};
let qt=0;$('#q').oninput=()=>{clearTimeout(qt);qt=setTimeout(()=>{st.q=$('#q').value;render()},120)};
$('#q').onkeydown=e=>{if(e.key==='Enter')e.target.blur()};
$('#qx').onclick=()=>{$('#q').value='';st.q='';render()};
$('#sort').onchange=e=>{st.sort=e.target.value;localStorage.setItem('fc-sort2',st.sort);render()};
$('#fcat').onchange=e=>{st.cat=e.target.value;render()};
$('#fcui').onchange=e=>{st.cui=e.target.value;render()};
$('#ffrom').onchange=e=>{st.from=e.target.value;render()};
$('#fby').onchange=e=>{st.by=e.target.value;render()};
$('#f-addedBy').oninput=()=>{if(ed)ed.abTyped=true};
$('#list').onclick=e=>{const c=e.target.closest('.card');if(!c)return;const id=c.dataset.id;
  if(st.sel){st.sel.has(id)?st.sel.delete(id):st.sel.add(id);render();return}
  openView(id)};
$('#selbtn').onclick=()=>{st.sel=new Set();render()};
$('#seldone').onclick=()=>{st.sel=null;render()};
$('#prsel').onclick=()=>{if(st.sel&&st.sel.size)printRecipes(sorted(book.recipes.filter(r=>st.sel.has(r.id))))};
$('#prall').onclick=()=>printRecipes(visible());
$('#share').onclick=share;
$('#sshedit').onclick=()=>shareLink(tok,false);
$('#sshview').onclick=()=>book.view&&shareLink(book.view,true);
$('#sshx').onclick=()=>ssheet(false);
$('#ssheet').onclick=e=>{if(e.target.id==='ssheet')ssheet(false)};
$('#wf').onsubmit=e=>{e.preventDefault();webSearch($('#wq').value)};
$('#add').onclick=()=>openEdit('');
$('#vback').onclick=back;
$('#vedit').onclick=()=>cur&&!ro&&openEdit(cur);
$('#ecancel').onclick=()=>{if(dirty()&&!confirm('Discard changes?'))return;closeEdit()};
$('#esave').onclick=save;
$('#ef').onsubmit=e=>{e.preventDefault();save()};
$('#edel').onclick=del;
$('#f-phbtn').onclick=()=>$('#f-photo').click();
$('#f-phrm').onclick=()=>{if(ed.blobUrl)URL.revokeObjectURL(ed.blobUrl);ed.blob=null;ed.blobUrl='';ed.photo='';showPhoto()};
$('#f-photo').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f||!ed)return;
  $('#f-phbtn').textContent='Loading…';
  try{const b=await shrink(f);if(!ed)return;if(ed.blobUrl)URL.revokeObjectURL(ed.blobUrl);ed.blob=b;ed.blobUrl=URL.createObjectURL(b)}
  catch{msg('Could not use that photo')}
  showPhoto()};
for(const k of Object.keys(TAGS)){
  const box=$('#pk-'+k),inp=box.querySelector('input');
  box.querySelector('.pks').onclick=e=>{const b=e.target.closest('button');if(!b||!ed)return;const v=b.dataset.v,i=ed[k].findIndex(x=>x.toLowerCase()===v.toLowerCase());
    if(i>=0)ed[k].splice(i,1);else if(ed[k].length<12)ed[k].push(v);pickers()};
  box.querySelector('.pkadd').onclick=()=>{tagAdd(k,inp.value);inp.value='';inp.focus()};
  inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();tagAdd(k,inp.value);inp.value=''}};
}

// keep everyone's edits flowing in: refresh when the app comes back and every minute while open
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refresh();checkV()}});
setInterval(()=>{if(document.visibilityState==='visible'&&!ed)refresh()},60000);

// Self-update: home-screen copies cache old files, so reload once when a newer version.txt is published.
function checkV(){fetch('version.txt?'+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(v=>{v=v.trim();
  if(v&&v!==APPV&&sessionStorage.getItem('fcv')!==v&&!ed){sessionStorage.setItem('fcv',v);location.reload()}}).catch(()=>{})}

boot();checkV();
