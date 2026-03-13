// Extension MangaFire pour SORU
var baseUrl = 'https://mangafire.to';

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

// 1. POPULAIRES
async function getPopular(page, invoke) {
  page = page || 0;
  var url = baseUrl + '/filter?sort=trending&page=' + (page + 1);
  var html = await invoke('fetch_html_rendered', { url: url, waitMs: 4000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [{ id: 'cf-error', title: 'Cloudflare Bloque...', cover: '' }];

  var results = [];
  var doc = parseDOM(html);
  var seen = new Set();

  // On cible TOUS les liens d'images de la page
  doc.querySelectorAll('a.poster').forEach(function(a) {
    var href = a.getAttribute('href');
    var img = a.querySelector('img');
    
    if (href && img) {
      var fullHref = href.startsWith('http') ? href : baseUrl + href;
      if (seen.has(fullHref)) return;
      seen.add(fullHref);

      results.push({
        id: fullHref,
        title: img.getAttribute('alt') || a.getAttribute('title') || 'Inconnu',
        cover: img.getAttribute('src') || img.getAttribute('data-src') || '',
        source_id: 'mangafire'
      });
    }
  });

  return results;
}

// 2. RECHERCHE
async function search(query, page, invoke) {
  page = page || 0;
  var url = baseUrl + '/filter?keyword=' + encodeURIComponent(query) + '&page=' + (page + 1);
  var html = await invoke('fetch_html_rendered', { url: url, waitMs: 4000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [{ id: 'cf-error', title: 'Cloudflare Bloque...', cover: '' }];

  var results = [];
  var doc = parseDOM(html);
  var seen = new Set();

  doc.querySelectorAll('a.poster').forEach(function(a) {
    var href = a.getAttribute('href');
    var img = a.querySelector('img');
    
    if (href && img) {
      var fullHref = href.startsWith('http') ? href : baseUrl + href;
      if (seen.has(fullHref)) return;
      seen.add(fullHref);

      results.push({
        id: fullHref,
        title: img.getAttribute('alt') || a.getAttribute('title') || 'Inconnu',
        cover: img.getAttribute('src') || img.getAttribute('data-src') || '',
        source_id: 'mangafire'
      });
    }
  });

  return results;
}

// 3. DÉTAILS
async function getMangaDetails(mangaId, invoke) {
  var html = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 3000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return null;

  var doc = parseDOM(html);
  var titleEl = doc.querySelector('h1[itemprop="name"]') || doc.querySelector('.info h1') || doc.querySelector('.title');
  var imgEl = doc.querySelector('.poster img');
  var synEl = doc.querySelector('.synopsis .content') || doc.querySelector('.description');

  return {
    id: mangaId,
    title: titleEl ? titleEl.textContent.trim() : 'Inconnu',
    cover: imgEl ? imgEl.getAttribute('src') : '',
    synopsis: synEl ? synEl.textContent.trim() : 'Aucun synopsis',
    author: 'Inconnu',
    status: 'En cours',
    genres: [],
    source_id: 'mangafire'
  };
}

// 4. CHAPITRES
async function getChapters(mangaId, invoke) {
  var html = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 4000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [];

  var doc = parseDOM(html);
  var chapters = [];

  var items = doc.querySelectorAll('.list-body ul li a, .manga-detail ul li a, .scroll-sm ul li a');
  
  items.forEach(function(a) {
    var href = a.getAttribute('href');
    if (!href) return;
    
    var fullHref = href.startsWith('http') ? href : baseUrl + href;
    var titleEl = a.querySelector('span') || a;
    var titleText = titleEl.textContent.trim().replace(/\s+/g, ' ');

    var numMatch = titleText.match(/chapter\s*(\d+(\.\d+)?)/i) || titleText.match(/ch\.\s*(\d+(\.\d+)?)/i);
    var num = numMatch ? numMatch[1] : (chapters.length + 1).toString();

    chapters.push({
      id: fullHref,
      title: titleText || 'Chapitre ' + num,
      number: num,
      date: ''
    });
  });

  // Si on n'a rien trouvé, c'est peut-être un format "List" au lieu de "Grid"
  if (chapters.length === 0) {
    doc.querySelectorAll('.chapter-list li a, .episodes li a').forEach(function(a) {
      var href = a.getAttribute('href');
      if (href) {
        chapters.push({
          id: href.startsWith('http') ? href : baseUrl + href,
          title: a.textContent.trim(),
          number: chapters.length + 1,
          date: ''
        });
      }
    });
  }

  // Inverser pour avoir le plus récent en premier
  chapters.reverse();

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

// 5. PAGES DU CHAPITRE (CORRIGÉ)
async function getPages(chapterId, invoke) {
  // 🟢 On ne met plus de waitSelector. On attend juste 8 secondes en forçant le chargement.
  var html = await invoke('fetch_html_rendered', { url: chapterId, waitSelector: null, waitMs: 8000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [];

  var doc = parseDOM(html);
  var pages = [];

  // On aspire absolument TOUTES les images de la page, et on filtre celles qui servent au design
  doc.querySelectorAll('img').forEach(function(img) {
    var src = img.getAttribute('src') || img.getAttribute('data-src');
    
    if (src && src.startsWith('http')) {
      var lowerSrc = src.toLowerCase();
      // On exclut les logos, icônes, spinners, avatars...
      if (!lowerSrc.includes('logo') && 
          !lowerSrc.includes('spinner') && 
          !lowerSrc.includes('assets') && 
          !lowerSrc.includes('avatar') &&
          !lowerSrc.includes('icon')) {
        pages.push(src);
      }
    }
  });

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
