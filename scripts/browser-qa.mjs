// Native headless Chrome / CDP checks, using the same software-WebGL setup as
// the design skill's screenshot runner. No browser automation package required.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const root=process.cwd(), out=path.join(root,'.qa');fs.mkdirSync(out,{recursive:true});
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
if(!chrome)throw Error('No supported Chrome/Edge executable found');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'radar-qa-'));
const child=spawn(chrome,['--headless=new',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--mute-audio','--disable-gpu','--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));const pending=new Map(),events=[];let id=0,ws;
function kill(){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true})}catch{child.kill()}}
const timeout=setTimeout(()=>{kill();process.exit(2)},240000);
let session;const results=[];
try{
  let port;for(let i=0;i<100;i++){try{port=parseInt(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8'));if(port)break}catch{}await delay(100)}
  const ver=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();ws=new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}else events.push(m)});
  const send=(method,params={},sessionId)=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params,sessionId}))});
  const {result:{targetId}}=await send('Target.createTarget',{url:'about:blank'});session=(await send('Target.attachToTarget',{targetId,flatten:true})).result.sessionId;
  const S=async(method,params={})=>{const r=await send(method,params,session);if(r.error)throw Error(r.error.message);return r.result};
  const ev=async(expression)=>{const r=await S('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  const assert=async(name,expr)=>{if(!await ev(expr))throw Error(`Failed: ${name}`);results.push(name)};
  const click=async(text,selector='button')=>{await ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim().startsWith(${JSON.stringify(text)}));if(!e)throw Error('Missing control: '+${JSON.stringify(text)});e.click()})()`);await delay(150)};
  const size=async(w,h)=>S('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<600});
  const shot=async name=>{const r=await S('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name),Buffer.from(r.data,'base64'))};
  const change=async(selector,value)=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);await delay(200)};
  await S('Page.enable');await S('Runtime.enable');await S('DOM.enable');await size(1440,1000);await S('Page.navigate',{url:'http://127.0.0.1:5173/'});await delay(4000);await ev('document.fonts.ready');
  await assert('Landing scene renders',`document.querySelector('.radar-stage canvas')?.width>0`);await shot('hero-desktop.png');
  const scene=await ev(`(()=>{const b=document.querySelector('.radar-stage').getBoundingClientRect();return{x:Math.max(b.x,680),y:110,width:Math.min(innerWidth-690,700),height:650,scale:1}})()`);
  await ev(`document.querySelector('.atmosphere-word').style.visibility='hidden'`);
  const poster=await S('Page.captureScreenshot',{format:'png',clip:scene});fs.writeFileSync(path.join(root,'public/radar-poster.png'),Buffer.from(poster.data,'base64'));
  await ev(`document.querySelector('.atmosphere-word').style.visibility=''`);
  const beforePulse=(await S('Page.captureScreenshot',{format:'png',clip:scene})).data;await click('Send a pulse');await delay(180);const afterPulse=(await S('Page.captureScreenshot',{format:'png',clip:scene})).data;if(beforePulse===afterPulse)throw Error('Pulse action did not alter the scene');results.push('Send a pulse changes the rendered field');await delay(1800);
  const beforeDrag=(await S('Page.captureScreenshot',{format:'png',clip:scene})).data;await S('Input.dispatchMouseEvent',{type:'mousePressed',x:1000,y:420,button:'left',buttons:1,clickCount:1});await S('Input.dispatchMouseEvent',{type:'mouseMoved',x:1120,y:420,button:'left',buttons:1});await S('Input.dispatchMouseEvent',{type:'mouseReleased',x:1120,y:420,button:'left',buttons:0,clickCount:1});await delay(400);if(beforeDrag===(await S('Page.captureScreenshot',{format:'png',clip:scene})).data)throw Error('Drag action did not rotate the scene');results.push('Dragging rotates the radar view');await click('Reset');await delay(400);
  await ev('scrollTo(0,innerHeight)');await delay(400);await assert('Scroll opens a spatial sampling field without a PPI card',`parseFloat(getComputedStyle(document.querySelector('.hero')).getPropertyValue('--journey'))>.8&&!document.querySelector('.beam-panel')&&document.querySelector('.radar-stage canvas').width>0`);await shot('beam-transition.png');
  await ev(`location.hash='#/dashboard'`);await delay(600);
  await assert('Only purposeful workspace and library navigation remain',`[...document.querySelectorAll('.sidebar nav button')].length===2&&![...document.querySelectorAll('.sidebar button')].some(e=>e.textContent.includes('Overview')||e.textContent.includes('Rainfall analysis'))`);
  await assert('PPI canvas renders',`document.querySelector('.plot-panel canvas').width>0`);await shot('workspace-desktop.png');
  await assert('Supporting labels enlarged',`parseFloat(getComputedStyle(document.querySelector('.control-panel label')).fontSize)>=12&&parseFloat(getComputedStyle(document.querySelector('.timeline-track button')).fontSize)>=11`);
  fs.mkdirSync(path.join(out,'downloads'),{recursive:true});await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(out,'downloads')});
  await ev(`document.querySelector('.export-menu').open=true`);await click('Selected gates (.csv)');await click('Data & provenance (.json)');await click('PPI image (.png)');await delay(700);
  if(!['.csv','.json','.png'].every(ext=>fs.readdirSync(path.join(out,'downloads')).some(f=>f.endsWith(ext))))throw Error('Export download missing');results.push('PNG, CSV and JSON exports download');await ev(`document.querySelector('.export-menu').open=false`);
  await change('.control-panel select','rainfall');await assert('Scan-derived rainfall has units and method',`document.querySelector('.colorbar-row').textContent.includes('mm/hr')&&document.querySelector('.rainfall-method').textContent.includes('Estimated from this scan')`);await shot('rainfall-desktop.png');
  await click('Regional map');await assert('Map view opens',`!!document.querySelector('.map-zoom')`);await shot('map-desktop.png');
  await click('PPI view');await click('Data library');await assert('Six demo files listed',`document.querySelectorAll('.file-table tbody tr').length===6`);
  await change('.search-field input','no-such-file');await assert('Search empty state',`!!document.querySelector('.empty-search')`);await click('Clear search');
  const {root:dom}=await S('DOM.getDocument');const input=(await S('DOM.querySelector',{nodeId:dom.nodeId,selector:'input[type=file]'})).nodeId;await S('DOM.setFileInputFiles',{nodeId:input,files:[path.join(root,'.qa/fixture.nc')]});await delay(1700);
  await assert('NetCDF upload reaches local API',`document.querySelectorAll('.file-table tbody tr').length===7`);await click('Explore','tr:first-child button');
  await delay(1200);await assert('Uploaded file loads an actual PPI',`document.querySelector('.data-badge').textContent==='Uploaded file'&&!!document.querySelector('.plot-panel canvas')`);
  await assert('Subkilometer range is labelled in metres',`document.querySelector('.control-panel input[type=range]').parentElement.textContent.includes('400 m')`);
  await shot('uploaded-scan.png');await click('Data library');await ev(`document.querySelector('button[aria-label="Remove fixture.nc"]').click()`);await delay(400);await assert('Uploaded file removal',`document.querySelectorAll('.file-table tbody tr').length===6`);
  await assert('Python rainfall endpoint remains available without calculator page',`fetch('/api/rainfall',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dbz:[30],a:200,b:1.6})}).then(r=>r.json()).then(d=>Math.abs(d.rates[0]-2.7343635285)<.00001)`);
  await click('Data & methodology');await assert('Scientific limitations visible',`document.querySelector('.methods-layout').textContent.includes('Scientific limits')`);
  await click('Radar workspace');await size(390,844);await delay(500);await assert('Mobile workspace has no horizontal overflow',`document.documentElement.scrollWidth<=innerWidth`);await shot('workspace-mobile.png');
  await ev(`location.hash='#/'`);await delay(1200);await assert('Mobile scene simplified',`document.querySelector('.hero').classList.contains('still')&&!document.querySelector('.radar-stage canvas')&&document.querySelector('.radar-static-poster').naturalWidth>0`);await shot('hero-mobile.png');await ev(`document.querySelector('.mobile-menu').click()`);await assert('Mobile menu opens',`document.querySelector('.landing-nav nav').classList.contains('nav-open')`);await shot('menu-mobile.png');
  await size(1440,900);await S('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(500);await assert('Reduced motion removes scroll scene',`document.querySelector('.hero').classList.contains('still')&&!document.querySelector('.radar-stage canvas')`);await shot('reduced-motion.png');
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);
  if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:results.length,checks:results,runtimeErrors:errors},null,2));console.log(JSON.stringify({passed:results.length,checks:results,runtimeErrors:errors},null,2));
}finally{clearTimeout(timeout);ws?.close();kill();}
