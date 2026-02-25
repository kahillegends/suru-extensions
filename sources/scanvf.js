({
    name: "Scan-VF",
    baseUrl: "https://www.scan-vf.net",

    _checkCloudflare: function(html) {
        return html === 'CF_BLOCKED' 
            || html === 'TIMEOUT' 
            || html.toLowerCase().includes("just a moment") 
            || html.toLowerCase().includes("cloudflare")
            || html.length < 500;
    },

    // 1. PAGE POPULAIRE (Correction du 404)
    getPopular: async function(page, invoke) {
        try {
            // On attaque directement la liste des mangas, fini la page d'accueil cassée !
            const pageParam = page > 0 ? `?page=${page + 1}` : '';
            const url = `${this.baseUrl}/manga-list${pageParam}`; 
            
            const html = await invoke('fetch_html', { url: url });
            
            if (this._checkCloudflare(html)) return [{ id: "cf-error", title: "Bypass Requis", cover: "" }];

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Filet très large pour attraper les mangas peu importe le thème
            const elements = doc.querySelectorAll('.media, .manga-box, .manga-item, .item, .bsx');
            
            return Array.from(elements).map(el => {
                const a = el.querySelector('a');
                const img = el.querySelector('img');
                
                return {
                    id: a ? a.href : '',
                    title: a ? (a.innerText.trim() || a.getAttribute('title') || img?.getAttribute('alt')) : "Inconnu",
                    cover: img ? (img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || '') : ''
                };
            }).filter(m => m.id !== '' && m.cover !== '');
        } catch (error) {
            return [];
        }
    },

    // 2. RECHERCHE
    search: async function(query, page, invoke) {
        try {
            const url = `${this.baseUrl}/search?query=${encodeURIComponent(query)}`;
            const html = await invoke('fetch_html', { url: url });
            
            if (this._checkCloudflare(html)) return [{ id: "cf-error", title: "Bypass Requis", cover: "" }];

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const elements = doc.querySelectorAll('.media, .manga-box, .manga-item, .item, .bsx');
            
            return Array.from(elements).map(el => {
                const a = el.querySelector('a');
                const img = el.querySelector('img');
                
                return {
                    id: a ? a.href : '',
                    title: a ? (a.innerText.trim() || a.getAttribute('title')) : "Inconnu",
                    cover: img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : ''
                };
            }).filter(m => m.id !== '' && m.cover !== '');
        } catch (error) {
            return [];
        }
    },

    // 3. CHAPITRES (Correction du "0 Chapitres")
    getChapters: async function(mangaUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: mangaUrl });
            if (this._checkCloudflare(html)) throw new Error("Bypass requis");

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // On attrape toutes les listes de chapitres possibles (anciens et nouveaux thèmes)
            const elements = doc.querySelectorAll('.chapters li, #chapterlist li, .eplister li, .clstyle li, .wp-manga-chapter');
            
            return Array.from(elements).map(li => {
                const a = li.querySelector('a');
                if (!a) return null;

                const titleEl = li.querySelector('h5, .chapternum, .chapter-title-rtl') || a;
                const dateEl = li.querySelector('.date-chapter-title-rtl, .chapterdate, .chapter-release-date');
                
                // Nettoyage du titre (enlève les espaces en trop)
                let cleanTitle = titleEl.innerText.trim().replace(/\s+/g, ' ');
                
                return {
                    id: a.href,
                    title: cleanTitle,
                    date: dateEl ? dateEl.innerText.trim() : ""
                };
            }).filter(c => c !== null);
        } catch (error) {
            return [];
        }
    },

    // 4. LECTURE DES PAGES
    getPages: async function(chapterUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: chapterUrl });
            if (this._checkCloudflare(html)) throw new Error("Bypass requis");

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Sélecteurs de lecteur
            const images = doc.querySelectorAll('.img-responsive, #all img, #readerarea img, .reading-content img');
            
            return Array.from(images).map(img => {
                return img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || '';
            }).filter(src => src !== '' && !src.includes('bg-transparent') && src.startsWith('http'));
        } catch (error) {
            return [];
        }
    }
})
