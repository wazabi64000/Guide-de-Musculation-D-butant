export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $all(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null) {
      node.setAttribute(key, value);
    }
  });

  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  });

  return node;
}

export function clear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Format seconds as 1 min, 1 min 30, 2 min 30, etc. */
export function formatRestLabel(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  if (r === 0) return `${m} min`;
  return `${m} min ${String(r).padStart(2, '0')}`;
}

export function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export function quoteOfDay(quotes = []) {
  if (!quotes.length) return 'Chaque séance te rapproche de ton objectif.';
  const day = Math.floor(Date.now() / 86400000);
  return quotes[day % quotes.length];
}

export function muscleChips(muscles = []) {
  return el(
    'div',
    { className: 'muscle-chips' },
    muscles.map((muscle) =>
      el('span', { className: 'muscle-chip' }, [
        el('span', { className: 'muscle-dot', 'aria-hidden': 'true' }),
        muscle
      ])
    )
  );
}

export function createImageWithFallback(src, alt) {
  const wrap = el('div', { className: 'exercise-media' });
  const path = String(src || '').replace(/^\//, '');

  if (!path) {
    wrap.appendChild(
      el('div', { className: 'fallback', text: alt || 'Image manquante' })
    );
    return wrap;
  }

  const img = document.createElement('img');
  img.alt = alt || '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.width = 1200;
  img.height = 750;
  img.sizes = '(max-width: 639px) 100vw, (max-width: 1099px) 50vw, 520px';
  img.src = `${path}?v=8`;
  img.addEventListener('error', () => {
    img.remove();
    if (!wrap.querySelector('.fallback')) {
      wrap.appendChild(
        el('div', { className: 'fallback', text: alt || 'Image manquante' })
      );
    }
  });
  wrap.appendChild(img);
  return wrap;
}

export function setActiveNav(page) {
  $all('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.page === page);
  });
}

export function requestNotify(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: 'icons/icon-192.png' });
  }
}

export async function ensureNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function enterFullscreen(target = document.documentElement) {
  if (target.requestFullscreen) return target.requestFullscreen().catch(() => {});
  if (target.webkitRequestFullscreen) return target.webkitRequestFullscreen();
  return Promise.resolve();
}

export function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    return document.exitFullscreen().catch(() => {});
  }
  return Promise.resolve();
}

export function ringOffset(progress, circumference) {
  return circumference * (1 - progress);
}

export function estimateCalories(minutes, rate = 6.5) {
  return Math.round(minutes * rate);
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateFR(iso) {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
