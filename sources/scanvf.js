({
    name: "Scan-VF",
    baseUrl: "https://www.scan-vf.net",

    // ✅ Ton Rust renvoie exactement "CF_BLOCKED" ou "TIMEOUT", on s'en sert !
    _checkCloudflare: function(html) {
        return html === 'CF_BLOCKED' 
            || html === 'TIMEOUT' 
            || html.includes("Just a moment") 
            || html.length < 500;
    },

    // 1. PAGE POPULAIRE
    getPopular: async function(page, invoke) {
        try {
            // Scan-VF utilise une page 1-indexée (page 1, page 2...)
            const url = `${this.baseUrl}/filterList?alpha=&genre=&status=&p=${page + 1}`;
            const html = await invoke('fetch_html', { url: url });
            
            if (this._checkCloudflare(html)) {
                return [{ id: "cf-error", title: "Bypass Requis", cover: "" }];
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Scan-VF range ses mangas dans des blocs .media
            const elements = doc.querySelectorAll('.media');
            
            return Array.from(elements).map(el => {
                const a = el.querySelector('.media-heading a') || el.querySelector('a');
                const img = el.querySelector('img');
                
                return {
                    id: a ? a.href : '',
                    title: a ? a.innerText.trim() : "Inconnu",
                    cover: img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : ''
                };
            }).filter(m => m.id !== '' && m.cover !== '');
        } catch (error) {
            console.error("Erreur Scan-VF getPopular:", error);
            return [];
        }
    },

    // 2. RECHERCHE
    search: async function(query, page, invoke) {
        try {
            const url = `${this.baseUrl}/search?query=${encodeURIComponent(query)}`;
            const html = await invoke('fetch_html', { url: url });
            
            if (this._checkCloudflare(html)) {
                return [{ id: "cf-error", title: "Bypass Requis", cover: "" }];
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const elements = doc.querySelectorAll('.media');
            
            return Array.from(elements).map(el => {
                const a = el.querySelector('.media-heading a') || el.querySelector('a');
                const img = el.querySelector('img');
                
                return {
                    id: a ? a.href : '',
                    title: a ? a.innerText.trim() : "Inconnu",
                    cover: img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : ''
                };
            }).filter(m => m.id !== '' && m.cover !== '');
        } catch (error) {
            console.error("Erreur Scan-VF search:", error);
            return [];
        }
    },

    // 3. CHAPITRES
    getChapters: async function(mangaUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: mangaUrl });
            
            if (this._checkCloudflare(html)) {
                throw new Error("Bypass requis");
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Les chapitres sur Scan-VF sont dans une liste ul.chapters
            const elements = doc.querySelectorAll('.chapters li');
            
            return Array.from(elements).map(li => {
                const a = li.querySelector('h5 a') || li.querySelector('a');
                const dateEl = li.querySelector('.date-chapter-title-rtl');
                
                if (!a) return null;
                
                return {
                    id: a.href,
                    title: a.innerText.trim(),
                    date: dateEl ? dateEl.innerText.trim() : ""
                };
            }).filter(c => c !== null);
        } catch (error) {
            console.error("Erreur Scan-VF getChapters:", error);
            return [];
        }
    },

    // 4. LECTURE DES PAGES
    getPages: async function(chapterUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: chapterUrl });
            
            if (this._checkCloudflare(html)) {
                throw new Error("Bypass requis");
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Les images sont souvent dans div#all ou ont la classe .img-responsive
            const images = doc.querySelectorAll('.img-responsive, #all img');
            
            return Array.from(images).map(img => {
                return img.getAttribute('data-src') || img.getAttribute('src') || '';
            }).filter(src => src !== '' && !src.includes('bg-transparent') && src.startsWith('http'));
        } catch (error) {
            console.error("Erreur Scan-VF getPages:", error);
            return [];
        }
    }
})
