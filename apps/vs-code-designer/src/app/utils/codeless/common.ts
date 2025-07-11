import {
  localSettingsFileName,
  workflowTenantIdKey,
  workflowSubscriptionIdKey,
  workflowResourceGroupNameKey,
  workflowLocationKey,
  workflowManagementBaseURIKey,
  managementApiPrefix,
  workflowFileName,
  artifactsDirectory,
  mapsDirectory,
  schemasDirectory,
  azurePublicBaseUrl,
  rulesDirectory,
} from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { createAzureWizard } from '../../commands/workflows/azureConnectorWizard';
import type { IAzureConnectorsContext } from '../../commands/workflows/azureConnectorWizard';
import type { RemoteWorkflowTreeItem } from '../../tree/remoteWorkflowsTree/RemoteWorkflowTreeItem';
import { getLocalSettingsJson } from '../appSettings/localSettings';
import { writeFormattedJson } from '../fs';
import { getAuthorizationToken } from './getAuthorizationToken';
import type { IActionContext } from '@microsoft/vscode-azext-utils';
import { DialogResponses } from '@microsoft/vscode-azext-utils';
import type {
  IWorkflowFileContent,
  StandardApp,
  AzureConnectorDetails,
  ILocalSettingsJson,
  Parameter,
  WorkflowParameter,
} from '@microsoft/vscode-extension-logic-apps';
import { readFileSync } from 'fs';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import type { MessageItem, WebviewPanel } from 'vscode';

export type File = {
  path: string;
  name: string;
};

export function tryGetWebviewPanel(category: string, name: string): WebviewPanel | undefined {
  const currentPanels = ext.openWebviewPanels[category];
  return currentPanels ? currentPanels[name] : undefined;
}

export function cacheWebviewPanel(category: string, name: string, panel: WebviewPanel): void {
  const currentPanels = ext.openWebviewPanels[category];

  if (currentPanels) {
    currentPanels[name] = panel;
  }
}

export function removeWebviewPanelFromCache(category: string, name: string): void {
  const currentPanels = ext.openWebviewPanels[category];

  if (currentPanels) {
    delete currentPanels[name];
  }
}

export function getStandardAppData(workflowName: string, workflow: IWorkflowFileContent): StandardApp {
  const { definition, kind, runtimeConfiguration } = workflow;
  const statelessRunMode = runtimeConfiguration && runtimeConfiguration.statelessRunMode ? runtimeConfiguration.statelessRunMode : '';
  const operationOptions = runtimeConfiguration && runtimeConfiguration.operationOptions ? runtimeConfiguration.operationOptions : '';

  return {
    statelessRunMode,
    definition,
    name: workflowName,
    stateful: kind === 'Stateful',
    kind,
    operationOptions,
  };
}

export async function createJsonFileIfDoesNotExist(filePath: string, fileName: string): Promise<void> {
  const parametersFilePath = path.join(filePath, fileName);
  const connectionsFileExists = fse.pathExistsSync(parametersFilePath);
  if (!connectionsFileExists) {
    await writeFormattedJson(parametersFilePath, {});
  }
}

export function getWorkflowParameters(parameters: Record<string, Parameter>): Record<string, WorkflowParameter> {
  const workflowParameters: Record<string, WorkflowParameter> = {};
  for (const parameterKey of Object.keys(parameters)) {
    const parameter = parameters[parameterKey];
    workflowParameters[parameterKey] = {
      ...parameter,
      defaultValue: parameter.value,
    };
  }
  return workflowParameters;
}

export async function updateFuncIgnore(projectPath: string, variables: string[]) {
  const funcIgnorePath: string = path.join(projectPath, '.funcignore');
  let funcIgnoreContents: string | undefined;
  if (await fse.pathExists(funcIgnorePath)) {
    funcIgnoreContents = (await fse.readFile(funcIgnorePath)).toString();
    for (const variable of variables) {
      if (funcIgnoreContents && !funcIgnoreContents.includes(variable)) {
        funcIgnoreContents = funcIgnoreContents.concat(`${os.EOL}${variable}`);
      }
    }
  }

  if (!funcIgnoreContents) {
    funcIgnoreContents = variables.join(os.EOL);
  }

  await fse.writeFile(funcIgnorePath, funcIgnoreContents);
}

export async function getArtifactsPathInLocalProject(projectPath: string): Promise<{ maps: File[]; schemas: File[]; rules: File[] }> {
  const artifacts = {
    maps: [],
    schemas: [],
    rules: [],
  };
  const artifactsPath = path.join(projectPath, artifactsDirectory);
  const mapsPath = path.join(projectPath, artifactsDirectory, mapsDirectory);
  const schemasPath = path.join(projectPath, artifactsDirectory, schemasDirectory);
  const rulesPath = path.join(projectPath, artifactsDirectory, rulesDirectory);

  if (!(await fse.pathExists(projectPath)) || !(await fse.pathExists(artifactsPath))) {
    return artifacts;
  }

  if (await fse.pathExists(mapsPath)) {
    const mapsFiles = [];
    const subPaths: string[] = await fse.readdir(mapsPath);

    for (const subPath of subPaths) {
      const fullPath: string = path.join(mapsPath, subPath);
      const fileStats = await fse.lstat(fullPath);

      if (fileStats.isFile()) {
        if (await fse.pathExists(fullPath)) {
          mapsFiles.push({ path: fullPath, name: subPath });
        }
      }
    }
    artifacts.maps = mapsFiles;
  }

  if (await fse.pathExists(schemasPath)) {
    const schemasFiles = [];
    const subPaths: string[] = await fse.readdir(schemasPath);

    for (const subPath of subPaths) {
      const fullPath: string = path.join(schemasPath, subPath);
      const fileStats = await fse.lstat(fullPath);

      if (fileStats.isFile()) {
        if (await fse.pathExists(fullPath)) {
          schemasFiles.push({ path: fullPath, name: subPath });
        }
      }
    }
    artifacts.schemas = schemasFiles;
  }

  if (await fse.pathExists(rulesPath)) {
    const rulesFiles = [];
    const subPaths: string[] = await fse.readdir(rulesPath);

    for (const subPath of subPaths) {
      const fullPath: string = path.join(rulesPath, subPath);
      const fileStats = await fse.lstat(fullPath);

      if (fileStats.isFile()) {
        if (await fse.pathExists(fullPath)) {
          rulesFiles.push({ path: fullPath, name: subPath });
        }
      }
    }
    artifacts.rules = rulesFiles;
  }

  return artifacts;
}

export async function getAzureConnectorDetailsForLocalProject(
  context: IActionContext,
  projectPath: string
): Promise<AzureConnectorDetails> {
  const localSettingsFilePath = path.join(projectPath, localSettingsFileName);
  const connectorsContext = context as IAzureConnectorsContext;
  const localSettings = await getLocalSettingsJson(context, localSettingsFilePath);
  let tenantId = localSettings.Values[workflowTenantIdKey];
  let subscriptionId = localSettings.Values[workflowSubscriptionIdKey];
  let resourceGroupName = localSettings.Values[workflowResourceGroupNameKey];
  let location = localSettings.Values[workflowLocationKey];

  // Set default for customers who created Logic Apps before sovereign cloud support was added.
  let workflowManagementBaseUrl = localSettings.Values[workflowManagementBaseURIKey] ?? `${azurePublicBaseUrl}/`;

  if (subscriptionId === undefined) {
    const wizard = createAzureWizard(connectorsContext, projectPath);
    await wizard.prompt();
    await wizard.execute();

    tenantId = connectorsContext.tenantId;
    subscriptionId = connectorsContext.subscriptionId;
    resourceGroupName = connectorsContext.resourceGroup?.name || '';
    location = connectorsContext.resourceGroup?.location || '';
    workflowManagementBaseUrl = connectorsContext.environment?.resourceManagerEndpointUrl;
  }

  const enabled = !!subscriptionId;

  return {
    enabled,
    accessToken: enabled ? await getAuthorizationToken(tenantId) : undefined,
    subscriptionId: enabled ? subscriptionId : undefined,
    resourceGroupName: enabled ? resourceGroupName : undefined,
    location: enabled ? location : undefined,
    tenantId: enabled ? tenantId : undefined,
    workflowManagementBaseUrl: enabled ? workflowManagementBaseUrl : undefined,
  };
}

export async function getManualWorkflowsInLocalProject(projectPath: string, workflowToExclude: string): Promise<Record<string, any>> {
  if (!(await fse.pathExists(projectPath))) {
    return {};
  }

  const workflowDetails: Record<string, any> = {};
  const subPaths: string[] = await fse.readdir(projectPath);
  for (const subPath of subPaths) {
    const fullPath: string = path.join(projectPath, subPath);
    const fileStats = await fse.lstat(fullPath);

    if (fileStats.isDirectory() && subPath !== workflowToExclude) {
      try {
        const workflowFilePath = path.join(fullPath, workflowFileName);

        if (await fse.pathExists(workflowFilePath)) {
          const schema = getRequestTriggerSchema(JSON.parse(readFileSync(workflowFilePath, 'utf8')));

          if (schema) {
            workflowDetails[subPath] = schema;
          }
        }
      } catch {
        // If unable to load the workflow or read the definition we skip the workflow
        // in child workflow list.
      }
    }
  }

  return workflowDetails;
}

export async function getWorkflowsPathInLocalProject(projectPath: string): Promise<File[]> {
  if (!(await fse.pathExists(projectPath))) {
    return [];
  }

  const worfklowFiles = [];
  const subPaths: string[] = await fse.readdir(projectPath);

  for (const subPath of subPaths) {
    const fullPath: string = path.join(projectPath, subPath);
    const fileStats = await fse.lstat(fullPath);

    if (fileStats.isDirectory()) {
      try {
        const workflowFilePath = path.join(fullPath, workflowFileName);

        if (await fse.pathExists(workflowFilePath)) {
          worfklowFiles.push({ path: workflowFilePath, name: subPath });
        }
      } catch {
        // If unable to load the workflow or read the definition we skip the workflow
        // in child workflow list.
      }
    }
  }

  return worfklowFiles;
}

/**
 * Retrieves the workflows in a local project.
 * @param {string} projectPath - The path to the project.
 * @returns A promise that resolves to a record of workflow names and their corresponding schemas.
 */
export async function getWorkflowsInLocalProject(projectPath: string): Promise<Record<string, StandardApp>> {
  if (!(await fse.pathExists(projectPath))) {
    return {};
  }

  const workflowDetails: Record<string, any> = {};
  const subPaths: string[] = await fse.readdir(projectPath);
  for (const subPath of subPaths) {
    const fullPath: string = path.join(projectPath, subPath);
    const fileStats = await fse.lstat(fullPath);

    if (fileStats.isDirectory()) {
      try {
        const workflowFilePath = path.join(fullPath, workflowFileName);

        if (await fse.pathExists(workflowFilePath)) {
          const schema = JSON.parse(readFileSync(workflowFilePath, 'utf8'));
          if (schema) {
            workflowDetails[subPath] = schema;
          }
        }
      } catch {
        // If unable to load the workflow or read the definition we skip the workflow
      }
    }
  }

  return workflowDetails;
}
export function getRequestTriggerSchema(workflowContent: IWorkflowFileContent): any {
  const {
    definition: { triggers },
  } = workflowContent;
  const triggerNames = Object.keys(triggers);

  if (triggerNames.length === 1) {
    const trigger = triggers[triggerNames[0]];
    if (trigger.type.toLowerCase() === 'request') {
      return trigger.inputs && trigger.inputs.schema ? trigger.inputs.schema : {};
    }
  }

  return undefined;
}

export function getWorkflowManagementBaseURI(node: RemoteWorkflowTreeItem): string {
  let resourceManagerUri: string = node.parent.subscription.environment.resourceManagerEndpointUrl;
  if (resourceManagerUri.endsWith('/')) {
    resourceManagerUri = resourceManagerUri.slice(0, -1);
  }
  return `${resourceManagerUri}${node.parent.parent.id}/hostruntime${managementApiPrefix}`;
}

/**
 * Verifies local and remot and resource group are the same, otherwise propmts message.
 * @param {IActionContext} context - Command context.
 * @param {string} workflowResourceGroupRemote - Remote resource group name.
 * @param {string} originalDeployFsPath - Workflow path to deploy.
 */
export async function verifyDeploymentResourceGroup(
  context: IActionContext,
  workflowResourceGroupRemote: string,
  originalDeployFsPath: string
): Promise<void> {
  const localSettings: ILocalSettingsJson = await getLocalSettingsJson(context, path.join(originalDeployFsPath, localSettingsFileName));
  const workflowResourceGroupLocal: string = localSettings.Values[workflowResourceGroupNameKey];

  if (workflowResourceGroupLocal && workflowResourceGroupLocal.toLowerCase() !== workflowResourceGroupRemote.toLowerCase()) {
    const warning: string = localize(
      'resourceGroupMismatch',
      'For optimal performance, put managed connections in the same resource group as your workflow. Are you sure you want to deploy?'
    );
    const deployButton: MessageItem = { title: localize('deploy', 'Deploy') };
    await context.ui.showWarningMessage(warning, { modal: true }, deployButton, DialogResponses.cancel);
  }
}
