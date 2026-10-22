
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true
});

const ALLOWED_HOSTS = new Set([
    "feeds.bbci.co.uk",
    "www.lemonde.fr",
    "www.france24.com",
    "moxie.foxnews.com",
    //"abcnews.go.com",
	"rss.nytimes.com",
   // "lenouvelliste.com"
]);

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT = 12000;

module.exports = async (req, res) => {
    res.setHeader("Cache-Control", "public, s-maxage=300");

    if (req.method !== "GET") {
        return res.status(405).json({
            status: "error",
            message: "Méthode non autorisée"
        });
    }

    try {
        const rawUrl = req.query.url;

        if (!rawUrl || typeof rawUrl !== "string") {
            return res.status(400).json({
                status: "error",
                message: "URL RSS manquante"
            });
        }

        let currentUrl;

        try {
            currentUrl = new URL(rawUrl);
        } catch {
            return res.status(400).json({
                status: "error",
                message: "URL RSS invalide"
            });
        }

        // Valider l'URL initiale.
        if (
            currentUrl.protocol !== "https:" ||
            !ALLOWED_HOSTS.has(currentUrl.hostname) ||
            currentUrl.username ||
            currentUrl.password
        ) {
            return res.status(403).json({
                status: "error",
                message: "Flux RSS non autorisé"
            });
        }

        const headers = {
            "User-Agent": "Mozilla/5.0 RSSReader/1.0",
            "Accept":
                "application/rss+xml, application/atom+xml, application/xml, text/xml"
        };

        let response;

        // Suivre manuellement les redirections et vérifier
        // chaque destination avant de lui envoyer une requête.
        for (let i = 0; i <= MAX_REDIRECTS; i++) {
            if (
                currentUrl.protocol !== "https:" ||
                !ALLOWED_HOSTS.has(currentUrl.hostname) ||
                currentUrl.username ||
                currentUrl.password
            ) {
                return res.status(403).json({
                    status: "error",
                    message: "Destination de redirection non autorisée"
                });
            }

            response = await fetch(currentUrl, {
                headers,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT),
                redirect: "manual"
            });

            // La réponse n'est pas une redirection.
            if (response.status < 300 || response.status >= 400) {
                break;
            }

            const location = response.headers.get("location");

            if (!location) {
                await response.body?.cancel().catch(() => {});

                throw new Error(
                    "Redirection sans en-tête Location"
                );
            }

            if (i === MAX_REDIRECTS) {
                await response.body?.cancel().catch(() => {});

                throw new Error("Trop de redirections RSS");
            }

            // Résoudre les URL relatives ou absolues.
            const nextUrl = new URL(location, currentUrl);
			console.log("Flux RSS initial :", url.href);
            console.log("Redirection vers :", nextUrl.href);
            console.log("Domaine cible :", nextUrl.hostname);

            await response.body?.cancel().catch(() => {});

            // L'hôte sera vérifié avant la prochaine requête.
            currentUrl = nextUrl;
        }

        if (
            !response ||
            (response.status >= 300 && response.status < 400)
        ) {
            throw new Error("Redirection RSS non résolue");
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const xml = await response.text();

        if (!xml.trim()) {
            throw new Error("Le flux RSS est vide");
        }

        const parsed = parser.parse(xml);

        // Reconnaissance des formats RSS, RDF et Atom.
        let entries =
            parsed.rss?.channel?.item ??
            parsed["rdf:RDF"]?.item ??
            parsed.RDF?.item ??
            parsed.feed?.entry ??
            [];

        if (!Array.isArray(entries)) {
            entries = entries ? [entries] : [];
        }

        const items = entries
            .map(item => {
                let title = item.title ?? "Sans titre";

                if (typeof title === "object") {
                    title = title["#text"] ?? "Sans titre";
                }

                let link = item.link;

                // Les liens Atom peuvent être des objets ou des tableaux.
                if (Array.isArray(link)) {
                    link =
                        link.find(entry =>
                            !entry["@_rel"] ||
                            entry["@_rel"] === "alternate"
                        ) || link[0];
                }

                if (link && typeof link === "object") {
                    link =
                        link["@_href"] ??
                        link["#text"] ??
                        "";
                }

                if (typeof link === "string") {
                    link = link.trim();
                } else {
                    link = "";
                }

                // N'accepter que les liens HTTP(S).
                try {
                    const parsedLink = new URL(link);

                    if (
                        !["http:", "https:"].includes(
                            parsedLink.protocol
                        )
                    ) {
                        link = "";
                    }
                } catch {
                    link = "";
                }

                return {
                    title: String(title),
                    link
                };
            })
            .filter(item => item.link);

        return res.status(200).json({
            status: "ok",
            items
        });

    } catch (error) {
        // Détail utile dans le terminal du serveur.
        console.error("Erreur API RSS :", error);

        return res.status(502).json({
            status: "error",
            message:
                "Impossible de récupérer ou de lire ce flux RSS."
        });
    }
};
