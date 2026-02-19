const { sequelize, Admin } = require('../models');

const seed = async () => {
    try {
        await sequelize.authenticate();
        console.log('DB Connected.');

        const email = process.env.ADMIN_EMAIL;
        const password = process.env.ADMIN_PASSWORD;
        const adminPass = process.env.ADMIN_SECURITY_CODE;

        const existing = await Admin.findOne({ where: { email } });
        if (existing) {
            console.log('Admin already exists.');
            console.log(`Email: ${email}`);
            console.log(`AdminPass: ${existing.adminPass}`);
        } else {
            await Admin.create({ email, password, adminPass });
            console.log('Admin created successfully.');
            console.log(`Email: ${email}`);
        }
        process.exit(0);
    } catch (err) {
        console.error('Error seeding admin:', err);
        process.exit(1);
    }
};

seed();
