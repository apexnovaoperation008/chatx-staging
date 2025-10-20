import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { config } from "../config/env";
import { UserMigrateError } from "telegram/errors";

export const pool = new Pool(
  config.PG_URL 
    ? { 
        connectionString: config.PG_URL,
        ssl: {
            rejectUnauthorized: false
        },
        options: `-c search_path=${config.PG_SCHEMA}`,
        max: 20,
        idleTimeoutMillis: 30000,
      }
    : {
        user: config.PG_USER,
        host: config.PG_HOST,
        database: config.PG_DB,
        password: config.PG_PASSWORD,
        port: Number(config.PG_PORT),
        options: `-c search_path=${config.PG_SCHEMA}`,
        max: 20,
        idleTimeoutMillis: 30000, 
      }
);

// ===== Interfaces =====
export interface Role {
  id: number;
  name: string;
  description?: string;
  created_at: Date;
  label?: string;
  created_by?: number;
  is_system_role?: boolean; 
}

export interface Plan {
  id: number;
  name: string;
  description?: string;
  max_workspace: number;
  max_account: number;
  price: number;
  billing_cycle: string;
  is_active: boolean;
  created_at: Date;
}

export interface User {
  id: number;
  name: string;
  email: string;
  password: string; // hash
  role_id: number;
  plan_name: string;
  plan_id?: number | null;
  merchant?: string | null; // NEW FIELD
  department?:string | null,
  is_active: boolean;
  created_at: Date;
  assigned_to: number | null;
}

export interface Manager {
  id: number;
  name: string;
  email: string;
  password: string; // hash
  role_id: number;
  plan_id?: number | null;
  merchant?: string | null; // NEW FIELD
  is_active: boolean;
  created_at: Date;
}

export interface Workspace {
  id: number;
  name: string;
  description?: string;
  user_id: number; // Manager
  is_active: boolean;
  created_at: Date;
}

export interface Brand {
  id: number;
  name: string;
  workspaceId: string;
  is_active: boolean;
  created_at: Date;
}


export interface WorkspaceMember {
  id: number;
  user_id: number;
  workspace_id: number;
  is_active: boolean;
  created_at: Date;
}

export interface Permission {
  id: number;
  name: string;
  code: string;
  category_id: number;
  category_name?: string;
  description?: string;
  category?: string; 
}

// ===== Database Service =====
export class DatabaseService {

  async ping(): Promise<boolean> {
    const start = Date.now();
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");  // minimal query
      return true;
    } catch (err) {
      throw err;
    } finally {
      client.release();  // <-- important
      const duration = Date.now() - start;
      console.log(`DB ping took ${duration}ms`);
    }
  }

  static async createAccount(
    platform: "whatsapp" | "telegram",
    account_id: string | number,  // allow both
    name:string,
    description:string,
    workspace_id?: number | null,
    brand_id?: number | null,
    status: string = "connected",
    is_active: boolean = true,
    created_by?:number
  ) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO accounts (platform, account_id, name, description, workspace_id, brand_id, status, is_active, created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
         RETURNING id, platform, account_id, name, description, workspace_id, brand_id, status, is_active, created_at, last_connected, created_by`,
        [platform, account_id, name, description, workspace_id, brand_id, status, is_active, created_by]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }  
  
  static async createUser(
    name: string,
    email: string,
    department: string,
    password: string,
    role_id: number,
    plan_id: number | null,
    assigned_to: number | null,
  ) {
    const hashedPassword = await bcrypt.hash(password, 10);
    //const isActive = true 
    const client = await pool.connect();
    try{
      const result = await client.query(
        `INSERT INTO users (name, email, department, password, role_id, plan_id, assigned_to)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, email, department, role_id, plan_id, created_at, assigned_to`,
        [name, email, department, hashedPassword, role_id, plan_id, assigned_to]
      );

      return result.rows[0];
    }
    finally {
      client.release(); // ✅ important
    }
  }

  static async findUserByEmail(email: string) {
    const query = `SELECT * FROM users WHERE email = $1 LIMIT 1`;
    const client = await pool.connect();
    try {
    const result = await client.query(query, [email]);
    return result.rows[0] || null;
    }finally{
      client.release()
    }
  }

  async getUserByEmail(email: string): Promise<(User & { role_name: string }) | null> {
    const client = await pool.connect();
    try{
      const result = await client.query(
        `SELECT u.*, r.name as role_name 
        FROM users u 
        JOIN roles r ON u.role_id = r.id 
        WHERE u.email = $1`,
        [email]
      );
      return result.rows[0] ?? null;
    }finally {
      client.release(); // ✅ important
    }
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  // ----- Roles & Permissions -----
  async getAllRoles(): Promise<Role[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<Role>(
        `SELECT 
            r.id,
            r.name,
            r.label,
            r.description,
            r.is_active,
            r.created_by,
            r.is_system_role,
            COUNT(DISTINCT u.id)::int AS "userCount",
            COALESCE(
              array_agg(DISTINCT p.code) FILTER (WHERE p.id IS NOT NULL),
              ARRAY[]::text[]
            ) AS permissions
        FROM chatx.roles r
        LEFT JOIN chatx.users u ON u.role_id = r.id
        LEFT JOIN chatx.role_permissions rp ON rp.role_id = r.id
        LEFT JOIN chatx.permissions p ON rp.permission_id = p.id
        WHERE r.is_active = TRUE
        GROUP BY r.id
        ORDER BY r.id;
        `
      );
      return result.rows;
    }finally {
      client.release(); // ✅ important
    }    
  }

   // NEW: Get roles that user can edit
   static async getEditableRoles(userId: number, userRoleID: number) {
    const query = `
      SELECT 
        r.*, 
        u.name as creator_name,
        CASE
          WHEN $2 = 1 THEN TRUE
          WHEN $2 = 2 AND r.created_by = $1 THEN TRUE
          ELSE FALSE
        END AS can_edit
      FROM roles r
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.is_active = TRUE
      ORDER BY r.created_at DESC
    `;
    const result = await pool.query(query, [userId, userRoleID]);
    return result.rows;
  }
  

  // NEW: Check if user can edit a role
  static async canUserEditRole(userId: number, roleId: number): Promise<boolean> {
    const query = `
      SELECT 
        CASE
          WHEN u.role_id = 1 THEN TRUE
          WHEN u.role_id = 2 AND r.created_by = u.id THEN TRUE
          ELSE FALSE
        END AS can_edit
      FROM users u
      JOIN roles r ON r.id = $2
      WHERE u.id = $1
    `;
    const result = await pool.query(query, [userId, roleId]);
    return result.rows[0]?.can_edit || false;
  }

  static async getRoleById(id: number) {
    const result = await pool.query(
      `SELECT id, name, created_by FROM roles WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async getAllUsers(): Promise<User[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<User>("SELECT * FROM users WHERE is_active = TRUE");
      return result.rows;
    }
    finally {
      client.release(); // ✅ important
    }
  }

  async getAllManagers(): Promise<Manager[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<Manager>(
        `SELECT 
            u.id,u.name,u.role_id, u.is_active, u.assigned_to,
            p.max_workspace,
            p.max_account,
            p.name AS plan_name,
            COALESCE(COUNT(w.id), 0) AS workspace_count
        FROM chatx.users u
        JOIN chatx.roles r ON u.role_id = r.id
        JOIN chatx.plans p ON u.plan_id = p.id
        LEFT JOIN chatx.workspaces w ON w.manager_id = u.id
        WHERE r.name = 'MANAGER'
        GROUP BY u.id, p.id;`
      );
      return result.rows;
    }
    finally {
      client.release(); // ✅ important
    }
  }  

  async getAllUsersWithPermissions(): Promise<any[]> {
    const client = await pool.connect();
    try{
      // SQL query to get user details along with their permissions
      const result = await client.query(
        `SELECT
              u.id AS user_id,
              u.name AS user_name,
              u.email AS user_email,
              u.department AS user_department,
              u.is_active AS user_active,
              u.assigned_to AS assigned_to,
              r.id AS role_id,
              r.name AS role_name,
              r.label,
              u.plan_id,
              pl.name AS plan_name,
              array_agg(p.code) AS permissions
          FROM chatx.users u
          JOIN chatx.roles r ON u.role_id = r.id
          LEFT JOIN chatx.role_permissions rp ON rp.role_id = r.id
          LEFT JOIN chatx.permissions p ON rp.permission_id = p.id
          LEFT JOIN chatx.plans pl ON u.plan_id = pl.id
          GROUP BY u.id, r.id, pl.id
          ORDER BY u.id;`
      );
  
      // Map the result to return in the desired format
      return result.rows.map((user) => ({
        id: user.user_id,
        email: user.user_email,
        name: user.user_name,
        role_name: user.role_name, // Correctly assigning role_name
        role_id: user.role_id,
        plan_id: user.plan_id,
        plan_name: user.plan_name,
        department: user.user_department,
        permissions: user.permissions || [], // If no permissions, return an empty array
        is_active:user.user_active,
        assigned_to:user.assigned_to ||  null ,
        label:user.label,
      }));
    } catch (err) {
      console.error("Error fetching users with permissions:", err);
      throw new Error("Failed to fetch users with permissions.");
    }finally {
      client.release(); // ✅ important
    }
  }

  async getAllPermission(): Promise<Permission[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<Permission>(
        `SELECT 
          p.id,
          p.name,
          p.code,
          p.description,
          pc.id AS category_id,
          pc.name AS category_name
        FROM permissions p
        LEFT JOIN permission_categories pc ON p.category_id = pc.id
        ORDER BY pc.id, p.id
        `
      );
      return result.rows;
    }
    finally {
      client.release(); // ✅ important
    }
  }

  async assignPermissionToRole(role_id: number, permission_id: number): Promise<void> {
    const client = await pool.connect();
    try{
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING`,
        [role_id, permission_id]
      );
    }
    finally {
      client.release(); // ✅ important
    }
  }

  async getPermissionsByRole(role_id: number): Promise<Permission[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<Permission>(
        `SELECT 
          p.id, 
          p.name, 
          p.code,
          p.description,
          pc.name AS category
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        LEFT JOIN permission_categories pc ON p.category_id = pc.id
        WHERE rp.role_id = $1`,
        [role_id]
      );
      return result.rows;
    }
    finally {
      client.release(); // ✅ important
    }
  }
  
  async getPermissionsByRoleID(role_id: number): Promise<{ permissions: string[] }[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<{ permissions: string[] }>(
        `SELECT COALESCE(array_agg(p.code), '{}') AS permissions
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = $1`,
        [role_id]
      );
      return result.rows;
    }
    finally {
      client.release(); // ✅ important
    }
  }

  static async getRolesByNames(roleNames: string[]) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, name FROM roles WHERE name = ANY($1)`,
        [roleNames]
      );
      return result.rows; // e.g. [{id: 2, name: 'MANAGER'}, {id: 3, name: 'SUPERVISOR'}]
    } finally {
      client.release();
    }
  }

  // databaseService.ts
async createRole({
  name,
  description,
  label,
  created_by,
  is_system_role,
  permissionCodes = [],
}: {
  name: string;
  description?: string;
  label?: string;
  created_by?: number;
  is_system_role?: boolean;
  permissionCodes?: string[]; // 🆕 from frontend
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Insert the new role
    const result = await client.query(
      `
        INSERT INTO roles (name, description, label, created_by, is_system_role)
        VALUES ($1, $2, $3, $4, FALSE)
        RETURNING *
      `,
      [name, description, label, created_by]
    );

    const role = result.rows[0];

    if (permissionCodes.length > 0) {
      // 2️⃣ Fetch matching permissions
      const permResult = await client.query(
        `
          SELECT id, category_id
          FROM permissions
          WHERE code = ANY($1)
        `,
        [permissionCodes]
      );

      // 3️⃣ Assign each permission & its category
      for (const perm of permResult.rows) {
        await client.query(
          `
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES ($1, $2)
            ON CONFLICT (role_id, permission_id) DO NOTHING
          `,
          [role.id, perm.id]
        );

        if (perm.category_id) {
          await client.query(
            `
              INSERT INTO role_categories (role_id, category_id)
              VALUES ($1, $2)
              ON CONFLICT (role_id, category_id) DO NOTHING
            `,
            [role.id, perm.category_id]
          );
        }
      }
    }

    await client.query("COMMIT");
    return role;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
 

  async getAssignablePermissionsForRole(roleId: number) {
    const client = await pool.connect();
    try {
      const q = `
        SELECT
          p.id,
          p.code,
          p.name,
          p.description,
          p.category_id,
          pc.name AS category_name
        FROM chatx.permissions p
        JOIN chatx.permission_categories pc ON pc.id = p.category_id
        JOIN chatx.role_categories rc ON rc.category_id = pc.id
        WHERE rc.role_id = $1
        ORDER BY pc.name, p.name
      `;
      const result = await client.query(q, [roleId]);
      return result.rows; // [{ id, code, name, description, category_id, category_name }, ...]
    } finally {
      client.release();
    }
  }
  
  async updateRolePermissions(roleId: number, permissionCodes: string[]) {
    const client = await pool.connect();
    try {
      // 1) allowed permission codes for that target role (based on role_categories)
      const allowedRes = await client.query(
        `
        SELECT p.code
        FROM chatx.permissions p
        JOIN chatx.role_categories rc ON rc.category_id = p.category_id
        WHERE rc.role_id = $1
        `,
        [roleId]
      );
      const allowedCodes = allowedRes.rows.map((r) => r.code);
  
      // 2) keep only requested codes that are allowed for this role
      const safeCodes = Array.from(new Set(permissionCodes.filter((c) => allowedCodes.includes(c))));
  
      // 3) existing assigned codes (but only the ones in those categories)
      const existingRes = await client.query(
        `
        SELECT p.code
        FROM chatx.role_permissions rp
        JOIN chatx.permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1
          AND p.category_id IN (SELECT category_id FROM chatx.role_categories WHERE role_id = $1)
       `,
        [roleId]
      );
      const existingCodes = existingRes.rows.map((r) => r.code);
  
      // 4) diff
      const toAdd = safeCodes.filter((c) => !existingCodes.includes(c));
      const toRemove = existingCodes.filter((c) => !safeCodes.includes(c));
  
      // 5) transactionally apply changes
      await client.query("BEGIN");
      // insert
      for (const code of toAdd) {
        await client.query(
          `
          INSERT INTO chatx.role_permissions (role_id, permission_id)
          SELECT $1, id FROM chatx.permissions WHERE code = $2
          ON CONFLICT DO NOTHING
          `,
          [roleId, code]
        );
      }
      // delete
      for (const code of toRemove) {
        await client.query(
          `
          DELETE FROM chatx.role_permissions
          WHERE role_id = $1
            AND permission_id = (SELECT id FROM chatx.permissions WHERE code = $2)
          `,
          [roleId, code]
        );
      }
      await client.query("COMMIT");
  
      return { added: toAdd, removed: toRemove, ignored: permissionCodes.filter(c => !allowedCodes.includes(c)) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  
  async updateRole(id: number, { name, description, label}: { name?: string; description?: string; label?:string; }) {
    const result = await pool.query(
      `UPDATE roles
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           label = $3
       WHERE id = $4
       RETURNING *`,
      [name, description, label, id]
    );
    return result.rows[0];
  }
  
  // ----- Plans -----
  async createPlan(
    name: string,
    description: string,
    max_workspace: number,
    max_account: number,
    price: number,
    billing_cycle: string
  ): Promise<any> {

    const client = await pool.connect();
    try{
      const result = await client.query<Plan>(
        `INSERT INTO plans (name, description, max_workspace, max_account, price, billing_cycle)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, description, max_workspace, max_account, price, billing_cycle`,
        [ name, description, max_workspace, max_account, price, billing_cycle]
      );
      return result.rows[0];
    } 
    finally {
      client.release(); // ✅ important
    }
  }

  static async deletePlan(id: number): Promise<void> {
    const client = await pool.connect();
    try{
      await client.query("DELETE FROM plans WHERE id=$1", [id]);
    }finally{
      client.release()
    }
  }

  static async updatePlan(id: number, plan: Partial<Plan>): Promise<Plan> {
    const client = await pool.connect();
    try{
      const result = await client.query<Plan>(
        `UPDATE plans 
        SET name = COALESCE($1, name),
            description = COALESCE($2, description),
            max_workspace = COALESCE($3, max_workspace),
            max_account = COALESCE($4, max_account),
            price = COALESCE($5, price),
            billing_cycle = COALESCE($6, billing_cycle),
            is_active = COALESCE($7, is_active)
        WHERE id = $8
        RETURNING *`,
        [
          plan.name,
          plan.description,
          plan.max_workspace,
          plan.max_account,
          plan.price,
          plan.billing_cycle,
          plan.is_active,
          id,
        ]
      );
      return result.rows[0];
    }finally{
      client.release()
    }
  }

  async getPlanById(id: number): Promise<Plan | null> {
    const client = await pool.connect();
    try{
      const result = await client.query<Plan>("SELECT * FROM plans WHERE id = $1", [id]);
      return result.rows[0] ?? null;
    }
    finally {
      client.release(); // ✅ important
    }
  }

  static async getAllPlans(): Promise<Plan[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<Plan>("SELECT * FROM chatx.plans ORDER BY id ASC ");
      return result.rows;
    }
    finally {
      client.release(); // ✅ important
    }
  }

  async getUserById(id: number): Promise<User & { role_name: string } | null> {
    const client = await pool.connect();
    try{
      const result = await client.query(
        `SELECT u.*, r.name as role_name
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1`,
        [id]
      );
      return result.rows[0] ?? null;
    }

    finally {
      client.release(); // ✅ important
    }
  }

  static async updateUser(
    id: number,
    name: string,
    email: string,
    department: string | null,
    role_id: number,
    plan_id: number | null,
    assigned_to: number | null,
    password?: string // optional
  ) {
    let hashedPassword: string | undefined;

    if (password) {
      hashedPassword = await bcrypt.hash(password, 10); // ✅ hash before saving
    }

    const query = `
      UPDATE users
      SET 
        name = $1,
        email = $2,
        department = $3,
        role_id = $4,
        plan_id = $5,
        assigned_to = $6
        ${password ? ", password = $7" : ""}
      WHERE id = $${password ? 8 : 7}
      RETURNING id, name, email, department, role_id, plan_id, assigned_to, is_active, created_at
    `;

    const values = password
      ? [name, email, department, role_id, plan_id, assigned_to, hashedPassword, id]
      : [name, email, department, role_id, plan_id, assigned_to, id];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<void> {
    const client = await pool.connect();
    try{
      await client.query(
        `UPDATE users
        SET password = $1
        WHERE id = $2`,
        [hashedPassword, id]
      );
    }
    finally {
      client.release(); // ✅ important
    }
  }

  async deleteUserById(id: number): Promise<boolean> {
    const client = await pool.connect();
    try{
      const result = await client.query(
        `DELETE FROM users WHERE id = $1 RETURNING id`,
        [id]
      );
      return result.rows.length > 0;
    }

    finally {
      client.release(); // ✅ important
    }
  }

  async toggleUserStatus(userId: number, isActive: boolean) {
    const client = await pool.connect();
    try{
      await client.query(
        `UPDATE users SET is_active = $1 
        WHERE id = $2 OR assigned_to = $2 `,
        [isActive, userId]
      );
    
      if (!isActive) {
        await pool.query(
          `UPDATE users 
          SET is_active = false
          WHERE assigned_to = $1`,
          [userId]
        );
      }
      return true;
    }finally{
      client.release()
    }
  }

  async getSubordinateCounts(managerId: number) {
    // Count supervisors under this manager
    const client = await pool.connect();
    try{
      const supervisors = await client.query(
        `SELECT COUNT(*) 
        FROM users 
        WHERE assigned_to = $1 
          AND role_id = $2`,
        [managerId, 3]
      );
    
      // Count agents under this manager
      const agents = await client.query(
        `SELECT COUNT(*) 
        FROM users 
        WHERE assigned_to = $1 
          AND role_id = $2`,
        [managerId, 4]
      );
    
      return {
        supervisors: parseInt(supervisors.rows[0].count, 10),
        agents: parseInt(agents.rows[0].count, 10),
      };
    }
    finally{
      client.release()
    }
  }

  async getWorkspace(): Promise<Workspace[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<Workspace>(
        `SELECT 
          w.id,
          w.name,
          w.description,
          w.manager_id,
          w.is_active,
          w.created_at,

          COALESCE(
              json_agg(
                  DISTINCT jsonb_build_object(
                      'id', b.id,
                      'name', b.name
                  )
              ) FILTER (WHERE b.is_active = true),
              '[]'::json
          ) AS brands,

          COALESCE(
              json_agg(
                  DISTINCT jsonb_build_object(
                      'user_id', wm.user_id,
                      'name', u.name,
                      'role_in_workspace', wm.role_in_workspace,
                      'is_active', wm.is_active
                  )
              ) FILTER (WHERE wm.user_id IS NOT NULL),
              '[]'::json
          ) AS members

          FROM chatx.workspaces w
          LEFT JOIN chatx.brands b 
              ON b.workspace_id = w.id
          LEFT JOIN chatx.workspace_members wm 
              ON wm.workspace_id = w.id
          LEFT JOIN chatx.users u 
              ON u.id = wm.user_id
          GROUP BY w.id, w.name, w.description, w.manager_id, w.is_active, w.created_at
          ORDER BY w.id ASC;
        `
      );
      return result.rows;
    }
    finally {
      client.release(); // ✅ important
    }
  }

  async getAllWorkspace(managerId:number): Promise<Workspace[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<Workspace>(
        `SELECT 
          w.id,
          w.name,
          w.description,
          w.manager_id,
          w.is_active,
          w.created_at,

          COALESCE(
              json_agg(
                  DISTINCT jsonb_build_object(
                      'id', b.id,
                      'name', b.name
                  )
              ) FILTER (WHERE b.is_active = true),
              '[]'::json
          ) AS brands,

          COALESCE(
              json_agg(
                  DISTINCT jsonb_build_object(
                      'user_id', wm.user_id,
                      'name', u.name,
                      'role_in_workspace', wm.role_in_workspace,
                      'is_active', wm.is_active
                  )
              ) FILTER (WHERE wm.user_id IS NOT NULL),
              '[]'::json
          ) AS members

          FROM chatx.workspaces w
          LEFT JOIN chatx.brands b 
              ON b.workspace_id = w.id
          LEFT JOIN chatx.workspace_members wm 
              ON wm.workspace_id = w.id
          LEFT JOIN chatx.users u 
              ON u.id = wm.user_id

          WHERE w.manager_id = $1
          GROUP BY w.id, w.name, w.description, w.manager_id, w.is_active, w.created_at
          ORDER BY w.id ASC;
        `, [managerId]
      );
      return result.rows;
    }
    finally {
      client.release(); // ✅ important
    }
  }

  async getManagerWithPlan(managerId: number) {
    const client = await pool.connect();
    try{
      const result = await client.query(
        `SELECT u.id, u.role_id, u.plan_id, p.max_workspace
        FROM users u
        JOIN plans p ON u.plan_id = p.id
        WHERE u.id = $1`,
        [managerId]
      );
      return result.rows[0] || null;
    }finally{
      client.release()
    }
  }

  async countWorkspacesByManager(managerId: number) {
    const client = await pool.connect();
    try{
      const result = await client.query(
        `SELECT COUNT(*) FROM workspaces WHERE manager_id = $1`,
        [managerId]
      );
      return parseInt(result.rows[0].count, 10);
    }finally{
      client.release()
    }
  }

  async createWorkspace(name: string, description:string, managerId: number) {
    const client = await pool.connect();
    try{
      const result = await client.query(
        `INSERT INTO workspaces (name, description, manager_id)
        VALUES ($1, $2, $3)
        RETURNING  id, name, description, manager_id, created_at`,
        [name, description, managerId]
      );
      return result.rows[0];
    }finally{
      client.release()
    }
  }

  async createBrand(name: string, workspaceId: number) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO brands (name, workspace_id)
         VALUES ($1, $2)
         RETURNING id, name, workspace_id, created_at`,
        [name, workspaceId]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async updateBrandName(brandId: number, name: string) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE brands
         SET name = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, name, workspace_id, updated_at`,
        [name, brandId]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async deleteBrand(brandId: number, workspaceId: number) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM brands 
         WHERE id = $1 AND workspace_id = $2
         RETURNING id, name, workspace_id, created_at`,
        [brandId, workspaceId]
      );
      return result.rows[0]; // return deleted brand
    } finally {
      client.release();
    }
  }

  async addWorkspaceMember(userId: number, workspaceId: number, createdAt: Date) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO workspace_members (user_id, workspace_id, created_at)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, workspace_id, created_at`,
        [userId, workspaceId, createdAt]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }
  
  async removeWorkspaceMember(userId: number, workspaceId: number) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM workspace_members
         WHERE user_id = $1 AND workspace_id = $2
         RETURNING id, user_id, workspace_id`,
        [userId, workspaceId]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getBrands(): Promise<Brand[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<Brand>("SELECT * FROM brands WHERE is_active = true");
      return result.rows;
    }
    finally {
      client.release(); // ✅ important
    }
  }

  async getAllBrands(managerId:number): Promise<Brand[]> {
    const client = await pool.connect();
    try{
      const result = await client.query<Brand>(
      ` SELECT b.*
      FROM brands b
      JOIN workspaces w ON w.id = b.workspace_id
      WHERE w.manager_id = $1`, 
      [managerId]);
      return result.rows;
    }
    finally {
      client.release(); // ✅ important
    }
  }

  /**
   * 获取某个用户可见的工作区与品牌：
   * - 如果是 Manager：看到自己创建/管理的 workspaces 以及其 brands
   * - 如果是 Supervisor/Agent：看到被分配到的 workspaces 以及其 brands
   */
  async getAccessibleWorkspacesAndBrands(userId: number) {
    const client = await pool.connect();
    try {
      // 先查用户角色
      const roleRes = await client.query(
        `SELECT r.name AS role_name FROM chatx.users u JOIN chatx.roles r ON r.id = u.role_id WHERE u.id = $1 LIMIT 1`,
        [userId]
      );
      const roleName = (roleRes.rows[0]?.role_name || '').toUpperCase();

      if (roleName === 'MANAGER') {
        // Manager: 自己管理的工作区 + 其品牌
        const q = `
          SELECT 
            w.id   AS workspace_id,
            w.name AS workspace_name,
            COALESCE(
              JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('id', b.id, 'name', b.name)) 
                FILTER (WHERE b.id IS NOT NULL),
              '[]'::json
            ) AS brands
          FROM chatx.workspaces w
          LEFT JOIN chatx.brands b ON b.workspace_id = w.id
          WHERE w.manager_id = $1
          GROUP BY w.id, w.name
          ORDER BY w.id`;
        const result = await client.query(q, [userId]);
        return result.rows;
      }

      // 非 Manager：通过 membership 获得的工作区 + 其品牌
      const q = `
        SELECT 
          w.id   AS workspace_id,
          w.name AS workspace_name,
          COALESCE(
            JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('id', b.id, 'name', b.name)) 
              FILTER (WHERE b.id IS NOT NULL),
            '[]'::json
          ) AS brands
        FROM chatx.workspace_members wm
        JOIN chatx.workspaces w ON w.id = wm.workspace_id
        LEFT JOIN chatx.brands b ON b.workspace_id = w.id
        WHERE wm.user_id = $1
        GROUP BY w.id, w.name
        ORDER BY w.id`;
      const result = await client.query(q, [userId]);
      return result.rows;
    } finally {
      client.release();
    }
  }
  
  async updateWorkspaceWithRelations(
    workspaceId: number,
    name: string,
    description: string,
    brands: string[],
    members: number[]
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Update workspace info
      await client.query(
        `UPDATE workspaces
         SET name = $1, description = $2, created_at = NOW()
         WHERE id = $3`,
        [name, description, workspaceId]
      );

      // 2. Reset brands
      await client.query(`DELETE FROM brands WHERE workspace_id = $1`, [workspaceId]);
      for (const b of brands) {
        await client.query(
          `INSERT INTO brands (workspace_id, name, created_at)
           VALUES ($1, $2, NOW())`,
          [workspaceId, b]
        );
      }

      // 3. Reset members
      await client.query(`DELETE FROM workspace_members WHERE workspace_id = $1`, [workspaceId]);
      for (const m of members) {
        await client.query(
          `INSERT INTO workspace_members (workspace_id, user_id, created_at)
           VALUES ($1, $2, NOW())`,
          [workspaceId, m]
        );
      }

      await client.query("COMMIT");

      // Return the updated workspace (including brands & members)
      const result = await client.query(
        `SELECT w.id, w.name, w.description, w.created_at
         FROM workspaces w
         WHERE w.id = $1`,
        [workspaceId]
      );

      return result.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  
  async deleteWorkspace(workspaceId: number) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
  
      // Delete members first
      await client.query(
        `DELETE FROM workspace_members WHERE workspace_id = $1`,
        [workspaceId]
      );
  
      // Delete brands
      await client.query(
        `DELETE FROM brands WHERE workspace_id = $1`,
        [workspaceId]
      );
  
      // Delete workspace
      const result = await client.query(
        `DELETE FROM workspaces WHERE id = $1 RETURNING id`,
        [workspaceId]
      );
  
      await client.query("COMMIT");
      return result.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }  
  
  static async getSubordinatesByManagerId(managerId: number): Promise<User[]> {
    const client = await pool.connect();
    try {
      const result = await client.query<User>(
        `
        SELECT 
          u.id,
          u.name,
          u.email,  
          u.role_id,
          u.department,
          u.plan_id,
          u.is_active,
          u.created_at as created_at,
          r.name AS role_name,
          array_agg(p.code) AS permissions
        FROM chatx.users u
        JOIN chatx.roles r ON u.role_id = r.id
        LEFT JOIN chatx.role_permissions rp ON rp.role_id = r.id
        LEFT JOIN chatx.permissions p ON rp.permission_id = p.id
        WHERE u.assigned_to = $1
          AND LOWER(r.name) IN ('supervisor', 'agent')
        GROUP BY u.id , r.name
        ORDER BY u.role_id, u.name;
        `,
        [managerId]
      );

      return result.rows;
    } finally {
      client.release(); // ✅ always release
    }
  }

  static async getWorkspacesForUser(userId: number) {
    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT 
           w.id   AS workspace_id,
           w.name AS workspace_name,
           b.id   AS brand_id,
           b.name AS brand_name,
           b.is_active AS brand_active,
           b.created_at AS brand_created_at
         FROM workspace_members wm
         JOIN workspaces w ON wm.workspace_id = w.id
         LEFT JOIN brands b ON b.workspace_id = w.id
         WHERE wm.user_id = $1`,
        [userId]
      );
  
      return res.rows;
    } finally {
      client.release();
    }
  }  

  // 删除账号（根据 sessionId）
  static async deleteAccountBySessionId(sessionId: string) {
    const cleanedSessionId = sessionId.replace(/^_IGNORE_/, "");

    const client = await pool.connect();
    try {
      const result = await client.query(`DELETE FROM accounts WHERE account_id = $1 RETURNING *`, [cleanedSessionId]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  // 更新账号信息
  static async updateAccountInfoBySessionId(
    sessionId: string,
    data: { name?: string; description?: string; workspaceId?: number | null; brandId?: number | null }
  ) {
    const client = await pool.connect();
    try {
      const cleanSessionId = sessionId.replace(/^_IGNORE_/, "");
  
      const result = await client.query(
        `
        UPDATE accounts 
        SET 
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          workspace_id = COALESCE($3, workspace_id),
          brand_id = COALESCE($4, brand_id)
        WHERE account_id = $5
        RETURNING *;
        `,
        [data.name, data.description, data.workspaceId, data.brandId, cleanSessionId]
      );
  
      return result.rows[0];
    } finally {
      client.release();
    }
  }
  
  

  static async setAccountActiveStatus(sessionId: string, isActive: boolean) {
    const client = await pool.connect();
    try {
      const cleanSessionId = sessionId.replace(/^_IGNORE_/, "");
  
      const result = await client.query(
        `UPDATE accounts 
         SET is_active = $1
         WHERE account_id = $2
         RETURNING id, account_id, is_active`,
        [isActive, cleanSessionId]
      );
  
      if (result.rowCount === 0) {
        console.warn(`⚠️ No account found with account_id: ${cleanSessionId}`);
        return null;
      }
  
      console.log(`💾 Database updated successfully:`, result.rows[0]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }
  
  
  static async getAllAccounts() {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          id, account_id, platform,
          is_active, workspace_id, brand_id, created_at
        FROM accounts
        ORDER BY created_at DESC
      `);
      return result.rows;
    } finally {
      client.release();
    }
  }
  
  static async getAccountStats(userId: number, roleId: number) {
    const client = await pool.connect();
    try {
      let query = '';
      let params: any[] = [];
  
      if (roleId === 2) {
        // Role 2: Only count accounts created by this user
        query = `
          SELECT 
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE is_active = true)::int AS active,
            COUNT(*) FILTER (WHERE platform = 'whatsapp')::int AS whatsapp,
            COUNT(*) FILTER (WHERE platform = 'telegram')::int AS telegram
          FROM chatx.accounts
          WHERE created_by = $1
        `;
        params = [userId];
      } else {
        // Other roles: Find manager_id from users.assigned_to, then count accounts created by manager
        query = `
          SELECT 
            COUNT(a.*)::int AS total,
            COUNT(*) FILTER (WHERE a.is_active = true)::int AS active,
            COUNT(*) FILTER (WHERE a.platform = 'whatsapp')::int AS whatsapp,
            COUNT(*) FILTER (WHERE a.platform = 'telegram')::int AS telegram
          FROM chatx.accounts a
          WHERE a.created_by IN (
            -- Get the manager_id from users table where assigned_to matches
            SELECT u.id 
            FROM chatx.users u
            WHERE u.assigned_to = $1
          )
        `;
        params = [userId];
      }
  
      const result = await client.query(query, params);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  // database.service.ts
  static async getAccountBySessionId(sessionId: string) {
    const client = await pool.connect();
    try {
      const cleanSessionId = sessionId.replace(/^_IGNORE_/, ""); // remove "_IGNORE_" prefix
      const result = await client.query(
        `SELECT * FROM accounts WHERE account_id = $1`,
        [cleanSessionId]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }
  
  static async getPermissionsByCategory(categoryId: number) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT 
          p.id,
          p.name,
          p.code,
          p.category_id,
          p.description,
          c.name AS category_name
        FROM permissions p
        LEFT JOIN permission_categories c ON p.category_id = c.id
        WHERE p.category_id = $1
        ORDER BY p.name ASC
        `,
        [categoryId]
      );
  
      return result.rows;
    } finally {
      client.release();
    }
  }
  
  // database.service.ts
  async getUserWorkspaceAndBrand(userId: number) {
    const client = await pool.connect();

    try {
      const result = await client.query(
        `
        SELECT 
          u.id AS user_id,
          w.id AS workspace_id,
          b.id AS brand_id
        FROM users u
        JOIN workspace_members wm ON wm.user_id = u.id
        JOIN workspaces w ON w.id = wm.workspace_id
        JOIN brands b ON b.id = w.brand_id
        WHERE u.id = $1
        `,
        [userId]
      );

      return result.rows[0] || null;
    } catch (err) {
      console.error("❌ [DB] Error fetching user workspace/brand:", err);
      throw err;
    } finally {
      client.release();
    }
  }

  static async getAccountById(accountId: string) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, platform, account_id, name, description, workspace_id, brand_id, status, is_active, created_at, last_connected
         FROM accounts
         WHERE account_id = $1`,
        [accountId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }  
  
}

export const databaseService = new DatabaseService();
