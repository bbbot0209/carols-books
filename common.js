// Shared by index.html (Carol's app) and group.html (the limited group page).
const API='https://bbs-mac-mini.tail532c1c.ts.net/books-api';
const SHARE_BASE=new URL('group.html#',location.href).href.replace(/#.*/,'')+'#';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=s=>esc(s).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
const GENRES={'Fiction':['Literary fiction','Mystery','Thriller & suspense','Romance','Historical fiction','Fantasy','Science fiction','Horror','Short stories','Classics','Young adult','Graphic novel','Poetry'],
  'Non-fiction':['Biography & memoir','History','Science & nature','Politics & current events','Business & economics','Self-help','Health & wellness','Religion & spirituality','Philosophy','Psychology','True crime','Travel','Food & cooking','Art & music','Essays']};
// Category is a free text field now; store the canonical two values.
const normCat=c=>{c=String(c||'').toLowerCase();return c.includes('non')?'Non-fiction':c.includes('fic')?'Fiction':''};
const catOf=g=>Object.keys(GENRES).find(c=>GENRES[c].includes(g))||'';
// Review link only (review text field removed 11/7 at Carol's request).
const reviewHtml=b=>{const u=/^https?:\/\/\S+$/i.test(b.review||'')?b.review:'';
  return u?`<div class="note"><a href="${esc(u)}" target="_blank" rel="noopener">Review ↗</a></div>`:''};
async function api(method,path,body){
  const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),12000);
  try{
    const r=await fetch(API+path,{method,signal:ctl.signal,cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(d.error||'HTTP '+r.status);e.status=r.status;throw e}
    return d;
  }finally{clearTimeout(tm)}
}
// One-line inline status message (bottom of screen), auto-hides.
function msg(t,ms=4000){let m=$('#msg');if(!m){m=document.createElement('div');m.id='msg';document.body.append(m)}
  m.textContent=t;m.classList.add('on');clearTimeout(msg.t);msg.t=setTimeout(()=>m.classList.remove('on'),ms)}
// Map Open Library subjects / Goodreads shelves to {cat,genre}. Each subject counts for its first matching rule.
const FIC_RULES=[['Young adult',/young.adult|juvenile fiction/],['Graphic novel',/graphic novel|comic/],['Science fiction',/science.?fiction|sci.?fi/],['Fantasy',/fantasy/],['Horror',/horror|ghost stor/],
  ['Mystery',/myster|detective/],['Thriller & suspense',/thriller|suspense/],['Romance',/romance|love stor/],['Historical fiction',/historical/],['Short stories',/short stor/],['Classics',/classic/],['Poetry',/poetry|poems/],['Literary fiction',/literary/]];
const NF_RULES=[['Biography & memoir',/biograph|biograf|memoir/],['True crime',/true crime/],['Science & nature',/scien|nature|physics|biology|evolution|astronom|ecology/],['History',/histor/],
  ['Politics & current events',/politic|current events|government/],['Business & economics',/business &|^business$|economics|management|finance/],['Self-help',/self.help|personal growth|personal development/],
  ['Health & wellness',/health|fitness|diet|nutrition|wellness/],['Religion & spirituality',/religio|spiritual|christian|bible|buddhis|theolog/],['Philosophy',/philosoph/],['Psychology',/psycholog/],
  ['Travel',/travel|voyages/],['Food & cooking',/cook|food|recipes|culinary/],['Art & music',/\bart\b|music|painting|photograph/],['Essays',/essays/]];
function guessGenre(subjects){
  const ss=(subjects||[]).map(s=>String(s).toLowerCase().replace(/[-_]/g,' ')),best=(rules,list)=>{const sc={};list.forEach(s=>{const r=rules.find(([,re])=>re.test(s));if(r)sc[r[0]]=(sc[r[0]]||0)+1});
    return rules.map(r=>r[0]).filter(g=>sc[g]).sort((a,b)=>sc[b]-sc[a])[0]||''};
  const nonf=s=>/non.?fiction/.test(s),fic=ss.filter(s=>(/\bfiction\b|\bnovels?\b/.test(s)||FIC_RULES.slice(0,10).some(([,re])=>re.test(s)))&&!nonf(s)).length;
  const nfList=ss.filter(s=>!/fiction|novel/.test(s)),nfTotal=nfList.filter(s=>NF_RULES.some(([,re])=>re.test(s))).length;
  if(fic&&fic*2>nfTotal)return{cat:'Fiction',genre:best(FIC_RULES,ss)||'Literary fiction'};
  const g=best(NF_RULES,nfList);
  return g?{cat:'Non-fiction',genre:g}:{cat:ss.some(nonf)?'Non-fiction':'',genre:''};
}
// Title autocomplete from Open Library. Dropdown sits in the form flow (under the input) so it scrolls with the
// iOS keyboard open; mousedown is cancelled so tapping a suggestion doesn't blur the field first.
const OL='https://openlibrary.org/search.json?limit=8&fields=key,title,author_name,number_of_pages_median,subject,first_publish_year,cover_i,publisher&q=';
// Short titles ("Land") drown in OL relevance ranking, so also try "title author" splits of the typed words
// (title=Land&author=Maggie) and float exact-title matches to the top. Apostrophes break OL tokenizing.
const olNorm=t=>(t||'').toLowerCase().replace(/[\u2018\u2019'`]/g,' ').replace(/[^\p{L}\p{N} ]+/gu,' ').replace(/\s+/g,' ').trim();
// Apple Books store search ranks titles like a store/Google does ("Land" → Maggie O'Farrell first); keyless, CORS-open.
const apFind=(q,signal)=>fetch('https://itunes.apple.com/search?media=ebook&entity=ebook&limit=8&term='+encodeURIComponent(q),{signal}).then(r=>r.json())
  .then(j=>(j.results||[]).map(x=>({ap:1,title:x.trackName.replace(/:? A Novel$/i,''),author_name:[x.artistName],first_publish_year:(x.releaseDate||'').slice(0,4),art:x.artworkUrl60||'',art100:x.artworkUrl100||'',genres:x.genres||[]}))).catch(()=>[]);
// Apple results first, then Open Library, deduped on title+first author.
async function bookFind(q,signal){const [a,o]=await Promise.all([apFind(q,signal),olFind(q,signal).catch(()=>[])]);if(signal.aborted)throw 0;
  const k=x=>olNorm(x.title)+'|'+olNorm((x.author_name||[])[0]).split(' ').pop(),seen=new Set();
  return [...a,...o].filter(x=>!seen.has(k(x))&&seen.add(k(x)))}
// OL work for an Apple pick (pages/cover/description live there).
const olMatch=async(title,author)=>{try{const t=olNorm(title),last=olNorm(author).split(' ').pop()||'';
  const d=(await (await fetch(OL.replace(/&q=$/,'')+'&title='+encodeURIComponent(t)+'&author='+encodeURIComponent(last))).json()).docs||[];
  return d.find(x=>olNorm(x.title)===t)||d[0]||null}catch{return null}};
async function olFind(q,signal){
  const n=olNorm(q),w=n.split(' '),urls=[OL+encodeURIComponent(n)],base=OL.replace(/&q=$/,'');
  for(const k of new Set([1,w.length-1]))if(k>0&&k<w.length)urls.push(base+'&title='+encodeURIComponent(w.slice(0,k).join(' '))+'&author='+encodeURIComponent(w.slice(k).join(' ')));
  const res=await Promise.all(urls.map(u=>fetch(u,{signal}).then(r=>r.json()).then(j=>j.docs||[]).catch(()=>[])));
  if(signal.aborted)throw 0;
  const seen=new Set(),out=[];
  for(const x of [...res.slice(1).flat(),...res[0]])if(x.title&&!seen.has(x.key)){seen.add(x.key);out.push(x)}
  const ex=x=>olNorm(x.title)===n||w.some((_,k)=>k&&olNorm(x.title)===w.slice(0,k).join(' ')&&olNorm((x.author_name||[]).join(' ')).includes(w.slice(k).join(' ')));
  return [...out.filter(ex),...out.filter(x=>!ex(x))];
}
function bookAC(inp,pick){
  const box=document.createElement('div'),cache=new Map();box.className='ac';box.hidden=true;inp.after(box);
  let seq=0,t=0,docs=[];
  const hide=()=>{box.hidden=true;box.innerHTML='';docs=[]};
  const show=d=>{docs=d.filter(x=>x.title).slice(0,6);if(!docs.length||document.activeElement!==inp)return hide();
    box.innerHTML=docs.map((x,i)=>`<div data-i="${i}">${x.cover_i?`<img src="https://covers.openlibrary.org/b/id/${x.cover_i}-S.jpg" alt="">`:/^https:\/\/[\w.-]+\.mzstatic\.com\//.test(x.art)?`<img src="${esc(x.art)}" alt="">`:'<i></i>'}<p><b>${esc(x.title)}</b><span>${esc([(x.author_name||[])[0],x.first_publish_year].filter(Boolean).join(' · '))}</span></p></div>`).join('')+'<div class="hint">Not listed? Add the author, e.g. “Land O’Farrell”</div>';box.hidden=false};
  const run=(min,wait)=>{clearTimeout(t);const q=inp.value.trim().toLowerCase(),s=++seq;if(q.length<min)return hide();
    if(cache.has(q))return show(cache.get(q));
    t=setTimeout(async()=>{try{const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),8000);
      const d=await bookFind(q,ctl.signal).finally(()=>clearTimeout(tm));
      cache.set(q,d);if(s===seq)show(d)}catch{if(s===seq)hide()}},wait)};
  inp.addEventListener('input',()=>run(3,300));
  // Return searches right away (any length, keeps the keyboard up) instead of the form-wide "Return = done/blur".
  inp.setAttribute('enterkeyhint','search');
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();if(inp.value.trim())run(1,0)}},true);
  inp.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==inp){seq++;hide()}},250));
  inp.addEventListener('keydown',e=>{if(e.key==='Escape'){seq++;hide()}});
  box.addEventListener('mousedown',e=>e.preventDefault());
  box.addEventListener('click',async e=>{const el=e.target.closest('[data-i]');let x=el&&docs[+el.dataset.i];if(!x)return;seq++;hide();inp.blur();
    if(x.ap){const a=x,m=await olMatch(a.title,a.author_name[0]);const g=guessGenre(a.genres);
      x={...(m||{}),title:a.title,author_name:a.author_name,first_publish_year:a.first_publish_year||(m&&m.first_publish_year),subject:g.cat?a.genres:(m&&m.subject)||a.genres,art100:a.art100}}
    pick({key:/^\/works\/OL\w+$/.test(x.key||'')?x.key:'',title:x.title,author:(x.author_name||[])[0]||'',pages:x.number_of_pages_median||'',year:x.first_publish_year||'',cover:x.cover_i?`https://covers.openlibrary.org/b/id/${x.cover_i}-M.jpg`:apCover(x.art100),...guessGenre(x.subject)})});
}
// Best edition of a work for pages/publisher/year: prefer English, then editions that have those fields.
const olEdition=async k=>{if(!k)return{};try{const es=(await (await fetch('https://openlibrary.org'+k+'/editions.json?limit=50')).json()).entries||[];
  const sc=e=>((e.languages||[]).some(l=>l.key==='/languages/eng')?4:(e.languages||[]).length?0:1)+(e.number_of_pages?2:0)+((e.publishers||[]).length?2:0)+(e.publish_date?1:0);
  const e=es.sort((a,b)=>sc(b)-sc(a))[0]||{},y=(String(e.publish_date||'').match(/\b(1[5-9]|20)\d\d\b/)||[''])[0];
  const pg=es.map(x=>x.number_of_pages).find(n=>n>0&&n<=10000);
  return{pages:e.number_of_pages>0&&e.number_of_pages<=10000?e.number_of_pages:pg||'',publisher:(e.publishers||[])[0]||'',year:y}}catch{return{}}};
// Work description ("About the book") from Open Library; resolves '' on any failure.
const olAbout=async k=>{if(!k)return'';try{const d=await (await fetch('https://openlibrary.org'+k+'.json')).json(),v=d.description;
  return String(typeof v==='object'&&v?v.value||'':v||'').replace(/\r/g,'').replace(/\(\[source\][^)]*\)/g,'').replace(/-{3,}[\s\S]*$/,'').trim().slice(0,2000)}catch{return''}};
const aboutHtml=b=>b.about?`<div class="about">${esc(b.about.length>240?b.about.slice(0,240).replace(/\s+\S*$/,'')+'…':b.about)}</div>`:'';
const recPill=b=>(b.rec||b.dateRec)?`<span class="pill">rec.${b.rec?' by '+esc(b.rec):''}${b.dateRec?(b.rec?' · ':' ')+fmtDay(b.dateRec):''}</span>`:'';
const fmtDay=d=>{const[y,m,dd]=(d||'').split('-');return y&&m&&dd?new Date(y,m-1,dd).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):esc(d)};
const COVER_RE=/^https:\/\/(covers\.openlibrary\.org\/b\/id\/\d{1,12}-[SML]\.jpg|is\d-ssl\.mzstatic\.com\/image\/thumb\/[\w.%\/-]{1,400}\/\d{2,4}x\d{2,4}bb\.jpg)$/;
// Apple Books artwork, resized; only used when Open Library has no cover.
const apCover=u=>{u=String(u||'').replace(/\/\d{2,4}x\d{2,4}bb\.(jpg|png)$/,'/300x300bb.jpg');return COVER_RE.test(u)?u:''};
const coverImg=b=>COVER_RE.test(b.cover||'')?`<img class="cv" src="${esc(b.cover)}" alt="" loading="lazy" onerror="this.remove()">`:'';

// Fill a book form from a picked suggestion. Same behavior in every form (Carol's add + edit, group.html):
// picking a title REPLACES every autofillable field (author, pages, year, category, genre, about, cover) with the
// picked book's values — so a re-pick or a pick in the edit form never leaves another book's details behind.
// Values that arrive later (OL edition, OL description, Apple Books) fill only fields still blank, and are dropped
// if a newer pick happened meanwhile. Fields autofill doesn't own (recommended by, dates, group, notes…) are untouched.
// Apple Books (keyless, CORS-open) backs up Open Library's thin records for new releases: year, genres, blurb.
const appleBook=async(title,author)=>{try{const last=olNorm(author).split(' ').pop()||'',t=olNorm(title);
  const r=(await (await fetch('https://itunes.apple.com/search?media=ebook&limit=10&term='+encodeURIComponent(title+' '+author))).json()).results||[];
  const x=r.find(x=>olNorm(x.trackName).replace(/ a novel$/,'')===t&&olNorm(x.artistName).includes(last))||r.find(x=>olNorm(x.trackName).startsWith(t)&&olNorm(x.artistName).includes(last));
  if(!x)return{};const d=document.createElement('div');d.innerHTML=(x.description||'').replace(/<br\s*\/?>/gi,'\n');
  return{year:(x.releaseDate||'').slice(0,4),genres:x.genres||[],about:d.textContent.trim().slice(0,2000),cover:apCover(x.artworkUrl100)}}catch{return{}}};
const AUTO=['author','pages','year','cat','genre','about','cover'];
function fillPicked(f,b){const fv=n=>f.querySelector(`[name=${n}]`),seq=f._pick=(f._pick||0)+1,ti=fv('title'),live=()=>f._pick===seq&&ti.isConnected;   // form rebuilt → old input disconnected
  const put=(n,v)=>{const el=fv(n);if(el)el.value=v==null?'':String(v)},late=(n,v)=>{const el=fv(n);if(live()&&el&&v&&!el.value)el.value=v};
  fv('title').value=b.title;AUTO.forEach(n=>put(n,b[n]));
  const ap=appleBook(b.title,b.author);
  olAbout(b.key).then(a=>a||ap.then(x=>x.about)).then(a=>late('about',a));
  olEdition(b.key).then(e=>{late('pages',e.pages);late('year',e.year);return ap}).then(x=>{late('year',x.year);late('cover',x.cover);
    if(x.genres){const g=guessGenre(x.genres);if(g.cat){late('cat',g.cat);if(fv('cat')&&fv('cat').value===g.cat)late('genre',g.genre)}}})}
// Self-update: home-screen copies cache old files, so reload once when a newer version.txt is published.
const APPV='20261108c';
const checkV=()=>fetch('version.txt?'+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(v=>{v=v.trim();
  if(v&&v!==APPV&&sessionStorage.getItem('cbv')!==v){sessionStorage.setItem('cbv',v);location.reload()}}).catch(()=>{});
checkV();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkV()});
