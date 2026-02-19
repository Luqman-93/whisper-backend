const { sequelize, Expert } = require('./models');

const verifyAll = async () => {
    try {
        await sequelize.authenticate();
        await Expert.update({ isVerified: true }, { where: {} });
        console.log('All experts marked as Verified.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifyAll();
