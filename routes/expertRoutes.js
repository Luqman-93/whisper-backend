const express = require('express');
const router = express.Router();
const { Question, Response, SessionReport, User, Expert } = require('../models');
const auth = require('../middleware/auth');
const aiService = require('../services/aiService');

// Get Assigned Questions
router.get('/assigned', auth, async (req, res) => {
    try {
        if (req.user.role !== 'expert') return res.status(403).json({ message: 'Access denied' });

        const questions = await Question.findAll({
            where: { expertId: req.user.id },
            include: [
                { model: SessionReport, as: 'report' },
                { model: Response, as: 'responses' }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.json(questions);
    } catch (error) {
        console.error('❌ /expert/assigned error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Submit Answer
router.post('/respond', auth, async (req, res) => {
    try {
        if (req.user.role !== 'expert') return res.status(403).json({ message: 'Access denied' });

        const { questionId, content } = req.body;

        const question = await Question.findByPk(questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });
        if (question.expertId !== req.user.id) return res.status(403).json({ message: 'Not assigned to this question' });

        // AI Moderation Check
        const moderationResult = await aiService.analyzeContent(content);
        if (!moderationResult.isSafe) {
            const expert = await Expert.findByPk(req.user.id);
            if (expert) {
                expert.flagCount = (expert.flagCount || 0) + 1;
                const flagReasons = expert.flagReasons || [];
                flagReasons.push({
                    timestamp: new Date(),
                    reason: moderationResult.reason,
                    type: moderationResult.rejectionType,
                    content: content.substring(0, 100)
                });
                expert.flagReasons = flagReasons;
                if (expert.flagCount >= 3) expert.isFlagged = true;
                await expert.save();

                return res.status(400).json({
                    message: 'Your message was flagged as inappropriate',
                    reason: moderationResult.reason,
                    flagCount: expert.flagCount,
                    warningMessage: expert.flagCount >= 3
                        ? 'Your account has been flagged for review due to multiple violations.'
                        : `Warning ${expert.flagCount}/3: Further violations may result in account suspension.`
                });
            }
        }

        const response = await Response.create({
            content,
            isAiGenerated: false,
            questionId,
            expertId: req.user.id,
            senderRole: 'expert' // Explicitly set role for chat UI
        });

        // Update status to Answered if it was Pending
        if (question.status === 'Pending') {
            question.status = 'Answered';
            await question.save();
        }

        // Notify User via Socket (Standard Event)
        req.io.emit('new_message', {
            questionId,
            response
        });

        // Keep legacy event if needed, or remove. 
        // req.io.emit('answer_posted', ...);

        res.json({ message: 'Response submitted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Generate Session Report
router.post('/create-report', auth, async (req, res) => {
    try {
        if (req.user.role !== 'expert') return res.status(403).json({ message: 'Access denied' });

        const { questionId, summary } = req.body;

        const question = await Question.findByPk(questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });
        if (question.expertId !== req.user.id) return res.status(403).json({ message: 'Not assigned' });

        // Fetch Q&A history for the report context
        const responses = await Response.findAll({ where: { questionId } });
        const history = responses.map(r => ({
            author: r.expertId ? 'Expert' : 'AI', // simplified, could be User if we had User replies
            content: r.content,
            date: r.createdAt
        }));
        // Add original question
        history.unshift({ author: 'User', content: question.content, date: question.createdAt });

        const report = await SessionReport.create({
            questionId,
            expertId: req.user.id,
            summary,
            status: 'Approved', // expert auto-approves their own report? Workflow says "Expert reviews & approves".
            qaHistory: history
        });

        res.json({ message: 'Session Report created and sent to user', report });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// AI Assist - Get AI-generated answer suggestion
router.post('/ai-assist', auth, async (req, res) => {
    try {
        if (req.user.role !== 'expert') return res.status(403).json({ message: 'Access denied' });

        const { questionId } = req.body;

        const question = await Question.findByPk(questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });
        if (question.expertId !== req.user.id) return res.status(403).json({ message: 'Not assigned to this question' });

        // Get AI suggestion using aiService
        const aiService = require('../services/aiService');
        const suggestion = await aiService.getExpertAssistance(question.content);

        res.json({
            suggestion,
            disclaimer: 'This is an AI-generated suggestion. Please review and modify as needed based on your expertise.'
        });
    } catch (error) {
        console.error('AI Assist Error:', error);
        res.status(500).json({ message: 'Failed to generate AI suggestion' });
    }
});

// AI Summary - Generate session summary from conversation
router.post('/generate-summary', auth, async (req, res) => {
    try {
        if (req.user.role !== 'expert') return res.status(403).json({ message: 'Access denied' });

        const { questionId } = req.body;

        const question = await Question.findByPk(questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });
        if (question.expertId !== req.user.id) return res.status(403).json({ message: 'Not assigned to this question' });

        // Get all responses/messages for this question
        const responses = await Response.findAll({
            where: { questionId },
            order: [['createdAt', 'ASC']]
        });

        // Format messages for AI
        const messages = responses.map(r => ({
            role: r.senderRole || (r.expertId ? 'expert' : r.isAiGenerated ? 'ai' : 'user'),
            content: r.content
        }));

        // Generate summary using AI
        const summary = await aiService.generateSessionSummary(messages, question.content);

        res.json({
            summary,
            disclaimer: 'This is an AI-generated summary. Please review and edit as needed before sending.'
        });
    } catch (error) {
        console.error('AI Summary Error:', error);
        res.status(500).json({ message: 'Failed to generate summary' });
    }
});


// Get Expert Analytics
router.get('/analytics', auth, async (req, res) => {
    try {
        if (req.user.role !== 'expert') return res.status(403).json({ message: 'Access denied' });

        const expertId = req.user.id;

        // Get total questions assigned and answered
        const totalAssigned = await Question.count({ where: { expertId } });
        const totalAnswered = await Question.count({
            where: { expertId, status: 'Answered' }
        });
        const pending = totalAssigned - totalAnswered;

        // Get all answered questions with ratings
        const answeredQuestions = await Question.findAll({
            where: { expertId, status: 'Answered' },
            attributes: ['id', 'rating', 'createdAt', 'updatedAt', 'category']
        });

        // Calculate average rating (only from rated questions)
        const ratedQuestions = answeredQuestions.filter(q => q.rating);
        const avgRating = ratedQuestions.length > 0
            ? (ratedQuestions.reduce((sum, q) => sum + q.rating, 0) / ratedQuestions.length).toFixed(2)
            : 0;

        // Calculate average response time
        let avgResponseTime = 0;
        if (answeredQuestions.length > 0) {
            const responseTimes = answeredQuestions.map(q => {
                const diff = new Date(q.updatedAt) - new Date(q.createdAt);
                return diff / (1000 * 60 * 60); // Convert to hours
            });
            avgResponseTime = (responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length).toFixed(1);
        }

        // Get category breakdown
        const categoryStats = {};
        answeredQuestions.forEach(q => {
            categoryStats[q.category] = (categoryStats[q.category] || 0) + 1;
        });

        // Get recent activity (last 5 answered questions)
        const recentActivity = await Question.findAll({
            where: { expertId, status: 'Answered' },
            order: [['updatedAt', 'DESC']],
            limit: 5,
            attributes: ['id', 'category', 'rating', 'updatedAt']
        });

        res.json({
            totalAssigned,
            totalAnswered,
            pending,
            avgRating: parseFloat(avgRating),
            totalRatings: ratedQuestions.length,
            avgResponseTime: parseFloat(avgResponseTime),
            categoryStats,
            recentActivity
        });
    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Toggle Expert Online Status
router.put('/status', auth, async (req, res) => {
    try {
        if (req.user.role !== 'expert') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { isOnline } = req.body;

        if (typeof isOnline !== 'boolean') {
            return res.status(400).json({ message: 'isOnline must be a boolean' });
        }

        const { Expert } = require('../models');
        await Expert.update(
            { isOnline: isOnline },
            { where: { id: req.user.id } }
        );

        // Emit socket event for real-time admin dashboard updates
        req.io.emit('expert_status_changed', {
            expertId: req.user.id,
            isOnline: isOnline
        });

        console.log(`[Expert Status] Expert ${req.user.id} is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
        res.json({ message: 'Status updated successfully', isOnline });
    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;


