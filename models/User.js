module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        hashed_id: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            comment: 'Hashed identifier for anonymous users'
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: true
        },
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
        tableName: 'users',
        timestamps: true
    });

    User.associate = (models) => {
        User.hasMany(models.Question, { foreignKey: 'userId', as: 'questions' });
    };

    return User;
};
