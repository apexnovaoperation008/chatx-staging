"use client"

import * as React from "react"
import { Shield, Users, UserPlus, Crown, Key, Settings, Plus, Edit, Trash2, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/contexts/auth-context"
import { useLanguage } from "@/contexts/language-context"
import { useToast } from "@/components/ui/use-toast"

interface Plan {
  id?: number
  name: string
  description: string
  max_workspace: number
  max_account: number
  price: number
  billing_cycle: string
  is_active: boolean 
  createdAt: string
}

type PlanInput = Omit<Plan, "id" | "createdAt" | "is_active"> & {
  id?: number
  createdAt?: string
  is_active?: boolean
}

const emptyPlan: PlanInput = {
  name: "",
  description: "",
  max_workspace: 0,
  max_account: 0,
  price: 0,
  billing_cycle: "monthly",
  is_active: true,
  createdAt: new Date().toISOString(),
};

export function PlansManagementView() {
  const { users, plans, createPlan, fetchPlans, fetchUsers, fetchPermissions, hasPermission, updatePlan, togglePlanStatus, deletePlan } = useAuth();
  const { toast } = useToast()
  const { t } = useLanguage()
  const [editingPlan, setEditingPlan] = React.useState<PlanInput>(emptyPlan);
  const [isEditing, setIsEditing] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("")

  const [isPlanDialogOpen, setIsPlanDialogOpen] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [isEditConfirmOpen, setIsEditConfirmOpen] = React.useState(false);

  const [planToDelete, setPlanToDelete] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (hasPermission("user.view")) {
      fetchUsers();
      fetchPlans(); // Fetch users logic here
    }
    fetchPlans();
    fetchPermissions();
      
  }, []);

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

  const filteredPlans = plans.filter((plan) => {
    const matchesSearch =
      plan.name.toLowerCase().includes(searchTerm.toLowerCase()) 

    return matchesSearch 
  })

  const handleOpenCreate = () => {
    setEditingPlan(emptyPlan);
  
    setIsEditing(false);
    setIsPlanDialogOpen(true);
  };

  const handleSave = async () => {
    if (isEditing && editingPlan.id) {
      setIsEditConfirmOpen(true); 
    } else {
      const newPlan = await createPlan(editingPlan);
      if (newPlan) {
        toastSuccess(t("plans.plan_created_success"), t("plans.plan_created_success_desc"))
        console.log("✅ Plan created:", newPlan);
      }

      fetchPlans()
      setIsPlanDialogOpen(false);
    }
  };

  const confirmEditSave = async () => {
    if (!editingPlan.id) {
      toastDestructive(t("plans.missing_id_error"), t("plans.missing_id_error_desc"))
      console.error("❌ Cannot update a plan without an ID");
      return;
    }
  
    // Pass id separately, and the plan as Partial<Plan>
    const updated = await updatePlan(editingPlan.id, editingPlan);
  
    if (updated) {
      toastSuccess(t("plans.plan_updated_success"), t("plans.plan_updated_success_desc"))
      console.log("✅ Plan updated", updated);
    }
    setIsPlanDialogOpen(false);
    setIsEditConfirmOpen(false);
  };
  
  // ✅ Delete
  const handleDelete = async () => {
    if (!planToDelete) return;
    const ok = await deletePlan(planToDelete);
    if (ok) {
      toastSuccess(t("plans.plan_deleted_success"), t("plans.plan_deleted_success_desc"))
      console.log("🗑️ Plan deleted", planToDelete);
    }
  
    setIsDeleteConfirmOpen(false);
    setPlanToDelete(null);
  };
  
  // 检查权限
  if (!hasPermission("plan.manage")) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">{t("plans.permission_denied")}</h3>
            <p className="text-muted-foreground">{t("plans.permission_denied_desc")}</p>
          </CardContent>  
        </Card>
      </div>
    )
  }

  const activePlans = (plans || []).filter((plan) => plan.is_active).length
  const subscribers = (users || []).filter((user) => user.is_active).
                                    filter((user) => user.plan_id != null).length
  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
            <SidebarTrigger />
            <div>
                <h1 className="text-2xl font-bold">{t("plans.title")}</h1>
            </div>
            </div>
            <div className="flex items-center gap-2">
            {hasPermission("user.create") && (
                <Button onClick={() => {
                handleOpenCreate()
                }}>
                <Plus className="h-4 w-4 mr-2" />
                {t("plans.create")}
                </Button>
            )}
            </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("plans.total_plans")}</p>
                <p className="text-2xl font-bold">{plans.length}</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("plans.active_plans")}</p>
                <p className="text-2xl font-bold">{activePlans}</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("plans.total_subscribers")}</p>
                <p className="text-2xl font-bold">{subscribers}</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("plans.total_revenue")}</p>
                <p className="text-2xl font-bold">{0}</p>
                </CardContent>
            </Card>
        </div>
        <div className="relative w-full max-w-lg my-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder={t("plans.search_placeholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
            />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("plans.list_title")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredPlans.map((plan) => {
                return (
                  <div key={plan.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback>{plan.name[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{plan.name}</h3>
                            {!plan?.is_active && (
                              <Badge variant="secondary" className="text-xs">
                                {t("plans.disabled")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            <span>{t("plans.max_workspace")}: {plan.max_workspace}</span>
                          </p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            <span>{t("plans.max_account")}: {plan.max_account}</span>
                            <span>{t("plans.price")}: $ {plan.price}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        
                        <div className="flex items-center gap-2">
                          {hasPermission("user.edit") && (
                            <Switch
                              checked={plan?.is_active}
                              onCheckedChange={(checked) => togglePlanStatus(plan.id, checked)}
                            />
                          )}
                          {hasPermission("user.edit") && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              setEditingPlan({ ...plan });
                              setIsEditing(true);
                              setIsPlanDialogOpen(true);
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
                                setPlanToDelete(plan.id); 
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

        <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? t("plans.edit") + " " + t("nav.plans_management") : t("plans.add") + " " + t("nav.plans_management")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-name">{t("plans.plan_name")}</Label>
              <Input id="plan-name" placeholder={t("plans.enter_plan_name")} value={editingPlan?.name}
              onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-description">{t("plans.plan_description")}</Label>
              <Input
                id="plan-description"
                placeholder={t("plans.enter_plan_description")}
                value={editingPlan?.description}
                onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("plans.billing_cycle")}</Label>
              <Select
                value={editingPlan?.billing_cycle || ""}
                onValueChange={(val) => setEditingPlan({ ...editingPlan, billing_cycle: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("plans.monthly")}</SelectItem>
                  <SelectItem value="quarterly">{t("plans.quarterly")}</SelectItem>
                  <SelectItem value="yearly">{t("plans.yearly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-price">{t("plans.price")}</Label>
              <Input
                id="plan-price"
                // type="number"
                placeholder={t("plans.enter_plan_price")}
                value={editingPlan?.price || "0"}
                onChange={(e) => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-workspaces">{t("plans.max_workspaces_unlimited")}</Label>
                <Input
                  id="plan-workspaces"
                  // type="number"
                  value={editingPlan?.max_workspace || "0"}
                  onChange={(e) => setEditingPlan({ ...editingPlan, max_workspace: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plan-accounts">{t("plans.max_accounts_unlimited")}</Label>
                <Input
                  id="plan-accounts"
                  // type="number"
                  value={editingPlan?.max_account || "0"}
                  onChange={(e) => setEditingPlan({ ...editingPlan, max_account: Number(e.target.value) })}
                />
              </div>
              
            <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => {
              setIsPlanDialogOpen(false);
            }}>
              {t("plans.cancel")}
            </Button>

              <Button onClick={handleSave}>{isEditing ? t("plans.save") : t("plans.add")}</Button>
            </div>
          </div> 
        </div>    
        </DialogContent>
        </Dialog> 

        
        <Dialog open={isEditConfirmOpen} onOpenChange={setIsEditConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("plans.confirm_edit_title")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t("plans.confirm_edit_message")}
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => {
                setIsEditConfirmOpen(false);
                }}>
                {t("plans.cancel")}
              </Button>
              <Button onClick={confirmEditSave}>
                {t("plans.confirm")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("plans.confirm_delete_title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("plans.confirm_delete_message")}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
              {t("plans.cancel")}
            </Button>
            <Button
              onClick={() => {handleDelete()}}
            >
              {t("plans.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog> 
  </div>
  )
}
