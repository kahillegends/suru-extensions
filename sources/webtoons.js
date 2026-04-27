// Extension Webtoons (LINE Webtoons) pour SORU
// Site : webtoons.com — la plateforme officielle de LINE/Naver
//
// Particularités :
// - Le CDN d'images (webtoon-phinf.pstatic.net) exige Referer = https://www.webtoons.com/
//   sinon 403 → le mapping CDN_REFERER_MAP dans main.js gère ça automatiquement.
// - Les chapitres (épisodes) sont paginés sur la page list : ?page=1, ?page=2, etc.
//   On boucle pour récupérer la liste complète.
// - Certains chapitres utilisent "MotionToon" (animations) au lieu de simples
//   images. Pas géré (rare, ~5% des séries) → on skip ces séries.
//
// Adapté de l'extension Mihon Webtoons (keiyoushi/extensions-source) au format
// SORU avec invoke('fetch_html'), invoke('fetch_html_rendered'), etc.

var baseUrl = 'https://www.webtoons.com';
var lang = 'en'; // changer en 'fr', 'es', 'de', etc. pour d'autres langues

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function isError(html) {
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return true;
  if (typeof html === 'string' && html.startsWith('ERROR:')) return true;
  return false;
}

// Normalise une URL relative ou absolue en URL absolue webtoons.com.
function absoluteUrl(href) {
  if (!href) return '';
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return baseUrl + href;
  return baseUrl + '/' + href;
}

// Extrait l'URL d'image depuis un <img>, en gérant le lazy-load.
function extractImgUrl(img) {
  if (!img) return '';
  var candidates = [
    img.getAttribute('data-url'),    // Webtoons stocke souvent l'URL réelle ici
    img.getAttribute('data-src'),
    img.getAttribute('data-lazy-src'),
    img.getAttribute('src'),
  ];
  for (var i = 0; i < candidates.length; i++) {
    var u = candidates[i];
    if (!u || typeof u !== 'string') continue;
    u = u.trim();
    if (!u || u.startsWith('data:') || u.length < 10) continue;
    return absoluteUrl(u);
  }
  return '';
}

// Extrait le title_no depuis une URL Webtoons (= ID stable de la série).
function extractTitleNo(url) {
  var m = url.match(/[?&]title_no=(\d+)/);
  return m ? m[1] : '';
}

// ────────────────────────────────────────────────────────────
// PARSEUR DE GRILLE GÉNÉRIQUE
// La home, le ranking, le search et les pages de genres ont la même structure
// de carte : <a href="/en/{genre}/{slug}/list?title_no={id}">. On extrait
// titre + cover + URL en évitant les doublons par title_no.
// ────────────────────────────────────────────────────────────
function parseMangaList(html) {
  var doc = parseDOM(html);
  var results = [];
  var seenIds = new Set();

  doc.querySelectorAll('a[href*="/list?title_no="]').forEach(function(a) {
    var href = a.getAttribute('href') || '';
    var fullHref = absoluteUrl(href);
    var titleNo = extractTitleNo(fullHref);
    if (!titleNo) return;
    if (seenIds.has(titleNo)) return;
    seenIds.add(titleNo);

    // Le titre est dans <p class="subj">, <strong class="subj">, ou attribut alt de l'img
    var img = a.querySelector('img');
    var subjEl = a.querySelector('.subj, p.subj, strong.subj');
    var title = '';
    if (subjEl) title = subjEl.textContent.trim();
    if (!title && img) title = img.getAttribute('alt') || '';
    if (!title) title = a.getAttribute('title') || '';
    title = title.trim();
    if (!title || title.length < 2) return;

    // Nettoyer les badges "UP", "NEW", numéros de ranking, etc.
    title = title.replace(/^[\s"]*\d+[\s"]*/, '').replace(/^(UP|NEW|HOT)\s+/i, '').trim();
    if (!title) return;

    var cover = extractImgUrl(img);

    results.push({
      id: fullHref,
      title: title,
      cover: cover,
      source_id: 'webtoons'
    });
  });

  return results;
}

// ────────────────────────────────────────────────────────────
// SEARCH
// ────────────────────────────────────────────────────────────
async function search(query, page, invoke) {
  page = page || 0;
  if (!query || typeof query !== 'string') return [];

  // Webtoons search ne pagine pas dans l'interface mobile/web standard.
  // On renvoie [] pour les pages > 0 → pas de "voir plus" infini.
  if (page > 0) return [];

  // 🟢 Le HTML de /en/search rendu côté serveur contient parfois 0 carte
  // — les résultats sont peuplés en JS. On utilise directement fetch_html_rendered
  // pour laisser Chromium exécuter le JS de la page.
  var url = baseUrl + '/' + lang + '/search?keyword=' + encodeURIComponent(query);
  var html = await invoke('fetch_html_rendered', { url: url, waitMs: 5000 });
  if (isError(html)) {
    // Fallback sur le HTML brut au cas où
    html = await invoke('fetch_html', { url: url });
    if (isError(html)) return [];
  }

  var results = parseMangaList(html);
  console.log('[WEBTOONS] search("' + query + '") →', results.length, 'résultats');
  return results;
}

// ────────────────────────────────────────────────────────────
// GET POPULAR
// ────────────────────────────────────────────────────────────
// Page 0 : la home contient ~80 manga (trending + popular + daily + originals + canvas)
// Page 1+ : essayer le ranking trending paginé
async function getPopular(page, invoke) {
  page = page || 0;

  if (page === 0) {
    var url = baseUrl + '/' + lang + '/';
    var html = await invoke('fetch_html', { url: url });
    if (isError(html)) {
      html = await invoke('fetch_html_rendered', { url: url, waitMs: 4000 });
      if (isError(html)) return [];
    }
    var results = parseMangaList(html);
    console.log('[WEBTOONS] getPopular(0) →', results.length, 'manga');
    return results;
  }

  // Page 1+ : on fetch le ranking originals paginé. Webtoons accepte ?page=N
  // sur certaines pages mais pas toutes. On essaie deux URLs candidates.
  var candidates = [
    baseUrl + '/' + lang + '/originals?page=' + (page + 1),
    baseUrl + '/' + lang + '/dailySchedule?page=' + (page + 1),
  ];

  for (var i = 0; i < candidates.length; i++) {
    try {
      var html2 = await invoke('fetch_html', { url: candidates[i] });
      if (isError(html2)) continue;
      var r = parseMangaList(html2);
      if (r.length > 0) {
        console.log('[WEBTOONS] getPopular(' + page + ') via ' + candidates[i] + ' →', r.length);
        return r;
      }
    } catch(e) {}
  }

  console.log('[WEBTOONS] getPopular(' + page + ') : pagination non disponible → []');
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
  var details = { id: mangaId, source_id: 'webtoons' };

  // Titre : <h1 class="subj"> ou <h3 class="subj"> selon le layout
  var titleEl = doc.querySelector('h1.subj, h3.subj, .detail_header .subj, meta[property="og:title"]');
  if (titleEl) {
    details.title = (titleEl.tagName === 'META'
      ? titleEl.getAttribute('content')
      : titleEl.textContent).trim();
  }

  // Cover : img dans le header detail, ou og:image en fallback
  var coverEl = doc.querySelector('.detail_body img, .detail_header img, meta[property="og:image"]');
  if (coverEl) {
    var coverSrc = coverEl.tagName === 'META'
      ? coverEl.getAttribute('content')
      : extractImgUrl(coverEl);
    if (coverSrc) details.cover = absoluteUrl(coverSrc);
  }

  // Synopsis : <p class="summary"> ou meta description
  var synEl = doc.querySelector('p.summary, .detail_body .summary, meta[property="og:description"]');
  if (synEl) {
    details.synopsis = (synEl.tagName === 'META'
      ? synEl.getAttribute('content')
      : synEl.textContent).trim();
  }

  // Auteur : <a class="author"> ou <a href="/creator/...">
  var authorEl = doc.querySelector('.author_area, .author, a[href*="/creator/"]');
  details.author = authorEl ? authorEl.textContent.trim().split('\n')[0].trim() : 'Inconnu';

  // Genre : extrait depuis l'URL (/{genre}/{slug}/...) ou depuis <h2 class="genre">
  var genreFromUrl = '';
  var gm = mangaId.match(/\/[a-z]{2}\/([a-z\-]+)\//);
  if (gm) genreFromUrl = gm[1].replace(/-/g, ' ');
  var genreEl = doc.querySelector('h2.genre, .genre');
  var genres = [];
  if (genreEl) {
    var gtxt = genreEl.textContent.trim();
    if (gtxt) genres.push(gtxt);
  } else if (genreFromUrl) {
    genres.push(genreFromUrl);
  }
  details.genres = genres;

  // Statut : "Ongoing" / "Completed" / "Hiatus" — Webtoons indique parfois
  // dans .day_info ou par un badge. Par défaut "Ongoing".
  if (/\bcompleted\b/i.test(html)) details.status = 'Completed';
  else if (/\bhiatus\b/i.test(html)) details.status = 'Hiatus';
  else details.status = 'Ongoing';

  return details;
}

// ────────────────────────────────────────────────────────────
// GET CHAPTERS
// ────────────────────────────────────────────────────────────
// Webtoons pagine sa liste d'épisodes (~10 par page). On boucle sur les pages
// jusqu'à ce qu'on ait tout, ou jusqu'à hit un cap de sécurité (50 pages).
//
// 🟢 IMPORTANT : on utilise fetch_html_rendered partout parce que le HTML
// brut renvoyé par Webtoons ne contient pas toujours #_listUl peuplé. Le
// rendu JS garantit qu'on récupère les vraies cards d'épisodes.
async function getChapters(mangaId, invoke) {
  var allChapters = [];
  var seen = new Set();
  var maxPages = 50; // garde-fou : ~500 chapitres max
  var titleNo = extractTitleNo(mangaId);
  if (!titleNo) {
    console.warn('[WEBTOONS] Pas de title_no dans:', mangaId);
    return [];
  }

  // Construit l'URL de pagination en preservant le path original
  function pageUrl(p) {
    // On retire toute occurrence existante de page= puis on ajoute la nouvelle
    var clean = mangaId.replace(/[?&]page=\d+/g, '');
    return clean + (clean.includes('?') ? '&' : '?') + 'page=' + p;
  }

  for (var p = 1; p <= maxPages; p++) {
    var url = pageUrl(p);
    var html;
    try {
      // Rendu JS systématique : Webtoons exige du JS pour peupler #_listUl
      html = await invoke('fetch_html_rendered', { url: url, waitMs: 3000 });
    } catch(e) { break; }
    if (isError(html)) {
      // Fallback sur le HTML brut, sinon on abandonne
      try { html = await invoke('fetch_html', { url: url }); }
      catch(e) { break; }
      if (isError(html)) break;
    }

    var doc = parseDOM(html);
    var newOnPage = 0;

    // 🟢 Sélecteur ultra-permissif : tous les liens vers /viewer?title_no=X
    // peu importe le wrapper (a, li, div). On filtre ensuite par title_no.
    var nodes = doc.querySelectorAll('a[href*="/viewer?title_no="], a[href*="viewer?title_no="]');

    nodes.forEach(function(a) {
      var href = a.getAttribute('href') || '';
      if (!href.includes('viewer?title_no=')) return;
      var fullHref = absoluteUrl(href);

      // Match le bon title_no pour éviter les contaminations (ex. "stories liées")
      if (extractTitleNo(fullHref) !== titleNo) return;
      if (seen.has(fullHref)) return;
      seen.add(fullHref);

      // Numéro d'épisode : depuis &episode_no=N ou texte "#N"
      var episodeNo = '';
      var em = fullHref.match(/[?&]episode_no=(\d+)/);
      if (em) episodeNo = em[1];
      else {
        var txt = a.textContent || '';
        var nm = txt.match(/#\s*(\d+)/);
        if (nm) episodeNo = nm[1];
      }

      // Titre du chapitre : <span class="subj">, <p class="subj">, ou texte du lien
      var titleEl = a.querySelector('.subj, p.subj, span.subj');
      var chapTitle = titleEl ? titleEl.textContent.trim() : a.textContent.trim();
      // Tronque à la première ligne (Webtoons met parfois la date en dessous)
      chapTitle = chapTitle.split('\n')[0].trim();
      if (!chapTitle) chapTitle = 'Episode ' + episodeNo;

      // Date : <span class="date">
      var dateEl = a.querySelector('.date');
      var date = dateEl ? dateEl.textContent.trim() : '';

      allChapters.push({
        id: fullHref,
        title: chapTitle,
        number: episodeNo,
        date: date
      });
      newOnPage++;
    });

    console.log('[WEBTOONS] page=' + p + ' → ' + newOnPage + ' nouveaux épisodes (total: ' + allChapters.length + ')');

    // Si la page n'a apporté aucun nouveau chapitre, c'est qu'on a dépassé
    // la dernière page de pagination → on s'arrête.
    if (newOnPage === 0) break;
  }

  // Tri décroissant par numéro d'épisode (récent en haut, comme Mihon)
  allChapters.sort(function(a, b) {
    var na = parseInt(a.number, 10); if (isNaN(na)) na = -1;
    var nb = parseInt(b.number, 10); if (isNaN(nb)) nb = -1;
    return nb - na;
  });

  console.log('[WEBTOONS] getChapters →', allChapters.length, 'épisodes pour title_no=' + titleNo);
  return allChapters;
}

// ────────────────────────────────────────────────────────────
// GET PAGES
// ────────────────────────────────────────────────────────────
// La page viewer contient #_imageList img._images avec l'URL de chaque
// image dans data-url (pas src — src est un placeholder transparent).
// ⚠️ Les images sur le CDN webtoon-phinf.pstatic.net nécessitent
// Referer = https://www.webtoons.com/, géré par CDN_REFERER_MAP dans main.js.
async function getPages(chapterId, invoke) {
  var html = await invoke('fetch_html', { url: chapterId });
  if (isError(html)) {
    html = await invoke('fetch_html_rendered', { url: chapterId, waitMs: 3000 });
    if (isError(html)) return [];
  }

  var doc = parseDOM(html);
  var pages = [];
  var seen = new Set();

  // Sélecteur principal Webtoons (depuis Mihon)
  var imgs = doc.querySelectorAll('#_imageList img._images, #_imageList img');
  if (imgs.length === 0) {
    // Fallback : tous les <img> dans la zone reader
    imgs = doc.querySelectorAll('.viewer_img img, .viewer_lst img');
  }

  imgs.forEach(function(img) {
    var url = extractImgUrl(img);
    if (!url) return;
    // Filtre : que les vraies images de pages (sur le CDN Webtoons)
    if (!/pstatic\.net|webtoon/i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    pages.push(url);
  });

  if (pages.length === 0) {
    console.warn('[WEBTOONS] Aucune image trouvée pour:', chapterId);
    console.warn('[WEBTOONS] (Possible MotionToon — non supporté)');
  } else {
    console.log('[WEBTOONS] getPages →', pages.length, 'pages');
  }
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
