import { Link } from '@fluentui/react-components';
import type { ToolReplyItem } from './conversationItem';
import Markdown from 'react-markdown';
import { useRef } from 'react';

export const ToolReply = ({ item }: { item: ToolReplyItem }) => {
  const { text, onClick, id } = item;
  const textRef = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={textRef}>
      {onClick ? (
        <Link onClick={() => onClick(id, text)}>
          <Markdown>{text}</Markdown>
        </Link>
      ) : (
        <Markdown className="msla-system-message">{text}</Markdown>
      )}
    </div>
  );
};
