// --- FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyCWWgKeF1bzRfrGPvPeIG7ZPfc5nHmu2h4",
    authDomain: "librarymgt-2026.firebaseapp.com",
    projectId: "librarymgt-2026",
    storageBucket: "librarymgt-2026.firebasestorage.app",
    messagingSenderId: "836897960075",
    appId: "1:836897960075:web:11899c0996620eb428e48e"
};

firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db = firebase.firestore();

// Clean and Sanitize Injected App ID to guarantee perfect Firestore compatibility
var rawAppId = (typeof __app_id !== 'undefined' && __app_id) ? __app_id : 'library-saas';
var globalAppId = rawAppId.replace(/[^a-zA-Z0-9_]/g, '_');
var ADMIN_UID = 'cwBkWqFBuHeqpLyNBKdQSeF1iu83';

var currentUser = null;
var unsubscribeSnapshot = null;
var unsubscribeBroadcast = null;