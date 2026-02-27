// Extension SushiScan pour Soru
const baseUrl = 'https://sushiscan.net';

// --- UTILITAIRES ---
async function fetchHTML(url, invoke) {
  const html = await invoke('fetch_html', { url });
  return html;
}

function parseDOM(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

// --- LISTE POPULAIRE ---
async function getPopular(page = 0, invoke) {
  const url = `${baseUrl}/catalogue/?page=${page + 1}&order=popular`;
  const html = await fetchHTML(url, invoke);

  if (html === 'CF_BLOCKED') return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];
  if (!html || html === 'TIMEOUT') return [];

  const doc = parseDOM(html);
  const items = doc.querySelectorAll('.bsx');
  const results = [];

  items.forEach(el => {
    const a = el.querySelector('a');
    const img = el.querySelector('img');
    const title = el.querySelector('.tt') || el.querySelector('a');

    if (!a) return;

    const href = a.getAttribute('href') || '';
    // Extrait l'ID depuis l'URL : https://sushiscan.net/catalogue/mon-manga/ → mon-manga
    const id = href.replace(baseUrl, '').replace(/\//g, '').trim();

    results.push({
      id: id,
      title: (title?.textContent || '').trim(),
      cover: img?.getAttribute('src') || img?.getAttribute('data-src') || '',
      source_id: 'sushiscan'
    });
  });

  return results;
}

// --- RECHERCHE ---
async function search(query, page = 0, invoke) {
  const url = `${baseUrl}/page/${page + 1}/?s=${encodeURIComponent(query)}`;
  const html = await fetchHTML(url, invoke);

  if (html === 'CF_BLOCKED') return [{ id: 'cf-error', title: 'Cloudflare bloqué', cover: '' }];
  if (!html || html === 'TIMEOUT') return [];

  const doc = parseDOM(html);
  const items = doc.querySelectorAll('.bsx');
  const results = [];

  items.forEach(el => {
    const a = el.querySelector('a');
    const img = el.querySelector('img');
    const title = el.querySelector('.tt') || el.querySelector('a');

    if (!a) return;

    const href = a.getAttribute('href') || '';
    const id = href.replace(baseUrl, '').replace(/\//g, '').trim();

    results.push({
      id: id,
      title: (title?.textContent || '').trim(),
      cover: img?.getAttribute('src') || img?.getAttribute('data-src') || '',
      source_id: 'sushiscan'
    });
  });

  return results;
}

// --- DETAILS MANGA ---
async function getMangaDetails(mangaId, invoke) {
  const url = `${baseUrl}/catalogue/${mangaId}/`;
  const html = await fetchHTML(url, invoke);
  if (!html || html === 'CF_BLOCKED' || html === 'TIMEOUT') return null;

  const doc = parseDOM(html);

  const title = doc.querySelector('.entry-title')?.textContent?.trim() || '';
  const cover = doc.querySelector('.thumbook img')?.getAttribute('src') || doc.querySelector('.thumbook img')?.getAttribute('data-src') || '';
  const synopsis = doc.querySelector('.entry-content p')?.textContent?.trim() || doc.querySelector('[itemprop="description"]')?.textContent?.trim() || '';

  // Auteur
  const authorEl = doc.querySelector('.infotable tr');
  let author = '';
  doc.querySelectorAll('.infotable tr').forEach(row => {
    if (row.textContent.includes('Auteur')) {
      author = row.querySelector('td:last-child')?.textContent?.trim() || '';
    }
  });

  // Statut
  let status = 'En cours';
  doc.querySelectorAll('.infotable tr').forEach(row => {
    if (row.textContent.includes('Statut')) {
      status = row.querySelector('td:last-child')?.textContent?.trim() || 'En cours';
    }
  });

  // Genres
  const genres = [];
  doc.querySelectorAll('.mgen a').forEach(el => {
    genres.push(el.textContent.trim());
  });

  return { id: mangaId, title, cover, synopsis, author, status, genres, source_id: 'sushiscan' };
}

// --- CHAPITRES ---
async function getChapters(mangaId, invoke) {
  const url = `${baseUrl}/catalogue/${mangaId}/`;
  const html = await fetchHTML(url, invoke);
  if (!html || html === 'CF_BLOCKED' || html === 'TIMEOUT') return [];

  const doc = parseDOM(html);
  const chapterEls = doc.querySelectorAll('#chapterlist li');
  const chapters = [];

  chapterEls.forEach(el => {
    const a = el.querySelector('a');
    if (!a) return;

    const href = a.getAttribute('href') || '';
    // Ex: https://sushiscan.net/catalogue/mon-manga/chapitre-1/ → mon-manga/chapitre-1
    const id = href.replace(baseUrl + '/catalogue/', '').replace(/\/$/, '').trim();

    const numEl = el.querySelector('.chapternum');
    const dateEl = el.querySelector('.chapterdate');

    chapters.push({
      id: id,
      title: (numEl?.textContent || a.textContent || '').trim(),
      number: (numEl?.textContent || '').trim(),
      date: (dateEl?.textContent || '').trim()
    });
  });

  return chapters;
}

// --- PAGES D'UN CHAPITRE ---
async function getPages(chapterId, invoke) {
  const url = `${baseUrl}/catalogue/${chapterId}/`;
  const html = await fetchHTML(url, invoke);
  if (!html || html === 'CF_BLOCKED' || html === 'TIMEOUT') return [];

  const doc = parseDOM(html);

  // SushiScan utilise ts_reader.run({...}) pour stocker les images
  const scripts = doc.querySelectorAll('script');
  let pages = [];

  for (const script of scripts) {
    const content = script.textContent || '';
    if (content.includes('ts_reader.run')) {
      try {
        // Extrait le JSON entre ts_reader.run( et );
        const match = content.match(/ts_reader\.run\((\{.*?\})\)/s);
        if (match) {
          const data = JSON.parse(match[1]);
          const sources = data.sources || [];
          if (sources.length > 0) {
            const images = sources[0].images || [];
            pages = images.map(img => img.replace('http://', 'https://'));
          }
        }
      } catch (e) {
        console.error('Erreur parsing ts_reader:', e);
      }
      break;
    }
  }

  // Fallback : cherche les images directement dans le DOM
  if (pages.length === 0) {
    doc.querySelectorAll('#readerarea img').forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (src && src.startsWith('http')) {
        pages.push(src.replace('http://', 'https://'));
      }
    });
  }

  return pages;
}

// Export du module (eval() retourne cet objet)
({
  baseUrl,
  getPopular,
  search,
  getMangaDetails,
  getChapters,
  getPages
});
