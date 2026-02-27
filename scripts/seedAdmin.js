const bcrypt = require('bcrypt');
const { Admin } = require('../models');

async function seedAdmin() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const adminPass = process.env.ADMIN_SECURITY_CODE;

    if (!email || !password || !adminPass) {
        console.warn('[seedAdmin] Missing ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_SECURITY_CODE. Skipping admin seed.');
        return { skipped: true, reason: 'missing_env' };
    }

    // "email OR role" requirement:
    // - email: if matching email exists, skip
    // - role: this project models "admin role" via the Admin table itself; if any admin exists, skip
    const existingByEmail = await Admin.findOne({ where: { email } });
    if (existingByEmail) {
        console.log('[seedAdmin] Admin already exists (matched by email). Skipping.');
        return { skipped: true, reason: 'exists_email' };
    }

    const existingAnyAdmin = await Admin.findOne();
    if (existingAnyAdmin) {
        console.log('[seedAdmin] Admin already exists (admin table not empty). Skipping.');
        return { skipped: true, reason: 'exists_any' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await Admin.create(
        { email, password: hashedPassword, adminPass },
        // Admin model has a beforeCreate hook that hashes passwords; disable it here to avoid double-hashing.
        { hooks: false }
    );

    console.log('[seedAdmin] Admin created successfully.');
    return { created: true };
}

module.exports = { seedAdmin };

// Allow running as a one-off script: `npm run seed`
if (require.main === module) {
    seedAdmin()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('[seedAdmin] Error seeding admin:', err);
            process.exit(1);
        });
}
