// ===== STATE =====
let allData = DEFAULT_DATA.slice();
// SEC_ICONS / SEC_COLORS are hint maps — new sections from custom CSVs get fallbacks automatically
const SEC_ICONS = {'All':'🌐','Stocks':'📈','ETFs & Funds':'📦','Bonds':'🏦','Commodities':'🛢️','Real Estate':'🏘️'};
const SEC_COLORS_MAP = {'Stocks':'#2563eb','ETFs & Funds':'#10b981','Bonds':'#0ea5e9','Commodities':'#f59e0b','Real Estate':'#ef4444'};
const SEC_COLORS_POOL = ['#2563eb','#10b981','#0ea5e9','#f59e0b','#ef4444','#f97316','#a855f7','#06b6d4','#84cc16','#ec4899','#14b8a6','#fb923c'];
const COLORS = ['#2563eb','#7c3aed','#f59e0b','#ef4444','#06b6d4','#10b981','#f97316','#ec4899','#a855f7','#14b8a6','#f43f5e','#84cc16','#fb923c','#22d3ee','#818cf8'];

// Returns ordered list of sections present in data, with 'All' prepended
function getSections(data){
  const known=['Stocks','ETFs & Funds','Bonds','Commodities','Real Estate'];
  const inData=[...new Set((data||allData).map(r=>r.section).filter(Boolean))];
  // Known sections first (in order), then any unknown ones alphabetically
  const ordered=known.filter(s=>inData.includes(s));
  inData.filter(s=>!known.includes(s)).sort().forEach(s=>ordered.push(s));
  return ['All',...ordered];
}

// Returns a stable color for a section name
function getSectionColor(sec, fallbackIndex){
  if(SEC_COLORS_MAP[sec]) return SEC_COLORS_MAP[sec];
  return SEC_COLORS_POOL[fallbackIndex % SEC_COLORS_POOL.length];
}

// Returns short display label for a section name
function secLabel(s){
  if(s==='ETFs & Funds') return 'ETFs';
  if(s==='Real Estate') return 'Real Est.';
  return s;
}

let chartTimelineYears = 20;

function setTimeline(yrs){
  chartTimelineYears = yrs;
  document.querySelectorAll('.timeline-btn').forEach(b=>{
    b.classList.toggle('on', parseInt(b.dataset.yrs)===yrs);
  });
  renderChartArea();
}

const YEARS = [1,5,10,15,20];

let activeSection = 'All';
let filteredData = [];
let sortKey = 'v10';
let sortDir = -1;
let currentPage = 1;
const PAGE_SIZE = 50;
let selectedNames = [];
let chart = null;

let selectedCats = new Set();
let selectedSecs = new Set();
let excludedNames = new Set();
let allTableData = [];

let top10ChartInst = null, sectionChartInst = null, scatterChartInst = null, catCountChartInst = null, catRoiChartInst = null;
let top10Range = 10;
let top10Expanded = false;
let sectionRange = 10;
let catCountRange = 10;
let catRoiRange = 10;

let seedMultiplier = 1;
let originalData = null;
let usingCustomData = false;

let kpiIndex = 0, kpiTimer = null, kpiCards = [];

// ===== HELPERS =====
function secData(sec){ const d=sec==='All'?allData:allData.filter(r=>r.section===sec); return excludedNames.size>0?d.filter(r=>!excludedNames.has(r.name)):d; }
function secCount(sec){ return secData(sec).length; }

// ===== INIT =====
function init(){
  buildSidebar();
  applySection('All');
  updateThemeIcon();
}

function buildSidebar(){
  buildSectionTabs();
}

function buildSectionTabs(){
  const el=document.getElementById('sectionTabs');
  if(!el) return;
  let h='';
  for(const s of getSections(allData)){
    const cnt=s==='All'?allData.length:allData.filter(r=>r.section===s).length;
    const icon=SEC_ICONS[s]||'📁';
    h+=`<button class="sec-tab${s===activeSection?' active':''}" onclick="applySection('${s.replace(/'/g,"\\'")}')">
      ${icon} ${s} <span class="sec-count">${cnt}</span>
    </button>`;
  }
  el.innerHTML=h;
}

function applySection(sec){
  activeSection=sec;
  buildSectionTabs();
  currentPage=1; selectedNames=[]; selectedCats=new Set(); selectedSecs=new Set(); allTableData=[];
  document.getElementById('compareCount').textContent='0';
  document.getElementById('searchInput').value='';
  populateSecFilter();
  populateCatFilter();
  applyFilters();
  updateKPIs();
  autoSelectDefault();
  renderChartArea();
  renderMiniCharts();
}

// ===== KPI CAROUSEL =====
function buildKPICards(d){
  const byV=(y)=>d.filter(r=>r['v'+y]!=null).sort((a,b)=>b['v'+y]-a['v'+y]);
  const worst=(y)=>d.filter(r=>r['v'+y]!=null).sort((a,b)=>a['v'+y]-b['v'+y]);
  const b1=byV(1)[0],b5=byV(5)[0],b10=byV(10)[0],b15=byV(15)[0],b20=byV(20)[0];
  const w1=worst(1)[0],w5=worst(5)[0],w10=worst(10)[0];
  const cats=[...new Set(d.map(r=>r.category).filter(Boolean))];
  const avgV=(y)=>{ const vs=d.filter(r=>r['v'+y]!=null).map(r=>r['v'+y]*seedMultiplier); return vs.length?Math.round(vs.reduce((a,b)=>a+b,0)/vs.length):null; };
  const medV=(y)=>{ const vs=d.filter(r=>r['v'+y]!=null).map(r=>r['v'+y]*seedMultiplier).sort((a,b)=>a-b); return vs.length?vs[Math.floor(vs.length/2)]:null; };
  const pct10x=(y)=>{ const vs=d.filter(r=>r['v'+y]!=null); const n=vs.filter(r=>r['v'+y]>=10000).length; return vs.length?Math.round(n/vs.length*100):0; };
  const secCounts={};d.forEach(r=>{secCounts[r.section]=(secCounts[r.section]||0)+1;});
  const topSec=Object.entries(secCounts).sort((a,b)=>b[1]-a[1])[0];
  const avg1=avgV(1),avg5=avgV(5),avg10=avgV(10),avg20=avgV(20);
  const med10=medV(10),med20=medV(20);
  const p10x10=pct10x(10),p10x20=pct10x(20);
  const gainers1=d.filter(r=>r.v1!=null&&r.v1>1000).length;
  const losers1=d.filter(r=>r.v1!=null&&r.v1<1000).length;
  const multiples=[...d].filter(r=>r.g20!=null).sort((a,b)=>b.g20-a.g20);
  const topMult=multiples[0];
  const over100x=d.filter(r=>r.g10!=null&&r.g10>=25).length;
  const over1000x=d.filter(r=>r.g20!=null&&r.g20>=50).length;
  // Outlier stats — assets more than 2 std deviations from the mean at 10Y
  const v10set=d.filter(r=>r.v10!=null).map(r=>r.v10);
  const v10mean=v10set.length?v10set.reduce((a,b)=>a+b,0)/v10set.length:0;
  const v10std=v10set.length?Math.sqrt(v10set.reduce((a,b)=>a+(b-v10mean)**2,0)/v10set.length):0;
  const upsideOutliers=d.filter(r=>r.v10!=null&&r.v10>v10mean+2*v10std).sort((a,b)=>b.v10-a.v10);
  const downsideOutliers=d.filter(r=>r.v10!=null&&r.v10<Math.max(500,v10mean-1.5*v10std)).sort((a,b)=>a.v10-b.v10);

  // Helper: build top-N list for tooltip [{name, display}] — N scales with dataset size
  const TIP_N = Math.min(10, Math.max(5, Math.ceil(d.length / 20)));
  function top5byV(y,asc=false){
    return d.filter(r=>r['v'+y]!=null)
      .sort((a,b)=>asc?a['v'+y]-b['v'+y]:b['v'+y]-a['v'+y])
      .slice(0,TIP_N)
      .map(r=>({name:r.name,display:r['vs'+y]||'—',extra:r['gs'+y]||''}));
  }
  function top5byG(y,asc=false){
    return d.filter(r=>r['g'+y]!=null)
      .sort((a,b)=>asc?a['g'+y]-b['g'+y]:b['g'+y]-a['g'+y])
      .slice(0,TIP_N)
      .map(r=>({name:r.name,display:(r['gs'+y]||'—'),extra:r['vs'+y]||''}));
  }
  function top5thresh(y,minG){
    return d.filter(r=>r['g'+y]!=null&&r['g'+y]>=minG)
      .sort((a,b)=>b['g'+y]-a['g'+y])
      .slice(0,TIP_N)
      .map(r=>({name:r.name,display:r['gs'+y]||'—',extra:r['vs'+y]||''}));
  }
  function top5neg(y){
    return d.filter(r=>r['v'+y]!=null&&r['v'+y]<1000*seedMultiplier)
      .sort((a,b)=>a['v'+y]-b['v'+y])
      .slice(0,TIP_N)
      .map(r=>({name:r.name,display:r['vs'+y]||'—',extra:r['gs'+y]||''}));
  }
  function top5gainers(){ return d.filter(r=>r.v1!=null&&r.v1>1000).sort((a,b)=>b.v1-a.v1).slice(0,TIP_N).map(r=>({name:r.name,display:r.vs1||'—',extra:r.gs1||''})); }
  function top5losers(){ return d.filter(r=>r.v1!=null&&r.v1<1000).sort((a,b)=>a.v1-b.v1).slice(0,TIP_N).map(r=>({name:r.name,display:r.vs1||'—',extra:r.gs1||''})); }

  function encodeAssets(arr){ return encodeURIComponent(JSON.stringify(arr)); }

  function kpiAiPrompt(label, val, sub) {
    const l = label.toLowerCase();
    if (l.includes('best 1-year'))  return `${sub} leads the 1-year return at ${val}. Show its full return profile across all horizons, explain what drove this 1-year spike, and how it compares to other top 1-year performers in the dataset.`;
    if (l.includes('best 5-year'))  return `${sub} is the best 5-year performer at ${val}. Show its complete return history, what fundamentals or macro factors drove this 5-year run, and whether its lead holds at 10 and 20 years too.`;
    if (l.includes('best 10-year')) return `${sub} tops the 10-year leaderboard at ${val}. Break down its full return history, the compounding story behind it, and compare it to the next best performers in the dataset.`;
    if (l.includes('best 15-year')) return `${sub} is the best 15-year performer at ${val}. Show its return trajectory from 1Y to 20Y, what sustained this 15-year run, and what an investor who held it experienced.`;
    if (l.includes('best 20-year')) return `${sub} is the best 20-year performer at ${val}. Show the full compounding journey from 1Y to 20Y, the real-world drivers of this 20-year run, and how extreme this outlier is versus the dataset median.`;
    if (l.includes('worst 1-year')) return `${sub} is the worst 1-year performer at ${val}. Show its full return profile, what caused this 1-year drawdown, and whether it recovers over 5 or 10 years.`;
    if (l.includes('worst 5-year')) return `${sub} is the worst 5-year performer at ${val}. Show its return history, what structural issues have held it back, and whether there is any long-term recovery in the data.`;
    if (l.includes('worst 10-year'))return `${sub} is the worst 10-year performer at ${val}. Break down its trajectory, what has driven a decade of underperformance, and how it compares to the dataset median of ${val}.`;
    if (l.includes('avg 1-year'))   return `The dataset average 1-year value is ${val}. Show which asset classes drive this average, which ones are above and below, and what this tells us about short-term investing risk.`;
    if (l.includes('avg 5-year'))   return `The dataset average 5-year value is ${val}. Break down which asset classes pull this average up, compare it to a typical index fund benchmark, and show the spread between best and worst.`;
    if (l.includes('avg 10-year'))  return `The dataset average 10-year value is ${val}. Show which asset classes dominate at 10 years, how the average compares to the median, and what this implies for long-term portfolio building.`;
    if (l.includes('avg 20-year'))  return `The dataset average 20-year value is ${val}. Identify the outliers that skew this figure, compare it to the median, and explain what a realistic 20-year outcome looks like for most assets.`;
    if (l.includes('median 10-year'))return `The median 10-year value is ${val} — half the dataset did better, half worse. Show which assets sit near this median, compare it to the mean, and explain what a typical long-term investor should expect.`;
    if (l.includes('median 20-year'))return `The median 20-year value is ${val}. Compare it to the dataset average, show the assets closest to this midpoint, and explain what a realistic 20-year compounding outcome looks like.`;
    if (l.includes('10x in 10'))    return `${val} of assets in this dataset turned $1,000 into $10,000+ in 10 years. Show which specific assets achieved this, what asset classes they belong to, and what characteristics they share.`;
    if (l.includes('10x in 20'))    return `${val} of assets hit 10x or more over 20 years. Show the assets that crossed this threshold, break down which sectors they come from, and assess whether a diversified portfolio could realistically target this.`;
    if (l.includes('25x club'))     return `These assets turned $1,000 into $25,000+ in 10 years. Show their full return profiles from 1Y to 20Y, identify what they have in common, and explain the CAGR required to hit 25x in a decade.`;
    if (l.includes('50x club'))     return `These assets turned $1,000 into $50,000+ over 20 years. Show their complete return histories, what macro or structural tailwinds powered them, and how realistic this benchmark is for a new investor.`;
    if (l.includes('winners vs losers')) return `In this dataset ${val} — ${sub}. Show the top 3 winners and the worst 3 losers by 1-year return with their exact figures, and explain what the ratio tells us about short-term market breadth.`;
    if (l.includes('top multiplier'))    return `${sub} achieved the top 20-year growth multiple of ${val}. Show its complete return history from 1Y to 20Y, what drove this compounding, and how far it sits above the next best performers.`;
    if (l.includes('best 10y multiplier'))return `${sub} has the best 10-year growth multiple at ${val}. Show its full trajectory, what drove this extreme 10-year run, and compare it to the dataset average 10-year multiple.`;
    if (l.includes('largest section'))   return `${val} — the largest section in this view. Break down how the assets in this section perform at 10 and 20 years compared to other sections, and whether size means better or worse average returns.`;
    if (l.includes('avg 1-year growth')) return `The average 1-year growth multiple across this dataset is ${val}. Show which asset classes sit above and below this average, and what percentage of assets are actually growing above 1x.`;
    if (l.includes('avg 5-year growth')) return `The average 5-year growth multiple is ${val}. Break down which asset classes drive this figure, show the top and bottom performers, and explain what this means for 5-year holding strategies.`;
    if (l.includes('avg 20-year growth'))return `The average 20-year growth multiple is ${val}. Show the specific outliers that pull this average up, compare it to the median multiple, and give a realistic picture of long-term compounding.`;
    if (l.includes('top 10 avg (10y)')) return `The top 10 assets at 10 years average ${val}. Show these specific assets with their exact 10-year returns, what they have in common, and how realistic it is to have picked them in advance.`;
    if (l.includes('top 10 avg (20y)')) return `The top 10 assets at 20 years average ${val}. Show these specific assets with their full return profiles, what sectors dominate, and what early signals might have identified them.`;
    if (l.includes('beat 2x in 1'))      return `${val} in this dataset doubled or more in a single year. Show the specific assets that hit 2x+ in 1 year, their return profiles at longer horizons, and what types of assets tend to produce 2x annual returns.`;
    if (l.includes('beat 5x in 5'))      return `${val} achieved 5x or more in 5 years. Show the specific assets that hit this threshold, their return histories, and the CAGR (~38%) required to sustain this rate.`;
    if (l.includes('beat 20x in 10'))    return `${val} achieved 20x or more in 10 years (~35% CAGR). Show the specific assets that hit this, their complete return profiles, and what structural advantages allowed such extreme 10-year growth.`;
    if (l.includes('negative at 5y'))    return `${val} in this dataset are still below their seed value after 5 years. Show these specific assets, what has caused persistent underperformance, and whether any recover at 10 or 20 years.`;
    if (l.includes('negative at 10y'))   return `${val} are still below seed value after a full decade. Show these specific assets, analyse their long-term trajectory, and advise whether long-term investors should avoid or wait on them.`;
    if (l.includes('data coverage'))     return `Only ${val} in this dataset have 20-year return data. Explain survivorship bias — which types of assets are over or under-represented, and how this skews long-term return statistics.`;
    if (l.includes('highest 1y volatility')) return `The 1-year spread between best and worst return is ${val}. Show the specific best and worst 1-year performers from the dataset, and explain what this volatility range means for short-term risk.`;
    if (l.includes('seed investment'))   return `With a seed investment of ${val}, show how different asset classes compound this amount over 10 and 20 years using actual dataset figures. Compare the best, median, and worst outcomes.`;
    if (l.includes('upside outliers'))   return `${val} are upside outliers at 10 years. Show these specific assets, their full return profiles, and explain whether targeting outliers is a realistic investment strategy or survivorship bias.`;
    if (l.includes('downside outliers')) return `${val} are downside outliers at 10 years. Show these specific assets, analyse what patterns they share, and explain whether persistent underperformers recover over 20 years.`;
    if (l.includes('total assets'))      return `There are ${val} assets in this view (${sub}). Show a breakdown by asset class with average returns at key horizons, and explain what the breadth of this dataset tells us about investment universe coverage.`;
    if (l.includes('categories'))        return `This dataset covers ${val} unique categories (${sub}). Show a breakdown of which categories have the best and worst average 10-year returns, and assess how well the dataset covers the investment universe.`;
    return `Analyse the "${label}" metric: ${val} — ${sub}. Use exact figures from the dataset to support your analysis.`;
  }

  const AI_FOOTER = `<div class="ai-analyse-footer"><button class="ai-analyse-btn" onclick="event.stopPropagation();kpiAiClick(this)" tabindex="-1"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>Analyse with AI</button></div>`;

  const card=(icon,label,val,sub,accent='var(--primary)',tip='',assets=[])=>{
    const tipAttr=tip?` data-kpi-tip="${tip.replace(/"/g,'&quot;')}"`:''
    const assetsAttr=assets.length?` data-kpi-assets="${encodeAssets(assets)}"`:''
    const prompt = kpiAiPrompt(label, val, sub);
    const promptAttr = ` data-ai-prompt="${prompt.replace(/"/g,'&quot;')}"`;
    return `<div class="kpi-card" style="--card-accent:${accent}"${tipAttr}${assetsAttr}${promptAttr} onmouseenter="showKpiTip(event,this)" onmouseleave="hideKpiTip()">
      <div class="kpi-icon">${icon}</div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value" style="color:${accent}">${val}</div>
      <div class="kpi-sub">${sub}</div>
      ${AI_FOOTER}
    </div>`;
  };

  const top5all_v10=top5byV(10);
  const top5all_v20=top5byV(20);

  return [
    card('🌐','Total Assets in View',d.length,activeSection,'var(--primary)',
      'Number of assets currently visible based on your active section and filters.',
      d.sort((a,b)=>b['v10']-(a['v10']||0)).slice(0,TIP_N).map(r=>({name:r.name,display:r.section||'—',extra:''}))),
    card('📊','Categories',cats.length,'Unique categories tracked','var(--primary)',
      'Count of unique category tags present across all assets in the current view.',
      [...new Set(d.map(r=>r.category).filter(Boolean))].slice(0,TIP_N).map(c=>({name:c,display:'',extra:''}))),
    card('🥇','Best 1-Year Return',b1?b1.vs1:'—',b1?b1.name:'','#f59e0b',
      'Top performers by 1-year value. Value shown is the result of a seed investment after 1 year.',
      top5byV(1)),
    card('📈','Best 5-Year Return',b5?b5.vs5:'—',b5?b5.name:'','#2563eb',
      'Top performers by 5-year value from a seed investment.',
      top5byV(5)),
    card('🚀','Best 10-Year Return',b10?b10.vs10:'—',b10?b10.name:'','#2563eb',
      'Top performers over 10 years. Holding for a decade often separates compounders from the rest.',
      top5byV(10)),
    card('💎','Best 15-Year Return',b15?b15.vs15:'—',b15?b15.name:'','#10b981',
      'Top performers at the 15-year mark — patience rewarded.',
      top5byV(15)),
    card('👑','Best 20-Year Return',b20?b20.vs20:'—',b20?b20.name:'','#f59e0b',
      'The best performers over 20 years — full compounding potential of a seed investment.',
      top5byV(20)),
    card('📉','Worst 1-Year',w1?w1.vs1:'—',w1?w1.name:'','#ef4444',
      'The worst performers in year 1. Useful for identifying high short-term risk.',
      top5byV(1,true)),
    card('⚠️','Worst 5-Year',w5?w5.vs5:'—',w5?w5.name:'','#ef4444',
      'The worst performers over 5 years — still below the seed investment value.',
      top5byV(5,true)),
    card('⚠️','Worst 10-Year',w10?w10.vs10:'—',w10?w10.name:'','#ef4444',
      'Lowest 10-year outcomes. Some assets recover long-term even from poor 10-year runs.',
      top5byV(10,true)),
    card('📊','Avg 1-Year Value',avg1?'$'+avg1.toLocaleString():'—','Across all assets in view','var(--primary)',
      'Average of all 1-year values. Top contributors shown.',
      top5byV(1)),
    card('📊','Avg 5-Year Value',avg5?'$'+avg5.toLocaleString():'—','Across all assets in view','var(--primary)',
      'Average value across all assets at the 5-year horizon. Top contributors shown.',
      top5byV(5)),
    card('📊','Avg 10-Year Value',avg10?'$'+avg10.toLocaleString():'—','vs seed invested','var(--primary)',
      'Mean 10-year value across all assets with available data. Top contributors shown.',
      top5byV(10)),
    card('📊','Avg 20-Year Value',avg20?'$'+avg20.toLocaleString():'—','vs seed invested','var(--primary)',
      'Mean 20-year value. Top contributors shown — often skewed by extreme outliers.',
      top5byV(20)),
    card('⚖️','Median 10-Year Value',med10?'$'+med10.toLocaleString():'—','50th percentile return','#10b981',
      'The middle value — half of assets did better, half worse. These assets are closest to the median.',
      (()=>{const sorted=d.filter(r=>r.v10!=null).sort((a,b)=>a.v10-b.v10);const mid=Math.floor(sorted.length/2);const half=Math.floor(TIP_N/2);return sorted.slice(Math.max(0,mid-half),mid+half+1).map(r=>({name:r.name,display:r.vs10||'—',extra:r.gs10||''}));})()),
    card('⚖️','Median 20-Year Value',med20?'$'+med20.toLocaleString():'—','50th percentile return','#10b981',
      'Median 20-year outcome — a more realistic expectation than the average. These assets are nearest the median.',
      (()=>{const sorted=d.filter(r=>r.v20!=null).sort((a,b)=>a.v20-b.v20);const mid=Math.floor(sorted.length/2);const half=Math.floor(TIP_N/2);return sorted.slice(Math.max(0,mid-half),mid+half+1).map(r=>({name:r.name,display:r.vs20||'—',extra:r.gs20||''}));})()),
    card('🔥','10x in 10 Years',p10x10+'%','of assets turned $1K → $10K+','#ef4444',
      'Assets that returned at least 10x in 10 years. Top achievers shown.',
      top5thresh(10,10)),
    card('🔥','10x in 20 Years',p10x20+'%','of assets turned $1K → $10K+','#ef4444',
      'Assets achieving 10x or more over 20 years. Top achievers shown.',
      top5thresh(20,10)),
    card('💥','25x Club (10Y)',over100x+' assets','turned $1,000 into $25,000+','#f59e0b',
      'Assets that returned 25x or more in 10 years — strong long-term compounders.',
      top5thresh(10,25)),
    card('🌕','50x Club (20Y)',over1000x+' assets','turned $1,000 into $50,000+','#f59e0b',
      'Assets that returned 50x or more over 20 years — elite generational compounders.',
      top5thresh(20,50)),
    card('📅','Winners vs Losers (1Y)',gainers1+' / '+losers1,gainers1+' up · '+losers1+' down','var(--primary)',
      'Top gainers (left) and biggest losers (right) over 1 year.',
      [...top5gainers().slice(0,3),...top5losers().slice(0,2)]),
    card('🏆','Top Multiplier (20Y)',topMult?topMult.gs20:'—',topMult?topMult.name:'','#f59e0b',
      'The highest growth multiples over 20 years — peak long-term compounders.',
      top5byG(20)),
    card('📈','Best 10Y Multiplier',b10?b10.gs10:'—',b10?b10.name:'','#2563eb',
      'The largest 10-year growth multiples in this view.',
      top5byG(10)),
    card('🌍','Largest Section',topSec?topSec[0]+' ('+topSec[1]+')':'—','Most assets in class','var(--primary)',
      'Asset sections ranked by count in this view.',
      Object.entries(secCounts).sort((a,b)=>b[1]-a[1]).slice(0,TIP_N).map(([s,n])=>({name:s,display:n+' assets',extra:''}))),
    card('📊','Avg 1-Year Growth',d.filter(r=>r.g1!=null).length?((d.filter(r=>r.g1!=null).reduce((a,r)=>a+r.g1,0)/d.filter(r=>r.g1!=null).length).toFixed(2)+'x'):'—','Mean multiplier across all assets','var(--primary)',
      'Top growth multiples at 1 year.',
      top5byG(1)),
    card('📊','Avg 5-Year Growth',d.filter(r=>r.g5!=null).length?((d.filter(r=>r.g5!=null).reduce((a,r)=>a+r.g5,0)/d.filter(r=>r.g5!=null).length).toFixed(1)+'x'):'—','Mean multiplier across all assets','var(--primary)',
      'Top growth multiples at 5 years.',
      top5byG(5)),
    card('📊','Avg 20-Year Growth',d.filter(r=>r.g20!=null).length?((d.filter(r=>r.g20!=null).reduce((a,r)=>a+r.g20,0)/d.filter(r=>r.g20!=null).length).toFixed(0)+'x'):'—','Mean multiplier across all assets','#10b981',
      'Top growth multiples at 20 years — extreme outliers dominate this average.',
      top5byG(20)),
    card('⬆️','Top 10 Avg (10Y)',d.filter(r=>r.v10).sort((a,b)=>b.v10-a.v10).slice(0,10).length?'$'+Math.round(d.filter(r=>r.v10).sort((a,b)=>b.v10-a.v10).slice(0,10).reduce((a,r)=>a+r.v10*seedMultiplier,0)/10).toLocaleString():'—','Average of top 10 performers','#2563eb',
      'The top 10 assets at 10 years — the best-case diversified picks.',
      d.filter(r=>r.v10).sort((a,b)=>b.v10-a.v10).slice(0,TIP_N).map(r=>({name:r.name,display:r.vs10||'—',extra:r.gs10||''}))),
    card('⬆️','Top 10 Avg (20Y)',d.filter(r=>r.v20).sort((a,b)=>b.v20-a.v20).slice(0,10).length?'$'+Math.round(d.filter(r=>r.v20).sort((a,b)=>b.v20-a.v20).slice(0,10).reduce((a,r)=>a+r.v20*seedMultiplier,0)/10).toLocaleString():'—','Average of top 10 performers','#10b981',
      'The top 10 assets at 20 years — best-case long-term portfolio.',
      d.filter(r=>r.v20).sort((a,b)=>b.v20-a.v20).slice(0,TIP_N).map(r=>({name:r.name,display:r.vs20||'—',extra:r.gs20||''}))),
    card('🎯','Beat 2x in 1 Year',d.filter(r=>r.g1!=null&&r.g1>=2).length+' assets','returned 2x or more in 12 months','#ef4444',
      'Assets that doubled or more in a single year — extremely rare and often volatile.',
      top5thresh(1,2)),
    card('💼','Beat 5x in 5 Years',d.filter(r=>r.g5!=null&&r.g5>=5).length+' assets','5x or more in 5 years','#f59e0b',
      'Assets achieving 5x in 5 years — equivalent to ~38% CAGR.',
      top5thresh(5,5)),
    card('🏅','Beat 20x in 10 Years',d.filter(r=>r.g10!=null&&r.g10>=20).length+' assets','20x+ return in 10 years','#10b981',
      'Assets achieving 20x in 10 years — equivalent to ~35% CAGR annually.',
      top5thresh(10,20)),
    card('📉','Negative at 5Y',d.filter(r=>r.v5!=null&&r.v5<1000*seedMultiplier).length+' assets','lost value over 5 years','#ef4444',
      'Assets still below the original seed value at 5 years — the biggest losers shown.',
      top5neg(5)),
    card('📉','Negative at 10Y',d.filter(r=>r.v10!=null&&r.v10<1000).length+' assets','still below seed at 10 years','#ef4444',
      'Assets worth less than the original investment even after 10 years.',
      top5neg(10)),
    card('🌐','Data Coverage (20Y)',(d.filter(r=>r.v20!=null).length)+' / '+d.length,'assets with 20Y data','var(--primary)',
      'Assets with the most complete long-term data available.',
      d.filter(r=>r.v20!=null).sort((a,b)=>b.v20-a.v20).slice(0,TIP_N).map(r=>({name:r.name,display:r.vs20||'—',extra:r.gs20||''}))),
    card('⚡','Highest 1Y Volatility',b1&&w1?'$'+(b1.v1-w1.v1).toLocaleString():'—','Spread: best vs worst 1Y','var(--primary)',
      'The extremes of 1-year performance — top gainers vs bottom losers.',
      [...top5byV(1).slice(0,3),...top5byV(1,true).slice(0,2)]),
    card('🔑','Seed Investment','$'+(1000*seedMultiplier).toLocaleString(),'Current multiplier: '+seedMultiplier.toFixed(2)+'x','#2563eb',
      'The hypothetical starting investment amount. All values scale proportionally.',
      top5byV(10)),
    card('🚨','Upside Outliers (10Y)',upsideOutliers.length+' assets','2+ std deviations above average','#f59e0b',
      'Assets whose 10-year return sits more than 2 standard deviations above the mean — statistically exceptional performers that skew the overall average.',
      upsideOutliers.slice(0,TIP_N).map(r=>({name:r.name,display:r.vs10||'—',extra:r.gs10||''}))),
    card('🔻','Downside Outliers (10Y)',downsideOutliers.length+' assets','significantly below average at 10Y','#ef4444',
      'Assets sitting well below the mean at 10 years — persistent underperformers or high-risk positions that failed to recover over a decade.',
      downsideOutliers.slice(0,TIP_N).map(r=>({name:r.name,display:r.vs10||'—',extra:r.gs10||''}))),
  ].filter(Boolean);
}

function updateKPIs(){
  const d=secData(activeSection);
  kpiCards=buildKPICards(d);
  kpiIndex=0;
  renderKPICarousel();
  startKPITimer();
}

function renderKPICarousel(){
  const track=document.getElementById('kpiTrack');
  const dots=document.getElementById('kpiDots');
  if(!track)return;
  track.innerHTML=kpiCards.join('');
  const wrap=track.parentElement;
  const cardW=212;
  const visible=Math.floor((wrap.offsetWidth||900)/cardW);
  const pages=Math.max(1,kpiCards.length-visible+1);
  if(kpiIndex>=pages)kpiIndex=pages-1;
  if(kpiIndex<0)kpiIndex=0;
  const offset=kpiIndex*cardW;
  track.style.transform=`translateX(-${offset}px)`;
  const dotCount=Math.min(pages,8);
  dots.innerHTML=Array.from({length:dotCount},(_,i)=>`<div class="kpi-dot${i===Math.floor(kpiIndex/(pages/dotCount))?' on':''}" onclick="kpiGoTo(Math.round(${i}*${pages/dotCount}))"></div>`).join('');
}

function kpiNext(){kpiIndex++;renderKPICarousel();}
function kpiPrev(){if(kpiIndex>0)kpiIndex--;renderKPICarousel();}
function kpiGoTo(i){kpiIndex=i;renderKPICarousel();}

let kpiPaused = false;

// Touch swipe support for KPI carousel
(function initKPITouch(){
  let touchStartX=0, touchStartY=0, isDragging=false;
  function getWrap(){ return document.getElementById('kpiTrack')?.parentElement; }
  document.addEventListener('touchstart',e=>{
    const wrap=getWrap(); if(!wrap||!wrap.contains(e.target))return;
    touchStartX=e.touches[0].clientX;
    touchStartY=e.touches[0].clientY;
    isDragging=true;
    kpiPause();
  },{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!isDragging)return;
    const wrap=getWrap(); if(!wrap)return;
    const dx=e.touches[0].clientX-touchStartX;
    const dy=e.touches[0].clientY-touchStartY;
    if(Math.abs(dx)>Math.abs(dy)) e.preventDefault();
  },{passive:false});
  document.addEventListener('touchend',e=>{
    if(!isDragging)return;
    isDragging=false;
    const dx=e.changedTouches[0].clientX-touchStartX;
    if(Math.abs(dx)>40){
      if(dx<0) kpiNext(); else kpiPrev();
    }
    setTimeout(kpiResume,2000);
  },{passive:true});
})();

function startKPITimer(){
  if(kpiTimer)clearInterval(kpiTimer);
  kpiTimer=setInterval(()=>{
    if(kpiPaused) return;
    const track=document.getElementById('kpiTrack');
    if(!track)return;
    const wrap=track.parentElement;
    const cardW=212;
    const visible=Math.floor((wrap.offsetWidth||900)/cardW);
    const pages=Math.max(1,kpiCards.length-visible+1);
    kpiIndex=(kpiIndex+1)%pages;
    renderKPICarousel();
  },7500);
}

function kpiPause(){ kpiPaused=true; }
function kpiResume(){ kpiPaused=false; }

// ===== AUTO-SELECT DEFAULT =====
function autoSelectDefault(){
  const d=filteredData.length>0?filteredData:secData(activeSection);
  if(d.length===0) return;
  const shuffled=[...d].sort(()=>Math.random()-0.5);
  selectedNames=shuffled.slice(0,Math.min(10,shuffled.length)).map(r=>r.name);
  updateSelCount();
}

// ===== FILTERS =====
function getAvailableSecs(d){
  return [...new Set(d.map(r=>r.section).filter(Boolean))].sort();
}

function populateSecFilter(){
  const d=secData(activeSection);
  const secs=getAvailableSecs(d);
  for(const s of [...selectedSecs]) if(!secs.includes(s)) selectedSecs.delete(s);
  const list=document.getElementById('secOptionsList');
  if(!list) return;
  list.innerHTML=secs.map(s=>{
    const esc=s.replace(/'/g,"\\'");
    const icon=SEC_ICONS[s]||'';
    return `<div class="cat-option" onclick="toggleSec(event,'${esc}')"><input type="checkbox" ${selectedSecs.has(s)?'checked':''} onclick="toggleSec(event,'${esc}')"> ${icon} ${s}</div>`;
  }).join('');
  updateSecBtn();
}

function updateSecBtn(){
  const label=document.getElementById('secMultiLabel');
  const allChk=document.getElementById('secAllChk');
  if(selectedSecs.size===0){
    if(label) label.textContent='All classes';
    if(allChk) allChk.checked=true;
  } else {
    if(label) label.innerHTML=selectedSecs.size+' class'+(selectedSecs.size>1?'es':'')+' selected<span class="cat-badge">'+selectedSecs.size+'</span>';
    if(allChk) allChk.checked=false;
  }
}

function toggleSecDropdown(e){
  e.stopPropagation();
  const dd=document.getElementById('secDropdown');
  const btn=document.getElementById('secMultiBtn');
  dd.classList.toggle('open');
  btn.classList.toggle('open',dd.classList.contains('open'));
}

function toggleSec(e,sec){
  e.stopPropagation();
  if(selectedSecs.has(sec)) selectedSecs.delete(sec); else selectedSecs.add(sec);
  populateSecFilter();
  currentPage=1; applyFilters();
}

function clearSecFilter(e){
  e.stopPropagation();
  selectedSecs.clear();
  populateSecFilter();
  currentPage=1; applyFilters();
}

function getCatTags(d){
  const tagSet=new Set();
  d.forEach(r=>{
    if(!r.category) return;
    r.category.split(',').forEach(t=>{const tag=t.trim(); if(tag) tagSet.add(tag);});
  });
  return [...tagSet].sort();
}

function populateCatFilter(){
  const d=secData(activeSection);
  const tags=getCatTags(d);
  for(const t of [...selectedCats]) if(!tags.includes(t)) selectedCats.delete(t);
  const list=document.getElementById('catOptionsList');
  if(!list) return;
  list.innerHTML=tags.map(t=>{
    const esc=t.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/&/g,'&amp;');
    return `<div class="cat-option" onclick="toggleCat(event,'${esc}')"><input type="checkbox" ${selectedCats.has(t)?'checked':''} onclick="toggleCat(event,'${esc}')"> ${t}</div>`;
  }).join('');
  updateCatBtn(tags.length);
}

function updateCatBtn(total){
  const label=document.getElementById('catMultiLabel');
  const allChk=document.getElementById('catAllChk');
  if(selectedCats.size===0){
    if(label) label.textContent='All categories';
    if(allChk) allChk.checked=true;
  } else {
    if(label) label.innerHTML=selectedCats.size+' tag'+(selectedCats.size>1?'s':'')+' selected<span class="cat-badge">'+selectedCats.size+'</span>';
    if(allChk) allChk.checked=false;
  }
}

function toggleCatDropdown(e){
  e.stopPropagation();
  const dd=document.getElementById('catDropdown');
  const btn=document.getElementById('catMultiBtn');
  dd.classList.toggle('open');
  btn.classList.toggle('open',dd.classList.contains('open'));
  if(dd.classList.contains('open')){
    const si=document.getElementById('catSearchInput');
    if(si){ si.value=''; filterCatDropdown(); si.focus(); }
  }
}

function filterCatDropdown(){
  const q=(document.getElementById('catSearchInput')?.value||'').toLowerCase().trim();
  const list=document.getElementById('catOptionsList');
  const allOpt=document.getElementById('catAllOpt');
  if(!list) return;
  // Show/hide "All categories" row based on query
  if(allOpt) allOpt.style.display=q?'none':'';
  // Filter individual options
  list.querySelectorAll('.cat-option').forEach(el=>{
    const text=(el.textContent||'').toLowerCase();
    el.style.display=(!q||text.includes(q))?'':'none';
  });
}

function toggleCat(e,cat){
  e.stopPropagation();
  if(selectedCats.has(cat)) selectedCats.delete(cat); else selectedCats.add(cat);
  populateCatFilter();
  currentPage=1; applyFilters();
}

function clearCatFilter(e){
  e.stopPropagation();
  selectedCats.clear();
  populateCatFilter();
  currentPage=1; applyFilters();
}

document.addEventListener('click',function(e){
  const secWrap=document.getElementById('secMultiWrap');
  if(secWrap&&!secWrap.contains(e.target)){
    document.getElementById('secDropdown')?.classList.remove('open');
    document.getElementById('secMultiBtn')?.classList.remove('open');
  }
  const catWrap=document.getElementById('catMultiWrap');
  if(catWrap&&!catWrap.contains(e.target)){
    document.getElementById('catDropdown')?.classList.remove('open');
    document.getElementById('catMultiBtn')?.classList.remove('open');
  }
});

function onSearch(){ currentPage=1; applyFilters(); }
function onFilter(){ currentPage=1; applyFilters(); }

function applyFilters(){
  const q=document.getElementById('searchInput').value.toLowerCase().trim();
  // tableData includes excluded rows (for display), filteredData excludes them (for charts/KPIs)
  const section=activeSection==='All'?allData:allData.filter(r=>r.section===activeSection);
  let d=section;
  if(selectedSecs.size>0) d=d.filter(r=>selectedSecs.has(r.section));
  if(q) d=d.filter(r=>r.name.toLowerCase().includes(q)||r.category.toLowerCase().includes(q));
  if(selectedCats.size>0) d=d.filter(r=>{
    if(!r.category) return false;
    const tags=r.category.split(',').map(t=>t.trim());
    return [...selectedCats].some(sel=>tags.includes(sel));
  });
  // tableData = all matching (including excluded, so user can un-exclude)
  const tableData=sortArr(d);
  // filteredData = active data for charts (excludes excluded names)
  filteredData=tableData.filter(r=>!excludedNames.has(r.name));
  // Store tableData for rendering
  allTableData=tableData;
  renderTable();
  renderMiniCharts();
}

function setSort(k){
  if(sortKey===k) sortDir*=-1; else{sortKey=k;sortDir=-1;}
  filteredData=sortArr(filteredData);
  allTableData=sortArr(allTableData);
  currentPage=1; renderTable();
}

function sortArr(d){
  return [...d].sort((a,b)=>{
    const av=a[sortKey],bv=b[sortKey];
    if(av==null&&bv==null)return 0;
    if(av==null)return 1; if(bv==null)return -1;
    if(typeof av==='string')return sortDir*av.localeCompare(bv);
    return sortDir*(av-bv);
  });
}

// ===== TABLE =====
function renderTable(){
  const showSection = activeSection==='All';
  const displayData = allTableData.length>0 ? allTableData : filteredData;
  const _page=displayData.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const _allPageSel=_page.filter(r=>!excludedNames.has(r.name)).length>0&&_page.filter(r=>!excludedNames.has(r.name)).every(r=>selectedNames.includes(r.name));
  document.getElementById('tableHead').innerHTML=`
    <th style="width:32px;min-width:32px"><input type="checkbox" ${_allPageSel?'checked':''} onclick="selAll(this)" title="Select/deselect page"></th>
    <th style="width:260px;min-width:180px" class="${sortKey==='name'?'sorted':''}" onclick="setSort('name')">Asset <span class="arr">${sortKey==='name'?(sortDir===-1?'▼':'▲'):'▼'}</span></th>
    ${showSection?'<th style="width:90px;min-width:70px">Asset Class</th>':''}
    ${YEARS.map(y=>`<th style="width:90px;min-width:76px" class="${sortKey==='v'+y?'sorted':''}" onclick="setSort('v${y}')">${y==='1'?'1 Yr':y+' Yrs'} <span class="arr">${sortKey==='v'+y?(sortDir===-1?'▼':'▲'):'▼'}</span></th>`).join('')}
  `;
  const start=(currentPage-1)*PAGE_SIZE;
  const page=displayData.slice(start,start+PAGE_SIZE);
  const body=document.getElementById('tableBody');
  if(!page.length){
    body.innerHTML=`<tr><td colspan="${6+(showSection?1:0)}" style="text-align:center;padding:40px 20px;color:var(--faint)">No matching assets found</td></tr>`;
    document.getElementById('paginationBar').innerHTML='';
    return;
  }
  const excludeIcon=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/></svg>`;
  const includeIcon=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  body.innerHTML=page.map(r=>{
    const sel=selectedNames.includes(r.name);
    const excl=excludedNames.has(r.name);
    const nameEsc=r.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const aiKey=_storePrompt(buildAssetRowAiPrompt(r));
    return `<tr class="${sel&&!excl?'row-selected':''} ${excl?'row-excluded':''}" onclick="rowClick(event,'${nameEsc}')">
      <td><input type="checkbox" ${sel&&!excl?'checked':''} ${excl?'disabled':''} onclick="toggleSel(event,'${nameEsc}')"></td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;min-width:0"><div class="asset-name">${r.name}</div><div class="cat-tag">${r.category}</div></div>
          <button class="row-ai-btn" onclick="tableRowAiClick(event,${aiKey})" title="Analyse with AI"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>AI</button>
          <button class="exclude-btn ${excl?'excluded':''}" onclick="toggleExclude(event,'${nameEsc}')" title="${excl?'Re-include this asset':'Exclude from calculations'}">${excl?includeIcon:excludeIcon}</button>
        </div>
      </td>
      ${showSection?`<td><span class="section-badge">${SEC_ICONS[r.section]} ${r.section}</span></td>`:''}
      ${YEARS.map(y=>{
        const vs=r['vs'+y],v=r['v'+y],gs=r['gs'+y];
        let cls='val-na';
        if(v!=null){if(v>=10000)cls='val-mega';else if(v>1000)cls='val-pos';else cls='val-neg';}
        return `<td class="val ${cls}">${vs!=='—'?vs+'<span class="mult-tag">'+gs+'</span>':'<span class="val-na">—</span>'}</td>`;
      }).join('')}
    </tr>`;
  }).join('');
  renderPagination();
}

function renderPagination(){
  const displayData=allTableData.length>0?allTableData:filteredData;
  const total=displayData.length, pages=Math.ceil(total/PAGE_SIZE);
  const bar=document.getElementById('paginationBar');
  const start=(currentPage-1)*PAGE_SIZE+1, end=Math.min(currentPage*PAGE_SIZE,total);
  if(pages<=1){bar.innerHTML=`<span class="pg-info">Showing all ${total} assets</span>`;return;}
  let h=`<span class="pg-info">Showing ${start}–${end} of ${total}</span>`;
  h+=`<button class="pg-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;
  const range=[];
  for(let i=1;i<=pages;i++){if(i===1||i===pages||Math.abs(i-currentPage)<=1)range.push(i);else if(range[range.length-1]!=='…')range.push('…');}
  for(const p of range){
    if(p==='…')h+=`<span style="color:var(--faint);padding:0 2px">…</span>`;
    else h+=`<button class="pg-btn${p===currentPage?' on':''}" onclick="goPage(${p})">${p}</button>`;
  }
  h+=`<button class="pg-btn" onclick="goPage(${currentPage+1})" ${currentPage===pages?'disabled':''}>›</button>`;
  bar.innerHTML=h;
}

function goPage(p){
  const pages=Math.ceil(filteredData.length/PAGE_SIZE);
  if(p<1||p>pages)return;
  currentPage=p; renderTable();
  document.querySelector('.main').scrollTop=0;
}

// ===== SELECT =====
function selAll(cb){
  const displayData=allTableData.length>0?allTableData:filteredData;
  const page=displayData.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE).filter(r=>!excludedNames.has(r.name));
  const pageNames=page.map(r=>r.name);
  const allPageSel=pageNames.length>0&&pageNames.every(n=>selectedNames.includes(n));
  if(!allPageSel){
    for(const r of page){
      if(!selectedNames.includes(r.name)) selectedNames.push(r.name);
    }
  } else {
    const namesSet=new Set(pageNames);
    selectedNames=selectedNames.filter(n=>!namesSet.has(n));
  }
  updateSelCount(); renderTable(); renderChartArea();
}

function toggleSel(e,name){
  e.stopPropagation();
  const i=selectedNames.indexOf(name);
  if(i>-1)selectedNames.splice(i,1);
  else selectedNames.push(name);
  updateSelCount(); renderTable(); renderChartArea();
}

function rowClick(e,name){
  if(e.target.type==='checkbox')return;
  const i=selectedNames.indexOf(name);
  if(i>-1)selectedNames.splice(i,1);
  else selectedNames.push(name);
  updateSelCount(); renderTable(); renderChartArea();
}

function updateSelCount(){
  document.getElementById('compareCount').textContent=selectedNames.length;
}

function clearSel(){
  selectedNames=[]; updateSelCount(); renderTable(); renderChartArea(); toggleRoiPanel();
}

function toggleExclude(e,name){
  e.stopPropagation();
  if(excludedNames.has(name)){
    excludedNames.delete(name);
  } else {
    excludedNames.add(name);
    // Also remove from selection if excluded
    const i=selectedNames.indexOf(name);
    if(i>-1) selectedNames.splice(i,1);
  }
  updateSelCount();
  applyFilters();
  updateKPIs();
  renderChartArea();
}

// ===== ROI PANEL TOGGLE =====
function toggleRoiPanel(){
  const wrap  = document.getElementById('tableRoiWrap');
  const slot  = document.getElementById('roiFsSlot');
  const panel = document.getElementById('roiPanel');
  if(!wrap || !panel) return;

  const hasSelection = selectedNames.length > 0;

  if(roiFullscreen){
    if(hasSelection){
      // Ensure panel is in the slot
      if(panel.parentElement !== slot) slot.appendChild(panel);
      panel.style.cssText='flex:none;max-width:100%;opacity:1;width:100%';
      slot.style.display = 'block';
    } else {
      // No selection: collapse fullscreen, reset state
      roiFullscreen = false;
      wrap.appendChild(panel);
      panel.style.cssText = '';
      slot.style.display = 'none';
      const btn = document.getElementById('roiFullscreenBtn');
      if(btn){
        btn.classList.remove('expanded');
        btn.innerHTML=`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
        btn.title='Expand to full width';
      }
      wrap.classList.remove('panel-open');
    }
  } else {
    // Normal mode: slide panel in/out on the right
    if(panel.parentElement !== wrap) wrap.appendChild(panel);
    panel.style.cssText = '';
    if(hasSelection){
      wrap.classList.add('panel-open');
    } else {
      wrap.classList.remove('panel-open');
    }
  }
}

// ===== CHART + STATS =====
function renderChartArea(){
  const selected=allData.filter(r=>selectedNames.includes(r.name));
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';

  toggleRoiPanel();

  // Show/hide fullscreen button
  const fsBtn=document.getElementById('roiFullscreenBtn');
  if(fsBtn) fsBtn.style.display=selected.length>0?'flex':'none';

  const actionsEl=document.getElementById('chartActions');
  // Keep fullscreen btn (first child) and rebuild clear button
  const clearHtml=selected.length>0?`<button class="btn btn-danger btn-sm" onclick="clearSel()">✕ Clear</button>`:'';
  // Find or just set inner — fsBtn is separate child so we only update other children
  if(actionsEl){
    let clearBtn=actionsEl.querySelector('.btn-danger');
    if(selected.length>0){
      if(!clearBtn){clearBtn=document.createElement('button');clearBtn.className='btn btn-danger btn-sm';clearBtn.onclick=clearSel;actionsEl.insertBefore(clearBtn,fsBtn);}
      clearBtn.textContent='✕ Clear';
    } else {
      if(clearBtn) clearBtn.remove();
    }
  }

  const titleEl=document.getElementById('chartTitle');
  const subEl=document.getElementById('chartSub');
  if(selected.length===0){
    titleEl.textContent='ROI Growth';
    subEl.textContent='Click any row to chart · Select multiple to compare';
  } else if(selected.length===1){
    titleEl.textContent=selected[0].name;
    const seedDisplay='$'+(1000*seedMultiplier).toLocaleString();
    subEl.textContent=`${seedDisplay} initial investment growth over time`;
  } else {
    const seedDisplay='$'+(1000*seedMultiplier).toLocaleString();
    titleEl.textContent=`Comparing ${selected.length} Assets`;
    subEl.textContent=`${seedDisplay} initial investment · All time horizons`;
  }

  const allLabels=['Start','1Y','5Y','10Y','15Y','20Y'];
  const allYears=[0,1,5,10,15,20];
  const labelFilter=allYears.map((y,i)=>({label:allLabels[i],yr:y})).filter(x=>x.yr<=chartTimelineYears);
  const labels=labelFilter.map(x=>x.label);
  const filteredYears=labelFilter.map(x=>x.yr);

  if(chart){chart.destroy();chart=null;}
  const canvas=document.getElementById('roiChart');

  toggleRoiPanel();

  if(selected.length===0){
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    document.getElementById('chartLegend').innerHTML='';
    document.getElementById('compareStatsWrap').innerHTML='';
    return;
  }

  const gridColor=isDark?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)';
  const tickColor=isDark?'#8892a4':'#5a6680';

  const datasets=selected.map((r,i)=>({
    label:r.name,
    data:filteredYears.map(y=>y===0?1000*seedMultiplier:(r['v'+y]!=null?r['v'+y]*seedMultiplier:null)),
    borderColor:COLORS[i%COLORS.length],
    backgroundColor:COLORS[i%COLORS.length]+'22',
    borderWidth:2.5,
    pointRadius:5,
    pointHoverRadius:7,
    tension:.35,
    spanGaps:true,
    fill:false,
  }));

  const _tooltipShadow={
    id:'tooltipShadow',
    beforeDraw(chartInst){
      const {ctx}=chartInst;
      const tooltip=chartInst.tooltip;
      if(!tooltip||tooltip.opacity===0) return;
      const{x,y,width,height}=tooltip;
      ctx.save();
      ctx.shadowColor=isDark?'rgba(0,0,0,0.55)':'rgba(15,21,35,0.18)';
      ctx.shadowBlur=24;ctx.shadowOffsetY=8;
      ctx.fillStyle=isDark?'#1c2333':'#ffffff';
      const r=10;
      ctx.beginPath();
      ctx.moveTo(x+r,y);ctx.lineTo(x+width-r,y);ctx.quadraticCurveTo(x+width,y,x+width,y+r);
      ctx.lineTo(x+width,y+height-r);ctx.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
      ctx.lineTo(x+r,y+height);ctx.quadraticCurveTo(x,y+height,x,y+height-r);
      ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();ctx.fill();
      ctx.restore();
    }
  };
  chart=new Chart(canvas,{
    type:'line',
    plugins:[_tooltipShadow],
    data:{labels,datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:isDark?'#1c2333':'#ffffff',
          borderColor:isDark?'#2a3147':'#dde2ec',
          borderWidth:1,
          titleColor:isDark?'#e8eaf0':'#1a2035',
          bodyColor:isDark?'#8892a4':'#5a6680',
          padding:{top:12,right:14,bottom:12,left:14},
          boxPadding:5,
          cornerRadius:10,
          titleFont:{size:12,weight:'700',family:"'Inter',system-ui,sans-serif"},
          bodyFont:{size:11,family:"'Inter',system-ui,sans-serif"},
          titleSpacing:4,
          bodySpacing:3,
          titleMarginBottom:8,
          multiKeyBackground:'transparent',
          callbacks:{
            label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y!=null?'$'+ctx.parsed.y.toLocaleString():'N/A'}`
          }
        }
      },
      scales:{
        x:{grid:{color:gridColor},ticks:{color:tickColor}},
        y:{
          grid:{color:gridColor},
          ticks:{color:tickColor,callback:v=>v>=1000?'$'+(v>=1000000?(v/1000000).toFixed(1)+'M':(v/1000).toFixed(0)+'K'):'$'+v}
        }
      }
    }
  });

  document.getElementById('chartLegend').innerHTML=
    '<div class="chart-legend">'+
    selected.map((r,i)=>
      `<div class="legend-chip"><div class="legend-dot" style="background:${COLORS[i%COLORS.length]}"></div>${r.name}</div>`
    ).join('')+
    '</div>';

  renderCompareStats(selected);
}

function renderCompareStats(selected){
  const wrap=document.getElementById('compareStatsWrap');
  if(selected.length===0){wrap.innerHTML='';return;}

  function cagr(start,end,years){ return end!=null&&start>0?((Math.pow(end/start,1/years)-1)*100).toFixed(1):null; }
  function fv(v){ if(v==null)return '—'; const s=v*seedMultiplier; return s>=1000000?'$'+(s/1000000).toFixed(2)+'M':s>=1000?'$'+(s/1000).toFixed(1)+'K':'$'+Math.round(s); }
  function cagrBadge(pct){
    if(pct==null) return `<span class="na-val">—</span>`;
    const n=parseFloat(pct);
    const cls=n>=50?'badge-gold':n>=10?'badge-green':n>=0?'badge-green':'badge-red';
    return `<span class="growth-badge ${cls}">${n.toFixed(1)}%</span>`;
  }

  // Single asset: detailed breakdown
  if(selected.length===1){
    const r=selected[0];
    const insights=[];
    if(r.v1!=null){insights.push(r.v1>1000?`Positive 1-year return of ${r.gs1}`:`Lost value in year 1 (${r.vs1})`);}
    const c10=cagr(1000,r.v10,10);
    if(c10!=null) insights.push(`10-year CAGR: ${c10}%`);
    if(r.v20!=null&&r.v10!=null){insights.push(r.v20>r.v10?`Accelerated in years 10–20 (${r.vs10} → ${r.vs20})`:`Growth slowed in years 10–20 (${r.vs10} → ${r.vs20})`);}
    if(r.g20!=null){insights.push(r.g20>=100?`Elite: ${r.g20}x over 20 years — ${r.vs20}`:r.g20>=10?`Strong: ${r.g20}x over 20 years`:`Modest 20Y return of ${r.g20}x`);}

    let html=`<div class="compare-stats">
      <div class="cs-header"><span class="cs-title">Performance Breakdown</span><span class="cs-sub">${r.section} · ${r.category}</span></div>
      <div class="cs-metric-row">
        ${YEARS.map(y=>{
          const v=r['v'+y]; const c=cagr(1000,v,y);
          const cls=v==null?'cs-metric-na':v>1000?'cs-metric-pos':v<1000?'cs-metric-neg':'cs-metric-flat';
          return `<div class="cs-metric ${cls}">
            <div class="cs-metric-period">${y===1?'1 Year':y+' Years'}</div>
            <div class="cs-metric-val">${fv(v)}</div>
            <div class="cs-metric-mult">${r['gs'+y]||'—'}</div>
            <div class="cs-metric-cagr">${c!=null?c+'% CAGR':'—'}</div>
          </div>`;
        }).join('')}
      </div>
      ${insights.length?`<div class="cs-insights">${insights.map(s=>`<div class="cs-insight-item">${s}</div>`).join('')}</div>`:''}
    </div>`;
    wrap.innerHTML=html;
    return;
  }

  // Multiple assets: compact summary cards with a group stats bar
  const YEARS_=YEARS;
  const best={},worst={};
  for(const y of YEARS_){
    const vals=selected.map(r=>r['v'+y]).filter(v=>v!=null);
    best[y]=vals.length?Math.max(...vals):null;
    worst[y]=vals.length?Math.min(...vals):null;
  }

  // Compute overall score (avg percentile rank across all periods)
  function overallScore(r){
    let score=0,n=0;
    for(const y of YEARS_){
      const vals=selected.map(x=>x['v'+y]).filter(v=>v!=null).sort((a,b)=>b-a);
      const v=r['v'+y]; if(v==null) continue;
      const pos=vals.indexOf(v); score+=(pos===-1?vals.length:pos)/Math.max(1,vals.length-1); n++;
    }
    return n>0?1-(score/n):null; // 1 = best, 0 = worst
  }

  const ranked=[...selected].map(r=>({r,score:overallScore(r)})).sort((a,b)=>(b.score??-1)-(a.score??-1));

  // Group summary stats
  const groupStats=YEARS_.map(y=>{
    const vals=selected.map(r=>r['v'+y]).filter(v=>v!=null);
    const sorted=[...vals].sort((a,b)=>a-b);
    const med=sorted.length?sorted[Math.floor(sorted.length/2)]:null;
    const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
    return {y,med,avg,count:vals.length};
  });

  let html=`<div class="compare-stats">
    <div class="cs-ai-prompt">
      <div class="cs-ai-prompt-text">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>Want AI to analyse these ${selected.length} assets against each other?</span>
      </div>
      <button class="cs-ai-prompt-btn" onclick="triggerCompareAI()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Yes, analyse
      </button>
    </div>

    <div class="cs-header" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <span class="cs-title">Group Summary</span>
      <span class="cs-sub">${selected.length} assets selected</span>
    </div>

    <div class="cs-group-stats">
      ${groupStats.map(g=>`
        <div class="cs-group-stat">
          <div class="cs-group-period">${g.y===1?'1Y':g.y+'Y'}</div>
          <div class="cs-group-avg" title="Average">${fv(g.avg)}</div>
          <div class="cs-group-label">avg</div>
          <div class="cs-group-med" title="Median">${fv(g.med)}</div>
          <div class="cs-group-label">median</div>
        </div>`).join('')}
    </div>

    <div class="cs-header" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <span class="cs-title">Asset Scorecards</span>
      <span class="cs-sub">Ranked by overall performance</span>
    </div>
    <div class="cs-cards">`;

  ranked.forEach(({r,score},i)=>{
    const color=COLORS[selected.indexOf(r)%COLORS.length];
    const medal=i===0?'#f59e0b':i===1?'#94a3b8':i===2?'#b45309':null;
    const c10=cagr(1000,r.v10,10);
    const c20=cagr(1000,r.v20,20);
    const scorePct=score!=null?Math.round(score*100):null;
    const scoreCls=scorePct>=70?'badge-gold':scorePct>=40?'badge-green':'badge-red';
    const bestY=YEARS_.reduce((b,y)=>r['v'+y]!=null&&(b==null||r['v'+y]>r['v'+b])?y:b,null);

    const rankLabel=i===0?'top-ranked':i===1?'2nd':i===2?'3rd':`ranked #${i+1}`;
    const scLines=[];
    scLines.push(`Here is the scorecard data for **${r.name}** (${r.category} · ${r.section}), ${rankLabel} in this comparison:\n`);
    if(r.v10!=null) scLines.push(`• 10-Year Return: ${fv(r.v10)}  (${r.gs10||'—'})`);
    if(r.v20!=null) scLines.push(`• 20-Year Return: ${fv(r.v20)}  (${r.gs20||'—'})`);
    if(c10!=null)   scLines.push(`• 10Y CAGR: ${c10}%`);
    if(c20!=null)   scLines.push(`• 20Y CAGR: ${c20}%`);
    if(bestY)       scLines.push(`• Peak Period: ${bestY} years`);
    if(scorePct!=null) scLines.push(`• Score vs peers in this comparison: ${scorePct}%`);
    scLines.push(`\nDoes this ranking make sense? Walk me through what's behind this asset's performance, its risk profile, and whether it's genuinely worth holding over the long term.`);
    const scKey=_storePrompt({display: _pickTemplate(_scorecardDisplayTemplates, r), prompt:scLines.join('\n')});

    html+=`<div class="cs-card">
      <div class="cs-card-head">
        <div class="cs-card-dot" style="background:${color}"></div>
        <div class="cs-card-name" title="${r.name}">${r.name}</div>
        ${medal?`<div class="cs-card-medal" style="color:${medal}">#${i+1}</div>`:
          `<span class="growth-badge ${scoreCls}" style="font-size:10px">#${i+1}</span>`}
      </div>
      <div class="cs-card-row">
        <span class="cs-card-label">10Y</span>
        <span class="cs-card-val ${r.v10!=null&&r.v10===best[10]?'cs-best':r.v10!=null&&r.v10===worst[10]?'cs-worst':''}">${fv(r.v10)}</span>
        <span class="cs-card-mult">${r.gs10||'—'}</span>
      </div>
      <div class="cs-card-row">
        <span class="cs-card-label">20Y</span>
        <span class="cs-card-val ${r.v20!=null&&r.v20===best[20]?'cs-best':r.v20!=null&&r.v20===worst[20]?'cs-worst':''}">${fv(r.v20)}</span>
        <span class="cs-card-mult">${r.gs20||'—'}</span>
      </div>
      <div class="cs-card-row">
        <span class="cs-card-label">CAGR</span>
        <span style="display:flex;gap:4px;flex-wrap:wrap">${cagrBadge(c10)}<span style="font-size:9px;color:var(--faint);line-height:20px">10Y</span>${cagrBadge(c20)}<span style="font-size:9px;color:var(--faint);line-height:20px">20Y</span></span>
      </div>
      <div class="cs-card-row">
        <span class="cs-card-label">Peak</span>
        <span class="growth-badge badge-gold" style="font-size:10px">${bestY?bestY+'Y':'—'}</span>
        ${scorePct!=null?`<span class="growth-badge ${scoreCls}" style="font-size:10px;margin-left:auto">${scorePct}% score</span>`:''}
      </div>
      <div class="cs-card-ai-footer">
        <button class="cs-card-ai-btn" onclick="scorecardAiClick(${scKey})"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>Analyse with AI</button>
      </div>
    </div>`;
  });

  html+=`</div></div>`;
  wrap.innerHTML=html;
}

function triggerCompareAI(){
  if(typeof window.openChatWithPrompt!=='function')return;
  const names=selectedNames.slice();
  if(!names.length)return;
  const seed='$'+(Math.round(1000*(window.seedMultiplier||1))).toLocaleString();

  // Look up the actual asset objects so the AI gets exact data (bypasses keyword matching)
  const nameSet=new Set(names);
  const pinnedAssets=allData.filter(r=>nameSet.has(r.name));

  // Clean label shown in the chat bubble
  const displayText=`Compare ${names.length} selected assets (${seed} seed)`;

  // Detailed prompt — names listed so AI knows exactly what to compare
  const aiPrompt=`You have been given the full data for these ${names.length} specifically selected assets in the RELEVANT ASSETS section: ${names.join(', ')}. Compare ONLY these assets against each other across all available time horizons (1Y, 5Y, 10Y, 15Y, 20Y) based on a ${seed} seed investment. For each time horizon state which asset performed best and worst with the exact values. Then give an overall ranking from #1 to #${names.length} with a brief reason for each position. Finally, identify any hidden gems — assets that may be overlooked but offer strong risk-adjusted returns or consistent compounding — and flag any surprises where a well-known name underperforms expectations. Do NOT reference any assets outside this list.`;

  window.openChatWithPrompt(displayText, aiPrompt, pinnedAssets);
}

// ===== MINI CHARTS =====
function renderMiniCharts(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const gridColor=isDark?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)';
  const tickColor=isDark?'#8892a4':'#5a6680';
  const tooltipBg=isDark?'#1c2333':'#ffffff';
  const tooltipBorder=isDark?'#2a3147':'#dde2ec';
  const tooltipTitle=isDark?'#e8eaf0':'#1a2035';
  const tooltipBody=isDark?'#8892a4':'#5a6680';
  // Shared tooltip base — applied to every mini chart
  const tipBase={
    backgroundColor:tooltipBg,borderColor:tooltipBorder,borderWidth:1,
    titleColor:tooltipTitle,bodyColor:tooltipBody,
    padding:{top:12,right:14,bottom:12,left:14},
    boxPadding:5,
    cornerRadius:10,
    titleFont:{size:12,weight:'700',family:"'Inter',system-ui,sans-serif"},
    bodyFont:{size:11,family:"'Inter',system-ui,sans-serif"},
    titleSpacing:4,
    bodySpacing:3,
    titleMarginBottom:8,
    multiKeyBackground:'transparent',
  };
  // Plugin that draws a drop-shadow behind Chart.js tooltips (not natively supported)
  const tooltipShadowPlugin={
    id:'tooltipShadow',
    beforeDraw(chart){
      const {ctx}=chart;
      const tooltip=chart.tooltip;
      if(!tooltip||tooltip.opacity===0) return;
      const{x,y,width,height}=tooltip;
      ctx.save();
      ctx.shadowColor=isDark?'rgba(0,0,0,0.55)':'rgba(15,21,35,0.18)';
      ctx.shadowBlur=24;
      ctx.shadowOffsetY=8;
      ctx.fillStyle=tooltipBg;
      const r=10;
      ctx.beginPath();
      ctx.moveTo(x+r,y);ctx.lineTo(x+width-r,y);ctx.quadraticCurveTo(x+width,y,x+width,y+r);
      ctx.lineTo(x+width,y+height-r);ctx.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
      ctx.lineTo(x+r,y+height);ctx.quadraticCurveTo(x,y+height,x,y+height-r);
      ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();ctx.fill();
      ctx.restore();
    }
  };

  const activeData=filteredData.length>0?filteredData:secData(activeSection);

  // Mini 1: Top N assets by selected time range (10 normal, 20 expanded)
  const vKey='v'+top10Range;
  const gKey='g'+top10Range;
  const topN=top10Expanded?20:10;
  const top10=activeData.filter(r=>r[vKey]!=null).sort((a,b)=>b[vKey]-a[vKey]).slice(0,topN);
  const c1=document.getElementById('top10Chart');
  if(top10ChartInst){top10ChartInst.destroy();top10ChartInst=null;}
  const yrLabel=top10Range===1?'1-year':top10Range+'-year';
  if(c1&&top10.length){
    const top10Max=top10[0][vKey]*seedMultiplier;
    const top10Min=top10[top10.length-1][vKey]*seedMultiplier;
    // Use log scale when the top value is more than 100x the bottom value (extreme outlier squashes bars)
    const useLogScale=top10Max/top10Min>100;
    document.getElementById('top10Sub').textContent=`Top ${top10.length} assets by ${yrLabel} value${top10Expanded?' · expanded':''}${useLogScale?' · log scale':''}`;
    top10ChartInst=new Chart(c1,{
      type:'bar',
      plugins:[tooltipShadowPlugin],
      data:{
        labels:top10.map(r=>r.name.length>14?r.name.slice(0,13)+'…':r.name),
        datasets:[{
          label:top10Range+'Y Value',
          data:top10.map(r=>r[vKey]*seedMultiplier),
          backgroundColor:COLORS.slice(0,top10.length).map(c=>c+'cc'),
          borderColor:COLORS.slice(0,top10.length),
          borderWidth:1.5,
          borderRadius:4,
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{
            ...tipBase,
            callbacks:{
              title:ctx=>top10[ctx[0].dataIndex]?.name||'',
              label:ctx=>{
                const r=top10[ctx.dataIndex];
                const v=r[vKey]*seedMultiplier;
                const g=r[gKey];
                return [' Value: $'+v.toLocaleString(undefined,{maximumFractionDigits:0}), g?' Growth: '+g+'x':''].filter(Boolean);
              }
            }
          }
        },
        scales:{
          x:{grid:{display:false},ticks:{color:tickColor,font:{size:10},maxRotation:35}},
          y:useLogScale?{
            type:'logarithmic',
            grid:{color:gridColor},
            ticks:{color:tickColor,font:{size:10},callback:v=>{
              const log=Math.log10(v);
              if(log===Math.floor(log)||[500,5000,50000,500000,5000000,50000000].includes(v))
                return v>=1000000?'$'+(v/1000000).toFixed(v>=10000000?0:1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'K':'$'+v;
              return null;
            }}
          }:{grid:{color:gridColor},ticks:{color:tickColor,font:{size:10},callback:v=>v>=1000000?'$'+(v/1000000).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'K':'$'+v}}
        }
      }
    });
  }

  // Mini 2: Median return by section (range: sectionRange) — fully dynamic
  const secs=getSections(activeData).filter(s=>s!=='All');
  const secColors=secs.map((s,i)=>getSectionColor(s,i));
  const secTopAssets=secs.map(s=>
    activeData.filter(r=>r.section===s&&r['v'+sectionRange]!=null)
      .sort((a,b)=>b['v'+sectionRange]-a['v'+sectionRange])
      .slice(0,10)
  );
  const secMedians=secs.map(s=>{
    const vals=activeData.filter(r=>r.section===s&&r['v'+sectionRange]!=null).map(r=>r['v'+sectionRange]*seedMultiplier).sort((a,b)=>a-b);
    return vals.length?vals[Math.floor(vals.length/2)]:null;
  });
  const secCounts=secs.map(s=>activeData.filter(r=>r.section===s&&r['v'+sectionRange]!=null).length);
  const c2=document.getElementById('sectionChart');
  if(sectionChartInst){sectionChartInst.destroy();sectionChartInst=null;}
  const secSubEl=document.getElementById('sectionSub');
  if(secSubEl) secSubEl.textContent=`Median ${sectionRange}-year return per asset class`;
  if(c2){
    sectionChartInst=new Chart(c2,{
      type:'bar',
      plugins:[tooltipShadowPlugin],
      data:{
        labels:secs.map(s=>secLabel(s)),
        datasets:[{
          label:`Median ${sectionRange}Y Value`,
          data:secMedians,
          backgroundColor:secColors.map(c=>c+'cc'),
          borderColor:secColors,
          borderWidth:1.5,
          borderRadius:4,
        }]
      },
      options:{
        indexAxis:'y',
        responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{
            enabled:false,
            external(context){
              const tip=document.getElementById('sectionChartTip');
              if(!tip) return;
              if(context.tooltip.opacity===0){tip.style.display='none';return;}
              const idx=context.tooltip.dataPoints?.[0]?.dataIndex;
              if(idx==null){tip.style.display='none';return;}
              const med=context.tooltip.dataPoints[0].parsed.x;
              const medStr=med!=null?'$'+med.toLocaleString(undefined,{maximumFractionDigits:0}):'—';
              const tops=secTopAssets[idx]||[];
              let rows='';
              tops.forEach((r,ri)=>{
                const v=r['v'+sectionRange]*seedMultiplier;
                const vs=v>=1000000?'$'+(v/1000000).toFixed(2)+'M':v>=1000?'$'+(v/1000).toFixed(1)+'K':'$'+Math.round(v);
                rows+=`<div class="chart-ext-tip-row"><span class="chart-ext-tip-name">${ri+1}. ${r.name}</span><span class="chart-ext-tip-val">${vs}</span></div>`;
              });
              tip.innerHTML=`
                <div class="chart-ext-tip-title">${secs[idx]} · ${sectionRange}Y</div>
                <div class="chart-ext-tip-meta">Median: <strong>${medStr}</strong></div>
                <div class="chart-ext-tip-meta" style="color:var(--muted)">Assets: ${secCounts[idx]}</div>
                ${rows?`<div class="chart-ext-tip-label">Top assets</div><div class="chart-ext-tip-list">${rows}</div>`:''}
              `;
              tip.style.display='block';
              const pos=context.chart.canvas.getBoundingClientRect();
              const x=context.tooltip.caretX;
              const y=context.tooltip.caretY;
              const tw=tip.offsetWidth||240, th=tip.offsetHeight||200;
              let left=pos.left+x+14, top=pos.top+y-10;
              if(left+tw>window.innerWidth-10) left=pos.left+x-tw-14;
              if(top+th>window.innerHeight-10) top=window.innerHeight-th-10;
              if(top<4) top=4;
              tip.style.left=left+'px';
              tip.style.top=top+'px';
            }
          }
        },
        scales:{
          x:{grid:{color:gridColor},ticks:{color:tickColor,font:{size:10},callback:v=>v>=1000000?'$'+(v/1000000).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'K':'$'+v}},
          y:{grid:{display:false},ticks:{color:tickColor,font:{size:11}}}
        }
      }
    });
    document.getElementById('sectionCard')?.addEventListener('mouseleave',()=>{
      const tip=document.getElementById('sectionChartTip');
      if(tip) tip.style.display='none';
    });
  }

  // Mini 3: Avg return heatmap — rows = asset class, cols = time horizon — fully dynamic
  const heatSecs=getSections(activeData).filter(s=>s!=='All');
  const heatSecLabels=heatSecs.map(s=>secLabel(s));
  const heatPeriods=[{yr:1,label:'1Y'},{yr:5,label:'5Y'},{yr:10,label:'10Y'},{yr:15,label:'15Y'},{yr:20,label:'20Y'}];
  const heatCont=document.getElementById('heatmapContainer');
  if(heatCont){
    // Build avg value matrix [sec][period]
    const matrix=heatSecs.map(s=>
      heatPeriods.map(p=>{
        const vals=activeData.filter(r=>r.section===s&&r['v'+p.yr]!=null).map(r=>r['v'+p.yr]);
        return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      })
    );
    // Colours anchored to absolute break-even ($1K seed = $1K raw value).
    // POSITIVE ROI (v > 1000) → always green, scaled on a log ramp.
    // BREAK-EVEN (v ≈ 1000) → neutral warm-white/cream.
    // LOSS (v < 1000) → shades of red.
    // The gain ramp uses the 90th-percentile value as its cap so that modest
    // gains like $1.5K–$5K are visibly distinct and don't get swamped by BTC.
    const breakEven=1000;
    const allVals=matrix.flat().filter(v=>v!=null);
    const gainVals=allVals.filter(v=>v>breakEven).sort((a,b)=>a-b);
    const p90=gainVals.length?gainVals[Math.floor(gainVals.length*0.9)]:breakEven*10;
    const logBreak=Math.log10(breakEven+1);           // ~3.0
    const logCap=Math.log10(p90+1);                   // 90th-pct cap for green scale
    const lossVals=allVals.filter(v=>v<breakEven);
    const logMin=lossVals.length?Math.log10(Math.min(...lossVals)+1):Math.log10(1);

    function heatInterp(v){
      if(v==null) return isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)';
      const lv=Math.log10(Math.max(1,v)+1);
      if(v<breakEven){
        // Loss: deep red → pale pink as we approach break-even
        const tc=logBreak<=logMin?0:Math.max(0,Math.min(1,(lv-logMin)/(logBreak-logMin)));
        if(isDark) return `rgba(${Math.round(130-10*tc)},${Math.round(28+34*tc)},${Math.round(28-6*tc)},0.9)`;
        return `rgba(255,${Math.round(195+35*tc)},${Math.round(195-55*tc)},1)`;
      }
      // Gain: ALWAYS green — light green for small gains, rich forest for large
      // Use a fixed minimum brightness so even t≈0 is visibly green (not yellow/white)
      const tc=logCap<=logBreak?1:Math.max(0,Math.min(1,(lv-logBreak)/(logCap-logBreak)));
      if(isDark){
        // t=0: #1a4028 dark muted green, t=1: #2d8c4e vivid forest green
        return `rgba(${Math.round(26+20*tc)},${Math.round(64+76*tc)},${Math.round(40+38*tc)},${0.85+0.13*tc})`;
      }
      // t=0: #c8e6c8 clear light green (NOT white/yellow), t=1: #4caf50 medium green
      return `rgba(${Math.round(200-124*tc)},${Math.round(230-55*tc)},${Math.round(200-124*tc)},1)`;
    }
    function heatTextColor(v){
      if(v==null) return isDark?'#444':'#bbb';
      if(v<breakEven) return isDark?'#ffaaaa':'#7a1a1a';
      if(isDark) return '#b8f0c0';
      const tc=(Math.log10(v+1)-logBreak)/Math.max(0.01,logCap-logBreak);
      return tc>0.4?'#1a4d1a':'#2a5c2a';
    }
    function fmtAvg(v){
      if(v==null) return '—';
      const s=v*seedMultiplier;
      if(s>=1000000) return '$'+(s/1000000).toFixed(2)+'M';
      if(s>=10000) return '$'+(s/1000).toFixed(1)+'K';
      if(s>=1000) return '$'+(s/1000).toFixed(2)+'K';
      return '$'+s.toFixed(2);
    }

    // Pre-compute top assets per cell for tooltips
    const cellTopAssets=heatSecs.map(s=>
      heatPeriods.map(p=>{
        return activeData
          .filter(r=>r.section===s&&r['v'+p.yr]!=null)
          .sort((a,b)=>b['v'+p.yr]-a['v'+p.yr])
          .slice(0,10)
          .map(r=>({name:r.name,v:r['v'+p.yr]*seedMultiplier,g:r['g'+p.yr]}));
      })
    );

    let htm=`<div class="heatmap-wrap"><table class="heatmap">
      <colgroup><col class="heat-class-col">${heatPeriods.map(()=>'<col class="heat-val-col">').join('')}</colgroup>
      <thead><tr>
        <th style="text-align:left">Class</th>
        ${heatPeriods.map(p=>`<th>${p.label}</th>`).join('')}
      </tr></thead><tbody>`;
    heatSecs.forEach((s,si)=>{
      htm+=`<tr><td style="text-align:left;font-weight:700;font-size:11px;color:var(--text);background:var(--surface2);padding:6px 8px;border-left:3px solid ${getSectionColor(s,si)};white-space:nowrap">${heatSecLabels[si]}</td>`;
      matrix[si].forEach((v,pi)=>{
        const bg=heatInterp(v);
        const tc=heatTextColor(v);
        const count=activeData.filter(r=>r.section===s&&r['v'+heatPeriods[pi].yr]!=null).length;
        const cellId=`hc-${si}-${pi}`;
        htm+=`<td id="${cellId}" style="background:${bg};color:${tc};padding:8px 6px"
          onmouseenter="showHeatTip(event,${si},${pi})"
          onmouseleave="hideHeatTip()">${fmtAvg(v)}</td>`;
      });
      htm+=`</tr>`;
    });
    htm+=`</tbody></table></div>`;
    heatCont.innerHTML=htm;
    // Store data for tooltip
    heatCont._heatData={matrix,cellTopAssets,heatSecs,heatSecLabels,heatPeriods,fmtAvg};
  }

  // Mini 4: Median returns by horizon — grouped bars per asset class
  const c4=document.getElementById('scatterChart');
  if(scatterChartInst){scatterChartInst.destroy();scatterChartInst=null;}
  if(c4){
    const grpSecs=getSections(activeData).filter(s=>s!=='All');
    const grpLabels=grpSecs.map(s=>secLabel(s));
    const grpColors=grpSecs.map((s,i)=>getSectionColor(s,i));
    const horizons=[1,5,10,15,20];
    const horizonLabels=['1Y','5Y','10Y','15Y','20Y'];
    // Pre-build top-10 per section per horizon for tooltip
    const grpTop=grpSecs.map(s=>horizons.map(y=>
      activeData.filter(r=>r.section===s&&r['v'+y]!=null)
        .sort((a,b)=>b['v'+y]-a['v'+y]).slice(0,10)
    ));
    const grpCounts=grpSecs.map(s=>horizons.map(y=>activeData.filter(r=>r.section===s&&r['v'+y]!=null).length));
    const grpDatasets=grpSecs.map((s,si)=>({
      label:grpLabels[si],
      data:horizons.map(y=>{
        const vals=activeData.filter(r=>r.section===s&&r['v'+y]!=null).map(r=>r['v'+y]*seedMultiplier).sort((a,b)=>a-b);
        return vals.length ? vals[Math.floor(vals.length/2)] : null;
      }),
      backgroundColor:grpColors[si]+'cc',
      borderColor:grpColors[si],
      borderWidth:1.5,
      borderRadius:3,
    }));
    scatterChartInst=new Chart(c4,{
      type:'bar',
      plugins:[tooltipShadowPlugin],
      data:{labels:horizonLabels,datasets:grpDatasets},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{display:true,position:'bottom',labels:{color:tickColor,font:{size:10},padding:8,boxWidth:10,boxHeight:8}},
          tooltip:{
            enabled:false,
            external(context){
              const tip=document.getElementById('scatterChartTip');
              if(!tip) return;
              if(context.tooltip.opacity===0){tip.style.display='none';return;}
              const dp=context.tooltip.dataPoints?.[0];
              if(!dp){tip.style.display='none';return;}
              const si=dp.datasetIndex;
              const hi=dp.dataIndex;
              const y=horizons[hi];
              const med=dp.parsed.y;
              const medStr=med!=null?'$'+med.toLocaleString(undefined,{maximumFractionDigits:0}):'—';
              const tops=grpTop[si][hi]||[];
              let rows='';
              tops.forEach((r,i)=>{
                const v=r['v'+y]*seedMultiplier;
                const vs=v>=1000000?'$'+(v/1000000).toFixed(2)+'M':v>=1000?'$'+(v/1000).toFixed(1)+'K':'$'+Math.round(v);
                rows+=`<div class="chart-ext-tip-row"><span class="chart-ext-tip-name">${i+1}. ${r.name}</span><span class="chart-ext-tip-val">${vs}</span></div>`;
              });
              tip.innerHTML=`
                <div class="chart-ext-tip-title">${horizonLabels[hi]} Median</div>
                <div class="chart-ext-tip-meta"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${grpColors[si]};margin-right:5px;vertical-align:middle"></span>${grpLabels[si]}: <strong>${medStr}</strong></div>
                <div class="chart-ext-tip-meta" style="color:var(--muted)">Assets: ${grpCounts[si][hi]}</div>
                ${rows?`<div class="chart-ext-tip-label">Top assets</div><div class="chart-ext-tip-list">${rows}</div>`:''}
              `;
              tip.style.display='block';
              const pos=context.chart.canvas.getBoundingClientRect();
              const x=context.tooltip.caretX;
              const y2=context.tooltip.caretY;
              const tw=tip.offsetWidth||240, th=tip.offsetHeight||200;
              let left=pos.left+x+14, top=pos.top+y2-10;
              if(left+tw>window.innerWidth-10) left=pos.left+x-tw-14;
              if(top+th>window.innerHeight-10) top=window.innerHeight-th-10;
              if(top<4) top=4;
              tip.style.left=left+'px';
              tip.style.top=top+'px';
            }
          }
        },
        scales:{
          x:{grid:{display:false},ticks:{color:tickColor,font:{size:10}}},
          y:{grid:{color:gridColor},ticks:{color:tickColor,font:{size:10},callback:v=>v>=1000000?'$'+(v/1000000).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'K':'$'+v}}
        }
      }
    });
    document.getElementById('scatterCard')?.addEventListener('mouseleave',()=>{
      const tip=document.getElementById('scatterChartTip');
      if(tip) tip.style.display='none';
    });
  }

  // Mini 5: Category asset count — doughnut of top 15 categories by number of assets
  const c5=document.getElementById('catCountChart');
  if(catCountChartInst){catCountChartInst.destroy();catCountChartInst=null;}
  if(c5){
    // Build per-category top assets lookup for tooltip
    const catTopByCount={};
    activeData.forEach(r=>{
      if(r.category&&r['v'+catCountRange]!=null){
        if(!catTopByCount[r.category]) catTopByCount[r.category]=[];
        catTopByCount[r.category].push(r);
      }
    });
    Object.keys(catTopByCount).forEach(k=>{ catTopByCount[k].sort((a,b)=>b['v'+catCountRange]-a['v'+catCountRange]); });
    const catCounts={};
    Object.keys(catTopByCount).forEach(k=>{ catCounts[k]=catTopByCount[k].length; });
    const allCatsSorted=Object.entries(catCounts).sort((a,b)=>b[1]-a[1]);
    const catCountSorted=allCatsSorted.slice(0,Math.min(15,allCatsSorted.length));
    const sub=document.getElementById('catCountSub');
    if(sub) sub.textContent=`Assets with ${catCountRange}Y data by category (top ${catCountSorted.length})`;
    const catCountPalette=['#2563eb','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#ec4899','#84cc16','#14b8a6','#a78bfa','#fb923c','#22d3ee','#f43f5e','#4ade80','#818cf8'];
    catCountChartInst=new Chart(c5,{
      type:'doughnut',
      plugins:[tooltipShadowPlugin],
      data:{
        labels:catCountSorted.map(([k])=>k),
        datasets:[{
          data:catCountSorted.map(([,v])=>v),
          backgroundColor:catCountPalette.slice(0,catCountSorted.length).map(c=>c+'cc'),
          borderColor:catCountPalette.slice(0,catCountSorted.length),
          borderWidth:1.5,
          hoverOffset:6,
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,cutout:'58%',
        plugins:{
          legend:{display:true,position:'right',labels:{color:tickColor,font:{size:9},padding:4,boxWidth:9,boxHeight:9}},
          tooltip:{
            ...tipBase,
            callbacks:{
              title:ctx=>catCountSorted[ctx[0].dataIndex]?.[0]||'',
              label:ctx=>{
                const catName=catCountSorted[ctx.dataIndex]?.[0];
                const total=ctx.dataset.data.reduce((a,b)=>a+b,0);
                const lines=[` ${ctx.parsed} assets (${Math.round(ctx.parsed/total*100)}%)`,``,' Top assets by value:'];
                (catTopByCount[catName]||[]).slice(0,10).forEach((r,i)=>{
                  const v=r['v'+catCountRange]*seedMultiplier;
                  const vs=v>=1000000?'$'+(v/1000000).toFixed(2)+'M':v>=1000?'$'+(v/1000).toFixed(1)+'K':'$'+Math.round(v);
                  lines.push(` ${i+1}. ${r.name} — ${vs}`);
                });
                return lines;
              }
            }
          }
        }
      }
    });
  }

  // Mini 6: Top categories by average return (range: catRoiRange) — horizontal bar
  const c6=document.getElementById('catRoiChart');
  if(catRoiChartInst){catRoiChartInst.destroy();catRoiChartInst=null;}
  const catRoiSubEl=document.getElementById('catRoiSub');
  if(catRoiSubEl) catRoiSubEl.textContent=`Average ${catRoiRange}-year return per category`;
  if(c6){
    const catAvgR={};
    const catCntTmp={};
    const catTopAssets={};
    activeData.forEach(r=>{
      if(r.category&&r['v'+catRoiRange]!=null){
        catAvgR[r.category]=(catAvgR[r.category]||0)+r['v'+catRoiRange]*seedMultiplier;
        catCntTmp[r.category]=(catCntTmp[r.category]||0)+1;
        if(!catTopAssets[r.category]) catTopAssets[r.category]=[];
        catTopAssets[r.category].push(r);
      }
    });
    Object.keys(catTopAssets).forEach(k=>{
      catTopAssets[k].sort((a,b)=>b['v'+catRoiRange]-a['v'+catRoiRange]);
    });
    const catRoiSorted=Object.keys(catAvgR)
      .filter(k=>catCntTmp[k]>=2)
      .map(k=>({name:k,avg:catAvgR[k]/catCntTmp[k],count:catCntTmp[k],top:catTopAssets[k].slice(0,10)}))
      .sort((a,b)=>b.avg-a.avg)
      .slice(0,12);
    const catRoiPalette=catRoiSorted.map((_,i)=>{
      const hues=[210,160,45,0,190,30,330,80,175,265,20,350];
      return `hsl(${hues[i%hues.length]},65%,52%)`;
    });
    catRoiChartInst=new Chart(c6,{
      type:'bar',
      plugins:[tooltipShadowPlugin],
      data:{
        labels:catRoiSorted.map(d=>d.name),
        datasets:[{
          label:`Avg ${catRoiRange}Y Value`,
          data:catRoiSorted.map(d=>d.avg),
          backgroundColor:catRoiPalette.map(c=>c.replace('hsl(','hsla(').replace(')',',0.8)')),
          borderColor:catRoiPalette,
          borderWidth:1.5,
          borderRadius:4,
        }]
      },
      options:{
        indexAxis:'y',
        responsive:true,maintainAspectRatio:false,
        layout:{padding:{left:0}},
        plugins:{
          legend:{display:false},
          tooltip:{
            ...tipBase,
            callbacks:{
              title:ctx=>catRoiSorted[ctx[0].dataIndex]?.name||'',
              label:ctx=>{
                const d=catRoiSorted[ctx.dataIndex];
                const lines=[` Avg ${catRoiRange}Y: $${Math.round(ctx.parsed.x).toLocaleString()}`,` Assets: ${d.count}`,``,' Top assets:'];
                d.top.forEach((r,i)=>{
                  const v=r['v'+catRoiRange]*seedMultiplier;
                  const vs=v>=1000000?'$'+(v/1000000).toFixed(2)+'M':v>=1000?'$'+(v/1000).toFixed(1)+'K':'$'+Math.round(v);
                  lines.push(` ${i+1}. ${r.name} — ${vs}`);
                });
                return lines;
              }
            }
          }
        },
        scales:{
          x:{grid:{color:gridColor},ticks:{color:tickColor,font:{size:10},callback:v=>v>=1000000?'$'+(v/1000000).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'K':'$'+v}},
          y:{grid:{display:false},ticks:{color:tickColor,font:{size:10.5},autoSkip:false},afterFit:(scale)=>{
            const longest=catRoiSorted.reduce((max,d)=>d.name.length>max?d.name.length:max,0);
            scale.width=Math.max(140,Math.min(260,longest*6.5));
          }}
        }
      }
    });
  }
}

// ===== MINI CHART RANGE SETTERS =====
function setTop10Range(yr){
  top10Range=yr;
  document.querySelectorAll('#top10RangeTabs .mini-range-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.yr)===yr));
  renderMiniCharts();
}
function setSectionRange(yr){
  sectionRange=yr;
  document.querySelectorAll('#sectionRangeTabs .mini-range-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.yr)===yr));
  renderMiniCharts();
}
function setCatCountRange(yr){
  catCountRange=yr;
  document.querySelectorAll('#catCountRangeTabs .mini-range-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.yr)===yr));
  renderMiniCharts();
}
function setCatRoiRange(yr){
  catRoiRange=yr;
  document.querySelectorAll('#catRoiRangeTabs .mini-range-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.yr)===yr));
  renderMiniCharts();
}

function toggleTop10Expand(){
  top10Expanded=!top10Expanded;
  const grid=document.getElementById('analyticsGrid');
  const btn=document.getElementById('top10ExpandBtn');
  if(grid) grid.classList.toggle('top10-expanded',top10Expanded);
  if(btn) btn.classList.toggle('expanded',top10Expanded);
  // Update icon to collapse arrows when expanded
  btn.innerHTML=top10Expanded
    ?`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`
    :`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
  setTimeout(()=>renderMiniCharts(),320);
}

// ===== ROI FULLSCREEN =====
let roiFullscreen = false;

function toggleRoiFullscreen(){
  roiFullscreen = !roiFullscreen;
  const panel = document.getElementById('roiPanel');
  const slot  = document.getElementById('roiFsSlot');
  const wrap  = document.getElementById('tableRoiWrap');
  const btn   = document.getElementById('roiFullscreenBtn');
  if(!panel||!slot) return;

  const collapseIcon=`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`;
  const expandIcon=`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;

  if(roiFullscreen){
    // Move panel above table into the fullscreen slot
    slot.appendChild(panel);
    panel.style.cssText='flex:none;max-width:100%;opacity:1;width:100%';
    wrap.classList.remove('panel-open');
    // Only show slot if there is a selection
    slot.style.display = selectedNames.length > 0 ? 'block' : 'none';
    if(btn){ btn.classList.add('expanded'); btn.innerHTML=collapseIcon; btn.title='Exit fullscreen'; }
  } else {
    // Return panel to the table row
    wrap.appendChild(panel);
    panel.style.cssText='';
    slot.style.display='none';
    // Restore side-panel if assets selected
    if(selectedNames.length > 0) wrap.classList.add('panel-open');
    if(btn){ btn.classList.remove('expanded'); btn.innerHTML=expandIcon; btn.title='Expand to full width'; }
  }
  setTimeout(()=>renderChartArea(), 100);
}

// ===== KPI TOOLTIP =====
function showKpiTip(e,el){
  const text=el.getAttribute('data-kpi-tip');
  const assetsEnc=el.getAttribute('data-kpi-assets');
  if(!text&&!assetsEnc) return;
  const tip=document.getElementById('kpiTipFloat');
  if(!tip) return;

  let html='';
  if(text) html+=`<div class="kpi-tip-desc">${text}</div>`;

  if(assetsEnc){
    let assets=[];
    try{ assets=JSON.parse(decodeURIComponent(assetsEnc)); }catch(_){}
    if(assets.length){
      html+=`<div class="kpi-tip-divider"></div>`;
      html+=`<div class="kpi-tip-assets-label">Top assets</div>`;
      html+=`<div class="kpi-tip-assets">`;
      assets.forEach(({name,display,extra},i)=>{
        html+=`<div class="kpi-tip-asset-row">
          <span class="kpi-tip-rank">${i+1}</span>
          <span class="kpi-tip-aname">${name}</span>
          ${display?`<span class="kpi-tip-aval">${display}</span>`:''}
          ${extra?`<span class="kpi-tip-amult">${extra}</span>`:''}
        </div>`;
      });
      html+=`</div>`;
    }
  }

  tip.innerHTML=html;
  tip.style.display='block';
  const tw=tip.offsetWidth||240, th=tip.offsetHeight||80;
  const rect=el.getBoundingClientRect();
  let x=rect.left+rect.width/2-tw/2;
  let y=rect.top-th-10;
  x=Math.max(8,Math.min(window.innerWidth-tw-8,x));
  if(y<8){ y=rect.bottom+10; }
  tip.style.left=x+'px';
  tip.style.top=y+'px';
}
function hideKpiTip(){
  const tip=document.getElementById('kpiTipFloat');
  if(tip) tip.style.display='none';
}

function kpiAiClick(btn){
  const card = btn.closest('.kpi-card');
  if(!card || !window.openChatWithPrompt) return;

  const displayPrompt = card.getAttribute('data-ai-prompt') || '';
  const label = card.querySelector('.kpi-label')?.textContent || '';
  const val   = card.querySelector('.kpi-value')?.textContent || '';
  const sub   = card.querySelector('.kpi-sub')?.textContent  || '';

  // Decode the tip asset list (name/display/extra objects)
  let tipAssets = [];
  try {
    const enc = card.getAttribute('data-kpi-assets');
    if(enc) tipAssets = JSON.parse(decodeURIComponent(enc));
  } catch(e){}

  // Look up full asset records from allData so the AI gets exact figures
  let pinnedAssets = null;
  if(tipAssets.length && typeof allData !== 'undefined' && allData){
    const nameSet = new Set(tipAssets.map(a => a.name).filter(Boolean));
    const found = allData.filter(r => nameSet.has(r.name));
    if(found.length) pinnedAssets = found;
  }

  // Build a richer prompt that names the pinned assets so the AI focuses on them
  let aiPrompt = displayPrompt;
  if(pinnedAssets && pinnedAssets.length){
    const names = pinnedAssets.map(r => r.name).join(', ');
    aiPrompt = `${displayPrompt}\n\nKey assets for this KPI (${label} — ${val}): ${names}. Use their exact figures from the dataset.`;
  }

  window.openChatWithPrompt(displayPrompt, aiPrompt, pinnedAssets);
}

// Prompt cache: keyed by numeric index so onclick attrs never embed raw strings
const _aiPromptCache = {};
let _aiPromptIdx = 0;
function _storePrompt(text){ const k=_aiPromptIdx++; _aiPromptCache[k]=text; return k; }

const _rowDisplayTemplates = [
  r => `Tell me about ${r.name} — and its wider industry`,
  r => `What's the real story behind ${r.name}'s long-term returns?`,
  r => `Break down ${r.name} for me — the good, the bad and the risks`,
  r => `Is ${r.name} actually worth holding? Let's look at the data`,
  r => `How does ${r.name} hold up compared to the rest of the ${r.section} class?`,
  r => `Walk me through ${r.name} — performance drivers and what to watch out for`,
  r => `What makes ${r.name} tick? Performance, sector context and key risks`,
];

const _scorecardDisplayTemplates = [
  r => `Let's deep dive into ${r.name} and how it compares to the top assets in the dataset`,
  r => `What's behind ${r.name}'s performance — and how does its category really stack up?`,
  r => `Give me the full picture on ${r.name} — strengths, weaknesses and peer comparison`,
  r => `Is ${r.name} a long-term compounder or a one-trick pony? Let's find out`,
  r => `How does ${r.name} compare to the best assets across the whole dataset?`,
  r => `Analyse ${r.name} — does its track record justify a place in a long-term portfolio?`,
  r => `${r.name} deep dive — sector performance, risk profile and where it really stands`,
];

function _pickTemplate(templates, r){
  // deterministic but varies by asset name so each asset gets a consistent variant
  let hash=0;
  for(let i=0;i<r.name.length;i++) hash=(hash*31+r.name.charCodeAt(i))>>>0;
  return templates[hash % templates.length](r);
}

function buildAssetRowAiPrompt(r){
  const bestYr=YEARS.reduce((b,y)=>r['v'+y]!=null&&(b==null||r['v'+y]>r['v'+b])?y:b,null);
  const lines=[];
  lines.push(`Here is the performance data for **${r.name}** (${r.category} · ${r.section}):\n`);
  if(r.v1!=null)  lines.push(`• 1 Year:   ${r.vs1}  (${r.gs1})`);
  if(r.v5!=null)  lines.push(`• 5 Years:  ${r.vs5}  (${r.gs5})`);
  if(r.v10!=null) lines.push(`• 10 Years: ${r.vs10}  (${r.gs10})`);
  if(r.v15!=null) lines.push(`• 15 Years: ${r.vs15}  (${r.gs15})`);
  if(r.v20!=null) lines.push(`• 20 Years: ${r.vs20}  (${r.gs20})`);
  if(bestYr)      lines.push(`\nPeak period: ${bestYr} years`);
  lines.push(`\nBased on this data, give me a clear breakdown of this asset — what has driven its performance, what are the key risks an investor should know about, and how does it stack up against other assets in the ${r.section} class?`);
  return {display: _pickTemplate(_rowDisplayTemplates, r), prompt: lines.join('\n')};
}

function tableRowAiClick(e,k){
  e.stopPropagation();
  const p=_aiPromptCache[k];
  if(p && window.openChatWithPrompt) window.openChatWithPrompt(p.display, p.prompt);
}

function scorecardAiClick(k){
  const p=_aiPromptCache[k];
  if(p && window.openChatWithPrompt) window.openChatWithPrompt(p.display, p.prompt);
}

function chartAiClick(chart){
  if(!window.openChatWithPrompt) return;
  const sec = activeSection === 'All' ? 'across all asset classes' : `in the ${activeSection} section`;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  let prompt;
  switch(chart){
    case 'top10':
      prompt = pick([
        `Analyse the top 10 best-returning assets ${sec} over ${top10Range} years. What do the leaders have in common and what can investors learn from them?`,
        `Looking at the top 10 performers ${sec} over ${top10Range} years, what structural characteristics — sector, asset class, liquidity — do they share? Could these traits be used to screen future winners?`,
        `The top 10 assets ${sec} at the ${top10Range}-year mark represent the extreme right tail of returns. How much of their outperformance is driven by fundamental value creation versus speculative momentum? Use the data to support your view.`,
        `If an investor had perfectly picked the top 10 assets ${sec} at the start of the ${top10Range}-year window, what would their portfolio look like today? What does this tell us about the value of foresight versus diversification?`,
        `Compare the top 10 best-returning assets ${sec} at ${top10Range} years. Are these consistent outperformers across all time horizons (1Y, 5Y, 10Y, 15Y, 20Y), or are they specifically strong at this timeframe? What does that mean for investors?`,
        `What risk profile would an investor need to accept to hold the top 10 assets ${sec} over ${top10Range} years? Assess volatility, drawdown potential, and whether the reward justifies it.`,
        `Rank the top 10 best-returning assets ${sec} over ${top10Range} years by category. Which categories are over-represented at the top and what does this signal about where long-term compounding power lies?`,
      ]);
      break;
    case 'section':
      prompt = pick([
        `Compare the median ${sectionRange}-year returns across asset classes ${sec}. Which asset class stands out and why?`,
        `Using median ${sectionRange}-year returns ${sec}, which asset class offers the best risk-adjusted return profile for a long-term investor? Consider both the upside and the breadth of assets in each class.`,
        `Across asset classes ${sec}, how does the distribution of ${sectionRange}-year median returns map to conventional portfolio theory? Are the expected winners (e.g. equities) actually delivering over this timeframe?`,
        `Which asset class shows the greatest divergence between its best and worst ${sectionRange}-year performers ${sec}? What does this internal variance tell us about selection risk within that class?`,
        `If you had to allocate 100% to a single asset class based on ${sectionRange}-year median returns ${sec}, which would you choose and why? What are the key risks of that concentrated bet?`,
        `Analyse whether the asset class rankings by ${sectionRange}-year median return ${sec} would be predictable from first principles (growth potential, liquidity, inflation hedge). Where does the actual data surprise you?`,
        `Compare the ${sectionRange}-year median returns across asset classes ${sec}. Which classes are closing the performance gap with equities over time, and which are falling further behind?`,
      ]);
      break;
    case 'heatmap':
      prompt = pick([
        `Analyse the average return heatmap ${sec} across all time horizons (1Y, 5Y, 10Y, 15Y, 20Y). Which asset classes show consistent growth and which are volatile?`,
        `Using the return heatmap ${sec}, identify which asset classes improve most significantly as the holding period extends from 1Y to 20Y. What compounding dynamics explain this?`,
        `Which cells in the return heatmap ${sec} stand out as anomalies — either surprisingly high or surprisingly low for their asset class and time horizon? What might explain these outliers?`,
        `Trace the trajectory of each asset class ${sec} across the 1Y, 5Y, 10Y, 15Y, and 20Y columns in the heatmap. Which classes show a steep upward curve versus those that plateau early?`,
        `Using the heatmap ${sec}, which asset classes would form the best core long-term holdings (10Y+) versus the best tactical short-term positions (1Y)? Build a framework based on the data.`,
        `Across the heatmap ${sec}, how many asset classes achieve meaningfully higher average returns at 20Y than at 10Y? What does this tell us about whether extending holding periods beyond a decade is consistently rewarded?`,
        `Identify the two or three asset class and time-horizon combinations in the heatmap ${sec} that offer the most compelling risk-to-return trade-off. Justify each selection using the underlying figures.`,
      ]);
      break;
    case 'scatter':
      prompt = pick([
        `Looking at median returns by time horizon ${sec}, how does holding period affect investment outcomes? Which asset classes improve most with longer holds?`,
        `Using the median return scatter ${sec}, model what happens to a diversified portfolio of the top three asset classes if held for 20 years versus 5 years. Is the time premium worth the illiquidity?`,
        `Which asset classes ${sec} show a near-linear relationship between holding period and return in the scatter data, and which show diminishing or accelerating returns over time? What does each pattern imply for investors?`,
        `From the median-return-by-horizon chart ${sec}, at what holding period does the median return curve begin to flatten for each asset class? Is there an optimal hold window beyond which additional time adds marginal value?`,
        `Using the scatter data ${sec}, compare the compounding trajectories of the top two and bottom two asset classes across all time horizons. At what point, if ever, do the laggards catch the leaders?`,
        `Analyse the holding-period sensitivity ${sec}: which asset classes carry the most risk at the 1-year horizon but deliver the strongest results by year 10 or 20? Does patience materially reduce risk in these classes?`,
        `From the median return scatter ${sec}, derive an implied annualised return (CAGR) for each asset class at the 10-year and 20-year marks. Which classes sustain the highest CAGR over the full 20-year period?`,
      ]);
      break;
    case 'catCount':
      prompt = pick([
        `Analyse the category breakdown ${sec} at the ${catCountRange}-year horizon. Does a category with more assets tend to produce better or worse average returns?`,
        `In the category count chart ${sec} at the ${catCountRange}-year horizon, which categories have the highest asset count? Is there a positive or negative correlation between category depth and average return?`,
        `Which categories ${sec} at the ${catCountRange}-year mark are under-represented in terms of asset count despite strong average returns? Does this suggest data gaps or a genuinely narrow opportunity set?`,
        `Using category count and average return data ${sec} at ${catCountRange} years, classify each category as either diversified (high count, moderate return) or concentrated (low count, high/low return). Which profile would you prefer to invest in?`,
        `At the ${catCountRange}-year horizon ${sec}, which categories have the widest spread between their best-performing and average-performing assets? Does a larger asset count in the category lead to greater internal variance?`,
        `Looking at category counts ${sec} at ${catCountRange} years, which categories punch above their weight — delivering strong average returns despite having few assets? What qualities might explain this efficiency?`,
        `Using the category breakdown ${sec} at ${catCountRange} years, identify which categories have grown in relevance (high count, high return) and which have become legacy holdings (high count, declining return relevance).`,
      ]);
      break;
    case 'catRoi':
      prompt = pick([
        `Which categories have the highest average ${catRoiRange}-year ROI ${sec}? What drives the top categories and should investors concentrate there?`,
        `Rank the top five categories by average ${catRoiRange}-year ROI ${sec}. For each, identify whether their performance is driven by a few outliers or consistent broad-based returns across all assets in the category.`,
        `At the ${catRoiRange}-year horizon ${sec}, which categories deliver ROI that substantially exceeds what passive index investing would achieve? Is active category selection justified by the data?`,
        `Using average ${catRoiRange}-year ROI by category ${sec}, which categories have shown the steepest decline in average returns compared to shorter horizons? What structural shifts might explain a category losing momentum over time?`,
        `Compare the highest and lowest ROI categories ${sec} at ${catRoiRange} years. What fundamental differences — growth profile, liquidity, macro sensitivity — explain the gap at this specific time horizon?`,
        `From the category ROI chart ${sec} at ${catRoiRange} years, identify any categories that might be over-represented in typical retail portfolios relative to their actual return contribution. Where is the real value hiding?`,
        `If you were constructing a thematic portfolio based solely on category ROI ${sec} at ${catRoiRange} years, which three categories would you overweight and which would you underweight? Justify each decision using the data.`,
      ]);
      break;
    default:
      prompt = `Analyse the investment data ${sec}.`;
  }
  window.openChatWithPrompt(prompt, prompt);
}

// ===== HEATMAP TOOLTIP =====
function showHeatTip(e,si,pi){
  const cont=document.getElementById('heatmapContainer');
  if(!cont||!cont._heatData) return;
  const {matrix,cellTopAssets,heatSecs,heatSecLabels,heatPeriods,fmtAvg}=cont._heatData;
  const secName=heatSecLabels[si];
  const period=heatPeriods[pi];
  const avg=matrix[si][pi];
  const tops=cellTopAssets[si][pi];
  const count=tops.length;

  let html=`<div class="heat-tip-title">${secName} · ${period.label}</div>`;
  html+=`<div class="heat-tip-avg">Avg: <strong>${fmtAvg(avg)}</strong></div>`;
  if(tops.length){
    html+=`<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:4px">Top assets</div>`;
    html+=`<div class="heat-tip-list">`;
    tops.forEach(({name,v,g},i)=>{
      const fv=v>=1000000?'$'+(v/1000000).toFixed(2)+'M':v>=1000?'$'+(v/1000).toFixed(1)+'K':'$'+Math.round(v);
      html+=`<div class="heat-tip-row"><span class="heat-tip-name">${i+1}. ${name}</span><span class="heat-tip-val">${fv}${g?' · '+g+'x':''}</span></div>`;
    });
    html+=`</div>`;
  }

  const tip=document.getElementById('heatTip');
  if(!tip) return;
  tip.innerHTML=html;
  tip.style.display='block';
  positionHeatTip(e);
}

function positionHeatTip(e){
  const tip=document.getElementById('heatTip');
  if(!tip) return;
  const tw=tip.offsetWidth||240, th=tip.offsetHeight||160;
  let x=e.clientX+14, y=e.clientY-10;
  if(x+tw>window.innerWidth-10) x=e.clientX-tw-14;
  if(y+th>window.innerHeight-10) y=window.innerHeight-th-10;
  tip.style.left=x+'px';
  tip.style.top=y+'px';
}

function hideHeatTip(){
  const tip=document.getElementById('heatTip');
  if(tip) tip.style.display='none';
}

// ===== MOBILE DATA MENU =====
function toggleDataMenu(){
  const btn=document.getElementById('dataMenuBtn');
  const dd=document.getElementById('dataMenuDropdown');
  const opening=!dd.classList.contains('open');
  if(opening){
    const r=btn.getBoundingClientRect();
    dd.style.top=(r.bottom+4)+'px';
    dd.style.right=(window.innerWidth-r.right)+'px';
    dd.style.left='auto';
  }
  dd.classList.toggle('open',opening);
  btn.classList.toggle('open',opening);
}
function closeDataMenu(){
  document.getElementById('dataMenuBtn')?.classList.remove('open');
  document.getElementById('dataMenuDropdown')?.classList.remove('open');
}
function openCsvInfoSheet(){
  const el=document.getElementById('csvInfoOverlay');
  if(!el) return;
  el.style.display='flex';
  requestAnimationFrame(()=>el.classList.add('visible'));
}
function closeCsvInfoSheet(){
  const el=document.getElementById('csvInfoOverlay');
  if(!el) return;
  el.classList.remove('visible');
  el.addEventListener('transitionend',()=>{el.style.display='none';},{once:true});
}
document.addEventListener('click',function(e){
  const wrap=document.getElementById('dataMenuWrap');
  if(wrap && !wrap.contains(e.target)) closeDataMenu();
});

// ===== THEME =====
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme',cur==='light'?'dark':'light');
  updateThemeIcon();
  renderChartArea();
  renderMiniCharts();
}
function updateThemeIcon(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  document.getElementById('themeBtn').textContent=isDark?'☀️':'🌙';
}

// ===== SAMPLE CSV DOWNLOAD =====
function downloadSampleCSV(e){
  e.preventDefault();
  const rows=[
    'Asset Name,Category,1Yr Value,1Yr Growth (x),5Yr Value,5Yr Growth (x),10Yr Value,10Yr Growth (x),15Yr Value,15Yr Growth (x),20Yr Value,20Yr Growth (x)',
    'Gold ETF (GLD),Commodities,1080,1.08,1350,1.35,1820,1.82,2400,2.40,3200,3.20',
    'Vanguard Total Market ETF (VTI),ETFs & Funds,1240,1.24,1770,1.77,3150,3.15,5800,5.80,9200,9.20',
    'Corp Bonds (LQD),Bonds,1050,1.05,1100,1.10,1400,1.40,1800,1.80,2500,2.50',
    'Prologis (PLD),Real Estate,1180,1.18,2100,2.10,4600,4.60,8400,8.40,14000,14.00',
    'Apple (AAPL),Stocks,1380,1.38,2850,2.85,9200,9.20,28000,28.00,68000,68.00',
  ];
  const blob=new Blob([rows.join('\n')],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='sample_investment_data.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ===== EXPORT =====
function exportCSV(){
  const d=filteredData.length>0?filteredData:secData(activeSection);
  const header='Asset/Company,Category,Section,1Yr Value,1Yr Growth,5Yr Value,5Yr Growth,10Yr Value,10Yr Growth,15Yr Value,15Yr Growth,20Yr Value,20Yr Growth\n';
  const rows=d.map(r=>[`"${r.name}"`,`"${r.category}"`,r.section,r.vs1,r.gs1,r.vs5,r.gs5,r.vs10,r.gs10,r.vs15,r.gs15,r.vs20,r.gs20].join(',')).join('\n');
  const blob=new Blob([header+rows],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`roi-master-${activeSection.replace(/\s+/g,'-').toLowerCase()}.csv`;
  a.click();
}

// ===== SEED VALUE =====
function applySeed(){
  const raw=parseFloat(document.getElementById('seedInput').value);
  if(isNaN(raw)||raw<=0)return;
  seedMultiplier=raw/1000;
  const base=originalData||DEFAULT_DATA;
  const sc=seedMultiplier;
  const fv=v=>v!=null?'$'+Math.round(v*sc).toLocaleString():'—';
  const fg=g=>g!=null?g+'x':'—';
  allData=allData.map(r=>{
    const o=base.find(b=>b.name===r.name&&b.section===r.section)||r;
    return {...o,vs1:fv(o.v1),vs5:fv(o.v5),vs10:fv(o.v10),vs15:fv(o.v15),vs20:fv(o.v20),
      gs1:fg(o.g1),gs5:fg(o.g5),gs10:fg(o.g10),gs15:fg(o.g15),gs20:fg(o.g20)};
  });
  updateKPIs(); applyFilters(); renderChartArea(); renderMiniCharts();
}

// ===== DATA INFO BAR =====
function saveDesc(){
  // live save — value is read directly when needed
}

function setDataInfoBar(fileName,description,isCustom){
  const bar=document.getElementById('dataInfoBar');
  const nameEl=document.getElementById('dataFileName');
  const staticEl=document.getElementById('dataDescStatic');
  const inputEl=document.getElementById('dataDescInput');
  if(!bar) return;
  nameEl.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${fileName}`;
  if(isCustom){
    staticEl.style.display='none';
    inputEl.style.display='';
    inputEl.value=description||'';
    inputEl.placeholder='Add a description for this dataset…';
  } else {
    staticEl.style.display='';
    staticEl.innerHTML=description;
    inputEl.style.display='none';
  }
}

// ===== CSV IMPORT =====
function resetToDefault(){
  allData=DEFAULT_DATA.map(r=>({...r}));
  originalData=DEFAULT_DATA.map(r=>({...r}));
  usingCustomData=false; seedMultiplier=1;
  document.getElementById('seedInput').value=1000;
  document.getElementById('resetDataBtn').style.display='none';
  selectedCats=new Set(); selectedSecs=new Set(); selectedNames=[];
  setDataInfoBar('Default Dataset — 300+ Assets','Curated ROI data spanning 300+ global assets across Stocks, ETFs &amp; Funds, Bonds, Commodities, and Real Estate — covering returns at 1, 5, 10, 15, and 20-year horizons. <strong>Easily add your own datasets via CSV upload</strong>.',false);
  buildSidebar();
  applySection('All'); updateKPIs();
}

function loadCustomCSV(input){
  const file=input.files[0]; if(!file)return;
  if(!file.name.toLowerCase().endsWith('.csv')||file.type&&!['text/csv','text/plain','application/csv','application/vnd.ms-excel'].includes(file.type)){
    alert('Only .csv files are accepted.'); input.value=''; return;
  }
  if(file.size>5*1024*1024){alert('File exceeds the 5 MB limit.'); input.value=''; return;}
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const raw=e.target.result;
      if(!/^[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]*$/.test(raw.slice(0,2048))){
        alert('File does not appear to be a valid CSV.'); input.value=''; return;
      }
      const lines=raw.split('\n').filter(l=>l.trim());
      const parsed=[];
      const secMap={'STOCKS':'Stocks','ETF':'ETFs & Funds','FUND':'ETFs & Funds','BOND':'Bonds','TREASUR':'Bonds','COMMODIT':'Commodities','REAL ESTATE':'Real Estate'};
      let cur='Stocks';
      for(let i=1;i<lines.length;i++){
        const line=lines[i];
        const row=[];let inQ=false,c='';
        for(const ch of line+','){if(ch==='"')inQ=!inQ;else if(ch===','&&!inQ){row.push(c.trim());c='';}else c+=ch;}
        const ne=row.filter(x=>x).length;
        if(ne<=2){
          const u=row[0].toUpperCase();
          for(const[k,v]of Object.entries(secMap)){if(u.includes(k)){cur=v;break;}}
          continue;
        }
        if(!row[0]||row.length<4)continue;
        const pm=s=>{if(!s)return null;s=s.replace(/[$,x]/g,'').trim();return isNaN(s)||s===''?null:parseFloat(s);};
        const sc=seedMultiplier;
        const fv=v=>v!=null?'$'+Math.round(v*sc).toLocaleString():'—';
        const fg=g=>g!=null?g+'x':'—';
        const[v1,g1,v5,g5,v10,g10,v15,g15,v20,g20]=[pm(row[2]),pm(row[3]),pm(row[4]),pm(row[5]),pm(row[6]),pm(row[7]),pm(row[8]),pm(row[9]),pm(row[10]),pm(row[11])];
        parsed.push({name:row[0],category:row[1]||'',section:cur,v1,g1,v5,g5,v10,g10,v15,g15,v20,g20,
          vs1:fv(v1),gs1:fg(g1),vs5:fv(v5),gs5:fg(g5),vs10:fv(v10),gs10:fg(g10),vs15:fv(v15),gs15:fg(g15),vs20:fv(v20),gs20:fg(g20)});
      }
      if(!parsed.length){alert('No valid rows found. Check the CSV format.');return;}
      allData=parsed;
      originalData=parsed.map(r=>({...r}));
      usingCustomData=true; selectedNames=[]; selectedCats=new Set(); selectedSecs=new Set();
      document.getElementById('resetDataBtn').style.display='';
      setDataInfoBar(file.name,'',true);
      buildSidebar();
      applySection('All'); updateKPIs(); renderChartArea(); renderMiniCharts();
      input.value='';
    }catch(err){alert('Error: '+err.message);}
  };
  reader.readAsText(file);
}

// ===== BOOTSTRAP =====
originalData = DEFAULT_DATA.map(r=>({...r}));
init();
// Mark 20yr as default selected timeline
(function(){
  const btn=document.querySelector('.timeline-btn[data-yrs="20"]');
  if(btn) btn.classList.add('on');
})();
setDataInfoBar(
  'Default Dataset — 300+ Assets',
  'Curated ROI data spanning 300+ global assets across Stocks, ETFs &amp; Funds, Bonds, Commodities, and Real Estate — covering returns at 1, 5, 10, 15, and 20-year horizons. <strong>Easily add your own datasets via CSV upload</strong>.',
  false
);
