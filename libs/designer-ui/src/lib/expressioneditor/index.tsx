import type { EditorContentChangedEventArgs } from '../editor/monaco';
import { MonacoEditor } from '../editor/monaco';
import type { EventHandler } from '../eventhandler';
import { EditorLanguage, clamp } from '@microsoft/logic-apps-shared';
import type { editor } from 'monaco-editor';
import type { MutableRefObject } from 'react';
import { useState, useEffect } from 'react';

export interface ExpressionEditorEvent {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface ExpressionEditorProps {
  initialValue: string;
  editorRef?: MutableRefObject<editor.IStandaloneCodeEditor | null>;
  isDragging: boolean;
  dragDistance?: number;
  currentHeight: number;
  setCurrentHeight: (height: number) => void;
  onBlur?: EventHandler<ExpressionEditorEvent>;
  setIsDragging: (isDragging: boolean) => void;
  setExpressionEditorError: (error: string) => void;
  onFocus?: () => void;
  onContentChanged?(e: EditorContentChangedEventArgs): void;
  isReadOnly?: boolean;
}

export function ExpressionEditor({
  initialValue,
  editorRef,
  isDragging,
  dragDistance,
  currentHeight,
  setCurrentHeight,
  onBlur,
  onFocus,
  setIsDragging,
  setExpressionEditorError,
  onContentChanged,
  isReadOnly = false,
}: ExpressionEditorProps): JSX.Element {
  const [mouseDownLocation, setMouseDownLocation] = useState(0);
  const [heightOnMouseDown, setHeightOnMouseDown] = useState(0);
  useEffect(() => {
    if (isDragging && dragDistance) {
      setCurrentHeight(clamp(heightOnMouseDown + dragDistance - mouseDownLocation, 50, 200));
    }
  }, [isDragging, dragDistance, mouseDownLocation, currentHeight, setCurrentHeight, heightOnMouseDown]);

  const handleBlur = (): void => {
    if (onBlur && editorRef?.current) {
      const currentSelection = editorRef.current.getSelection();
      const currentCursorPosition = editorRef.current.getPosition()?.column ?? 1 - 1;
      if (currentSelection) {
        const { startLineNumber, startColumn, endLineNumber, endColumn } = currentSelection;
        const isValidSelection = startLineNumber === endLineNumber;
        const selectionStart = isValidSelection ? startColumn - 1 : currentCursorPosition;
        const selectionEnd = isValidSelection ? endColumn - 1 : currentCursorPosition;
        onBlur({ value: editorRef.current.getValue(), selectionStart, selectionEnd });
      }
    }
  };

  const handleChangeEvent = (): void => {
    setExpressionEditorError('');
  };

  return (
    <div className="msla-expression-editor-container" style={{ height: currentHeight }}>
      <MonacoEditor
        ref={editorRef}
        language={EditorLanguage.templateExpressionLanguage}
        lineNumbers="off"
        value={initialValue}
        scrollbar={{ horizontal: 'hidden', vertical: 'hidden' }}
        minimapEnabled={false}
        overviewRulerLanes={0}
        overviewRulerBorder={false}
        contextMenu={false}
        onBlur={handleBlur}
        onFocus={onFocus}
        onContentChanged={onContentChanged ?? handleChangeEvent}
        width={'100%'}
        wordWrap="bounded"
        wordWrapColumn={200}
        automaticLayout={true}
        data-automation-id="msla-expression-editor"
        height={`${currentHeight}px`}
        readOnly={isReadOnly}
        tabSize={2}
      />
      <div
        className="msla-expression-editor-expand"
        onMouseDown={(e) => {
          setMouseDownLocation(e.clientY);
          setIsDragging(true);
          setHeightOnMouseDown(currentHeight);
        }}
      >
        <div className="msla-expression-editor-expand-icon" /> <div className="msla-expression-editor-expand-icon-2" />
      </div>
    </div>
  );
}
