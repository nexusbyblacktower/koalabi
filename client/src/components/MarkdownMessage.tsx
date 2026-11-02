import { Streamdown } from "streamdown";

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <Streamdown>{content}</Streamdown>
    </div>
  );
}
