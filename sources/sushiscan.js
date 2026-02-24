// --- EXTENSION SURU : SCRAPING HTML (SANS API) ---

const SushiScansExtension = {
    name: "Manga Scraping",
    baseUrl: "https://sushiscan.net", // Exemple de site

    // NOUVEAU : On reçoit "invoke" depuis React pour utiliser Rust !
    getPopular: async function(query, invoke) {
        try {
            // 1. On demande à Rust d'aspirer le code de la page web
            const html = await invoke('fetch_html', { url: this.baseUrl });

            // 2. On transforme ce gros texte en un "Document" lisible par JavaScript
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const mangas = [];

            // 3. LA PARTIE MAGIQUE (LE SCRAPING)
            // On cherche tous les blocs qui contiennent un manga.
            // (Note : '.bsx' est la classe CSS super classique utilisée par 90% des sites de scans Wordpress)
            const elements = doc.querySelectorAll('.bsx');

            // 4. On fouille dans chaque bloc pour extraire les infos
            elements.forEach(element => {
                const linkTag = element.querySelector('a'); // Le lien du manga
                const imgTag = element.querySelector('img'); // L'image
                
                if (linkTag && imgTag) {
                    mangas.push({
                        // On prend le lien du manga comme ID
                        id: linkTag.getAttribute('href'), 
                        
                        // On récupère le titre (souvent rangé dans l'attribut "title")
                        title: linkTag.getAttribute('title') || "Titre inconnu", 
                        
                        // On récupère le lien de l'image
                        cover: imgTag.getAttribute('src')
                    });
                }
            });

            // Si le site a changé son code et que ça ne trouve rien, on renvoie un faux manga pour prévenir
            if (mangas.length === 0) {
                return [{ id: "error", title: "Le design du site a changé, mise à jour requise !", cover: "https://via.placeholder.com/256x384.png?text=Erreur" }];
            }

            return mangas;

        } catch (error) {
            console.error("Erreur de scraping :", error);
            return [];
        }
    }
};

SushiScansExtension;
