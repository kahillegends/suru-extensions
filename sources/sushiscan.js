// Extension SushiScan pour SORU
const baseUrl = 'https://sushiscan.net';

async function fetchHTML(url, invoke) {
  return await invoke('fetch_html', { url });
}

function parseDOM(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
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

async function getPopular(page = 0, invoke) {
  const url = `${baseUrl}/catalogue/?page=${page + 1}&order=popular`;
  const html = await fetchHTML(url, invoke);
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];

  const doc = parseDOM(html);
  const results = [];
  doc.querySelectorAll('.bsx').forEach(el => {
    const a = el.querySelector('a');
    const img = el.querySelector('img');
    const title = el.querySelector('.tt') || el.querySelector('a');
    if (!a) return;
    results.push({
      id: a.getAttribute('href') || '',
      title: (title?.textContent || '').trim(),
      cover: img?.getAttribute('src') || img?.getAttribute('data-src') || '',
      source_id: 'sushiscan'
    });
  });
  return results;
}

async function search(query, page = 0, invoke) {
  const url = `${baseUrl}/page/${page + 1}/?s=${encodeURIComponent(query)}`;
  const html = await fetchHTML(url, invoke);
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];

  const doc = parseDOM(html);
  const results = [];
  doc.querySelectorAll('.bsx').forEach(el => {
    const a = el.querySelector('a');
    const img = el.querySelector('img');
    const title = el.querySelector('.tt') || el.querySelector('a');
    if (!a) return;
    results.push({
      id: a.getAttribute('href') || '',
      title: (title?.textContent || '').trim(),
      cover: img?.getAttribute('src') || img?.getAttribute('data-src') || '',
      source_id: 'sushiscan'
    });
  });
  return results;
}

async function getMangaDetails(mangaId, invoke) {
  const html = await fetchHTML(mangaId, invoke);
  if (isCloudflare(html)) return null;

  const doc = parseDOM(html);

  const title = doc.querySelector('.entry-title')?.textContent?.trim() || '';

  const cover = doc.querySelector('.thumbook img')?.getAttribute('src')
    || doc.querySelector('.thumbook img')?.getAttribute('data-src')
    || doc.querySelector('.thumb img')?.getAttribute('src')
    || '';

  const synopsis = doc.querySelector('.entry-content p')?.textContent?.trim()
    || doc.querySelector('[itemprop="description"]')?.textContent?.trim()
    || doc.querySelector('.synops')?.textContent?.trim()
    || '';

  let author = 'Inconnu';
  const authorSelectors = [
    '.fmed b',
    '[itemprop="author"]',
    '.infotable tr:nth-child(2) td:last-child',
    '.tsinfo .imptdt:nth-child(2) i',
  ];
  for (const sel of authorSelectors) {
    try {
      const el = doc.querySelector(sel);
      if (el && el.textContent.trim() && el.textContent.trim() !== '-') {
        author = el.textContent.trim();
        break;
      }
    } catch {}
  }

  let status = 'En cours';
  const statusEl = doc.querySelector('.tsinfo .imptdt:first-child i')
    || doc.querySelector('.infotable tr:first-child td:last-child');
  if (statusEl) {
    const s = statusEl.textContent.trim().toLowerCase();
    if (s.includes('terminé') || s.includes('completed') || s.includes('fini')) status = 'Terminé';
    else if (s.includes('pause') || s.includes('hiatus')) status = 'En pause';
  }

  const genres = [];
  doc.querySelectorAll('.mgen a').forEach(el => genres.push(el.textContent.trim()));

  return { id: mangaId, title, cover, synopsis, author, status, genres, source_id: 'sushiscan' };
}

async function getChapters(mangaId, invoke) {
  const html = await fetchHTML(mangaId, invoke);
  if (isCloudflare(html)) return [];

  const doc = parseDOM(html);
  const chapters = [];

  doc.querySelectorAll('#chapterlist li').forEach(el => {
    const a = el.querySelector('a');
    if (!a) return;
    const numEl = el.querySelector('.chapternum');
    const dateEl = el.querySelector('.chapterdate');
    chapters.push({
      id: a.getAttribute('href') || '',
      title: (numEl?.textContent || a.textContent || '').trim(),
      number: (numEl?.textContent || '').trim(),
      date: (dateEl?.textContent || '').trim()
    });
  });

  return chapters;
}

async function getPages(chapterId, invoke) {
  // Étape 1 : warm-up — charge la page via BrowserWindow pour décrocher
  // les cookies CF de c.sushiscan.net nativement
  console.log('[SushiScan] Warm-up CDN...');
  const warmup = await invoke('warmup_cdn', { chapterUrl: chapterId });
  console.log('[SushiScan] Warm-up résultat:', JSON.stringify(warmup));

  // Étape 2 : fetch_html via FlareSolverr (cookies maintenant en session)
  const html = await invoke('fetch_html', { url: chapterId });
  if (isCloudflare(html)) return [];

  const doc = parseDOM(html);
  let pages = [];

  // Méthode 1 : ts_reader.run (méthode principale SushiScan)
  const scripts = doc.querySelectorAll('script');
  for (const script of scripts) {
    const content = script.textContent || '';
    if (content.includes('ts_reader.run')) {
      try {
        const match = content.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
        if (match) {
          const data = JSON.parse(match[1]);
          const sources = data.sources || [];
          if (sources.length > 0) {
            pages = (sources[0].images || []).map(img => img.replace('http://', 'https://'));
          }
        }
      } catch (e) { console.error('ts_reader parse error:', e); }
      break;
    }
  }

  // Méthode 2 : chercher dans le HTML brut si ts_reader a échoué
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

  // Méthode 3 : fallback DOM
  if (pages.length === 0) {
    doc.querySelectorAll('#readerarea img').forEach(img => {
      const src = img.getAttribute('src')
        || img.getAttribute('data-src')
        || img.getAttribute('data-lazy-src')
        || '';
      if (src && src.startsWith('http') && !src.includes('lazyload')) {
        pages.push(src.replace('http://', 'https://'));
      }
    });
  }

  console.log(`[SushiScan] ${pages.length} pages trouvées pour ${chapterId}`);
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
