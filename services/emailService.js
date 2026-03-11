const nodemailer = require('nodemailer');
const crypto = require('crypto');
const dotenv = require('dotenv');
const dns = require('dns');

dotenv.config();

// Enforce IPv4 DNS resolution for better compatibility on hosts like Railway
dns.setDefaultResultOrder('ipv4first');

// Normalize and validate email-related environment variables (SMTP only)
const getEmailEnvConfig = () => {
    const user = process.env.EMAIL_USER || process.env.SMTP_USER;
    const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT) || 587;

    if (!user || !pass) {
        console.error('❌ Email configuration error: EMAIL_USER/EMAIL_PASS (or SMTP_USER/SMTP_PASS) are not set.');
        return null;
    }

    return { user, pass, host, port };
};

// Lazily created Nodemailer transporter using Gmail SMTP (or configured host)
let transporter = null;

const getTransporter = () => {
    if (transporter) {
        return transporter;
    }

    const cfg = getEmailEnvConfig();
    if (!cfg) {
        return null;
    }

    const { user, pass, host, port } = cfg;

    try {
        transporter = nodemailer.createTransport({
            host: host || 'smtp.gmail.com',
            port: port || 587,
            secure: false,
            family: 4,
            connectionTimeout: 20000,
            greetingTimeout: 20000,
            socketTimeout: 20000,
            auth: {
                user,
                pass
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        console.log('✅ Email transporter initialized with host:', host, 'port:', port);
        return transporter;
    } catch (error) {
        console.error('❌ Failed to create email transporter');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        return null;
    }
};

// Central helper to send emails with consistent logging and error handling (SMTP only)
const sendEmail = async (mailOptions, context = 'generic') => {
    const tx = getTransporter();
    if (!tx) {
        console.error(`❌ [${context}] [SMTP] Email sending skipped because SMTP transporter is not configured.`);
        return { success: false, error: 'SMTP transporter not configured' };
    }

    console.log(`📧 [${context}] [SMTP] Attempting to send email to:`, mailOptions.to);

    try {
        const info = await tx.sendMail(mailOptions);
        if (info && info.response) {
            console.log(`✅ [${context}] [SMTP] Email sent successfully to ${mailOptions.to}`);
            console.log(`SMTP Response: ${info.response}`);
        } else {
            console.log(`✅ [${context}] [SMTP] Email sent successfully to ${mailOptions.to}`);
        }
        return { success: true, messageId: info && info.messageId, response: info && info.response };
    } catch (error) {
        console.error(`❌ [${context}] [SMTP] Email sending failed`);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        if (error.response) {
            console.error('SMTP Response:', error.response);
        }
        if (error.command) {
            console.error('SMTP Command:', error.command);
        }
        console.error('Error stack:', error.stack);
        return { success: false, error: error.message, code: error.code };
    }
};

// Generate verification token
const generateVerificationToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Generate 4-digit OTP
const generateOTP = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
};

// Send verification email
const sendVerificationEmail = async (email, name, token, userType = 'user') => {
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:5000'}/api/auth/verify-email/${token}`;

    const fromAddress = process.env.SMTP_USER || process.env.EMAIL_USER || 'no-reply@whisper.app';

    const mailOptions = {
        from: `"Whisper App" <${fromAddress}>`,
        to: email,
        subject: 'Verify Your Email - Whisper',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white !important; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to Whisper!</h1>
                    </div>
                    <div class="content">
                        <p>Hi ${name || 'there'},</p>
                        <p>Thank you for ${userType === 'expert' ? 'joining as an expert' : 'signing up'} with Whisper!</p>
                        <p>Please verify your email address to complete your registration:</p>
                        <div style="text-align: center;">
                            <a href="${verificationUrl}" class="button">Verify Email Address</a>
                        </div>
                        <p>Or copy and paste this link into your browser:</p>
                        <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
                        <p><strong>This link will expire in 24 hours.</strong></p>
                        <p>If you didn't create an account with Whisper, you can safely ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2026 Whisper. All rights reserved.</p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    return sendEmail(mailOptions, 'verification-email');
};

// Send OTP verification email
const sendOTPEmail = async (email, name, otpCode) => {
    const fromAddress = process.env.SMTP_USER || process.env.EMAIL_USER || 'no-reply@whisper.app';

    const mailOptions = {
        from: `"Whisper App" <${fromAddress}>`,
        to: email,
        subject: 'Your Verification Code - Whisper',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .otp-box { background: white; border: 2px solid #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
                    .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #667eea; font-family: monospace; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 Email Verification</h1>
                    </div>
                    <div class="content">
                        <p>Hi ${name || 'there'},</p>
                        <p>Thank you for signing up with Whisper! Please use the following code to verify your email address:</p>
                        <div class="otp-box">
                            <div class="otp-code">${otpCode}</div>
                        </div>
                        <p><strong>This code will expire in 10 minutes.</strong></p>
                        <div class="warning">
                            <p><strong>⚠️ Security Notice:</strong></p>
                            <p>Never share this code with anyone. Whisper will never ask you for this code via phone or email.</p>
                        </div>
                        <p>If you didn't create an account with Whisper, you can safely ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2026 Whisper. All rights reserved.</p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    console.log('🔐 [otp-email] Preparing OTP email for:', email);

    return sendEmail(mailOptions, 'otp-email');
};

// Send password change confirmation email
const sendPasswordChangeEmail = async (email, name) => {
    const fromAddress = process.env.SMTP_USER || process.env.EMAIL_USER || 'no-reply@whisper.app';

    const mailOptions = {
        from: `"Whisper App" <${fromAddress}>`,
        to: email,
        subject: 'Password Changed - Whisper',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔒 Password Changed</h1>
                    </div>
                    <div class="content">
                        <p>Hi ${name || 'there'},</p>
                        <p>Your Whisper account password was recently changed.</p>
                        <div class="alert">
                            <p><strong>⚠️ If you did NOT make this change:</strong></p>
                            <p>Please contact our support team immediately at <a href="mailto:support@whisperapp.com">support@whisperapp.com</a></p>
                        </div>
                        <p>If you made this change, you can safely ignore this email.</p>
                        <p>Time: ${new Date().toLocaleString()}</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    return sendEmail(mailOptions, 'password-change-email');
};

// Send expert approval email
const sendExpertApprovalEmail = async (email, name) => {
    const fromAddress = process.env.SMTP_USER || process.env.EMAIL_USER || 'no-reply@whisper.app';

    const mailOptions = {
        from: `"Whisper App" <${fromAddress}>`,
        to: email,
        subject: '🎉 Expert Account Approved - Whisper',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 Congratulations!</h1>
                    </div>
                    <div class="content">
                        <p>Hi ${name},</p>
                        <p><strong>Your expert application has been approved!</strong></p>
                        <p>You can now log in and start helping users with their questions.</p>
                        <p>Thank you for joining the Whisper expert community!</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    return sendEmail(mailOptions, 'expert-approval-email');
};

module.exports = {
    generateVerificationToken,
    generateOTP,
    sendVerificationEmail,
    sendOTPEmail,
    sendPasswordChangeEmail,
    sendExpertApprovalEmail
};
