import type { Metadata } from "next";
import { GatewayScreen } from "./GatewayScreen";

export const metadata: Metadata = {
  title: "STRIVUP — India's Platform for Growth",
  description: "Build discipline, join challenges, and grow with a community that holds you accountable.",
};

export default function GatewayPage() {
  return <GatewayScreen />;
}
