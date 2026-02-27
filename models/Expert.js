const bcrypt = require('bcrypt');

module.exports = (sequelize, DataTypes) => {
    const Expert = sequelize.define('Expert', {
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
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        category: {
            type: DataTypes.ENUM('General', 'Health', 'Career'),
            allowNull: false
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        isVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        status: {
            type: DataTypes.ENUM('pending', 'approved', 'rejected'),
            defaultValue: 'pending',
            allowNull: false
        },
        rejectionReason: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        credentialsPath: {
            type: DataTypes.STRING,
            allowNull: true
        },
        isOnline: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            allowNull: false
        },
        // Email Verification
        emailVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
        },
        verificationToken: {
            type: DataTypes.STRING,
            allowNull: true
        },
        verificationTokenExpiry: {
            type: DataTypes.DATE,
            allowNull: true
        },
        otpCode: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: '4-digit OTP code for email verification'
        },
        otpExpiry: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'OTP expiration timestamp'
        },
        // Payment & Subscription
        subscriptionType: {
            type: DataTypes.ENUM('monthly', 'yearly'),
            allowNull: true
        },
        subscriptionAmount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true
        },
        paymentScreenshot: {
            type: DataTypes.STRING,
            allowNull: true
        },
        subscriptionStartDate: {
            type: DataTypes.DATE,
            allowNull: true
        },
        subscriptionEndDate: {
            type: DataTypes.DATE,
            allowNull: true
        },
        subscriptionActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
        },
        // Flagging System
        flagCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false
        },
        flagReasons: {
            type: DataTypes.JSON,
            allowNull: true
        },
        isFlagged: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
        },
        isDeleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        tableName: 'experts',
        timestamps: true,
        hooks: {
            beforeCreate: async (expert) => {
                if (expert.password) {
                    expert.password = await bcrypt.hash(expert.password, 10);
                }
            }
        }
    });

    Expert.associate = (models) => {
        Expert.hasMany(models.Question, { foreignKey: 'expertId', as: 'assignedQuestions' });
        Expert.hasMany(models.Response, { foreignKey: 'expertId', as: 'responses' });
        Expert.hasMany(models.SessionReport, { foreignKey: 'expertId', as: 'reports' });
    };

    return Expert;
};
