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
