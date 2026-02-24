// --- EXTENSION SURU : MANGADEX ---

const MangaDexExtension = {
    name: "MangaDex",
    baseUrl: "https://mangadex.org",

    // Fonction qui sera appelée par Suru pour avoir les mangas populaires
    getPopular: function(html) {
        // Plus tard, on mettra la vraie logique ici pour lire le HTML.
        // Pour l'instant, l'extension renvoie ces données pour prouver qu'elle s'exécute bien !
        return [
            { 
                id: "1", 
                title: "Dandadan (Chargé via le JS MangaDex !)", 
                cover: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx132029-Y9vY9UPrTByo.jpg" 
            },
            { 
                id: "2", 
                title: "Chainsaw Man (JS Engine)", 
                cover: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105828-Eq1JbB4P7dJv.jpg" 
            }
        ];
    }
};

// On doit terminer le fichier en retournant l'objet, pour que React puisse l'attraper
MangaDexExtension;
