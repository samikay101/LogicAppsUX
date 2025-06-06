import { type ITextField, Panel, PanelType, useTheme } from '@fluentui/react';
import { MessageBar, MessageBarBody, mergeClasses } from '@fluentui/react-components';
import { ShieldCheckmarkRegular } from '@fluentui/react-icons';
import {
  ChatInput,
  ChatSuggestion,
  ChatSuggestionGroup,
  type ConversationItem,
  ConversationMessage,
  PanelLocation,
  ProgressCardWithStopButton,
} from '@microsoft/designer-ui';
import { useEffect, useMemo, useRef } from 'react';
import { useIntl } from 'react-intl';
import { useChatbotStyles, useChatbotDarkStyles } from './styles';

export const defaultChatbotPanelWidth = '360px';

interface ChatbotUIProps {
  panel: {
    width?: string;
    location?: PanelLocation;
    isOpen?: boolean;
    hasCloseButton?: boolean;
    isBlocking?: boolean;
    onDismiss: () => void;
    header: React.ReactNode;
  };
  inputBox: {
    disabled?: boolean;
    value?: string;
    placeholder?: string;
    onChange?: (value: string) => void;
    onSubmit: (value: string) => void;
    readOnly?: boolean;
    readOnlyText?: string;
  };
  data?: {
    isSaving?: boolean;
    canSave?: boolean;
    canTest?: boolean;
    test?: () => void;
    save?: () => void;
    abort?: () => void;
  };
  string: {
    test?: string;
    save?: string;
    submit?: string;
    progressState: string;
    progressStop?: string;
    progressSave: string;
    protectedMessage: string;
  };
  body: {
    messages: ConversationItem[];
    focus: boolean;
    answerGenerationInProgress: boolean;
    setFocus: (value: boolean) => void;
    focusMessageId?: string;
    clearFocusMessageId?: () => void;
  };
}

const QUERY_MIN_LENGTH = 5;
const QUERY_MAX_LENGTH = 2000;

export const ChatbotUI = (props: ChatbotUIProps) => {
  const {
    panel: { header },
    body: { messages, focus, answerGenerationInProgress, setFocus, focusMessageId, clearFocusMessageId },
    inputBox: { disabled, placeholder, value = '', onChange, onSubmit, readOnly, readOnlyText },
    data: { isSaving, canSave, canTest, test, save, abort } = {},
    string: { test: testString, save: saveString, submit: submitString, progressState, progressStop, progressSave, protectedMessage },
  } = props;
  const intl = useIntl();
  const { isInverted } = useTheme();
  const textInputRef = useRef<ITextField>(null);

  // Styles
  const styles = useChatbotStyles();
  const darkStyles = useChatbotDarkStyles();

  const inputIconButtonStyles = {
    enabled: {
      root: {
        backgroundColor: 'transparent',
        color: isInverted ? 'rgb(200, 200, 200)' : 'rgb(51, 51, 51)',
      },
    },
    disabled: {
      root: {
        backgroundColor: 'transparent',
        color: isInverted ? 'rgb(79, 79, 79)' : 'rgb(200, 200, 200)',
      },
    },
  };

  useEffect(() => {
    if (focus) {
      textInputRef.current?.focus();
      setFocus(false);
    }
  }, [focus, setFocus, textInputRef]);

  useEffect(() => {
    if (focusMessageId) {
      const querySelector = `[data-scroll-target="${focusMessageId}"]`;
      const element = document.querySelector<HTMLElement>(querySelector);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
      clearFocusMessageId?.();
    }
  }, [focusMessageId, clearFocusMessageId]);

  const intlText = useMemo(() => {
    return {
      inputPlaceHolder: intl.formatMessage({
        defaultMessage: 'Enter your question or query here.',
        id: '6jBzPt',
        description: 'Chatbot input placeholder text',
      }),
      submitButton: intl.formatMessage({
        defaultMessage: 'Submit',
        id: 'Oep6va',
        description: 'Submit button',
      }),
      saveButton: intl.formatMessage({
        defaultMessage: 'Save this workflow',
        id: 'OYWZE4',
        description: 'Chatbot suggestion button to save workflow',
      }),
      testButton: intl.formatMessage({
        defaultMessage: 'Test this workflow',
        id: 'tTIsTX',
        description: 'Chatbot suggestion button to test this workflow',
      }),
    };
  }, [intl]);

  return (
    <div className={mergeClasses(styles.container, isInverted && darkStyles.container)}>
      {header}
      <div className={mergeClasses(styles.content, isInverted && darkStyles.content)}>
        {answerGenerationInProgress && (
          <ProgressCardWithStopButton onStopButtonClick={abort} progressState={progressState} stopButtonLabel={progressStop} />
        )}
        {isSaving && <ProgressCardWithStopButton progressState={progressSave} />}
        {messages.map((item, index) => (
          <ConversationMessage key={`${index}-${item.id}`} item={item} />
        ))}
      </div>
      <div className={styles.footer}>
        <div className={styles.protectedFooter}>
          <ShieldCheckmarkRegular className={styles.shieldCheckmarkRegular} /> {protectedMessage}
        </div>
        <ChatSuggestionGroup>
          {canSave && <ChatSuggestion text={saveString ?? intlText.saveButton} iconName={'Save'} onClick={() => save?.()} />}
          {canTest && <ChatSuggestion text={testString ?? intlText.testButton} iconName={'TestBeaker'} onClick={() => test?.()} />}
        </ChatSuggestionGroup>
        {readOnly ? (
          <MessageBar intent={'info'} layout="multiline">
            <MessageBarBody>{readOnlyText}</MessageBarBody>
          </MessageBar>
        ) : (
          <ChatInput
            textFieldRef={textInputRef}
            disabled={answerGenerationInProgress || disabled}
            isMultiline={true}
            maxQueryLength={QUERY_MAX_LENGTH}
            onQueryChange={(_ev, newValue) => {
              onChange?.(newValue ?? '');
            }}
            placeholder={placeholder ?? intlText.inputPlaceHolder}
            query={value}
            showCharCount={true}
            submitButtonProps={{
              title: submitString ?? intlText.submitButton,
              disabled: answerGenerationInProgress || value.length < QUERY_MIN_LENGTH,
              iconProps: {
                iconName: 'Send',
                styles:
                  answerGenerationInProgress || value.length < QUERY_MIN_LENGTH
                    ? inputIconButtonStyles.disabled
                    : inputIconButtonStyles.enabled,
              },
              onClick: () => onSubmit(value),
            }}
          />
        )}
      </div>
    </div>
  );
};

export const AssistantChat = (props: ChatbotUIProps) => {
  const {
    panel: { width = defaultChatbotPanelWidth, location = PanelLocation.Left, isOpen, hasCloseButton = false, isBlocking, onDismiss },
  } = props;

  return (
    <Panel
      type={location === PanelLocation.Right ? PanelType.custom : PanelType.customNear}
      isOpen={isOpen}
      customWidth={width}
      hasCloseButton={hasCloseButton}
      isBlocking={isBlocking}
      layerProps={{ styles: { root: { zIndex: 0, display: 'flex' } } }}
      onDismiss={onDismiss}
    >
      <ChatbotUI {...props} />
    </Panel>
  );
};
