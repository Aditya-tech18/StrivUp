import { isStrivyEnabled } from "@/lib/strivy/config";
import { SettingsView } from "./SettingsView";

export default function SettingsPage() {
  return <SettingsView strivyEnabled={isStrivyEnabled()} />;
}
