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

// 1. POPULAIRES
async function getPopular(page, invoke) {
  page = page || 0;
  var url = baseUrl + '/filter?sort=trending&page=' + (page + 1);
  var html = await invoke('fetch_html_rendered', { url: url, waitMs: 6000, waitSelector: '.unit, div.manga, a[href*="/manga/"]' });
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return [{ id: 'cf-error', title: 'Cloudflare Bloque...', cover: '' }];
  return extractCards(parseDOM(html));
}

// 2. RECHERCHE
// MangaFire requiert un paramètre "vrf" dans l'URL pour les recherches.
// Ce token est généré dynamiquement par le JS de la page.
// Stratégie : on charge d'abord /filter sans vrf pour que le JS de MangaFire
// s'exécute et redirige/charge lui-même les résultats, puis on parse le HTML rendu.
// Si ça échoue (page vide), fallback via l'API interne de MangaFire.
async function search(query, page, invoke) {
  page = page || 0;

  // Tentative 1 : URL directe, on laisse le JS de la page gérer le vrf
  var url = baseUrl + '/filter?keyword=' + encodeURIComponent(query) + '&page=' + (page + 1);
  var html = await invoke('fetch_html_rendered', {
    url: url,
    waitMs: 10000,
    waitSelector: '.unit, .original, a[href*="/manga/"]'
  });

  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') {
    return [{ id: 'cf-error', title: 'Cloudflare Bloque...', cover: '' }];
  }

  var results = extractCards(parseDOM(html));

  // Tentative 2 : si 0 résultats, MangaFire a peut-être besoin du vrf —
  // on charge la page d'accueil pour récupérer un vrf valide via l'URL
  // que MangaFire génère dans le champ de recherche, puis on recharge.
  if (results.length === 0) {
    var homeHtml = await invoke('fetch_html_rendered', {
      url: baseUrl,
      waitMs: 6000,
      waitSelector: 'form[action*="filter"], input[name="keyword"]'
    });

    if (homeHtml && homeHtml !== 'TIMEOUT' && homeHtml !== 'CF_BLOCKED') {
      var homeDoc = parseDOM(homeHtml);
      // Chercher un vrf pré-généré dans les liens de la page d'accueil
      var vrfMatch = homeHtml.match(/[?&]vrf=([^&"'\s]+)/);
      if (vrfMatch) {
        var vrfUrl = url + '&vrf=' + vrfMatch[1];
        var vrfHtml = await invoke('fetch_html_rendered', {
          url: vrfUrl,
          waitMs: 10000,
          waitSelector: '.unit, .original, a[href*="/manga/"]'
        });
        if (vrfHtml && vrfHtml !== 'TIMEOUT' && vrfHtml !== 'CF_BLOCKED') {
          results = extractCards(parseDOM(vrfHtml));
        }
      }
    }
  }

  return results;
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
