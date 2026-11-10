/* Firebase Cloud Messaging Service Worker for LabSetu Admin Portal */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBM4u9_Kv7EdingjaLFoMFHrnkqijDI-SA',
  authDomain: 'labsetu-diagnostics.firebaseapp.com',
  projectId: 'labsetu-diagnostics',
  storageBucket: 'labsetu-diagnostics.firebasestorage.app',
  messagingSenderId: '125622512041',
  appId: '1:125622512041:web:6484db0479d7d4474cbcb8',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload?.notification?.title || 'LabSetu Diagnostics Alert';
  const notificationOptions = {
    body: payload?.notification?.body || 'New diagnostic logistics notification received.',
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
