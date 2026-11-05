const CITY_FILES={Asheville:"asheville",Greenville:"greenville",Lumberton:"lumberton","Rocky Mount":"rocky_mount"};
const $=id=>document.getElementById(id);
const state={data:null,selected:new Set(),applied:new Set(),markers:[],blockLayer:null,routeByBlock:[],previous:null,dirty:false,factors:[]};
let map;

function fmt(value,digits=0){return Number(value||0).toLocaleString(undefined,{maximumFractionDigits:digits})}
function pct(value){return Number.isFinite(value)?`${value.toFixed(1)}%`:"—"}
function quantile(values,q){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);const i=(sorted.length-1)*q;const lo=Math.floor(i),hi=Math.ceil(i);return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo)}
function setLoading(on,label="Loading city data…"){
  let overlay=document.querySelector(".loading-overlay");
  if(on&&!overlay){overlay=document.createElement("div");overlay.className="loading-overlay";overlay.innerHTML=`<div><i></i><strong>${label}</strong><span>Preparing your network workspace</span></div>`;document.body.appendChild(overlay)}
  if(!on&&overlay)overlay.remove();
}
function markDirty(){state.dirty=true;$("rerun").classList.add("dirty");$("rerun").innerHTML="<span>↻</span> RERUN ANALYSIS"}

async function loadCity(city){
  setLoading(true);state.previous=null;
  const response=await fetch(`data/${CITY_FILES[city]}.json`);
  if(!response.ok)throw new Error(`Could not load ${city}`);
  state.data=await response.json();state.selected=new Set(state.data.locations.slice(0,Math.min(3,state.data.locations.length)).map((_,i)=>i));state.applied=new Set(state.selected);
  buildRouteIndex();renderSites();updateCount();calculate();$("mapTitle").textContent=`${city}, NC`;setLoading(false);
}

function buildRouteIndex(){
  state.routeByBlock=Array.from({length:state.data.blocks.length},()=>[]);
  state.data.routes.forEach(route=>state.routeByBlock[route[0]].push(route));
}

function renderSites(){
  const query=$("siteSearch").value.trim().toLowerCase();
  const rows=state.data.locations.map((site,index)=>({site,index})).filter(({site})=>!query||`${site[0]} ${site[1]} ${site[2]} ${site[3]}`.toLowerCase().includes(query));
  $("siteList").innerHTML=rows.length?rows.map(({site,index})=>`<label class="site-item"><input type="checkbox" data-site="${index}" ${state.selected.has(index)?"checked":""}><span class="site-copy"><strong>${site[1]}</strong><small>${site[2]} · ${site[3]||"Address unavailable"}</small></span><span class="site-key">${site[0]}</span></label>`).join(""):"<div class='empty-state'>No candidate sites match that search.</div>";
  $("siteList").querySelectorAll("input").forEach(input=>input.addEventListener("change",event=>{const index=+event.target.dataset.site;event.target.checked?state.selected.add(index):state.selected.delete(index);updateCount();updateSiteMarkers();markDirty()}));
  $("siteTotal").textContent=`${state.data.locations.length} candidates`;
  $("selectAll").textContent=state.selected.size===state.data.locations.length?"Clear all":"Select all";
}

function updateCount(){
  $("siteCount").innerHTML=`${state.selected.size} <small>site${state.selected.size===1?"":"s"} selected</small>`;
  $("selectAll").textContent=state.selected.size===state.data.locations.length?"Clear all":"Select all";
}

function initMap(){
  map=L.map("map",{zoomControl:false});L.control.zoom({position:"bottomright"}).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).addTo(map);
}
function siteIcon(selected){return L.divIcon({className:"",html:`<div class="site-marker ${selected?"selected":""}"></div>`,iconSize:selected?[25,25]:[20,20],iconAnchor:selected?[12,23]:[10,19],popupAnchor:[0,-18]})}
function renderMap(){
  if(!map)initMap();
  state.markers.forEach(marker=>marker.remove());state.markers=[];
  if(state.blockLayer)state.blockLayer.remove();
  const populated=state.data.blocks.filter(block=>block[3]>0&&block[1]!=null&&block[2]!=null);
  state.blockLayer=L.layerGroup(populated.map(block=>L.circleMarker([block[1],block[2]],{radius:Math.max(1.5,Math.min(5,Math.sqrt(block[3])/4)),color:"#1f555b",weight:.4,fillColor:"#5ca4af",fillOpacity:.18,interactive:false}))).addTo(map);
  state.data.locations.forEach((site,index)=>{const marker=L.marker([site[4],site[5]],{icon:siteIcon(state.selected.has(index)),zIndexOffset:state.selected.has(index)?500:0}).bindPopup(`<strong>${site[1]}</strong><br><small>${site[2]}<br>${site[3]||"Address unavailable"}${site[6]?`<br>Estimated capacity: ${fmt(site[6])}`:""}</small>`).addTo(map);marker.on("click",()=>{});state.markers.push(marker)});
  const bounds=L.latLngBounds(state.data.locations.filter(site=>site[4]!=null&&site[5]!=null).map(site=>[site[4],site[5]]));if(bounds.isValid())map.fitBounds(bounds.pad(.15));requestAnimationFrame(()=>map.invalidateSize());
}
function updateSiteMarkers(){state.markers.forEach((marker,index)=>{marker.setIcon(siteIcon(state.selected.has(index)));marker.setZIndexOffset(state.selected.has(index)?500:0)})}

function accessForNetwork(){
  const walkCap=+$('walkCap').value,transitTime=+$('transitTime').value,transitWalk=+$('transitWalk').value;
  const applied=state.applied;
  return state.routeByBlock.map(routes=>{
    let walk=false,transit=false,minWalk=null;
    routes.forEach(route=>{if(!applied.has(route[1]))return;if(route[2]!=null&&route[2]<=walkCap)walk=true;if(route[4]!=null&&route[5]!=null&&route[4]<=transitTime&&route[5]<=transitWalk)transit=true;if(route[3]!=null&&(minWalk==null||route[3]<minWalk))minWalk=route[3]});
    return {walk,transit,minWalk};
  });
}
function groupCoverage(access,mode){
  return state.data.groupLabels.map((label,g)=>{let total=0,reached=0;state.data.blocks.forEach((block,b)=>{const value=block[3+g]||0;total+=value;if(access[b][mode])reached+=value});return {label,total,reached,coverage:total?reached/total*100:0}});
}
function calculate(){
  state.applied=new Set(state.selected);const access=accessForNetwork();const walk=groupCoverage(access,"walk"),transit=groupCoverage(access,"transit");const times=access.map((item,index)=>state.data.blocks[index][3]>0?item.minWalk:null).filter(value=>value!=null);
  renderHeadline(walk[0],transit[0]);renderGroups($("modeSelect").value==="walk"?walk:transit);renderTimes(times);renderTable($("modeSelect").value==="walk"?walk:transit);
  state.previous={walk,transit};state.dirty=false;$("rerun").classList.remove("dirty","loading");$("rerun").innerHTML="<span>↻</span> RERUN ANALYSIS";updateSiteMarkers();
}
function renderHeadline(walk,transit){
  $("walkValue").innerHTML=`${state.applied.size?walk.coverage.toFixed(1):"—"}<small>%</small>`;$("walkMeter").style.width=`${state.applied.size?walk.coverage:0}%`;$("walkPeople").textContent=state.applied.size?`${fmt(walk.reached)} of ${fmt(walk.total)} residents`:"Choose sites to calculate";
  $("transitValue").innerHTML=`${state.applied.size?transit.coverage.toFixed(1):"—"}<small>%</small>`;$("transitMeter").style.width=`${state.applied.size?transit.coverage:0}%`;$("transitPeople").textContent=state.applied.size?`${fmt(transit.reached)} of ${fmt(transit.total)} residents`:"Choose sites to calculate";
  $("walkCapLabel").textContent=`${(+$('walkCap').value).toFixed(1)} km`;$("transitCapLabel").textContent=`${$('transitTime').value} min + ${$('transitWalk').value} km walk`;
}
function renderGroups(groups){
  $("groupChart").innerHTML=groups.map(group=>`<div class="bar-row"><span>${group.label}</span><div class="bar-track"><div class="bar-fill" style="width:${state.applied.size?group.coverage:0}%"></div></div><b>${state.applied.size?pct(group.coverage):"—"}</b></div>`).join("");
}
function renderTimes(times){
  const valid=state.applied.size?times:[];const mean=valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null,median=quantile(valid,.5),p90=quantile(valid,.9);
  $("meanTime").textContent=mean==null?"—":`${mean.toFixed(1)} min`;$("medianTime").textContent=median==null?"—":`${median.toFixed(1)} min`;$("p90Time").textContent=p90==null?"—":`${p90.toFixed(1)} min`;
  if(!valid.length){$("spark").innerHTML="";return}const bins=24,max=Math.max(...valid),counts=Array(24).fill(0);valid.forEach(value=>counts[Math.min(23,Math.floor(value/max*24))]++);const top=Math.max(...counts);$("spark").innerHTML=counts.map(count=>`<i style="height:${Math.max(2,count/top*100)}%"></i>`).join("");
}
function renderTable(groups){
  const old=state.previous?.[$("modeSelect").value];
  $("coverageTable").innerHTML=groups.map((group,index)=>{const change=old?group.coverage-old[index].coverage:null;return `<tr><td>${group.label}</td><td>${fmt(group.total)}</td><td>${state.applied.size?fmt(group.reached):"—"}</td><td><span class="coverage-pill">${state.applied.size?pct(group.coverage):"—"}</span></td><td>${change==null||!state.applied.size?"—":`${change>=0?"+":""}${change.toFixed(1)} pts`}</td></tr>`}).join("");
  $("tableMode").textContent=$("modeSelect").value==="walk"?`WALKING · ${(+$("walkCap").value).toFixed(1)} KM`:`TRANSIT · ${$("transitTime").value} MIN + ${$("transitWalk").value} KM WALK`;
}

const FACTORS=[
  {id:0,label:"Total population",description:"Residents covered by the proposed network."},
  {id:1,label:"Older adults · 65+",description:"Estimated residents age 65 and older."},
  {id:2,label:"Residents below poverty",description:"Estimated residents below the poverty level."},
  {id:3,label:"Households without a vehicle",description:"Estimated no-vehicle households."},
  {id:4,label:"People with disabilities",description:"Estimated residents with a disability."},
  {id:5,label:"High social vulnerability",description:"Residents in the highest SVI quartile."},
  {id:6,label:"Flood risk population",description:"Residents in blocks mapped within flood areas."},
  {id:7,label:"Heat risk population",description:"Residents in the hottest quartile of sampled blocks."}
];
function renderFactorChoices(){
  $("factorChoices").innerHTML=FACTORS.map(f=>`<div class="factor-choice"><input type="checkbox" data-factor="${f.id}" id="factor-${f.id}" ${[0,1,3,6,7].includes(f.id)?"checked":""}><label class="factor-name" for="factor-${f.id}"><strong>${f.label}</strong><small>${f.description}</small></label><div class="factor-settings"><select aria-label="${f.label} access mode" data-mode="${f.id}"><option value="both">Both modes</option><option value="walk">Walking</option><option value="transit">Transit + walk</option></select><select class="weight-select" aria-label="${f.label} weight" data-weight="${f.id}">${Array.from({length:11},(_,w)=>`<option value="${w}" ${w===5?"selected":""}>${w}/10</option>`).join("")}</select></div></div>`).join("");
  $("factorChoices").querySelectorAll("input,select").forEach(el=>el.addEventListener("change",updateWeightPreview));updateWeightPreview();
}
function updateWeightPreview(){
  const selected=[...$("factorChoices").querySelectorAll("input:checked")];state.factors=selected.map(input=>{const id=+input.dataset.factor;return {id,label:FACTORS.find(f=>f.id===id).label,mode:$("factorChoices").querySelector(`[data-mode="${id}"]`).value,weight:+$("factorChoices").querySelector(`[data-weight="${id}"]`).value}});
  const sum=state.factors.reduce((a,f)=>a+f.weight,0);$("weightPreview").innerHTML=`<strong>${state.factors.length} factors selected</strong> · Weights total ${sum}/10 points per factor. At least one factor and a weight above 0 are required.`;
}
$("buildNetwork").addEventListener("click",async()=>{
  updateWeightPreview();if(!state.factors.length||state.factors.every(f=>f.weight===0)){alert("Select at least one factor and give one factor a weight above 0.");return}
  const city=$("setupCity").value;$("citySelect").value=city;$("setupScreen").hidden=true;$("resultsScreen").hidden=false;
  try{await loadCity(city);$("siteTarget").dispatchEvent(new Event("change"));renderMap();}catch(error){showError(error)}
});
$("citySelect").addEventListener("change",event=>{$("setupCity").value=event.target.value;loadCity(event.target.value).then(renderMap).catch(showError)});
$("siteSearch").addEventListener("input",renderSites);
$("selectAll").addEventListener("click",()=>{state.selected=state.selected.size===state.data.locations.length?new Set():new Set(state.data.locations.map((_,i)=>i));renderSites();updateCount();updateSiteMarkers();markDirty()});
[$("walkCap"),$("transitTime"),$("transitWalk")].forEach(control=>control.addEventListener("change",markDirty));
$("modeSelect").addEventListener("change",()=>{if(!state.data)return;const access=accessForNetwork(),groups=groupCoverage(access,$("modeSelect").value);renderGroups(groups);renderTable(groups)});
$("rerun").addEventListener("click",()=>{$("rerun").classList.add("loading");$("rerun").innerHTML="<span>↻</span> CALCULATING…";setTimeout(()=>{calculate();renderMap()},80)});
function showError(error){setLoading(false);console.error(error);document.body.insertAdjacentHTML("afterbegin",`<div class="notice" style="margin:10px"><span>!</span><p><strong>Could not load the planner data.</strong> ${error.message}. GitHub Pages or a local web server is required.</p></div>`)}
$("siteTarget").addEventListener("change",()=>{const count=+$('siteTarget').value;state.selected=new Set(state.data.locations.slice(0,count).map((_,i)=>i));renderSites();updateCount();markDirty()});
renderFactorChoices();
