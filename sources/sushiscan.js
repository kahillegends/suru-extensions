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

// 🟢 Proxy image via FlareSolverr pour les covers bloquées par CF
async function proxyImageUrl(url, invoke) {
  try {
    // On convertit l'URL en data URL via FlareSolverr
    // Pour l'instant on retourne l'URL directe — les images CF passent souvent
    // directement une fois que FlareSolverr a établi la session
    return url;
  } catch {
    return url;
  }
}

async function getPopular(page = 0, invoke) {
  const url = `${baseUrl}/catalogue/?page=${page + 1}&order=popular`;
  const html = await fetchHTML(url, invoke);
  if (isCloudflare(html)) return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];

  const doc = parseDOM(html);
  const items = doc.querySelectorAll('.bsx');
  const results = [];

  items.forEach(el => {
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
  const items = doc.querySelectorAll('.bsx');
  const results = [];

  items.forEach(el => {
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
  const cover = doc.querySelector('.thumbook img')?.getAttribute('src') || doc.querySelector('.thumbook img')?.getAttribute('data-src') || '';
  const synopsis = doc.querySelector('.entry-content p')?.textContent?.trim() || doc.querySelector('[itemprop="description"]')?.textContent?.trim() || '';

  const genres = [];
  doc.querySelectorAll('.mgen a').forEach(el => genres.push(el.textContent.trim()));

  return { id: mangaId, title, cover, synopsis, author: "Inconnu", status: "En cours", genres, source_id: 'sushiscan' };
}

async function getChapters(mangaId, invoke) {
  const html = await fetchHTML(mangaId, invoke);
  if (isCloudflare(html)) return [];

  const doc = parseDOM(html);
  const chapterEls = doc.querySelectorAll('#chapterlist li');
  const chapters = [];

  chapterEls.forEach(el => {
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
  const html = await fetchHTML(chapterId, invoke);
  if (isCloudflare(html)) return [];

  const doc = parseDOM(html);
  const scripts = doc.querySelectorAll('script');
  let pages = [];

  for (const script of scripts) {
    const content = script.textContent || '';
    if (content.includes('ts_reader.run')) {
      try {
        const match = content.match(/ts_reader\.run\((\{.*?\})\)/s);
        if (match) {
          const data = JSON.parse(match[1]);
          const sources = data.sources || [];
          if (sources.length > 0) {
            const images = sources[0].images || [];
            pages = images.map(img => img.replace('http://', 'https://'));
          }
        }
      } catch (e) { console.error('Erreur parsing ts_reader:', e); }
      break;
    }
  }

  if (pages.length === 0) {
    doc.querySelectorAll('#readerarea img').forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
      if (src && src.startsWith('http') && !src.includes('lazyload')) {
        pages.push(src.replace('http://', 'https://'));
      }
    });
  }

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
