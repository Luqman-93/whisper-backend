const express = require('express');
const router = express.Router();
const { Question, Response, SessionReport, User, Expert } = require('../models');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const aiService = require('../services/aiService');

// Submit a new question
router.post('/submit', auth, upload.single('attachment'), async (req, res) => {
    try {
        // Only users can submit
        if (req.user.role !== 'user') return res.status(403).json({ message: 'Only users can post questions' });

        const { content, category } = req.body;
        // Normalize path for URL usage (replace backslashes with slashes)
        const attachment = req.file ? req.file.path.replace(/\\/g, '/') : null;

        // 1. AI Pre-moderation (Safety Check per SRS Activity Diagram)
        const analysis = await aiService.analyzeContent(content);

        // 1.5 Handle Service Error explicitly (User Request: Show popup, don't flag)
        if (analysis.rejectionType === 'ServiceError') {
            return res.status(400).json({
                message: 'AI Service Unavailable',
                rejectionType: 'ServiceError',
                aiAnalysis: analysis
            });
        }

        // 2. Logic Branch: Safe vs Unsafe
        if (!analysis.isSafe) {
            // Unsafe Content: Save as Flagged for Admin Review (FR-13)
            const flaggedQuestion = await Question.create({
                content,
                category: category,
                attachment,
                userId: req.user.id,
                expertId: null, // No expert assigned yet
                aiSafetyScore: 0.0,
                isFlagged: true,
                status: 'Pending' // Pending review
            });

            // Increment user's flag count and mark as flagged if threshold exceeded
            const user = await User.findByPk(req.user.id);
            if (user) {
                user.flagCount = (user.flagCount || 0) + 1;

                // Add reason to flagReasons array
                const flagReasons = user.flagReasons || [];
                flagReasons.push({
                    timestamp: new Date(),
                    reason: analysis.reason || 'Inappropriate content detected',
                    type: analysis.category || 'content_violation',
                    content: content.substring(0, 100)
                });
                user.flagReasons = flagReasons;

                // If 3 strikes, mark as flagged
                if (user.flagCount >= 3) {
                    user.isFlagged = true;
                }

                await user.save();
            }

            return res.status(201).json({
                message: 'Your question has been flagged for moderation review.',
                questionId: flaggedQuestion.id,
                status: 'Flagged',
                aiAnalysis: analysis,
                assignedTo: null,
                flagCount: user?.flagCount || 1,
                warningMessage: user?.flagCount >= 3
                    ? 'Your account has been flagged for review due to multiple violations.'
                    : `Warning ${user?.flagCount || 1}/3: Further violations may result in account suspension.`
            });
        }

        // 3. Safe Content: Proceed with Expert Assignment
        // Use the category provided by the user (no AI categorization)
        console.log(`[Routing] Looking for expert in category: ${category}`);

        // STEP 1: Try to find ONLINE expert first (priority)
        let expert = await Expert.findOne({
            where: { category: category, isVerified: true, isOnline: true },
            order: [['createdAt', 'DESC']]
        });

        // STEP 2: If no ONLINE expert, assign to ANY expert in category (even offline)
        if (!expert) {
            console.log(`[Routing] ⚠️ No ONLINE expert found for category: ${category}`);
            console.log(`[Routing] Looking for offline ${category} expert...`);

            expert = await Expert.findOne({
                where: { category: category, isVerified: true },
                order: [['createdAt', 'DESC']]
            });

            if (expert) {
                console.log(`[Routing] ✅ Assigned to OFFLINE expert: ${expert.name} (ID: ${expert.id}, Status: ${expert.isOnline ? 'Online' : 'Offline'})`);
            } else {
                console.log(`[Routing] ❌ No expert found for category: ${category} (question will stay pending)`);
            }
        } else {
            console.log(`[Routing] ✅ Assigned to ONLINE expert: ${expert.name} (ID: ${expert.id})`);
        }

        // 4. Create question with user-selected category
        const newQuestion = await Question.create({
            content,
            category: category, // Use user-selected category directly
            attachment,
            userId: req.user.id,
            expertId: expert ? expert.id : null,
            aiSafetyScore: 1.0, // Safe content
            isFlagged: false,
            status: expert ? 'Pending' : 'Pending'
        });

        // 5. Logic Branch: Expert vs AI
        if (expert) {
            // EXPERT FOUND: Notify Expert via Socket
            req.io.emit('new_question', {
                questionId: newQuestion.id,
                category: newQuestion.category,
                expertId: expert.id
            });

            res.status(201).json({
                message: 'Question submitted and sent to an expert',
                questionId: newQuestion.id,
                status: 'Pending',
                assignedTo: expert.name
            });

        } else {
            // NO EXPERT FOUND: Leave as Pending
            console.log(`No expert found for category ${newQuestion.category}.Question set to Pending.`);

            res.status(201).json({
                message: 'Question submitted. Waiting for an expert to be available.',
                questionId: newQuestion.id,
                status: 'Pending',
                assignedTo: null
            });
        }



    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});


// Report Content
router.post('/report', auth, async (req, res) => {
    try {
        const { itemId, type, reason } = req.body;
        console.log(`REPORT: User ${req.user.id} reported ${type} ${itemId}: ${reason} `);

        let question;
        if (type === 'question') {
            question = await Question.findByPk(itemId);
        } else if (type === 'response') {
            // If reporting a response, flag the parent question for review
            const response = await Response.findByPk(itemId);
            if (response) {
                question = await Question.findByPk(response.questionId);
            }
        }

        if (!question) {
            return res.status(404).json({ message: 'Content not found' });
        }

        question.isFlagged = true;
        await question.save();

        res.json({ message: 'Report received. Content has been flagged for review.' });
    } catch (error) {
        console.error('Report error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE Individual Message
router.delete('/response/:responseId', auth, async (req, res) => {
    try {
        const { responseId } = req.params;
        const response = await Response.findByPk(responseId);

        if (!response) {
            return res.status(404).json({ message: 'Message not found' });
        }

        // Authorization: Only message sender can delete
        const isOwner = (req.user.role === 'user' && response.userId === req.user.id) ||
            (req.user.role === 'expert' && response.expertId === req.user.id);

        if (!isOwner) {
            return res.status(403).json({ message: 'You can only delete your own messages' });
        }

        // Get questionId before deletion for socket notification
        const questionId = response.questionId;

        // Delete the response
        await response.destroy();

        // Emit socket event for real-time update
        req.io.emit('message_deleted', {
            questionId: questionId,
            responseId: parseInt(responseId)
        });

        res.json({ message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE Entire Conversation/Question
router.delete('/:questionId', auth, async (req, res) => {
    try {
        const { questionId } = req.params;
        const question = await Question.findByPk(questionId);

        if (!question) {
            return res.status(404).json({ message: 'Question not found' });
        }

        // Authorization: Only question owner can delete entire conversation
        if (req.user.role === 'user' && question.userId !== req.user.id) {
            return res.status(403).json({ message: 'You can only delete your own questions' });
        }

        // Delete all associated responses first (cascade)
        await Response.destroy({ where: { questionId: questionId } });

        // Delete the question
        await question.destroy();

        // Emit socket event for real-time update
        req.io.emit('question_deleted', {
            questionId: parseInt(questionId)
        });

        res.json({ message: 'Question and all messages deleted successfully' });
    } catch (error) {
        console.error('Delete question error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get My Questions (User)
router.get('/my-questions', auth, async (req, res) => {
    try {
        if (req.user.role !== 'user') return res.status(403).json({ message: 'Access denied' });

        const questions = await Question.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']],
            include: [
                { model: Expert, as: 'expert', attributes: ['name', 'category'] }, // Don't show expert email
                { model: Response, as: 'responses', attributes: ['id', 'content', 'isAiGenerated', 'createdAt'] }
            ]
        });

        res.json(questions);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Rate an Answer
router.post('/:id/rate', auth, async (req, res) => {
    try {
        const { rating, feedback } = req.body;
        const questionId = req.params.id;

        const question = await Question.findByPk(questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });
        if (question.userId !== req.user.id) return res.status(403).json({ message: 'Not your question' });
        if (question.status !== 'Answered') return res.status(400).json({ message: 'Cannot rate unanswered question' });
        if (question.rating) return res.status(400).json({ message: 'You have already rated this answer' });

        // Check if rating is valid (1-5 stars)
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        // Store rating in question (or create separate Rating table if needed)
        question.rating = rating;
        question.feedback = feedback || null;
        await question.save();

        // Notify Expert/User via Socket
        req.io.emit('rating_updated', {
            questionId,
            rating,
            feedback
        });

        res.json({ message: 'Rating submitted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reply to a Question (Chat)
router.post('/:id/reply', auth, async (req, res) => {
    try {
        const { content } = req.body;
        const questionId = req.params.id;
        const userId = req.user.id;
        const userRole = req.user.role; // 'user' or 'expert'

        const question = await Question.findByPk(questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });

        // Authorization check
        if (userRole === 'user' && question.userId !== userId) {
            return res.status(403).json({ message: 'Not your question' });
        }
        if (userRole === 'expert' && question.expertId !== userId) {
            // Note: In real app, expertId logic might differ if assuming 'userId' in token maps to 'id' in Expert table.
            // Assuming req.user.id is the ID in the specific role table or global user table.
            // If Expert table has different IDs from User table, we need to handle that.
            // For now, assuming req.user.id is correct for comparison.
            // Double check: In auth middleware, we decode token.
            // If Expert login, id is expert.id. If User login, id is user.id.
            if (question.expertId !== userId) return res.status(403).json({ message: 'Not assigned to this question' });
        }

        // Determine sender properties
        const senderRole = userRole;
        const responseUserId = userRole === 'user' ? userId : null;
        const responseExpertId = userRole === 'expert' ? userId : null;

        // AI Moderation for Expert Responses
        let moderationResult = null;
        if (senderRole === 'expert') {
            moderationResult = await aiService.analyzeContent(content);

            // 1.5 Handle Service Error explicitly (Prevent Flagging)
            if (moderationResult.rejectionType === 'ServiceError') {
                return res.status(400).json({
                    message: 'AI Service Unavailable',
                    rejectionType: 'ServiceError',
                    aiAnalysis: moderationResult
                });
            }

            // If inappropriate content detected
            if (!moderationResult.isSafe) {
                // Increment flag count
                const expert = await Expert.findByPk(userId);
                if (expert) {
                    expert.flagCount = (expert.flagCount || 0) + 1;

                    // Add reason to flagReasons array
                    const flagReasons = expert.flagReasons || [];
                    flagReasons.push({
                        timestamp: new Date(),
                        reason: moderationResult.reason,
                        type: moderationResult.rejectionType,
                        content: content.substring(0, 100)
                    });
                    expert.flagReasons = flagReasons;

                    // If 3 strikes, mark as flagged
                    if (expert.flagCount >= 3) {
                        expert.isFlagged = true;
                    }

                    await expert.save();
                }

                // Return error - don't create response
                return res.status(400).json({
                    message: 'Your message was flagged as inappropriate',
                    reason: moderationResult.reason,
                    flagCount: expert?.flagCount || 1,
                    warningMessage: expert?.flagCount >= 3
                        ? 'Your account has been flagged for review due to multiple violations.'
                        : `Warning ${expert?.flagCount || 1}/3: Further violations may result in account suspension.`
                });
            }
        }

        const response = await Response.create({
            content,
            questionId,
            senderRole,
            userId: responseUserId,
            expertId: responseExpertId,
            isAiGenerated: false,
            // Add moderation data
            moderationScore: moderationResult?.isSafe ? 1.0 : 0.0,
            moderationFlags: moderationResult || null,
            isAppropriate: moderationResult?.isSafe !== false
        });

        // Update Question Status if Expert replies
        if (senderRole === 'expert' && question.status === 'Pending') {
            question.status = 'Answered';
            await question.save();
        }

        // Emit socket event for real-time update
        // We can emit to a room specific to this question, or just generic 'new_message'
        req.io.emit('new_message', {
            questionId,
            response,
            status: question.status // Send updated status
        });

        res.status(201).json(response);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Session Report for a Question
router.get('/:id/report', auth, async (req, res) => {
    try {
        const questionId = req.params.id;

        const question = await Question.findByPk(questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });
        // Allow expert assigned to view report too? For now, logic says user matches.
        if (req.user.role === 'user' && question.userId !== req.user.id) return res.status(403).json({ message: 'Not your question' });
        if (req.user.role === 'expert' && question.expertId !== req.user.id) return res.status(403).json({ message: 'Not assigned to this question' });


        const report = await SessionReport.findOne({
            where: { questionId },
            include: [
                { model: Expert, as: 'expert', attributes: ['name', 'category'] }
            ]
        });

        if (!report) return res.status(404).json({ message: 'No report available yet' });

        res.json(report);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Single Question Details (Shared for User & Expert)
router.get('/:id', auth, async (req, res) => {
    try {
        const questionId = req.params.id;
        const question = await Question.findOne({
            where: { id: questionId },
            include: [
                { model: Expert, as: 'expert', attributes: ['name', 'category', 'id'] },
                { model: Response, as: 'responses', attributes: ['id', 'content', 'senderRole', 'userId', 'expertId', 'isAiGenerated', 'createdAt'] }
            ],
            order: [[{ model: Response, as: 'responses' }, 'createdAt', 'ASC']]
        });

        if (!question) return res.status(404).json({ message: 'Question not found' });

        // Authorization: Only Owner or Assigned Expert
        const isOwner = req.user.role === 'user' && question.userId === req.user.id;
        const isAssignedExpert = req.user.role === 'expert' && question.expertId === req.user.id;

        if (!isOwner && !isAssignedExpert) {
            return res.status(403).json({ message: 'Access denied' });
        }

        res.json(question);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
