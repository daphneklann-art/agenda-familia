import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCcwNt4CQC4BRL5GZ8EE22qpNZ9vjO1m8Q',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'agenda-familia-32274.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'agenda-familia-32274',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'agenda-familia-32274.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '650760304882',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:650760304882:web:93f3dd8b0f95003ad9386b',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');
googleProvider.addScope('https://www.googleapis.com/auth/tasks');
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const ALLOWED_EMAILS = ['daphneklann@gmail.com', 'vnsnet@gmail.com'];
