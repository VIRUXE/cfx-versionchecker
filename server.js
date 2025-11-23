// GitHub API: https://docs.github.com/en/rest/releases?apiVersion=2022-11-28
const https = require('https');

const convarName = 'versionChecker';
let resourcesToCheck = [];

try {
    const rawList = GetConvar(convarName, '');
    if (rawList) {
        resourcesToCheck = rawList.split(',').map(item => {
            const [name, repo] = item.trim().split('=');
            if (name && repo) {
                // Remove 'https://github.com/' if present to get just owner/repo
                const cleanRepo = repo.replace('https://github.com/', '').trim();
                return { name: name.trim(), repo: cleanRepo };
            }
            return null;
        }).filter(item => item !== null);
    }
} catch (e) {
    console.error(`^1Failed to parse convar ${convarName}: ${e.message}^7`);
}

const httpRequest = url => new Promise((resolve, reject) => {
    https.get(url, {
        headers: { 'User-Agent': 'CFX-VersionCheckerResource' }
    }, res => {
        let data = '';
        
        if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP Error ${res.statusCode}`));
        }

        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                reject(e);
            }
        });
    }).on('error', err => reject(err));
});

const getRemoteVersion = async (repo, resourceName) => {
    try {
        const releases = await httpRequest(`https://api.github.com/repos/${repo}/releases/latest`);
        return releases.tag_name; // GitHub releases usually use 'tag_name' for version
    } catch (error) {
        if (error.message.includes('404')) {
             console.error(`^1GitHub repo not found for ${resourceName} (${repo}). Check the URL/slug.^7`);
        } else {
             console.error(`^1Failed to fetch release for ${resourceName} (${repo}): ${error.message}^7`);
        }
        return null;
    }
};

const compareVersions = (local, remote) => !local || !remote ? false : local.replace(/^v/, '') !== remote.replace(/^v/, '');

(async () => {
    const total = resourcesToCheck.length;
    console.log(`^3Starting version checks for ${total} resources...^7`);

    let current = 0;
    const missingResources = [];

    let successCount = 0;

    for (const resource of resourcesToCheck) {
        current++;
        // Check if resource exists
        if (GetResourceState(resource.name) === 'missing') {
            missingResources.push(resource.name);
            continue;
        }

        const localVersion = GetResourceMetadata(resource.name, 'version', 0);
        
        if (!localVersion) {
            console.warn(`^3Resource ${resource.name} has no version defined in fxmanifest.lua.^7`);
        } else {
            const remoteVersion = await getRemoteVersion(resource.repo, resource.name);

            if (remoteVersion) {
                successCount++;
                if (compareVersions(localVersion, remoteVersion)) {
                    console.info(`^3Update available for ${resource.name}! Local: ${localVersion} | Remote: ${remoteVersion}^7`);
                    console.info(`^3Download: https://github.com/${resource.repo}/releases/latest^7`);
                }
            }
        }

        // Throttle only if not the last one
        if (current < total) await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (missingResources.length > 0) console.warn(`^3Skipped missing resource${missingResources.length > 1 ? 's' : ''}: ${missingResources.join(', ')}^7`);
    
    console.log(`^2All checks completed. ${successCount}/${total} successful checks.^7`);
})();
