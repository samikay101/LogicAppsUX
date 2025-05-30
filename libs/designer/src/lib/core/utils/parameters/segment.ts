import constants from '../../../common/constants';
import {
  VariableBrandColor,
  FxIcon,
  ParameterIcon,
  VariableIcon,
  AgentParameterIcon,
  AgentParameterBrandColor,
  ParameterBrandColor,
  FxBrandColor,
} from './helper';
import { JsonSplitter } from './jsonsplitter';
import { TokenSegmentConvertor } from './tokensegment';
import { UncastingUtility } from './uncast';
import { TokenType, ValueSegmentType } from '@microsoft/designer-ui';
import type { Token, ValueSegment } from '@microsoft/designer-ui';
import type { Expression, ExpressionFunction, ExpressionLiteral } from '@microsoft/logic-apps-shared';
import {
  ExpressionParser,
  ExpressionType,
  isFunction,
  isStringInterpolation,
  isStringLiteral,
  isTemplateExpression,
  format,
  guid,
  isNullOrUndefined,
  startsWith,
  UnsupportedException,
  wrapStringInQuotes,
  unwrapQuotesFromString,
} from '@microsoft/logic-apps-shared';

/**
 * The options for value segment convertor.
 */
export interface ValueSegmentConvertorOptions {
  /**
   * @member {boolean} shouldUncast - The value indicating whether uncasting should be done.
   */
  shouldUncast: boolean;

  /**
   * @member {boolean} rawModeEnabled - The value indicating whether the raw mode is enabled.
   */
  rawModeEnabled: boolean;
}

/**
 * The value segment convertor.
 */
export class ValueSegmentConvertor {
  private readonly _tokenSegmentConvertor: TokenSegmentConvertor;
  private readonly _options: ValueSegmentConvertorOptions;

  constructor(options?: ValueSegmentConvertorOptions) {
    this._options = options
      ? options
      : {
          shouldUncast: false,
          rawModeEnabled: false,
        };
    this._tokenSegmentConvertor = new TokenSegmentConvertor();
  }

  /**
   * Converts the value to value segments.
   * @arg {any} value - The value.
   * @return {ValueSegment[]}
   */
  public convertToValueSegments(value: any, parameterType?: string, parameterSchema?: any): ValueSegment[] {
    if (isNullOrUndefined(value)) {
      return [createLiteralValueSegment('')];
    }
    if (typeof value === 'string') {
      return this._convertStringToValueSegments(value, parameterType);
    }
    return this._convertJsonToValueSegments(JSON.stringify(value, null, 2), parameterSchema);
  }

  private _convertJsonToValueSegments(json: string, parameterSchema?: any): ValueSegment[] {
    const sections = new JsonSplitter(json).split();
    const segments: ValueSegment[] = [];

    const hasFormatProperty = (section: string): boolean => {
      const sectionKey = unwrapQuotesFromString(section);
      const schema = parameterSchema;

      if (!schema) {
        return false;
      }

      const possibleSchemas = [
        schema,
        schema.items?.type === 'object' ? schema.items : undefined,
        schema.items?.items, // Nested arrays
        ...(schema.allOf ?? []),
        ...(schema.oneOf ?? []),
        ...(schema.anyOf ?? []),
      ].filter(Boolean); // Remove undefined values

      return possibleSchemas.some((s) => {
        const format = s.properties?.[sectionKey]?.format ?? s.additionalProperties?.format;
        return UncastingUtility.isCastableFormat(format);
      });
    };

    for (const section of sections) {
      for (const segment of this._convertJsonSectionToSegments(section)) {
        if (hasFormatProperty(section)) {
          this._options.shouldUncast = true;
        }

        segments.push(segment);
      }
    }

    return segments;
  }

  private _convertJsonSectionToSegments(section: string): ValueSegment[] {
    if (section.charAt(0) !== '"') {
      return [this._createLiteralValueSegment(section)];
    }
    const value = JSON.parse(section);
    if (isTemplateExpression(value)) {
      const expression = ExpressionParser.parseTemplateExpression(value);
      const segments = this._convertTemplateExpressionToValueSegments(expression);

      // Note: If an non-interpolated expression is turned into a single TOKEN, we don't surround with double quote. Otherwise,
      // double quotes are added to surround the expression. This is the existing behaviour.

      if (segments.length === 1 && isTokenValueSegment(segments[0]) && !isStringInterpolation(expression)) {
        return segments;
      }

      const escapedSegments = segments.map((segment) => {
        // Note: All literal segments must be escaped since they are inside a JSON string.
        if (isLiteralValueSegment(segment)) {
          const json = JSON.stringify(segment.value);
          return { ...segment, value: json.slice(1, -1) };
        }
        return segment;
      });
      return [this._createLiteralValueSegment('"'), ...escapedSegments, this._createLiteralValueSegment('"')];
    }
    return [this._createLiteralValueSegment(section)];
  }

  private _convertStringToValueSegments(value: string, parameterType?: string): ValueSegment[] {
    if (isTemplateExpression(value)) {
      const expression = ExpressionParser.parseTemplateExpression(value);
      return this._convertTemplateExpressionToValueSegments(expression);
    }

    const isSpecialValue =
      [constants.BOOLEAN_PARAMETER_VALUE.TRUE, constants.BOOLEAN_PARAMETER_VALUE.FALSE, constants.PARAMETER_NULL_VALUE].includes(value) ||
      /^-?\d+$/.test(value);
    const stringValue = parameterType === constants.SWAGGER.TYPE.ANY && isSpecialValue ? wrapStringInQuotes(value) : value;
    return [this._createLiteralValueSegment(stringValue)];
  }

  private _convertTemplateExpressionToValueSegments(expression: Expression): ValueSegment[] {
    if (isStringInterpolation(expression)) {
      const segments = [];
      for (const interpolatedExpression of expression.segments) {
        for (const segment of this._uncastAndConvertExpressionToValueSegments(interpolatedExpression)) {
          segments.push(segment);
        }
      }
      return segments;
    }
    // Note: If the string starts with @, we append @ to escape it if raw mode is enabled.
    if (isStringLiteral(expression) && startsWith(expression.value, '@')) {
      if (this._options.rawModeEnabled) {
        return [this._createLiteralValueSegment(`@${expression.value}`)];
      }
      return [this._createLiteralValueSegment(expression.value)];
    }

    return this._uncastAndConvertExpressionToValueSegments(expression);
  }

  private _uncastAndConvertExpressionToValueSegments(expression: Expression): ValueSegment[] {
    if (this._options.shouldUncast && isFunction(expression)) {
      return this._uncastAndConvertFunctionExpressionToValueSegments(expression);
    }
    return [this._convertExpressionToValueSegment(expression)];
  }

  private _uncastAndConvertFunctionExpressionToValueSegments(expression: ExpressionFunction): ValueSegment[] {
    const uncastResults = new UncastingUtility(expression).uncast();
    if (uncastResults) {
      return uncastResults.map((result) => {
        const resultExpression = result.expression;
        const segment = this._convertExpressionToValueSegment(resultExpression);

        if (segment.token) {
          segment.token.format = result.format;
        }
        return segment;
      });
    }

    return [this._convertFunctionExpressionToValueSegment(expression)];
  }

  private _convertExpressionToValueSegment(expression: Expression): ValueSegment {
    switch (expression.type) {
      case ExpressionType.Function:
        return this._convertFunctionExpressionToValueSegment(expression as ExpressionFunction);

      case ExpressionType.NullLiteral:
      case ExpressionType.BooleanLiteral:
      case ExpressionType.NumberLiteral:
        return this._createExpressionTokenValueSegment((expression as ExpressionLiteral).value, expression);

      case ExpressionType.StringLiteral:
        return this._createLiteralValueSegment((expression as ExpressionLiteral).value);

      default:
        throw new UnsupportedException(format("Unsupported expression type '{0}'.", expression.type));
    }
  }

  private _convertFunctionExpressionToValueSegment(expression: ExpressionFunction): ValueSegment {
    const dynamicContentTokenSegment = this._tokenSegmentConvertor.tryConvertToDynamicContentTokenSegment(expression);
    if (dynamicContentTokenSegment) {
      return dynamicContentTokenSegment;
    }
    // Note: We need to get the expression value if this is a sub expression resulted from uncasting.
    const value =
      expression.startPosition === 0
        ? expression.expression
        : expression.expression.substring(expression.startPosition, expression.endPosition);
    return this._createExpressionTokenValueSegment(value, expression);
  }

  private _createLiteralValueSegment(value: string): ValueSegment {
    return createLiteralValueSegment(value);
  }

  private _createExpressionTokenValueSegment(value: string, expression: Expression): ValueSegment {
    return createTokenValueSegment(createExpressionToken(expression), value);
  }
}

/**
 * Checks whether the array is a value segment.
 * @arg {any[]} array - The value segment array.
 * @return {boolean}
 */
export function isValueSegmentArray(array: any[]): boolean {
  return array.every((item) => isValueSegment(item));
}

/**
 * Checks whether the segment is a value segment.
 * @arg {any} object - The value segment.
 * @return {boolean}
 */
export function isValueSegment(object: any): boolean {
  return (
    object?.id && !isNullOrUndefined(object.value) && (object.type === ValueSegmentType.LITERAL || object.type === ValueSegmentType.TOKEN)
  );
}

/**
 * Checks whether the segment is a literal value segment.
 * @arg {ValueSegment} segment - The value segment.
 * @return {boolean}
 */
export function isLiteralValueSegment(segment: ValueSegment): boolean {
  return segment.type === ValueSegmentType.LITERAL;
}

/**
 * Checks whether the segment is a token value segment.
 * @arg {ValueSegment} segment - The value segment.
 * @return {boolean}
 */
export function isTokenValueSegment(segment: ValueSegment): boolean {
  return segment.type === ValueSegmentType.TOKEN;
}

export function isOutputTokenValueSegment(segment: ValueSegment): boolean {
  return (
    segment.type === ValueSegmentType.TOKEN && segment.token?.tokenType !== TokenType.FX && segment.token?.tokenType !== TokenType.PARAMETER
  );
}

export function isFunctionValueSegment(segment: ValueSegment): boolean {
  return segment.type === ValueSegmentType.TOKEN && segment.token?.tokenType === TokenType.FX;
}

/**
 * Creates a literal value segment.
 * @arg {string} value - The literal value.
 * @arg {string} [segmentId] - The segment id.
 * @return {ValueSegment}
 */
export function createLiteralValueSegment(value: string, segmentId?: string): ValueSegment {
  return {
    id: segmentId ? segmentId : guid(),
    type: ValueSegmentType.LITERAL,
    value,
  };
}

/**
 * Creates a token value segment.
 * @arg {Token} token - The token.
 * @arg {string} [tokenFormat] - The token format.
 * @return {ValueSegment}
 */
export function createTokenValueSegment(token: Token, value: string, _tokenFormat?: string): ValueSegment {
  return {
    id: guid(),
    type: ValueSegmentType.TOKEN,
    token,
    value,
  };
}

/**
 * Checks whether the token is an expression token.
 * @arg {Token} token - The token.
 * @return {boolean}
 */
// TODO: Use type guard once we define separate type for expression token and others.
export function isExpressionToken(token: Token): boolean {
  return token.tokenType === TokenType.FX;
}

/**
 * Checks whether the token is a parameter token.
 * @arg {Token} token - The token.
 * @return {boolean}
 */
export function isParameterToken(token: Token): boolean {
  return token.tokenType === TokenType.PARAMETER;
}

/**
 * Checks whether the token is a variable token.
 * @arg {Token} token - The token.
 * @return {boolean}
 */
export function isVariableToken(token: Token): boolean {
  return token.tokenType === TokenType.VARIABLE;
}

/**
 * Checks whether the token is an item token.
 * @arg {Token} token - The token.
 * @return {boolean}
 */
export function isItemToken(token: Token): boolean {
  return token.tokenType === TokenType.ITEM;
}

/**
 * Checks whether the token is an iteration index token.
 * @arg {Token} token - The token.
 * @return {boolean}
 */
export function isIterationIndexToken(token: Token): boolean {
  return token.tokenType === TokenType.ITERATIONINDEX;
}

/**
 * Checks whether the token is an output token.
 * @arg {Token} token - The token.
 * @return {boolean}
 */
export function isOutputToken(token: Token): token is Token {
  return token.tokenType === TokenType.OUTPUTS;
}

/**
 * Creates an output token.
 * @arg {string} key - The output key.
 * @arg {string} actionName - The step.
 * @arg {string} source - The output source.
 * @arg {string} name - The token name.
 * @arg {boolean} required - The value indicating if it is required.
 * @arg {string} [value] - The value.
 * @return {Token}
 */
export function createOutputToken(
  key: string,
  actionName: string | undefined,
  source: string,
  name: string,
  required: boolean,
  value: string
): Token {
  const token: Token = {
    actionName,
    source,
    name,
    key,
    required,
    tokenType: TokenType.OUTPUTS,
    title: name,
    value,
  };

  return token;
}

/**
 * Creates an expression token.
 * @arg {string} value - The value.
 * @arg {Expression} expression - The expression.
 * @return {Token}
 */
export function createExpressionToken(expression: Expression): Token {
  return {
    tokenType: TokenType.FX,
    expression,
    key: guid(),
    title: (expression as ExpressionFunction).name,
    brandColor: FxBrandColor,
    icon: FxIcon,
    value: (expression as ExpressionFunction).expression,
  };
}

/**
 * Creates a variable token.
 * @arg {string} value - The value.
 * @arg {string} variableName - The variable name.
 * @return {Token}
 */
export function createVariableToken(variableName: string, expression: string): Token {
  return {
    description: variableName,
    value: expression,
    key: variableName,
    title: variableName,
    name: variableName,
    brandColor: VariableBrandColor,
    icon: VariableIcon,
    tokenType: TokenType.VARIABLE,
  };
}

/**
 * Creates a parameter token.
 * @arg {string} value - The value.
 * @arg {string} parameterName - The parameter name.
 * @return {Token}
 */
export function createParameterToken(parameterName: string): Token {
  return {
    tokenType: TokenType.PARAMETER,
    title: parameterName,
    name: parameterName,
    key: parameterName,
    brandColor: ParameterBrandColor,
    icon: ParameterIcon,
  };
}

/**
 * Creates an agent parameter token.
 * @arg {string} value - The value.
 * @arg {string} parameterName - The parameter name.
 * @return {Token}
 */
export function createAgentParameterToken(parameterName: string): Token {
  return {
    tokenType: TokenType.AGENTPARAMETER,
    title: parameterName,
    name: parameterName,
    key: `agentParameter.${parameterName}`,
    brandColor: AgentParameterBrandColor,
    icon: AgentParameterIcon,
  };
}

/**
 * Gets expression value for given segment key in value segments.
 * @arg {ValueSegment[]} valueSegments - The value segments.
 * @arg {string} segmentKey - The segment key to get the value from.
 * @return {string | undefined} - The value of the expression for segment key.
 */
export function getExpressionFromValueSegment(valueSegments: ValueSegment[], segmentKey: string): string | undefined {
  if (!segmentKey) {
    return undefined;
  }

  const valueSegment = valueSegments.find((segment) => segment.id === segmentKey);
  return valueSegment ? valueSegment.value : undefined;
}
