const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Make sure you downloaded your serviceAccountKey.json into this folder!
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // If running on Railway, parse the JSON from the environment variable
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // If running locally, read the file
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  if (!fs.existsSync(serviceAccountPath)) {
    console.error("❌ ERROR: serviceAccountKey.json not found!");
    process.exit(1);
  }
  serviceAccount = require(serviceAccountPath);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = { admin, db };
