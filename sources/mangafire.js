// Extension MangaFire pour SORU
var baseUrl = 'https://mangafire.to';

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function extractCards(doc) {
  var results = [];
  var seen = new Set();

  var cards = doc.querySelectorAll('.unit, .original.card-lg, div.manga, .item');

  if (cards.length === 0) {
    doc.querySelectorAll('a[href*="/manga/"]').forEach(function(a) {
      var img = a.querySelector('img');
      if (!img) return;
      var href = a.getAttribute('href');
      var fullHref = href.startsWith('http') ? href : baseUrl + href;
      if (seen.has(fullHref)) return;
      seen.add(fullHref);
      results.push({
        id: fullHref,
        title: a.getAttribute('title') || img.getAttribute('alt') || a.textContent.trim() || 'Inconnu',
        cover: img.getAttribute('src') || img.getAttribute('data-src') || '',
        source_id: 'mangafire'
      });
    });
    return results;
  }

  cards.forEach(function(card) {
    var a = card.querySelector('a[href*="/manga/"]') || card.querySelector('a.poster') || card.querySelector('a');
    var img = card.querySelector('img');
    if (!a || !img) return;
    var href = a.getAttribute('href');
    if (!href || !href.includes('/manga/')) return;
    var fullHref = href.startsWith('http') ? href : baseUrl + href;
    if (seen.has(fullHref)) return;
    seen.add(fullHref);
    var titleEl = card.querySelector('.info .title') || card.querySelector('.title') || card.querySelector('h3') || card.querySelector('h2');
    var titleText = titleEl ? titleEl.textContent.trim() : (img.getAttribute('alt') || 'Inconnu');
    results.push({
      id: fullHref,
      title: titleText,
      cover: img.getAttribute('src') || img.getAttribute('data-src') || '',
      source_id: 'mangafire'
    });
  });

  return results;
}

// Extraire les cards depuis le JSON AJAX de MangaFire (/ajax/search)
function extractCardsFromJson(data) {
  var results = [];
  // MangaFire retourne généralement data.result sous forme de HTML ou tableau
  if (!data || !data.result) return results;

  // Cas 1 : result est un tableau d'objets
  if (Array.isArray(data.result)) {
    data.result.forEach(function(item) {
      if (!item.id && !item.slug) return;
      var id = item.slug ? baseUrl + '/manga/' + item.slug : String(item.id);
      if (!id.startsWith('http')) id = baseUrl + '/manga/' + id;
      results.push({
        id: id,
        title: item.name || item.title || 'Inconnu',
        cover: item.poster || item.cover || item.image || '',
        source_id: 'mangafire'
      });
    });
    return results;
  }

  // Cas 2 : result est du HTML à parser
  if (typeof data.result === 'string') {
    return extractCards(parseDOM(data.result));
  }

  // Cas 3 : result.mangas ou result.items
  var list = data.result.mangas || data.result.items || data.result.data || [];
  if (Array.isArray(list)) {
    list.forEach(function(item) {
      var id = item.slug ? baseUrl + '/manga/' + item.slug : (item.id ? String(item.id) : null);
      if (!id) return;
      if (!id.startsWith('http')) id = baseUrl + '/manga/' + id;
      results.push({
        id: id,
        title: item.name || item.title || 'Inconnu',
        cover: item.poster || item.cover || item.image || '',
        source_id: 'mangafire'
      });
    });
  }

  return results;
}

// 1. POPULAIRES
async function getPopular(page, invoke) {
  page = page || 0;
  var url = baseUrl + '/filter?sort=trending&page=' + (page + 1);
  var html = await invoke('fetch_html_rendered', { url: url, waitMs: 6000, waitSelector: '.unit, div.manga, a[href*="/manga/"]' });
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return [{ id: 'cf-error', title: 'Cloudflare Bloque...', cover: '' }];
  return extractCards(parseDOM(html));
}

// 2. RECHERCHE
// MangaFire requiert un token "vrf" dans l'URL de filtre.
// On utilise fetch_search_results qui ouvre un BrowserWindow caché,
// charge la page /filter et intercepte l'appel AJAX /ajax/search
// via webRequest — ce qui nous donne le JSON avec les bons résultats.
async function search(query, page, invoke) {
  page = page || 0;

  var result = await invoke('fetch_search_results', {
    query: query,
    page: page,
    baseUrl: baseUrl
  });

  if (!result || !result.ok) {
    return [{ id: 'cf-error', title: 'Erreur de recherche...', cover: '' }];
  }

  // Cas 1 : on a intercepté le JSON AJAX
  if (result.data) {
    var cards = extractCardsFromJson(result.data);
    if (cards.length > 0) return cards;
  }

  // Cas 2 : on a récupéré le HTML rendu (fallback)
  if (result.html) {
    var cards = extractCards(parseDOM(result.html));
    if (cards.length > 0) return cards;
  }

  return [{ id: 'cf-error', title: 'Aucun résultat trouvé', cover: '' }];
}

// 3. DÉTAILS
async function getMangaDetails(mangaId, invoke) {
  var html = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 6000, waitSelector: 'h1, .poster img, .info' });
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return null;

  var doc = parseDOM(html);
  var titleEl = doc.querySelector('h1[itemprop="name"]') || doc.querySelector('.info h1') || doc.querySelector('h1');
  var imgEl = doc.querySelector('.poster img') || doc.querySelector('.cover img');
  var synEl = doc.querySelector('.synopsis .content') || doc.querySelector('.description') || doc.querySelector('[class*="synopsis"]');

  return {
    id: mangaId,
    title: titleEl ? titleEl.textContent.trim() : 'Inconnu',
    cover: imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : '',
    synopsis: synEl ? synEl.textContent.trim() : 'Aucun synopsis',
    author: 'Inconnu',
    status: 'En cours',
    genres: [],
    source_id: 'mangafire'
  };
}

// 4. CHAPITRES
async function getChapters(mangaId, invoke) {
  var html = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 8000, waitSelector: 'a[href*="/read/"]' });
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return [];

  var doc = parseDOM(html);
  var chapters = [];
  var seen = new Set();

  doc.querySelectorAll('a[href*="/read/"]').forEach(function(a) {
    var href = a.getAttribute('href');
    if (!href) return;
    var fullHref = href.startsWith('http') ? href : baseUrl + href;
    if (seen.has(fullHref)) return;
    seen.add(fullHref);

    var titleText = (a.textContent || '').trim().replace(/\s+/g, ' ');
    var numMatch = (href + ' ' + titleText).match(/chapter[-\s]*(\d+(\.\d+)?)/i);
    var num = numMatch ? numMatch[1] : (chapters.length + 1).toString();

    chapters.push({
      id: fullHref,
      title: titleText || 'Chapitre ' + num,
      number: num,
      date: ''
    });
  });

  chapters.reverse();
  return chapters;
}

// 5. PAGES DU CHAPITRE
async function getPages(chapterId, invoke) {
  var chapterUrl = String(chapterId);
  if (!chapterUrl.startsWith('http')) chapterUrl = baseUrl + chapterUrl;
  var pages = await invoke('fetch_chapter_pages', { url: chapterUrl, waitMs: 12000 });
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
