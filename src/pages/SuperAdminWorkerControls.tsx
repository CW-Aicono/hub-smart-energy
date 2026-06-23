import { Navigate } from "react-router-dom";

const SuperAdminWorkerControls = () => {
  return <Navigate to="/super-admin/gateways?tab=workers" replace />;
};

export default SuperAdminWorkerControls;
