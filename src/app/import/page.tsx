import type { Metadata } from "next";
import { ImportFlow } from "@/components/home/ImportFlow";

export const metadata: Metadata = {
  title: "Open a shared flow",
  description: "Someone shared a flow with you. See what it contains and which sites it calls, then add a copy to this browser.",
};

export default function ImportPage() {
  return <ImportFlow />;
}
