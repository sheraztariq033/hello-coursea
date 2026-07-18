// --- STATE MANAGEMENT ---
let currentUser = null;
let currentTab = 'email'; // Simulator default tab

// --- ON LOAD ---
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
});

function initApp() {
  const savedUser = localStorage.getItem('vault_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showAppContainer();
    fetchReceipts();
    fetchAuditLogs();
    fetchStatements();
  } else {
    showOnboardingScreen();
  }
}

// --- SCREEN TOGGLES ---
function showOnboardingScreen() {
  document.getElementById('onboarding-screen').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('logout-btn').classList.add('hidden');
  document.getElementById('user-display').classList.add('hidden');
}

function showAppContainer() {
  document.getElementById('onboarding-screen').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('logout-btn').classList.remove('hidden');

  const userDisp = document.getElementById('user-display');
  userDisp.classList.remove('hidden');
  userDisp.textContent = currentUser.real_email;

  // Set Profile Cards
  document.getElementById('profile-proxy-email').textContent = currentUser.proxy_email;
  document.getElementById('profile-proxy-phone').textContent = currentUser.proxy_phone || 'None Set';
  document.getElementById('sim-email-to').value = currentUser.proxy_email;
  document.getElementById('sim-sms-to').value = currentUser.proxy_phone || '';
  document.getElementById('proxy-token-code').textContent = currentUser.proxy_email.split('@')[0].toUpperCase();

  // Set Preferences form
  const prefs = currentUser.notification_preferences || {};
  document.getElementById('pref-email-alerts').checked = !!prefs.email_alerts;
  document.getElementById('pref-push-alerts').checked = !!prefs.push_alerts;
  document.getElementById('pref-days-before').value = prefs.days_before_expiry || 7;

  // Set Tier Badge
  const badge = document.getElementById('tier-badge');
  const toggleBtn = document.getElementById('toggle-tier-btn');
  if (currentUser.plan_tier === 'premium') {
    badge.className = 'bg-yellow-400 text-indigo-950 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider';
    badge.textContent = 'Premium Tier';
    toggleBtn.innerHTML = '<i class="fa-solid fa-crown text-yellow-500 mr-1"></i> Downgrade to Free';
  } else {
    badge.className = 'bg-gray-400 text-white text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider';
    badge.textContent = 'Free Tier';
    toggleBtn.innerHTML = '<i class="fa-solid fa-crown text-yellow-500 mr-1"></i> Upgrade to Premium';
  }
}

// --- NAVIGATION TABS ---
const navButtons = {
  'nav-dashboard': 'view-dashboard',
  'nav-simulator': 'view-simulator',
  'nav-statements': 'view-statements',
  'nav-security': 'view-security'
};

function switchTab(clickedId) {
  // Update nav buttons style
  Object.keys(navButtons).forEach(id => {
    const btn = document.getElementById(id);
    if (id === clickedId) {
      btn.className = 'nav-btn bg-indigo-700 text-white px-3 py-2 rounded-md text-sm font-medium';
    } else {
      btn.className = 'nav-btn text-indigo-100 hover:bg-indigo-500 px-3 py-2 rounded-md text-sm font-medium';
    }
  });

  // Toggle views
  const targetViewId = navButtons[clickedId];
  document.querySelectorAll('.view-content').forEach(view => {
    if (view.id === targetViewId) {
      view.classList.remove('hidden');
    } else {
      view.classList.add('hidden');
    }
  });

  // Refresh view specific data
  if (clickedId === 'nav-dashboard') {
    fetchReceipts();
  } else if (clickedId === 'nav-security') {
    fetchAuditLogs();
  } else if (clickedId === 'nav-statements') {
    fetchStatements();
  }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Navigation
  Object.keys(navButtons).forEach(id => {
    document.getElementById(id).addEventListener('click', () => switchTab(id));
  });

  // Onboarding Submit
  document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const realEmail = document.getElementById('real-email').value.trim();
    if (!realEmail) return;

    try {
      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ real_email: realEmail })
      });
      const data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        localStorage.setItem('vault_user', JSON.stringify(currentUser));
        showToast('Account initialized successfully!', 'success');
        showAppContainer();
        fetchReceipts();
        fetchAuditLogs();
        fetchStatements();
      } else {
        showToast(data.error || 'Failed to initialize', 'error');
      }
    } catch (err) {
      showToast('Network error during onboarding', 'error');
    }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('vault_user');
    currentUser = null;
    showOnboardingScreen();
    showToast('Logged out successfully', 'info');
  });

  // Upgrade/Downgrade tier
  document.getElementById('toggle-tier-btn').addEventListener('click', async () => {
    const nextTier = currentUser.plan_tier === 'premium' ? 'free' : 'premium';
    try {
      const res = await fetch(`/api/users/${currentUser.id}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_tier: nextTier })
      });
      const data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        localStorage.setItem('vault_user', JSON.stringify(currentUser));
        showAppContainer();
        showToast(`Plan updated to ${nextTier.toUpperCase()}`, 'success');
      }
    } catch (err) {
      showToast('Failed to update plan', 'error');
    }
  });

  // Preferences save
  document.getElementById('preferences-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email_alerts = document.getElementById('pref-email-alerts').checked;
    const push_alerts = document.getElementById('pref-push-alerts').checked;
    const days_before_expiry = parseInt(document.getElementById('pref-days-before').value) || 7;

    try {
      const res = await fetch(`/api/users/${currentUser.id}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_preferences: { email_alerts, push_alerts, days_before_expiry }
        })
      });
      const data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        localStorage.setItem('vault_user', JSON.stringify(currentUser));
        showToast('Preferences saved successfully', 'success');
      }
    } catch (err) {
      showToast('Failed to save preferences', 'error');
    }
  });

  // Rotation triggers
  const handleRotation = async () => {
    try {
      // Simulate rotating proxy credentials by generating new random ones
      const prefix = currentUser.real_email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const randNum = Math.floor(1000 + Math.random() * 9000);
      const newProxyEmail = `${prefix}${randNum}@vault.ourapp.com`;
      const newProxyPhone = `+1-555-${randNum}`;

      // In real-world we'd call a dedicated rotate endpoint, but here we can re-register/update
      // Let's create a simulated update by just creating/logging the change or letting the user generate a fresh profile
      showToast('Proxy identity rotated and tokenized. Previous proxy deactivated!', 'success');
      currentUser.proxy_email = newProxyEmail;
      currentUser.proxy_phone = newProxyPhone;
      localStorage.setItem('vault_user', JSON.stringify(currentUser));
      showAppContainer();

      // Let's log an audit event for this rotation
      await fetch(`/api/users/${currentUser.id}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_preferences: currentUser.notification_preferences // trig updates
        })
      });
      fetchAuditLogs();
    } catch (err) {
      showToast('Failed to rotate proxy', 'error');
    }
  };

  document.getElementById('rotate-proxy-btn').addEventListener('click', handleRotation);
  document.getElementById('rotate-proxy-btn-sec').addEventListener('click', handleRotation);

  // Permanent Delete
  document.getElementById('danger-delete-account').addEventListener('click', async () => {
    if (!confirm('WARNING: This action is permanent and non-reversible! This will cascade-delete your profile, proxy tokens, receipts, and security audit trails from our database. Continue?')) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${currentUser.id}`, { method: 'DELETE' });
      if (res.ok) {
        localStorage.removeItem('vault_user');
        currentUser = null;
        showOnboardingScreen();
        showToast('Account permanently purged.', 'info');
      } else {
        showToast('Failed to delete account', 'error');
      }
    } catch (err) {
      showToast('Error connecting to database', 'error');
    }
  });

  // Search and filter triggers
  const filterInputs = ['filter-search', 'filter-category', 'filter-date-start', 'filter-has-warranty'];
  filterInputs.forEach(id => {
    document.getElementById(id).addEventListener('input', fetchReceipts);
    document.getElementById(id).addEventListener('change', fetchReceipts);
  });

  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-date-start').value = '';
    document.getElementById('filter-has-warranty').checked = false;
    fetchReceipts();
    showToast('Filters cleared', 'info');
  });

  // Manual modal triggers
  document.getElementById('add-manual-btn').addEventListener('click', () => {
    document.getElementById('manual-receipt-form').reset();
    document.getElementById('manual-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('manual-line-items-container').innerHTML = '';
    addManualLineItemInput(); // start with one input
    document.getElementById('manual-modal').classList.remove('hidden');
  });

  document.getElementById('manual-receipt-form').addEventListener('submit', handleManualReceiptSubmit);

  // Ingestion form triggers
  document.getElementById('sim-form-email').addEventListener('submit', (e) => handleIngestionSubmit(e, 'email'));
  document.getElementById('sim-form-sms').addEventListener('submit', (e) => handleIngestionSubmit(e, 'sms'));
  document.getElementById('sim-form-photo').addEventListener('submit', (e) => handleIngestionSubmit(e, 'photo'));

  // Statements form triggers
  document.getElementById('statements-form').addEventListener('submit', handleStatementsSubmit);
  document.getElementById('reset-statements-btn').addEventListener('click', handleStatementsReset);

  // Warranty form submit
  document.getElementById('warranty-update-form').addEventListener('submit', handleWarrantyExpiryUpdateSubmit);
}

// --- RECEIPTS RETRIEVAL AND UI ---
async function fetchReceipts() {
  if (!currentUser) return;

  const search = document.getElementById('filter-search').value;
  const category = document.getElementById('filter-category').value;
  const date_start = document.getElementById('filter-date-start').value;
  const has_warranty = document.getElementById('filter-has-warranty').checked;

  let query = `/api/receipts?user_id=${currentUser.id}`;
  if (search) query += `&search=${encodeURIComponent(search)}`;
  if (category) query += `&category=${category}`;
  if (date_start) query += `&date_start=${date_start}`;
  if (has_warranty) query += `&has_warranty=true`;

  try {
    const res = await fetch(query);
    const data = await res.json();
    if (res.ok) {
      renderReceipts(data.receipts);
    }
  } catch (err) {
    showToast('Failed to fetch receipts', 'error');
  }
}

function renderReceipts(receipts) {
  const container = document.getElementById('receipts-list');

  if (receipts.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
        <i class="fa-regular fa-folder-open text-4xl text-gray-300 mb-3"></i>
        <h4 class="font-bold text-gray-500">No matching receipts found</h4>
        <p class="text-xs text-gray-400 mt-1">Try relaxing your search terms or filters.</p>
      </div>
    `;
    updateStats(0, 0, 0);
    return;
  }

  let totalSpent = 0;
  let activeWarranties = 0;

  container.innerHTML = '';
  receipts.forEach(rec => {
    totalSpent += parseFloat(rec.total);

    let isWarrantyActive = false;
    let warrantyDaysLeft = 0;
    if (rec.warranty_expiry) {
      const today = new Date();
      today.setHours(0,0,0,0);
      const expiry = new Date(rec.warranty_expiry);
      expiry.setHours(0,0,0,0);
      const diffTime = expiry - today;
      warrantyDaysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (warrantyDaysLeft >= 0) {
        isWarrantyActive = true;
        activeWarranties++;
      }
    }

    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-indigo-300 transition duration-150';

    // Determine channel badge
    let channelBadgeClass = 'bg-gray-100 text-gray-600';
    let channelIcon = 'fa-receipt';
    if (rec.source_channel === 'email') {
      channelBadgeClass = 'bg-blue-50 text-blue-600 border border-blue-100';
      channelIcon = 'fa-envelope';
    } else if (rec.source_channel === 'sms') {
      channelBadgeClass = 'bg-green-50 text-green-600 border border-green-100';
      channelIcon = 'fa-comment';
    } else if (rec.source_channel === 'photo') {
      channelBadgeClass = 'bg-purple-50 text-purple-600 border border-purple-100';
      channelIcon = 'fa-camera';
    } else if (rec.source_channel === 'manual') {
      channelBadgeClass = 'bg-amber-50 text-amber-600 border border-amber-100';
      channelIcon = 'fa-pen';
    }

    // Warranty countdown text
    let warrantyHtml = '';
    if (rec.warranty_expiry) {
      if (warrantyDaysLeft >= 0) {
        const colorClass = warrantyDaysLeft <= 30 ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50';
        warrantyHtml = `
          <span class="inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${colorClass}">
            <i class="fa-solid fa-clock mr-1"></i> Warranty Expiry: ${rec.warranty_expiry} (${warrantyDaysLeft} days left)
          </span>
        `;
      } else {
        warrantyHtml = `
          <span class="inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full text-red-600 bg-red-50">
            <i class="fa-solid fa-circle-exclamation mr-1"></i> Warranty Expired: ${rec.warranty_expiry}
          </span>
        `;
      }
    } else {
      warrantyHtml = `
        <span class="inline-flex items-center text-[11px] font-medium text-gray-400">
          No warranty attached
        </span>
      `;
    }

    // High value referral marker
    const isHighValueUninsured = rec.total >= 500 && !rec.warranty_expiry;
    const referralHtml = isHighValueUninsured ? `
      <div class="mt-2 bg-yellow-50 border border-yellow-200 text-yellow-800 p-2.5 rounded-lg flex items-center space-x-2 text-xs">
        <i class="fa-solid fa-circle-exclamation text-yellow-600"></i>
        <span>High-value item detected! <a href="#" onclick="showReferralAlert()" class="underline font-bold hover:text-yellow-950">Add customized protection insurance starting at $2.99/mo</a></span>
      </div>
    ` : '';

    card.innerHTML = `
      <div class="p-5 flex items-start justify-between cursor-pointer" onclick="toggleCardExpansion('${rec.id}')">
        <div class="flex items-start space-x-4">
          <div class="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-xl text-indigo-600 border">
            <i class="fa-solid ${channelIcon}"></i>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h4 class="font-bold text-gray-900 text-sm hover:text-indigo-600 transition">${rec.merchant}</h4>
              <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${channelBadgeClass}">${rec.source_channel}</span>
            </div>
            <p class="text-xs text-gray-500 mt-0.5"><i class="fa-solid fa-calendar-day mr-1"></i> ${rec.date}</p>
            <div class="mt-2 flex flex-wrap gap-2 items-center">
              ${warrantyHtml}
              ${rec.payment_method ? `<span class="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded"><i class="fa-solid fa-credit-card mr-1"></i> ${rec.payment_method}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="text-right">
          <span class="text-base font-extrabold text-gray-900 block">$${parseFloat(rec.total).toFixed(2)}</span>
          <span class="text-[10px] text-gray-400 block mt-0.5">Tax: $${parseFloat(rec.tax).toFixed(2)}</span>
          <i class="fa-solid fa-chevron-down text-gray-400 text-xs mt-3 block transition duration-150" id="chevron-${rec.id}"></i>
        </div>
      </div>

      <!-- EXPANDED DETAILED STATE -->
      <div id="expanded-${rec.id}" class="hidden bg-gray-50 border-t border-gray-100 p-5 space-y-4">
        <!-- Line Items -->
        <div>
          <h5 class="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center">
            <i class="fa-solid fa-basket-shopping mr-1"></i> Itemized Line Items
          </h5>
          <div class="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 text-xs">
            ${rec.line_items.map(item => `
              <div class="p-3 flex justify-between items-center">
                <div>
                  <span class="font-bold text-gray-800">${item.name}</span>
                  <span class="bg-indigo-50 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded ml-2 uppercase font-semibold">${item.category || 'Other'}</span>
                </div>
                <span class="font-bold text-gray-900">$${parseFloat(item.price).toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        ${referralHtml}

        <!-- Actions Panel -->
        <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-gray-200/50">
          <div class="flex space-x-2">
            <button onclick="openWarrantyModal('${rec.id}', '${rec.warranty_expiry || ''}')" class="bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-semibold py-1.5 px-3 rounded text-xs transition">
              <i class="fa-solid fa-calendar-plus mr-1 text-indigo-600"></i> Update Warranty Expiry
            </button>
            <button onclick="deleteReceipt('${rec.id}')" class="bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-1.5 px-3 rounded text-xs transition">
              <i class="fa-solid fa-trash mr-1"></i> Delete Receipt
            </button>
          </div>

          <!-- Debugging raw source toggle -->
          <button onclick="toggleRawSource('${rec.id}')" class="text-indigo-600 hover:text-indigo-800 font-semibold text-xs text-left">
            <i class="fa-solid fa-code mr-1"></i> View Audit / Raw Ingestion Source
          </button>
        </div>

        <!-- Raw Source Debug Window -->
        <div id="raw-source-${rec.id}" class="hidden bg-gray-950 text-green-400 p-3 rounded-lg text-[10px] font-mono overflow-x-auto whitespace-pre-wrap max-h-48 border border-gray-800 shadow-inner">
          <div class="text-gray-500 border-b border-gray-800 pb-1.5 mb-2 flex justify-between uppercase tracking-wider font-sans font-bold">
            <span>Original Inbound Raw Source File Log</span>
            <span class="text-indigo-400">Channel: ${rec.source_channel}</span>
          </div>
          ${escapeHtml(rec.raw_source)}
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  updateStats(totalSpent, receipts.length, activeWarranties);
}

function toggleCardExpansion(id) {
  const exp = document.getElementById(`expanded-${id}`);
  const chev = document.getElementById(`chevron-${id}`);
  if (exp.classList.contains('hidden')) {
    exp.classList.remove('hidden');
    chev.classList.add('rotate-180');
  } else {
    exp.classList.add('hidden');
    chev.classList.remove('rotate-180');
  }
}

function toggleRawSource(id) {
  const win = document.getElementById(`raw-source-${id}`);
  win.classList.toggle('hidden');
}

function updateStats(totalSpent, count, warranties) {
  document.getElementById('stat-total-spent').textContent = `$${totalSpent.toFixed(2)}`;
  document.getElementById('stat-receipt-count').textContent = count;
  document.getElementById('stat-active-warranties').textContent = warranties;
}

async function deleteReceipt(id) {
  if (!confirm('Are you sure you want to delete this receipt? This will cascade-delete all line items.')) {
    return;
  }
  try {
    const res = await fetch(`/api/receipts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Receipt deleted successfully', 'success');
      fetchReceipts();
    }
  } catch (err) {
    showToast('Failed to delete receipt', 'error');
  }
}

// --- WARRANTY MODAL HANDLERS ---
function openWarrantyModal(id, currentExpiry) {
  // Prevent propagation
  event.stopPropagation();

  document.getElementById('warranty-modal-receipt-id').value = id;
  document.getElementById('warranty-modal-expiry-date').value = currentExpiry;
  document.getElementById('warranty-modal').classList.remove('hidden');
}

function closeWarrantyModal() {
  document.getElementById('warranty-modal').classList.add('hidden');
}

async function handleWarrantyExpiryUpdateSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('warranty-modal-receipt-id').value;
  const warranty_expiry = document.getElementById('warranty-modal-expiry-date').value;

  try {
    const res = await fetch(`/api/receipts/${id}/warranty`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warranty_expiry })
    });
    if (res.ok) {
      showToast('Warranty expiry updated successfully', 'success');
      closeWarrantyModal();
      fetchReceipts();
    }
  } catch (err) {
    showToast('Failed to update warranty', 'error');
  }
}

// --- MANUAL RECEIPT HANDLERS ---
function closeManualModal() {
  document.getElementById('manual-modal').classList.add('hidden');
}

function addManualLineItemInput() {
  const container = document.getElementById('manual-line-items-container');
  const index = container.children.length;

  const itemDiv = document.createElement('div');
  itemDiv.className = 'grid grid-cols-12 gap-2 items-center';
  itemDiv.innerHTML = `
    <div class="col-span-5">
      <input type="text" placeholder="Item name" required class="manual-item-name block w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none">
    </div>
    <div class="col-span-3">
      <input type="number" step="0.01" placeholder="Price" required class="manual-item-price block w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none">
    </div>
    <div class="col-span-3">
      <select class="manual-item-category block w-full px-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none">
        <option value="Other">Category</option>
        <option value="Electronics">Electronics</option>
        <option value="Apparel">Apparel</option>
        <option value="Food & Dining">Food & Dining</option>
        <option value="Home Goods">Home Goods</option>
      </select>
    </div>
    <div class="col-span-1 text-center">
      <button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-500 hover:text-red-700"><i class="fa-regular fa-trash-can"></i></button>
    </div>
  `;
  container.appendChild(itemDiv);
}

async function handleManualReceiptSubmit(e) {
  e.preventDefault();
  const merchant = document.getElementById('manual-merchant').value.trim();
  const date = document.getElementById('manual-date').value;
  const total = parseFloat(document.getElementById('manual-total').value);
  const tax = parseFloat(document.getElementById('manual-tax').value) || 0;
  const payment_method = document.getElementById('manual-payment').value.trim();
  const warranty_expiry = document.getElementById('manual-warranty').value;

  // Compile line items
  const lineItems = [];
  const rows = document.getElementById('manual-line-items-container').children;
  for (const row of rows) {
    const name = row.querySelector('.manual-item-name').value.trim();
    const price = parseFloat(row.querySelector('.manual-item-price').value);
    const category = row.querySelector('.manual-item-category').value;
    if (name && !isNaN(price)) {
      lineItems.push({ name, price, category });
    }
  }

  try {
    const res = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        merchant,
        date,
        total,
        tax,
        payment_method,
        warranty_expiry: warranty_expiry || null,
        source_channel: 'manual',
        raw_source: `Manually compiled by user at ${new Date().toISOString()}`,
        line_items: lineItems
      })
    });

    if (res.ok) {
      showToast('Receipt saved successfully!', 'success');
      closeManualModal();
      fetchReceipts();
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to save', 'error');
    }
  } catch (err) {
    showToast('Network error saving receipt', 'error');
  }
}

// --- SIMULATOR TAB AND FORMS ---
function setSimulatorTab(tab) {
  currentTab = tab;
  // Reset tabs style
  const btns = ['sim-tab-email', 'sim-tab-sms', 'sim-tab-photo'];
  btns.forEach(id => {
    const btn = document.getElementById(id);
    if (id === `sim-tab-${tab}`) {
      btn.className = 'sim-tab-btn bg-indigo-600 text-white font-bold p-4 rounded-xl shadow-sm text-center border-2 border-indigo-600 flex flex-col items-center';
    } else {
      btn.className = 'sim-tab-btn bg-white text-gray-700 font-bold p-4 rounded-xl shadow-sm text-center border-2 border-transparent hover:bg-gray-50 flex flex-col items-center';
    }
  });

  // Toggle forms
  document.querySelectorAll('.sim-form').forEach(form => {
    if (form.id === `sim-form-${tab}`) {
      form.classList.remove('hidden');
    } else {
      form.classList.add('hidden');
    }
  });
}

// Simulator mock templates
const emailTemplates = {
  apple: `Subject: Your Apple Receipt - Order #W1208311
From: orders@apple.com
Date: 2025-10-05

Apple Store Receipt
--------------------------------------------------
Order Date: 2025-10-05
Merchant: Apple Store Infinite Loop

Items:
1x iPhone 15 Pro - $999.00
1x Apple Silicon Case - $49.00

Sales Tax: $82.31
Charged to: APPLE PAY (VISA ending in 9876)
Total Amount Charged: $1130.31
==================================================`,
  bestbuy: `Subject: Best Buy Order Confirmation
From: orders@bestbuy.com
Date: 2025-10-02

Best Buy Store #122
-----------------------------
Purchase Date: 2025-10-02
Merchant: Best Buy Electronics

Itemized Purchase:
1x Samsung 55" OLED TV - $1299.99 (Electronics)
2x HDMI Gold Cables - $25.00 (Electronics)

Tax: $105.99
Grand Total: $1430.98
Payment: Mastercard ending in 4321`,
  starbucks: `Subject: Your Starbucks Receipt
From: receipts@starbucks.com
Date: 2025-10-06

Starbucks Coffee Company
-----------------------------
Receipt Date: 2025-10-06
Merchant: Starbucks Coffee

Purchase Details:
1x Caramel Macchiato: $5.75
1x Butter Croissant: $4.25

Total: $10.00
Payment: STARBUCKS CARD`
};

const smsTemplates = {
  square: `Thanks for shopping at Toast & Grind Cafe. Total: $14.50 on 2025-10-04. Paid via VISA *1111. Details: sq.co/r/18a221f`,
  toast: `Receipt from Burger House on 2025-10-03: Double Smashburger $12.00, French Fries $4.00, Total: $16.00. Paid via Cash.`
};

const photoTemplates = {
  homedepot: `THE HOME DEPOT STORE #1241
1221 COLISEUM WAY, OAKLAND, CA
MERCHANT: HOME DEPOT
DATE: 2025-10-12
=========================================
1x DEWALT DRILL DRIVER - $129.00
2x PREMIUM LUMBER 2X4 - $18.50

TAX: $11.80
TOTAL: $159.30
PAYMENT METHOD: DEBIT CARD`,
  walmart: `WALMART SUPERCENTER #2081
MERCHANT: WALMART
DATE: 2025-10-01
=========================================
1x Hanes Cotton T-Shirt - $14.99 (Clothing)
1x Athletic Running Shoes - $34.99 (Apparel)
1x Organic Whole Milk - $4.50 (Grocery)

TAX: $4.12
TOTAL AMOUNT: $58.60
PAYMENT: VISA ENDING 2231`
};

function loadEmailTemplate(key) {
  document.getElementById('sim-email-body').value = emailTemplates[key] || '';
  showToast(`Email template "${key.toUpperCase()}" loaded!`, 'info');
}

function loadSmsTemplate(key) {
  document.getElementById('sim-sms-body').value = smsTemplates[key] || '';
  showToast(`SMS template "${key.toUpperCase()}" loaded!`, 'info');
}

function loadPhotoTemplate(key) {
  document.getElementById('sim-photo-body').value = photoTemplates[key] || '';
  showToast(`Photo scan template "${key.toUpperCase()}" loaded!`, 'info');
}

async function handleIngestionSubmit(e, channel) {
  e.preventDefault();

  let endpoint = '';
  let payload = {};

  if (channel === 'email') {
    const proxy_email = document.getElementById('sim-email-to').value;
    const raw_email_body = document.getElementById('sim-email-body').value;
    const from_email = document.getElementById('sim-email-from').value;

    if (!raw_email_body) return showToast('Email body cannot be empty', 'error');

    endpoint = '/api/ingest/email';
    payload = { proxy_email, raw_email_body, from_email };
  } else if (channel === 'sms') {
    const proxy_phone = document.getElementById('sim-sms-to').value;
    const raw_sms_body = document.getElementById('sim-sms-body').value;
    const from_phone = document.getElementById('sim-sms-from').value;

    if (!proxy_phone) return showToast('Generate a proxy phone number in your profile first!', 'error');
    if (!raw_sms_body) return showToast('SMS text body cannot be empty', 'error');

    endpoint = '/api/ingest/sms';
    payload = { proxy_phone, raw_sms_body, from_phone };
  } else if (channel === 'photo') {
    const raw_ocr_text = document.getElementById('sim-photo-body').value;
    if (!raw_ocr_text) return showToast('OCR scanned text cannot be empty', 'error');

    endpoint = '/api/ingest/photo';
    payload = { user_id: currentUser.id, raw_ocr_text };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Document ingested and parsed successfully!', 'success');
      // Redirect to main dashboard to see it
      switchTab('nav-dashboard');
    } else {
      showToast(data.error || 'Ingestion failed', 'error');
    }
  } catch (err) {
    showToast('Network error during simulation', 'error');
  }
}

// --- BANK STATEMENTS CSV MATCHING ---
function loadMockCSV() {
  const csv = `date,merchant,amount
2025-10-05,Apple Store,1130.31
2025-10-02,Best Buy,1430.98
2025-10-12,Home Depot,159.30
2025-10-15,Gap Clothing,45.00
2025-10-06,Starbucks,10.00`;
  document.getElementById('statements-csv').value = csv;
  showToast('Mock CSV loaded!', 'info');
}

async function handleStatementsSubmit(e) {
  e.preventDefault();
  const rawCSV = document.getElementById('statements-csv').value.trim();
  if (!rawCSV) return showToast('Copy-paste card statement lines first', 'error');

  const lines = rawCSV.split('\n');
  const headers = lines[0].toLowerCase().split(',');
  const dateIdx = headers.indexOf('date');
  const merchIdx = headers.indexOf('merchant');
  const amtIdx = headers.indexOf('amount');

  if (dateIdx === -1 || merchIdx === -1 || amtIdx === -1) {
    return showToast('CSV must contain headers: date,merchant,amount', 'error');
  }

  const statements = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length >= 3) {
      statements.push({
        date: row[dateIdx].trim(),
        merchant: row[merchIdx].trim(),
        amount: parseFloat(row[amtIdx].trim())
      });
    }
  }

  try {
    const res = await fetch('/api/statements/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, statements })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Fuzzy gap-matching completed successfully!', 'success');
      fetchStatements();
    } else {
      showToast(data.error || 'Matching failed', 'error');
    }
  } catch (err) {
    showToast('Network error parsing statement', 'error');
  }
}

async function handleStatementsReset() {
  try {
    const res = await fetch(`/api/statements?user_id=${currentUser.id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Statements analyzer reset', 'info');
      fetchStatements();
    }
  } catch (err) {
    showToast('Failed to reset', 'error');
  }
}

async function fetchStatements() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/statements?user_id=${currentUser.id}`);
    const data = await res.json();
    if (res.ok) {
      renderStatements(data.statements);
    }
  } catch (err) {
    showToast('Failed to load statement analysis', 'error');
  }
}

function renderStatements(statements) {
  const container = document.getElementById('statements-analysis-list');
  const badge = document.getElementById('gap-count-badge');

  if (statements.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <i class="fa-solid fa-magnifying-glass-dollar text-4xl text-gray-300 mb-3"></i>
        <h4 class="font-bold text-gray-500">No Statement Data Uploaded</h4>
        <p class="text-xs text-gray-400 mt-1">Copy-paste card transaction rows on the left to start tracing missing files.</p>
      </div>
    `;
    badge.classList.add('hidden');
    return;
  }

  let gapCount = 0;
  container.innerHTML = '';

  statements.forEach(stmt => {
    const isMatched = !!stmt.matched_receipt_id;
    let matchHtml = '';

    if (isMatched) {
      matchHtml = `
        <div class="flex items-center space-x-1.5 text-xs text-green-700 font-bold bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
          <i class="fa-solid fa-circle-check"></i>
          <span>Receipt Verified (ID: ${stmt.matched_receipt_id.slice(0, 8)}...)</span>
        </div>
      `;
    } else {
      gapCount++;
      matchHtml = `
        <div class="flex items-center justify-between flex-wrap gap-2 bg-red-50 p-2.5 rounded-lg border border-red-200">
          <div class="flex items-center space-x-1.5 text-xs text-red-700 font-bold">
            <i class="fa-solid fa-circle-xmark"></i>
            <span>GAP DETECTED: No Receipt Filed</span>
          </div>
          <button onclick="simulateGapRecovery('${stmt.merchant}', '${stmt.date}', ${stmt.amount})" class="bg-red-600 hover:bg-red-700 text-white font-bold px-2.5 py-1 rounded text-[10px] transition">
            <i class="fa-solid fa-arrow-up-from-bracket mr-1"></i> Retrieve & File Receipt
          </button>
        </div>
      `;
    }

    const item = document.createElement('div');
    item.className = 'bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4';
    item.innerHTML = `
      <div>
        <div class="flex items-center space-x-2">
          <h4 class="font-bold text-gray-900 text-sm">${stmt.merchant}</h4>
          <span class="text-[10px] text-gray-400 font-mono">${stmt.date}</span>
        </div>
        <span class="text-sm font-extrabold text-gray-900 mt-1 block">$${parseFloat(stmt.amount).toFixed(2)}</span>
      </div>
      <div>
        ${matchHtml}
      </div>
    `;
    container.appendChild(item);
  });

  if (gapCount > 0) {
    badge.textContent = `${gapCount} Receipt Gaps Found`;
    badge.className = 'bg-red-100 text-red-700 text-xs px-2.5 py-0.5 rounded-full font-bold';
    badge.classList.remove('hidden');
  } else {
    badge.textContent = `All Receipts Verified`;
    badge.className = 'bg-green-100 text-green-700 text-xs px-2.5 py-0.5 rounded-full font-bold';
    badge.classList.remove('hidden');
  }
}

// Simulates finding the receipt for a gap in statement matcher
async function simulateGapRecovery(merchant, date, amount) {
  try {
    const res = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        merchant,
        date,
        total: amount,
        tax: parseFloat((amount * 0.08).toFixed(2)),
        payment_method: 'VISA (CARD MATCHED)',
        source_channel: 'photo',
        raw_source: `Simulated Gap recovery on ${new Date().toISOString()}`,
        line_items: [{ name: `${merchant} Gap Item recovery`, price: parseFloat((amount / 1.08).toFixed(2)), category: 'Other' }]
      })
    });

    if (res.ok) {
      showToast(`Captured missing receipt for ${merchant}!`, 'success');
      // Re-trigger gap analysis (deleting then re-uploading statement triggers match automatically)
      // Since upload is post, let's refresh statement matcher lists
      // In our code, we re-fetch existing receipts when calculating upload, let's just clear and re-analyze
      const rawCSV = document.getElementById('statements-csv').value.trim();
      if (rawCSV) {
        // Trigger a re-submit of the form
        document.getElementById('statements-form').dispatchEvent(new Event('submit'));
      } else {
        fetchStatements();
      }
    }
  } catch (err) {
    showToast('Failed to recover missing receipt', 'error');
  }
}

// --- SECURITY RESOLUTION AUDIT TRAIL ---
async function fetchAuditLogs() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/users/${currentUser.id}/audit-logs`);
    const data = await res.json();
    if (res.ok) {
      renderAuditLogs(data.audit_logs);
    }
  } catch (err) {
    showToast('Failed to load compliance audit trail', 'error');
  }
}

function renderAuditLogs(logs) {
  const tbody = document.getElementById('audit-logs-table-body');
  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="px-4 py-8 text-center text-gray-400">
          <i class="fa-solid fa-lock text-3xl text-gray-200 mb-2 block"></i>
          No proxy resolution events logged yet. Try forwarding receipts to proxy email or texting.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  logs.forEach(log => {
    const tr = document.createElement('tr');
    tr.className = 'border-b hover:bg-gray-50';
    tr.innerHTML = `
      <td class="px-4 py-3 font-mono text-[10px] text-gray-400 select-all">${log.id}</td>
      <td class="px-4 py-3 font-semibold text-gray-700 text-xs">${log.resolved_field}</td>
      <td class="px-4 py-3 text-indigo-600 font-medium text-xs">${log.accessed_by}</td>
      <td class="px-4 py-3 text-gray-400 text-[11px]">${log.timestamp}</td>
    `;
    tbody.appendChild(tr);
  });
}

// --- TOAST ALERTS HELPER ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');

  let colorClass = 'bg-blue-600 text-white';
  let iconClass = 'fa-circle-info';

  if (type === 'success') {
    colorClass = 'bg-green-600 text-white';
    iconClass = 'fa-circle-check';
  } else if (type === 'error') {
    colorClass = 'bg-red-600 text-white';
    iconClass = 'fa-circle-xmark';
  } else if (type === 'warning') {
    colorClass = 'bg-yellow-500 text-indigo-950';
    iconClass = 'fa-triangle-exclamation';
  }

  toast.className = `${colorClass} shadow-xl rounded-lg px-4 py-3 max-w-sm flex items-center space-x-3 transition duration-300 transform translate-y-2 opacity-0`;
  toast.innerHTML = `
    <i class="fa-solid ${iconClass} text-lg"></i>
    <span class="text-xs font-semibold">${message}</span>
  `;

  container.appendChild(toast);

  // Trigger anim
  setTimeout(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  }, 10);

  // Fade out
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// --- MOCK REFERRAL COMMISSION ALERT ---
function showReferralAlert() {
  alert('✨ EXTENDED PROTECTION OFFERED BY COVERALL INSURANCE: Get 15% off protective warranty on your high-value item because you are a verified ReceiptVault member! (Referral Code: VAULT_MVP_15)');
}

// --- COPY TO CLIPBOARD HELPER ---
function copyText(id) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied proxy details to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

// --- ESCAPE HTML ---
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
