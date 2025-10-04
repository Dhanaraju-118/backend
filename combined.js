const express = require('express');
const path = require('path');

// Import the existing backend app
const { app: backendApp } = require('./dist/index.js');

// Create a new express app that will serve both backend API and frontend files
const app = express();

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'public')));

// API routes - delegate to the existing backend
app.use('/api', backendApp);

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});