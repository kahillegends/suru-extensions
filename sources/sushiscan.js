// --- EXTENSION SURU : SUSHI-SCAN (VERSION OPTIMISÉE POUR SCRAPER INVISIBLE) ---

const SushiScanExtension = {
    name: "Sushi-scan",
    baseUrl: "https://sushiscan.net",

    _checkCloudflare: function(html) {
        const lowerHtml = html.toLowerCase();
        return (lowerHtml.includes("just a moment") 
            || lowerHtml.includes("cloudflare") 
            || lowerHtml.includes("cf-browser-verification")
            || html.length < 1000); // Protection si le HTML est quasi vide
    },

    _getCloudflareError: function() {
        return [{
            id: "cf-error",
            title: "🛡️ Protection Cloudflare Détectée",
            cover: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Cloudflare_Logo.svg/1024px-Cloudflare_Logo.svg.png"
        }];
    },

    getPopular: async function(page, invoke) {
        try {
            const pageStr = page > 0 ? `page/${page + 1}/` : '';
            const url = `${this.baseUrl}/manga/${pageStr}?order=popular`;
            const html = await invoke('fetch_html', { url: url });
            
            if (this._checkCloudflare(html)) return this._getCloudflareError();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const elements = doc.querySelectorAll('.bsx');
            
            return Array.from(elements).map(el => {
                const a = el.querySelector('a');
                const img = el.querySelector('img');
                
                // Extraction robuste de l'image
                const cover = img ? (img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || '') : '';
                
                return {
                    id: a ? a.href : '',
                    title: el.querySelector('.tt')?.innerText?.trim() || a?.title || "Titre inconnu",
                    cover: cover
                };
            }).filter(m => m.id !== '' && m.cover !== '');
        } catch (error) {
            return [];
        }
    },

    search: async function(query, page, invoke) {
        try {
            const pageStr = page > 0 ? `page/${page + 1}/` : '';
            const url = `${this.baseUrl}/${pageStr}?s=${encodeURIComponent(query)}`;
            const html = await invoke('fetch_html', { url: url });
            
            if (this._checkCloudflare(html)) return this._getCloudflareError();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const elements = doc.querySelectorAll('.bsx');
            
            return Array.from(elements).map(el => {
                const a = el.querySelector('a');
                const img = el.querySelector('img');
                const cover = img ? (img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || '') : '';
                
                return {
                    id: a ? a.href : '',
                    title: el.querySelector('.tt')?.innerText?.trim() || a?.title || "Titre inconnu",
                    cover: cover
                };
            }).filter(m => m.id !== '' && m.cover !== '');
        } catch (error) {
            return [];
        }
    },

    getChapters: async function(mangaUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: mangaUrl });
            if (this._checkCloudflare(html)) throw new Error("Bypass requis");

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // Sélecteur élargi pour plus de compatibilité
            const elements = doc.querySelectorAll('#chapterlist li a, .eplister li a, .clstyle li a');
            
            return Array.from(elements).map(a => {
                const num = a.querySelector('.chapternum')?.innerText?.trim();
                const date = a.querySelector('.chapterdate')?.innerText?.trim();
                return {
                    id: a.href,
                    title: num || a.innerText.trim(),
                    date: date || ""
                };
            });
        } catch (error) {
            return [];
        }
    },

    getPages: async function(chapterUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: chapterUrl });
            if (this._checkCloudflare(html)) throw new Error("Bypass requis");

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const images = doc.querySelectorAll('#readerarea img');
            
            return Array.from(images).map(img => {
                // Pour le lecteur, on prend TOUT ce qui ressemble à une URL
                return img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || '';
            }).filter(src => src && !src.includes('loader') && src.startsWith('http'));
        } catch (error) {
            return [];
        }
    }
};

SushiScanExtension;
