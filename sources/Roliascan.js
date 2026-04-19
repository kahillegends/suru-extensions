// Extension RoliaScan pour SORU
// Site : roliascan.com — thème "mangapeak", API JSON sous /auth/
//
// ✅ FIX search (était cassé) : l'API /auth/hot-searches répond au format
//    { success:true, data: { manga:[...], manhwa:[...], manhua:[...] } }
//    L'ancien extracteur ne reconnaissait pas cette forme et mappait les
//    mauvais champs (cherchait `title` au lieu de `manga_title`, `url` au
//    lieu de `search_url`, etc.) → 0 résultat même quand l'API répondait.
//
// ✅ FIX "voir plus" en boucle : getPopular ignorait le paramètre `page` et
//    refetchait /home/ à chaque appel → mêmes mangas en boucle. On traite
//    page 0 via le HTML de /home, et on renvoie [] pour page >= 1 quand
//    l'API paginée ne répond pas (stop propre au lieu de boucler).

var baseUrl = 'https://roliascan.com';

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function isError(html) {
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return true;
  if (typeof html === 'string' && html.startsWith('ERROR:')) return true;
  return false;
}

// Essaie de parser une réponse comme du JSON. Retourne null si ce n'est pas
// du JSON (ex. HTML renvoyé par une 404, une page de login, etc.).
function tryParseJson(raw) {
  if (isError(raw)) return null;
  var t = typeof raw === 'string' ? raw.trim() : '';
  if (!t || (t[0] !== '{' && t[0] !== '[')) return null;
  try { return JSON.parse(t); } catch(e) { return null; }
}

// ────────────────────────────────────────────────────────────
// EXTRACTEUR UNIVERSEL DES RÉSULTATS JSON
// Gère la vraie forme RoliaScan { data: { manga, manhwa, manhua, novel } }
// ET les formes plus génériques (results, items, data[], hits, etc.).
// ────────────────────────────────────────────────────────────
function extractSearchResults(data) {
  if (!data || typeof data !== 'object') return [];

  // RoliaScan/mangapeak : { success, data: { manga:[], manhwa:[], manhua:[], novel:[] } }
  // On déballe `data.data` si présent, sinon on reste à la racine.
  var payload = (data.data && typeof data.data === 'object' && !Array.isArray(data.data))
    ? data.data
    : data;

  var items = [];

  // Shape RoliaScan : listes séparées par type
  ['manga', 'manhwa', 'manhua', 'novel'].forEach(function(key) {
    if (Array.isArray(payload[key])) items = items.concat(payload[key]);
  });

  // Shapes génériques de fallback (autres thèmes WP, APIs custom)
  if (items.length === 0) {
    if (Array.isArray(payload)) items = payload;
    else if (Array.isArray(payload.results)) items = payload.results;
    else if (Array.isArray(payload.items)) items = payload.items;
    else if (Array.isArray(payload.data)) items = payload.data;
    else if (Array.isArray(payload.mangas)) items = payload.mangas;
    else if (Array.isArray(payload.posts)) items = payload.posts;
    else if (Array.isArray(payload.hits)) items = payload.hits;
    else if (Array.isArray(payload.comics)) items = payload.comics;
  }

  if (items.length === 0) return [];

  var results = [];
  var seen = new Set();

  items.forEach(function(item) {
    if (!item || typeof item !== 'object') return;

    // Titre : champs RoliaScan puis fallbacks
    var title = item.manga_title || item.title || item.name || item.post_title || '';
    if (typeof title === 'object') {
      title = title.rendered || title.raw || title.romaji || title.english || '';
    }
    if (!title || typeof title !== 'string') return;
    title = title.trim();
    if (!title) return;

    // URL : champs RoliaScan puis fallbacks. Reconstruit depuis slug si besoin.
    var url = item.search_url || item.url || item.link || item.permalink || item.href || '';
    if (!url) {
      var slug = item.manga_slug || item.slug || item.post_name || '';
      if (slug) url = baseUrl + '/manga/' + slug + '/';
    }
    if (!url || typeof url !== 'string') return;
    if (!url.startsWith('http')) url = baseUrl + (url.startsWith('/') ? url : '/' + url);
    if (!url.includes('/manga/')) return; // on ignore users/groups/chapitres

    if (seen.has(url)) return;
    seen.add(url);

    // Cover : cover_url RoliaScan puis fallbacks
    var cover = item.cover_url || item.cover || item.thumbnail || item.image
             || item.poster || '';
    if (typeof cover === 'object' && cover) {
      cover = cover.large || cover.url || cover.src || '';
    }
    if (cover && typeof cover === 'string' && !cover.startsWith('http')) {
      cover = baseUrl + (cover.startsWith('/') ? cover : '/' + cover);
    }

    results.push({
      id: url,
      title: title,
      cover: cover || '',
      source_id: 'roliascan'
    });
  });

  return results;
}

// Parse une page HTML (home, browse, résultats WP) et extrait les liens /manga/
function parseSearchHtml(html) {
  var doc = parseDOM(html);
  var results = [];
  var seen = new Set();

  doc.querySelectorAll('a[href*="/manga/"]').forEach(function(a) {
    var href = a.getAttribute('href') || '';
    // Ne garder que les liens vers la page d'un manga, pas les liens vers des chapitres
    if (!href.match(/\/manga\/[^/?#]+\/?$/)) return;

    var fullHref = href.startsWith('http') ? href : baseUrl + (href.startsWith('/') ? href : '/' + href);
    if (seen.has(fullHref)) return;
    seen.add(fullHref);

    // Conteneur : on essaie de trouver la card parente pour extraire titre + cover
    var container = a.closest('article, li, div[class*="card"], div[class*="manga"], div[class*="item"], div[class*="entry"]')
                 || a.parentElement || a;

    var img = container.querySelector('img');
    var titleAttr = a.getAttribute('title') || (img ? img.getAttribute('alt') : '') || '';
    var titleEl = container.querySelector('h1, h2, h3, h4, p[class*="title"], span[class*="title"], a[class*="title"]');
    var title = (titleAttr || (titleEl ? titleEl.textContent : '') || a.textContent || '').trim();

    // Nettoyer le préfixe "Read " que RoliaScan met parfois devant le titre
    title = title.replace(/^(Read|Lire)\s+/i, '').trim();
    if (!title || title.length < 2) return;

    var cover = '';
    if (img) {
      cover = img.getAttribute('src')
           || img.getAttribute('data-src')
           || img.getAttribute('data-lazy-src')
           || '';
    }
    if (cover && !cover.startsWith('http')) cover = baseUrl + cover;
    // Exclure logos / thèmes / placeholders
    if (cover && (cover.includes('logo') || cover.includes('/themes/') || cover.includes('placeholder'))) {
      cover = '';
    }

    results.push({
      id: fullHref,
      title: title,
      cover: cover,
      source_id: 'roliascan'
    });
  });

  return results;
}

// ────────────────────────────────────────────────────────────
// SEARCH
// ────────────────────────────────────────────────────────────
async function search(query, page, invoke) {
  page = page || 0;

  // La recherche RoliaScan n'est pas paginée côté modal (⌘K). On renvoie les
  // résultats uniquement pour page 0 et rien pour les pages suivantes → pas de
  // "voir plus" infini sur le search.
  if (page > 0) return [];
  if (!query || typeof query !== 'string') return [];

  var encoded = encodeURIComponent(query);

  // Candidats API sous /auth/ — observés ou probables (pattern mangapeak).
  // /auth/hot-searches confirme que cette base existe et renvoie du JSON.
  var apiCandidates = [
    baseUrl + '/auth/search?q=' + encoded,
    baseUrl + '/auth/search?query=' + encoded,
    baseUrl + '/auth/search?term=' + encoded,
    baseUrl + '/auth/search-comics?q=' + encoded,
    baseUrl + '/auth/search-manga?q=' + encoded,
    baseUrl + '/auth/live-search?q=' + encoded,
    baseUrl + '/auth/quick-search?q=' + encoded,
    baseUrl + '/auth/comics?search=' + encoded,
    baseUrl + '/auth/comics?q=' + encoded,
    baseUrl + '/auth/manga?search=' + encoded,
    baseUrl + '/auth/manga?q=' + encoded,
    baseUrl + '/auth/browse?search=' + encoded,
    baseUrl + '/auth/browse?q=' + encoded,
  ];

  for (var i = 0; i < apiCandidates.length; i++) {
    var url = apiCandidates[i];
    try {
      var raw = await invoke('fetch_html', { url: url });
      var data = tryParseJson(raw);
      if (!data) continue;

      // Certaines APIs renvoient {success:false} en cas d'erreur → on skippe
      if (data.success === false) continue;

      var results = extractSearchResults(data);
      if (results.length > 0) {
        console.log('[ROLIA] ✅ search(' + query + ') via ' + url + ' →', results.length);
        return results;
      }
    } catch(e) {
      // Passe au candidat suivant
    }
  }

  // Fallback 1 : WordPress search (si le site utilise WP pour le front)
  try {
    var wpUrl = baseUrl + '/?s=' + encoded + '&post_type=manga';
    var html = await invoke('fetch_html', { url: wpUrl });
    if (!isError(html)) {
      var r = parseSearchHtml(html);
      if (r.length > 0) {
        console.log('[ROLIA] ✅ search(' + query + ') via /?s= →', r.length);
        return r;
      }
    }
  } catch(e) {}

  // Fallback 2 : page /browse/ rendue avec JS (recherche via modale)
  // La page fait ses requêtes AJAX en interne, on attend et on récupère le DOM.
  try {
    var browseUrl = baseUrl + '/browse/?search=' + encoded;
    var html = await invoke('fetch_html_rendered', { url: browseUrl, waitMs: 6000 });
    if (!isError(html)) {
      var r = parseSearchHtml(html);
      if (r.length > 0) {
        console.log('[ROLIA] ✅ search(' + query + ') via /browse rendu →', r.length);
        return r;
      }
    }
  } catch(e) {}

  console.warn('[ROLIA] ❌ aucune méthode de recherche n\'a donné de résultats pour:', query);
  return [];
}

// ────────────────────────────────────────────────────────────
// GET POPULAR (homepage)
// ────────────────────────────────────────────────────────────
// Page 0 : le HTML de /home contient déjà ~30 manga directement (server-rendered)
// Page 1+ : /home ne pagine pas. /browse/ est un SPA qui charge le contenu en
//           AJAX après render. On utilise fetch_html_rendered (Chromium) pour
//           que le JS s'exécute et peuple le DOM, puis on parse les cartes.
async function getPopular(page, invoke) {
  page = page || 0;

  if (page === 0) {
    var url = baseUrl + '/home/';
    var html = await invoke('fetch_html', { url: url });
    if (isError(html)) {
      html = await invoke('fetch_html_rendered', { url: url, waitMs: 4000 });
      if (isError(html)) return [];
    }
    var results = parseSearchHtml(html);
    console.log('[ROLIA] getPopular(0) →', results.length, 'manga');
    return results;
  }

  // Page 1+ : on essaie d'abord les endpoints API /auth/ paginés qui pourraient
  // renvoyer du JSON (rapide, pas de rendu Chromium nécessaire).
  var apiCandidates = [
    baseUrl + '/auth/comics?page=' + page + '&sort=latest',
    baseUrl + '/auth/comics?page=' + page,
    baseUrl + '/auth/manga?page=' + page + '&sort=latest',
    baseUrl + '/auth/manga?page=' + page,
    baseUrl + '/auth/browse?page=' + page + '&sort=latest',
    baseUrl + '/auth/browse?page=' + page,
    baseUrl + '/auth/home?page=' + page,
    baseUrl + '/auth/latest?page=' + page,
    baseUrl + '/auth/popular?page=' + page,
    baseUrl + '/auth/list?page=' + page,
    baseUrl + '/auth/list-manga?page=' + page,
    baseUrl + '/auth/recent?page=' + page,
    baseUrl + '/auth/recently-added?page=' + page,
  ];

  for (var i = 0; i < apiCandidates.length; i++) {
    try {
      var raw = await invoke('fetch_html', { url: apiCandidates[i] });
      var data = tryParseJson(raw);
      if (!data) continue;
      if (data.success === false) continue;
      var r = extractSearchResults(data);
      if (r.length > 0) {
        console.log('[ROLIA] getPopular(' + page + ') API ' + apiCandidates[i] + ' →', r.length);
        return r;
      }
    } catch(e) {}
  }

  // Aucun endpoint API n'a répondu utilement → on passe au rendu JS de /browse/.
  // Chromium exécute le JS qui peuple la grille, on attend longtemps (8s) et on
  // parse le DOM résultant. Plusieurs paramètres d'URL tentés au cas où le SPA
  // utilise un schéma différent (page / p / offset / permalink).
  var renderedCandidates = [
    baseUrl + '/browse/?page=' + (page + 1) + '&sort=latest',
    baseUrl + '/browse/?page=' + page + '&sort=latest',
    baseUrl + '/browse/?p=' + (page + 1) + '&sort=latest',
    baseUrl + '/browse/page/' + (page + 1) + '/',
    baseUrl + '/browse/?offset=' + (page * 30) + '&sort=latest',
  ];

  for (var j = 0; j < renderedCandidates.length; j++) {
    try {
      var html = await invoke('fetch_html_rendered', { url: renderedCandidates[j], waitMs: 8000 });
      if (isError(html)) continue;
      var r2 = parseSearchHtml(html);
      if (r2.length > 0) {
        console.log('[ROLIA] getPopular(' + page + ') rendu ' + renderedCandidates[j] + ' →', r2.length);
        return r2;
      }
    } catch(e) {}
  }

  console.log('[ROLIA] getPopular(' + page + ') : pagination non disponible → []');
  return [];
}

// ────────────────────────────────────────────────────────────
// GET MANGA DETAILS
// ────────────────────────────────────────────────────────────
async function getMangaDetails(mangaId, invoke) {
  var html = await invoke('fetch_html', { url: mangaId });
  if (isError(html)) {
    html = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 3000 });
    if (isError(html)) return null;
  }

  var doc = parseDOM(html);
  var details = { id: mangaId, source_id: 'roliascan' };

  // Titre : h1 de la page
  var h1 = doc.querySelector('h1');
  if (h1) details.title = h1.textContent.trim();

  // Cover : image principale
  var cover = doc.querySelector('img[alt^="Cover for"]')
           || doc.querySelector('meta[property="og:image"]')
           || doc.querySelector('img[src*="content/media/"]');
  if (cover) {
    var coverSrc = cover.getAttribute('src') || cover.getAttribute('content') || '';
    if (coverSrc && !coverSrc.startsWith('http')) coverSrc = baseUrl + coverSrc;
    details.cover = coverSrc;
  }

  // Synopsis
  var desc = doc.querySelector('meta[name="description"]');
  if (desc) details.synopsis = desc.getAttribute('content') || '';
  if (!details.synopsis) {
    var paras = doc.querySelectorAll('p');
    for (var i = 0; i < paras.length; i++) {
      var t = paras[i].textContent.trim();
      if (t.length > 100) { details.synopsis = t; break; }
    }
  }

  // Genres
  var genres = [];
  doc.querySelectorAll('a[href*="/tag/"]').forEach(function(a) {
    var g = a.textContent.trim();
    if (g && genres.indexOf(g) === -1) genres.push(g);
  });
  if (genres.length) details.genres = genres;

  details.author = 'Inconnu';

  if (/Ongoing/i.test(html)) details.status = 'Ongoing';
  else if (/Completed/i.test(html)) details.status = 'Completed';
  else if (/Hiatus/i.test(html)) details.status = 'Hiatus';
  else details.status = 'Ongoing';

  return details;
}

// ────────────────────────────────────────────────────────────
// GET CHAPTERS
// ────────────────────────────────────────────────────────────
// La page /manga/{slug}/ ne contient pas la liste (chargée en JS). Mais la
// page d'un chapitre /read/{slug}/ch*-*/ contient le menu déroulant complet.
async function getChapters(mangaId, invoke) {
  var mangaHtml = await invoke('fetch_html', { url: mangaId });
  if (isError(mangaHtml)) {
    mangaHtml = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 3000 });
    if (isError(mangaHtml)) return [];
  }

  var mangaDoc = parseDOM(mangaHtml);
  var readLink = null;
  mangaDoc.querySelectorAll('a[href*="/read/"]').forEach(function(a) {
    var href = a.getAttribute('href') || '';
    if (href.match(/\/read\/[^/]+\/ch[\d.]+-\d+/)) {
      if (!readLink) readLink = href;
    }
  });
  if (!readLink) {
    console.warn('[ROLIA] Pas de lien /read/ trouvé sur la page manga');
    return [];
  }
  var readUrl = readLink.startsWith('http') ? readLink : baseUrl + readLink;

  var readHtml = await invoke('fetch_html', { url: readUrl });
  if (isError(readHtml)) {
    readHtml = await invoke('fetch_html_rendered', { url: readUrl, waitMs: 3000 });
    if (isError(readHtml)) return [];
  }

  var readDoc = parseDOM(readHtml);
  var chapters = [];
  var seen = new Set();

  readDoc.querySelectorAll('a[href*="/read/"], option[value*="/read/"]').forEach(function(el) {
    var href = el.getAttribute('href') || el.getAttribute('value') || '';
    var m = href.match(/\/read\/[^/]+\/ch([\d.]+)-(\d+)/);
    if (!m) return;

    var fullHref = href.startsWith('http') ? href : baseUrl + href;
    if (seen.has(fullHref)) return;
    seen.add(fullHref);

    var num = m[1];
    var text = el.textContent.trim();
    chapters.push({
      id: fullHref,
      title: text || ('Chapter ' + num),
      number: num,
      date: ''
    });
  });

  chapters.sort(function(a, b) {
    var na = parseFloat(a.number);
    var nb = parseFloat(b.number);
    if (isNaN(na)) na = -1;
    if (isNaN(nb)) nb = -1;
    return nb - na;
  });

  return chapters;
}

// ────────────────────────────────────────────────────────────
// GET PAGES
// ────────────────────────────────────────────────────────────
async function getPages(chapterId, invoke) {
  var idMatch = chapterId.match(/-(\d+)\/?$/);
  if (!idMatch) {
    console.warn('[ROLIA] Impossible d\'extraire l\'ID du chapitre depuis:', chapterId);
    return await getPagesFallback(chapterId, invoke);
  }
  var numericChapterId = idMatch[1];

  var apiCandidates = [
    baseUrl + '/auth/chapter-content?chapter_id=' + numericChapterId,
    baseUrl + '/auth/chapter?id=' + numericChapterId,
    baseUrl + '/auth/chapter?chapter_id=' + numericChapterId,
    baseUrl + '/auth/chapter/' + numericChapterId,
    baseUrl + '/auth/chapter-pages?chapter_id=' + numericChapterId,
    baseUrl + '/auth/pages?chapter_id=' + numericChapterId,
    baseUrl + '/auth/read?chapter_id=' + numericChapterId,
    baseUrl + '/auth/read/' + numericChapterId
  ];

  for (var i = 0; i < apiCandidates.length; i++) {
    try {
      var raw = await invoke('fetch_html', { url: apiCandidates[i] });
      var data = tryParseJson(raw);
      if (!data) continue;
      if (data.success === false) continue;

      var pages = extractPagesFromJson(data);
      if (pages.length > 0) {
        console.log('[ROLIA] ✅ pages API (' + apiCandidates[i] + ') →', pages.length);
        return pages;
      }
    } catch(e) {}
  }

  console.log('[ROLIA] API candidates échouées, fallback DOM rendu');
  return await getPagesFallback(chapterId, invoke);
}

function extractPagesFromJson(data) {
  if (!data || typeof data !== 'object') return [];
  var payload = (data.data && typeof data.data === 'object' && !Array.isArray(data.data))
    ? data.data
    : data;

  var images = null;
  if (Array.isArray(payload.images)) images = payload.images;
  else if (Array.isArray(payload.pages)) images = payload.pages;
  else if (payload.result && Array.isArray(payload.result.images)) images = payload.result.images;
  else if (Array.isArray(payload)) images = payload;

  if (!images) {
    var found = findImageArray(data);
    if (found) images = found;
  }
  if (!images) return [];

  var pages = [];
  images.forEach(function(item) {
    var url = '';
    if (typeof item === 'string') url = item;
    else if (Array.isArray(item) && typeof item[0] === 'string') url = item[0]; // format MangaFire
    else if (item && typeof item === 'object') {
      url = item.url || item.src || item.image || item.path || item.image_url || '';
    }
    if (!url) return;
    if (!url.startsWith('http')) {
      if (url.startsWith('/storage/')) url = 'https://mangataro.yachts' + url;
      else if (url.startsWith('storage/')) url = 'https://mangataro.yachts/' + url;
      else if (url.startsWith('/content/')) url = baseUrl + url;
      else return;
    }
    pages.push(url);
  });
  return pages;
}

function findImageArray(obj, depth) {
  depth = depth || 0;
  if (depth > 5 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj.every(function(x) {
      return typeof x === 'string' && /\.(webp|jpe?g|png)(\?|$)/i.test(x);
    })) return obj;
    if (obj.length > 0 && obj.every(function(x) {
      return x && typeof x === 'object' && (x.url || x.src || x.image || x.path);
    })) return obj;
    return null;
  }
  for (var k in obj) {
    var res = findImageArray(obj[k], depth + 1);
    if (res) return res;
  }
  return null;
}

async function getPagesFallback(chapterId, invoke) {
  var html = await invoke('fetch_html_rendered', { url: chapterId, waitMs: 6000 });
  if (isError(html)) return [];

  var doc = parseDOM(html);
  var pages = [];
  var seen = new Set();

  doc.querySelectorAll('img').forEach(function(img) {
    var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (!src) return;
    if (src.includes('logo') || src.includes('/themes/') || src.includes('/cover-')
        || src.includes('content/media/') || src.includes('favicon')) return;
    if (!/\.(webp|jpe?g|png)(\?|$)/i.test(src)) return;
    if (!src.startsWith('http')) return;
    if (seen.has(src)) return;
    seen.add(src);
    pages.push(src);
  });

  return pages;
}

// ────────────────────────────────────────────────────────────
// EXPORT
// ────────────────────────────────────────────────────────────
({
  baseUrl: baseUrl,
  getPopular: getPopular,
  search: search,
  getMangaDetails: getMangaDetails,
  getChapters: getChapters,
  getPages: getPages
});
