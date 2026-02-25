// --- EXTENSION SURU : SUSHI-SCAN (VERSION OPTIMISÉE ANTI-CLOUDFLARE) ---

const SushiScanExtension = {
    name: "Sushi-scan",
    baseUrl: "https://sushiscan.net",

    // ✅ FIX : Ajout de la vérification "CF_BLOCKED" et "TIMEOUT" envoyés par Rust
    _checkCloudflare: function(html) {
        if (!html) return true;
        // Codes d'erreur explicites envoyés par fetch_html côté Rust
        if (html === "CF_BLOCKED" || html === "TIMEOUT") return true;

        const lowerHtml = html.toLowerCase();
        return (
            lowerHtml.includes("just a moment") 
            || lowerHtml.includes("cloudflare") 
            || lowerHtml.includes("cf-browser-verification")
            || html.length < 500  // ✅ FIX : seuil relevé de 1000 à 500 (plus robuste)
        );
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
            
            // ✅ FIX : Vérification unifiée avec les nouveaux codes d'erreur
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
            console.error("getPopular error:", error);
            return [];
        }
    },

    search: async function(query, page, invoke) {
        try {
            const pageStr = page > 0 ? `page/${page + 1}/` : '';
            const url = `${this.baseUrl}/${pageStr}?s=${encodeURIComponent(query)}`;
            const html = await invoke('fetch_html', { url: url });
            
            // ✅ FIX : Vérification unifiée
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
            console.error("search error:", error);
            return [];
        }
    },

    getChapters: async function(mangaUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: mangaUrl });

            // ✅ FIX : Vérification unifiée
            if (this._checkCloudflare(html)) throw new Error("CF_BYPASS_REQUIRED");

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
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
            console.error("getChapters error:", error);
            return [];
        }
    },

    getPages: async function(chapterUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: chapterUrl });

            // ✅ FIX : Vérification unifiée
            if (this._checkCloudflare(html)) throw new Error("CF_BYPASS_REQUIRED");

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const images = doc.querySelectorAll('#readerarea img');
            
            return Array.from(images).map(img => {
                return img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || '';
            }).filter(src => src && !src.includes('loader') && src.startsWith('http'));
        } catch (error) {
            console.error("getPages error:", error);
            return [];
        }
    }
};

SushiScanExtension;
