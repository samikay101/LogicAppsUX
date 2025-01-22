/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workflowFileName, nugetFileName } from '../../../../constants';
import { localize } from '../../../../localize';
import { getWorkflowsInLocalProject } from '../../../utils/codeless/common';
import { getTestsDirectory, validateUnitTestName } from '../../../utils/unitTests';
import { tryGetLogicAppProjectRoot } from '../../../utils/verifyIsProject';
import { getWorkflowNode, getWorkspaceFolder, isMultiRootWorkspace } from '../../../utils/workspace';
import type { IAzureConnectorsContext } from '../azureConnectorWizard';
import {
  type IAzureQuickPickItem,
  type IActionContext,
  callWithTelemetryAndErrorHandling,
  parseError,
} from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import axios from 'axios';
import { ext } from '../../../../extensionVariables';
import { unzipLogicAppArtifacts } from '../../../utils/taskUtils';
import { isNullOrUndefined } from '@microsoft/logic-apps-shared';
import { FileManagement } from '../../generateDeploymentScripts/iacGestureHelperFunctions';

/**
 * Creates a unit test for a Logic App workflow (codeful only).
 * @param {IAzureConnectorsContext} context - The context object for Azure Connectors.
 * @param {vscode.Uri | undefined} node - The URI of the workflow node, if available.
 * @param {string | undefined} runId - The ID of the run, if available.
 * @returns {Promise<void>} - A Promise that resolves when the unit test is created.
 */
export async function createUnitTest(context: IAzureConnectorsContext, node: vscode.Uri | undefined, runId?: string): Promise<void> {
  const validatedRunId = await extractAndValidateRunId(runId);

  let workflowNode: vscode.Uri;
  const workspaceFolder = await getWorkspaceFolder(context);
  const projectPath = await tryGetLogicAppProjectRoot(context, workspaceFolder);

  context.telemetry.properties.userTriggeredCreateUnitTest = 'true';
  context.telemetry.properties.runIdProvided = runId ? 'true' : 'false';
  context.telemetry.properties.hasNodeUri = node ? 'true' : 'false';

  if (node) {
    workflowNode = getWorkflowNode(node) as vscode.Uri;
  } else {
    const workflow = await pickWorkflow(context, projectPath);
    workflowNode = vscode.Uri.file(workflow.data) as vscode.Uri;
  }

  if (isMultiRootWorkspace()) {
    const workflowName = path.basename(path.dirname(workflowNode.fsPath));
    const unitTestName = await context.ui.showInputBox({
      prompt: localize('unitTestNamePrompt', 'Provide a unit test name'),
      placeHolder: localize('unitTestNamePlaceholder', 'Unit test name'),
      validateInput: async (name: string): Promise<string | undefined> => await validateUnitTestName(projectPath, workflowName, name),
    });

    ext.outputChannel.appendLog(localize('unitTestNameEntered', `Unit test name entered: ${unitTestName}`));

    // Set telemetry properties for unit test creation
    context.telemetry.properties.workflowName = workflowName;
    context.telemetry.properties.unitTestName = unitTestName;
    context.telemetry.properties.runId = validatedRunId;

    await callWithTelemetryAndErrorHandling('logicApp.createUnitTest', async (telemetryContext: IActionContext) => {
      Object.assign(telemetryContext, context);
      await generateCodefulUnitTest(context, projectPath, workflowName, unitTestName, validatedRunId);
    });
  } else {
    const message = localize('expectedWorkspace', 'In order to create unit tests, you must have a workspace open.');
    vscode.window.showInformationMessage(message);
    ext.outputChannel.appendLog(message);
  }
}

/**
 * Parses an error (particularly from Axios) before setting a final errorMessage.
 * @param error - The error to parse.
 * @returns {string} - A user-friendly error string.
 */
function parseErrorBeforeTelemetry(error: any): string {
  let errorMessage = '';

  // eslint-disable-next-line import/no-named-as-default-member
  if (axios.isAxiosError(error) && error.response?.data) {
    try {
      const responseData = JSON.parse(new TextDecoder().decode(error.response.data));
      const { message = '', code = '' } = responseData?.error ?? {};
      errorMessage = localize('apiError', `API Error: ${code} - ${message}`);
      ext.outputChannel.appendLog(errorMessage);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (parseError) {
      // If we fail to parse, fall back to the original error
      errorMessage = error.message;
    }
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else {
    // Fallback for non-Error types
    errorMessage = String(error);
  }
  return errorMessage;
}

/**
 * Generates a codeful unit test by calling the backend API, unzipping the response, and creating the .cs file.
 * @param {IAzureConnectorsContext} context - The context for Azure Connectors.
 * @param {string} projectPath - The path to the project directory.
 * @param {string} workflowName - The name of the workflow for which the test is being created.
 * @param {string} unitTestName - The name of the unit test to be created.
 * @param {string | undefined} runId - The ID of the run.
 * @returns {Promise<void>} - A promise that resolves when the unit test has been generated.
 */
export async function generateCodefulUnitTest(
  context: IAzureConnectorsContext,
  projectPath: string,
  workflowName: string,
  unitTestName: string,
  runId?: string
): Promise<void> {
  // Initialize booleans to "false", update to "true" upon success.
  context.telemetry.properties.apiCallInitiated = 'false';
  context.telemetry.properties.apiCallSucceeded = 'false';
  context.telemetry.properties.filesUnzipped = 'false';
  context.telemetry.properties.csFileCreated = 'false';
  context.telemetry.properties.csprojFileCreated = 'false';
  context.telemetry.properties.nugetConfigFileCreated = 'false';
  context.telemetry.properties.testsFolderAddedToWorkspace = 'false';

  const startTime = Date.now();

  try {
    // Validate runId
    if (!runId) {
      context.telemetry.properties.runIdMissing = 'true';
      throw new Error(localize('runIdMissing', 'Run ID is required to generate a codeful unit test.'));
    }

    if (isNullOrUndefined(ext.workflowRuntimePort)) {
      context.telemetry.properties.missingRuntimePort = 'true';
      throw new Error(
        localize('workflowRuntimeNotRunning', 'The workflow runtime is not running. Please start the workflow runtime and try again.')
      );
    }

    context.telemetry.properties.runtimePort = ext.workflowRuntimePort?.toString();

    const baseUrl = `http://localhost:${ext.workflowRuntimePort}`;
    const apiUrl = `${baseUrl}/runtime/webhooks/workflow/api/management/workflows/${encodeURIComponent(
      workflowName
    )}/runs/${encodeURIComponent(runId)}/generateUnitTest`;

    ext.outputChannel.appendLog(localize('apiUrl', `Calling API URL: ${apiUrl}`));

    const unitTestGenerationInput = {
      UnitTestName: unitTestName,
    };

    context.telemetry.properties.apiCallInitiated = 'true';

    ext.outputChannel.appendLog(
      localize(
        'operationalContext',
        `Operational context: Workflow Name: ${workflowName}, Run ID: ${runId}, Unit Test Name: ${unitTestName}`
      )
    );

    ext.outputChannel.appendLog(localize('initiatingApiCall', 'Initiating Unit Test Generation API call...'));

    let response: any;

    // Make the API call within a try/catch to differentiate any request error
    try {
      response = await axios.post(apiUrl, unitTestGenerationInput, {
        headers: {
          Accept: 'application/zip',
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      });
      context.telemetry.properties.apiCallSucceeded = 'true';
      ext.outputChannel.appendLog(localize('apiCallSuccessful', 'API call successful, processing response...'));
      context.telemetry.properties.processStage = 'API Call Completed';
    } catch (apiError: any) {
      context.telemetry.properties.apiCallSucceeded = 'false';
      const parsedApiError = parseErrorBeforeTelemetry(apiError);
      context.telemetry.properties.apiCallFailReason = parsedApiError;
      ext.outputChannel.appendLog(localize('apiCallFailedLog', `API call failed: ${parsedApiError}`));
      throw apiError;
    }

    // Verify content type
    const zipBuffer = Buffer.from(response.data);
    const contentType = response.headers['content-type'];
    if (contentType !== 'application/zip') {
      context.telemetry.properties.apiCallSucceeded = 'false';
      const contentTypeError = localize('invalidResponseType', 'Expected a zip file but received {0}', contentType);
      context.telemetry.properties.apiCallFailReason = contentTypeError;
      throw new Error(contentTypeError);
    }

    // Ensure the folder structure exists
    const testsDirectoryUri = getTestsDirectory(projectPath);
    const testsDirectory = testsDirectoryUri.fsPath;
    const logicAppName = path.basename(path.dirname(path.join(projectPath, workflowName)));
    const logicAppFolderPath = path.join(testsDirectory, logicAppName);
    await fs.ensureDir(logicAppFolderPath);

    const workflowFolderPath = path.join(logicAppFolderPath, workflowName);
    await fs.ensureDir(workflowFolderPath);

    const unitTestFolderPath = path.join(workflowFolderPath, unitTestName);
    await fs.ensureDir(unitTestFolderPath);

    const csprojFilePath = path.join(logicAppFolderPath, `${logicAppName}.csproj`);
    const nugetConfigFilePath = path.join(logicAppFolderPath, nugetFileName);

    // Unzip artifacts
    try {
      ext.outputChannel.appendLog(localize('unzippingFiles', 'Unzipping Mock.json into: {0}', unitTestFolderPath));
      await unzipLogicAppArtifacts(zipBuffer, unitTestFolderPath);
      context.telemetry.properties.filesUnzipped = 'true';
      ext.outputChannel.appendLog(localize('filesUnzipped', 'Files successfully unzipped.'));
      context.telemetry.properties.processStage = 'Files Unzipped';
    } catch (unzipError) {
      context.telemetry.properties.filesUnzipped = 'false';
      context.telemetry.properties.filesUnzipFailReason = parseError(unzipError).message;
      throw unzipError;
    }

    // Create the .cs test file
    try {
      await createCsFile(unitTestFolderPath, unitTestName, workflowName, logicAppName);
      context.telemetry.properties.csFileCreated = 'true';
    } catch (csError) {
      context.telemetry.properties.csFileCreated = 'false';
      context.telemetry.properties.csFileFailReason = parseError(csError).message;
      throw csError;
    }

    // If the .csproj does not exist, create it
    if (!(await fs.pathExists(csprojFilePath))) {
      ext.outputChannel.appendLog(localize('creatingCsproj', 'Creating .csproj file at: {0}', csprojFilePath));
      try {
        await createCsprojFile(csprojFilePath, logicAppName);
        context.telemetry.properties.csprojFileCreated = 'true';

        // Prompt user to reload only if a new .csproj was created
        const action = 'Reload Window';
        vscode.window
          .showInformationMessage('Reload Required: Please reload the VS Code window to enable test discovery in the Test Explorer', action)
          .then((selectedAction) => {
            if (selectedAction === action) {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
      } catch (csprojError) {
        context.telemetry.properties.csprojFileCreated = 'false';
        context.telemetry.properties.csprojFailReason = parseError(csprojError).message;
        throw csprojError;
      }
    }

    // Create NuGet config file
    try {
      await createNugetConfigFile(nugetConfigFilePath);
      context.telemetry.properties.nugetConfigFileCreated = 'true';
    } catch (nugetError) {
      context.telemetry.properties.nugetConfigFileCreated = 'false';
      context.telemetry.properties.nugetConfigFailReason = parseError(nugetError).message;
      throw nugetError;
    }

    // Add tests directory to workspace if not already present
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const isTestsDirectoryInWorkspace = workspaceFolders.some((folder) => folder.uri.fsPath === testsDirectory);

    if (!isTestsDirectoryInWorkspace) {
      try {
        FileManagement.addFolderToWorkspace(testsDirectory);
        context.telemetry.properties.testsFolderAddedToWorkspace = 'true';
      } catch (workspaceError) {
        context.telemetry.properties.testsFolderAddedToWorkspace = 'false';
        context.telemetry.properties.testsFolderFailReason = parseError(workspaceError).message;
        throw workspaceError;
      }
    }

    // Mark success
    context.telemetry.properties.unitTestGenerationStatus = 'Success';
    context.telemetry.measurements.generateCodefulUnitTestMs = Date.now() - startTime;
  } catch (methodError: any) {
    // Overall catch
    context.telemetry.properties.unitTestGenerationStatus = 'Failed';

    // Show the underlying error in the console
    const errorMessage1 = parseError(methodError).message;
    console.log(errorMessage1);

    // Parse the error for final telemetry
    const errorMessage = parseErrorBeforeTelemetry(methodError);
    context.telemetry.properties.errorMessage = errorMessage;

    const errorDisplayMessage = localize('error.generateCodefulUnitTest', 'Failed to generate codeful unit test: {0}', errorMessage);
    vscode.window.showErrorMessage(errorDisplayMessage);
    ext.outputChannel.appendLog(errorDisplayMessage);

    throw methodError; // rethrow after logging
  }
}

/**
 * Creates a .csproj file in the specified logic app folder using a template.
 * @param {string} csprojFilePath - The path where the .csproj file will be created.
 * @param {string} logicAppName - The name of the Logic App, used to customize the .csproj file.
 * @returns {Promise<void>} - A promise that resolves when the .csproj file has been created.
 */
async function createCsprojFile(csprojFilePath: string, logicAppName: string): Promise<void> {
  const templateFolderName = 'UnitTestTemplates';
  const csprojTemplateFileName = 'TestProjectFile';
  const templatePath = path.join(__dirname, 'assets', templateFolderName, csprojTemplateFileName);

  const templateContent = await fs.readFile(templatePath, 'utf-8');
  const csprojContent = templateContent.replace(/<%= logicAppName %>/g, logicAppName);
  await fs.writeFile(csprojFilePath, csprojContent);

  ext.outputChannel.appendLog(localize('csprojFileCreated', 'Created .csproj file at: {0}', csprojFilePath));
}

/**
 * Creates a nuget.config file in the specified logic app folder using a template.
 * @param {string} nugetConfigFilePath - The path where the .csproj file will be created.
 * @returns {Promise<void>} - A promise that resolves when the .csproj file has been created.
 */
async function createNugetConfigFile(nugetConfigFilePath: string): Promise<void> {
  const templateFolderName = 'UnitTestTemplates';
  const nugetConfigTemplateFileName = 'TestNugetConfig';
  const templatePath = path.join(__dirname, 'assets', templateFolderName, nugetConfigTemplateFileName);

  const templateContent = await fs.readFile(templatePath, 'utf-8');
  await fs.writeFile(nugetConfigFilePath, templateContent);

  ext.outputChannel.appendLog(localize('nugetConfigFileCreated', 'Created nuget.config file at: {0}', nugetConfigFilePath));
}

/**
 * Creates a .cs file in the specified unit test folder using a template.
 * Converts any "-" characters in LogicAppName, WorkflowName, and UnitTestName to "_" only in code-related contexts.
 * @param {string} unitTestFolderPath - The path to the unit test folder.
 * @param {string} unitTestName - The name of the unit test.
 * @param {string} workflowName - The name of the workflow.
 * @param {string} logicAppName - The name of the logic app.
 */
async function createCsFile(unitTestFolderPath: string, unitTestName: string, workflowName: string, logicAppName: string): Promise<void> {
  const templateFolderName = 'UnitTestTemplates';
  const csTemplateFileName = 'TestClassFile';
  const templatePath = path.join(__dirname, 'assets', templateFolderName, csTemplateFileName);

  let templateContent = await fs.readFile(templatePath, 'utf-8');

  const sanitizedUnitTestName = unitTestName.replace(/-/g, '_');
  const sanitizedWorkflowName = workflowName.replace(/-/g, '_');
  const sanitizedLogicAppName = logicAppName.replace(/-/g, '_');

  templateContent = templateContent.replace(/namespace <%= LogicAppName %>\.Tests/g, `namespace ${sanitizedLogicAppName}.Tests`);
  templateContent = templateContent.replace(/public class <%= UnitTestName %>/g, `public class ${sanitizedUnitTestName}`);
  templateContent = templateContent.replace(/<see cref="<%= UnitTestName %>" \/>/g, `<see cref="${sanitizedUnitTestName}" />`);
  templateContent = templateContent.replace(/public <%= UnitTestName %>\(\)/g, `public ${sanitizedUnitTestName}()`);
  templateContent = templateContent.replace(
    /public async Task <%= WorkflowName %>_<%= UnitTestName %>_ExecuteWorkflow/g,
    `public async Task ${sanitizedWorkflowName}_${sanitizedUnitTestName}_ExecuteWorkflow`
  );

  templateContent = templateContent
    .replace(/<%= LogicAppName %>/g, logicAppName)
    .replace(/<%= WorkflowName %>/g, workflowName)
    .replace(/<%= UnitTestName %>/g, unitTestName);

  const csFilePath = path.join(unitTestFolderPath, `${unitTestName}.cs`);
  await fs.writeFile(csFilePath, templateContent);

  ext.outputChannel.appendLog(localize('csFileCreated', 'Created .cs file at: {0}', csFilePath));
}

/**
 * Validates and extracts the runId from a given input.
 * Ensures the runId format is correct and extracts it from a path if needed.
 * @param {string | undefined} runId - The input runId to validate and extract.
 * @returns {Promise<string>} - A Promise that resolves to the validated and extracted runId.
 */
async function extractAndValidateRunId(runId?: string): Promise<string> {
  if (!runId) {
    throw new Error(localize('runIdMissing', 'Run ID is required to generate a codeful unit test.'));
  }

  // Regular expression to extract the runId from a path
  const runIdRegex = /\/workflows\/[^/]+\/runs\/(.+)$/;
  const match = runId.match(runIdRegex);
  const extractedRunId = match ? match[1].trim() : runId.trim();

  // Validate the extracted runId
  await validateRunId(extractedRunId);
  return extractedRunId;
}

/**
 * Validates the format of the runId.
 * Ensures that the runId consists of only uppercase letters and numbers.
 * @param {string} runId - The runId to validate.
 * @throws {Error} - Throws an error if the runId format is invalid.
 */
async function validateRunId(runId: string): Promise<void> {
  const runIdFormat = /^[A-Z0-9]+$/;
  if (!runIdFormat.test(runId)) {
    throw new Error(localize('invalidRunIdFormat', 'Invalid runId format.'));
  }
}

/**
 * Prompts the user to select a workflow and returns the selected workflow.
 * @param {IActionContext} context - The action context.
 * @param {string} projectPath - The path of the project.
 * @returns {Promise<IAzureQuickPickItem<string>>} - A promise that resolves to the selected workflow.
 */
const pickWorkflow = async (context: IActionContext, projectPath: string): Promise<IAzureQuickPickItem<string>> => {
  const placeHolder: string = localize('selectLogicApp', 'Select workflow to create unit test');
  return await context.ui.showQuickPick(getWorkflowsPick(projectPath), {
    placeHolder,
  });
};

/**
 * Retrieves the list of workflows in the local project.
 * @param {string} projectPath - The path to the local project.
 * @returns {Promise<IAzureQuickPickItem<string>[]>} - An array of Azure Quick Pick items representing the logic apps in the project.
 */
const getWorkflowsPick = async (projectPath: string): Promise<IAzureQuickPickItem<string>[]> => {
  const listOfWorkflows = await getWorkflowsInLocalProject(projectPath);
  const picks: IAzureQuickPickItem<string>[] = Array.from(Object.keys(listOfWorkflows)).map((workflowName) => {
    return {
      label: workflowName,
      data: path.join(projectPath, workflowName, workflowFileName),
    };
  });
  picks.sort((a, b) => a.label.localeCompare(b.label));
  return picks;
};
