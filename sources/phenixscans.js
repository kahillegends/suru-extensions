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
  var url = baseUrl + '/manga?page=' + (page + 1) + '&orderBy=views';
  var html = await invoke('fetch_html', { url: url });
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];

  var results = [];
  var nextData = extractNextData(html);
  
  if (nextData) {
    try {
      var props = nextData.props && nextData.props.pageProps;
      var mangas = props && (props.mangas || props.data || props.items || props.comics);
      if (mangas && Array.isArray(mangas)) {
        mangas.forEach(function(m) {
          var slug = m.slug || m.id || '';
          results.push({
            id: baseUrl + '/manga/' + slug,
            title: m.title || m.name || '',
            cover: (m.coverImage ? 'https://api.phenix-scans.co/' + m.coverImage : (m.cover || m.thumbnail || m.image || '')),
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
      if (!href.match(/\/manga\/[^/]+$/) && !href.match(/\/manga\/[^/]+-\d+$/)) return;
      var fullHref = href.startsWith('http') ? href : baseUrl + href;
      if (seen.has(fullHref)) return;
      seen.add(fullHref);
      var container = a.closest('article, li, div[class*="card"], div[class*="manga"], div[class*="item"]');
      if (!container) container = a;
      var img = container.querySelector('img');
      var titleEl = container.querySelector('h2, h3, h4, p[class*="title"], span[class*="title"]') || a;
      var title = titleEl ? titleEl.textContent.trim() : '';
      if (!title || title.length < 2) return;
      results.push({
        id: fullHref,
        title: title,
        cover: img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '',
        source_id: 'phenixscans'
      });
    });
  }
  return results;
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

// 🟢 CORRECTION: getMangaDetails récupère le synopsis et protège la cover
async function getMangaDetails(mangaId, invoke) {
  var html = await invoke('fetch_html', { url: mangaId });
  if (isCloudflare(html)) return null;

  var details = { id: mangaId, source_id: 'phenixscans' };

  var nextData = extractNextData(html);
  if (nextData) {
    try {
      var props = nextData.props && nextData.props.pageProps;
      var m = props && (props.manga || props.comic || props.data);
      if (m) {
        if (m.title || m.name) details.title = m.title || m.name;
        if (m.coverImage) details.cover = 'https://api.phenix-scans.co/' + m.coverImage;
        else if (m.cover || m.thumbnail || m.image) details.cover = m.cover || m.thumbnail || m.image;
        if (m.synopsis || m.description || m.summary) details.synopsis = m.synopsis || m.description || m.summary;
        details.author = m.author || (m.authors && m.authors[0]) || 'Inconnu';
        details.status = m.status || 'En cours';
        if (m.genres || m.tags) details.genres = m.genres || m.tags;
        return details;
      }
    } catch(e) {}
  }

  // Fallback DOM
  var doc = parseDOM(html);
  var h1 = doc.querySelector('h1');
  if (h1) details.title = h1.textContent.trim();

  var img = doc.querySelector('img[class*="cover"], img[class*="thumbnail"], .cover img, header img');
  if (img) {
    var src = img.getAttribute('src') || img.getAttribute('data-src');
    if (src) details.cover = src.startsWith('http') ? src : baseUrl + src;
  }

  var syn = doc.querySelector('div[class*="synopsis"], div[class*="summary"], p[class*="desc"]');
  if (syn) details.synopsis = syn.textContent.trim();

  details.author = 'Inconnu';
  details.status = 'En cours';
  return details;
}

// 🟢 CORRECTION: getChapters espace le texte et supprime les doublons
async function getChapters(mangaId, invoke) {
  var html = await invoke('fetch_html', { url: mangaId });
  if (isCloudflare(html)) return [];

  var chapters = [];

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

  if (chapters.length === 0) {
    var doc = parseDOM(html);
    doc.querySelectorAll('a[href*="/chapitre/"]').forEach(function(a) {
      var href = a.getAttribute('href') || '';
      var fullHref = href.startsWith('http') ? href : baseUrl + href;
      var numMatch = href.match(/\/chapitre\/([^/]+)/);
      var num = numMatch ? numMatch[1] : href;

      var titleText = Array.from(a.querySelectorAll('*'))
        .filter(el => el.children.length === 0 && el.textContent.trim() !== '')
        .map(el => el.textContent.trim())
        .join(' - ');

      chapters.push({
        id: fullHref,
        title: titleText || 'Chapitre ' + num,
        number: num,
        date: ''
      });
    });
  }

  // Filtre anti-doublons
  var uniqueChapters = [];
  var seenIds = new Set();
  chapters.forEach(function(ch) {
    if (!seenIds.has(ch.id)) {
      seenIds.add(ch.id);
      uniqueChapters.push(ch);
    }
  });

  return uniqueChapters;
}

async function getPages(chapterId, invoke) {
  var html = await invoke('fetch_html', { url: chapterId });
  if (isCloudflare(html)) return [];

  var pages = [];
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
