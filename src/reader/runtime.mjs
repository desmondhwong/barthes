// Barthes reader lifecycle, adapted from the maintained Sitemap 0.8 runtime.
import createGraph from './graph.mjs';
import createWorkspace from './workspace.mjs';
import P from './path.mjs';
import Z from './zoom.mjs';
import N from './navigation.mjs';
import K from './catalog.mjs';
import E from './connections.mjs';
import { retainUnloaded } from './state.mjs';

export function mountReader(host, corpus, initialPageId) {
  const originalHTML=host.innerHTML,originalTitle=document.title;
  const bodyKeys=['theme','view','chromeHidden'],bodyBefore=Object.fromEntries(bodyKeys.map(key=>[key,document.body.dataset[key]]));
  const htmlTheme=document.documentElement.dataset.theme,wasEnhanced=document.body.classList.contains('reader-enhanced');
  const controller=new AbortController(),observers=[],timers=new Set(),frames=new Set(),objectURLs=new Set();
  let disposed=false;
  const listen=(target,type,callback,options={})=>target.addEventListener(type,callback,{...(typeof options==='boolean'?{capture:options}:options),signal:controller.signal});
  const schedule=(callback,delay)=>{const id=window.setTimeout(()=>{timers.delete(id);if(!disposed)callback();},delay);timers.add(id);return id;};
  const unschedule=id=>{window.clearTimeout(id);timers.delete(id);};
  const requestFrame=callback=>{const id=window.requestAnimationFrame(time=>{frames.delete(id);if(!disposed)callback(time);});frames.add(id);return id;};
  const createObjectURL=blob=>{const url=URL.createObjectURL(blob);objectURLs.add(url);return url;};
  const revokeObjectURL=url=>{URL.revokeObjectURL(url);objectURLs.delete(url);};
  function cleanup(){
    if(disposed)return;disposed=true;controller.abort();
    for(const observer of observers)observer.disconnect();
    for(const id of timers)window.clearTimeout(id);
    for(const id of frames)window.cancelAnimationFrame(id);
    for(const url of objectURLs)URL.revokeObjectURL(url);
    host.innerHTML=originalHTML;delete host.dataset.page;
    if(!wasEnhanced)document.body.classList.remove('reader-enhanced');
    for(const key of bodyKeys){if(bodyBefore[key]===undefined)delete document.body.dataset[key];else document.body.dataset[key]=bodyBefore[key];}
    if(htmlTheme===undefined)delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=htmlTheme;
    document.title=originalTitle;
  }
  try {
  host.dataset.page=initialPageId;

  const C=corpus,G=createGraph(C),W=createWorkspace(G,{corpusId:C.siteSlug,allowLegacy:C.siteSlug==='hlc'});
  const $=id=>host.querySelector(`[id="${id}"]`),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const base=`${location.origin}/s/${C.siteSlug}`,graphKey=`barthes:3:${base}`,viewKey=`barthes:workspace:1:${base}`,layoutKey=`barthes:layout:4:${base}`,pathKey=`barthes:path:4:${base}`,catalogKey=`barthes:catalog:1:${base}`;
  let historyStorage;try{historyStorage=sessionStorage;}catch{}
  const pageHref=p=>{const url=new URL(p.href,location.href);if(C.source?.kind==='arena'&&C.source.pagesLoaded>1)url.searchParams.set('pages',String(C.source.pagesLoaded));return url.pathname+url.search+url.hash;};
  $('home-link').href=pageHref(G.PAGES[G.HOME_ID]);
  const navigation=N.createNavigation({location,history,storage:historyStorage,knownIds:G.PAGES,pages:G.PAGES,home:G.HOME_ID}),initialRoute=navigation.initial();
  let current=initialRoute?.page||host.dataset.page,state=G.newState(),preferences=W.defaultPreferences(),profile=null,route=P.create(current,G.HOME_ID);
  let returnFocus=null,importEpoch=0,importing=false,animation=null,frame=0,drag=null,crumbDrag=null,pinch=null,suppressClick=false;
  let zoomCandidate=null,pendingAnchor=initialRoute?.anchor||'',lineFrame=0,zoomHold=null,zoomHoldTimer=0,skipZoomClick=null,skipZoomUntil=0,pointerFocus=false;
  const touches=new Map();let touchScroll=null,touchBlocked=false;
  let graphSort={sort:null,direction:'asc'},edgeSegments=[],edgeScreen={},edgePointer=null,hoveredEdge=null;
  let catalog={index:{showVisited:true,showUnvisited:true,sort:'original',direction:'asc'},graph:{showVisited:true,showUnvisited:true,local:false}};
  try{const raw=JSON.parse(sessionStorage.getItem(catalogKey));for(const area of ['index','graph'])for(const key of ['showVisited','showUnvisited'])if(typeof raw?.[area]?.[key]==='boolean')catalog[area][key]=raw[area][key];if(typeof raw?.graph?.local==='boolean')catalog.graph.local=raw.graph.local;if(['original','title','date'].includes(raw?.index?.sort))catalog.index.sort=raw.index.sort;if(['asc','desc'].includes(raw?.index?.direction))catalog.index.direction=raw.index.direction;}catch{}
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const partialCorpus=C.status?.kind==='partial'||C.source?.hasMore===true;let retainedGraph=null;
  let reconciled=false;try{const raw=JSON.parse(sessionStorage.getItem(graphKey));retainedGraph=raw;state=G.sanitizeState(raw);if(raw&&!partialCorpus)reconciled=JSON.stringify(raw.visible)!==JSON.stringify(state.visible)||JSON.stringify(raw.edges?.map(edge=>[edge.from,edge.to]))!==JSON.stringify(state.edges.map(edge=>[edge.from,edge.to]));}catch{}
  try{const raw=JSON.parse(localStorage.getItem(viewKey));if(raw){preferences=W.normalizePreferences(raw.preferences);profile=raw.profile?.name==='Saved view'?{name:'Saved view',preferences:W.normalizePreferences(raw.profile.preferences)}:null;}}catch{}
  G.visit(state,current);
  try{route=P.sanitize(JSON.parse(sessionStorage.getItem(pathKey)),current,G.PAGES,G.HOME_ID);if(!route.items.every(id=>state.visited.includes(id)))route=P.create(current,G.HOME_ID);}catch{}
  if(initialRoute?.entry){route=restorePath(initialRoute.path,current);if(!route.items.every(id=>state.visited.includes(id)))route=P.create(current,G.HOME_ID);}
  host.dataset.page=current;document.title=`${G.PAGES[current].title} — ${C.title}`;
  let nodes=G.createLayout(),byId=Object.fromEntries(nodes.map(n=>[n.id,n])),simulation=G.createSimulation(nodes,{density:preferences.density}),simulationIds=nodes.map(n=>n.id).join('|');
  for(let i=0;i<700&&simulation.active;i++)simulation.step();
  try{const raw=JSON.parse(sessionStorage.getItem(layoutKey));if(Array.isArray(raw)&&raw.length===nodes.length&&new Set(raw.map(n=>n.id)).size===nodes.length&&raw.every(n=>byId[n.id]&&Number.isFinite(n.x)&&Number.isFinite(n.y)&&Math.abs(n.x)<1e5&&Math.abs(n.y)<1e5)){for(const n of raw)Object.assign(byId[n.id],{x:n.x,y:n.y,vx:0,vy:0});simulation.resolve();}}catch{}
  const fallback=$('main');fallback.hidden=true;fallback.removeAttribute('id');document.body.classList.add('reader-enhanced');
  const stage=$('stage'),canvas=$('connections'),pathViewport=$('path-viewport');stage.hidden=false;
  $('toolbar').innerHTML='<button id="map-button" type="button" title="Graph / read page (G)">Graph</button><button id="zoom-out" class="zoom-button" type="button" aria-label="Zoom out">−</button><button id="zoom-in" class="zoom-button" type="button" aria-label="Zoom in">+</button><label class="density-control" id="density-control">Density <input id="density" type="range" min="0" max="100" step="1" aria-label="Graph density. Lower is more spacious."><output id="density-value"></output></label><button id="open-graph-tools" type="button" aria-haspopup="dialog">Arrange</button><div id="graph-toolbar"></div><span class="spacer"></span><button id="open-index" type="button" aria-haspopup="dialog">Index</button><button id="open-settings" type="button" aria-haspopup="dialog">Settings</button><button id="hide-bar" type="button" title="Hide top bar (H). Escape opens Settings.">Hide bar</button>';
  $('ui-root').innerHTML=`<button id="show-bar" type="button" aria-label="Show menu bar" title="Show menu bar" hidden>Menu</button><p id="memory-warning" role="status" hidden></p>
    <dialog class="dialog" id="settings" aria-labelledby="settings-title"><div class="dialog-header"><h2 id="settings-title">Settings</h2><button id="close-settings" type="button">Close</button></div>
    <div class="control-fields"><label for="view-setting">View</label><select id="view-setting"><option value="normal">Normal</option><option value="reduced">Reduced</option><option value="zen">Zen</option></select><label for="theme-setting">Theme</label><select id="theme-setting"><option value="light">Light</option><option value="dark">Dark</option></select><label for="camera-setting">Camera</label><select id="camera-setting"><option value="page">Reading</option><option value="graph">Graph</option></select><label id="density-setting-label" for="density-setting">Graph density</label><div id="density-setting-field"><input id="density-setting" type="range" min="0" max="100" step="1" aria-label="Graph density"><output id="density-setting-value"></output></div><span>Top bar</span><label class="check-label"><input id="bar-setting" type="checkbox">Show top bar</label></div>
    <p class="recovery-help">Lower density leaves more space between pages. When the bar is hidden, tap Menu or press H to restore it; Escape opens Settings.</p>
    <section class="control-group"><h3>Sites</h3><p><a href="/s/hlc">HLC field notes</a> · <a href="/s/barthes-test">Barthes test</a></p></section>
    <section class="control-group"><h3>Saved view</h3><div class="control-actions"><button id="save-view">Save view</button><button id="restore-view">Restore view</button><button id="reset-view">Reset view</button></div><p id="profile-status"></p></section>
    <section class="control-group"><h3>Exploration</h3><div class="control-actions"><button id="export-map">Export</button><button id="import-map">Import</button><button id="restart-map">Start over</button></div><input id="import-file" type="file" accept="application/json,.json" hidden><p class="recovery-help">JSON preserves your reading path, visited pages, traveled links and view settings for this loaded corpus. Load all source pages before exporting a complete exploration. Import arranges a fresh graph layout.</p></section>
    <details class="control-group" id="help"><summary>Help and keyboard</summary><p>Drag a page to pull its connected neighbors and gently displace nearby pages. Release it to let the network settle. The density slider changes preferred spacing. Light solid lines are possible links; stronger lines are links followed while reading.</p><p>Zoom out in small steps: the same page becomes smaller, its text becomes measured lines, then an outline, then a compact graph rectangle; distant icons have no interior lines. Click a rectangle to read it. Scroll or swipe inside a reading page to read; pinch or Ctrl + wheel to zoom from it. Graph controls are in the desktop bar and mobile Arrange panel. Title, date and path tile the pages; Shuffle scatters them. Local links shows the current page and its neighbors. Hover a connection to see its destination; click it to read that page and mark the connection traveled.</p><dl class="help-list"><dt>G</dt><dd>Graph ↔ current page</dd><dt>+ / −</dt><dd>Zoom; hold a key or button to repeat</dd><dt>0</dt><dd>Fit graph</dd><dt>I</dt><dd>Index</dd><dt>H</dt><dd>Hide / show top bar</dd><dt>T</dt><dd>Light / dark</dd><dt>Escape</dt><dd>Open Settings / close a menu</dd></dl><p>Select a breadcrumb to revisit a position without losing the later path. Following a new link from there replaces that later branch. Drag or scroll the chain sideways. Clear path keeps only the current page; visited pages and traveled links remain.</p></details><p id="dialog-status" class="dialog-status" role="status" aria-live="polite"></p></dialog>
    <dialog class="dialog" id="index" aria-labelledby="index-title"><div class="dialog-header"><h2 id="index-title">Index</h2><button type="button" id="close-index">Close</button></div><div class="catalog-controls" aria-label="Index filters"><button id="index-visited" type="button" aria-pressed="true">Visited</button><button id="index-unvisited" type="button" aria-pressed="true">Unvisited</button></div><div class="catalog-controls" aria-label="Sort pages"><button data-index-sort="title" type="button">Title ↑↓</button><button data-index-sort="date" type="button">Date ↑↓</button><button id="index-reset" type="button">Reset</button></div><p id="index-count" class="catalog-status" role="status"></p><p id="index-empty" hidden>No pages match these filters.</p><ul id="page-index" class="index-list"></ul></dialog>
    <dialog class="dialog" id="graph-tools" aria-labelledby="graph-tools-title"><div class="dialog-header"><h2 id="graph-tools-title">Arrange graph</h2><button id="close-graph-tools" type="button">Close</button></div><div id="graph-dialog-body"><div id="graph-actions"><div class="catalog-controls" aria-label="Graph filters"><button id="graph-visited" type="button" aria-pressed="true">Visited</button><button id="graph-unvisited" type="button" aria-pressed="true">Unvisited</button><button id="graph-local" type="button" aria-pressed="false">Local links only</button></div><div class="catalog-controls" aria-label="Arrange pages"><button data-arrange="shuffle:asc" type="button">Shuffle</button><button data-arrange-toggle="title" type="button">Title ↑↓</button><button data-arrange-toggle="date" type="button">Date ↑↓</button><button data-arrange="path:asc" type="button">By path</button><button id="fit-graph" type="button">Fit graph</button></div><p class="catalog-status">↑ A–Z / oldest first · ↓ Z–A / newest first. Local links shows the current page, its neighbors and their connections to it.</p><p id="graph-status" class="catalog-status" role="status"></p></div></div></dialog>`;
  const emptyGraph=document.createElement('p');emptyGraph.id='graph-empty';emptyGraph.hidden=true;emptyGraph.textContent='No pages shown. Change the graph filters.';stage.append(emptyGraph);
  const edgeLabel=document.createElement('p');edgeLabel.id='edge-label';edgeLabel.hidden=true;edgeLabel.setAttribute('role','tooltip');stage.append(edgeLabel);
  const graphActions=$('graph-actions');
  const settings=$('settings'),indexDialog=$('index'),graphDialog=$('graph-tools'),menus=[settings,indexDialog,graphDialog],elements={},indexLinks={};
  for(const [index,p] of C.pages.entries()){
    const card=document.createElement('article');card.className='page-node';card.dataset.node=p.id;
    card.innerHTML=`<a class="node-hit" draggable="false" href="${esc(pageHref(p))}" data-node-link="${esc(p.id)}" aria-label="Read ${esc(p.title)}"><span class="node-label">${esc(p.title)}</span></a><div class="page-clip"><div class="node-abstract" aria-hidden="true">${'<i></i>'.repeat(6)}</div><div class="page-sheet"><main class="page-body" tabindex="-1"><div class="prose"><div class="page-kicker"><span>${esc(p.section||'Field notes')}</span><span>${p.wordCount} words</span></div>${p.html}${p.footer}</div></main></div><div class="page-lines" aria-hidden="true"></div></div>`;
    if(location.protocol==='file:')for(const a of card.querySelectorAll('a[href]')){const id=G.hrefToId(a.href,location.href);if(id)a.href=pageHref(G.PAGES[id])+new URL(a.href,location.href).hash;}
    for(const heading of card.querySelectorAll('.page-body [id]')){heading.dataset.anchor=heading.id;heading.id=`article-${index}-${heading.id}`;}
    $('nodes').append(card);elements[p.id]={card,hit:card.querySelector('.node-hit'),body:card.querySelector('.page-body'),sheet:card.querySelector('.page-sheet'),lines:card.querySelector('.page-lines'),abstract:card.querySelector('.node-abstract'),lineKey:''};
    const li=document.createElement('li'),link=document.createElement('a');link.href=pageHref(p);link.dataset.jump=p.id;link.className='index-link';link.innerHTML=`<span>${esc(p.title)}</span><span class="index-state"></span>`;li.append(link);$('page-index').append(li);indexLinks[p.id]=link;
  }
  let camera={x:byId[current].x,y:byId[current].y,zoom:Z.READ_ZOOM};
  const dimensions=()=>({width:Math.max(1,stage.clientWidth),height:Math.max(1,stage.clientHeight)});
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const anyDialog=()=>menus.some(menu=>menu.open);
  const activeDialog=()=>menus.find(menu=>menu.open);
  const graphVisible=id=>(state.visited.includes(id)?catalog.graph.showVisited:catalog.graph.showUnvisited)&&(!catalog.graph.local||id===current||G.LINKS[current]?.includes(id)||G.LINKS[id]?.includes(current));
  const barHidden=()=>preferences.chromeHidden||preferences.view==='zen';
  function save(){
    state.open=preferences.mapOpen;let failed=false;
    try{retainedGraph=retainUnloaded(retainedGraph,state,partialCorpus);sessionStorage.setItem(graphKey,JSON.stringify(retainedGraph));sessionStorage.setItem(pathKey,JSON.stringify(route));sessionStorage.setItem(catalogKey,JSON.stringify(catalog));sessionStorage.setItem(layoutKey,JSON.stringify(nodes.map(({id,x,y})=>({id,x,y}))));}catch{failed=true;}
    try{localStorage.setItem(viewKey,JSON.stringify({preferences,profile}));}catch{failed=true;}
    $('memory-warning').hidden=!failed;$('memory-warning').textContent='Browser memory is unavailable. Export to keep this exploration.';
  }
  function announce(message,error=false){$('dialog-status').textContent=message;$('dialog-status').dataset.error=String(error);$('live-status').textContent=message;}
  function historyState(){return{page:current,path:{items:[...route.items],cursor:route.cursor}};}
  function writeHistory(push=false,anchor=''){const result=navigation.write(historyState(),{push,anchor});if(!result.ok)announce(result.error,true);}
  function syncCatalog(){
    const pages=K.indexPages(C.pages,{...catalog.index,visited:state.visited}),visible=new Set(pages.map(p=>p.id));
    for(const p of C.pages)indexLinks[p.id].parentElement.hidden=!visible.has(p.id);
    for(const p of pages)$('page-index').append(indexLinks[p.id].parentElement);
    const dates=[...new Set(pages.map(p=>p.publishedDate).filter(Boolean))];$('index-count').textContent=`${pages.length} of ${C.pages.length} pages${catalog.index.sort==='date'&&dates.length===1?` · Dated ${dates[0]}`:''}`;$('index-empty').hidden=pages.length>0;
    for(const area of ['index','graph'])for(const [label,key] of [['visited','showVisited'],['unvisited','showUnvisited']])$(`${area}-${label}`).setAttribute('aria-pressed',String(catalog[area][key]));
    for(const button of host.querySelectorAll('[data-index-sort]'))syncSortButton(button,button.dataset.indexSort,catalog.index);
    for(const button of graphActions.querySelectorAll('[data-arrange-toggle]'))syncSortButton(button,button.dataset.arrangeToggle,graphSort);
    $('graph-local').setAttribute('aria-pressed',String(catalog.graph.local));
    const count=nodes.filter(n=>graphVisible(n.id)).length;$('graph-empty').hidden=!preferences.mapOpen||count>0;
    for(const button of graphActions.querySelectorAll('[data-arrange],[data-arrange-toggle]'))button.disabled=count===0;
  }
  function syncSortButton(button,sort,selection){const active=selection.sort===sort,label=sort==='title'?'Title':'Date';button.textContent=`${label} ${active?(selection.direction==='asc'?'↑':'↓'):'↑↓'}`;button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',`${label}: ${active?(selection.direction==='asc'?'ascending; switch to descending':'descending; switch to ascending'):'sort ascending'}`);}
  function syncGraphControls(){
    const mobile=(document.documentElement.clientWidth||stage.clientWidth||innerWidth)<=650,host=$(mobile?'graph-dialog-body':'graph-toolbar');
    if(!mobile&&graphDialog.open)closeMenu(graphDialog,false);
    if(graphActions.parentElement!==host)host.append(graphActions);
    $('graph-toolbar').dataset.visible=String(preferences.mapOpen);$('graph-toolbar').inert=!preferences.mapOpen;$('graph-toolbar').setAttribute('aria-hidden',String(!preferences.mapOpen));
    $('open-graph-tools').inert=!mobile||!preferences.mapOpen;$('open-graph-tools').setAttribute('aria-hidden',String(!mobile||!preferences.mapOpen));
  }
  function ensureSimulation(){
    const active=nodes.filter(n=>graphVisible(n.id)||!preferences.mapOpen&&n.id===current),key=active.map(n=>n.id).join('|');
    if(key!==simulationIds){simulation.stop();simulation=G.createSimulation(active,{density:preferences.density});simulation.stop();simulationIds=key;}
  }
  function syncPath(reveal=true){
    // Pagination reloads the current page even after client navigation, including
    // ordinary new-tab actions that do not pass through our click handler.
    for(const link of host.querySelectorAll('[data-reader-reload]')){const url=new URL(link.href,location.href);url.pathname=new URL(pageHref(G.PAGES[current]),location.href).pathname;link.href=url.pathname+url.search;}
    const oldLeft=pathViewport.scrollLeft;$('path-chain').replaceChildren();
    route.items.forEach((id,i)=>{const sep=document.createElement('span');sep.className='path-separator';sep.textContent='•';sep.setAttribute('aria-hidden','true');const a=document.createElement('a');a.href=pageHref(G.PAGES[id]);a.dataset.pathIndex=String(i);a.className='path-link';a.draggable=false;a.textContent=G.PAGES[id].title;if(route.cursor===i)a.setAttribute('aria-current','page');$('path-chain').append(sep,a);});
    $('home-link').dataset.pathIndex='-1';if(route.cursor===-1)$('home-link').setAttribute('aria-current','page');else $('home-link').removeAttribute('aria-current');
    host.querySelector('.path-row').classList.toggle('no-path',route.items.length===0);
    pathViewport.scrollLeft=oldLeft;
    if(reveal){const active=$('path-chain').querySelector('[aria-current="page"]');if(active){const left=active.offsetLeft,right=left+active.offsetWidth;if(left<pathViewport.scrollLeft)pathViewport.scrollLeft=left;else if(right>pathViewport.scrollLeft+pathViewport.clientWidth)pathViewport.scrollLeft=right-pathViewport.clientWidth;}}
    for(const p of C.pages){const a=indexLinks[p.id],visited=state.visited.includes(p.id);a.classList.toggle('visited',visited);a.querySelector('.index-state').textContent=p.id===current?'Current':visited?'Visited':'';if(p.id===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
    syncCatalog();
  }
  function syncFrame(){
    document.documentElement.dataset.theme=preferences.theme;document.body.dataset.theme=preferences.theme;document.body.dataset.view=preferences.view;document.body.dataset.chromeHidden=String(preferences.chromeHidden);
    syncGraphControls();
    stage.style.top=barHidden()?'0px':`${host.querySelector('.site-header').getBoundingClientRect().height}px`;
    $('show-bar').hidden=!barHidden();$('open-graph-tools').dataset.visible=String(preferences.mapOpen);
    $('map-button').textContent=preferences.mapOpen?'Read page':'Graph';$('map-button').setAttribute('aria-pressed',String(preferences.mapOpen));
    $('view-setting').value=preferences.view;$('theme-setting').value=preferences.theme;$('camera-setting').value=preferences.mapOpen?'graph':'page';$('bar-setting').checked=!barHidden();
    for(const id of ['density','density-setting'])$(id).value=String(preferences.density);$('density-value').textContent=String(preferences.density);$('density-setting-value').textContent=String(preferences.density);
    $('density-control').dataset.visible=String(preferences.mapOpen);$('density-control').setAttribute('aria-hidden',String(!preferences.mapOpen));$('density-control').inert=!preferences.mapOpen;
    $('density-setting-label').hidden=!preferences.mapOpen;$('density-setting-field').hidden=!preferences.mapOpen;
    $('restore-view').disabled=!profile;$('profile-status').textContent=profile?`${profile.preferences.view}, ${profile.preferences.theme}, density ${profile.preferences.density}.`:'No saved view.';save();
  }
  function prepareGeometry(){
    ensureSimulation();const viewport=dimensions(),shapes={};for(const n of nodes){const geo=Z.geometry(viewport,n,camera.zoom);shapes[n.id]=geo;n.collisionWidth=geo.worldWidth;n.collisionHeight=geo.worldHeight;}
    // Enforce the actual drawn rectangles, including page shapes during zoom.
    simulation.resolve(animation?.anchorId||drag?.node||zoomCandidate||current);return shapes;
  }
  function measureLines(id,geo){
    const el=elements[id],key=`${geo.readingWidth}:${geo.readingHeight}:${el.body.scrollTop}:${preferences.view}:${getComputedStyle(el.body).fontSize}`;
    if(el.lineKey===key)return;el.lineKey=key;el.lines.replaceChildren();
    if(!document.createRange||!document.createTreeWalker)return;
    const origin=el.sheet.getBoundingClientRect(),scale=geo.scale;if(!scale||!origin.width)return;
    const walker=document.createTreeWalker(el.body,4),range=document.createRange();let text,number=0;
    if(typeof range.getClientRects!=='function')return;
    while((text=walker.nextNode())){
      if(!text.textContent.trim()||text.parentElement?.closest('button,script,style,[hidden]'))continue;
      range.selectNodeContents(text);
      for(const rect of range.getClientRects()){
        const x=(rect.left-origin.left)/scale,y=(rect.top-origin.top)/scale,w=rect.width/scale,h=rect.height/scale;
        if(w<=0||h<=0||y+h<0||y>geo.readingHeight||x+w<0||x>geo.readingWidth)continue;
        const line=document.createElement('i');if(text.parentElement?.closest('h1,h2,h3'))line.className='heading';else if(text.parentElement?.closest('a'))line.className='link';
        Object.assign(line.style,{left:`${Math.max(0,x)}px`,top:`${y+h*.46}px`,width:`${Math.min(w,geo.readingWidth-Math.max(0,x))}px`,height:`${Math.max(2,h*.2)}px`});el.lines.append(line);if(++number>900)return;
      }
    }
  }
  function render(){
    stage.scrollLeft=0;stage.scrollTop=0;const {width,height}=dimensions(),dpr=Math.min(devicePixelRatio||1,2),shapes=prepareGeometry(),selected=zoomCandidate||current;
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    const screen={};let needLines=false;
    $('graph-empty').hidden=!preferences.mapOpen||nodes.some(n=>graphVisible(n.id));
    for(const n of nodes){
      const shown=graphVisible(n.id)||!preferences.mapOpen&&n.id===current;
      if(!shown&&elements[n.id].card.contains(document.activeElement))stage.focus({preventScroll:true});
      elements[n.id].card.hidden=!shown;if(!shown){elements[n.id].body.inert=true;elements[n.id].body.removeAttribute('id');elements[n.id].hit.tabIndex=-1;continue;}
      const geo=shapes[n.id],x=(n.x-camera.x)*camera.zoom+width/2,y=(n.y-camera.y)*camera.zoom+height/2,w=geo.worldWidth*camera.zoom,h=geo.worldHeight*camera.zoom,el=elements[n.id],readable=n.id===current&&geo.interactive;
      screen[n.id]={x,y,w,h};Object.assign(el.card.style,{left:`${x-w/2}px`,top:`${y-h/2}px`,width:`${w}px`,height:`${h}px`});
      el.card.dataset.level=geo.level;el.card.classList.toggle('current',n.id===current);el.card.classList.toggle('visited',state.visited.includes(n.id));el.card.classList.toggle('readable',readable);
      // Preview layers share one fixed text layout. Only their parent transform changes.
      for(const layer of [el.sheet,el.lines])Object.assign(layer.style,{width:`${geo.readingWidth}px`,height:`${geo.readingHeight}px`,transform:`scale(${geo.scale})`,left:`${(w-geo.readingWidth*geo.scale)/2}px`,top:`${(h-geo.readingHeight*geo.scale)/2}px`});
      el.sheet.style.opacity=String(geo.textOpacity);el.lines.style.opacity=String(geo.linesOpacity);el.abstract.style.opacity=String(geo.abstractOpacity);
      // Move focus before hiding a reading body or an entire noncurrent card.
      // Browser focus must never remain inside the subtree becoming inert/hidden.
      if(!readable&&(el.body.contains(document.activeElement)||geo.interactive&&el.card.contains(document.activeElement)))stage.focus({preventScroll:true});
      el.body.inert=!readable;el.body.setAttribute('aria-hidden',String(!readable));el.hit.tabIndex=geo.interactive?-1:0;el.card.setAttribute('aria-hidden',String(geo.interactive&&!readable));
      if(readable)el.body.id='main';else el.body.removeAttribute('id');
      el.hit.setAttribute('aria-label',`${G.PAGES[n.id].title}, ${n.id===current?'current page':state.visited.includes(n.id)?'visited':'unvisited'}`);
      if(n.id===current)el.hit.setAttribute('aria-current','page');else el.hit.removeAttribute('aria-current');
      if(geo.linesOpacity>0&&x+w/2>0&&x-w/2<width&&y+h/2>0&&y-h/2<height)needLines=true;
    }
    if(needLines&&!lineFrame)lineFrame=requestFrame(()=>{lineFrame=0;for(const n of nodes){const geo=Z.geometry(dimensions(),n,camera.zoom),r=screen[n.id];if(r&&geo.linesOpacity>0&&r.x+r.w/2>0&&r.x-r.w/2<width&&r.y+r.h/2>0&&r.y-r.h/2<height)measureLines(n.id,geo);}});
    const ctx=canvas.getContext('2d');if(!ctx)return;const css=getComputedStyle(document.documentElement);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    edgeScreen=screen;edgeSegments=E.segments(state.edges,screen,{current,local:catalog.graph.local});refreshEdgeHover();
    const stroke=(segment,highlight=false)=>{ctx.strokeStyle=css.getPropertyValue(highlight?'--focus':segment.traversed?'--followed':'--edge').trim();ctx.globalAlpha=highlight||segment.traversed?1:.85;ctx.lineWidth=highlight?3:segment.traversed?1.8:1;ctx.beginPath();ctx.moveTo(segment.a.x,segment.a.y);ctx.lineTo(segment.b.x,segment.b.y);ctx.stroke();};
    ctx.setLineDash([]);ctx.lineCap='round';for(const traveled of [false,true])for(const segment of edgeSegments)if(segment.traversed===traveled)stroke(segment);if(hoveredEdge)stroke(hoveredEdge.segment,true);ctx.globalAlpha=1;
  }
  function edgePoint(e){const r=stage.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  function pickEdge(point){return preferences.mapOpen&&!anyDialog()?E.pick(edgeSegments,point,{current,rectangles:edgeScreen}):null;}
  function clearEdgeHover(){edgePointer=null;hoveredEdge=null;edgeLabel.hidden=true;stage.dataset.edgeHover='false';}
  function refreshEdgeHover(){
    hoveredEdge=edgePointer&&!drag&&!pinch?pickEdge(edgePointer):null;edgeLabel.hidden=!hoveredEdge;stage.dataset.edgeHover=String(!!hoveredEdge);if(!hoveredEdge)return;
    edgeLabel.textContent=G.PAGES[hoveredEdge.target].title;const {width,height}=dimensions(),w=edgeLabel.offsetWidth||Math.min(width-16,280),h=edgeLabel.offsetHeight||32;
    edgeLabel.style.left=`${clamp(edgePointer.x+12,8,Math.max(8,width-w-8))}px`;edgeLabel.style.top=`${clamp(edgePointer.y+12,8,Math.max(8,height-h-8))}px`;
  }
  function activateConnection(hit){
    if(!hit||!preferences.mapOpen||anyDialog()||!graphVisible(hit.from)||!graphVisible(hit.to)||catalog.graph.local&&hit.from!==current&&hit.to!==current||!G.LINKS[hit.from]?.includes(hit.to))return;
    for(const id of [hit.from,hit.to])if(!state.visited.includes(id))G.visit(state,id);G.follow(state,hit.from,hit.to);navigate(hit.target);
  }

  function readingTarget(){const n=byId[current];return{x:n.x,y:n.y,zoom:Z.READ_ZOOM};}
  function graphTarget(centerCurrent=false){
    const visible=nodes.filter(n=>graphVisible(n.id)),b=G.layoutBounds(visible),{width,height}=dimensions(),n=byId[current];
    if(!visible.length)return{x:n.x,y:n.y,zoom:.5};
    const x=centerCurrent?n.x:(b.minX+b.maxX)/2,y=centerCurrent?n.y:(b.minY+b.maxY)/2;
    return{x,y,zoom:Z.clampZoom(Math.min(1,Math.max(80,width-64)/(2*Math.max(x-b.minX,b.maxX-x)+100),Math.max(80,height-64)/(2*Math.max(y-b.minY,b.maxY-y)+100)))};
  }
  function tick(now){
    frame=0;let done=null;
    if(animation){const t=clamp((now-animation.start)/animation.duration,0,1);camera=Z.cameraAt(animation.from,animation.to,animation.anchor,t);if(t===1){done=animation.done;animation=null;}}
    prepareGeometry();if(simulation.active&&preferences.mapOpen&&!animation&&!reducedMotion.matches){
      const anchor=!drag?.node&&camera.zoom>1.6?byId[zoomCandidate||current]:null,before=anchor?{x:anchor.x,y:anchor.y}:null;
      simulation.step(drag?.node||null);
      // Follow the preview's tiny relaxation without treating it as a hot drag pin.
      if(anchor){camera.x+=anchor.x-before.x;camera.y+=anchor.y-before.y;}
    }
    render();if(done)done();if(animation||simulation.active&&preferences.mapOpen&&!reducedMotion.matches)requestDraw();else save();
  }
  function requestDraw(){if(!frame)frame=requestFrame(tick);}
  function moveCamera(target,done){if(reducedMotion.matches){animation=null;camera={...target};render();if(done)done();save();return;}animation={from:{...camera},to:target,anchor:{x:byId[current].x,y:byId[current].y},anchorId:current,start:performance.now(),duration:560,done};requestDraw();}
  function settle(fixed=null){for(let i=0;i<700&&simulation.active;i++)simulation.step(fixed);simulation.resolve(fixed);}
  function stopMotion(){clearEdgeHover();stopZoomHold();animation=null;zoomCandidate=null;pendingAnchor='';if(drag&&stage.hasPointerCapture(drag.pointer))stage.releasePointerCapture(drag.pointer);drag=null;pinch=null;simulation.stop();stage.classList.remove('dragging');}
  function focusReading(){if(!anyDialog()){if(Z.geometry(dimensions(),byId[current],camera.zoom).interactive)elements[current].body.focus({preventScroll:true});else stage.focus({preventScroll:true});}}
  function scrollAnchor(){if(!pendingAnchor)return;let id;try{id=decodeURIComponent(pendingAnchor);}catch{id=pendingAnchor;}const a=[...elements[current].body.querySelectorAll('[data-anchor]')].find(el=>el.dataset.anchor===id);if(a)elements[current].body.scrollTop=a.offsetTop;pendingAnchor='';}
  function showGraph({fit=false}={}){zoomCandidate=null;preferences.mapOpen=true;syncFrame();ensureSimulation();if(reducedMotion.matches)settle();moveCamera(graphTarget(!fit),()=>{if(!anyDialog())stage.focus({preventScroll:true});});}
  function showPage(){zoomCandidate=null;preferences.mapOpen=false;simulation.stop();syncFrame();ensureSimulation();moveCamera(readingTarget(),()=>{focusReading();scrollAnchor();});}
  function toggleMap(){preferences.mapOpen?showPage():showGraph();}
  function navigate(id,{traveled=false,push=true,anchor='',pathIndex=null,restoredPath=null}={}){
    if(!G.PAGES[id])return;const previous=current;stopMotion();pendingAnchor=anchor;if(traveled)G.follow(state,current,id);
    if(restoredPath)route=P.sanitize(restoredPath,id,G.PAGES,G.HOME_ID);else if(pathIndex!==null)P.select(route,pathIndex);else if(id!==current)P.follow(route,id,G.HOME_ID);
    current=id;G.visit(state,id);if(P.current(route,G.HOME_ID)!==current||!route.items.every(page=>state.visited.includes(page)))route=P.create(current,G.HOME_ID);host.dataset.page=id;document.title=`${G.PAGES[id].title} — ${C.title}`;
    if(push)writeHistory(previous!==id,anchor);syncPath();showPage();$('live-status').textContent=`Reading ${G.PAGES[id].title}`;
  }
  function pickAt(x,y){for(const n of nodes){if(!graphVisible(n.id))continue;const geo=Z.geometry(dimensions(),n,camera.zoom);if(Math.abs(x-n.x)<=geo.worldWidth/2&&Math.abs(y-n.y)<=geo.worldHeight/2)return n;}let nearest=byId[current],distance=Infinity;for(const n of nodes){if(!graphVisible(n.id))continue;const d=(n.x-x)**2+(n.y-y)**2;if(d<distance){distance=d;nearest=n;}}return nearest;}
  function manualZoom(factor,cx,cy){
    // Reading selection and centering commit together; capped wheel bursts cannot cancel the snap.
    if(factor>=1&&!preferences.mapOpen&&(camera.zoom>=7.95||animation?.to.zoom===Z.READ_ZOOM))return;
    const {width,height}=dimensions();cx=cx??width/2;cy=cy??height/2;const old=camera.zoom,next=Z.clampZoom(old*factor);if(next===old)return;
    animation=null;const wx=(cx-width/2)/old+camera.x,wy=(cy-height/2)/old+camera.y;
    if(next>old)zoomCandidate=pickAt(wx,wy).id;camera.zoom=next;camera.x=wx-(cx-width/2)/next;camera.y=wy-(cy-height/2)/next;
    if(next>old&&next>=7.95){const activePinch=pinch;navigate(zoomCandidate||current);if(touches.size>=2)pinch=activePinch;return;}
    preferences.mapOpen=true;syncFrame();render();if(old>=7.95&&elements[current].body.contains(document.activeElement))stage.focus({preventScroll:true});
    // Camera changes need collision resolution, but do not wake a sleeping layout.
    if(simulation.active){simulation.cool();if(reducedMotion.matches){const anchor=byId[zoomCandidate||current],before={x:anchor.x,y:anchor.y};settle();camera.x+=anchor.x-before.x;camera.y+=anchor.y-before.y;render();}else requestDraw();}save();
  }
  function openMenu(menu,help=false){cancelInputs();if(anyDialog())closeMenu(activeDialog(),false);returnFocus=document.activeElement;menu.showModal();if(help){$('help').open=true;$('help').querySelector('summary').focus();}else $(menu===settings?'close-settings':menu===indexDialog?'close-index':'close-graph-tools').focus();}
  function closeMenu(menu,restore=true){if(menu===settings){importEpoch++;importing=false;$('import-map').disabled=false;}menu.close();if(restore){if(returnFocus?.isConnected&&returnFocus.getClientRects().length&&returnFocus!==document.body&&!returnFocus.closest('[inert],[aria-hidden="true"]')&&!returnFocus.closest('.page-body')?.inert)returnFocus.focus();else focusReading();}}
  for(const menu of menus){
    let backdropPointer=null;
    const outside=e=>{const r=menu.getBoundingClientRect();return e.target===menu&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
    listen(menu,'cancel',e=>{e.preventDefault();closeMenu(menu);});
    listen(menu,'pointerdown',e=>{backdropPointer=e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey&&outside(e)?e.pointerId:null;});
    listen(menu,'pointercancel',()=>{backdropPointer=null;});
    listen(menu,'click',e=>{const intentional=backdropPointer!==null;backdropPointer=null;if(intentional&&outside(e)&&e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();e.stopPropagation();closeMenu(menu);}});
  }
  $('open-settings').onclick=()=>openMenu(settings);$('close-settings').onclick=()=>closeMenu(settings);$('open-index').onclick=()=>openMenu(indexDialog);$('close-index').onclick=()=>closeMenu(indexDialog);
  $('open-graph-tools').onclick=()=>openMenu(graphDialog);$('close-graph-tools').onclick=()=>closeMenu(graphDialog);
  $('map-button').onclick=toggleMap;
  function stopZoomHold(){const held=zoomHold;unschedule(zoomHoldTimer);zoomHoldTimer=0;zoomHold=null;if(held)skipZoomUntil=performance.now()+400;if(held?.button.hasPointerCapture(held.pointer))held.button.releasePointerCapture(held.pointer);}
  for(const [id,factor] of [['zoom-out',1/Z.ZOOM_FACTOR],['zoom-in',Z.ZOOM_FACTOR]]){
    const button=$(id);
    listen(button,'pointerdown',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();button.focus({preventScroll:true});stopZoomHold();skipZoomClick=button;skipZoomUntil=Infinity;zoomHold={button,pointer:e.pointerId,factor};button.setPointerCapture(e.pointerId);manualZoom(factor);const repeat=()=>{if(!zoomHold||zoomHold.button!==button)return;manualZoom(factor);zoomHoldTimer=schedule(repeat,90);};zoomHoldTimer=schedule(repeat,300);});
    const release=e=>{if(zoomHold?.button===button&&zoomHold.pointer===e.pointerId){stopZoomHold();if(button.hasPointerCapture(e.pointerId))button.releasePointerCapture(e.pointerId);}};
    listen(button,'pointerup',release);listen(button,'pointercancel',release);listen(button,'lostpointercapture',release);
    button.onclick=e=>{if(skipZoomClick===button&&e.detail!==0&&performance.now()<skipZoomUntil){skipZoomClick=null;return;}skipZoomClick=null;manualZoom(factor);};
  }
  for(const area of ['index','graph'])for(const [label,key] of [['visited','showVisited'],['unvisited','showUnvisited']])$(`${area}-${label}`).onclick=()=>{catalog[area][key]=!catalog[area][key];syncCatalog();if(area==='graph'){animation=null;zoomCandidate=null;ensureSimulation();render();}save();};
  for(const button of host.querySelectorAll('[data-index-sort]'))button.onclick=()=>{const sort=button.dataset.indexSort;catalog.index.direction=catalog.index.sort===sort&&catalog.index.direction==='asc'?'desc':'asc';catalog.index.sort=sort;syncCatalog();save();};
  $('index-reset').onclick=()=>{catalog.index={showVisited:true,showUnvisited:true,sort:'original',direction:'asc'};syncCatalog();save();};
  $('graph-local').onclick=()=>{catalog.graph.local=!catalog.graph.local;animation=null;zoomCandidate=null;syncCatalog();ensureSimulation();render();save();};
  function arrangeGraph(order,direction){
    try{
      let pages=K.graphPages(C.pages,{...catalog.graph,visited:state.visited,order:order==='shuffle'?'original':order,direction,edges:state.edges,path:route,trail:state.trail,home:G.HOME_ID}).filter(p=>graphVisible(p.id));if(!pages.length)return;
      const viewport=dimensions(),gap=40,shapes=pages.map(p=>{const n=byId[p.id],geo=Z.geometry(viewport,n,Z.READ_ZOOM);return{...n,collisionWidth:Math.max(n.width,geo.worldWidth),collisionHeight:Math.max(n.height,geo.worldHeight)};});
      const area=shapes.reduce((sum,n)=>sum+(n.collisionWidth+gap)*(n.collisionHeight+gap),0),width=Math.max(120,Math.sqrt(area*viewport.width/viewport.height));
      const placements=order==='shuffle'?K.scatter(shapes,{width,gap}):K.tile(shapes,{width,gap});
      stopMotion();preferences.mapOpen=true;syncFrame();ensureSimulation();
      for(const placed of placements)Object.assign(byId[placed.id],{x:placed.x,y:placed.y,vx:0,vy:0});
      simulation.stop();graphSort={sort:order,direction};syncCatalog();moveCamera(graphTarget(),()=>save());$('graph-status').dataset.error='false';$('graph-status').textContent=`${pages.length} pages arranged${order==='shuffle'?' in a loose scatter':order==='path'?' by traveled path':` by ${order}, ${direction==='asc'?'ascending':'descending'}`}${order==='date'&&new Set(pages.map(p=>p.publishedDate)).size===1?` (all dated ${pages[0].publishedDate||'unknown'})`:''}.`;save();
    }catch(error){$('graph-status').dataset.error='true';$('graph-status').textContent=error.message;}
  }
  for(const button of host.querySelectorAll('[data-arrange]'))button.onclick=()=>arrangeGraph(...button.dataset.arrange.split(':'));
  for(const button of host.querySelectorAll('[data-arrange-toggle]'))button.onclick=()=>{const sort=button.dataset.arrangeToggle;arrangeGraph(sort,graphSort.sort===sort&&graphSort.direction==='asc'?'desc':'asc');};
  $('fit-graph').onclick=()=>showGraph({fit:true});
  $('clear-path').onclick=()=>{route=P.clear(current,G.HOME_ID);syncPath();save();writeHistory();$('live-status').textContent='Path cleared. Current page and visited pages kept.';};
  function changeFrame(){syncFrame();if(!preferences.mapOpen){animation=null;camera=readingTarget();}render();}
  function toggleBar(){if(barHidden()){preferences.chromeHidden=false;if(preferences.view==='zen')preferences.view='normal';}else preferences.chromeHidden=true;changeFrame();if(barHidden()&&!anyDialog())focusReading();}
  $('hide-bar').onclick=toggleBar;$('show-bar').onclick=toggleBar;$('bar-setting').onchange=e=>{preferences.chromeHidden=!e.target.checked;if(e.target.checked&&preferences.view==='zen')preferences.view='normal';changeFrame();};
  function toggleTheme(){preferences.theme=preferences.theme==='light'?'dark':'light';syncFrame();render();}
  $('theme-setting').onchange=e=>{preferences.theme=e.target.value;syncFrame();render();};$('view-setting').onchange=e=>{preferences.view=e.target.value;changeFrame();};$('camera-setting').onchange=e=>e.target.value==='graph'?showGraph():showPage();
  function changeDensity(value){preferences.density=clamp(Math.round(Number(value)),0,100);simulation.setDensity(preferences.density);syncFrame();if(reducedMotion.matches){settle();render();save();}else requestDraw();}
  for(const id of ['density','density-setting'])listen($(id),'input',e=>changeDensity(e.target.value));
  $('save-view').onclick=()=>{profile={name:'Saved view',preferences:{...preferences}};syncFrame();announce('View saved.');};
  function applyPreferences(){simulation.setDensity(preferences.density);syncFrame();if(reducedMotion.matches)settle();preferences.mapOpen?showGraph():showPage();}
  $('restore-view').onclick=()=>{if(profile){preferences={...profile.preferences};applyPreferences();announce('Saved view restored.');}};
  $('reset-view').onclick=()=>{preferences=W.defaultPreferences();applyPreferences();announce('View reset. Exploration and path kept.');};
  $('export-map').onclick=()=>{try{save();const snapshot=W.createSnapshot(state,current,preferences,profile,route),url=createObjectURL(new Blob([JSON.stringify(snapshot,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`barthes-${C.siteSlug.replace(/[^a-z0-9-]/gi,'-')}-exploration.json`;document.body.append(a);a.click();a.remove();schedule(()=>revokeObjectURL(url),1000);announce('Export prepared. Your browser handles the download.');}catch(e){announce(`Export failed: ${e.message}`,true);}};
  $('import-map').onclick=()=>{if(!importing)$('import-file').click();};
  listen($('import-file'),'change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file||importing)return;const epoch=++importEpoch;importing=true;$('import-map').disabled=true;
    try{if(file.size>W.MAX_SNAPSHOT_BYTES)throw new Error('File is too large.');const text=await file.text();if(disposed||epoch!==importEpoch)return;const snapshot=W.parseSnapshot(text);const previous=current;cancelInputs();stopMotion();state=snapshot.graph;retainedGraph=null;current=snapshot.current;preferences=snapshot.preferences;profile=snapshot.profile;route=snapshot.path;
      host.dataset.page=current;document.title=`${G.PAGES[current].title} — ${C.title}`;nodes=G.createLayout();byId=Object.fromEntries(nodes.map(n=>[n.id,n]));simulation=G.createSimulation(nodes,{density:preferences.density});simulationIds=nodes.map(n=>n.id).join('|');settle();syncPath();syncFrame();ensureSimulation();camera=preferences.mapOpen?graphTarget():readingTarget();render();writeHistory(previous!==current);announce('Exploration imported.');
    }catch(error){if(!disposed&&epoch===importEpoch)announce(`Import failed: ${error.message} Current exploration kept.`,true);}finally{if(!disposed&&epoch===importEpoch){importing=false;$('import-map').disabled=false;}}
  });
  $('restart-map').onclick=()=>{if(!confirm('Start a new exploration at Home? Your view settings will be kept.'))return;importEpoch++;importing=false;$('import-map').disabled=false;state=G.newState();retainedGraph=null;route=P.create(G.HOME_ID,G.HOME_ID);navigate(G.HOME_ID,{pathIndex:-1});announce('Exploration restarted.');};
  listen(host,'click',e=>{
    if(suppressClick){suppressClick=false;e.preventDefault();return;}if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const a=e.target.closest('a');if(a){if(a.hasAttribute('data-reader-reload')||a.hasAttribute('download')||a.target&&a.target!=='_self')return;const href=a.getAttribute('href');if(href==='#main'){e.preventDefault();showPage();return;}if(href?.startsWith('#')){e.preventDefault();pendingAnchor=href.slice(1);scrollAnchor();return;}const id=G.hrefToId(a.href,location.href);if(!id)return;e.preventDefault();const traveled=!!a.closest('.page-body')&&!a.hasAttribute('data-jump'),pathIndex=a.hasAttribute('data-path-index')?Number(a.dataset.pathIndex):null;if(anyDialog())closeMenu(activeDialog(),false);navigate(id,{traveled,pathIndex,anchor:new URL(a.href,location.href).hash.slice(1)});return;}
    if(stage.contains(e.target)&&!e.target.closest('[data-node]')){const hit=pickEdge(edgePoint(e));if(hit){e.preventDefault();activateConnection(hit);return;}}
    if(barHidden()&&!anyDialog()&&(e.target===stage||e.target===$('nodes')||e.target===document.body))openMenu(settings);
  });
  listen(document,'keydown',e=>{
    pointerFocus=false;
    if(e.key==='Escape'){e.preventDefault();if(!e.repeat)anyDialog()?closeMenu(activeDialog()):openMenu(settings);return;}
    if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||e.target.closest('input,textarea,select,[contenteditable]'))return;if(e.key==='?'){e.preventDefault();openMenu(settings,true);return;}if(anyDialog())return;
    const key=e.key.toLowerCase();if(e.repeat&&!['-','_','+','='].includes(key))return;if(key==='g'){e.preventDefault();toggleMap();}else if(key==='t'){e.preventDefault();toggleTheme();}else if(key==='h'){e.preventDefault();toggleBar();}else if(key==='i'){e.preventDefault();openMenu(indexDialog);}else if(key==='-'||key==='_'){e.preventDefault();manualZoom(1/Z.ZOOM_FACTOR);}else if(key==='+'||key==='='){e.preventDefault();manualZoom(Z.ZOOM_FACTOR);}else if(key==='0'){e.preventDefault();showGraph({fit:true});}
  });
  listen(stage,'focusin',e=>{const hit=e.target.closest('[data-node-link]');if(!hit||!preferences.mapOpen||pointerFocus)return;const n=byId[hit.dataset.nodeLink],{width,height}=dimensions(),x=(n.x-camera.x)*camera.zoom+width/2,y=(n.y-camera.y)*camera.zoom+height/2;if(x<80||x>width-80||y<90||y>height-90){animation=null;camera.x=n.x;camera.y=n.y;render();}stage.scrollLeft=0;stage.scrollTop=0;});
  listen(stage,'wheel',e=>{if(e.target.closest('.readable .page-body')&&!e.ctrlKey)return;e.preventDefault();const r=stage.getBoundingClientRect();manualZoom(Math.exp(-clamp(e.deltaY,-80,80)*.0025),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  listen(document,'pointerdown',()=>{pointerFocus=true;if(!touches.size&&!drag)suppressClick=false;},true);
  function beginDrag(e){
    const n=e.target.closest('[data-node]')?.dataset.node;
    const edge=n?null:pickEdge(edgePoint(e));clearEdgeHover();
    drag={pointer:e.pointerId,node:n||null,edge,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};stage.setPointerCapture(e.pointerId);if(!n&&simulation.active)simulation.cool();
  }
  function pinchGeometry(){const[a,b]=[...touches.values()];return{distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
  listen(stage,'pointerdown',e=>{
    pointerFocus=true;if(!touches.size&&!drag)suppressClick=false;if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||anyDialog())return;
    const body=e.target.closest('.readable .page-body');
    if(e.pointerType==='touch'){
      const capture=body?(e.target.closest('a')||body):stage;touches.set(e.pointerId,{x:e.clientX,y:e.clientY,capture});capture.setPointerCapture(e.pointerId);
      if(touches.size>=2){animation=null;drag=null;touchScroll=null;touchBlocked=true;stage.classList.remove('dragging');pinch=pinchGeometry();simulation.cool();if(simulation.active)requestDraw();e.preventDefault();return;}
      if(touchBlocked)return;
      if(body){touchScroll={pointer:e.pointerId,body,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};return;}
    }else if(body)return;
    animation=null;beginDrag(e);
  });
  listen(stage,'pointerleave',()=>{if(hoveredEdge){clearEdgeHover();render();}else clearEdgeHover();});
  listen(stage,'pointermove',e=>{
    if(e.pointerType!=='touch'&&!drag&&!pinch){edgePointer=e.target.closest('[data-node]')?null:edgePoint(e);render();}
    if(e.pointerType==='touch'&&touches.has(e.pointerId)){
      Object.assign(touches.get(e.pointerId),{x:e.clientX,y:e.clientY});
      if(touches.size>=2&&pinch){
        e.preventDefault();const next=pinchGeometry(),r=stage.getBoundingClientRect();
        camera.x-=(next.x-pinch.x)/camera.zoom;camera.y-=(next.y-pinch.y)/camera.zoom;
        manualZoom(next.distance/pinch.distance,next.x-r.left,next.y-r.top);pinch=next;return;
      }
      if(touchBlocked){e.preventDefault();return;}
      if(touchScroll?.pointer===e.pointerId){
        const reading=touchScroll,dy=e.clientY-reading.y;reading.x=e.clientX;reading.y=e.clientY;
        if(Math.hypot(e.clientX-reading.startX,e.clientY-reading.startY)>4)reading.moved=true;
        if(reading.moved){e.preventDefault();reading.body.scrollTop=clamp(reading.body.scrollTop-dy,0,Math.max(0,reading.body.scrollHeight-reading.body.clientHeight));elements[current].lineKey='';}return;
      }
    }
    if(!drag||e.pointerId!==drag.pointer)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;if(!drag.moved)return;e.preventDefault();stage.classList.add('dragging');
    if(drag.node){const n=byId[drag.node];n.x+=dx/camera.zoom;n.y+=dy/camera.zoom;n.vx=n.vy=0;simulation.reheat();simulation.resolve(n.id);if(reducedMotion.matches){for(let i=0;i<8;i++)simulation.step(n.id);render();}else requestDraw();}else{camera.x-=dx/camera.zoom;camera.y-=dy/camera.zoom;render();}
  });
  function suppressReleaseClick(){suppressClick=true;schedule(()=>{suppressClick=false;},350);}
  function endDrag(e){if(!drag||e.pointerId!==drag.pointer)return;const {moved,node,edge}=drag;drag=null;stage.classList.remove('dragging');if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);if(moved||node||edge)suppressReleaseClick();if(!moved&&edge&&e.type==='pointerup')activateConnection(edge);else if(!moved&&node&&e.type==='pointerup')navigate(node);else if(node&&moved){simulation.cool();if(reducedMotion.matches){settle();render();save();}else requestDraw();}else save();}
  function endPointer(e){
    const touch=touches.get(e.pointerId);
    if(touch){
      const wasPinch=touchBlocked||pinch!==null;touches.delete(e.pointerId);
      pinch=touches.size>=2?pinchGeometry():null;
      if(wasPinch||touchScroll?.moved||e.type==='pointercancel')suppressReleaseClick();
      if(touchScroll?.pointer===e.pointerId)touchScroll=null;
      if(!touches.size)touchBlocked=false;
      if(wasPinch){drag=null;if(!touches.size&&reducedMotion.matches){simulation.stop();render();}save();}else endDrag(e);
      if(touch.capture.hasPointerCapture(e.pointerId))touch.capture.releasePointerCapture(e.pointerId);
      return;
    }
    endDrag(e);
  }
  listen(stage,'pointerup',endPointer);listen(stage,'pointercancel',endPointer);
  listen(stage,'lostpointercapture',e=>{if(touches.has(e.pointerId)||drag?.pointer===e.pointerId)endPointer({...e,pointerId:e.pointerId,type:'pointercancel'});});
  function cancelInputs(){
    const hadHover=!!hoveredEdge;clearEdgeHover();if(hadHover)render();stopZoomHold();skipZoomClick=null;if(drag)endDrag({pointerId:drag.pointer,type:'pointercancel'});
    if(crumbDrag){const id=crumbDrag.pointer;crumbDrag=null;pathViewport.classList.remove('dragging');if(pathViewport.hasPointerCapture(id))pathViewport.releasePointerCapture(id);}
    const captured=[...touches.entries()];touches.clear();pinch=null;touchScroll=null;touchBlocked=false;
    for(const[id,touch]of captured)if(touch.capture.hasPointerCapture(id))touch.capture.releasePointerCapture(id);
    stage.classList.remove('dragging');if(reducedMotion.matches&&simulation.active){simulation.stop();render();save();}
  }
  listen(window,'blur',cancelInputs);listen(document,'visibilitychange',()=>{if(document.hidden)cancelInputs();});
  listen(pathViewport,'dragstart',e=>e.preventDefault());
  listen(stage,'dragstart',e=>{if(e.target.closest('.node-hit'))e.preventDefault();});
  listen(pathViewport,'wheel',e=>{if(pathViewport.scrollWidth<=pathViewport.clientWidth)return;e.preventDefault();pathViewport.scrollLeft+=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;},{passive:false});
  listen(pathViewport,'pointerdown',e=>{if(e.button!==0||e.pointerType==='touch'||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;crumbDrag={pointer:e.pointerId,x:e.clientX,start:e.clientX,left:pathViewport.scrollLeft,moved:false};});
  listen(pathViewport,'pointermove',e=>{if(!crumbDrag||e.pointerId!==crumbDrag.pointer)return;if(Math.abs(e.clientX-crumbDrag.start)>4){crumbDrag.moved=true;pathViewport.classList.add('dragging');pathViewport.setPointerCapture(e.pointerId);}if(crumbDrag.moved)pathViewport.scrollLeft=crumbDrag.left-(e.clientX-crumbDrag.start);});
  listen(document,'pointerup',e=>{if(!crumbDrag||e.pointerId!==crumbDrag.pointer)return;if(crumbDrag.moved)suppressReleaseClick();crumbDrag=null;pathViewport.classList.remove('dragging');if(pathViewport.hasPointerCapture(e.pointerId))pathViewport.releasePointerCapture(e.pointerId);});
  function restorePath(raw,id){
    let restored=P.sanitize(raw,id,G.PAGES,G.HOME_ID);
    // Back and reload highlight the earlier stop while retaining its forward branch.
    if(restored.cursor<route.items.length&&restored.items.slice(0,restored.cursor+1).every((id,i)=>route.items[i]===id))restored={items:[...route.items],cursor:restored.cursor};
    return restored;
  }
  function restoreHistory(event){
    const entry=navigation.read(event);if(!entry)return;cancelInputs();
    navigate(entry.page,{push:false,restoredPath:restorePath(entry.path,entry.page),anchor:entry.anchor});
  }
  listen(window,'popstate',restoreHistory);listen(window,'hashchange',restoreHistory);
  function resize(){syncFrame();if(!preferences.mapOpen){if(animation)animation.to=readingTarget();else camera=readingTarget();}render();}
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(resize);observer.observe(stage);observer.observe(host.querySelector('.site-header'));observers.push(observer);}else listen(window,'resize',resize);
  listen(reducedMotion,'change',()=>{if(reducedMotion.matches){if(animation){camera={...animation.to};animation=null;}settle(drag?.node||null);render();}});
  syncPath();syncFrame();ensureSimulation();camera=preferences.mapOpen?graphTarget():readingTarget();render();writeHistory(false,pendingAnchor);if(!preferences.mapOpen)scrollAnchor();if(reconciled)announce('The source has changed. History for available pages and links was kept; unavailable entries were removed.');

  return cleanup;
  } catch(error) { cleanup(); throw error; }
}
