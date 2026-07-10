// --- UI TOGGLES ---
window.togglePasswordVisibility = function(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input.type === "password") {
        input.type = "text";
        icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    } else {
        input.type = "password";
        icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
    }
};

window.toggleAuthMode = function(mode) {
    ['loginForm', 'signupForm', 'resetForm'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(mode + 'Form').classList.remove('hidden');
    
    const titles = { 'login': 'Welcome Back!', 'signup': 'Create Account', 'reset': 'Reset Password' };
    const subtitles = { 'login': 'We missed you! Please enter your details.', 'signup': 'Sign up to create your library workspace.', 'reset': 'Enter your recovery email to reset password.' };
    
    document.getElementById('authTitle').innerText = titles[mode];
    document.getElementById('authSubtitle').innerText = subtitles[mode];
    
    document.getElementById('authError').innerText = ''; 
    document.getElementById('signupError').innerText = ''; 
    document.getElementById('resetError').innerText = ''; 
}

// --- AUTHENTICATION STATE & ROUTING ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        
        if (user.uid === ADMIN_UID) {
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'none';
            document.getElementById('adminApp').style.display = 'block';
            window.loadAdminDashboard();
            window.toast(`Welcome to the Admin Hub!`);
        } else {
            try {
                const subRef = db.doc(`artifacts/${globalAppId}/users/${user.uid}/subscription/info`);
                let isInactive = false;
                
                try {
                    const subSnap = await subRef.get();
                    if (subSnap.exists) {
                        const subData = subSnap.data();
                        let currentStatus = subData.status;
                        const validUntil = subData.validUntil;
                        const today = new Date().toISOString().split('T')[0];
                        
                        // Automatic Expiration Logic Check during Login
                        if (validUntil && validUntil !== 'No End Date' && validUntil < today && currentStatus !== 'inactive') {
                            currentStatus = 'inactive';
                            try { await subRef.set({ status: 'inactive' }, { merge: true }); } catch(err){}
                        }
                        
                        if (currentStatus === 'inactive') {
                            isInactive = true;
                        }
                    } else {
                        await subRef.set({
                            status: 'trialing',
                            validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                            history: [],
                            adminNotes: ""
                        }, { merge: true });
                    }
                } catch(dbErr) {
                    console.warn("Evaluating Subscription bypassed. Defaulting to Active:", dbErr);
                }
                
                if (isInactive) {
                    window.toast("⚠️ Your workspace subscription has expired or is inactive.");
                    auth.signOut();
                    return;
                }
                
                document.getElementById('authScreen').style.display = 'none';
                document.getElementById('adminApp').style.display = 'none';
                document.getElementById('mainApp').style.display = 'block';
                document.getElementById('finMonth').value = new Date().toISOString().substring(0,7);
                loadDataFromCloud(); 
                listenForBroadcasts();
                window.toast(`Welcome back!`);
                setTimeout(startAppTour, 1000);
                
            } catch(err) {
                console.error("Auth routing error:", err);
                window.toast("Error verifying workspace: " + (err.message || "Unknown"));
                auth.signOut();
            }
        }
    } else {
        currentUser = null; 
        document.getElementById('authScreen').style.display = 'flex'; 
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('adminApp').style.display = 'none';
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        if (unsubscribeBroadcast) unsubscribeBroadcast();
    }
});

// --- USER ACTIONS ---
window.loginUser = async () => {
    const idInput = document.getElementById('loginId').value.trim();
    const pass = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('authError');
    
    if(!idInput || !pass) return errEl.innerText = "Please enter Email and password.";
    errEl.innerText = "Logging in...";
    
    let emailToUse = idInput;
    try {
        if (!idInput.includes('@')) {
            const resolvedEmail = localStorage.getItem('lib_admin_' + idInput.toLowerCase());
            if (resolvedEmail) {
                emailToUse = resolvedEmail;
            } else {
                throw new Error("Admin ID not recognized on this device. Please log in with your email once to link this device.");
            }
        }
        await auth.signInWithEmailAndPassword(emailToUse, pass);
    } catch(e) { errEl.innerText = e.message.replace('Firebase:', '').trim(); }
};

window.signupUser = async () => {
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const pass = document.getElementById('signupPassword').value;
    const errEl = document.getElementById('signupError');
    
    if(!username || !email || !pass) return errEl.innerText = "Please fill all fields.";
    if(username.includes('@')) return errEl.innerText = "Admin ID cannot contain '@'.";
    
    errEl.innerText = "Creating workspace...";
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        localStorage.setItem('lib_admin_' + username.toLowerCase(), email);
        
        await db.doc(`artifacts/${globalAppId}/public/data/usernameMap/${username.toLowerCase()}`).set({
            email: email, uid: cred.user.uid
        });
        
        window.toast("Workspace Created! Device Linked.");
    } catch(e) { errEl.innerText = e.message.replace('Firebase:', '').trim(); }
};

window.resetPassword = () => {
    const email = document.getElementById('resetEmail').value.trim();
    const errEl = document.getElementById('resetError');
    if(!email) return errEl.innerText = "Please enter your recovery email.";
    auth.sendPasswordResetEmail(email).then(() => {
        errEl.style.color = "#10b981"; 
        errEl.innerText = "Reset link sent to your email!";
        setTimeout(() => window.toggleAuthMode('login'), 3000);
    }).catch(e => {
        errEl.style.color = "#ef4444"; 
        errEl.innerText = e.message.replace('Firebase:', '').trim();
    });
};

window.logoutUser = () => { auth.signOut().then(() => { window.toast("Logged out"); window.toggleAuthMode('login'); }); };

