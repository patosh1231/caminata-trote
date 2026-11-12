(() => {
'use strict';

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'caminata-trote-v1';
const ACTIVE = 'caminata-trote-activa';
const DEFAULTS = {
  weight: 70, dayGoal: 1, weekGoal: 10, sessions: [], rewards: [],
  reminderOn: true, reminderTime: '19:00', lastReminder: '',
  plan: { week: 1, doneInWeek: 0, completed: false, guided: true }
};

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn(e); }
}
function persist() { save(KEY, data); }

let data = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), load(KEY, {}));
data.plan = Object.assign({ week: 1, doneInWeek: 0, completed: false, guided: true }, data.plan || {});

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return [h, m, x].map(n => String(n).padStart(2, '0')).join(':');
}
function fmtHM(s) {
  const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
function fmtSecs(s) { return s >= 60 ? `${+(s / 60).toFixed(1)} min` : `${s} s`; }
function paceStr(minPerKm) {
  if (!isFinite(minPerKm) || minPerKm > 60) return '--:--';
  let m = Math.floor(minPerKm), s = Math.round((minPerKm - m) * 60);
  if (s === 60) { m++; s = 0; }
  return m + ':' + String(s).padStart(2, '0');
}
function distM(a, b) { // Haversine, metros; a y b = [lat, lng]
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dayOfYear() { const n = new Date(); return Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 864e5); }

// MET (Compendium de actividades físicas) según velocidad km/h
function metFor(kmh) {
  if (kmh == null) return 3.5;      // sin GPS: supone caminata normal
  if (kmh < 1) return 1.5;          // detenido
  if (kmh < 4) return 2.8;
  if (kmh < 5.5) return 3.5;
  if (kmh < 6.5) return 4.3;        // caminata rápida
  if (kmh < 7.5) return 5.0;
  if (kmh < 8.5) return 7.0;        // trote
  if (kmh < 9.5) return 8.3;
  if (kmh < 10.5) return 9.8;
  return 11.0;
}
function modeName(kmh) {
  if (kmh == null || kmh < 1) return 'Detenido';
  if (kmh < 6.5) return '🚶 Caminando';
  if (kmh < 8.5) return '🏃 Trotando';
  return '⚡ Corriendo';
}
function dayKey(d) {
  const x = new Date(d);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}
function weekStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lunes
  return d;
}
function kmSince(date) {
  return data.sessions.filter(s => new Date(s.start) >= date).reduce((a, s) => a + s.meters, 0) / 1000;
}
function kmToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return kmSince(d); }
function streak() {
  const days = new Set(data.sessions.map(s => dayKey(s.start)));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // hoy aún no: la racha sigue si ayer sí
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function daysSinceLast() {
  if (!data.sessions.length) return Infinity;
  const last = Math.max(...data.sessions.map(s => new Date(s.start).getTime()));
  return Math.floor((Date.now() - last) / 864e5);
}
function totals() {
  const ss = data.sessions;
  return {
    sessions: ss.length,
    km: ss.reduce((a, s) => a + s.meters, 0) / 1000,
    kcal: ss.reduce((a, s) => a + s.kcal, 0),
    secs: ss.reduce((a, s) => a + s.secs, 0),
    maxSecs: ss.reduce((a, s) => Math.max(a, s.secs), 0),
    guided: ss.filter(s => s.guided).length,
    planDone: !!data.plan.completed,
    streak: streak()
  };
}
const BADGES = [
  { ico: '👟', name: 'Primer paso',          ok: t => t.sessions >= 1 },
  { ico: '🌱', name: 'Primer día del plan',  ok: t => t.guided >= 1 },
  { ico: '🥾', name: '5 km en total',        ok: t => t.km >= 5 },
  { ico: '🏅', name: '10 km en total',       ok: t => t.km >= 10 },
  { ico: '⏱️', name: '1 hora seguida',       ok: t => t.maxSecs >= 3600 },
  { ico: '🔥', name: '1.000 kcal',           ok: t => t.kcal >= 1000 },
  { ico: '📆', name: 'Racha de 3 días',      ok: t => t.streak >= 3 },
  { ico: '🗓️', name: 'Racha de 7 días',      ok: t => t.streak >= 7 },
  { ico: '🎓', name: 'Plan de 8 semanas',    ok: t => t.planDone },
  { ico: '🥇', name: '42 km acumulados',     ok: t => t.km >= 42 },
];

// ---------- Plan para principiantes (8 semanas, estilo "de caminar a trotar") ----------
// run/walk en segundos; reps = cuántas veces trotar. Orientativo, no reemplaza a un profesional de salud.
const PLAN = [
  { run: 60,   walk: 90,  reps: 8 },   // Semana 1
  { run: 90,   walk: 120, reps: 6 },
  { run: 120,  walk: 90,  reps: 6 },
  { run: 180,  walk: 90,  reps: 5 },
  { run: 240,  walk: 120, reps: 4 },
  { run: 300,  walk: 150, reps: 3 },
  { run: 480,  walk: 240, reps: 2 },
  { run: 1200, walk: 0,   reps: 1 },   // Semana 8: 20 min de trote seguido
];
const WARM = 300, COOL = 300;
function planPhases(week) {
  const w = PLAN[week - 1];
  const ph = [{ type: 'walk', secs: WARM }];
  for (let i = 0; i < w.reps; i++) {
    ph.push({ type: 'run', secs: w.run });
    if (w.walk && i < w.reps - 1) ph.push({ type: 'walk', secs: w.walk });
  }
  ph.push({ type: 'walk', secs: COOL });
  return ph;
}
function describePlan(w) {
  return `Calienta ${fmtSecs(WARM)} caminando, luego ${w.reps} × (${fmtSecs(w.run)} trote` +
         (w.walk ? ` + ${fmtSecs(w.walk)} caminata` : '') + `) y enfría ${fmtSecs(COOL)} caminando.`;
}
function advancePlan() {
  const p = data.plan;
  p.doneInWeek++;
  if (p.doneInWeek >= 3) {
    p.doneInWeek = 0;
    if (p.week >= 8) p.completed = true; else p.week++;
  }
}

// ---------- Mensajes motivacionales ----------
const MOTIVOS = [
  '🌱 No tienes que correr rápido, solo tienes que empezar.',
  '👟 Diez minutos de caminata también cuentan. ¿Salimos?',
  '💚 Tu yo de mañana te va a agradecer este paso.',
  '☀️ Aire fresco, buen ánimo y un poco de movimiento: ¡vamos!',
  '🏃 Hoy no tiene que ser perfecto, solo tiene que ser hoy.',
  '🔥 Cada sesión suma: sin prisa, pero sin pausa.',
  '🎯 Tu meta de hoy está a un paso. Literal.',
  '🙌 Lo más difícil es empezar. Hazlo con 5 minutos.',
  '🎁 Tu próximo premio está más cerca de lo que crees.',
  '🌳 Sal, respira y muévete. Tu cuerpo lo necesita.',
  '💪 Los que lo logran no son los más rápidos, son los constantes.',
  '🐢 Lento también es avanzar. ¡Vamos!',
];
const MSG_DONE = [
  '🙌 ¡Lo lograste! Tu cuerpo te lo agradece.',
  '🎉 Otra sesión en el bolsillo. ¡Eres constante!',
  '💚 Hoy elegiste moverte. Eso ya es ganar.',
  '🌟 ¡Bien hecho! Descansa, te lo mereces.',
];
function motivationFor() {
  if (!data.sessions.length) return '🌱 Tu primera caminata te está esperando. ¡Solo 10 minutos cuentan!';
  const days = daysSinceLast();
  if (days >= 2) return `💚 Hace ${days} días que no sales. Volver es lo más valioso: ¡vamos!`;
  const st = streak();
  if (st >= 2) return `🔥 Llevas ${st} días seguidos. ¡No la dejes caer hoy!`;
  return MOTIVOS[dayOfYear() % MOTIVOS.length];
}

// ---------- Notificaciones y recordatorios ----------
function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, icon: 'icon.svg', tag };
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(title, opts))
        .catch(() => new Notification(title, opts));
    } else {
      new Notification(title, opts);
    }
  } catch (e) { /* algunos navegadores bloquean notificaciones fuera de la app */ }
}
function checkReminders() {
  if (!data.reminderOn || S.status === 'run') return;   // si ya estás entrenando, no molestar
  const now = new Date(), today = dayKey(now);
  const [hh, mm] = (data.reminderTime || '19:00').split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return;
  if (data.lastReminder === today) return;              // ya avisamos hoy
  if (kmToday() >= data.dayGoal) return;                // meta cumplida: no hay nada que recordar
  const body = motivationFor();
  data.lastReminder = today;
  persist();
  if (document.hidden) notify('Caminata y Trote 🏃', body, 'daily');
  else toast(body);
}

// ---------- Sonido y vibración ----------
let audioCtx = null;
function beep(n = 1) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < n; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; g.gain.value = 0.2;
      o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.4;
      o.start(t); o.stop(t + 0.25);
    }
  } catch (e) {}
}
function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
function say(text) {
  try {
    if (data.voice === false || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es'; u.rate = 1;
    speechSynthesis.speak(u);
  } catch (e) {}
}

// ---------- Estado de la sesión ----------
const S = {
  status: 'idle',        // idle | run | pause
  sid: null, startISO: null,
  acc: 0,                // ms "corriendo" acumulados antes de la última pausa
  segStart: 0, lastTick: 0, lastSave: 0,
  meters: 0, kcal: 0, kmh: null, lastMoveAt: 0,
  lastKmMark: 0,
  route: [],             // [[lat, lng], ...]
  last: null,            // último punto aceptado {lat, lng, t}
  wake: null,
  guide: null            // plan guiado: {phases, idx, end, remain, done}
};
const elapsed = () => S.acc + (S.status === 'run' ? Date.now() - S.segStart : 0);

// ---------- Mapa ----------
const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);
const line = L.polyline(S.route, { color: '#16a34a', weight: 6 }).addTo(map);
const histLine = L.polyline([], { color: '#f59e0b', weight: 6 }).addTo(map);
let myMarker = null;

// ---------- GPS ----------
let watchId = null;
function setGps(t) { $('#gps').textContent = t; }
function startGPS() {
  if (!('geolocation' in navigator)) { setGps('Este teléfono/navegador no tiene GPS.'); return; }
  if (watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(onPos, onErr, {
    enableHighAccuracy: true, maximumAge: 2000, timeout: 20000
  });
}
function onErr(e) {
  setGps(e.code === 1 ? 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.'
                      : 'Buscando señal GPS…');
}
function onPos(p) {
  const { latitude: lat, longitude: lng, accuracy: acc } = p.coords;
  const here = [lat, lng];
  setGps(`GPS ±${Math.round(acc)} m`);
  if (!myMarker) {
    myMarker = L.circleMarker(here, { radius: 8, color: '#fff', weight: 3, fillColor: '#0ea5e9', fillOpacity: 1 }).addTo(map);
    map.setView(here, 16);
  } else {
    myMarker.setLatLng(here);
  }
  if (S.status !== 'run') return;
  if (acc > 40) return;                       // señal muy mala: ignorar

  if (!S.last) { addPoint(lat, lng, p.timestamp); return; }

  const d = distM([S.last.lat, S.last.lng], here);
  if (d < Math.max(6, acc / 2)) return;       // ruido GPS
  if (d > 200) { S.last = { lat, lng, t: p.timestamp }; return; } // salto grande (p. ej. tras dormir)

  const dt = Math.max(1, (p.timestamp - S.last.t) / 1000);
  const inst = d / dt * 3.6;
  S.kmh = S.kmh == null ? inst : 0.6 * S.kmh + 0.4 * inst;
  S.meters += d;
  S.lastMoveAt = Date.now();
  addPoint(lat, lng, p.timestamp);
  checkKm();
}
function addPoint(lat, lng, t) {
  S.last = { lat, lng, t };
  S.route.push([lat, lng]);
  line.addLatLng([lat, lng]);
  map.panTo([lat, lng], { animate: true });
}
function checkKm() {
  const km = Math.floor(S.meters / 1000);
  if (km > S.lastKmMark) {
    S.lastKmMark = km;
    toast(`🎉 ¡${km} km! Vas muy bien`);
    say(`${km} kilómetro${km > 1 ? 's' : ''}. Vas muy bien`);
    vibrate([200, 100, 200]);
  }
}

// ---------- Reloj, calorías y plan guiado ----------
function announce(ph) {
  toast(`${ph.type === 'run' ? '🏃 ¡Trota!' : '🚶 Camina suave'} · ${fmtSecs(ph.secs)}`);
  vibrate(ph.type === 'run' ? [300, 150, 300] : [200]);
  beep(ph.type === 'run' ? 2 : 1);
  say(ph.type === 'run' ? `Trota ahora, ${fmtSecs(ph.secs)}` : `Camina suave, ${fmtSecs(ph.secs)}`);
}
function advanceGuide(now) {
  const g = S.guide;
  g.idx++;
  if (g.idx >= g.phases.length) {
    g.done = true;
    toast('✅ ¡Plan de hoy completo! Pulsa ■ Terminar para guardarlo.');
    vibrate([300, 150, 300, 150, 300]);
    beep(3);
    say('Plan de hoy completo. ¡Muy bien! Pulsa terminar para guardar.');
    return;
  }
  g.end = now + g.phases[g.idx].secs * 1000;
  announce(g.phases[g.idx]);
}
function tick() {
  const now = Date.now();
  if (S.status === 'run') {
    const dt = (now - S.lastTick) / 1000;
    if (S.kmh != null && now - S.lastMoveAt > 12000) S.kmh = 0; // sin avance: detenido
    S.kcal += metFor(S.kmh) * data.weight * dt / 3600;
    if (S.guide && !S.guide.done && now >= S.guide.end) advanceGuide(now);
    if (now - S.lastSave > 5000) saveActive();
  }
  S.lastTick = now;
  renderLive();
}
setInterval(tick, 500);
setInterval(checkReminders, 60000);

// ---------- Control de sesión ----------
function makeGuide(week) {
  return { phases: planPhases(week), idx: 0, end: 0, remain: null, done: false };
}
function start() {
  if (S.status !== 'idle') return;
  Object.assign(S, {
    sid: Date.now(), startISO: new Date().toISOString(), acc: 0, meters: 0, kcal: 0,
    kmh: null, lastMoveAt: 0, lastKmMark: 0, route: [], last: null
  });
  line.setLatLngs([]);
  histLine.setLatLngs([]);
  S.status = 'run';
  S.segStart = S.lastTick = Date.now();
  S.guide = data.plan.guided && !data.plan.completed ? makeGuide(data.plan.week) : null;
  if (S.guide) { S.guide.end = Date.now() + S.guide.phases[0].secs * 1000; announce(S.guide.phases[0]); }
  else toast(pick(['¡A moverse, a tu ritmo! 💪', '¡Vamos! Cada paso cuenta 🌱']));
  startGPS(); requestWake(); setButtons(); renderLive(); saveActive(); renderPlan();
}
function resume() {
  if (S.status !== 'pause') return;
  S.status = 'run';
  S.segStart = S.lastTick = Date.now();
  S.last = null;
  if (S.guide && !S.guide.done && S.guide.remain != null) { S.guide.end = Date.now() + S.guide.remain; S.guide.remain = null; }
  startGPS(); requestWake(); setButtons(); saveActive();
}
function pause() {
  if (S.status !== 'run') return;
  S.acc += Date.now() - S.segStart;
  S.status = 'pause';
  S.last = null;
  S.kmh = null;
  if (S.guide && !S.guide.done) S.guide.remain = Math.max(0, S.guide.end - Date.now());
  releaseWake(); setButtons(); renderLive(); saveActive();
  toast('Pausado. Puedes seguir cuando quieras 🙂');
}
function stop() {
  if (S.status === 'idle') return;
  if (!confirm('¿Terminar y guardar la sesión?')) return;
  if (S.status === 'run') pause();
  releaseWake();

  const secs = Math.round(S.acc / 1000);
  const guideDone = !!(S.guide && S.guide.done);
  const before = totals();
  const prevWeek = data.plan.week;
  let msg;
  if (secs >= 15) {
    data.sessions.push({
      id: S.sid, start: S.startISO, secs,
      meters: Math.round(S.meters), kcal: Math.round(S.kcal), guided: guideDone,
      incomplete: !!(S.guide && !guideDone),
      route: S.route.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)])
    });
    if (guideDone) advancePlan();
    persist();
    msg = `${pick(MSG_DONE)}\n${(S.meters / 1000).toFixed(2)} km · ${fmtTime(secs)} · ${Math.round(S.kcal)} kcal`;
    if (S.guide && !guideDone) msg += '\n(El plan cuenta cuando completas todas sus fases)';
    if (guideDone && data.plan.week !== prevWeek) msg += `\n🎉 ¡Semana ${data.plan.week} desbloqueada!`;
    if (guideDone && data.plan.completed) msg += '\n🎓 ¡Completaste el plan de 8 semanas!';
  } else {
    msg = 'Sesión muy corta: no se guardó';
  }

  const after = totals();
  const nb = BADGES.filter(b => b.ok(after) && !b.ok(before)).map(b => `\n🏅 Insignia nueva: ${b.name}`);
  const nr = data.rewards.filter(r => after.km >= r.km && before.km < r.km)
                         .map(r => `\n🎁 ¡Premio listo: ${r.name}!`);
  clearActive();
  Object.assign(S, { status: 'idle', acc: 0, meters: 0, kcal: 0, kmh: null, route: [], last: null, lastKmMark: 0, guide: null });
  line.setLatLngs([]);
  setButtons(); renderAll();
  toast(msg + nb.join('') + nr.join(''));
  vibrate([150, 80, 150]);
}

// ---------- Pantalla encendida / persistencia ----------
async function requestWake() {
  try { if ('wakeLock' in navigator && S.status === 'run') S.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
}
function releaseWake() {
  try { if (S.wake) S.wake.release(); } catch (e) {}
  S.wake = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (S.status === 'run') requestWake();
  checkReminders();
});
function saveActive() {
  S.lastSave = Date.now();
  if (S.status === 'idle') return;
  const g = S.guide;
  save(ACTIVE, {
    sid: S.sid, startISO: S.startISO,
    acc: elapsed(), meters: S.meters, kcal: S.kcal, route: S.route,
    guide: g ? {
      week: data.plan.week, idx: g.idx, done: g.done,
      remain: g.done ? 0 : (S.status === 'run' ? Math.max(0, g.end - Date.now()) : (g.remain || 0))
    } : null
  });
}
function clearActive() { try { localStorage.removeItem(ACTIVE); } catch (e) {} }

// ---------- Render ----------
function renderLive() {
  const e = elapsed() / 1000;
  const kmh = S.status === 'run' && S.kmh != null ? S.kmh : 0;
  $('#clock').textContent = fmtTime(e);
  $('#dist').textContent = (S.meters / 1000).toFixed(2);
  $('#kmh').textContent = kmh.toFixed(1);
  $('#pace').textContent = kmh >= 1 ? paceStr(60 / kmh) : '--:--';
  $('#kcal').textContent = Math.round(S.kcal);

  let txt;
  if (S.status === 'idle') txt = 'Listo para salir';
  else if (S.status === 'pause') txt = 'En pausa';
  else if (S.guide && S.guide.done) txt = '🎉 Plan de hoy completo · ¡Termina y guarda!';
  else if (S.guide) {
    const ph = S.guide.phases[S.guide.idx];
    txt = `${ph.type === 'run' ? '🏃 Trota' : '🚶 Camina'} · faltan ${fmtTime((S.guide.end - Date.now()) / 1000)}`;
  } else txt = modeName(S.kmh);
  $('#mode').textContent = txt;
}
function setButtons() {
  const st = S.status;
  $('#bStart').disabled = st === 'run';
  $('#bStart').textContent = st === 'pause' ? '▶ Reanudar' : '▶ Iniciar';
  $('#bPause').disabled = st !== 'run';
  $('#bStop').disabled = st === 'idle';
  renderMode();
}
function renderMode() {
  const g = data.plan.guided;
  $('#mGuide').className = g ? 'go mini' : 'ghost mini';
  $('#mFree').className = g ? 'ghost mini' : 'go mini';
  $('#mGuide').disabled = $('#mFree').disabled = S.status !== 'idle';
}
function renderPlan() {
  const p = data.plan, w = PLAN[p.week - 1];
  $('#welcome').style.display = data.sessions.length ? 'none' : 'block';
  $('#planTitle').textContent = p.completed ? '🎓 ¡Plan completado!'
                              : `Semana ${p.week} de 8 · sesión ${p.doneInWeek + 1} de 3`;
  $('#planDesc').textContent = p.completed ? 'Ya puedes correr libre. ¡Gran trabajo!' : describePlan(w);
  $('#planBar').style.width = (p.completed ? 100 : ((p.week - 1 + p.doneInWeek / 3) / 8 * 100)) + '%';
  $('#planFases').innerHTML = planPhases(p.week)
    .map(x => `<li>${x.type === 'run' ? '🏃 Trota' : '🚶 Camina'} · ${fmtSecs(x.secs)}</li>`).join('');
  renderMode();
}
function renderMotivo() {
  const cumplida = kmToday() >= data.dayGoal;
  $('#motivo').textContent = cumplida ? '✅ ¡Meta de hoy cumplida! Lo que sigue es extra 🙌'
                                      : MOTIVOS[dayOfYear() % MOTIVOS.length];
}
function renderGoals() {
  const t = kmToday(), w = kmSince(weekStart());
  $('#hoyTxt').textContent = `${t.toFixed(2)} / ${data.dayGoal} km`;
  $('#hoyBar').style.width = Math.min(100, t / data.dayGoal * 100) + '%';
  $('#semTxt').textContent = `${w.toFixed(1)} / ${data.weekGoal} km`;
  $('#semBar').style.width = Math.min(100, w / data.weekGoal * 100) + '%';
}
function renderHist() {
  const t = totals();
  $('#tKm').textContent = (t.km).toFixed(1);
  $('#tSes').textContent = t.sessions;
  $('#tSesLbl').textContent = t.sessions === 1 ? 'sesión' : 'sesiones';
  $('#tKcal').textContent = Math.round(t.kcal).toLocaleString('es-CL');
  $('#tTime').textContent = fmtHM(t.secs);
  const list = $('#histList');
  if (!data.sessions.length) { list.innerHTML = '<p class="small">Aún no hay sesiones. ¡Sal a caminar!</p>'; return; }
  list.innerHTML = [...data.sessions].reverse().map(s => {
    const d = new Date(s.start), kmv = s.meters / 1000;
    const pace = kmv > 0 ? paceStr(s.secs / 60 / kmv) : '--:--';
    const when = d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' +
                 d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return `<div class="row click" data-id="${esc(s.id)}">
      <div><b>${esc(when)}${s.guided ? ' 🗓️' : ''}</b>
        <div class="small">${kmv.toFixed(2)} km · ${fmtTime(s.secs)} · ${pace} min/km · ${Math.round(s.kcal)} kcal</div>
        ${s.incomplete ? '<div class="small" style="color:var(--danger)">⚠️ Plan sin terminar: no cuenta para tu avance</div>' : ''}</div>
      <button class="ghost mini" data-del="${esc(s.id)}" aria-label="Borrar">🗑️</button>
    </div>`;
  }).join('');
}
function renderPrem() {
  const t = totals();
  $('#streak').textContent = `${t.streak} día${t.streak === 1 ? '' : 's'}`;
  $('#semTxt2').textContent = `${kmSince(weekStart()).toFixed(1)} de ${data.weekGoal} km`;
  $('#badges').innerHTML = BADGES.map(b =>
    `<div class="badge ${b.ok(t) ? 'on' : ''}"><div class="ico">${b.ico}</div><b>${esc(b.name)}</b></div>`).join('');
  const list = $('#rewardList');
  if (!data.rewards.length) { list.innerHTML = '<p class="small">Aún no tienes premios.</p>'; return; }
  list.innerHTML = data.rewards.map(r => {
    let action;
    if (r.claimedAt) action = '<span class="small">✅ canjeado</span>';
    else if (t.km >= r.km) action = `<button class="go mini" data-claim="${esc(r.id)}">Canjear</button>`;
    else action = `<span class="small">🔒 faltan ${(r.km - t.km).toFixed(1)} km</span>`;
    return `<div class="row">
      <div><b>${esc(r.name)}</b><div class="small">a los ${r.km} km acumulados</div></div>
      <div class="inline" style="align-items:center">${action}
        <button class="ghost mini" data-rdel="${esc(r.id)}" aria-label="Quitar">✕</button></div>
    </div>`;
  }).join('');
}
function renderNotifState() {
  let t;
  if (!('Notification' in window)) t = 'Tu navegador no admite notificaciones. En iPhone, agrega la app a la pantalla de inicio (iOS 16.4 o superior).';
  else if (Notification.permission === 'granted') t = '✅ Notificaciones activadas.';
  else if (Notification.permission === 'denied') t = '❌ Bloqueadas. Actívalas en la configuración del navegador.';
  else t = 'Aún no has permitido las notificaciones.';
  $('#sNotifTxt').textContent = t;
}
function loadSettings() {
  $('#sWeight').value = data.weight;
  $('#sDay').value = data.dayGoal;
  $('#sWeek').value = data.weekGoal;
  $('#sRemOn').checked = !!data.reminderOn;
  $('#sVoice').checked = data.voice !== false;
  $('#sRemTime').value = data.reminderTime || '19:00';
  renderNotifState();
}
function renderAll() { renderLive(); renderPlan(); renderMotivo(); renderGoals(); renderHist(); renderPrem(); renderNotifCard(); }

// ---------- Navegación y eventos ----------
function show(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === id));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === id));
  if (id === 'v-run') setTimeout(() => map.invalidateSize(), 60);
  if (id === 'v-hist') renderHist();
  if (id === 'v-prem') renderPrem();
  if (id === 'v-set') loadSettings();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.v));

$('#bStart').onclick = () => (S.status === 'pause' ? resume() : start());
$('#bPause').onclick = pause;
$('#bStop').onclick = stop;

function setMode(guided) {
  if (S.status !== 'idle') { toast('Termina la sesión actual para cambiar de modo'); return; }
  data.plan.guided = guided;
  persist(); renderPlan();
}
$('#mGuide').onclick = () => setMode(true);
$('#mFree').onclick = () => setMode(false);

$('#histList').onclick = e => {
  const del = e.target.closest('[data-del]');
  if (del) {
    if (!confirm('¿Borrar esta sesión?')) return;
    data.sessions = data.sessions.filter(s => String(s.id) !== del.dataset.del);
    persist(); renderAll(); return;
  }
  const row = e.target.closest('[data-id]');
  if (!row) return;
  const s = data.sessions.find(x => String(x.id) === row.dataset.id);
  if (!s || !s.route.length) { toast('Esta sesión no tiene ruta GPS'); return; }
  histLine.setLatLngs(s.route);
  show('v-run');
  setTimeout(() => { map.invalidateSize(); map.fitBounds(histLine.getBounds(), { padding: [20, 20] }); }, 80);
};

$('#rAdd').onclick = () => {
  const name = $('#rName').value.trim(), km = parseFloat($('#rKm').value);
  if (!name || !(km > 0)) { toast('Escribe el premio y los km'); return; }
  data.rewards.push({ id: Date.now(), name, km });
  persist();
  $('#rName').value = ''; $('#rKm').value = '';
  renderPrem();
};
$('#rewardList').onclick = e => {
  const c = e.target.closest('[data-claim]');
  if (c) {
    const r = data.rewards.find(x => String(x.id) === c.dataset.claim);
    if (r) { r.claimedAt = new Date().toISOString(); persist(); renderPrem(); toast('🎉 ¡Disfruta tu premio!'); }
    return;
  }
  const d = e.target.closest('[data-rdel]');
  if (d && confirm('¿Quitar este premio?')) {
    data.rewards = data.rewards.filter(x => String(x.id) !== d.dataset.rdel);
    persist(); renderPrem();
  }
};

$('#sSave').onclick = () => {
  const w = parseFloat($('#sWeight').value), dg = parseFloat($('#sDay').value), wg = parseFloat($('#sWeek').value);
  if (!(w >= 30 && w <= 250) || !(dg > 0) || !(wg > 0)) { toast('Revisa los valores'); return; }
  Object.assign(data, {
    weight: w, dayGoal: dg, weekGoal: wg,
    reminderOn: $('#sRemOn').checked, reminderTime: $('#sRemTime').value || '19:00',
    voice: $('#sVoice').checked
  });
  persist(); renderAll(); toast('Guardado ✔');
};
async function requestNotif() {
  if (!('Notification' in window)) { renderNotifState(); return; }
  const r = await Notification.requestPermission();
  renderNotifState(); renderNotifCard();
  if (r === 'granted') {
    notify('¡Listo! 🎉', 'Te avisaremos si hoy aún no has salido a moverte.', 'test');
    toast('🔔 Recordatorios activados');
  }
}
$('#sNotif').onclick = requestNotif;
$('#notifBtn').onclick = requestNotif;
function renderNotifCard() {
  const pedir = 'Notification' in window && Notification.permission === 'default';
  $('#notifCard').style.display = pedir ? 'block' : 'none';
}
$('#sReset').onclick = () => {
  if (!confirm('¿Borrar TODAS las sesiones, premios y progreso del plan? No se puede deshacer.')) return;
  data = JSON.parse(JSON.stringify(DEFAULTS));
  persist(); clearActive();
  renderAll(); loadSettings(); toast('Datos borrados');
};

// ---------- Copia de seguridad ----------
$('#bExport').onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `caminata-respaldo-${dayKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Respaldo descargado. Guárdalo en un lugar seguro.');
};
$('#bImport').onclick = () => $('#fImport').click();
$('#fImport').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (S.status !== 'idle') { toast('Termina la sesión antes de importar'); return; }
  try {
    const obj = JSON.parse(await file.text());
    if (!obj || !Array.isArray(obj.sessions) || !Array.isArray(obj.rewards)) throw new Error('formato');
    if (!confirm(`¿Reemplazar tus datos actuales por el respaldo? (${obj.sessions.length} sesiones, ${obj.rewards.length} premios)`)) return;
    data = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), obj);
    data.plan = Object.assign({ week: 1, doneInWeek: 0, completed: false, guided: true }, data.plan || {});
    persist(); renderAll(); loadSettings();
    toast('Datos restaurados ✔');
  } catch (err) {
    toast('Ese archivo no es un respaldo válido');
  }
};

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 3600);
}

// ---------- Arranque ----------
// Si el teléfono cerró la app con una sesión a medio camino, la recuperamos en pausa.
const saved = load(ACTIVE, null);
if (saved) {
  Object.assign(S, {
    sid: saved.sid, startISO: saved.startISO, acc: saved.acc || 0,
    meters: saved.meters || 0, kcal: saved.kcal || 0, route: saved.route || [],
    status: 'pause', lastKmMark: Math.floor((saved.meters || 0) / 1000)
  });
  if (saved.guide) {
    S.guide = { phases: planPhases(saved.guide.week), idx: saved.guide.idx, end: 0,
                remain: saved.guide.remain, done: saved.guide.done };
  }
  line.setLatLngs(S.route);
  toast('Recuperamos tu sesión anterior. Pulsa ▶ Reanudar o ■ Terminar.');
}

renderAll();
setButtons();
startGPS(); // pide ubicación para centrar el mapa
checkReminders();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();
