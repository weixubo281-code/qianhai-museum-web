import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report={url:'http://127.0.0.1:4187',errors:[],checks:[]};
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const p=await browser.newPage({viewport,deviceScaleFactor:1});p.on('pageerror',e=>report.errors.push(e.message));await p.goto(report.url);await p.waitForFunction(()=>window.__museum?.state().loaded,{},{timeout:60000});
  for(const i of [0,2,5]){await p.evaluate(i=>scrollTo({top:document.querySelectorAll('.chapter')[i].offsetTop,behavior:'instant'}),i);await p.waitForFunction(i=>window.__museum.state().progress===i,i);const s=await p.evaluate(()=>window.__museum.state());assert.equal(s.active,i);report.checks.push({width:viewport.width,chapter:i+1,model:s.modelVariant,meshes:s.meshCount});}
  await p.close();
 }
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;process.exitCode=1}finally{await fs.writeFile('qa/production-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close()}
