import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { compressImageToBase64 } from './app.js';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const getDaysDiff = (date) => {
    const diff = Math.abs(new Date() - new Date(date));
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

let allProducts = []; 
let allCategories = [];
let selectedMonthFilter = ""; 
let selectedCategoryFilter = "";

const monthInput = document.getElementById('monthFilter');
const clearFilterBtn = document.getElementById('clearFilterBtn');

// --- ATUALIZA OS FILTROS AO MUDAR ---
if(monthInput) monthInput.addEventListener('change', (e) => { selectedMonthFilter = e.target.value; renderDashboard(); });

if(clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
        selectedMonthFilter = ""; 
        if(monthInput) monthInput.value = "";
        selectedCategoryFilter = ""; 
        populateCategories(); 
        renderDashboard(); 
    });
}

// --- RENDERIZAR TELA ---
const renderDashboard = () => {
    const productList = document.getElementById('productList');
    if(!productList) return;
    
    productList.innerHTML = '';

    let totalInvested = 0; let totalSales = 0; let stockValue = 0; let totalProfitFromSales = 0; let salesCount = 0;

    // 1. Filtrar o Array Base
    let filteredProducts = allProducts.filter(p => {
        let matchMonth = true;
        let matchCategory = true;

        if (selectedMonthFilter) {
            matchMonth = (p.status === 'sold' && p.saleDate) ? p.saleDate.startsWith(selectedMonthFilter) : p.acquisitionDate.startsWith(selectedMonthFilter);
        }
        if (selectedCategoryFilter) {
            matchCategory = p.category === selectedCategoryFilter;
        }
        return matchMonth && matchCategory;
    });

    // 2. ORDENAR: Itens "Em Estoque" primeiro, "Vendidos" para o final.
    filteredProducts.sort((a, b) => {
        if (a.status === 'in_stock' && b.status === 'sold') return -1;
        if (a.status === 'sold' && b.status === 'in_stock') return 1;
        return new Date(b.acquisitionDate) - new Date(a.acquisitionDate);
    });

    filteredProducts.forEach((p) => {
        // KPI CALCS
        totalInvested += p.totalInvested;
        if (p.status === 'sold') {
            totalSales += p.saleValue; 
            totalProfitFromSales += p.profit; 
            salesCount++;
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
        if(p.status === 'sold') card.style.opacity = '0.7';

        card.innerHTML = `
            <div class="card-top">
                <img src="${p.photo}" class="card-img-thumb" alt="Foto">
                <div class="card-info-top">
                    <span class="category-badge">${p.category || 'Sem Categoria'}</span>
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

    // --- NOVA LÓGICA DO LUCRO REAL (Fluxo de Caixa) ---
    // Lucro das Vendas MENOS o Dinheiro travado em Estoque
    let finalRealProfit = totalProfitFromSales - stockValue;

    document.getElementById('kpi-invested').innerText = formatCurrency(totalInvested);
    document.getElementById('kpi-sales').innerText = formatCurrency(totalSales);
    document.getElementById('kpi-stock').innerText = formatCurrency(stockValue);
    
    // Pegando o elemento do Lucro para aplicar as cores
    const kpiProfitElement = document.getElementById('kpi-profit');
    kpiProfitElement.innerText = formatCurrency(finalRealProfit);

    // Sistema de Cores (Verde se positivo, Vermelho se negativo, Branco se zerado)
    if (finalRealProfit > 0) {
        kpiProfitElement.style.color = 'var(--status-green)';
    } else if (finalRealProfit < 0) {
        kpiProfitElement.style.color = 'var(--status-red)';
    } else {
        kpiProfitElement.style.color = 'var(--text-main)';
    }

    document.getElementById('kpi-sales-count').innerText = `${salesCount} vendas`;
};

// --- RENDERIZAR OPÇÕES DE CATEGORIA (PILLS) ---
const populateCategories = () => {
    const pillsContainer = document.getElementById('categoryPills');
    const formSelect = document.getElementById('productCategory');
    if(!pillsContainer || !formSelect) return;

    formSelect.innerHTML = '<option value="" disabled selected>Selecione...</option>';
    allCategories.forEach(cat => {
        formSelect.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
    });

    pillsContainer.innerHTML = `
        <button class="category-pill ${selectedCategoryFilter === "" ? "active" : ""}" data-cat="">
            <i class="ph ph-squares-four"></i> Todas
        </button>
    `;
    
    allCategories.forEach(cat => {
        pillsContainer.innerHTML += `
            <button class="category-pill ${selectedCategoryFilter === cat.name ? "active" : ""}" data-cat="${cat.name}">
                ${cat.name}
            </button>
        `;
    });

    document.querySelectorAll('.category-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            selectedCategoryFilter = e.currentTarget.getAttribute('data-cat');
            populateCategories(); 
            renderDashboard(); 
        });
    });
};

// --- BUSCA TEMPO REAL NO BANCO DE DADOS ---
onSnapshot(query(collection(db, "categories"), orderBy("name", "asc")), (snapshot) => {
    allCategories = [];
    snapshot.forEach(doc => allCategories.push({ id: doc.id, name: doc.data().name }));
    populateCategories();
});

onSnapshot(query(collection(db, "products"), orderBy("acquisitionDate", "desc")), (snapshot) => {
    allProducts = [];
    snapshot.forEach(doc => allProducts.push({ id: doc.id, ...doc.data() }));
    renderDashboard();
});

// --- CRIAR NOVA CATEGORIA ---
const btnOpenNewCategory = document.getElementById('btnOpenNewCategory');
if(btnOpenNewCategory) {
    btnOpenNewCategory.addEventListener('click', () => {
        document.getElementById('modalNewCategory').classList.add('active');
    });
}

const formNewCategory = document.getElementById('formNewCategory');
if(formNewCategory) {
    formNewCategory.addEventListener('submit', async (e) => {
        e.preventDefault();
        const catName = document.getElementById('newCategoryName').value.trim();
        try {
            await addDoc(collection(db, "categories"), { name: catName });
            document.getElementById('modalNewCategory').classList.remove('active');
            formNewCategory.reset();
        } catch (err) { alert("Erro ao criar categoria"); }
    });
}

// --- SALVAR NOVO PRODUTO ---
const formNewProduct = document.getElementById('formNewProduct');
if(formNewProduct) {
    formNewProduct.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSaveProduct');
        btn.innerText = "Salvando..."; btn.disabled = true;

        try {
            const dateInput = document.getElementById('productDate');
            const categoryInput = document.getElementById('productCategory');

            const imageFile = document.getElementById('productImage').files[0];
            const base64Photo = await compressImageToBase64(imageFile);
            
            const inputDateStr = dateInput.value; 
            const acquisitionDate = inputDateStr ? new Date(inputDateStr + 'T12:00:00Z').toISOString() : new Date().toISOString();

            const newProduct = {
                name: document.getElementById('productName').value,
                description: document.getElementById('productDesc').value || "",
                category: categoryInput.value || "Outros", 
                baseCost: parseFloat(document.getElementById('productCost').value),
                totalInvested: parseFloat(document.getElementById('productCost').value),
                acquisitionDate: acquisitionDate,
                photo: base64Photo, status: 'in_stock', extraCosts: [], saleValue: 0, saleDate: null, profit: 0
            };

            await addDoc(collection(db, "products"), newProduct);
            formNewProduct.reset();
            document.getElementById('modalNewProduct').classList.remove('active');
        } catch (err) { 
            console.error(err); alert("Erro ao salvar: " + err.message); 
        } finally { 
            btn.innerText = "Salvar Produto"; btn.disabled = false; 
        }
    });
}

// --- DELEGAÇÃO DE EVENTOS CLIQUE (Cards) ---
const productListElement = document.getElementById('productList');
if(productListElement) {
    productListElement.addEventListener('click', async (e) => {
        const btnGasto = e.target.closest('.btn-gasto');
        const btnVender = e.target.closest('.btn-vender');
        const btnDelete = e.target.closest('.btn-delete');
        const cardClicado = e.target.closest('.product-card');

        if (btnGasto) { document.getElementById('expenseProductId').value = btnGasto.getAttribute('data-id'); document.getElementById('modalAddExpense').classList.add('active'); return; }
        if (btnVender) { document.getElementById('sellProductId').value = btnVender.getAttribute('data-id'); document.getElementById('modalSell').classList.add('active'); return; }
        if (btnDelete) { if (confirm("🚨 Excluir permanentemente este produto?")) await deleteDoc(doc(db, "products", btnDelete.getAttribute('data-id'))); return; }

        if (cardClicado) abrirDetalhesProduto(cardClicado.getAttribute('data-id'));
    });
}

// --- FUNÇÃO: ABRIR DETALHES E EDITAR CATEGORIA ---
const abrirDetalhesProduto = (id) => {
    const p = allProducts.find(prod => prod.id === id);
    if (!p) return;

    let extraCostsHtml = '';
    if (p.extraCosts && p.extraCosts.length > 0) {
        extraCostsHtml = '<ul class="expense-list">';
        p.extraCosts.forEach(cost => {
            const dataGasto = new Date(cost.date).toLocaleDateString('pt-BR');
            extraCostsHtml += `<li class="expense-item"><div><span class="expense-item-desc">${cost.desc}</span><span class="expense-item-date">${dataGasto}</span></div><span class="expense-item-value">+ ${formatCurrency(cost.value)}</span></li>`;
        });
        extraCostsHtml += '</ul>';
    } else {
        extraCostsHtml = '<p style="color:var(--text-muted); font-size: 0.9rem; margin-top:1rem;">Nenhum gasto extra adicionado.</p>';
    }

    const dataCompra = new Date(p.acquisitionDate).toLocaleDateString('pt-BR');
    let catOptions = allCategories.map(c => `<option value="${c.name}" ${p.category === c.name ? 'selected' : ''}>${c.name}</option>`).join('');

    const descText = p.description ? p.description : "Nenhuma descrição informada.";

    document.getElementById('detailsContent').innerHTML = `
        <div style="display:flex; gap:15px; margin-bottom:15px; border-bottom: 1px solid #323238; padding-bottom: 15px;">
            <img src="${p.photo}" style="width:70px; height:70px; object-fit:cover; border-radius:8px; border: 1px solid #323238;">
            <div style="flex:1; min-width:0;">
                <h3 style="margin-bottom:2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</h3>
                <label style="font-size: 0.75rem; color: var(--text-muted);">Alterar Categoria:</label>
                <select class="edit-category-select" id="editCat-${p.id}">
                    <option value="Outros">Outros</option>
                    ${catOptions}
                </select>
                <p style="color:var(--text-muted); font-size:0.85rem; margin-top: 5px;">Adquirido em: ${dataCompra}</p>
            </div>
        </div>

        <div style="background-color: #1a1a1e; border: 1px dashed #323238; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
            <strong style="color: var(--text-main); font-size: 0.85rem; display: block; margin-bottom: 4px;">Descrição:</strong>
            <p style="color: var(--text-muted); font-size: 0.9rem; white-space: pre-wrap; line-height: 1.4;">${descText}</p>
        </div>

        <h4 style="margin-top: 10px; color: var(--text-main);">Histórico de Gastos</h4>
        ${extraCostsHtml}
        
        <div style="margin-top: 15px; text-align: right; font-size: 1.1rem; padding-top: 15px; border-top: 1px solid #323238;">
            <span style="color: var(--text-muted); font-size: 0.9rem;">Total Investido:</span> <br>
            <strong style="color:var(--blue-primary); font-size: 1.3rem;">${formatCurrency(p.totalInvested)}</strong>
        </div>
    `;

    document.getElementById('modalDetails').classList.add('active');

    document.getElementById(`editCat-${p.id}`).addEventListener('change', async (e) => {
        try { await updateDoc(doc(db, "products", p.id), { category: e.target.value }); } catch(err) { alert("Erro ao mudar categoria"); }
    });
};

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
        const dateInput = document.getElementById('sellDate').value;
        
        try {
            const docRef = doc(db, "products", id);
            const pData = (await getDoc(docRef)).data();
            
            const saleDateISO = new Date(dateInput + 'T12:00:00Z').toISOString();

            await updateDoc(docRef, { 
                status: 'sold', 
                saleValue: val, 
                saleDate: saleDateISO, 
                profit: val - pData.totalInvested 
            });
            document.getElementById('modalSell').classList.remove('active');
            formSell.reset();
        } catch (error) { alert("Falha ao concluir a venda."); }
    });
}