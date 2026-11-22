'use strict';
(async function(){
 const $=id=>document.getElementById(id),fx=$('effects'),ctx=fx.getContext('2d');
 const renderer=await openGardenRenderer($('world')),canvas=$('world'),groups=window.GARDEN_DATA.groups;
 const layout=window.GARDEN_DATA.layout,sound=createGardenSound($('sound'));
 const pose=new Float32Array(24*4);
 const keys=new Set(),pointers=new Map();
 const {sin,cos,exp,atan2,hypot,PI}=Math, clamp=(a,b,c)=>Math.max(b,Math.min(c,a));
 const player={x:0,z:3.45,a:0},cam={yaw:-0.20,pitch:0.52,dist:16.9,target:[0,1.15,1.20],focal:2.18};
 const goal={x:0,z:3.45},giant={x:3.4,z:0.68,a:0};
 let route=[],stride=0,clock=0,spellTime=-10,npcPhase=0,walking=0;
 const mageBar=$('mage-hp'),giantBar=$('giant-hp'),spellButton=$('spell'),note=$('combat-note');
 const range=8, cooldown=1.55, windup=1.15, quakeRadius=1.62;
 const fallTime=1.85,meteorCooldown=10,blinkCooldown=2.4;
 const meteorButton=$('meteor'),blinkButton=$('blink');
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 const art=createImpactArt(ctx,screen,floor,reducedMotion);
 const craterState=new Float32Array(4);
 let engaged=false,bolt=null,quake=null,burst=null,nextAttack=0;
 let mageHit=-10,giantHit=-10;
 let meteor=null,blink=null,meteorReady=0,blinkReady=0,distanceSinceStep=0;
 const tracking=[0,1.15,1.20];
 let pinch=0,gestureMoved=false,startX=0,startY=0,previous=performance.now(),renderTime=0,sceneName='';
 function setCamera(){
   const lite=renderer.backend==='경량',unit=PI/12;
   cam.viewYaw=lite?Math.round(cam.yaw/unit)*unit:cam.yaw;
   cam.viewPitch=lite?Math.round(cam.pitch*7)/7:cam.pitch;
   const s=sin(cam.viewYaw),c=cos(cam.viewYaw),sp=sin(cam.viewPitch),cp=cos(cam.viewPitch);
   cam.side=[c,0,-s];cam.up=[-s*sp,cp,-c*sp];cam.back=[s*cp,sp,c*cp];
 }
 function resize(){
   const w=innerWidth,h=innerHeight,lite=renderer.backend==='경량';
   const scale=lite?Math.min(1,800/Math.max(w,h)):Math.min(devicePixelRatio||1,2,2560/Math.max(w,h));
   canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
   fx.width=w;fx.height=h;
 }
 const circle=(x,z,cx,cz,r)=>hypot(x-cx,z-cz)<r;
 const blockRects=[
   [-5.0+layout.ruinShift,layout.ruinZ-1.55,2.03,.94],[-4.26+layout.ruinShift,layout.ruinZ+.39,.51,1.82]
 ];
 const shifted=(points,dx,dz)=>points.map(([x,z,r])=>[x+dx,z+dz,r]);
 const blocks=[...shifted([[-7.48,-3.79,.37],[-5,-3.79,.39],[-2.63,-4.15,.44]],layout.ruinShift,layout.ruinZ+2.62),
   ...shifted([[1.19,-3.65,.44],[1.94,-4.81,.49],[2.99,-4.98,.42],[7.03,-4.98,.50],[8.10,-4.61,.54],
   [8.99,-3.56,.50],[9.25,-2.54,.40],[1.20,-1.71,.32]],layout.forestShift,layout.forestZ+2.8),
   [-2.61,2.48,.32],[2.57,2.39,.32],[-2.64,4.32,.32],[2.65,4.33,.32],
   ...layout.lamps.map(([x,z])=>[x,z,.19]),...layout.birches.map(([x,z])=>[x,z,.16]),
   ...layout.outcrops,[layout.terrace[0]-1.65,layout.terrace[1]-.55,.50]];
 function walkable(x,z){
   if((x/layout.radius[0])**2+((z-layout.centerZ)/layout.radius[1])**2>1)return false;
   if(((x-layout.pool[0])/2.31)**2+((z-layout.pool[1])/1.34)**2<1)return false;
   if(((x-3.83-layout.forestShift)/1.54)**2+((z-layout.forestZ-1.89)/.69)**2<1)return false;
   if(blockRects.some(([a,b,w,h])=>Math.abs(x-a)<w&&Math.abs(z-b)<h))return false;
   return !blocks.some(([a,b,r])=>circle(x,z,a,b,r+.13));
 }
 function floor(x,z){
   let offset=0;
   if(craterState[3]&&renderer.backend==='WebGL'){
     const r=hypot(x-craterState[0],z-craterState[1])/craterState[2];
     const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
     offset=craterState[3]*(-.74*(1-smooth((r-.26)/.59))+.27*(1-smooth(Math.abs(r-.77)/.18)));
   }
   if(circle(x,z,0,3.45,2.85))return .073+offset;
   if(circle(x,z,...layout.terrace,1.8))return .24+offset;
   if(circle(x,z,...layout.terrace,2.10))return .12+offset;
   if(Math.abs(x+5-layout.ruinShift)<3.86&&Math.abs(z-layout.ruinZ)<2.72)return .18+offset;
   if(((x-5.1-layout.forestShift)/4.8)**2+((z-layout.forestZ)/3.23)**2<1)return .18+offset;
   return .025+offset;
 }
 // Route taps around obstacles on the same ground mask used by direct movement.
 const step=.32,[halfW,halfH]=layout.radius.map(r=>Math.ceil(r/step)+1),w=2*halfW+1,h=2*halfH+1;
 const cell=(x,z)=>[Math.round(x/step)+halfW,Math.round((z-layout.centerZ)/step)+halfH];
 const point=i=>[(i%w-halfW)*step,(Math.floor(i/w)-halfH)*step+layout.centerZ];
 const passable=Uint8Array.from({length:w*h},(_,i)=>walkable(...point(i)));
 function findRoute(tx,tz){
   if(!walkable(tx,tz))return null;
   const [ax,az]=cell(player.x,player.z),[bx,bz]=cell(tx,tz),start=az*w+ax,end=bz*w+bx;
   if(start===end)return [[tx,tz]];
   const prev=new Int32Array(w*h).fill(-1),queue=[start];prev[start]=start;
   for(let k=0;k<queue.length&&prev[end]<0;k++){
     const id=queue[k],ix=id%w,iz=(id/w)|0;
     for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){
       const nx=ix+dx,nz=iz+dz,n=nz*w+nx;if(nx<0||nx>=w||nz<0||nz>=h||prev[n]>=0)continue;
       if(!passable[n]||(dx&&dz&&(!passable[n-dx]||!passable[n-dz*w])))continue;
       prev[n]=id;queue.push(n);
     }
   }
   if(prev[end]<0)return null;
   const path=[[tx,tz]];for(let q=end;q!==start;q=prev[q])path.push(point(q));return path.reverse();
 }
 function groundAt(sx,sy){
   const nx=(sx/innerWidth*2-1)*innerWidth/innerHeight/cam.focal,ny=(1-sy/innerHeight*2)/cam.focal;
   if(renderer.backend==='경량'){
     const origin=cam.target.map((v,k)=>v+cam.dist*(cam.side[k]*nx+cam.up[k]*ny));
     const t=origin[1]/cam.back[1];return [origin[0]-t*cam.back[0],origin[2]-t*cam.back[2]];
   }
   const e=cam.target.map((v,k)=>v+cam.dist*cam.back[k]),d=cam.back.map((v,k)=>-v+cam.side[k]*nx+cam.up[k]*ny);
   if(d[1]>=-.015)return null;
   const t=-e[1]/d[1];return [e[0]+d[0]*t,e[2]+d[2]*t];
 }
 function zoom(distance){
   const overviewDistance=layout.radius[0]*cam.focal*innerHeight/innerWidth+10;
   cam.dist=clamp(distance,7.8,Math.max(42,overviewDistance));
 }
 function screen(x,y,z){
   const v=[x-cam.target[0],y-cam.target[1],z-cam.target[2]],dot=a=>a[0]*v[0]+a[1]*v[1]+a[2]*v[2];
   const k=innerHeight*.5*cam.focal/(renderer.backend==='경량'?cam.dist:cam.dist-dot(cam.back));
   return [innerWidth*.5+dot(cam.side)*k,innerHeight*.5-dot(cam.up)*k,k];
 }
 function face(angle,target,k){return angle+atan2(sin(target-angle),cos(target-angle))*k;}
 function over(){return player.hp===0||giant.hp===0;}
 function healthUI(){
   mageBar.value=player.hp;giantBar.value=giant.hp;
   $('mage-value').textContent=player.hp+' / '+mageBar.max;
   $('giant-value').textContent=giant.hp+' / '+giantBar.max;
   $('enemy-vital').hidden=!engaged;
   $('spell-label').textContent=over()?'다시 대결':'월광 나선';
 }
 function staffTip(){
   // The baked staff orb uses the wizard model's local coordinates at 0.64 scale.
   const x=-1.78*.64,z=.47*.64,b=player.a;
   return [player.x+cos(b)*x+sin(b)*z,floor(player.x,player.z)+3.87*.64,player.z-sin(b)*x+cos(b)*z];
 }
 function engage(){
   if(engaged)return;
   engaged=true;nextAttack=clock+1.35;healthUI();
 }
 function damageGiant(amount){
   giant.hp=Math.max(0,giant.hp-amount);giantHit=clock;healthUI();
   if(!giant.hp){sound.play('win');quake=null;bolt=null;note.textContent='골렘을 쓰러뜨렸습니다.';}
 }
 function cast(){
   if(over()||clock-spellTime<cooldown)return;
   const dx=giant.x-player.x,dz=giant.z-player.z,locked=hypot(dx,dz)<=range;
   if(locked){
     player.a=atan2(dx,dz);
     engage();
     if(!quake)note.textContent='';
   }else note.textContent='골렘에게 더 가까이 다가가세요.';
   const from=staffTip(),to=locked?[giant.x,floor(giant.x,giant.z)+2.25,giant.z]:
     [from[0]+range*sin(player.a),from[1],from[2]+range*cos(player.a)];
   spellTime=clock;
   sound.play('bolt');
   bolt={from,to,duration:.40+hypot(to[0]-from[0],to[2]-from[2])*.065,locked};
 }
 function callMeteor(){
   if(over()||clock<meteorReady)return;
   if(hypot(player.x-giant.x,player.z-giant.z)>range+3){
     note.textContent='낙성을 쓰려면 골렘에게 더 가까이 다가가세요.';return;
   }
   engage();player.a=atan2(giant.x-player.x,giant.z-player.z);
   meteor={x:giant.x,z:giant.z,time:clock,struck:false,fallShown:false,impactFrame:null};
   meteorReady=clock+meteorCooldown;
   if(!quake)note.textContent='낙성 · 운석 낙하 중';
 }
 function moveDirection(){
   const lr=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
   const fb=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
   return [lr*cos(cam.yaw)+fb*sin(cam.yaw),-lr*sin(cam.yaw)+fb*cos(cam.yaw)];
 }
 function teleport(){
   if(!player.hp||clock<blinkReady)return;
   let [dx,dz]=moveDirection();
   if(!dx&&!dz&&route.length){dx=goal.x-player.x;dz=goal.z-player.z;}
   const angle=dx||dz?atan2(dx,dz):player.a;
   for(let step=32;step>=4;step--){
     const x=player.x+sin(angle)*step*.1,z=player.z+cos(angle)*step*.1;
     if(!walkable(x,z)||giant.hp&&hypot(x-giant.x,z-giant.z)<.82)continue;
     blink={from:[player.x,player.z],to:[x,z],time:clock};blinkReady=clock+blinkCooldown;
     sound.play('blink');
     Object.assign(player,{x,z,a:angle});route=[];return;
   }
 }
 function updateCombat(){
   if(meteor&&!meteor.struck&&clock-meteor.time>=fallTime){
     meteor.struck=true;
     if(!over()&&hypot(meteor.x-giant.x,meteor.z-giant.z)<3.6)damageGiant(96);
     if(!over()&&!quake)note.textContent='';
   }
   if(meteor&&clock-meteor.time>fallTime+5.2)meteor=null;
   if(bolt&&clock-spellTime>=bolt.duration){
     const [x,y,z]=bolt.to;
     if(bolt.locked&&hypot(x-giant.x,z-giant.z)<1){
       sound.play('hit');
       damageGiant(32);
       burst={x,y,z,time:clock,finisher:giant.hp===0};
     }
     bolt=null;
   }
   if(!engaged||over())return;
   if(quake){
     const age=clock-quake.time;
     if(!quake.struck&&age>=windup){
       quake.struck=true;
       sound.play('quake');
       if(hypot(player.x-quake.x,player.z-quake.z)<=quakeRadius){
         player.hp=Math.max(0,player.hp-25);mageHit=clock;healthUI();
         sound.play(player.hp?'hurt':'lose');
         if(!player.hp){bolt=null;route=[];keys.clear();}
         note.textContent=player.hp?'지맥 강타에 맞았습니다.':'마법사가 쓰러졌습니다.';
       }else note.textContent='지맥 강타를 피했습니다.';
     }
     if(age>windup+.72){quake=null;if(!over())note.textContent='';}
   }else if(clock>=nextAttack&&hypot(player.x-giant.x,player.z-giant.z)<=range){
     quake={x:player.x,z:player.z,time:clock,struck:false};
     sound.play('warn');
     nextAttack=clock+3.15;note.textContent='지맥 강타 · 원 밖으로 이동';
   }
 }
 function reset(){
   Object.assign(player,{x:0,z:3.45,a:0,hp:mageBar.max});route=[];keys.clear();
   Object.assign(giant,{x:3.43+1.58*cos(.52),z:.60+.54*sin(.52),a:0,hp:giantBar.max});
   engaged=false;bolt=null;quake=null;burst=null;npcPhase=0;walking=0;stride=0;
   meteor=null;blink=null;meteorReady=blinkReady=clock;
   sound.reset();distanceSinceStep=0;tracking.splice(0,3,0,1.15,-4.6);
   spellTime=mageHit=giantHit=-10;note.textContent='';healthUI();
   Object.assign(cam,{yaw:-.075,pitch:.80,focal:2.18,dist:clamp(54*innerHeight/innerWidth+5,31,44),target:[...tracking]});
   setCamera();canvas.focus({preventScroll:true});
 }
 function update(dt){
   clock+=dt;
   let [dx,dz]=moveDirection();
   const step=dt*2.76;
   const fromX=player.x,fromZ=player.z;
   if(!player.hp){dx=dz=0;route=[];}
   else if(dx||dz)route=[];
   else if(route.length){
     let [x,z]=route[0];dx=x-player.x;dz=z-player.z;
     if(hypot(dx,dz)<step){player.x=x;player.z=z;route.shift();dx=0;dz=0;}
   }
   const len=hypot(dx,dz);
   if(len>.001){
     const x=player.x+dx/len*step,z=player.z+dz/len*step;
     if(walkable(x,player.z))player.x=x;
     if(walkable(player.x,z))player.z=z;
     player.a=face(player.a,atan2(dx,dz),1-exp(-12*dt));
   }
   walking+=(Number(len>.001&&hypot(player.x-fromX,player.z-fromZ)>.0001||route.length>0)-walking)*(1-exp(-13*dt));
   stride+=dt*10.2*walking;
   distanceSinceStep+=hypot(player.x-fromX,player.z-fromZ);
   if(distanceSinceStep>=.86){
     distanceSinceStep%=.86;
     sound.play(circle(player.x,player.z,...layout.terrace,2.15)||circle(player.x,player.z,0,3.45,3)||Math.abs(player.x+5-layout.ruinShift)<3.86&&Math.abs(player.z-layout.ruinZ)<2.72?'stone':'grass');
   }
   if(!engaged)npcPhase+=dt*.26;
   const a=npcPhase+.52;
   giant.x=3.43+1.58*cos(a);giant.z=.60+.54*sin(a);
   const dir=engaged?atan2(player.x-giant.x,player.z-giant.z):atan2(-1.58*sin(a),.54*cos(a));
   if(giant.hp)giant.a=face(giant.a,dir,1-exp(-1.8*dt));
   updateCombat();
   // Look ahead enough to see the clearing, while the player stays in the lower half.
   const follow=[player.x*.89,1.15,Math.max(-16,player.z*.86-7.55)];
   if(engaged&&hypot(player.x-giant.x,player.z-giant.z)<=range){
     follow[0]=player.x*.60+giant.x*.40;follow[2]=player.z*.60+giant.z*.40;
   }
   const sky=meteor&&!reducedMotion.matches?clamp(1-(clock-meteor.time-fallTime)/.85,0,1):0;
   cam.focal+=(2.18-.51*sky-cam.focal)*(1-exp(-4*dt));
   follow[1]+=1.60*sky;
   for(let i=0;i<3;i++){
     tracking[i]+=(follow[i]-tracking[i])*(1-exp(-3.6*dt));
     cam.target[i]=tracking[i];
   }
   setCamera();
   const poolDistance=hypot(player.x-layout.pool[0],player.z-layout.pool[1]);
   const place=circle(player.x,player.z,0,3.45,3.08)?'룬 제단':circle(player.x,player.z,...layout.terrace,3.4)?'초승달 전망대':
     poolDistance<3.5?'달샘':Math.abs(player.x+5-layout.ruinShift)<4.8&&Math.abs(player.z-layout.ruinZ)<3.2?'달빛 유적':
     player.z<-12?'북쪽 산책로':player.x>8.5&&Math.abs(player.z-layout.forestZ)<4?'수호자의 숲':'별이끼 초원';
   sound.water(clamp(1-poolDistance/8,0,1));
   if(place!==sceneName){sceneName=place;$('place').textContent=place;}
 }
 function put(i,x,y,z,a){pose.set([x,y,z,a],i*4);}
 function transform(){
   const age=clock-spellTime, flash=age<1.45?sin(PI*age/1.45)**2:0;
   const b=player.a,pg=floor(player.x,player.z),bob=.038*walking*Math.abs(sin(stride))+.012*sin(2*clock);
   const moving=!engaged,gg=floor(giant.x,giant.z);
   const lift=quake&&!quake.struck?Math.sin(clamp((clock-quake.time)/windup,0,1)*PI*.5):0;
   const recoil=time=>{const t=(clock-time)/.34;return t>=0&&t<1?.22*sin(PI*t):0;};
   groups.forEach((g,i)=>{
     if(g==='ground')return;
     if(g.startsWith('mage/')){
       const part=g.slice(5);let x=0,y=bob,z=0,turn=b;
       if(part.startsWith('foot')){const s=part.endsWith('0')?1:-1,phase=s*sin(stride)*walking;z=.16*phase;y=.10*Math.max(phase,0);}
       if(part==='head'||part==='eyes')turn+=.045*sin(clock*1.4);
       if(part==='owl')y+=.035*sin(clock*2.8);
       if(part.startsWith('book')){const k=Number(part.slice(-1));turn+=.22*sin(clock*1.1+k*2)+flash*.64;y+=.12*sin(clock*1.6+k*2)+flash*.68;}
       y-=player.hp?recoil(mageHit):Math.min(1,(clock-mageHit)*2)*.85;
       put(i,player.x+cos(b)*x+sin(b)*z,pg+y,player.z-sin(b)*x+cos(b)*z,turn);
     }else if(g.startsWith('giant/')){
       let y=.035*sin(clock*1.8),z=0,turn=giant.a;
       if(g.includes('foot')){const s=g.endsWith('0')?1:-1;z=moving?.13*s*sin(clock*3.3):0;y=.08*Math.max(0,z/.13);}
       if(g.includes('Arm'))z=moving?.115*(g.includes('left')?1:-1)*sin(clock*3.3):.075*sin(clock*2);
       if(g.endsWith('head')){turn+=.16*sin(clock*.85);y+=.04*sin(clock*1.3);}
       if(g.includes('Arm')){y+=lift*.95;z+=lift*.25;}
       y-=giant.hp?recoil(giantHit):Math.min(1,(clock-giantHit)*1.8)*1.65;
       put(i,giant.x+sin(giant.a)*z,gg+y,giant.z+cos(giant.a)*z,turn);
     }else{
       const turn=g.endsWith('astrolabe')?.53*sin(clock*.81):.08*sin(clock*1.3);
       const x=-5+layout.ruinShift-1.38*.9,z=layout.ruinZ-1.23*.9;
       put(i,x,g.endsWith('moon')?.07*sin(clock*1.3):0,z,turn);
     }
   });
 }
 function ring(x,y,z,r,color){
   ctx.strokeStyle=color;ctx.lineWidth=1.7;ctx.beginPath();
   for(let j=0;j<=48;j++){const a=j*PI/24,p=screen(x+r*cos(a),y,z+r*sin(a));if(j===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);}ctx.stroke();
 }
 function stroke(points,color,width){
   ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;
   points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
 }
 function star(x,y,r,color){
   ctx.fillStyle=color;ctx.beginPath();
   for(let i=0;i<8;i++){
     const a=i*PI/4,s=i%2?r*.21:r;
     const px=Math.round(x+s*cos(a)),py=Math.round(y+s*sin(a));
     if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
   }
   ctx.closePath();ctx.fill();
 }
 function drawBolt(){
   const {from,to,duration}=bolt,u=clamp((clock-spellTime)/duration,0,1);
   const start=screen(...from),end=screen(...to),scale=start[2];
   const dx=end[0]-start[0],dy=end[1]-start[1],len=hypot(dx,dy)||1;
   const travel=clamp((u-.20)/.80,0,1);
   const colors=['#84ffec','#bc9aff','#f2d495'];
   function trail(t,lane){
     const wave=sin(PI*t),twist=lane<0?0:sin(t*PI*4+lane*PI*2/3)*scale*.86*wave;
     return [start[0]+dx*t-dy/len*twist,start[1]+dy*t-scale*1.26*wave+dx/len*twist];
   }
   ctx.save();ctx.globalCompositeOperation='lighter';
   for(let lane=0;lane<(reducedMotion.matches?1:3);lane++){
     const path=[];
     for(let i=0;i<=22;i++)path.push(trail(Math.max(0,travel-(1-i/22)*.61),lane));
     ctx.globalAlpha=.22;stroke(path,colors[lane],Math.max(5,scale*.39));
     ctx.globalAlpha=.95;stroke(path,colors[lane],Math.max(2,scale*.11));
     const [x,y]=path[path.length-1];star(x,y,scale*.31,colors[lane]);
   }
   const [hx,hy]=trail(travel,-1);
   star(hx,hy,scale*(.31+.30*sin(PI*u)),'#f3ffec');
   ctx.globalAlpha=1-u;
   const r=scale*(.30+.91*Math.min(1,u*3));
   const seal=[];
   for(let i=0;i<=6;i++){const a=i*PI/3+u;seal.push([start[0]+r*cos(a),start[1]+r*sin(a)]);}
   stroke(seal,'#e8cbff',1.5);stroke([seal[0],seal[2],seal[4],seal[0]],'#99f6e3',1);
   ctx.restore();
 }
 function drawBurst(){
   const u=(clock-burst.time)/(burst.finisher?1.15:.80);if(u>=1)return;
   const [cx,cy,scale]=screen(burst.x,burst.y,burst.z);
   ctx.save();ctx.globalAlpha=1-u;
   const size=scale*(burst.finisher?3.4:2.35),radius=size*(.25+Math.sqrt(u));
   // Broken arcs leave the target's core visible through the impact seal.
   for(let sector=0;sector<6;sector++){
     const angle=sector*PI/3+u*.65,path=[];
     for(let j=0;j<=6;j++){
       const a=angle+j*.12;
       path.push([cx+radius*cos(a),cy+radius*sin(a)]);
     }
     stroke(path,sector%2?'#bba3ff':'#8af8e4',Math.max(2,size*.055));
     const [px,py]=path[0];star(px,py,size*.095,'#fff4c4');
   }
   if(burst.finisher){
     const height=size*2.65*(1-u),width=size*.17*(1-u);
     ctx.fillStyle='#b0f7ea';ctx.beginPath();ctx.moveTo(cx,cy-height);
     ctx.lineTo(cx+width,cy);ctx.lineTo(cx,cy+height*.4);ctx.lineTo(cx-width,cy);
     ctx.closePath();ctx.fill();
   }
   for(let i=0;i<(reducedMotion.matches?8:24);i++){
     const a=i*2.4,d=size*(.23+Math.sqrt(u)*(1.05+(i%4)*.25));
     const x=cx+cos(a)*d,y=cy+sin(a)*d*.84+scale*.35*u*u;
     stroke([[x-cos(a)*scale*.23*(1-u),y-sin(a)*scale*.23*(1-u)],[x,y]],i%2?'#c3a3ff':'#8affdf',2.5);
     if(i%3===0)star(x,y,scale*.085,'#fff2ba');
   }
   star(cx,cy,(1-u)**2*scale*.88,'#effff6');ctx.restore();
 }
 function drawQuake(){
   const {x,z,time,struck}=quake,y=floor(x,z)+.08,age=clock-time;
   const u=struck?(age-windup)/.72:age/windup;
   if(u>1)return;
   ctx.save();ctx.globalAlpha=struck?1-u:1;
   art.disc(x,z,quakeRadius,'rgba(126,54,24,.64)');
   art.disc(x,z,quakeRadius*(struck?1:u),'rgba(255,174,57,.43)');
   if(!struck){
     const dx=x-giant.x,dz=z-giant.z,length=hypot(dx,dz);
     const fissure=[];
     for(let j=0;j<=12;j++){
       const t=Math.min(1,u*2.3)*j/12;
       const kink=sin(t*PI)*sin(j*2.6)*.22/(length||1);
       const px=giant.x+dx*t-dz*kink,pz=giant.z+dz*t+dx*kink;
       fissure.push(screen(px,floor(px,pz)+.09,pz));
     }
     stroke(fissure,'#7f563e',4);stroke(fissure,'#f7bb6e',1.5);
     for(let j=1;j<=7;j++){
       const t=j/8,rise=clamp((u*1.8-t)*4,0,1);
       if(!rise)continue;
       const px=giant.x+dx*t,pz=giant.z+dz*t;
       const [sx,sy,k]=screen(px,floor(px,pz),pz);
       art.stone(sx,sy,k*.57,k*(.60+.25*sin(j*5))*rise,sin(j)*.45,false);
     }
   }
   ring(x,y,z,quakeRadius,'#ffbe72');
   ring(x,y,z,quakeRadius*(struck?1+u*.60:Math.max(.04,u)),'#fff2ae');
   for(let i=0;i<8;i++){
     const a=i*PI/4,r=quakeRadius;
     const at=(radius,angle,height=0)=>screen(x+radius*cos(angle),y+height,z+radius*sin(angle));
     stroke([at(r-.12,a),at(r+.14,a)],'#ffda91',2);
     if(struck){
       stroke([at(0,a),at(r*.38,a+.13),at(r*.59,a-.11),at(r*(.80+u*.2),a)],'#ffc76f',2.6);
       const h=sin(PI*u)*(.6+i%3*.22),[px,py,k]=at(r*(.45+.52*u),a,h);
       star(px,py,k*.10,'#ffe4a9');
       const [sx,sy]=at(r*.80,a);
       art.stone(sx,sy,k*.76,k*(1.6+.45*cos(i*2))*Math.min(1,.18+u*7),cos(a)*.7,false);
     }
   }
   ctx.restore();
 }
 function drawBlink(){
   const u=(clock-blink.time)/.76;if(u>=1)return;
   const anchor=([x,z])=>screen(x,floor(x,z)+1.29,z);
   const from=anchor(blink.from),to=anchor(blink.to);
   if(from[2]<=0||to[2]<=0)return;
   ctx.save();
   if(!reducedMotion.matches){
     // Different heights and travelling ends make the path read even head-on.
     for(let lane=0;lane<5;lane++){
       const path=[],head=clamp(u*3.5-lane*.045,0,1),tail=clamp(u*2.6-.53-lane*.04,0,1);
       for(let j=0;j<=10;j++){
         const t=tail+(head-tail)*j/10,k=from[2]*(1-t)+to[2]*t;
         const arc=sin(t*PI)*(.56*sin(lane*2.2+t*4)-.44);
         path.push([from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t+k*(arc+(lane-2)*.27)]);
       }
       const color=lane%2?'#aa90ff':'#78fae7';
       ctx.globalAlpha=.25*(1-u);stroke(path,color,Math.max(3,from[2]*.16));
       ctx.globalAlpha=.94*(1-u);stroke(path,color,Math.max(1.5,from[2]*.044));
       const p=path[path.length-1];star(p[0],p[1],to[2]*.12*(1-u),'#eaffff');
     }
   }
   function gate(point,arrival){
     const [sx,sy,k]=point;
     const t=clamp(arrival?(u-.05)/.95:u/.77,0,1);
     if(t>=1||arrival&&u<.05)return;
     const w=k*(arrival?.73:.57)*Math.min(1,.14+t*8)*(1-t*t),h=k*1.55*(1-.38*t);
     ctx.save();ctx.translate(sx,sy);ctx.rotate(arrival?.12:-.14);
     ctx.globalAlpha=(1-t)*.72;
     ctx.beginPath();ctx.moveTo(0,-h);ctx.quadraticCurveTo(w*1.75,-h*.17,0,h);
     ctx.quadraticCurveTo(-w*1.5,h*.19,0,-h);ctx.fillStyle='#27254a';ctx.fill();
     ctx.globalAlpha=1-t;
     for(let side=-1;side<=1;side+=2){
       const path=[];
       for(let j=0;j<=12;j++){
         const q=j/12;path.push([side*w*sin(q*PI)*(1+.10*sin(q*9+side)),(2*q-1)*h]);
       }
       stroke(path,side<0?'#9768ff':'#42e9d5',k*.16);stroke(path,side<0?'#e6caff':'#d5fffa',k*.053);
     }
     const count=reducedMotion.matches?4:14;
     for(let i=0;i<count;i++){
       const a=i*2.4+t*(arrival?.42:-.42),spread=arrival?.72+t*.94:1.65-t*.92;
       const x=cos(a)*k*spread,y=sin(a)*h*spread*.72;
       star(x,y,k*(.05+.085*(i%3))*(1-.45*t),i%3?'#9bf7ea':'#d4b4ff');
     }
     if(arrival){star(0,-h*.92,k*.48*(1-t),'#f1ffed');}
     ctx.restore();
   }
   gate(from,false);gate(to,true);ctx.restore();
 }
 function cooldownUI(button,ready,ended){
   const remaining=Math.max(0,Math.ceil(ready-clock)),label=remaining&&!ended?remaining+'초':'';
   button.disabled=ended||remaining>0;
   if(button.lastElementChild.textContent!==label)button.lastElementChild.textContent=label;
 }
 function overlay(){
   ctx.clearRect(0,0,innerWidth,innerHeight);
   if(meteor?.struck)art.impact(meteor.x,meteor.z,clock-meteor.impactFrame);
   if(quake)drawQuake();
   if(route.length)ring(goal.x,floor(goal.x,goal.z)+.07,goal.z,.22+.035*sin(clock*7),'#d8fddd');
   if(bolt)drawBolt();
   if(burst)drawBurst();
   if(blink)drawBlink();
   if(meteor&&!meteor.struck){
     const elapsed=clock-meteor.time;
     if(art.falling(meteor.x,meteor.z,elapsed/fallTime,clock)&&!meteor.fallShown){
       meteor.fallShown=true;
       sound.play('fall',fallTime-elapsed);
     }
   }
   if(meteor?.struck){
     const age=clock-meteor.impactFrame,fade=Math.max(0,1-age/.42)**2;
     if(fade>0){
       ctx.fillStyle='rgba(208,38,25,'+fade*(reducedMotion.matches?.09:.43)+')';
       ctx.fillRect(0,0,fx.width,fx.height);
     }
   }
   cooldownUI(meteorButton,meteorReady,over());cooldownUI(blinkButton,blinkReady,!player.hp);
   const cooling=!over()&&clock-spellTime<cooldown;
   if(spellButton.disabled!==cooling)spellButton.disabled=cooling;
 }
 const actions=new Map([['Space',activateSpell],['KeyR',callMeteor],['ShiftLeft',teleport],['ShiftRight',teleport]]);
 const controlled=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',...actions.keys()]);
 function advance(now){
   let elapsed=Math.min(.7,Math.max(0,(now-previous)/1000));previous=now;
   while(elapsed>.00001){const dt=Math.min(1/40,elapsed);update(dt);elapsed-=dt;}
 }
 window.addEventListener('keydown',e=>{
   if(e.altKey||e.ctrlKey||e.metaKey)return;
   if(e.code==='Escape'){$('guide').hidden=true;$('help').setAttribute('aria-expanded','false');return;}
   if(!controlled.has(e.code)||e.code==='Space'&&e.target.tagName==='BUTTON')return;
   if(e.code.startsWith('Shift')&&e.target!==canvas&&e.target!==document.body)return;
   e.preventDefault();advance(performance.now());
   if(actions.has(e.code)){if(!e.repeat)actions.get(e.code)();}else keys.add(e.code);
 });
 window.addEventListener('keyup',e=>{if(keys.has(e.code)){advance(performance.now());keys.delete(e.code);}});window.addEventListener('blur',()=>{keys.clear();pointers.clear();});
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{
   canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);
   if(pointers.size===1){startX=e.clientX;startY=e.clientY;gestureMoved=false;}
   if(pointers.size===2){const [a,b]=[...pointers.values()];pinch=hypot(a[0]-b[0],a[1]-b[1]);gestureMoved=true;}
 });
 canvas.addEventListener('pointermove',e=>{
   const old=pointers.get(e.pointerId);if(!old)return;
   pointers.set(e.pointerId,[e.clientX,e.clientY]);
   if(pointers.size===2){const [a,b]=[...pointers.values()],d=hypot(a[0]-b[0],a[1]-b[1]);if(d>2&&pinch>2)zoom(cam.dist*pinch/d);pinch=d;return;}
   if(hypot(e.clientX-startX,e.clientY-startY)>4)gestureMoved=true;
   if(gestureMoved){cam.yaw-=(e.clientX-old[0])*.008;cam.pitch=clamp(cam.pitch+(e.clientY-old[1])*.005,.23,1.12);}
 });
 canvas.addEventListener('pointerup',e=>{
   pointers.delete(e.pointerId);
   if(gestureMoved||pointers.size||e.button!==0||!player.hp)return;
   const p=groundAt(e.clientX,e.clientY);if(!p)return;
   const way=findRoute(...p);if(way){route=way;goal.x=p[0];goal.z=p[1];}
 });
 canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);gestureMoved=true;});
 canvas.addEventListener('lostpointercapture',e=>pointers.delete(e.pointerId));
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(cam.dist*Math.exp(clamp(e.deltaY,-150,150)*.0016));},{passive:false});
 function activateSpell(){if(over())reset();else cast();}
 $('home').onclick=reset;
 for(const [button,action] of [[spellButton,activateSpell],[meteorButton,callMeteor],[blinkButton,teleport]]){
   button.onclick=()=>{advance(performance.now());action();canvas.focus({preventScroll:true});};
 }
 $('help').onclick=()=>{const g=$('guide');g.hidden=!g.hidden;$('help').setAttribute('aria-expanded',String(!g.hidden));};
 window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{keys.clear();previous=performance.now();});
 resize();reset();$('loading').hidden=true;
 function frame(now){
   advance(Math.max(now,previous));
   if(now-renderTime>=30){
     craterState[3]=0;
     if(meteor&&meteor.struck){
       // Start the visible impulse on a painted frame even after a slow simulation catch-up.
       if(meteor.impactFrame===null){
         meteor.impactFrame=clock;
         sound.play('impact');
       }
       const age=clock-meteor.impactFrame;
       if(!reducedMotion.matches){
         const shake=.24*Math.max(0,1-age/.60)**2;
         cam.target[0]=tracking[0]+shake*cos(age*57)*cos(cam.yaw);
         cam.target[2]=tracking[2]-shake*cos(age*57)*sin(cam.yaw);
         cam.target[1]=tracking[1]+shake*.65*sin(age*76);
       }
       craterState.set([meteor.x,meteor.z,4.15*(.4+.6*clamp(age/.23,0,1)),clamp((5.2-age)/1.35,0,1)]);
     }
     transform();renderer.draw(cam,pose,craterState);overlay();renderTime=now;
   }
   // Small public readout supports local smoke checks without changing simulation state.
   canvas.dataset.position=player.x.toFixed(2)+','+player.z.toFixed(2);
   canvas.dataset.guardian=giant.x.toFixed(2)+','+giant.z.toFixed(2);
   canvas.dataset.camera=[cam.yaw,cam.pitch,cam.dist].map(n=>n.toFixed(2)).join(',');
   canvas.dataset.spell=String(spellTime);canvas.dataset.renderer=renderer.backend;
   requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
})().catch(error=>{const msg=document.getElementById('loading');msg.hidden=false;msg.textContent='정원을 열 수 없습니다. '+error.message;console.error(error);});
