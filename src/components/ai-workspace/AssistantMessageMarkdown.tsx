import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./AiWorkspaceView.module.css";

type AssistantMessageMarkdownProps = {
  content: string;
};

export function AssistantMessageMarkdown({
  content,
}: AssistantMessageMarkdownProps) {
  return (
    <div className={styles.msgMarkdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
