import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD...xxxxxxxxxxxxxxxx",
  authDomain: "academia-parrales.firebaseapp.com",
  projectId: "academia-parrales",
  storageBucket: "academia-parrales.firebasestorage.app",
  messagingSenderId: "xxxxxxxxxxxx",
  appId: "1:xxxxxxxxxxxx:web:xxxxxxxxxxxx"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);