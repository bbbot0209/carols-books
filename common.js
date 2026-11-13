// Shared by index.html (Carol's app) and group.html (the limited group page). App name: Book Club Lists.
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
    box.innerHTML=docs.map(acRow).join('')+'<div class="hint">Not listed? Add the author, e.g. “Land O’Farrell”</div>';box.hidden=false};
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
  box.addEventListener('click',async e=>{const el=e.target.closest('[data-i]');let x=el&&docs[+el.dataset.i];if(!x)return;seq++;hide();inp.blur();pick(await resolvePick(x))});
}
// One suggestion row (Open Library doc or Apple result) → fillPicked() shape. Apple picks are resolved to their OL work.
const acRow=(x,i)=>`<div data-i="${i}">${x.cover_i?`<img src="https://covers.openlibrary.org/b/id/${x.cover_i}-S.jpg" alt="">`:/^https:\/\/[\w.-]+\.mzstatic\.com\//.test(x.art)?`<img src="${esc(x.art)}" alt="">`:'<i></i>'}<p><b>${esc(x.title)}</b><span>${esc([(x.author_name||[])[0],x.first_publish_year].filter(Boolean).join(' · '))}</span></p></div>`;
async function resolvePick(x){
  if(x.ap){const a=x,m=await olMatch(a.title,a.author_name[0]);const g=guessGenre(a.genres);
    x={...(m||{}),title:a.title,author_name:a.author_name,first_publish_year:a.first_publish_year||(m&&m.first_publish_year),subject:g.cat?a.genres:(m&&m.subject)||a.genres,art100:a.art100}}
  return{key:/^\/works\/OL\w+$/.test(x.key||'')?x.key:'',title:x.title,author:(x.author_name||[])[0]||'',pages:x.number_of_pages_median||'',year:x.first_publish_year||'',cover:x.cover_i?`https://covers.openlibrary.org/b/id/${x.cover_i}-M.jpg`:apCover(x.art100),...guessGenre(x.subject)}}
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
// ---------- book list display (Book Details / Table / Summary + Print), shared by index.html and group.html ----------
const STL={read:'Read',want:'Want to read'};
const okSt=s=>s==='read'||s==='want';
const gsOf=b=>Array.isArray(b.groups)?b.groups:b.group?String(b.group).split(',').map(x=>x.trim()).filter(Boolean):[];
const gstOf=(b,g)=>okSt((b.gst||{})[g])?b.gst[g]:b.status;
const fmtDate=d=>{if(!d)return'';const[y,m,day]=d.split('-');return day?new Date(y,m-1,day).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):m?new Date(y,m-1).toLocaleString(undefined,{month:'short',year:'numeric'}):y};
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
// Table columns = the book fields (Carol 11/8: "each field is a column"); tap a header to sort. group.html uses a subset.
const COLS=[['title','Title'],['author','Author'],['status','Status'],['cat','Category'],['genre','Genre'],['pages','Pages',1],['year','Year published',1],['date','Date read'],['rating','Rating',1],['by','Recommended by'],['dateRec','Date recommended'],['group','Groups'],['review','Review link'],['notes','Notes']];
const DISPS=[['cards','Book Details'],['table','Table'],['summary','Summary']];
const stPill=(s,g)=>`<span class="pill ${s==='want'?'sw':'sr'}">${g?esc(g)+' · ':''}${STL[s]}</span>`;
// Page hooks for status. index.html overrides them (per-group status + filters); these defaults suit group.html,
// where each book has one status for that group, or none (books added by members) → no pill, "Other books" in Summary.
const BV={stOf:b=>okSt(b.status)?b.status:'',stPills:b=>okSt(b.status)?stPill(b.status):'',stCell:b=>STL[b.status]||''};
// Author sort key = last name of the first author (Carol 11/12), then the full name: "Erik Larson" → "larson erik larson".
// Handles "Last, First", co-authors (and / & / ; / comma lists) and suffixes (Jr., III).
const SUFX=/^(jr|sr|ii|iii|iv|phd|md)\.?$/i;
function lastKey(a){a=String(a||'').trim();if(!a)return null;
  let n=a.split(/\s+(?:and|&)\s+|\s*;\s*/i)[0];const ps=n.split(/\s*,\s*/).filter(p=>p&&!SUFX.test(p));
  const w0=(ps[0]||'').split(/\s+/).filter(w=>!SUFX.test(w));
  const last=ps.length>1&&w0.length===1?w0[0]:w0[w0.length-1]||n;   // "Larson, Erik" vs "Erik Larson, Jane Doe"
  return (last+' '+a).toLowerCase()}
// Sort for every display (Carol 11/12 "Sort by"); d.k = column key, d.dir = 1 A→Z / oldest first, -1 reversed. Ties → title.
function sortBy(items,d,cols=COLS){const c=cols.find(c=>c[0]===d.k);if(!c)return items;const[k,,num]=c;
  const val=b=>{const v=k==='group'?gsOf(b).join(', '):k==='status'?BV.stOf(b):b[k];if(k==='author')return lastKey(v);return num?(parseFloat(v)||null):String(v??'').trim().toLowerCase()||null};
  const ti=b=>String(b.title||'').trim().toLowerCase();
  return items.sort((a,b)=>{const x=val(a),y=val(b);if(x===null||y===null)return x===y?ti(a).localeCompare(ti(b)):x===null?1:-1;   // blanks always last
    return (num?x-y:x.localeCompare(y))*d.dir||ti(a).localeCompare(ti(b))})}
// Summary (Carol 11/8): just Title, Author, Category, Pages — split into Want to read / Read, each with its page total.
const summaryHtml=(items,pr)=>['want','read',''].map(st=>{const it=items.filter(b=>BV.stOf(b)===st);if(!it.length)return'';
  const pgs=it.reduce((t,b)=>t+(parseInt(b.pages)||0),0);
  return `<div class="sh2">${STL[st]||'Other books'} <span>${it.length} book${it.length===1?'':'s'}${pgs?` · ${pgs.toLocaleString()} pages`:''}</span></div><div class="sl">`+
    it.map(b=>`<div class="sr1" data-id="${esc(b.id)}"><b>${esc(b.title)}</b><span class="m">${[b.author,b.cat,pr&&b.year].filter(Boolean).map(x=>` · ${esc(x)}`).join('')}</span><span class="p">${b.pages?esc(b.pages)+' pages':''}</span></div>`).join('')+'</div>'}).join('');
function cell(b,k,pr){const v=k==='group'?gsOf(b).join(', '):b[k];
  if(k==='status')return BV.stCell(b);
  if(k==='date'||k==='dateRec')return v?fmtDate(v):'';
  if(k==='rating')return v?`<span class="stars">${'★'.repeat(v)}</span>`:'';
  if(k==='review')return /^https?:\/\/\S+$/i.test(v||'')?(pr?esc(v.replace(/^https?:\/\/(www\.)?/i,'').split('/')[0]):`<a href="${esc(v)}" target="_blank" rel="noopener">Review ↗</a>`):'';
  if(k==='notes')return esc(!pr&&(v||'').length>90?v.slice(0,90).replace(/\s+\S*$/,'')+'…':v);
  return esc(v)}
const tableHtml=(items,pr,cols=COLS,d={})=>`<div class="tw"><table class="bt"><thead><tr>${cols.map(([k,l])=>`<th data-k="${k}"${!pr&&d.k===k?' class="on"':''}>${l}${!pr&&d.k===k?(d.dir>0?' ▲':' ▼'):''}</th>`).join('')}</tr></thead>
  <tbody>${items.map(b=>`<tr data-id="${esc(b.id)}">${cols.map(([k])=>`<td${k==='notes'?' class="nt"':''}>${cell(b,k,pr)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
// "added by": a name on group pages; on Carol's page a per-group map {BAIP:'Bob'} → one pill per distinct name.
const addedByHtml=a=>[...new Set(typeof a==='string'?[a]:Object.values(a||{}))].filter(Boolean).map(n=>`<span class="pill">added by ${esc(n)}</span>`).join('');
// One book card. Book shape = Carol's library (by = recommended by); group.html maps shared books to it (addedBy, _mine).
const cardHtml=(b,pr)=>`
      <div class="card${coverImg(b)?' hc':''}" data-id="${esc(b.id)}">${coverImg(b)}${b._mine?'<span class="mine">Edit</span>':''}
        <div class="t">${esc(b.title)}</div>${b.author?`<div class="a">${esc(b.author)}</div>`:''}
        <div class="meta">
          ${BV.stPills(b,pr)}
          ${b.cat?`<span class="pill ${b.cat==='Fiction'?'f':'n'}">${esc(b.cat)}</span>`:''}
          ${b.genre?`<span class="pill">${esc(b.genre)}</span>`:''}
          ${b.pages?`<span class="pill">${esc(b.pages)} pages</span>`:''}${b.year?`<span class="pill">${esc(b.year)}</span>`:''}
          ${b.status==='read'&&b.date?`<span class="pill">${fmtDate(b.date)}</span>`:''}
          ${b.rating?`<span class="stars">${'★'.repeat(b.rating)}</span>`:''}
          ${recPill({rec:b.by,dateRec:b.dateRec})}${addedByHtml(b.addedBy)}
        </div>
        ${aboutHtml(b)}${reviewHtml(b)}
        ${b.notes?`<div class="note">${link(b.notes)}</div>`:''}
      </div>`;
// The list body for a display mode, and the count row above it: "N books   Book Details · Table · Summary   Print · Print titles".
const listHtml=(items,d,cols=COLS)=>d.mode==='table'?tableHtml(items,false,cols,d):d.mode==='summary'?summaryHtml(items):items.map(b=>cardHtml(b)).join('');
// Sort by menu (Carol 11/12): Title, Author (last name), Category, Published, Recommended by (11/13); a table-header sort on
// another column shows here too. 'Recently recommended' = the default order (recentRec): newest date recommended first, no date last, ties newest added.
const recentRec=items=>items.sort((a,b)=>(!a.dateRec)-(!b.dateRec)||String(b.dateRec||'').localeCompare(String(a.dateRec||''))||(b.added||0)-(a.added||0));
const SORTS=[['title','Title'],['author','Author'],['cat','Category'],['year','Published'],['by','Recommended by']];
const sortHtml=(d,cols)=>{const o=[['','Recently recommended'],...SORTS];const c=cols.find(c=>c[0]===d.k);if(c&&!o.some(x=>x[0]===d.k))o.push([c[0],c[1]]);
  const k=c?d.k:'',num=c&&c[2];
  return `<div class="srt"><label>Sort by <select>${o.map(([v,l])=>`<option value="${v}"${v===k?' selected':''}>${l}</option>`).join('')}</select></label>${k?`<button type="button" class="sdir">${k==='year'?(d.dir>0?'Oldest first':'Newest first'):num?(d.dir>0?'Low → high':'High → low'):(d.dir>0?'A → Z':'Z → A')}</button>`:''}</div>`};
// Show: All / Read / Want to read (Carol 11/12) — on every display and print; st = current status ('' = all).
const SHOWS=[['','All'],['read','Read'],['want','Want to read']];
const showHtml=st=>`<div class="shw"><span>Show</span>${SHOWS.map(([v,l])=>`<button type="button" data-s="${v}"${(st||'')===v?' class="on"':''}>${l}</button>`).join('')}</div>`;
const crowHtml=(countHtml,d,any,cols=COLS,st)=>`<div class="crow"><div class="count">${countHtml}</div><span class="dsp">${DISPS.map(([m,l])=>`<button type="button" data-m="${m}"${d.mode===m?' class="on"':''}>${l}</button>`).join('')}</span>${any?'<button type="button" class="prc">Print</button><button type="button" class="prt">Print titles</button>':''}${st!==undefined?showHtml(st):''}${any?sortHtml(d,cols):''}</div>`;
// Wire the display switch, table header sorting (keeps the sideways scroll) and the two print buttons.
function wireDisp(L,d,saveD,rerender,print,setSt){
  if(setSt)L.querySelectorAll('.shw button').forEach(x=>x.onclick=()=>setSt(x.dataset.s));
  L.querySelectorAll('.dsp button').forEach(x=>x.onclick=()=>{d.mode=x.dataset.m;saveD();rerender()});
  const ss=L.querySelector('.srt select');if(ss)ss.onchange=()=>{d.k=ss.value;d.dir=1;saveD();rerender()};
  L.querySelector('.sdir')?.addEventListener('click',()=>{d.dir=-d.dir;saveD();rerender()});
  L.querySelectorAll('.bt th').forEach(th=>th.onclick=()=>{const k=th.dataset.k;d.dir=d.k===k?-d.dir:1;d.k=k;saveD();
    const tw=th.closest('.tw'),j=[...L.querySelectorAll('.tw')].indexOf(tw),sx=tw.scrollLeft;
    rerender();const t2=L.querySelectorAll('.tw')[j];if(t2)t2.scrollLeft=sx});
  L.querySelector('.prc')?.addEventListener('click',()=>print(false));
  L.querySelector('.prt')?.addEventListener('click',()=>print(true));
}
// Print: "Print" = the current display (cards, landscape table, or summary); "Print titles" = numbered Title — Author list.
const titlesHtml=items=>`<ol>${items.map(b=>`<li>${esc(b.title)}${b.author?` <i>— ${esc(b.author)}</i>`:''}${[b.year&&'published '+esc(b.year),b.pages&&esc(b.pages)+' pages'].filter(Boolean).map(x=>` · ${x}`).join('')}</li>`).join('')}</ol>`;
const printHead=(title,sub,n)=>`<h1>${esc(title)}</h1><div class="pd">${sub?esc(sub)+' · ':''}${n} book${n===1?'':'s'} · printed ${fmtDate(today())}</div>`;
function printBooks(items,head,titles,mode,cols=COLS){
  $('#pv').innerHTML=head+(titles?titlesHtml(items):mode==='table'?tableHtml(items,true,cols):mode==='summary'?summaryHtml(items,true):items.map(b=>cardHtml(b,true)).join(''));
  let pg=$('#pgs');if(!pg){pg=document.createElement('style');pg.id='pgs';document.head.append(pg)}
  pg.textContent=!titles&&mode==='table'?'@page{size:landscape}':'';
  setTimeout(()=>window.print(),50);
}
// Self-update: home-screen copies cache old files, so reload once when a newer version.txt is published.
const APPV='20261113d';
const checkV=()=>fetch('version.txt?'+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(v=>{v=v.trim();
  if(v&&v!==APPV&&sessionStorage.getItem('cbv')!==v){sessionStorage.setItem('cbv',v);location.reload()}}).catch(()=>{});
checkV();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkV()});
