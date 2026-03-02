import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
 
onAuthStateChanged(auth, (user) => { if (!user) window.location.href = 'index.html'; });
document.getElementById('logoutBtn').addEventListener('click', () => { signOut(auth).then(() => { window.location.href = 'index.html'; }); });
 
const modalNewProduct = document.getElementById('modalNewProduct');
document.getElementById('newProductBtn').addEventListener('click', () => { modalNewProduct.classList.add('active'); });
 
// Modais fecham pelo botão X
document.querySelectorAll('.close-modal').forEach(button => {
    button.addEventListener('click', (e) => {
        const modalId = e.currentTarget.getAttribute('data-modal');
        document.getElementById(modalId).classList.remove('active');
    });
});
 
// Modais fecham apenas com DUPLO CLIQUE do lado de fora (não atrapalha o scroll/seleção de texto)
window.addEventListener('dblclick', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// FUNÇÃO GLOBAL: DIALOG CUSTOMIZADO (Substitui confirm e alert)
window.showDialog = (title, message, confirmText = "OK", isConfirm = false, isDanger = false) => {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customDialog');
        const btnConfirm = document.getElementById('btnDialogConfirm');
        const btnCancel = document.getElementById('btnDialogCancel');
        
        document.getElementById('dialogTitle').innerText = title;
        document.getElementById('dialogMessage').innerText = message;
        btnConfirm.innerText = confirmText;
        
        const icon = document.getElementById('dialogIcon');
        if(isDanger) {
            btnConfirm.style.backgroundColor = 'var(--status-red)';
            icon.innerHTML = '<i class="ph ph-warning-octagon" style="color: var(--status-red);"></i>';
        } else {
            btnConfirm.style.backgroundColor = 'var(--blue-primary)';
            icon.innerHTML = '<i class="ph ph-info" style="color: var(--blue-primary);"></i>';
        }

        btnCancel.style.display = isConfirm ? 'block' : 'none';
        overlay.classList.add('active');

        const cleanup = () => { overlay.classList.remove('active'); };

        btnConfirm.onclick = () => { cleanup(); resolve(true); };
        btnCancel.onclick = () => { cleanup(); resolve(false); };
    });
};

const btnAddSubItem = document.getElementById('btnAddSubItem');
const subItemsList = document.getElementById('subItemsList');
if (btnAddSubItem) {
    btnAddSubItem.addEventListener('click', () => {
        const div = document.createElement('div');
        div.className = 'sub-item-row';
        div.style.display = 'flex'; div.style.gap = '8px';
        div.innerHTML = `
            <input type="text" class="sub-item-name" placeholder="Ex: Jogo GTA V" style="flex: 2; padding: 0.6rem; border-radius: 6px; border: 1px solid #323238; background: #1a1a1e; color: white;">
            <input type="number" class="sub-item-qty" value="1" min="1" placeholder="Qtd" style="flex: 1; padding: 0.6rem; border-radius: 6px; border: 1px solid #323238; background: #1a1a1e; color: white;">
            <button type="button" class="btn-icon-bg btn-remove-subitem" style="padding: 0.6rem; color: var(--status-red);"><i class="ph ph-trash"></i></button>
        `;
        subItemsList.appendChild(div);
        div.querySelector('.btn-remove-subitem').addEventListener('click', () => div.remove());
    });
}
 
export const compressImageToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const scaleSize = 800 / img.width;
                canvas.width = 800; canvas.height = img.height * scaleSize;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
        reader.onerror = (error) => reject(error);
    });
};