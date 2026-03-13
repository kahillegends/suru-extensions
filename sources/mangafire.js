// Extension MangaFire pour SORU
var baseUrl = 'https://mangafire.to';

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

// 1. POPULAIRES (Grille complète)
async function getPopular(page, invoke) {
  page = page || 0;
  var url = baseUrl + '/filter?sort=trending&page=' + (page + 1);
  var html = await invoke('fetch_html_rendered', { url: url, waitMs: 4000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [{ id: 'cf-error', title: 'Cloudflare Bloque...', cover: '' }];

  var results = [];
  var doc = parseDOM(html);
  var seen = new Set();

  doc.querySelectorAll('.unit, .original.card-lg, div.manga').forEach(function(card) {
    var a = card.querySelector('a.poster') || card.querySelector('a');
    var img = card.querySelector('img');
    
    if (a && img) {
      var href = a.getAttribute('href');
      var fullHref = href.startsWith('http') ? href : baseUrl + href;
      if (seen.has(fullHref)) return;
      seen.add(fullHref);

      var titleEl = card.querySelector('.info .title') || card.querySelector('.title') || img;
      var titleText = titleEl.textContent ? titleEl.textContent.trim() : (img.getAttribute('alt') || 'Inconnu');

      results.push({
        id: fullHref,
        title: titleText,
        cover: img.getAttribute('src') || img.getAttribute('data-src') || '',
        source_id: 'mangafire'
      });
    }
  });

  return results;
}

// 2. RECHERCHE (Grille complète)
async function search(query, page, invoke) {
  page = page || 0;
  var url = baseUrl + '/filter?keyword=' + encodeURIComponent(query) + '&page=' + (page + 1);
  var html = await invoke('fetch_html_rendered', { url: url, waitMs: 4000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [{ id: 'cf-error', title: 'Cloudflare Bloque...', cover: '' }];

  var results = [];
  var doc = parseDOM(html);
  var seen = new Set();

  doc.querySelectorAll('.unit, .original.card-lg, div.manga').forEach(function(card) {
    var a = card.querySelector('a.poster') || card.querySelector('a');
    var img = card.querySelector('img');
    
    if (a && img) {
      var href = a.getAttribute('href');
      var fullHref = href.startsWith('http') ? href : baseUrl + href;
      if (seen.has(fullHref)) return;
      seen.add(fullHref);

      var titleEl = card.querySelector('.info .title') || card.querySelector('.title') || img;
      var titleText = titleEl.textContent ? titleEl.textContent.trim() : (img.getAttribute('alt') || 'Inconnu');

      results.push({
        id: fullHref,
        title: titleText,
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
// On utilise l'API /ajax/read/[MANGA_SLUG] pour récupérer les vrais IDs internes
async function getChapters(mangaId, invoke) {
  // Extraire le slug du manga depuis l'URL
  // ex: https://mangafire.to/manga/one-piecee.dkw → one-piecee.dkw
  var slugMatch = mangaId.match(/\/manga\/([^/?#]+)/);
  if (!slugMatch) return [];

  var slug = slugMatch[1];
  var apiUrl = baseUrl + '/ajax/read/' + slug;

  var json = await invoke('fetch_json', {
    url: apiUrl,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Referer': mangaId
    }
  });

  if (!json || !json.result || !json.result.html) return [];

  // Le résultat contient du HTML avec les chapitres
  var doc = parseDOM(json.result.html);
  var chapters = [];

  doc.querySelectorAll('li a, li[data-id]').forEach(function(el) {
    var a = el.tagName === 'A' ? el : el.querySelector('a');
    if (!a) return;

    var href = a.getAttribute('href') || '';
    var fullHref = href.startsWith('http') ? href : baseUrl + href;

    // Récupérer le vrai ID interne depuis data-id sur le <li> ou le <a>
    var li = el.tagName === 'LI' ? el : el.closest('li');
    var realId = (li && li.getAttribute('data-id')) || a.getAttribute('data-id') || null;

    // Si pas de data-id, essayer d'extraire depuis href
    if (!realId) {
      var idFromHref = href.match(/chapter-(\d+)/);
      realId = idFromHref ? idFromHref[1] : null;
    }

    var titleText = a.textContent.trim().replace(/\s+/g, ' ');
    var numMatch = titleText.match(/chapter\s*(\d+(\.\d+)?)/i);
    var num = numMatch ? numMatch[1] : (chapters.length + 1).toString();

    if (realId && href) {
      chapters.push({
        id: realId,
        href: fullHref,
        title: titleText || 'Chapitre ' + num,
        number: num,
        date: ''
      });
    }
  });

  // Fallback sur le HTML rendu si l'API n'a rien donné
  if (chapters.length === 0) {
    var html = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 4000 });
    if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [];

    var docFallback = parseDOM(html);
    docFallback.querySelectorAll('.list-body ul li a, .scroll-sm ul li a, .chapter-list li a').forEach(function(a) {
      var href = a.getAttribute('href');
      if (!href) return;
      var fullHref = href.startsWith('http') ? href : baseUrl + href;
      var titleText = a.textContent.trim().replace(/\s+/g, ' ');
      var numMatch = titleText.match(/chapter\s*(\d+(\.\d+)?)/i);
      var num = numMatch ? numMatch[1] : (chapters.length + 1).toString();

      var li = a.closest('li');
      var realId = (li && li.getAttribute('data-id')) || a.getAttribute('data-id') || null;

      chapters.push({
        id: realId || fullHref,
        href: fullHref,
        title: titleText || 'Chapitre ' + num,
        number: num,
        date: ''
      });
    });
  }

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

// 5. PAGES DU CHAPITRE
// On laisse MangaFire calculer son vrf lui-même dans un BrowserWindow,
// et on intercepte les URLs des images qui transitent sur le réseau.
async function getPages(chapterId, invoke) {
  // chapterId est l'URL complète du chapitre
  // ex: https://mangafire.to/read/one-piecee.dkw/en/chapter-1176
  var chapterUrl = String(chapterId);
  if (!chapterUrl.startsWith('http')) {
    chapterUrl = baseUrl + chapterUrl;
  }

  var pages = await invoke('fetch_chapter_pages', {
    url: chapterUrl,
    waitMs: 12000
  });

  return pages || [];
}

({
  baseUrl: baseUrl,
  getPopular: getPopular,
  search: search,
  getMangaDetails: getMangaDetails,
  getChapters: getChapters,
  getPages: getPages
});
