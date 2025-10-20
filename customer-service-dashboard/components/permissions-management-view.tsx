"use client"

const API_URL = process.env.NEXT_PUBLIC_API_BASE;

import * as React from "react"
import { Shield, Users, UserPlus, Crown, Key, Settings, Plus, Edit, Trash2, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {Alert} from "@/components/ui/alert" 
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/contexts/auth-context"
import { useLanguage } from "@/contexts/language-context"
import { Dropdown } from "react-day-picker"
import { useToast } from "@/components/ui/use-toast"
import dayjs from "dayjs"

interface User {
  id: number
  email: string
  name: string
  role:string
  role_id:number
  role_name:string
  plan_id?:number
  permissions: string[]
  avatar?: string
  created_at: string
  lastLogin?: string
  is_active: boolean
  department?: string
  assigned_to?: number
  label:string
}

interface Manager {
  id: number
  email: string
  name: string
  role_id: number
  role_name: string
  permissions: string[]
  createdAt: string
  lastLogin?: string
  workspace_id?: string
  plan_id?: number
  plan_name?: string
  department?:string
  is_active: boolean
  assigned_to:number
}

interface Role {
  id: number
  name: string
  displayName: string
  description: string
  permissions: string[]
  color: string
  userCount:number
  label:string
}

interface Plan {
  id: number
  name: string
  description: string
  max_workspace: number
  max_account: number
  price: number
  billing_cycle: string
  is_active: boolean 
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

export function PermissionsManagementView() {
  const { user: currentUser, roles, users ,plans, managers, fetchSubordinates,subordinates,
          fetchPermissions, fetchManagers, fetchPlans, fetchRoles, fetchUsers, createUser, hasPermission, fetchAssignableRolePermissions,
          fetchCurrentUser, updateUser, deleteUser, createRole, updateRolePermissions, updateRole, toggleUserStatus, getSubordinateCounts, 
        } = useAuth()
  const { t } = useLanguage()
  const {toast} = useToast()
  const [isUserDialogOpen, setIsUserDialogOpen] = React.useState(false)
  const [isRoleDialogOpen, setIsRoleDialogOpen] = React.useState(false)
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = React.useState(false)
  const [editingUser, setEditingUser] = React.useState<User>()
  const [editingRole, setEditingRole] = React.useState<Role | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [activeTab, setActiveTab] = React.useState<"users" | "roles">("users")
  const [name, setName] = React.useState(editingUser?.name || "")
  const [email, setEmail] = React.useState(editingUser?.email || "")
  const [department, setDepartment] = React.useState(editingUser?.department || "")
  const [roleId, setRoleId] = React.useState("");

  const [password, setPassword] = React.useState("")
  const [planId, setPlanId] = React.useState(editingUser?.plan_id?.toString() || "")
  const [isEditing, setIsEditing] = React.useState(false)
  const [managerId, setManagerId] = React.useState("")
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false)
  const [userToDelete, setUserToDelete] = React.useState<User | null>(null)
  const [isEditConfirmOpen, setIsEditConfirmOpen] = React.useState(false)
  const [isConfirmRoleOpen, setIsConfirmRoleOpen] = React.useState(false)
  const [isConfirmPermOpen, setIsConfirmPermOpen] = React.useState(false)
  const [roleKey, setRoleKey] =  React.useState("") 
  const [roleDesc, setRoleDesc] =  React.useState("")
  const [roleIcon, setRoleIcon] =  React.useState("")
  const [openDropdownUser, setOpenDropdownUser] = React.useState<number | null>(null)
  const [counts, setCounts] = React.useState<Record<number, { supervisors: number; agents: number }>>({})
  const [assignablePermissions, setAssignablePermissions] = React.useState<Permission[]>([])
  const [availablePermissions, setAvailablePermissions] = React.useState<Permission[]>([]);
  const [selectedPermissions, setSelectedPermissions] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (hasPermission("user.view")) fetchUsers(); 
    fetchCurrentUser()
    fetchPlans();
    fetchRoles();
    fetchManagers();
  }, []); 

  React.useEffect(() => {
    if (isRoleDialogOpen) {
      fetch(`${API_URL}/user/permissions/category/2`, { credentials: "include" })
        .then(res => res.json())
        .then(data => setAvailablePermissions(data.permissions || []))
        .catch(console.error);
    }
  }, [isRoleDialogOpen]);
  

  React.useEffect(() => {
    if (!isUserDialogOpen) return;
  
    if (editingUser) {
      // Ensure current manager id is set if present
      if (currentUser?.role === "MANAGER") {
        setManagerId(currentUser.id.toString());
      } else {
        setManagerId(editingUser.assigned_to?.toString() || "");
      } 

      setName(editingUser.name);
      setEmail(editingUser.email);
      setDepartment(editingUser.department || "");
      setRoleId(editingUser.role_id.toString());
      setPlanId(editingUser.plan_id?.toString() || "");
      setPassword("");
      setIsEditing(true);
    } else {
      setName("");
      setEmail("");
      setDepartment("");
      setRoleId("");
      setPlanId("");
      setManagerId("");
      setPassword("");
      setIsEditing(false);
    }
  }, [isUserDialogOpen, editingUser, managers]);
  
  React.useEffect(() => {
    if (!roles?.length) return;
    if (editingUser?.role_id) {
      setRoleId(editingUser.role_id.toString());
    } else if (!editingUser && !roleId) {
      const defaultRole = roles.find(r => r.name === "Agent");
      if (defaultRole) setRoleId(defaultRole.id.toString());
    }
  }, [roles, editingUser]);
  
  React.useEffect(() => {
    if (editingRole) {
      setRoleKey(editingRole.name || "");
      setRoleIcon(editingRole.label || "")
      setRoleDesc(editingRole.description || "");
    } else {
      setRoleKey("");
      setRoleIcon("")
      setRoleDesc("");
    }
  }, [editingRole]);

  React.useEffect(() => {
    if (editingRole) {
      setSelectedPermissions(editingRole.permissions); 
      // assuming editingRole.permissions = ["USER_READ", "USER_WRITE"]
    } else {
      setSelectedPermissions([]);
    }
  }, [editingRole]);

  React.useEffect(() => {
    if (currentUser?.role_id === 2 ) {
      fetchSubordinates(); 
    }
  }, [currentUser]); 
  
  // 检查权限
  if (!hasPermission("user.view")) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">{t("permission.insufficient")}</h3>
            <p className="text-muted-foreground">{t("permission.no_access")}</p>
          </CardContent>  
        </Card>
      </div>
    )
  }

  const fetchCounts = async (userId: number) => {
    const result = await getSubordinateCounts(userId)
    if (result) {
      setCounts((prev) => ({
        ...prev,
        [userId]: result, // ✅ store counts by user id
      }))
    }
  }

  const filteredUsers = React.useMemo(() => {
    if (!users || !currentUser) return [];
  
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase());
  
      // show managers if any exist
      const matchesRole = u.id !== currentUser.id && u.role_id === 2;
    
      return matchesSearch && matchesRole;
    });
  }, [users, currentUser, searchTerm]);
  
  const getRoleInfo = (role_name: string) => {
    if (!roles || roles.length === 0) {
      return { color: 'gray', displayName: 'Unknown' };
    }
    return roles.find((role: Role) => role.name === role_name) || { color: 'gray', displayName: 'Unknown' };
  }
  const getRoleIcon = (icon: string) => {
    switch (icon) {
      case "CROWN": 
        return <Crown className="h-4 w-4" />
      case "SHIELD":
        return <Shield className="h-4 w-4" />
      case "USERS":
        return <Users className="h-4 w-4" />
      case "AGENT":
        return <Key className="h-4 w-4" />
      default:
        return <Users className="h-4 w-4" />
    }
  }

  const permissionDenied = async () => {
    toast({title:"⚠️ Permission denied.",
      description:"你没有足够的权限进行此行动.",
      variant:"warn"
    }) 
  }

  const toastSuccess = async (title:string, description:string) => {
    toast({title: `✅ ${title}`,
      description: description,
      variant:"success"
    }) 
  }

  const toastDestructive = async (title:string, description:string) => {
    toast({title: `💥 ${title}`,
      description: description,
      variant:"destructive"
    }) 
  }

  const handleDelete = async (id: number) => {
    if (!hasPermission("user.delete")) {
      permissionDenied()
      return
    }
    
    const ok = await deleteUser(id)
    if (currentUser?.role_id === 1 && ok) {
      toastSuccess("Manager deleted successfully","The selected manager has been deleted successfully.")
      fetchUsers();
      fetchManagers();
      fetchRoles();
    } 
    else if(currentUser?.role_id === 2 && ok){
      toastSuccess("Supervisor/Agents deleted successfully", "The selected supervisor/agents has been deleted successfully.")
      fetchSubordinates();
      fetchRoles();
    }
    else {
      toastDestructive("Delete action failed", "Failed to delete the record.")
    }
  }

  const handleCreateUser = async () => {
    if (!hasPermission("user.create")) {
      permissionDenied();
      return;
    }
  
    if (!roleId) {
      alert(t("permissions.select_role"));
      return;
    }
  
    const currentUserRole = currentUser?.role_id;
    const isSuperAdmin = currentUserRole === 1;
    const isManager = currentUserRole === 2;
    const selectedRole = (roles?.find(r => r.id === Number(roleId))?.name ?? "") as string;
  
    // 🧠 Determine assigned_to logic
    let assignedTo: number | null = null;
    if (isSuperAdmin) {
      // Superadmin can assign Supervisor/Agent to any manager
      assignedTo = selectedRole === "MANAGER" ? null : (Number(managerId) || null);
    } else if (isManager) {
      // Manager auto-assigns to themselves
      assignedTo = currentUser?.id || null;
    }
  
    const result = await createUser({
      name,
      email,
      department,
      password,
      role_id: Number(roleId),
      plan_id: ["MANAGER", "SUPERADMIN"].includes(selectedRole)
        ? (planId ? Number(planId) : null)
        : null,
      assigned_to: assignedTo,
    });
  
    if (result) {
      toastSuccess("User created successfully", "The new user has been created successfully.");
      fetchUsers();
      fetchManagers();
      fetchSubordinates();
      fetchRoles();
      setName("");
      setEmail("");
      setDepartment("");
      setPassword("");
      setRoleId("");
      setPlanId("");
      setManagerId("");
      setIsUserDialogOpen(false);
    } else {
      console.log("❌ Create action failed");
    }
  };
  

  const handleSave = async () => {
    if (!hasPermission("user.edit")) {
      permissionDenied()
      return
    }

    if (!editingUser) return;
  
    const payload: any = {
      name,
      email,
      department,
      role_id: Number(roleId),
      assigned_to: managerId ? Number(managerId) : null,
    };
  
    // Only SUPERADMIN can reset MANAGER password
    if (hasPermission("user.edit") && password) {
      payload.password = password;
    }
  
    // Only MANAGER needs plan_id
    if (Number(roleId) === 2) {
      payload.plan_id = planId ? Number(planId) : null;
    } else {
      payload.plan_id = null;
    }
  
    const updatedUser = await updateUser(Number(editingUser.id), payload);
  
    if (updatedUser) {
      toastSuccess("User updated successfully", "The user has been updated successfully.")
      setIsUserDialogOpen(false);
      setPassword("");
      fetchSubordinates();
      fetchUsers();
    } else {
      console.log("Update action failed", "Failed to update new record.")
    }
  };

  const handleCreateUserClick = () => {
    setEditingUser(undefined); // clear editing state
    setIsEditing(false);
    setIsUserDialogOpen(true);
  };

  const handleEditUser = (user: User) => {
    if (!hasPermission("user.edit")) {
      permissionDenied()
      return
    }
    setEditingUser(user)
    setIsEditing(true)
    setIsUserDialogOpen(true)
  }

  const handleSaveRole = async () => {
    if (!hasPermission("account.manage")){
      permissionDenied()
      return
    }

    const formattedRoleName = roleKey.trim().toUpperCase()

    if (editingRole) {
      const updatedRole = await updateRole(editingRole.id, {
        name: formattedRoleName,
        description: roleDesc,
        label: roleIcon
      })

      if (updatedRole) {
        toastSuccess("Role updated successfully", "The role has been updated successfully.")
        fetchRoles()
      }else{
        toastDestructive("Update action failed", "Failed to update role.")
      }
    } else {
      const createdRole = await createRole({
        name: formattedRoleName,
        description: roleDesc,
        label:roleIcon,
        permissions: selectedPermissions, // 👈 Add this line

      })
      if (createdRole) {
        fetchRoles(),        // refresh updated role permissions
        fetchPermissions(),  // refresh global permission list
        fetchUsers(),        // optional: refresh users if needed
        toastSuccess("New role updated successfully", "New role has been created successfully.")
      }else{
        toastDestructive("Create action failed", "Failed to create role.")
      }
    }

    setIsRoleDialogOpen(false)
  }

  const handlePermissionToggle = (perm: Permission) => {
    if (!hasPermission("account.manage")){
      permissionDenied()
      return
    };
    setSelectedPermissions((prev) =>
      prev.includes(perm.code)
        ? prev.filter((p) => p !== perm.code)
        : [...prev, perm.code]
    );
  };

  const handleSavePermissions = async () => {
    if (!hasPermission("account.manage")) {
      permissionDenied()
      return
    }
    if (!editingRole) return;
  
    const ok = await updateRolePermissions(editingRole.id, selectedPermissions);
    if (ok) {
      toastSuccess("Role permission updated successfully", "Role permission has been updated successfully.")
      await Promise.all([
        fetchRoles(),        // refresh updated role permissions
        fetchPermissions(),  // refresh global permission list
        fetchUsers(),        // optional: refresh users if needed
      ]);
  
      if (editingRole.id === currentUser?.role_id) {
        await fetchAssignableRolePermissions(editingRole.id);
        
      }
      setIsPermissionDialogOpen(false);
    } else {
      toastDestructive("Update action failed", "Failed to update role permission.")
    }
  }

  const handleEditRolePermission = async (role: Role) => {
    if (!hasPermission("account.manage")){
      permissionDenied()
      return
    }
    setEditingRole(role);
  
    const res = await fetchAssignableRolePermissions(role.id);
    if (res?.data) {
      setAssignablePermissions(res.data);
      setSelectedPermissions(role.permissions);
    }
    setIsPermissionDialogOpen(true);
  }

  const handleToggleUserStatus = async (userId: number, isActive: boolean) => {
    if (!hasPermission("user.edit")) {
      permissionDenied()
      return
    }
    
    console.log("User status", isActive)
  
    const ok = await toggleUserStatus(userId, isActive);
    if (ok) {
      fetchUsers();
      fetchManagers();
      toastSuccess("Update status successfully", "Status of the user has been updated successfully.")
    } else {
      toastDestructive("Toggle action failed", "Failed to update status of selected user.")
    }
  }
  
  const handleCreateRole = () => {
    if (!hasPermission("account.manage")){
      permissionDenied()
      return
    }
    setEditingRole(null)
    setRoleKey("")
    setRoleIcon("")
    setRoleDesc("")
    setSelectedPermissions([]);
    setIsEditing(false)
    setIsRoleDialogOpen(true)
  }

  const handleEditRole = (role: Role) => {
    if (!hasPermission("account.manage")) {
      permissionDenied()
      return
    }
    setEditingRole(role)
    setRoleIcon(role.label)
    setIsRoleDialogOpen(true)
  }

  const activeUsers = (users || []).filter((user) => user.is_active).length;
  const totalUsers = (users || []).length;
  const activeManagers = managers.filter((m) => m?.is_active);
  console.log(totalUsers)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-2xl font-bold">{t("permissions.title")}</h1>
            <p className="text-muted-foreground">{t("permissions.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission("user.create") && (
            <Button onClick={() => {
              handleCreateUserClick() 
            }}>
              <UserPlus className="h-4 w-4 mr-2" />
              {t("permissions.create_user")}
            </Button>
          )}
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("permissions.total_users")}</p>
                <p className="text-2xl font-bold">{totalUsers}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("permissions.active_users")}</p>
                <p className="text-2xl font-bold text-green-600">{activeUsers}</p>
              </div>
              <UserPlus className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("permissions.total_roles")}</p>
                <p className="text-2xl font-bold text-blue-600">{roles.length}</p>
              </div>
              <Shield className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("permissions.permission_items")}</p>
                <p className="text-2xl font-bold text-purple-600">{currentUser?.permissions.length}</p>
              </div>
              <Key className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 标签页切换 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant={activeTab === "users" ? "default" : "outline"} onClick={() => setActiveTab("users")}>
            <Users className="h-4 w-4 mr-2" />
            {t("permissions.user_management")}
          </Button>
          <Button variant={activeTab === "roles" ? "default" : "outline"} onClick={() => setActiveTab("roles")}>
            <Shield className="h-4 w-4 mr-2" />
            {t("permissions.role_management")}
          </Button>
        </div>
      </div>

      {activeTab === "users" && (
        <>
          {/* 搜索和筛选 */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("permissions.search_placeholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* 用户列表 */}
          <Card>
            <CardHeader>
              <CardTitle>{t("permissions.user_list")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {(currentUser?.role === "SUPERADMIN" ? filteredUsers :  subordinates).map((user) => {
                  console.log("user status", user.is_active)
                  const roleInfo = getRoleInfo(user.name)
                  return (
                    <div key={user.id} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12">
                            {/* <AvatarImage src={user.avatar || "/placeholder.svg"} /> */}
                            <AvatarFallback>{user.name[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{user.name}</h3>
                              {user.id === currentUser?.id && (
                                <Badge variant="outline" className="text-xs">
                                  {t("permissions.current_user")}
                                </Badge>
                              )}
                              {!user?.is_active && (
                                <Badge variant="secondary" className="text-xs">
                                  {t("permissions.disabled")}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">{user.email}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {currentUser?.role_id === 1 ? (
                              <>
                                <span>{t("permissions.role")}: {t(`user.role.${user.role_name?.toLowerCase() || 'agent'}`)}</span>
                                <span>{t("permissions.merchant")}: {user.department || '-'}</span>
                                <span>{t("permissions.plan")}: {user.plan_name || '-'}</span>
                              </>
                            ): (
                              <>
                                <span>{t("permissions.role")}: {t(`user.role.${user.role_name?.toLowerCase() || 'agent'}`)}</span>
                                <span>{t("permissions.department")}: {user.department || '-'}</span>
                                <span>{t("permissions.created")}: {dayjs(user.created_at).format("YYYY-MM-DD HH:mm:ss")}</span>
                              </>
                            )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="flex items-center gap-2 mb-1">
                              {getRoleIcon(user.label)}
                              <Badge className={`${roleInfo.color} text-white text-xs`}>{user.role_name}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {user.name === "SUPERADMIN" ? t("permissions.all_permissions") : `${user.permissions.length || 0} ${t("permissions.permissions_count")}`} 
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasPermission("user.edit") && (
                              <Switch
                                checked={user.is_active}
                              
                                onCheckedChange={(checked) => handleToggleUserStatus(user.id, checked)}
                                //disabled={user.id === currentUser?.id}
                              />
                            )}
                            {hasPermission("user.edit") && (
                              <Button variant="ghost" size="sm" onClick={() => handleEditUser(user)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {openDropdownUser === user.id && (
                              <div className="mt-3 space-y-2 text-xs">
                                <div className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2">
                                  <span className="flex items-center gap-2">
                                    👑 <span className="font-medium">Supervisors </span>
                                  </span>
                                  <span className="ml-4 font-semibold text-blue-600">
                                    {counts[user.id]?.supervisors ?? "0"}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2">
                                  <span className="flex items-center gap-2">
                                    🧑‍💼 <span className="font-medium">Agents </span>
                                  </span>
                                  <span className="ml-4 font-semibold text-green-600">
                                    {counts[user.id]?.agents?? "0"}
                                  </span>
                                </div>
                              </div>
                            )}
                            {currentUser?.role_id === 1 && hasPermission("user.view") && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                if (openDropdownUser === user.id) {
                                  setOpenDropdownUser(null)
                                } else {
                                  setOpenDropdownUser(user.id)
                                  fetchCounts(user.id)
                                }
                              }}
                            >
                              下属
                            </Button>
                            )}
                            {hasPermission("user.delete") && user.id !== currentUser?.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  setUserToDelete(user)
                                  setIsDeleteConfirmOpen(true)
                                }}
                              >
                              <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      
      <Dialog open={isEditConfirmOpen} onOpenChange={setIsEditConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("common.confirm")} {t("common.save")} {t("common.changes")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("permissions.confirm_save_changes")} <span className="font-medium">{editingUser?.name}</span>?
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsEditConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={async () => {
                setIsEditConfirmOpen(false)
                setIsUserDialogOpen(false)
                handleSave()
              }}
            >
              {t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("permissions.confirm_delete_user")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("permissions.confirm_delete_user_message")} <span className="font-medium">{userToDelete?.name}</span>? {t("permissions.confirm_delete_user_warning")}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (userToDelete) {
                  await handleDelete(Number(userToDelete.id))
                  setIsDeleteConfirmOpen(false)
                  setUserToDelete(null)
                }
              }}
            >
              删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {activeTab === "roles" && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("permissions.role_management")}</h2>
            {hasPermission("account.manage") && (
              <Button onClick={handleCreateRole}>
                <Plus className="h-4 w-4 mr-2" />
                {t("common.create")} {t("permissions.role_management")}
              </Button>
            )}
          </div>
            {t("permissions.role_list")} 
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {!roles || roles.length === 0 ? (
            <div>{t("common.loading")}...</div>
          ) : (
            roles
              .filter((role) => {
                if (!role || !role.id) return false;

                if (currentUser?.role_id === 2) {
                  if(role.is_system_role === true)
                    return false;
                  if ((role.created_by !== null && role.created_by !== currentUser.id) && role.created_by != 1) return false; // hide roles created by other managers
                }

                return true;
              })
              .map((role) => (
                <Card key={role.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(role.label)}
                        <CardTitle className="text-lg">{role.name}</CardTitle>
                      </div>
                      <Badge className={`${role.color} text-white`}>{role.userCount} {t("permissions.users_suffix")}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{role.description}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{t("permissions.permissions_count_label")}</span>
                        <span className="font-medium">
                          {role.id === 1 ? t("permissions.all_permissions") : `${role.permissions?.length ?? 0} ${t("permissions.permissions_count")}`}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>{t("permissions.users_count_label")}</span>
                        <span className="font-medium">{role.userCount}</span>
                      </div>
                    </div>
                    {hasPermission("account.manage") && (
                      <div className="flex gap-2 mt-4">
                        <Button
                          disabled={currentUser?.role_id !== 1 && currentUser?.id !== role.created_by}
                          variant="outline"
                          size="sm"
                          className="flex-1 bg-transparent"
                          onClick={() => handleEditRole(role)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          {t("permissions.edit")}
                        </Button>
                        <Button 
                          disabled={currentUser?.role_id !== 1 && currentUser?.id !== role.created_by}
                          variant="outline" 
                          size="sm" 
                          className="flex-1 bg-transparent"
                          onClick={() => handleEditRolePermission(role)}
                        >
                          <Settings className="h-3 w-3 mr-1" />
                          {t("permissions.permissions")}
                        </Button>
                      </div>
                    )}
                  </CardContent>  
                </Card>
              ))
          )}
          </div>
        </>
      )}

      {/* 创建/编辑用户对话框 */}
      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? t("common.edit") + " " + t("permissions.user_management") : t("common.create") + " " + t("permissions.user_management")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-name">{t("permissions.name")}</Label>
              <Input id="user-name" placeholder={t("permissions.enter_user_name") + "..."} value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-email">{t("permissions.email")}</Label>
              <Input
                id="user-email"
                type="email"
                placeholder={t("permissions.enter_email") + "..."}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-department">{currentUser?.role === "SUPERADMIN" ? t("permissions.merchant") : t("permissions.department")}</Label>
              <Input id="user-department" placeholder={t("permissions.department_placeholder")} value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t("permissions.role")}</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles
                  .filter((role) => {
                    if (!role || !role.name) return false;

                    if (currentUser?.role_id === 2 && (role.name === "SUPERADMIN" || role.name === "MANAGER")){
                      return false;
                    }
                    return true;
                  })
                  .map((role) => (
                    <SelectItem key={role.id} value={role.id.toString() }>
                      <div className="flex items-center gap-2">
                        {role.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(() => {
              if (!roleId) {
                // No role selected yet → hide all role-dependent fields
                return null;
              }
              const selectedRole = (roles?.find(r => r.id === Number(roleId))?.name ?? "") as string;
              const currentUserRole = currentUser?.role_id;
              const isSuperAdmin = currentUserRole === 1;
              const isManager = currentUserRole === 2;
              // === SUPERADMIN CASE ===
              if (isSuperAdmin) {
                return (
                  <>
                    {/* If creating Manager or Superadmin → Show Plan */}
                    {["MANAGER", "SUPERADMIN"].includes(selectedRole) && (
                      <div className="space-y-2">
                        <Label>Plan</Label>
                        <Select value={planId} onValueChange={setPlanId}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("plans.plan_name")} />
                          </SelectTrigger>
                          <SelectContent>
                            {plans.length > 0 ? (
                              plans
                                .filter((plan) => plan.is_active)
                                .map((plan) => (
                                  <SelectItem key={plan.id} value={plan.id.toString()}>
                                    {plan.name}
                                  </SelectItem>
                                ))
                            ) : (
                              <SelectItem disabled value="no-plans">
                                没有可用的计划
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* If creating Supervisor/Agent → Assign to a Manager */}
                    {!["MANAGER", "SUPERADMIN"].includes(selectedRole) && (
                      <div className="space-y-2">
                        <Label>{t("permissions.manager")}</Label>
                        <Select value={managerId} onValueChange={setManagerId}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("permissions.manager")}>
                              {managerId
                                ? managers.find((m) => String(m.id) === managerId)?.name
                                : t("permissions.manager")}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {activeManagers.length > 0 ? (
                              activeManagers.map((manager) => (
                                <SelectItem key={manager.id} value={manager.id.toString()}>
                                  {manager.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem disabled value="no-managers">
                                {t("permissions.no_managers_available")}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                );
              }

              // === MANAGER CASE ===
              if (isManager) {
                return null; // no manager dropdown, auto-assign to self
              }

              // === Default (other roles, rare) ===
              return (
                <div className="space-y-2">
                  <Label>{t("permissions.manager")}</Label>
                  <Select value={managerId} onValueChange={setManagerId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("permissions.manager")}>
                        {managerId
                          ? managers.find((m) => String(m.id) === managerId)?.name
                          : t("permissions.manager")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {activeManagers.length > 0 ? (
                        activeManagers.map((manager) => (
                          <SelectItem key={manager.id} value={manager.id.toString()}>
                            {manager.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem disabled value="no-managers">
                          {t("permissions.no_managers_available")}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}

            {isEditing && (
              <div className="space-y-2">
                <Label htmlFor="user-password">{t("permissions.reset_password")}</Label>
                <Input
                  id="user-password"
                  type="password"
                  placeholder={t("permissions.enter_new_password") + "..."}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {!isEditing && (
              <div className="space-y-2">
                <Label htmlFor="user-password">{t("permissions.password")}</Label>
                <Input
                  id="user-password"
                  type="password"
                  placeholder={t("permissions.password") + "..."}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsUserDialogOpen(false) }>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (isEditing) {
                    setIsEditConfirmOpen(true)
                  } else {
                    handleCreateUser()
                  }
                }}
              >
                {isEditing ? t("common.save") : t("common.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 创建/编辑角色对话框 */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingRole ? t("common.edit") + " " + t("permissions.role_management") : t("common.create") + " " + t("permissions.role_management")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">{t("permissions.role_name")}</Label>
                <Input id="role-name" placeholder={t("permissions.enter_role_name") + "..."} value={roleKey} onChange={(e) => setRoleKey(e.target.value)}/>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-id">{t("permissions.role_identifier")}</Label>
                <Select value={roleIcon} onValueChange={(val) => setRoleIcon(val)}>
                  <SelectTrigger id="role-icon" className="w-[180px]">
                    <SelectValue placeholder={t("permissions.select_role")}>
                      {roleIcon ? getRoleIcon(roleIcon) : t("permissions.select_role")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CROWN">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4" />
                      </div>
                    </SelectItem>

                    <SelectItem value="SHIELD">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                      </div>
                    </SelectItem>

                    <SelectItem value="USERS">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                      </div>
                    </SelectItem>

                    <SelectItem value="KEY">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-description">{t("permissions.role_description")}</Label>
              <Input
                id="role-description"
                placeholder={t("permissions.enter_role_description") + "..."}
                value={roleDesc}
                onChange={(e) => setRoleDesc(e.target.value)}
              />
            </div>

            {!editingRole && (
              <div className="space-y-2">
                <Label>{availablePermissions[0]?.category_name}</Label>
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto border rounded-md p-3">
                  {availablePermissions.map((perm) => (
                    <div key={perm.code} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={perm.code}
                        checked={selectedPermissions.includes(perm.code)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPermissions((prev) => [...prev, perm.code]);
                          } else {
                            setSelectedPermissions((prev) =>
                              prev.filter((p) => p !== perm.code)
                            );
                          }
                        }}
                        className="h-4 w-4"
                      />
                      <label htmlFor={perm.code} className="text-sm">
                        {perm.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRoleDialogOpen(false)}
              >
                {t("common.cancel")}
              </Button>

              {/* Create Mode */}
              {!editingRole ? (
                <Button
                  onClick={() => {
                    if (selectedPermissions.length === 0) {
                      toastDestructive(
                        t("permissions.missing_permissions"),
                        t("permissions.please_select_at_least_one")
                      );
                      return;
                    }
                    setIsConfirmRoleOpen(true);
                  }}
                >
                  {t("common.create")}
                </Button>
              ) : (
                /* Edit Mode */
                <Button onClick={() => setIsConfirmRoleOpen(true)}>
                  {t("common.save")}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isConfirmRoleOpen} onOpenChange={setIsConfirmRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.confirm")} {t("common.operation")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {editingRole ? t("permissions.confirm_update_role") : t("permissions.confirm_create_new_role")}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsConfirmRoleOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                setIsConfirmRoleOpen(false)
                handleSaveRole()
              }}
            >
              {t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPermissionDialogOpen} onOpenChange={setIsPermissionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRole ? t("common.edit") + " " + t("permissions.role_management") : t("common.create") + " " + t("permissions.role_management")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
              <Label>{t("permissions.permissions_configuration")}</Label>
              <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
                {Object.entries(
                  assignablePermissions.reduce(
                    (group, permission) => {
                      if (!group[permission.category_name]) {
                        group[permission.category_name] = []
                      }
                      group[permission.category_name].push(permission)
                      return group
                    },
                    {} as Record<string, typeof assignablePermissions>,
                  ),
                ).map(([category, perms]) => (
                  <div key={category} className="space-y-2">
                    <h4 className="font-medium text-sm">{t(`permissions.category.${category}`) || category}</h4>
                    <div className="grid grid-cols-2 gap-2 ml-4">
                      {perms.map((perm) => (
                        <div key={perm.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`perm-${perm.id}`}
                            checked={selectedPermissions.includes(perm.code)}
                            onCheckedChange={() => handlePermissionToggle(perm)}
                            // defaultChecked={
                            //   editingRole?.permissions.includes(permission.name) || editingRole?.permissions.includes("*")
                            // }
                          />
                          <Label htmlFor={`perm-${perm.id}`} className="text-sm">
                            {t(`permissions.${perm.code.split('.')[0]}.${perm.code.split('.')[1]}`) || perm.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <Separator className="my-3" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsPermissionDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => setIsConfirmPermOpen(true) }>{t("permissions.save")}</Button>
            </div>
        </DialogContent>
      </Dialog> 

      <Dialog open={isConfirmPermOpen} onOpenChange={setIsConfirmPermOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.confirm")} {t("common.operation")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("permissions.confirm_update_permissions")}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsConfirmPermOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                setIsConfirmPermOpen(false)
                handleSavePermissions()
              }}
            >
              {t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog> 

    </div>
  )
}
