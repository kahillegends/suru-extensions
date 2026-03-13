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
async function getPages(chapterId, invoke) {
  // Extraire l'ID numérique du chapitre depuis l'URL
  // ex: https://mangafire.to/read/manga-name.abc/en/chapter-1
  var chapterNumMatch = chapterId.match(/chapter-([^/?#]+)/);
  if (!chapterNumMatch) return [];

  var chapterNum = chapterNumMatch[1];
  var apiUrl = baseUrl + '/ajax/read/chapter/' + chapterNum;

  var json = await invoke('fetch_json', {
    url: apiUrl,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01'
    }
  });

  if (!json || !json.result || !json.result.images) return [];

  // Chaque entrée est un array [url, 1, 0]
  return json.result.images.map(function(entry) {
    return entry[0];
  }).filter(function(url) {
    return url && url.startsWith('http');
  });
}

({
  baseUrl: baseUrl,
  getPopular: getPopular,
  search: search,
  getMangaDetails: getMangaDetails,
  getChapters: getChapters,
  getPages: getPages
});
