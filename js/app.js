// js/app.js
import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ================= 1. PROTEÇÃO DE ROTA =================
// Verifica se o usuário está logado. Se não estiver, chuta para a tela de login.
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    }
});

// Lógica do botão de Sair (Logout)
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'index.html';
    });
});

// ================= 2. CONTROLE DOS MODAIS =================
const modalNewProduct = document.getElementById('modalNewProduct');
const btnNewProduct = document.getElementById('newProductBtn');

// Abrir modal de Novo Produto
btnNewProduct.addEventListener('click', () => {
    modalNewProduct.classList.add('active');
});

// Fechar qualquer modal ao clicar no botão "X"
document.querySelectorAll('.close-modal').forEach(button => {
    button.addEventListener('click', (e) => {
        const modalId = e.currentTarget.getAttribute('data-modal');
        document.getElementById(modalId).classList.remove('active');
    });
});

// Fechar modal ao clicar fora da caixa (no fundo escuro)
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// ================= 3. COMPRESSOR DE IMAGEM (BASE64) =================
// Exportamos essa função para usá-la no firestore.js quando formos salvar no banco
export const compressImageToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                // Cria um canvas invisível para redimensionar a imagem
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Define um tamanho máximo (ex: 800px de largura) para não estourar o banco
                const MAX_WIDTH = 800;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                
                // Desenha a imagem reduzida
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Converte de volta para texto (Base64) com qualidade de 70% (0.7)
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                resolve(compressedBase64);
            };
        };
        reader.onerror = (error) => reject(error);
    });
};