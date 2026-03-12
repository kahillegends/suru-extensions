// Extension SushiScan pour SORU
var baseUrl = 'https://sushiscan.net';

function fetchHTML(url, invoke) {
  return invoke('fetch_html', { url });
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

async function getPopular(page, invoke) {
  page = page || 0;
  var url = baseUrl + '/catalogue/?page=' + (page + 1) + '&order=popular';
  var html = await fetchHTML(url, invoke);
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];
  var doc = parseDOM(html);
  var results = [];
  doc.querySelectorAll('.bsx').forEach(function(el) {
    var a = el.querySelector('a');
    var img = el.querySelector('img');
    var title = el.querySelector('.tt') || a;
    if (!a) return;
    results.push({
      id: a.getAttribute('href') || '',
      title: (title ? title.textContent : '').trim(),
      cover: (img ? (img.getAttribute('src') || img.getAttribute('data-src')) : '') || '',
      source_id: 'sushiscan'
    });
  });
  return results;
}

async function search(query, page, invoke) {
  page = page || 0;
  var url = baseUrl + '/page/' + (page + 1) + '/?s=' + encodeURIComponent(query);
  var html = await fetchHTML(url, invoke);
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];
  var doc = parseDOM(html);
  var results = [];
  doc.querySelectorAll('.bsx').forEach(function(el) {
    var a = el.querySelector('a');
    var img = el.querySelector('img');
    var title = el.querySelector('.tt') || a;
    if (!a) return;
    results.push({
      id: a.getAttribute('href') || '',
      title: (title ? title.textContent : '').trim(),
      cover: (img ? (img.getAttribute('src') || img.getAttribute('data-src')) : '') || '',
      source_id: 'sushiscan'
    });
  });
  return results;
}

async function getMangaDetails(mangaId, invoke) {
  var html = await fetchHTML(mangaId, invoke);
  if (isCloudflare(html)) return null;
  var doc = parseDOM(html);

  var titleEl = doc.querySelector('.entry-title');
  var title = titleEl ? titleEl.textContent.trim() : '';

  var coverEl = doc.querySelector('.thumbook img') || doc.querySelector('.thumb img');
  var cover = coverEl ? (coverEl.getAttribute('src') || coverEl.getAttribute('data-src') || '') : '';

  var synopsisEl = doc.querySelector('.entry-content p') || doc.querySelector('[itemprop="description"]') || doc.querySelector('.synops');
  var synopsis = synopsisEl ? synopsisEl.textContent.trim() : '';

  var author = 'Inconnu';
  var authorSelectors = ['.fmed b', '[itemprop="author"]', '.infotable tr:nth-child(2) td:last-child', '.tsinfo .imptdt:nth-child(2) i'];
  for (var i = 0; i < authorSelectors.length; i++) {
    try {
      var el = doc.querySelector(authorSelectors[i]);
      if (el && el.textContent.trim() && el.textContent.trim() !== '-') { author = el.textContent.trim(); break; }
    } catch(e) {}
  }

  var status = 'En cours';
  var statusEl = doc.querySelector('.tsinfo .imptdt:first-child i') || doc.querySelector('.infotable tr:first-child td:last-child');
  if (statusEl) {
    var s = statusEl.textContent.trim().toLowerCase();
    if (s.includes('terminé') || s.includes('completed') || s.includes('fini')) status = 'Terminé';
    else if (s.includes('pause') || s.includes('hiatus')) status = 'En pause';
  }

  var genres = [];
  doc.querySelectorAll('.mgen a').forEach(function(el) { genres.push(el.textContent.trim()); });

  return { id: mangaId, title: title, cover: cover, synopsis: synopsis, author: author, status: status, genres: genres, source_id: 'sushiscan' };
}

async function getChapters(mangaId, invoke) {
  var html = await fetchHTML(mangaId, invoke);
  if (isCloudflare(html)) return [];
  var doc = parseDOM(html);
  var chapters = [];
  doc.querySelectorAll('#chapterlist li').forEach(function(el) {
    var a = el.querySelector('a');
    if (!a) return;
    var numEl = el.querySelector('.chapternum');
    var dateEl = el.querySelector('.chapterdate');
    chapters.push({
      id: a.getAttribute('href') || '',
      title: (numEl ? numEl.textContent : a.textContent).trim(),
      number: numEl ? numEl.textContent.trim() : '',
      date: dateEl ? dateEl.textContent.trim() : ''
    });
  });
  return chapters;
}

async function getPages(chapterId, invoke) {
  await invoke('warmup_page', { pageUrl: chapterId, cdnUrl: 'https://c.sushiscan.net/' });
  var html = await invoke('fetch_html', { url: chapterId });
  if (isCloudflare(html)) return [];

  var doc = parseDOM(html);
  var pages = [];

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

  if (pages.length === 0) {
    try {
      var m = html.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
      if (m) {
        var d = JSON.parse(m[1]);
        if (d.sources && d.sources[0] && d.sources[0].images) {
          pages = d.sources[0].images.map(function(img) { return img.replace('http://', 'https://'); });
        }
      }
    } catch(e) {}
  }

  if (pages.length === 0) {
    doc.querySelectorAll('#readerarea img').forEach(function(img) {
      var src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
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
