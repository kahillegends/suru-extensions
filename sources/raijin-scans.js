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
// 🟢 Étendu pour supporter les `style="background-image: url(...)"` car le
// thème custom Raijin utilise parfois un <div> avec background-image au lieu
// d'un <img> classique pour les covers de leurs cards.
function extractImgUrl(img) {
  if (!img) return '';
  var candidates = [
    img.getAttribute('data-lazy-src'),
    img.getAttribute('data-src'),
    img.getAttribute('data-original'),
    img.getAttribute('data-cfsrc'),
    img.getAttribute('data-setbg'),
    img.getAttribute('data-bg'),
    img.getAttribute('data-image'),
    img.getAttribute('src')
  ];
  var srcset = img.getAttribute('data-lazy-srcset') || img.getAttribute('srcset') || '';
  if (srcset) {
    var first = srcset.split(',')[0].trim().split(/\s+/)[0];
    if (first) candidates.unshift(first);
  }
  // Background-image inline style
  var style = img.getAttribute('style') || '';
  if (style) {
    var bgMatch = style.match(/background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/i);
    if (bgMatch) candidates.unshift(bgMatch[1]);
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

// Cherche aussi un background-image dans un container parent (cards Raijin
// utilisent parfois <div class="cover" style="background-image:...">)
function extractCoverFromContainer(container) {
  if (!container) return '';
  // 1. Essai via <img> classique
  var img = container.querySelector('img');
  var fromImg = extractImgUrl(img);
  if (fromImg) return fromImg;

  // 2. Essai via background-image sur n'importe quel élément du container
  var elsWithBg = container.querySelectorAll('[style*="background-image"], [style*="background:"]');
  for (var i = 0; i < elsWithBg.length; i++) {
    var style = elsWithBg[i].getAttribute('style') || '';
    var m = style.match(/url\(['"]?([^'")]+)['"]?\)/i);
    if (m && m[1]) {
      var u = m[1].trim();
      if (u && !u.startsWith('data:') && u.length > 10) {
        if (u.startsWith('//')) u = 'https:' + u;
        if (!u.startsWith('http')) u = absoluteUrl(u);
        return u;
      }
    }
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

  var GENERIC = ['manhwa', 'manhua', 'manga', 'webtoon', 'comic', 'comics', 'series', 'en cours', 'terminé', 'completed', 'ongoing'];
  function isGeneric(t) {
    if (!t) return true;
    var lc = t.trim().toLowerCase();
    return GENERIC.indexOf(lc) >= 0 || lc.length < 3;
  }

  // 🟢 Nettoie un titre candidat de tout le bruit : numéros de chapitre,
  // dates, badges, ET surtout les IDs WordPress qui sortent en suffixe
  // (ex. "Murim Login 639187" → "Murim Login").
  function cleanTitle(t) {
    if (!t) return '';
    return t
      .split('\n')[0]
      .replace(/\s+/g, ' ')
      .replace(/^(Ch\.?\s*\d+\s*)+/i, '')        // "Ch. 12 ..."
      .replace(/(New|Premium|HOT|UP)\s*$/i, '')  // badges en fin
      .replace(/\s+\d{5,}\s*$/, '')              // ID WordPress en suffixe (5+ chiffres)
      .replace(/^\d+\s+/, '')                    // numéro de ranking en préfixe
      .trim();
  }

  doc.querySelectorAll('a[href*="/manga/"]').forEach(function(a) {
    var href = a.getAttribute('href') || '';
    var m = href.match(/\/manga\/([a-z0-9-]+)\/?(?:\?|#|$)/i);
    if (!m) return;
    var slug = m[1];
    if (seenSlugs.has(slug)) return;
    seenSlugs.add(slug);

    var fullHref = absoluteUrl(href);

    var container = a.closest('article, li, div[class*="card"], div[class*="manga"], div[class*="item"], div[class*="entry"], .page-item-detail, .c-tabs-item__content, .swiper-slide')
                 || a.parentElement
                 || a;

    var img = container.querySelector('img');

    // Stratégie de titre : on collecte tous les candidats, on les nettoie,
    // on garde le premier qui n'est ni générique ni un numéro de chapitre.
    var candidates = [];
    if (img) candidates.push(img.getAttribute('alt'));
    candidates.push(a.getAttribute('title'));
    var titleEl = container.querySelector('.post-title, .tt, h1, h2, h3, h4, h5, .manga-title');
    if (titleEl) candidates.push(titleEl.textContent);
    candidates.push(a.textContent);

    var title = '';
    for (var i = 0; i < candidates.length; i++) {
      var c = cleanTitle(candidates[i]);
      if (c && !isGeneric(c) && !/^ch(?:apitre|apter)?\.?\s*\d+/i.test(c)) {
        title = c;
        break;
      }
    }

    // 🟢 SI aucun titre utilisable n'est trouvé, on REJETTE la card.
    // C'est mieux que d'afficher une carte sans rien (avec juste "En cours"
    // qui vient de l'UI SORU). Le user verra moins de cards mais elles
    // auront toutes un titre lisible.
    if (!title) return;

    // Cover : <img>, srcset, lazy-load, OU background-image dans le container
    var cover = extractCoverFromContainer(container);
    // Filtrer les placeholders (drapeau coréen, logo, etc.)
    if (cover && /placeholder|drapeau|flag|default|\/logo|\/themes\/|favicon/i.test(cover)) {
      cover = '';
    }

    results.push({
      id: fullHref,
      title: title,
      cover: cover,
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

  // 🟢 Mots-clés génériques à REJETER pour le titre — sur le thème custom Raijin,
  // un h1 contient parfois juste le badge de catégorie ("Manhwa", "Manhua",
  // "Manga"), pas le vrai titre de la série.
  var GENERIC_TITLES = ['manhwa', 'manhua', 'manga', 'webtoon', 'comic', 'comics', 'series'];
  function isGenericTitle(t) {
    if (!t) return true;
    var lc = t.trim().toLowerCase();
    return GENERIC_TITLES.indexOf(lc) >= 0 || lc.length < 3;
  }

  // Titre : og:title en PREMIER (toujours fiable sur WordPress), puis fallbacks
  var title = '';
  var ogTitle = doc.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    title = (ogTitle.getAttribute('content') || '').trim();
    // Nettoyer suffixes type " - Raijin Scans" / " | Raijin Scans"
    title = title.replace(/\s*[-|–]\s*Raijin\s*Scans?.*$/i, '').trim();
  }
  if (isGenericTitle(title)) {
    var titleEl = doc.querySelector('.post-title h1, .post-title h3, h1.entry-title, .manga-info h1, .summary_content h1');
    if (titleEl) {
      var candidate = titleEl.textContent.trim();
      if (!isGenericTitle(candidate)) title = candidate;
    }
  }
  // Dernier recours : extraire depuis le synopsis "Lecture gratuite de XXX en français"
  if (isGenericTitle(title)) {
    var synFromMeta = doc.querySelector('meta[property="og:description"]');
    if (synFromMeta) {
      var d = synFromMeta.getAttribute('content') || '';
      var fromSyn = d.match(/Lecture gratuite de\s+(.+?)\s+en français/i);
      if (fromSyn) title = fromSyn[1].trim();
    }
  }
  // Vraiment dernier recours : depuis le slug de l'URL
  if (isGenericTitle(title)) {
    var slugFromUrl = mangaId.match(/\/manga\/([a-z0-9-]+)/i);
    if (slugFromUrl) {
      title = slugFromUrl[1].replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }
  }
  details.title = title;

  // Cover : og:image en PREMIER (toujours la vraie cover)
  var cover = '';
  var ogImage = doc.querySelector('meta[property="og:image"]');
  if (ogImage) {
    cover = (ogImage.getAttribute('content') || '').trim();
    if (cover && !cover.startsWith('http')) cover = absoluteUrl(cover);
  }
  // Fallback DOM si og:image est un placeholder (drapeau coréen, etc.)
  // ou si elle pointe vers le logo du site
  function isPlaceholderCover(c) {
    if (!c) return true;
    return /placeholder|logo|default|no-image|drapeau|flag|\/themes\/|favicon/i.test(c);
  }
  if (isPlaceholderCover(cover)) {
    // Essai 1 : sélecteurs Madara/MangaStream classiques
    var coverEl = doc.querySelector('.summary_image img, .manga-info-pic img, .thumb img, .thumbook img, .tab-summary img');
    var fromDom = extractImgUrl(coverEl);
    if (fromDom && !isPlaceholderCover(fromDom)) {
      cover = fromDom;
    } else {
      // Essai 2 : background-image sur le container de detail
      var detailContainer = doc.querySelector('.summary_image, .manga-info, .post-content, .detail-content, .entry-content');
      if (detailContainer) {
        var fromBg = extractCoverFromContainer(detailContainer);
        if (fromBg && !isPlaceholderCover(fromBg)) cover = fromBg;
      }
    }
  }
  details.cover = cover;

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
  var statusSelectors = ['.post-status .summary-content', '.tsinfo .imptdt:first-child i', '.infotable tr:first-child td:last-child'];
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
  details.status = status;

  // Genres
  var genres = [];
  doc.querySelectorAll('.genres-content a, .mgen a, .seriestugenre a, .wp-manga-tags-list a').forEach(function(el) {
    var g = el.textContent.trim();
    if (g && genres.indexOf(g) === -1) genres.push(g);
  });
  details.genres = genres;

  console.log('[RAIJIN] getMangaDetails → titre="' + details.title + '" cover=' + (details.cover ? 'oui' : 'non'));
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
