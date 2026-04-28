const API_URL = 'http://localhost:5000/api';

// Check if user is logged in
function checkAuth() {
    const token = localStorage.getItem('token');
    if (token && (window.location.pathname.includes('login.html') || window.location.pathname.includes('signup.html'))) {
        window.location.href = 'dashboard.html';
    } else if (!token && window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'login.html';
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Signup form handling
if (document.getElementById('signupForm')) {
    const signupForm = document.getElementById('signupForm');
    
    // Get package from URL if present
    const urlParams = new URLSearchParams(window.location.search);
    const packageParam = urlParams.get('package');
    if (packageParam) {
        const packageSelect = document.getElementById('referralPackage');
        if (packageSelect) {
            packageSelect.value = packageParam;
        }
    }
    
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fullName = document.getElementById('fullName').value;
        const phoneNumber = document.getElementById('phoneNumber').value;
        const countryCode = document.getElementById('countryCode').value;
        const password = document.getElementById('password').value;
        const dateOfBirth = document.getElementById('dateOfBirth').value;
        const nationalId = document.getElementById('nationalId').value;
        const referralPackage = document.getElementById('referralPackage').value;
        const referralCode = document.getElementById('referralCode').value;
        
        // Validation
        if (!fullName || !phoneNumber || !password || !referralPackage) {
            showToast('Please fill in all required fields', 'error');
            return;
        }
        
        if (password.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fullName,
                    phoneNumber,
                    countryCode,
                    password,
                    dateOfBirth,
                    nationalId,
                    referralPackage,
                    referralCode
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('userId', data.userId);
                showToast('Account created successfully! Waiting for admin activation.', 'success');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 2000);
            } else {
                showToast(data.error || 'Signup failed', 'error');
            }
        } catch (error) {
            console.error('Signup error:', error);
            showToast('Network error. Please try again.', 'error');
        }
    });
}

// Login form handling
if (document.getElementById('loginForm')) {
    const loginForm = document.getElementById('loginForm');
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const phoneNumber = document.getElementById('phoneNumber').value;
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe')?.checked;
        
        if (!phoneNumber || !password) {
            showToast('Please enter phone number and password', 'error');
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phoneNumber, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                if (rememberMe) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('userId', data.userId);
                } else {
                    sessionStorage.setItem('token', data.token);
                    sessionStorage.setItem('userId', data.userId);
                }
                
                showToast('Login successful!', 'success');
                
                if (data.role === 'admin') {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'dashboard.html';
                }
            } else {
                showToast(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showToast('Network error. Please try again.', 'error');
        }
    });
}

// Toggle password visibility
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const icon = document.querySelector('.toggle-password');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Forgot password modal
if (document.getElementById('forgotPassword')) {
    const modal = document.getElementById('forgotModal');
    const forgotLink = document.getElementById('forgotPassword');
    const closeBtn = document.querySelector('.close');
    
    forgotLink.onclick = (e) => {
        e.preventDefault();
        modal.style.display = 'block';
    };
    
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }
    
    window.onclick = (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    };
    
    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('resetEmail').value;
            
            try {
                const response = await fetch(`${API_URL}/forgot-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showToast('Reset link sent to your email!', 'success');
                    modal.style.display = 'none';
                    forgotForm.reset();
                } else {
                    showToast(data.error || 'Failed to send reset link', 'error');
                }
            } catch (error) {
                showToast('Network error', 'error');
            }
        });
    }
}

// Initialize
checkAuth();

// Prevent admin from accessing user dashboard
if (window.location.pathname.includes('dashboard.html') && localStorage.getItem('token')) {
    // Check if admin
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.role === 'admin') {
                window.location.href = 'admin.html';
            }
        } catch (e) {
            // Invalid token, continue
        }
    }
}