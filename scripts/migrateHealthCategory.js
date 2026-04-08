async function migrateHealthCategory(sequelize) {
  // One-time data + schema migration:
  // 1) Temporarily expand ENUMs to include both Health and Education
  // 2) Convert legacy category values from Health -> Education
  // 3) Restrict ENUM definitions to General/Education/Career
  const transaction = await sequelize.transaction();
  try {
    // Expand first so UPDATE to Education is always valid.
    await sequelize.query(
      "ALTER TABLE experts MODIFY COLUMN category ENUM('General','Health','Education','Career') NOT NULL",
      { transaction }
    );

    await sequelize.query(
      "ALTER TABLE questions MODIFY COLUMN category ENUM('General','Health','Education','Career') NOT NULL DEFAULT 'General'",
      { transaction }
    );

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
