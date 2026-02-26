// js/auth.js
import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('errorMessage');
const loginBtn = document.getElementById('loginBtn');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que a página recarregue
    
    const email = emailInput.value;
    const password = passwordInput.value;
    
    // Feedback visual de carregamento
    loginBtn.innerHTML = 'Acessando... <i class="ph ph-spinner ph-spin"></i>';
    loginBtn.style.opacity = '0.8';
    loginBtn.disabled = true;

    try {
        // Tenta fazer o login no Firebase
        await signInWithEmailAndPassword(auth, email, password);
        
        // Se der certo, redireciona para o painel
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        // Se der erro (senha errada, etc), mostra na tela
        console.error("Erro no login: ", error.code);
        
        if (error.code === 'auth/invalid-credential') {
            errorMessage.innerText = 'E-mail ou senha incorretos.';
        } else {
            errorMessage.innerText = 'Erro ao tentar logar. Tente novamente.';
        }
        
        // Restaura o botão
        loginBtn.innerHTML = 'Entrar no Sistema';
        loginBtn.style.opacity = '1';
        loginBtn.disabled = false;
    }
});