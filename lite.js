'use strict';
// Orthographic depth sprites keep movement responsive on software GPUs.
// Each part retains depth, so the player can pass behind individual rocks and trees.
function liteRenderer(canvas,data,meta){
 const ctx=canvas.getContext('2d'),S=new Int16Array(data),B=new Uint8Array(data);
 const byGroup=meta.groups.map(()=>[]);
 for(let i=0;i<meta.solid;i++)byGroup[B[i*24+6]].push(i);
 const scale=30,sectors=24,turn=Math.PI*2/sectors;
 const cache=byGroup.map(()=>new Map());
 const surface=document.createElement('canvas'),surfaceCtx=surface.getContext('2d');
 const craterMap=makeCraterMap();
 let img, colors, depth;
 function bake(group,angle,pitch){
   const ids=byGroup[group],si=Math.sin(angle),co=Math.cos(angle),sp=Math.sin(pitch),cp=Math.cos(pitch);
   const upX=-si*sp,upZ=-co*sp,bx=si*cp,bz=co*cp;
   const coords=new Float32Array(ids.length*3);let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
   ids.forEach((i,k)=>{
     const j=i*12,x=S[j]/512,y=S[j+1]/512,z=S[j+2]/512;
     const u=scale*(co*x-si*z),v=-scale*(upX*x+cp*y+upZ*z);
     coords[k*3]=u;coords[k*3+1]=v;coords[k*3+2]=bx*x+sp*y+bz*z;
     l=Math.min(l,u);r=Math.max(r,u);t=Math.min(t,v);b=Math.max(b,v);
   });
   l=Math.floor(l)-9;t=Math.floor(t)-9;const w=Math.ceil(r)-l+10,h=Math.ceil(b)-t+10;
   const col=new Uint32Array(w*h),zbuf=new Int16Array(w*h).fill(-32768),f=scale*scale/32768;
   ids.forEach((i,k)=>{
     const j=i*12,q=i*24,u=coords[k*3]-l,v=coords[k*3+1]-t,z=(coords[k*3+2]*512)|0;
     const xx=S[j+6],xy=S[j+7],xz=S[j+8],yy=S[j+9],yz=S[j+10],zz=S[j+11];
     const a=Math.max(.18,.18+f*(co*co*xx-2*co*si*xz+si*si*zz));
     const c=Math.max(.18,.18+f*(upX*upX*xx+cp*cp*yy+upZ*upZ*zz+2*(upX*cp*xy+upX*upZ*xz+cp*upZ*yz)));
     let m=-f*(co*(upX*xx+cp*xy+upZ*xz)-si*(upX*xz+cp*yz+upZ*zz));
     const bound=.985*Math.sqrt(a*c);m=Math.max(-bound,Math.min(bound,m));
     const det=a*c-m*m,threshold=2*Math.log(Math.max(1,B[q+7]/48)/.48),rx=Math.sqrt(a*threshold),ry=Math.sqrt(c*threshold);
     const minX=Math.max(0,Math.ceil(u-rx)),maxX=Math.min(w-1,Math.floor(u+rx)),minY=Math.max(0,Math.ceil(v-ry)),maxY=Math.min(h-1,Math.floor(v+ry));
     const rgba=(0xff000000|B[q+10]<<16|B[q+9]<<8|B[q+8])>>>0;
     for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
       const dx=x-u,dy=y-v,id=y*w+x;
       if(z>=zbuf[id]&&c*dx*dx-2*m*dx*dy+a*dy*dy<=det*threshold){col[id]=rgba;zbuf[id]=z;}
     }
   });
   return {w,h,l,t,col,zbuf};
 }
 function sprite(group,yaw,pitch){
   const sector=((Math.round(yaw/turn)%sectors)+sectors)%sectors;
   const key=sector+':'+pitch,groupCache=cache[group];
   if(groupCache.has(key))return groupCache.get(key);
   const s=bake(group,sector*turn,pitch);
   if(groupCache.size>=(group===0?4:36))groupCache.delete(groupCache.keys().next().value);
   groupCache.set(key,s);return s;
 }
 function shadeCrater(cam,bg,project,[cx,cz,r,fade]){
   if(!fade)return;
   const [ox,oy]=project(cx,0,cz),bound=r*scale*1.5+scale*.6;
   const left=Math.max(0,Math.floor(ox-bg.l-bound)),right=Math.min(bg.w,Math.ceil(ox-bg.l+bound));
   const top=Math.max(0,Math.floor(oy-bg.t-bound)),bottom=Math.min(bg.h,Math.ceil(oy-bg.t+bound));
   const {pixels,size}=craterMap;
   for(let row=top;row<bottom;row++){
     const v=-(row+bg.t)/scale;
     for(let col=left;col<right;col++){
       const id=row*bg.w+col,d=depth[id]/512,u=(col+bg.l)/scale;
       const h=v*cam.up[1]+d*cam.back[1];
       if(h>.56||h<-.65||!colors[id])continue;
       const x=u*cam.side[0]+v*cam.up[0]+d*cam.back[0]-cx;
       const z=u*cam.side[2]+v*cam.up[2]+d*cam.back[2]-cz;
       const ix=Math.floor((x/r+1)*.5*size),iz=Math.floor((z/r+1)*.5*size);
       if(ix<0||iz<0||ix>=size||iz>=size)continue;
       const texel=(iz*size+ix)*4,a=pixels[texel+3]/255*fade*Math.min(1,(.56-h)/.32);
       if(!a)continue;
       const p=id*4;
       for(let j=0;j<3;j++)img.data[p+j]+=(pixels[texel+j]-img.data[p+j])*a;
     }
   }
 }
 return {backend:'경량',draw(cam,pose,crater){
   const angle=cam.viewYaw,pitch=cam.viewPitch,bg=sprite(0,angle,pitch);
   if(surface.width!==bg.w||surface.height!==bg.h||!img){
     surface.width=bg.w;surface.height=bg.h;img=surfaceCtx.createImageData(bg.w,bg.h);
     colors=new Uint32Array(img.data.buffer);depth=new Int16Array(bg.w*bg.h);
   }
   colors.set(bg.col);depth.set(bg.zbuf);
   const project=(x,y,z)=>[scale*(cam.side[0]*x+cam.side[2]*z),-scale*(cam.up[0]*x+cam.up[1]*y+cam.up[2]*z),
     512*(cam.back[0]*x+cam.back[1]*y+cam.back[2]*z)];
   shadeCrater(cam,bg,project,crater);
   for(let i=1;i<meta.groups.length;i++){
     const sp=sprite(i,angle-pose[i*4+3],pitch);
     const [px,py,pz]=project(pose[i*4],pose[i*4+1],pose[i*4+2]);
     const x0=Math.round(px+sp.l-bg.l),y0=Math.round(py+sp.t-bg.t);
     for(let y=Math.max(0,-y0);y<Math.min(sp.h,bg.h-y0);y++){
       let k=y*sp.w,off=(y+y0)*bg.w+x0;
       for(let x=Math.max(0,-x0);x<Math.min(sp.w,bg.w-x0);x++){
         const col=sp.col[k+x];if(!col)continue;
         const z=sp.zbuf[k+x]+pz;if(z>=depth[off+x]){depth[off+x]=z;colors[off+x]=col;}
       }
     }
   }
   surfaceCtx.putImageData(img,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);
   const [cx,cy]=project(...cam.target),ratio=canvas.height*cam.focal/(2*cam.dist*scale);
   ctx.drawImage(surface,canvas.width/2+(bg.l-cx)*ratio,canvas.height/2+(bg.t-cy)*ratio,bg.w*ratio,bg.h*ratio);
 }};
}
