let state = null;
let currentPage = 'home';
let selectedGameId = null;

const content = document.getElementById('content');
const search = document.getElementById('search');
const filterGenre = document.getElementById('filterGenre');

document.querySelectorAll('.sidebar button').forEach((button) => {
  button.onclick = () => { currentPage = button.dataset.page; render(); };
});

search.oninput = () => render();
filterGenre.onchange = () => render();

window.launcherApi.subscribe((event) => {
  if (event.type === 'state') {
    state = event.payload;
    hydrateGenres();
    render();
  }
});

(async function init() {
  state = await window.launcherApi.getState();
  selectedGameId = state.games.find((g) => g.featured)?.id || state.games[0]?.id || null;
  hydrateGenres();
  render();
})();

function hydrateGenres() {
  const genres = [...new Set(state.games.flatMap((g) => g.genres || []))].sort();
  filterGenre.innerHTML = '<option value="">All genres</option>' + genres.map((g) => `<option>${g}</option>`).join('');
}

function filteredGames(installedOnly = false) {
  const q = search.value.toLowerCase().trim();
  const genre = filterGenre.value;
  return state.games.filter((g) => {
    const installed = Boolean(state.installed[g.id]);
    if (installedOnly && !installed) return false;
    if (genre && !(g.genres || []).includes(genre)) return false;
    if (!q) return true;
    return [g.title, g.developer, ...(g.tags || []), ...(g.genres || [])].join(' ').toLowerCase().includes(q);
  });
}

function render() {
  if (!state) return;
  if (currentPage === 'home') return renderHome();
  if (currentPage === 'library') return renderLibrary();
  if (currentPage === 'downloads') return renderDownloads();
  return renderSettings();
}

function renderHome() {
  const game = state.games.find((g) => g.id === selectedGameId) || state.games[0];
  const cards = filteredGames().map(renderGameCard).join('');
  content.innerHTML = `
  <div class="banner">
    <h2>${game?.title || 'No games configured'}</h2>
    <p>${game?.short_description || 'Drop manifests into data/manifests.'}</p>
    <div class="actions">${game ? renderGameActions(game) : ''}</div>
  </div>
  <div class="grid">${cards}</div>`;
  wireCardActions();
}

function renderGameCard(game) {
  const installed = state.installed[game.id];
  const update = installed && installed.version !== game.version;
  return `<article class="card" data-id="${game.id}">
  <h3>${game.title}</h3>
  <p class="muted">${game.short_description}</p>
  <p>${(game.genres || []).map((x)=>`<span class='badge'>${x}</span>`).join('')}</p>
  ${installed ? `<span class="badge">Installed</span>` : `<span class="badge">Not installed</span>`}
  ${update ? `<span class="badge">Update available</span>` : ''}
  </article>`;
}

function renderGameActions(game) {
  const installed = state.installed[game.id];
  const update = installed && installed.version !== game.version;
  return `
    ${!installed ? `<button data-action="install" data-id="${game.id}">Install</button>` : ''}
    ${update ? `<button data-action="update" data-id="${game.id}">Update</button>` : ''}
    ${installed ? `<button data-action="launch" data-id="${game.id}">Launch</button>` : ''}
    ${installed ? `<button data-action="repair" data-id="${game.id}">Repair</button>` : ''}
    ${installed ? `<button data-action="uninstall" data-id="${game.id}">Uninstall</button>` : ''}
  `;
}

function renderLibrary() {
  const games = filteredGames(true).sort((a,b)=>(state.installed[b.id]?.lastPlayed||'').localeCompare(state.installed[a.id]?.lastPlayed||''));
  content.innerHTML = `<h2>Installed Library</h2><div class="grid">${games.map((g)=>`<div class='card'><h3>${g.title}</h3><p class='muted'>Launches: ${state.installed[g.id].launchCount || 0}</p><div class='actions'>${renderGameActions(g)}</div></div>`).join('')}</div>`;
  wireCardActions();
}

function renderDownloads() {
  content.innerHTML = `<h2>Downloads</h2>${state.downloads.map((d)=>`<div class='card'><h3>${d.title} <span class='badge'>${d.status}</span></h3><div class='progress'><div style='width:${d.progress}%'></div></div><p class='muted'>${d.progress}% • ${fmt(d.speed)}/s • ETA ${d.etaSeconds}s</p><div class='actions'><button data-download='pause' data-id='${d.id}'>Pause</button><button data-download='resume' data-id='${d.id}'>Resume</button><button data-download='cancel' data-id='${d.id}'>Cancel</button></div></div>`).join('')}`;
  document.querySelectorAll('[data-download]').forEach((b)=>b.onclick=async()=>{
    const id=b.dataset.id;const act=b.dataset.download;
    if(act==='pause') await window.launcherApi.pauseDownload(id);
    if(act==='resume') await window.launcherApi.resumeDownload(id);
    if(act==='cancel') await window.launcherApi.cancelDownload(id);
  });
}

function renderSettings() {
  content.innerHTML = `<h2>Settings & About</h2><div class='card'><label>Theme</label><select id='theme'><option value='dark'>Dark Gaming</option></select><p class='muted'>Install base folder: ./games</p><div class='actions'><button id='clearCache'>Clear Cache</button><button id='openLogs'>Open Logs Folder</button></div><p class='muted'>Legal Notice: This launcher is only for games you own, created, or are explicitly authorized to redistribute. Do not use for piracy, DRM bypass, or unauthorized paid game distribution.</p><p class='muted'>Version ${state.appVersion}</p></div>`;
  document.getElementById('theme').onchange = (e) => window.launcherApi.setSetting('theme', e.target.value);
  document.getElementById('clearCache').onclick = () => window.launcherApi.clearCache();
  document.getElementById('openLogs').onclick = () => window.launcherApi.openLogs();
}

function wireCardActions() {
  document.querySelectorAll('.card[data-id]').forEach((card)=>{
    card.onclick = () => { selectedGameId = card.dataset.id; renderHome(); };
  });
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.onclick = async (e) => {
      e.stopPropagation();
      const id = button.dataset.id;
      if (button.dataset.action === 'install' || button.dataset.action === 'update' || button.dataset.action === 'repair') await window.launcherApi.queueInstall(id, button.dataset.action);
      if (button.dataset.action === 'launch') await window.launcherApi.launchGame(id);
      if (button.dataset.action === 'uninstall') await window.launcherApi.uninstallGame(id);
    };
  });
}

function fmt(bytes){ if(!bytes) return '0 B'; const u=['B','KB','MB']; let i=0,n=bytes; while(n>1024&&i<u.length-1){n/=1024;i++;} return `${n.toFixed(1)} ${u[i]}`; }
