// Extension Phénix Scans pour SORU
// Site avec contenu chargé dynamiquement en JS — nécessite rendu navigateur
const baseUrl = 'https://phenix-scans.co';

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function isCloudflare(html) {
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return true;
  if (html.startsWith('ERROR:')) return true;
  if (html.includes('just a moment') && html.includes('checking your browser')) return true;
  if (html.includes('challenge-running') || html.includes('_cf_chl_opt')) return true;
  return false;
}

// Fetch avec rendu JS complet (contenu dynamique)
async function fetchRendered(url, invoke, waitSelector = null) {
  return await invoke('fetch_html_rendered', {
    url,
    waitSelector,
    waitMs: 3500
  });
}

async function getPopular(page = 0, invoke) {
  const url = `${baseUrl}/manga/?m_orderby=trending&page=${page + 1}`;
  // Attendre qu'un élément de manga soit présent dans le DOM
  const html = await fetchRendered(url, invoke, '.manga-title, .post-title, h3 a, .item-thumb');
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];

  const doc = parseDOM(html);
  const results = [];

  // Chercher tous les liens qui pointent vers des mangas
  const seen = new Set();
  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    // Les URLs de manga Madara ont le format /manga/nom-du-manga/
    if (!href.includes('/manga/') || href === baseUrl + '/manga/' || seen.has(href)) return;
    // Éviter les liens de navigation
    if (href.endsWith('/manga/') || href.endsWith('/manga')) return;
    seen.add(href);

    const container = a.closest('li, .bs, .bsx, article, .item, div[class*="manga"], div[class*="item"]');
    if (!container) return;

    const img = container.querySelector('img');
    const titleEl = container.querySelector('.tt, .manga-title, h3, h4, h5, [class*="title"]') || a;
    const title = (titleEl?.textContent || a.textContent || '').trim();
    if (!title || title.length < 2) return;

    results.push({
      id: href,
      title,
      cover: img?.getAttribute('data-src') || img?.getAttribute('src') || '',
      source_id: 'phenixscans'
    });
  });

  console.log('[PhenixScans] getPopular:', results.length, 'résultats');
  return results;
}

async function search(query, page = 0, invoke) {
  const url = `${baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga&page=${page + 1}`;
  const html = await fetchRendered(url, invoke, '.manga-title, .post-title, h3 a');
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];

  const doc = parseDOM(html);
  const results = [];
  const seen = new Set();

  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href.includes('/manga/') || href.endsWith('/manga/') || seen.has(href)) return;
    seen.add(href);

    const container = a.closest('li, .bs, .bsx, article, div[class*="manga"], div[class*="item"]');
    if (!container) return;

    const img = container.querySelector('img');
    const titleEl = container.querySelector('.tt, .manga-title, h3, h4, h5') || a;

    results.push({
      id: href,
      title: (titleEl?.textContent || a.textContent || '').trim(),
      cover: img?.getAttribute('data-src') || img?.getAttribute('src') || '',
      source_id: 'phenixscans'
    });
  });

  return results;
}

async function getMangaDetails(mangaId, invoke) {
  const html = await fetchRendered(mangaId, invoke, '.post-title, .manga-title, h1');
  if (isCloudflare(html)) return null;

  const doc = parseDOM(html);

  const title = (
    doc.querySelector('.post-title h1')?.textContent ||
    doc.querySelector('.post-title h3')?.textContent ||
    doc.querySelector('h1.entry-title')?.textContent ||
    doc.querySelector('h1')?.textContent ||
    ''
  ).trim();

  const cover = (
    doc.querySelector('.summary_image img')?.getAttribute('data-src') ||
    doc.querySelector('.summary_image img')?.getAttribute('src') ||
    doc.querySelector('.tab-summary img')?.getAttribute('data-src') ||
    doc.querySelector('img[class*="cover"]')?.getAttribute('src') ||
    ''
  );

  const synopsis = (
    doc.querySelector('.summary__content p')?.textContent ||
    doc.querySelector('.description-summary p')?.textContent ||
    doc.querySelector('[class*="summary"] p')?.textContent ||
    ''
  ).trim();

  let author = 'Inconnu';
  const authorEl = doc.querySelector('.author-content a') ||
    doc.querySelector('[class*="author"] a');
  if (authorEl) author = authorEl.textContent.trim();

  let status = 'En cours';
  const statusEl = doc.querySelector('.post-status .summary-content') ||
    doc.querySelector('[class*="status"] .summary-content');
  if (statusEl) {
    const s = statusEl.textContent.trim().toLowerCase();
    if (s.includes('terminé') || s.includes('completed')) status = 'Terminé';
    else if (s.includes('pause') || s.includes('hiatus')) status = 'En pause';
  }

  const genres = [];
  doc.querySelectorAll('.genres-content a, [class*="genre"] a').forEach(el => {
    const g = el.textContent.trim();
    if (g) genres.push(g);
  });

  return { id: mangaId, title, cover, synopsis, author, status, genres, source_id: 'phenixscans' };
}

async function getChapters(mangaId, invoke) {
  const html = await fetchRendered(mangaId, invoke, '.wp-manga-chapter, .chapter-item');
  if (isCloudflare(html)) return [];

  const doc = parseDOM(html);
  const chapters = [];

  doc.querySelectorAll('.wp-manga-chapter, .chapter-item, .listing-chapters_wrap li').forEach(el => {
    const a = el.querySelector('a[href]');
    if (!a) return;
    const dateEl = el.querySelector('.chapter-release-date, .chapter-date');
    chapters.push({
      id: a.getAttribute('href') || '',
      title: a.textContent.trim(),
      number: a.textContent.trim(),
      date: dateEl?.textContent.trim() || ''
    });
  });

  return chapters;
}

async function getPages(chapterId, invoke) {
  console.log('[PhenixScans] Warm-up...');
  await invoke('warmup_page', {
    pageUrl: chapterId,
    cdnUrl: baseUrl + '/'
  });

  // Les pages aussi peuvent être en JS dynamique
  const html = await fetchRendered(chapterId, invoke, '.reading-content img, .chapter-content img');
  if (isCloudflare(html)) return [];

  const doc = parseDOM(html);
  let pages = [];

  // Méthode 1 : ts_reader.run
  for (const script of doc.querySelectorAll('script')) {
    const content = script.textContent || '';
    if (content.includes('ts_reader.run')) {
      try {
        const match = content.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
        if (match) {
          const data = JSON.parse(match[1]);
          if (data.sources?.[0]?.images) {
            pages = data.sources[0].images.map(img => img.replace('http://', 'https://'));
          }
        }
      } catch(e) {}
      break;
    }
  }

  // Méthode 2 : images DOM
  if (pages.length === 0) {
    doc.querySelectorAll('.reading-content img, .read-container img, .chapter-content img, #readerarea img').forEach(img => {
      const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
      if (src && src.startsWith('http') && !src.includes('placeholder')) {
        pages.push(src.replace('http://', 'https://'));
      }
    });
  }

  console.log(`[PhenixScans] ${pages.length} pages trouvées`);
  return pages;
}

({
  baseUrl,
  getPopular,
  search,
  getMangaDetails,
  getChapters,
  getPages
});
// Site basé sur WordPress + thème Madara (même moteur que SushiScan)
const baseUrl = 'https://phenix-scans.co';

function parseDOM(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function isCloudflare(html) {
  if (!html || html === 'TIMEOUT' || html === 'CF_BLOCKED') return true;
  if (html.startsWith('ERROR:')) return true;
  if (html.includes('just a moment') && html.includes('checking your browser')) return true;
  if (html.includes('challenge-running') || html.includes('_cf_chl_opt')) return true;
  return false;
}

async function getPopular(page = 0, invoke) {
  // Madara utilise /manga/?m_orderby=trending ou /manga/?page=N
  const url = `${baseUrl}/manga/?m_orderby=trending&page=${page + 1}`;
  const html = await invoke('fetch_html', { url });
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];

  const doc = parseDOM(html);
  const results = [];

  // Debug : afficher les classes des premiers éléments pour identifier la structure
  console.log('[PhenixScans] Title:', doc.title)
  console.log('[PhenixScans] HTML length:', html.length)
  const allLinks = doc.querySelectorAll('a[href*="phenix-scans.co/manga/"]')
  console.log('[PhenixScans] Liens manga trouvés:', allLinks.length)
  if (allLinks.length > 0) {
    const parent = allLinks[0].closest('div, li, article')
    console.log('[PhenixScans] Parent classe:', parent?.className)
  }

  // Sélecteurs Madara standard
  const items = doc.querySelectorAll('.page-item-detail, .manga-item, .bsx, .c-image-hover');
  console.log('[PhenixScans] Items trouvés:', items.length)
  items.forEach(el => {
    const a = el.querySelector('a[href]');
    const img = el.querySelector('img');
    const titleEl = el.querySelector('.post-title a, .tt, .title, h3 a, h5 a');
    if (!a) return;
    const cover = img?.getAttribute('data-src') || img?.getAttribute('src') || '';
    results.push({
      id: a.getAttribute('href') || '',
      title: (titleEl?.textContent || a.textContent || '').trim(),
      cover,
      source_id: 'phenixscans'
    });
  });

  return results;
}

async function search(query, page = 0, invoke) {
  // Madara search endpoint
  const url = `${baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga&page=${page + 1}`;
  const html = await invoke('fetch_html', { url });
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];

  const doc = parseDOM(html);
  const results = [];

  const items = doc.querySelectorAll('.page-item-detail, .c-image-hover, .bsx, .tab-thumb');
  items.forEach(el => {
    const a = el.querySelector('a[href]');
    const img = el.querySelector('img');
    const titleEl = el.querySelector('.post-title a, .tt, h3 a, h5 a');
    if (!a) return;
    results.push({
      id: a.getAttribute('href') || '',
      title: (titleEl?.textContent || a.textContent || '').trim(),
      cover: img?.getAttribute('data-src') || img?.getAttribute('src') || '',
      source_id: 'phenixscans'
    });
  });

  return results;
}

async function getMangaDetails(mangaId, invoke) {
  const html = await invoke('fetch_html', { url: mangaId });
  if (isCloudflare(html)) return null;

  const doc = parseDOM(html);

  // Titre
  const title = (
    doc.querySelector('.post-title h1')?.textContent ||
    doc.querySelector('.post-title h3')?.textContent ||
    doc.querySelector('h1.entry-title')?.textContent ||
    ''
  ).trim();

  // Cover
  const cover = (
    doc.querySelector('.summary_image img')?.getAttribute('data-src') ||
    doc.querySelector('.summary_image img')?.getAttribute('src') ||
    doc.querySelector('.tab-summary img')?.getAttribute('data-src') ||
    ''
  );

  // Synopsis
  const synopsis = (
    doc.querySelector('.summary__content p')?.textContent ||
    doc.querySelector('.description-summary p')?.textContent ||
    doc.querySelector('[class*="summary"] p')?.textContent ||
    ''
  ).trim();

  // Auteur
  let author = 'Inconnu';
  const authorEl = doc.querySelector('.author-content a') ||
    doc.querySelector('[class*="author"] a') ||
    doc.querySelector('.manga-authors a');
  if (authorEl) author = authorEl.textContent.trim();

  // Statut
  let status = 'En cours';
  const statusEl = doc.querySelector('.post-status .summary-content') ||
    doc.querySelector('[class*="status"] .summary-content') ||
    doc.querySelector('.manga-status');
  if (statusEl) {
    const s = statusEl.textContent.trim().toLowerCase();
    if (s.includes('terminé') || s.includes('completed') || s.includes('fin')) status = 'Terminé';
    else if (s.includes('pause') || s.includes('hiatus')) status = 'En pause';
  }

  // Genres
  const genres = [];
  doc.querySelectorAll('.genres-content a, .manga-genres a, [class*="genre"] a').forEach(el => {
    const g = el.textContent.trim();
    if (g) genres.push(g);
  });

  return { id: mangaId, title, cover, synopsis, author, status, genres, source_id: 'phenixscans' };
}

async function getChapters(mangaId, invoke) {
  // Madara charge les chapitres via AJAX ou directement dans le HTML
  const html = await invoke('fetch_html', { url: mangaId });
  if (isCloudflare(html)) return [];

  const doc = parseDOM(html);
  const chapters = [];

  // Sélecteurs Madara standard pour la liste des chapitres
  const items = doc.querySelectorAll('.wp-manga-chapter, .chapter-item, .listing-chapters_wrap li');
  items.forEach(el => {
    const a = el.querySelector('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const title = a.textContent.trim();
    const dateEl = el.querySelector('.chapter-release-date, .chapter-date');
    chapters.push({
      id: href,
      title,
      number: title,
      date: dateEl?.textContent.trim() || ''
    });
  });

  // Si aucun chapitre trouvé, essayer le fallback AJAX Madara
  if (chapters.length === 0) {
    console.log('[PhenixScans] Chapitres non trouvés dans le HTML, essai AJAX Madara...');
    try {
      // Extraire le post ID depuis le HTML
      const postIdMatch = html.match(/manga_id\s*[:=]\s*['""]?(\d+)/i) ||
        html.match(/var\s+mangaID\s*=\s*(\d+)/) ||
        html.match(/"manga_id"\s*:\s*(\d+)/);
      if (postIdMatch) {
        const postId = postIdMatch[1];
        const ajaxHtml = await invoke('fetch_html', {
          url: `${baseUrl}/wp-admin/admin-ajax.php`,
        });
        // fallback : chercher dans le DOM différemment
        console.log('[PhenixScans] Post ID:', postId);
      }
    } catch(e) {
      console.error('[PhenixScans] Erreur AJAX:', e);
    }
  }

  return chapters;
}

async function getPages(chapterId, invoke) {
  // Warm-up CDN si applicable
  console.log('[PhenixScans] Warm-up...');
  await invoke('warmup_page', {
    pageUrl: chapterId,
    cdnUrl: baseUrl + '/'
  });

  const html = await invoke('fetch_html', { url: chapterId });
  if (isCloudflare(html)) return [];

  const doc = parseDOM(html);
  let pages = [];

  // Méthode 1 : ts_reader.run (Madara standard)
  const scripts = doc.querySelectorAll('script');
  for (const script of scripts) {
    const content = script.textContent || '';
    if (content.includes('ts_reader.run')) {
      try {
        const match = content.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
        if (match) {
          const data = JSON.parse(match[1]);
          if (data.sources?.[0]?.images) {
            pages = data.sources[0].images.map(img => img.replace('http://', 'https://'));
          }
        }
      } catch(e) { console.error('[PhenixScans] ts_reader parse error:', e); }
      break;
    }
  }

  // Méthode 2 : chercher dans le HTML brut
  if (pages.length === 0) {
    try {
      const match = html.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
      if (match) {
        const data = JSON.parse(match[1]);
        if (data.sources?.[0]?.images) {
          pages = data.sources[0].images.map(img => img.replace('http://', 'https://'));
        }
      }
    } catch(e) {}
  }

  // Méthode 3 : fallback DOM — images dans le reader Madara
  if (pages.length === 0) {
    const selectors = [
      '.reading-content img',
      '.read-container img',
      '.chapter-content img',
      '#readerarea img',
      '.wp-manga-chapter-img',
    ];
    for (const sel of selectors) {
      doc.querySelectorAll(sel).forEach(img => {
        const src = img.getAttribute('data-src') ||
          img.getAttribute('src') ||
          img.getAttribute('data-lazy-src') || '';
        if (src && src.startsWith('http') && !src.includes('placeholder')) {
          pages.push(src.replace('http://', 'https://'));
        }
      });
      if (pages.length > 0) break;
    }
  }

  console.log(`[PhenixScans] ${pages.length} pages trouvées`);
  return pages;
}

({
  baseUrl,
  getPopular,
  search,
  getMangaDetails,
  getChapters,
  getPages
});
