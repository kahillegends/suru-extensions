// --- EXTENSION SURU : SUSHI-SCAN ---

const SushiScanExtension = {
    name: "Sushi-scan",
    baseUrl: "https://sushiscan.net", // Assure-toi que c'est l'URL actuelle du site (elle change parfois)

    // Fonction interne : Vérifie si le HTML retourné est un test Cloudflare
    _checkCloudflare: function(html) {
        if (html.includes("Just a moment...") || html.includes("cf-browser-verification") || html.includes("Ray ID:")) {
            return true;
        }
        return false;
    },

    // Fonction interne : Renvoie le "faux" manga qui déclenche l'écran rouge de Bypass
    _getCloudflareError: function() {
        return [{
            id: "cf-error",
            title: "Bypass Requis",
            cover: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Cloudflare_Logo.svg/1024px-Cloudflare_Logo.svg.png"
        }];
    },

    // 1. PAGE D'ACCUEIL (Populaires)
    getPopular: async function(page, invoke) {
        try {
            // Sushi-scan gère les pages avec /page/2/ etc...
            const pageStr = page > 0 ? `page/${page + 1}/` : '';
            const url = `${this.baseUrl}/manga/${pageStr}?order=popular`;
            
            const html = await invoke('fetch_html', { url: url });
            
            // Si on est bloqué, on lève l'alerte !
            if (this._checkCloudflare(html)) return this._getCloudflareError();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Cherche toutes les cartes de mangas (classe .bsx sur Sushi-scan)
            const elements = doc.querySelectorAll('.bsx');
            return Array.from(elements).map(el => {
                const a = el.querySelector('a');
                const img = el.querySelector('img');
                return {
                    id: a ? a.href : '', // L'URL complète sert d'ID pour l'extension
                    title: a ? a.title || img?.alt || el.querySelector('.tt')?.innerText?.trim() : 'Titre inconnu',
                    cover: img ? (img.src || img.dataset.src || img.dataset.lazySrc) : ''
                };
            }).filter(m => m.id !== ''); // Retire les éléments invalides
        } catch (error) {
            console.error("Erreur getPopular SushiScan:", error);
            return [];
        }
    },

    // 2. RECHERCHE TEXTUELLE
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
                return {
                    id: a ? a.href : '',
                    title: a ? a.title || img?.alt || el.querySelector('.tt')?.innerText?.trim() : 'Titre inconnu',
                    cover: img ? (img.src || img.dataset.src || img.dataset.lazySrc) : ''
                };
            }).filter(m => m.id !== '');
        } catch (error) {
            console.error("Erreur search SushiScan:", error);
            return [];
        }
    },

    // 3. LISTE DES CHAPITRES
    getChapters: async function(mangaUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: mangaUrl });
            
            // Si on est bloqué ici, on renvoie une liste vide, l'utilisateur devra aller sur l'accueil de la source pour se débloquer
            if (this._checkCloudflare(html)) throw new Error("Bloqué par Cloudflare sur la page chapitres.");

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Les chapitres sont souvent dans une liste <ul> avec ces classes
            const elements = doc.querySelectorAll('#chapterlist li a, .clstyle li a, .eplister li a');
            
            return Array.from(elements).map(a => {
                const titleEl = a.querySelector('.chapternum');
                const dateEl = a.querySelector('.chapterdate');
                return {
                    id: a.href, // L'URL du chapitre est l'ID
                    title: titleEl ? titleEl.innerText.trim() : a.innerText.trim(),
                    number: titleEl ? titleEl.innerText.replace(/[^0-9.]/g, '') : '', // Extrait juste les chiffres
                    date: dateEl ? dateEl.innerText.trim() : ''
                };
            });
        } catch (error) {
            console.error("Erreur getChapters SushiScan:", error);
            return [];
        }
    },

    // 4. RÉCUPÉRATION DES IMAGES D'UN CHAPITRE
    getPages: async function(chapterUrl, invoke) {
        try {
            const html = await invoke('fetch_html', { url: chapterUrl });
            if (this._checkCloudflare(html)) throw new Error("Bloqué par Cloudflare sur la page lecture.");

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Toutes les images de lecture sont contenues dans cette div
            const elements = doc.querySelectorAll('#readerarea img');
            
            return Array.from(elements).map(img => {
                // Parfois le site cache l'image dans un 'data-src' pour l'optimisation
                return img.src || img.dataset.src || img.dataset.lazySrc;
            }).filter(src => src && !src.includes('loader')); // On exclut les gifs de chargement
        } catch (error) {
            console.error("Erreur getPages SushiScan:", error);
            return [];
        }
    }
};

SushiScanExtension;
