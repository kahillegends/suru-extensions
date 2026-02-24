// --- EXTENSION SURU : SUSHI-SCAN (MODE DETECTIVE) ---

const SushiScansExtension = {
    name: "Sushi-scan",
    baseUrl: "https://sushiscan.net",

    getPopular: async function(query, invoke) {
        try {
            const html = await invoke('fetch_html', { url: this.baseUrl });

            // Sécurité anti-bot élargie
            if (html.includes("Cloudflare") || html.includes("Just a moment") || html.includes("Attention Required")) {
                 return [{ id: "cf-error", title: "Bloqué par l'Anti-Bot (Cloudflare) !", cover: "https://upload.wikimedia.org/wikipedia/commons/thumb/y/y5/Cloudflare_Icon.svg/256px-Cloudflare_Icon.svg.png" }];
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const mangas = [];
            
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

            // LA MAGIE EST ICI : Si on ne trouve pas de mangas, on affiche les 80 premiers caractères de la page web reçue !
            if (mangas.length === 0) {
                // On nettoie un peu le texte pour qu'il s'affiche bien
                const debugTexte = html.substring(0, 120).replace(/\s+/g, ' '); 
                return [{ 
                    id: "error", 
                    title: "DEBUG: " + debugTexte, 
                    cover: "https://via.placeholder.com/256x384.png?text=Mode+Inspecteur" 
                }];
            }

            return mangas;

        } catch (error) {
            return [{ id: "error-catch", title: "Le site a refusé la connexion", cover: "https://via.placeholder.com/256x384.png?text=Erreur+Serveur" }];
        }
    }
};

SushiScansExtension;
