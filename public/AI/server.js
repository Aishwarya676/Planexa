const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve static files from the current directory
app.use(express.static(__dirname));

// Handle root route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post("/ai", async (req, res) => {
    const { message } = req.body;

    try {
        const response = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama3.2:1b",
                prompt: message
            })
        });

        const data = await response.json();
        res.send({ reply: data.response });
    } catch (error) {
        console.error("Error calling AI service:", error);
        res.status(500).send({ error: "Failed to process your request" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`AI endpoint: http://localhost:${PORT}/ai`);
});
