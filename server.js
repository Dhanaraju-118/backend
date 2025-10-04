// Custom server to serve both API and static files
const express = require('express');
const path = require('path');
const { app } = require('./dist/index.js');

const PORT = process.env.PORT || 3001;

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'public')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});