// Extension MangaFire pour SORU
// Utilise fetch_html_rendered massivement pour bypasser les protections JS et Cloudflare
var baseUrl = 'https://mangafire.to';

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

// 1. POPULAIRES
async function getPopular(page, invoke) {
  page = page || 0;
  var url = baseUrl + '/filter?sort=trending&page=' + (page + 1);
  var html = await invoke('fetch_html_rendered', { url: url, waitSelector: '.original.card-lg', waitMs: 3000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [{ id: 'cf-error', title: 'Cloudflare Bloque...', cover: '' }];

  var results = [];
  var doc = parseDOM(html);
  doc.querySelectorAll('.original.card-lg').forEach(function(card) {
    var a = card.querySelector('a.poster');
    var img = card.querySelector('img');
    if (a && img) {
      results.push({
        id: baseUrl + a.getAttribute('href'),
        title: img.getAttribute('alt') || '',
        cover: img.getAttribute('src') || '',
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
  var html = await invoke('fetch_html_rendered', { url: url, waitSelector: '.original.card-lg', waitMs: 3000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [{ id: 'cf-error', title: 'Cloudflare Bloque...', cover: '' }];

  var results = [];
  var doc = parseDOM(html);
  doc.querySelectorAll('.original.card-lg').forEach(function(card) {
    var a = card.querySelector('a.poster');
    var img = card.querySelector('img');
    if (a && img) {
      results.push({
        id: baseUrl + a.getAttribute('href'),
        title: img.getAttribute('alt') || '',
        cover: img.getAttribute('src') || '',
        source_id: 'mangafire'
      });
    }
  });
  return results;
}

// 3. DÉTAILS DU MANGA
async function getMangaDetails(mangaId, invoke) {
  var html = await invoke('fetch_html_rendered', { url: mangaId, waitSelector: '.info', waitMs: 3000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return null;

  var doc = parseDOM(html);
  var titleEl = doc.querySelector('h1[itemprop="name"]') || doc.querySelector('.info h1');
  var imgEl = doc.querySelector('.poster img');
  var synEl = doc.querySelector('.synopsis .content') || doc.querySelector('.description');

  return {
    id: mangaId,
    title: titleEl ? titleEl.textContent.trim() : 'Inconnu',
    cover: imgEl ? imgEl.getAttribute('src') : '',
    synopsis: synEl ? synEl.textContent.trim() : 'Aucun synopsis',
    author: 'Inconnu', // Souvent caché dans des div complexes sur MF
    status: 'En cours',
    genres: [],
    source_id: 'mangafire'
  };
}

// 4. LISTE DES CHAPITRES
async function getChapters(mangaId, invoke) {
  // Sur MF, la liste des chapitres est parfois chargée en différé
  var html = await invoke('fetch_html_rendered', { url: mangaId, waitSelector: '.list-body, .manga-detail', waitMs: 4000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [];

  var doc = parseDOM(html);
  var chapters = [];

  // Chercher les liens de chapitres dans la liste
  var items = doc.querySelectorAll('.list-body ul li a, .manga-detail ul li a');
  
  items.forEach(function(a) {
    var href = a.getAttribute('href');
    if (!href) return;
    
    var fullHref = href.startsWith('http') ? href : baseUrl + href;
    var titleEl = a.querySelector('span') || a;
    var titleText = titleEl.textContent.trim().replace(/\s+/g, ' ');

    // Extraire un numéro approximatif pour le tri
    var numMatch = titleText.match(/chapter\s*(\d+(\.\d+)?)/i);
    var num = numMatch ? numMatch[1] : (chapters.length + 1).toString();

    chapters.push({
      id: fullHref,
      title: titleText,
      number: num,
      date: '' // Date souvent absente ou mal formatée
    });
  });

  // Les chapitres sur MF sont souvent du plus ancien au plus récent, on les inverse pour Soru
  chapters.reverse();

  // Filtrer les doublons au cas où
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

// 5. PAGES DU CHAPITRE (Le Boss Final)
async function getPages(chapterId, invoke) {
  // C'est ici que MF est brutal. Ils chargent les images via un canvas ou des img chiffrées.
  // On laisse la page charger très longtemps pour que leur script décode les images.
  var html = await invoke('fetch_html_rendered', { url: chapterId, waitSelector: '.reader img, #reader img', waitMs: 6000 });
  if (html === 'TIMEOUT' || html === 'CF_BLOCKED') return [];

  var doc = parseDOM(html);
  var pages = [];

  // On cherche toutes les images dans le conteneur du lecteur
  doc.querySelectorAll('.reader img, #reader img, .page-wrapper img').forEach(function(img) {
    var src = img.getAttribute('src') || img.getAttribute('data-src');
    // On exclut les images de l'UI (boutons, logos)
    if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('spinner')) {
      pages.push(src);
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
