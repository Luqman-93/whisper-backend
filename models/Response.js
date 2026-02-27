module.exports = (sequelize, DataTypes) => {
    const Response = sequelize.define('Response', {
        content: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        isAiGenerated: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        senderRole: {
            type: DataTypes.ENUM('user', 'expert', 'ai'),
            allowNull: false,
            defaultValue: 'expert'
        },
        userId: { // If the sender is a user
            type: DataTypes.INTEGER,
            allowNull: true
        },
        // AI Moderation
        moderationScore: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        moderationFlags: {
            type: DataTypes.JSON,
            allowNull: true
        },
        isAppropriate: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            allowNull: false
        }
    }, {
        tableName: 'responses',
        timestamps: true
    });

    Response.associate = (models) => {
        Response.belongsTo(models.Question, { foreignKey: 'questionId', as: 'question' });
        Response.belongsTo(models.Expert, { foreignKey: 'expertId', as: 'expert', allowNull: true });
        Response.belongsTo(models.User, { foreignKey: 'userId', as: 'user', allowNull: true });
    };

    return Response;
};
