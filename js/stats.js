import { getSessions, getAllRecords } from './database.js';
import { formatDuration } from './timer.js';
import { estimateCalories, formatDateFR } from './ui.js';

export async function computeStats(program) {
  const sessions = await getSessions();
  const records = await getAllRecords();

  const totalSeconds = sessions.reduce((sum, s) => sum + Number(s.durationSeconds || 0), 0);
  const totalMinutes = totalSeconds / 60;
  const calories = estimateCalories(totalMinutes, program?.meta?.caloriesPerMinute || 6.5);

  const byDay = {};
  sessions.forEach((s) => {
    byDay[s.dayId] = (byDay[s.dayId] || 0) + 1;
  });

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const daySessions = sessions.filter((s) => String(s.date).slice(0, 10) === key);
    return {
      label: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
      minutes: daySessions.reduce((sum, s) => sum + Number(s.durationSeconds || 0), 0) / 60,
      count: daySessions.length
    };
  });

  const completedDays = Object.keys(byDay).length;
  const programDays = program?.days?.length || 4;
  const progression = Math.min(100, Math.round((sessions.length / Math.max(1, programDays * 4)) * 100));

  return {
    sessions,
    records,
    sessionCount: sessions.length,
    totalSeconds,
    totalMinutes,
    calories,
    byDay,
    last7,
    completedDays,
    progression,
    lastSession: sessions[0] || null
  };
}

export function renderHistoryList(container, sessions, program) {
  container.innerHTML = '';
  if (!sessions.length) {
    container.innerHTML = '<div class="empty-state">Aucune séance enregistrée pour le moment.</div>';
    return;
  }

  sessions.forEach((session) => {
    const day = program.days.find((d) => d.id === session.dayId);
    const item = document.createElement('article');
    item.className = 'history-item fade-in';
    item.innerHTML = `
      <div>
        <strong>${day ? `${day.name} — ${day.focus}` : session.dayName || 'Séance'}</strong>
        <div class="card-text">${formatDateFR(session.date)}</div>
        ${session.notes ? `<div class="card-text">${escapeHtml(session.notes)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <strong>${formatDuration(session.durationSeconds || 0)}</strong>
        <div class="card-text">${session.exercisesCompleted || 0} exercices</div>
        <div class="card-text">${Math.round(session.calories || 0)} kcal</div>
      </div>
    `;
    container.appendChild(item);
  });
}

export function renderRecords(container, records, program) {
  container.innerHTML = '';
  if (!records.length) {
    container.innerHTML = '<div class="empty-state">Aucun record personnel pour l\'instant.</div>';
    return;
  }

  const nameMap = {};
  program.days.forEach((day) => {
    day.exercises.forEach((ex) => {
      nameMap[ex.id] = ex.name;
    });
  });

  records
    .slice()
    .sort((a, b) => Number(b.weight) - Number(a.weight))
    .forEach((record) => {
      const row = document.createElement('div');
      row.className = 'record-item';
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(nameMap[record.exerciseId] || record.exerciseId)}</strong>
          <div class="card-text">${formatDateFR(record.date)}</div>
        </div>
        <strong>${Number(record.weight)} kg</strong>
      `;
      container.appendChild(row);
    });
}

export function drawWeeklyChart(canvas, last7) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 220;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.documentElement);
  const text = styles.getPropertyValue('--text-muted').trim() || '#9aadbf';
  const accent = styles.getPropertyValue('--accent').trim() || '#3ddc97';
  const track = styles.getPropertyValue('--progress-track').trim() || 'rgba(255,255,255,0.08)';

  const padding = { top: 20, right: 12, bottom: 36, left: 12 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const max = Math.max(10, ...last7.map((d) => d.minutes));
  const barW = chartW / last7.length * 0.55;
  const gap = chartW / last7.length;

  last7.forEach((day, i) => {
    const x = padding.left + gap * i + (gap - barW) / 2;
    const h = (day.minutes / max) * chartH;
    const y = padding.top + chartH - h;

    ctx.fillStyle = track;
    ctx.beginPath();
    roundRect(ctx, x, padding.top, barW, chartH, 10);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.beginPath();
    roundRect(ctx, x, y, barW, Math.max(h, day.minutes > 0 ? 6 : 0), 10);
    ctx.fill();

    ctx.fillStyle = text;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(day.label, x + barW / 2, height - 12);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
