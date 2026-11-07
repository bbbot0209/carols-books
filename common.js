// Shared by index.html (Carol's app) and group.html (the limited group page).
const API='https://bbs-mac-mini.tail532c1c.ts.net/books-api';
const SHARE_BASE=new URL('group.html#',location.href).href.replace(/#.*/,'')+'#';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=s=>esc(s).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
const GENRES={'Fiction':['Literary fiction','Mystery','Thriller & suspense','Romance','Historical fiction','Fantasy','Science fiction','Horror','Short stories','Classics','Young adult','Graphic novel','Poetry'],
  'Non-fiction':['Biography & memoir','History','Science & nature','Politics & current events','Business & economics','Self-help','Health & wellness','Religion & spirituality','Philosophy','Psychology','True crime','Travel','Food & cooking','Art & music','Essays']};
const catOf=g=>Object.keys(GENRES).find(c=>GENRES[c].includes(g))||'';
// Review text links to the review URL when both exist; otherwise whichever is there.
const reviewHtml=b=>{const u=/^https?:\/\/\S+$/i.test(b.review||'')?b.review:'',t=(b.reviewText||'').trim(),a=`href="${esc(u)}" target="_blank" rel="noopener"`;
  return t&&u?`<div class="note rv"><a ${a}>${esc(t)}</a> ↗</div>`:t?`<div class="note rv">${esc(t)}</div>`:u?`<div class="note"><a ${a}>Review ↗</a></div>`:''};
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
const OL='https://openlibrary.org/search.json?limit=8&fields=key,title,author_name,number_of_pages_median,subject,first_publish_year,cover_i&q=';
function bookAC(inp,pick){
  const box=document.createElement('div'),cache=new Map();box.className='ac';box.hidden=true;inp.after(box);
  let seq=0,t=0,docs=[];
  const hide=()=>{box.hidden=true;box.innerHTML='';docs=[]};
  const show=d=>{docs=d.filter(x=>x.title).slice(0,6);if(!docs.length||document.activeElement!==inp)return hide();
    box.innerHTML=docs.map((x,i)=>`<div data-i="${i}">${x.cover_i?`<img src="https://covers.openlibrary.org/b/id/${x.cover_i}-S.jpg" alt="">`:'<i></i>'}<p><b>${esc(x.title)}</b><span>${esc([(x.author_name||[])[0],x.first_publish_year].filter(Boolean).join(' · '))}</span></p></div>`).join('');box.hidden=false};
  inp.addEventListener('input',()=>{clearTimeout(t);const q=inp.value.trim().toLowerCase(),s=++seq;if(q.length<3)return hide();
    if(cache.has(q))return show(cache.get(q));
    t=setTimeout(async()=>{try{const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),8000);
      const r=await fetch(OL+encodeURIComponent(q),{signal:ctl.signal}).finally(()=>clearTimeout(tm));const d=(await r.json()).docs||[];
      cache.set(q,d);if(s===seq)show(d)}catch{if(s===seq)hide()}},300)});
  inp.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==inp){seq++;hide()}},250));
  inp.addEventListener('keydown',e=>{if(e.key==='Escape'){seq++;hide()}});
  box.addEventListener('mousedown',e=>e.preventDefault());
  box.addEventListener('click',e=>{const el=e.target.closest('[data-i]'),x=el&&docs[+el.dataset.i];if(!x)return;seq++;hide();
    pick({key:/^\/works\/OL\w+$/.test(x.key||'')?x.key:'',title:x.title,author:(x.author_name||[])[0]||'',pages:x.number_of_pages_median||'',cover:x.cover_i?`https://covers.openlibrary.org/b/id/${x.cover_i}-M.jpg`:'',...guessGenre(x.subject)});inp.blur()});
}
// Work description ("About the book") from Open Library; resolves '' on any failure.
const olAbout=async k=>{if(!k)return'';try{const d=await (await fetch('https://openlibrary.org'+k+'.json')).json(),v=d.description;
  return String(typeof v==='object'&&v?v.value||'':v||'').replace(/\r/g,'').replace(/\(\[source\][^)]*\)/g,'').replace(/-{3,}[\s\S]*$/,'').trim().slice(0,2000)}catch{return''}};
const aboutHtml=b=>b.about?`<div class="about">${esc(b.about.length>240?b.about.slice(0,240).replace(/\s+\S*$/,'')+'…':b.about)}</div>`:'';
const recPill=b=>(b.rec||b.dateRec)?`<span class="pill">rec.${b.rec?' by '+esc(b.rec):''}${b.dateRec?' '+fmtDay(b.dateRec):''}</span>`:'';
const fmtDay=d=>{const[y,m,dd]=(d||'').split('-');return y&&m&&dd?new Date(y,m-1,dd).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):esc(d)};
const coverImg=b=>/^https:\/\/covers\.openlibrary\.org\/\S+$/.test(b.cover||'')?`<img class="cv" src="${esc(b.cover)}" alt="" loading="lazy" onerror="this.remove()">`:'';
