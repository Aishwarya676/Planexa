const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Enable CORS so your frontend can talk to Ollama
app.use(cors());

// Serve static files from current folder
app.use(express.static(__dirname));

// Optional: serve customer.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'customer.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
