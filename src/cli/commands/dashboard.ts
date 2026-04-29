import { startDashboard } from "../../dashboard/server";
import { DASHBOARD_PORT } from "../../shared/constants";

export async function dashboardCommand(): Promise<void> {
  await startDashboard(DASHBOARD_PORT);
}
