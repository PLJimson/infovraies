
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_DESTINATION = "pierrelouis.jimson@gmail.com";
const EMAIL_EXPEDITEUR = "Infovraies <contact@infovraies.info>";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");

        return res.status(405).json({
            success: false,
            message: "Méthode non autorisée."
        });
    }

    try {
        const { name, email, subject, message, website } =
            req.body ?? {};

        // Champ anti-spam invisible
        if (website) {
            return res.status(200).json({
                success: true,
                message: "Message reçu."
            });
        }

        // Vérification des champs
        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof message !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Certains champs sont invalides."
            });
        }

        const nom = name.trim();
        const adresse = email.trim();
        const contenu = message.trim();
        const sujet = typeof subject === "string"
            ? subject.trim()
            : "";

        if (
            !nom ||
            !contenu ||
            nom.length > 100 ||
            adresse.length > 254 ||
            contenu.length > 10000 ||
            sujet.length > 200 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)
        ) {
            return res.status(400).json({
                success: false,
                message: "Vérifie les informations saisies."
            });
        }

        if (!process.env.RESEND_API_KEY) {
            console.error("RESEND_API_KEY est manquante.");

            return res.status(500).json({
                success: false,
                message: "Le service d'envoi n'est pas configuré."
            });
        }

        const { data, error } = await resend.emails.send({
            from: EMAIL_EXPEDITEUR,
            to: [EMAIL_DESTINATION],
            replyTo: adresse,
            subject: `Message du site Infovraies : ${
                sujet || "Nouveau message"
            }`,
            text: [
                `Nom : ${nom}`,
                `Adresse e-mail : ${adresse}`,
                `Sujet : ${sujet || "Non précisé"}`,
                "",
                "Message :",
                contenu
            ].join("\n")
        });

        if (error) {
            console.error("Erreur Resend :", error);

            return res.status(502).json({
                success: false,
                message: "L'envoi a échoué. Réessaie plus tard."
            });
        }

        console.log("Message envoyé. Identifiant :", data?.id);

        return res.status(200).json({
            success: true,
            message: "Ton message a bien été envoyé."
        });
    } catch (error) {
        console.error("Erreur API contact :", error);

        return res.status(500).json({
            success: false,
            message: "Une erreur est survenue. Réessaie plus tard."
        });
    }
}
