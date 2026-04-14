// Extension RoliaScan pour SORU
// Site : front-end de MangaTaro. Page détails parseable depuis HTML.
// La liste de chapitres n'est PAS dans le HTML de /manga/{slug}/ (chargée en JS),
// MAIS elle est dans le HTML de n'importe quelle page /read/{slug}/ch*-*
// (menu déroulant "Ch. 1, Ch. 2, ..."). On fetch donc le 1er chapitre pour
// récupérer la liste complète en une seule requête.
// ⚠️ Les pages (images) nécessitent probablement une session loguée.

var baseUrl = 'https://roliascan.com';

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function isError(html) {
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return true;
  if (typeof html === 'string' && html.startsWith('ERROR:')) return true;
  return false;
}

// Extrait un slug depuis une URL /manga/{slug}/ ou /read/{slug}/ch*
function extractSlug(url) {
  var m = url.match(/\/(?:manga|read)\/([^/]+)/);
  return m ? m[1] : '';
}

// ────────────────────────────────────────────────────────────
// SEARCH
// ────────────────────────────────────────────────────────────
async function search(query, page, invoke) {
  page = page || 0;
  // RoliaScan n'expose pas de route /search directement parseable en HTML
  // (tout est JS). Essayons /browse/ avec ?search=
  var url = baseUrl + '/browse/?search=' + encodeURIComponent(query) + '&page=' + (page + 1);
  var html = await invoke('fetch_html_rendered', { url: url, waitMs: 4000 });
  if (isError(html)) return [];

  var doc = parseDOM(html);
  var results = [];
  var seen = new Set();

  // Les cartes manga sont des <a href="/manga/{slug}/"> avec une <img> cover
  doc.querySelectorAll('a[href*="/manga/"]').forEach(function(a) {
    var href = a.getAttribute('href') || '';
    // Filtre : on ne veut que les liens /manga/{slug}/, pas /manga/ tout court
    if (!href.match(/\/manga\/[^/]+\/?$/)) return;
    var fullHref = href.startsWith('http') ? href : baseUrl + (href.startsWith('/') ? href : '/' + href);
    if (seen.has(fullHref)) return;
    seen.add(fullHref);

    var img = a.querySelector('img') || a.closest('article,div,li')?.querySelector('img');
    var titleAttr = a.getAttribute('title') || '';
    var titleEl = a.querySelector('h2,h3,h4,p[class*="title"],span[class*="title"]');
    var title = titleAttr || (titleEl ? titleEl.textContent.trim() : '') || a.textContent.trim();
    if (!title || title.length < 2) return;

    var cover = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
    if (cover && !cover.startsWith('http')) cover = baseUrl + cover;

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
// GET POPULAR (homepage)
// ────────────────────────────────────────────────────────────
async function getPopular(page, invoke) {
  page = page || 0;
  var url = baseUrl + '/home/';
  var html = await invoke('fetch_html_rendered', { url: url, waitMs: 4000 });
  if (isError(html)) return [];

  var doc = parseDOM(html);
  var results = [];
  var seen = new Set();

  doc.querySelectorAll('a[href*="/manga/"]').forEach(function(a) {
    var href = a.getAttribute('href') || '';
    if (!href.match(/\/manga\/[^/]+\/?$/)) return;
    var fullHref = href.startsWith('http') ? href : baseUrl + (href.startsWith('/') ? href : '/' + href);
    if (seen.has(fullHref)) return;
    seen.add(fullHref);

    var img = a.querySelector('img');
    var titleAttr = a.getAttribute('title') || '';
    var title = titleAttr || a.textContent.trim();
    if (!title || title.length < 2) return;

    var cover = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
    if (cover && !cover.startsWith('http')) cover = baseUrl + cover;

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
// GET MANGA DETAILS
// ────────────────────────────────────────────────────────────
async function getMangaDetails(mangaId, invoke) {
  // mangaId est une URL /manga/{slug}/
  var html = await invoke('fetch_html', { url: mangaId });
  if (isError(html)) {
    html = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 3000 });
    if (isError(html)) return null;
  }

  var doc = parseDOM(html);
  var details = { id: mangaId, source_id: 'roliascan' };

  // Titre : <h1> sur la page
  var h1 = doc.querySelector('h1');
  if (h1) details.title = h1.textContent.trim();

  // Cover : <img alt="Cover for ..."> ou la première image OG
  var cover = doc.querySelector('img[alt^="Cover for"]')
           || doc.querySelector('meta[property="og:image"]')
           || doc.querySelector('img[src*="content/media/"]');
  if (cover) {
    var coverSrc = cover.getAttribute('src') || cover.getAttribute('content') || '';
    if (coverSrc && !coverSrc.startsWith('http')) coverSrc = baseUrl + coverSrc;
    details.cover = coverSrc;
  }

  // Synopsis : meta description ou première longue paragraphe
  var desc = doc.querySelector('meta[name="description"]');
  if (desc) details.synopsis = desc.getAttribute('content') || '';
  if (!details.synopsis) {
    // Cherche un long paragraphe dans la page (hors menu/header)
    var paras = doc.querySelectorAll('p');
    for (var i = 0; i < paras.length; i++) {
      var t = paras[i].textContent.trim();
      if (t.length > 100) { details.synopsis = t; break; }
    }
  }

  // Genres : <a href="/tag/..."> dans la page
  var genres = [];
  doc.querySelectorAll('a[href*="/tag/"]').forEach(function(a) {
    var g = a.textContent.trim();
    if (g && genres.indexOf(g) === -1) genres.push(g);
  });
  if (genres.length) details.genres = genres;

  // Auteur : pas de champ fiable en HTML, on essaie de le trouver dans le texte
  // Exemple : "Rifujin na Magonote, Fujikawa Yuka" apparaît après les genres
  var authorMatch = html.match(/[A-Z][a-zA-Z]+ [a-z]+ [A-Z][a-zA-Z]+(?:,\s*[A-Z][a-zA-Z ]+)?/);
  details.author = 'Inconnu'; // safe default

  // Statut : "Ongoing" / "Completed" / "Hiatus" présent en texte libre
  if (/Ongoing/i.test(html)) details.status = 'Ongoing';
  else if (/Completed/i.test(html)) details.status = 'Completed';
  else if (/Hiatus/i.test(html)) details.status = 'Hiatus';
  else details.status = 'Ongoing';

  return details;
}

// ────────────────────────────────────────────────────────────
// GET CHAPTERS
// ────────────────────────────────────────────────────────────
// Trick : la page /manga/{slug}/ ne contient PAS la liste de chapitres dans
// son HTML (chargée en JS). Mais la page /read/{slug}/ch1-{id}/ contient le
// menu déroulant complet avec tous les chapitres. On y accède en suivant le
// bouton "Read" de la page manga qui pointe vers le premier chapitre.
async function getChapters(mangaId, invoke) {
  // Étape 1 : trouver l'URL du premier chapitre depuis la page manga
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

  // Étape 2 : fetch la page du 1er chapitre qui contient le menu complet
  var readHtml = await invoke('fetch_html', { url: readUrl });
  if (isError(readHtml)) {
    readHtml = await invoke('fetch_html_rendered', { url: readUrl, waitMs: 3000 });
    if (isError(readHtml)) return [];
  }

  var readDoc = parseDOM(readHtml);
  var chapters = [];
  var seen = new Set();

  // Le menu déroulant contient des <option> ou des <a> avec "Ch. N"
  // On privilégie les <a href="/read/{slug}/chN-ID">
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

  // Tri décroissant par numéro (plus récent en haut)
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
// RoliaScan charge les pages via un appel XHR à `chapter-content?chapter_id=N`.
// L'endpoint exact dépend du CMS WordPress (thème mangapeak). On tente plusieurs
// variantes connues. Le contenu est un JSON qui liste les URLs d'images
// hébergées sur mangataro.yachts (ou équivalent CDN).
//
// Le chapterId est une URL /read/{slug}/ch{N}-{chapter_id}/ — on extrait l'ID
// numérique de fin pour l'appel API.
async function getPages(chapterId, invoke) {
  // Extraire l'ID numérique du chapitre depuis l'URL
  var idMatch = chapterId.match(/-(\d+)\/?$/);
  if (!idMatch) {
    console.warn('[ROLIA] Impossible d\'extraire l\'ID du chapitre depuis:', chapterId);
    return await getPagesFallback(chapterId, invoke);
  }
  var numericChapterId = idMatch[1];

  // Liste d'endpoints API candidats (le thème mangapeak peut les exposer
  // sous différents préfixes selon sa config).
  var apiCandidates = [
    baseUrl + '/wp-json/mangapeak/v1/chapter-content?chapter_id=' + numericChapterId,
    baseUrl + '/wp-json/mp/v1/chapter-content?chapter_id=' + numericChapterId,
    baseUrl + '/wp-admin/admin-ajax.php?action=chapter_content&chapter_id=' + numericChapterId,
    baseUrl + '/api/chapter-content?chapter_id=' + numericChapterId,
    baseUrl + '/chapter-content?chapter_id=' + numericChapterId
  ];

  for (var i = 0; i < apiCandidates.length; i++) {
    try {
      var raw = await invoke('fetch_html', { url: apiCandidates[i] });
      if (isError(raw)) continue;
      // L'endpoint doit retourner du JSON
      if (!raw || (!raw.trim().startsWith('{') && !raw.trim().startsWith('['))) continue;

      var data = JSON.parse(raw);
      var pages = extractPagesFromJson(data);
      if (pages.length > 0) {
        console.log('[ROLIA] ✅ API OK (' + apiCandidates[i] + ') →', pages.length, 'pages');
        return pages;
      }
    } catch(e) {
      // Cette variante d'URL ne marche pas, on essaie la suivante
    }
  }

  // Fallback : charger la page avec Chromium et récupérer les <img>
  console.log('[ROLIA] API candidates échouées, fallback DOM rendu');
  return await getPagesFallback(chapterId, invoke);
}

// Extrait les URLs d'images depuis une réponse JSON quelconque.
// Le thème mangapeak retourne probablement { images: [...] } ou { pages: [...] }
// ou { data: { images: [...] } }, on cherche toutes les variantes.
function extractPagesFromJson(data) {
  var images = null;
  if (data.images && Array.isArray(data.images)) images = data.images;
  else if (data.pages && Array.isArray(data.pages)) images = data.pages;
  else if (data.data && data.data.images && Array.isArray(data.data.images)) images = data.data.images;
  else if (data.data && data.data.pages && Array.isArray(data.data.pages)) images = data.data.pages;
  else if (data.result && data.result.images && Array.isArray(data.result.images)) images = data.result.images;
  else if (Array.isArray(data)) images = data;

  if (!images) {
    // Dernier recours : cherche récursivement n'importe quel tableau d'URLs d'images
    var found = findImageArray(data);
    if (found) images = found;
  }

  if (!images) return [];

  var pages = [];
  images.forEach(function(item) {
    var url = typeof item === 'string' ? item : (item.url || item.src || item.image || item.path || '');
    if (!url) return;
    // Certaines API retournent des chemins relatifs — on préfixe avec le CDN par défaut
    if (!url.startsWith('http')) {
      if (url.startsWith('/storage/')) url = 'https://mangataro.yachts' + url;
      else if (url.startsWith('storage/')) url = 'https://mangataro.yachts/' + url;
      else return; // inconnu, on skippe
    }
    pages.push(url);
  });
  return pages;
}

// Recherche récursive d'un tableau qui ressemble à une liste d'URLs d'images
function findImageArray(obj, depth) {
  depth = depth || 0;
  if (depth > 5 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    // Est-ce que ce tableau contient des strings qui ressemblent à des URLs d'images ?
    if (obj.length > 0 && obj.every(function(x) {
      return typeof x === 'string' && /\.(webp|jpe?g|png)(\?|$)/i.test(x);
    })) return obj;
    // Ou des objets avec un champ url/src
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

// Fallback : charger la page entière avec Chromium et scraper les <img>
async function getPagesFallback(chapterId, invoke) {
  var html = await invoke('fetch_html_rendered', { url: chapterId, waitMs: 6000 });
  if (isError(html)) return [];

  var doc = parseDOM(html);
  var pages = [];
  var seen = new Set();

  doc.querySelectorAll('img').forEach(function(img) {
    var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (!src) return;
    // Exclusions : assets du site (logo, thème, covers), keep only CDN images
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
