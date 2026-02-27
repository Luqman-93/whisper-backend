module.exports = (sequelize, DataTypes) => {
    const SessionReport = sequelize.define('SessionReport', {
        summary: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('Draft', 'Approved'),
            defaultValue: 'Draft'
        },
        qaHistory: {
            type: DataTypes.JSON, // Stores the Q&A thread for record
            allowNull: true
        }
    }, {
        tableName: 'session_reports',
        timestamps: true
    });

    SessionReport.associate = (models) => {
        SessionReport.belongsTo(models.Question, { foreignKey: 'questionId', as: 'question' });
        SessionReport.belongsTo(models.Expert, { foreignKey: 'expertId', as: 'expert' });
    };

    return SessionReport;
};
