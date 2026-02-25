// --- EXTENSION SURU : SUSHI-SCAN (VERSION AMÉLIORÉE) ---

const SushiScanExtension = {
    name: "Sushi-scan",
    baseUrl: "https://sushiscan.net",

    // ✅ Fonction interne : Vérifie si le HTML retourné est un test Cloudflare
    _checkCloudflare: function(html) {
        const lowerHtml = html.toLowerCase();
        if (lowerHtml.includes("just a moment") 
            || lowerHtml.includes("cf-browser-verification") 
            || lowerHtml.includes("ray id")
            || lowerHtml.includes("checking your browser")
            || lowerHtml.includes("attention required")
            || lowerHtml.includes("cloudflare")
            || html.length < 500) { // Si la page est trop courte, c'est suspect
            return true;
        }
        return false;
    },

    // ✅ Fonction interne : Renvoie le "faux" manga qui déclenche l'écran rouge de Bypass
    _getCloudflareError: function() {
        return [{
            id: "cf-error",
            title: "🛡️ Protection Cloudflare Détectée",
            cover: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Cloudflare_Logo.svg/1024px-Cloudflare_Logo.svg.png"
        }];
    },

    // 1. PAGE D'ACCUEIL (Populaires)
    getPopular: async function(page, invoke) {
        try {
            const pageStr = page > 0 ? `page/${page + 1}/` : '';
            const url = `${this.baseUrl}/manga/${pageStr}?order=popular`;
            
            console.log(`📡 Chargement de: ${url}`);
            const html = await invoke('fetch_html', { url: url });
            
            // ⚠️ Si on est bloqué, on lève l'alerte !
            if (this._checkCloudflare(html)) {
                console.warn("🛑 Cloudflare détecté sur getPopular");
                return this._getCloudflareError();
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Cherche toutes les cartes de mangas
            const elements = doc.querySelectorAll('.bsx');
            console.log(`✅ ${elements.length} mangas trouvés`);
            
            return Array.from(elements).map(el => {
                const a = el.querySelector('a');
                const img = el.querySelector('img');
                const titleEl = el.querySelector('.tt, .ntitle');
                
                return {
                    id: a ? a.href : '',
                    title: titleEl ? titleEl.innerText.trim() : (a ? a.title || img?.alt : 'Titre inconnu'),
                    cover: img ? (img.src || img.dataset.src || img.dataset.lazySrc) : ''
                };
            }).filter(m => m.id !== '' && m.cover !== '');
        } catch (error) {
            console.error("❌ Erreur getPopular SushiScan:", error);
            return [];
        }
    },

    // 2. RECHERCHE TEXTUELLE
    search: async function(query, page, invoke) {
        try {
            const pageStr = page > 0 ? `page/${page + 1}/` : '';
            const url = `${this.baseUrl}/${pageStr}?s=${encodeURIComponent(query)}`;
            
            console.log(`🔍 Recherche: ${url}`);
            const html = await invoke('fetch_html', { url: url });
            
            if (this._checkCloudflare(html)) {
                console.warn("🛑 Cloudflare détecté sur search");
                return this._getCloudflareError();
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const elements = doc.querySelectorAll('.bsx');
            console.log(`✅ ${elements.length} résultats trouvés`);
            
            return Array.from(elements).map(el => {
                const a = el.querySelector('a');
                const img = el.querySelector('img');
                const titleEl = el.querySelector('.tt, .ntitle');
                
                return {
                    id: a ? a.href : '',
                    title: titleEl ? titleEl.innerText.trim() : (a ? a.title || img?.alt : 'Titre inconnu'),
                    cover: img ? (img.src || img.dataset.src || img.dataset.lazySrc) : ''
                };
            }).filter(m => m.id !== '' && m.cover !== '');
        } catch (error) {
            console.error("❌ Erreur search SushiScan:", error);
            return [];
        }
    },

    // 3. LISTE DES CHAPITRES
    getChapters: async function(mangaUrl, invoke) {
        try {
            console.log(`📖 Chargement chapitres: ${mangaUrl}`);
            const html = await invoke('fetch_html', { url: mangaUrl });
            
            if (this._checkCloudflare(html)) {
                console.error("🛑 Cloudflare détecté sur getChapters");
                throw new Error("Cloudflare bloque la page des chapitres. Veuillez faire le bypass depuis l'accueil.");
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Les chapitres sont dans ces sélecteurs
            const elements = doc.querySelectorAll('#chapterlist li a, .clstyle li a, .eplister li a');
            console.log(`✅ ${elements.length} chapitres trouvés`);
            
            return Array.from(elements).map(a => {
                const titleEl = a.querySelector('.chapternum');
                const dateEl = a.querySelector('.chapterdate');
                
                return {
                    id: a.href,
                    title: titleEl ? titleEl.innerText.trim() : a.innerText.trim(),
                    number: titleEl ? titleEl.innerText.replace(/[^0-9.]/g, '') : '',
                    date: dateEl ? dateEl.innerText.trim() : ''
                };
            });
        } catch (error) {
            console.error("❌ Erreur getChapters SushiScan:", error);
            return [];
        }
    },

    // 4. RÉCUPÉRATION DES IMAGES D'UN CHAPITRE
    getPages: async function(chapterUrl, invoke) {
        try {
            console.log(`📄 Chargement pages: ${chapterUrl}`);
            const html = await invoke('fetch_html', { url: chapterUrl });
            
            if (this._checkCloudflare(html)) {
                console.error("🛑 Cloudflare détecté sur getPages");
                throw new Error("Cloudflare bloque la page de lecture. Veuillez faire le bypass depuis l'accueil.");
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Toutes les images de lecture
            const elements = doc.querySelectorAll('#readerarea img, .rdminimal img, .reader-area img');
            console.log(`✅ ${elements.length} pages trouvées`);
            
            return Array.from(elements).map(img => {
                return img.src || img.dataset.src || img.dataset.lazySrc || '';
            }).filter(src => src && !src.includes('loader') && !src.includes('loading'));
        } catch (error) {
            console.error("❌ Erreur getPages SushiScan:", error);
            return [];
        }
    }
};

SushiScanExtension;
