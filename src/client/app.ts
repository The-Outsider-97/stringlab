export {}; // Isolate module bindings from Window.frames
/* SLAI StringLab browser client. Physically determined vertex data comes only from
 * the Python engine; this view changes its projection, never the equations. */
interface Mode {n:number;axis:number;enabled:boolean;amplitude?:number;phase?:number;left?:number;right?:number;phase_left?:number;phase_right?:number}
interface Config {schema:number;kind:'open'|'closed';theory:string;dimensions:number;p_plus:number;alpha_prime:number;bc:string;zero_velocity:number[];anchor_start:number[];anchor_end:number[];modes:Mode[];solver:'analytical'|'finite_difference';points:number;dt:number;duration:number;projection:string[];display:{worldsheet:boolean;grid:boolean;color:string};description:string}
interface Frame {time:number;geometry:number[][];projection:string[];projection_kind:string;closed:boolean;status:string;diagnostics:Record<string,unknown>;solver:string;samples:number}
interface Preset {id:number;kind:string;title:string;category:string;objective:string;configuration:Config;quantum:Record<string,unknown>|null;limitation:string|null}
interface Saved {id:string;revision:number;title:string;updated_utc:string}
interface Envelope<T> {ok:boolean;data?:T;error?:{message?:string;hint?:string}}
const $ = <T extends HTMLElement = HTMLElement>(id:string):T => {const obj=document.getElementById(id);if(!obj) throw Error(`Missing ${id}`);return obj as T;};
function e<K extends keyof HTMLElementTagNameMap>(tag:K, cls='', text=''):HTMLElementTagNameMap[K]{const x=document.createElement(tag);if(cls)x.className=cls;if(text)x.textContent=text;return x;}
function clone<T>(x:T):T{return structuredClone(x);}
function setText(id:string,value:unknown):void{$(id).textContent=String(value);}
function num(x:unknown,digits=5):string {return typeof x==='number'&&Number.isFinite(x)?x.toPrecision(digits):String(x??'—');}
function errorText(msg:string):void{const box=$('errorBanner');box.textContent=msg;box.hidden=false;setText('statusText','Configuration error');}
function clearError():void{$('errorBanner').hidden=true;}
const marker='X-SLAI-Stringlab';
async function request<T>(path:string,body?:unknown,method='POST'):Promise<T>{
 const opts:RequestInit={method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',[marker]:'1'}};
 if(body!==undefined){(opts.headers as Record<string,string>)['Content-Type']='application/json';opts.body=JSON.stringify(body);}
 const res=await fetch(`/api${path}`,opts);let env:Envelope<T>;
 try{env=await res.json() as Envelope<T>;}catch{throw Error(`Unexpected API response (${res.status}).`);}
 if(!res.ok||!env.ok)throw Error(env.error?.message||`Request failed (${res.status})`);
 return env.data as T;
}
async function download(path:string,body:unknown,filename:string):Promise<void>{
 const res=await fetch(`/api${path}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',[marker]:'1'},body:JSON.stringify(body)});
 if(!res.ok){let msg=`Export failed (${res.status})`;try{const data=await res.json() as Envelope<unknown>;msg=data.error?.message||msg;}catch{}throw Error(msg);}
 const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
let presets:Preset[]=[];let selectedPreset=1;let config:Config;let quantum:Record<string,unknown>={};let frames:Frame[]=[];let frameIndex=0;
let revision=0;let savedId:string|null=null;let savedRevision=0;let title='Untitled experiment';let playing=false;let startPlay=0;let lastTick=0;
let activeTab='results';let listFilter='all';let compareBase:Config|null=null;let comparison:Frame|null=null;
let sweepResults:Array<Record<string,unknown>>|null=null;let convergenceResults:Array<Record<string,unknown>>|null=null;
let quantumResults:Record<string,unknown>|null=null;let dualResults:Record<string,unknown>|null=null;
let formats:{sgeo:boolean;sdrw:boolean;pdf:boolean}={sgeo:false,sdrw:false,pdf:false};
let autoFitAfterCompute=true;let yaw=.45;let pitch=-.24;let zoom=1;let panX=0;let panY=0;let fittedCenter=[0,0,0];let fittedScale=1;
let dragging=false;let lastPointer=[0,0];let pointerMode='orbit';let hoverIndex=-1;let ortho=false;let grid=true;let worldsheet=false;
const viewport=$<HTMLCanvasElement>('viewport');const vctx=viewport.getContext('2d');if(!vctx)throw Error('Canvas 2D is unavailable');
const ctx=vctx;
function warn(err:unknown):void{errorText(err instanceof Error?err.message:String(err));}
function applyPreset(p:Preset):void{
 selectedPreset=p.id;config=clone(p.configuration);quantum=clone(p.quantum||quantum);
 title=p.title;savedId=null;savedRevision=0;frames=[];frameIndex=0;
 sweepResults=null;convergenceResults=null;dualResults=null;quantumResults=null;
 worldsheet=!!config.display.worldsheet;grid=!!config.display.grid;compareBase=null;
 setText('experimentTitle',p.title);setText('experimentCategory',p.category.toUpperCase());
 setText('experimentObjective',p.objective);setText('modelBadge',p.category.toUpperCase());
 setText('modelTypeText',config.dimensions+'D LIGHT-CONE');
 populateFields();renderPresets();autoFitAfterCompute=true;computeSoon(0);
 if(p.quantum&&activeTab==='results'){activeTab='quantum';setActiveTab();}
}
function renderPresets():void{const host=$('presetList');host.replaceChildren();
 for(const p of presets){if(listFilter==='quantum'&&!p.quantum)continue;if(listFilter==='classical'&&p.quantum)continue;
 const b=e('button','preset'+(selectedPreset===p.id?' selected':''));b.type='button';b.title=p.objective;
 const n=e('span','preset-index',String(p.id).padStart(2,'0'));
 const txt=e('span','preset-text');const name=e('strong','',p.title.replace(/^\d+ · /,''));const tag=e('em','',p.category);txt.append(name,tag);b.append(n,txt);
 b.addEventListener('click',()=>applyPreset(p));host.appendChild(b);
 }}
function inputValue(id:string):string{return ($<HTMLInputElement|HTMLSelectElement>(id)).value;}
function populateFields():void{
 ($<HTMLSelectElement>('kind')).value=config.kind;
 ($<HTMLSelectElement>('bc')).replaceChildren(...(config.kind==='open'?[
  new Option('Neumann · Neumann','NN'),new Option('Dirichlet · Dirichlet','DD'),
  new Option('Neumann · Dirichlet','ND'),new Option('Dirichlet · Neumann','DN')]:[new Option('Periodic','periodic')]));
 ($<HTMLSelectElement>('bc')).value=config.bc;
 for(const [id,value] of [['dimensions',config.dimensions],['alphaPrime',config.alpha_prime],['pPlus',config.p_plus],['points',config.points],['dt',config.dt],['duration',config.duration],['start1',config.anchor_start[0]],['end1',config.anchor_end[0]]] as Array<[string,number]>)($<HTMLInputElement>(id)).value=String(value);
 ($<HTMLSelectElement>('solver')).value=config.solver;
 const available=['σ','X+','X-',...Array.from({length:config.dimensions-2},(_,i)=>`X${i+1}`)];
 config.projection=config.projection.map((coord,i)=>available.includes(coord)?coord:available[i]);
 ['proj0','proj1','proj2'].forEach((id,i)=>{const sel=$<HTMLSelectElement>(id);sel.replaceChildren(...available.map(x=>new Option(x,x)));sel.value=config.projection[i];});
 showProjectionNotice();modeControls();showTension();
 $('gridBtn').classList.toggle('active',grid);$('worldsheetBtn').classList.toggle('active',worldsheet);
}
function showProjectionNotice():void{const isParam=config.projection.includes('σ');setText('projectionHint',isParam?'σ is a worldsheet parameter (NOT a target-space axis). This 3D view is a parameter-space diagram.':'These are selected target-space coordinates. Other target dimensions are hidden.');}
function showTension():void{setText('tension',(1/(2*Math.PI*config.alpha_prime)).toPrecision(6));}
function modeControls():void{const host=$('modeList');host.replaceChildren();
 config.modes.forEach((mode,i)=>{
  const card=e('div','mode-card');const head=e('div','mode-header');const label=e('label');const on=e('input') as HTMLInputElement;on.type='checkbox';on.checked=mode.enabled;on.addEventListener('change',()=>{mode.enabled=on.checked;touch();});
  label.append(on,document.createTextNode('Mode '+(i+1)));
  const rm=e('button','mode-delete','✕');rm.title='Remove mode';rm.addEventListener('click',()=>{config.modes.splice(i,1);modeControls();touch();});head.append(label,rm);card.appendChild(head);
  const grid=e('div','mode-fields');
  const make=(name:string,key:keyof Mode,value:number,min?:number,max?:number)=>{const wrap=e('label','',name);const el=e('input') as HTMLInputElement;el.type='number';el.step=key==='n'||key==='axis'?'1':'0.05';el.value=String(value);if(min!==undefined)el.min=String(min);if(max!==undefined)el.max=String(max);
    el.addEventListener('change',()=>{(mode as unknown as Record<string,number>)[key]=Number(el.value);touch();});wrap.appendChild(el);grid.appendChild(wrap);};
  make('Harmonic n','n',mode.n,1,32);make('Axis Xi','axis',mode.axis,1,config.dimensions-2);
  if(config.kind==='open'){make('Amplitude','amplitude',mode.amplitude??0, -5, 5);make('Phase (rad)','phase',mode.phase??0);}
  else{make('Left amplitude','left',mode.left??0,-5,5);make('Right amplitude','right',mode.right??0,-5,5);make('Left phase','phase_left',mode.phase_left??0);make('Right phase','phase_right',mode.phase_right??0);}
  card.appendChild(grid);host.appendChild(card);
 });}
let computeTimer=0;
function computeSoon(delay=250):void{window.clearTimeout(computeTimer);computeTimer=window.setTimeout(()=>{void compute();},delay);}
function touch():void{revision++;clearError();computeSoon();}
async function compute():Promise<void>{const serial=++revision;playing=false;setText('playBtn','▶');setText('statusText','Computing');
 try{const newFrames=await request<Frame[]>('/series',{configuration:config,frames:80});if(serial!==revision)return;
  frames=newFrames;frameIndex=0;const tl=$<HTMLInputElement>('timeline');tl.max=String(frames.length-1);tl.value='0';
  if(autoFitAfterCompute){fit();autoFitAfterCompute=false;}
  setText('statusText','Simulation ready');clearError();updateVisible();
 }catch(err){if(serial!==revision)return;frames=[];warn(err);updateVisible();}}
function updateVisible():void{
 const f=frames[frameIndex];if(f){setText('timeValue',`τ = ${f.time.toFixed(2)}`);setText('frameInfo',`FRAME ${frameIndex+1} / ${frames.length}`);
 const r=f.diagnostics.level_matching_residual;setText('validityText',`${f.status.replaceAll('_',' ')} · constraint ${num(r,3)}`);
 setText('coordLabel',f.projection.join(' · '));setText('outputTypeText',f.projection_kind==='parameter_space_diagram'?'WORLDSHEET PARAMETER DIAGRAM':'3D TARGET PROJECTION');
 }else{setText('validityText','No valid simulation result');}
 drawScene();if(['results','charts','compare'].includes(activeTab))renderPanel();}
function setFrame(index:number):void{frameIndex=Math.max(0,Math.min(frames.length-1,Math.floor(index)));($<HTMLInputElement>('timeline')).value=String(frameIndex);updateVisible();}
function playTick(now:number):void{
 requestAnimationFrame(playTick);
 if(playing&&frames.length){if(!lastTick)lastTick=now;const elapsed=(now-lastTick)/1000;lastTick=now;const speed=Number(inputValue('speedSelect'));
  startPlay+=elapsed*speed;const seconds=frames[frames.length-1].time||1;
  const k=Math.floor((startPlay%seconds)/seconds*(frames.length-1));if(k!==frameIndex)setFrame(k);
 }
}
function play():void{if(!frames.length)return;playing=!playing;lastTick=0;startPlay=frames[frameIndex].time;setText('playBtn',playing?'❚❚':'▶');}
function fit():void{if(!frames.length){zoom=1;panX=0;panY=0;return;}
 const all=frames.flatMap((f,i)=>i%7===0?f.geometry:[]);if(!all.length)return;
 let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of all){for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}}
 fittedCenter=lo.map((v,i)=>(v+hi[i])/2);
 fittedScale=Math.max(0.2,...hi.map((v,i)=>v-lo[i]));zoom=1;panX=0;panY=0;drawScene();}
function canvasBounds(canvas:HTMLCanvasElement,c:CanvasRenderingContext2D):{w:number;h:number;dpr:number}{const box=canvas.getBoundingClientRect();const dpr=Math.min(2,window.devicePixelRatio||1);const w=Math.max(1,box.width),h=Math.max(1,box.height);
 if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);}
 c.setTransform(dpr,0,0,dpr,0,0);return {w,h,dpr};}
function projected(p:number[],w:number,h:number):{x:number;y:number;depth:number}{
 const x=p[0]-fittedCenter[0],y=p[1]-fittedCenter[1],z=p[2]-fittedCenter[2];
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const xr=cy*x-sy*z;const zr=sy*x+cy*z;const yr=cp*y-sp*z;const dep=sp*y+cp*z;
 const scl=(Math.min(w,h)*.63*zoom)/Math.max(.05,fittedScale);
 const perspective=ortho?1:Math.max(.3,Math.min(3,1/(1+dep/Math.max(2,5*fittedScale))));
 return {x:w/2+panX+xr*scl*perspective,y:h/2+panY-yr*scl*perspective,depth:dep};}
function drawPolyline(points:number[][],w:number,h:number,col:string,alpha=1,width=2,glow=false,close=false):void{
 if(points.length<2)return;ctx.save();ctx.strokeStyle=col;ctx.globalAlpha=alpha;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';
 if(glow){ctx.shadowColor=col;ctx.shadowBlur=14;}
 ctx.beginPath();const first=projected(points[0],w,h);ctx.moveTo(first.x,first.y);
 for(let i=1;i<points.length;i++){const p=projected(points[i],w,h);ctx.lineTo(p.x,p.y);}if(close)ctx.lineTo(first.x,first.y);ctx.stroke();ctx.restore();}
function drawScene():void{const {w,h}=canvasBounds(viewport,ctx);ctx.clearRect(0,0,w,h);if(!frames.length)return;
 const current=frames[frameIndex];
 if(grid){const s=Math.max(.1,fittedScale);const center=fittedCenter;for(let j=-6;j<=6;j++){
  const offset=j*s/6;const a=[center[0]-s*.55,center[1]+offset,center[2]];const b=[center[0]+s*.55,center[1]+offset,center[2]];
  const c=[center[0]+offset,center[1]-s*.55,center[2]];const d=[center[0]+offset,center[1]+s*.55,center[2]];
  drawPolyline([a,b],w,h,'#4d7184',.13,.8);drawPolyline([c,d],w,h,'#4d7184',.13,.8);
 }}
 if(worldsheet){const number=Math.max(1,Math.floor(frames.length/22));
  for(let i=0;i<frames.length;i+=number){drawPolyline(frames[i].geometry,w,h,'#289dbf',.12,1,false,frames[i].closed);}
  for(let pt=0;pt<Math.min(current.geometry.length,192);pt+=Math.max(2,Math.floor(current.geometry.length/32))){
   const points:number[][]=[];for(let i=0;i<frames.length;i+=number){points.push(frames[i].geometry[pt]);}
   drawPolyline(points,w,h,'#5bbbd7',.12,.6);
  }
 }
 drawPolyline(current.geometry,w,h,'#185d86',.45,7,true,current.closed);
 drawPolyline(current.geometry,w,h,config.display.color||'#4db9e7',.97,2.3,true,current.closed);
 if(!current.closed){for(const pt of [current.geometry[0],current.geometry[current.geometry.length-1]]){
  const p=projected(pt,w,h);ctx.fillStyle='#aceaff';ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fill();
 }}
 if(hoverIndex>=0&&hoverIndex<current.geometry.length){const v=current.geometry[hoverIndex],pt=projected(v,w,h);
  ctx.fillStyle='#e7f7ff';ctx.beginPath();ctx.arc(pt.x,pt.y,4,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#162d3e';ctx.fillRect(Math.min(w-165,pt.x+10),Math.max(10,pt.y-34),154,23);
  ctx.font='11px Consolas,monospace';ctx.fillStyle='#bde6f5';ctx.fillText(v.map(n=>n.toFixed(2)).join(', '),Math.min(w-160,pt.x+15),Math.max(25,pt.y-19));
 }}
function renderPanel():void{const host=$('panelContent');host.replaceChildren();const f=frames[frameIndex];
 if(activeTab==='results'){
  if(!f){host.appendChild(e('p','note-row','Choose an experiment or correct invalid parameters.'));return;}
  const d=f.diagnostics;
  const cards=e('div','metric-grid');for(const [name,value,cls] of [
   ['GAUGE-FIXED ENERGY',num(d.energy),''],['GLOBAL CONSTRAINT',num(d.level_matching_residual,3),Number(d.level_matching_residual)<1e-8?'good':'warn'],
   ['MODEL STATUS',f.status.replaceAll('_',' '),f.status.startsWith('physical')?'good':'warn'],['STRING TENSION',num(d.tension??1/(2*Math.PI*config.alpha_prime)),'']]){
   const card=e('div','metric-card');card.append(e('small','',name),e('strong',cls,value));cards.appendChild(card);}host.appendChild(cards);
  host.appendChild(e('p','note-row',`${f.solver==='analytical'?'Analytical Fourier solution':'Finite-difference wave evolution'} · ${f.samples} spatial samples · ${f.projection.join(' / ')} · ${f.projection_kind==='parameter_space_diagram'?'Parametric diagram: σ is not physical space.':'Target-space coordinate projection.'}`));
 }else if(activeTab==='charts'){
  host.appendChild(e('h3','panel-heading','Energy / constraint evolution'));
  const chart=e('canvas','chart-canvas');host.appendChild(chart);host.appendChild(e('p','note-row','Sampled values are produced by the selected mathematical solver. Energy is the gauge-fixed transverse Hamiltonian.'));
  requestAnimationFrame(()=>plotChart(chart,frames.map(x=>[x.time,Number(x.diagnostics.energy)||0]),'#4db9e7'));
 }else if(activeTab==='math'){
  host.append(e('h3','panel-heading','Equations and physical-state restrictions'));
  const formulas=[
   'Metric: ds² = −2 dX⁺dX⁻ + Σᵢ(dYᵢ)²',
   'Light-cone gauge: X⁺ = p⁺τ  (p⁺ > 0)',
   'Transverse equation: ∂²τYᵢ − ∂²σYᵢ = 0',
   'Virasoro: ∂σX⁻ = (∂τY · ∂σY) / p⁺',
   'Virasoro: ∂τX⁻ = (|∂τY|² + |∂σY|²) / (2p⁺)',
   'Closed-string closure: ∮ dσ (∂τY · ∂σY) = 0',
   'String tension: T = 1/(2πα′),  ħ = c = 1',
  ];for(const x of formulas)host.appendChild(e('code','formula',x));
  if(f){const a=f.diagnostics;
   host.appendChild(e('p','note-row',`Nambu–Goto on-shell density integrated over σ: ${num(a.ng_on_shell_density_integral_sigma)} · Polyakov conformal-gauge on-shell density: ${num(a.polyakov_on_shell_density_integral_sigma)} · difference: ${num(a.on_shell_action_density_difference)}. These are restricted on-shell integrands, not two independent general solvers.`));
  }
  const actionBtn=e('button','small-add','Integrate both on-shell actions');actionBtn.onclick=async()=>{try{const data=await request<Record<string,unknown>>('/actions',{configuration:config,samples:40});const pane=e('pre','result-json',JSON.stringify(data,null,2));host.appendChild(pane);}catch(err){warn(err);}};host.appendChild(actionBtn);
  host.appendChild(e('p','note-row',`Boundary: ${config.bc}; dimension D=${config.dimensions}; ${frames.length?'global level-matching residual = '+num(f?.diagnostics.level_matching_residual):'not evaluated'}. Source: Tong (2009) §§1.2–1.4, Wray (2011) ch. 2–3. A free-wave solution alone is not automatically physical.`));
 }else if(activeTab==='quantum')quantumPanel(host);
 else if(activeTab==='analysis')analysisPanel(host);
 else if(activeTab==='compare')comparePanel(host);
}
function plotChart(chart:HTMLCanvasElement,data:number[][],color:string):void{
 const cx=chart.getContext('2d');if(!cx||!data.length)return;const {w,h}=canvasBounds(chart,cx);cx.clearRect(0,0,w,h);
 const left=44,right=w-15,top=17,bottom=h-24;
 const xs=data.map(p=>p[0]),ys=data.map(p=>p[1]);const xmin=Math.min(...xs),xmax=Math.max(...xs);const ymin=Math.min(...ys),ymax=Math.max(...ys);
 const rangex=xmax-xmin||1, rangey=ymax-ymin||1;cx.strokeStyle='#4a6576';cx.lineWidth=1;cx.beginPath();cx.moveTo(left,top);cx.lineTo(left,bottom);cx.lineTo(right,bottom);cx.stroke();
 cx.font='10px Consolas,monospace';cx.fillStyle='#8ca5b8';cx.fillText(ymax.toPrecision(3),3,top+7);cx.fillText(ymin.toPrecision(3),3,bottom);cx.fillText(xmin.toFixed(1),left,bottom+15);cx.fillText(xmax.toFixed(1),right-25,bottom+15);
 cx.strokeStyle=color;cx.lineWidth=2;cx.beginPath();data.forEach(([x,y],i)=>{const px=left+(x-xmin)/rangex*(right-left),py=bottom-(y-ymin)/rangey*(bottom-top);
  if(i)cx.lineTo(px,py);else cx.moveTo(px,py);});cx.stroke();}
function setActiveTab():void{document.querySelectorAll<HTMLButtonElement>('.panel-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeTab));renderPanel();}
function addLabel(host:HTMLElement,label:string,value:string|number,onChange:(v:string)=>void,kind:'number'|'text'='number'):void{
 const el=e('label','field-line',label),input=e('input') as HTMLInputElement;input.type=kind;input.value=String(value);
 input.addEventListener('change',()=>{onChange(input.value);});el.appendChild(input);host.appendChild(el);
}
function quantumPanel(host:HTMLElement):void{
 host.appendChild(e('h3','panel-heading','Critical bosonic oscillator spectrum · independent of classical geometry'));
 const form=e('div','data-row');form.setAttribute('aria-label','Quantum state inputs');
 const fields=e('div','data-row');const opts=[
  ['Nᴸ mode','left'],['Nᴿ mode','right'],['Radius R','radius'],['Momentum n','momentum'],['Winding w','winding']];
 for(const [name,key] of opts){const label=e('label','field-line',name);const input=e('input') as HTMLInputElement;input.type='number';input.step=key==='radius'?'.1':'1';input.style.width='95px';
 let value=key==='left'?(quantum.left as Array<Record<string,number>>)?.[0]?.occupation??1:key==='right'?(quantum.right as Array<Record<string,number>>)?.[0]?.occupation??1:(quantum[key] as number)??0;
 input.value=String(value);input.addEventListener('change',()=>{if(key==='left'||key==='right'){
 const list=quantum[key] as Array<Record<string,number>>||[];if(!list[0])list.push({mode:1,occupation:0,axis:1});list[0].occupation=Number(input.value);quantum[key]=list;}
 else quantum[key]=Number(input.value);quantumResults=null;dualResults=null;});label.appendChild(input);fields.appendChild(label);}
 host.appendChild(fields);
 const buttons=e('div','data-row');const calc=e('button','','Compute spectrum');calc.onclick=async()=>{try{quantumResults=await request('/quantum',quantum);renderPanel();}catch(err){warn(err);}};
 const dual=e('button','','Apply T-duality');dual.onclick=async()=>{try{dualResults=await request('/tdual',quantum);renderPanel();}catch(err){warn(err);}};
 const apply=e('button','','Use dual parameters');apply.onclick=()=>{if(!dualResults)return;quantum=clone(dualResults.dual_configuration as Record<string,unknown>);quantumResults=null;dualResults=null;renderPanel();};
 buttons.append(calc,dual);if(dualResults)buttons.appendChild(apply);host.appendChild(buttons);
 if(quantumResults){const results=quantumResults;
  const grid=e('div','metric-grid');for(const [a,b] of [['MASS²',num(results.mass_squared)],['LEFT LEVEL',results.level_left],['RIGHT LEVEL',results.level_right],['STATE',results.physical_state]]){
   const card=e('div','metric-card');card.append(e('small','',String(a)),e('strong','',String(b)));grid.appendChild(card);}host.appendChild(grid);}
 if(dualResults){host.appendChild(e('p','note-row',`T-duality: R′ = α′/R; n′=w and w′=n. Mass² difference: ${num(dualResults.mass_squared_difference)}; reflection error: ${num(dualResults.p_right_reflection_error)}`));}
 host.appendChild(e('p','note-row','This calculates finite Fock-state levels in D=26. It does NOT animate a quantum wavefunction, implement BRST cohomology, or prove the existence of corresponding particles.'));
}
function analysisPanel(host:HTMLElement):void{
 host.appendChild(e('h3','panel-heading','Mode-amplitude parameter sweep'));
 const controls=e('div','data-row');const s=e('input') as HTMLInputElement;s.type='number';s.value='0.1';s.step='.1';s.title='Start amplitude';
 const end=e('input') as HTMLInputElement;end.type='number';end.value='1';end.step='.1';end.title='End amplitude';
 const steps=e('input') as HTMLInputElement;steps.type='number';steps.value='20';steps.title='Samples';
 const run=e('button','','Run sweep');run.onclick=async()=>{try{sweepResults=await request('/sweep',{configuration:config,start:Number(s.value),end:Number(end.value),steps:Number(steps.value)});renderPanel();}catch(err){warn(err);}};
 controls.append(s,end,steps,run);host.appendChild(controls);
 if(sweepResults){const chart=e('canvas','chart-canvas');host.appendChild(chart);requestAnimationFrame(()=>plotChart(chart,sweepResults!.map(x=>[Number(x.amplitude),Number(x.energy)]),'#5ecdbb'));}
 const convRow=e('div','data-row');convRow.style.marginTop='14px';convRow.appendChild(e('h3','panel-heading','Convergence / numerical error'));
 const convBtn=e('button','','Run 64 / 128 / 256');convBtn.onclick=async()=>{try{convergenceResults=await request('/convergence',{configuration:config,time:Math.min(1,config.duration)});renderPanel();}catch(err){warn(err);}};convRow.appendChild(convBtn);host.appendChild(convRow);
 if(convergenceResults){const table=e('div','data-row');for(const x of convergenceResults){const card=e('div','metric-card');card.append(e('small','',x.points+' samples'),e('strong','',num(x.rms_error)));table.appendChild(card);}host.appendChild(table);}
 host.appendChild(e('p','note-row','The sweep changes the first mode amplitude. Closed-string scans may violate level matching; such points are reported as constraint-violating. Convergence is RMS displacement error against exact transverse modes.'));
}
function comparePanel(host:HTMLElement):void{
 host.appendChild(e('h3','panel-heading','Side-by-side numerical comparison'));
 const button=e('button','small-add',compareBase?'Replace baseline with current':'Pin current as baseline');button.onclick=()=>{compareBase=clone(config);void computeComparison();};host.appendChild(button);
 if(compareBase){const wrap=e('div','compare-wrap');
  for(const [name,c] of [['BASELINE',compareBase],['CURRENT',config]] as Array<[string,Config]>){
   const card=e('div','compare-block');card.appendChild(e('strong','',name));
   card.appendChild(e('p','note-row',`Type: ${c.kind}\nα′: ${c.alpha_prime}\nModes: ${c.modes.length}\nD: ${c.dimensions}`));wrap.appendChild(card);}
  host.appendChild(wrap);
  if(comparison&&frames[frameIndex]){
   const de=Number(frames[frameIndex].diagnostics.energy)-Number(comparison.diagnostics.energy);
   host.appendChild(e('p','note-row',`Gauge-fixed energy difference at τ≈${frames[frameIndex].time.toFixed(2)}: ${num(de)}. Models are evaluated independently; a coordinate mismatch is not a physical distance.`));}
 }else host.appendChild(e('p','note-row','Pin a baseline, modify parameters, and recompute to inspect the difference.'));
}
async function computeComparison():Promise<void>{if(!compareBase)return;try{comparison=await request<Frame>('/frame',{configuration:compareBase,time:frames[frameIndex]?.time??0});renderPanel();}catch(err){warn(err);}}
function dialog(name:string,contents:HTMLElement):void{setText('dialogTitle',name);$('dialogBody').replaceChildren(contents);$('dialogHost').hidden=false;$('dialogClose').focus();}
function closeDialog():void{$('dialogHost').hidden=true;}
async function openLibrary():Promise<void>{const wrap=e('div');wrap.appendChild(e('p','note-row','Experiments are stored locally in your SLAI data folder.'));
 try{const list=await request<Saved[]>('/experiments',undefined,'GET');if(!list.length)wrap.appendChild(e('p','note-row','No saved experiments yet.'));
  for(const entry of list){const row=e('div','dialog-item');const info=e('span','',`${entry.title} · revision ${entry.revision}`);
   const open=e('button','','Open');open.onclick=async()=>{try{const data=await request<{configuration:Config;quantum:Record<string,unknown>|null;id:string;revision:number;title:string}>(`/experiments/${entry.id}`,undefined,'GET');
    config=data.configuration;quantum=clone(data.quantum||quantum);savedId=data.id;savedRevision=data.revision;title=data.title;selectedPreset=0;quantumResults=null;
    setText('experimentTitle',title);setText('experimentObjective','Reopened reproducible configuration');setText('experimentCategory','SAVED EXPERIMENT');
    populateFields();renderPresets();closeDialog();autoFitAfterCompute=true;computeSoon(0);
   }catch(err){warn(err);}};
   const del=e('button','','Delete');del.onclick=async()=>{if(!window.confirm(`Delete ${entry.title}?`))return;try{await request(`/experiments/${entry.id}`,undefined,'DELETE');row.remove();}catch(err){warn(err);}};
   row.append(info,open,del);wrap.appendChild(row);}
 }catch(err){wrap.appendChild(e('p','note-row',String(err)));}dialog('Saved experiments',wrap);}
async function save():Promise<void>{const name=window.prompt('Experiment name',title);if(!name)return;
 try{const saved=await request<{id:string;revision:number;title:string}>('/experiments',{id:savedId,expected_revision:savedRevision,title:name,configuration:config,quantum});
  savedId=saved.id;savedRevision=saved.revision;title=saved.title;setText('experimentTitle',title);setText('statusText','Saved · revision '+savedRevision);
 }catch(err){warn(err);}}
function importDialog():void{const wrap=e('div','export-options');
 wrap.appendChild(e('p','note-row','Open a native SLAI SGEO or SDRW package for structural validation and inspection. A generic drawing is not automatically a valid physical initial state.'));
 const input=e('input') as HTMLInputElement;input.type='file';input.accept='.sgeo,.sdrw';input.setAttribute('aria-label','Select SGEO or SDRW file');wrap.appendChild(input);
 const result=e('pre','result-json');wrap.appendChild(result);
 const btn=e('button','','Inspect native document');btn.onclick=async()=>{const file=input.files?.[0];if(!file){result.textContent='Select a file.';return;}
 const fmt=file.name.toLowerCase().endsWith('.sgeo')?'sgeo':file.name.toLowerCase().endsWith('.sdrw')?'sdrw':'';
 if(!fmt){result.textContent='Only .sgeo or .sdrw files are supported here.';return;}
 if(file.size>6*1024*1024){result.textContent='Import limit: 6 MB.';return;}
 try{const res=await fetch(`/api/import/${fmt}`,{method:'POST',headers:{[marker]:'1','Content-Type':'application/octet-stream'},body:await file.arrayBuffer(),credentials:'same-origin'});
 const data=await res.json() as Envelope<Record<string,unknown>>;
 if(!res.ok||!data.ok)throw Error(data.error?.message||'Invalid native file');
 result.textContent=JSON.stringify(data.data,null,2);
 }catch(err){result.textContent=String(err);}};
 wrap.appendChild(btn);dialog('Inspect native geometry',wrap);}
function exportDialog():void{const wrap=e('div','export-options');for(const [label,path,name] of [
 ...(formats.sgeo?([['Native SGEO · projected 3D string','/export/sgeo','stringlab_projection.sgeo'],['Native SGEO · worldsheet mesh','/export/sgeo-worldsheet','stringlab_worldsheet.sgeo']] as string[][]):[]),
 ...(formats.sdrw?([['Native SDRW · editable coordinate diagram','/export/sdrw','stringlab_diagram.sdrw']] as string[][]):[]),
 ['Scientific snapshot · JSON','/export/json','stringlab_snapshot.json'],
 ['Simulation time series · CSV','/export/csv','stringlab_timeseries.csv'],
 ...(formats.pdf?([['Reproducible scientific report · PDF','/export/pdf','stringlab_report.pdf']] as string[][]):[])]){
 const b=e('button','',label);b.onclick=async()=>{try{await download(path==='/export/sgeo-worldsheet'?'/export/sgeo':path,{configuration:config,time:frames[frameIndex]?.time??0,worldsheet:path==='/export/sgeo-worldsheet'},name);closeDialog();setText('statusText','Exported '+name);}catch(err){warn(err);closeDialog();}};wrap.appendChild(b);}
 wrap.appendChild(e('p','note-row','SGEO/SDRW preserve editable native 2D/3D projected geometry, not the complete higher-dimensional or time-dependent physics state. Keep the experiment JSON separately. SLDC remains unavailable.'));dialog('Export scientific results',wrap);}
function registerInputControls():void{
 const numberFields: Array<[string,keyof Config]>=[['dimensions','dimensions'],['alphaPrime','alpha_prime'],['pPlus','p_plus'],['points','points'],['dt','dt'],['duration','duration']];
 for(const [id,key] of numberFields){$<HTMLInputElement>(id).addEventListener('change',()=>{
  (config as unknown as Record<string,unknown>)[key]=Number(inputValue(id));if(key==='dimensions'){const max=config.dimensions-2;
   for(const axis of ['anchor_start','anchor_end','zero_velocity'] as const){config[axis]=Array.from({length:max},(_,j)=>config[axis][j]??0);}
   config.modes.forEach(m=>m.axis=Math.min(m.axis,max));populateFields();}if(key==='alpha_prime')showTension();touch();});}
 ($<HTMLSelectElement>('kind')).addEventListener('change',()=>{const target=inputValue('kind');const item=presets.find(p=>p.kind===target);if(item)applyPreset(item);});
 ($<HTMLSelectElement>('bc')).addEventListener('change',()=>{config.bc=inputValue('bc');touch();});
 ($<HTMLSelectElement>('solver')).addEventListener('change',()=>{config.solver=inputValue('solver') as Config['solver'];touch();});
 for(const [id,key] of [['start1','anchor_start'],['end1','anchor_end']] as const){$<HTMLInputElement>(id).addEventListener('change',()=>{config[key][0]=Number(inputValue(id));touch();});}
 for(let i=0;i<3;i++){($<HTMLSelectElement>(`proj${i}`)).addEventListener('change',()=>{config.projection[i]=inputValue(`proj${i}`);showProjectionNotice();touch();});}
 $('addModeBtn').addEventListener('click',()=>{if(config.modes.length>=32){errorText('Maximum 32 modes.');return;}
 const mode:Mode=config.kind==='open'?{n:config.modes.length+1,axis:2,amplitude:.1,phase:0,enabled:true}:
 {n:config.modes.length+1,axis:2,left:.1,right:.1,phase_left:0,phase_right:0,enabled:true};
 config.modes.push(mode);modeControls();touch();});
 $('recomputeBtn').addEventListener('click',()=>void compute());
 $('playBtn').addEventListener('click',play);$('restartBtn').addEventListener('click',()=>{playing=false;setText('playBtn','▶');setFrame(0);});
 $('stepBtn').addEventListener('click',()=>{playing=false;setText('playBtn','▶');setFrame((frameIndex+1)%Math.max(1,frames.length));});
 $<HTMLInputElement>('timeline').addEventListener('input',()=>{playing=false;setText('playBtn','▶');setFrame(Number(inputValue('timeline')));});
 $('newBtn').addEventListener('click',()=>applyPreset(presets[0]));$('saveBtn').addEventListener('click',()=>void save());
 $('openBtn').addEventListener('click',()=>void openLibrary());$('importBtn').addEventListener('click',importDialog);$('exportBtn').addEventListener('click',exportDialog);
 $('themeBtn').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';drawScene();});
 $('fitBtn').addEventListener('click',()=>fit());$('orthoBtn').addEventListener('click',()=>{ortho=!ortho;$('orthoBtn').classList.toggle('active',ortho);drawScene();});
 $('gridBtn').addEventListener('click',()=>{grid=!grid;$('gridBtn').classList.toggle('active',grid);drawScene();});
 $('worldsheetBtn').addEventListener('click',()=>{worldsheet=!worldsheet;$('worldsheetBtn').classList.toggle('active',worldsheet);drawScene();});
 document.querySelectorAll<HTMLButtonElement>('.panel-tab').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.tab||'results';setActiveTab();}));
 for(const [id,filter] of [['allPresets','all'],['classicalPresets','classical'],['quantumPresets','quantum']]){
 $(id).addEventListener('click',()=>{listFilter=filter;document.querySelectorAll('.filter').forEach(el=>el.classList.toggle('active',el.id===id));renderPresets();});}
 $('dialogClose').addEventListener('click',closeDialog);$('dialogHost').addEventListener('click',ev=>{if(ev.target===$('dialogHost'))closeDialog();});
 document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeDialog();if(ev.target instanceof HTMLInputElement||ev.target instanceof HTMLSelectElement)return;
 if(ev.code==='Space'){ev.preventDefault();play();}if(ev.code==='ArrowRight'&&frames.length){setFrame((frameIndex+1)%frames.length);}});
 viewport.addEventListener('pointerdown',ev=>{dragging=true;viewport.setPointerCapture(ev.pointerId);lastPointer=[ev.clientX,ev.clientY];pointerMode=ev.shiftKey?'pan':'orbit';});
 viewport.addEventListener('pointerup',()=>{dragging=false;});viewport.addEventListener('pointercancel',()=>{dragging=false;});
 viewport.addEventListener('pointermove',ev=>{const dx=ev.clientX-lastPointer[0],dy=ev.clientY-lastPointer[1];lastPointer=[ev.clientX,ev.clientY];
 if(dragging){if(pointerMode==='pan'){panX+=dx;panY+=dy;}else{yaw+=dx*.007;pitch=Math.max(-1.52,Math.min(1.52,pitch+dy*.007));}drawScene();return;}
 const frame=frames[frameIndex];if(!frame)return;const {w,h}=canvasBounds(viewport,ctx);const rect=viewport.getBoundingClientRect();const px=ev.clientX-rect.left,py=ev.clientY-rect.top;
 let index=-1,dist=120;frame.geometry.forEach((pt,i)=>{const p=projected(pt,w,h);const d=(p.x-px)**2+(p.y-py)**2;if(d<dist){dist=d;index=i;}});
 if(index!==hoverIndex){hoverIndex=index;drawScene();}
 });
 viewport.addEventListener('pointerleave',()=>{if(!dragging){hoverIndex=-1;drawScene();}});
 viewport.addEventListener('wheel',ev=>{ev.preventDefault();zoom=Math.max(.15,Math.min(20,zoom*(ev.deltaY>0?.89:1.11)));drawScene();},{passive:false});
 window.addEventListener('resize',drawScene);
}
async function init():Promise<void>{registerInputControls();requestAnimationFrame(playTick);
 try{const [r,defaults,status]=await Promise.all([request<Preset[]>('/templates',undefined,'GET'),request<{classical:Config;quantum:Record<string,unknown>}>('/default',undefined,'GET'),request<{formats:{sgeo:boolean;sdrw:boolean;pdf:boolean}}>('/status',undefined,'GET')]);
  formats={sgeo:status.formats.sgeo,sdrw:status.formats.sdrw,pdf:status.formats.pdf};
  presets=r;config=defaults.classical;quantum=defaults.quantum;applyPreset(presets[0]);}
 catch(err){warn(err);setText('experimentObjective','Start the app within the SLAI installation; the deterministic backend must be running.');}
}
void init();
