const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false,
    }
);

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
db.User = require('./User')(sequelize, Sequelize);
db.Expert = require('./Expert')(sequelize, Sequelize);
db.Admin = require('./Admin')(sequelize, Sequelize);
db.Question = require('./Question')(sequelize, Sequelize);
db.Response = require('./Response')(sequelize, Sequelize);
db.SessionReport = require('./SessionReport')(sequelize, Sequelize);
db.SystemSetting = require('./SystemSetting')(sequelize, Sequelize);

// Run associations
Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

module.exports = db;
