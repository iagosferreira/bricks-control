// Importa do link direto da nuvem (CDN) em vez de pacotes NPM
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// As SUAS chaves do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAyGJOWajR92SI3VhShqXigQpxJxbMjVHo",
  authDomain: "bricks-app-f8c83.firebaseapp.com",
  projectId: "bricks-app-f8c83",
  storageBucket: "bricks-app-f8c83.firebasestorage.app",
  messagingSenderId: "76236668897",
  appId: "1:76236668897:web:dac1e6c77bd5d8f0c6dca0"
};

// Inicializa o aplicativo Firebase
const app = initializeApp(firebaseConfig);

// Prepara o Banco de Dados (Firestore) e a Autenticação (Auth) para usarmos nos outros arquivos
export const db = getFirestore(app);
export const auth = getAuth(app);
