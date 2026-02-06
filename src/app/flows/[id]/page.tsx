import { Editor } from "@/components/editor/Editor";

export default async function FlowPage({ params }: PageProps<"/flows/[id]">) {
  const { id } = await params;
  return <Editor flowId={id} />;
}
