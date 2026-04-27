// Extension Raijin Scans pour SORU
// Support optimisé pour les thèmes MangaStream et Madara (les plus courants)

var baseUrl = 'https://raijin-scans.fr';

function fetchHTML(url, invoke) {
  return invoke('fetch_html', { url: url });
}

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function isCloudflare(html) {
  if (!html || html === 'TIMEOUT' || html.startsWith('ERROR:')) return true;
  if (html === 'CF_BLOCKED') return true;
  if (html.includes('just a moment') && html.includes('checking your browser')) return true;
  if (html.includes('cf-browser-verification')) return true;
  if (html.includes('challenge-running')) return true;
  if (html.includes('_cf_chl_opt')) return true;
  return false;
}

// Récupère la vraie URL d'image en contournant le lazy-loading
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

async function getPopular(page, invoke) {
  page = page || 0;
  // Essai de l'URL catalogue typique (MangaStream)
  var url = baseUrl + '/series/?page=' + (page + 1) + '&order=popular';
  var html = await fetchHTML(url, invoke);
  
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];
  
  // Fallback si la page /series/ n'existe pas, on tente la racine ou /manga/
  if (html.includes('404 Not Found') || html.includes('Page not found')) {
      url = baseUrl + '/manga/?page=' + (page + 1) + '&order=popular';
      html = await fetchHTML(url, invoke);
  }

  var doc = parseDOM(html);
  var results = [];
  
  // Sélecteurs universels: .bsx (MangaStream), .page-item-detail (Madara), .manga-card
  doc.querySelectorAll('.bsx, .page-item-detail, .manga-card, .utao').forEach(function(el) {
    var a = el.querySelector('a');
    var img = el.querySelector('img');
    var title = el.querySelector('.tt, .post-title, h3, h4') || a;
    if (!a) return;
    
    var href = a.getAttribute('href') || '';
    if(!href.startsWith('http')) href = baseUrl + href;

    results.push({
      id: href,
      title: (title ? title.textContent : '').trim(),
      cover: extractImgUrl(img),
      source_id: 'raijin-scans'
    });
  });
  return results;
}

async function search(query, page, invoke) {
  page = page || 0;
  // Recherche WordPress standard
  var url = baseUrl + '/page/' + (page + 1) + '/?s=' + encodeURIComponent(query) + '&post_type=wp-manga';
  var html = await fetchHTML(url, invoke);
  
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];
  var doc = parseDOM(html);
  var results = [];
  
  doc.querySelectorAll('.bsx, .c-tabs-item__content, .page-item-detail, .manga-card, .utao').forEach(function(el) {
    var a = el.querySelector('a');
    var img = el.querySelector('img');
    var title = el.querySelector('.tt, .post-title, h3, h4') || a;
    if (!a) return;

    var href = a.getAttribute('href') || '';
    if(!href.startsWith('http')) href = baseUrl + href;

    results.push({
      id: href,
      title: (title ? title.textContent : '').trim(),
      cover: extractImgUrl(img),
      source_id: 'raijin-scans'
    });
  });
  return results;
}

async function getMangaDetails(mangaId, invoke) {
  var html = await fetchHTML(mangaId, invoke);
  if (isCloudflare(html)) return null;
  var doc = parseDOM(html);

  var titleEl = doc.querySelector('.entry-title, .post-title h1, .manga-info h1');
  var title = titleEl ? titleEl.textContent.trim() : '';

  var coverEl = doc.querySelector('.thumbook img, .thumb img, .summary_image img, .manga-info-pic img');
  var cover = extractImgUrl(coverEl);

  var synopsisEl = doc.querySelector('.entry-content p, .summary__content p, [itemprop="description"], .synops p');
  var synopsis = synopsisEl ? synopsisEl.textContent.trim() : '';

  var author = 'Inconnu';
  var authorSelectors = ['.fmed b', '[itemprop="author"]', '.author-content a', '.infotable tr:nth-child(2) td:last-child'];
  for (var i = 0; i < authorSelectors.length; i++) {
    try {
      var el = doc.querySelector(authorSelectors[i]);
      if (el && el.textContent.trim() && el.textContent.trim() !== '-') { 
          author = el.textContent.trim(); 
          break; 
      }
    } catch(e) {}
  }

  var status = 'En cours';
  var statusEl = doc.querySelector('.tsinfo .imptdt:first-child i, .post-status .summary-content, .infotable tr:first-child td:last-child');
  if (statusEl) {
    var s = statusEl.textContent.trim().toLowerCase();
    if (s.includes('terminé') || s.includes('completed') || s.includes('fini')) status = 'Terminé';
    else if (s.includes('pause') || s.includes('hiatus')) status = 'En pause';
  }

  var genres = [];
  doc.querySelectorAll('.mgen a, .genres-content a').forEach(function(el) { 
      genres.push(el.textContent.trim()); 
  });

  return { 
      id: mangaId, 
      title: title, 
      cover: cover, 
      synopsis: synopsis, 
      author: author, 
      status: status, 
      genres: genres, 
      source_id: 'raijin-scans' 
  };
}

async function getChapters(mangaId, invoke) {
  var html = await fetchHTML(mangaId, invoke);
  if (isCloudflare(html)) return [];
  var doc = parseDOM(html);
  var chapters = [];
  
  // Sélecteurs pour MangaStream (#chapterlist) et Madara (wp-manga-chapter)
  doc.querySelectorAll('#chapterlist li, li.wp-manga-chapter, .chbox').forEach(function(el) {
    var a = el.querySelector('a');
    if (!a) return;
    
    var numEl = el.querySelector('.chapternum, .chapter-num');
    var dateEl = el.querySelector('.chapterdate, .chapter-release-date');
    
    var href = a.getAttribute('href') || '';
    if(!href.startsWith('http')) href = baseUrl + href;

    chapters.push({
      id: href,
      title: (numEl ? numEl.textContent : a.textContent).trim().replace(/\n/g, '').replace(/\s+/g, ' '),
      number: numEl ? numEl.textContent.replace(/[^0-9.]/g, '').trim() : '',
      date: dateEl ? dateEl.textContent.trim() : ''
    });
  });
  
  return chapters;
}

async function getPages(chapterId, invoke) {
  var html = await fetchHTML(chapterId, invoke);
  if (isCloudflare(html)) return [];

  var doc = parseDOM(html);
  var pages = [];

  // 1. Extraction JS (Méthode MangaStream)
  var scripts = doc.querySelectorAll('script');
  for (var i = 0; i < scripts.length; i++) {
    var content = scripts[i].textContent || '';
    if (content.includes('ts_reader.run')) {
      try {
        var match = content.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
        if (match) {
          var data = JSON.parse(match[1]);
          if (data.sources && data.sources[0] && data.sources[0].images) {
            pages = data.sources[0].images.map(function(img) { return img.replace('http://', 'https://'); });
          }
        }
      } catch(e) {}
      break;
    }
  }

  // 2. Fallback DOM Reader (Madara ou sites avec structure HTML classique)
  if (pages.length === 0) {
    doc.querySelectorAll('#readerarea img, .reading-content img, .page-break img').forEach(function(img) {
      var src = extractImgUrl(img);
      if (src && src.startsWith('http') && !src.includes('lazyload')) {
        pages.push(src.replace('http://', 'https://'));
      }
    });
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
