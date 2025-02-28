import { findChildNode } from '../../editor/base/utils/helper';
import { TokenType } from '../../editor/models/parameter';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalCommand, NodeKey } from 'lexical';
import { $getRoot, COMMAND_PRIORITY_EDITOR, createCommand } from 'lexical';
import { useEffect } from 'react';

export const INITIALIZE_TOKENPICKER_EXPRESSION: LexicalCommand<string> = createCommand();

interface TokenPickerHandlerProps {
  handleInitializeExpression?: (s: string, n: NodeKey) => void;
}

export default function TokenPickerHandler({ handleInitializeExpression }: TokenPickerHandlerProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand<string>(
      INITIALIZE_TOKENPICKER_EXPRESSION,
      (payload: string) => {
        const node = findChildNode($getRoot(), payload, TokenType.FX);
        if (node?.token?.tokenType === TokenType.FX) {
          handleInitializeExpression?.(node?.value ?? '', payload);
        } else {
          editor.focus();
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor, handleInitializeExpression]);
  return null;
}
