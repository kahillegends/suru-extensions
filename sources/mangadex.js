// --- EXTENSION SURU : VRAI MANGADEX ---

const MangaDexExtension = {
    name: "MangaDex",
    baseUrl: "https://api.mangadex.org",

    // On utilise "async" car on va devoir attendre la réponse d'internet
    getPopular: async function(query) {
        try {
            // 1. On interroge l'API de MangaDex (les 20 mangas les plus suivis avec leurs couvertures)
            const response = await fetch("https://api.mangadex.org/manga?includes[]=cover_art&order[followedCount]=desc&limit=20");
            const data = await response.json();

            // 2. On transforme leur format compliqué en un format simple pour Suru
            return data.data.map(manga => {
                // Trouver le nom de fichier de la couverture
                const coverRel = manga.relationships.find(rel => rel.type === 'cover_art');
                const coverFileName = coverRel ? coverRel.attributes.fileName : '';
                
                // Construire la vraie URL de l'image (format 256px pour charger vite)
                const coverUrl = coverFileName 
                    ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.256.jpg` 
                    : 'https://mangadex.org/favicon.ico';

                // Trouver le titre (anglais en priorité, sinon le premier dispo)
                const title = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Titre inconnu';

                return {
                    id: manga.id,
                    title: title,
                    cover: coverUrl
                };
            });
        } catch (error) {
            console.error("Erreur avec l'API MangaDex :", error);
            return []; // En cas d'erreur, on renvoie une liste vide
        }
    }
};

MangaDexExtension;
