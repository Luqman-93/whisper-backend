const express = require('express');
const router = express.Router();
const { User, Expert, Question, SessionReport, Response, SystemSetting } = require('../models');
const { Sequelize } = require('sequelize');
const auth = require('../middleware/auth');
const { Op } = require('sequelize');

// Public Routes (No Auth Required)

// Payment Settings (GET) - Allow unauthenticated access for registration
router.get('/payment-settings', async (req, res) => {
    try {
        const setting = await SystemSetting.findOne({ where: { key: 'admin_payment_details' } });
        res.json({
            paymentDetails: setting ? setting.value : ''
        });
    } catch (error) {
        console.error('Get payment settings error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.use(auth);

// Public/Shared Admin Routes (Authenticated users can access)

// Middleware to ensure Admin
const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    next();
};

// Middleware to ensure Admin (All routes below this require Admin role)
router.use(verifyAdmin);

// Get Dashboard Stats
router.get('/stats', async (req, res) => {
    try {
        const userCount = await User.count();
        const expertCount = await Expert.count();
        const flaggedCount = await Question.count({ where: { isFlagged: true } });

        res.json({ userCount, expertCount, flaggedCount });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Pending Experts
router.get('/experts/pending', async (req, res) => {
    try {
        const experts = await Expert.findAll({
            where: { status: 'pending', isDeleted: false },
            attributes: ['id', 'name', 'email', 'category', 'credentialsPath', 'paymentScreenshot', 'status', 'isVerified', 'isOnline', 'emailVerified', 'createdAt']
        });
        res.json(experts);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Verify Expert
router.post('/experts/verify', async (req, res) => {
    try {
        const { expertId, action, rejectionReason } = req.body; // action: 'approve' or 'reject'
        const expert = await Expert.findByPk(expertId);

        if (!expert) return res.status(404).json({ message: 'Expert not found' });

        if (action === 'approve') {
            // Delete all user data if they were a user before (clean slate)
            if (expert.userId) {
                await Question.destroy({ where: { userId: expert.userId } });
                await Response.destroy({ where: { userId: expert.userId } });
                await User.destroy({ where: { id: expert.userId } }); // Delete the User account itself
            }

            expert.isVerified = true;
            expert.status = 'approved';
            await expert.save();
            res.json({ message: 'Expert approved' });
        } else {
            // Reject with reason (keep record so user can see rejection)
            expert.status = 'rejected';
            expert.rejectionReason = rejectionReason || 'Your application did not meet our requirements';
            expert.isVerified = false;
            await expert.save();
            res.json({ message: 'Expert rejected' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Flagged Content
router.get('/moderation/flagged', async (req, res) => {
    try {
        const questions = await Question.findAll({ where: { isFlagged: true } });
        res.json(questions);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Action on Flagged Content
router.post('/moderation/resolve', async (req, res) => {
    try {
        const { questionId, action } = req.body; // 'allow', 'delete'
        const question = await Question.findByPk(questionId);

        if (!question) return res.status(404).json({ message: 'Question not found' });

        if (action === 'allow') {
            question.isFlagged = false;
            question.status = 'Pending';

            // Assign to expert if not already assigned
            if (!question.expertId) {
                console.log(`[Admin] Attempting to assign expert for question ${question.id}, Category: ${question.category}`);

                let expert = await Expert.findOne({
                    where: { category: question.category, isVerified: true },
                    order: [['createdAt', 'DESC']]
                });

                // Fallback 1: Try General category
                if (!expert) {
                    console.log(`[Admin] No expert in ${question.category}, trying General...`);
                    expert = await Expert.findOne({
                        where: { category: 'General', isVerified: true },
                        order: [['createdAt', 'DESC']]
                    });
                }

                // Fallback 2: Any verified expert
                if (!expert) {
                    console.log(`[Admin] No General expert, trying ANY verified expert...`);
                    expert = await Expert.findOne({
                        where: { isVerified: true },
                        order: [['createdAt', 'DESC']]
                    });
                }

                if (expert) {
                    console.log(`[Admin] Assigning to expert ID: ${expert.id}`);
                    question.expertId = expert.id;
                    // Notify Expert via Socket
                    req.io.emit('new_question', {
                        questionId: question.id,
                        category: question.category,
                        expertId: expert.id
                    });
                } else {
                    console.log(`[Admin] CRITICAL: No verified experts found in system.`);
                }
            }

            await question.save();
            res.json({ message: 'Question allowed and assigned to expert' });
        } else {
            // Soft delete or status Rejected
            question.isFlagged = false; // Important: Clear flag so it doesn't reappear in queue
            question.status = 'Rejected';
            await question.save();
            res.json({ message: 'Question rejected' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ===== NEW ADMIN FEATURES =====

// Get Admin Analytics  
router.get('/analytics', async (req, res) => {
    try {
        // Total counts
        const totalUsers = await User.count();
        const totalExperts = await Expert.count();
        const totalQuestions = await Question.count();

        // Count by status
        const pendingQuestions = await Question.count({ where: { status: 'Pending' } });
        const answeredQuestions = await Question.count({ where: { status: 'Answered' } });

        // Experts by status
        const pendingExperts = await Expert.count({ where: { status: 'pending' } });
        const approvedExperts = await Expert.count({ where: { status: 'approved' } });
        const rejectedExperts = await Expert.count({ where: { status: 'rejected' } });

        // Get growth data for last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Users created per day
        const userGrowth = await User.findAll({
            where: { createdAt: { [Sequelize.Op.gte]: thirtyDaysAgo } },
            attributes: [
                [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ],
            group: [Sequelize.fn('DATE', Sequelize.col('createdAt'))],
            order: [[Sequelize.fn('DATE', Sequelize.col('createdAt')), 'ASC']],
            raw: true
        });

        // Questions per day
        const questionGrowth = await Question.findAll({
            where: { createdAt: { [Sequelize.Op.gte]: thirtyDaysAgo } },
            attributes: [
                [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ],
            group: [Sequelize.fn('DATE', Sequelize.col('createdAt'))],
            order: [[Sequelize.fn('DATE', Sequelize.col('createdAt')), 'ASC']],
            raw: true
        });

        // Category stats
        const categoryStats = await Question.findAll({
            attributes: ['category', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
            group: ['category'],
            raw: true
        });

        res.json({
            stats: { totalUsers, totalExperts, totalQuestions, pendingQuestions, answeredQuestions, pendingExperts, approvedExperts, rejectedExperts },
            growth: { users: userGrowth, questions: questionGrowth },
            categories: categoryStats
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Flagged Accounts (3-strike system)
router.get('/flagged-accounts', async (req, res) => {
    try {
        const flaggedUsers = await User.findAll({
            where: { isFlagged: true, isDeleted: false },
            attributes: ['id', 'email', 'name', 'flagCount', 'flagReasons', 'createdAt']
        });

        const flaggedExperts = await Expert.findAll({
            where: { isFlagged: true, isDeleted: false },
            attributes: ['id', 'email', 'name', 'category', 'flagCount', 'flagReasons', 'createdAt']
        });

        res.json({ flaggedUsers, flaggedExperts, totalFlagged: flaggedUsers.length + flaggedExperts.length });
    } catch (error) {
        console.error('Flagged accounts error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reset Expert/User Violations (Give Second Chance)
router.post('/reset-violations/:accountType/:id', async (req, res) => {
    try {
        const { accountType, id } = req.params;

        if (accountType === 'user') {
            const user = await User.findByPk(id);
            if (!user) return res.status(404).json({ message: 'User not found' });

            user.isFlagged = false;
            user.flagCount = 0;
            user.flagReasons = [];
            await user.save();

            return res.json({ message: 'User violations reset successfully' });
        }

        if (accountType === 'expert') {
            const expert = await Expert.findByPk(id);
            if (!expert) return res.status(404).json({ message: 'Expert not found' });

            expert.isFlagged = false;
            expert.flagCount = 0;
            expert.flagReasons = [];
            await expert.save();

            return res.json({ message: 'Expert violations reset successfully' });
        }

        res.status(400).json({ message: 'Invalid account type' });
    } catch (error) {
        console.error('Reset violations error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete Account (User or Expert)
router.delete('/delete-account/:accountType/:id', async (req, res) => {
    try {
        const { accountType, id } = req.params;

        if (accountType === 'user') {
            const user = await User.findByPk(id);
            if (!user) return res.status(404).json({ message: 'User not found' });

            // Add admin ban flag
            let flagReasons = user.flagReasons;
            // Ensure it's an array and CLONE it to trigger change detection
            if (!Array.isArray(flagReasons)) {
                flagReasons = [];
            } else {
                flagReasons = [...flagReasons];
            }

            flagReasons.push({
                type: 'admin_ban',
                reason: 'Account suspended by administrator',
                timestamp: new Date()
            });

            user.flagReasons = flagReasons;
            // Explicitly tell Sequelize that this field changed (just in case)
            user.changed('flagReasons', true);

            user.flagCount = (user.flagCount || 0) + 1;

            console.log(`[Admin Delete] Tagging user ${id} as admin_ban. New flags:`, JSON.stringify(flagReasons));

            // Soft Delete
            user.isDeleted = true;
            user.deletedAt = new Date();
            await user.save();

            await Question.destroy({ where: { userId: id } });

            return res.json({ message: 'User account deleted/banned successfully' });
        }

        if (accountType === 'expert') {
            const expert = await Expert.findByPk(id);
            if (!expert) return res.status(404).json({ message: 'Expert not found' });

            // Add admin ban flag
            const flagReasons = expert.flagReasons || [];
            flagReasons.push({
                type: 'admin_ban',
                reason: 'Account suspended by administrator',
                timestamp: new Date()
            });
            expert.flagReasons = flagReasons;
            expert.flagCount = (expert.flagCount || 0) + 1;

            // Soft Delete
            expert.isDeleted = true;
            expert.deletedAt = new Date();
            await expert.save();

            // Cleanup associated data
            await Response.destroy({ where: { expertId: id } });
            await Question.update({ expertId: null, status: 'Pending' }, { where: { expertId: id } });

            return res.json({ message: 'Expert account deleted/banned successfully' });
        }

        res.status(400).json({ message: 'Invalid account type' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Expert Verification Documents
router.get('/expert-verification/:id', async (req, res) => {
    try {
        const expert = await Expert.findByPk(req.params.id, {
            attributes: ['id', 'name', 'email', 'category', 'credentialsPath', 'paymentScreenshot', 'status', 'isVerified', 'createdAt']
        });

        if (!expert) return res.status(404).json({ message: 'Expert not found' });

        res.json({ expert, documentUrl: expert.credentialsPath });
    } catch (error) {
        console.error('Expert verification error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});



router.post('/payment-settings', async (req, res) => {
    try {
        const { paymentDetails } = req.body;

        // Upsert
        const [setting, created] = await SystemSetting.findOrCreate({
            where: { key: 'admin_payment_details' },
            defaults: { value: paymentDetails }
        });

        if (!created) {
            setting.value = paymentDetails;
            await setting.save();
        }

        res.json({ message: 'Payment details updated' });
    } catch (error) {
        console.error('Update payment settings error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
