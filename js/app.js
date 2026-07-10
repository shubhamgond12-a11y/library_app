// --- APP CONFIG & DB LAYER ---
var appConfig = {
    libraryName: "LibSync Pro", totalSeats: 20,
    customSeats: ["1A", "1B", "2A", "2B"],
    shifts: ["first (8 AM - 2 PM)", "second (2 PM - 8 PM)", "Full Day (8 AM - 8 PM)"]
};

var DB = {
    seatsData: {}, expenses: [], waitlist: [],
    init: function() {
        const rawData = {};
        for(let seatId of window.seatLayout) rawData[seatId] = [];
        this.seatsData = rawData;
    },
    save: function() {
        if (!currentUser || currentUser.uid === ADMIN_UID) return; 
        db.doc(`artifacts/${globalAppId}/users/${currentUser.uid}/libraryData/main`).set({
            config: appConfig, seatsData: this.seatsData, expenses: this.expenses, waitlist: this.waitlist
        }, { merge: true }).catch(err => console.error("Cloud Error: ", err));
    },
    getOccupants: function(seatNo) { return this.seatsData[seatNo] || []; },
    addStudent: function(seatNo, studentData) {
        if(!this.seatsData[seatNo]) this.seatsData[seatNo] = [];
        this.seatsData[seatNo].push(studentData); this.save();
    },
    updateStudent: function(seatNo, studentId, updatedData) {
        const idx = this.seatsData[seatNo].findIndex(s => s.id === studentId);
        if(idx > -1) { this.seatsData[seatNo][idx] = { ...this.seatsData[seatNo][idx], ...updatedData }; this.save(); }
    },
    removeStudent: function(seatNo, studentId) {
        this.seatsData[seatNo] = this.seatsData[seatNo].filter(s => s.id !== studentId); this.save();
    },
    addPayment: function(seatNo, studentId, paymentObj, validDate, feeStatus) {
        const student = this.seatsData[seatNo].find(s => s.id === studentId);
        if(student) {
            if(!student.payments) student.payments = [];
            student.payments.push(paymentObj);
            if(validDate) student.validDate = validDate;
            if(feeStatus) student.feeStatus = feeStatus;
            this.save();
        }
    }
};

// --- STATE & UTILS ---
window.seatLayout = []; window.currentFilter = 'all'; 
window.activeSeatNo = null; window.activeStudentId = null; window.isDeleteConfirmStep = false; 

if(localStorage.getItem('libTheme') === 'dark') document.body.classList.add('dark-theme');

window.toast = function(message) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div'); el.className = 'toast'; el.innerText = message;
    container.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
}

window.toggleTheme = function() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('libTheme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
}

// --- REAL-TIME BROADCAST LISTENER (SYSTEM NOTIFICATIONS) ---
function listenForBroadcasts() {
    const docRef = db.doc(`artifacts/${globalAppId}/public/data/broadcast/latest`);
    unsubscribeBroadcast = docRef.onSnapshot((docSnap) => {
        const banner = document.getElementById('broadcastBanner');
        const bannerText = document.getElementById('broadcastText');
        if (docSnap.exists) {
            const data = docSnap.data();
            if (data.active && data.message) {
                bannerText.innerText = data.message;
                banner.classList.remove('hidden');
            } else {
                banner.classList.add('hidden');
            }
        } else {
            banner.classList.add('hidden');
        }
    }, (error) => {
        console.warn("Broadcast channels read-only exception catch:", error);
    });
}

// --- CLOUD SYNC & APP LOAD ---
function loadDataFromCloud() {
    if(!currentUser || currentUser.uid === ADMIN_UID) return;
    const docRef = db.doc(`artifacts/${globalAppId}/users/${currentUser.uid}/libraryData/main`);
    unsubscribeSnapshot = docRef.onSnapshot((docSnap) => {
        window.initializeAppStructure(); 
        if (docSnap.exists) {
            const d = docSnap.data();
            if (d.config) appConfig = d.config;
            if (d.seatsData) DB.seatsData = d.seatsData;
            DB.expenses = d.expenses || [];
            DB.waitlist = d.waitlist || [];
        } else {
            DB.init(); DB.save();
        }
        
        document.getElementById('appTitle').innerText = appConfig.libraryName || 'LibSync Pro';
        window.initializeAppStructure();
        window.renderSeats();
        window.renderWaitlist();
        window.calculateFinances();
    }, (error) => { window.toast("Sync error"); });
}

// --- INTERACTIVE APP TOUR (Driver.js) ---
function startAppTour() {
    if (localStorage.getItem('hasSeenLibSyncTour') === 'true') return;
    const driverObj = window.driver.js.driver;
    const tour = driverObj({
        showProgress: true, animate: true,
        steps: [
            { popover: { title: 'Welcome to LibSync Pro! 👋', description: 'Let us take a quick 30-second tour to show you how to automate your library management.', align: 'center' } },
            { element: '#settingsTab', popover: { title: '1. Initial Setup', description: 'Start here. Enter your Library Name, total number of seats, and define your shifts.', side: "bottom", align: 'start' } },
            { element: '#seatMapTab', popover: { title: '2. The Seat Matrix', description: 'Your command center. Use the shift dropdown here to see exactly which seats are vacant or occupied in real-time.', side: "bottom", align: 'start' } },
            { element: '#tabAddBtn', popover: { title: '3. Allot Seats', description: 'When a new student joins, use this tab. Select a seat, assign a shift, and their data is saved instantly.', side: "bottom", align: 'start' } },
            { element: '#tabWaitBtn', popover: { title: '4. Smart Waitlist', description: 'Is a shift completely full? Add students to the waitlist here so you never lose a potential admission.', side: "bottom", align: 'start' } },
            { element: '#tabFinBtn', popover: { title: '5. Financial Hub', description: 'View all your financial aspects in one place. Track fee collections, monitor pending dues, and view monthly revenue.', side: "bottom", align: 'start' } }
        ],
        onDestroyStarted: () => {
            localStorage.setItem('hasSeenLibSyncTour', 'true');
            tour.destroy();
        }
    });
    tour.drive();
}

// --- NAVIGATION ---
window.switchTab = function(tab) {
    ['seatMapTab', 'addSeatTab', 'waitlistTab', 'financeTab'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['tabMapBtn', 'tabAddBtn', 'tabWaitBtn', 'tabFinBtn'].forEach(id => document.getElementById(id).classList.remove('active'));
    
    if(tab === 'map') { document.getElementById('seatMapTab').classList.remove('hidden'); document.getElementById('tabMapBtn').classList.add('active'); window.renderSeats(); }
    else if(tab === 'add') { document.getElementById('addSeatTab').classList.remove('hidden'); document.getElementById('tabAddBtn').classList.add('active'); document.getElementById('admDate').value = new Date().toISOString().split('T')[0]; }
    else if(tab === 'wait') { document.getElementById('waitlistTab').classList.remove('hidden'); document.getElementById('tabWaitBtn').classList.add('active'); window.renderWaitlist(); }
    else if(tab === 'fin') { document.getElementById('financeTab').classList.remove('hidden'); document.getElementById('tabFinBtn').classList.add('active'); window.calculateFinances(); }
    
    const el = document.querySelector('.tab-btn.active');
    if(el) el.scrollIntoView({behavior: "smooth", block: "nearest", inline: "center"});
}

window.initializeAppStructure = function() {
    window.seatLayout = [];
    const total = parseInt(appConfig.totalSeats) || 20;
    const customs = appConfig.customSeats || [];
    for (let i = 1; i <= total; i++) {
        window.seatLayout.push(i.toString());
        window.seatLayout.push(...customs.filter(seat => {
            const match = seat.match(/^(\d+)[A-Za-z]+$/); return match && parseInt(match[1]) === i;
        }));
    }
    
    const shiftSelects = ['shift', 'waitShift', 'shiftFilter'];
    shiftSelects.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = id === 'shiftFilter' ? '<option value="all">All Shifts</option>' : '';
            (appConfig.shifts || []).forEach(s => { el.innerHTML += `<option value="${s}">${s}</option>`; });
            if(id === 'shift') el.innerHTML += `<option value="Custom">Custom Shift...</option>`;
        }
    });
}

// --- DASHBOARD & SEATS MATRIX ---
function checkExpiry(validDateStr) {
    if(!validDateStr) return 'ok';
    const today = new Date(); today.setHours(0,0,0,0);
    const valid = new Date(validDateStr); valid.setHours(0,0,0,0);
    const diffDays = Math.ceil((valid - today) / (1000 * 60 * 60 * 24));
    if(diffDays < 0) return 'expired';
    if(diffDays <= 3) return 'warn';
    return 'ok';
}

function updateDashboard() {
    let freeChairs = 0, totalEnrolled = 0, dueProfiles = 0, warnProfiles = 0;
    for(let seatId of window.seatLayout) {
        const occupants = DB.getOccupants(seatId);
        if(occupants.length === 0) freeChairs++;
        occupants.forEach(s => {
            totalEnrolled++;
            if(s.feeStatus === 'Due') dueProfiles++;
            const expStatus = checkExpiry(s.validDate);
            if(expStatus === 'warn' || expStatus === 'expired') warnProfiles++;
        });
    }
    document.getElementById('statFree').innerText = freeChairs;
    document.getElementById('statOccupied').innerText = totalEnrolled;
    document.getElementById('statDue').innerText = dueProfiles;
    document.getElementById('statWarn').innerText = warnProfiles;
    document.getElementById('waitBadge').innerText = (DB.waitlist || []).length;
}

window.setFilter = function(type) {
    window.currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('flt' + type.charAt(0).toUpperCase() + type.slice(1)).classList.add('active');
    window.renderSeats();
}
window.applyFilters = function() { window.renderSeats(); }

window.renderSeats = function() {
    const container = document.getElementById('seatsContainer'); if(!container) return;
    container.innerHTML = ''; updateDashboard();
    const examQuery = document.getElementById('searchExam').value.toLowerCase();
    const selectedShift = document.getElementById('shiftFilter').value;

    for (let seatId of window.seatLayout) {
        const allOccupants = DB.getOccupants(seatId);
        
        let occupants = allOccupants;
        if (selectedShift !== 'all') {
            occupants = allOccupants.filter(o => o.shift === selectedShift || o.shift.toLowerCase().includes('full day'));
        }

        let hasDue = false, hasExpired = false, hasWarn = false, hasMatch = false;
        
        occupants.forEach(s => {
            if (s.feeStatus === 'Due') hasDue = true;
            const expStatus = checkExpiry(s.validDate);
            if (expStatus === 'expired') hasExpired = true;
            if (expStatus === 'warn') hasWarn = true;
            if (!examQuery || (s.exam && s.exam.toLowerCase().includes(examQuery))) hasMatch = true;
        });

        if (window.currentFilter === 'free' && occupants.length > 0) continue;
        if (window.currentFilter === 'due' && !hasDue) continue;
        if (window.currentFilter === 'warn' && !hasWarn) continue;
        if (window.currentFilter === 'expired' && !hasExpired) continue;
        if (occupants.length > 0 && examQuery && !hasMatch) continue;

        const div = document.createElement('div');
        if (occupants.length > 0) {
            let alertClass = 'allotted';
            if (hasExpired) alertClass = 'expired-alert';
            else if (hasWarn) alertClass = 'warn-alert';
            else if (hasDue) alertClass = 'due-alert';
            
            div.className = `seat ${alertClass}`;
            div.innerHTML = `<div class="seat-number">${seatId}</div>`;
            occupants.forEach(s => { div.innerHTML += `<div class="seat-name">${s.name.split(' ')[0]} (${s.shift.charAt(0)})</div>`; });
            div.onclick = () => window.handleSeatClick(seatId);
        } else {
            if (window.currentFilter !== 'all' && window.currentFilter !== 'free') continue;
            div.className = `seat free`; div.innerHTML = `<div class="seat-number">${seatId}</div>`;
            div.onclick = () => { 
                window.switchTab('add'); 
                document.getElementById('seatNo').value = seatId; 
                if (selectedShift !== 'all') document.getElementById('shift').value = selectedShift;
            };
        }
        container.appendChild(div);
    }
}

window.allotSeat = function() {
    const seatNo = document.getElementById('seatNo').value.toUpperCase().trim(), name = document.getElementById('studentName').value;
    if (!seatNo || !window.seatLayout.includes(seatNo)) return window.toast('⚠️ Invalid Seat Number.');
    if (!name) return window.toast('⚠️ Name required');

    let shift = document.getElementById('shift').value === 'Custom' ? document.getElementById('customShift').value : document.getElementById('shift').value;
    const occupants = DB.getOccupants(seatNo);

    let hasConflict = false, conflictMsg = "";
    for (let s of occupants) {
        if (s.shift === shift) { hasConflict = true; conflictMsg = `Booked for ${shift} by ${s.name}`; break; }
        if (s.shift.includes("Full Day") && (shift.includes("Morning") || shift.includes("Evening"))) { hasConflict = true; conflictMsg = `Booked Full Day by ${s.name}`; break; }
        if (shift.includes("Full Day") && (s.shift.includes("Morning") || s.shift.includes("Evening"))) { hasConflict = true; conflictMsg = `Booked half day by ${s.name}`; break; }
    }
    if (hasConflict) return window.toast('🚫 ' + conflictMsg);

    let initialPayments = []; const amt = document.getElementById('initialAmount').value;
    if(amt) initialPayments.push({ date: document.getElementById('admDate').value, amount: amt, mode: document.getElementById('initialMode').value });

    DB.addStudent(seatNo, { 
        id: Date.now().toString(), name, shift, phone: document.getElementById('phone').value || 'N/A', exam: document.getElementById('exam').value || 'General', 
        admDate: document.getElementById('admDate').value, validDate: document.getElementById('validDate').value, 
        feeStatus: document.getElementById('feeStatus').value, payments: initialPayments
    });
    
    ['seatNo', 'studentName', 'phone', 'exam', 'admDate', 'validDate', 'initialAmount', 'customShift'].forEach(id => document.getElementById(id).value = '');
    window.switchTab('map'); window.toast(`🎉 ${name} allocated!`);
}

// --- WAITLIST LOGIC ---
window.addWaitlist = function() {
    const name = document.getElementById('waitName').value;
    if(!name) return window.toast('⚠️ Name required');
    DB.waitlist.push({ id: Date.now().toString(), name, phone: document.getElementById('waitPhone').value || 'N/A', shift: document.getElementById('waitShift').value, date: new Date().toISOString().split('T')[0] });
    DB.save();
    document.getElementById('waitName').value = ''; document.getElementById('waitPhone').value = '';
    window.renderWaitlist(); window.toast("Added to waitlist");
}
window.renderWaitlist = function() {
    const cont = document.getElementById('waitlistContainer'); cont.innerHTML = '';
    if(!DB.waitlist || DB.waitlist.length === 0) { cont.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center;">Waitlist is empty.</div>'; }
    (DB.waitlist || []).forEach(w => {
        cont.innerHTML += `
            <div class="list-item">
                <div>
                    <strong style="font-size:14px; display:block;">${w.name}</strong>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${w.phone} • ${w.shift}</div>
                    <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">Listed: ${w.date}</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button class="filter-btn" style="background:var(--primary); color:white; padding:6px 10px;" onclick="promoteWaitlist('${w.id}')">Allot Seat</button>
                    <button class="filter-btn" style="background:transparent; border-color:var(--red); color:var(--red); padding:6px 10px;" onclick="removeWaitlist('${w.id}')">Remove</button>
                </div>
            </div>`;
    });
    document.getElementById('waitBadge').innerText = (DB.waitlist || []).length;
}
window.removeWaitlist = function(id) { DB.waitlist = DB.waitlist.filter(w => w.id !== id); DB.save(); window.renderWaitlist(); window.toast("Removed from waitlist"); }
window.promoteWaitlist = function(id) {
    const student = DB.waitlist.find(w => w.id === id);
    if(student) {
        window.switchTab('add');
        document.getElementById('studentName').value = student.name;
        document.getElementById('phone').value = student.phone !== 'N/A' ? student.phone : '';
        document.getElementById('shift').value = student.shift;
        window.removeWaitlist(id);
        window.toast("Fill seat number to complete.");
    }
}

// --- FINANCE LOGIC ---
window.switchFinView = function(view) {
    document.getElementById('finIncomeView').classList.toggle('hidden', view !== 'income');
    document.getElementById('finExpenseView').classList.toggle('hidden', view !== 'expense');
    document.getElementById('btnShowIncome').classList.toggle('active', view === 'income');
    document.getElementById('btnShowExpense').classList.toggle('active', view === 'expense');
}

window.addExpense = function() {
    const amt = document.getElementById('expAmount').value, date = document.getElementById('expDate').value, cat = document.getElementById('expCategory').value;
    if(!amt || !date || !cat) return window.toast("⚠️ Fill all expense details");
    DB.expenses.push({ id: Date.now().toString(), date, amount: parseFloat(amt), category: cat });
    DB.save();
    document.getElementById('expAmount').value = ''; document.getElementById('expCategory').value = '';
    window.calculateFinances(); window.toast("Expense saved");
}

window.removeExpense = function(id) { DB.expenses = DB.expenses.filter(e => e.id !== id); DB.save(); window.calculateFinances(); }

window.calculateFinances = function() {
    const monthStr = document.getElementById('finMonth').value; 
    if(!monthStr) return;
    
    let totalIncome = 0, totalExpense = 0;
    const incCont = document.getElementById('incomeLedgerContainer'); incCont.innerHTML = '';
    const expCont = document.getElementById('expenseLedgerContainer'); expCont.innerHTML = '';

    let incomes = [];
    for(let seatId of window.seatLayout) {
        const occupants = DB.getOccupants(seatId);
        occupants.forEach(s => {
            if(s.payments) {
                s.payments.forEach(p => {
                    if(p.date.startsWith(monthStr)) {
                        totalIncome += parseFloat(p.amount);
                        incomes.push({ date: p.date, name: s.name, seat: seatId, amount: p.amount, mode: p.mode });
                    }
                });
            }
        });
    }
    
    incomes.sort((a,b) => new Date(b.date) - new Date(a.date));
    if(incomes.length === 0) incCont.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center;">No income recorded this month.</div>';
    incomes.forEach(i => {
        incCont.innerHTML += `
            <div class="list-item">
                <div>
                    <strong style="font-size:13px; display:block;">${i.name} <span style="color:var(--text-muted); font-size:11px;">(Seat ${i.seat})</span></strong>
                    <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${i.date} • Mode: ${i.mode}</div>
                </div>
                <span style="color:var(--green); font-weight:700; font-size:14px;">+₹${i.amount}</span>
            </div>`;
    });

    let monthlyExps = (DB.expenses || []).filter(e => e.date.startsWith(monthStr));
    monthlyExps.sort((a,b) => new Date(b.date) - new Date(a.date));
    monthlyExps.forEach(e => {
        totalExpense += e.amount;
        expCont.innerHTML += `
            <div class="list-item">
                <div>
                    <strong style="font-size:13px; display:block;">${e.category}</strong>
                    <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${e.date}</div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="color:var(--red); font-weight:700; font-size:14px;">-₹${e.amount}</span>
                    <button style="background:none; border:none; color:var(--text-muted); cursor:pointer;" onclick="removeExpense('${e.id}')">×</button>
                </div>
            </div>`;
    });
    if(monthlyExps.length === 0) expCont.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center;">No expenses recorded.</div>';

    document.getElementById('finIncome').innerText = `₹${totalIncome}`;
    document.getElementById('finExpense').innerText = `₹${totalExpense}`;
    document.getElementById('finProfit').innerText = `₹${totalIncome - totalExpense}`;
}

// --- MODALS & SETTINGS ---
window.openSettingsModal = function() {
    hideAllModalSections();
    document.getElementById('cfgLibName').value = appConfig.libraryName || '';
    document.getElementById('cfgTotalSeats').value = appConfig.totalSeats || 20;
    document.getElementById('cfgCustomSeats').value = (appConfig.customSeats || []).join(', ');
    document.getElementById('cfgShifts').value = (appConfig.shifts || []).join('\n');
    triggerModalAnimation('modalSettingsSection'); document.getElementById('detailsModal').style.display = 'flex';
}
window.saveSettings = function() {
    appConfig.libraryName = document.getElementById('cfgLibName').value.trim() || "LibSync Pro";
    appConfig.totalSeats = parseInt(document.getElementById('cfgTotalSeats').value) || 20;
    appConfig.customSeats = document.getElementById('cfgCustomSeats').value.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
    appConfig.shifts = document.getElementById('cfgShifts').value.split('\n').map(s => s.trim()).filter(s => s);
    DB.save(); document.getElementById('appTitle').innerText = appConfig.libraryName;
    window.initializeAppStructure(); window.renderSeats(); window.closeModal(); window.toast('✅ Settings applied!');
}

function hideAllModalSections() { 
    ['modalListSection', 'modalViewSection', 'modalEditSection', 'modalPaySection', 'modalSettingsSection', 'adminUserSection'].forEach(id => { 
        const el = document.getElementById(id);
        if(el) { el.classList.add('hidden'); el.classList.remove('modal-animate'); }
    }); 
}
function triggerModalAnimation(sectionId) { const el = document.getElementById(sectionId); el.classList.remove('hidden'); void el.offsetWidth; el.classList.add('modal-animate'); }

window.handleSeatClick = function(seatNo) {
    window.activeSeatNo = seatNo; const occupants = DB.getOccupants(seatNo);
    if(occupants.length === 1) window.openStudentProfile(occupants[0].id); else window.showListMenu();
    document.getElementById('detailsModal').style.display = 'flex';
}
window.showListMenu = function() {
    hideAllModalSections(); document.getElementById('listSeatNo').innerText = window.activeSeatNo;
    const listCont = document.getElementById('occupantsContainer'); listCont.innerHTML = '';
    DB.getOccupants(window.activeSeatNo).forEach(s => {
        let badgeColor = s.feeStatus === 'Due' ? 'var(--orange)' : 'var(--green)';
        listCont.innerHTML += `
            <div class="list-item" style="cursor:pointer;" onclick="openStudentProfile('${s.id}')">
                <div><strong style="display:block; font-size:14px;">${s.name}</strong>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${s.shift}</div></div>
                <span class="badge" style="background:${badgeColor};">${s.feeStatus}</span>
            </div>`;
    });
    triggerModalAnimation('modalListSection');
}
window.openStudentProfile = function(studentId) {
    window.activeStudentId = studentId; hideAllModalSections(); window.isDeleteConfirmStep = false;
    const rmvBtn = document.getElementById('btnRemoveStudent'); if(rmvBtn) { rmvBtn.innerText = "Remove"; rmvBtn.style.background = "var(--red)"; }
    const student = DB.getOccupants(window.activeSeatNo).find(s => s.id === studentId);
    document.getElementById('modSeatTitle').innerText = window.activeSeatNo;
    ['Name','Phone','Shift','Exam','Date','Valid'].forEach(k => document.getElementById('mod'+k).innerText = student[k.toLowerCase() === 'date' ? 'admDate' : k.toLowerCase() === 'valid' ? 'validDate' : k.toLowerCase()] || 'N/A');
    const feeEl = document.getElementById('modFee'); feeEl.innerText = student.feeStatus; feeEl.style.background = student.feeStatus === 'Due' ? 'var(--orange)' : 'var(--green)';
    
    const ledger = document.getElementById('paymentLedger'); ledger.innerHTML = '';
    if(!student.payments || student.payments.length === 0) ledger.innerHTML = '<div style="font-size:11px; color:var(--text-muted); text-align:center;">No history.</div>';
    else { [...student.payments].reverse().forEach(p => { ledger.innerHTML += `<div class="info-row"><div style="font-size:11px;"><strong style="color:var(--text-main); display:block;">${p.date}</strong>${p.mode}</div><div style="color:var(--green); font-weight:700;">₹${p.amount}</div></div>`; }); }
    
    const btnBack = document.getElementById('btnViewBack');
    if(DB.getOccupants(window.activeSeatNo).length > 1) { btnBack.innerHTML = "Back"; btnBack.onclick = window.backToListOrClose; } else { btnBack.innerHTML = "Close"; btnBack.onclick = window.closeModal; }
    triggerModalAnimation('modalViewSection');
}

window.backToListOrClose = function() { if(DB.getOccupants(window.activeSeatNo).length > 1) window.showListMenu(); else window.closeModal(); }
window.closeModal = function() { document.getElementById('detailsModal').style.display = 'none'; window.activeSeatNo = null; window.activeStudentId = null; }
window.addAnotherToSeat = function() { const seat = window.activeSeatNo; window.closeModal(); window.switchTab('add'); document.getElementById('seatNo').value = seat; }

window.showEditForm = function() {
    hideAllModalSections(); const student = DB.getOccupants(window.activeSeatNo).find(s => s.id === window.activeStudentId);
    ['Name','Phone','Exam','AdmDate','ValidDate','FeeStatus','Shift'].forEach(k => document.getElementById('edit'+k).value = student[k.charAt(0).toLowerCase() + k.slice(1)] || '');
    triggerModalAnimation('modalEditSection');
}
window.saveEdit = function() {
    const d = {}; ['Name','Phone','Exam','AdmDate','ValidDate','FeeStatus','Shift'].forEach(k => d[k.charAt(0).toLowerCase() + k.slice(1)] = document.getElementById('edit'+k).value);
    DB.updateStudent(window.activeSeatNo, window.activeStudentId, d); window.toast("Updated"); window.renderSeats(); window.openStudentProfile(window.activeStudentId); 
}
window.cancelEdit = function() { window.openStudentProfile(window.activeStudentId); }

window.showPaymentForm = function() {
    hideAllModalSections(); const student = DB.getOccupants(window.activeSeatNo).find(s => s.id === window.activeStudentId);
    document.getElementById('payStudentName').innerText = student.name; document.getElementById('payDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('payAmount').value = ''; document.getElementById('payValidDate').value = student.validDate || ''; document.getElementById('payFeeStatus').value = 'Paid';
    triggerModalAnimation('modalPaySection');
}
window.hidePaymentForm = function() { window.openStudentProfile(window.activeStudentId); }
window.savePayment = function() {
    const amt = document.getElementById('payAmount').value; if(!amt) return window.toast('⚠️ Enter amount');
    DB.addPayment(window.activeSeatNo, window.activeStudentId, { date: document.getElementById('payDate').value, amount: amt, mode: document.getElementById('payMode').value }, document.getElementById('payValidDate').value, document.getElementById('payFeeStatus').value);
    window.toast('Payment Saved'); window.renderSeats(); window.calculateFinances(); window.openStudentProfile(window.activeStudentId);
}

window.freeStudentSlot = function() {
    const btn = document.getElementById('btnRemoveStudent');
    if (!window.isDeleteConfirmStep) {
        window.isDeleteConfirmStep = true; btn.innerText = "Tap Again to Delete"; btn.style.background = "#991b1b"; 
        setTimeout(() => { if (window.isDeleteConfirmStep) { window.isDeleteConfirmStep = false; btn.innerText = "Remove"; btn.style.background = "var(--red)"; } }, 4000); return;
    }
    DB.removeStudent(window.activeSeatNo, window.activeStudentId); window.renderSeats(); window.calculateFinances(); window.toast(`🗑️ Removed.`);
    window.isDeleteConfirmStep = false; btn.innerText = "Remove"; btn.style.background = "var(--red)";
    if(DB.getOccupants(window.activeSeatNo).length > 0) window.showListMenu(); else window.closeModal();
}

window.exportData = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ config: appConfig, seatsData: DB.seatsData, expenses: DB.expenses, waitlist: DB.waitlist }));
    const a = document.createElement('a'); a.href = dataStr; a.download = `LibSync_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); a.remove(); window.toast("📥 Downloaded!");
}
window.importData = function(input) {
    const reader = new FileReader();
    reader.onload = function(){
        try {
            const obj = JSON.parse(reader.result);
            if(obj.config) { appConfig = obj.config; DB.seatsData = obj.seatsData || {}; DB.expenses = obj.expenses || []; DB.waitlist = obj.waitlist || []; } 
            else { DB.seatsData = obj; }
            DB.save(); document.getElementById('appTitle').innerText = appConfig.libraryName;
            window.initializeAppStructure(); window.renderSeats(); window.renderWaitlist(); window.calculateFinances(); window.closeModal(); window.toast("📤 Data Restored to Cloud!"); 
        } catch(e) { window.toast("⚠️ Error reading backup"); }
    };
    if(input.files[0]) reader.readAsText(input.files[0]);
}
window.toggleCustomShift = function(selectId, inputId) { document.getElementById(inputId).classList.toggle('hidden', document.getElementById(selectId).value !== 'Custom'); }

