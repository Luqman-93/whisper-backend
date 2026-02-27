const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const genAIBackup = process.env.GEMINI_API_KEY_BACKUP
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY_BACKUP)
    : null;
const MODELS = [
    "gemini-3-flash-preview",
];

const getModelFromClient = (client, modelName) => client.getGenerativeModel({
    model: modelName,
    safetySettings: [
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" }
    ]
});

const generateWithKeyFallback = async (modelName, prompt) => {
    try {
        const model = getModelFromClient(genAI, modelName);
        const result = await model.generateContent(prompt);
        return result;
    } catch (primaryError) {
        if (genAIBackup) {
            try {
                console.warn(`[AI Service] Primary Key failed for ${modelName}. Switching to Backup Key...`);
                // Check if error is related to quota or overload (optional refinement)
                // For now, retry on any error as requested "if it overloaded"
                const modelBackup = getModelFromClient(genAIBackup, modelName);
                const resultBackup = await modelBackup.generateContent(prompt);
                console.log(`[AI Service] Backup Key success for ${modelName}`);
                return resultBackup;
            } catch (backupError) {
                console.error(`[AI Service] Backup Key also failed for ${modelName}:`, backupError.message);
                throw primaryError; // Throw original error to let model fallback loop handle it
            }
        }
        throw primaryError;
    }
};

/**
 * Analyzes text for hate speech and safety violations.
 * Also attempts to categorize the content.
 * @param {string} text - The user's input text.
 * @returns {Promise<{isSafe: boolean, verificationResult: object, category: string}>}
 */
exports.analyzeContent = async (text) => {
    try {
        // 1. Safety Check - Detect specific violation types per SRS requirements
        const prompt = `You are a content moderation system. Your job is to detect SERIOUS safety violations while allowing normal supportive conversation.

CRITICAL INSTRUCTION:
- Analyze the COMPLETE SENTENCE MEANING and CONTEXT. Do NOT flag based on keywords alone.
- "I need help" or "I am sad" is SAFE.
- "I want to kill myself" is UNSAFE.
- Normal conversation, greetings, questions, and seeking advice are SAFE.

REJECT (set isSafe to false) ONLY if the intent falls into these 7 categories:

1. Self-Harm / Suicide (High Risk)
   - Keywords: kill myself, overdose, hang myself, suicide
   - Context: Explicit intent to harm oneself.
   
2. Violence / Threats
   - Keywords: stab, shoot, bomb, kill, hurt
   - Context: Threatening others or promoting violence.

3. Illegal / Scam / Fraud
   - Keywords: hack account, fake ID, steal money
   - Context: Promoting or asking for illegal acts.

4. Harassment / Abuse / Toxicity
   - Keywords: idiot, hate you, worthless, stupid
   - Context: Direct attacks, insults, or severe bullying.

5. Sexual / Explicit Unsafe Content
   - Keywords: sexual assault, rape, porn request
   - Context: Explicit sexual content or non-consensual behavior.

6. Drugs / Harmful Substances
   - Keywords: cocaine, heroin, drug dealing
   - Context: Buying, selling, or promoting use.

7. Spam Indicators
   - Keywords: click this link, free money, urgent action required
   - Context: Phishing or automated spam.

ACCEPT (set isSafe to true):
- Supportive messages: "keep it up", "you're doing great", "stay strong"
- Legitimate questions seeking help or advice
- Personal concerns asking for guidance
- Respectful conversation, even on difficult topics
- Venting or expressing emotions

Text to analyze: "${text}"

You MUST respond with ONLY valid JSON (no markdown, no explanations, just JSON):
{
  "isSafe": true or false,
  "rejectionType": "SelfHarm" or "Violence" or "Illegal" or "Harassment" or "Sexual" or "Drugs" or "Spam" or null,
  "reason": "Brief explanation",
  "category": "Mental Health" or "Relationship" or "Career" or "General" or "Legal"
}

Remember: Be LENIENT. Only reject CLEAR violations. When in doubt, ACCEPT.`;

        // Generate with stricter settings
        let response;
        let textResult;
        let lastError;

        for (const modelName of MODELS) {
            try {
                // Use helper to support key fallback
                const result = await generateWithKeyFallback(modelName, prompt);
                response = await result.response;
                textResult = response.text();
                break; // Success
            } catch (err) {
                console.warn(`AI Analysis failed with ${modelName}:`, err.message);
                lastError = err;
            }
        }

        if (!textResult) throw lastError || new Error("All AI models failed");

        // Log raw response for debugging
        console.log(`[AI Raw Response]`, textResult);

        // Clean up potential markdown formatting in response (```json ... ```)
        let jsonString = textResult.replace(/```json/gi, '').replace(/```/g, '').trim();

        // Try to extract JSON if it's embedded in other text
        const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonString = jsonMatch[0];
        }

        const analysis = JSON.parse(jsonString);

        // Validate the response structure
        if (typeof analysis.isSafe !== 'boolean') {
            console.error("Invalid AI response: isSafe is not boolean", analysis);
            // Default to safe if validation fails - allow the question through
            return { isSafe: true, reason: "AI response validation failed - content accepted by default", category: "General", rejectionType: null };
        }

        // Ensure rejectionType is set correctly
        if (!analysis.isSafe && !analysis.rejectionType) {
            // If unsafe but no rejectionType, default to general violation
            analysis.rejectionType = "General";
        } else if (analysis.isSafe) {
            analysis.rejectionType = null;
        }

        // Validate rejectionType if unsafe
        const validRejectionTypes = ["HateSpeech", "Harassment", "Violence", "SelfHarm", "General"];
        if (!analysis.isSafe && analysis.rejectionType && !validRejectionTypes.includes(analysis.rejectionType)) {
            analysis.rejectionType = "General";
        }

        // Ensure category is valid and map AI categories to expert categories
        const validCategories = ["General", "Mental Health", "Legal", "Health", "Career", "Relationship", "Finance"];
        if (!validCategories.includes(analysis.category)) {
            analysis.category = "General";
        }

        // Map AI categories to expert categories for better matching
        const categoryMapping = {
            "Mental Health": "Health",  // Map Mental Health to Health expert
            "Health": "Health",
            "Relationship": "Relationship",
            "Career": "Career",
            "Legal": "Legal",
            "General": "General",
            "Finance": "Finance"
        };

        const expertCategory = categoryMapping[analysis.category] || analysis.category;

        // Log the analysis result for debugging
        console.log(`[AI Analysis] Content: "${text.substring(0, 50)}..." | isSafe: ${analysis.isSafe} | RejectionType: ${analysis.rejectionType || 'N/A'} | Category: ${analysis.category} | ExpertCategory: ${expertCategory} | Reason: ${analysis.reason}`);

        // Add expertCategory to response for routing logic
        analysis.expertCategory = expertCategory;

        return analysis;

    } catch (error) {
        console.error("AI Analysis Error:", error);
        // User Request: Do NOT accept if AI error occurs. Reject and show popup.
        return {
            isSafe: false,
            reason: "AI Service Unavailable. Please try again later.",
            category: "General",
            rejectionType: "ServiceError"
        };
    }
};

/**
 * Generates a suggested response or helpful hints for an expert.
 * @param {string} question - The user's question.
 * @returns {Promise<string>} - The suggested answer/tips.
 */
exports.getExpertAssistance = async (question) => {
    try {
        const prompt = `
      You are an assistant to a human expert. 
      Read the following user question and provide a concise 2-3 line answer or suggestion that the expert can use directly.
      Do NOT use bullet points. Keep it short, professional, and helpful.
      
      Question: "${question}"
    `;

        for (const modelName of MODELS) {
            try {
                // Use helper to support key fallback
                const result = await generateWithKeyFallback(modelName, prompt);
                const response = await result.response;
                return response.text();
            } catch (err) {
                console.warn(`AI Expert Assistance failed with ${modelName}:`, err.message);
            }
        }
        throw new Error("All AI models failed");
    } catch (error) {
        console.error("AI Assistance Error:", error);
        return "Unable to generate AI hints at this time.";
    }
};

/**
 * Generates a session summary from chat conversation.
 * @param {Array} messages - Array of {role: string, content: string} messages
 * @param {string} originalQuestion - The original user question
 * @returns {Promise<string>} - The generated summary
 */
exports.generateSessionSummary = async (messages, originalQuestion) => {
    try {
        // Format the conversation
        const conversation = messages.map(msg => {
            const role = msg.role === 'user' ? 'User' : msg.role === 'expert' ? 'Expert' : 'AI';
            return `${role}: ${msg.content}`;
        }).join('\n\n');

        const prompt = `You are helping an expert create a professional session summary.

Original Question: "${originalQuestion}"

Chat Conversation:
${conversation}

Create a brief, professional session summary (3-5 sentences) covering:
1. Main issue discussed
2. Key points and advice provided
3. Outcome or next steps

Keep it concise and professional. Write in third person.`;

        for (const modelName of MODELS) {
            try {
                const result = await generateWithKeyFallback(modelName, prompt);
                const response = await result.response;
                return response.text();
            } catch (err) {
                console.warn(`AI Session Summary failed with ${modelName}:`, err.message);
            }
        }
        throw new Error("All AI models failed");
    } catch (error) {
        console.error("AI Session Summary Error:", error);
        return "Unable to generate session summary at this time.";
    }
};

