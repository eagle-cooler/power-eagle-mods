import EagleApi from './index.js';
import path from 'path';

class EagleApiExt {
    static closestLibrary(libraryName) {
        return EagleApi.library.history().then(histories => {
            const names = histories.map(history => [path.basename(history).replace('.library', ''), history]);

            // Calculate similarity scores using Levenshtein distance
            let scores = {};
            for (const [name, fullpath] of names) {
                scores[fullpath] = this._calculateSimilarity(libraryName, name);
            }
            return scores;
        });
    }

    static _calculateSimilarity(a, b) {
        a = a.toLowerCase();
        b = b.toLowerCase();
        
        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = b.charAt(i-1) === a.charAt(j-1) ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i-1][j] + 1,
                    matrix[i][j-1] + 1,
                    matrix[i-1][j-1] + cost
                );
            }
        }

        const distance = matrix[b.length][a.length];
        const maxLength = Math.max(a.length, b.length);
        return 1 - distance / maxLength;
    }

    static switchLibrary(libraryName, exactMatch = false, maxDistance = 0.5) {
        if (exactMatch) {
            return EagleApi.library.history().then(histories => {
                for (const history of histories) {
                    if (path.basename(history) == libraryName) {
                        return EagleApi.library.switch(history);
                    }
                }
                return null;
            });
        }

        return this.closestLibrary(libraryName).then(scores => {
            console.log("scoring table:", scores);
            // Find candidate with highest score
            let closest = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
            if (closest[1] > maxDistance) {
                return EagleApi.library.switch(closest[0]);
            } else {
                throw new Error("No library found");
            }
        });
    }
}

export default EagleApiExt;