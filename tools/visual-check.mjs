import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,1400))});
await page.goto('http://127.0.0.1:4186');
await page.waitForFunction(()=>window.__museum?.state().loaded||window.__museum?.state().failed,{},{timeout:60000});
await page.waitForTimeout(2500);
for(let i=0;i<6;i++){await page.evaluate(i=>scrollTo({top:document.querySelectorAll('.chapter')[i].offsetTop,behavior:'instant'}),i);await page.waitForTimeout(2000);console.log('SCREEN',i,JSON.stringify(await page.evaluate(()=>window.__museum.state())));await page.screenshot({path:`qa/desktop-${i+1}.png`});}
await browser.close();
