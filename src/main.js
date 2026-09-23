import './style.css';
import './refinements.css';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {BokehPass} from 'three/addons/postprocessing/BokehPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';

const $=s=>document.querySelector(s),chapters=[...document.querySelectorAll('.chapter')];
const mobile=()=>innerWidth<=760,reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp,smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const stage=$('#stage'),loadText=$('#load-text');
let active=0,raw=0,progress=0,model,roots={},loaded=false,renderer,scene,camera,composer,ssao,bloom,bokeh,key,sea;
let sizeDirty=true,dirty=true,last=0,lastRender=0,frames=0,quality=mobile()?'mobile':'desktop',error=null;
let structureOverride=null,explosion=0,detail=0,zoom=false,exploring=false,yaw=0,targetYaw=0,highlight=null;
let fpsSamples=[],measuredFPS=0,adaptiveDPR=mobile()?1:Math.min(devicePixelRatio,1.5),lastFrameCost=0,failed=false;
let reqId=0,activeController,contextLost=false;
const debug={modelVariant:null,meshCount:0,triangles:0,bounds:null,materialNames:[],uvMeshes:0};
window.__museum={state:()=>({loaded,active,progress,raw,error,failed,frames,quality,explosion,detail,zoom,exploring,yaw,measuredFPS,adaptiveDPR,drawCalls:renderer?.info.render.calls,camera:camera?.position.toArray(),stage:stage.getBoundingClientRect().toJSON(),roots:Object.fromEntries(Object.entries(roots).map(([k,v])=>[k,v.position.toArray()])),...debug}),model:()=>model};

function activate(i){
 active=i;document.body.dataset.chapter=i;
 chapters.forEach((c,j)=>{c.classList.toggle('active',j===i);const p=c.querySelector('.panel');p.inert=j!==i;p.setAttribute('aria-hidden',String(j!==i))});
 document.querySelectorAll('nav a').forEach((a,j)=>{if(j===i)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')});
 $('#chapter-number').textContent=String(i+1).padStart(2,'0');$('.progress-track i').style.width=`${(i+1)/6*100}%`;
 $('#next-chapter').href='#'+chapters[Math.min(5,i+1)].id;
 structureOverride=null;highlight=null;setLayerButtons(true);if(i!==5&&exploring)setExplore(false);
 dirty=true;
}
function readScroll(){
 let i=0;while(i<5&&scrollY>=chapters[i+1].offsetTop)i++;
 raw=clamp(i+(scrollY-chapters[i].offsetTop)/chapters[i].offsetHeight,0,5);
 const n=Math.min(5,Math.floor(raw+.5));if(n!==active)activate(n);
 chapters[active].querySelector('.panel').style.opacity=String(1-.85*smooth((Math.abs(raw-active)-.12)/.38));dirty=true;
}
activate(0);readScroll();
addEventListener('scroll',readScroll,{passive:true});
addEventListener('resize',()=>{sizeDirty=true;readScroll()},{passive:true});
visualViewport?.addEventListener('resize',()=>{sizeDirty=true;dirty=true},{passive:true});
document.addEventListener('visibilitychange',()=>{last=0;dirty=true});
const menu=$('.menu-toggle');
function closeMenu(){$('#navigation').classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','打开章节导航')}
menu.addEventListener('click',()=>{const open=$('#navigation').classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'关闭章节导航':'打开章节导航')});
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{
 const target=document.getElementById(a.hash.slice(1));if(!target)return;e.preventDefault();closeMenu();
 history.replaceState(null,'',a.hash);scrollTo({top:target.offsetTop,behavior:reduced?'instant':'smooth'});
}));
function setLayerButtons(separate){$('#assembled').classList.toggle('selected',!separate);$('#separated').classList.toggle('selected',separate);$('#assembled').setAttribute('aria-pressed',String(!separate));$('#separated').setAttribute('aria-pressed',String(separate))}
$('#assembled').addEventListener('click',()=>{structureOverride=0;setLayerButtons(false);dirty=true});
$('#separated').addEventListener('click',()=>{structureOverride=1;setLayerButtons(true);dirty=true});
document.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>{highlight=highlight===b.dataset.layer?null:b.dataset.layer;dirty=true}));
document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>{detail=Number(b.dataset.detail);document.querySelectorAll('[data-detail]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))});zoom=false;$('#zoom').setAttribute('aria-pressed','false');$('#zoom').textContent='＋ 放大观察';dirty=true}));
$('#zoom').addEventListener('click',()=>{zoom=!zoom;$('#zoom').setAttribute('aria-pressed',String(zoom));$('#zoom').textContent=zoom?'− 还原视角':'＋ 放大观察';dirty=true});
function setExplore(value){exploring=value;targetYaw=0;document.body.classList.toggle('exploring',value);$('.explore-controls').hidden=!value;$('#free-explore').setAttribute('aria-pressed',String(value));$('#free-explore').innerHTML=value?'结束探索 <span>×</span>':'自由探索 <span>↗</span>';dirty=true}
$('#free-explore').addEventListener('click',()=>setExplore(!exploring));$('#exit-explore').addEventListener('click',()=>setExplore(false));$('#reset-view').addEventListener('click',()=>{targetYaw=0;dirty=true});
let pointer=null;
stage.addEventListener('pointerdown',e=>{if(!exploring)return;pointer={x:e.clientX,y:e.clientY,yaw:targetYaw,id:e.pointerId};stage.setPointerCapture(e.pointerId)});
stage.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(e.pointerType!=='touch'||Math.abs(dx)>Math.abs(dy)){targetYaw=pointer.yaw+dx*.006;dirty=true}});
for(const n of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(n,()=>pointer=null);
addEventListener('keydown',e=>{if(e.key==='Escape'){setExplore(false);closeMenu()}if(exploring&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();targetYaw+=(e.key==='ArrowLeft'?-1:1)*.15;dirty=true}});
const stories=[{title:'建筑之美',image:2,copy:'白色曲面在天空下起伏，玻璃立面将周围的色彩映入建筑。换一个角度，观察轮廓与光线如何共同塑造空间。'},{title:'景观相连',image:4,copy:'建筑并非孤立的物体。沿着绿地、步道与水岸移动，人的尺度与建筑的尺度逐渐交汇，远景与近景也随之展开。'},{title:'观察日常',image:3,copy:'自然的线索，也藏在日常的光影中。玻璃上的倒影、曲面上的明暗、树影的变化，都可以成为一次观察的起点。'}];
const dialog=$('#story-dialog');document.querySelectorAll('[data-story]').forEach(b=>b.addEventListener('click',()=>{const s=stories[+b.dataset.story];dialog.querySelector('img').src=`${import.meta.env.BASE_URL}assets/reference-${s.image}.webp`;dialog.querySelector('img').alt=s.title;dialog.querySelector('h2').textContent=s.title;dialog.querySelector('.story-copy').textContent=s.copy;dialog.showModal()}));
$('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});

// One persistent scene and camera. Each keyframe stores reference-aligned composition.
const desktopFrames=[
 {rect:[0,.29,1,.62],dir:[0,.25,1],target:[0,.09,0],width:2.03,rotate:0,explode:0,light:2.4},
 {rect:[.32,.20,.68,.72],dir:[.76,.48,1],target:[0,.08,0],width:1.55,rotate:0,explode:0,light:3.5},
 {rect:[0,.16,.67,.74],dir:[.12,1,.45],target:[0,.10,0],width:1.85,rotate:0,explode:1,light:2.4},
 {rect:[.31,.13,.72,.81],dir:[.90,.36,1],target:[.31,.15,.19],width:.72,rotate:0,explode:0,light:3.7},
 {rect:[0,.27,1,.62],dir:[-.4,.35,1],target:[0,.07,0],width:1.65,rotate:0,explode:0,light:3.4},
 {rect:[0,.29,1,.49],dir:[0,.25,1],target:[0,.10,0],width:2.32,rotate:0,explode:0,light:2.4}
];
const mobileFrames=[
 {rect:[-.12,.38,1.24,.44],dir:[0,.34,1],target:[0,.08,0],width:1.78,rotate:0,explode:0,light:3.3},
 {rect:[-.10,.43,1.2,.40],dir:[.72,.48,1],target:[0,.09,0],width:1.62,rotate:0,explode:0,light:3.5},
 {rect:[-.05,.45,1.10,.37],dir:[.1,1,.48],target:[0,.10,0],width:1.85,rotate:0,explode:1,light:3.2},
 {rect:[-.05,.45,1.10,.38],dir:[.9,.4,1],target:[.31,.16,.19],width:.90,rotate:0,explode:0,light:3.7},
 {rect:[0,.4,1,.4],dir:[-.4,.35,1],target:[0,.07,0],width:1.65,rotate:0,explode:0,light:3.4},
 {rect:[-.12,.32,1.24,.39],dir:[0,.26,1],target:[0,.10,0],width:1.82,rotate:0,explode:0,light:3.35}
];
function frameAt(p){
 const arr=mobile()?mobileFrames:desktopFrames,i=Math.min(4,Math.floor(p)),t=smooth(p-i),a=arr[i],b=arr[i+1],out={};
 for(const k of Object.keys(a))out[k]=Array.isArray(a[k])?a[k].map((v,j)=>lerp(v,b[k][j],t)):lerp(a[k],b[k],t);
 const dweight=1-smooth(Math.abs(p-3));
 if(detail===1){out.target=out.target.map((v,i)=>lerp(v,[0,.24,0][i],dweight));out.dir=out.dir.map((v,i)=>lerp(v,[.2,1,.6][i],dweight));out.width=lerp(out.width,mobile()?.65:.56,dweight)}
 if(zoom)out.width*=1-.23*dweight;
 if(structureOverride!==null)out.explode=lerp(out.explode,structureOverride,1-smooth(Math.abs(p-2)));
 return out;
}

function heightFog(material){
 if(!material.isMeshStandardMaterial)return;
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMistPosition;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvMistPosition = (modelMatrix * vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vMistPosition;').replace('#include <fog_fragment>',`#include <fog_fragment>
   float rayLength=length(cameraPosition-vMistPosition);
   float dy=cameraPosition.y-vMistPosition.y;
   float falloff=4.0;
   float integral=abs(dy)<0.0001?exp(-falloff*max(vMistPosition.y,0.0)):(exp(-falloff*max(vMistPosition.y,0.0))-exp(-falloff*max(cameraPosition.y,0.0)))/(falloff*dy);
   float opticalDepth=max(0.0,integral)*rayLength*0.10;
   gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.88,.90,.83),clamp(1.0-exp(-opticalDepth),0.0,.15));`);
 };
 material.customProgramCacheKey=()=> 'museum-height-fog-v1';
}

function setup(){
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(adaptiveDPR);
 renderer.setClearColor(0xf2f1ea,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;renderer.info.autoReset=false;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.domElement.setAttribute('aria-hidden','true');stage.append(renderer.domElement);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;showError('画面已暂停，可重新加载继续探索。')});
 renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
 scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xf2f1ea,.16);
 scene.background=new THREE.Color(0xe9eeeb);new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/coastal-sky.webp`,t=>{t.colorSpace=THREE.SRGBColorSpace;t.repeat.y=1.8;t.offset.y=-.8;scene.background=t;dirty=true});
 camera=new THREE.PerspectiveCamera(34,1,.008,25);
 const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;scene.environmentIntensity=.65;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xc7e4f4,0x687359,1.05));
 key=new THREE.DirectionalLight(0xfff2d9,3.3);key.position.set(-1.7,2.6,1.6);key.castShadow=true;key.shadow.mapSize.set(quality==='mobile'?1024:2048,quality==='mobile'?1024:2048);key.shadow.camera.left=-1;key.shadow.camera.right=1;key.shadow.camera.top=1;key.shadow.camera.bottom=-1;key.shadow.camera.near=.1;key.shadow.camera.far=6;key.shadow.bias=-.0004;key.shadow.normalBias=.003;key.shadow.radius=3;scene.add(key);
 const fill=new THREE.DirectionalLight(0xc2ddeb,1);fill.position.set(2,1,-1);scene.add(fill);
 const waterMaterial=new THREE.MeshPhysicalMaterial({color:0x719da9,roughness:.27,metalness:.24,clearcoat:.6,transparent:true,opacity:.18});
 waterMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWater;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWater=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWater;').replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal.x+=sin(vWater.x*130.+vWater.y*35.)*.025;normal.y+=cos(vWater.y*145.+vWater.x*23.)*.025;normal=normalize(normal);')};
 sea=new THREE.Mesh(new THREE.PlaneGeometry(8,6),waterMaterial);sea.rotation.x=-Math.PI/2;sea.position.set(0,-.014,-2.4);sea.receiveShadow=true;scene.add(sea);
 // Faint points in the distant air; never cross the text plane.
 const pos=new Float32Array(48*3);for(let i=0;i<48;i++){pos[i*3]=Math.sin(i*12.31)*1.5;pos[i*3+1]=.15+(i%9)*.035;pos[i*3+2]=-1.1-Math.cos(i*7.17)*.6}
 const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));scene.add(new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xf4eed5,size:.002,transparent:true,opacity:.16,depthWrite:false})));
 composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
 ssao=new SSAOPass(scene,camera,1,1);ssao.kernelRadius=.06;ssao.minDistance=.0003;ssao.maxDistance=.05;ssao.enabled=quality==='desktop';composer.addPass(ssao);
 bokeh=new BokehPass(scene,camera,{focus:1,aperture:.0003,maxblur:.003});bokeh.enabled=false;composer.addPass(bokeh);
 bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.055,.4,1.5);bloom.enabled=quality==='desktop';composer.addPass(bloom);composer.addPass(new SMAAPass());composer.addPass(new OutputPass());
}

function showError(message){failed=true;error=message;document.body.classList.add('model-error');document.body.classList.remove('model-ready');loadText.textContent=message;$('#retry').hidden=false;$('#retry').disabled=false;dirty=true}
async function loadModel(){
 const id=++reqId;activeController?.abort();activeController=new AbortController();const timer=setTimeout(()=>activeController.abort(),45000);
 failed=false;error=null;$('#retry').hidden=true;loadText.textContent='正在载入建筑';document.body.classList.remove('model-error');
 try{
  if(!renderer)setup();if(contextLost){location.reload();return}
  const variant=mobile()?'mobile':'desktop';const response=await fetch(`${import.meta.env.BASE_URL}assets/museum-${variant}.glb`,{signal:activeController.signal});if(!response.ok)throw new Error('model-http-'+response.status);
  const reader=response.body.getReader(),total=+response.headers.get('content-length');let received=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length;loadText.textContent=total?`正在载入建筑 ${Math.round(received/total*100)}%`:'正在载入建筑'}
  const bytes=new Uint8Array(received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);const gltf=await loader.parseAsync(bytes.buffer,`${import.meta.env.BASE_URL}assets/`);if(id!==reqId)return;
  if(model){scene.remove(model);model.traverse(o=>{if(o.isMesh)o.geometry.dispose()})}
  model=gltf.scene;model.scale.setScalar(.01);scene.add(model);model.updateMatrixWorld(true);
  roots={};model.traverse(o=>{if(o.name.endsWith('_Root'))roots[o.name]=o});
  const unique=new Set();debug.meshCount=0;debug.uvMeshes=0;debug.triangles=0;
  model.traverse(o=>{
   if(!o.isMesh)return;debug.meshCount++;debug.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;if(o.geometry.attributes.uv)debug.uvMeshes++;
   o.castShadow=!o.name.includes('Paving')&&!o.name.includes('Glass');o.receiveShadow=!o.name.includes('Glass');o.frustumCulled=true;
   for(const m of Array.isArray(o.material)?o.material:[o.material]){
    if(unique.has(m))continue;unique.add(m);m.envMapIntensity=.7;
    if(m.name.includes('Glass')){m.transmission=mobile()?0:.28;m.thickness=.01;m.ior=1.46;m.transparent=false;m.opacity=1;m.color.set(0x648088);m.roughness=.18;m.metalness=.24;m.side=THREE.DoubleSide}
    if(m.name.includes('Shell')){m.color.set(0xeff0e9);m.roughness=.31;m.metalness=.1}
    if(m.name.includes('Mullions')){m.color.set(0x50676a);m.roughness=.4}
    if(m.name.includes('Foliage')){m.roughness=.95;m.envMapIntensity=.25}
    heightFog(m);m.needsUpdate=true;
   }
  });
  debug.materialNames=[...unique].map(m=>m.name);debug.bounds=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray();debug.modelVariant=variant;
  // Layers share source materials; isolate runtime materials for local highlighting.
  for(const root of Object.values(roots))root.traverse(o=>{if(o.isMesh){const clone=m=>{const c=m.clone();heightFog(c);return c};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material)}});
  for(const name of ['Roof_Root','Skylight_Root','Facade_Root'])if(!roots[name])throw new Error('Missing semantic root '+name);
  loaded=true;failed=false;error=null;document.body.classList.add('model-ready');loadText.textContent='建筑已就绪';sizeDirty=true;dirty=true;
 }catch(e){if(id===reqId)showError(e.name==='AbortError'?'载入较慢，先欣赏建筑全景。':'三维暂未载入，建筑全景仍可浏览。');console.warn('Museum model:',e.message)}finally{clearTimeout(timer)}
}
$('#retry').addEventListener('click',()=>{if(contextLost)location.reload();else loadModel()});

const target=new THREE.Vector3(),direction=new THREE.Vector3(),projected=new THREE.Vector3();
let lastSize='',zoomWidth=0;
function updateScene(dt){
 const f=frameAt(progress),[x,y,w,h]=f.rect;
 stage.style.left=`${x*100}%`;stage.style.top=`${y*100}%`;stage.style.width=`${w*100}%`;stage.style.height=`${h*100}%`;
 stage.style.opacity=String(1-.97*(1-smooth(Math.abs(progress-4))));
 $('.sky').style.opacity=String(lerp(.80,.33,1-smooth(Math.abs(progress-2))));
 const width=Math.round(innerWidth*w),height=Math.round(innerHeight*h),size=`${width}:${height}:${adaptiveDPR}`;
 if(size!==lastSize||sizeDirty){renderer.setPixelRatio(adaptiveDPR);renderer.setSize(width,height,false);composer.setPixelRatio(adaptiveDPR);composer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();lastSize=size;sizeDirty=false}
 // Smooth camera focus changes inside a chapter as well as between chapters.
 if(!zoomWidth)zoomWidth=f.width;zoomWidth=lerp(zoomWidth,f.width,reduced?1:1-Math.exp(-dt*7));
 target.lerp(new THREE.Vector3(...f.target),reduced?1:1-Math.exp(-dt*10));direction.set(...f.dir).normalize();
 const distance=zoomWidth/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect);
 camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld();key.intensity=f.light*.75;
 explosion=lerp(explosion,f.explode,reduced?1:1-Math.exp(-dt*8));if(Math.abs(explosion-f.explode)<.0005)explosion=f.explode;
 if(loaded){
  roots.Roof_Root.position.y=explosion*9;roots.Skylight_Root.position.y=explosion*18;
  roots.Roof_Root.traverse(o=>{if(o.isMesh&&o.name.includes('Paving'))o.visible=Math.abs(progress-3)<.65});
  yaw=lerp(yaw,targetYaw,reduced?1:1-Math.exp(-dt*8));model.rotation.y=yaw;
  const names={roof:'Roof_Root',skylight:'Skylight_Root',facade:'Facade_Root'};
  for(const [keyName,root] of Object.entries(roots))root.traverse(o=>{if(o.isMesh){const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)if(m.emissive)m.emissive.setHex(active===2&&names[highlight]===keyName?0x15220a:0)}});
  const pts={roof:[-.3,.20+explosion*.09,.10],skylight:[.02,.25+explosion*.18,-.02],facade:[.43,.055,.2]};
  for(const el of document.querySelectorAll('[data-anchor]')){projected.set(...pts[el.dataset.anchor]).project(camera);el.style.left=`${(x+(projected.x*.5+.5)*w)*innerWidth}px`;el.style.top=`${(y+(-projected.y*.5+.5)*h)*innerHeight}px`}
 }
 bokeh.enabled=quality==='desktop'&&Math.abs(progress-3)<.24;bokeh.uniforms.focus.value=distance;bokeh.uniforms.aperture.value=.0004;
}
function tick(time){
 requestAnimationFrame(tick);if(document.hidden||!renderer||contextLost)return;
 const dt=last?Math.min((time-last)/1000,.1):.016;last=time;
 const changing=Math.abs(progress-raw)>.0005||Math.abs(yaw-targetYaw)>.0005||Math.abs(explosion-frameAt(progress).explode)>.0005||Math.abs(zoomWidth-frameAt(progress).width)>.0005;
 if(!dirty&&!changing)return;
 if(time-lastRender<(quality==='mobile'?1000/40:1000/60)-1)return;
 const prev=lastRender;lastRender=time;const step=Math.min(prev?(time-prev)/1000:.016,.1);
 progress=lerp(progress,raw,reduced?1:1-Math.exp(-step*10));if(Math.abs(progress-raw)<.0005)progress=raw;
 updateScene(step);const start=performance.now();renderer.info.reset();composer.render();lastFrameCost=performance.now()-start;frames++;dirty=false;
 if(changing&&prev&&time-prev<200){fpsSamples.push(1000/(time-prev));if(fpsSamples.length>90)fpsSamples.shift();measuredFPS=Math.round(fpsSamples.reduce((a,b)=>a+b,0)/fpsSamples.length)}
 if(fpsSamples.length>=80&&measuredFPS<27&&adaptiveDPR>.8){adaptiveDPR=Math.max(.8,adaptiveDPR-.2);ssao.enabled=false;bokeh.enabled=false;bloom.enabled=false;quality='mobile';fpsSamples=[];sizeDirty=true;dirty=true}
}
loadModel();requestAnimationFrame(tick);
if(location.hash){const chapter=document.getElementById(location.hash.slice(1));if(chapter)requestAnimationFrame(()=>{scrollTo({top:chapter.offsetTop,behavior:'instant'});readScroll()})}
