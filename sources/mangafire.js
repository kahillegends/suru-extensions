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
  var html = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 5000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [];

  var doc = parseDOM(html);
  var chapters = [];

  // Sélecteurs larges pour couvrir toutes les structures MangaFire
  var links = doc.querySelectorAll(
    '.list-body ul li a, .scroll-sm ul li a, .chapter-list li a, ' +
    '[class*="chapter"] li a, .manga-detail ul li a'
  );

  links.forEach(function(a) {
    var href = a.getAttribute('href');
    if (!href) return;
    // Garder uniquement les liens qui ressemblent à un chapitre
    if (!href.includes('/read/')) return;

    var fullHref = href.startsWith('http') ? href : baseUrl + href;
    var titleText = (a.textContent || '').trim().replace(/\s+/g, ' ');
    var numMatch = titleText.match(/chapter[\s-]*(\d+(\.\d+)?)/i);
    var num = numMatch ? numMatch[1] : (chapters.length + 1).toString();

    chapters.push({
      id: fullHref,   // L'URL complète sert d'ID pour fetch_chapter_pages
      title: titleText || 'Chapitre ' + num,
      number: num,
      date: ''
    });
  });

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
