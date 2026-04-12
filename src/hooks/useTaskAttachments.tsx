import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface TaskAttachment {
  id: string;
  task_id: string;
  tenant_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export const useTaskAttachments = (taskId: string | null) => {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["task-attachments", taskId],
    enabled: !!taskId && !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_attachments")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as TaskAttachment[];
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: async ({ taskId: tId, file }: { taskId: string; file: File }) => {
      const ext = file.name.split(".").pop() ?? "bin";
      const filePath = `${tenant!.id}/${tId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("task-attachments")
        .upload(filePath, file, { contentType: file.type });
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from("task_attachments").insert({
        task_id: tId,
        tenant_id: tenant!.id,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        content_type: file.type,
        uploaded_by: user?.id ?? null,
      });
      if (insertErr) throw insertErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] });
      toast({ title: "Bild hochgeladen" });
    },
    onError: () => {
      toast({ title: "Fehler beim Hochladen", variant: "destructive" });
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attachment: TaskAttachment) => {
      await supabase.storage.from("task-attachments").remove([attachment.file_path]);
      const { error } = await supabase.from("task_attachments").delete().eq("id", attachment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] });
      toast({ title: "Bild gelöscht" });
    },
    onError: () => {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    },
  });

  const getSignedUrl = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from("task-attachments")
      .createSignedUrl(filePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  };

  return { attachments, isLoading, uploadAttachment, deleteAttachment, getSignedUrl };
};
