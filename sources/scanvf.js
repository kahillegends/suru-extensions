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

    // 1. PAGE POPULAIRE
    getPopular: async function(page, invoke) {
        try {
            const pageParam = page > 0 ? `?page=${page + 1}` : '';
            const url = `${this.baseUrl}/manga-list${pageParam}`; 
            
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

    // 3. CHAPITRES
    getChapters: async function(mangaUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: mangaUrl });
            if (this._checkCloudflare(html)) throw new Error("Bypass requis");

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const listContainers = doc.querySelectorAll('.chapters, #chapterlist, .eplister, .clstyle, .wp-manga-chapter, .list-chapters, .chap-list, .chap-box');
            let links = [];
            
            if (listContainers.length > 0) {
                listContainers.forEach(container => {
                    container.querySelectorAll('a').forEach(a => links.push(a));
                });
            } else {
                doc.querySelectorAll('a').forEach(a => {
                    if (a.href && (a.href.includes('chapitre-') || a.href.includes('chapter-') || a.innerText.toLowerCase().includes('chapitre '))) {
                        links.push(a);
                    }
                });
            }

            const uniqueLinks = [];
            const ids = new Set();
            
            links.forEach(a => {
                if (!ids.has(a.href) && a.href.startsWith('http') && !a.href.includes('#')) {
                    ids.add(a.href);
                    
                    const parent = a.closest('li, div, tr') || a.parentElement;
                    const dateEl = parent.querySelector('.date-chapter-title-rtl, .chapterdate, .chapter-release-date, .time');
                    
                    let title = a.innerText.trim() || a.getAttribute('title');
                    if (!title) {
                        const h5 = a.querySelector('h5, span, .chapternum');
                        if (h5) title = h5.innerText.trim();
                    }
                    
                    uniqueLinks.push({
                        id: a.href,
                        title: title.replace(/\s+/g, ' ') || 'Chapitre Inconnu',
                        date: dateEl ? dateEl.innerText.trim() : ""
                    });
                }
            });
            
            return uniqueLinks;
        } catch (error) {
            console.error("Erreur Scan-VF getChapters:", error);
            return [];
        }
    }, // <-- L'ERREUR ÉTAIT JUSTE EN DESSOUS D'ICI (}, }, au lieu de },)

    // 4. LECTURE DES PAGES
    getPages: async function(chapterUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: chapterUrl });
            if (this._checkCloudflare(html)) throw new Error("Bypass requis");

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const images = doc.querySelectorAll('.img-responsive, #all img, #readerarea img, .reading-content img');
            
            return Array.from(images).map(img => {
                return img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || '';
            }).filter(src => src !== '' && !src.includes('bg-transparent') && src.startsWith('http'));
        } catch (error) {
            return [];
        }
    }
})
