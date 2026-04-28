const API_URL = 'http://localhost:5000/api';

// Get token from storage
function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}

// Get user ID
function getUserId() {
    return localStorage.getItem('userId') || sessionStorage.getItem('userId');
}

// Check authentication
function checkDashboardAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Load user data
async function loadUserData() {
    const userId = getUserId();
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/user/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const userData = await response.json();
            document.getElementById('userName').textContent = userData.fullName;
            document.getElementById('referralCode').textContent = userData.referralCode;
            document.getElementById('balance').textContent = `${userData.balance.toLocaleString()} FRW`;
            document.getElementById('totalReferrals').textContent = userData.referralCount || 0;
            document.getElementById('totalEarnings').textContent = `${(userData.earnings || 0).toLocaleString()} FRW`;
            document.getElementById('withdrawBalance').textContent = `${userData.balance.toLocaleString()} FRW`;
            
            // Set referral link
            const referralLink = `${window.location.origin}/pages/signup.html?ref=${userData.referralCode}`;
            document.getElementById('referralLink').value = referralLink;
            
            return userData;
        } else {
            handleLogout();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Error loading user data', 'error');
    }
}

// Load referrals
async function loadReferrals() {
    const userId = getUserId();
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/user/${userId}/referrals`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const referrals = await response.json();
            const referralsList = document.getElementById('referralsList');
            
            if (referrals.length === 0) {
                referralsList.innerHTML = '<div class="loading">No referrals yet. Share your code to start earning!</div>';
                return;
            }
            
            referralsList.innerHTML = referrals.map(ref => `
                <div class="referral-item">
                    <div>
                        <strong>${ref.fullName}</strong>
                        <div><small>${ref.phoneNumber}</small></div>
                    </div>
                    <div>
                        <span class="package-badge">Package: ${ref.package === 1 ? 'Basic' : ref.package === 2 ? 'Pro' : 'Premium'}</span>
                        <div><small>Joined: ${new Date(ref.createdAt).toLocaleDateString()}</small></div>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading referrals:', error);
    }
}

// Load earnings chart
async function loadEarningsChart() {
    const userId = getUserId();
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/user/${userId}/transactions`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const transactions = await response.json();
            const earningsByMonth = {};
            
            transactions.forEach(t => {
                if (t.type === 'referral_earning' && t.status === 'approved') {
                    const date = new Date(t.createdAt);
                    const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
                    earningsByMonth[monthYear] = (earningsByMonth[monthYear] || 0) + t.amount;
                }
            });
            
            const months = Object.keys(earningsByMonth);
            const earnings = Object.values(earningsByMonth);
            
            const ctx = document.getElementById('earningsChart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [{
                        label: 'Monthly Earnings (FRW)',
                        data: earnings,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'top',
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error loading chart:', error);
    }
}

// Copy referral code
function copyReferralCode() {
    const code = document.getElementById('referralCode').textContent;
    navigator.clipboard.writeText(code);
    showToast('Referral code copied!', 'success');
}

// Copy referral link
function copyReferralLink() {
    const link = document.getElementById('referralLink');
    link.select();
    document.execCommand('copy');
    showToast('Referral link copied!', 'success');
}

// Share functions
function shareOnWhatsApp() {
    const link = document.getElementById('referralLink').value;
    const text = encodeURIComponent('Join me on ReferEarn and start earning! Use my referral link: ');
    window.open(`https://wa.me/?text=${text}${encodeURIComponent(link)}`, '_blank');
}

function shareOnFacebook() {
    const link = document.getElementById('referralLink').value;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank');
}

function shareOnTwitter() {
    const link = document.getElementById('referralLink').value;
    const text = encodeURIComponent('Join me on ReferEarn and start earning money through referrals!');
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(link)}`, '_blank');
}

// Navigation
function setupNavigation() {
    const menuItems = document.querySelectorAll('.sidebar-menu li');
    const pages = ['overview', 'referrals', 'transactions', 'withdraw'];
    
    menuItems.forEach(item => {
        if (item.id === 'logoutBtn') {
            item.addEventListener('click', handleLogout);
            return;
        }
        
        const pageName = item.dataset.page;
        if (pageName) {
            item.addEventListener('click', () => {
                // Update active state
                menuItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                // Show selected page
                pages.forEach(page => {
                    const pageElement = document.getElementById(`${page}Page`);
                    if (pageElement) {
                        pageElement.classList.remove('active');
                    }
                });
                
                const selectedPage = document.getElementById(`${pageName}Page`);
                if (selectedPage) {
                    selectedPage.classList.add('active');
                }
                
                // Load data for specific pages
                if (pageName === 'referrals') {
                    loadReferrals();
                } else if (pageName === 'transactions') {
                    loadTransactions();
                }
            });
        }
    });
}

// Withdraw form
function setupWithdrawForm() {
    const withdrawForm = document.getElementById('withdrawForm');
    if (withdrawForm) {
        withdrawForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const amount = parseInt(document.getElementById('withdrawAmount').value);
            const phoneNumber = document.getElementById('mobileNumber').value;
            const token = getToken();
            
            if (!amount || amount < 500) {
                showToast('Minimum withdrawal amount is 500 FRW', 'error');
                return;
            }
            
            if (!phoneNumber) {
                showToast('Please enter your mobile number', 'error');
                return;
            }
            
            try {
                const response = await fetch(`${API_URL}/withdraw`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ amount, phoneNumber })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showToast('Withdrawal request submitted for approval!', 'success');
                    withdrawForm.reset();
                    loadUserData(); // Refresh balance
                } else {
                    showToast(data.error || 'Withdrawal failed', 'error');
                }
            } catch (error) {
                console.error('Withdrawal error:', error);
                showToast('Network error', 'error');
            }
        });
    }
}

// Handle logout
function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userId');
    window.location.href = 'login.html';
}

// Initialize dashboard
async function initDashboard() {
    if (!checkDashboardAuth()) return;
    
    await loadUserData();
    await loadReferrals();
    await loadEarningsChart();
    setupNavigation();
    setupWithdrawForm();
}

// Run initialization
if (document.getElementById('overviewPage')) {
    initDashboard();
}