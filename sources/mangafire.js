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

  // On cible TOUTES les structures de cartes possibles sur MF
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

// 5. PAGES DU CHAPITRE (Mode Hack)
async function getPages(chapterId, invoke) {
  // On attend 10 secondes pour laisser le temps au Cloudflare de passer 
  // ET aux scripts de MangaFire de déchiffrer les images.
  var html = await invoke('fetch_html_rendered', { url: chapterId, waitMs: 10000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [];

  var doc = parseDOM(html);
  var pages = [];

  // MTHODE 1 : Chercher les balises images classiques
  doc.querySelectorAll('#page-wrapper img, .reader img, .page-break img').forEach(function(img) {
    var src = img.getAttribute('src') || img.getAttribute('data-src');
    if (src && src.startsWith('http')) {
      var lowerSrc = src.toLowerCase();
      if (!lowerSrc.includes('logo') && !lowerSrc.includes('spinner')) {
        pages.push(src);
      }
    }
  });

  // MÉTHODE 2 (Le Hack) : MF cache souvent ses images dans des variables JavaScript 
  // pour empêcher le scraping. On va chercher TOUTES les URLs d'images directement dans le texte brut de la page !
  if (pages.length === 0) {
    var regex = /"(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp|avif)[^"]*)"/gi;
    var match;
    while ((match = regex.exec(html)) !== null) {
      var url = match[1].replace(/\\/g, ''); // Nettoyer les \ d'échappement JSON
      var lowerUrl = url.toLowerCase();
      // On exclut les icônes du site pour ne garder que les planches du manga
      if (!lowerUrl.includes('logo') && !lowerUrl.includes('avatar') && !lowerUrl.includes('icon')) {
        if (!pages.includes(url)) pages.push(url);
      }
    }
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
