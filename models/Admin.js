const bcrypt = require('bcrypt');

module.exports = (sequelize, DataTypes) => {
    const Admin = sequelize.define('Admin', {
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: { isEmail: true }
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        adminPass: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Static admin pass for extra security'
        }
    }, {
        tableName: 'admins',
        timestamps: true,
        hooks: {
            beforeCreate: async (admin) => {
                if (admin.password) {
                    admin.password = await bcrypt.hash(admin.password, 10);
                }
            }
        }
    });

    return Admin;
};
