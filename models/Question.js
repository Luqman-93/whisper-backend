module.exports = (sequelize, DataTypes) => {
    const Question = sequelize.define('Question', {
        content: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        category: {
            type: DataTypes.ENUM('General', 'Health', 'Career'),
            allowNull: false,
            defaultValue: 'General'
        },
        attachment: {
            type: DataTypes.STRING,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('Pending', 'In Progress', 'Answered', 'Rejected'),
            defaultValue: 'Pending'
        },
        aiSafetyScore: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        isFlagged: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        rating: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: 1,
                max: 5
            }
        },
        feedback: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'questions',
        timestamps: true
    });

    Question.associate = (models) => {
        Question.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
        Question.belongsTo(models.Expert, { foreignKey: 'expertId', as: 'expert' });
        Question.hasMany(models.Response, { foreignKey: 'questionId', as: 'responses' });
        Question.hasOne(models.SessionReport, { foreignKey: 'questionId', as: 'report' });
    };

    return Question;
};
