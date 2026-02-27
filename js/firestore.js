import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { compressImageToBase64 } from './app.js';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const getDaysDiff = (date) => Math.ceil(Math.abs(new Date() - new Date(date)) / (1000 * 60 * 60 * 24));

let allProducts = []; 
let allCategories = [];
let allParts = []; // Novo Array para Estoque Secundário
let selectedMonthFilter = ""; 
let selectedCategoryFilter = "";

const monthInput = document.getElementById('monthFilter');
const clearFilterBtn = document.getElementById('clearFilterBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');

if(monthInput) monthInput.addEventListener('change', (e) => { selectedMonthFilter = e.target.value; renderDashboard(); });
if(clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
        selectedMonthFilter = ""; if(monthInput) monthInput.value = "";
        selectedCategoryFilter = ""; populateCategories(); renderDashboard(); 
    });
}

// --- GRÁFICO ---
let myChartInstance = null;
const renderChart = (invested, sales, profit) => {
    const ctx = document.getElementById('financeChart');
    if(!ctx) return;
    if (myChartInstance) myChartInstance.destroy();
    const profitColorBg = profit >= 0 ? 'rgba(59, 130, 246, 0.6)' : 'rgba(247, 90, 104, 0.6)';
    const profitColorBorder = profit >= 0 ? 'rgba(59, 130, 246, 1)' : 'rgba(247, 90, 104, 1)';
    myChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['Investido', 'Vendas', 'Fluxo de Caixa'], datasets: [{ label: 'R$', data: [invested, sales, profit], backgroundColor: ['#a8a8b3', '#04d361', profitColorBg], borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
};
const openChartBtn = document.getElementById('openChartBtn');
if (openChartBtn) openChartBtn.addEventListener('click', () => { document.getElementById('modalChart').classList.add('active'); });

// --- RENDERIZAR CATEGORIAS E RE-PINTAR BOTÕES AZUIS ---
const populateCategories = () => {
    const pillsContainer = document.getElementById('categoryPills');
    const formSelect = document.getElementById('productCategory');
    
    // 1. Atualiza o Select do Cadastro
    if(formSelect) {
        formSelect.innerHTML = '<option value="" disabled selected>Selecione...</option>';
        allCategories.forEach(cat => { formSelect.innerHTML += `<option value="${cat.name}">${cat.name}</option>`; });
    }

    // 2. Desenha os Chips com a cor Azul (active) no selecionado
    if(pillsContainer) {
        pillsContainer.innerHTML = `<button class="category-pill ${selectedCategoryFilter === "" ? "active" : ""}" data-cat=""><i class="ph ph-squares-four"></i> Todas</button>`;
        allCategories.forEach(cat => { 
            pillsContainer.innerHTML += `<button class="category-pill ${selectedCategoryFilter === cat.name ? "active" : ""}" data-cat="${cat.name}">${cat.name}</button>`; 
        });

        // 3. Adiciona o evento de clique em cada botão recém-desenhado
        document.querySelectorAll('.category-pill').forEach(pill => { 
            pill.addEventListener('click', (e) => { 
                selectedCategoryFilter = e.currentTarget.getAttribute('data-cat'); 
                populateCategories(); // Chama a si mesma para re-pintar a nova aba selecionada de azul
                renderDashboard(); 
            }); 
        });
    }
};

// --- RENDERIZAR TELA PRINCIPAL ---
const renderDashboard = () => {
    const productList = document.getElementById('productList');
    if(!productList) return;
    productList.innerHTML = '';

    let totalInvested = 0; let totalSales = 0; let stockValue = 0; let totalProfitFromSales = 0; let salesCount = 0;

    let filteredProducts = allProducts.filter(p => {
        let matchMonth = true; let matchCategory = true;
        if (selectedMonthFilter) matchMonth = (p.status === 'sold' && p.saleDate) ? p.saleDate.startsWith(selectedMonthFilter) : p.acquisitionDate.startsWith(selectedMonthFilter);
        if (selectedCategoryFilter) matchCategory = p.category === selectedCategoryFilter;
        return matchMonth && matchCategory;
    });

    filteredProducts.sort((a, b) => {
        if (a.status === 'in_stock' && b.status === 'sold') return -1;
        if (a.status === 'sold' && b.status === 'in_stock') return 1;
        return new Date(b.acquisitionDate) - new Date(a.acquisitionDate);
    });

    filteredProducts.forEach((p) => {
        totalInvested += p.totalInvested;
        if (p.status === 'sold') { totalSales += p.saleValue; totalProfitFromSales += p.profit; salesCount++; } 
        else { stockValue += p.totalInvested; }

        const days = getDaysDiff(p.acquisitionDate);
        let color = p.status === 'sold' ? 'var(--status-red)' : (days <= 7 ? 'var(--status-green)' : 'var(--status-yellow)');
        let roiHtml = ''; let feesHtml = ''; let channelHtml = '';

        if (p.status === 'sold') {
            const roi = p.totalInvested > 0 ? (p.profit / p.totalInvested) * 100 : 0;
            const roiClass = roi >= 0 ? 'roi-positive' : 'roi-negative';
            roiHtml = `<span class="roi-badge ${roiClass}">${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</span>`;
            if(p.saleFee && p.saleFee > 0) feesHtml = `<span style="font-size: 0.75rem; color: var(--status-red); display: block;">- Taxas: ${formatCurrency(p.saleFee)}</span>`;
            if(p.saleChannel) channelHtml = `<span style="font-size: 0.75rem; color: var(--blue-primary); display: block; margin-top: 4px;"><i class="ph ph-storefront"></i> Via ${p.saleChannel}</span>`;
        }

        let adLinkBtnHtml = (p.status === 'in_stock' && p.adLink) ? `<button class="btn-sm btn-ad-link" data-link="${p.adLink}" style="background:transparent; color:var(--text-main); padding:6px 10px; border-radius:6px; border:1px solid #323238; cursor:pointer;" title="Abrir Anúncio"><i class="ph ph-link"></i></button>` : '';

        const card = document.createElement('div');
        card.className = 'kpi-card product-card'; card.setAttribute('data-id', p.id); 
        card.style.borderLeft = `6px solid ${color}`; card.style.flexDirection = 'column'; card.style.alignItems = 'flex-start';
        if(p.status === 'sold') card.style.opacity = '0.7';

        card.innerHTML = `
            <div class="card-top"><img src="${p.photo}" class="card-img-thumb" alt="Foto"><div class="card-info-top"><span class="category-badge">${p.category || 'Sem Categoria'}</span><h3 style="margin:0; font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</h3><p style="font-size:0.8rem; color:var(--text-muted); margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.description}</p></div><button class="btn-delete" data-id="${p.id}" title="Excluir"><i class="ph ph-trash"></i></button></div>
            <div style="width:100%; padding-top: 8px; border-top: 1px solid #323238;">
                ${p.status === 'in_stock' ? `<div style="display:flex; justify-content: space-between; align-items: center;"><strong style="font-size: 0.95rem; color: var(--text-main)">Custo: ${formatCurrency(p.totalInvested)}</strong><div style="display:flex; gap:8px;">${adLinkBtnHtml}<button class="btn-sm btn-gasto" data-id="${p.id}" style="background:#323238; color:white; padding:6px 12px; border-radius:6px; border:none; cursor:pointer; font-weight: 600;">+ Gasto</button><button class="btn-sm btn-vender" data-id="${p.id}" style="background:var(--status-green); color:white; padding:6px 12px; border-radius:6px; border:none; cursor:pointer; font-weight: 600;">Vender</button></div></div>` 
                : `<div style="display: flex; justify-content: space-between; align-items: center; background: rgba(247, 90, 104, 0.05); padding: 8px; border-radius: 6px;"><div><p style="color:var(--status-green); font-size: 0.95rem; font-weight: bold;">Venda: ${formatCurrency(p.saleValue)}</p>${feesHtml}${channelHtml}</div><div style="text-align: right;"><span style="font-size: 0.8rem; color: var(--text-muted);">Lucro Líquido</span><p style="color:white; font-size: 1.1rem; font-weight: bold;">${formatCurrency(p.profit)} ${roiHtml}</p></div></div>`}
            </div>
        `;
        productList.appendChild(card);
    });

    let finalRealProfit = totalProfitFromSales - stockValue;
    document.getElementById('kpi-invested').innerText = formatCurrency(totalInvested);
    document.getElementById('kpi-sales').innerText = formatCurrency(totalSales);
    document.getElementById('kpi-stock').innerText = formatCurrency(stockValue);
    
    const kpiProfitElement = document.getElementById('kpi-profit');
    kpiProfitElement.innerText = formatCurrency(finalRealProfit);
    if (finalRealProfit > 0) kpiProfitElement.style.color = 'var(--status-green)';
    else if (finalRealProfit < 0) kpiProfitElement.style.color = 'var(--status-red)';
    else kpiProfitElement.style.color = 'var(--text-main)';

    document.getElementById('kpi-sales-count').innerText = `${salesCount} vendas`;
    renderChart(totalInvested, totalSales, finalRealProfit);

    // --- CÓDIGO DO BANNER DE MERCADO REMOVIDO ---
};

// --- RENDERIZAR E OUVIR ESTOQUE SECUNDÁRIO (PEÇAS) ---
const renderPartsList = () => {
    const list = document.getElementById('partsList');
    const select = document.getElementById('expenseStockPart');
    if(!list || !select) return;

    list.innerHTML = ''; select.innerHTML = '<option value="" disabled selected>Selecione um insumo...</option>';
    
    allParts.forEach(part => {
        if(part.qty > 0) {
            select.innerHTML += `<option value="${part.id}">[Qtd: ${part.qty}] ${part.name} - ${formatCurrency(part.cost)}</option>`;
        }
        list.innerHTML += `
            <li class="part-item">
                <div class="part-info">
                    <strong>${part.name} <span class="part-qty">${part.qty} un</span></strong>
                    <span>Custo un: ${formatCurrency(part.cost)}</span>
                </div>
                <button class="btn-icon-bg btn-delete-part" data-id="${part.id}" style="padding: 5px; color: var(--status-red);"><i class="ph ph-trash"></i></button>
            </li>
        `;
    });

    document.querySelectorAll('.btn-delete-part').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(confirm("Remover este insumo do estoque secundário?")) {
                await deleteDoc(doc(db, "parts", e.currentTarget.getAttribute('data-id')));
            }
        });
    });
};

// --- LISTENERS DO BANCO DE DADOS EM TEMPO REAL ---
onSnapshot(query(collection(db, "parts"), orderBy("name", "asc")), (snapshot) => {
    allParts = [];
    snapshot.forEach(doc => allParts.push({ id: doc.id, ...doc.data() }));
    renderPartsList();
});

document.getElementById('openPartsBtn').addEventListener('click', () => document.getElementById('modalParts').classList.add('active'));

document.getElementById('formNewPart').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('partName').value;
    const qty = parseInt(document.getElementById('partQty').value);
    const cost = parseFloat(document.getElementById('partCost').value);
    try {
        await addDoc(collection(db, "parts"), { name, qty, cost });
        e.target.reset();
    } catch(err) { alert("Erro ao adicionar peça."); }
});

// Lógica de Alternar Gasto Manual x Peça do Estoque
const expenseTypeSelect = document.getElementById('expenseType');
if(expenseTypeSelect) {
    expenseTypeSelect.addEventListener('change', (e) => {
        if(e.target.value === 'manual') {
            document.getElementById('expenseManualDiv').style.display = 'block';
            document.getElementById('expenseStockDiv').style.display = 'none';
        } else {
            document.getElementById('expenseManualDiv').style.display = 'none';
            document.getElementById('expenseStockDiv').style.display = 'block';
        }
    });
}


// --- DEMAIS LISTENERS DO BANCO ---
onSnapshot(query(collection(db, "categories"), orderBy("name", "asc")), (snapshot) => {
    allCategories = []; snapshot.forEach(doc => allCategories.push({ id: doc.id, name: doc.data().name }));
    populateCategories(); // <-- Adicionado aqui para carregar as categorias e pintar os botões
});

onSnapshot(query(collection(db, "products"), orderBy("acquisitionDate", "desc")), (snapshot) => {
    allProducts = []; snapshot.forEach(doc => allProducts.push({ id: doc.id, ...doc.data() })); renderDashboard();
});

// --- SALVAR NOVO PRODUTO ---
document.getElementById('formNewProduct').addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('btnSaveProduct'); btn.innerText = "Salvando..."; btn.disabled = true;
    try {
        const base64Photo = await compressImageToBase64(document.getElementById('productImage').files[0]);
        const inputDateStr = document.getElementById('productDate').value; 
        const acquisitionDate = inputDateStr ? new Date(inputDateStr + 'T12:00:00Z').toISOString() : new Date().toISOString();

        await addDoc(collection(db, "products"), {
            name: document.getElementById('productName').value, description: document.getElementById('productDesc').value || "",
            category: document.getElementById('productCategory').value || "Outros", 
            baseCost: parseFloat(document.getElementById('productCost').value), totalInvested: parseFloat(document.getElementById('productCost').value),
            acquisitionDate: acquisitionDate, photo: base64Photo, status: 'in_stock', extraCosts: [], saleValue: 0, saleFee: 0, saleDate: null, profit: 0, adLink: "", saleChannel: ""
        });
        e.target.reset(); document.getElementById('modalNewProduct').classList.remove('active');
    } catch (err) { alert("Erro ao salvar."); } finally { btn.innerText = "Salvar Produto"; btn.disabled = false; }
});

// --- DELEGAÇÃO DE EVENTOS CLIQUE (Cards) ---
document.getElementById('productList').addEventListener('click', async (e) => {
    const btnGasto = e.target.closest('.btn-gasto'); const btnVender = e.target.closest('.btn-vender');
    const btnDelete = e.target.closest('.btn-delete'); const btnAdLink = e.target.closest('.btn-ad-link'); const cardClicado = e.target.closest('.product-card');

    if (btnGasto) { document.getElementById('expenseProductId').value = btnGasto.getAttribute('data-id'); document.getElementById('modalAddExpense').classList.add('active'); return; }
    if (btnVender) { document.getElementById('sellProductId').value = btnVender.getAttribute('data-id'); document.getElementById('modalSell').classList.add('active'); return; }
    if (btnAdLink) { window.open(btnAdLink.getAttribute('data-link'), '_blank'); return; } 
    if (btnDelete) { if (confirm("🚨 Excluir permanentemente este produto?")) await deleteDoc(doc(db, "products", btnDelete.getAttribute('data-id'))); return; }
    if (cardClicado) abrirDetalhesProduto(cardClicado.getAttribute('data-id'));
});

// --- FUNÇÃO: ABRIR DETALHES ---
const abrirDetalhesProduto = (id) => {
    const p = allProducts.find(prod => prod.id === id); if (!p) return;
    let extraCostsHtml = p.extraCosts && p.extraCosts.length > 0 ? '<ul class="expense-list">' + p.extraCosts.map(cost => `<li class="expense-item"><div><span class="expense-item-desc">${cost.desc}</span><span class="expense-item-date">${new Date(cost.date).toLocaleDateString('pt-BR')}</span></div><span class="expense-item-value">+ ${formatCurrency(cost.value)}</span></li>`).join('') + '</ul>' : '<p style="color:var(--text-muted); font-size: 0.9rem; margin-top:1rem;">Nenhum gasto extra adicionado.</p>';
    const linkSectionHtml = p.status === 'in_stock' ? `<div style="margin-bottom: 15px;"><label style="font-size: 0.85rem; color: var(--text-main); font-weight: 500;">Link do Anúncio Ativo:</label><div style="display:flex; gap:8px; margin-top: 4px;"><input type="url" id="editAdLink-${p.id}" value="${p.adLink || ''}" style="flex:1; background:#1a1a1e; border:1px solid #323238; color:var(--text-main); padding:8px; border-radius:6px; font-size:0.9rem;" placeholder="https://..."><button id="saveAdLink-${p.id}" class="btn-sm" style="background:var(--blue-primary); color:white; border:none; padding:0 15px; border-radius:6px; cursor:pointer; font-weight:bold;">Salvar</button></div></div>` : '';

    document.getElementById('detailsContent').innerHTML = `
        <div style="display:flex; gap:15px; margin-bottom:15px; border-bottom: 1px solid #323238; padding-bottom: 15px;">
            <img src="${p.photo}" style="width:70px; height:70px; object-fit:cover; border-radius:8px;">
            <div style="flex:1; min-width:0;"><h3 style="margin-bottom:2px;">${p.name}</h3><p style="color:var(--text-muted); font-size:0.85rem; margin-top: 5px;">Comprado: ${new Date(p.acquisitionDate).toLocaleDateString('pt-BR')}</p></div>
        </div>
        ${linkSectionHtml}
        <div style="background-color: #1a1a1e; border: 1px dashed #323238; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
            <strong style="color: var(--text-main); font-size: 0.85rem;">Descrição:</strong><p style="color: var(--text-muted); font-size: 0.9rem;">${p.description || 'Sem descrição'}</p>
        </div>
        <h4 style="margin-top: 10px;">Histórico de Gastos</h4>${extraCostsHtml}
        <div style="margin-top: 15px; text-align: right; font-size: 1.1rem; padding-top: 15px; border-top: 1px solid #323238;"><span style="color: var(--text-muted); font-size: 0.9rem;">Total Investido:</span> <br><strong style="color:var(--blue-primary); font-size: 1.3rem;">${formatCurrency(p.totalInvested)}</strong></div>
    `;
    document.getElementById('modalDetails').classList.add('active');

    const saveLinkBtn = document.getElementById(`saveAdLink-${p.id}`);
    if (saveLinkBtn) {
        saveLinkBtn.addEventListener('click', async () => {
            await updateDoc(doc(db, "products", p.id), { adLink: document.getElementById(`editAdLink-${p.id}`).value }); 
            saveLinkBtn.innerText = "Salvo!"; saveLinkBtn.style.background = "var(--status-green)";
            setTimeout(() => { document.getElementById('modalDetails').classList.remove('active'); }, 600);
        });
    }
};

// --- MODAL DE GASTO (INTEGRADO COM ESTOQUE SECUNDÁRIO) ---
document.getElementById('formAddExpense').addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId = document.getElementById('expenseProductId').value;
    const type = document.getElementById('expenseType').value;
    
    let desc = ""; let value = 0;

    try {
        const docRef = doc(db, "products", productId);
        const currentData = (await getDoc(docRef)).data();

        if(type === 'manual') {
            desc = document.getElementById('expenseDesc').value;
            value = parseFloat(document.getElementById('expenseCost').value);
        } else {
            // Lógica do Estoque Secundário
            const partId = document.getElementById('expenseStockPart').value;
            if(!partId) return alert("Selecione uma peça!");
            
            const partRef = doc(db, "parts", partId);
            const partData = (await getDoc(partRef)).data();
            
            desc = `Estoque: ${partData.name}`;
            value = partData.cost;

            // Subtrai 1 do estoque de peças
            await updateDoc(partRef, { qty: partData.qty - 1 });
        }

        await updateDoc(docRef, { extraCosts: arrayUnion({ desc, value, date: new Date().toISOString() }), totalInvested: currentData.totalInvested + value });
        document.getElementById('modalAddExpense').classList.remove('active'); 
        e.target.reset();
    } catch (error) { alert("Falha ao adicionar gasto."); }
});

// --- CONCLUIR VENDA ---
document.getElementById('formSell').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('sellProductId').value;
    const val = parseFloat(document.getElementById('sellValue').value);
    const feeInput = parseFloat(document.getElementById('sellFee').value) || 0; 
    const dateInput = document.getElementById('sellDate').value;
    const channelInput = document.getElementById('sellChannel').value; 
    
    try {
        const docRef = doc(db, "products", id);
        const pData = (await getDoc(docRef)).data();
        const saleDateISO = new Date(dateInput + 'T12:00:00Z').toISOString();
        const finalProfit = val - feeInput - pData.totalInvested;

        await updateDoc(docRef, { status: 'sold', saleValue: val, saleFee: feeInput, saleChannel: channelInput, saleDate: saleDateISO, profit: finalProfit });
        document.getElementById('modalSell').classList.remove('active'); e.target.reset();
    } catch (error) { alert("Falha ao concluir a venda."); }
});

// CSV Export (Mantido padrão BR)
if(exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
        let csv = "Nome;Categoria;Status;Data Compra;Data Venda;Canal;Custo Total;Taxas;Valor Venda;Lucro;ROI (%)\n";
        allProducts.forEach(p => {
            csv += `"${p.name}";"${p.category||''}";${p.status==='sold'?'Vendido':'Estoque'};${p.acquisitionDate?new Date(p.acquisitionDate).toLocaleDateString('pt-BR'):''};${p.saleDate?new Date(p.saleDate).toLocaleDateString('pt-BR'):''};"${p.saleChannel||''}";${p.totalInvested.toFixed(2).replace('.',',')};${(p.saleFee||0).toFixed(2).replace('.',',')};${(p.saleValue||0).toFixed(2).replace('.',',')};${p.profit.toFixed(2).replace('.',',')};${(p.totalInvested>0&&p.status==='sold'?((p.profit/p.totalInvested)*100):0).toFixed(2).replace('.',',')}%\n`;
        });
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); 
        const link = document.createElement("a"); link.setAttribute("href", URL.createObjectURL(blob)); link.setAttribute("download", `BricksApp_Relatorio.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
    });
}