import { DatabaseService, databaseService } from "./database.service";

export async function seedSuperAdmin() {
  try {
    const existing = await DatabaseService.findUserByEmail("super123@chatx.com");

    if (existing) {
      console.log("ℹ️ Superadmin already exists:", existing.email);
      console.log("ℹ️ Superadmin password :  super123?");
      return;
    }

    // 1. Find the Super Admin Plan dynamically
    const plans = await DatabaseService.getAllPlans();
    const superAdminPlan = plans.find((p: any) => p.name === "Super Admin Plan");

    if (!superAdminPlan) {
      throw new Error("Super Admin Plan not found. Please ensure plans are inserted first.");
    }

    console.log(`📋 Found Super Admin Plan with ID: ${superAdminPlan.id}`);

    // 2. Create superadmin user with dynamic plan_id
    const user = await DatabaseService.createUser(
      "SuperAAA",                // name
      "super123@chatx.com",     //email
      "XOO",                    //department
      "super123?",              // plain password (will be hashed)
      1,                        // role_id (SUPERADMIN)
      superAdminPlan.id,        // plan_id (dynamically fetched)
      null                      // assigned to
    );

    console.log("✅ Superadmin created:", user);
  } catch (err) {
    console.error("❌ Error seeding superadmin:", err);
  }
}

