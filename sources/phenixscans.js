// Extension Phénix Scans pour SORU
// API: api.phenix-scans.co/api/front/
// Site SSR Next.js — données dans __NEXT_DATA__ ou HTML
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

// Extraire __NEXT_DATA__ depuis le HTML Next.js
function extractNextData(html) {
  try {
    var match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (match) return JSON.parse(match[1]);
  } catch(e) {}
  return null;
}

async function getPopular(page, invoke) {
  page = page || 0;
  // API directe: /api/front/manga?page=N&orderBy=views
  var apiEndpoint = apiUrl + '/manga?page=' + (page + 1) + '&orderBy=views';
  try {
    var res = await invoke('fetch_html', { url: apiEndpoint });
    var data = JSON.parse(res);
    if (data.mangas && Array.isArray(data.mangas)) {
      return data.mangas.map(function(m) {
        return {
          id: baseUrl + '/manga/' + m.slug,
          title: m.title || m.name || '',
          cover: m.coverImage ? 'https://api.phenix-scans.co/' + m.coverImage : '',
          source_id: 'phenixscans'
        };
      });
    }
  } catch(e) { console.error('[PhenixScans] getPopular error:', e); }
  return [{ id: 'cf-error', title: 'Erreur chargement', cover: '' }];
}

async function search(query, page, invoke) {
  page = page || 0;
  var url = baseUrl + '/manga?search=' + encodeURIComponent(query) + '&page=' + (page + 1);
  var html = await invoke('fetch_html', { url: url });
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];

  var results = [];
  var nextData = extractNextData(html);
  if (nextData) {
    try {
      var props = nextData.props && nextData.props.pageProps;
      var mangas = props && (props.mangas || props.data || props.items || props.results);
      if (mangas && Array.isArray(mangas)) {
        mangas.forEach(function(m) {
          var slug = m.slug || m.id || '';
          results.push({
            id: baseUrl + '/manga/' + slug,
            title: m.title || m.name || '',
            cover: (m.coverImage ? 'https://api.phenix-scans.co/' + m.coverImage : (m.cover || m.thumbnail || '')),
            source_id: 'phenixscans'
          });
        });
      }
    } catch(e) {}
  }

  if (results.length === 0) {
    var doc = parseDOM(html);
    var seen = new Set();
    doc.querySelectorAll('a[href*="/manga/"]').forEach(function(a) {
      var href = a.getAttribute('href') || '';
      if (!href.match(/\/manga\/[^/]+/)) return;
      var fullHref = href.startsWith('http') ? href : baseUrl + href;
      if (seen.has(fullHref)) return;
      seen.add(fullHref);
      var container = a.closest('article, li, div') || a;
      var img = container.querySelector('img');
      var titleEl = container.querySelector('h2, h3, h4, p, span') || a;
      results.push({
        id: fullHref,
        title: titleEl ? titleEl.textContent.trim() : '',
        cover: img ? (img.getAttribute('src') || '') : '',
        source_id: 'phenixscans'
      });
    });
  }

  return results;
}

async function getMangaDetails(mangaId, invoke) {
  var html = await invoke('fetch_html', { url: mangaId });
  if (isCloudflare(html)) return null;

  // Essayer __NEXT_DATA__ d'abord
  var nextData = extractNextData(html);
  if (nextData) {
    try {
      var props = nextData.props && nextData.props.pageProps;
      var m = props && (props.manga || props.comic || props.data);
      if (m) {
        var slug = m.slug || m.id || '';
        return {
          id: mangaId,
          title: m.title || m.name || '',
          cover: (m.coverImage ? 'https://api.phenix-scans.co/' + m.coverImage : (m.cover || m.thumbnail || m.image || '')),
          synopsis: m.synopsis || m.description || m.summary || '',
          author: m.author || (m.authors && m.authors[0]) || 'Inconnu',
          status: m.status || 'En cours',
          genres: m.genres || m.tags || [],
          source_id: 'phenixscans'
        };
      }
    } catch(e) {}
  }

  // Fallback DOM
  var doc = parseDOM(html);
  var title = '';
  var h1 = doc.querySelector('h1');
  if (h1) title = h1.textContent.trim();

  var cover = '';
  var img = doc.querySelector('img[class*="cover"], img[class*="thumbnail"], .cover img, header img');
  if (img) cover = img.getAttribute('src') || img.getAttribute('data-src') || '';

  return {
    id: mangaId,
    title: title,
    cover: cover,
    synopsis: '',
    author: 'Inconnu',
    status: 'En cours',
    genres: [],
    source_id: 'phenixscans'
  };
}

async function getChapters(mangaId, invoke) {
  var html = await invoke('fetch_html', { url: mangaId });
  if (isCloudflare(html)) return [];

  var chapters = [];

  // __NEXT_DATA__ contient souvent la liste des chapitres
  var nextData = extractNextData(html);
  if (nextData) {
    try {
      var props = nextData.props && nextData.props.pageProps;
      var manga = props && (props.manga || props.comic || props.data);
      var chList = manga && (manga.chapters || manga.chapterList);
      if (!chList && props) chList = props.chapters || props.chapterList;
      if (chList && Array.isArray(chList)) {
        chList.forEach(function(ch) {
          var num = ch.number || ch.chapterNumber || ch.num || '';
          var mangaSlug = mangaId.replace(baseUrl + '/manga/', '');
          var chUrl = baseUrl + '/manga/' + mangaSlug + '/chapitre/' + num;
          // Formater la date depuis createdAt ISO
          var date = '';
          if (ch.createdAt) {
            try { date = new Date(ch.createdAt).toLocaleDateString('fr-FR'); } catch(e) { date = ch.createdAt; }
          }
          chapters.push({
            id: chUrl,
            title: 'Chapitre ' + num + (ch.title ? ' - ' + ch.title : ''),
            number: num,
            date: date
          });
        });
      }
    } catch(e) {}
  }

  // Fallback DOM
  if (chapters.length === 0) {
    var doc = parseDOM(html);
    doc.querySelectorAll('a[href*="/chapitre/"]').forEach(function(a) {
      var href = a.getAttribute('href') || '';
      var fullHref = href.startsWith('http') ? href : baseUrl + href;
      var numMatch = href.match(/\/chapitre\/([^/]+)/);
      var num = numMatch ? numMatch[1] : href;
      chapters.push({
        id: fullHref,
        title: a.textContent.trim() || 'Chapitre ' + num,
        number: num,
        date: ''
      });
    });
  }

  return chapters;
}

async function getPages(chapterId, invoke) {
  // chapterId = https://phenix-scans.co/manga/{slug}/chapitre/{num}
  // API pages = https://api.phenix-scans.co/api/front/{slug}/{num}/pages (à tester)
  // ou les images sont dans __NEXT_DATA__

  var html = await invoke('fetch_html', { url: chapterId });
  if (isCloudflare(html)) return [];

  var pages = [];

  // Méthode 1 : __NEXT_DATA__
  var nextData = extractNextData(html);
  if (nextData) {
    try {
      var props = nextData.props && nextData.props.pageProps;
      var chapter = props && (props.chapter || props.data);
      var images = chapter && (chapter.images || chapter.pages || chapter.pageUrls);
      if (!images && props) images = props.images || props.pages;
      if (images && Array.isArray(images)) {
        pages = images.map(function(img) {
          if (typeof img === 'string') return img;
          return img.url || img.src || img.image || '';
        }).filter(function(u) { return u && u.startsWith('http'); });
      }
    } catch(e) {}
  }

  // Méthode 2 : API endpoint /api/front/{slug}/{num}/pages
  if (pages.length === 0) {
    try {
      var parts = chapterId.replace(baseUrl + '/manga/', '').split('/chapitre/');
      var mangaSlug = parts[0];
      var chapterNum = parts[1];
      var apiEndpoint = apiUrl + '/' + mangaSlug + '/' + chapterNum + '/pages';
      var res = await invoke('fetch_html', { url: apiEndpoint });
      if (!isCloudflare(res)) {
        var data = JSON.parse(res);
        if (Array.isArray(data)) {
          pages = data.map(function(p) { return typeof p === 'string' ? p : p.url || p.image || ''; });
        } else if (data.pages || data.images) {
          var imgs = data.pages || data.images;
          pages = imgs.map(function(p) { return typeof p === 'string' ? p : p.url || ''; });
        }
      }
    } catch(e) {}
  }

  // Méthode 3 : scraper les images depuis le DOM
  if (pages.length === 0) {
    var doc = parseDOM(html);
    doc.querySelectorAll('img[src*="api.phenix-scans.co"], img[src*="uploads/mangas"]').forEach(function(img) {
      var src = img.getAttribute('src') || '';
      if (src && src.startsWith('http')) pages.push(src);
    });
  }

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
