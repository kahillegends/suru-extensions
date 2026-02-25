// --- EXTENSION SURU : VRAI MANGADEX V3 (Recherche + Pagination) ---

const MangaDexExtension = {
    name: "MangaDex",
    baseUrl: "https://api.mangadex.org",

    // Fonction utilitaire interne pour formater les données de l'API
    _formatData: function(mangas) {
        return mangas.map(manga => {
            const coverRel = manga.relationships.find(rel => rel.type === 'cover_art');
            const coverFileName = coverRel ? coverRel.attributes.fileName : '';
            const coverUrl = coverFileName 
                ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.256.jpg` 
                : 'https://mangadex.org/favicon.ico';
            const title = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Titre inconnu';

            return { id: manga.id, title: title, cover: coverUrl };
        });
    },

    // 1. Récupère les mangas populaires (avec pagination)
    getPopular: async function(page, invoke) {
        try {
            const offset = (page || 0) * 30; // 30 mangas par page
            // contentRating permet de filtrer le contenu -18
            const response = await fetch(`https://api.mangadex.org/manga?includes[]=cover_art&order[followedCount]=desc&limit=30&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive`);
            const data = await response.json();
            return this._formatData(data.data);
        } catch (error) {
            console.error("Erreur avec l'API MangaDex :", error);
            return [];
        }
    },

    // 2. NOUVEAU : Fonction de recherche textuelle
    search: async function(query, page, invoke) {
        try {
            const offset = (page || 0) * 30;
            const response = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&includes[]=cover_art&order[relevance]=desc&limit=30&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive`);
            const data = await response.json();
            return this._formatData(data.data);
        } catch (error) {
            console.error("Erreur Recherche MangaDex :", error);
            return [];
        }
    },

    // 3. Récupère la liste des chapitres
    getChapters: async function(mangaId, invoke) {
        try {
            const response = await fetch(`https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=fr&translatedLanguage[]=en&order[chapter]=desc&limit=100`);
            const data = await response.json();
            
            return data.data.map(ch => ({
                id: ch.id,
                title: `Chapitre ${ch.attributes.chapter || '?'} ${ch.attributes.title ? '- ' + ch.attributes.title : ''}`,
                number: ch.attributes.chapter,
                date: new Date(ch.attributes.publishAt).toLocaleDateString()
            }));
        } catch (error) {
            console.error("Erreur getChapters MangaDex:", error);
            return [];
        }
    },

    // 4. Récupère les images d'un chapitre
    getPages: async function(chapterId, invoke) {
        try {
            const response = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`);
            const data = await response.json();
            
            const baseUrl = data.baseUrl;
            const hash = data.chapter.hash;
            return data.chapter.data.map(filename => `${baseUrl}/data/${hash}/${filename}`);
        } catch (error) {
            console.error("Erreur getPages MangaDex:", error);
            return [];
        }
    }
};

MangaDexExtension;
