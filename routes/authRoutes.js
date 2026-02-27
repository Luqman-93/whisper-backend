const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const upload = require('../middleware/upload');
const { User, Expert, Admin } = require('../models');
const { generateVerificationToken, sendVerificationEmail, generateOTP, sendOTPEmail } = require('../services/emailService');

const generateToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
};

// --- ANONYMOUS USER AUTH ---
router.post('/user/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('🔐 Login attempt for:', email);

        if (!email || !password) {
            console.log('❌ Missing email or password');
            return res.status(400).json({ message: 'Email and password required' });
        }

        // Generate deterministic hash from email + password
        const rawString = `${email}:${password}`;
        const hashed_id = crypto.createHash('sha256').update(rawString).digest('hex');
        console.log('🔑 Generated hashed_id:', hashed_id.substring(0, 16) + '...');

        // Find the user (NO AUTO-CREATE)
        const user = await User.findOne({
            where: { hashed_id }
        });

        // Check if user account is deleted/banned
        if (user && user.isDeleted) {
            console.log('❌ Login attempt for deleted/banned user:', email);

            // Check if it was an admin ban
            console.log('DEBUG: User flagReasons:', JSON.stringify(user.flagReasons));
            const isBanned = user.flagReasons && user.flagReasons.some(r => r.type === 'admin_ban');

            if (isBanned) {
                return res.status(403).json({
                    message: 'Your account has been suspended by the admin due to violations.',
                    isBanned: true
                });
            } else {
                return res.status(403).json({
                    message: 'You deleted your account by yourself. Please use another email to register.',
                    code: 'ACCOUNT_DELETED'
                });
            }
        }

        if (!user) {
            console.log('❌ User not found with this email/password combination');
            return res.status(401).json({
                message: 'Wrong credentials. Please check your email and password.'
            });
        }

        console.log('✅ User found:', { id: user.id, email: user.email, name: user.name });

        // Check if email is verified
        if (!user.emailVerified) {
            console.log('❌ Email not verified:', email);
            return res.status(403).json({
                message: 'Please verify your email first',
                code: 'EMAIL_NOT_VERIFIED',
                email: user.email
            });
        }

        const token = generateToken({ id: user.id, role: 'user', hashed_id: user.hashed_id, email: user.email, name: user.name });

        res.json({ token, role: 'user', isNew: false });
    } catch (error) {
        console.error('❌ Login error:', error.message);
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/user/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

        const rawString = `${email}:${password}`;
        const hashed_id = crypto.createHash('sha256').update(rawString).digest('hex');

        // Check if already exists
        // Check if email already exists (Active or Banned)
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            if (existingUser.isDeleted) {
                return res.status(403).json({ message: 'This email is associated with a banned account.' });
            }
            return res.status(400).json({ message: 'Email already in use. Please login.' });
        }

        // Create new user with OTP
        const otpCode = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const user = await User.create({
            hashed_id,
            email,
            name,
            emailVerified: false,
            otpCode,
            otpExpiry,
            verificationToken: generateVerificationToken(),
            verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        });

        // Send OTP email
        if (process.env.SMTP_USER) {
            await sendOTPEmail(email, name || 'User', otpCode);
            console.log('✅ OTP sent to:', email, '- Code:', otpCode); // Log for testing
        } else {
            console.log('⚠️ SMTP not configured. OTP Code:', otpCode);
        }

        res.status(201).json({
            message: 'Registration successful. Please check your email for verification code.',
            email: email,
            requiresVerification: true
        });
    } catch (error) {
        console.error('❌ User Registration Error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

// Verify OTP
router.post('/user/verify-otp', async (req, res) => {
    try {
        const { email, otpCode } = req.body;

        if (!email || !otpCode) {
            return res.status(400).json({ message: 'Email and OTP code required' });
        }

        const user = await User.findOne({ where: { email } });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ message: 'Email already verified' });
        }

        if (!user.otpCode) {
            return res.status(400).json({ message: 'No OTP found. Please request a new code.' });
        }

        if (user.otpCode !== otpCode) {
            console.log('❌ Invalid OTP:', otpCode, 'Expected:', user.otpCode);
            return res.status(400).json({ message: 'Invalid OTP code' });
        }

        // Check if OTP is expired
        if (new Date() > user.otpExpiry) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new code.' });
        }

        // Mark email as verified
        user.emailVerified = true;
        user.otpCode = null;
        user.otpExpiry = null;
        await user.save();

        console.log('✅ Email verified for:', email);

        // Generate token for auto-login
        const token = generateToken({
            id: user.id,
            role: 'user',
            hashed_id: user.hashed_id,
            email: user.email,
            name: user.name
        });

        res.json({
            message: 'Email verified successfully!',
            token,
            role: 'user'
        });
    } catch (error) {
        console.error('❌ OTP Verification Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Resend OTP
router.post('/user/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email required' });
        }

        const user = await User.findOne({ where: { email } });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ message: 'Email already verified' });
        }

        // Generate new OTP
        const otpCode = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        user.otpCode = otpCode;
        user.otpExpiry = otpExpiry;
        await user.save();

        // Send new OTP email
        if (process.env.SMTP_USER) {
            await sendOTPEmail(email, user.name || 'User', otpCode);
            console.log('✅ New OTP sent to:', email, '- Code:', otpCode);
        } else {
            console.log('⚠️ SMTP not configured. OTP Code:', otpCode);
        }

        res.json({ message: 'New OTP code sent to your email' });
    } catch (error) {
        console.error('❌ Resend OTP Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


// --- EXPERT AUTH ---
router.post('/expert/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`[Expert Login Debug] Attempting login for: ${email}`);
        const expert = await Expert.findOne({ where: { email } });

        if (!expert) {
            console.log(`[Expert Login Debug] Expert not found in DB for email: ${email}`);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        console.log(`[Expert Login Debug] Expert found. ID: ${expert.id}, isDeleted: ${expert.isDeleted}, FlagReasons: ${JSON.stringify(expert.flagReasons)}`);

        // Check if account is deleted/banned
        if (expert.isDeleted) {
            console.log('❌ Login attempt for deleted/banned expert:', email);

            // Check if it was an admin ban
            const isBanned = expert.flagReasons && expert.flagReasons.some(r => r.type === 'admin_ban');

            if (isBanned) {
                return res.status(403).json({
                    message: 'Your account has been suspended by the admin due to violations.',
                    status: 'banned'
                });
            } else {
                return res.status(403).json({
                    message: 'You deleted your account by yourself. Please use another email to register.',
                    code: 'ACCOUNT_DELETED'
                });
            }
        }

        const isMatch = await bcrypt.compare(password, expert.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        // Check application status
        if (expert.status === 'rejected') {
            return res.status(403).json({
                message: 'Application Rejected',
                reason: expert.rejectionReason || 'Your expert application was not approved',
                status: 'rejected'
            });
        }

        if (expert.status === 'pending' || !expert.isVerified) {
            return res.status(403).json({
                message: 'Application Under Review',
                reason: 'Your application is being reviewed by our admin team',
                status: 'pending'
            });
        }

        // Approved - allow login
        const token = generateToken({ id: expert.id, role: 'expert', name: expert.name });
        res.json({ token, role: 'expert' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- ADMIN AUTH ---
router.post('/admin/login', async (req, res) => {
    try {
        const { email, password, adminPass } = req.body;
        const admin = await Admin.findOne({ where: { email } });

        if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        // Verify Static Admin Pass
        if (admin.adminPass !== adminPass) {
            return res.status(401).json({ message: 'Invalid Security Pass' });
        }

        const token = generateToken({ id: admin.id, role: 'admin' });
        res.json({ token, role: 'admin' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Test/Register (Temporary for seeding experts/admins)
// Expert Registration
router.post('/expert/register', (req, res, next) => {
    upload.fields([
        { name: 'credentials', maxCount: 1 },
        { name: 'paymentScreenshot', maxCount: 1 }
    ])(req, res, (err) => {
        if (err) {
            // Handle Multer errors (e.g., File too large, Invalid file type)
            console.error('Upload Error:', err.message);
            return res.status(400).json({
                message: err.message || 'File upload failed (Size limit: 5MB)'
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { email, password, name, category, userId } = req.body;
        const credentialsPath = req.files['credentials'] ? req.files['credentials'][0].path : null;
        const paymentScreenshotPath = req.files['paymentScreenshot'] ? req.files['paymentScreenshot'][0].path : null;

        if (!email || !password || !name || !category) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (!req.files['credentials']) {
            return res.status(400).json({ message: 'Credentials document is required' });
        }
        if (!req.files['paymentScreenshot']) {
            return res.status(400).json({ message: 'Payment screenshot is required' });
        }

        const existingExpert = await Expert.findOne({ where: { email } });
        if (existingExpert) {
            // Allow re-submission if previously rejected
            if (existingExpert.status === 'rejected') {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);

                existingExpert.name = name;
                existingExpert.password = hashedPassword;
                existingExpert.category = category;
                existingExpert.credentialsPath = credentialsPath;
                existingExpert.paymentScreenshot = paymentScreenshotPath;
                existingExpert.status = 'pending';
                existingExpert.isVerified = false;
                existingExpert.rejectionReason = null;
                if (userId) existingExpert.userId = userId;

                await existingExpert.save();
                return res.status(200).json({ message: 'Application re-submitted successfully' });
            }
            else if (existingExpert.status === 'pending') {
                return res.status(400).json({ message: 'Application already under review' });
            }
            return res.status(400).json({ message: 'Email already in use' });
        }

        // Generate OTP for expert
        const otpCode = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const expert = await Expert.create({
            email,
            password,
            name,
            category,
            userId,
            credentialsPath,
            paymentScreenshot: paymentScreenshotPath,
            isVerified: false,
            emailVerified: false,
            verificationToken: generateVerificationToken(),
            verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
            otpCode,
            otpExpiry
        });

        // Send OTP verification email
        if (process.env.SMTP_USER) {
            await sendOTPEmail(email, name, otpCode);
            console.log('✅ Expert OTP sent to:', email, '- Code:', otpCode);
        } else {
            console.log('⚠️ SMTP not configured. Expert OTP Code:', otpCode);
        }

        res.status(201).json({
            message: 'Registration successful. Please check your email for verification code.',
            expertId: expert.id,
            email: email,
            role: 'expert'
        });
    } catch (error) {
        if (error.name === 'SequelizeValidationError') {
            const messages = error.errors.map(e => e.message);
            return res.status(400).json({ message: 'Validation Error', errors: messages });
        }
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Expert Verify OTP
router.post('/expert/verify-otp', async (req, res) => {
    try {
        const { email, otpCode } = req.body;

        if (!email || !otpCode) {
            return res.status(400).json({ message: 'Email and OTP code required' });
        }

        const expert = await Expert.findOne({ where: { email } });

        if (!expert) {
            return res.status(404).json({ message: 'Expert not found' });
        }

        if (expert.emailVerified) {
            return res.status(400).json({ message: 'Email already verified' });
        }

        if (!expert.otpCode) {
            return res.status(400).json({ message: 'No OTP found. Please request a new code.' });
        }

        if (expert.otpCode !== otpCode) {
            return res.status(400).json({ message: 'Invalid OTP code' });
        }

        if (new Date() > expert.otpExpiry) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new code.' });
        }

        expert.emailVerified = true;
        expert.otpCode = null;
        expert.otpExpiry = null;
        await expert.save();

        console.log('✅ Email verified for expert:', email);

        // NOTE: Experts are NOT automatically logged in or approved after verification.
        // They remain in 'pending' status until Admin approves.
        res.json({
            message: 'Email verified successfully! Your application is now under review by our admin team.',
            isVerified: true,
            status: expert.status // likely 'pending'
        });
    } catch (error) {
        console.error('❌ Expert OTP Verification Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Expert Resend OTP
router.post('/expert/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email required' });
        }

        const expert = await Expert.findOne({ where: { email } });

        if (!expert) {
            return res.status(404).json({ message: 'Expert not found' });
        }

        if (expert.emailVerified) {
            return res.status(400).json({ message: 'Email already verified' });
        }

        const otpCode = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        expert.otpCode = otpCode;
        expert.otpExpiry = otpExpiry;
        await expert.save();

        if (process.env.SMTP_USER) {
            await sendOTPEmail(email, expert.name, otpCode);
            console.log('✅ New Expert OTP sent to:', email, '- Code:', otpCode);
        } else {
            console.log('⚠️ SMTP not configured. Expert OTP Code:', otpCode);
        }

        res.json({ message: 'New OTP code sent to your email' });
    } catch (error) {
        console.error('❌ Expert Resend OTP Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/admin/create', async (req, res) => {
    // ONE TIME USE ONLY or Protected
    const { email, password, adminPass } = req.body;
    const admin = await Admin.create({ email, password, adminPass });
    res.json(admin);
});

// Email Verification Routes
router.get('/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Try finding in User table first
        let user = await User.findOne({
            where: {
                verificationToken: token,
                emailVerified: false
            }
        });

        if (user) {
            // Check if token is expired
            if (new Date() > user.verificationTokenExpiry) {
                return res.status(400).json({ message: 'Verification link expired. Please request a new one.' });
            }

            user.emailVerified = true;
            user.verificationToken = null;
            user.verificationTokenExpiry = null;
            await user.save();

            return res.json({ message: 'Email verified successfully! You can now use all features.', userType: 'user' });
        }

        // Try Expert table
        let expert = await Expert.findOne({
            where: {
                verificationToken: token,
                emailVerified: false
            }
        });

        if (expert) {
            if (new Date() > expert.verificationTokenExpiry) {
                return res.status(400).json({ message: 'Verification link expired. Please request a new one.' });
            }

            expert.emailVerified = true;
            expert.verificationToken = null;
            expert.verificationTokenExpiry = null;
            await expert.save();

            return res.json({ message: 'Email verified successfully! Your application is under review.', userType: 'expert' });
        }

        return res.status(404).json({ message: 'Invalid or already used verification link' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during verification' });
    }
});

// Resend Verification Email
router.post('/resend-verification', async (req, res) => {
    try {
        const { email, userType } = req.body; // userType: 'user' or 'expert'

        if (!email || !userType) {
            return res.status(400).json({ message: 'Email and user type required' });
        }

        if (userType === 'user') {
            const user = await User.findOne({ where: { email } });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            if (user.emailVerified) {
                return res.status(400).json({ message: 'Email already verified' });
            }

            // Generate new token
            user.verificationToken = generateVerificationToken();
            user.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await user.save();

            await sendVerificationEmail(email, user.name || 'User', user.verificationToken, 'user');
            return res.json({ message: 'Verification email sent!' });
        }

        if (userType === 'expert') {
            const expert = await Expert.findOne({ where: { email } });
            if (!expert) {
                return res.status(404).json({ message: 'Expert not found' });
            }
            if (expert.emailVerified) {
                return res.status(400).json({ message: 'Email already verified' });
            }

            expert.verificationToken = generateVerificationToken();
            expert.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await expert.save();

            await sendVerificationEmail(email, expert.name, expert.verificationToken, 'expert');
            return res.json({ message: 'Verification email sent!' });
        }

        res.status(400).json({ message: 'Invalid user type' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/me', require('../middleware/auth'), async (req, res) => {
    try {
        // Return basic user info from the decoded token (populated by auth middleware)
        const response = {
            id: req.user.id,
            role: req.user.role,
            name: req.user.name || null,
            email: req.user.email || null
        };

        // If expert, fetch additional details including isOnline status
        if (req.user.role === 'expert') {
            const expert = await Expert.findByPk(req.user.id, {
                attributes: ['isOnline', 'category', 'status']
            });
            if (expert) {
                response.isOnline = expert.isOnline;
                response.category = expert.category;
                response.status = expert.status;
            }
        }

        res.json(response);
    } catch (error) {
        console.error('❌ /auth/me error:', error.message);
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- FORGOT PASSWORD ---
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email required' });

        let userType = 'user';
        let account = await User.findOne({ where: { email } });

        if (!account) {
            account = await Expert.findOne({ where: { email } });
            userType = 'expert';
        }

        if (!account) {
            // Security: Don't reveal if email exists or not, but for UX we might say "If an account exists..."
            // stick to generic message
            return res.json({ message: 'If an account exists with this email, a reset code has been sent.' });
        }

        // Generate OTP
        const otpCode = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        account.otpCode = otpCode;
        account.otpExpiry = otpExpiry;
        await account.save();

        // Send Email
        if (process.env.SMTP_USER) {
            await sendOTPEmail(email, account.name, otpCode);
            console.log(`✅ Forgot Password OTP sent to ${email} (${userType}): ${otpCode}`);
        } else {
            console.log(`⚠️ SMTP not configured. OTP for ${email}: ${otpCode}`);
        }

        res.json({ message: 'If an account exists with this email, a reset code has been sent.', userType });

    } catch (error) {
        console.error('❌ Forgot Password Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { email, otpCode, newPassword } = req.body;
        if (!email || !otpCode || !newPassword) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        let userType = 'user';
        let account = await User.findOne({ where: { email } });
        if (!account) {
            account = await Expert.findOne({ where: { email } });
            userType = 'expert';
        }

        if (!account) {
            return res.status(404).json({ message: 'Account not found' });
        }

        // Verify OTP
        if (!account.otpCode || account.otpCode !== otpCode) {
            return res.status(400).json({ message: 'Invalid OTP code' });
        }

        if (new Date() > account.otpExpiry) {
            return res.status(400).json({ message: 'OTP has expired' });
        }

        // Update Password
        // Note: Expert model has a hook to hash password, User does not seem to have a password field (anonymous/hash_id based)?
        // Wait, User model defined `hashed_id` but NO password field in lines 1-64 of User.js view.
        // Let me re-read User.js.
        // User.js: hashed_id, email, name... NO PASSWORD.
        // Users login with email + password which generates a hash_id.
        // So resetting password for a User means ... changing the hash_id?
        // IF I change the password, I need to generate a NEW hashed_id.
        // BUT `hashed_id` is unique.
        // The `hashed_id` is `sha256(email + ":" + password)`.
        // So if I change the password, I calculate the new `hashed_id` and update it.

        if (userType === 'user') {
            const rawString = `${email}:${newPassword}`;
            const newHashedId = crypto.createHash('sha256').update(rawString).digest('hex');

            // Check if this new hash collides (highly unlikely)
            account.hashed_id = newHashedId;
        } else {
            // Expert has a password field and a hook to hash it
            // However, hooks might not run on `save()` if I just set the property?
            // Sequelize hooks run on save/update usually. 
            // Expert.js: beforeCreate logic. MISSING beforeUpdate logic for password hashing?
            // Let me check Expert.js implementation again.
            // Expert.js: hooks: { beforeCreate: ... } only.
            // I need to manually hash the password for Expert update OR add a beforeUpdate hook.
            // I will manually hash it here to be safe and quick.
            const salt = await bcrypt.genSalt(10);
            account.password = await bcrypt.hash(newPassword, salt);
        }

        // Clear OTP
        account.otpCode = null;
        account.otpExpiry = null;

        // Also verify email if not verified (since they proved ownership via OTP)
        if (!account.emailVerified) {
            account.emailVerified = true;
        }

        await account.save();

        // Send confirmation email (optional)
        // require('../services/emailService').sendPasswordChangeEmail(email, account.name);

        res.json({ message: 'Password reset successfully. You can now login with your new password.' });

    } catch (error) {
        console.error('❌ Reset Password Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
