/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
  projectLanguageSetting,
  workerRuntimeKey,
  localEmulatorConnectionString,
  azureWebJobsStorageKey,
  localSettingsFileName,
  Platform,
} from '../../constants';
import { localize } from '../../localize';
import { validateFuncCoreToolsInstalled } from '../commands/funcCoreTools/validateFuncCoreToolsInstalled';
import { getAzureWebJobsStorage, setLocalAppSetting } from '../utils/appSettings/localSettings';
import { getDebugConfigs, isDebugConfigEqual } from '../utils/vsCodeConfig/launch';
import { getWorkspaceSetting, getFunctionsWorkerRuntime } from '../utils/vsCodeConfig/settings';
import type { IActionContext } from '@microsoft/vscode-azext-utils';
import { parseError } from '@microsoft/vscode-azext-utils';
import { MismatchBehavior } from '@microsoft/vscode-extension-logic-apps';
import * as azureStorage from 'azure-storage';
import * as vscode from 'vscode';

/**
 * Validates functions core tools is installed and azure emulator is running
 * @param {IActionContext} context - Command context.
 * @param {vscode.DebugConfiguration} debugConfig - Workspace debug configuration.
 * @param {string} projectPath - The logic app project path.
 * @returns {boolean} Flag to determine if debug should continue.
 */
export async function preDebugValidate(
  context: IActionContext,
  debugConfig: vscode.DebugConfiguration,
  projectPath: string
): Promise<boolean> {
  let shouldContinue: boolean;
  context.telemetry.properties.debugType = debugConfig.type;

  try {
    context.telemetry.properties.lastValidateStep = 'funcInstalled';
    const message: string = localize(
      'installFuncTools',
      'You must have the Azure Functions Core Tools installed to debug your local functions.'
    );
    shouldContinue = await validateFuncCoreToolsInstalled(context, message, projectPath);

    if (shouldContinue) {
      const projectLanguage: string | undefined = getWorkspaceSetting(projectLanguageSetting, projectPath);
      context.telemetry.properties.projectLanguage = projectLanguage;

      context.telemetry.properties.lastValidateStep = 'workerRuntime';
      await validateWorkerRuntime(context, projectLanguage, projectPath);

      context.telemetry.properties.lastValidateStep = 'emulatorRunning';
      shouldContinue = await validateEmulatorIsRunning(context, projectPath);
    }
  } catch (error) {
    if (parseError(error).isUserCancelledError) {
      shouldContinue = false;
    } else {
      throw error;
    }
  }

  context.telemetry.properties.shouldContinue = String(shouldContinue);

  return shouldContinue;
}

/**
 * Gets the workspace folder that matches the debug configuration.
 * @param {vscode.DebugConfiguration} debugConfig - Debug configuration to match.
 * @returns {vscode.WorkspaceFolder} The workspace folder that matches the debug configuration.
 */
export function getMatchingWorkspaceFolder(debugConfig: vscode.DebugConfiguration): vscode.WorkspaceFolder {
  if (vscode.workspace.workspaceFolders) {
    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      try {
        const configs: vscode.DebugConfiguration[] = getDebugConfigs(workspaceFolder);
        if (configs.some((c) => isDebugConfigEqual(c, debugConfig))) {
          return workspaceFolder;
        }
      } catch {
        // ignore and try next workspace
      }
    }
  }

  throw new Error(
    localize(
      'noDebug',
      'Failed to find launch config matching name "{0}", request "{1}", and type "{2}".',
      debugConfig.name,
      debugConfig.request,
      debugConfig.type
    )
  );
}

/**
 * Automatically adds worker runtime setting since it's required to debug, but often gets deleted since it's stored in "local.settings.json" which isn't tracked in source control
 * @param {IActionContext} context - Command context.
 * @param {string | undefinedn} projectLanguage - Project language.
 * @param {string} projectPath - Project path.
 */
async function validateWorkerRuntime(context: IActionContext, projectLanguage: string | undefined, projectPath: string): Promise<void> {
  const runtime: string | undefined = getFunctionsWorkerRuntime(projectLanguage);
  if (runtime) {
    // Not worth handling mismatched runtimes since it's so unlikely
    await setLocalAppSetting(context, projectPath, workerRuntimeKey, runtime, MismatchBehavior.DontChange);
  }
}

/**
 * If AzureWebJobsStorage is set, pings the emulator to make sure it's actually running
 * @param {IActionContext} context - Command context.
 * @param {string} projectPath - Project path.
 * @param {boolean} promptWarningMessage - Boolean to determine whether prompt a message to ask user if emulator is running.
 * @returns {boolean} Returns true if a valid emulator is running, otherwise returns false.
 */
export async function validateEmulatorIsRunning(
  context: IActionContext,
  projectPath: string,
  promptWarningMessage = true
): Promise<boolean> {
  const azureWebJobsStorage: string | undefined = await getAzureWebJobsStorage(context, projectPath);

  if (azureWebJobsStorage && azureWebJobsStorage.toLowerCase() === localEmulatorConnectionString.toLowerCase()) {
    try {
      const client: azureStorage.BlobService = azureStorage.createBlobService(azureWebJobsStorage);
      await new Promise<void>((resolve, reject) => {
        // Checking against a common container for functions, but doesn't really matter what call we make here
        client.doesContainerExist('azure-webjob-hosts', (err: Error | undefined) => {
          err ? reject(err) : resolve();
        });
      });
    } catch {
      if (!promptWarningMessage) {
        return false;
      }
      const message: string = localize(
        'failedToConnectEmulator',
        'Failed to verify "{0}" connection specified in "{1}". Is the local emulator installed and running?',
        azureWebJobsStorageKey,
        localSettingsFileName
      );

      const learnMoreLink: string = process.platform === Platform.windows ? 'https://aka.ms/AA4ym56' : 'https://aka.ms/AA4yef8';
      const debugAnyway: vscode.MessageItem = { title: localize('debugAnyway', 'Debug anyway') };
      const result: vscode.MessageItem = await context.ui.showWarningMessage(message, { learnMoreLink, modal: true }, debugAnyway);
      return result === debugAnyway;
    }
  }

  return true;
}
