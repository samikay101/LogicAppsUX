/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../localize';
import {
  createCsFile,
  ensureCsprojAndNugetFiles,
  getUnitTestPaths,
  handleError,
  logError,
  logSuccess,
  logTelemetry,
  promptForUnitTestName,
  removeInvalidCharacters,
  selectWorkflowNode,
} from '../../../utils/unitTests';
import { tryGetLogicAppProjectRoot } from '../../../utils/verifyIsProject';
import { ensureDirectoryInWorkspace, getWorkflowNode, getWorkspaceFolder, isMultiRootWorkspace } from '../../../utils/workspace';
import type { IAzureConnectorsContext } from '../azureConnectorWizard';
import { type IActionContext, callWithTelemetryAndErrorHandling } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import { ext } from '../../../../extensionVariables';
import { toPascalCase } from '@microsoft/logic-apps-shared';

/**
 * Creates a unit test for a Logic App workflow (codeful only).
 * @param {IAzureConnectorsContext} context - The context object for Azure Connectors.
 * @param {vscode.Uri | undefined} node - The URI of the workflow node, if available.
 * @param {any} unitTestDefinition - The definition of the unit test.
 * @returns {Promise<void>} - A Promise that resolves when the unit test is created.
 */
export async function saveBlankUnitTest(
  context: IAzureConnectorsContext,
  node: vscode.Uri | undefined,
  unitTestDefinition: any
): Promise<void> {
  try {
    // Get workspace and project root
    const workspaceFolder = await getWorkspaceFolder(context);
    const projectPath = await tryGetLogicAppProjectRoot(context, workspaceFolder);

    // Get raw parsed outputs
    await parseUnitTestOutputs(unitTestDefinition);
    const operationInfo = unitTestDefinition['operationInfo'];
    const outputParameters = unitTestDefinition['outputParameters'];

    // Determine workflow node
    const workflowNode = node ? (getWorkflowNode(node) as vscode.Uri) : await selectWorkflowNode(context, projectPath);
    const workflowName = path.basename(path.dirname(workflowNode.fsPath));

    // Check if in a multi-root workspace
    if (!isMultiRootWorkspace()) {
      const message = localize(
        'expectedWorkspace',
        'A multi-root workspace must be open to create unit tests. Please navigate to the Logic Apps extension in Visual Studio Code and use the "Create New Logic App Workspace" command to initialize and open a valid workspace.'
      );
      ext.outputChannel.appendLog(message);
      throw new Error(message);
    }

    // Prompt for unit test name
    const unitTestName = await promptForUnitTestName(context, projectPath, workflowName);
    ext.outputChannel.appendLog(localize('unitTestNameEntered', `Unit test name entered: ${unitTestName}`));

    // Retrieve unitTestFolderPath and logic app name from helper
    const { unitTestFolderPath, logicAppName } = getUnitTestPaths(projectPath, workflowName, unitTestName);
    await fs.ensureDir(unitTestFolderPath!);

    // Process mockable operations and write C# classes
    await processAndWriteMockableOperations(operationInfo, outputParameters, unitTestFolderPath!, logicAppName);
    logTelemetry(context, { workflowName, unitTestName });

    // Save the unit test
    await callWithTelemetryAndErrorHandling('logicApp.saveBlankUnitTest', async (telemetryContext: IActionContext) => {
      Object.assign(telemetryContext, context);
      await generateBlankCodefulUnitTest(context, projectPath, workflowName, unitTestName);
    });
  } catch (error) {
    // Handle errors using the helper function
    handleError(context, error, 'saveBlankUnitTest');
  }
}

/**
 * Parses and transforms raw output parameters from a unit test definition into a structured format.
 * @param {any} unitTestDefinition - The unit test definition object containing operation info and raw output parameters.
 * @returns {Promise<{ operationInfo: any; outputParameters: Record<string, any>; }>}
 * - A Promise that resolves to a structured object containing operation info and transformed output parameters.
 */
async function parseUnitTestOutputs(unitTestDefinition: any): Promise<{
  operationInfo: any;
  outputParameters: Record<string, any>;
}> {
  // Define the fields allowed to be included in the transformed output
  const allowedFields = ['type', 'title', 'format', 'description'];

  /**
   * Transforms raw output objects by cleaning keys and filtering fields.
   * @param {any} rawOutput - The raw output object to transform.
   * @returns {Record<string, any>}
   * - A transformed object with cleaned keys and filtered fields.
   */
  const transformRawOutputs = (rawOutput: any): Record<string, any> => {
    const transformedOutput: Record<string, any> = {};

    for (const rawKey in rawOutput) {
      if (Object.prototype.hasOwnProperty.call(rawOutput, rawKey)) {
        // Clean the key by removing unwanted prefixes and suffixes
        const cleanedKey = rawKey.replace('outputs.$.', '').replace('.$.', '.').replace('$.', '').replace('.$', '');

        const keyParts = cleanedKey.split('.');

        // Build the nested structure for the cleaned key
        keyParts.reduce((nestedObject, part, index) => {
          if (index === keyParts.length - 1) {
            if (
              Object.prototype.hasOwnProperty.call(nestedObject, part) &&
              typeof nestedObject[part] === 'object' &&
              typeof rawOutput[rawKey] === 'object'
            ) {
              // Merge fields for existing nested keys
              nestedObject[part] = {
                ...nestedObject[part],
                ...Object.keys(rawOutput[rawKey]).reduce((filteredFields, fieldKey) => {
                  if (allowedFields.includes(fieldKey)) {
                    (filteredFields as Record<string, any>)[fieldKey] = rawOutput[rawKey][fieldKey];
                  }
                  return filteredFields;
                }, {}),
              };
            } else {
              // Add filtered fields for new keys
              nestedObject[part] = Object.keys(rawOutput[rawKey]).reduce((filteredFields, fieldKey) => {
                if (allowedFields.includes(fieldKey)) {
                  (filteredFields as Record<string, any>)[fieldKey] = rawOutput[rawKey][fieldKey];
                }
                return filteredFields;
              }, {});
            }
          } else {
            // Create nested objects for intermediate keys
            nestedObject[part] = nestedObject[part] || {};
          }
          return nestedObject[part];
        }, transformedOutput);
      }
    }

    return transformedOutput;
  };

  // Initialize the structured output object
  const parsedOutputs: { operationInfo: any; outputParameters: any } = {
    operationInfo: unitTestDefinition['operationInfo'],
    outputParameters: {},
  };

  // Process each output parameter
  for (const parameterKey in unitTestDefinition['outputParameters']) {
    parsedOutputs.outputParameters[parameterKey] = {
      outputs: transformRawOutputs(unitTestDefinition['outputParameters'][parameterKey].outputs),
    };
  }

  return parsedOutputs;
}

/**
 * Generates a codeful unit test by calling the backend API, unzipping the response, and creating the .cs file.
 * @param {IAzureConnectorsContext} context - The context for Azure Connectors.
 * @param {string} projectPath - The path to the project directory.
 * @param {string} workflowName - The name of the workflow for which the test is being created.
 * @param {string} unitTestName - The name of the unit test to be created.
 * @returns {Promise<void>} - A promise that resolves when the unit test has been generated.
 */
async function generateBlankCodefulUnitTest(
  context: IAzureConnectorsContext,
  projectPath: string,
  workflowName: string,
  unitTestName: string
): Promise<void> {
  try {
    // Get required paths
    const { testsDirectory, logicAppName, logicAppFolderPath, workflowFolderPath, unitTestFolderPath } = getUnitTestPaths(
      projectPath,
      workflowName,
      unitTestName
    );

    ext.outputChannel.appendLog(
      localize(
        'pathsResolved',
        'Resolved paths for unit test generation. Workflow Name: {0}, Unit Test Name: {1}',
        workflowName,
        unitTestName
      )
    );

    // Ensure directories exist
    ext.outputChannel.appendLog(localize('ensuringDirectories', 'Ensuring required directories exist...'));
    await Promise.all([fs.ensureDir(logicAppFolderPath), fs.ensureDir(workflowFolderPath), fs.ensureDir(unitTestFolderPath!)]);

    // Create the .cs file for the unit test
    ext.outputChannel.appendLog(localize('creatingCsFile', 'Creating .cs file for unit test...'));
    await createCsFile(unitTestFolderPath!, unitTestName, workflowName, logicAppName);

    // Ensure .csproj and NuGet files exist
    ext.outputChannel.appendLog(localize('ensuringCsproj', 'Ensuring .csproj and NuGet configuration files exist...'));
    await ensureCsprojAndNugetFiles(testsDirectory, logicAppFolderPath, logicAppName);
    ext.outputChannel.appendLog(localize('csprojEnsured', 'Ensured .csproj and NuGet configuration files.'));

    // Add testsDirectory to workspace if not already included
    ext.outputChannel.appendLog(localize('checkingWorkspace', 'Checking if tests directory is already part of the workspace...'));
    await ensureDirectoryInWorkspace(testsDirectory);
    ext.outputChannel.appendLog(localize('workspaceUpdated', 'Tests directory added to workspace if not already included.'));

    vscode.window.showInformationMessage(
      localize('info.generateCodefulUnitTest', 'Generated unit test "{0}" in "{1}"', unitTestName, unitTestFolderPath)
    );

    // Log success and notify the user
    const successMessage = localize('info.generateCodefulUnitTest', 'Generated unit test "{0}" in "{1}"', unitTestName, unitTestFolderPath);
    logSuccess(context, 'unitTestGenerationStatus', successMessage);
    vscode.window.showInformationMessage(successMessage);
  } catch (error: any) {
    // Log the error using helper functions
    logError(context, error, 'generateBlankCodefulUnitTest');
  }
}

/**
 * Set of action types that can be mocked.
 */
const mockableActionTypes = new Set<string>(['Http', 'InvokeFunction', 'Function', 'ServiceProvider', 'ApiManagement', 'ApiConnection']);

/**
 * Set of trigger types that can be mocked.
 */
const mockableTriggerTypes = new Set<string>(['HttpWebhook', 'Request', 'Manual', 'ApiConnectionWebhook', 'ServiceProvider']);

/**
 * Determines if a given operation type (and whether it is a trigger or not) can be mocked.
 * @param type - The operation type.
 * @param isTrigger - Whether the operation is a trigger.
 * @returns True if the operation is mockable, false otherwise.
 */
function isMockable(type: string, isTrigger: boolean): boolean {
  return isTrigger ? mockableTriggerTypes.has(type) : mockableActionTypes.has(type);
}

/**
 * Transforms the output parameters object by cleaning keys and keeping only certain fields.
 * @param params - The parameters object.
 * @returns A transformed object with cleaned keys and limited fields.
 */
export function transformParameters(params: any): any {
  const allowedFields = ['type', 'title', 'format', 'description'];
  const result: any = {};

  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      // Clean up the key.
      const cleanedKey = key
        .replace(/^outputs\.\$\./, '') // remove "outputs.$." prefix
        .replace(/^outputs\.\$$/, '') // remove "outputs.$" prefix
        .replace(/^body\.\$\./, 'body.') // replace "body.$." prefix with "body."
        .replace(/^body\.\$$/, 'body'); // replace "body.$" prefix with "body"

      // Split on '.' to build or traverse nested keys.
      const keys = cleanedKey.split('.');
      keys.reduce((acc, part, index) => {
        const isLastPart = index === keys.length - 1;

        if (isLastPart) {
          if (!acc[part]) {
            acc[part] = {};
          }

          // Filter the fields in params[key] to keep only those in allowedFields.
          const filteredFields = Object.keys(params[key]).reduce((filtered: any, fieldKey) => {
            if (allowedFields.includes(fieldKey)) {
              filtered[fieldKey] = params[key][fieldKey];
            }
            return filtered;
          }, {});

          // Merge these filtered fields into the existing object at acc[part].
          acc[part] = { ...acc[part], ...filteredFields };
        } else if (!acc[part]) {
          // Combine into `else if`
          // Not the last segment: ensure the path is an object so we can keep nesting.
          acc[part] = {};
        }
        return acc[part];
      }, result);
    }
  }

  return result;
}

/**
 * Filters mockable operations, transforms their output parameters,
 * and writes C# class definitions to .cs files.
 * @param operationInfo - The operation info object.
 * @param outputParameters - The output parameters object.
 * @param unitTestFolderPath - The directory where the .cs files will be saved.
 * @param logicAppName - The name of the Logic App to use as the namespace.
 */
export async function processAndWriteMockableOperations(
  operationInfo: any,
  outputParameters: any,
  unitTestFolderPath: string,
  logicAppName: string
): Promise<void> {
  for (const operationName in operationInfo) {
    const operation = operationInfo[operationName];
    const type = operation.type;

    // For triggers, check if it's one of these types:
    const isTrigger = ['HttpWebhook', 'Request', 'Manual', 'ApiConnectionWebhook'].includes(type);

    // Only proceed if this operation type is mockable
    if (isMockable(type, isTrigger)) {
      const cleanedOperationName = removeInvalidCharacters(operationName);
      const className = toPascalCase(cleanedOperationName);

      // Transform the output parameters for this operation
      const outputs = transformParameters(outputParameters[operationName]?.outputs || {});

      // Replace char in namepsace var to compile c# file
      const sanitizedLogicAppName = logicAppName.replace(/-/g, '_');

      // Generate C# class content (assuming generateCSharpClasses returns a string)
      const classContent = generateCSharpClasses(sanitizedLogicAppName, className, outputs);

      // Write the .cs file
      const filePath = path.join(unitTestFolderPath, `${className}.cs`);
      await fs.writeFile(filePath, classContent, 'utf-8');

      // Log to output channel
      ext.outputChannel.appendLog(localize('csFileCreated', 'Created .cs file at: {0}', filePath));
    }
  }
}

/**
 * Generates a C# class definition as a string.
 * @param {string} logicAppName - The name of the Logic App, used as the namespace.
 * @param {string} className - The name of the class to generate.
 * @param {any} outputs - The outputs object containing properties to include in the class.
 * @returns {string} - The generated C# class definition.
 */
function generateCSharpClasses(namespaceName: string, rootClassName: string, data: any): string {
  // 1) Build a root class definition (the entire data is assumed to be an object).
  //    If data isn't type "object", you might want special handling, but typically
  //    transformParameters() yields an object at the top level.

  const rootDef = buildClassDefinition(rootClassName, {
    type: 'object',
    ...data, // Merge the data (including "description", subfields, etc.)
  });

  // Add `Name` and `Status` properties to the root class
  rootDef.properties.push(
    {
      propertyName: 'Name',
      propertyType: 'string',
      description: 'The name of the object.',
      isObject: false,
    },
    {
      propertyName: 'Status',
      propertyType: 'string',
      description: 'The execution status of the object. Example: "Succeeded".',
      isObject: false,
    },
    {
      propertyName: 'StatusCode',
      propertyType: 'int',
      description: 'The HTTP status code returned by the action. Example: 200 for success.',
      isObject: false,
    }
  );

  const adjustedNamespace = `${namespaceName}.Tests.Mocks`;

  // 2) Generate the code for the root class (this also recursively generates nested classes).
  const classCode = generateClassCode(rootDef);
  // 3) Wrap it all in the needed "using" statements + namespace.
  const finalCode = [
    'using Newtonsoft.Json.Linq;',
    'using System.Collections.Generic;',
    '',
    `namespace ${adjustedNamespace}`,
    '{',
    classCode,
    '}',
  ].join('\n');
  return finalCode;
}

/**
 * Recursively builds a single C# class string from a ClassDefinition,
 * plus any child classes it might have.
 *
 * @param {ClassDefinition} classDef - The definition of the class to generate.
 * @returns {string} - The C# code for this class (including any nested classes), as a string.
 */
function generateClassCode(classDef: ClassDefinition): string {
  const sb: string[] = [];

  // Optionally, include a class-level doc-comment if the classDef has a description
  if (classDef.description) {
    sb.push('    /// <summary>');
    sb.push(`    /// ${classDef.description}`);
    sb.push('    /// </summary>');
  }

  sb.push(`    public class ${classDef.className}`);
  sb.push('    {');

  // Generate the class properties
  for (const prop of classDef.properties) {
    if (prop.description) {
      sb.push('        /// <summary>');
      sb.push(`        /// ${prop.description}`);
      sb.push('        /// </summary>');
    }
    sb.push(`        public ${prop.propertyType} ${prop.propertyName} { get; set; }`);
    sb.push('');
  }

  // Generate a constructor that initializes string properties to "" and object properties to new objects
  sb.push('        /// <summary>');
  sb.push(`        /// Initializes a new instance of the <see cref="${classDef.className}"/> class.`);
  sb.push('        /// </summary>');
  sb.push(`        public ${classDef.className}()`);
  sb.push('        {');

  for (const prop of classDef.properties) {
    // If it's a string type
    if (prop.propertyType === 'string') {
      sb.push(`            ${prop.propertyName} = string.Empty;`);
    }
    // If it's a nested object (i.e., we generated a separate class for it),
    // create a new instance in the constructor
    else if (prop.isObject) {
      sb.push(`            ${prop.propertyName} = new ${prop.propertyType}();`);
    }
    // If it's a JObject
    else if (prop.propertyType === 'JObject') {
      sb.push(`            ${prop.propertyName} = new JObject();`);
    }
    // If it's a List
    else if (prop.propertyType.startsWith('List<')) {
      sb.push(`            ${prop.propertyName} = new ${prop.propertyType}();`);
    }
    // If it's an int or double
    else if (prop.propertyType === 'int') {
      sb.push(`            ${prop.propertyName} = 200;`);
    }
  }

  sb.push('        }');
  sb.push('');

  // End of the class
  sb.push('    }');
  sb.push('');

  // Generate code for each child class recursively
  for (const child of classDef.children) {
    sb.push(generateClassCode(child));
  }

  return sb.join('\n');
}

/**
 * Represents the metadata for generating a single C# class.
 * We'll store the class name, a doc-comment, properties, and child class definitions.
 */
interface ClassDefinition {
  className: string;
  description: string | null; // If there's a description at the object level
  properties: PropertyDefinition[]; // The list of properties in this class
  children: ClassDefinition[]; // Nested child classes (for sub-objects)
}

/**
 * Represents a single property on a C# class, including type and doc-comment.
 */
interface PropertyDefinition {
  propertyName: string; // e.g. "Id", "Name", "Body", etc.
  propertyType: string; // e.g. "string", "int", "Body" (another class), etc.
  description: string | null;
  isObject: boolean; // If true, the propertyType is a nested class name
}

/**
 * Recursively traverses the JSON structure ("outputs") to build a ClassDefinition tree.
 *
 * @param {string} className - The name for this class in C# (PascalCase).
 * @param {any}    node      - The node in the JSON structure containing .type, .description, and subfields.
 * @returns {ClassDefinition} - A class definition describing the current node and its children.
 */
function buildClassDefinition(className: string, node: any): ClassDefinition {
  // If there's a top-level "description" for the object, store it here:
  const classDescription = node.description ? String(node.description) : null;

  // We'll collect property info for the current class.

  //function buildClassDefinition(className: string, node: any, isRoot: boolean): ClassDefinition {

  const properties: PropertyDefinition[] = [];

  // We'll collect child classes if we see nested objects (type: "object").
  const children: ClassDefinition[] = [];

  // If this node is an object, it may have sub-fields we need to parse as properties.
  // We'll look for every key on the node that isn't "type" or "description" to generate properties.
  if (node.type === 'object') {
    // Create a combined array of keys we need to skip
    const skipKeys = ['type', 'title', 'description', 'format', 'headers', 'queries', 'tags', 'relativePathParameters'];

    // For each subfield in node (like "id", "location", "properties", etc.)
    for (const key of Object.keys(node)) {
      // Skip known metadata fields and the newly added keys (headers, queries, relativePathParameters)
      if (skipKeys.includes(key)) {
        continue;
      }

      const subNode = node[key];
      const propName = toPascalCase(key);

      // Determine the child's C# type
      let csharpType = mapJsonTypeToCSharp(subNode?.type);
      let isObject = false;

      // If it's an object, we must generate a nested class.
      // We'll do that recursively, then use the generated child's className for this property type.
      if (subNode?.type === 'object') {
        isObject = true;
        const childClassName = className + propName; // e.g. "ActionOutputs" -> "ActionOutputsBody"
        const childDef = buildClassDefinition(childClassName, subNode);
        children.push(childDef);

        // The property for this sub-node points to the newly created child's class name
        csharpType = childDef.className;
      }

      // If it's an array, you might want to look at subNode.items.type to refine the list item type.
      // Check if the subNode has a "description" to be used as a doc-comment on the property.
      const subDescription = subNode?.description ? String(subNode.description) : null;
      properties.push({
        propertyName: propName,
        propertyType: csharpType,
        description: subDescription,
        isObject,
      });
    }
  }
  // Build the ClassDefinition for the current node
  return {
    className,
    description: classDescription,
    properties,
    children,
  };
}

/**
 * Maps JSON types to corresponding C# types.
 * @param {string} jsonType - The JSON type (e.g., "string", "object", "array").
 * @returns {string} - The corresponding C# type.
 */
export function mapJsonTypeToCSharp(jsonType: string): string {
  switch (jsonType) {
    case 'string':
      return 'string';
    case 'integer':
      return 'int';
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    case 'array':
      return 'List<object>';
    case 'object':
      return 'JObject';
    case 'any':
      return 'JObject';
    case 'date-time':
      return 'DateTime';
    default:
      return 'JObject';
  }
}
