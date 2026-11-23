"use strict";
const FONT_DIR = 'assets/fonts/';
function parseFnt(txt){
  const d={lh:0,base:0,chars:{},kern:{}};
  for(const line of txt.split(/\r?\n/)){
    const kv={}; for(const m of line.matchAll(/(\w+)=("[^"]*"|\S+)/g)) kv[m[1]]=m[2];
    if(line.startsWith('common')){ d.lh=+kv.lineHeight; d.base=+kv.base; }
    else if(line.startsWith('char ')) d.chars[+kv.id]=['x','y','width','height','xoffset','yoffset','xadvance'].map(k=>+kv[k]);
    else if(line.startsWith('kerning ')) d.kern[kv.first+','+kv.second]=+kv.amount;
  }
  return d;
}
async function loadFont(name){
  const [txt,img]=await Promise.all([
    fetch(FONT_DIR+name+'.fnt').then(r=>{ if(!r.ok) throw new Error('missing '+name+'.fnt'); return r.text(); }),
    loadImg(FONT_DIR+name+'.png')
  ]);
  return {img,d:parseFnt(txt)};
}

/* ---------- settings ---------- */
const $ = id => document.getElementById(id);
const P = new URLSearchParams(location.search);
const store = {
  get(k){ try{ return localStorage.getItem('gdchat.'+k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem('gdchat.'+k,v); }catch(e){} }
};
const S = {
  url: P.get('url') ?? store.get('url') ?? '',
  key: P.get('key') ?? store.get('key') ?? '',
  zoom: parseFloat(P.get('size') ?? store.get('zoom') ?? (innerWidth<500?'0.7':'1')) || 1,
  width: parseFloat(P.get('width') ?? store.get('width') ?? '40') || 40,
  pos: P.get('pos') ?? store.get('pos') ?? 'left',
  video: (P.get('video') ?? store.get('video') ?? '1') !== '0',
  bg: P.get('transparent')==='1' ? 'transparent' : (P.get('green')==='1' ? 'green' : (store.get('bg') ?? 'normal'))
};

/* ---------- fonts ---------- */
const fonts = {};
const loadImg = src => new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error('font image failed')); i.src=src; });
function tint(img,color){
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const x=c.getContext('2d'); x.drawImage(img,0,0);
  x.globalCompositeOperation='multiply'; x.fillStyle=color; x.fillRect(0,0,c.width,c.height);
  x.globalCompositeOperation='destination-in'; x.drawImage(img,0,0);
  return c;
}
const MOD_NAME_TINT = '#3dff3d';   // moderator names: big font tinted green
const MOD_TEXT_TINT = '#ffe81a';   // moderator messages: chat font tinted yellow
const OWNER_TEXT_TINT = '#3dff3d'; // stream owner messages: chat font tinted green (name stays white)
const TIME_TINT = '#d9a97f';    // timestamps: chat font tinted tan

const mctx = document.createElement('canvas').getContext('2d');
const fbFont = (f,s) => Math.round(f.d.lh*s*0.78)+'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif';
function adv(f,ch,s){
  const g=f.d.chars[ch.codePointAt(0)];
  if(g) return g[6]*s;
  mctx.font=fbFont(f,s); return mctx.measureText(ch).width;
}
const kern=(f,a,b)=>f.d.kern[a.codePointAt(0)+','+b.codePointAt(0)]||0;
function tw(f,str,s){ let w=0,p=null; for(const ch of str){ if(p) w+=kern(f,p,ch)*s; w+=adv(f,ch,s); p=ch; } return w; }
function drawTxt(ctx,f,str,x,y,s){
  let p=null;
  for(const ch of str){
    if(p) x+=kern(f,p,ch)*s;
    const g=f.d.chars[ch.codePointAt(0)];
    if(g){
      if(g[2]>0) ctx.drawImage(f.img,g[0],g[1],g[2],g[3],x+g[4]*s,y+g[5]*s,g[2]*s,g[3]*s);
      x+=g[6]*s;
    } else {
      ctx.font=fbFont(f,s); ctx.fillStyle='#fff'; ctx.textBaseline='alphabetic';
      ctx.fillText(ch,x,y+f.d.base*s); x+=mctx.measureText(ch).width;
    }
    p=ch;
  }
  return x;
}
const capH = f => f.d.chars[72][3];                 // height of "H"
const capTop = f => f.d.chars[72][5];               // its yoffset
function wrap(f,text,s,maxW){
  const lines=[]; let line='';
  for(const word of text.split(/\s+/).filter(Boolean)){
    const test=line?line+' '+word:word;
    if(tw(f,test,s)<=maxW){ line=test; continue; }
    if(line){ lines.push(line); line=''; }
    if(tw(f,word,s)<=maxW){ line=word; continue; }
    let chunk='';
    for(const ch of word){
      if(chunk && tw(f,chunk+ch,s)>maxW){ lines.push(chunk); chunk=ch; } else chunk+=ch;
    }
    line=chunk;
  }
  if(line) lines.push(line);
  return lines.slice(0,10);
}

/* ---------- rendering ---------- */
const list=$('list'), head=$('head');
const dpr = () => Math.max(1, window.devicePixelRatio||1);
function hash(str){ let h=2166136261; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
function drawIcon(ctx,x,y,sz,name){
  const h=hash(name), b=Math.max(2,sz*0.07);
  ctx.fillStyle='#000'; ctx.fillRect(x,y,sz,sz);
  ctx.fillStyle=`hsl(${h%360} 85% 52%)`; ctx.fillRect(x+b,y+b,sz-2*b,sz-2*b);
  const i=sz*0.26, j=sz-2*i;
  ctx.fillStyle='#000'; ctx.fillRect(x+i-b,y+i-b,j+2*b,j+2*b);
  ctx.fillStyle=`hsl(${(h>>>9)%360} 90% 62%)`; ctx.fillRect(x+i,y+i,j,j);
}
function rr(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
function drawAvatar(ctx,img,x,y,sz){
  const b=Math.max(2,sz*0.07), r=sz*0.2;
  ctx.fillStyle='#000'; rr(ctx,x,y,sz,sz,r); ctx.fill();
  ctx.save(); rr(ctx,x+b,y+b,sz-2*b,sz-2*b,Math.max(1,r-b*0.6)); ctx.clip();
  const s=Math.min(img.naturalWidth,img.naturalHeight)||1;
  ctx.drawImage(img,(img.naturalWidth-s)/2,(img.naturalHeight-s)/2,s,s,x+b,y+b,sz-2*b,sz-2*b);
  ctx.restore();
}
const AV={};
const tryImg=url=>new Promise((res,rej)=>{ const i=new Image(); i.referrerPolicy='no-referrer'; i.onload=()=>res(i); i.onerror=rej; i.src=url; });
function avatarFor(m){
  if(!m.akey) return;
  let a=AV[m.akey];
  if(!a){ a=AV[m.akey]={img:null,fail:false,subs:[]}; loadAvatar(a,m); }
  if(a.img) m.av=a.img; else if(!a.fail) a.subs.push(m);
}
async function loadAvatar(a,m){
  const urls=[];
  if(m.avatarUrl) urls.push(m.avatarUrl);
  if(m.platform==='twitch'){
    let u=store.get('av.'+m.akey);
    if(!u){
      try{
        const t=(await (await fetch('https://decapi.me/twitch/avatar/'+encodeURIComponent(m.akey))).text()).trim();
        if(/^https:\/\//.test(t)){ u=t; store.set('av.'+m.akey,t); }
      }catch(e){}
    }
    if(u) urls.push(u);
    urls.push('https://unavatar.io/twitch/'+encodeURIComponent(m.akey));
  }
  for(const u of urls){
    try{
      const img=await tryImg(u); a.img=img;
      a.subs.forEach(s=>{ s.av=img; if(s.el&&s.el.isConnected) renderRow(s,listW()); }); a.subs=[];
      return;
    }catch(e){}
  }
  a.fail=true; a.subs=[];
}
function ago(ts){
  const s=Math.max(0,Math.floor((Date.now()-ts)/1000));
  if(s<10) return 'just now';
  if(s<60) return s+' seconds ago';
  const m=Math.floor(s/60); if(m<60) return m+(m===1?' minute ago':' minutes ago');
  const h=Math.floor(m/60); return h+(h===1?' hour ago':' hours ago');
}
function renderRow(m,w){
  const Z=S.zoom, d=dpr();
  const padX=16*Z, padY=12*Z, icon=46*Z, gap=12*Z;
  const nameF = m.role==='owner' ? fonts.big : (m.role==='mod' ? fonts.bigMod : fonts.gold);
  const textF = m.role==='owner' ? fonts.chatOwner : (m.role==='mod' ? fonts.chatMod : fonts.chat);
  const sN = 26*Z/capH(nameF);
  const sT = 21*Z/capH(fonts.chat);
  const sA = 14*Z/capH(fonts.chat);
  const lh = fonts.chat.d.lh*sT;
  const label = ago(m.ts); m.label=label;
  const tsW = tw(fonts.chatDim,label,sA);
  let name=m.name;
  const maxName = w-padX*2-icon-gap-tsW-gap;
  if(tw(nameF,name,sN)>maxName){
    while(name.length>1 && tw(nameF,name+'..',sN)>maxName) name=name.slice(0,-1);
    name+='..';
  }
  const lines=wrap(fonts.chat,m.text,sT,w-padX*2);
  const h=Math.ceil(padY+icon+(lines.length?8*Z+lines.length*lh:0)+padY);
  const c=m.canvas||document.createElement('canvas');
  c.width=Math.ceil(w*d); c.height=Math.ceil(h*d); c.style.width=w+'px'; c.style.height=h+'px';
  const x=c.getContext('2d'); x.setTransform(d,0,0,d,0,0);
  x.fillStyle=m.alt?'#945129':'#9c5529'; x.fillRect(0,0,w,h);
  x.fillStyle='#4a2810'; x.fillRect(0,0,w,Math.max(1,2*Z));
  x.fillStyle='#8c4d21'; x.fillRect(0,Math.max(1,2*Z),w,Math.max(1,Z));
  if(m.av) drawAvatar(x,m.av,padX,padY,icon); else drawIcon(x,padX,padY,icon,m.name);
  const cy=padY+icon/2;
  const nY=cy-(capTop(nameF)+capH(nameF)/2)*sN;
  drawTxt(x,nameF,name,padX+icon+gap,nY,sN);
  const aY=cy-(capTop(fonts.chatDim)+capH(fonts.chatDim)/2)*sA;
  drawTxt(x,fonts.chatDim,label,w-padX-tsW,aY,sA);
  let y=padY+icon+8*Z;
  for(const ln of lines){ drawTxt(x,textF,ln,padX,y,sT); y+=lh; }
  m.canvas=c; m.h=h; return c;
}
function renderHead(title,sub){
  const Z=S.zoom, d=dpr(), w=head.parentElement.clientWidth-10;
  const sT=34*Z/capH(fonts.big), sS=22*Z/capH(fonts.gold);
  const lhT=fonts.big.d.lh*sT, lhS=fonts.gold.d.lh*sS;
  const h=Math.ceil(10*Z+lhT*0.82+(sub?lhS*0.8:0)+6*Z);
  head.width=Math.ceil(w*d); head.height=Math.ceil(h*d); head.style.width=w+'px'; head.style.height=h+'px';
  const x=head.getContext('2d'); x.setTransform(d,0,0,d,0,0);
  const tx=(w-tw(fonts.big,title,sT))/2;
  drawTxt(x,fonts.big,title,Math.max(0,tx),8*Z-4*Z,sT);
  if(sub){
    let t=sub; while(t.length>3 && tw(fonts.gold,t,sS)>w-12) t=t.slice(0,-1);
    drawTxt(x,fonts.gold,t,Math.max(0,(w-tw(fonts.gold,t,sS))/2),10*Z+lhT*0.8-4*Z,sS);
  }
}

/* ---------- message list ---------- */
const rows=[]; let altFlip=0, headSub='';
const clean = t => String(t).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,300);
function listW(){ return list.clientWidth-8*0; }
function prune(){
  const H=list.clientHeight; let total=rows.reduce((a,m)=>a+m.h,0);
  while(rows.length>1 && total-rows[0].h>=H){ total-=rows[0].h; rows[0].el.remove(); rows.shift(); }
}
function addMessage({name,text,role,avatarUrl,akey,platform}){
  if(!fonts.ready) return;
  const m={name:clean(name||'Unknown'),text:clean(text),role:role||'',ts:Date.now(),alt:(altFlip^=1),avatarUrl,akey,platform};
  avatarFor(m);
  const el=document.createElement('div'); el.className='row';
  m.el=el; renderRow(m,listW()); el.appendChild(m.canvas);
  list.appendChild(el); rows.push(m); prune();
}
function rerenderAll(){
  if(!fonts.ready) return;
  rows.forEach(m=>renderRow(m,listW())); prune(); renderHead('Live Chat',headSub); renderVHead();
}
setInterval(()=>{ // keep "x minutes ago" fresh
  let changed=false;
  for(const m of rows){ if(ago(m.ts)!==m.label){ renderRow(m,listW()); changed=true; } }
  if(changed) prune();
},15000);
let lastW=0;
new ResizeObserver(()=>{ const w=list.clientWidth; if(w!==lastW){ lastW=w; rerenderAll(); } else prune(); }).observe(list);

/* ---------- video ---------- */
const vframe=$('vframe'), vbox=$('vbox'), vhead=$('vhead');
let vTitle='', cur=null;
function renderVHead(){
  if(!fonts.ready||vframe.classList.contains('hidden')) return;
  if(vOffline) drawOffline();
  const Z=S.zoom, d=dpr(), w=vframe.clientWidth-10;
  const sT=28*Z/capH(fonts.big), lhT=fonts.big.d.lh*sT;
  const h=Math.ceil(lhT*0.8+8*Z);
  vhead.width=Math.ceil(w*d); vhead.height=Math.ceil(h*d); vhead.style.width=w+'px'; vhead.style.height=h+'px';
  const x=vhead.getContext('2d'); x.setTransform(d,0,0,d,0,0);
  let t=vTitle; while(t.length>2 && tw(fonts.big,t,sT)>w-16) t=t.slice(0,-1);
  drawTxt(x,fonts.big,t,Math.max(0,(w-tw(fonts.big,t,sT))/2),2*Z-3*Z,sT);
}
let vOffline=false;
function clearVideo(){ vOffline=false; vbox.innerHTML=''; vframe.classList.add('hidden'); }
function drawOffline(){
  const c=$('voff'); if(!c||!fonts.ready) return;
  const d=dpr(), w=vbox.clientWidth, h=vbox.clientHeight; if(!w||!h) return;
  c.width=Math.ceil(w*d); c.height=Math.ceil(h*d);
  const x=c.getContext('2d'); x.setTransform(d,0,0,d,0,0);
  const s=Math.min(h*0.2,w*0.08)/capH(fonts.big), txt='Offline...';
  drawTxt(x,fonts.big,txt,(w-tw(fonts.big,txt,s))/2,h/2-(capTop(fonts.big)+capH(fonts.big)/2)*s,s);
}
function videoOffline(){
  vOffline=true; vbox.innerHTML='';
  const c=document.createElement('canvas'); c.id='voff'; c.style.cssText='position:absolute;inset:0;width:100%;height:100%;background:#2a1408';
  vbox.appendChild(c); drawOffline();
}
function videoError(msg){
  vOffline=false; vbox.innerHTML=''; const d=document.createElement('div'); d.className='verr'; d.textContent=msg; vbox.appendChild(d);
}
const loadScript=src=>new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('blocked')); document.head.appendChild(s); });
async function startVideo(kind,id,gen,title){
  cur={kind,id,title};
  if(!S.video){ clearVideo(); return; }
  vTitle=title; vOffline=false; vframe.classList.remove('hidden'); vbox.innerHTML=''; renderVHead();
  const holder=document.createElement('div'); holder.id='vplayer'; holder.style.cssText='position:absolute;inset:0'; vbox.appendChild(holder);
  let ready=false; const guard=setTimeout(()=>{ if(!ready&&gen===GEN){ if(kind==='twitch') videoOffline(); else videoError('The video didn\'t load. Chat still works.'); } },12000);
  try{
    if(kind==='twitch'){
      if(!/^https?:$/.test(location.protocol)){
        clearTimeout(guard);
        return videoError('Twitch only plays video on a page with a web address, and this file is opened locally. Chat still works. Put the file on a website (like GitHub Pages) to see the video.');
      }
      await loadScript('https://embed.twitch.tv/embed/v1.js');
      if(gen!==GEN) return;
      const pl=new Twitch.Player('vplayer',{channel:id,parent:[location.hostname],width:'100%',height:'100%',muted:true,autoplay:true});
      pl.addEventListener(Twitch.Player.READY,()=>{ ready=true; });
      pl.addEventListener(Twitch.Player.OFFLINE,()=>{ ready=true; videoOffline(); });
      pl.addEventListener(Twitch.Player.ENDED,()=>{ ready=true; videoOffline(); });
    } else {
      await new Promise((res,rej)=>{
        if(window.YT&&YT.Player) return res();
        window.onYouTubeIframeAPIReady=res; loadScript('https://www.youtube.com/iframe_api').catch(rej);
      });
      if(gen!==GEN) return;
      new YT.Player('vplayer',{videoId:id,width:'100%',height:'100%',playerVars:{autoplay:1,mute:1,playsinline:1,rel:0},events:{
        onReady:e=>{ ready=true; e.target.mute(); e.target.playVideo(); },
        onError:()=>{ ready=true; videoError('YouTube won\'t play this video here. Embedding may be turned off for it, or blocked for this page.'); }
      }});
    }
  }catch(e){ clearTimeout(guard); if(gen===GEN) videoError('Couldn\'t load the video player. Chat still works.'); }
}

/* ---------- connections ---------- */
let GEN=0, curWS=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const statusEl=$('status');
function setStatus(t,err){ statusEl.textContent=t; statusEl.className='status'+(err?' err':''); }
function stopAll(){ GEN++; cur=null; clearVideo(); try{ curWS&&curWS.close(); }catch(e){} curWS=null; }

function parseTarget(raw){
  const u=(raw||'').replace(/\s+/g,'').replace(/[<>"']/g,''); if(!u) return null;
  if(/^[A-Za-z0-9_]{3,25}$/.test(u)) return {p:'twitch',id:u};
  let x; try{ x=new URL(/^https?:\/\//i.test(u)?u:'https://'+u); }catch(e){ return {p:'bad'}; }
  const h=x.hostname.replace(/^(www|m|music)\./,''), seg=x.pathname.split('/').filter(Boolean);
  if(h==='twitch.tv'){
    const n=(seg[0]==='popout'||seg[0]==='embed')?seg[1]:seg[0];
    return n?{p:'twitch',id:n}:{p:'bad'};
  }
  if(h==='youtube.com'||h==='youtu.be'){
    let id=x.searchParams.get('v');
    if(!id && h==='youtu.be') id=seg[0];
    if(!id && ['live','embed','shorts','live_chat'].includes(seg[0])) id=seg[1];
    return id?{p:'youtube',id}:{p:'yt-noid'};
  }
  if(h.endsWith('kick.com')) return {p:'kick'};
  return {p:'bad'};
}

function startTwitch(channel,gen){
  headSub='By '+channel; renderHead('Live Chat',headSub);
  let tries=0;
  const open=()=>{
    if(gen!==GEN) return;
    setStatus('Connecting to Twitch…');
    const ws=new WebSocket('wss://irc-ws.chat.twitch.tv:443'); curWS=ws;
    ws.onopen=()=>{
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send('NICK justinfan'+(10000+Math.floor(Math.random()*80000)));
      ws.send('JOIN #'+channel.toLowerCase());
    };
    ws.onmessage=e=>{
      for(const line of String(e.data).split('\r\n')){
        if(!line) continue;
        if(line.startsWith('PING')){ ws.send('PONG :tmi.twitch.tv'); continue; }
        if(/ (366|001) /.test(line)){ tries=0; setStatus('Connected to #'+channel+'. Waiting for messages…'); continue; }
        const mt=line.match(/^(?:@(\S+) )?:([^!\s]+)!\S+ PRIVMSG #\S+ :(.*)$/);
        if(!mt) continue;
        const tags={};
        (mt[1]||'').split(';').forEach(kv=>{ const i=kv.indexOf('='); if(i>0) tags[kv.slice(0,i)]=kv.slice(i+1).replace(/\\s/g,' ').replace(/\\:/g,';').replace(/\\\\/g,'\\'); });
        let text=mt[3]; const act=text.match(/^\x01ACTION (.*)\x01$/); if(act) text=act[1];
        const badges=tags.badges||'';
        const login=mt[2].toLowerCase();
        const role=(login===channel.toLowerCase()||/(^|,)broadcaster\//.test(badges))?'owner':((tags.mod==='1'||/(^|,)moderator\//.test(badges))?'mod':'');
        addMessage({name:tags['display-name']||mt[2],text,platform:'twitch',akey:login,role});
      }
    };
    let opened=false; const baseOpen=ws.onopen; ws.onopen=()=>{ opened=true; baseOpen(); };
    ws.onclose=()=>{
      if(gen!==GEN) return; tries++;
      setStatus(opened?'Twitch disconnected. Reconnecting…':'Can\'t reach Twitch chat (try '+tries+'). If this page is open inside an app preview, open the saved file in Chrome or Safari instead.',true);
      setTimeout(open,Math.min(15000,2000*tries));
    };
    ws.onerror=()=>{};
  };
  open();
}

async function startYouTube(videoId,key,gen){
  headSub='YouTube Live'; renderHead('Live Chat',headSub);
  const api=async url=>{ const r=await fetch(url); const j=await r.json(); if(j.error){ const e=new Error(j.error.message||'YouTube API error'); e.code=j.error.code; throw e; } return j; };
  try{
    setStatus('Finding the live chat…');
    const v=await api(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`);
    const item=v.items&&v.items[0];
    const chatId=item&&item.liveStreamingDetails&&item.liveStreamingDetails.activeLiveChatId;
    if(!chatId){ const e=new Error('That video has no active live chat. Is the stream live?'); e.offline=true; throw e; }
    if(item.snippet&&item.snippet.channelTitle){ headSub='By '+item.snippet.channelTitle; renderHead('Live Chat',headSub); if(cur&&gen===GEN){ vTitle=item.snippet.channelTitle; renderVHead(); } }
    setStatus('Connected to YouTube chat.');
    let token='', first=true;
    while(gen===GEN){
      try{
        const j=await api(`https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(chatId)}&part=snippet,authorDetails&maxResults=200&key=${encodeURIComponent(key)}`+(token?`&pageToken=${encodeURIComponent(token)}`:''));
        token=j.nextPageToken||token;
        let items=j.items||[]; if(first){ items=items.slice(-12); first=false; }
        for(const it of items){
          const a=it.authorDetails||{}, t=it.snippet&&(it.snippet.displayMessage||(it.snippet.textMessageDetails&&it.snippet.textMessageDetails.messageText));
          if(t) addMessage({name:a.displayName,text:t,platform:'youtube',akey:a.channelId,avatarUrl:a.profileImageUrl,role:a.isChatOwner?'owner':(a.isChatModerator?'mod':'')});
        }
        await sleep(Math.max(j.pollingIntervalMillis||6000,6000));
      }catch(e){
        if(e.code===403||e.code===400) throw e;
        setStatus('Retrying… ('+e.message+')',true); await sleep(10000);
      }
    }
  }catch(e){
    if(gen===GEN){ setStatus(e.message,true); if(e.offline&&cur) videoOffline(); }
  }
}

const DEMO=[
  ['HuguitoProYT','El Que Inicio La Maldicion',0],['RyoDaCube12','You guys should honestly play my lvls, I think they\'re good',0],
  ['Missa504','it\'s so hard',0],['Sacred2016','gg that wave was insane',0],['Doggie','welcome in everyone! keep it friendly please','owner'],
  ['xX_Cube_Xx','first try (not clickbait)',0],['Zoink','What song is this? 🔥🔥',0],['Nova','top 10 hardest part of the whole level honestly, I can\'t believe you just did that without practice mode',0],
  ['Echo','lmao',0],['Mod_Mia','no spoilers in chat pls','mod'],['Pixelpup','0 attempts?? sure buddy',0],['Jumpman','the new update is crazy',0]
];
function startDemo(gen){
  headSub='By Demo'; renderHead('Live Chat',headSub); setStatus('Showing demo messages.');
  let i=0;
  (async()=>{
    while(gen===GEN){
      const d=DEMO[i++%DEMO.length]; addMessage({name:d[0],text:d[1],role:d[2]||''});
      await sleep(900+Math.random()*1800);
    }
  })();
}

function connect(){
  const raw=$('url').value.trim();
  S.url=raw; store.set('url',raw);
  const t=parseTarget(raw);
  stopAll(); const gen=GEN;
  if(!t){ setStatus('Paste a Twitch or YouTube link first.',true); return; }
  if(t.p==='twitch'){ startVideo('twitch',t.id,gen,t.id); return startTwitch(t.id,gen); }
  if(t.p==='youtube'){
    const key=$('key').value.trim(); S.key=key; store.set('key',key);
    if(!key){ setStatus('YouTube needs an API key. Add one below.',true); $('keyWrap').classList.remove('hidden'); return; }
    startVideo('youtube',t.id,gen,'YouTube Live'); return startYouTube(t.id,key,gen);
  }
  if(t.p==='yt-noid') return setStatus('Use the stream\'s watch link (youtube.com/watch?v=…), not a channel link.',true);
  if(t.p==='kick') return setStatus('Kick chat can\'t be read from a browser page. Twitch and YouTube work.',true);
  setStatus('That doesn\'t look like a Twitch or YouTube link.',true);
}

/* ---------- UI ---------- */
function applyLayout(){
  document.body.dataset.bg=S.bg; document.body.dataset.pos=S.pos;
  document.documentElement.style.setProperty('--pw', S.bg==='normal'?'100%':S.width+'%');
  $('greenOpts').classList.toggle('hidden',S.bg==='normal');
  rerenderAll();
}
function toggleFull(){
  const el=document.documentElement;
  if(document.fullscreenElement){ document.exitFullscreen(); return; }
  if(el.requestFullscreen){ el.requestFullscreen().catch(()=>{}); }
  else if(el.webkitRequestFullscreen){ el.webkitRequestFullscreen(); }
  else setStatus('This phone browser has no fullscreen. Tap Share > Add to Home Screen for a fullscreen view.',true);
}
function toggleGreen(){
  if(S.bg==='green'){ S.bg='normal'; if(document.fullscreenElement) document.exitFullscreen(); }
  else { S.bg='green'; if(!document.fullscreenElement) toggleFull(); }
  if(!document.documentElement.requestFullscreen&&!document.documentElement.webkitRequestFullscreen) document.body.classList.remove('open');
  $('bg').value=S.bg; store.set('bg',S.bg); applyLayout();
}
function togglePanel(){
  const open=!document.body.classList.contains('open');
  document.body.classList.toggle('open',open); $('gear').setAttribute('aria-expanded',open);
}
$('gear').onclick=togglePanel;
$('connect').onclick=connect;
$('demo').onclick=()=>{ stopAll(); startDemo(GEN); };
$('full').onclick=toggleFull;
$('green').onclick=toggleGreen;
$('svid').onchange=e=>{ S.video=e.target.checked; store.set('video',S.video?'1':'0'); if(S.video&&S.url&&!cur) connect(); else if(!S.video) clearVideo(); };
$('bg').onchange=e=>{ S.bg=e.target.value; store.set('bg',S.bg); applyLayout(); };
$('pos').onchange=e=>{ S.pos=e.target.value; store.set('pos',S.pos); applyLayout(); };
$('zoom').oninput=e=>{ S.zoom=parseFloat(e.target.value); store.set('zoom',S.zoom); rerenderAll(); };
$('width').oninput=e=>{ S.width=parseFloat(e.target.value); store.set('width',S.width); applyLayout(); };
$('url').addEventListener('input',()=>{ const t=parseTarget($('url').value); $('keyWrap').classList.toggle('hidden',!(t&&t.p==='youtube')); });
$('url').addEventListener('keydown',e=>{ if(e.key==='Enter') connect(); });
document.addEventListener('keydown',e=>{
  if(/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const k=e.key.toLowerCase();
  if(k==='f') toggleFull(); else if(k==='g') toggleGreen(); else if(k==='s') togglePanel();
});
let idleT; const wake=()=>{ document.body.classList.remove('idle'); clearTimeout(idleT); idleT=setTimeout(()=>{ if(!/^(INPUT|SELECT)$/.test(document.activeElement.tagName)) document.body.classList.add('idle'); },3500); };
['mousemove','mousedown','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,wake,{passive:true}));
document.addEventListener('fullscreenchange',()=>setTimeout(rerenderAll,100));
if(P.get('ui')==='0') $('ui').style.display='none';

/* ---------- boot ---------- */
(async function(){
  try{
    const [big,gold,chat]=await Promise.all([loadFont('bigFont-uhd'),loadFont('goldFont-uhd'),loadFont('chatFont-uhd')]);
    fonts.big=big; fonts.gold=gold; fonts.chat=chat;
    fonts.bigMod={img:tint(big.img,MOD_NAME_TINT),d:big.d};
    fonts.chatMod={img:tint(chat.img,MOD_TEXT_TINT),d:chat.d};
    fonts.chatOwner={img:tint(chat.img,OWNER_TEXT_TINT),d:chat.d};
    fonts.chatDim={img:tint(chat.img,TIME_TINT),d:chat.d};
    fonts.ready=true;
  }catch(e){
    document.body.classList.add('open');
    setStatus('Could not load the font files ('+e.message+'). Open this from a web address, not by double-clicking the file.',true); return;
  }
  $('svid').checked=S.video; $('url').value=S.url; $('key').value=S.key; $('bg').value=S.bg; $('pos').value=S.pos;
  $('zoom').value=S.zoom; $('width').value=S.width;
  const t=parseTarget(S.url); $('keyWrap').classList.toggle('hidden',!(t&&t.p==='youtube'));
  applyLayout(); wake();
  if(S.url && t && t.p!=='bad') connect();
  else { document.body.classList.add('open'); startDemo(GEN); setStatus('Showing demo messages. Paste a stream link and press Connect.'); }
})();
