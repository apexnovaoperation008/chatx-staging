"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation";
import { handleSessionExpired } from "@/lib/handleSessionExpired";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { startTokenAutoRefresh, stopTokenAutoRefresh } from "@/contexts/auth-refresh"
import { resetAuthState } from "../lib/fetchWithAuth";

const API_URL = process.env.NEXT_PUBLIC_API_BASE;

interface User {
  id: number
  email: string
  name: string
  role_id: number
  role: string
  role_name: string
  permissions: string[]
  avatar?: string
  created_at: string
  lastLogin?: string
  workspace_id?: string
  plan_id?: number
  plan_name?: string
  department?:string
  is_active: boolean
  assigned_to?: number
  workspace_count?: number
  label:string
  
}

interface Manager {
  id: number
  email: string
  name: string
  role_id?: number
  role_name: string
  permissions: string[]
  createdAt: string
  lastLogin?: string
  workspace_id?: string
  plan_id?: number
  plan_name?: string
  department?:string
  is_active: boolean
  workspace_count?: number
  max_workspace ?: number
  max_account ?: number
}

interface Role {
  id: number;
  name: string;
  displayName: string;
  description: string;
  permissions: string[];
  color: string;
  userCount:number;
  label:string;
  created_by?: number;
  is_system_role?: boolean; 
}

interface Plan {
  id: number
  name: string
  description: string
  max_workspace: number
  max_account: number
  price: number
  billing_cycle: string
  is_active?: boolean 
  createdAt: string
}

interface Permission {
  id: number
  name: string
  code: string
  description: string
  category_id: number
  category_name: string
}

interface RolePayload {
  name: string
  description?: string
  label:string
  permissions?: string[]; // ✅ Add this line
}

interface SubordinateCounts {
  supervisors: number
  agents: number
}

interface LoginResult {
  success: boolean
}

interface Brand {
  id: number;
  name: string;
}

interface Brands {
  id: number;
  name: string;
  workspace_id: number;
  is_active: boolean;
  created_at: Date;
}

interface Member {
  name: string;
  user_id: number;
  is_active: boolean;
  role_in_workspace: string;
}

interface Workspace {
  id: number;
  name: string;
  description?: string;
  manager_id: number; // Manager
  is_active: boolean;
  created_at: Date;
  brands: Brand[];
  members: Member[];
}

interface WorkspaceBrandResponse {
  success: boolean;
  data: {
    workspace: Workspace;
    brand: Brands | null; // ✅ full brand object or null
  }[];
}

interface ErrorResponse {
  error: string
}

interface AuthContextType {
  user: User | null
  users: User[]
  roles: Role[]
  plans: Plan[]
  managers: Manager[]
  permissions: Permission[]
  workspaces: Workspace[]
  brands: Brands[]
  errors: ErrorResponse |  null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{success:boolean}>
  logout: () => void
  hasPermission: (permission: string) => boolean
  fetchCurrentUser: () => void
  fetchUsers: () => void
  fetchRoles: () => void
  fetchPlans: () => void
  fetchManagers: () => void
  fetchPermissions: () => void
  fetchAllWorkspaces: () => void
  fetchWorkspaces: () => void
  fetchAllBrands: () => void
  fetchBrands: () => void
  deleteUser: (id: number) => Promise<boolean>
  createUser: (newUser: {
    name: string
    email: string
    department?: string
    password: string
    role_id: number
    plan_id: number | null
    assigned_to: number | null
  }) => Promise<User | null>
  updateUser: (
    id: number,
    updatedUser: {
      name: string
      email: string
      department?: string
      role_id: number
      plan_id: number | null
      assigned_to: number | null
      password?: string
    }
  ) => Promise<User | null>
  createRole: (payload: RolePayload) => Promise<any>
  updateRolePermissions: (roleId: number, permissions: string[]) => Promise<any>
  updateRole: (id: number, payload: RolePayload) => Promise<any>
  toggleUserStatus: (userId: number, isActive: boolean) => Promise<boolean>
  getSubordinateCounts: (managerId: number) => Promise<SubordinateCounts | null>
  fetchAssignableRolePermissions: (roleId: number) => Promise<any>
  createPlan: (planData: Omit<Plan, "id" | "createdAt" | "is_active">) => Promise<Plan | null>;
  updatePlan: (id: number, plan: Partial<Plan>) => Promise<Plan | null>;
  togglePlanStatus: (id: number, checked: boolean) => Promise<void>;
  deletePlan: (id: number) => Promise<boolean>;
  createWorkspace: (data: {
    name: string;
    description: string;
    manager_id: number;
    brands: string[];
    members: number[];
  }) => Promise<any>
  subordinates: User[];
  fetchSubordinates: (managerId?: number) => void;
  addBrand: (workspaceId: number, name: string) => Promise<any>
  handleRemoveBrand:(workspaceId: number, brandId:number) =>Promise<any>
  //updateBrand: (brandId: number, name: string) => Promise<any>
  addWorkspaceMember: (workspaceId: number, userId: number) => Promise<any>
  removeWorkspaceMember: (workspaceId: number, userId: number) => Promise<any>
  updateWorkspace: (
    workspaceId: number, 
    data: { 
    name: string;
    description: string; 
    brands: string[];
    members: number[];
      }) => Promise<any>
  deleteWorkspace: (workspaceId: number) => Promise<any>
  getWorkspacesForUser: () => Promise<{ wsList: Workspace[]; brandList: Brands[] } | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [managers, setManager] = useState<Manager[]>([]);
  const [permissions, setPermission] = useState<Permission[]>([]);
  const [brands, setBrands] = useState<Brands[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [subordinates, setSubordinates] = useState<User[]>([]);
  const [errors, setErrors] = useState<ErrorResponse | null>(null);
  const { toast } = useToast()
  const router = useRouter()

  const toastSuccess = async (title:string, description:string) => {
    toast({title: `✅ ${title}`,
      description: description,
      variant:"success"
    }) 
  }

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/auth/me`, { method: "GET" });
        if (!res) return;
        const data = await res.json();
        setUser(data.user);
      } catch (err: any) {
        if (err.message === "UNAUTHORIZED") {
          setUser(null);
        } else {
          console.error("Failed to fetch user:", err);
        }
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchMe();
  }, []);
  
  
  const toastDestructive = async (title:string, description:string) => {
    toast({title: `💥 ${title}`,
      description: description,
      variant:"destructive"
    }) 
  }  
  
  const login = async (email: string, password: string): Promise<LoginResult> => {

    try{
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include", // 🔑 ensures cookies are stored
      });
          
      const data = await res.json();

      if (res.ok) {
        setUser(data.user); // user comes from /login response   
        resetAuthState(); // clear flags from previous session
        startTokenAutoRefresh(15); // refresh before 15 min expiry
        return data.user;
      } else {
        toastDestructive("Login Failed" , data.message)
        console.log("Failed to login user:", data.message);
        return {success:false};
      }
    
    }catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }

      toastDestructive("Error Login" , err)
      console.log("Error login :", err);
      return {success:false}
    }    
  };
  
  const fetchCurrentUser = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/auth/me`, {
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      if (res?.ok) {
        const data = await res.json();
        if (data?.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };  

  const fetchSubordinates = async (managerId?: number) => {
    if (!user) return;

    // Default to current manager’s id if no id passed
    const targetManagerId = managerId ?? user.id;

    // Managers can fetch their own subordinates
    if (user.role_id === 2) {
      try{
        const res = await fetchWithAuth(`${API_URL}/user/${targetManagerId}/subordinatesList`, {
          method: "GET",
          credentials: "include", // ✅ send cookies automatically
        });

        if (!res) return;

        const data = await res.json();
        console.log("Fetched subordinates:", data)

        setSubordinates(data || []);
      }catch(err:any){
        if (err.message === "UNAUTHORIZED") {
          handleSessionExpired();
        }
      }
    } else {
      setSubordinates([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/auth/users`,{
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res) return;

      const data = await res.json();
      if (res.ok) {
        setUsers(data.data || []);
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching users", err);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/auth/roles`, {
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res) return;

      const data = await res.json();
      if (res.ok) { 
        setRoles(data.data || []);
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching roles", err);
    }
  };

  const fetchPermissions = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/auth/permissions`, {
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res) return;

      const data = await res.json();
      if (res.ok) { 
        setPermission(data.data || []);
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching plans", err);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/plan`, {
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res) return;

      const data = await res.json();
      if (res.ok) { 
        setPlans(data || []);
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching plans", err);
    }
  };

  const fetchManagers = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/auth/managers`, {
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res) return;

      const data = await res.json();
      if (res.ok) { 
        setManager(data.manager || []);
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching roles", err);
    }
  };

  const fetchAllWorkspaces = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace`, {
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res) return;

      const data = await res.json();
      if (res.ok) {
        setWorkspaces(data.workspaces || []);
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching users", err);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace/workspaces`,{
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res) return;

      const data = await res.json();
      if (res.ok) {
        setWorkspaces(data.workspaces || []);
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching users", err);
    }
  };

  const fetchAllBrands = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace/brand`, {
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res) return;

      const data = await res.json();
      if (res.ok) {
        setBrands(data.brands || []);
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching users", err);
    }
  };

  const fetchBrands = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace/brands`, {
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res) return;

      const data = await res.json();
      if (res.ok) {
        setBrands(data.brands || []);
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching users", err);
    }
  };  

  const logout = async () => {
    try {
      // Tell backend to clear cookies
      await fetchWithAuth(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include", // 👈 important to include cookies
      })
  
      // Clear client-side states (if any)
      localStorage.removeItem("token")
      localStorage.removeItem("refreshToken")
      stopTokenAutoRefresh();
      resetAuthState();
      setUser(null)
  
      // Redirect to login
      router.push("/")
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Logout failed:", err)
    }
  }

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    if (user.permissions.includes("*")) return true
    return user.permissions.includes(permission)
  }

  const createUser = async (newUser: {
    name: string
    email: string
    department?: string
    password: string
    role_id: number
    plan_id: number | null
    assigned_to: number | null;
  }): Promise<User | null> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/user/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newUser),
        credentials: "include", 
      });

      if (!res) return null;

      const data = await res.json();
  
      if (res.ok) {
        // Make sure the response has the correct structure
        const createdUser = data.user || data; // Adjust based on your API response
        setUsers(prev => [...prev, { ...createdUser, isActive: true }]);
        return createdUser;
      } else {
        toastDestructive("Failed to create user" , data.error)
        console.error("Failed to create user:", data.error);
        return null;
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error creating user" , err)
      console.error("Error creating user", err);
      return null;
    }
  };

  const updateUser = async (
    id: number,
    updatedUser: {
      name: string
      email: string
      department?: string
      role_id: number
      plan_id: number | null
      assigned_to: number | null
      password?: string // optional
    }
  ): Promise<User | null> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/user/update/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedUser),
        credentials: "include", 
      })
  
      if (!res) return null;

      const data = await res.json()
  
      if (res.ok) {
        setUsers(prev =>
          prev.map(u => (u.id === id ? { ...u, ...data.user } : u))
        )
        return data.user
      } else {
        toastDestructive("Failed to update user" , data.error)
        console.error("Failed to update user:", data.error)
        return null
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error updating user", err)
      toastDestructive("Error updating user" , err)
      return null
    }
  }

  const deleteUser = async (id: number): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/user/delete/${id}`, {
        method: "DELETE",
        credentials: "include", 
      })
  
      if (!res) return false ;
      
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== id))
        return true
      } else {
        const data = await res.json()
        toastDestructive("Failed to delete user" , data.error)
        console.error("Failed to delete user:", data.error)
        return false
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error deleting user" , err)
      console.error("Error deleting user", err)
      return false
    }
  }

  // const createRole = async (payload: RolePayload) => {
  //   try {
  //     const res = await fetchWithAuth(`${API_URL}/user/create/role`, {
  //       method: "POST",
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //       body: JSON.stringify(payload),
  //       credentials: "include", 
  //     });

  //     const data = await res.json();
  //     if (res.ok) {
  //       setRoles(prev => [...prev, data.role]);
  //       return data.role;
  //     } else {
  //       toastDestructive("Failed to create role" , data.error)
  //       console.error("Failed to create role:", data.error);
  //       return null;
  //     }
  //   } catch (error: any) {
  //     toastDestructive("Error creating role" , error)
  //     console.error("Error creating role", error);
  //     return null;
  //   }
  // };

  const createRole = async (payload: RolePayload) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/user/create/role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // 🔐 keep cookies/session
        body: JSON.stringify(payload),
      });

      
      const data = await res.json();

      if (res.ok) {
        toastSuccess("Role created", `Role "${data.role?.name}" was created successfully`);
        return data.role;
      } else {
        toastDestructive("Failed to create role", data.error || "Unknown error");
        console.error("Failed to create role:", data.error);
        return null;
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      
      toastDestructive("Error creating role", err.message || String(err));
      console.error("Error creating role", err);
      return null;
    }
  };


  const updateRolePermissions = async (roleId: number, permissions: string[]) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/user/update/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          permissions
        }),
        credentials: "include", 
      });
  
      
      return res.ok;
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error updating permissions" , err)
      console.error("Error updating permissions", err);
      return false;
    }
  };

  const updateRole = async (id: number, payload: RolePayload ) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/user/update/roles/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include", 
      });

      
      const data = await res.json();
      if (res.ok) {
        setRoles(prev =>
          prev.map(r => (r.id === id ? { ...r, ...data.role } : r))
        );
        return data.role;
      } else {
        toastDestructive("Failed to update role" , data.error)
        console.error("Failed to update role:", data.error);
        return null;
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error updating role" , err)
      console.error("Error updating role", err);
      return null;
    }
  };

  const toggleUserStatus = async (userId: number, isActive: boolean) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/user/update/${userId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive }),
        credentials: "include", 
      });


      const data = await res.json();
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, is_active: isActive } : u
          )
        )
      
        // if also managing subordinates
        setSubordinates((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, is_active: isActive } : u
          )
        )
        return true;
      } else {
        toastDestructive("Failed to toggle user status" , data.error)
        console.error("Failed to toggle user status:", data.error);
        return false;
      }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error toggling user status" , err)
      console.error("Error toggling user status", err);
      return false;
    }
  };

  const getSubordinateCounts = async (managerId: number): Promise<SubordinateCounts | null> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/user/${managerId}/subordinateCounts`, {
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });        
      
      const data = await res.json()
  
      if (res.ok) {
        return { supervisors: data.supervisors, agents: data.agents }
      } else {
        console.error("Failed to fetch subordinates:", data.message)
        return null
      }
    }catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching subordinates", err)
      return null
    }
  }

  const fetchAssignableRolePermissions = async (roleId: number) => {
    try{
      const res = await fetchWithAuth(`${API_URL}/user/${roleId}/permissions`, {
        method: "GET",
        credentials: "include", // ✅ send cookies automatically
      });

      
      const data = await res.json()

      if(res.ok){
        return data;
      }else{
        console.error("Failed to fetch permission category:", data.message)
        return null
      }
    }catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("Error fetching role permission category")
    }
  }

  const createPlan = async (planData: Omit<Plan, "id" | "createdAt" | "is_active">): Promise<Plan | null> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/plan/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(planData),
        credentials: "include", // ✅ send cookies automatically
      });
  
      if (!res)  return null ;

      const data = await res.json();

      if (!res.ok) {
        toastDestructive("Failed to create plan" , data.error)
        console.log("Fail", data.error)
        return null;
      }

      const newPlan: Plan = {
        ...data.plan,
        is_active: data.plan.is_active ?? true,
        createdAt: data.plan.createdAt ?? new Date().toISOString(),
      };
  
      setPlans((prev) => [...prev, newPlan]);
      return newPlan;
    }catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error creating plan" , err)
      console.log("Error", err)
      return null;
    }
  };

  const deletePlan = async (planId: number): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/plan/delete/${planId}`, {
        method: "DELETE",
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res)  return false ;

      if (!res.ok) {
        toastDestructive("Failed to delete plan" , "Delete selected plan has been failed.Please check again.")
        console.error("❌ Failed to delete plan");
        return false;
      }

      setPlans((prev) => prev.filter((p) => p.id !== planId));
      return true;
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error deleting plan" , err)
      console.error("❌ Error deleting plan:", err);
      return false;
    }
  };
  
  const togglePlanStatus = async (id: number, checked: boolean) => {
    await updatePlan(id, {is_active:checked});
  };

  const updatePlan = async (id: number, plan: Partial<Plan>): Promise<Plan | null> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/plan/update/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(plan),
        credentials: "include", // ✅ send cookies automatically
      });

      if (!res)  return null ;

      const data = await res.json();

      if (!res.ok) {
        toastDestructive("Failed to update plan" , data.error )
        console.log("Failed to update plan" , data.error )
        return null;
      }

      const updatedPlan = data.plan as Plan;

      setPlans((prev) =>
        prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p))
      );
      return updatedPlan;
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error updating plan" , err)
      console.error("❌ Error updating plan", err);
      return null;
    }
  };

  async function createWorkspace(data: {
    name: string;
    description: string;
    manager_id: number;
    brands: string[];
    members: number[];
  }) {
    try{
      const res = await fetchWithAuth(`${API_URL}/workspace/create`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json" ,
        },
        body: JSON.stringify(data),
        credentials: "include", // ✅ send cookies automatically
      });

      

      if (!res.ok) {
        const data: ErrorResponse = await res.json();
        setErrors(data)
        console.log(data.error)
        return (data.error || "Failed to create workspace");
      }
    
      return res.json();
    }catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error updating plan" , err)
      console.error("❌ Error updating plan", err);
      return null;
    }
  }

  const addBrand = async (workspaceId: number, name: string): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace/update/${workspaceId}/brands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId, name }),
        credentials: "include", // ✅ send cookies automatically
      });

        
      const data = await res.json();

      if (!res.ok) {
        toastDestructive("Failed to add plan" , data.error )
        console.error("❌ Failed to add brand");
        return false;
      }
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === workspaceId
            ? { ...ws, brands: [...(ws.brands || []), data] }
            : ws
        )
      );
      return true;
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error adding plan" , err )
      console.error("❌ Error adding brand:", err);
      return false;
    }
  };

  const handleRemoveBrand = async (workspaceId: number, brandId: number) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace/delete/${workspaceId}/brands/${brandId}`, {
        method: "DELETE",
        credentials: "include", // ✅ send cookies automatically
      });

        
      if (!res.ok) {
        toastDestructive("Failed to delete brand" , "Delete selected brand has been failed.Please check again.")
        console.error("❌ Failed to delete brand");
        return;
      }
  
      // Update state
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === workspaceId
            ? { ...ws, brands: ws.brands?.filter((b) => b.id !== brandId) }
            : ws
        )
      );
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error deleting brand" , err)
      console.error("❌ Error deleting brand:", err);
    }
  };
  
  const updateBrand = async (brandId: number, name: string, workspaceId: number): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace/updateBrand/${brandId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!res)  return false ;
  
      if (!res.ok) {
        console.error("❌ Failed to update brand");
        return false;
      }
  
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === workspaceId
            ? {
                ...ws,
                brands: ws.brands.map((b) =>
                  b.id === brandId ? { ...b, name } : b
                ),
              }
            : ws
        )
      );
      return true;
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error updating brand" , err)
      console.error("❌ Error updating brand:", err);
      return false;
    }
  };
  
  const addWorkspaceMember = async (workspaceId: number, userId: number): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace/add/${workspaceId}/member`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId, userId }),
        credentials: "include", // ✅ send cookies automatically
      });  
    
      if (!res)  return false ;

      const data = await res.json();

      if (!res.ok) {
        toastDestructive("Failed to delete brand" , "Delete selected brand has been failed.Please check again.")
        console.error("❌ Failed to add member");
        return false;
      }
  
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === workspaceId
            ? { ...ws, members: [...(ws.members || []), data] }
            : ws
        )
      );
      return true;
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error adding brand" , err)
      console.error("❌ Error adding member:", err);
      return false;
    }
  };
  
  const removeWorkspaceMember = async (workspaceId: number, userId: number): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace/delete/${workspaceId}/member`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId, userId }),
        credentials: "include", // ✅ send cookies automatically
      });
  
      if (!res)  return false ;

      if (!res.ok) {
        toastDestructive("Failed to remove member" , "Remove selected member has been failed.Please check again.")
        console.error("❌ Failed to remove member");
        return false;
      }
  
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === workspaceId
            ? { ...ws, members: ws.members.filter((m) => m.user_id !== userId) }
            : ws
        )
      );
      return true;
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error removing member" , err)
      console.error("❌ Error removing member:", err);
      return false;
    }
  };

  const deleteWorkspace = async (workspaceId: number): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace/delete/${workspaceId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId }),
        credentials: "include", // ✅ send cookies automatically
      });
  
      
      if (!res.ok) {
        toastDestructive("Failed to delete workspace" , "Delete selected workspace has been failed.Please check again.")
        console.error("❌ Failed to remove workspace");
        return false;
      }

      return true;
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error removing workspace" , err)
      console.error("❌ Error removing workspace:", err);
      return false;
    }
  };

  const updateWorkspace = async (
    workspaceId: number,
    payload: {
      name: string;
      description: string;
      brands: string[];
      members: number[];
    }
  ): Promise<any> => {
    try {
      const res = await fetchWithAuth(`${API_URL}/workspace/update/${workspaceId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include", // ✅ send cookies automatically
      });

      
      const data = await res.json();
  
      if (!res.ok) {
        toastDestructive("Failed to update workspace" , data.error)
        console.error("❌ Failed to update workspace");
        return null;
      }
  
      return data.workspace; // backend returns { ok: true, workspace }
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      toastDestructive("Error updating workspace" , err)
      console.error("❌ Error updating workspace:", err);
      return null;
    }
  };

  const getWorkspacesForUser = async (): Promise<{ wsList: Workspace[]; brandList: Brands[] } | null> => {
    try {
  
      const res = await fetchWithAuth(
        `${API_URL}/user/${user?.id}/workspacebrand`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include", // ✅ send cookies automatically
        }
      );

        
      if (!res.ok) {
        console.error("❌ Failed to fetch workspaces for user");
        return null;
      }
  
      const data: WorkspaceBrandResponse = await res.json();
  
      // ✅ make unique workspaces
      const wsList: Workspace[] = Array.from(
        new Map(
          data.data.map((item) => [item.workspace.id, item.workspace])
        ).values()
      );
  
      // ✅ flatten brands safely
      const brandList: Brands[] = data.data
        .filter((item) => item.brand !== null)
        .map((item) => ({
          id: item.brand!.id,
          name: item.brand!.name,
          workspace_id: item.brand!.workspace_id,
          is_active: item.brand!.is_active,
          created_at: new Date(item.brand!.created_at), // cast to Date
        }));
  
      setWorkspaces(wsList);
      setBrands(brandList);
  
      return { wsList, brandList };
    } catch(err:any){
      if (err.message === "UNAUTHORIZED") {
        handleSessionExpired();
      }
      console.error("❌ Error fetching workspaces:", err);
      return null;
    }
  };
  
  return (
    <AuthContext.Provider
      value={{
        user: user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        hasPermission,
        fetchUsers,
        fetchRoles,
        fetchPlans,
        fetchManagers,
        fetchPermissions,
        fetchAllWorkspaces,
        fetchWorkspaces,
        fetchAllBrands,
        fetchBrands,
        updateUser,
        deleteUser,
        permissions,
        managers,
        plans,
        users,
        roles,
        brands,
        workspaces,
        errors,
        createUser,
        createRole,        
        updateRolePermissions,  
        updateRole,
        toggleUserStatus,
        getSubordinateCounts,
        fetchAssignableRolePermissions,
        createPlan,
        updatePlan,
        togglePlanStatus,
        deletePlan,
        fetchCurrentUser,
        createWorkspace,
        subordinates, 
        fetchSubordinates,
        addBrand,
        handleRemoveBrand,
        updateWorkspace,
        deleteWorkspace,
        removeWorkspaceMember,
        addWorkspaceMember,
        getWorkspacesForUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function   useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
