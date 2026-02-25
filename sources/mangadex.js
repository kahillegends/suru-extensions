// --- EXTENSION SURU : VRAI MANGADEX V2 ---

const MangaDexExtension = {
    name: "MangaDex",
    baseUrl: "https://api.mangadex.org",

    // 1. Récupère les mangas populaires (Accueil)
    getPopular: async function(query, invoke) {
        try {
            const response = await fetch("https://api.mangadex.org/manga?includes[]=cover_art&order[followedCount]=desc&limit=20");
            const data = await response.json();

            return data.data.map(manga => {
                const coverRel = manga.relationships.find(rel => rel.type === 'cover_art');
                const coverFileName = coverRel ? coverRel.attributes.fileName : '';
                const coverUrl = coverFileName 
                    ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.256.jpg` 
                    : 'https://mangadex.org/favicon.ico';
                const title = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Titre inconnu';

                return { id: manga.id, title: title, cover: coverUrl };
            });
        } catch (error) {
            console.error("Erreur avec l'API MangaDex :", error);
            return [];
        }
    },

    // 2. NOUVEAU : Récupère la liste des chapitres d'un manga
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

    // 3. NOUVEAU : Récupère les images d'un chapitre pour le lecteur
    getPages: async function(chapterId, invoke) {
        try {
            const response = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`);
            const data = await response.json();
            
            const baseUrl = data.baseUrl;
            const hash = data.chapter.hash;
            // On reconstruit l'URL exacte de chaque image
            return data.chapter.data.map(filename => `${baseUrl}/data/${hash}/${filename}`);
        } catch (error) {
            console.error("Erreur getPages MangaDex:", error);
            return [];
        }
    }
};

MangaDexExtension;
