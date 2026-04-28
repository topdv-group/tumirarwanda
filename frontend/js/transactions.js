// Load transactions
async function loadTransactions() {
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
            const transactionsList = document.getElementById('transactionsList');
            
            if (transactions.length === 0) {
                transactionsList.innerHTML = '<tr><td colspan="4">No transactions yet</td></tr>';
                return;
            }
            
            transactionsList.innerHTML = transactions.map(t => `
                <tr>
                    <td>${new Date(t.createdAt).toLocaleDateString()}</td>
                    <td>
                        <span class="transaction-type">
                            ${t.type === 'referral_earning' ? 'Referral Earning' : 
                              t.type === 'package_purchase' ? 'Package Purchase' : 
                              t.type === 'withdrawal' ? 'Withdrawal' : t.type}
                        </span>
                    </td>
                    <td class="${t.amount > 0 ? 'positive' : 'negative'}">
                        ${t.amount > 0 ? '+' : ''}${t.amount.toLocaleString()} FRW
                    </td>
                    <td>
                        <span class="status-badge status-${t.status}">
                            ${t.status}
                        </span>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Export for use in dashboard
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loadTransactions };
}