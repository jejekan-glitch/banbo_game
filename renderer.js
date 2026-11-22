'use strict';
// Positions and covariance ellipsoids are baked from the original ink-studio worlds.
async function openGardenRenderer(canvas){
  const meta=window.GARDEN_DATA;
  const bin=Uint8Array.from(atob(meta.gzip),c=>c.charCodeAt(0));
  const data=await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(data.byteLength!==meta.count*24)throw Error('장면 데이터 크기가 일치하지 않습니다.');
  const requested=new URLSearchParams(location.search).get('render');
  if(requested==='lite')return liteRenderer(canvas,data,meta);
  let gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,powerPreference:'high-performance',failIfMajorPerformanceCaveat:requested!=='webgl'});
  if(!gl)return liteRenderer(canvas,data,meta);
  const vert=`
  precision highp float;
  attribute vec3 pos,rgb,cova,covb;
  attribute vec2 part;
  uniform vec4 pose[24];
  uniform vec3 target,side,up,back;
  uniform vec4 lens;
  uniform vec4 crater;
  varying vec3 scar;
  varying vec3 color,ellipse;
  varying float size,opacity;
  vec3 unturn(vec3 a,vec2 t){return vec3(t.x*a.x-t.y*a.z,a.y,t.y*a.x+t.x*a.z);}
  void main(){
    vec4 tr=pose[int(part.x)]; vec2 t=vec2(cos(tr.w),sin(tr.w));
    vec3 p=pos/512.;
    p=vec3(t.x*p.x+t.y*p.z,p.y,-t.y*p.x+t.x*p.z)+tr.xyz;
    scar=vec3(0.);
    if(crater.w>0. && part.x<.5 && p.y<.56){
      vec2 uv=(p.xz-crater.xy)/crater.z;
      float r=length(uv);
      if(max(abs(uv.x),abs(uv.y))<1.){
        scar=vec3(uv*.5+.5,crater.w*(1.-smoothstep(.24,.56,p.y)));
        p.y+=scar.z*(-.74*(1.-smoothstep(.26,.85,r))+.27*(1.-smoothstep(.0,.18,abs(r-.77))));
      }
    }
    p-=target;
    float x=dot(p,side),y=dot(p,up),d=max(0.15,lens.z-dot(p,back));
    gl_Position=vec4(x*lens.y/lens.x,y*lens.y,1.0025*d-.20025,d);
    vec3 right=unturn(side+back*x/d,t),top=unturn(up+back*y/d,t);
    mat3 cov=mat3(cova.x,cova.y,cova.z,cova.y,covb.x,covb.y,cova.z,covb.y,covb.z)/32768.;
    float f=lens.w*lens.y*0.5/d;
    float a=max(.17,dot(right,cov*right)*f*f+.17),b=dot(right,cov*top)*f*f,c=max(.17,dot(top,cov*top)*f*f+.17);
    b=clamp(b,-.995*sqrt(a*c),.995*sqrt(a*c));
    ellipse=vec3(c,-2.*b,a)/max(.004,a*c-b*b);
    float eigen=(a+c+sqrt((a-c)*(a-c)+4.*b*b))*.5;
    size=clamp(ceil(4.7*sqrt(eigen)),2.,94.);
    gl_PointSize=size;opacity=part.y/48.;color=rgb;
  }`;
  const frag=`
  precision mediump float; varying vec3 color,ellipse,scar;varying float size,opacity;
  uniform sampler2D craterMap;
  void main(){vec2 d=(gl_PointCoord-vec2(.5))*vec2(size,-size);
    float a=opacity*exp(-.5*dot(ellipse,vec3(d.x*d.x,d.x*d.y,d.y*d.y)));
    if(opacity>=1.){if(a<.49)discard;
      vec3 tint=color;
      if(scar.z>0.){vec4 rock=texture2D(craterMap,scar.xy);tint=mix(color,rock.rgb,rock.a*scar.z);}
      gl_FragColor=vec4(tint,1.);}
    else{if(a<.021)discard;gl_FragColor=vec4(color,min(a,.85));}
  }`;
  function shader(type,src){
    const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;
  }
  const prog=gl.createProgram();
  gl.attachShader(prog,shader(gl.VERTEX_SHADER,vert));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,frag));
  gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  for(const [name,n,type,normalize,offset] of [['pos',3,gl.SHORT,false,0],['part',2,gl.UNSIGNED_BYTE,false,6],
    ['rgb',3,gl.UNSIGNED_BYTE,true,8],['cova',3,gl.SHORT,false,12],['covb',3,gl.SHORT,false,18]]){
    const a=gl.getAttribLocation(prog,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,n,type,normalize,24,offset);
  }
  const loc=Object.fromEntries(['pose[0]','target','side','up','back','lens','crater'].map(k=>[k,gl.getUniformLocation(prog,k)]));
  const map=makeCraterMap();
  gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,map.size,map.size,0,gl.RGBA,gl.UNSIGNED_BYTE,map.pixels);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  const hardware={backend:'WebGL',draw(cam,pose,crater){
    gl.viewport(0,0,canvas.width,canvas.height);gl.depthMask(true);gl.disable(gl.BLEND);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    for(const key of ['target','side','up','back'])gl.uniform3fv(loc[key],cam[key]);
    gl.uniform4f(loc.lens,canvas.width/canvas.height,cam.focal,cam.dist,canvas.height);
    gl.uniform4fv(loc.crater,crater);
    gl.uniform4fv(loc['pose[0]'],pose);gl.drawArrays(gl.POINTS,0,meta.solid);
    gl.enable(gl.BLEND);gl.depthMask(false);gl.drawArrays(gl.POINTS,meta.solid,meta.count-meta.solid);
  }};
  return hardware;
}

