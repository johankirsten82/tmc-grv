/* TMC bundled QR generator — works offline, no CDN.
   Byte mode, versions 1–16, error-correction M (ISO/IEC 18004 tables).
   window.TMCQR.matrix(text) → 0/1 row array; window.TMCQR.draw(canvas, text) paints it. */
(function(root){
  "use strict";
  var EXP=[],LOG=[];
  (function(){
    var x=1;
    for(var i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x=x<<1;if(x&0x100)x^=0x11D}
    EXP[255]=EXP[0];
  })();
  function gmul(a,b){return (a&&b)?EXP[(LOG[a]+LOG[b])%255]:0}
  function rsGen(n){
    var g=[1];
    for(var i=0;i<n;i++){
      var ng=new Array(g.length+1);ng[0]=g[0];
      for(var j=1;j<g.length;j++)ng[j]=g[j]^gmul(g[j-1],EXP[i]);
      ng[g.length]=gmul(g[g.length-1],EXP[i]);g=ng;
    }
    return g;
  }
  function rsEnc(data,n){
    var g=rsGen(n),r=new Array(n);for(var i=0;i<n;i++)r[i]=0;
    for(i=0;i<data.length;i++){
      var f=data[i]^r[0];
      for(var j=0;j<n-1;j++)r[j]=r[j+1]^gmul(g[j+1],f);
      r[n-1]=gmul(g[n],f);
    }
    return r;
  }
  /* Level M block groups: [n1, total1, data1, n2, total2, data2?] per version 1..16 */
  var BLK={
    1:[1,26,16],2:[1,44,28],3:[1,70,44],4:[2,50,32],5:[2,67,43],
    6:[4,43,27],7:[4,49,31],8:[2,60,38,2,61,39],9:[3,58,36,2,59,37],
    10:[4,69,43,1,70,44],11:[1,80,50,4,81,51],12:[6,58,36,2,59,37],
    13:[8,59,37,1,60,38],14:[4,64,40,5,65,41],15:[5,65,41,5,66,42],
    16:[7,73,45,3,74,46]
  };
  var ALIGN={
    2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],
    9:[6,26,46],10:[6,28,50],11:[6,30,54],12:[6,32,58],13:[6,34,62],
    14:[6,26,46,66],15:[6,26,48,70],16:[6,26,50,74]
  };
  var REM={1:0,2:7,3:7,4:7,5:7,6:7,7:0,8:0,9:0,10:0,11:0,12:0,13:0,14:3,15:3,16:3};
  function cap(v){
    var b=BLK[v],n=0;
    for(var i=0;i<b.length;i+=3)n+=b[i]*b[i+2];
    var cc=v<=9?8:16;
    return (n*8-4-cc)>>3;
  }
  function choose(len){
    for(var v=1;v<=16;v++)if(cap(v)>=len)return v;
    throw new Error("QR text too long");
  }
  function bitsToBytes(bits){
    var out=[];
    for(var i=0;i<bits.length;i+=8){
      var x=0;
      for(var j=0;j<8;j++)x=(x<<1)|((bits[i+j]||0)&1);
      out.push(x);
    }
    return out;
  }
  function pushBits(arr,val,n){for(var i=n-1;i>=0;i--)arr.push((val>>i)&1)}
  function dataBits(text,v){
    var bytes=[];
    for(var i=0;i<text.length;i++){
      var c=text.charCodeAt(i);
      if(c>255){
        var u=unescape(encodeURIComponent(text));
        bytes=[];for(var k=0;k<u.length;k++)bytes.push(u.charCodeAt(k)&255);
        break;
      }
      bytes.push(c);
    }
    if(bytes.length>cap(v))throw new Error("QR text too long");
    var bits=[],cc=v<=9?8:16,need=0;
    var b=BLK[v];
    for(i=0;i<b.length;i+=3)need+=b[i]*b[i+2]*8;
    pushBits(bits,4,4);pushBits(bits,bytes.length,cc);
    for(i=0;i<bytes.length;i++)pushBits(bits,bytes[i],8);
    var term=Math.min(4,need-bits.length);
    for(i=0;i<term;i++)bits.push(0);
    while(bits.length%8)bits.push(0);
    var pads=[0xEC,0x11],p=0;
    while(bits.length<need){pushBits(bits,pads[p%2],8);p++}
    return bitsToBytes(bits);
  }
  function blocksOf(v){
    var b=BLK[v],out=[];
    for(var i=0;i<b.length;i+=3){
      for(var n=0;n<b[i];n++)out.push({t:b[i+1],d:b[i+2]});
    }
    return out;
  }
  function interleave(data,v){
    var bs=blocksOf(v),parts=[],pos=0;
    for(var i=0;i<bs.length;i++){
      var d=data.slice(pos,pos+bs[i].d);pos+=bs[i].d;
      parts.push({d:d,e:rsEnc(d,bs[i].t-bs[i].d)});
    }
    var out=[],md=0,me=0;
    for(i=0;i<parts.length;i++){if(parts[i].d.length>md)md=parts[i].d.length;if(parts[i].e.length>me)me=parts[i].e.length}
    for(var j=0;j<md;j++)for(i=0;i<parts.length;i++)if(j<parts[i].d.length)out.push(parts[i].d[j]);
    for(j=0;j<me;j++)for(i=0;i<parts.length;i++)if(j<parts[i].e.length)out.push(parts[i].e[j]);
    return out;
  }
  function setFinder(m,x,y){
    for(var r=-1;r<=7;r++)for(var c=-1;c<=7;c++){
      var rr=y+r,cc=x+c;if(rr<0||cc<0||rr>=m.length||cc>=m.length)continue;
      var on=r>=0&&r<=6&&c>=0&&c<=6&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4));
      m[rr][cc]=on?2:3; /* 2=black func, 3=white func */
    }
  }
  function setAlign(m,x,y){
    for(var r=-2;r<=2;r++)for(var c=-2;c<=2;c++){
      var on=r===-2||r===2||c===-2||c===2||(r===0&&c===0);
      m[y+r][x+c]=on?2:3;
    }
  }
  function reserved(m,r,c){return m[r][c]===2||m[r][c]===3}
  function formatBits(mask){
    /* M = 00, 5-bit data, BCH 10, xor 0x5412 */
    var data=mask,d=data<<10,gen=0x537;
    for(var i=14;i>=10;i--)if((d>>>i)&1)d^=gen<<(i-10);
    return (data<<10|d)^0x5412;
  }
  function versionBits(v){
    var data=v<<12,d=data,gen=0x1F25;
    for(var i=17;i>=12;i--)if((d>>>i)&1)d^=gen<<(i-12);
    return data|(d&4095);
  }
  function placeFormat(m,bits){
    var n=m.length;
    for(var i=0;i<15;i++){
      var bit=(bits>>(14-i))&1,val=bit?2:3;
      /* horizontal near top-left + copy at bottom-left */
      if(i<6)m[8][i]=val;else if(i<8)m[8][i+1]=val;
      if(i>=7)m[8][n-15+i]=val; /* 8 bits on the right, including (8, n-8) = bit 7 */
      /* vertical near top-left + copy at top-right */
      if(i<8)m[n-1-i][8]=val;else if(i<9)m[15-i][8]=val;else m[14-i][8]=val;
    }
    m[n-8][8]=2; /* dark module */
  }
  function placeVersion(m,v){
    if(v<7)return;
    var bits=versionBits(v),n=m.length,k=0;
    for(var r=0;r<6;r++)for(var c=0;c<3;c++,k++){
      var bit=(bits>>k)&1,val=bit?2:3;
      m[r][n-11+c]=val;m[n-11+c][r]=val;
    }
  }
  function maskFn(id){
    return [
      function(r,c){return ((r+c)&1)===0},
      function(r,c){return (r&1)===0},
      function(r,c){return c%3===0},
      function(r,c){return (r+c)%3===0},
      function(r,c){return (((r>>1)+(Math.floor(c/3)))&1)===0},
      function(r,c){return (r*c)%2+(r*c)%3===0},
      function(r,c){return (((r*c)%2+(r*c)%3)&1)===0},
      function(r,c){return (((r+c)%2+(r*c)%3)&1)===0}
    ][id];
  }
  function buildFunc(v){
    var n=17+4*v,m=[];
    for(var r=0;r<n;r++){m[r]=[];for(var c=0;c<n;c++)m[r][c]=0}
    setFinder(m,0,0);setFinder(m,n-7,0);setFinder(m,0,n-7);
    /* timing */
    for(var i=8;i<n-8;i++){m[6][i]=(i&1)===0?2:3;m[i][6]=(i&1)===0?2:3}
    var ap=ALIGN[v]||[];
    for(var a=0;a<ap.length;a++)for(var b=0;b<ap.length;b++){
      var x=ap[a],y=ap[b];
      if((x<9&&y<9)||(x>n-10&&y<9)||(x<9&&y>n-10))continue;
      setAlign(m,x,y);
    }
    /* format + version reserved (will be overwritten) */
    for(i=0;i<9;i++){if(i!==6){if(m[8][i]===0)m[8][i]=3;if(m[i][8]===0)m[i][8]=3}}
    for(i=0;i<8;i++){if(m[8][n-1-i]===0)m[8][n-1-i]=3;if(m[n-1-i][8]===0)m[n-1-i][8]=3}
    m[n-8][8]=2;
    if(v>=7){
      for(var rr=0;rr<6;rr++)for(var cc=0;cc<3;cc++){
        if(m[rr][n-11+cc]===0)m[rr][n-11+cc]=3;
        if(m[n-11+cc][rr]===0)m[n-11+cc][rr]=3;
      }
    }
    return m;
  }
  function placeData(base,data,v,mask){
    var m=base.map(function(row){return row.slice()});
    var n=m.length,bits=[];
    for(var i=0;i<data.length;i++)pushBits(bits,data[i],8);
    for(i=0;i<(REM[v]||0);i++)bits.push(0);
    var mf=maskFn(mask),bi=0;
    var up=true;
    for(var col=n-1;col>0;col-=2){
      if(col===6)col--;
      for(var k=0;k<n;k++){
        var row=up?n-1-k:k;
        for(var j=0;j<2;j++){
          var c=col-j;
          if(reserved(m,row,c))continue;
          var bit=bi<bits.length?bits[bi++]:0;
          if(mf(row,c))bit^=1;
          m[row][c]=bit?1:0;
        }
      }
      up=!up;
    }
    placeFormat(m,formatBits(mask));
    placeVersion(m,v);
    return m;
  }
  function to01(m){
    return m.map(function(row){return row.map(function(v){return (v===1||v===2)?1:0})});
  }
  function penalty(m){
    var n=m.length,s=0,r,c,run,k;
    function dark(x){return x===1||x===2}
    for(r=0;r<n;r++){
      run=1;
      for(c=1;c<=n;c++){
        if(c<n&&dark(m[r][c])===dark(m[r][c-1]))run++;
        else{if(run>=5)s+=run-2;run=1}
      }
    }
    for(c=0;c<n;c++){
      run=1;
      for(r=1;r<=n;r++){
        if(r<n&&dark(m[r][c])===dark(m[r-1][c]))run++;
        else{if(run>=5)s+=run-2;run=1}
      }
    }
    for(r=0;r<n-1;r++)for(c=0;c<n-1;c++){
      k=dark(m[r][c])+dark(m[r][c+1])+dark(m[r+1][c])+dark(m[r+1][c+1]);
      if(k===0||k===4)s+=3;
    }
    /* N3: 11-module ISO patterns 10111010000 or 00001011101 */
    function finderLike(line){
      var p=0,n=line.length;
      for(var i=0;i<=n-11;i++){
        var a=line[i],b=line[i+1],c=line[i+2],d=line[i+3],e=line[i+4],f=line[i+5],g=line[i+6],h=line[i+7],j=line[i+8],k=line[i+9],l=line[i+10];
        if(!b&&e&&!f&&g&&!k&&((a&&c&&d&&!h&&!j&&!l)||(!a&&!c&&!d&&h&&j&&l)))p+=40;
      }
      return p;
    }
    for(r=0;r<n;r++)s+=finderLike(m[r].map(dark));
    for(c=0;c<n;c++){
      var col=[];for(r=0;r<n;r++)col.push(dark(m[r][c]));
      s+=finderLike(col);
    }
    var darks=0;for(r=0;r<n;r++)for(c=0;c<n;c++)if(dark(m[r][c]))darks++;
    var pct=100*darks/(n*n),k5=Math.floor(Math.abs(pct-50)/5);
    s+=k5*10;
    return s;
  }
  function matrix(text){
    text=String(text==null?"":text);
    var bytesLen=unescape(encodeURIComponent(text)).length;
    var v=choose(bytesLen);
    var data=interleave(dataBits(text,v),v);
    var base=buildFunc(v),best=null,bestS=1e9;
    for(var mask=0;mask<8;mask++){
      var m=placeData(base,data,v,mask),s=penalty(m);
      if(s<bestS){bestS=s;best=m}
    }
    return to01(best);
  }
  function draw(canvas,text){
    var m=matrix(text),n=m.length;
    if(!canvas||!canvas.getContext)return m;
    var ctx=canvas.getContext("2d"),pad=4,dim=n+pad*2;
    var w=canvas.width||280,h=canvas.height||280;
    if(canvas.style){canvas.style.width="100%";canvas.style.maxWidth="86vw";canvas.style.height="auto"}
    canvas.width=w;canvas.height=h;
    ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);
    ctx.fillStyle="#000";
    var sc=Math.floor(Math.min(w,h)/dim),ox=Math.floor((w-sc*dim)/2),oy=Math.floor((h-sc*dim)/2);
    for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(m[r][c])ctx.fillRect(ox+(c+pad)*sc,oy+(r+pad)*sc,sc,sc);
    return m;
  }
    var api={matrix:matrix,draw:draw};
  root.TMCQR=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:typeof global!=="undefined"?global:this);
