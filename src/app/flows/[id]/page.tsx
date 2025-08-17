import type { Metadata } from "next";
import { Editor } from "@/components/editor/Editor";

// The flow's name is kept in the visitor's browser, so the server cannot put it in the title.
export const metadata: Metadata = {
  title: "Flow editor",
  description: "Connect blocks on a canvas, press Run, and see what each step received and returned.",
};

export default async function FlowPage({ params }: PageProps<"/flows/[id]">) {
  const { id } = await params;
  return <Editor flowId={id} />;
}
