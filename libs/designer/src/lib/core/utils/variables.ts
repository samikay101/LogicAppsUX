import Constants from '../../common/constants';
import type { NodeInputs } from '../state/operation/operationMetadataSlice';
import type { NodeTokens, VariableDeclaration } from '../state/tokens/tokensSlice';
import { ParameterGroupKeys } from './parameters/helper';
import type { InitializeVariableProps, OutputToken as Token } from '@microsoft/designer-ui';
import { parseVariableEditorSegments, TokenType } from '@microsoft/designer-ui';
import { aggregate, getRecordEntry } from '@microsoft/logic-apps-shared';

let variableIcon = '';
let variableBrandColor = '';

export const setVariableMetadata = (icon: string, brandColor: string): void => {
  variableIcon = icon;
  variableBrandColor = brandColor;
};

export const getVariableDeclarations = (nodeInputs: NodeInputs): VariableDeclaration[] => {
  const defaultParameterGroup = nodeInputs.parameterGroups[ParameterGroupKeys.DEFAULT];
  const variableParameter = defaultParameterGroup.parameters.find(
    (parameter) => parameter.parameterName === Constants.PARAMETER_NAMES.VARIABLES
  );

  const variables: InitializeVariableProps[] =
    variableParameter?.editorViewModel?.variables ?? parseVariableEditorSegments(variableParameter?.value ?? []) ?? [];

  return variables
    .map((variable) => {
      const name = variable.name?.[0]?.value ?? null;
      const type = variable.type?.[0]?.value ?? null;

      return name || type ? { name, type } : null;
    })
    .filter((variable): variable is VariableDeclaration => variable !== null);
};

export const getAllVariables = (variables: Record<string, VariableDeclaration[]>): VariableDeclaration[] => {
  return aggregate(Object.keys(variables).map((nodeId) => getRecordEntry(variables, nodeId) ?? []));
};

export const getAvailableVariables = (
  variables: Record<string, VariableDeclaration[]>,
  upstreamNodeIds: string[]
): VariableDeclaration[] => {
  const allVariables = upstreamNodeIds.map((nodeId) => getRecordEntry(variables, nodeId) ?? []);
  return aggregate(allVariables);
};

export const getVariableTokens = (variables: Record<string, VariableDeclaration[]>, nodeTokens: NodeTokens): Token[] => {
  const availableVariables = getAvailableVariables(variables, nodeTokens.upstreamNodeIds);

  return availableVariables.map(({ name, type }: VariableDeclaration) => {
    return {
      key: `variables:${name}`,
      brandColor: variableBrandColor,
      icon: variableIcon,
      title: name,
      name,
      type: convertVariableTypeToSwaggerType(type) ?? Constants.SWAGGER.TYPE.ANY,
      isAdvanced: false,
      outputInfo: {
        type: TokenType.VARIABLE,
        functionName: Constants.FUNCTION_NAME.VARIABLES,
        functionArguments: [name],
      },
    };
  });
};

export const convertVariableTypeToSwaggerType = (type: string | undefined): string | undefined => {
  if (type) {
    switch (type.toLowerCase()) {
      case Constants.VARIABLE_TYPE.FLOAT:
        return Constants.SWAGGER.TYPE.NUMBER;
      case Constants.VARIABLE_TYPE.INTEGER:
        return Constants.SWAGGER.TYPE.INTEGER;
      case Constants.VARIABLE_TYPE.BOOLEAN:
        return Constants.SWAGGER.TYPE.BOOLEAN;
      case Constants.VARIABLE_TYPE.STRING:
        return Constants.SWAGGER.TYPE.STRING;
      case Constants.VARIABLE_TYPE.ARRAY:
        return Constants.SWAGGER.TYPE.ARRAY;
      case Constants.VARIABLE_TYPE.OBJECT:
        return Constants.SWAGGER.TYPE.OBJECT;
      default:
        return undefined;
    }
  }

  return undefined;
};
