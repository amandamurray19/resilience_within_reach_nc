/* Time-limited exact weighted maximum-coverage solver. */
self.onmessage = ({data:model}) => {
  try { solve(model); }
  catch (error) { self.postMessage({type:"error", message:error.message || String(error)}); }
};

function solve({components, siteCount:n, k, blockCount}) {
  if (!components.length) throw new Error("Choose at least one score component with a positive weight.");
  if (!Number.isInteger(k) || k < 1 || k > n) throw new Error("The requested network size is invalid.");
  const weightSum=components.reduce((sum,c)=>sum+c.weight,0);
  const weights=components.map(c=>c.pop.map(v=>v/c.total*c.weight));
  const cover=components.map(c=>c.blocksBySite);
  const counts=components.map(()=>new Uint16Array(blockCount));
  const started=performance.now(),deadline=started+15000;
  let score=0,best=-1,bestSites=[],nodes=0,lastProgress=started,timedOut=false;
  const order=Array.from({length:n},(_,site)=>({site,value:components.reduce((sum,c,ci)=>sum+cover[ci][site].reduce((s,b)=>s+weights[ci][b],0),0)})).sort((a,b)=>b.value-a.value||a.site-b.site).map(x=>x.site);
  function gain(site){let v=0;for(let ci=0;ci<components.length;ci++)for(const b of cover[ci][site])if(counts[ci][b]===0)v+=weights[ci][b];return v}
  function add(site){let v=0;for(let ci=0;ci<components.length;ci++)for(const b of cover[ci][site])if(counts[ci][b]++===0)v+=weights[ci][b];score+=v}
  function remove(site){let v=0;for(let ci=0;ci<components.length;ci++)for(const b of cover[ci][site])if(--counts[ci][b]===0)v+=weights[ci][b];score-=v}
  const greedy=[];
  for(let step=0;step<k;step++){let pick=-1,pickGain=-1;for(const site of order)if(!greedy.includes(site)){const g=gain(site);if(g>pickGain){pick=site;pickGain=g}}greedy.push(pick);add(pick)}
  best=score;bestSites=[...greedy];for(let i=greedy.length-1;i>=0;i--)remove(greedy[i]);
  function bound(start,slots){const gains=[];for(let pos=start;pos<n;pos++)gains.push(gain(order[pos]));gains.sort((a,b)=>b-a);let result=score;for(let i=0;i<Math.min(slots,gains.length);i++)result+=gains[i];return Math.min(weightSum,result)}
  const chosen=[];
  function search(start){if(performance.now()>=deadline){timedOut=true;return}nodes++;const slots=k-chosen.length;if(slots===0){if(score>best+1e-12){best=score;bestSites=[...chosen]}return}if(n-start<slots||bound(start,slots)<=best+1e-12)return;for(let pos=start;pos<=n-slots;pos++){const site=order[pos];chosen.push(site);add(site);search(pos+1);remove(site);chosen.pop();const now=performance.now();if(now-lastProgress>250){self.postMessage({type:"progress",nodes,best:best/weightSum,elapsed:(now-started)/1000});lastProgress=now}if(timedOut)break}}
  if(k===n){bestSites=Array.from({length:n},(_,i)=>i);best=weightSum;nodes=1}else search(0);
  bestSites.sort((a,b)=>a-b);self.postMessage({type:"done",sites:bestSites,score:best/weightSum,nodes,optimal:!timedOut,elapsed:(performance.now()-started)/1000});
}
