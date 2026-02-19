# Whisper - Anonymous Reporting & Expert Consultation App

A secure, anonymous platform connecting users with verified experts for confidential consultations. Built with React Native (Expo), Express.js, MySQL, and Google Gemini AI.

## 🚀 Features

### Core Features
- **Anonymous Questions**: Users can ask questions anonymously in 3 categories: General, Health, Career.
- **Expert Consultation**: Verified experts provide professional guidance.
- **Real-time Chat**: Socket.io powered instant messaging between users and experts.
- **AI Assistance**: Experts get AI-powered response suggestions via Google Gemini.

### Security & Moderation
- **AI Content Moderation**: Automatic detection of inappropriate content (Hate speech, Harassment, etc.).
- **3-Strike Flagging System**:
  - Accounts are auto-flagged after 3 confirmed violations.
  - Admin can review and ban flagged accounts.
- **Email Verification**: Secure signup with OTP code verification.
- **Privacy & Terms**: Integrated legal compliance with mandatory acceptance.

### Admin Dashboard
- **Analytics**: Visual overview of platform growth, user stats, and categories.
- **Expert Verification**: Review expert applications and credentials.
- **Flagged Management**: Review and delete flagged accounts.
- **Profile Management**: Theme toggling and admin controls.

## 🛠️ Prerequisites

- **Node.js** (v14+)
- **MySQL Server** (v5.7+)
- **npm** or **yarn**
- **Expo Go** (Android/iOS) for physical device testing
- **Google Gemini API Key**
- **Gmail Account** (for SMTP email sending)

## 📦 Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Whisper
```

### 2. Database Setup
1. Start your MySQL server.
2. Create the database:
   ```sql
   CREATE DATABASE whisper_db;
   ```
   *Tables will be auto-created on first server run.*

### 3. Backend Setup
1. Navigate to server:
   ```bash
   cd server
   npm install
   ```

2. Configure Environment:
   Create a `.env` file in the `server` directory:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_USER=root
   DB_PASS=your_password
   DB_NAME=whisper_db
   
   # Security
   JWT_SECRET=your_super_secret_key
   
   # AI Service
   GEMINI_API_KEY=your_google_gemini_key
   
   # Email Service (New!)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_app_specific_password  # Enable 2FA -> App Passwords
   APP_URL=http://your_local_ip:5000
   
   # Admin Setup
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=admin123
   ADMIN_SECURITY_CODE=secret_code
   ```

3. Start Server:
   ```bash
   npm start
   ```

### 4. Frontend Setup
1. Navigate to client:
   ```bash
   cd client
   npm install
   ```

2. Configure API Endpoint:
   Update `client/services/api.js` and `client/services/socket.js`:
   ```javascript
   // Replace with your computer's local IP address
   const IP = '192.168.1.X'; 
   ```

3. Start Expo:
   ```bash
   npx expo start
   ```
   - Press `a` for Android Emulator.
   - Scan QR code with Expo Go for physical device.

## 🛡️ Admin Access

1. **Create First Admin**:
   Run the seed script in the server directory:
   ```bash
   node scripts/seedAdmin.js
   ```

2. **Login**:
   - Open App -> Admin Login
   - Use credentials from `.env`

## 📂 Project Structure

```
Whisper/
├── client/              # React Native Frontend
│   ├── components/      # Reusable UI (Cards, Badges, Buttons)
│   ├── screens/         # App Screens (Admin, Expert, User)
│   ├── services/        # API, Socket, Auth services
│   ├── contexts/        # Theme & Auth Contexts
│   └── navigation/      # App Navigation Setup
│
└── server/              # Express Backend
    ├── models/          # Sequelize Database Models
    ├── routes/          # API Endpoints (Auth, Admin, Questions)
    ├── services/        # AI, Email, Socket Services
    ├── content/         # Legal Documents (Privacy, Terms)
    └── uploads/         # Expert Credentials Storage
```

## 🔐 Migration & Cleanup
This project previously used migration files. The schema is now stable, and migration files have been cleaned up to maintain a tidy codebase. The database syncs automatically via Sequelize.

## 📝 License
[MIT License](LICENSE)

## 🤝 Support
For support, email support@whisperapp.com

## for seedAdmin
add this in pakage.json
"scripts": {
  "seed": "node scripts/seedAdmin.js"
}

and run cmd
npm run seed
or
node scripts/seedAdmin.js


##fro web interface run thus cmd in bash 

npx expo install react-dom react-native-web @expo/webpack-config
