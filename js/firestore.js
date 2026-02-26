import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { compressImageToBase64 } from './app.js';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const getDaysDiff = (date) => {
    const diff = Math.abs(new Date() - new Date(date));
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

let allProducts = []; 
let selectedMonthFilter = ""; 

const monthInput = document.getElementById('monthFilter');
const clearFilterBtn = document.getElementById('clearFilterBtn');

if(monthInput) {
    monthInput.addEventListener('change', (e) => {
        selectedMonthFilter = e.target.value;
        renderDashboard();
    });
}

if(clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
        selectedMonthFilter = "";
        monthInput.value = "";
        renderDashboard();
    });
}

// --- RENDERIZAR TELA ---
const renderDashboard = () => {
    const productList = document.getElementById('productList');
    if(!productList) return;
    
    productList.innerHTML = '';

    let totalInvested = 0; let totalSales = 0; let stockValue = 0; let monthlyProfit = 0; let salesCount = 0;

    const filteredProducts = allProducts.filter(p => {
        if (!selectedMonthFilter) return true; 
        if (p.status === 'sold' && p.saleDate) {
            return p.saleDate.startsWith(selectedMonthFilter);
        } else {
            return p.acquisitionDate.startsWith(selectedMonthFilter);
        }
    });

    filteredProducts.forEach((p) => {
        totalInvested += p.totalInvested;
        if (p.status === 'sold') {
            totalSales += p.saleValue; monthlyProfit += p.profit; salesCount++;
        } else {
            stockValue += p.totalInvested;
        }

        const days = getDaysDiff(p.acquisitionDate);
        let color = p.status === 'sold' ? 'var(--status-red)' : (days <= 7 ? 'var(--status-green)' : 'var(--status-yellow)');

        const card = document.createElement('div');
        card.className = 'kpi-card product-card'; 
        card.setAttribute('data-id', p.id); 
        card.style.borderLeft = `6px solid ${color}`;
        card.style.flexDirection = 'column';
        card.style.alignItems = 'flex-start';

        card.innerHTML = `
            <div class="card-top">
                <img src="${p.photo}" class="card-img-thumb" alt="Foto">
                <div class="card-info-top">
                    <h3 style="margin:0; font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</h3>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.description}</p>
                </div>
                <button class="btn-delete" data-id="${p.id}" title="Excluir Permanentemente"><i class="ph ph-trash"></i></button>
            </div>

            <div style="width:100%; padding-top: 8px; border-top: 1px solid #323238;">
                ${p.status === 'in_stock' ? `
                    <div style="display:flex; justify-content: space-between; align-items: center;">
                        <strong style="font-size: 0.95rem; color: var(--text-main)">Custo: ${formatCurrency(p.totalInvested)}</strong>
                        <div style="display:flex; gap:8px;">
                            <button class="btn-sm btn-gasto" data-id="${p.id}" style="background:#323238; color:white; padding:6px 12px; border-radius:6px; border:none; cursor:pointer; font-weight: 600;">+ Gasto</button>
                            <button class="btn-sm btn-vender" data-id="${p.id}" style="background:var(--status-green); color:white; padding:6px 12px; border-radius:6px; border:none; cursor:pointer; font-weight: 600;">Vender</button>
                        </div>
                    </div>
                ` : `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(247, 90, 104, 0.05); padding: 8px; border-radius: 6px;">
                        <div>
                            <p style="color:var(--text-muted); font-size: 0.8rem;">Custo: <del>${formatCurrency(p.totalInvested)}</del></p>
                            <p style="color:var(--status-green); font-size: 0.95rem; font-weight: bold;">Venda: ${formatCurrency(p.saleValue)}</p>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-size: 0.8rem; color: var(--text-muted);">Lucro</span>
                            <p style="color:white; font-size: 1.1rem; font-weight: bold;">${formatCurrency(p.profit)}</p>
                        </div>
                    </div>
                `}
            </div>
        `;
        productList.appendChild(card);
    });

    document.getElementById('kpi-invested').innerText = formatCurrency(totalInvested);
    document.getElementById('kpi-sales').innerText = formatCurrency(totalSales);
    document.getElementById('kpi-stock').innerText = formatCurrency(stockValue);
    document.getElementById('kpi-profit').innerText = formatCurrency(monthlyProfit);
    document.getElementById('kpi-sales-count').innerText = `${salesCount} vendas`;
};

// --- FUNÇÃO: ABRIR DETALHES E HISTÓRICO ---
const abrirDetalhesProduto = (id) => {
    const p = allProducts.find(prod => prod.id === id);
    if (!p) return;

    let extraCostsHtml = '';
    if (p.extraCosts && p.extraCosts.length > 0) {
        extraCostsHtml = '<ul class="expense-list">';
        p.extraCosts.forEach(cost => {
            const dataGasto = new Date(cost.date).toLocaleDateString('pt-BR');
            extraCostsHtml += `
                <li class="expense-item">
                    <div>
                        <span class="expense-item-desc">${cost.desc}</span>
                        <span class="expense-item-date">${dataGasto}</span>
                    </div>
                    <span class="expense-item-value">+ ${formatCurrency(cost.value)}</span>
                </li>
            `;
        });
        extraCostsHtml += '</ul>';
    } else {
        extraCostsHtml = '<p style="color:var(--text-muted); font-size: 0.9rem; margin-top:1rem;">Nenhum gasto extra (upsell) foi adicionado a este produto.</p>';
    }

    const dataCompra = new Date(p.acquisitionDate).toLocaleDateString('pt-BR');

    document.getElementById('detailsContent').innerHTML = `
        <div style="display:flex; gap:15px; margin-bottom:15px; border-bottom: 1px solid #323238; padding-bottom: 15px;">
            <img src="${p.photo}" style="width:70px; height:70px; object-fit:cover; border-radius:8px; border: 1px solid #323238;">
            <div>
                <h3 style="margin-bottom:5px;">${p.name}</h3>
                <p style="color:var(--text-muted); font-size:0.85rem;">Adquirido em: ${dataCompra}</p>
                <p style="color:var(--status-green); font-weight:bold; margin-top:5px;">Custo Inicial: ${formatCurrency(p.baseCost)}</p>
            </div>
        </div>
        <h4 style="margin-top: 10px; color: var(--text-main);">Histórico de Gastos (Upsell)</h4>
        ${extraCostsHtml}
        <div style="margin-top: 15px; text-align: right; font-size: 1.1rem; padding-top: 15px; border-top: 1px solid #323238;">
            <span style="color: var(--text-muted); font-size: 0.9rem;">Total Investido:</span> <br>
            <strong style="color:var(--blue-primary); font-size: 1.3rem;">${formatCurrency(p.totalInvested)}</strong>
        </div>
    `;

    document.getElementById('modalDetails').classList.add('active');
};

// --- CONEXÃO COM O BANCO EM TEMPO REAL ---
onSnapshot(query(collection(db, "products"), orderBy("acquisitionDate", "desc")), (snapshot) => {
    allProducts = [];
    snapshot.forEach((docSnap) => {
        allProducts.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderDashboard();
});

// --- SALVAR NOVO PRODUTO COM TRAVA DE SEGURANÇA ---
const formNewProduct = document.getElementById('formNewProduct');
if(formNewProduct) {
    formNewProduct.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSaveProduct');
        btn.innerText = "Salvando..."; btn.disabled = true;

        try {
            const dateInput = document.getElementById('productDate');
            if(!dateInput) throw new Error("Campo de data não encontrado no HTML!");

            const imageFile = document.getElementById('productImage').files[0];
            const base64Photo = await compressImageToBase64(imageFile);
            
            const inputDateStr = dateInput.value; 
            const acquisitionDate = inputDateStr ? new Date(inputDateStr + 'T12:00:00Z').toISOString() : new Date().toISOString();

            const newProduct = {
                name: document.getElementById('productName').value,
                description: document.getElementById('productDesc').value || "",
                baseCost: parseFloat(document.getElementById('productCost').value),
                totalInvested: parseFloat(document.getElementById('productCost').value),
                acquisitionDate: acquisitionDate,
                photo: base64Photo, status: 'in_stock', extraCosts: [], saleValue: 0, saleDate: null, profit: 0
            };

            await addDoc(collection(db, "products"), newProduct);
            formNewProduct.reset();
            document.getElementById('modalNewProduct').classList.remove('active');
            alert("Produto cadastrado com sucesso!");
        } catch (err) { 
            console.error("ERRO COMPLETO:", err);
            alert("Erro ao salvar: " + err.message); 
        } finally { 
            btn.innerText = "Salvar Produto"; btn.disabled = false; 
        }
    });
}

// --- DELEGAÇÃO DE EVENTOS (Gasto, Vender, Excluir e Abrir Detalhes) ---
const productListElement = document.getElementById('productList');
if(productListElement) {
    productListElement.addEventListener('click', async (e) => {
        const btnGasto = e.target.closest('.btn-gasto');
        const btnVender = e.target.closest('.btn-vender');
        const btnDelete = e.target.closest('.btn-delete');
        const cardClicado = e.target.closest('.product-card');

        if (btnGasto) {
            document.getElementById('expenseProductId').value = btnGasto.getAttribute('data-id');
            document.getElementById('modalAddExpense').classList.add('active');
            return;
        }
        
        if (btnVender) {
            document.getElementById('sellProductId').value = btnVender.getAttribute('data-id');
            document.getElementById('modalSell').classList.add('active');
            return;
        }
        
        if (btnDelete) {
            if (confirm("🚨 Tem certeza que deseja excluir permanentemente este produto do sistema?")) {
                await deleteDoc(doc(db, "products", btnDelete.getAttribute('data-id')));
            }
            return;
        }

        if (cardClicado) {
            abrirDetalhesProduto(cardClicado.getAttribute('data-id'));
        }
    });
}

// --- MODAIS DE GASTO E VENDA ---
const formAddExpense = document.getElementById('formAddExpense');
if(formAddExpense) {
    formAddExpense.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('expenseProductId').value;
        const desc = document.getElementById('expenseDesc').value;
        const value = parseFloat(document.getElementById('expenseCost').value);
        try {
            const docRef = doc(db, "products", id);
            const currentData = (await getDoc(docRef)).data();
            await updateDoc(docRef, {
                extraCosts: arrayUnion({ desc, value, date: new Date().toISOString() }),
                totalInvested: currentData.totalInvested + value
            });
            document.getElementById('modalAddExpense').classList.remove('active');
            formAddExpense.reset();
        } catch (error) { alert("Falha ao adicionar gasto."); }
    });
}

const formSell = document.getElementById('formSell');
if(formSell) {
    formSell.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('sellProductId').value;
        const val = parseFloat(document.getElementById('sellValue').value);
        try {
            const docRef = doc(db, "products", id);
            const pData = (await getDoc(docRef)).data();
            await updateDoc(docRef, { status: 'sold', saleValue: val, saleDate: new Date().toISOString(), profit: val - pData.totalInvested });
            document.getElementById('modalSell').classList.remove('active');
            formSell.reset();
        } catch (error) { alert("Falha ao concluir a venda."); }
    });
}