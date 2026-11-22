'use strict';

// A shared ground material for both renderers. Distorted cell borders form branching
// fractures, with a dark basin, exposed strata and surviving moss at the broken lip.
function makeCraterMap(){
  const size=160,pixels=new Uint8Array(size*size*4),cells=[];
  const noise=n=>{const v=Math.sin(n*127.1+31.7)*43758.5453;return v-Math.floor(v);};
  for(let i=0;i<90;i++){
    const a=i*2.39996,r=Math.sqrt((i+.4)/90)*1.17;
    cells.push([Math.cos(a)*r+.065*(noise(i)-.5),Math.sin(a)*r+.065*(noise(i+91)-.5)]);
  }
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){
    const x=(col+.5)*2/size-1,z=(row+.5)*2/size-1,a=Math.atan2(z,x);
    const d=Math.hypot(x,z)*(1+.09*Math.sin(5*a)+.045*Math.cos(9*a));
    if(d>1.09)continue;
    const u=x+.036*Math.sin(8*z+2*x)+.016*Math.cos(24*z);
    const v=z+.041*Math.cos(9*x-z)+.012*Math.sin(27*x+z);
    let first=8,next=8,cell=0;
    for(let i=0;i<cells.length;i++){
      const dx=u-cells[i][0],dz=v-cells[i][1],dist=dx*dx+dz*dz;
      if(dist<first){next=first;first=dist;cell=i;}else if(dist<next)next=dist;
    }
    const gap=Math.sqrt(next)-Math.sqrt(first),grain=noise(row*size+col);
    const edge=.78+.09*noise(cell),rim=d>edge;
    const fissure=gap<.016+.007*grain;
    const exposure=(1-d)*24,shade=Math.round((noise(cell+5)*18+grain*10+exposure)*.65);
    let color;
    if(fissure&&d<.82&&noise(cell+16)>.38)color=gap<.007?[244,153,66]:[169,77,46];
    else if(fissure)color=[39,32,38];
    else if(rim)color=noise(cell+13)>.57?[99,91,65]:[101,78,64];
    else if(d>.52)color=[83,62,59];
    else color=[40,36,45];
    const chip=gap<.037&&!fissure?18:0;
    const p=(row*size+col)*4;
    for(let j=0;j<3;j++)pixels[p+j]=Math.min(255,color[j]+shade+chip);
    pixels[p+3]=255*Math.max(0,Math.min(1,(1.03+.055*noise(cell)-d)*13));
  }
  return {size,pixels};
}

// Paint an animated pixel sprite once per phase, then project it at the target's scale.
function createImpactArt(ctx,screen,floor,reducedMotion){
  const {sin,cos,PI,hypot}=Math,tau=2*PI,frames=[];
  const flame=['#9d3032','#d54225','#f26723','#ff962b','#ffd557','#fff3a7'];
  const basalt=['#252535','#36303c','#49343c','#654541','#875744','#b76f48'];
  const seeds=Array.from({length:27},(_,i)=>[1.16*sin(i*32.71),1.14*cos(i*14.62),sin(i*8.17)]);
  const limit=v=>Math.max(0,Math.min(1,v));
  function polygon(points,color){
    ctx.fillStyle=color;ctx.beginPath();
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();ctx.fill();
  }
  function meteorFrame(index){
    if(frames[index])return frames[index];
    const sprite=document.createElement('canvas');sprite.width=128;sprite.height=176;
    const pen=sprite.getContext('2d'),phase=tau*index/16;
    const palette=[...flame,...basalt].map(hex=>parseInt(hex.slice(1),16));
    const pixels=pen.createImageData(sprite.width,sprite.height);
    for(let py=0;py<sprite.height;py++)for(let px=0;px<sprite.width;px++){
      const x=(px-64)/37,y=(py-123)/37,a=Math.atan2(y,x);
      const edge=.97+.048*sin(5*a+.6)+.035*cos(8*a);
      const d=hypot(x,y),rise=Math.max(0,-y);
      const curl=.5*sin(8*x+3*y+phase)+.29*sin(15*x-2*y-phase)+.21*cos(5*x+7*y+phase);
      const width=1.16-.33*rise+.14*curl;
      const heat=Math.max(1.32-d+.13*curl,
        y<0?width-Math.abs(x+.09*sin(y*4+phase))-.27:0);
      let shade;
      if(d<edge){
        const nx=x/edge,ny=y/edge,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
        let first=10,second=10,plate=0;
        for(let i=0;i<seeds.length;i++){
          const [sx,sy,sz]=seeds[i],dist=(nx-sx)**2+(ny-sy)**2+(nz-sz)**2;
          if(dist<first){second=first;first=dist;plate=i;}else if(dist<second)second=dist;
        }
        const grit=sin(35*x+19*y)*cos(29*y-8*x);
        const fissure=second-first+.016*sin(17*x+4*y)+.012*grit;
        const pits=Math.max(0,cos(15*nx+4*nz)*sin(19*ny-7*nz)-.53);
        const light=.30+.35*ny-.30*nx+.23*nz+.16*sin(plate*8.4)+.09*grit-pits*.62;
        shade=fissure<.013?4:fissure<.043?2:d>edge-.052?3:6+Math.min(5,Math.floor(limit(light)*6));
      }else if(heat>.045){
        const intensity=heat+.10*curl+(y>-.5?.15:0);
        shade=intensity>.53?5:intensity>.39?4:intensity>.28?3:intensity>.18?2:intensity>.10?1:0;
      }else continue;
      const color=palette[shade],p=(py*sprite.width+px)*4;
      pixels.data[p]=color>>16;pixels.data[p+1]=(color>>8)&255;pixels.data[p+2]=color&255;pixels.data[p+3]=255;
    }
    pen.putImageData(pixels,0,0);frames[index]=sprite;return sprite;
  }
  function groundPoint(x,z,r,a,h=0){
    const px=x+cos(a)*r,pz=z+sin(a)*r;
    return screen(px,floor(px,pz)+.09+h,pz);
  }
  function disc(x,z,r,color){
    polygon(Array.from({length:32},(_,i)=>groundPoint(x,z,r,i*tau/32)),color);
  }
  function stone(px,py,w,h,tilt,hot){
    const tip=[px+w*tilt,py-h],top=[px+w*(tilt-.28),py-h*.90];
    const left=[px-w*.57,py-h*.18],base=[px-w*.19,py],right=[px+w*.62,py-h*.15];
    const ridge=[px+w*.05,py-h*.57];
    polygon([top,tip,ridge,base,left],hot?'#ad6446':'#99744a');
    polygon([tip,right,base,ridge],hot?'#563846':'#51484b');
    polygon([top,tip,ridge,left],hot?'#e9a060':'#e1b375');
  }
  function falling(x,z,u,clock){
    const [gx,gy,k]=groundPoint(x,z,0,0),r=k*3.15;
    if(!(k>0))return;
    const endY=gy-r*.77,startY=Math.min(endY-r,.32*r),distance=endY-startY;
    const travel=u*(.34+.66*u);
    const startX=Math.max(r*.4,Math.min(ctx.canvas.width-r*.4,gx-distance*.28));
    const cy=startY+distance*travel,cx=startX+(gx-startX)*travel;
    ctx.save();
    disc(x,z,1.2+u*2,'rgba(66,26,37,.45)');
    const halo=ctx.createRadialGradient(cx,cy,r*.60,cx,cy,r*1.68);
    halo.addColorStop(0,'#ffbd5459');halo.addColorStop(1,'#ff792000');
    ctx.fillStyle=halo;ctx.fillRect(cx-r*1.7,cy-r*1.7,r*3.4,r*3.4);
    ctx.translate(cx,cy);ctx.rotate(-.27);ctx.imageSmoothingEnabled=false;
    const sprite=meteorFrame(reducedMotion.matches?0:Math.floor(clock*12)%16);
    ctx.drawImage(sprite,-64*r/37,-123*r/37,sprite.width*r/37,sprite.height*r/37);
    for(let i=0;i<(reducedMotion.matches?4:18);i++){
      const t=(clock*.62+i*.618)%1,side=i%2?1:-1;
      const sx=side*r*(.78+.42*sin(i*14+t*2)),sy=-r*(.45+t*3);
      ctx.fillStyle=i%3?'#ffb343':'#ff7233';const w=r*.045*(1-t)+1;
      ctx.fillRect(sx,sy,w,w*(1+t*3));
    }
    ctx.restore();
    return true;
  }
  // Flat colour bands and clipped pixel edges match the falling rock's sprite.
  const fireStamps=[];
  function fireStamp(index){
    if(fireStamps[index])return fireStamps[index];
    const sprite=document.createElement('canvas');sprite.width=sprite.height=40;
    const pen=sprite.getContext('2d'),img=pen.createImageData(40,40);
    const shades=[[142,43,47],[191,49,43],[226,65,41],[245,97,46],[255,154,71],[255,207,120]];
    for(let row=0;row<40;row++)for(let col=0;col<40;col++){
      const x=(col-20)/17,y=(row-20)/17,a=Math.atan2(y,x);
      const rim=.87+.09*sin(5*a+index)+.08*cos(3*a-index*.8);
      if(hypot(x,y)>rim)continue;
      const heat=1-hypot(x+.13,y-.38)+.075*sin(9*x+index)*cos(8*y);
      const rgb=shades[Math.min(5,Math.max(0,Math.floor(heat*6)))],p=(row*40+col)*4;
      img.data.set([...rgb,255],p);
    }
    pen.putImageData(img,0,0);fireStamps[index]=sprite;return sprite;
  }
  function fireBurst(x,z,age){
    if(age>=.86)return;
    ctx.save();
    const t=age/.86,spread=1-(1-t)**3,count=reducedMotion.matches?5:10;
    for(let i=0;i<count+1;i++){
      const core=i===count,a=i*tau/count+.22,r=core?0:(.42+2.02*spread)*(.9+.12*cos(i*4));
      const lift=core?1.02+1.55*spread:.57+spread*(.75+.39*sin(i*2.4));
      const [sx,sy,k]=groundPoint(x,z,r,a,lift),size=k*(core?2.15:1.18)*(1+.55*Math.sin(t*PI))*(1-.57*t);
      ctx.globalAlpha=(reducedMotion.matches?.65:.91)*(1-t*t);
      ctx.drawImage(fireStamp(i%4),sx-size*.5,sy-size*.60,size,size*1.12);
    }
    ctx.restore();
  }
  const dustSprites=[];
  function dustSprite(i){
    if(dustSprites[i])return dustSprites[i];
    const sprite=document.createElement('canvas');sprite.width=sprite.height=48;
    const pen=sprite.getContext('2d'),img=pen.createImageData(48,48);
    // Each stamp has overlapping, separately lit lobes and a ragged silhouette.
    for(let row=0;row<48;row++)for(let col=0;col<48;col++){
      const x=(col-24)/23,y=(row-24)/23;
      let surface=-1,light=0;
      for(let j=0;j<6;j++){
        const a=j*2.4+i*.82,r=j===0?.66:.43+.08*cos(j*3+i);
        const dx=(x-(j?.46*cos(a):0))/r,dy=(y-(j?.39*sin(a):0))/r;
        const z=1-dx*dx-dy*dy;
        if(z<=0)continue;
        const height=Math.sqrt(z)*r+.07*cos(j*4+i);
        if(height>surface){surface=height;light=.48-.23*dx-.39*dy+.12*z;}
      }
      if(surface<0)continue;
      const p=(row*48+col)*4,shade=Math.min(4,Math.max(0,Math.floor(light*5+.3*sin(col*4+row))));
      const rgb=[[71,62,65],[102,83,77],[139,109,89],[171,140,108],[204,176,135]][shade];
      img.data[p]=rgb[0];img.data[p+1]=rgb[1];img.data[p+2]=rgb[2];
      img.data[p+3]=230*Math.min(1,surface*8+.2);
    }
    pen.putImageData(img,0,0);dustSprites[i]=sprite;return sprite;
  }
  function slab(px,py,k,i,t,size){
    ctx.save();ctx.translate(px,py);ctx.rotate(sin(i*2.1)*.48+t*(i%2?1:-1)*1.7);
    const w=k*size,h=w*(.43+.12*cos(i));
    ctx.scale(w,h);
    polygon([[-.97,-.16],[-.53,-.88],[.45,-.64],[1,-.11],[.24,.29],[-.54,.26]],i%4===0?'#888960':'#b69879');
    polygon([[-.97,-.16],[-.54,.26],[.24,.29],[.14,1],[-.63,.78]],'#74594f');
    polygon([[.24,.29],[1,-.11],[.83,.59],[.14,1]],'#48404a');
    polygon([[-.85,-.16],[-.53,-.78],[.41,-.61],[-.32,-.58]],'#d2b995');
    ctx.restore();
  }
  const fragments=Array.from({length:36},(_,i)=>({
    a:i*2.399+.3*sin(i*2),delay:.12*(.5+.5*cos(i*8)),flight:.69+(i%7)*.115,
    reach:2.1+(i%9)*.41,peak:.94+(i%6)*.66,size:.12+(i%7)*.075
  }));
  function dustWall(x,z,age){
    const count=reducedMotion.matches?9:21;
    for(let i=0;i<count;i++){
      const t=(age-.13-.19*(.5+.5*sin(i*4)))/(1.15+(i%4)*.21);
      if(t<=0||t>=1)continue;
      const a=i*tau/count+.11*sin(i*5),r=1.15+(2.6+.86*sin(i*7))*(1-(1-t)**3);
      const [px,py,k]=groundPoint(x,z,r,a,.34+(.48+i%3*.17)*t);
      const s=k*(.45+Math.sqrt(t)*(.8+(i%4)*.14));
      ctx.globalAlpha=.78*Math.min(1,t*7)*(1-t)**1.2;
      ctx.drawImage(dustSprite(i%5),px-s,py-s*1.20,2*s,1.75*s);
    }
  }
  function impact(x,z,age){
    if(age<0||age>2.4)return;
    const [cx,cy,k]=groundPoint(x,z,0,0);if(k<=0)return;
    ctx.save();ctx.imageSmoothingEnabled=false;
    const wave=limit(age/.56),radius=5.3*(1-(1-wave)**2);
    if(wave<1){
      ctx.globalAlpha=(1-wave)*.92;
      for(let i=0;i<28;i++){
        const a=i*tau/28,b=a+.20,outer=radius*(1+.035*cos(i*1.7));
        polygon([groundPoint(x,z,outer,a),groundPoint(x,z,outer,b),
          groundPoint(x,z,outer-.24*(1-wave),b),groundPoint(x,z,outer-.26*(1-wave),a)],'#ffda8b');
      }
      const flash=Math.max(1,k*2.25*(1-wave));
      const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,flash);
      glow.addColorStop(0,'#ffefbd');glow.addColorStop(.38,'#ffad53a8');glow.addColorStop(1,'#e65f1900');
      ctx.fillStyle=glow;ctx.fillRect(cx-flash,cy-flash,flash*2,flash*2);
    }
    fireBurst(x,z,age);
    dustWall(x,z,age);
    const count=reducedMotion.matches?12:fragments.length;
    for(let i=0;i<count;i++){
      const f=fragments[i],t=(age-f.delay)/f.flight;
      if(t<0||t>1.72)continue;
      const bounce=limit((t-1)/.4);
      const h=t<1?4*t*(1-t)*f.peak:4*bounce*(1-bounce)*f.peak*.14;
      const r=.58+f.reach*(t<1?1-(1-t)**1.45:1+.11*bounce);
      const [px,py,scale]=groundPoint(x,z,r,f.a,h);
      ctx.globalAlpha=limit((1.72-t)*4);
      slab(px,py,scale,i,Math.min(t,1.4),f.size);
    }
    if(!reducedMotion.matches){
      for(let i=0;i<28;i++){
        const t=(age-.02*(i%5))/(.58+.05*(i%9));if(t<0||t>=1)continue;
        const a=i*2.4+.34,d=(2.6+i%5*.49)*t,h=(1.7+i%6*.63)*4*t*(1-t);
        const p=groundPoint(x,z,d,a,h),q=groundPoint(x,z,Math.max(0,d-.16),a,h-.14+.3*t);
        ctx.globalAlpha=1-t;ctx.lineWidth=Math.max(1,p[2]*.044);ctx.strokeStyle=i%3?'#ffd995':'#ff9858';
        ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(p[0],p[1]);ctx.stroke();
      }
    }
    ctx.restore();
  }
  return {falling,impact,stone,disc};
}
