/* TMC GRV — Check head office GRV (v14). Reads ONLY this app's own grv_ data. No Purchases data, no PO linking. */
(function(G){
const HO={};
const N=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
// 1) merge pdf.js text fragments into line segments
HO.segments=function(items){
  const rows=[];items.filter(i=>String(i.s).trim()!==""||i.s===" ").sort((a,b)=>a.p-b.p||a.y-b.y||a.x-b.x).forEach(i=>{
    let r=rows.find(r=>r.p===i.p&&Math.abs(r.y-i.y)<2.5);if(!r)rows.push(r={p:i.p,y:i.y,it:[]});r.it.push(i)});
  const segs=[];rows.forEach(r=>{r.it.sort((a,b)=>a.x-b.x);let cur=null;
    r.it.forEach(i=>{const s=String(i.s);if(cur){const gap=i.x-(cur.x+cur.w);
      if(gap<7){cur.s+=(gap>1.2&&!/^[-,.)]/.test(s)&&!/[-(\/]$/.test(cur.s)?" ":"")+s;cur.w=i.x+i.w-cur.x;return}segs.push(cur)}
      cur={p:r.p,y:r.y,x:i.x,w:i.w||s.length*5,s}});if(cur)segs.push(cur)});
  segs.forEach(s=>s.s=s.s.replace(/\s+/g," ").trim());return segs.filter(s=>s.s);
};
const CODE=/^[A-Z]{2,6}[- ]?\d{2,}[A-Z0-9]*$/;
const QTY=/^(\d+(?:[.,]\d+)?)\s*([A-Za-z]{0,10})$/;
// 2) parse a Goods Receipt Voucher
HO.parse=function(items){
  const sg=HO.segments(items),out={date:"",no:"",lines:[]};
  const lab=(re)=>sg.find(s=>re.test(s.s));
  const dl=lab(/^GRV Date$/i);if(dl){const v=sg.filter(s=>s.p===dl.p&&Math.abs(s.y-dl.y)<3&&s.x>dl.x).sort((a,b)=>a.x-b.x)[0];if(v&&/\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}/.test(v.s))out.date=v.s}
  const nl=lab(/^GRV (Number|No\.?)$/i);if(nl){const v=sg.filter(s=>s.p===nl.p&&Math.abs(s.y-nl.y)<3&&s.x>nl.x).sort((a,b)=>a.x-b.x)[0];if(v&&!/date|grv/i.test(v.s)&&/\d/.test(v.s))out.no=v.s}
  const H={};["Item","PO Number","Description","Quantity","Supplier","Accepted By"].forEach(k=>{const s=sg.find(x=>x.s.toLowerCase()===k.toLowerCase());if(s)H[k]=s});
  const hy=H.Description?H.Description.y:H.Quantity?H.Quantity.y:0,hp=(H.Description||H.Quantity||{p:1}).p;
  const qx=H.Quantity?H.Quantity.x:null,sx=H.Supplier?H.Supplier.x:null,ax=H["Accepted By"]?H["Accepted By"].x:1e9;
  const Y=s=>s.p*1e5+s.y,startY=hp*1e5+hy;
  const body=sg.filter(s=>Y(s)>startY+3);
  const stop=body.find(s=>/^(Store Manager|Notes:?|Received By Signature|Total)$/i.test(s.s));const endY=stop?Y(stop):1e12;
  const B=body.filter(s=>Y(s)<endY);
  // anchors: ref code segments in the left part of the table; a split code like "1","3" -> handled by segment merge
  const codeMaxX=qx?qx-60:350;
  const anchors=B.filter(s=>CODE.test(s.s.replace(/\s+/g,""))&&s.x<codeMaxX).sort((a,b)=>Y(a)-Y(b));
  if(!anchors.length)return out;
  const descX=Math.min(...B.filter(s=>anchors.some(a=>Math.abs(Y(a)-Y(s))<3&&s.x>a.x+a.w+5)&&(!qx||s.x<qx-25)).map(s=>s.x).concat([1e9]));
  anchors.forEach((a,i)=>{const y0=Y(a)-3,y1=i+1<anchors.length?Y(anchors[i+1])-3:endY;
    const R=B.filter(s=>Y(s)>=y0&&Y(s)<y1&&s!==a);
    const no=(R.find(s=>s.x<a.x&&Math.abs(Y(s)-Y(a))<3&&/^\d+$/.test(s.s))||{}).s||String(i+1);
    const isQ=s=>qx!=null?(s.x>=qx-40&&s.x<qx+60&&QTY.test(s.s)):QTY.test(s.s);
    const q=R.filter(isQ)[0];
    const isSup=s=>s!==q&&s.x<ax-5&&(sx!=null?s.x>=(qx!=null?qx+45:sx-40):false);
    const isDesc=s=>s!==q&&!isSup(s)&&s.x>a.x+a.w&&s.x>=descX-2&&s.x<ax;
    const byY=(f)=>R.filter(f).sort((p,r)=>Y(p)-Y(r)||p.x-r.x).map(s=>s.s);
    const join=arr=>arr.reduce((t,s)=>t?(/[-\/]$/.test(t)?t+s:t+" "+s):s,"").replace(/\s+([,.)])/g,"$1").trim();
    let qty=null,unit="";if(q){const m=q.s.match(QTY);qty=+m[1].replace(",",".");unit=m[2]||""}
    out.lines.push({no,code:a.s.replace(/\s+/g,""),desc:join(byY(isDesc)),qty,unit,sup:join(byY(isSup))})});
  return out;
};
// 3) fuzzy match
const STOP=new Set("and or of the as per for with to a an in on x".split(" "));
const toks=s=>N(s).split(" ").filter(w=>w&&!STOP.has(w)).map(w=>w.length>3?w.replace(/(es|s)$/,""):w);
HO.sim=function(a,b){const A=toks(a),B=toks(b);if(!A.length||!B.length)return 0;let hit=0;const used=new Set();
  A.forEach(w=>{const j=B.findIndex((v,k)=>!used.has(k)&&(v===w||(w.length>3&&v.length>3&&(v.startsWith(w)||w.startsWith(v)))));if(j>=0){used.add(j);hit++}});
  return 2*hit/(A.length+B.length)};
const pd=s=>{s=String(s||"");let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(+m[1],m[2]-1,+m[3]);m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);return m?new Date(+m[3],m[2]-1,+m[1]):null};
HO.pd=pd;
// app lines from THIS app's own GRVs only (db.grv)
HO.appLines=function(grvs){const L=[];Object.entries(grvs||{}).forEach(([id,g])=>{(g.lines||[]).forEach((l,i)=>{if(!l||!String(l.item||"").trim())return;L.push({gid:id,gno:g.no||g.ref||"",date:g.date||"",sup:g.sup||"",item:l.item,qty:+(l.rec||0),unit:l.unit||"",ord:+(l.ord||0)})})});return L};
HO.compare=function(ho,grvs,opt){opt=opt||{};const win=opt.days==null?14:opt.days,hd=pd(ho.date);
  const inWin=l=>{if(!hd)return true;const d=pd(l.date);return !d||Math.abs(d-hd)<=win*864e5};
  const app=HO.appLines(grvs),pairs=[];
  ho.lines.forEach((h,i)=>app.forEach((a,j)=>{const ds=HO.sim(h.desc,a.item);if(ds<0.34)return;const ss=h.sup&&a.sup?HO.sim(h.sup,a.sup):0;
    let sc=ds+0.35*ss+(inWin(a)?0.1:0);if(h.qty!=null&&Math.abs(h.qty-a.qty)<1e-9)sc+=0.05;if(ss===0&&ds<0.5)return;pairs.push({i,j,sc})}));
  pairs.sort((a,b)=>b.sc-a.sc);const ui=new Map(),uj=new Set();pairs.forEach(p=>{if(ui.has(p.i)||uj.has(p.j))return;ui.set(p.i,p.j);uj.add(p.j)});
  const rows=ho.lines.map((h,i)=>{if(!ui.has(i))return{st:"miss",h};const a=app[ui.get(i)];return{st:h.qty!=null&&Math.abs(h.qty-a.qty)<1e-9?"ok":"diff",h,a}});
  const extra=app.filter((a,j)=>!uj.has(j)&&inWin(a)&&(!hd||pd(a.date)));
  return{rows,extra,n:{ok:rows.filter(r=>r.st==="ok").length,diff:rows.filter(r=>r.st==="diff").length,miss:rows.filter(r=>r.st==="miss").length,extra:extra.length}}};
// 4) in-browser PDF text extraction (pdf.js bundled in lib/, works offline)
HO.loadPdfJs=function(){if(G.pdfjsLib)return Promise.resolve(G.pdfjsLib);return new Promise((ok,no)=>{const s=document.createElement("script");s.src="lib/pdf.min.js?v=14";s.onload=()=>{G.pdfjsLib.GlobalWorkerOptions.workerSrc="lib/pdf.worker.min.js?v=14";ok(G.pdfjsLib)};s.onerror=no;document.head.appendChild(s)})};
HO.readPdf=async function(buf){const lib=await HO.loadPdfJs();const d=await lib.getDocument({data:new Uint8Array(buf)}).promise,out=[];
  for(let p=1;p<=d.numPages;p++){const pg=await d.getPage(p),vp=pg.getViewport({scale:1}),tc=await pg.getTextContent();tc.items.forEach(i=>{if(i.str&&i.str.trim())out.push({p,s:i.str,w:i.width,x:i.transform[4],y:vp.height-i.transform[5]})})}return out};
if(typeof module!=="undefined")module.exports=HO;else G.HO=HO;
})(typeof window!=="undefined"?window:globalThis);
