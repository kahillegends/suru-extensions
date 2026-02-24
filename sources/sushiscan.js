// --- EXTENSION SURU : SUSHI-SCAN (SCRAPING) ---

const SushiScansExtension = {
    name: "Sushi-scan",
    baseUrl: "https://sushiscan.net",

    getPopular: async function(query, invoke) {
        try {
            // 1. On demande à Rust d'aspirer le site
            const html = await invoke('fetch_html', { url: this.baseUrl });

            // 2. On le transforme en document lisible
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const mangas = [];

            // 3. On découpe les blocs de mangas
            const elements = doc.querySelectorAll('.bsx');

            elements.forEach(element => {
                const linkTag = element.querySelector('a');
                const imgTag = element.querySelector('img');
                
                if (linkTag && imgTag) {
                    mangas.push({
                        id: linkTag.getAttribute('href'), 
                        title: linkTag.getAttribute('title') || "Titre inconnu", 
                        cover: imgTag.getAttribute('src')
                    });
                }
            });

            if (mangas.length === 0) {
                return [{ id: "error", title: "Mise à jour requise", cover: "https://via.placeholder.com/256x384.png?text=Erreur" }];
            }

            return mangas;

        } catch (error) {
            console.error("Erreur de scraping :", error);
            return [];
        }
    }
};

SushiScansExtension;
