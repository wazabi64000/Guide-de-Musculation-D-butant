const PAGES = {
  home: 'index.html',
  programme: 'programme.html',
  historique: 'historique.html',
  statistiques: 'statistiques.html',
  parametres: 'parametres.html'
};

export function navigate(page, params = {}) {
  const target = PAGES[page] || PAGES.home;
  const url = new URL(target, window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  window.location.href = url.pathname + url.search + url.hash;
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function currentPage() {
  const file = window.location.pathname.split('/').pop() || 'index.html';
  const entry = Object.entries(PAGES).find(([, path]) => path === file);
  return entry ? entry[0] : 'home';
}

export function buildNav() {
  const items = [
    { page: 'home', href: 'index.html', label: 'Accueil', icon: homeIcon },
    { page: 'programme', href: 'programme.html', label: 'Programme', icon: programIcon },
    { page: 'historique', href: 'historique.html', label: 'Historique', icon: historyIcon },
    { page: 'statistiques', href: 'statistiques.html', label: 'Stats', icon: statsIcon },
    { page: 'parametres', href: 'parametres.html', label: 'Réglages', icon: settingsIcon }
  ];

  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Navigation principale');

  const active = currentPage();
  items.forEach((item) => {
    const a = document.createElement('a');
    a.className = `nav-item${item.page === active ? ' active' : ''}`;
    a.href = item.href;
    a.dataset.page = item.page;
    a.innerHTML = `${item.icon}<span>${item.label}</span>`;
    nav.appendChild(a);
  });

  return nav;
}

const homeIcon = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/></svg>`;
const programIcon = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 12h8M8 15h5"/></svg>`;
const historyIcon = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 5v5h5"/><path d="M12 8v5l3 2"/></svg>`;
const statsIcon = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19V10M12 19V5M19 19v-7"/></svg>`;
const settingsIcon = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2 4.8 4.8M19.2 19.2l-1.4-1.4M17.8 6.2l1.4-1.4M4.8 19.2l1.4-1.4"/></svg>`;
