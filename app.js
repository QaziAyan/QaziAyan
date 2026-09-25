/* Cycle Notes — client-only tracker. Each function stays small and testable. */
/* Storage examples:
 * pt_user: {name:"Maya",avgCycle:28,cycleLength:28}
 * pt_cycles: [{id:"c1",startDate:"2026-09-01",endDate:"2026-09-05",notes:"",intensity:"medium"}]
 * pt_diet: [{id:"d1",text:"lentil soup",date:"2026-09-24"}]
 * pt_exercise: [{id:"e1",text:"walk",date:"2026-09-24"}]
 * pt_symptoms: [{id:"s1",symptoms:["Cramps"],severity:2,date:"2026-09-24"}]
 * pt_medication: [{id:"m1",name:"Example",dose:"1 tablet",schedule:{type:"daily",time:"09:00",weekday:1},log:[{date:"2026-09-24",takenAt:"2026-09-24T09:00:00.000Z"}]}]
 * pt_trash: [{id:"t1",type:"diet",item:{id:"d1",text:"lentil soup",date:"2026-09-24"},deletedAt:"2026-09-24T12:00:00.000Z"}]
 * pt_shares: {"a1b2c3":{createdAt:"2026-09-24T12:00:00.000Z",expiresAt:"2026-10-01T12:00:00.000Z",mode:"standard",summary:{...}}}
 * pt_analytics_cache: {simulatedAt:"2026-09-24T12:00:00.000Z",days:[{date:"2026-09-24",steps:6200,sleepHours:7.2,hrv:48}]}
 * pt_settings: {discreet:false,partnerTheme:false,darkMode:false,largeText:false,highContrast:false,periodReminders:true,periodReminderDays:2,reminderLead:30,quietStart:"22:00",quietEnd:"07:00",emailTipsOptIn:false,shareExpiryDays:7,featureFlags:{wearables:true,help:true},lastCheckin:"2026-09-24",streak:2,lastTipDate:"2026-09-21"}
 * pt_feedback: [{id:"f1",message:"A useful feature",createdAt:"2026-09-24T12:00:00.000Z"}]
 */

// -- Persistence and date helpers -------------------------------------------
const KEYS = { user: 'pt_user', cycles: 'pt_cycles', diet: 'pt_diet', exercise: 'pt_exercise', symptoms: 'pt_symptoms', medication: 'pt_medication', trash: 'pt_trash', shares: 'pt_shares', settings: 'pt_settings', analytics: 'pt_analytics_cache', feedback:'pt_feedback' };
let backendReady=false, backendBusy=false, backendTimer=null;
function save(key, obj) { localStorage.setItem(key, JSON.stringify(obj));markLocalDirty();if(backendReady)queueBackendSync(); }
function load(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } }
function markLocalDirty() { const previous=Number(localStorage.getItem('pt_sync_modified'))||0;localStorage.setItem('pt_sync_modified',String(Math.max(Date.now(),previous+1))); }
function localSnapshot() { return Object.fromEntries(Object.values(KEYS).flatMap(key=>{const value=localStorage.getItem(key);if(value===null)return [];try{return [[key,JSON.parse(value)]];}catch{return [];}})); }
function hasSavedData(data) { return Object.values(data).some(value=>Array.isArray(value)?value.length>0:value&&typeof value==='object'&&Object.keys(value).length>0); }
function mergeSnapshots(remote,local) {
  const merged={...remote};
  for(const [key,value] of Object.entries(local)){
    const old=merged[key];
    if(Array.isArray(old)&&Array.isArray(value)){const items=new Map(old.map(item=>[item.id,item]));value.forEach(item=>items.set(item.id,item));merged[key]=[...items.values()];}
    else if(old&&value&&typeof old==='object'&&typeof value==='object'&&!Array.isArray(old)&&!Array.isArray(value))merged[key]={...old,...value};
    else if(value!==null)merged[key]=value;
  }
  return merged;
}
function applySnapshot(data) {
  Object.values(KEYS).forEach(key=>{if(Object.hasOwn(data,key))localStorage.setItem(key,JSON.stringify(data[key]));else localStorage.removeItem(key);});
  user=load(KEYS.user,null);cycles=load(KEYS.cycles,[]);diet=load(KEYS.diet,[]);exercise=load(KEYS.exercise,[]);symptoms=load(KEYS.symptoms,[]);
  medication=load(KEYS.medication,[]).map(item=>({...item,dose:item.dose||'',schedule:item.schedule||{type:'daily',time:'09:00'},log:item.log||[]}));
  trash=load(KEYS.trash,[]);shares=load(KEYS.shares,{});settings={...{discreet:false,partnerTheme:false,darkMode:false,largeText:false,highContrast:false,periodReminders:true,periodReminderDays:2,emailTipsOptIn:false,shareExpiryDays:7,reminderLead:30,quietStart:'',quietEnd:'',featureFlags:{wearables:true,help:true}},...load(KEYS.settings,{})};settings.featureFlags={wearables:true,help:true,...settings.featureFlags};
  analytics=load(KEYS.analytics,null);feedback=load(KEYS.feedback,[]);
}
function setStorageStatus(message) { const status=document.getElementById('storageStatus');if(status)status.textContent=message; }
function queueBackendSync() { clearTimeout(backendTimer);setStorageStatus('Saving to local server…');backendTimer=setTimeout(syncBackend,350); }
async function syncBackend() {
  if(!backendReady||backendBusy)return;backendBusy=true;
  const marker=localStorage.getItem('pt_sync_modified'),data=localSnapshot();
  let synced=false;
  try{const response=await fetch('/api/data',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({data})});if(!response.ok)throw new Error('sync failed');const result=await response.json();if(localStorage.getItem('pt_sync_modified')===marker)localStorage.setItem('pt_sync_modified',String(result.updatedAt));setStorageStatus('Saved to local server');synced=true;}
  catch{setStorageStatus('Server unavailable · saved in this browser');}
  finally{backendBusy=false;if(localStorage.getItem('pt_sync_modified')!==marker)queueBackendSync();}
  return synced;
}
async function bootstrapBackend() {
  if(location.protocol!=='http:'&&location.protocol!=='https:'){setStorageStatus('Browser storage only');return;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1800);
  try{
    const response=await fetch('/api/data',{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error('backend not available');
    const remote=await response.json(),local=localSnapshot(),localDirty=Number(localStorage.getItem('pt_sync_modified'))||0;
    backendReady=true;setStorageStatus('Connected to local server');
    if(remote.updatedAt&&localDirty>remote.updatedAt){await syncBackend();return;}
    if(remote.updatedAt&&hasSavedData(local)&&!localDirty){applySnapshot(mergeSnapshots(remote.data,local));queueBackendSync();return;}
    if(remote.updatedAt){applySnapshot(remote.data);localStorage.setItem('pt_sync_modified',String(remote.updatedAt));return;}
    if(hasSavedData(local)){markLocalDirty();await syncBackend();return;}
    localStorage.setItem('pt_sync_modified','0');
  }catch{backendReady=false;setStorageStatus('Browser storage only');}
  finally{clearTimeout(timer);}
}
function downloadJSON(name, obj) { const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
function downloadText(name, text, type) { const url=URL.createObjectURL(new Blob([text],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url); }
const today = () => toISO(new Date());
function toISO(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseDate(value) { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d,12); }
function addDays(value, days) { const d = parseDate(value); d.setDate(d.getDate()+days); return toISO(d); }
function dayDiff(from, to) { return Math.round((parseDate(to)-parseDate(from))/86400000); }
function formatDate(value, options={month:'short',day:'numeric'}) { return parseDate(value).toLocaleDateString(undefined, options); }
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }

// -- App state and predictions ----------------------------------------------
let user = load(KEYS.user, null);
let cycles = load(KEYS.cycles, []);
let diet = load(KEYS.diet, []);
let exercise = load(KEYS.exercise, []);
let symptoms = load(KEYS.symptoms, []);
let medication = load(KEYS.medication, []).map(item => ({...item,dose:item.dose||'',schedule:item.schedule||{type:'daily',time:'09:00'},log:item.log||[]}));
let trash = load(KEYS.trash, []);
let shares = load(KEYS.shares, {});
let settings = {...{discreet:false,partnerTheme:false,darkMode:false,largeText:false,highContrast:false,periodReminders:true,periodReminderDays:2,emailTipsOptIn:false,shareExpiryDays:7,reminderLead:30,quietStart:'',quietEnd:'',featureFlags:{wearables:true,help:true}},...load(KEYS.settings,{})};
settings.featureFlags={wearables:true,help:true,...settings.featureFlags};
let analytics = load(KEYS.analytics, null);
let feedback = load('pt_feedback', []);
let quickHidden = false;
const FOOD_CATALOG = [
  { category:'Breakfast & breads', items:['Aloo paratha','Gobhi paratha','Paneer paratha','Besan chilla','Poha','Suji upma','Roti / chapati','Tandoori roti','Naan'] },
  { category:'Rice, dal & curries', items:['Steamed rice','Jeera rice','Pulao','Dal tadka','Rajma','Chole','Kadhi pakora','Palak paneer','Paneer bhurji','Aloo gobi','Bhindi masala','Baingan bharta','Sarson ka saag','Chicken curry','Egg curry'] },
  { category:'Sides & snacks', items:['Dahi','Raita','Lassi','Chaas','Cucumber salad','Fruit chaat','Samosa','Pakora','Roasted chana'] }
];
const EXERCISE_CATALOG = [
  { category:'Walking & everyday', items:['Easy walk','Brisk walk','Stairs','Household activity'] },
  { category:'Yoga & mobility', items:['Gentle yoga','Restorative yoga','Surya namaskar','Stretching','Mobility routine'] },
  { category:'Cardio', items:['Cycling','Jogging','Dancing','Swimming'] },
  { category:'Strength & low impact', items:['Bodyweight strength','Resistance bands','Light weights','Pilates'] }
];
let visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedSymptoms = new Set();
let toastTimer;

function sortedCycles() { return [...cycles].sort((a,b) => a.startDate.localeCompare(b.startDate)); }
function cycleIntervals() { const list = sortedCycles(); return list.slice(1).map((cycle, index) => dayDiff(list[index].startDate, cycle.startDate)).filter(n => n > 0 && n <= 90); }
function simpleMean(values) { return values.length ? values.reduce((sum,n)=>sum+n,0)/values.length : null; }
function weightedMean(values) {
  // Recent intervals receive weights 0.6, 0.3, 0.1; renormalize when fewer than 3 exist.
  const recent = values.slice(-3).reverse(), weights = [0.6,0.3,0.1].slice(0,recent.length), total = weights.reduce((a,b)=>a+b,0);
  return recent.length ? recent.reduce((sum,n,i)=>sum+n*weights[i],0)/total : null;
}
function prediction() {
  const ordered = sortedCycles(), intervals = cycleIntervals();
  if (!ordered.length) return { mean:null, weighted:null, expected:null, last:null };
  const mean = simpleMean(intervals), weighted = weightedMean(intervals);
  // Expected next period = last recorded start + decay-weighted interval (fallback: profile average).
  const avgCycle = weighted ?? Number(user?.avgCycle ?? user?.cycleLength ?? 28);
  return { mean, weighted, expected:addDays(ordered.at(-1).startDate, Math.round(avgCycle)), last:ordered.at(-1), avgCycle };
}
function correlationSuggestions(days) {
  if (!Array.isArray(days) || days.length < 2) return [];
  const lowSleep = days.filter(day=>day.sleepHours<6.5), highCramps=days.filter(day=>day.cramps>=2);
  const suggestions=[];
  if(lowSleep.length>=2 && highCramps.length>=2) suggestions.push('Poor sleep and stronger cramps both appear in this sample.');
  const lowHrv=days.filter(day=>day.hrv<40);
  if(lowHrv.length>=2) suggestions.push('Lower HRV appears on multiple simulated days; consider noting how you feel.');
  if(!suggestions.length) suggestions.push('No clear pattern in this sample yet. Keep logging to compare days.');
  return suggestions.slice(0,2);
}
function anomalyReasons() {
  const intervals=cycleIntervals(), short=intervals.filter(days=>days<18).length, long=intervals.filter(days=>days>35).length;
  const heavy=sortedCycles().slice(-6).filter(c=>c.intensity==='heavy').length, reasons=[];
  if(short>=2)reasons.push('repeated cycles shorter than 18 days');
  if(long>=2)reasons.push('repeated cycles longer than 35 days');
  if(heavy>=2)reasons.push('two or more heavy-flow logs in the last six');
  return reasons;
}
function scheduledToday(item) {
  return item.schedule?.type!=='weekly' || Number(item.schedule?.weekday)===new Date().getDay();
}
function medicationStatus(item) {
  if(!scheduledToday(item))return 'Not scheduled today';
  const taken=(item.log||[]).find(entry=>entry.date===today());
  if(taken)return 'Taken today';
  const time=item.schedule?.time||'09:00',now=new Date().toTimeString().slice(0,5),[hour,minute]=time.split(':').map(Number);
  const dueAt=hour*60+minute,nowAt=new Date().getHours()*60+new Date().getMinutes();
  if(nowAt>=dueAt)return 'Missed today';
  return nowAt>=dueAt-Number(settings.reminderLead||0)?'Due soon':'Scheduled today';
}
function checkInStreak() {
  const stamp=settings.lastCheckin, now=today();
  if(stamp===now)return settings.streak||1;
  settings.streak=stamp && dayDiff(stamp,now)===1 ? (settings.streak||1)+1 : 1;
  settings.lastCheckin=now;save(KEYS.settings,settings);return settings.streak;
}
function checkIn() { const streak=checkInStreak();el('streakLabel').textContent=`${streak}-day check-in streak`; }
function purgeTrash() { const cutoff = Date.now() - 7*86400000; trash = trash.filter(item => Date.parse(item.deletedAt) > cutoff); save(KEYS.trash, trash); }
function purgeExpiredShares() { const now=Date.now();Object.keys(shares).forEach(id=>{if(Date.parse(shares[id].expiresAt||0)<=now)delete shares[id];});save(KEYS.shares,shares); }

// -- Feedback and small DOM helpers -----------------------------------------
function toast(message) { const node = document.getElementById('toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>node.classList.remove('show'), 2400); }
function el(id) { return document.getElementById(id); }
function showDialog(id) { const dialog = el(id); if (!dialog.open) dialog.showModal(); }
function closeDialog(id) { const dialog = el(id); if (dialog.open) dialog.close(); }
function emptyRow(text) { return `<li class="empty-note">${escapeHTML(text)}</li>`; }
function addToTrash(type, item) { trash.unshift({ id:makeId(), type, item, deletedAt:new Date().toISOString() }); save(KEYS.trash, trash); renderTrashCount(); }

// -- Dashboard rendering -----------------------------------------------------
function renderHeader() {
  el('todayLabel').textContent = new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
  el('welcomeTitle').textContent = user ? `${user.name}’s cycle overview` : 'Cycle overview';
  el('welcomeSub').textContent = 'Your cycle notes stay on this device.';
  el('profileButton').textContent = user?.name?.trim()?.[0]?.toUpperCase() || '?';
  document.body.classList.toggle('discreet', Boolean(settings.discreet));
  document.body.classList.toggle('partner-theme',Boolean(settings.partnerTheme));
  document.body.classList.toggle('dark-mode',Boolean(settings.darkMode));
  document.body.classList.toggle('large-text',Boolean(settings.largeText));
  document.body.classList.toggle('high-contrast',Boolean(settings.highContrast));
  el('discreetToggle').setAttribute('aria-pressed', String(Boolean(settings.discreet)));
  el('partnerThemeToggle').setAttribute('aria-pressed',String(Boolean(settings.partnerTheme)));
  el('darkModeToggle').setAttribute('aria-pressed',String(Boolean(settings.darkMode)));
  el('darkModeToggle').setAttribute('aria-label',settings.darkMode?'Turn off dark mode':'Turn on dark mode');
  document.body.classList.toggle('quick-hidden',quickHidden);
  el('quickHideButton').setAttribute('aria-pressed',String(quickHidden));
  document.querySelectorAll('.sensitive-panel').forEach(panel=>{panel.inert=quickHidden;panel.setAttribute('aria-hidden',String(quickHidden));});
}
function renderOverview() {
  const p = prediction();
  if (!p.last) { el('cycleDay').textContent='—'; el('cycleStatus').textContent='Add a period to begin tracking.'; el('nextPeriod').textContent='Waiting for cycle data';el('nextCountdown').textContent='';el('predictionSummary').textContent='Log period dates to see your prediction summary.'; el('avgLength').textContent=user ? `${user.avgCycle||user.cycleLength} days · profile average` : '—'; }
  else {
    const index = cycles.findIndex(c=>c.id===p.last.id), active = !p.last.endDate;
    el('cycleDay').textContent = `${dayDiff(p.last.startDate,today())+1}`;
    el('cycleStatus').textContent = active ? 'Period marked as ongoing' : `Last period ${formatDate(p.last.startDate)}${p.last.endDate ? ` – ${formatDate(p.last.endDate)}` : ''}`;
    el('nextPeriod').textContent = p.expected ? formatDate(p.expected,{month:'short',day:'numeric',year:'numeric'}) : 'Log another period';
    const daysUntil=p.expected?dayDiff(today(),p.expected):null;
    el('nextCountdown').textContent=daysUntil===null?'':daysUntil===0?'Estimated today':daysUntil>0?`In ${daysUntil} days`: `${Math.abs(daysUntil)} days past estimate`;
    el('avgLength').textContent = p.weighted ? `${Math.round(p.weighted)} days · weighted` : `${user.avgCycle||user.cycleLength} days · profile average`;
    const intervals=cycleIntervals();
    el('predictionSummary').textContent=intervals.length?`Simple mean ${simpleMean(intervals).toFixed(1)} days · weighted ${weightedMean(intervals).toFixed(1)} days`:`Profile estimate ${Math.round(p.avgCycle)} days · add another period for cycle averages`;
    void index;
  }
  const banner = el('lateBanner'), expected = p.expected;
  // Late warning window: show only when today is after expectedNext and no more than 3 days late.
  const lateDays = expected ? dayDiff(expected,today()) : 0;
  const showLate = Boolean(expected && lateDays > 0 && lateDays <= 3);
  banner.hidden = !showLate; el('lateText').textContent = showLate ? `Your predicted date was ${formatDate(expected)}. Cycle timing can vary.` : '';
  const reasons=anomalyReasons();el('clinicianBanner').hidden=!reasons.length;
  el('anomalyText').textContent=reasons.length?`${reasons.join('; ')}. This is a pattern flag, not a diagnosis.`:'';
  const intervals = cycleIntervals();
  if (intervals.length >= 2) el('predictionNote').textContent = `Simple mean ${simpleMean(intervals).toFixed(1)} days · weighted estimate ${weightedMean(intervals).toFixed(1)} days. Estimates are a guide, not a diagnosis.`;
  else if (intervals.length === 1) el('predictionNote').textContent = `Simple mean: ${simpleMean(intervals).toFixed(1)} days · weighted estimate: ${weightedMean(intervals).toFixed(1)} days. Log another start to compare more intervals.`;
  else el('predictionNote').textContent = 'Log two period starts to compare the simple mean and weighted estimate.';
}
function renderCalendar() {
  const year=visibleMonth.getFullYear(), month=visibleMonth.getMonth(), first=new Date(year,month,1), last=new Date(year,month+1,0);
  el('monthTitle').textContent=first.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html=weekdays.map(d=>`<div class="weekday" role="columnheader">${d}</div>`).join('');
  const p=prediction(), periodDays=new Set(), fertileDays=new Set();
  cycles.forEach(c=>{ const finalDay=c.endDate||today(); for(let d=c.startDate;d<=finalDay;d=addDays(d,1)) periodDays.add(d); });
  if(p.expected){
    // Approximate fertile window: five days before predicted ovulation through ovulation day.
    for(let i=-19;i<=-14;i++) fertileDays.add(addDays(p.expected,i));
  }
  const startOffset=first.getDay();
  for(let i=0;i<startOffset;i++) html+=`<div class="day muted" role="gridcell" aria-disabled="true"></div>`;
  for(let n=1;n<=last.getDate();n++){
    const value=toISO(new Date(year,month,n)), classes=['day'];
    const predicted=p.expected===value, ovulation=p.expected && value===addDays(p.expected,-14), actual=periodDays.has(value), fertile=fertileDays.has(value), late=predicted && dayDiff(value,today())>0 && dayDiff(value,today())<=3;
    if(value===today())classes.push('today'); if(actual)classes.push('period'); else if(fertile)classes.push('fertile'); if(predicted)classes.push('predicted'); if(ovulation)classes.push('ovulation'); if(late)classes.push('late');
    const labels=[]; if(actual)labels.push('period'); if(fertile)labels.push('fertile window'); if(ovulation)labels.push('predicted ovulation'); if(predicted)labels.push(late?'predicted start, late warning':'predicted period start'); if(value===today())labels.push('today');
    const markers=[actual?'P':'',fertile?'F':'',ovulation?'O':'',predicted?(late?'E!':'E'):''].filter(Boolean).join(' ');
    html+=`<button type="button" data-day="${n}" class="${classes.join(' ')}" role="gridcell" aria-label="${formatDate(value,{weekday:'long',month:'long',day:'numeric'})}${labels.length?`, ${labels.join(', ')}`:''}" aria-selected="${value===today()}"><span>${n}</span>${markers?`<small class="marker-code" aria-hidden="true">${markers}</small>`:''}</button>`;
  }
  el('calendar').innerHTML=html;
  el('calendar').querySelectorAll('[role=gridcell][aria-disabled!=true]').forEach(button=>button.addEventListener('keydown', event=>{
    const offset={ArrowRight:1,ArrowLeft:-1,ArrowDown:7,ArrowUp:-7}[event.key]; if(!offset)return; event.preventDefault();
    const current=Number(button.dataset.day), date=new Date(year,month,current+offset), targetMonth=new Date(date.getFullYear(),date.getMonth(),1);
    if(targetMonth.getTime()!==visibleMonth.getTime()){visibleMonth=targetMonth;renderCalendar();}
    const target=toISO(date); el('calendar').querySelector(`[aria-label^="${date.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}"]`)?.focus();
  }));
}
function renderCycles() {
  const list=sortedCycles().slice().reverse();
  el('cycleList').innerHTML=list.length?list.slice(0,5).map(c=>`<div class="cycle-entry"><div class="cycle-entry-main"><strong>${formatDate(c.startDate,{month:'long',day:'numeric',year:'numeric'})}${c.endDate?` – ${formatDate(c.endDate)}`:''}</strong><small>${escapeHTML(c.intensity||'medium')} flow${c.notes?` · ${escapeHTML(c.notes)}`:''}</small></div><div class="cycle-entry-actions"><button class="delete-item" data-edit-cycle="${escapeHTML(c.id)}" aria-label="Edit period starting ${formatDate(c.startDate)}">Edit</button><button class="delete-item" data-delete-cycle="${escapeHTML(c.id)}" aria-label="Delete period starting ${formatDate(c.startDate)}">×</button></div></div>`).join('') : emptyRow('Your first period log will show here.');
  el('cycleList').querySelectorAll('[data-edit-cycle]').forEach(b=>b.addEventListener('click',()=>editCycle(b.dataset.editCycle)));
  el('cycleList').querySelectorAll('[data-delete-cycle]').forEach(b=>b.addEventListener('click',()=>deleteCycle(b.dataset.deleteCycle)));
}
function renderCycleInsights() {
  const ordered=sortedCycles(),intervals=cycleIntervals(),container=el('cycleInsights');
  if(intervals.length<1){container.innerHTML='<p class="subtle">Log at least two period starts to compare cycle lengths.</p>';return;}
  const recent=intervals.slice(-6),maximum=Math.max(35,...recent);
  const chart=recent.map((length,index)=>{const cycleIndex=intervals.length-recent.length+index+1,start=ordered[cycleIndex].startDate,width=Math.max(5,Math.round(length/maximum*100));return `<li><time datetime="${start}">${formatDate(start,{month:'short',day:'numeric'})}</time><span class="insight-bar-track"><span style="width:${width}%"></span></span><strong>${length}d</strong></li>`;}).join('');
  const rows=intervals.slice(-4).map((_,index)=>{const intervalIndex=intervals.length-Math.min(4,intervals.length)+index;const cycle=ordered[intervalIndex+1];const forecast=addDays(cycle.startDate,Math.round(weightedMean(intervals.slice(0,intervalIndex+1))));return `<tr><th scope="row">${formatDate(cycle.startDate,{month:'short',day:'numeric'})}</th><td>${intervals[intervalIndex]} days</td><td>${formatDate(forecast,{month:'short',day:'numeric'})}</td></tr>`;}).join('');
  const p=prediction();
  container.innerHTML=`<div class="insight-summary"><span>Simple mean <strong>${simpleMean(intervals).toFixed(1)} days</strong></span><span>Weighted average <strong>${weightedMean(intervals).toFixed(1)} days</strong></span><span>Next estimate <strong>${p.expected?formatDate(p.expected,{month:'short',day:'numeric'}):'—'}</strong></span></div><ul class="insight-bars" role="img" aria-label="Recent cycle lengths: ${recent.join(', ')} days">${chart}</ul><details class="estimate-history"><summary>How estimates changed</summary><div class="table-scroll"><table class="insights-table"><caption>Forecasts from earlier recorded cycles</caption><thead><tr><th scope="col">Period start</th><th scope="col">Cycle length</th><th scope="col">Following estimate</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
function renderRecent(list, nodeId, type) {
  const items=list.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  el(nodeId).innerHTML=items.length?items.map(item=>`<li><span>${escapeHTML(type==='symptoms'?`${item.symptoms.join(', ')} · ${['','Mild','Moderate','Strong'][item.severity]}`:item.text)}</span><time datetime="${item.date}">${formatDate(item.date)}</time><span class="entry-actions"><button class="delete-item" data-edit-entry="${escapeHTML(item.id)}" data-type="${type}" aria-label="Edit ${type==='symptoms'?'symptom':'entry'} from ${formatDate(item.date)}">Edit</button><button class="delete-item" data-delete="${escapeHTML(item.id)}" data-type="${type}" aria-label="Delete entry from ${formatDate(item.date)}">×</button></span></li>`).join(''):emptyRow(`No ${type==='diet'?'food':type==='exercise'?'movement':'symptom'} notes yet.`);
  el(nodeId).querySelectorAll('[data-edit-entry]').forEach(button=>button.addEventListener('click',()=>editEntry(button.dataset.type,button.dataset.editEntry)));
  el(nodeId).querySelectorAll('[data-delete]').forEach(button=>button.addEventListener('click',()=>deleteEntry(button.dataset.type,button.dataset.delete)));
}
function editEntry(type,id) {
  const list=type==='diet'?diet:type==='exercise'?exercise:symptoms,item=list.find(entry=>entry.id===id);if(!item)return;
  if(type==='symptoms'){
    el('symptomsTab').click();selectedSymptoms=new Set(item.symptoms);el('symptomChips').querySelectorAll('.chip').forEach(chip=>chip.setAttribute('aria-pressed',String(selectedSymptoms.has(chip.dataset.symptom))));
    const form=el('symptomForm');form.elements.id.value=item.id;form.elements.date.value=item.date;el('severity').value=String(item.severity);form.querySelector('[type=submit]').textContent='Update symptoms';return;
  }
  if(type==='diet')el('dietTab').click();else el('exerciseTab').click();
  const form=el(`${type}Form`);form.elements.id.value=item.id;form.elements.text.value=item.text;form.elements.date.value=item.date;form.querySelector('[type=submit]').textContent='Save changes';form.elements.text.focus();
}
function renderSymptoms() {
  renderRecent(symptoms,'symptomList','symptoms');
  const recent=symptoms.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7), counts={}; recent.forEach(entry=>entry.symptoms.forEach(name=>counts[name]=(counts[name]||0)+1));
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  el('symptomTrend').textContent=top?`Last 7 check-ins: ${top[0]} appeared ${top[1]} time${top[1]===1?'':'s'}.`: 'Your symptom pattern will appear here.';
}
function renderMedication() { el('medList').innerHTML=medication.length?medication.map(item=>{const taken=(item.log||[]).some(entry=>entry.date===today());return `<li><span><strong>${escapeHTML(item.name)}</strong> · ${escapeHTML(item.dose||'No dose')}<br><small>${escapeHTML(item.schedule?.type||'daily')} at ${escapeHTML(item.schedule?.time||'09:00')} · ${medicationStatus(item)}</small></span><button class="text-button" data-edit-med="${escapeHTML(item.id)}" aria-label="Edit ${escapeHTML(item.name)}">Edit</button><button class="text-button" data-taken="${escapeHTML(item.id)}" aria-label="Mark ${escapeHTML(item.name)} ${taken?'not taken':'taken'}">${taken?'Undo':'Mark taken'}</button></li>`;}).join(''):emptyRow('No medication added.'); el('medList').querySelectorAll('[data-edit-med]').forEach(b=>b.addEventListener('click',()=>editMedication(b.dataset.editMed)));el('medList').querySelectorAll('[data-taken]').forEach(b=>b.addEventListener('click',()=>{const item=medication.find(x=>x.id===b.dataset.taken);const current=(item.log||[]).find(entry=>entry.date===today());item.log=current?item.log.filter(entry=>entry.date!==today()):[...(item.log||[]),{date:today(),takenAt:new Date().toISOString()}];save(KEYS.medication,medication);renderMedication();toast(current?'Dose unmarked':'Dose marked taken');})); }
function editMedication(id) { const item=medication.find(m=>m.id===id),form=el('medForm');if(!item)return;form.elements.id.value=item.id;form.elements.name.value=item.name;form.elements.dose.value=item.dose||'';form.elements.scheduleType.value=item.schedule?.type||'daily';form.elements.weekday.value=String(item.schedule?.weekday??1);form.elements.time.value=item.schedule?.time||'09:00';form.querySelector('[type=submit]').textContent='Save';el('medCancel').hidden=false;form.elements.name.focus(); }
function resetMedicationForm() { const form=el('medForm');form.reset();form.elements.id.value='';form.elements.time.value='09:00';form.querySelector('[type=submit]').textContent='Add';el('medCancel').hidden=true; }
function renderTrashCount() { el('trashCount').textContent=trash.length; }
function renderAnalytics() {
  if(analytics?.days?.length)el('correlationSummary').textContent=correlationSuggestions(analytics.days).join(' ');
  else el('correlationSummary').textContent='No simulated data yet.';
  const tips=el('tipCard');tips.hidden=!(settings.emailTipsOptIn&&new Date().getDay()===1);
  if(settings.emailTipsOptIn)tips.textContent='This week’s in-app tip: add period start dates when you remember; estimates improve with more history.';
  el('streakLabel').textContent=settings.streak?`${settings.streak}-day check-in streak`:'';
}
function renderFlags() {
  const flags=settings.featureFlags||{};
  el('wearableButton').hidden=!flags.wearables;
  el('correlationSummary').hidden=!flags.wearables;
  el('assistantForm').hidden=!flags.help;
}
function renderChoiceCatalog(groups, query, targetId, logType, statusId) {
  const term=query.trim().toLowerCase(), matches=[];
  const shown=groups.map(group=>({category:group.category,items:group.items.filter(item=>!term||item.toLowerCase().includes(term)||group.category.toLowerCase().includes(term))})).filter(group=>group.items.length);
  shown.forEach(group=>group.items.forEach(item=>matches.push(item)));
  el(targetId).innerHTML=shown.length?shown.map((group,index)=>`<details class="catalog-group" ${term||index===0?'open':''}><summary>${escapeHTML(group.category)} <span>${group.items.length} options</span></summary><div class="catalog-options">${group.items.map(item=>`<button type="button" class="catalog-choice" data-catalog-type="${logType}" data-catalog-item="${escapeHTML(item)}" aria-label="Add ${escapeHTML(item)} to today's ${logType==='diet'?'food':'movement'} notes">＋ ${escapeHTML(item)}</button>`).join('')}</div></details>`).join(''):'<p class="catalog-empty">No matches. Try another search or use the note field below.</p>';
  el(statusId).textContent=term?`${matches.length} ${logType==='diet'?'food':'activity'} options shown.`:'';
}
function renderCatalogs() {
  renderChoiceCatalog(FOOD_CATALOG,el('foodSearch').value,'foodCatalog','diet','foodCatalogStatus');
  renderChoiceCatalog(EXERCISE_CATALOG,el('exerciseSearch').value,'exerciseCatalog','exercise','exerciseCatalogStatus');
}
function render() { renderHeader();renderOverview();renderCalendar();renderCycles();renderCycleInsights();renderRecent(diet,'dietList','diet');renderRecent(exercise,'exerciseList','exercise');renderSymptoms();renderMedication();renderTrashCount();renderAnalytics();renderFlags();renderCatalogs(); }

// -- Cycle entry actions -----------------------------------------------------
function openCycleForm(cycle=null) {
  const form=el('cycleForm'); form.reset(); form.elements.id.value=cycle?.id||''; form.elements.startDate.value=cycle?.startDate||today(); form.elements.endDate.value=cycle?.endDate||''; form.elements.intensity.value=cycle?.intensity||'medium'; form.elements.notes.value=cycle?.notes||'';
  el('cycleDialogTitle').textContent=cycle?'Edit period':'Add a period'; showDialog('cycleDialog');
}
function editCycle(id) { openCycleForm(cycles.find(c=>c.id===id)); }
function deleteCycle(id) { const item=cycles.find(c=>c.id===id); if(!item)return; cycles=cycles.filter(c=>c.id!==id);save(KEYS.cycles,cycles);addToTrash('cycles',item);render();toast('Period moved to trash'); }
function deleteEntry(type,id) {
  const key=KEYS[type], list=({diet,exercise,symptoms})[type]; const item=list.find(x=>x.id===id); if(!item)return;
  const updated=list.filter(x=>x.id!==id); if(type==='diet')diet=updated;if(type==='exercise')exercise=updated;if(type==='symptoms')symptoms=updated;save(key,updated);addToTrash(type,item);render();toast('Entry moved to trash');
}

// -- Trash, export and share -------------------------------------------------
function renderTrash() {
  const container=el('trashList');
  container.innerHTML=trash.length?trash.map(item=>`<div class="trash-row"><span>${escapeHTML(item.type)} · ${escapeHTML(item.item.text||item.item.name||item.item.startDate||'entry')}</span><button data-restore="${escapeHTML(item.id)}">Restore</button><button data-purge="${escapeHTML(item.id)}">Delete forever</button></div>`).join(''):'<p class="subtle">Trash is empty.</p>';
  container.querySelectorAll('[data-restore]').forEach(b=>b.addEventListener('click',()=>restoreTrash(b.dataset.restore)));
  container.querySelectorAll('[data-purge]').forEach(b=>b.addEventListener('click',()=>{trash=trash.filter(x=>x.id!==b.dataset.purge);save(KEYS.trash,trash);renderTrash();renderTrashCount();toast('Deleted forever');}));
}
function restoreTrash(id) {
  const entry=trash.find(x=>x.id===id);if(!entry)return;
  if(entry.type==='cycles'){cycles.push(entry.item);save(KEYS.cycles,cycles)}else if(KEYS[entry.type]){const key=KEYS[entry.type];let list=load(key,[]);list.push(entry.item);save(key,list);if(entry.type==='diet')diet=list;if(entry.type==='exercise')exercise=list;if(entry.type==='symptoms')symptoms=list;}
  trash=trash.filter(x=>x.id!==id);save(KEYS.trash,trash);renderTrash();render();toast('Entry restored');
}
function exportData() { downloadJSON('cycle-notes-export.json',{user,cycles,diet,exercise,symptoms,medication}); }
function exportCalendar() {
  const next=prediction().expected;if(!next){toast('Log a period to estimate calendar events');return;}
  const start=next.replaceAll('-',''),end=addDays(next,1).replaceAll('-','');
  const content=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Cycle Notes//Period Tracker//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:period-${start}@cycle-notes.local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;VALUE=DATE:${start}`,`DTEND;VALUE=DATE:${end}`,'SUMMARY:Predicted period start','DESCRIPTION:Personal estimate from Cycle Notes. Not a medical prediction.','END:VEVENT','END:VCALENDAR'].join('\r\n');
  downloadText('cycle-notes.ics',content,'text/calendar');
}
function exportSymptomCSV() {
  const cell=value=>`"${String(value??'').replaceAll('"','""')}"`;
  const rows=[['Date','Symptoms','Severity'],...symptoms.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(item=>[item.date,item.symptoms.join('; '),['','Mild','Moderate','Strong'][item.severity]||''])];
  downloadText('symptom-timeline.csv',rows.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
function shortShareId() { const chars='abcdefghjkmnpqrstuvwxyz23456789';let id='';do{id=Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('');}while(shares[id]);return id; }
function saveSnapshot(mode) {
  const p=prediction(),id=shortShareId(),createdAt=new Date(),expiresAt=new Date(createdAt.getTime()+Number(settings.shareExpiryDays||7)*86400000).toISOString();
  const summary=mode==='partner'?{nextStart:p.expected,countdown:p.expected?dayDiff(today(),p.expected):null,privacy:'limited'}:{averageCycle:p.weighted?Math.round(p.weighted):user?.cycleLength||null,nextPeriod:p.expected,periodCount:cycles.length,recentSymptoms:symptoms.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(s=>({date:s.date,symptoms:s.symptoms,severity:s.severity}))};
  shares[id]={createdAt:createdAt.toISOString(),expiresAt,mode,summary};save(KEYS.shares,shares);
  const url=new URL(location.href);url.searchParams.set('share',id);el('shareResult').textContent=`Snapshot ID: ${id} · Expires ${formatDate(toISO(expiresAt),{month:'short',day:'numeric'})} · ${url.href}`;
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url.href).catch(()=>{});
  if(new URLSearchParams(location.search).has('share'))history.replaceState({},'',url);
  toast(`Snapshot ${id} created`);return {id,url:url.href};
}
function createShare() { return saveSnapshot('standard'); }
function createPartnerShare() { return saveSnapshot('partner'); }
function renderShare(snapshot) {
  if(!snapshot)return;
  if(snapshot.mode==='partner')el('shareContent').innerHTML=`<div class="share-stat"><strong>Privacy</strong><br>Limited snapshot</div><div class="share-stat"><strong>Next predicted start</strong><br>${snapshot.summary.nextStart?formatDate(snapshot.summary.nextStart,{month:'long',day:'numeric',year:'numeric'}):'Not available'}</div><div class="share-stat"><strong>Countdown</strong><br>${snapshot.summary.countdown===null?'Not available':snapshot.summary.countdown<0?'Date has passed':`${snapshot.summary.countdown} days`}</div>`;
  else el('shareContent').innerHTML=`<div class="share-stat"><strong>Average cycle</strong><br>${snapshot.summary.averageCycle?`${snapshot.summary.averageCycle} days`:'Not available'}</div><div class="share-stat"><strong>Next predicted period</strong><br>${snapshot.summary.nextPeriod?formatDate(snapshot.summary.nextPeriod,{month:'long',day:'numeric',year:'numeric'}):'Not available'}</div><div class="share-stat"><strong>Period logs</strong><br>${snapshot.summary.periodCount}</div><h2>Recent symptom notes</h2>${snapshot.summary.recentSymptoms?.length?snapshot.summary.recentSymptoms.map(s=>`<div class="share-stat">${formatDate(s.date,{month:'long',day:'numeric'})}: ${escapeHTML(s.symptoms.join(', '))}</div>`).join(''):'<p class="subtle">No symptom notes shared.</p>'}`;
  el('shareView').hidden=false;el('appShell').inert=true;el('shareView').dataset.snapshotMode='true';
}
function loadShareFromURL() { const id=new URLSearchParams(location.search).get('share');if(id&&shares[id]&&Date.parse(shares[id].expiresAt)>Date.now())renderShare(shares[id]);else if(id)toast('This snapshot has expired or is unavailable in this browser.'); }

// -- Events and initialization ----------------------------------------------
function bindTabs() { document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(t=>{const active=t===tab;t.classList.toggle('active',active);t.setAttribute('aria-selected',String(active));});document.querySelectorAll('.tab-pane').forEach(p=>p.hidden=p.id!==tab.getAttribute('aria-controls'));})); }
function bindForms() {
  el('onboardingForm').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget),avgCycle=Number(data.get('avgCycle'));user={name:String(data.get('name')).trim(),avgCycle,cycleLength:avgCycle};save(KEYS.user,user);closeDialog('onboardingDialog');render();checkIn();});
  el('cycleForm').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget), id=data.get('id');const startDate=String(data.get('startDate')),endDate=String(data.get('endDate')||'');if(endDate&&endDate<startDate){toast('End date must be on or after the first day');return;}const item={id:id||makeId(),startDate,endDate,notes:String(data.get('notes')).trim(),intensity:String(data.get('intensity'))};cycles=id?cycles.map(c=>c.id===id?item:c):[...cycles,item];cycles.sort((a,b)=>a.startDate.localeCompare(b.startDate));save(KEYS.cycles,cycles);closeDialog('cycleDialog');render();checkIn();toast(id?'Period updated':'Period saved');});
  el('dietForm').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;addNote('diet',form.elements.text.value,form.elements.date.value,form.elements.id.value);resetDailyForm(form);checkIn();});
  el('exerciseForm').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;addNote('exercise',form.elements.text.value,form.elements.date.value,form.elements.id.value);resetDailyForm(form);checkIn();});
  el('foodSearch').addEventListener('input',()=>renderChoiceCatalog(FOOD_CATALOG,el('foodSearch').value,'foodCatalog','diet','foodCatalogStatus'));
  el('exerciseSearch').addEventListener('input',()=>renderChoiceCatalog(EXERCISE_CATALOG,el('exerciseSearch').value,'exerciseCatalog','exercise','exerciseCatalogStatus'));
  ['foodCatalog','exerciseCatalog'].forEach(id=>el(id).addEventListener('click',event=>{const button=event.target.closest('[data-catalog-item]');if(!button)return;addNote(button.dataset.catalogType,button.dataset.catalogItem);checkIn();}));
  el('symptomChips').querySelectorAll('.chip').forEach(chip=>chip.addEventListener('click',()=>{const key=chip.dataset.symptom;if(selectedSymptoms.has(key))selectedSymptoms.delete(key);else selectedSymptoms.add(key);chip.setAttribute('aria-pressed',String(selectedSymptoms.has(key)));}));
  el('symptomForm').addEventListener('submit',event=>{event.preventDefault();if(!selectedSymptoms.size){toast('Choose at least one symptom');return;}const form=event.currentTarget,id=form.elements.id.value,item={id:id||makeId(),symptoms:[...selectedSymptoms],severity:Number(el('severity').value),date:form.elements.date.value||today()};symptoms=id?symptoms.map(entry=>entry.id===id?item:entry):[...symptoms,item];save(KEYS.symptoms,symptoms);resetSymptomForm();render();checkIn();toast(id?'Symptoms updated':'Symptoms saved');});
  el('medForm').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget,id=form.elements.id.value,old=medication.find(m=>m.id===id);const item={id:id||makeId(),name:form.elements.name.value.trim(),dose:form.elements.dose.value.trim(),schedule:{type:form.elements.scheduleType.value,time:form.elements.time.value||'09:00',weekday:Number(form.elements.weekday.value)},log:old?.log||[]};medication=id?medication.map(m=>m.id===id?item:m):[...medication,item];save(KEYS.medication,medication);resetMedicationForm();renderMedication();checkIn();toast(id?'Medication updated':'Medication added');});
  el('settingsForm').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget),avgCycle=Number(data.get('avgCycle'));user={name:String(data.get('name')).trim(),avgCycle,cycleLength:avgCycle};settings.shareExpiryDays=Number(data.get('shareExpiry'));settings.periodReminders=el('periodRemindersToggle').checked;settings.periodReminderDays=Number(data.get('periodReminderDays'));settings.reminderLead=Number(data.get('reminderLead'));settings.quietStart=String(data.get('quietStart')||'');settings.quietEnd=String(data.get('quietEnd')||'');settings.largeText=el('largeTextToggle').checked;settings.highContrast=el('highContrastToggle').checked;settings.emailTipsOptIn=data.has('emailTipsOptIn');settings.featureFlags={wearables:el('flagWearables').checked,help:el('flagHelp').checked};save(KEYS.user,user);save(KEYS.settings,settings);closeDialog('settingsDialog');render();toast('Settings saved');});
  el('assistantForm').addEventListener('submit',event=>{event.preventDefault();const query=el('assistantInput').value.toLowerCase();el('assistantReply').textContent=/late|period|why/.test(query)?'Common reasons for a late period include normal cycle variation, stress, illness, travel, changes in sleep or activity, and pregnancy. Consider a clinician if you are concerned.':'I can offer general reflection prompts. Cycle patterns vary; for symptoms or care decisions, speak with a clinician.';event.currentTarget.reset();});
  el('feedbackForm').addEventListener('submit',event=>{event.preventDefault();feedback.push({id:makeId(),message:event.currentTarget.elements.message.value.trim(),createdAt:new Date().toISOString()});save(KEYS.feedback,feedback);event.currentTarget.reset();toast('Feedback saved on this device');});
}
function addNote(type,text,date=today(),id='') { const value=String(text).trim();if(!value)return;const list=type==='diet'?diet:exercise,old=list.find(item=>item.id===id),item={id:id||makeId(),text:value,date:date||today()};if(type==='diet')diet=id?diet.map(entry=>entry.id===id?item:entry):[...diet,item];else exercise=id?exercise.map(entry=>entry.id===id?item:entry):[...exercise,item];save(KEYS[type],type==='diet'?diet:exercise);render();toast(old?'Entry updated':'Note saved'); }
function resetDailyForm(form) { form.reset();form.elements.id.value='';form.elements.date.value=today();form.querySelector('[type=submit]').textContent='Add'; }
function resetSymptomForm() { const form=el('symptomForm');form.reset();form.elements.id.value='';form.elements.date.value=today();el('severity').value='2';form.querySelector('[type=submit]').textContent='Save symptoms';selectedSymptoms.clear();el('symptomChips').querySelectorAll('.chip').forEach(chip=>chip.setAttribute('aria-pressed','false')); }
function openPrintReport() {
  const p=prediction(), report=window.open('','_blank');
  if(!report){toast('Allow pop-ups to open the clinician report');return;}
  const cycleRows=sortedCycles().map(c=>`<tr><td>${formatDate(c.startDate,{month:'long',day:'numeric',year:'numeric'})}</td><td>${c.endDate?formatDate(c.endDate,{month:'long',day:'numeric',year:'numeric'}):'Ongoing'}</td><td>${escapeHTML(c.intensity||'medium')}</td><td>${escapeHTML(c.notes||'')}</td></tr>`).join('');
  const symptomRows=symptoms.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(s=>`<tr><td>${formatDate(s.date,{month:'long',day:'numeric',year:'numeric'})}</td><td>${escapeHTML(s.symptoms.join(', '))}</td><td>${['','Mild','Moderate','Strong'][s.severity]||''}</td></tr>`).join('');
  const medicationRows=medication.map(m=>`<tr><td>${escapeHTML(m.name)}</td><td>${escapeHTML(m.dose||'')}</td><td>${escapeHTML(m.schedule?.type||'daily')} at ${escapeHTML(m.schedule?.time||'09:00')}</td><td>${medicationStatus(m)}</td></tr>`).join('');
  report.document.write(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Cycle Notes — Clinician report</title><style>body{font:16px/1.5 system-ui,sans-serif;color:#202B33;max-width:850px;margin:40px auto;padding:0 20px}h1,h2{color:#155E63}table{width:100%;border-collapse:collapse;margin:18px 0 30px}th,td{text-align:left;padding:9px;border-bottom:1px solid #D9E0E4;font-size:14px}button{padding:10px 16px;background:#155E63;color:white;border:0;border-radius:8px}@media print{button{display:none}body{margin:0 auto}}</style><body><h1>Cycle Notes</h1><p>Private cycle summary for ${escapeHTML(user?.name||'the user')} · Generated ${formatDate(today(),{month:'long',day:'numeric',year:'numeric'})}</p><p>Estimates are informational and are not a diagnosis.</p><h2>Overview</h2><p>Profile average: ${user?.avgCycle||user?.cycleLength||'—'} days · Recorded periods: ${cycles.length} · Simple mean: ${p.mean?`${p.mean.toFixed(1)} days`:'Not enough data'} · Weighted estimate: ${p.weighted?`${p.weighted.toFixed(1)} days`:'Not enough data'} · Next estimate: ${p.expected?formatDate(p.expected,{month:'long',day:'numeric',year:'numeric'}):'Not available'}</p><h2>Period history</h2><table><thead><tr><th>Start</th><th>End</th><th>Flow</th><th>Notes</th></tr></thead><tbody>${cycleRows||'<tr><td colspan="4">No period logs</td></tr>'}</tbody></table><h2>Recent symptom notes</h2><table><thead><tr><th>Date</th><th>Symptoms</th><th>Severity</th></tr></thead><tbody>${symptomRows||'<tr><td colspan="3">No symptom notes</td></tr>'}</tbody></table><h2>Medication</h2><table><thead><tr><th>Name</th><th>Dose</th><th>Schedule</th><th>Today</th></tr></thead><tbody>${medicationRows||'<tr><td colspan="4">No medication entries</td></tr>'}</tbody></table><button onclick="window.print()">Print this report</button></body></html>`);
  report.document.close();
}
function bindButtons() {
  el('startToday').addEventListener('click',()=>{const existing=cycles.find(c=>c.startDate===today());if(existing){toast('A period already starts today');return;}cycles.push({id:makeId(),startDate:today(),endDate:'',notes:'',intensity:'medium'});save(KEYS.cycles,cycles);render();toast('Period started today');});
  el('endToday').addEventListener('click',()=>{const active=cycles.filter(c=>!c.endDate).sort((a,b)=>b.startDate.localeCompare(a.startDate))[0];if(!active){toast('No ongoing period to end');return;}if(today()<active.startDate){toast('End date cannot be before start date');return;}active.endDate=today();save(KEYS.cycles,cycles);render();toast('Period ended today');});
  el('addCycleButton').addEventListener('click',()=>openCycleForm());el('prevMonth').addEventListener('click',()=>{visibleMonth=new Date(visibleMonth.getFullYear(),visibleMonth.getMonth()-1,1);renderCalendar();});el('nextMonth').addEventListener('click',()=>{visibleMonth=new Date(visibleMonth.getFullYear(),visibleMonth.getMonth()+1,1);renderCalendar();});el('todayMonth').addEventListener('click',()=>{visibleMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendar();});
  el('settingsButton').addEventListener('click',()=>{el('settingsName').value=user?.name||'';el('settingsLength').value=user?.avgCycle||user?.cycleLength||28;el('shareExpiry').value=String(settings.shareExpiryDays||7);el('periodRemindersToggle').checked=settings.periodReminders!==false;el('periodReminderDays').value=String(settings.periodReminderDays||2);el('reminderLead').value=String(settings.reminderLead??30);el('quietStart').value=settings.quietStart||'';el('quietEnd').value=settings.quietEnd||'';el('largeTextToggle').checked=Boolean(settings.largeText);el('highContrastToggle').checked=Boolean(settings.highContrast);el('emailTipsToggle').checked=Boolean(settings.emailTipsOptIn);el('flagWearables').checked=Boolean(settings.featureFlags.wearables);el('flagHelp').checked=Boolean(settings.featureFlags.help);showDialog('settingsDialog');});el('profileButton').addEventListener('click',()=>el('settingsButton').click());
  el('clearDataButton').addEventListener('click',()=>{closeDialog('settingsDialog');showDialog('clearDataDialog');});
  el('confirmClearData').addEventListener('click',clearAllData);
  el('discreetToggle').addEventListener('click',()=>{settings.discreet=!settings.discreet;save(KEYS.settings,settings);renderHeader();});
  el('quickHideButton').addEventListener('click',()=>{quickHidden=!quickHidden;if(quickHidden){settings.discreet=true;save(KEYS.settings,settings);}renderHeader();toast(quickHidden?'Sensitive panels hidden':'Panels visible');});
  el('partnerThemeToggle').addEventListener('click',()=>{settings.partnerTheme=!settings.partnerTheme;save(KEYS.settings,settings);renderHeader();});el('medCancel').addEventListener('click',resetMedicationForm);
  el('darkModeToggle').addEventListener('click',()=>{settings.darkMode=!settings.darkMode;save(KEYS.settings,settings);renderHeader();toast(settings.darkMode?'Dark mode on':'Dark mode off');});
  el('exportButton').addEventListener('click',exportData);el('icsButton').addEventListener('click',exportCalendar);el('csvButton').addEventListener('click',exportSymptomCSV);el('shareButton').addEventListener('click',createShare);el('printButton').addEventListener('click',openPrintReport);
  el('trashButton').addEventListener('click',()=>{renderTrash();showDialog('trashDialog');});el('partnerButton').addEventListener('click',createPartnerShare);el('wearableButton').addEventListener('click',simulateWearableData);el('anomalyReport').addEventListener('click',openPrintReport);el('telehealthButton').addEventListener('click',()=>showDialog('telehealthDialog'));
  el('googleFitToggle').addEventListener('change',event=>toast(event.target.checked?'Google Fit preview enabled':'Google Fit preview disabled'));el('appleHealthToggle').addEventListener('change',event=>toast(event.target.checked?'Apple Health preview enabled':'Apple Health preview disabled'));
  el('lateBanner').querySelector('.banner-close').addEventListener('click',()=>{el('lateBanner').hidden=true;});el('closeShare').addEventListener('click',()=>{el('shareView').hidden=true;el('appShell').inert=false;const url=new URL(location.href);url.searchParams.delete('share');history.replaceState({},'',url);});
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeDialog(button.dataset.close)));
}
function simulateWearableData() {
  const days=Array.from({length:30},(_,index)=>{const date=addDays(today(),index-29),pattern=index%7<2;return {date,steps:3000+Math.floor(Math.random()*8000),sleepHours:pattern?5+Math.random():6.5+Math.random()*2.5,hrv:pattern?32+Math.floor(Math.random()*8):42+Math.floor(Math.random()*25),cramps:pattern?2+Math.floor(Math.random()*2):Math.floor(Math.random()*2)};});
  analytics={simulatedAt:new Date().toISOString(),days};save(KEYS.analytics,analytics);renderAnalytics();toast('30 days of sample data saved');
}
function checkMedicationReminders() {
  const scheduled=medication.filter(item=>scheduledToday(item));
  const pending=scheduled.filter(item=>!(item.log||[]).some(entry=>entry.date===today()));
  const now=new Date(),nowAt=now.getHours()*60+now.getMinutes(),lead=Number(settings.reminderLead??30);
  const notify=pending.filter(item=>{const [hour,minute]=(item.schedule?.time||'09:00').split(':').map(Number);return nowAt>=hour*60+minute-lead;});
  if(notify.length&&!isQuietHours(now,settings.quietStart,settings.quietEnd))return `Medication reminder: ${notify.map(item=>item.name).join(', ')}`;
  return '';
}
function checkPeriodReminder() {
  if(settings.periodReminders===false||settings.lastPeriodReminderDate===today())return '';
  const expected=prediction().expected;if(!expected||isQuietHours(new Date(),settings.quietStart,settings.quietEnd))return '';
  const remaining=dayDiff(today(),expected),windowDays=Number(settings.periodReminderDays||2);
  if(remaining<0||remaining>windowDays)return '';
  settings.lastPeriodReminderDate=today();save(KEYS.settings,settings);
  return remaining===0?'Period estimate is today.':`Period estimate in ${remaining} day${remaining===1?'':'s'}.`;
}
function isQuietHours(date,start,end) {
  if(!start||!end||start===end)return false;
  const time=`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  return start<end ? time>=start&&time<end : time>=start||time<end;
}
function scheduledTip() {
  // Tips are only an in-app weekly simulation; no email is sent.
  if(settings.emailTipsOptIn&&new Date().getDay()===1&&settings.lastTipDate!==today()){settings.lastTipDate=today();save(KEYS.settings,settings);}
}
async function clearAllData() {
  Object.values(KEYS).forEach(key=>localStorage.removeItem(key));
  user=null;cycles=[];diet=[];exercise=[];symptoms=[];medication=[];trash=[];shares={};analytics=null;feedback=[];quickHidden=false;
  settings={discreet:false,partnerTheme:false,darkMode:false,largeText:false,highContrast:false,periodReminders:true,periodReminderDays:2,emailTipsOptIn:false,shareExpiryDays:7,reminderLead:30,quietStart:'',quietEnd:'',featureFlags:{wearables:true,help:true}};
  localStorage.removeItem('pt_sync_modified');markLocalDirty();selectedSymptoms.clear();closeDialog('clearDataDialog');const url=new URL(location.href);url.searchParams.delete('share');history.replaceState({},'',url);el('shareView').hidden=true;el('appShell').inert=false;render();showDialog('onboardingDialog');
  if(backendReady){const synced=await syncBackend();toast(synced?'Saved data cleared from this device and local server':'Browser data cleared; local server could not be reached');}else toast('Saved data cleared from this browser');
}
function initializeEntryDates() {
  ['dietForm','exerciseForm','symptomForm'].forEach(id=>{const form=el(id);form.elements.date.value=today();});
}
async function init() {
  await bootstrapBackend();
  purgeTrash();purgeExpiredShares();bindTabs();bindForms();bindButtons();initializeEntryDates();render();loadShareFromURL();scheduledTip();
  const reminderMessages=[checkMedicationReminders(),checkPeriodReminder()].filter(Boolean);if(reminderMessages.length)toast(reminderMessages.join(' · '));
  if(!user)showDialog('onboardingDialog');
  // TODO server: POST /api/assistant {question,cycleContext} returns moderated guidance; current chat replies are canned.
  // TODO server: GET /api/clinicians?region=... returns verified telehealth contacts; current contact is sample text.
  // TODO server: POST /api/integrations/{google-fit|apple-health}/connect starts OAuth; GET /api/wearables/days returns consented device data.
}
document.addEventListener('DOMContentLoaded',init);

