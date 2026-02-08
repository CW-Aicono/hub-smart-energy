import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
}

export interface CustomRole {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  created_at: string;
  updated_at: string;
  permissions?: string[]; // permission IDs
}

export function useCustomRoles() {
  const { tenant } = useTenant();
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!tenant) {
      setRoles([]);
      setPermissions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fetch all data in parallel
    const [rolesRes, permissionsRes, rolePermissionsRes] = await Promise.all([
      supabase.from("custom_roles").select("*").order("name"),
      supabase.from("permissions").select("*").order("category, name"),
      supabase.from("custom_role_permissions").select("*"),
    ]);

    if (!rolesRes.error) {
      setRoles(rolesRes.data as CustomRole[]);
    }

    if (!permissionsRes.error) {
      setPermissions(permissionsRes.data as Permission[]);
    }

    if (!rolePermissionsRes.error) {
      // Group permissions by role
      const grouped: Record<string, string[]> = {};
      (rolePermissionsRes.data || []).forEach((rp: any) => {
        if (!grouped[rp.custom_role_id]) {
          grouped[rp.custom_role_id] = [];
        }
        grouped[rp.custom_role_id].push(rp.permission_id);
      });
      setRolePermissions(grouped);
    }

    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createRole = async (name: string, description: string) => {
    if (!tenant) return { error: new Error("No tenant") };

    const { data, error } = await supabase
      .from("custom_roles")
      .insert({
        tenant_id: tenant.id,
        name,
        description,
        is_system_role: false,
      })
      .select()
      .single();

    if (!error && data) {
      setRoles((prev) => [...prev, data as CustomRole]);
    }

    return { data, error };
  };

  const updateRole = async (id: string, updates: { name?: string; description?: string }) => {
    const { error } = await supabase
      .from("custom_roles")
      .update(updates)
      .eq("id", id);

    if (!error) {
      setRoles((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
      );
    }

    return { error };
  };

  const deleteRole = async (id: string) => {
    // Don't allow deleting system roles
    const role = roles.find((r) => r.id === id);
    if (role?.is_system_role) {
      return { error: new Error("System roles cannot be deleted") };
    }

    const { error } = await supabase
      .from("custom_roles")
      .delete()
      .eq("id", id);

    if (!error) {
      setRoles((prev) => prev.filter((r) => r.id !== id));
      setRolePermissions((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
    }

    return { error };
  };

  const togglePermission = async (roleId: string, permissionId: string) => {
    const currentPermissions = rolePermissions[roleId] || [];
    const hasPermission = currentPermissions.includes(permissionId);

    if (hasPermission) {
      // Remove permission
      const { error } = await supabase
        .from("custom_role_permissions")
        .delete()
        .eq("custom_role_id", roleId)
        .eq("permission_id", permissionId);

      if (!error) {
        setRolePermissions((prev) => ({
          ...prev,
          [roleId]: (prev[roleId] || []).filter((p) => p !== permissionId),
        }));
      }
      return { error };
    } else {
      // Add permission
      const { error } = await supabase
        .from("custom_role_permissions")
        .insert({ custom_role_id: roleId, permission_id: permissionId });

      if (!error) {
        setRolePermissions((prev) => ({
          ...prev,
          [roleId]: [...(prev[roleId] || []), permissionId],
        }));
      }
      return { error };
    }
  };

  const setAllPermissions = async (roleId: string, permissionIds: string[]) => {
    // Delete all existing permissions for this role
    await supabase
      .from("custom_role_permissions")
      .delete()
      .eq("custom_role_id", roleId);

    // Insert new permissions
    if (permissionIds.length > 0) {
      const inserts = permissionIds.map((pid) => ({
        custom_role_id: roleId,
        permission_id: pid,
      }));

      await supabase.from("custom_role_permissions").insert(inserts);
    }

    setRolePermissions((prev) => ({
      ...prev,
      [roleId]: permissionIds,
    }));
  };

  // Group permissions by category
  const permissionsByCategory = permissions.reduce((acc, p) => {
    if (!acc[p.category]) {
      acc[p.category] = [];
    }
    acc[p.category].push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

  return {
    roles,
    permissions,
    permissionsByCategory,
    rolePermissions,
    loading,
    createRole,
    updateRole,
    deleteRole,
    togglePermission,
    setAllPermissions,
    refetch: fetchData,
  };
}
