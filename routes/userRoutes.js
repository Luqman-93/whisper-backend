const express = require('express');
const router = express.Router();
const { User, Expert, Admin, Question, Response } = require('../models');
const auth = require('../middleware/auth');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Get User Profile - Works for all user types
router.get('/profile', auth, async (req, res) => {
    try {
        let user;
        let stats = {
            questionsAsked: 0,
            questionsAnswered: 0,
            questionsPending: 0
        };

        // Fetch user based on role
        if (req.user.role === 'expert') {
            user = await Expert.findByPk(req.user.id, {
                attributes: ['id', 'email', 'name', 'category', 'isVerified', 'createdAt']
            });

            // Get expert statistics
            const assignedQuestions = await Question.count({ where: { expertId: user.id } });
            const answeredQuestions = await Question.count({
                where: { expertId: user.id, status: 'Answered' }
            });
            stats = {
                questionsAssigned: assignedQuestions,
                questionsAnswered: answeredQuestions,
                questionsPending: assignedQuestions - answeredQuestions
            };

        } else if (req.user.role === 'admin') {
            user = await Admin.findByPk(req.user.id, {
                attributes: ['id', 'email', 'createdAt']
            });

            // Admin stats
            const totalUsers = await User.count();
            const totalExperts = await Expert.count();
            const totalQuestions = await Question.count();
            stats = {
                totalUsers,
                totalExperts,
                totalQuestions
            };

        } else {
            // Regular user (anonymous)
            user = await User.findByPk(req.user.id, {
                attributes: ['id', 'hashed_id', 'email', 'name', 'createdAt']
            });

            // Check for existing expert application
            const expertApp = await Expert.findOne({
                where: { email: user.email },
                attributes: ['status', 'rejectionReason', 'isVerified']
            });

            // Get user statistics
            stats.questionsAsked = await Question.count({ where: { userId: user.id } });
            stats.questionsAnswered = await Question.count({
                where: { userId: user.id, status: 'Answered' }
            });
            stats.questionsPending = await Question.count({
                where: { userId: user.id, status: 'Pending' }
            });

            // Attach expert status to user object temporarily for response
            if (expertApp) {
                user.setDataValue('expertStatus', expertApp.status);
                user.setDataValue('rejectionReason', expertApp.rejectionReason);
            }
        }

        if (!user) return res.status(404).json({ message: 'User not found' });

        // Explicitly construct user object to ensure extra fields are included
        const userJSON = user.toJSON();

        // Add expert status if found (for regular users)
        if (req.user.role === 'user') {
            const expertApp = await Expert.findOne({
                where: { email: user.email },
                attributes: ['status', 'rejectionReason']
            });

            if (expertApp) {
                userJSON.expertStatus = expertApp.status;
                userJSON.rejectionReason = expertApp.rejectionReason;
            }
        }

        res.json({
            user: {
                ...userJSON,
                role: req.user.role
            },
            stats
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update User Profile (Password Change) - Works for all user types
router.put('/profile', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword, name } = req.body;

        let user;
        let userModel;

        if (req.user.role === 'user') {
            user = await User.findByPk(req.user.id);
            userModel = 'user';
        } else if (req.user.role === 'expert') {
            user = await Expert.findByPk(req.user.id);
            userModel = 'expert';
        } else if (req.user.role === 'admin') {
            user = await Admin.findByPk(req.user.id);
            userModel = 'admin';
        }

        if (!user) return res.status(404).json({ message: 'User not found' });

        // If changing password
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ message: 'Current password required' });
            }

            // For anonymous users, verify using hashed_id
            if (userModel === 'user') {
                const rawString = `${user.email}:${currentPassword}`;
                const hashed_id = crypto.createHash('sha256').update(rawString).digest('hex');

                if (hashed_id !== user.hashed_id) {
                    return res.status(400).json({ message: 'Current password is incorrect' });
                }

                // Generate new hashed_id with new password
                const newRawString = `${user.email}:${newPassword}`;
                user.hashed_id = crypto.createHash('sha256').update(newRawString).digest('hex');

                console.log(`✅ User ${user.id} password updated - new hashed_id generated`);
            } else {
                // For experts and admins, use bcrypt
                const isMatch = await bcrypt.compare(currentPassword, user.password);
                if (!isMatch) {
                    return res.status(400).json({ message: 'Current password is incorrect' });
                }

                // Hash new password
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(newPassword, salt);
            }
        }

        // Update name if provided (experts only)
        if (name && req.user.role === 'expert') {
            user.name = name;
        }

        await user.save();

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get User Statistics
router.get('/stats', auth, async (req, res) => {
    try {
        let stats = {};

        if (req.user.role === 'user') {
            const questionsAsked = await Question.count({ where: { userId: req.user.id } });
            const questionsAnswered = await Question.count({
                where: { userId: req.user.id, status: 'Answered' }
            });
            const questionsPending = await Question.count({
                where: { userId: req.user.id, status: 'Pending' }
            });
            const aiAnswered = await Question.count({
                where: { userId: req.user.id, aiGenerated: true }
            });

            stats = {
                questionsAsked,
                questionsAnswered,
                questionsPending,
                aiAnswered
            };
        } else if (req.user.role === 'expert') {
            const questionsAssigned = await Question.count({ where: { expertId: req.user.id } });
            const questionsAnswered = await Question.count({
                where: { expertId: req.user.id, status: 'Answered' }
            });

            stats = {
                questionsAssigned,
                questionsAnswered,
                questionsPending: questionsAssigned - questionsAnswered
            };
        }

        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete Account (User or Expert)
router.delete('/account', auth, async (req, res) => {
    try {
        // 1. EXPERT DELETION (Soft Delete, Keep Responses, Unassign Pending)
        if (req.user.role === 'expert') {
            const expertId = req.user.id;
            const expert = await Expert.findByPk(expertId);

            if (!expert) return res.status(404).json({ message: 'Expert not found' });

            // Unassign all PENDING questions so they can be reassigned
            await Question.update(
                { expertId: null, status: 'Pending' },
                { where: { expertId: expertId, status: 'Pending' } }
            );

            // Soft Delete the expert
            expert.isDeleted = true;
            expert.deletedAt = new Date();
            // Optional: Anonymize name? No, keep for history.
            await expert.save();

            console.log(`[Expert Delete] Expert ${expertId} account deleted (soft delete). Pending questions unassigned.`);
            return res.json({ message: 'Expert account deleted successfully' });
        }

        // 2. USER DELETION (Hard Delete, Remove All Data)
        if (req.user.role === 'user') {
            const userId = req.user.id;

            // Find user
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Delete all user's questions and responses (cascade)
            await Response.destroy({ where: { userId: userId } });
            await Question.destroy({ where: { userId: userId } });

            // Soft Delete user (as per previous logic) or Hard Delete?
            // Previous logic was Soft Delete for users too. Keeping it consistent.
            user.isDeleted = true;
            user.deletedAt = new Date();
            await user.save();

            console.log(`[User Delete] User account ${userId} deleted successfully`);
            return res.json({ message: 'User account deleted successfully' });
        }

        return res.status(403).json({ message: 'Access denied' });

    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
