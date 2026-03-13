// Extension Phénix Scans pour SORU
// API REST: api.phenix-scans.co/api/front/
var baseUrl = 'https://phenix-scans.co';
var apiUrl = 'https://api.phenix-scans.co/api/front';

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function isCloudflare(html) {
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return true;
  if (typeof html === 'string' && html.startsWith('ERROR:')) return true;
  return false;
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  try { return new Date(isoDate).toLocaleDateString('fr-FR'); } catch(e) { return isoDate; }
}

function buildCover(coverImage) {
  if (!coverImage) return '';
  if (coverImage.startsWith('http')) return coverImage;
  return 'https://api.phenix-scans.co/' + coverImage;
}

// ============================================================
// getPopular — API directe JSON
// ============================================================
async function getPopular(page, invoke) {
  page = page || 0;
  var endpoint = apiUrl + '/manga?page=' + (page + 1) + '&orderBy=views';
  try {
    var res = await invoke('fetch_html', { url: endpoint });
    var data = JSON.parse(res);
    if (data.mangas && Array.isArray(data.mangas)) {
      return data.mangas.map(function(m) {
        return {
          id: baseUrl + '/manga/' + m.slug,
          title: m.title || '',
          cover: buildCover(m.coverImage),
          source_id: 'phenixscans'
        };
      });
    }
  } catch(e) { console.error('[PhenixScans] getPopular:', e); }
  return [{ id: 'cf-error', title: 'Erreur chargement', cover: '' }];
}

// ============================================================
// search — même endpoint avec ?search=
// ============================================================
async function search(query, page, invoke) {
  page = page || 0;
  var endpoint = apiUrl + '/manga?search=' + encodeURIComponent(query) + '&page=' + (page + 1);
  try {
    var res = await invoke('fetch_html', { url: endpoint });
    var data = JSON.parse(res);
    if (data.mangas && Array.isArray(data.mangas)) {
      return data.mangas.map(function(m) {
        return {
          id: baseUrl + '/manga/' + m.slug,
          title: m.title || '',
          cover: buildCover(m.coverImage),
          source_id: 'phenixscans'
        };
      });
    }
  } catch(e) { console.error('[PhenixScans] search:', e); }
  return [];
}

// ============================================================
// getMangaDetails — /api/front/manga/{slug}
// ============================================================
async function getMangaDetails(mangaId, invoke) {
  var slug = mangaId.replace(baseUrl + '/manga/', '');
  var endpoint = apiUrl + '/manga/' + slug;
  try {
    var res = await invoke('fetch_html', { url: endpoint });
    var data = JSON.parse(res);
    var m = data.manga || data;
    if (m && m.title) {
      var genres = [];
      if (m.genres && Array.isArray(m.genres)) {
        genres = m.genres.map(function(g) { return typeof g === 'string' ? g : g.name || g.label || ''; });
      }
      return {
        id: mangaId,
        title: m.title || '',
        cover: buildCover(m.coverImage),
        synopsis: m.synopsis || m.description || '',
        author: m.author || (m.team && m.team.name) || 'Inconnu',
        status: m.status || 'En cours',
        genres: genres,
        source_id: 'phenixscans'
      };
    }
  } catch(e) { console.error('[PhenixScans] getMangaDetails:', e); }

  // Fallback HTML
  var html = await invoke('fetch_html', { url: mangaId });
  if (isCloudflare(html)) return null;
  var doc = parseDOM(html);
  return {
    id: mangaId,
    title: (doc.querySelector('h1') || {}).textContent || '',
    cover: '',
    synopsis: '',
    author: 'Inconnu',
    status: 'En cours',
    genres: [],
    source_id: 'phenixscans'
  };
}

// ============================================================
// getChapters — /api/front/manga/{slug} retourne chapters[]
// ============================================================
async function getChapters(mangaId, invoke) {
  var slug = mangaId.replace(baseUrl + '/manga/', '');
  var endpoint = apiUrl + '/manga/' + slug;
  try {
    var res = await invoke('fetch_html', { url: endpoint });
    var data = JSON.parse(res);
    var chList = data.chapters || (data.manga && data.manga.chapters) || [];
    if (chList && Array.isArray(chList) && chList.length > 0) {
      return chList.map(function(ch) {
        var num = ch.number || ch.chapterNumber || '';
        return {
          id: baseUrl + '/manga/' + slug + '/chapitre/' + num,
          title: 'Chapitre ' + num + (ch.title ? ' — ' + ch.title : ''),
          number: num,
          date: formatDate(ch.createdAt || ch.date || '')
        };
      });
    }
  } catch(e) { console.error('[PhenixScans] getChapters:', e); }

  // Fallback HTML
  var html = await invoke('fetch_html', { url: mangaId });
  if (isCloudflare(html)) return [];
  var doc = parseDOM(html);
  var chapters = [];
  doc.querySelectorAll('a[href*="/chapitre/"]').forEach(function(a) {
    var href = a.getAttribute('href') || '';
    var fullHref = href.startsWith('http') ? href : baseUrl + href;
    var numMatch = href.match(/\/chapitre\/([^/]+)/);
    var num = numMatch ? numMatch[1] : '';
    chapters.push({
      id: fullHref,
      title: 'Chapitre ' + num,
      number: num,
      date: ''
    });
  });
  return chapters;
}

// ============================================================
// getPages — images dans le HTML de la page chapitre
// ============================================================
async function getPages(chapterId, invoke) {
  var html = await invoke('fetch_html', { url: chapterId });
  if (isCloudflare(html)) return [];

  var pages = [];

  // Méthode 1 : balises img avec src api.phenix-scans.co
  var doc = parseDOM(html);
  doc.querySelectorAll('img').forEach(function(img) {
    var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (src && src.includes('api.phenix-scans.co/uploads')) {
      pages.push(src.startsWith('http') ? src : 'https://api.phenix-scans.co/' + src);
    }
  });

  // Méthode 2 : scripts JSON embarqués
  if (pages.length === 0) {
    doc.querySelectorAll('script').forEach(function(script) {
      var content = script.textContent || '';
      if (content.includes('uploads/mangas')) {
        var matches = content.match(/https:\/\/api\.phenix-scans\.co\/uploads\/mangas\/[^"'\s]+\.webp[^"'\s]*/g);
        if (matches) matches.forEach(function(url) {
          pages.push(url.replace(/\\u0026/g, '&'));
        });
      }
    });
  }

  // Méthode 3 : regex dans le HTML brut
  if (pages.length === 0) {
    var matches = html.match(/https:\/\/api\.phenix-scans\.co\/uploads\/mangas\/[^"'\s\\]+\.webp/g);
    if (matches) {
      var seen = new Set();
      matches.forEach(function(url) {
        var clean = url.split('?')[0];
        if (!seen.has(clean)) { seen.add(clean); pages.push(url); }
      });
    }
  }

  console.log('[PhenixScans] ' + pages.length + ' pages pour ' + chapterId);
  return pages;
}

({
  baseUrl: baseUrl,
  getPopular: getPopular,
  search: search,
  getMangaDetails: getMangaDetails,
  getChapters: getChapters,
  getPages: getPages
});
