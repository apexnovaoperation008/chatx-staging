import {pool} from "@/database/database.service"
import { Workspace, Account }  from "@/types/chat.types"

export class accountDatabaseService {
    static async getAccountsByUser(userId: number, role: string) {
        const client = await pool.connect();
        
        try {
            let query = "";
            let params: any[] = [];
        
            if (role === "MANAGER") {
            // Manager owns the workspace
            query = `
                SELECT a.*, w.name AS workspace_name, u.name AS owner_name
                FROM chatx.accounts a
                JOIN chatx.workspaces w ON a.workspace_id = w.id
                JOIN chatx.users u ON w.user_id = u.id
                WHERE w.user_id = $1
            `;
            params = [userId];
            }
        
            else if (role === "SUPERVISOR" || role === "AGENT") {
            // Both supervisor and agent are workspace members
            query = `
                SELECT DISTINCT a.*, w.name AS workspace_name, u.name AS owner_name
                FROM chatx.accounts a
                JOIN chatx.workspaces w ON a.workspace_id = w.id
                JOIN chatx.users u ON w.user_id = u.id
                JOIN chatx.workspace_members wm ON wm.workspace_id = w.id
                WHERE wm.user_id = $1
            `;
            params = [userId];
            }
        
            const result = await client.query(query, params);
            return result.rows || [];
        } finally {
            client.release();
        }
    }

    static async getAccountsByWorkspace(workspaceIds: number[]):Promise<Account[]>{
        const client = await pool.connect();
        try {
          const result = await client.query(
            `SELECT 
               a.*, 
               w.name AS workspace_name, 
               w.manager_id
             FROM chatx.accounts a
             LEFT JOIN chatx.workspaces w ON a.workspace_id = w.id
             WHERE a.workspace_id =ANY($1)`,
            [workspaceIds]
          );
          return result.rows || [];
        } finally {
          client.release();
        }
    }

    static async getAccountsByWorkspaceOrCreator(workspaceIds: number[], userId: number) {
        const client = await pool.connect();
        try {
          // If user has no workspaces, only return accounts created by them
          if (workspaceIds.length === 0) {
            const result = await client.query(
              `
              SELECT DISTINCT a.*
              FROM chatx.accounts a
              WHERE a.created_by = $1
              `,
              [userId]
            );
            return result.rows;
          }
      
          // User has workspaces - return workspace accounts + user's personal accounts
          const result = await client.query(
            `
            SELECT DISTINCT a.*
            FROM chatx.accounts a
            WHERE 
              -- Accounts in user's workspaces
              (a.workspace_id IS NOT NULL AND a.workspace_id = ANY($1::int[]))
              
              OR 
              
              -- Personal accounts (workspace is NULL or 0) created by this user
              ((a.workspace_id IS NULL OR a.workspace_id = 0) AND a.created_by = $2)
            `,
            [workspaceIds, userId]
          );
      
          return result.rows;
        } finally {
          client.release();
        }
      }
               
    static async findByManagerId(userId: string | number): Promise<Workspace[]> {
        const client = await pool.connect();
        try {
          const result = await client.query(
            `SELECT 
               w.*, 
               m.user_id AS member_user_id
             FROM chatx.workspaces w
             LEFT JOIN chatx.workspace_members m ON m.workspace_id = w.id
             WHERE w.manager_id = $1
            `,
            [userId]
          );
      
          return result.rows || [];

        } finally {
          client.release();
        }
    }
      
      
    static async findById(accountId: string | number):Promise<Account[] | null> {
        const client = await pool.connect();
        try {
          const result = await client.query(
            `SELECT 
               a.*, 
               w.id AS workspace_id,
               w.manager_id,
               w.name AS workspace_name
             FROM chatx.accounts a
             LEFT JOIN chatx.workspaces w ON a.workspace_id = w.id
             WHERE a.id = $1`,
            [accountId]
          );
    
          return result.rows[0] || null;
        } finally {
          client.release();
        }
    }

    static async findByWorkspaceId(workspaceId: number):Promise<Account[]> {
        const client = await pool.connect();
        try {
          const query = `
            SELECT 
              a.*, 
              w.name AS workspace_name,
              u.name AS owner_name
            FROM chatx.accounts a
            JOIN chatx.workspaces w ON a.workspace_id = w.id
            JOIN chatx.users u ON w.user_id = u.id
            WHERE w.id = $1
          `;
          const result = await client.query(query, [workspaceId]);
          return result.rows || [];
        } finally {
          client.release();
        }
      }

      /**
     * Check whether user (with role) can access a given account
     */
    static async canUserAccessAccount(userId: number, role: string, accountId: string | number): Promise<boolean> {
        const client = await pool.connect();
        try {
        if (role === "MANAGER") {
            // Manager can access accounts in their own workspace
            const result = await client.query(
            `SELECT 1 
            FROM chatx.accounts a
            JOIN chatx.workspaces w ON a.workspace_id = w.id
            WHERE a.id = $1 AND w.user_id = $2
            `,
            [accountId, userId]
            );
            return result.rowCount! > 0;
        }

        if (role === "SUPERVISOR" || role === "AGENT") {
            // Supervisor/Agent must be a member of the workspace
            const result = await client.query(
            `SELECT 1
            FROM chatx.accounts a
            JOIN chatx.workspace_members wm ON wm.workspace_id = a.workspace_id
            WHERE a.id = $1 AND wm.user_id = $2
            `,
            [accountId, userId]
            );
            return result.rowCount! > 0;
        }

        return false;
        } finally {
        client.release();
        }
    }

    static async findByUserId(userId: number): Promise<Workspace[]> {
        const client = await pool.connect();
        try {
          const result = await client.query(
            `
            SELECT w.*
            FROM workspaces w
            JOIN workspace_members wm ON wm.workspace_id = w.id
            WHERE wm.user_id = $1;
            `,
            [userId]
          );
      
          // Return all workspaces (could be 0, 1, or many)
          return result.rows || [];
        } finally {
          client.release();
        }
    }
    
    
}


