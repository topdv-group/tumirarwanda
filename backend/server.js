const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

dotenv.config();

// Initialize Firebase Admin
const serviceAccount = require('./firebase-admin.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
});

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use('/api/', limiter);

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper function to generate unique referral code
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper function to hash password
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

// Helper function to verify JWT
function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  jwt.verify(token.split(' ')[1], process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  });
}

// Routes

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { fullName, phoneNumber, countryCode, password, dateOfBirth, nationalId, referralPackage, referralCode } = req.body;
    
    // Validation
    if (!fullName || !phoneNumber || !countryCode || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if user exists
    const usersRef = db.collection('users');
    const existingUser = await usersRef.where('phoneNumber', '==', phoneNumber).get();
    if (!existingUser.empty) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Generate unique referral code
    let uniqueCode = generateReferralCode();
    let codeExists = await usersRef.where('referralCode', '==', uniqueCode).get();
    while (!codeExists.empty) {
      uniqueCode = generateReferralCode();
      codeExists = await usersRef.where('referralCode', '==', uniqueCode).get();
    }
    
    // Package prices
    const packagePrices = {
      1: 1000,
      2: 2000,
      3: 3500
    };
    
    const packagePrice = packagePrices[referralPackage];
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user object
    const userData = {
      fullName,
      phoneNumber,
      countryCode,
      password: hashedPassword,
      dateOfBirth: dateOfBirth || null,
      nationalId: nationalId || null,
      referralPackage: parseInt(referralPackage),
      referralCode: uniqueCode,
      balance: 0,
      isActive: false,
      createdAt: new Date().toISOString(),
      referralCount: 0,
      earnings: 0
    };
    
    // Handle referral
    let invitedBy = null;
    if (referralCode) {
      const referrerQuery = await usersRef.where('referralCode', '==', referralCode).get();
      if (!referrerQuery.empty) {
        invitedBy = referrerQuery.docs[0].id;
        userData.invitedBy = invitedBy;
      }
    }
    
    // Save user
    const userRef = await usersRef.add(userData);
    
    // Process referral earnings (50% of package price)
    if (invitedBy) {
      const earnings = packagePrice * 0.5;
      const referrerDoc = await usersRef.doc(invitedBy).get();
      const referrerData = referrerDoc.data();
      
      await usersRef.doc(invitedBy).update({
        balance: admin.firestore.FieldValue.increment(earnings),
        referralCount: admin.firestore.FieldValue.increment(1),
        earnings: admin.firestore.FieldValue.increment(earnings)
      });
      
      // Create transaction record
      await db.collection('transactions').add({
        userId: invitedBy,
        type: 'referral_earning',
        amount: earnings,
        fromUser: userRef.id,
        package: packagePrice,
        status: 'approved',
        createdAt: new Date().toISOString()
      });
    }
    
    // Generate JWT
    const token = jwt.sign({ userId: userRef.id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      success: true, 
      token, 
      userId: userRef.id,
      message: 'Account created successfully. Waiting for admin activation.'
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    
    if (!phoneNumber || !password) {
      return res.status(400).json({ error: 'Phone number and password required' });
    }
    
    const usersRef = db.collection('users');
    const userQuery = await usersRef.where('phoneNumber', '==', phoneNumber).get();
    
    if (userQuery.empty) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    
    // Check if admin
    if (userData.role === 'admin') {
      const validPassword = await bcrypt.compare(password, userData.password);
      if (validPassword) {
        const token = jwt.sign({ userId: userDoc.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
        return res.json({ success: true, token, role: 'admin' });
      }
    }
    
    // Normal user
    if (!userData.isActive) {
      return res.status(403).json({ error: 'Account not activated. Please wait for admin approval.' });
    }
    
    const validPassword = await bcrypt.compare(password, userData.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: userDoc.id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      success: true, 
      token, 
      userId: userDoc.id,
      role: 'user'
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Forgot password
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;
    
    const usersRef = db.collection('users');
    let userQuery;
    
    if (email) {
      userQuery = await usersRef.where('email', '==', email).get();
    } else if (phoneNumber) {
      userQuery = await usersRef.where('phoneNumber', '==', phoneNumber).get();
    } else {
      return res.status(400).json({ error: 'Email or phone number required' });
    }
    
    if (userQuery.empty) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userDoc = userQuery.docs[0];
    const resetToken = jwt.sign({ userId: userDoc.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    // Store reset token
    await db.collection('passwordResets').doc(userDoc.id).set({
      token: resetToken,
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    });
    
    // Send email
    const resetLink = `http://localhost:5000/reset-password.html?token=${resetToken}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email || userDoc.data().email,
      subject: 'Password Reset',
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p>`
    });
    
    res.json({ success: true, message: 'Reset link sent to your email' });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user data
app.get('/api/user/:userId', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.params.userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    delete userData.password;
    
    res.json(userData);
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's referral list
app.get('/api/user/:userId/referrals', verifyToken, async (req, res) => {
  try {
    const referralsRef = db.collection('users');
    const referrals = await referralsRef.where('invitedBy', '==', req.params.userId).get();
    
    const referralList = [];
    referrals.forEach(doc => {
      const data = doc.data();
      referralList.push({
        id: doc.id,
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        package: data.referralPackage,
        createdAt: data.createdAt
      });
    });
    
    res.json(referralList);
    
  } catch (error) {
    console.error('Get referrals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user transactions
app.get('/api/user/:userId/transactions', verifyToken, async (req, res) => {
  try {
    const transactionsRef = db.collection('transactions');
    const transactions = await transactionsRef.where('userId', '==', req.params.userId)
      .orderBy('createdAt', 'desc')
      .get();
    
    const transactionList = [];
    transactions.forEach(doc => {
      transactionList.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(transactionList);
    
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request withdrawal
app.post('/api/withdraw', verifyToken, async (req, res) => {
  try {
    const { amount, phoneNumber } = req.body;
    const userId = req.userId;
    
    if (!amount || amount < 500) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is 500 FRW' });
    }
    
    // Get user balance
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (userData.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Create withdrawal request
    await db.collection('withdrawals').add({
      userId,
      amount,
      phoneNumber,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Withdrawal request submitted for approval' });
    
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin routes
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username !== 'admin' || password !== process.env.ADMIN_SECRET_KEY) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }
    
    // Check if admin user exists, create if not
    const adminQuery = await db.collection('users').where('role', '==', 'admin').get();
    
    if (adminQuery.empty) {
      const hashedPassword = await hashPassword(process.env.ADMIN_SECRET_KEY);
      await db.collection('users').add({
        fullName: 'Admin User',
        phoneNumber: 'admin',
        role: 'admin',
        password: hashedPassword,
        isActive: true,
        createdAt: new Date().toISOString()
      });
    }
    
    const token = jwt.sign({ userId: 'admin', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, role: 'admin' });
    
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get all pending users
app.get('/api/admin/pending-users', verifyToken, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const usersRef = db.collection('users');
    const pendingUsers = await usersRef.where('isActive', '==', false).where('role', '==', null).get();
    
    const users = [];
    pendingUsers.forEach(doc => {
      const data = doc.data();
      users.push({ id: doc.id, ...data, password: undefined });
    });
    
    res.json(users);
    
  } catch (error) {
    console.error('Get pending users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Activate user
app.post('/api/admin/activate-user/:userId', verifyToken, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    await db.collection('users').doc(req.params.userId).update({
      isActive: true,
      activatedAt: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'User activated successfully' });
    
  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get all withdrawal requests
app.get('/api/admin/withdrawals', verifyToken, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const withdrawalsRef = db.collection('withdrawals');
    const withdrawals = await withdrawalsRef.where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get();
    
    const withdrawalList = [];
    for (const doc of withdrawals.docs) {
      const data = doc.data();
      const userDoc = await db.collection('users').doc(data.userId).get();
      const userData = userDoc.data();
      
      withdrawalList.push({
        id: doc.id,
        ...data,
        userName: userData?.fullName || 'Unknown',
        userPhone: userData?.phoneNumber
      });
    }
    
    res.json(withdrawalList);
    
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Approve withdrawal
app.post('/api/admin/approve-withdrawal/:withdrawalId', verifyToken, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const withdrawalDoc = await db.collection('withdrawals').doc(req.params.withdrawalId).get();
    const withdrawalData = withdrawalDoc.data();
    
    if (!withdrawalData || withdrawalData.status !== 'pending') {
      return res.status(400).json({ error: 'Invalid withdrawal request' });
    }
    
    // Update withdrawal status
    await db.collection('withdrawals').doc(req.params.withdrawalId).update({
      status: 'approved',
      approvedAt: new Date().toISOString()
    });
    
    // Deduct from user balance
    await db.collection('users').doc(withdrawalData.userId).update({
      balance: admin.firestore.FieldValue.increment(-withdrawalData.amount)
    });
    
    // Create transaction record
    await db.collection('transactions').add({
      userId: withdrawalData.userId,
      type: 'withdrawal',
      amount: -withdrawalData.amount,
      status: 'approved',
      createdAt: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Withdrawal approved' });
    
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get all users
app.get('/api/admin/users', verifyToken, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.where('role', '==', null).get();
    
    const users = [];
    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const transactions = await db.collection('transactions')
        .where('userId', '==', doc.id)
        .get();
      
      users.push({
        id: doc.id,
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        balance: data.balance,
        referralCode: data.referralCode,
        referralCount: data.referralCount,
        isActive: data.isActive,
        createdAt: data.createdAt,
        transactionCount: transactions.size
      });
    }
    
    res.json(users);
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin dashboard stats
app.get('/api/admin/stats', verifyToken, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const usersSnapshot = await db.collection('users').get();
    const activeUsers = await db.collection('users').where('isActive', '==', true).get();
    const pendingWithdrawals = await db.collection('withdrawals').where('status', '==', 'pending').get();
    const totalTransactions = await db.collection('transactions').get();
    
    let totalBalance = 0;
    let totalEarnings = 0;
    
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.balance) totalBalance += data.balance;
      if (data.earnings) totalEarnings += data.earnings;
    });
    
    res.json({
      totalUsers: usersSnapshot.size,
      activeUsers: activeUsers.size,
      pendingWithdrawals: pendingWithdrawals.size,
      totalBalance: totalBalance,
      totalEarnings: totalEarnings,
      totalTransactions: totalTransactions.size
    });
    
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PawaPay payment webhook (for payment confirmation)
app.post('/api/payment-webhook', async (req, res) => {
  try {
    const { transactionId, status, amount, userId } = req.body;
    
    if (status === 'completed') {
      // Update user package
      await db.collection('users').doc(userId).update({
        balance: admin.firestore.FieldValue.increment(amount)
      });
      
      // Create transaction record
      await db.collection('transactions').add({
        userId,
        type: 'package_purchase',
        amount,
        status: 'approved',
        transactionId,
        createdAt: new Date().toISOString()
      });
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});