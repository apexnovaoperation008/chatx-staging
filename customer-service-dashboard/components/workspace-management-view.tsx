"use client"

import * as React from "react"
import { Shield, Users, UserPlus, Crown, Key, Settings, Plus, Edit, Trash2, Search, EditIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/contexts/auth-context"
import { useLanguage } from "@/contexts/language-context"
import { Accordion, AccordionContent, AccordionTrigger, AccordionItem } from "@/components/ui/accordion"
import { useToast } from "@/components/ui/use-toast"

interface User {
  id: number
  email: string
  name: string
  role_name?:string
  role_id:number
  plan_id?:number
  permissions: string[]
  avatar?: string
  createdAt: string
  lastLogin?: string
  isActive: boolean
  department?: string
  assigned_to?: number
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
  isActive: boolean
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
  id?: number;
  name?: string;
  description?: string;
  manager_id: number; // Manager
  is_active?: boolean;
  created_at?: string;
  brands: Brand[];
  members?: Member[];
}

export function WorkspacesManagementView() {
  const { user: currentUser, users , managers, brands, workspaces, subordinates, errors, createWorkspace,
          deleteWorkspace,fetchCurrentUser, updateWorkspace,fetchAllWorkspaces,
          fetchManagers, fetchRoles, fetchUsers, fetchWorkspaces, hasPermission, fetchSubordinates,fetchBrands, fetchAllBrands,} = useAuth()
  const { toast } = useToast()
  const { t } = useLanguage()
  const [searchTerm, setSearchTerm] = React.useState("")

  const createEmptyWorkspace = (managerId: number): Workspace => ({
    name: "",
    description: "",
    manager_id: managerId,
    is_active: true,
    created_at: new Date().toISOString(),
    brands: [],
    members: []
  });

  const [editingWorkspace, setEditingWorkspace] = React.useState<Workspace | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = React.useState<number | null>(null);

  const [isAddBrandDialog, setIsAddBrandDialog] = React.useState(false);
  const [isAddMemberDialog, setIsAddMemberDialog] = React.useState(false);

  const [isWorkspaceDialogOpen, setIsWorkspaceDialogOpen] = React.useState(false);
  const [newBrandName, setNewBrandName] = React.useState("");
  const [targetWorkspaceId, setTargetWorkspaceId] = React.useState<number | null>(null);

  const [isConfirmBrandCreatedDialog, setIsConfirmBrandCreatedDialog] = React.useState(false);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editingBrand, setEditingBrand] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [isEditConfirmOpen, setIsEditConfirmOpen] = React.useState(false);
  const [selectedSupervisors, setSelectedSupervisors] = React.useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = React.useState<string[]>([]);
  const [selectedMemberId, setSelectedMemberId] = React.useState<number | null>(null);


  const [open, setOpen] = React.useState<number | null>(null)
  

  React.useEffect(() => {
    if (!hasPermission("workspace.manage")) {
      fetchAllWorkspaces();
      fetchAllBrands();
    }else{
      fetchRoles(); // Fetch roles logic here
      fetchSubordinates();
      fetchWorkspaces();
      fetchBrands();
    }
    fetchUsers(); // Fetch users logic here
    fetchCurrentUser();
    fetchManagers()
  },[])

  // 检查权限
  if (!hasPermission("user.view")) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">权限不足</h3>
            <p className="text-muted-foreground">您没有权限访问此页面</p>
          </CardContent>  
        </Card>
      </div>
    )
  }

  const filteredWorkspace = workspaces.filter((ws) => {
    const matchesSearch =
      ws.name.toLowerCase().includes(searchTerm.toLowerCase()) 

    return matchesSearch 
  })


  const handleDeleteWorkspace = async (workspaceId: number) => {
    const success = await deleteWorkspace(workspaceId);
    if (success) {
      fetchWorkspaces(); // REFRESH WORKSPACES
      fetchBrands();
      toast({
        title: "✅ Workspace deleted",
        description: "Your workspace has been deleted successfully.",
        variant:success
      });
    }
  }; 

  const handleSave = async () => {
    if (!editingWorkspace) return;
  
    try {  
      if (editingWorkspace.id && isEditing) {
        // Existing workspace → update API
        const payload = {
          id: editingWorkspace.id,
          name: editingWorkspace.name ?? "",
          description: editingWorkspace.description ?? "",
          brands: editingWorkspace.brands.map((b) => b.name),
          members: (editingWorkspace.members ?? []).map((m) => m.user_id),
        };
        
        await updateWorkspace(editingWorkspace.id, payload);
        
        toast({
          title: "✅ Workspace updated",
          description: "Your workspace has been updated successfully.",
          variant:"success"
        });
        
      } else {
        // New workspace → create API
        const payload = {
          id: editingWorkspace.id,
          name: editingWorkspace.name ?? "",
          description: editingWorkspace.description ?? "",
          manager_id: editingWorkspace.manager_id,
          brands: editingWorkspace.brands.map((b) => b.name),
          members: (editingWorkspace.members ?? []).map((m) => m.user_id),
        };
        
        const result = await createWorkspace(payload);
        // Check if it's an error string
        console.log("result string",result)
        if (typeof result === "string") {
          toast({
            title: "💥 Error",
            description: result,
            variant: "destructive",
          });
          return;
        }
        console.log("result error",result.error)
        // Check if it's an error object
        if (result?.error) {
          toast({
            title: "💥 Error",
            description: result.error,
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "✅ Workspace created",
          description: "Your workspace has been created successfully.",
          variant:"success"
        });
      }
  
      // Refresh list after save (only runs if no error)
      await fetchWorkspaces();
      await fetchBrands();
  
      // Reset editing state
      setEditingWorkspace(null);
      setEditingWorkspaceId(null);
      setIsWorkspaceDialogOpen(false);
  
    } catch (error) {
      console.error("❌ Caught error in try-catch:", error);
      
      // Show error toast for unexpected errors
      toast({
        title: "💥 Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const handleOpenCreate = () => {
    setEditingWorkspace(null);
    setSelectedSupervisors([]);
    setSelectedAgents([]);
    setIsEditing(false);
    setIsWorkspaceDialogOpen(true);
  };
  
  // Add a new brand locally
  const handleAddBrandLocal = (brandName: string) => {
    setEditingWorkspace((prev) => {
      if (!prev) {
        return {
          ...createEmptyWorkspace(currentUser?.id ?? 0),
          brands: [{ id: Date.now(), name: brandName }],
        };
      }
      return {
        ...prev,
        brands: [
          ...prev.brands,
          { id: Date.now(), name: brandName }, // temporary local id
        ],
      };
    });
  };

  // Remove brand locally
  const handleRemoveBrandLocal = (brandId: number) => {
    setEditingWorkspace((prev) =>
      prev
        ? { ...prev, brands: prev.brands.filter((b) => b.id !== brandId) }
        : prev
    );
  };

  // Add a member locally
  const handleAddMemberLocal = (userId: number, name: string) => {
    setEditingWorkspace((prev) =>
      prev
        ? {
            ...prev,
            members: [
              ...(prev.members ?? []),
              { user_id: userId, name, is_active: true, role_in_workspace: "MEMBER" },
            ],
          }
        : prev
    );
  };

  // Remove member locally
  const handleRemoveMemberLocal = (userId: number) => {
    setEditingWorkspace((prev) =>
      prev
        ? {
            ...prev,
            members: (prev.members ?? []).filter((m) => m.user_id !== userId),
          }
        : prev
    );
  };

  const brandCount = (brands || []).length;
  
  const supervisor = (subordinates || []).filter((user) => user.role_name == "SUPERVISOR" )
                              .filter((user) => user.is_active == true).length;
  const agents = (subordinates || []).filter((user) => user.role_name == "AGENT" )
                                  .filter((user) => user.is_active == true).length;

  const supervisorLists = (subordinates || []).filter((u) => u.role_name === "SUPERVISOR" && u.is_active);
  const agentLists = (subordinates || []).filter((u) => u.role_name === "AGENT" && u.is_active);  

  const allSupervisors = (users || []).filter((user) => user.role_id == 3).length
  const allAgents = (users || []).filter((user) => user.role_id == 4).length

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
            <SidebarTrigger />
            <div>
                <h1 className="text-2xl font-bold">{t("workspace.title")}</h1>
            </div>
            </div>
            <div className="flex items-center gap-2">
            {currentUser?.role_id == 2 && hasPermission("user.create") && (
                <Button onClick={() => {
                handleOpenCreate()
              }}>
                <Plus className="h-4 w-4 mr-2" />
                {t("workspace.create_workspace")}
                </Button>
            )}
            </div>
        </div>

      {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("workspace.total_workspace")}</p>
                <p className="text-2xl font-bold">{workspaces.length}</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("workspace.total_brand")}</p>
                <p className="text-2xl font-bold">{brandCount}</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("workspace.total_supervisor")}</p>
                <p className="text-2xl font-bold">{currentUser?.role_id == 1 ? allSupervisors : supervisor }</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("workspace.total_agent")}</p>
                <p className="text-2xl font-bold">{currentUser?.role_id == 1 ? allAgents : agents}</p>
                </CardContent>
            </Card>
        </div>

        <div className="relative w-full max-w-lg my-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder={t("workspace.search_placeholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
            />
        </div>

        <Card>
        <CardHeader>
          <CardTitle>{t("workspace.workspace_list")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredWorkspace.map((ws, idx) => {

            const manager = (managers || []).find((m) => m.id === Number(ws.manager_id));
            const managerName = manager?.name
            const isOpen = open === idx

            return (
              <div key={ws.id} className="p-4 hover:bg-muted/50 transition-colors">
                <div
                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-muted/50 transition"
                  onClick={() => setOpen(isOpen ? null : idx)}
                >
                  <div className="space-y-1">
                    {/* Workspace name */}
                    <h2 className="text-lg font-bold">{ws.name}</h2>

                    {/* Metadata */}
                    <p className="text-xs font-bold">
                      {t("workspace.created_by")} <span className="font-medium">{managerName}</span>
                    </p>
                  </div>
                  <span className="text-xl font-bold">{isOpen ? "×" : "+"}</span>
                </div>

                {isOpen && (
                <div className="mt-4 space-y-4 bg-muted/30 rounded-md p-4">
                  {editingWorkspaceId === ws.id ? (
                    // EDIT MODE
                    <div className="space-y-3">
                      {/* Workspace Name */}
                      <div>
                        <Label>{t("workspace.workspace_name")}</Label>
                        <Input
                          value={editingWorkspace?.name ?? ""}
                          onChange={(e) => setEditingWorkspace(prev => prev ? { ...prev, name: e.target.value } : prev)}
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <Label>{t("workspace.description")}</Label>
                        <Textarea
                          value={editingWorkspace?.description ?? ""}
                          onChange={(e) => setEditingWorkspace(prev => prev ? { ...prev, description: e.target.value } : prev)}
                        />
                      </div>

                      {/* Brands */}
                      <div>
                        <div className="flex justify-between items-center">
                          <Label>{t("workspace.brands")}</Label>
                          <Button size="icon" variant="ghost" onClick={() => {
                            setNewBrandName("");
                            setIsAddBrandDialog(true);
                          }}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {editingWorkspace?.brands?.map((b) => (
                            <div key={b.id} className="flex items-center gap-1 px-2 py-1 rounded bg-muted">
                              <Input
                                className="w-24"
                                value={b.name}
                                onChange={(e) =>
                                  setEditingWorkspace((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          brands: prev.brands.map((x) =>
                                            x.id === b.id ? { ...x, name: e.target.value } : x
                                          ),
                                        }
                                      : prev
                                  )
                                }
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleRemoveBrandLocal(b.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Team Members */}
                      <div>
                        <div className="flex justify-between items-center">
                          <Label>{t("workspace.team_members")}</Label>
                          <Button size="icon" variant="ghost" onClick={() =>{
                            setTargetWorkspaceId(ws.id)
                            setIsAddMemberDialog(true);
                          }}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {editingWorkspace?.members?.map((m) => (
                            <div key={m.user_id} className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10">
                              <Input
                                className="w-24"
                                value={m.name}
                                disabled={true}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleRemoveMemberLocal(m.user_id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Save/Cancel */}
                      <div className="flex gap-2 pt-4">
                        <Button variant="outline" onClick={() => {
                          setEditingWorkspace(null);
                          setEditingWorkspaceId(null);
                        }}>{t("workspace.cancel")}</Button>
                        <Button onClick={() => {setIsEditConfirmOpen(true);}}>{t("workspace.save")}</Button>
                      </div>
                    </div>
                  ) : (
                    // VIEW MODE
                    <>
                      <p className="text-sm">
                        <strong>{t("workspace.description")}:</strong>{" "}
                        {ws.description || t("workspace.no_description")}
                      </p>

                      {/* Brands */}
                      <div>
                        <h4 className="text-sm font-semibold">{t("workspace.brands")}</h4>
                        {ws.brands?.length ? (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {ws.brands.map((b) => (
                              <span
                                key={b.id}
                                className="px-2 py-1 rounded-md text-sm bg-muted text-muted-foreground"
                              >
                                {b.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-2">{t("workspace.no_brands")}</p>
                        )}
                      </div>

                      {/* Members */}
                      <div>
                        <h4 className="text-sm font-semibold">{t("workspace.members_count")} ({ws.members?.length || 0})</h4>
                        {ws.members?.length ? (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {ws.members.map((m) => (
                              <span
                                key={m.user_id}
                                className="px-2 py-1 rounded-md text-sm bg-primary/10 text-primary"
                              >
                                {m.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-2">{t("workspace.no_members")}</p>
                        )}
                      </div>

                      {currentUser?.role_id == 2 && (
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            {hasPermission("user.edit") && (
                              <Button variant="ghost" size="sm" onClick={() => {
                                setIsEditing(true)
                                setEditingWorkspace(JSON.parse(JSON.stringify(ws)));
                                setEditingWorkspaceId(ws.id);

                              }}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}

                            {hasPermission("user.delete") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  setTargetWorkspaceId(ws.id);
                                  setIsDeleteConfirmOpen(true)

                                }}
                              >
                              <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("workspace.confirm_delete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("workspace.delete_warning").replace("{workspace}", workspaces.find(w => w.id === targetWorkspaceId)?.name || "")}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => {
              setIsDeleteConfirmOpen(false);
              setIsConfirmBrandCreatedDialog(false);
            }}>
              {t("workspace.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (targetWorkspaceId) {
                  handleDeleteWorkspace(workspaces.find(w => w.id === targetWorkspaceId)?.id!)
                  setIsDeleteConfirmOpen(false)
                }
              }}
            >
              {t("workspace.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddBrandDialog} onOpenChange={setIsAddBrandDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingBrand ? t("workspace.edit_brand") : t("workspace.create_new_brand")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brand-name">{t("workspace.brand_name")}</Label>
                <Input  id="brand-name"
                  placeholder={t("workspace.enter_brand_name")}
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}/>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddBrandDialog(false)}>
                {t("workspace.cancel")}
              </Button>
              <Button onClick={() => {
                if (newBrandName.trim()) {
                  handleAddBrandLocal(newBrandName.trim());
                  setNewBrandName("");
                  setIsAddBrandDialog(false);
                }
              }}>
                {editingBrand ? t("workspace.save") : t("workspace.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddMemberDialog} onOpenChange={setIsAddMemberDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("workspace.add_team_member")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-select">{t("workspace.select_subordinate")}</Label>
            <select
              id="member-select"
              className="w-full border rounded px-2 py-1"
              value={selectedMemberId || ""}
              onChange={(e) => setSelectedMemberId(Number(e.target.value))}
            >
              <option value="" disabled>
                {t("workspace.choose_user")}
              </option>
              {subordinates
                .filter((sub) => {
                  const ws = workspaces.find((w) => w.id === targetWorkspaceId);
                  return !ws?.members?.some((m) => m.user_id === sub.id);
                })
                .map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddMemberDialog(false)}
            >
              {t("workspace.cancel")}
            </Button>
            <Button
              onClick={() =>{ if (selectedMemberId) {
                  const member = subordinates.find((s) => s.id === selectedMemberId);
                  if (member) {
                    handleAddMemberLocal(member.id, member.name);
                  }
                  setSelectedMemberId(null);
                  setIsAddMemberDialog(false);
                }
              }}
              disabled={!selectedMemberId}
            >
              {t("workspace.add")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={isEditConfirmOpen} onOpenChange={setIsEditConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("workspace.confirm_edit")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("workspace.edit_warning").replace("{workspace}", workspaces.find(w => w.id === targetWorkspaceId)?.name || "")}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => {
              setIsWorkspaceDialogOpen(false);
              setIsConfirmBrandCreatedDialog(false);
            }}>
              {t("workspace.cancel")}
            </Button>
            <Button
              onClick={async () => {
                setIsEditConfirmOpen(false);
                handleSave()
              }}
            >
              {t("workspace.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isWorkspaceDialogOpen} onOpenChange={setIsWorkspaceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("workspace.create_workspace")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="workspace-name">{t("workspace.display_name")}</Label>
              <Input
                  id="workspace-name"
                  placeholder={t("workspace.enter_workspace_name")}
                  value={editingWorkspace?.name || ""}
                onChange={(e) =>
                  setEditingWorkspace((prev) => ({
                    ...(prev ?? createEmptyWorkspace(currentUser?.id ?? 0)),
                    name: e.target.value,
                  }))
                }
                />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="workspace-description">{t("workspace.description")}</Label>
              <Input
                id="workspace-description"
                placeholder={t("workspace.enter_workspace_description")}
                value={editingWorkspace?.description || ""}
                onChange={(e) =>
                  setEditingWorkspace((prev) => ({
                    ...(prev ?? createEmptyWorkspace(currentUser?.id ?? 0)),
                    description: e.target.value,
                  }))
                }
              />
            </div>

           
            {/* Brands Section */}
            <div className="space-y-2 mt-6">
              <Label htmlFor="workspace-brands">{t("workspace.brands")}</Label>
              <div className="flex items-center gap-2">
                <div className="flex flex-wrap gap-2">
                {editingWorkspace?.brands?.map((b) => (
                  <div key={b.id} className="px-2 py-1 bg-gray-800 text-white rounded-md text-sm flex items-center gap-1">
                    {b.name}
                    <button
                      className="text-red-500 text-xs ml-1"
                      onClick={() =>
                        setEditingWorkspace((prev) => ({
                          ...(prev ?? createEmptyWorkspace(currentUser?.id ?? 0)),
                          brands: (prev?.brands ?? []).filter((brand) => brand.id !== b.id),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}

                </div>

                {/* Plus Button for new Brand */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddBrandDialog(true)}
                  className="rounded-full w-8 h-8 p-0 text-lg"
                >
                  +
                </Button>
              </div>
            </div>
            {/* Members Section (Supervisors & Agents Combined) */}
            <div className="space-y-2 mt-6">
              <Label>{t("workspace.select_members")}</Label>
              <Select
                onValueChange={(val) => {
                  const [role, userId] = val.split("-"); // e.g. SUPERVISOR-1 or AGENT-2
                  const idNum = Number(userId);

                  if (!editingWorkspace?.members?.some((m) => m.user_id === idNum)) {
                    const member =
                      role === "SUPERVISOR"
                        ? supervisorLists.find((s) => s.id === idNum)
                        : agentLists.find((a) => a.id === idNum);

                    if (member) {
                      setEditingWorkspace((prev) => ({
                        ...(prev ?? createEmptyWorkspace(currentUser?.id ?? 0)),
                        members: [
                          ...(prev?.members ?? []),
                          {
                            user_id: member.id,
                            name: member.name,
                            is_active: true,
                            role_in_workspace: role as "SUPERVISOR" | "AGENT",
                          },
                        ],
                      }));
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("workspace.select_members")} />
                </SelectTrigger>
                <SelectContent>
                  {supervisorLists.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                        Supervisors
                      </div>
                      {supervisorLists.map((sup) => (
                        <SelectItem key={`sup-${sup.id}`} value={`SUPERVISOR-${sup.id}`}>
                          {sup.name}
                        </SelectItem>
                      ))}
                    </>
                  )}

                  {agentLists.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 mt-2">
                        Agents
                      </div>
                      {agentLists.map((agent) => (
                        <SelectItem key={`agent-${agent.id}`} value={`AGENT-${agent.id}`}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </>
                  )}

                  {supervisorLists.length === 0 && agentLists.length === 0 && (
                    <div className="px-2 py-1 text-gray-500 text-sm">
                      {t("workspace.no_members")}
                    </div>
                  )}
                </SelectContent>
              </Select>

              {/* Selected Members */}
              <div className="flex flex-wrap gap-2 mt-2">
                {editingWorkspace?.members?.map((member) => (
                  <div
                    key={member.user_id}
                    className="px-2 py-1 bg-gray-800 text-white rounded-md text-sm flex items-center gap-1"
                  >
                    <span>
                      {member.name}{" "}
                      <span className="text-white text-xs">
                        ({member.role_in_workspace})
                      </span>
                    </span>
                    <button
                      className="text-red-500 text-xs ml-1"
                      onClick={() =>
                        setEditingWorkspace((prev) => ({
                          ...(prev ?? createEmptyWorkspace(currentUser?.id ?? 0)),
                          members: (prev?.members ?? []).filter(
                            (m) => m.user_id !== member.user_id
                          ),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>


            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsWorkspaceDialogOpen(false);
                  setEditingWorkspace(null)
                }}
              >
                {t("workspace.cancel")}
              </Button>
              <Button onClick={() => {
                // if (!editingWorkspace?.brands || editingWorkspace.brands.length === 0) {
                //   toastDestructive("Missing required field","Please add at least one brand before creating the workspace.");
                //   return;
                // }
                setIsWorkspaceDialogOpen(false);
                handleSave();
              }}>
                {isEditing ? t("workspace.save") : t("workspace.add")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


    </div>
  )
}
