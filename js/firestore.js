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
const exportCsvBtn = document.getElementById('exportCsvBtn');

if(monthInput) monthInput.addEventListener('change', (e) => { selectedMonthFilter = e.target.value; renderDashboard(); });

if(clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
        selectedMonthFilter = ""; if(monthInput) monthInput.value = "";
        selectedCategoryFilter = ""; 
        populateCategories(); 
        renderDashboard(); 
    });
}

// --- LÓGICA DO GRÁFICO (Chart.js) ---
let myChartInstance = null;
const renderChart = (invested, sales, profit) => {
    const ctx = document.getElementById('financeChart');
    if(!ctx) return;
    if (myChartInstance) myChartInstance.destroy();

    const profitColorBg = profit >= 0 ? 'rgba(59, 130, 246, 0.6)' : 'rgba(247, 90, 104, 0.6)';
    const profitColorBorder = profit >= 0 ? 'rgba(59, 130, 246, 1)' : 'rgba(247, 90, 104, 1)';

    myChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Total Investido', 'Total de Vendas', 'Fluxo de Caixa (Lucro)'],
            datasets: [{
                label: 'Valores (R$)',
                data: [invested, sales, profit],
                backgroundColor: ['rgba(168, 168, 179, 0.6)', 'rgba(4, 211, 97, 0.6)', profitColorBg],
                borderColor: ['rgba(168, 168, 179, 1)', 'rgba(4, 211, 97, 1)', profitColorBorder],
                borderWidth: 1, borderRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.raw); } } } },
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#a8a8b3' } }, x: { grid: { display: false }, ticks: { color: '#e1e1e6' } } }
        }
    });
};

const openChartBtn = document.getElementById('openChartBtn');
if (openChartBtn) {
    openChartBtn.addEventListener('click', () => { document.getElementById('modalChart').classList.add('active'); });
}

// --- RENDERIZAR TELA ---
const renderDashboard = () => {
    const productList = document.getElementById('productList');
    if(!productList) return;
    
    productList.innerHTML = '';

    let totalInvested = 0; let totalSales = 0; let stockValue = 0; let totalProfitFromSales = 0; let salesCount = 0;

    let filteredProducts = allProducts.filter(p => {
        let matchMonth = true; let matchCategory = true;
        if (selectedMonthFilter) { matchMonth = (p.status === 'sold' && p.saleDate) ? p.saleDate.startsWith(selectedMonthFilter) : p.acquisitionDate.startsWith(selectedMonthFilter); }
        if (selectedCategoryFilter) { matchCategory = p.category === selectedCategoryFilter; }
        return matchMonth && matchCategory;
    });

    filteredProducts.sort((a, b) => {
        if (a.status === 'in_stock' && b.status === 'sold') return -1;
        if (a.status === 'sold' && b.status === 'in_stock') return 1;
        return new Date(b.acquisitionDate) - new Date(a.acquisitionDate);
    });

    filteredProducts.forEach((p) => {
        totalInvested += p.totalInvested;
        if (p.status === 'sold') {
            totalSales += p.saleValue; totalProfitFromSales += p.profit; salesCount++;
        } else {
            stockValue += p.totalInvested;
        }

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

        // NOVO: Botão de link direto no Card se tiver anúncio ativo
        let adLinkBtnHtml = '';
        if (p.status === 'in_stock' && p.adLink) {
            adLinkBtnHtml = `<button class="btn-sm btn-ad-link" data-link="${p.adLink}" style="background:transparent; color:var(--text-main); padding:6px 10px; border-radius:6px; border:1px solid #323238; cursor:pointer;" title="Abrir Anúncio"><i class="ph ph-link"></i></button>`;
        }

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
                            ${adLinkBtnHtml}
                            <button class="btn-sm btn-gasto" data-id="${p.id}" style="background:#323238; color:white; padding:6px 12px; border-radius:6px; border:none; cursor:pointer; font-weight: 600;">+ Gasto</button>
                            <button class="btn-sm btn-vender" data-id="${p.id}" style="background:var(--status-green); color:white; padding:6px 12px; border-radius:6px; border:none; cursor:pointer; font-weight: 600;">Vender</button>
                        </div>
                    </div>
                ` : `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(247, 90, 104, 0.05); padding: 8px; border-radius: 6px;">
                        <div>
                            <p style="color:var(--status-green); font-size: 0.95rem; font-weight: bold;">Venda: ${formatCurrency(p.saleValue)}</p>
                            ${feesHtml}
                            ${channelHtml}
                        </div>
                        <div style="text-align: right;">
                            <span style="font-size: 0.8rem; color: var(--text-muted);">Lucro Líquido</span>
                            <p style="color:white; font-size: 1.1rem; font-weight: bold;">${formatCurrency(p.profit)} ${roiHtml}</p>
                        </div>
                    </div>
                `}
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
};

// --- EXPORTAR PARA EXCEL (CSV) ATUALIZADO ---
if(exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
        let csv = "Nome;Categoria;Status;Data Compra;Data Venda;Canal de Venda;Link Anuncio;Custo Total;Taxas/Frete;Valor Venda;Lucro Liquido;ROI (%)\n";
        
        allProducts.forEach(p => {
            const statusStr = p.status === 'sold' ? 'Vendido' : 'Estoque';
            const dCompra = p.acquisitionDate ? new Date(p.acquisitionDate).toLocaleDateString('pt-BR') : '';
            const dVenda = p.saleDate ? new Date(p.saleDate).toLocaleDateString('pt-BR') : '';
            const canal = p.saleChannel || '';
            const linkAnun = p.adLink || '';
            
            const custo = p.totalInvested ? p.totalInvested.toFixed(2).replace('.', ',') : '0,00';
            const taxas = p.saleFee ? p.saleFee.toFixed(2).replace('.', ',') : '0,00';
            const venda = p.saleValue ? p.saleValue.toFixed(2).replace('.', ',') : '0,00';
            const lucro = p.profit ? p.profit.toFixed(2).replace('.', ',') : '0,00';
            const roi = p.totalInvested > 0 && p.status === 'sold' ? ((p.profit / p.totalInvested) * 100).toFixed(2).replace('.', ',') : '0,00';

            const nameEscaped = `"${p.name.replace(/"/g, '""')}"`;
            const catEscaped = `"${p.category || 'Outros'}"`;

            csv += `${nameEscaped};${catEscaped};${statusStr};${dCompra};${dVenda};"${canal}";"${linkAnun}";${custo};${taxas};${venda};${lucro};${roi}%\n`;
        });

        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); 
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `BricksApp_Relatorio_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    });
}

// --- RENDERIZAR OPÇÕES DE CATEGORIA (PILLS) ---
const populateCategories = () => {
    const pillsContainer = document.getElementById('categoryPills');
    const formSelect = document.getElementById('productCategory');
    if(!pillsContainer || !formSelect) return;

    formSelect.innerHTML = '<option value="" disabled selected>Selecione...</option>';
    allCategories.forEach(cat => { formSelect.innerHTML += `<option value="${cat.name}">${cat.name}</option>`; });

    pillsContainer.innerHTML = `<button class="category-pill ${selectedCategoryFilter === "" ? "active" : ""}" data-cat=""><i class="ph ph-squares-four"></i> Todas</button>`;
    
    allCategories.forEach(cat => {
        pillsContainer.innerHTML += `<button class="category-pill ${selectedCategoryFilter === cat.name ? "active" : ""}" data-cat="${cat.name}">${cat.name}</button>`;
    });

    document.querySelectorAll('.category-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            selectedCategoryFilter = e.currentTarget.getAttribute('data-cat');
            populateCategories(); renderDashboard(); 
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
if(btnOpenNewCategory) { btnOpenNewCategory.addEventListener('click', () => { document.getElementById('modalNewCategory').classList.add('active'); }); }

const formNewCategory = document.getElementById('formNewCategory');
if(formNewCategory) {
    formNewCategory.addEventListener('submit', async (e) => {
        e.preventDefault();
        const catName = document.getElementById('newCategoryName').value.trim();
        try {
            await addDoc(collection(db, "categories"), { name: catName });
            document.getElementById('modalNewCategory').classList.remove('active'); formNewCategory.reset();
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
                photo: base64Photo, status: 'in_stock', extraCosts: [], saleValue: 0, saleFee: 0, saleDate: null, profit: 0,
                adLink: "", saleChannel: "" // Campos novos vazios por padrão
            };

            await addDoc(collection(db, "products"), newProduct);
            formNewProduct.reset();
            document.getElementById('modalNewProduct').classList.remove('active');
        } catch (err) { alert("Erro ao salvar: " + err.message); } finally { btn.innerText = "Salvar Produto"; btn.disabled = false; }
    });
}

// --- DELEGAÇÃO DE EVENTOS CLIQUE (Cards) ---
const productListElement = document.getElementById('productList');
if(productListElement) {
    productListElement.addEventListener('click', async (e) => {
        const btnGasto = e.target.closest('.btn-gasto');
        const btnVender = e.target.closest('.btn-vender');
        const btnDelete = e.target.closest('.btn-delete');
        const btnAdLink = e.target.closest('.btn-ad-link');
        const cardClicado = e.target.closest('.product-card');

        if (btnGasto) { document.getElementById('expenseProductId').value = btnGasto.getAttribute('data-id'); document.getElementById('modalAddExpense').classList.add('active'); return; }
        if (btnVender) { document.getElementById('sellProductId').value = btnVender.getAttribute('data-id'); document.getElementById('modalSell').classList.add('active'); return; }
        if (btnAdLink) { window.open(btnAdLink.getAttribute('data-link'), '_blank'); return; } // NOVO: Abre o link direto do card
        if (btnDelete) { if (confirm("🚨 Excluir permanentemente este produto?")) await deleteDoc(doc(db, "products", btnDelete.getAttribute('data-id'))); return; }

        if (cardClicado) abrirDetalhesProduto(cardClicado.getAttribute('data-id'));
    });
}

// --- FUNÇÃO: ABRIR DETALHES ---
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
    
    // NOVO: Bloco de Edição do Link do Anúncio (Mostra apenas se estiver em estoque)
    const adLinkText = p.adLink || '';
    const linkSectionHtml = p.status === 'in_stock' ? `
        <div style="margin-bottom: 15px;">
            <label style="font-size: 0.85rem; color: var(--text-main); font-weight: 500;">Link do Anúncio Ativo:</label>
            <div style="display:flex; gap:8px; margin-top: 4px;">
                <input type="url" id="editAdLink-${p.id}" value="${adLinkText}" style="flex:1; background:#1a1a1e; border:1px solid #323238; color:var(--text-main); padding:8px; border-radius:6px; font-size:0.9rem;" placeholder="https://...">
                <button id="saveAdLink-${p.id}" class="btn-sm" style="background:var(--blue-primary); color:white; border:none; padding:0 15px; border-radius:6px; cursor:pointer; font-weight:bold;">Salvar</button>
            </div>
            ${p.adLink ? `<a href="${p.adLink}" target="_blank" style="color:var(--blue-primary); font-size:0.85rem; display:inline-block; margin-top:8px; text-decoration:none;"><i class="ph ph-arrow-square-out"></i> Testar Link</a>` : ''}
        </div>
    ` : `
        <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #323238;">
            <p style="color:var(--text-muted); font-size:0.85rem;">Canal de Venda Oficial: <strong style="color:var(--text-main);">${p.saleChannel || 'Não informado'}</strong></p>
        </div>
    `;

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

        ${linkSectionHtml}

        <div style="background-color: #1a1a1e; border: 1px dashed #323238; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
            <strong style="color: var(--text-main); font-size: 0.85rem; display: block; margin-bottom: 4px;">Descrição / Anotações:</strong>
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
    
    // Atualiza categoria
    document.getElementById(`editCat-${p.id}`).addEventListener('change', async (e) => {
        try { await updateDoc(doc(db, "products", p.id), { category: e.target.value }); } catch(err) { alert("Erro ao mudar categoria"); }
    });

    // Atualiza Link do Anúncio (só existe se estiver em estoque)
    const saveLinkBtn = document.getElementById(`saveAdLink-${p.id}`);
    if (saveLinkBtn) {
        saveLinkBtn.addEventListener('click', async () => {
            const newLink = document.getElementById(`editAdLink-${p.id}`).value;
            try { 
                await updateDoc(doc(db, "products", p.id), { adLink: newLink }); 
                saveLinkBtn.innerText = "Salvo!";
                saveLinkBtn.style.background = "var(--status-green)";
                setTimeout(() => { document.getElementById('modalDetails').classList.remove('active'); }, 600);
            } catch(err) { alert("Erro ao salvar link"); }
        });
    }
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
            await updateDoc(docRef, { extraCosts: arrayUnion({ desc, value, date: new Date().toISOString() }), totalInvested: currentData.totalInvested + value });
            document.getElementById('modalAddExpense').classList.remove('active'); formAddExpense.reset();
        } catch (error) { alert("Falha ao adicionar gasto."); }
    });
}

const formSell = document.getElementById('formSell');
if(formSell) {
    formSell.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('sellProductId').value;
        const val = parseFloat(document.getElementById('sellValue').value);
        const feeInput = parseFloat(document.getElementById('sellFee').value) || 0; 
        const dateInput = document.getElementById('sellDate').value;
        const channelInput = document.getElementById('sellChannel').value; // NOVO
        
        try {
            const docRef = doc(db, "products", id);
            const pData = (await getDoc(docRef)).data();
            const saleDateISO = new Date(dateInput + 'T12:00:00Z').toISOString();
            const finalProfit = val - feeInput - pData.totalInvested;

            await updateDoc(docRef, { 
                status: 'sold', 
                saleValue: val, 
                saleFee: feeInput,
                saleChannel: channelInput, // Salva o canal
                saleDate: saleDateISO, 
                profit: finalProfit 
            });
            document.getElementById('modalSell').classList.remove('active');
            formSell.reset();
        } catch (error) { alert("Falha ao concluir a venda."); }
    });
}