const express = require('express');
const router = express.Router();
const privacyPolicy = require('../content/privacyPolicy');
const termsConditions = require('../content/termsConditions');

// Get Privacy Policy
router.get('/privacy-policy', (req, res) => {
    try {
        res.json({
            title: privacyPolicy.title,
            lastUpdated: privacyPolicy.lastUpdated,
            content: privacyPolicy.content
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load privacy policy' });
    }
});

// Get Terms & Conditions
router.get('/terms-conditions', (req, res) => {
    try {
        res.json({
            title: termsConditions.title,
            lastUpdated: termsConditions.lastUpdated,
            content: termsConditions.content
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load terms and conditions' });
    }
});

module.exports = router;
