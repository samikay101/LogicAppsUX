import type { OutputToken } from '..';
import { TokenPickerMode } from '../';
import type { ValueSegment } from '../../editor';
import { INSERT_TOKEN_NODE } from '../../editor/base/plugins/InsertTokenNode';
import { SINGLE_VALUE_SEGMENT } from '../../editor/base/plugins/SingleValueSegment';
import type { TokenGroup, Token } from '@microsoft/logic-apps-shared';
import { getReducedTokenList } from './tokenpickerhelpers';
import type { TokenPickerBaseProps } from './tokenpickersection';
import { Icon, useTheme } from '@fluentui/react';
import { useBoolean } from '@fluentui/react-hooks';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { darken, hex2rgb, lighten, replaceWhiteSpaceWithUnderscore } from '@microsoft/logic-apps-shared';
import Fuse from 'fuse.js';
import type { LexicalEditor } from 'lexical';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';

export type GetValueSegmentHandler = (tokenProps: OutputToken, addImplicitForeach: boolean) => Promise<ValueSegment>;

interface SearchOutputToken extends OutputToken {
  sectionName: string;
}

interface TokenPickerOptionsProps extends TokenPickerBaseProps {
  section: TokenGroup;
  index: number;
  setTokenLength: Dispatch<SetStateAction<number[]>>;
}

const maxTokensPerSection = 6;

export const TokenPickerOptions = ({
  selectedMode,
  section,
  searchQuery,
  index,
  expressionEditorRef,
  expression,
  setExpression,
  setTokenLength,
  getValueSegmentFromToken,
  tokenClickedCallback,
}: TokenPickerOptionsProps): JSX.Element => {
  const intl = useIntl();
  const { isInverted } = useTheme();

  let editor: LexicalEditor | null;
  try {
    [editor] = useLexicalComposerContext();
  } catch {
    editor = null;
  }
  const [moreOptions, { toggle: toggleMoreOptions }] = useBoolean(true);
  const [filteredTokens, setFilteredTokens] = useState(section.tokens);

  const searchableTokens: SearchOutputToken[] = useMemo(
    () =>
      section.tokens.map((token) => ({
        ...token,
        sectionName: section.label,
      })),
    [section.tokens, section.label]
  );

  useEffect(() => {
    let tokens: Token[];
    if (searchQuery) {
      const query = searchQuery.trim();
      const fuse = new Fuse(searchableTokens, { keys: ['description', 'title', 'sectionName'], threshold: 0.4, ignoreLocation: true });
      tokens = fuse.search(query).map((token) => token.item);
      setFilteredTokens(tokens);
    }
    setTokenLength((prevTokens) => {
      const newTokens = prevTokens;
      newTokens[index] = tokens?.length ?? searchableTokens.length;
      return newTokens;
    });
  }, [index, searchQuery, searchableTokens, setTokenLength]);

  const buttonTextMore = intl.formatMessage(
    {
      defaultMessage: 'See more ({count})',
      id: 'YjU9OY',
      description: 'Select to view more token options. Number of total tokens available: {count}.',
    },
    { count: section.tokens.length }
  );

  const buttonTextLess = intl.formatMessage({
    defaultMessage: 'See less',
    id: '1REu5/',
    description: 'Select to view fewer token options.',
  });

  const handleMoreLess = () => {
    toggleMoreOptions();
  };

  const handleTokenClicked = (token: OutputToken) => {
    if (selectedMode === TokenPickerMode.TOKEN) {
      handleCreateToken(token);
    } else if (selectedMode === TokenPickerMode.EXPRESSION) {
      handleExpressionClicked(token);
    } else if (selectedMode === TokenPickerMode.TOKEN_EXPRESSION) {
      handleTokenExpressionClicked(token);
    }
  };

  const handleTokenExpressionClicked = async (token: OutputToken) => {
    const expression = (await getValueSegmentFromToken(token, !tokenClickedCallback)).value;
    insertExpressionText(expression, 0);
  };

  const handleExpressionClicked = (token: OutputToken) => {
    const expression = token.key;
    insertExpressionText(`${expression}()`, -1);
  };

  const insertExpressionText = (text: string, caretOffset: number): void => {
    if (expressionEditorRef.current) {
      // gets the original expression
      const oldExpression = expressionEditorRef.current.getValue();
      // gets the line number of the current selection
      const selectionLineNumber = expressionEditorRef.current.getPosition()?.lineNumber ?? 1;
      // gets the line of the current selection and replaces the text with the new expression
      const splitOldExpression = oldExpression.split('\r\n');
      const oldExpressionLineNumber = splitOldExpression[selectionLineNumber - 1];
      const beforeSelection = oldExpressionLineNumber.substring(0, expression.selectionStart);
      const afterSelection = oldExpressionLineNumber.substring(expression.selectionEnd);
      const newExpressionLineNumber = `${beforeSelection}${text}${afterSelection}`;
      splitOldExpression[selectionLineNumber - 1] = newExpressionLineNumber;

      // updates the split text and updates the new expression and selection
      const newExpression = splitOldExpression.join('\r\n');
      const newSelection = newExpression.length - afterSelection.length + caretOffset;
      setExpression({ value: newExpression, selectionStart: newSelection, selectionEnd: newSelection });

      setTimeout(() => {
        expressionEditorRef.current?.setValue(newExpression);
        expressionEditorRef.current?.setSelection({
          startLineNumber: selectionLineNumber,
          startColumn: newSelection + 1,
          endLineNumber: selectionLineNumber,
          endColumn: newSelection + 1,
        });
        expressionEditorRef.current?.focus();
      });
    }
  };

  const handleCreateToken = async (token: OutputToken) => {
    const { brandColor, icon, title, description, value } = token;
    const segment = await getValueSegmentFromToken(token, !tokenClickedCallback);
    if (tokenClickedCallback) {
      tokenClickedCallback(segment);
    } else {
      editor?.dispatchCommand(SINGLE_VALUE_SEGMENT, true);
      editor?.dispatchCommand(INSERT_TOKEN_NODE, {
        brandColor,
        description,
        title,
        icon,
        value,
        data: segment,
      });
    }
  };

  const getSectionIcon = (): string | undefined => {
    return section?.tokens[0]?.icon;
  };

  const getSectionSecurity = (): boolean => {
    return section?.tokens[0]?.outputInfo.isSecure ?? false;
  };

  const getSectionBrandColor = (): string => {
    return section?.tokens[0]?.brandColor ?? '#e8eae7';
  };

  const sectionBrandColorRgb = hex2rgb(getSectionBrandColor());
  const sectionHeaderColorRgb = lighten(sectionBrandColorRgb, 0.9);
  const sectionHeaderColorRgbDark = darken(sectionBrandColorRgb, 0.5);
  const sectionHeaderColorCss = `rgb(${sectionHeaderColorRgb.red}, ${sectionHeaderColorRgb.green}, ${sectionHeaderColorRgb.blue})`;
  const sectionHeaderColorCssDark = `rgb(${sectionHeaderColorRgbDark.red}, ${sectionHeaderColorRgbDark.green}, ${sectionHeaderColorRgbDark.blue})`;

  const maxRowsShown = selectedMode === TokenPickerMode.EXPRESSION ? section.tokens.length : maxTokensPerSection;
  const showSeeMoreOrLessButton = !searchQuery && section.tokens.length > maxRowsShown;

  return (
    <>
      {(searchQuery && filteredTokens.length > 0) || !searchQuery ? (
        <>
          <div
            className="msla-token-picker-section-header"
            style={{ backgroundColor: isInverted ? sectionHeaderColorCssDark : sectionHeaderColorCss }}
          >
            <img src={getSectionIcon()} alt="token icon" />
            {getSectionSecurity() ? (
              <div className="msla-token-picker-secure-token">
                <Icon iconName="LockSolid" />
              </div>
            ) : null}
            <span>{section.label}</span>
            {showSeeMoreOrLessButton ? (
              <button
                className="msla-token-picker-section-header-button"
                onClick={handleMoreLess}
                data-automation-id={`msla-token-picker-section-header-button-${replaceWhiteSpaceWithUnderscore(section.label)}`}
              >
                <span>{moreOptions ? buttonTextMore : buttonTextLess}</span>
              </button>
            ) : null}
          </div>
          <ul className="msla-token-picker-section-options" aria-label={section.label}>
            {getReducedTokenList(searchQuery ? filteredTokens : section.tokens, {
              hasSearchQuery: !!searchQuery,
              maxRowsShown,
              showAllOptions: !moreOptions,
            }).map((token, j) => (
              <li key={`token-picker-option-li-${j}`}>
                <button
                  className="msla-token-picker-section-option"
                  data-automation-id={`msla-token-picker-section-option-${j}`}
                  key={`token-picker-option-${j}`}
                  onClick={() => handleTokenClicked(token)}
                >
                  <div className="msla-token-picker-section-option-text">
                    <div className="msla-token-picker-option-inner">
                      <div className="msla-token-picker-option-title">{token.title}</div>
                      <div className="msla-token-picker-option-description" title={token.description}>
                        {token.description}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
};
