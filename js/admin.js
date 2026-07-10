// --- ADMIN DASHBOARD, BROADCAST, AND NEW WORKSPACE MANAGEMENT ---
window.activeAdminUserId = null;
window.activeAdminUsername = null;
window.activeAdminUserEmail = null;

window.saveBroadcast = async function() {
    const msg = document.getElementById('adminBroadcastMsg').value.trim();
    if (!msg) return window.toast("⚠️ Enter message to broadcast!");
    await db.doc(`artifacts/${globalAppId}/public/data/broadcast/latest`).set({
        message: msg, active: true, updatedAt: new Date().toISOString()
    });
    window.toast("📢 Broadcast Announcement Activated!");
};

window.clearBroadcast = async function() {
    await db.doc(`artifacts/${globalAppId}/public/data/broadcast/latest`).set({ active: false });
    document.getElementById('adminBroadcastMsg').value = '';
    window.toast("📢 Announcement deactivated.");
};

window.loadAdminDashboard = async function() {
    const cont = document.getElementById('adminUsersContainer');
    cont.innerHTML = '<div style="text-align:center; padding:20px; font-size:13px;">Fetching SaaS workspaces...</div>';
    
    try {
        try {
            const bSnap = await db.doc(`artifacts/${globalAppId}/public/data/broadcast/latest`).get();
            if (bSnap.exists && bSnap.data().active) {
                document.getElementById('adminBroadcastMsg').value = bSnap.data().message || '';
            }
        } catch(e) { console.warn("Broadcast configs unreachable."); }

        const mapRef = db.collection(`artifacts/${globalAppId}/public/data/usernameMap`);
        const snap = await mapRef.get();
        
        let workspacesCount = 0;
        let activePremiumCount = 0;
        let monthRevenue = 0;
        const currentMonth = new Date().toISOString().substring(0, 7); 
        const today = new Date().toISOString().split('T')[0];
        
        let html = '';
        const promises = [];

        snap.docs.forEach(doc => {
            const data = doc.data();
            if(!data.uid || data.uid === ADMIN_UID) return;
            workspacesCount++;
            
            const subPromise = db.doc(`artifacts/${globalAppId}/users/${data.uid}/subscription/info`).get().then(async (subSnap) => {
                let libMainSnap;
                try {
                    libMainSnap = await db.doc(`artifacts/${globalAppId}/users/${data.uid}/libraryData/main`).get();
                } catch(e) {}
                
                const subData = subSnap.exists ? subSnap.data() : { status: 'trialing', validUntil: 'No End Date', history: [], adminNotes: '' };
                const libData = (libMainSnap && libMainSnap.exists) ? libMainSnap.data() : { config: {} };
                
                let status = subData.status || 'trialing';
                const validUntil = subData.validUntil || 'No End Date';
                
                // Administrator Dashboard Auto-Expiration Check
                if (validUntil !== 'No End Date' && validUntil < today && status !== 'inactive') {
                    status = 'inactive';
                    db.doc(`artifacts/${globalAppId}/users/${data.uid}/subscription/info`).set({ status: 'inactive' }, { merge: true }).catch(()=>{});
                }
                
                return {
                    username: doc.id,
                    email: data.email,
                    uid: data.uid,
                    status: status,
                    validUntil: validUntil,
                    history: subData.history || [],
                    libraryName: (libData.config && libData.config.libraryName) ? libData.config.libraryName : "Not Configured",
                };
            });
            promises.push(subPromise);
        });

        const workspaceProfiles = await Promise.all(promises);

        workspaceProfiles.forEach(prof => {
            prof.history.forEach(tx => {
                if (tx.date && tx.date.startsWith(currentMonth)) {
                    monthRevenue += parseFloat(tx.amount || 0);
                }
            });

            if (prof.status === 'active' || prof.status === 'trialing') { activePremiumCount++; }

            let badgeBg = 'var(--yellow)';
            let statusLabel = 'Trialing';
            if (prof.status === 'active') { badgeBg = 'var(--green)'; statusLabel = 'Active Premium'; }
            else if (prof.status === 'inactive') { badgeBg = 'var(--red)'; statusLabel = 'Expired'; }

            html += `
                <div class="list-item" style="flex-direction:column; align-items:flex-start; gap:8px; padding:15px;">
                    <div style="display:flex; width:100%; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="font-size:15px; color:var(--primary);">${prof.username}</strong>
                            <span style="font-size:10px; color:var(--text-muted); margin-left:5px;">(${prof.libraryName})</span>
                        </div>
                        <span class="badge" style="background:${badgeBg};">${statusLabel}</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">
                        ✉️ Email: ${prof.email}<br>
                        📅 Expiration: <strong style="color:${prof.status === 'inactive' ? 'var(--red)' : 'var(--text-main)'};">${prof.validUntil}</strong>
                    </div>
                    <div style="display:flex; gap:8px; width:100%; margin-top:5px;">
                        <button class="action-btn" style="margin:0; padding:8px 12px; font-size:11px; border-radius:8px; flex:1;" onclick="openAdminUser('${prof.uid}', '${prof.username}', '${prof.email}')">Manage Subscriber</button>
                    </div>
                </div>
            `;
        });

        document.getElementById('adminStatWorkspaces').innerText = workspacesCount;
        document.getElementById('adminStatPremium').innerText = activePremiumCount;
        document.getElementById('adminStatRevenue').innerText = `₹${monthRevenue}`;

        cont.innerHTML = html || '<div style="text-align:center; font-size:13px; color:var(--text-muted);">No workspaces configured.</div>';

    } catch(e) {
        // Keep the security rules injector for setup
        cont.innerHTML = `
            <div style="padding: 20px; text-align: left; background: rgba(239, 68, 68, 0.08); border: 1px solid var(--red); border-radius: 16px; color: var(--text-main); margin-top: 5px;" class="animate-in">
                <h4 style="margin-top:0; color: var(--red); font-size: 15px; font-weight: 700; display:flex; align-items:center; gap:6px;">
                    <span>🔒 Firestore Security Rules Required</span>
                </h4>
                <p style="font-size: 12px; line-height: 1.6; color: var(--text-muted); margin-bottom: 15px;">
                    To load workspaces, update subscriptions, and record SaaS payments, you must authorize this admin user inside your project's security policy.
                </p>
                <ol style="font-size: 11px; margin-left: 15px; padding-left: 0; color: var(--text-muted); line-height: 1.8; margin-bottom: 15px;">
                    <li>Log in to your <a href="[https://console.firebase.google.com/](https://console.firebase.google.com/)" target="_blank" style="color:var(--primary); font-weight:600; text-decoration:underline;">Firebase Console</a>.</li>
                    <li>Navigate to <strong>Firestore Database</strong> &gt; <strong>Rules</strong> tab.</li>
                    <li>Copy and paste the custom config rules provided below:</li>
                </ol>
                <textarea readonly style="width:100%; height:200px; font-family: monospace; font-size:11px; background: rgba(0,0,0,0.25); border:1px solid var(--glass-border); border-radius:12px; padding:12px; color:var(--text-main); margin-top:5px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.25); outline:none; resize:none;" onclick="this.select()">rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null && request.auth.uid == 'cwBkWqFBuHeqpLyNBKdQSeF1iu83';
    }
    match /artifacts/{appId} {
      match /public/data/usernameMap/{username} {
        allow read: if request.auth != null;
        allow write: if request.auth != null;
      }
      match /public/data/broadcast/{docId} {
        allow read: if request.auth != null;
        allow write: if isAdmin();
      }
      match /users/{userId}/{document=**} {
        allow read, write: if request.auth != null && (request.auth.uid == userId || isAdmin());
      }
    }
  }
}</textarea>
                <button class="action-btn" style="margin-top:15px; background:var(--primary);" onclick="loadAdminDashboard()">🔄 Check Rules & Reload</button>
            </div>
        `;
        console.error("Admin workspace dashboard access blocked:", e);
        window.toast("Admin load error: " + (e.message || "Unknown"));
    }
};

window.openAdminUser = async function(uid, username, email) {
    window.activeAdminUserId = uid;
    window.activeAdminUsername = username;
    window.activeAdminUserEmail = email;
    
    hideAllModalSections();
    document.getElementById('adminModUsername').innerText = username;
    document.getElementById('adminModEmail').innerText = email;
    document.getElementById('adminTxDate').value = new Date().toISOString().split('T')[0];
    
    const subRef = db.doc(`artifacts/${globalAppId}/users/${uid}/subscription/info`);
    const subSnap = await subRef.get();
    const subData = subSnap.exists ? subSnap.data() : { status: 'trialing', validUntil: '', history: [], adminNotes: '' };
    
    let currentStatus = subData.status || 'trialing';
    let validUntil = subData.validUntil || '';
    const today = new Date().toISOString().split('T')[0];

    if (validUntil && validUntil !== 'No End Date' && validUntil < today && currentStatus !== 'inactive') {
        currentStatus = 'inactive';
    }

    document.getElementById('adminSubStatus').value = currentStatus;
    document.getElementById('adminSubValid').value = validUntil;
    document.getElementById('adminModNotes').value = subData.adminNotes || '';
    
    renderAdminTxHistory(subData.history || []);
    
    triggerModalAnimation('adminUserSection');
    document.getElementById('detailsModal').style.display = 'flex';
};

window.extendAdminSub = function(days) {
    let currentVal = document.getElementById('adminSubValid').value;
    let dateObj = currentVal ? new Date(currentVal) : new Date();
    dateObj.setDate(dateObj.getDate() + days);
    document.getElementById('adminSubValid').value = dateObj.toISOString().split('T')[0];
    document.getElementById('adminSubStatus').value = 'active'; 
}

window.sendAdminPasswordReset = function() {
    if(!window.activeAdminUserEmail) return;
    auth.sendPasswordResetEmail(window.activeAdminUserEmail).then(() => {
        window.toast("Password reset email sent to " + window.activeAdminUserEmail);
    }).catch(e => window.toast("Error: " + e.message));
}

window.saveAdminSub = async function() {
    const status = document.getElementById('adminSubStatus').value;
    const validUntil = document.getElementById('adminSubValid').value;
    const notes = document.getElementById('adminModNotes').value;
    const uid = window.activeAdminUserId;
    
    await db.doc(`artifacts/${globalAppId}/users/${uid}/subscription/info`).set({
        status: status, validUntil: validUntil, adminNotes: notes
    }, { merge: true });
    
    window.toast('Workspace Updated!');
    window.loadAdminDashboard();
};

window.addAdminTransaction = async function() {
    const amt = document.getElementById('adminTxAmount').value;
    const date = document.getElementById('adminTxDate').value;
    if(!amt || !date) return window.toast('⚠️ Please enter an amount and date');
    
    const uid = window.activeAdminUserId;
    const subRef = db.doc(`artifacts/${globalAppId}/users/${uid}/subscription/info`);
    
    const tx = { id: Date.now().toString(), amount: amt, date: date };
    
    const snap = await subRef.get();
    let history = snap.exists && snap.data().history ? snap.data().history : [];
    history.push(tx);
    
    await subRef.set({ history: history }, { merge: true });
    
    renderAdminTxHistory(history);
    window.toast('Transaction Saved!');
    
    window.printInvoice(amt, date, window.activeAdminUsername, window.activeAdminUserEmail, tx.id);
    document.getElementById('adminTxAmount').value = '';
    window.loadAdminDashboard();
};

function renderAdminTxHistory(history) {
    const cont = document.getElementById('adminTxHistory');
    cont.innerHTML = '';
    if(history.length === 0) {
        cont.innerHTML = '<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:10px;">No transactions recorded.</div>';
        return;
    }
    
    [...history].reverse().forEach(tx => {
        cont.innerHTML += `
            <div class="list-item" style="margin-bottom:4px; padding:10px; background:transparent;">
                <div>
                    <strong style="font-size:13px; display:block;">${tx.date}</strong>
                    <span style="font-size:9px; color:var(--text-muted);">Ref: ${tx.id}</span>
                </div>
                <div style="display:flex; gap:10px; align-items:center;">
                    <span style="color:var(--green); font-weight:700; font-size:14px;">₹${tx.amount}</span>
                    <button class="filter-btn" style="background:var(--primary); color:white; padding:4px 8px; font-size:10px;" onclick="printInvoice('${tx.amount}', '${tx.date}', '${window.activeAdminUsername}', '${window.activeAdminUserEmail}', '${tx.id}')">Invoice</button>
                </div>
            </div>
        `;
    });
}

window.printInvoice = function(amount, date, username, email, txId) {
    const w = window.open('', '_blank');
    w.document.write(`
        <html><head><title>Invoice - ${txId}</title>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
            .invoice-box { max-width: 800px; margin: auto; padding: 40px; border: 1px solid #eee; border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05); }
            h2 { color: #2563eb; font-size: 28px; margin-bottom: 5px; }
            .details { margin-top: 40px; line-height: 1.8; font-size: 14px; }
            .total { margin-top: 30px; font-size: 22px; font-weight: bold; border-top: 2px solid #eee; padding-top: 15px; }
            @media print { .invoice-box { box-shadow: none; border: none; } }
        </style>
        </head>
        <body>
            <div class="invoice-box">
                <h2>LibSync Pro</h2>
                <p style="color:#777; margin-top:0;">SaaS Subscription Invoice</p>
                
                <div class="details">
                    <p><strong>Billed To Workspace:</strong> ${username}</p>
                    <p><strong>Registered Email:</strong> ${email}</p>
                    <p><strong>Invoice Date:</strong> ${date}</p>
                    <p><strong>Transaction Ref:</strong> ${txId}</p>
                </div>
                
                <table style="width:100%; margin-top:40px; border-collapse: collapse; font-size: 15px;">
                    <tr style="background:#f8fafc; text-align:left;">
                        <th style="padding:15px; border-bottom:1px solid #e2e8f0; border-radius: 8px 0 0 8px;">Description</th>
                        <th style="padding:15px; border-bottom:1px solid #e2e8f0; text-align:right; border-radius: 0 8px 8px 0;">Amount</th>
                    </tr>
                    <tr>
                        <td style="padding:15px; border-bottom:1px solid #f1f5f9;">LibSync Pro Premium Subscription Access</td>
                        <td style="padding:15px; border-bottom:1px solid #f1f5f9; text-align:right;">₹${amount}</td>
                    </tr>
                </table>
                
                <div class="total" style="text-align:right;">Total Paid: ₹${amount}</div>
                <p style="margin-top:70px; font-size:12px; color:#94a3b8; text-align:center;">Thank you for your business. This is a computer-generated invoice and requires no signature.</p>
            </div>
            <script>
                setTimeout(() => { window.print(); }, 500);
            <\/script>
        </body></html>
    `);
    w.document.close();
}
