import { SalesLayout } from "@/components/sales/SalesLayout";
import { SalesProjectForm } from "@/components/sales/SalesProjectForm";

export default function SalesProjectNew() {
  return (
    <SalesLayout title="Neues Projekt" showBack backTo="/sales">
      <SalesProjectForm mode="create" />
    </SalesLayout>
  );
}
