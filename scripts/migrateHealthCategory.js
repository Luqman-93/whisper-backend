async function migrateHealthCategory(sequelize) {
  // One-time data + schema migration:
  // 1) Convert legacy category values from Health -> Education
  // 2) Restrict ENUM definitions to General/Education/Career
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query(
      "UPDATE experts SET category = 'Education' WHERE category = 'Health'",
      { transaction }
    );

    await sequelize.query(
      "UPDATE questions SET category = 'Education' WHERE category = 'Health'",
      { transaction }
    );

    await sequelize.query(
      "ALTER TABLE experts MODIFY COLUMN category ENUM('General','Education','Career') NOT NULL",
      { transaction }
    );

    await sequelize.query(
      "ALTER TABLE questions MODIFY COLUMN category ENUM('General','Education','Career') NOT NULL DEFAULT 'General'",
      { transaction }
    );

    await transaction.commit();
    console.log("✅ Category migration complete (Health -> Education).");
  } catch (error) {
    await transaction.rollback();
    console.error("❌ Category migration failed:", error.message);
    throw error;
  }
}

module.exports = { migrateHealthCategory };
