import { useCallback, useMemo, useState } from 'react';
import type { BaseEditorProps, ChangeState } from '../base';
import { createEmptyLiteralValueSegment } from '../base/utils/helper';
import type { ValueSegment } from '../models/parameter';
import { StringEditor } from '../string';
import type { InitializeVariableErrors } from './variableEditor';
import { VariableEditor } from './variableEditor';
import { Button, Divider, MessageBar, MessageBarBody, MessageBarTitle } from '@fluentui/react-components';
import { useIntl } from 'react-intl';
import {
  createVariableEditorSegments,
  convertVariableEditorSegmentsAsSchema,
  parseSchemaAsVariableEditorSegments,
  parseVariableEditorSegments,
} from './util';
import constants from '../../constants';
import { Add24Filled, Add24Regular, bundleIcon } from '@fluentui/react-icons';
import { useInitializeVariableStyles } from './styles';

const CreateIcon = bundleIcon(Add24Filled, Add24Regular);
export interface InitializeVariableProps {
  name: ValueSegment[];
  type: ValueSegment[];
  value: ValueSegment[];
  description?: ValueSegment[];
}

export interface InitializeVariableEditorProps extends BaseEditorProps {
  validationErrors?: InitializeVariableErrors[];
  isMultiVariableEnabled?: boolean;
  isAgentParameter?: boolean;
}

export const InitializeVariableEditor = ({
  initialValue,
  onChange,
  validationErrors,
  isAgentParameter,
  ...props
}: InitializeVariableEditorProps) => {
  const intl = useIntl();
  const [variables, setVariables] = useState<InitializeVariableProps[] | undefined>(() =>
    isAgentParameter
      ? parseSchemaAsVariableEditorSegments(initialValue, props.loadParameterValueFromString)
      : parseVariableEditorSegments(initialValue, props.loadParameterValueFromString)
  );
  const [newlyAddedIndices, setNewlyAddedIndices] = useState<Set<number>>(new Set());

  const stringResources = useMemo(
    () => ({
      ADD_VARIABLE: intl.formatMessage({
        defaultMessage: 'Add a Variable',
        id: 'HET2nV',
        description: 'label to add a variable',
      }),
      ADD_PARAMETER: intl.formatMessage({
        defaultMessage: 'Create Parameter',
        id: 'SC5XB0',
        description: 'label to add a parameter',
      }),
    }),
    [intl]
  );

  const addButtonText = isAgentParameter ? stringResources.ADD_PARAMETER : stringResources.ADD_VARIABLE;
  const styles = useInitializeVariableStyles();

  const warningTitleVariable = intl.formatMessage({
    defaultMessage: 'Unable to Parse Variables',
    id: 'uqrOee',
    description: 'Warning title for when unable to parse variables',
  });

  const warningTitleAgentParameter = intl.formatMessage({
    defaultMessage: "Can't parse the schema for the agent parameter.",
    id: 'xd5jz/',
    description: 'Warning title for when unable to parse schema',
  });

  const warningVariableBody = intl.formatMessage({
    defaultMessage: 'This could mean that the variable is set up incorrectly.',
    id: '3pOMqH',
    description: 'Warning body for when unable to parse variables',
  });

  const warningAgentParameterBody = intl.formatMessage({
    defaultMessage: 'This error might mean that the agent parameter schema is incorrectly set up.',
    id: 'mnuwWm',
    description: 'Warning body for when unable to parse schema',
  });

  const addVariable = useCallback(() => {
    setVariables((prev) => {
      const newIndex = (prev ?? []).length;
      setNewlyAddedIndices((prevIndices) => new Set([...prevIndices, newIndex]));
      return [
        ...(prev ?? []),
        {
          name: [createEmptyLiteralValueSegment()],
          type: [createEmptyLiteralValueSegment()],
          value: [createEmptyLiteralValueSegment()],
        },
      ];
    });
  }, [setVariables]);

  const updateVariables = useCallback(
    (updatedVariables: InitializeVariableProps[]) => {
      const segments = isAgentParameter
        ? convertVariableEditorSegmentsAsSchema(updatedVariables)
        : createVariableEditorSegments(updatedVariables);
      onChange?.({
        value: segments,
        viewModel: { variables: updatedVariables, hideParameterErrors: true },
      });
      return updatedVariables;
    },
    [isAgentParameter, onChange]
  );

  const handleDeleteVariable = useCallback(
    (index: number) => {
      setVariables((prev) => {
        const p = prev ?? [];
        // If there is only one variable and it's not an agent parameter, don't allow deletion
        if (p.length === 1 && !isAgentParameter) {
          return prev;
        }
        const updatedVariables = p.filter((_, i) => i !== index);

        // Update newly added indices after deletion
        setNewlyAddedIndices((prevIndices) => {
          const newIndices = new Set<number>();
          prevIndices.forEach((i) => {
            if (i < index) {
              newIndices.add(i);
            } else if (i > index) {
              newIndices.add(i - 1);
            }
            // Skip the deleted index
          });
          return newIndices;
        });

        return updateVariables(updatedVariables);
      });
    },
    [isAgentParameter, updateVariables]
  );

  const handleVariableChange = useCallback(
    (value: InitializeVariableProps, index: number) => {
      setVariables((prev) => {
        const updatedVariables = (prev ?? []).map((v, i) => (i === index ? value : v));
        // Clear newly added status once variable has been modified
        setNewlyAddedIndices((prevIndices) => {
          const newIndices = new Set(prevIndices);
          newIndices.delete(index);
          return newIndices;
        });
        return updateVariables(updatedVariables);
      });
    },
    [updateVariables]
  );

  const handleStringChange = useCallback(
    (newState: ChangeState) => {
      const { value } = newState;
      onChange?.({ value, viewModel: { hideErrorMessage: true } });
    },
    [onChange]
  );

  return variables ? (
    <div className="msla-editor-initialize-variables">
      {isAgentParameter ? (
        <div className="msla-initialize-variable-add-variable-button">
          <Button
            aria-label={addButtonText}
            appearance={'subtle'}
            className={styles.addButton}
            onClick={addVariable}
            disabled={props.readonly}
            icon={<CreateIcon />}
            style={
              props.readonly
                ? {}
                : {
                    color: 'var(--colorBrandForeground1)',
                  }
            }
          >
            {addButtonText}
          </Button>
        </div>
      ) : null}
      {variables.map((variable, index) => (
        <div key={index}>
          <VariableEditor
            {...props}
            forceExpandByDefault={!isAgentParameter && variables.length === 1}
            isAgentParameter={isAgentParameter}
            key={index}
            index={index}
            variable={variable}
            onDelete={() => handleDeleteVariable(index)}
            onVariableChange={(value: InitializeVariableProps) => handleVariableChange(value, index)}
            disableDelete={!isAgentParameter && variables.length === 1}
            errors={validationErrors?.[index]}
            isNewlyAdded={newlyAddedIndices.has(index)}
          />
          <Divider />
        </div>
      ))}
      {props.isMultiVariableEnabled && !isAgentParameter ? (
        <div className="msla-initialize-variable-add-variable-button">
          <Button
            appearance="subtle"
            aria-label={addButtonText}
            onClick={addVariable}
            disabled={variables.length === constants.PARAMETER.VARIABLE_EDITOR_MAX_VARIABLES || props.readonly}
            icon={<CreateIcon />}
            style={
              variables.length === constants.PARAMETER.VARIABLE_EDITOR_MAX_VARIABLES || props.readonly
                ? {}
                : {
                    color: 'var(--colorBrandForeground1)',
                    border: '1px solid #9e9e9e',
                  }
            }
          >
            {addButtonText}
          </Button>
        </div>
      ) : null}
    </div>
  ) : (
    <>
      <StringEditor {...props} initialValue={initialValue} onChange={(newState) => handleStringChange(newState)} />
      <MessageBar key={'warning'} intent={'warning'} className="msla-initialize-variable-warning">
        <MessageBarBody>
          <MessageBarTitle>{isAgentParameter ? warningTitleAgentParameter : warningTitleVariable}</MessageBarTitle>
          {isAgentParameter ? warningAgentParameterBody : warningVariableBody}
        </MessageBarBody>
      </MessageBar>
    </>
  );
};
