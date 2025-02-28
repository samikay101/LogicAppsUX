import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useState } from 'react';
import type { RangeSelection } from 'lexical';
import {
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_EDITOR,
  SELECTION_CHANGE_COMMAND,
  TextNode,
} from 'lexical';
import { $isPasswordNode, $createPasswordNode, PasswordNode } from '../nodes/passwordNode';
import { Button } from '@fluentui/react-components';
import { useIntl } from 'react-intl';
import { bundleIcon, Eye24Filled, Eye24Regular, EyeOff24Filled, EyeOff24Regular } from '@fluentui/react-icons';

const EyeIcon = bundleIcon(Eye24Filled, Eye24Regular);
const CloseEye = bundleIcon(EyeOff24Filled, EyeOff24Regular);

const buttonStyles: any = {
  height: '26px',
  width: '26px',
  margin: '2px',
  position: 'absolute',
  right: 0,
  top: 0,
  color: 'var(--colorBrandForeground1)',
};

export function PasswordMaskPlugin(): JSX.Element {
  const intl = useIntl();
  const [editor] = useLexicalComposerContext();
  const [showPassword, setShowPassword] = useState(false);
  const [selection, setSelection] = useState<RangeSelection | null>(null);

  const showVisibilityLabel = intl.formatMessage({
    defaultMessage: 'Show Password',
    id: 'H6IC6L',
    description: 'Label to show password',
  });

  const hideVisibilityLabel = intl.formatMessage({
    defaultMessage: 'Hide Password',
    id: 'snzCiK',
    description: 'Label to hide password',
  });

  useEffect(() => {
    editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        setSelection(selection);
        return false;
      },
      COMMAND_PRIORITY_EDITOR
    );

    // Mutation Listener: Detects first creating the paswordNode or pasting a text
    const unregisterMutationListener = editor.registerMutationListener(TextNode, (mutations) => {
      editor.update(() => {
        if (showPassword) {
          return;
        }
        mutations.forEach((mutation, key) => {
          if (mutation === 'created' || mutation === 'updated') {
            const node = $getNodeByKey(key);
            if (!node || !$isTextNode(node) || $isPasswordNode(node)) {
              return;
            }

            if (!$isRangeSelection(selection)) {
              return;
            }

            const text = node.getTextContent();
            const textToAdd = text.replace(/•/g, '');

            if (!textToAdd) {
              return;
            }
            let passwordNode: any = node.getPreviousSibling();
            if (!passwordNode || !$isPasswordNode(passwordNode)) {
              passwordNode = node.getNextSibling();
            }

            // when we paste text it comes in as a textNode, which could be in the middle of a password node
            // we remove the pasted text node and then re-add it to the password node based on the selection
            if ($isPasswordNode(passwordNode)) {
              let newText = '';
              const root = $getRoot();
              root.getChildren().forEach((node) => {
                if ($isElementNode(node)) {
                  node.getChildren().forEach((child) => {
                    if (!$isPasswordNode(child)) {
                      // get the new text and remove the text node (will be re-added to the password node)
                      newText = child.getTextContent().replace(/•/g, '');
                      child.remove();
                    }
                  });
                }
              });

              const existingText = passwordNode.getRealText();

              const newSelection = $getSelection();
              // This logic is partially handled by PasswordNode.spliceText
              // This should be handled differently in the future, but for now... it works :)
              if ($isRangeSelection(newSelection)) {
                const cutoff = newSelection.anchor.offset;
                const newSelectionPosition = cutoff + newText.length;
                const finalText = existingText.substring(0, cutoff) + newText + existingText.substring(cutoff);

                passwordNode.setPassword(finalText);

                newSelection.anchor.set(passwordNode.__key, newSelectionPosition, 'text');
                newSelection.focus.set(passwordNode.__key, newSelectionPosition, 'text');
                setSelection(newSelection);
              }
            } else {
              // No existing password node found, create a new one
              const newPasswordNode = $createPasswordNode(textToAdd);
              newPasswordNode.setPassword(textToAdd);
              node.replace(newPasswordNode);
            }
          }
        });
      });
    });

    // Node Transform: Detects updates inside existing password nodes
    const unregisterTransform = editor.registerNodeTransform(PasswordNode, (node) => {
      editor.update(() => {
        const existingText = node.getRealText();
        const text = node.getTextContent();
        const textToAdd = text.replace(/•/g, ''); // Remove masking dots to track real input

        // this is the selection used after the transform
        const postSelection = $getSelection();
        if (!selection || !$isRangeSelection(postSelection) || !$isRangeSelection(selection)) {
          return;
        }
        const anchorOffset = selection.anchor.offset;
        const focusOffset = selection.focus.offset;
        if (textToAdd) {
          // text is being removed
          if (anchorOffset !== focusOffset) {
            const updatedText =
              existingText.substring(0, Math.min(anchorOffset, focusOffset)) +
              textToAdd +
              existingText.substring(Math.max(anchorOffset, focusOffset));
            node.setPassword(updatedText);
            setSelection(postSelection);
          } else {
            const startOffset = postSelection.anchor.offset - 1;
            const updatedText = existingText.substring(0, startOffset) + textToAdd + existingText.substring(startOffset);
            node.setPassword(updatedText);
          }
        }
      });
    });

    return () => {
      unregisterMutationListener();
      unregisterTransform();
    };
  }, [editor, selection, showPassword]);

  const handleToggleVisibility = () => {
    setShowPassword((prev) => !prev);

    editor.update(() => {
      const root = $getRoot();
      root.getChildren().forEach((node) => {
        if ($isElementNode(node)) {
          node.getChildren().forEach((child) => {
            if ($isPasswordNode(child)) {
              // Convert PasswordNode to TextNode
              const textNode = $createTextNode(child.getRealText());
              child.replace(textNode);
            } else if ($isTextNode(child)) {
              // Convert TextNode back to PasswordNode
              const passwordNode = $createPasswordNode(child.getTextContent());
              child.replace(passwordNode);
            }
          });
        }
      });
    });
  };

  return (
    <Button
      aria-label={showPassword ? hideVisibilityLabel : showVisibilityLabel}
      title={showPassword ? hideVisibilityLabel : showVisibilityLabel}
      appearance="subtle"
      onClick={() => handleToggleVisibility()}
      icon={showPassword ? <CloseEye /> : <EyeIcon />}
      style={buttonStyles}
    />
  );
}
