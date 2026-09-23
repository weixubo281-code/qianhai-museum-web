import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,weld,simplifyPrimitive,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
const dest='public/assets';await fs.mkdir(dest,{recursive:true});
const incoming=['7d380da5-7562-4b2e-a7d5-3fc8f3f87607','23ab7a37-6751-44f2-b437-42749cb3cefc','d5df2357-8f14-4919-8506-978c5d66981e','612e8d59-33c1-4e0c-9969-9a552c2a455f','0af6377c-69fa-487b-9542-e118a7756a9e'].map(id=>`C:/Users/MSN/AppData/Local/Temp/codex-clipboard-${id}.png`);
await fs.mkdir('source-reference',{recursive:true});const refs=incoming.map((_,i)=>`source-reference/architecture-${i+1}.png`);
for(let i=0;i<refs.length;i++){try{await fs.access(refs[i])}catch{await fs.copyFile(incoming[i],refs[i])}}
for(let i=0;i<refs.length;i++)await sharp(refs[i]).resize({width:1600,withoutEnlargement:true}).webp({quality:86}).toFile(`${dest}/reference-${i+1}.webp`);
await sharp(refs[1]).extract({left:0,top:40,width:1672,height:265}).resize(1800,390).webp({quality:85}).toFile(`${dest}/coastal-sky.webp`);
await sharp(refs[0]).resize(1400).webp({quality:86}).toFile(`${dest}/poster.webp`);
await sharp(refs[0]).resize(800).webp({quality:80}).toFile(`${dest}/poster-mobile.webp`);
const screens=await fs.readdir('../深圳前海自然博物馆-六屏网站设计');await fs.mkdir('design-reference',{recursive:true});
for(const file of screens)if(file.endsWith('.png'))await fs.copyFile(`../深圳前海自然博物馆-六屏网站设计/${file}`,`design-reference/${file}`);
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const metrics={};
for(const variant of ['desktop','mobile']){
 const doc=await io.read('work/museum-raw.glb');
 for(const node of doc.getRoot().listNodes()){const extras={...node.getExtras()};delete extras.sourceObjects;extras.sourceManifest='work/source-objects.json';node.setExtras(extras)}
 await doc.transform(dedup(),weld());
 if(variant==='mobile')for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
  const name=prim.getMaterial()?.getName()||'';
  if(name.includes('Mullions')){const p=prim.getAttribute('POSITION'),n=prim.getAttribute('NORMAL');if(n){const positions=p.getArray(),normals=n.getArray();for(let i=0;i<positions.length;i++)positions[i]+=normals[i]*.045}}
  // Keep the thin facade grid intact. Only vegetation is simplified aggressively.
  if(name.includes('Foliage')||name.includes('Tree bark'))simplifyPrimitive(prim,{simplifier:MeshoptSimplifier,ratio:.30,error:.003,lockBorder:true});
 }
 await doc.transform(meshopt({encoder:MeshoptEncoder,level:'medium',quantizePosition:16,quantizeNormal:12}));
 const file=`${dest}/museum-${variant}.glb`;await io.write(file,doc);
 const roots=doc.getRoot().listNodes().filter(n=>n.getName().endsWith('_Root')).map(n=>n.getName());
 metrics[variant]={bytes:(await fs.stat(file)).size,meshes:doc.getRoot().listMeshes().length,nodes:doc.getRoot().listNodes().length,materials:doc.getRoot().listMaterials().length,animations:doc.getRoot().listAnimations().length,triangles:doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0),roots};
 console.log(variant,metrics[variant]);
}
const source='source/blender/Qianhai_Nature_Museum.blend';
const index={project:'深圳前海自然博物馆',sourceBlend:source,sourceSHA256:crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex'),sourceMaterials:'source/blender/Museum_Materials.blend',designScreens:screens.filter(f=>f.endsWith('.png')).map(f=>`design-reference/${f}`),models:{desktop:'public/assets/museum-desktop.glb',mobile:'public/assets/museum-mobile.glb'},sourceObjectManifest:'work/source-objects.json',metrics,coordinates:{source:'Z-up meters',web:'Y-up meters',runtimeScale:.01,front:'+Z',origin:'building ground center'},materials:{source:'Original PBR factors retained; no external source textures. Existing UVs retained; generated box UVs for source meshes without UVs.',water:'Realtime wave normal shader replaces Blender procedural water.'},hierarchy:'Original source has no parent relationships or animations. Runtime semantic layers contain static material batches. Original names and transforms are retained in the manifest; source .blend is unmodified.',atmosphere:{image:'public/assets/coastal-sky.webp',provenance:'Sky-and-mountain-only crop from user-provided reference 2; not another building.'},limitations:['Approximate exterior model from prior stage, not measured architecture.','Exterior separation is an illustrative envelope study, not a construction sequence.']};
await fs.writeFile('asset-index.json',JSON.stringify(index,null,2));
