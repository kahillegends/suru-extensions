// Extension Raijin Scans pour SORU
// Site : raijin-scans.fr — CMS WordPress avec Madara en dessous + thème custom
//
// URL patterns observés :
// - Page série      : /manga/{slug}/
// - Page chapitre   : /manga/{slug}/{N}/  (ex: /manga/sword-devouring-swordmaster/25/)
// - Recherche       : /?s={query}&post_type=wp-manga
//
// Spécificités :
// - Cloudflare actif → on passe par FlareSolverr (fetch_html standard de SORU)
// - Certains chapitres sont premium (paywall PayPal) → on les parse mais le
//   reader recevra une page d'avertissement à la place des images
// - Le thème custom n'utilise PAS les sélecteurs Madara classiques (.bsx,
//   .page-item-detail) → on combine plusieurs stratégies et on filtre
//   intelligemment.

var baseUrl = 'https://raijin-scans.fr';

function fetchHTML(url, invoke) {
  return invoke('fetch_html', { url: url });
}

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function isError(html) {
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return true;
  if (typeof html === 'string' && html.startsWith('ERROR:')) return true;
  if (html.includes('just a moment') && html.includes('checking your browser')) return true;
  if (html.includes('cf-browser-verification')) return true;
  if (html.includes('challenge-running')) return true;
  return false;
}

// Récupère la vraie URL d'image en contournant le lazy-loading (Madara/WP)
function extractImgUrl(img) {
  if (!img) return '';
  var candidates = [
    img.getAttribute('data-lazy-src'),
    img.getAttribute('data-src'),
    img.getAttribute('data-original'),
    img.getAttribute('data-cfsrc'),
    img.getAttribute('data-setbg'),
    img.getAttribute('src')
  ];
  var srcset = img.getAttribute('data-lazy-srcset') || img.getAttribute('srcset') || '';
  if (srcset) {
    var first = srcset.split(',')[0].trim().split(/\s+/)[0];
    if (first) candidates.unshift(first);
  }
  for (var i = 0; i < candidates.length; i++) {
    var u = candidates[i];
    if (!u || typeof u !== 'string') continue;
    u = u.trim();
    if (!u || u.startsWith('data:') || u.length < 10) continue;
    if (!u.startsWith('http') && !u.startsWith('//')) {
      if (u.startsWith('/')) u = baseUrl + u;
      else continue;
    }
    if (u.startsWith('//')) u = 'https:' + u;
    return u;
  }
  return '';
}

function absoluteUrl(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('/')) return baseUrl + href;
  return baseUrl + '/' + href;
}

// ────────────────────────────────────────────────────────────
// PARSEUR DE GRILLE GÉNÉRIQUE
// On cherche tous les liens vers /manga/{slug}/ (page série, pas chapitre)
// dans le DOM, et on dédupe par slug. Robuste face aux changements de thème.
// ────────────────────────────────────────────────────────────
function parseMangaList(html) {
  var doc = parseDOM(html);
  var results = [];
  var seenSlugs = new Set();

  doc.querySelectorAll('a[href*="/manga/"]').forEach(function(a) {
    var href = a.getAttribute('href') || '';
    // Ne garder que les liens vers une PAGE SÉRIE (/manga/slug/), pas un chapitre
    // (/manga/slug/N/). Le pattern est : /manga/<slug-avec-tirets>/ sans rien après.
    var m = href.match(/\/manga\/([a-z0-9-]+)\/?(?:\?|#|$)/i);
    if (!m) return;
    var slug = m[1];
    if (seenSlugs.has(slug)) return;
    seenSlugs.add(slug);

    var fullHref = absoluteUrl(href);

    // Conteneur : on remonte au parent qui contient à la fois titre et image
    var container = a.closest('article, li, div[class*="card"], div[class*="manga"], div[class*="item"], div[class*="entry"], .page-item-detail, .c-tabs-item__content')
                 || a.parentElement
                 || a;

    var img = container.querySelector('img');
    var titleEl = container.querySelector('.post-title, .tt, h1, h2, h3, h4, h5, .manga-title');

    var title = '';
    if (titleEl) title = titleEl.textContent.trim();
    if (!title) title = a.getAttribute('title') || '';
    if (!title && img) title = img.getAttribute('alt') || '';
    if (!title) title = a.textContent.trim();

    // Nettoyer tout le bruit (numéros, "il y a N j", "New", "Premium", etc.)
    title = title
      .split('\n')[0]            // Premier ligne seulement
      .replace(/\s+/g, ' ')      // Espaces multiples
      .replace(/^(Ch\.?\s*\d+\s*)+/i, '') // Préfixes "Ch. 12"
      .replace(/(New|Premium|HOT|UP)\s*$/i, '')
      .trim();

    if (!title || title.length < 2) return;
    // Si le titre est juste un numéro de chapitre, c'est qu'on a chopé un lien
    // de chapitre déguisé → on skip
    if (/^ch(?:apitre|apter)?\.?\s*\d+/i.test(title)) return;

    results.push({
      id: fullHref,
      title: title,
      cover: extractImgUrl(img),
      source_id: 'raijin-scans'
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

  // Recherche WordPress standard (Madara accepte post_type=wp-manga)
  var url = baseUrl + '/page/' + (page + 1) + '/?s=' + encodeURIComponent(query) + '&post_type=wp-manga';
  var html = await fetchHTML(url, invoke);

  if (isError(html)) {
    // Retry avec rendu JS si CF bloque
    html = await invoke('fetch_html_rendered', { url: url, waitMs: 5000 });
    if (isError(html)) {
      // Cloudflare carrément persistant → erreur explicite
      return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];
    }
  }

  var results = parseMangaList(html);
  console.log('[RAIJIN] search("' + query + '") page=' + page + ' →', results.length);
  return results;
}

// ────────────────────────────────────────────────────────────
// GET POPULAR
// ────────────────────────────────────────────────────────────
// La home contient les sections "Populaires" et "Récemment ajoutés".
// Pour la pagination, on essaie plusieurs URLs Madara classiques.
async function getPopular(page, invoke) {
  page = page || 0;

  if (page === 0) {
    // Page 0 : on parse la home directement
    var url = baseUrl + '/';
    var html = await fetchHTML(url, invoke);
    if (isError(html)) {
      html = await invoke('fetch_html_rendered', { url: url, waitMs: 5000 });
      if (isError(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];
    }
    var results = parseMangaList(html);
    console.log('[RAIJIN] getPopular(0) →', results.length, 'manga');
    return results;
  }

  // Page 1+ : essai des URLs Madara standard
  var candidates = [
    baseUrl + '/manga/?m_orderby=trending&page=' + (page + 1),
    baseUrl + '/manga/page/' + (page + 1) + '/?m_orderby=trending',
    baseUrl + '/page/' + (page + 1) + '/?post_type=wp-manga&m_orderby=views',
    baseUrl + '/manga/?page=' + (page + 1),
    baseUrl + '/page/' + (page + 1) + '/?post_type=wp-manga',
  ];

  for (var i = 0; i < candidates.length; i++) {
    try {
      var html2 = await fetchHTML(candidates[i], invoke);
      if (isError(html2)) continue;
      var r = parseMangaList(html2);
      if (r.length > 0) {
        console.log('[RAIJIN] getPopular(' + page + ') via ' + candidates[i] + ' →', r.length);
        return r;
      }
    } catch(e) {}
  }

  console.log('[RAIJIN] getPopular(' + page + ') : pagination non disponible → []');
  return [];
}

// ────────────────────────────────────────────────────────────
// GET MANGA DETAILS
// ────────────────────────────────────────────────────────────
async function getMangaDetails(mangaId, invoke) {
  var html = await fetchHTML(mangaId, invoke);
  if (isError(html)) {
    html = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 4000 });
    if (isError(html)) return null;
  }
  var doc = parseDOM(html);
  var details = { id: mangaId, source_id: 'raijin-scans' };

  // Titre : essais multiples (MangaStream / Madara / thème custom)
  var titleEl = doc.querySelector('.post-title h1, .post-title h3, h1.entry-title, .manga-info h1, .summary_content h1');
  if (!titleEl) titleEl = doc.querySelector('meta[property="og:title"]');
  if (titleEl) {
    details.title = titleEl.tagName === 'META'
      ? titleEl.getAttribute('content').trim()
      : titleEl.textContent.trim();
  }

  // Cover
  var coverEl = doc.querySelector('.summary_image img, .manga-info-pic img, .thumb img, .thumbook img, .tab-summary img');
  if (!coverEl) coverEl = doc.querySelector('meta[property="og:image"]');
  if (coverEl) {
    if (coverEl.tagName === 'META') {
      details.cover = absoluteUrl(coverEl.getAttribute('content'));
    } else {
      details.cover = extractImgUrl(coverEl);
    }
  }

  // Synopsis
  var synEl = doc.querySelector('.summary__content p, .summary__content, .description-summary p, .manga-info-text p, [itemprop="description"]');
  if (!synEl) synEl = doc.querySelector('meta[property="og:description"]');
  if (synEl) {
    details.synopsis = synEl.tagName === 'META'
      ? synEl.getAttribute('content').trim()
      : synEl.textContent.trim();
  }

  // Auteur (souvent absent sur le thème custom Raijin)
  details.author = 'Inconnu';
  var authorSelectors = ['.author-content a', '.fmed b', '[itemprop="author"]', '.infotable tr:nth-child(2) td:last-child'];
  for (var i = 0; i < authorSelectors.length; i++) {
    var el = doc.querySelector(authorSelectors[i]);
    if (el && el.textContent.trim() && el.textContent.trim() !== '-') {
      details.author = el.textContent.trim().split('\n')[0].trim();
      break;
    }
  }

  // Statut
  var status = 'En cours';
  var statusSelectors = ['.post-status .summary-content', '.tsinfo .imptdt:first-child i', '.infotable tr:first-child td:last-child', '.post-content_item:contains(Status) .summary-content'];
  for (var j = 0; j < statusSelectors.length; j++) {
    try {
      var sEl = doc.querySelector(statusSelectors[j]);
      if (sEl) {
        var s = sEl.textContent.trim().toLowerCase();
        if (s.includes('terminé') || s.includes('completed') || s.includes('fini')) status = 'Terminé';
        else if (s.includes('pause') || s.includes('hiatus')) status = 'En pause';
        break;
      }
    } catch(e) {}
  }
  // Détection en dur si rien trouvé via sélecteurs
  if (status === 'En cours') {
    if (/\bterminé\b/i.test(html) && !/\ben cours\b/i.test(html)) status = 'Terminé';
  }
  details.status = status;

  // Genres
  var genres = [];
  doc.querySelectorAll('.genres-content a, .mgen a, .seriestugenre a, .wp-manga-tags-list a').forEach(function(el) {
    var g = el.textContent.trim();
    if (g && genres.indexOf(g) === -1) genres.push(g);
  });
  details.genres = genres;

  return details;
}

// ────────────────────────────────────────────────────────────
// GET CHAPTERS
// ────────────────────────────────────────────────────────────
// La page série liste tous les chapitres : sur Raijin, ils sont dans
// .wp-manga-chapter (Madara classique) ou parfois dans une liste custom.
// On combine plusieurs sélecteurs pour couvrir les deux cas.
async function getChapters(mangaId, invoke) {
  var html = await fetchHTML(mangaId, invoke);
  if (isError(html)) {
    html = await invoke('fetch_html_rendered', { url: mangaId, waitMs: 4000 });
    if (isError(html)) return [];
  }

  var doc = parseDOM(html);
  var chapters = [];
  var seen = new Set();

  // Extraire le slug de la série pour valider que les liens chapitres
  // appartiennent bien à CETTE série (pas à des "stories liées")
  var seriesSlug = '';
  var slugMatch = mangaId.match(/\/manga\/([a-z0-9-]+)/i);
  if (slugMatch) seriesSlug = slugMatch[1];

  // Sélecteurs Madara classiques + custom
  var nodes = doc.querySelectorAll('li.wp-manga-chapter a, #chapterlist li a, .chbox a, .listing-chapters_wrap a, .version-chap a');
  // Fallback : tous les liens vers /manga/{seriesSlug}/{N}/
  if (nodes.length === 0 && seriesSlug) {
    nodes = doc.querySelectorAll('a[href*="/manga/' + seriesSlug + '/"]');
  }

  nodes.forEach(function(a) {
    var href = a.getAttribute('href') || '';
    if (!href) return;

    // Match exact : /manga/{seriesSlug}/{numero}/
    var chMatch = href.match(/\/manga\/([a-z0-9-]+)\/(chapter-)?([\d.]+)\/?(?:\?|#|$)/i);
    if (!chMatch) return;

    // Garde-fou : on ne garde que les chapitres de CETTE série
    if (seriesSlug && chMatch[1] !== seriesSlug) return;

    var fullHref = absoluteUrl(href);
    if (seen.has(fullHref)) return;
    seen.add(fullHref);

    var num = chMatch[3];
    var rawText = a.textContent.trim();

    // Détection premium : "Premium", "🔒", icône lock
    var isPremium = /premium|🔒/i.test(rawText) ||
                    a.querySelector('.premium, .lock, [class*="premium"], [class*="lock"]') !== null;

    // Date : <span class="chapter-release-date"> ou <span class="chapterdate">
    var dateEl = a.parentElement ? a.parentElement.querySelector('.chapter-release-date, .chapterdate, .date') : null;
    if (!dateEl) dateEl = a.querySelector('.chapter-release-date, .chapterdate, .date');
    var date = dateEl ? dateEl.textContent.trim() : '';

    // Titre : "Chapitre N" + flag premium si applicable
    var title = 'Chapitre ' + num;
    if (isPremium) title += ' 🔒';

    chapters.push({
      id: fullHref,
      title: title,
      number: num,
      date: date
    });
  });

  // Tri décroissant par numéro
  chapters.sort(function(a, b) {
    var na = parseFloat(a.number); if (isNaN(na)) na = -1;
    var nb = parseFloat(b.number); if (isNaN(nb)) nb = -1;
    return nb - na;
  });

  console.log('[RAIJIN] getChapters →', chapters.length, 'chapitres pour', seriesSlug);
  return chapters;
}

// ────────────────────────────────────────────────────────────
// GET PAGES
// ────────────────────────────────────────────────────────────
async function getPages(chapterId, invoke) {
  var html = await fetchHTML(chapterId, invoke);
  if (isError(html)) {
    html = await invoke('fetch_html_rendered', { url: chapterId, waitMs: 5000 });
    if (isError(html)) return [];
  }

  // Vérification paywall : si la page contient "Premium" en gros et pas
  // d'images, c'est qu'on est sur un chapitre payant
  if (/abonnement|subscription|premium/i.test(html) && !/wp-content\/uploads.*\.(jpg|png|webp)/i.test(html)) {
    console.warn('[RAIJIN] Chapitre premium détecté, pas d\'accès sans abonnement');
  }

  var doc = parseDOM(html);
  var pages = [];
  var seen = new Set();

  // 1. MangaStream JS (ts_reader.run) — au cas où
  var scripts = doc.querySelectorAll('script');
  for (var i = 0; i < scripts.length; i++) {
    var content = scripts[i].textContent || '';
    if (content.includes('ts_reader.run')) {
      try {
        var match = content.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
        if (match) {
          var data = JSON.parse(match[1]);
          if (data.sources && data.sources[0] && data.sources[0].images) {
            data.sources[0].images.forEach(function(u) {
              u = u.replace('http://', 'https://');
              if (!seen.has(u)) { seen.add(u); pages.push(u); }
            });
            if (pages.length > 0) {
              console.log('[RAIJIN] getPages via ts_reader →', pages.length);
              return pages;
            }
          }
        }
      } catch(e) {}
    }
  }

  // 2. DOM Madara/custom : chercher dans #readerarea, .reading-content, .page-break
  var imgNodes = doc.querySelectorAll('#readerarea img, .reading-content img, .page-break img, .wp-manga-chapter-img, .read-container img, #chapter-images img');

  // 3. Fallback ultra-générique : toutes les images dans wp-content/uploads/
  // (ce que Madara fait par défaut). On filtre pour exclure le placeholder.
  if (imgNodes.length === 0) {
    imgNodes = doc.querySelectorAll('img[src*="wp-content/uploads"], img[data-src*="wp-content/uploads"], img[data-lazy-src*="wp-content/uploads"]');
  }

  imgNodes.forEach(function(img) {
    var src = extractImgUrl(img);
    if (!src) return;
    // Filtrer les UI (logos, icons, avatars) et garder uniquement les images de pages
    if (src.includes('/themes/') || src.includes('lazyload') || src.includes('logo')
        || src.includes('avatar') || src.includes('icon')) return;
    if (seen.has(src)) return;
    seen.add(src);
    pages.push(src.replace('http://', 'https://'));
  });

  console.log('[RAIJIN] getPages →', pages.length, 'pages');
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
