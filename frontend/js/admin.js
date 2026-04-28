const API_URL = 'http://localhost:5000/api';

// Check admin auth
function checkAdminAuth() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role !== 'admin') {
            window.location.href = 'dashboard.html';
            return false;
        }
        return true;
    } catch (e) {
        window.location.href = 'login.html';
        return false;
    }
}

// Load admin stats
async function loadAdminStats() {
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/admin/stats`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('totalUsers').textContent = stats.totalUsers;
            document.getElementById('activeUsers').textContent = stats.activeUsers;
            document.getElementById('pendingWithdrawals').textContent = stats.pendingWithdrawals;
            document.getElementById('totalEarnings').textContent = `${stats.totalEarnings.toLocaleString()} FRW`;
            
            // Create chart
            const ctx = document.getElementById('adminChart').getContext('2d');
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Total Users', 'Active Users', 'Pending Withdrawals'],
                    datasets: [{
                        label: 'Count',
                        data: [stats.totalUsers, stats.activeUsers, stats.pendingWithdrawals],
                        backgroundColor: ['#6366f1', '#10b981', '#f59e0b']
                    }]
                }
            });
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load all users
async function loadAllUsers() {
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const users = await response.json();
            const usersList = document.getElementById('usersList');
            
            usersList.innerHTML = users.map(user => `
                <tr>
                    <td>${user.fullName}</td>
                    <td>${user.phoneNumber}</td>
                    <td>${user.balance.toLocaleString()} FRW</td>
                    <td>${user.referralCount || 0}</td>
                    <td>
                        <span class="status-badge status-${user.isActive ? 'approved' : 'pending'}">
                            ${user.isActive ? 'Active' : 'Pending'}
                        </span>
                    </td>
                    <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Load pending users
async function loadPendingUsers() {
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/admin/pending-users`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const users = await response.json();
            const pendingList = document.getElementById('pendingUsersList');
            
            if (users.length === 0) {
                pendingList.innerHTML = '<tr><td colspan="5">No pending users</td></tr>';
                return;
            }
            
            pendingList.innerHTML = users.map(user => `
                <tr>
                    <td>${user.fullName}</td>
                    <td>${user.phoneNumber}</td>
                    <td>${user.referralPackage === 1 ? 'Basic (1000 FRW)' : user.referralPackage === 2 ? 'Pro (2000 FRW)' : 'Premium (3500 FRW)'}</td>
                    <td>${user.referralCode}</td>
                    <td>
                        <button class="btn-activate" onclick="activateUser('${user.id}')">
                            <i class="fas fa-check"></i> Activate
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading pending users:', error);
    }
}

// Activate user
async function activateUser(userId) {
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/admin/activate-user/${userId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showToast('User activated successfully!', 'success');
            loadPendingUsers();
            loadAllUsers();
            loadAdminStats();
        } else {
            const data = await response.json();
            showToast(data.error || 'Activation failed', 'error');
        }
    } catch (error) {
        console.error('Error activating user:', error);
        showToast('Network error', 'error');
    }
}

// Load withdrawal requests
async function loadWithdrawals() {
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/admin/withdrawals`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const withdrawals = await response.json();
            const withdrawalsList = document.getElementById('withdrawalsList');
            
            if (withdrawals.length === 0) {
                withdrawalsList.innerHTML = '<tr><td colspan="5">No pending withdrawals</td></tr>';
                return;
            }
            
            withdrawalsList.innerHTML = withdrawals.map(w => `
                <tr>
                    <td>${w.userName}</td>
                    <td>${w.userPhone}</td>
                    <td>${w.amount.toLocaleString()} FRW</td>
                    <td>${new Date(w.createdAt).toLocaleString()}</td>
                    <td>
                        <button class="btn-approve" onclick="approveWithdrawal('${w.id}')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn-reject" onclick="rejectWithdrawal('${w.id}')">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading withdrawals:', error);
    }
}

// Approve withdrawal
async function approveWithdrawal(withdrawalId) {
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/admin/approve-withdrawal/${withdrawalId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showToast('Withdrawal approved!', 'success');
            loadWithdrawals();
            loadAllUsers();
            loadAdminStats();
        } else {
            const data = await response.json();
            showToast(data.error || 'Approval failed', 'error');
        }
    } catch (error) {
        console.error('Error approving withdrawal:', error);
        showToast('Network error', 'error');
    }
}

// Reject withdrawal
async function rejectWithdrawal(withdrawalId) {
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/admin/reject-withdrawal/${withdrawalId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showToast('Withdrawal rejected!', 'success');
            loadWithdrawals();
        } else {
            const data = await response.json();
            showToast(data.error || 'Rejection failed', 'error');
        }
    } catch (error) {
        console.error('Error rejecting withdrawal:', error);
        showToast('Network error', 'error');
    }
}

// Load all transactions for admin
async function loadAllTransactions() {
    const token = getToken();
    
    try {
        const response = await fetch(`${API_URL}/admin/transactions`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const transactions = await response.json();
            const transactionsList = document.getElementById('allTransactionsList');
            
            if (transactions.length === 0) {
                transactionsList.innerHTML = '<tr><td colspan="5">No transactions</td></tr>';
                return;
            }
            
            transactionsList.innerHTML = transactions.map(t => `
                <tr>
                    <td>${t.userName || 'Unknown'}</td>
                    <td>${t.type}</td>
                    <td>${t.amount.toLocaleString()} FRW</td>
                    <td>
                        <span class="status-badge status-${t.status}">
                            ${t.status}
                        </span>
                    </td>
                    <td>${new Date(t.createdAt).toLocaleString()}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Setup admin navigation
function setupAdminNavigation() {
    const menuItems = document.querySelectorAll('.admin-menu li');
    const tabs = ['dashboard', 'users', 'pending-users', 'withdrawals', 'transactions'];
    
    menuItems.forEach(item => {
        if (item.id === 'adminLogout') {
            item.addEventListener('click', handleAdminLogout);
            return;
        }
        
        const tabName = item.dataset.tab;
        if (tabName) {
            item.addEventListener('click', () => {
                // Update active state
                menuItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                // Show selected tab
                tabs.forEach(tab => {
                    const tabElement = document.getElementById(`${tab}Tab`);
                    if (tabElement) {
                        tabElement.classList.remove('active');
                    }
                });
                
                const selectedTab = document.getElementById(`${tabName}Tab`);
                if (selectedTab) {
                    selectedTab.classList.add('active');
                }
                
                // Load data for specific tabs
                if (tabName === 'users') {
                    loadAllUsers();
                } else if (tabName === 'pending-users') {
                    loadPendingUsers();
                } else if (tabName === 'withdrawals') {
                    loadWithdrawals();
                } else if (tabName === 'transactions') {
                    loadAllTransactions();
                }
            });
        }
    });
}

// Handle admin logout
function handleAdminLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userId');
    window.location.href = 'login.html';
}

// Initialize admin panel
async function initAdmin() {
    if (!checkAdminAuth()) return;
    
    await loadAdminStats();
    await loadPendingUsers();
    setupAdminNavigation();
}

// Run initialization
if (document.getElementById('dashboardTab')) {
    initAdmin();
}