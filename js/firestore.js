import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion, getDoc, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { compressImageToBase64 } from './app.js';
 
const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const getDaysDiff = (date) => Math.ceil(Math.abs(new Date() - new Date(date)) / (1000 * 60 * 60 * 24));

const kachingSound = new Audio('https://actions.google.com/sounds/v1/foley/cash_register_kaching.ogg');
 
let allProducts = []; 
let allCategories = [];
let allParts = []; 
let selectedMonthFilter = ""; 
let selectedStatusFilter = ""; 
let selectedCategoryFilter = "";
let currentDetailProductId = null; 
let selectedForBulk = new Set();

// VARIÁVEIS DE CONTROLO DE LUCRO REAL
window.globalLucroRealizado = 0;
let retiradasTotais = 0;
let lucroTecnicoBruto = 0; 
let currentPartsFilter = 'all';
 
const monthInput = document.getElementById('monthFilter');
const clearFilterBtn = document.getElementById('clearFilterBtn');

// --- ESCUTA O VALOR DE RETIRADAS EM TEMPO REAL ---
onSnapshot(doc(db, "configuracoes", "financas"), (docSnap) => {
    if (docSnap.exists()) {
        retiradasTotais = docSnap.data().retiradas || 0;
    } else {
        retiradasTotais = 0;
    }
    renderDashboard();
});

// --- LÓGICA DO NOVO DROPDOWN CUSTOMIZADO ---
const statusDropdown = document.getElementById('statusDropdown');
const statusDropdownText = document.getElementById('statusDropdownText');
const statusDropdownItems = document.querySelectorAll('.dropdown-list li');

if (statusDropdown) {
    statusDropdown.addEventListener('click', (e) => {
        statusDropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!statusDropdown.contains(e.target)) {
            statusDropdown.classList.remove('open');
        }
    });

    statusDropdownItems.forEach(item => {
        item.addEventListener('click', (e) => {
            statusDropdownItems.forEach(i => i.classList.remove('active'));
            const li = e.currentTarget;
            li.classList.add('active');
            statusDropdownText.innerText = li.innerText;
            selectedStatusFilter = li.getAttribute('data-value');
            renderDashboard();
        });
    });
}
 
if(monthInput) monthInput.addEventListener('change', (e) => { selectedMonthFilter = e.target.value; renderDashboard(); });

if(clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
        selectedMonthFilter = ""; selectedStatusFilter = ""; selectedCategoryFilter = "";
        if(monthInput) monthInput.value = ""; 
        
        if(statusDropdownText) statusDropdownText.innerText = "Status: Todos";
        statusDropdownItems.forEach(i => i.classList.remove('active'));
        if(statusDropdownItems[0]) statusDropdownItems[0].classList.add('active');

        selectedForBulk.clear(); updateBulkActionBar();
        populateCategories(); renderDashboard(); 
    });
}
 
const showCelebration = (profitValue) => {
    kachingSound.currentTime = 0; kachingSound.play();
    const overlay = document.getElementById('saleCelebration');
    document.getElementById('celebrationProfit').innerText = `+ ${formatCurrency(profitValue)}`;
    overlay.classList.add('active');
    setTimeout(() => { overlay.classList.remove('active'); }, 3000);
};

const updateBulkActionBar = () => {
    const bar = document.getElementById('bulkActionBar');
    const countSpan = document.getElementById('bulkCount');
    const btnDel = document.getElementById('btnBulkDelete');
    if (document.body.classList.contains('bulk-mode-active')) {
        bar.classList.add('active'); countSpan.innerText = `${selectedForBulk.size} selecionado(s)`;
        btnDel.style.display = selectedForBulk.size > 0 ? 'inline-flex' : 'none';
    } else { bar.classList.remove('active'); }
};

document.getElementById('btnToggleBulkMode').addEventListener('click', () => {
    document.body.classList.toggle('bulk-mode-active');
    if (!document.body.classList.contains('bulk-mode-active')) selectedForBulk.clear();
    updateBulkActionBar(); renderDashboard();
});

document.getElementById('btnBulkCancel').addEventListener('click', () => {
    selectedForBulk.clear(); document.body.classList.remove('bulk-mode-active'); 
    updateBulkActionBar(); renderDashboard(); 
});

document.getElementById('btnBulkSelectAll').addEventListener('click', () => {
    const displayedCards = document.querySelectorAll('.product-card');
    let allSelected = true;
    displayedCards.forEach(card => { if(!selectedForBulk.has(card.getAttribute('data-id'))) allSelected = false; });
    if(allSelected) selectedForBulk.clear(); 
    else displayedCards.forEach(card => selectedForBulk.add(card.getAttribute('data-id'))); 
    updateBulkActionBar(); renderDashboard();
});

document.getElementById('btnBulkDelete').addEventListener('click', async () => {
    if(await window.showDialog("Excluir Lotes", `Tem certeza que deseja excluir ${selectedForBulk.size} item(ns)?`, "Excluir", true, true)) {
        try {
            const deletePromises = [];
            selectedForBulk.forEach(id => deletePromises.push(deleteDoc(doc(db, "products", id))));
            await Promise.all(deletePromises);
            selectedForBulk.clear(); document.body.classList.remove('bulk-mode-active');
            updateBulkActionBar();
        } catch(err) { window.showDialog("Erro", "Falha ao excluir.", "OK"); }
    }
});

const populateCategories = () => {
    const pillsContainer = document.getElementById('categoryPills');
    const formSelects = [document.getElementById('productCategory'), document.getElementById('editProductCategory')];
    
    formSelects.forEach(select => {
        if(select) {
            select.innerHTML = '<option value="" disabled selected>Selecione...</option>';
            allCategories.forEach(cat => { select.innerHTML += `<option value="${cat.name}">${cat.name}</option>`; });
        }
    });
    
    if(pillsContainer) {
        let html = `<button type="button" class="category-pill ${selectedCategoryFilter === "" ? "active" : ""}" data-cat=""><i class="ph ph-squares-four"></i> Todas</button>`;
        allCategories.forEach(cat => { 
            const activeClass = selectedCategoryFilter === cat.name ? "active" : "";
            html += `<div style="display:inline-flex; align-items:center; position:relative;"><button type="button" class="category-pill ${activeClass}" data-cat="${cat.name}">${cat.name}</button><button type="button" class="btn-delete-cat" data-id="${cat.id}" title="Excluir"><i class="ph ph-x"></i></button></div>`;
        });
        html += `<button type="button" class="category-pill" id="btnNovaCatPill" style="border-style: dashed; color: var(--blue-primary);"><i class="ph ph-plus"></i> Nova</button>`;
        pillsContainer.innerHTML = html;
        
        // --- CORREÇÃO: Usando Event Delegation no pillsContainer para os cliques nas categorias ---
        pillsContainer.onclick = async (e) => {
            // Clique na pílula da categoria (filtra)
            if (e.target.closest('.category-pill[data-cat]')) {
                e.preventDefault(); 
                selectedCategoryFilter = e.target.closest('.category-pill[data-cat]').getAttribute('data-cat'); 
                selectedForBulk.clear(); 
                document.body.classList.remove('bulk-mode-active'); 
                updateBulkActionBar();
                populateCategories(); 
                renderDashboard();
            }
            // Clique no botão de nova categoria
            else if (e.target.closest('#btnNovaCatPill')) {
                document.getElementById('modalNewCategory').classList.add('active');
            }
            // Clique no botão de deletar categoria
            else if (e.target.closest('.btn-delete-cat')) {
                e.stopPropagation(); 
                const btn = e.target.closest('.btn-delete-cat');
                if(await window.showDialog("Excluir Categoria", "Deletar esta categoria?", "Excluir", true, true)) {
                    await deleteDoc(doc(db, "categories", btn.getAttribute('data-id'))); 
                }
            }
        };
    }
};

document.getElementById('formNewCategory').addEventListener('submit', async (e) => {
    e.preventDefault(); await addDoc(collection(db, "categories"), { name: document.getElementById('newCategoryName').value });
    document.getElementById('modalNewCategory').classList.remove('active'); e.target.reset();
});

document.getElementById('btnOpenRanking').addEventListener('click', () => {
    let catStats = {};
    allProducts.forEach(p => {
        const cat = p.category || 'Outros';
        if(!catStats[cat]) catStats[cat] = { qty: 0, fat: 0, inv: 0, profit: 0 };
        if(p.fundSource === 'pocket') catStats[cat].inv += p.baseCost;
        if(p.status === 'sold') {
            catStats[cat].qty += 1; catStats[cat].fat += p.saleValue; catStats[cat].profit += p.profit;
        }
        if(p.subItems) {
            p.subItems.forEach(sub => {
                if(sub.status === 'sold') {
                    catStats[cat].fat += sub.saleValue; catStats[cat].profit += sub.saleValue;
                }
            });
        }
    });

    const sortedCats = Object.keys(catStats).map(cat => ({ name: cat, ...catStats[cat] })).sort((a, b) => b.qty - a.qty);
    const content = document.getElementById('rankingModalContent');
    content.innerHTML = '';

    sortedCats.forEach((c, index) => {
        let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
        content.innerHTML += `
            <div style="background: #1a1a1e; border: 1px solid #323238; border-radius: 8px; padding: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #323238; padding-bottom: 8px; margin-bottom: 8px;">
                    <strong style="font-size: 1.1rem; color: var(--text-main);">${medal} ${c.name}</strong>
                    <span style="color: var(--blue-primary); font-weight: bold;">${c.qty} Vendas</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85rem;">
                    <div><span style="color: var(--text-muted);">Faturamento:</span> <br><span style="color: var(--text-main);">${formatCurrency(c.fat)}</span></div>
                    <div><span style="color: var(--text-muted);">Lucro Real:</span> <br><span style="color: var(--status-green);">${formatCurrency(c.profit)}</span></div>
                    <div style="grid-column: span 2; border-top: 1px solid #323238; padding-top: 5px; margin-top: 2px;">
                        <span style="color: var(--text-muted);">Investido do Bolso:</span> <span style="color: var(--status-red); font-weight: bold;">${formatCurrency(c.inv)}</span>
                    </div>
                </div>
            </div>
        `;
    });
    if(sortedCats.length === 0) content.innerHTML = '<p style="color: var(--text-muted);">Nenhuma venda registrada ainda.</p>';
    document.getElementById('modalRanking').classList.add('active');
});
 
const renderDashboard = () => {
    const productList = document.getElementById('productList');
    if(!productList) return;
    productList.innerHTML = '';
 
    let faturamentoTotal = 0, lucroRealizado = 0, valorEmEstoque = 0, investimentoDoBolso = 0, salesCount = 0;
 
    let filteredProducts = allProducts.filter(p => {
        let matchMonth = true, matchCategory = true, matchStatus = true;
        if (selectedMonthFilter) matchMonth = (p.status === 'sold' && p.saleDate) ? p.saleDate.startsWith(selectedMonthFilter) : p.acquisitionDate.startsWith(selectedMonthFilter);
        if (selectedCategoryFilter) matchCategory = p.category === selectedCategoryFilter;
        if (selectedStatusFilter) matchStatus = p.status === selectedStatusFilter;
        return matchMonth && matchCategory && matchStatus;
    });
 
    filteredProducts.sort((a, b) => {
        if (a.status === 'in_stock' && b.status === 'sold') return -1;
        if (a.status === 'sold' && b.status === 'in_stock') return 1;
        if (a.status === 'sold' && b.status === 'sold') return new Date(b.saleDate) - new Date(a.saleDate); 
        return new Date(b.acquisitionDate) - new Date(a.acquisitionDate); 
    });

    allProducts.forEach((p) => {
        if (p.fundSource === 'pocket') investimentoDoBolso += p.baseCost; 
        
        if (p.status === 'in_stock') {
            if (p.totalInvested > 0) valorEmEstoque += p.totalInvested;
            if (p.totalInvested < 0) lucroRealizado += Math.abs(p.totalInvested);
            else if (p.fundSource === 'profit') lucroRealizado -= p.totalInvested;
        } 
        else if (p.status === 'sold') { 
            salesCount++; faturamentoTotal += p.saleValue; lucroRealizado += p.profit; 
        }

        if (p.subItems && p.subItems.length > 0) {
            p.subItems.forEach(sub => {
                if(sub.status === 'sold') {
                    faturamentoTotal += sub.saleValue; 
                    if (p.status === 'in_stock' && p.totalInvested >= 0) lucroRealizado += sub.saleValue;
                }
            });
        }
    });

    // --- APLICAÇÃO DAS RETIRADAS ---
    lucroTecnicoBruto = lucroRealizado; 
    window.globalLucroRealizado = lucroRealizado - retiradasTotais; 

    filteredProducts.forEach((p) => {
        const days = getDaysDiff(p.acquisitionDate);
        let color = p.status === 'sold' ? 'var(--status-red)' : (days <= 7 ? 'var(--status-green)' : 'var(--status-yellow)');
        let roiHtml = '', feesHtml = '', channelHtml = '', clientHtml = '';
 
        if (p.status === 'sold') {
            const custoFinal = p.saleValue - p.profit - p.saleFee; 
            const roi = custoFinal > 0 ? (p.profit / custoFinal) * 100 : 0;
            roiHtml = `<span class="roi-badge ${roi >= 0 ? 'roi-positive' : 'roi-negative'}">${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</span>`;
            if(p.saleFee > 0) feesHtml = `<span style="font-size: 0.75rem; color: var(--status-red); display: block;">- Taxas: ${formatCurrency(p.saleFee)}</span>`;
            if(p.saleChannel) channelHtml = `<span style="font-size: 0.75rem; color: var(--blue-primary); display: block; margin-top: 4px;"><i class="ph ph-storefront"></i> ${p.saleChannel}</span>`;
            if(p.clientName) clientHtml = `<span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 2px;"><i class="ph ph-user"></i> ${p.clientName} ${p.clientWpp ? '('+p.clientWpp+')' : ''}</span>`;
        }
 
        let adLinkBtnHtml = (p.status === 'in_stock' && p.adLink) ? `<button class="btn-sm btn-ad-link" data-link="${p.adLink}" style="background:transparent; color:var(--text-main); padding:6px 10px; border-radius:6px; border:1px solid #323238; cursor:pointer;" title="Abrir Anúncio"><i class="ph ph-link"></i></button>` : '';
        let originBadge = p.fundSource === 'pocket' ? `<span style="font-size:0.7rem; color:var(--status-red); margin-left:8px; border: 1px solid var(--status-red); padding: 2px 5px; border-radius: 4px;">Bolso (${p.paymentMethod === 'avista' ? 'À vista' : 'Cartão'})</span>` : (p.fundSource === 'profit' ? `<span style="font-size:0.7rem; color:var(--status-green); margin-left:8px; border: 1px solid var(--status-green); padding: 2px 5px; border-radius: 4px;">Reinvestimento</span>` : '');

        const isChecked = selectedForBulk.has(p.id) ? 'checked' : '';
        const cardClass = selectedForBulk.has(p.id) ? 'product-card selected-card' : 'product-card';

        const card = document.createElement('div');
        card.className = cardClass; card.setAttribute('data-id', p.id); card.style.borderLeft = `6px solid ${color}`;
        if(p.status === 'sold') card.style.opacity = '0.7'; 
 
        card.innerHTML = `
            <input type="checkbox" class="card-checkbox bulk-select-cb" data-id="${p.id}" ${isChecked}>
            <div class="card-top"><img src="${p.photo}" class="card-img-thumb" alt="Foto"><div class="card-info-top"><span class="category-badge">${p.category || 'Sem Categoria'}</span><h3 style="margin:0; font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</h3><p style="font-size:0.8rem; color:var(--text-muted); margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.description}</p></div><button class="btn-delete" data-id="${p.id}" title="Excluir"><i class="ph ph-trash"></i></button></div>
            <div style="width:100%; padding-top: 8px; border-top: 1px solid #323238;">
                ${p.status === 'in_stock' ? `<div style="display:flex; justify-content: space-between; align-items: center;"><div><strong style="font-size: 0.95rem; color: var(--status-yellow); display:block;"><i class="ph ph-package"></i> Estoque: ${formatCurrency(p.totalInvested)}</strong>${originBadge}</div><div style="display:flex; gap:6px; flex-wrap: wrap; justify-content: flex-end;">${adLinkBtnHtml}<button class="btn-sm btn-gasto" data-id="${p.id}" style="background:#202024; border:1px solid #323238; color:var(--text-main); padding:6px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">+ Gasto</button><button class="btn-sm btn-add-sub" data-id="${p.id}" style="background:rgba(59, 130, 246, 0.1); border:1px solid rgba(59, 130, 246, 0.3); color:var(--blue-primary); padding:6px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">+ Sub-item</button><button class="btn-sm btn-vender" data-id="${p.id}" style="background:var(--status-green); color:white; padding:6px 16px; border-radius:6px; border:none; cursor:pointer; font-weight: 600;">Vender Lote</button></div></div>` 
                : `<div style="display: flex; justify-content: space-between; align-items: center; background: rgba(247, 90, 104, 0.05); padding: 8px; border-radius: 6px;"><div><p style="color:var(--text-main); font-size: 0.95rem; font-weight: bold;">Venda: ${formatCurrency(p.saleValue)}</p>${feesHtml}${channelHtml}${clientHtml}</div><div style="text-align: right;"><span style="font-size: 0.8rem; color: var(--text-muted);">Lucro Real</span><p style="color:var(--status-green); font-size: 1.1rem; font-weight: bold;">${formatCurrency(p.profit)} ${roiHtml}</p></div></div>`}
            </div>
        `;
        productList.appendChild(card);
    });
 
    document.getElementById('kpi-sales').innerText = formatCurrency(faturamentoTotal);
    document.getElementById('kpi-stock').innerText = formatCurrency(valorEmEstoque);
    document.getElementById('kpi-pocket').innerText = formatCurrency(investimentoDoBolso);
    
    // Atualiza o KPI do lucro com as cores corretas
    const kpiProfitElement = document.getElementById('kpi-profit');
    kpiProfitElement.innerText = formatCurrency(window.globalLucroRealizado);
    if (window.globalLucroRealizado > 0) kpiProfitElement.style.color = 'var(--status-green)';
    else if (window.globalLucroRealizado < 0) kpiProfitElement.style.color = 'var(--status-red)';
    else kpiProfitElement.style.color = 'var(--text-main)';
    document.getElementById('kpi-sales-count').innerText = `${salesCount} lotes vendidos`;
};
 
document.getElementById('filterPartsAll').addEventListener('click', (e) => { setPartFilter('all', e.target); });
document.getElementById('filterPartsLote').addEventListener('click', (e) => { setPartFilter('lote', e.target); });
document.getElementById('filterPartsManual').addEventListener('click', (e) => { setPartFilter('manual', e.target); });

const setPartFilter = (type, btn) => {
    currentPartsFilter = type;
    document.querySelectorAll('#modalParts .category-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    renderPartsList();
};

const renderPartsList = () => {
    const list = document.getElementById('partsList');
    const select = document.getElementById('expenseStockPart');
    const selectSubItem = document.getElementById('subItemStockPart'); 
    if(!list || !select || !selectSubItem) return;

    list.innerHTML = ''; 
    select.innerHTML = '<option value="" disabled selected>Selecione um insumo...</option>';
    selectSubItem.innerHTML = '<option value="" disabled selected>Selecione uma peça...</option>';

    allParts.forEach(part => {
        if(part.qty > 0) {
            select.innerHTML += `<option value="${part.id}">[Qtd: ${part.qty}] ${part.name} - ${formatCurrency(part.cost)}</option>`;
            selectSubItem.innerHTML += `<option value="${part.id}">[Qtd: ${part.qty}] ${part.name} - ${formatCurrency(part.cost)}</option>`;
        }
        
        const originType = part.origin || 'manual';
        if(currentPartsFilter === 'all' || currentPartsFilter === originType) {
            const badge = originType === 'lote' ? '<span style="font-size:0.7rem; color:var(--status-yellow); border:1px solid var(--status-yellow); padding: 2px 4px; border-radius:4px; margin-left: 8px;">Sobra de Lote</span>' : '';
            list.innerHTML += `<li class="part-item"><div class="part-info"><strong>${part.name} <span class="part-qty">${part.qty} un</span> ${badge}</strong><span>Custo un: ${formatCurrency(part.cost)}</span></div><button type="button" class="btn-icon-bg btn-delete-part" data-id="${part.id}" style="padding: 5px; color: var(--status-red); width: 35px; height: 35px;"><i class="ph ph-trash"></i></button></li>`;
        }
    });
    document.querySelectorAll('.btn-delete-part').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(await window.showDialog("Remover Insumo", "Excluir esta peça do estoque?", "Remover", true, true)) {
                await deleteDoc(doc(db, "parts", e.currentTarget.getAttribute('data-id')));
            }
        });
    });
};
 
onSnapshot(query(collection(db, "parts"), orderBy("name", "asc")), (snapshot) => {
    allParts = []; snapshot.forEach(doc => allParts.push({ id: doc.id, ...doc.data() })); renderPartsList();
});
document.getElementById('openPartsBtn').addEventListener('click', () => document.getElementById('modalParts').classList.add('active'));
document.getElementById('formNewPart').addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "parts"), { name: document.getElementById('partName').value, qty: parseInt(document.getElementById('partQty').value), cost: parseFloat(document.getElementById('partCost').value), origin: 'manual' });
    e.target.reset();
});
 
const expenseTypeSelect = document.getElementById('expenseType');
if(expenseTypeSelect) expenseTypeSelect.addEventListener('change', (e) => {
    document.getElementById('expenseManualDiv').style.display = e.target.value === 'manual' ? 'block' : 'none';
    document.getElementById('expenseStockDiv').style.display = e.target.value === 'stock' ? 'block' : 'none';
});
 
onSnapshot(query(collection(db, "categories"), orderBy("name", "asc")), (snapshot) => { allCategories = []; snapshot.forEach(doc => allCategories.push({ id: doc.id, name: doc.data().name })); populateCategories(); });
onSnapshot(query(collection(db, "products"), orderBy("acquisitionDate", "desc")), (snapshot) => { allProducts = []; snapshot.forEach(doc => allProducts.push({ id: doc.id, ...doc.data() })); renderDashboard(); });

document.getElementById('fundSource').addEventListener('change', (e) => { document.getElementById('divPaymentMethod').style.display = e.target.value === 'profit' ? 'none' : 'block'; });
 
document.getElementById('formNewProduct').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const btn = document.getElementById('btnSaveProduct'); btn.innerText = "A guardar..."; btn.disabled = true;
    try {
        const fundSourceVal = document.getElementById('fundSource').value;
        const totalGasto = parseFloat(document.getElementById('productCost').value);

        if (fundSourceVal === 'profit' && totalGasto > window.globalLucroRealizado) {
            await window.showDialog("Saldo Insuficiente", `Você tem apenas ${formatCurrency(window.globalLucroRealizado)} disponíveis para reinvestimento. Escolha "Bolso (Novo)" ou ajuste o valor.`, "OK", false, true);
            btn.innerText = "Salvar Produto"; btn.disabled = false;
            return;
        }

        const base64Photo = await compressImageToBase64(document.getElementById('productImage').files[0]);
        const inputDateStr = document.getElementById('productDate').value;
        
        const subItemsArray = Array.from(document.querySelectorAll('.sub-item-row')).map(row => {
            return { id: 'sub_' + Date.now() + Math.random().toString(36).substr(2, 5), name: row.querySelector('.sub-item-name').value.trim(), qty: parseInt(row.querySelector('.sub-item-qty').value) || 1, status: 'in_stock', saleValue: 0, saleDate: null };
        }).filter(item => item.name !== '');

        const paymentMethodVal = fundSourceVal === 'pocket' ? document.getElementById('paymentMethod').value : null;

        await addDoc(collection(db, "products"), {
            name: document.getElementById('productName').value, description: document.getElementById('productDesc').value || "", category: document.getElementById('productCategory').value || "Outros", 
            baseCost: totalGasto, totalInvested: totalGasto, acquisitionDate: inputDateStr ? new Date(inputDateStr + 'T12:00:00Z').toISOString() : new Date().toISOString(),
            photo: base64Photo, status: 'in_stock', extraCosts: [], saleValue: 0, saleFee: 0, saleDate: null, profit: 0, adLink: "", saleChannel: "", subItems: subItemsArray, fundSource: fundSourceVal, paymentMethod: paymentMethodVal 
        });
        e.target.reset(); document.getElementById('subItemsList').innerHTML = ''; document.getElementById('modalNewProduct').classList.remove('active'); document.getElementById('divPaymentMethod').style.display = 'block'; 
    } catch (err) { window.showDialog("Erro", "Erro ao guardar.", "OK"); } finally { btn.innerText = "Salvar Produto"; btn.disabled = false; }
});

document.getElementById('subItemSource').addEventListener('change', (e) => {
    document.getElementById('divSubItemNew').style.display = e.target.value === 'new' ? 'block' : 'none';
    document.getElementById('divSubItemStock').style.display = e.target.value === 'stock' ? 'block' : 'none';
});

document.getElementById('formAddSubItemExisting').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prodId = document.getElementById('addSubExistingProdId').value;
    const sourceType = document.getElementById('subItemSource').value;
    let finalName = ""; let finalQty = 1;

    try {
        if (sourceType === 'new') {
            finalName = document.getElementById('newSubItemNameExisting').value;
            finalQty = parseInt(document.getElementById('newSubItemQtyExisting').value) || 1;
        } else {
            const partRef = doc(db, "parts", document.getElementById('subItemStockPart').value);
            const partData = (await getDoc(partRef)).data();
            finalName = partData.name; finalQty = 1; 
            
            if(partData.qty <= 1) { await deleteDoc(partRef); } 
            else { await updateDoc(partRef, { qty: partData.qty - 1 }); }
        }

        const newSub = { id: 'sub_' + Date.now() + Math.random().toString(36).substr(2, 5), name: finalName, qty: finalQty, status: 'in_stock', saleValue: 0, saleDate: null };
        const pRef = doc(db, "products", prodId);
        await updateDoc(pRef, { subItems: arrayUnion(newSub) });
        document.getElementById('modalAddSubItemExisting').classList.remove('active'); e.target.reset();
        if(document.getElementById('modalDetails').classList.contains('active')) abrirDetalhesProduto(prodId);
    } catch(err) { window.showDialog("Erro", "Erro ao adicionar sub-item.", "OK"); }
});

document.getElementById('btnTriggerEdit').addEventListener('click', () => {
    if(!currentDetailProductId) return;
    const p = allProducts.find(prod => prod.id === currentDetailProductId);
    if(p) {
        document.getElementById('editProductId').value = p.id; document.getElementById('editProductName').value = p.name; document.getElementById('editProductCategory').value = p.category; document.getElementById('editProductDesc').value = p.description; document.getElementById('editProductDate').value = p.acquisitionDate.split('T')[0]; document.getElementById('editProductCost').value = p.baseCost;
        document.getElementById('modalDetails').classList.remove('active'); document.getElementById('modalEditProduct').classList.add('active');
    }
});

document.getElementById('formEditProduct').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editProductId').value;
    const newBaseCost = parseFloat(document.getElementById('editProductCost').value);
    try {
        const pRef = doc(db, "products", id); const pData = (await getDoc(pRef)).data();
        let sumExtra = pData.extraCosts ? pData.extraCosts.reduce((acc, curr) => acc + curr.value, 0) : 0;
        let sumSubSold = pData.subItems ? pData.subItems.filter(s => s.status === 'sold').reduce((acc, curr) => acc + curr.saleValue, 0) : 0;
        const newTotalInvested = newBaseCost + sumExtra - sumSubSold;
        await updateDoc(pRef, { name: document.getElementById('editProductName').value, category: document.getElementById('editProductCategory').value, description: document.getElementById('editProductDesc').value, acquisitionDate: new Date(document.getElementById('editProductDate').value + 'T12:00:00Z').toISOString(), baseCost: newBaseCost, totalInvested: newTotalInvested });
        document.getElementById('modalEditProduct').classList.remove('active');
    } catch(e) { window.showDialog("Erro", "Erro ao editar", "OK"); }
});
 
document.body.addEventListener('click', async (e) => {
    if (e.target.classList.contains('card-checkbox')) {
        e.stopPropagation(); const id = e.target.getAttribute('data-id');
        if(e.target.checked) selectedForBulk.add(id); else selectedForBulk.delete(id);
        const card = e.target.closest('.product-card'); if(e.target.checked) card.classList.add('selected-card'); else card.classList.remove('selected-card');
        updateBulkActionBar(); return;
    }

    const btnAddSub = e.target.closest('.btn-add-sub');
    const btnVender = e.target.closest('.btn-vender');
    const cardClicado = e.target.closest('.product-card');

    if (btnAddSub) {
        e.stopPropagation(); document.getElementById('addSubExistingProdId').value = btnAddSub.getAttribute('data-id'); document.getElementById('modalAddSubItemExisting').classList.add('active'); return;
    }

    if (btnVender) { 
        e.stopPropagation(); 
        const id = btnVender.getAttribute('data-id');
        document.getElementById('sellProductId').value = id; 
        
        const p = allProducts.find(x => x.id === id);
        const wrapper = document.getElementById('sellSubItemsWrapper');
        const checklist = document.getElementById('sellSubItemsChecklist');
        checklist.innerHTML = ''; 
        
        if(p.subItems && p.subItems.some(s => s.status === 'in_stock')) {
            wrapper.style.display = 'block';
            p.subItems.filter(s => s.status === 'in_stock').forEach(sub => {
                const qtyHtml = sub.qty > 1 ? `<input type="number" id="qty_${sub.id}" class="sell-subitem-qty" max="${sub.qty}" min="1" value="${sub.qty}" style="width: 60px; padding: 4px; border-radius: 4px; background: #1a1a1e; border: 1px solid #323238; color: white;">` : `<input type="hidden" id="qty_${sub.id}" value="1"><span style="font-size:0.8rem; color:var(--text-muted);">(Unico)</span>`;
                checklist.innerHTML += `<div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; border: 1px solid #323238;"><label style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1;"><input type="checkbox" class="sell-subitem-cb" value="${sub.id}" checked style="width: 18px; height: 18px; accent-color: var(--blue-primary);"><span style="color: white; font-size: 0.9rem;">${sub.name} <span style="color:var(--status-yellow); font-size:0.75rem;">(Tot: ${sub.qty})</span></span></label>${qtyHtml}</div>`;
            });
        } else { wrapper.style.display = 'none'; }
        document.getElementById('modalSell').classList.add('active'); 
        return; 
    }

    if (e.target.closest('.btn-vender-subitem')) { 
        const prodId = e.target.closest('.btn-vender-subitem').getAttribute('data-prod-id');
        const subId = e.target.closest('.btn-vender-subitem').getAttribute('data-sub-id');
        const sub = allProducts.find(x => x.id === prodId).subItems.find(s => s.id === subId);
        
        document.getElementById('sellSubItemProdId').value = prodId; 
        document.getElementById('sellSubItemId').value = subId; 
        document.getElementById('sellSubItemQty').max = sub.qty; document.getElementById('sellSubItemQty').value = sub.qty;
        document.getElementById('modalDetails').classList.remove('active'); document.getElementById('modalSellSubItem').classList.add('active'); 
        return; 
    }
    
    if (e.target.closest('.btn-gasto')) { e.stopPropagation(); document.getElementById('expenseProductId').value = e.target.closest('.btn-gasto').getAttribute('data-id'); document.getElementById('modalAddExpense').classList.add('active'); return; }
    if (e.target.closest('.btn-ad-link')) { e.stopPropagation(); window.open(e.target.closest('.btn-ad-link').getAttribute('data-link'), '_blank'); return; } 
    if (e.target.closest('.btn-delete')) { 
        e.stopPropagation(); 
        if (await window.showDialog("Excluir Lote", "Deletar este lote e todo o seu histórico?", "Excluir", true, true)) {
            await deleteDoc(doc(db, "products", e.target.closest('.btn-delete').getAttribute('data-id'))); 
        }
        return; 
    }
    if (cardClicado && !document.body.classList.contains('bulk-mode-active')) { abrirDetalhesProduto(cardClicado.getAttribute('data-id')); }
});
 
const abrirDetalhesProduto = (id) => {
    currentDetailProductId = id; 
    const p = allProducts.find(prod => prod.id === id); if (!p) return;
    let extraCostsHtml = p.extraCosts && p.extraCosts.length > 0 ? '<ul class="expense-list">' + p.extraCosts.map(cost => `<li class="expense-item"><div><span class="expense-item-desc">${cost.desc}</span><span class="expense-item-date">${new Date(cost.date).toLocaleDateString('pt-BR')}</span></div><span class="expense-item-value">+ ${formatCurrency(cost.value)}</span></li>`).join('') + '</ul>' : '<p style="color:var(--text-muted); font-size: 0.9rem; margin-top:1rem;">Nenhum gasto extra.</p>';
    const linkSectionHtml = p.status === 'in_stock' ? `<div style="margin-bottom: 15px;"><label style="font-size: 0.85rem; color: var(--text-main); font-weight: 500;">Link do Anúncio:</label><div style="display:flex; gap:8px; margin-top: 4px;"><input type="url" id="editAdLink-${p.id}" value="${p.adLink || ''}" style="flex:1; background:#1a1a1e; border:1px solid #323238; color:var(--text-main); padding:8px; border-radius:6px; font-size:0.9rem;"><button type="button" id="saveAdLink-${p.id}" class="btn-sm" style="background:var(--blue-primary); color:white; border:none; padding:0 15px; border-radius:6px; cursor:pointer; font-weight:bold;">Guardar</button></div></div>` : '';
 
    let subItemsHtml = '';
    if (p.subItems && p.subItems.length > 0) {
        subItemsHtml = '<h4 style="margin-top: 15px; color: var(--blue-primary);"><i class="ph ph-plugs-connected"></i> Itens Secundários</h4><ul style="list-style:none; padding:0; margin-top:10px;">';
        p.subItems.forEach(sub => {
            const qtyLabel = sub.qty > 1 ? ` <span style="font-size:0.75rem; color:var(--status-yellow);">(${sub.qty} un)</span>` : '';
            if (sub.status === 'in_stock' && p.status === 'in_stock') { subItemsHtml += `<li style="display:flex; justify-content:space-between; align-items:center; background:#1a1a1e; padding:10px; border-radius:8px; margin-bottom:8px; border: 1px solid #323238;"><span>${sub.name}${qtyLabel}</span><button type="button" class="btn-sm btn-vender-subitem" data-prod-id="${p.id}" data-sub-id="${sub.id}" style="background:var(--status-green); color:white; padding:4px 8px; border:none; border-radius:4px; cursor:pointer;">Vender</button></li>`; }
            else if (sub.status === 'sold') { subItemsHtml += `<li style="display:flex; justify-content:space-between; align-items:center; background:rgba(4, 211, 97, 0.05); padding:10px; border-radius:8px; margin-bottom:8px; border: 1px dashed var(--status-green);"><span style="color:var(--text-muted); text-decoration:line-through;">${sub.name}${qtyLabel}</span><strong style="color:var(--status-green);">Abateu ${formatCurrency(sub.saleValue)}</strong></li>`; } 
            else if (sub.status === 'transferred') { subItemsHtml += `<li style="display:flex; justify-content:space-between; align-items:center; background:#1a1a1e; padding:10px; border-radius:8px; margin-bottom:8px; border: 1px dashed #323238;"><span style="color:var(--text-muted);">${sub.name}${qtyLabel}</span><span style="font-size: 0.8rem; color: var(--blue-primary);">No Estoque Secundário</span></li>`; }
            else if (sub.status === 'sold_with_main') { subItemsHtml += `<li style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; margin-bottom:8px; border: 1px dashed #323238;"><span style="color:var(--text-muted); text-decoration:line-through;">${sub.name}${qtyLabel}</span><span style="font-size: 0.8rem; color: var(--status-green);">Vendido junto com Lote</span></li>`; }
        });
        subItemsHtml += '</ul>';
    }

    document.getElementById('detailsContent').innerHTML = `
        <div style="display:flex; gap:15px; margin-bottom:15px; border-bottom: 1px solid #323238; padding-bottom: 15px;">
            <img src="${p.photo}" style="width:70px; height:70px; object-fit:cover; border-radius:8px;">
            <div style="flex:1; min-width:0;"><h3 style="margin-bottom:2px;">${p.name}</h3><p style="color:var(--text-muted); font-size:0.85rem; margin-top: 5px;">Comprado: ${new Date(p.acquisitionDate).toLocaleDateString('pt-BR')}</p></div>
        </div>
        ${linkSectionHtml}
        <div style="background-color: #1a1a1e; border: 1px dashed #323238; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
            <strong style="color: var(--text-main); font-size: 0.85rem;">Descrição:</strong><p style="color: var(--text-muted); font-size: 0.9rem; white-space: pre-wrap;">${p.description || 'Sem descrição'}</p>
        </div>
        ${subItemsHtml}
        <h4 style="margin-top: 15px;">Histórico de Gastos Extras</h4>${extraCostsHtml}
        <div style="margin-top: 15px; text-align: right; font-size: 1.1rem; padding-top: 15px; border-top: 1px solid #323238;"><span style="color: var(--text-muted); font-size: 0.9rem;">Custo Atualizado (com abates):</span> <br><strong style="color:var(--status-yellow); font-size: 1.3rem;">${formatCurrency(p.totalInvested)}</strong></div>
    `;
    document.getElementById('modalDetails').classList.add('active');
 
    const saveLinkBtn = document.getElementById(`saveAdLink-${p.id}`);
    if (saveLinkBtn) saveLinkBtn.addEventListener('click', async () => { await updateDoc(doc(db, "products", p.id), { adLink: document.getElementById(`editAdLink-${p.id}`).value }); saveLinkBtn.innerText = "Salvo!"; saveLinkBtn.style.background = "var(--status-green)"; });
};

document.getElementById('formSellSubItem').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prodId = document.getElementById('sellSubItemProdId').value;
    try {
        const docRef = doc(db, "products", prodId); const pData = (await getDoc(docRef)).data();
        const val = parseFloat(document.getElementById('sellSubItemValue').value);
        const sellQty = parseInt(document.getElementById('sellSubItemQty').value);
        const subId = document.getElementById('sellSubItemId').value;
        const sub = pData.subItems.find(s => s.id === subId);

        if (sellQty < sub.qty) {
            const newSoldSub = { ...sub, id: 'sub_' + Date.now(), qty: sellQty, status: 'sold', saleValue: val, saleDate: new Date().toISOString() };
            sub.qty -= sellQty; pData.subItems.push(newSoldSub);
        } else {
            sub.status = 'sold'; sub.saleValue = val; sub.saleDate = new Date().toISOString();
        }
        await updateDoc(docRef, { subItems: pData.subItems, totalInvested: pData.totalInvested - val });
        document.getElementById('modalSellSubItem').classList.remove('active'); e.target.reset(); showCelebration(val); 
    } catch (error) { window.showDialog("Erro", "Falha ao vender sub-item.", "OK"); }
});
 
document.getElementById('formAddExpense').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const docRef = doc(db, "products", document.getElementById('expenseProductId').value); const currentData = (await getDoc(docRef)).data();
        let desc = "", value = 0;
        if(document.getElementById('expenseType').value === 'manual') { desc = document.getElementById('expenseDesc').value; value = parseFloat(document.getElementById('expenseCost').value); } 
        else { 
            const partRef = doc(db, "parts", document.getElementById('expenseStockPart').value); const partData = (await getDoc(partRef)).data(); desc = `Estoque Sec: ${partData.name}`; value = partData.cost; 
            if(partData.qty <= 1) await deleteDoc(partRef); else await updateDoc(partRef, { qty: partData.qty - 1 }); 
        }
        await updateDoc(docRef, { extraCosts: arrayUnion({ desc, value, date: new Date().toISOString() }), totalInvested: currentData.totalInvested + value });
        document.getElementById('modalAddExpense').classList.remove('active'); e.target.reset();
    } catch (error) { window.showDialog("Erro", "Falha ao adicionar gasto.", "OK"); }
});
 
document.getElementById('formSell').addEventListener('submit', async (e) => {
    e.preventDefault();
    const docRef = doc(db, "products", document.getElementById('sellProductId').value);
    const val = parseFloat(document.getElementById('sellValue').value);
    const feeInput = parseFloat(document.getElementById('sellFee').value) || 0; 
    try {
        const pData = (await getDoc(docRef)).data();
        const finalProfit = val - feeInput - pData.totalInvested; 

        let finalSubItems = pData.subItems || [];
        if (finalSubItems.length > 0) {
            const checkboxes = document.querySelectorAll('.sell-subitem-cb');
            for (const cb of checkboxes) {
                const subId = cb.value;
                const subIndex = finalSubItems.findIndex(s => s.id === subId);
                const inputQty = parseInt(document.getElementById(`qty_${subId}`).value);

                if (cb.checked) { 
                    if (inputQty < finalSubItems[subIndex].qty) {
                        const sobraQty = finalSubItems[subIndex].qty - inputQty;
                        await addDoc(collection(db, "parts"), { name: `[Sobra do Lote] ${finalSubItems[subIndex].name}`, qty: sobraQty, cost: 0, origin: 'lote' });
                        finalSubItems[subIndex].qty = inputQty;
                    }
                    finalSubItems[subIndex].status = 'sold_with_main'; 
                } 
                else {
                    await addDoc(collection(db, "parts"), { name: `[Sobra do Lote] ${finalSubItems[subIndex].name}`, qty: finalSubItems[subIndex].qty, cost: 0, origin: 'lote' });
                    finalSubItems[subIndex].status = 'transferred';
                }
            }
        }
 
        await updateDoc(docRef, { 
            status: 'sold', saleValue: val, saleFee: feeInput, saleChannel: document.getElementById('sellChannel').value, saleDate: new Date(document.getElementById('sellDate').value + 'T12:00:00Z').toISOString(), profit: finalProfit, subItems: finalSubItems,
            clientName: document.getElementById('sellClientName').value || "", clientWpp: document.getElementById('sellClientWpp').value || ""
        });
        document.getElementById('modalSell').classList.remove('active'); e.target.reset(); showCelebration(finalProfit); 
    } catch (error) { window.showDialog("Erro", "Falha ao concluir a venda.", "OK"); }
});
 
const exportCsvBtn = document.getElementById('exportCsvBtn');
if(exportCsvBtn) exportCsvBtn.addEventListener('click', () => { /* Mantido CSV padrão */ });

// --- LÓGICA DE EDIÇÃO DO LUCRO REAL (MODAL CUSTOMIZADO) ---
const cardLucro = document.querySelector('.kpi-card.highlight');
const modalEditProfit = document.getElementById('modalEditProfit');
const formEditProfit = document.getElementById('formEditProfit');

if (cardLucro && modalEditProfit) {
    cardLucro.addEventListener('click', () => {
        const lucroEsperado = lucroTecnicoBruto; 
        
        document.getElementById('lblLucroTecnico').innerText = formatCurrency(lucroEsperado);
        document.getElementById('lblRetiradas').innerText = formatCurrency(retiradasTotais);
        
        const valorAtualEmMaos = lucroEsperado - retiradasTotais;
        document.getElementById('inputRealProfit').value = valorAtualEmMaos > 0 ? valorAtualEmMaos.toFixed(2) : "";
        
        modalEditProfit.classList.add('active');
        
        setTimeout(() => document.getElementById('inputRealProfit').focus(), 100);
    });
    
    formEditProfit.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const lucroEsperado = lucroTecnicoBruto;
        const novoValorReal = parseFloat(document.getElementById('inputRealProfit').value);
        
        if (!isNaN(novoValorReal)) {
            const novaRetirada = lucroEsperado - novoValorReal;
            const btn = formEditProfit.querySelector('button[type="submit"]');
            
            try {
                btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> A guardar...';
                btn.disabled = true;
                
                await setDoc(doc(db, "configuracoes", "financas"), { retiradas: novaRetirada }, { merge: true });
                
                modalEditProfit.classList.remove('active');
                
                kachingSound.currentTime = 0;
                kachingSound.play();

            } catch (err) {
                console.error("Erro ao atualizar retiradas:", err);
                window.showDialog("Erro", "Falha ao guardar o novo lucro no banco de dados.", "OK", false, true);
            } finally {
                btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Guardar Novo Valor';
                btn.disabled = false;
            }
        }
    });

    const btnCloseModal = modalEditProfit.querySelector('.close-modal');
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            modalEditProfit.classList.remove('active');
        });
    }
}