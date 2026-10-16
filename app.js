// بەڕێوبەری کلینیکی ددان - لۆژیکی سەرەکی - وەشانی سوپابەیس (Multi-API)

const { createClient } = supabase;

// =============================================
// CONFIG - هەموو بەهاجێگیرەکان لەیەکجا
// =============================================
const CLINIC_URL = 'https://mjjnysahorvkrnawlwdm.supabase.co';
const CLINIC_KEY = 'sb_publishable_FzNqpf2JHbAjMfRJUMKGYg_4n68k_YW';

// دروستکردنی کلاینت
const sbClient = createClient(CLINIC_URL, CLINIC_KEY);

// App State - دۆخی ناوەندی
const AppState = {
    cart: [],
    dentalChart: {},
    activeService: null,
    currentPatientId: null
};

// DOM Elements
const queueList = document.getElementById('queue-list');
const registerForm = document.getElementById('register-form');
const searchInput = document.getElementById('search-input');
const patientResults = document.getElementById('patient-results');
const patientDetailsSection = document.getElementById('patient-details');
const serviceList = document.getElementById('service-list');
const pTreatmentSelect = document.getElementById('p-treatment');

let currentPatientId = null;

// =============================================
// AUTH - سۆپابەیس Authentication
// =============================================
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');

async function checkAuthStatus() {
    const { data } = await sbClient.auth.getSession();

    if (data.session) {
        loginContainer.style.display = 'none';
        appContainer.style.display = '';

        const activeViewId = document.querySelector('.view.active')?.id || 'dashboard';
        if (window.navigateTo) window.navigateTo(activeViewId);
    } else {
        loginContainer.style.display = 'flex';
        appContainer.style.display = 'none';
    }
}

// گوێگرتن بۆ گۆڕانکارییەکانی لۆگین
sbClient.auth.onAuthStateChange((event, session) => {
    checkAuthStatus();
});

// ئەنجامدانی پشکنینی سەرەتایی
checkAuthStatus();

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    loginBtn.disabled = true;
    loginBtn.textContent = 'چوونەژوورەوە...';
    loginError.style.display = 'none';

    const { error } = await sbClient.auth.signInWithPassword({ email, password });

    if (error) {
        let msg = 'ھەڵەی نەشناسراو';
        if (error.message.includes('Invalid login') || error.message.includes('credentials')) {
            msg = 'ئێمەیڵ یان تێپەڕەوشەکەت ھەڵەیە. دوبارە تاقیبکەرەوە.';
        } else if (error.message.includes('rate')) {
            msg = 'زۆر جار ھەڵای کردووت. کەمێک چاوببەرەوە.';
        }
        loginError.textContent = msg;
        loginError.style.display = 'block';
    }

    loginBtn.disabled = false;
    loginBtn.textContent = 'چوونەژوورەوە';
});

window.logoutUser = async () => {
    await sbClient.auth.signOut();
};

// =============================================
// DB WRAPPER - سوپابەیس باتی فایربەیس
// camelCase JS لەگەڵ snake_case DB دیاری دەكەیت
// =============================================
const toSnake = k => k.replace(/([A-Z])/g, '_$1').toLowerCase();
const toCamel = k => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function rowToJS(row) {
    if (!row) return null;
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        out[toCamel(k)] = v;
    }
    return out;
}

function rowToDB(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[toSnake(k)] = v;
    }
    return out;
}

const db = {
    get: async (tableName) => {
        try {
            let q = sbClient.from(tableName).select('*');
            const { data, error } = await q;
            if (error) throw error;
            return (data || []).map(rowToJS).filter(row => !row.isDeleted);
        } catch (err) {
            console.error(`db.get(${tableName}) failed:`, err);
            window.showToast(' هەڵەیەک لە وەرگرتنی داتا ڕوویدا. تکایە پەیوەندیی ئینتەرنێت بپشکنە.', 'error');
            return [];
        }
    },
    add: async (tableName, item) => {
        try {
            const dbRow = rowToDB(item);
            const { data, error } = await sbClient.from(tableName).insert(dbRow).select().single();
            if (error) throw error;
            return rowToJS(data);
        } catch (err) {
            console.error(`db.add(${tableName}) failed:`, err);
            window.showToast(' هەڵەیەک لە پاشەکەوتکردنی داتا ڕوویدا. تکایە پەیوەندیی ئینتەرنێت بپشکنە.', 'error');
            return null;
        }
    },
    update: async (tableName, id, updates) => {
        try {
            const dbUpdates = rowToDB(updates);
            const { error } = await sbClient.from(tableName).update(dbUpdates).eq('id', id);
            if (error) throw error;
        } catch (err) {
            console.error(`db.update(${tableName}/${id}) failed:`, err);
            window.showToast(' هەڵەیەک لە نوێکردنەوەی داتا ڕوویدا. تکایە پەیوەندیی ئینتەرنێت بپشکنە.', 'error');
            throw err;
        }
    },
    delete: async (tableName, id) => {
        try {
            // Soft delete instead of hard delete
            const { error } = await sbClient.from(tableName).update({ is_deleted: true }).eq('id', id);
            if (error) throw error;
        } catch (err) {
            console.error(`db.delete(${tableName}/${id}) failed:`, err);
            window.showToast(' هەڵەیەک لە سڕینەوەی داتا ڕوویدا. تکایە پەیوەندیی ئینتەرنێت بپشکنە. ', 'error');
            throw err;
        }
    },
    // هەموو داتا بەبێ فلتەری دکتۆر (بۆ تۆمارکردنی نەخۆشی نوێ)
    getAll: async (tableName) => {
        try {
            const { data, error } = await sbClient.from(tableName).select('*');
            if (error) throw error;
            return (data || []).map(rowToJS).filter(row => !row.isDeleted);
        } catch (err) {
            console.error(`db.getAll(${tableName}) failed:`, err);
            window.showToast(' هەڵەیەک لە وەرگرتنی داتا ڕوویدا. تکایە پەیوەندیی ئینتەرنێت بپشکنە. ', 'error');
            return [];
        }
    }
};

// --- Custom Toast Notification ---
window.showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icon based on type
    let icon = '✅';
    if (type === 'error') icon = '🔴';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span style="margin-left:8px; font-size:1.2rem;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.3s forwards';
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, 3000);
};

// Shows lightweight placeholders while Supabase data is loading.
function showLoadingSkeleton(container, variant = 'card', count = 3) {
    if (!container) return;

    const lines = variant === 'service'
        ? '<span class="skeleton-line skeleton-line-long"></span><span class="skeleton-line skeleton-line-short"></span>'
        : '<span class="skeleton-line skeleton-line-title"></span><span class="skeleton-line skeleton-line-medium"></span><span class="skeleton-line skeleton-line-short"></span>';

    container.setAttribute('aria-busy', 'true');
    container.innerHTML = Array.from({ length: count }, () => `
        <div class="skeleton-card skeleton-card-${variant}" aria-hidden="true">${lines}</div>
    `).join('');
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    await renderQueue();
    setupForms();
    await renderServices();
    await loadServicesToSelect();

    // نیشاندانی بەرواری کوردی (سادەکراو)
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date().toLocaleDateString('sv-SE');

    // Set default values for date inputs
    const pDateInput = document.getElementById('p-date');
    if (pDateInput) pDateInput.value = today;

    const dashboardDateInput = document.getElementById('dashboard-date');
    if (dashboardDateInput) {
        dashboardDateInput.value = today;
        // Update display text
        document.getElementById('current-date').innerText = new Date().toLocaleDateString('ku-IQ', options);
    }
});

// --- Navigation ---
function setupNavigation() {
    window.navigateTo = async (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));

        document.getElementById(viewId).classList.add('active');

        // نوێکردنەوەی Sidebar
        const links = document.querySelectorAll('.nav-links li');
        if (viewId === 'dashboard') links[0].classList.add('active');
        if (viewId === 'register') links[1].classList.add('active');
        if (viewId === 'history') {
            links[2].classList.add('active');
            await window.searchPatients();
        }
        if (viewId === 'debtors') links[3].classList.add('active');
        if (viewId === 'calendar-view') links[4].classList.add('active');
        if (viewId === 'reports') links[5].classList.add('active');
        if (viewId === 'settings') links[6].classList.add('active');

        if (viewId === 'dashboard') await renderQueue();
        if (viewId === 'debtors') await window.renderDebtors();
        if (viewId === 'reports') await window.renderReports();
        if (viewId === 'settings') await renderServices();
        if (viewId === 'calendar-view') await window.renderCalendar();
    };
}

// --- Services Management & Billing Logic ---
async function renderServices() {
    showLoadingSkeleton(serviceList, 'service', 4);
    const services = await db.get('services');
    serviceList.removeAttribute('aria-busy');
    serviceList.innerHTML = '';
    services.forEach(s => {
        const li = document.createElement('li');
        li.className = 'flex-between';
        li.innerHTML = `
            <span>${s.name} <strong class="text-primary-dark">(${s.price ? s.price.toLocaleString() : 0} د.ع)</strong></span>
            <div class="service-item-actions">
                <button onclick="window.editService('${s.id}')" class="btn-edit-small">دەستکاری</button>
                <button onclick="window.deleteService('${s.id}')" class="text-danger font-bold cursor-pointer" style="border:none; background:none; margin-right:10px;">سڕینەوە</button>
            </div>
        `;
        serviceList.appendChild(li);
    });
}

window.editService = async (id) => {
    const services = await db.get('services');
    const service = services.find(s => s.id === id);
    if (!service) return;

    document.getElementById('edit-service-id').value = service.id;
    document.getElementById('edit-service-name').value = service.name;
    document.getElementById('edit-service-price').value = service.price;
    document.getElementById('edit-service-color').value = service.color || '#0ea5e9';

    document.getElementById('edit-service-modal').classList.remove('hidden');
};

window.closeEditServiceModal = () => {
    document.getElementById('edit-service-modal').classList.add('hidden');
};

// Generate options HTML for services
async function getServiceOptionsHTML() {
    const services = await db.get('services');
    let html = '<option value="">هەڵبژێرە...</option>';
    services.forEach(s => {
        html += `<option value="${s.id}" data-price="${s.price || 0}" data-name="${s.name}" data-color="${s.color || '#0ea5e9'}">${s.name}</option>`;
    });
    return html;
}

// --- Dental Chart Logic ---
window.dentalChartData = {}; // format: { toothNumber: { serviceName, color } }
window.activeServiceColor = null;
window.activeServiceName = null;

function universalToPalmer(i) {
    i = parseInt(i);
    if (i >= 1 && i <= 8) return 9 - i;
    if (i >= 9 && i <= 16) return i - 8;
    if (i >= 25 && i <= 32) return i - 24;
    if (i >= 17 && i <= 24) return 25 - i;
    return i;
}

function universalToPalmerWithQuadrant(i) {
    i = parseInt(i);
    let palmer = universalToPalmer(i);
    let quad = '';
    if (i >= 1 && i <= 8) quad = 'UR';
    else if (i >= 9 && i <= 16) quad = 'UL';
    else if (i >= 25 && i <= 32) quad = 'LR';
    else if (i >= 17 && i <= 24) quad = 'LL';
    return `${palmer}${quad}`;
}

function renderTooth(universalId, palmerId) {
    const tData = window.dentalChartData[universalId];
    const toothColor = tData ? tData.color : '#cbd5e1';
    const textColor = tData ? tData.color : 'var(--clr-text-main)'; // Black default

    return `
    <div class="tooth" onclick="window.toggleTooth(${universalId})" style="cursor:pointer; text-align:center; transition: transform 0.2s; width:22px; padding: 2px 0; background: var(--clr-surface); border-radius: 4px;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
        <div style="width: 16px; height: 20px; background-color: ${toothColor}; -webkit-mask-image: url('ddan.png'); mask-image: url('ddan.png'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center; margin: 0 auto; ${universalId <= 16 ? 'transform: rotate(180deg);' : ''} transition: background-color 0.3s;"></div>
        <div style="font-size:1.2rem; font-weight:900; color:${textColor}; margin-top:2px; transition: color 0.3s; line-height: 1; font-family: sans-serif;">${palmerId}</div>
    </div>`;
}

window.renderDentalChart = () => {
    const wrapper = document.getElementById('dental-chart-wrapper');
    if (!wrapper) return;

    let html = `
    <div style="display:flex; flex-direction:column; align-items:center; position:relative; padding: 25px 0 15px 0; max-width: 500px; margin: 0 auto; direction: ltr;">
        <!-- Labels -->
        <div style="position:absolute; top:0; left:15%; font-weight:900; color:#ef4444; font-size:1.3rem; font-family:sans-serif; z-index:2;">Right</div>
        <div style="position:absolute; top:0; right:15%; font-weight:900; color:#ef4444; font-size:1.3rem; font-family:sans-serif; z-index:2;">Left</div>

        <!-- Cross lines -->
        <div style="position:absolute; top:25px; bottom:15px; left:50%; width:3px; background:#eab308; z-index:0; transform: translateX(-50%); border-radius:2px;"></div>
        <div style="position:absolute; top:55%; left:2%; right:2%; height:3px; background:#eab308; z-index:0; transform: translateY(-50%); border-radius:2px;"></div>

        <!-- Upper Row -->
        <div class="teeth-row upper-teeth" style="display:flex; justify-content:center; gap:20px; margin-bottom:20px; position:relative; z-index:1; width:100%;">
            <!-- Upper Right Quadrant (Patient Right) -->
            <div style="display:flex; gap:1px; flex:1; justify-content:flex-end; padding-right:10px;">
    `;

    for (let i = 1; i <= 8; i++) html += renderTooth(i, 9 - i);

    html += `
            </div>
            <!-- Upper Left Quadrant (Patient Left) -->
            <div style="display:flex; gap:1px; flex:1; justify-content:flex-start; padding-left:10px;">
    `;

    for (let i = 9; i <= 16; i++) html += renderTooth(i, i - 8);

    html += `
            </div>
        </div>

        <!-- Lower Row -->
        <div class="teeth-row lower-teeth" style="display:flex; justify-content:center; gap:20px; position:relative; z-index:1; width:100%;">
            <!-- Lower Right Quadrant (Patient Right) -->
            <div style="display:flex; gap:1px; flex:1; justify-content:flex-end; padding-right:10px;">
    `;

    for (let i = 32; i >= 25; i--) html += renderTooth(i, i - 24);

    html += `
            </div>
            <!-- Lower Left Quadrant (Patient Left) -->
            <div style="display:flex; gap:1px; flex:1; justify-content:flex-start; padding-left:10px;">
    `;

    for (let i = 24; i >= 17; i--) html += renderTooth(i, 25 - i);

    html += `
            </div>
        </div>
    </div>
    `;
    wrapper.innerHTML = html;
};

window.toggleTooth = (toothNum) => {
    if (!window.activeServiceName || !window.activeServiceColor) {
        window.showToast('تکایە  چارەسەر هەڵبژێرە ', 'warning');
        return;
    }

    if (window.dentalChartData[toothNum] && window.dentalChartData[toothNum].serviceName === window.activeServiceName) {
        delete window.dentalChartData[toothNum]; // deselect
    } else {
        window.dentalChartData[toothNum] = {
            serviceName: window.activeServiceName,
            color: window.activeServiceColor
        };
    }
    window.renderDentalChart();
    window.updateQuantitiesFromChart();
};

window.selectAllTeeth = () => {
    if (!window.activeServiceName || !window.activeServiceColor) {
        window.showToast('تکایە سەرەتا چارەسەرێک هەڵبژێرە.', 'warning');
        return;
    }

    let allSelected = true;
    for (let i = 1; i <= 32; i++) {
        if (!window.dentalChartData[i] || window.dentalChartData[i].serviceName !== window.activeServiceName) {
            allSelected = false;
            break;
        }
    }

    if (allSelected) {
        for (let i = 1; i <= 32; i++) {
            if (window.dentalChartData[i] && window.dentalChartData[i].serviceName === window.activeServiceName) {
                delete window.dentalChartData[i];
            }
        }
    } else {
        for (let i = 1; i <= 32; i++) {
            window.dentalChartData[i] = {
                serviceName: window.activeServiceName,
                color: window.activeServiceColor
            };
        }
    }

    window.renderDentalChart();
    window.updateQuantitiesFromChart();
};

window.updateQuantitiesFromChart = () => {
    const serviceCounts = {};
    for (let tooth in window.dentalChartData) {
        const sName = window.dentalChartData[tooth].serviceName;
        serviceCounts[sName] = (serviceCounts[sName] || 0) + 1;
    }

    document.querySelectorAll('.service-row').forEach(row => {
        const select = row.querySelector('.row-service-select');
        const qtyInput = row.querySelector('.row-qty');

        if (select && select.selectedIndex >= 0) {
            const serviceName = select.options[select.selectedIndex].getAttribute('data-name');
            const count = serviceCounts[serviceName] || 0;

            if (count > 0) {
                qtyInput.value = count;
                qtyInput.setAttribute('data-auto-updated', 'true');
            } else if (qtyInput.hasAttribute('data-auto-updated')) {
                qtyInput.value = 1;
                qtyInput.removeAttribute('data-auto-updated');
            }
        }
    });

    window.calculateCart();
};

window.activateServiceRow = (rowId) => {
    const row = document.getElementById(rowId);
    if (!row) return;

    document.querySelectorAll('.service-row').forEach(r => r.style.boxShadow = 'none');
    row.style.boxShadow = '0 0 0 2px var(--clr-primary)';

    const select = row.querySelector('.row-service-select');
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.value !== "") {
        window.activeServiceName = selectedOption.getAttribute('data-name');
        window.activeServiceColor = selectedOption.getAttribute('data-color') || '#0ea5e9';
    } else {
        window.activeServiceName = null;
        window.activeServiceColor = null;
    }
};

// Ensure the first row exists on load
async function loadServicesToSelect() {
    const rowsContainer = document.getElementById('service-rows');
    const optionsHTML = await getServiceOptionsHTML();

    if (rowsContainer.children.length === 0) {
        await addServiceRow();
    } else {
        // Update all existing selects
        const selects = rowsContainer.querySelectorAll('.row-service-select');
        selects.forEach(select => {
            const currentVal = select.value;
            select.innerHTML = optionsHTML;
            select.value = currentVal;
        });
    }
}

window.deleteService = async (id) => {
    if (!confirm('دڵنیایت لە سڕینەوەی ئەم خزمەتگوزارییە؟')) return;
    await db.delete('services', id);
    await renderServices();
    await loadServicesToSelect();
};

// --- Dynamic Billing Rows ---
window.addServiceRow = async () => {
    const container = document.getElementById('service-rows');
    const rowId = 'row_' + Date.now();
    const optionsHTML = await getServiceOptionsHTML();

    const row = document.createElement('div');
    row.className = 'service-row';
    row.id = rowId;
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '2fr 1fr 1fr 1fr 40px';
    row.style.gap = '10px';
    row.style.marginBottom = '10px';

    row.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <input type="radio" name="active_service" onclick="window.activateServiceRow('${rowId}')" title="دیاریکردنی وەک چالاک بۆ هێڵکاری">
            <select class="row-service-select elegant-input" onchange="window.updateRowPrice('${rowId}'); window.activateServiceRow('${rowId}')" required>
                ${optionsHTML}
            </select>
        </div>
        <input type="number" class="row-qty elegant-input" value="1" min="1" oninput="window.calculateCart()" required>
        <input type="number" class="row-price elegant-input" value="0" oninput="window.calculateCart()" required>
        <div class="row-total row-total-elegant">0</div>
        <button type="button" onclick="window.removeRow('${rowId}')" style="background:var(--clr-danger-bg); color:var(--clr-danger); border:none; border-radius:10px; cursor:pointer; font-weight:bold; font-size:1.1rem; transition: transform var(--transition-fast);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="سڕینەوەی ڕیز">X</button>
    `;

    container.appendChild(row);
};

window.removeRow = (rowId) => {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        window.calculateCart();
    }
};

window.updateRowPrice = (rowId) => {
    const row = document.getElementById(rowId);
    const select = row.querySelector('.row-service-select');
    const priceInput = row.querySelector('.row-price');

    const selectedOption = select.options[select.selectedIndex];
    const price = selectedOption.getAttribute('data-price') || 0;

    priceInput.value = price;
    window.calculateCart();
};

window.calculateCart = () => {
    const rows = document.querySelectorAll('.service-row');
    let subtotal = 0;

    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.row-qty').value) || 0;
        const price = parseFloat(row.querySelector('.row-price').value) || 0;
        const total = qty * price;

        row.querySelector('.row-total').innerText = total.toLocaleString();
        subtotal += total;
    });

    const discount = parseFloat(document.getElementById('p-discount').value) || 0;
    let finalTotal = subtotal - discount;
    if (finalTotal < 0) finalTotal = 0;

    const paid = parseFloat(document.getElementById('p-paid').value) || 0;
    let debt = finalTotal - paid;
    if (debt < 0) debt = 0;

    document.getElementById('display-subtotal').innerText = subtotal.toLocaleString() + ' دینار';
    document.getElementById('display-total').innerText = finalTotal.toLocaleString() + ' دینار';

    const debtEl = document.getElementById('display-debt');
    if (debtEl) debtEl.innerText = debt.toLocaleString() + ' دینار';

    return { subtotal, discount, finalTotal, rows };
};

window.fillTotalAmount = () => {
    const cart = window.calculateCart();
    document.getElementById('p-paid').value = cart.finalTotal;
    window.calculateCart(); // Re-trigger calculation to update debt display
};

// --- Registration Logic ---
function setupLiveSearch() {
    const pNameInput = document.getElementById('p-name');
    const resultsContainer = document.getElementById('live-search-results');

    if (!pNameInput || !resultsContainer) return;

    let debounceTimer;

    pNameInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = pNameInput.value.trim();

        if (query.length < 2) {
            resultsContainer.style.display = 'none';
            resultsContainer.innerHTML = '';
            return;
        }

        debounceTimer = setTimeout(async () => {
            // سێرچی سێرڤەر --- هێچ داتایەک لە براوسەر فلتەر نادرێت
            const { data, error } = await sbClient
                .from('patients')
                .select('id, name, phone, phone2, age')
                .neq('is_deleted', true)
                .ilike('name', `%${query}%`)
                .limit(5);

            const matches = error ? [] : (data || []).map(rowToJS);

            if (matches.length > 0) {
                resultsContainer.innerHTML = matches.map(p => `
                    <div class="live-search-item" onclick="window.selectPatientFromSearch('${p.name}', '${p.phone}', '${p.phone2 || ''}', '${p.age || ''}')">
                        <span class="live-search-name">${p.name}</span>
                        <span class="live-search-phone">${p.phone}</span>
                    </div>
                `).join('');
                resultsContainer.style.display = 'block';
            } else {
                resultsContainer.style.display = 'none';
            }
        }, 300);
    });

    // داخستنی لیستەکە ئەگەر لە دەرەوەی کلیک کرا
    document.addEventListener('click', (e) => {
        if (!pNameInput.contains(e.target) && !resultsContainer.contains(e.target)) {
            resultsContainer.style.display = 'none';
        }
    });
}

window.selectPatientFromSearch = (name, phone, phone2, age) => {
    document.getElementById('p-name').value = name;
    document.getElementById('p-phone').value = phone;
    if (document.getElementById('p-phone2')) document.getElementById('p-phone2').value = phone2;
    document.getElementById('p-age').value = (age && age !== 'undefined' && age !== 'null') ? age : '';
    document.getElementById('live-search-results').style.display = 'none';

    showToast("بەکارهێنەرەکە هەڵبژێردرا (پێشتر تۆمار کراوە)", "warning");
};

function setupForms() {
    setupLiveSearch();
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('p-name').value.trim();
        const phone = document.getElementById('p-phone').value.trim();
        const phone2 = document.getElementById('p-phone2') ? document.getElementById('p-phone2').value.trim() : '';
        const age = document.getElementById('p-age').value.trim();
        let registerNote = document.getElementById('p-register-note')?.value.trim() || '';
        
        const chronicDiseases = [];
        if (document.getElementById('cd-diabetes')?.checked) chronicDiseases.push('شەکرە');
        if (document.getElementById('cd-pressure')?.checked) chronicDiseases.push('زەخت');
        if (document.getElementById('cd-blood')?.checked) chronicDiseases.push('خوێن شلبوونەوە');
        if (document.getElementById('cd-liver')?.checked) chronicDiseases.push('جگەر');
        if (document.getElementById('cd-asthma')?.checked) chronicDiseases.push('ڕەبۆ');
        if (document.getElementById('cd-epilepsy')?.checked) chronicDiseases.push('گەشکە');
        if (document.getElementById('cd-cancer')?.checked) chronicDiseases.push('شێرپەنجە');

        if (chronicDiseases.length > 0) {
            const diseaseString = `(${chronicDiseases.join('، ')})`;
            registerNote = registerNote ? `${diseaseString}\n${registerNote}` : diseaseString;
        }

        if (name.length < 3) {
            window.showToast('تکایە ناوەکە زۆر کورتە.', 'warning');
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = 'لە تۆمارکردندایە...';

        try {
            // گەڕان بۆ نەخۆشی کۆن (بە ژمارەی مۆبایل)
            const { data: existingPatients } = await sbClient
                .from('patients')
                .select('*')
                .neq('is_deleted', true)
                .eq('phone', phone)
                .eq('name', name)
                .limit(1);
            
            let patient = (existingPatients && existingPatients.length > 0) ? rowToJS(existingPatients[0]) : null;

        const nowIso = new Date().toISOString();
        if (!patient) {
            patient = await db.add('patients', { name, phone, phone2, age, createdAt: nowIso, updatedAt: nowIso });
        } else {
            await db.update('patients', patient.id, { name, age, phone2, updatedAt: nowIso });
            patient.name = name;
            patient.age = age;
            if(phone2) patient.phone2 = phone2;
            patient.updatedAt = nowIso;
        }

        const appointmentDate = document.getElementById('p-date').value || new Date().toLocaleDateString('sv-SE');
        const appointmentTime = document.getElementById('p-time') ? document.getElementById('p-time').value : '';

        // ھەژمارکردنی ژمارەی سڕە بۆ ئەو ڕۆژە
            const { count, error } = await sbClient
            .from('queue')
            .select('id', { count: 'exact', head: true })
            .neq('is_deleted', true)
            .eq('date', appointmentDate)
            .eq('is_payment_only', false);
            
        const queueNumber = (count || 0) + 1;

        // سەیڤکردنی نۆرەکە
        await db.add('queue', {
            patientId: patient.id,
            patientName: name,
            queueNumber: queueNumber,
            appointmentTime: appointmentTime,
            servicesUsed: [],
            subtotal: 0,
            discountAmount: 0,
            discountNote: "",
            finalTotal: 0,
            paid: 0,
            debt: 0,
            method: "cash",
            status: 'waiting',
            date: appointmentDate,
            notes: registerNote
        });

        window.showToast(`نەخۆش ${name} بە سڕەی ژمارە (${queueNumber}) تۆمار کرا.`, 'success');

        registerForm.reset();
        document.getElementById('p-date').value = new Date().toLocaleDateString('sv-SE');
        if (document.getElementById('p-time')) document.getElementById('p-time').value = '';
        window.navigateTo('dashboard');
        } catch (err) {
            console.error('Registration error:', err);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    });

    // Checkout Form Logic
    document.getElementById('checkout-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const queueId = document.getElementById('checkout-queue-id').value;
        const cart = window.calculateCart();

        if (cart.rows.length === 0) {
            window.showToast('تکایە لانی کەم یەک چارەسەر هەڵبژێرە.', 'warning');
            return;
        }

        const servicesUsed = [];
        let valid = true;

        cart.rows.forEach(row => {
            const select = row.querySelector('.row-service-select');
            const serviceName = select.options[select.selectedIndex]?.getAttribute('data-name');
            const qty = parseFloat(row.querySelector('.row-qty').value) || 0;
            const price = parseFloat(row.querySelector('.row-price').value) || 0;

            if (!serviceName) valid = false;

            servicesUsed.push({
                name: serviceName,
                qty: qty,
                price: price,
                total: qty * price
            });
        });

        // Attach dental chart data to services if applicable
        for (let toothNum in window.dentalChartData) {
            const chartData = window.dentalChartData[toothNum];
            const matchingService = servicesUsed.find(s => s.name === chartData.serviceName);
            if (matchingService) {
                if (!matchingService.teeth) matchingService.teeth = [];
                matchingService.teeth.push(toothNum);
            }
        }

        if (!valid) {
            window.showToast('تکایە دڵنیابە لە هەڵبژاردنی تەواوی چارەسەرەکان.', 'warning');
            return;
        }

        const discountAmount = parseFloat(document.getElementById('p-discount').value) || 0;
        const discountNote = document.getElementById('p-discount-note').value;
        const paid = parseFloat(document.getElementById('p-paid').value) || 0;
        const method = document.getElementById('p-method').value;
        const note = document.getElementById('p-treatment-note').value;

        const debt = cart.finalTotal - paid;

        await db.update('queue', queueId, {
            servicesUsed: servicesUsed,
            subtotal: cart.subtotal,
            discountAmount: discountAmount,
            discountNote: discountNote,
            finalTotal: cart.finalTotal,
            paid: paid,
            debt: debt,
            method: method,
            notes: note,
            status: 'completed'
        });

        window.showToast(`پسوڵە دروستکرا.\nکۆی گشتی: ${cart.finalTotal.toLocaleString()}`, 'success');

        closeCheckoutModal();
        await renderQueue();

        if (currentPatientId) {
            await loadTreatments(currentPatientId);
        }
    });

    document.getElementById('service-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('service-name').value;
        const price = parseFloat(document.getElementById('service-price').value) || 0;
        const color = document.getElementById('service-color').value || '#0ea5e9';
        await db.add('services', { name, price, color });

        e.target.reset();
        await renderServices();
        await loadServicesToSelect();
        window.showToast(`خزمەتگوزاری "${name}" زیادکرا.`, 'success');
    });

    // Edit Service Form Logic
    const editServiceForm = document.getElementById('edit-service-form');
    if (editServiceForm) {
        editServiceForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-service-id').value;
            const name = document.getElementById('edit-service-name').value;
            const price = parseFloat(document.getElementById('edit-service-price').value) || 0;
            const color = document.getElementById('edit-service-color').value || '#0ea5e9';

            await db.update('services', id, { name, price, color });

            window.showToast('خزمەتگوزارییەکە نوێکرایەوە.', 'success');
            window.closeEditServiceModal();
            await renderServices();
            await loadServicesToSelect();
        });
    }
}

// --- Queue Rendering ---
window.goToToday = () => {
    const today = new Date().toLocaleDateString('sv-SE');
    const dateInput = document.getElementById('dashboard-date');
    if (dateInput) {
        dateInput.value = today;
        window.changeDashboardDate(today);
    }
};

window.changeDashboardDate = async (newDate) => {
    if (!newDate) return;
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').innerText = new Date(newDate).toLocaleDateString('ku-IQ', options);
    await renderQueue();
};

async function renderQueue() {
    const dateInput = document.getElementById('dashboard-date');
    const selectedDate = dateInput ? dateInput.value : new Date().toLocaleDateString('sv-SE');

    const headerTitle = document.querySelector('#dashboard .view-header h1');
    if (headerTitle) {
        const todayStr = new Date().toLocaleDateString('sv-SE');
        headerTitle.innerText = selectedDate === todayStr ? 'نۆرەی ئەمڕۆ' : 'نۆرەی کاتی دیاریکراو';
    }

    showLoadingSkeleton(queueList, 'queue', 4);

    const { data: qData, error: qErr } = await sbClient
        .from('queue')
        .select('*')
        .neq('is_deleted', true)
        .eq('date', selectedDate)
        .eq('is_payment_only', false)
        .order('queue_number', { ascending: true });

    const todaysQueue = qErr ? [] : (qData || []).map(rowToJS);

    const statusOrder = { 'in-progress': 1, 'waiting': 2, 'completed': 3 };
    todaysQueue.sort((a, b) => {
        const orderA = statusOrder[a.status] || 99;
        const orderB = statusOrder[b.status] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return (a.queueNumber || 0) - (b.queueNumber || 0);
    });

    queueList.removeAttribute('aria-busy');
    queueList.innerHTML = '';
    let counters = { waiting: 0, progress: 0, completed: 0 };

    if (todaysQueue.length === 0) {
        queueList.innerHTML = `<div class="empty-state">هیچ نەخۆشێک بۆ بەرواری (${selectedDate}) نییە.</div>`;
    } else {
        todaysQueue.forEach(q => {
            const item = document.createElement('div');
            item.className = `queue-item status-${q.status}`;

            const debtBadge = q.debt > 0 ? `<span style="color:var(--clr-danger); font-size:0.8rem;">(ماوە: ${q.debt.toLocaleString()})</span>` : '';
            const timeBadge = q.appointmentTime ? `<span style="background:var(--clr-surface-dim); color:var(--clr-primary); padding:2px 8px; border-radius:4px; font-size:0.85rem; margin-right:8px; border:1px solid var(--clr-border);">🕒 ${q.appointmentTime}</span>` : '';

            let actions = '';
            if (q.status === 'waiting') {
                actions = `<button onclick="window.updateStatus('${q.id}', 'in-progress')" class="btn-small">دەستپێکردن</button>`;
            } else if (q.status === 'in-progress') {
                actions = `<button onclick="window.openCheckoutModal('${q.id}', '${q.patientName}')" class="btn-small" style="background:var(--clr-success)">تەواو بوون </button>`;
            }

            let servicesString = "هیچ چارەسەرێک نەنووسراوە";
            if (q.servicesUsed && Array.isArray(q.servicesUsed) && q.servicesUsed.length > 0) {
                servicesString = q.servicesUsed.map(s => `${s.qty}x ${s.name}`).join(' ، ');
            }

            const qNumberBadge = `<span style="background:var(--clr-primary-light); color:var(--clr-primary-dark); padding:4px 10px; border-radius:8px; font-size:0.95rem; font-weight:800; margin-left:12px; border:1px solid rgba(14, 165, 233, 0.2);">#${q.queueNumber || '-'}</span>`;

            const noteDisplay = q.notes ? `<div style="margin-top: 8px; font-size: 0.85rem; color: var(--clr-text-muted); background: var(--clr-bg); padding: 6px; border-radius: 6px; border-right: 3px solid var(--clr-primary);">تێبینی: ${q.notes}</div>` : '';

            item.innerHTML = `
                <div>
                    <h3>${qNumberBadge}${q.patientName} ${debtBadge} ${timeBadge}</h3>
                    <p>${servicesString}</p>
                    ${noteDisplay}
                </div>
                <div class="queue-actions">${actions}</div>
            `;
            queueList.appendChild(item);

            if (q.status === 'waiting') counters.waiting++;
            if (q.status === 'in-progress') counters.progress++;
            if (q.status === 'completed') counters.completed++;
        });
    }

    document.getElementById('count-waiting').innerText = counters.waiting;
    document.getElementById('count-progress').innerText = counters.progress;
    document.getElementById('count-completed').innerText = counters.completed;
}

window.updateStatus = async (id, newStatus) => {
    await db.update('queue', id, { status: newStatus });
    await renderQueue();
};

window.renderDebtors = async () => {
    const debtorsListContainer = document.getElementById('debtors-list');
    const totalClinicDebtEl = document.getElementById('total-clinic-debt');

    if (!debtorsListContainer || !totalClinicDebtEl) return;

    // Read filter values
    const searchName = document.getElementById('debtor-search-name')?.value.trim().toLowerCase() || "";
    const minAmount = parseFloat(document.getElementById('debtor-min-amount')?.value) || 0;
    const sortBy = document.getElementById('debtor-sort')?.value || "highest";

    debtorsListContainer.innerHTML = '<div class="empty-state">خەریکی گەڕان و هەژمارکردنی حیساباتە ماوەکان...</div>';

    showLoadingSkeleton(debtorsListContainer, 'debtor', 4);
    const [allPatients, allQueue] = await Promise.all([
        db.get('patients'),
        db.get('queue')
    ]);

    debtorsListContainer.removeAttribute('aria-busy');
    const debtorData = [];
    let clinicTotalDebt = 0;

    allPatients.forEach(patient => {
        const patientQueue = allQueue.filter(q => q.patientId === patient.id);
        const totalDebt = patientQueue.reduce((sum, q) => sum + (q.debt || 0), 0);

        if (totalDebt > 0) {
            clinicTotalDebt += totalDebt;

            // دۆزینەوەی بەرواری یەکەم بڕی ماوە
            const debtEntries = patientQueue.filter(q => q.debt > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
            const firstDebtDate = debtEntries.length > 0 ? debtEntries[0].date : 'نادیار';

            // دۆزینەوەی بەرواری کۆتا پارەدان (یان هەر سەردانێکی کۆتا)
            const sortedEntries = patientQueue.sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastActivityDate = sortedEntries.length > 0 ? sortedEntries[0].date : 'نادیار';

            debtorData.push({
                patient,
                totalDebt,
                firstDebtDate,
                lastActivityDate
            });
        }
    });

    totalClinicDebtEl.innerText = clinicTotalDebt.toLocaleString();

    if (debtorData.length === 0) {
        debtorsListContainer.innerHTML = '<div class="empty-state">هیچ حیسابێکی ماوە لە بنکەی زانیاریدا نییە.</div>';
        return;
    }

    // Applying Filters
    let filteredData = debtorData.filter(item => {
        const matchesName = item.patient.name.toLowerCase().includes(searchName);
        const matchesAmount = item.totalDebt >= minAmount;
        return matchesName && matchesAmount;
    });

    // Applying Sort
    if (sortBy === 'highest') {
        filteredData.sort((a, b) => b.totalDebt - a.totalDebt);
    } else if (sortBy === 'oldest') {
        filteredData.sort((a, b) => {
            if (a.firstDebtDate === 'نادیار') return 1;
            if (b.firstDebtDate === 'نادیار') return -1;
            return new Date(a.firstDebtDate) - new Date(b.firstDebtDate);
        });
    }

    if (filteredData.length === 0) {
        debtorsListContainer.innerHTML = '<div class="empty-state">هیچ ئەنجامێک بۆ ئەم فلتەرانە نییە.</div>';
        return;
    }

    debtorsListContainer.innerHTML = filteredData.map(item => `
        <div class="debtor-item" onclick="window.goToPatientProfileFromDebtors('${item.patient.id}')">
            <div class="debtor-info">
                <h3>${item.patient.name}</h3>
                <div class="debtor-details">
                    <span>📅 یەکەم بڕی ماوە: ${item.firstDebtDate}</span>
                    <span>🕒 کۆتا چالاکی: ${item.lastActivityDate}</span>
                </div>
            </div>
            <div class="debtor-amount">
                <span class="debt-label">کۆی قەرز</span>
                <span class="debt-value">${item.totalDebt.toLocaleString()} د.ع</span>
            </div>
        </div>
    `).join('');
};

window.goToPatientProfileFromDebtors = async (patientId) => {
    const patients = await db.get('patients');
    const patient = patients.find(p => p.id === patientId);
    if (patient) {
        window.navigateTo('history');
        window.showDetails(patient); // ئەمە پرۆفایلەکە دەکاتەوە
    }
};

// --- History & Search ---
window.patientPage = 0;
window.patientPageSize = 25;

let searchPatientsTimer;
window.searchPatients = async (isLoadMore = false) => {
    if (!isLoadMore) {
        // Show loading state immediately to let user know it's waiting
        patientResults.innerHTML = '<div class="empty-state">...</div>';
        clearTimeout(searchPatientsTimer);
        searchPatientsTimer = setTimeout(() => {
            window._executeSearchPatients(false);
        }, 800);
    } else {
        window._executeSearchPatients(true);
    }
};

window._executeSearchPatients = async (isLoadMore = false) => {
    const queryTerm = searchInput?.value.trim();
    if (!isLoadMore) {
        window.patientPage = 0;
        patientResults.innerHTML = '<div class="empty-state">...</div>';
    }

    if (!isLoadMore) showLoadingSkeleton(patientResults, 'patient', 4);

    let results = [];
    const from = window.patientPage * window.patientPageSize;
    const to = from + window.patientPageSize - 1;

    try {
        if (!queryTerm) {
            const { data, error } = await sbClient
                .from('patients')
                .select('*')
                .neq('is_deleted', true)
                .order('updated_at', { ascending: false })
                .range(from, to);
            results = (data || []).map(rowToJS);
        } else {
            const isPhone = /^[0-9]+$/.test(queryTerm);
            let queryBuilder = sbClient.from('patients').select('*').neq('is_deleted', true);
            
            if (isPhone) {
                queryBuilder = queryBuilder.or(`phone.ilike.%${queryTerm}%,phone2.ilike.%${queryTerm}%`);
            } else {
                queryBuilder = queryBuilder.ilike('name', `%${queryTerm}%`);
            }
            
            const { data, error } = await queryBuilder.order('updated_at', { ascending: false }).range(from, to);
            results = (data || []).map(rowToJS);
        }
    } catch (e) {
        console.error("Search error", e);
    }

    if (!isLoadMore) {
        patientResults.removeAttribute('aria-busy');
        patientResults.innerHTML = '';
    } else {
        const loadMoreBtn = document.getElementById('load-more-patients-btn');
        if (loadMoreBtn) loadMoreBtn.remove();
    }

    if (results.length === 0 && !isLoadMore) {
        patientResults.innerHTML = '<div class="empty-state">هیچ نەخۆشێک نەدۆزرایەوە.</div>';
        return;
    }

    if (!queryTerm && results.length > 0 && !isLoadMore) {
        const title = document.createElement('h3');
        title.style.cssText = 'margin:0 0 15px 0; color:var(--clr-text-muted); font-size:1rem;';
        title.innerText = 'نەخۆشە نوێیەکان';
        patientResults.appendChild(title);
    }

    results.forEach(p => {
        const card = document.createElement('div');
        card.className = 'patient-card';
        card.innerHTML = `<div><h3>${p.name}</h3><p>${p.phone}</p></div><div class="patient-card-arrow">←</div>`;
        card.onclick = () => showDetails(p);
        patientResults.appendChild(card);
    });

    if (results.length === window.patientPageSize) {
        const btnDiv = document.createElement('div');
        btnDiv.id = 'load-more-patients-btn';
        btnDiv.style.cssText = 'text-align:center; padding:15px; margin-top:10px;';
        btnDiv.innerHTML = `<button onclick="window.loadMorePatients()" class="btn-secondary">٥٠ نەخۆشی تر نیشان بدە</button>`;
        patientResults.appendChild(btnDiv);
    }
};

window.loadMorePatients = () => {
    window.patientPage++;
    window.searchPatients(true);
};

async function showDetails(patient) {
    currentPatientId = patient.id;
    patientDetailsSection.classList.remove('hidden');
    patientResults.classList.add('hidden');

    document.getElementById('detail-name').innerText = patient.name;
    document.getElementById('detail-phone').innerText = patient.phone2 ? `${patient.phone} / ${patient.phone2}` : patient.phone;
    document.getElementById('detail-age').innerText = patient.age || '-';

    await loadTreatments(patient.id);
}

window.openEditModal = async () => {
    if (!currentPatientId) return;
    const patients = await db.get('patients');
    const p = patients.find(x => x.id === currentPatientId);
    if (!p) return;

    document.getElementById('edit-name').value = p.name || '';
    document.getElementById('edit-phone').value = p.phone || '';
    if (document.getElementById('edit-phone2')) document.getElementById('edit-phone2').value = p.phone2 || '';
    document.getElementById('edit-age').value = p.age || '';
    document.getElementById('edit-patient-modal').classList.remove('hidden');
};

window.closeEditModal = () => {
    document.getElementById('edit-patient-modal').classList.add('hidden');
};

const editPatientForm = document.getElementById('edit-patient-form');
if (editPatientForm) {
    editPatientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentPatientId) return;

        const newName = document.getElementById('edit-name').value.trim();
        const newPhone = document.getElementById('edit-phone').value.trim();
        const newPhone2 = document.getElementById('edit-phone2') ? document.getElementById('edit-phone2').value.trim() : '';
        const newAge = document.getElementById('edit-age').value.trim();

        await db.update('patients', currentPatientId, {
            name: newName,
            phone: newPhone,
            phone2: newPhone2,
            age: newAge
        });

        document.getElementById('detail-name').innerText = newName;
        document.getElementById('detail-phone').innerText = newPhone2 ? `${newPhone} / ${newPhone2}` : newPhone;
        document.getElementById('detail-age').innerText = newAge || '-';

        // Update the header label too if possible
        const checkoutName = document.getElementById('checkout-patient-name');
        if (checkoutName) checkoutName.innerText = newName;

        window.showToast('زانیارییەکان بە سەرکەوتوویی نوێکرانەوە', 'success');
        window.closeEditModal();

        // Refresh history list if needed
        window.searchPatients(document.getElementById('search-input')?.value || '');
    });
}

window.openCheckoutModal = async (queueId, patientName) => {
    const modal = document.getElementById('checkout-modal');
    modal.classList.remove('hidden');

    document.getElementById('checkout-queue-id').value = queueId;
    document.getElementById('checkout-patient-name').innerText = patientName || 'نەخۆش';

    document.getElementById('checkout-form').reset();
    document.getElementById('service-rows').innerHTML = '';

    const debtWarning = document.getElementById('checkout-old-debt-warning');
    const allQueue = await db.get('queue');
    const q = allQueue.find(x => x.id === queueId);
    
    if (q && q.patientId) {
        const oldDebt = await calculateTotalDebt(q.patientId);
        if (oldDebt > 0) {
            debtWarning.innerText = `⚠️ ئاگاداربە: ئەم نەخۆشە بڕی ${oldDebt.toLocaleString()} د.ع قەرزی پێشووی لەسەرە!`;
            debtWarning.classList.remove('hidden');
        } else {
            debtWarning.classList.add('hidden');
        }
    } else {
        debtWarning.classList.add('hidden');
    }

    // Reset dental chart
    window.dentalChartData = {};
    window.activeServiceName = null;
    window.activeServiceColor = null;
    window.renderDentalChart();

    await window.addServiceRow();
    window.calculateCart();
};

window.editRecord = async (queueId) => {
    const allQueue = await db.get('queue');
    const q = allQueue.find(x => x.id === queueId);
    if (!q) return;

    const modal = document.getElementById('checkout-modal');
    modal.classList.remove('hidden');

    document.getElementById('checkout-queue-id').value = queueId;
    document.getElementById('checkout-patient-name').innerText = q.patientName || 'نەخۆش';

    document.getElementById('checkout-form').reset();
    document.getElementById('service-rows').innerHTML = '';

    const debtWarning = document.getElementById('checkout-old-debt-warning');
    if (q.patientId) {
        const oldDebt = await calculateTotalDebt(q.patientId);
        const priorDebt = oldDebt - (q.debt || 0);
        if (priorDebt > 0) {
            debtWarning.innerText = `⚠️ ئاگاداربە: ئەم نەخۆشە بڕی ${priorDebt.toLocaleString()} د.ع قەرزی پێشووی لەسەرە!`;
            debtWarning.classList.remove('hidden');
        } else {
            debtWarning.classList.add('hidden');
        }
    } else {
        debtWarning.classList.add('hidden');
    }

    window.dentalChartData = {};
    window.activeServiceName = null;
    window.activeServiceColor = null;

    if (q.servicesUsed && q.servicesUsed.length > 0) {
        for (const s of q.servicesUsed) {
            const rowId = 'row_' + Math.random().toString(36).substr(2, 9);
            const optionsHTML = await getServiceOptionsHTML();
            
            const container = document.getElementById('service-rows');
            const row = document.createElement('div');
            row.className = 'service-row';
            row.id = rowId;
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '2fr 1fr 1fr 1fr 40px';
            row.style.gap = '10px';
            row.style.marginBottom = '10px';
            
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="radio" name="active_service" onclick="window.activateServiceRow('${rowId}')" title="دیاریکردنی وەک چالاک بۆ هێڵکاری">
                    <select class="row-service-select elegant-input" onchange="window.updateRowPrice('${rowId}'); window.activateServiceRow('${rowId}')" required>
                        ${optionsHTML}
                    </select>
                </div>
                <input type="number" class="row-qty elegant-input" value="${s.qty}" min="1" oninput="window.calculateCart()" required>
                <input type="number" class="row-price elegant-input" value="${s.price}" oninput="window.calculateCart()" required>
                <div class="row-total row-total-elegant">${s.total}</div>
                <button type="button" onclick="window.removeRow('${rowId}')" style="background:var(--clr-danger-bg); color:var(--clr-danger); border:none; border-radius:10px; cursor:pointer; font-weight:bold; font-size:1.1rem; transition: transform var(--transition-fast);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="سڕینەوەی ڕیز">X</button>
            `;
            container.appendChild(row);

            const select = row.querySelector('.row-service-select');
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].getAttribute('data-name') === s.name) {
                    select.selectedIndex = i;
                    break;
                }
            }

            if (s.teeth && s.teeth.length > 0) {
                const color = select.options[select.selectedIndex]?.getAttribute('data-color') || '#0ea5e9';
                s.teeth.forEach(t => {
                    window.dentalChartData[t] = {
                        serviceName: s.name,
                        color: color
                    };
                });
            }
        }
    } else {
        await window.addServiceRow();
    }

    document.getElementById('p-discount').value = q.discountAmount || '';
    document.getElementById('p-discount-note').value = q.discountNote || '';
    document.getElementById('p-paid').value = q.paid || '';
    document.getElementById('p-method').value = q.method || 'cash';
    document.getElementById('p-treatment-note').value = q.notes || q.note || '';

    window.renderDentalChart();
    window.calculateCart();
};

window.closeCheckoutModal = () => {
    document.getElementById('checkout-modal').classList.add('hidden');
    window.dentalChartData = {};
    window.activeServiceName = null;
    window.activeServiceColor = null;
};

window.startNewVisitForPatient = async () => {
    const patients = await db.get('patients');
    const patient = patients.find(p => p.id === currentPatientId);
    if (patient) {
        await window.navigateTo('register');
        document.getElementById('p-name').value = patient.name;
        document.getElementById('p-phone').value = patient.phone;
        document.getElementById('p-age').value = patient.age || '';
    }
};

window.deleteCurrentPatient = async () => {
    if (!confirm('ئایا دڵنیایت لە سڕینەوەی ئەم نەخۆشە؟')) return;

    // Delete related queue
    const allQueue = await db.get('queue');
    const relatedQueue = allQueue.filter(q => q.patientId === currentPatientId);
    for (const q of relatedQueue) {
        await db.delete('queue', q.id);
    }

    await db.delete('patients', currentPatientId);

    window.showToast('نەخۆشەکە سڕایەوە.', 'success');
    closePatientDetails();
    await window.searchPatients();
    await renderQueue();
};

window.deleteRecord = async (recordId) => {
    if (!confirm('دڵنیایت؟')) return;
    await db.delete('queue', recordId);
    await loadTreatments(currentPatientId);
    await renderQueue();
};

window.printReceipt = async (queueId) => {
    const printWindow = window.open('', '_blank'); // Open synchronously to avoid popup blocker
    
    const allQueue = await db.get('queue');
    const q = allQueue.find(x => x.id === queueId);
    if (!q) {
        if (printWindow) printWindow.close();
        return;
    }

    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);

    let servicesRows = '';
    const printChartData = {};
    const colors = ['#0ea5e9', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

    if (q.servicesUsed) {
        q.servicesUsed.forEach((s, idx) => {
            const c = colors[idx % colors.length];
            let colorDot = '';

            const palmerTeeth = s.teeth ? s.teeth.map(universalToPalmer) : [];
            let coloredTeethHTML = '';
            if (s.teeth && s.teeth.length > 0) {
                coloredTeethHTML = s.teeth.map(t => `<span style="color:${c}; margin-left:8px; font-weight:bold; font-size:0.95rem;">${universalToPalmerWithQuadrant(t)}</span>`).join('');
                s.teeth.forEach(t => {
                    printChartData[t] = { color: c };
                });
                colorDot = `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${c}; margin-left:5px; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></span>`;
            }
            const teethText = (palmerTeeth && palmerTeeth.length > 0) ? `<br><small style="color:#666;">(ددانەکان: ${palmerTeeth.join(' ، ')})</small><br><div style="margin-top:4px; direction:ltr; text-align:right;">${coloredTeethHTML}</div>` : '';

            servicesRows += `
                <tr>
                    <td style="padding:10px; border-bottom:1px solid #ddd;">${colorDot}${s.name} ${teethText}</td>
                    <td style="padding:10px; border-bottom:1px solid #ddd; text-align:center;">${s.qty}</td>
                    <td style="padding:10px; border-bottom:1px solid #ddd; text-align:left;">${(s.total || 0).toLocaleString()} د.ع</td>
                </tr>
            `;
        });
    }

    let teethChartHTML = '';
    if (Object.keys(printChartData).length > 0) {
        teethChartHTML += `
        <div style="margin-top:20px; margin-bottom:20px; text-align:center; border:1px solid #ddd; padding:15px; border-radius:8px;">
            <div style="display:flex; flex-direction:column; align-items:center; position:relative; padding: 25px 0 10px 0; max-width: 400px; margin: 0 auto; direction:ltr;">
                <!-- Labels -->
                <div style="position:absolute; top:0; left:15%; font-weight:900; color:#ef4444; font-size:1.1rem; font-family:sans-serif; z-index:2; -webkit-print-color-adjust: exact; print-color-adjust: exact;">Right</div>
                <div style="position:absolute; top:0; right:15%; font-weight:900; color:#ef4444; font-size:1.1rem; font-family:sans-serif; z-index:2; -webkit-print-color-adjust: exact; print-color-adjust: exact;">Left</div>

                <div style="position:absolute; top:25px; bottom:10px; left:50%; width:2px; background:#eab308; z-index:0; transform: translateX(-50%); -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
                <div style="position:absolute; top:55%; left:0; right:0; height:2px; background:#eab308; z-index:0; transform: translateY(-50%); -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>

                <div style="display:flex; justify-content:center; gap:20px; margin-bottom:15px; position:relative; z-index:1; width:100%;">
                    <div style="display:flex; gap:1px; flex:1; justify-content:flex-end; padding-right:10px;">
        `;

        const renderPrintTooth = (universalId, palmerId) => {
            const toothColor = printChartData[universalId] ? printChartData[universalId].color : '#e2e8f0';
            const textColor = printChartData[universalId] ? printChartData[universalId].color : '#000000';
            return `
            <div style="text-align:center; width:20px; padding: 2px 0; background: #fff;">
                <div style="width: 14px; height: 18px; background-color: ${toothColor}; -webkit-mask-image: url('${baseUrl}ddan.png'); mask-image: url('${baseUrl}ddan.png'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center; margin: 0 auto; ${universalId <= 16 ? 'transform: rotate(180deg);' : ''} -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
                <div style="font-size:0.9rem; font-weight:900; color:${textColor}; margin-top:2px; line-height:1; font-family: sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${palmerId}</div>
            </div>`;
        };

        for (let i = 1; i <= 8; i++) teethChartHTML += renderPrintTooth(i, 9 - i);

        teethChartHTML += `</div><div style="display:flex; gap:1px; flex:1; justify-content:flex-start; padding-left:10px;">`;

        for (let i = 9; i <= 16; i++) teethChartHTML += renderPrintTooth(i, i - 8);

        teethChartHTML += `</div></div><div style="display:flex; justify-content:center; gap:20px; position:relative; z-index:1; width:100%;">`;
        teethChartHTML += `<div style="display:flex; gap:1px; flex:1; justify-content:flex-end; padding-right:10px;">`;

        for (let i = 32; i >= 25; i--) teethChartHTML += renderPrintTooth(i, i - 24);

        teethChartHTML += `</div><div style="display:flex; gap:1px; flex:1; justify-content:flex-start; padding-left:10px;">`;

        for (let i = 24; i >= 17; i--) teethChartHTML += renderPrintTooth(i, 25 - i);

        teethChartHTML += `</div></div></div></div>`;
    }

    const doctorName = 'دکتۆر بڕوا';
    const html = `
        <html lang="ku" dir="rtl">
        <head>
            <title>پسوڵە - ${q.patientName}</title>
            <style>
                @font-face {
                    font-family: 'K24KurdishBold';
                    src: url('${baseUrl}K24KurdishBold-Bold.ttf') format('truetype');
                }
                body { font-family: 'K24KurdishBold', Tahoma, Arial, sans-serif; margin: 0; padding: 20px; color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .receipt { max-width: 400px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
                .header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 15px; margin-bottom: 15px; }
                .header h1 { margin: 0 0 5px 0; font-size: 1.5rem; color: #0ea5e9; }
                .header h2 { margin: 0 0 10px 0; font-size: 1.2rem; color: #555; }
                .info { margin-bottom: 20px; font-size: 0.95rem; line-height: 1.5; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th { text-align: right; border-bottom: 2px solid #ccc; padding: 10px; font-size: 0.9rem; }
                .totals { border-top: 2px dashed #ccc; padding-top: 15px; font-size: 1rem; }
                .totals div { display: flex; justify-content: space-between; margin-bottom: 8px; }
                .totals .final { font-size: 1.2rem; font-weight: bold; }
                .footer { text-align: center; margin-top: 20px; font-size: 0.85rem; color: #777; }
                @media print {
                    body { padding: 0; background-color: white; display: flex; justify-content: center; }
                    .receipt { border: none; box-shadow: none; width: 100%; max-width: 400px; margin: 0 auto; }
                }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">
                    <h1>کلینیکی ددان</h1>
                    <h2>${doctorName}</h2>
                    <div style="font-size: 0.9rem; color: #666; margin-bottom: 12px;">حاجیاوا - شەقامی گشتی بازاڕ - کۆڵانی پزیشکان</div>
                    <div style="font-size: 0.9rem; color: #666; margin-bottom: 3px; direction: ltr; font-weight: bold;">0751 026 4346</div>
                    <div>بەروار: ${q.date}</div>
                </div>
                <div class="info">
                    <strong>ناوی نەخۆش:</strong> ${q.patientName} <br>
                    <strong>ژمارەی پسوڵە:</strong> #${q.queueNumber || q.id.slice(-4)}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>چارەسەر</th>
                            <th style="text-align:center;">ژمارە</th>
                            <th style="text-align:left;">کۆی نرخ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${servicesRows}
                    </tbody>
                </table>
                ${teethChartHTML}
                <div class="totals">
                    <div><span>کۆی گشتی:</span> <span>${(q.subtotal || 0).toLocaleString()} د.ع</span></div>
                    ${q.discountAmount > 0 ? `<div><span>داشکاندن:</span> <span>${q.discountAmount.toLocaleString()} د.ع</span></div>` : ''}
                    <div class="final"><span>بڕی داواکراو:</span> <span>${(q.finalTotal || 0).toLocaleString()} د.ع</span></div>
                    <div><span>بڕی دراو:</span> <span>${(q.paid || 0).toLocaleString()} د.ع</span></div>
                    ${q.debt > 0 ? `<div style="color:#ef4444; font-weight:bold;"><span>بڕی قەرز:</span> <span>${q.debt.toLocaleString()} د.ع</span></div>` : ''}
                </div>

                <div class="footer">
                    سوپاس بۆ سەردانتان. هیوادارین هەمیشە تەندروست بن.
                </div>
            </div>
            <script>
                window.onload = function() { window.print(); window.setTimeout(function(){ window.close(); }, 500); }
            </script>
        </body>
        </html>
    `;
    if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
    }
};

// --- Debt Management ---
async function calculateTotalDebt(patientId) {
    const { data, error } = await sbClient
        .from('queue')
        .select('debt')
        .eq('patient_id', patientId)
        .neq('is_deleted', true);
    
    let totalDebt = 0;
    (data || []).forEach(q => {
        totalDebt += (q.debt || 0);
    });
    return totalDebt;
}

window.editPaymentId = null;

window.openPaymentModal = () => {
    window.editPaymentId = null;
    document.getElementById('pay-debt-modal').classList.remove('hidden');
    document.getElementById('pay-debt-form').reset();
};

window.closePaymentModal = () => {
    window.editPaymentId = null;
    document.getElementById('pay-debt-modal').classList.add('hidden');
    document.getElementById('pay-debt-form').reset();
};

window.editPaymentRecord = async (queueId) => {
    const { data } = await sbClient.from('queue').select('*').eq('id', queueId).single();
    if (!data) return;
    const q = rowToJS(data);

    window.editPaymentId = queueId;
    document.getElementById('payment-amount').value = q.paid || '';
    document.getElementById('payment-discount').value = q.discountAmount || '';
    document.getElementById('payment-note').value = q.discountNote || '';
    
    document.getElementById('pay-debt-modal').classList.remove('hidden');
};

document.getElementById('pay-debt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('payment-amount').value) || 0;
    const discount = parseFloat(document.getElementById('payment-discount')?.value) || 0;
    const note = document.getElementById('payment-note')?.value.trim() || '';

    if (amount <= 0 && discount <= 0) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = 'چاوەڕێبە...';

    try {
        if (window.editPaymentId) {
            await db.update('queue', window.editPaymentId, {
                discountAmount: discount,
                discountNote: note,
                paid: amount,
                debt: -(amount + discount)
            });
            window.showToast('پارەدانەکە دەستکاری کرا.', 'success');
        } else {
            const patients = await db.get('patients');
            const patient = patients.find(p => p.id === currentPatientId);
            const today = new Date().toLocaleDateString('sv-SE');

            await db.add('queue', {
                patientId: patient.id,
                patientName: patient.name,
                isPaymentOnly: true,
                servicesUsed: [{ name: "دانەوەی بڕی ماوە", qty: 1, price: 0, total: 0 }],
                subtotal: 0,
                discountAmount: discount,
                discountNote: note,
                finalTotal: 0,
                paid: amount,
                debt: -(amount + discount),
                method: "cash",
                status: 'completed',
                date: today,
                notes: ""
            });
            window.showToast(`بڕی ${amount.toLocaleString()} دینار وەرگیرا.`, 'success');
        }
        
        closePaymentModal();
        await loadTreatments(currentPatientId);
    } catch (err) {
        console.error('Payment error:', err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
});



window.closePatientDetails = () => {
    patientDetailsSection.classList.add('hidden');
    patientResults.classList.remove('hidden');
};

async function loadTreatments(patientId) {
    const list = document.getElementById('treatment-list');
    
    const { data, error } = await sbClient
        .from('queue')
        .select('*')
        .eq('patient_id', patientId)
        .neq('is_deleted', true)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

    const queue = (data || []).map(rowToJS);

    list.innerHTML = '';
    const totalDebt = await calculateTotalDebt(patientId);
    const debtDisplay = document.getElementById('detail-total-debt');

    if (debtDisplay) {
        debtDisplay.innerText = totalDebt.toLocaleString() + ' دینار';
        debtDisplay.style.color = totalDebt <= 0 ? 'var(--clr-success)' : 'var(--clr-danger)';
    }

    queue.forEach(q => {
        const li = document.createElement('li');
        li.className = 'treatment-item';

        const printBtnHTML = `<button onclick="window.printReceipt('${q.id}')" class="btn-secondary btn-small" style="margin-left: 10px;" title="پرێنتکردنی وەسڵ">🖨️ پرێنت</button>`;
        const deleteBtnHTML = `<button onclick="window.deleteRecord('${q.id}')" class="btn-delete" title="سڕینەوە">&times;</button>`;

        const colors = ['#0ea5e9', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
        let servicesHTML = '';
        if (q.servicesUsed && Array.isArray(q.servicesUsed)) {
            let rowsHTML = q.servicesUsed.map((s, idx) => {
                let teethText = '';
                const c = colors[idx % colors.length];
                if (s.teeth && Array.isArray(s.teeth) && s.teeth.length > 0) {
                    const palmerTeeth = s.teeth.map(universalToPalmer);
                    const coloredTeethHTML = s.teeth.map(t => `<span style="color:${c}; margin-left:8px; font-weight:bold; font-size:0.95rem;">${universalToPalmerWithQuadrant(t)}</span>`).join('');
                    teethText = `<div style="font-size:0.8rem; color:var(--clr-text-muted); margin-top:2px;">(ددانەکان: ${palmerTeeth.join(' ، ')})<br><div style="margin-top:4px; direction:ltr; text-align:right;">${coloredTeethHTML}</div></div>`;
                }
                return `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px dashed var(--clr-border); padding-bottom:5px;">
                    <div>
                        <span>${s.qty}x ${s.name} (${(s.price || 0).toLocaleString()})</span>
                        ${teethText}
                    </div>
                    <span>${(s.total || 0).toLocaleString()} دینار</span>
                </div>
            `}).join('');

            servicesHTML = `
                <div style="background:var(--clr-surface); padding:15px; border-radius:8px; margin-top:10px; border:1px solid var(--clr-border);">
                    ${rowsHTML}
                    <div style="display:flex; justify-content:space-between; margin-top:10px; font-weight:bold; color:var(--clr-primary-dark);">
                        <span>کۆی گشتی:</span>
                        <span>${(q.subtotal || 0).toLocaleString()} دینار</span>
                    </div>
                </div>
            `;
        }

        let noteHTML = '';
        if (q.notes && q.notes.trim() !== '') {
            noteHTML = `<div style="margin-top: 10px; padding: 10px; background: var(--clr-surface-dim); border-radius: 8px; font-size: 0.9rem; border-right: 3px solid var(--clr-primary);">
                <strong>تێبینی:</strong><br>${q.notes.replace(/\n/g, '<br>')}
            </div>`;
        }
        
        let discountNoteHTML = '';
        if (q.discountNote && q.discountNote.trim() !== '') {
            discountNoteHTML = `<div style="margin-top: 10px; padding: 10px; background: var(--clr-surface-dim); border-radius: 8px; font-size: 0.9rem; border-right: 3px solid var(--clr-primary);">
                <strong>تێبینی داشکاندنی قەرز:</strong><br>${q.discountNote.replace(/\n/g, '<br>')}
            </div>`;
        }

        const editBtnHTML = `<button onclick="window.editRecord('${q.id}')" class="btn-secondary btn-small" style="margin-left: 10px; background: var(--clr-surface-mixed);" title="دەستکاریکردن">✏️ دەستکاری</button>`;
        if (q.isPaymentOnly) {
            let discountHTML = q.discountAmount > 0 ? `<div style="margin-top: 5px; color:var(--clr-primary); font-weight:bold;">داشکاندن: ${q.discountAmount.toLocaleString()} دینار</div>` : '';
            li.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:var(--clr-success);">${q.date} - دانەوەی قەرز</strong>
                    <div><button onclick="window.editPaymentRecord('${q.id}')" class="btn-secondary btn-small" style="margin-left: 10px; background: var(--clr-surface-mixed);" title="دەستکاریکردنی وەرگرتنی قەرز">✏️ دەستکاری</button> ${deleteBtnHTML}</div>
                </div>
                <div style="margin-top: 10px; color:var(--clr-success); font-weight:bold;">دراوە: ${q.paid.toLocaleString()} دینار</div>
                ${discountHTML}
                ${noteHTML}
                ${discountNoteHTML}
            `;
        } else {
            li.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>${q.date}</strong> 
                    <div>${editBtnHTML} ${printBtnHTML} ${deleteBtnHTML}</div>
                </div>
                ${servicesHTML}
                ${noteHTML}
                <div style="margin-top: 10px; font-size: 0.9rem;">
                     دراوە: ${q.paid.toLocaleString()} | ماوە: ${q.debt.toLocaleString()}
                </div>
            `;
        }
        list.appendChild(li);
    });
}

// --- Theme ---
window.toggleTheme = () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
};

// --- Mobile Sidebar Toggle ---
window.toggleSidebar = () => {
    const sidebar = document.getElementById('app-sidebar');
    let overlay = document.getElementById('sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.className = 'sidebar-overlay';
        overlay.onclick = window.toggleSidebar;
        document.body.appendChild(overlay);
    }
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
};

// --- Reports & Statistics Logic ---
window.renderReports = async () => {
    const period = document.getElementById('report-period').value;
    const allQueue = await db.get('queue');
    const today = new Date();

    let filteredQueue = allQueue.filter(q => q.status === 'completed' || q.isPaymentOnly);

    if (period === 'today') {
        const todayStr = today.toISOString().split('T')[0];
        filteredQueue = filteredQueue.filter(q => q.date === todayStr);
    } else if (period === 'week') {
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);
        filteredQueue = filteredQueue.filter(q => new Date(q.date) >= lastWeek);
    } else if (period === 'month') {
        const lastMonth = new Date();
        lastMonth.setMonth(today.getMonth() - 1);
        filteredQueue = filteredQueue.filter(q => new Date(q.date) >= lastMonth);
    } else if (period === 'year') {
        const lastYear = new Date();
        lastYear.setFullYear(today.getFullYear() - 1);
        filteredQueue = filteredQueue.filter(q => new Date(q.date) >= lastYear);
    }

    let totalRevenue = 0;
    let totalDebt = 0;
    let patientsSet = new Set();
    let servicesCount = {};

    filteredQueue.forEach(q => {
        totalRevenue += (q.paid || 0);
        
        // تەنیا قەرزی نوێ هەژمار بکە، پارەدانەوەکان (سالب) لێرەدا هەژمار مەکە
        if (!q.isPaymentOnly && (q.debt || 0) > 0) {
            totalDebt += q.debt;
        }

        if (q.patientId) patientsSet.add(q.patientId);

        if (q.servicesUsed) {
            q.servicesUsed.forEach(s => {
                servicesCount[s.name] = (servicesCount[s.name] || 0) + (s.qty || 1);
            });
        }
    });

    // Update Totals
    document.getElementById('report-total-revenue').innerText = `${totalRevenue.toLocaleString()} د.ع`;
    document.getElementById('report-total-debt').innerText = `${totalDebt.toLocaleString()} د.ع`;
    document.getElementById('report-patient-count').innerText = patientsSet.size.toLocaleString();

    // Render Popular Services
    const popularServicesList = document.getElementById('popular-services-list');
    const sortedServices = Object.entries(servicesCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (sortedServices.length === 0) {
        popularServicesList.innerHTML = '<div class="empty-state">هیچ خزمەتگوزارییەک لەم ماوەیەدا ئەنجام نەدراوە.</div>';
    } else {
        popularServicesList.innerHTML = sortedServices.map(([name, count]) => `
            <div class="popular-service-item">
                <span>${name}</span>
                <span class="popular-service-count">${count} جار</span>
            </div>
        `).join('');
    }
};

// =============================================
// Speed & Keyboard Shortcuts
// =============================================
document.addEventListener('keydown', (e) => {
    // Escape بۆ داخستنی مۆدالەکان
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal:not(.hidden)');
        modals.forEach(modal => {
            if (modal.id === 'checkout-modal') window.closeCheckoutModal();
            else if (modal.id === 'pay-debt-modal') window.closePaymentModal();
            else if (modal.id === 'edit-patient-modal') window.closeEditModal();
        });
        
        const details = document.getElementById('patient-details');
        if (details && !details.classList.contains('hidden')) {
            window.closePatientDetails();
        }
    }

    // گەڕانەوە بۆ لاپەڕەکان بە بەکارهێنانی Alt + (1,2,3,4,f)
    if (e.altKey && !e.ctrlKey) {
        switch(e.key.toLowerCase()) {
            case '1':
            case '١':
                e.preventDefault();
                window.navigateTo('dashboard');
                break;
            case '2':
            case '٢':
                e.preventDefault();
                window.navigateTo('register');
                setTimeout(() => document.getElementById('p-name')?.focus(), 100);
                break;
            case '3':
            case '٣':
            case 'f':
            case 'ب': // کیبۆردی کوردی
                e.preventDefault();
                window.navigateTo('history');
                setTimeout(() => document.getElementById('search-input')?.focus(), 100);
                break;
            case '4':
            case '٤':
                e.preventDefault();
                window.navigateTo('debtors');
                break;
        }
    }

    // ناردنی فۆرمەکان بە خێرایی لە ڕێگەی (Ctrl + Enter)
    if (e.ctrlKey && e.key === 'Enter') {
        const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
        if (isTyping) {
            const form = e.target.closest('form');
            if (form) {
                e.preventDefault();
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn && !submitBtn.disabled) {
                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
            }
        }
    }
});

// ==========================================
// Calendar Logic
// ==========================================
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
const monthNames = ["کانوونی دووەم", "شوبات", "ئازار", "نیسان", "ئایار", "حوزەیران", "تەمموز", "ئاب", "ئەیلوول", "تشرینی یەکەم", "تشرینی دووەم", "کانوونی یەکەم"];

window.changeMonth = (dir) => {
    currentMonth += dir;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    window.renderCalendar();
};

window.renderCalendar = async () => {
    const calendarGrid = document.getElementById('calendar-grid-container');
    if (!calendarGrid) return;
    
    document.getElementById('calendar-month-year').innerText = `${monthNames[currentMonth]} ${currentYear}`;
    
    // Remove existing days
    const days = calendarGrid.querySelectorAll('.calendar-day, .empty-day');
    days.forEach(d => d.remove());

    let firstDay = new Date(currentYear, currentMonth, 1).getDay();
    let shiftedFirstDay = (firstDay + 1) % 7; 
    if (shiftedFirstDay === 6) shiftedFirstDay = 0; // Prevent blank row if starting on Friday

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const startOfMonth = new Date(currentYear, currentMonth, 1).toLocaleDateString('sv-SE');
    const endOfMonth = new Date(currentYear, currentMonth, daysInMonth).toLocaleDateString('sv-SE');
    
    const { data: queueData, error } = await sbClient
        .from('queue')
        .select('id, date, appointment_time, patient_name, patient_id')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth)
        .neq('is_deleted', true);

    const queueItems = error ? [] : (queueData || []);

    const uniquePatientIds = [...new Set(queueItems.map(q => q.patient_id).filter(Boolean))];
    const patientsMap = {};

    if (uniquePatientIds.length > 0) {
        const { data: patientsData } = await sbClient
            .from('patients')
            .select('id, phone, phone2')
            .in('id', uniquePatientIds)
            .neq('is_deleted', true);
            
        if (patientsData) {
            patientsData.forEach(p => {
                patientsMap[p.id] = { phone: p.phone, phone2: p.phone2 };
            });
        }
    }

    for (let i = 0; i < shiftedFirstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty-day';
        calendarGrid.appendChild(emptyCell);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        // Skip Fridays (5 = Friday)
        if (new Date(currentYear, currentMonth, i).getDay() === 5) continue;

        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';
        
        const dateSpan = document.createElement('div');
        dateSpan.className = 'calendar-date-number';
        dateSpan.innerText = i;
        dayCell.appendChild(dateSpan);

        const addBtn = document.createElement('button');
        addBtn.className = 'calendar-add-btn';
        addBtn.innerHTML = '+';
        const formattedDate = `${currentYear}-${String(currentMonth+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        addBtn.onclick = () => {
            window.navigateTo('register');
            document.getElementById('p-date').value = formattedDate;
        };
        dayCell.appendChild(addBtn);

        const dayQueue = queueItems.filter(q => q.date === formattedDate);
        
        dayQueue.forEach((q, index) => {
            const pill = document.createElement('div');
            pill.className = `app-pill app-pill-color-${index % 4}`;
            
            let tooltip = q.patient_name || 'نەخۆش';
            const pInfo = patientsMap[q.patient_id];
            if (pInfo) {
                if (pInfo.phone) tooltip += `\nمۆبایل 1: ${pInfo.phone}`;
                if (pInfo.phone2) tooltip += `\nمۆبایل 2: ${pInfo.phone2}`;
            }
            pill.title = tooltip;
            
            const nameSpan = document.createElement('span');
            nameSpan.innerText = q.patient_name || 'نەخۆش';
            
            const timeSpan = document.createElement('span');
            timeSpan.className = 'app-pill-time';
            timeSpan.innerText = q.appointment_time ? q.appointment_time.slice(0,5) : '';

            pill.appendChild(nameSpan);
            pill.appendChild(timeSpan);
            
            dayCell.appendChild(pill);
        });

        calendarGrid.appendChild(dayCell);
    }
};
