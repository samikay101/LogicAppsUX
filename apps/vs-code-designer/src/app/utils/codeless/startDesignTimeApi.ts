/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
  Platform,
  ProjectDirectoryPath,
  autoStartDesignTimeSetting,
  defaultVersionRange,
  designTimeDirectoryName,
  designerStartApi,
  extensionBundleId,
  hostFileName,
  localSettingsFileName,
  logicAppKind,
  showStartDesignTimeMessageSetting,
  designerApiLoadTimeout,
  type hostFileContent,
  workerRuntimeKey,
  appKindSetting,
} from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { addOrUpdateLocalAppSettings, getLocalSettingsSchema } from '../appSettings/localSettings';
import { updateFuncIgnore } from '../codeless/common';
import { writeFormattedJson } from '../fs';
import { getFunctionsCommand } from '../funcCoreTools/funcVersion';
import { tryGetLogicAppProjectRoot } from '../verifyIsProject';
import { getWorkspaceSetting, updateGlobalSetting } from '../vsCodeConfig/settings';
import { getWorkspaceFolder } from '../workspace';
import { delay } from '@azure/ms-rest-js';
import {
  DialogResponses,
  openUrl,
  type IActionContext,
  type IAzExtOutputChannel,
  callWithTelemetryAndErrorHandling,
} from '@microsoft/vscode-azext-utils';
import type { ILocalSettingsJson } from '@microsoft/vscode-extension-logic-apps';
import { WorkerRuntime } from '@microsoft/vscode-extension-logic-apps';
import axios from 'axios';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as portfinder from 'portfinder';
import * as vscode from 'vscode';
import { Uri, window, workspace, type MessageItem } from 'vscode';
import { findChildProcess } from '../../commands/pickFuncProcess';
import pstree from 'ps-tree';
import find_process from 'find-process';

export async function startDesignTimeApi(projectPath: string): Promise<void> {
  await callWithTelemetryAndErrorHandling('azureLogicAppsStandard.startDesignTimeApi', async (actionContext: IActionContext) => {
    actionContext.telemetry.properties.startDesignTimeApi = 'false';

    const hostFileContent: any = {
      version: '2.0',
      extensionBundle: {
        id: extensionBundleId,
        version: defaultVersionRange,
      },
      extensions: {
        workflow: {
          settings: {
            'Runtime.WorkflowOperationDiscoveryHostMode': 'true',
          },
        },
      },
    };

    if (!ext.designTimePort) {
      ext.designTimePort = await portfinder.getPortPromise();
    }

    const url = `http://localhost:${ext.designTimePort}${designerStartApi}`;
    if (await isDesignTimeUp(url)) {
      actionContext.telemetry.properties.isDesignTimeUp = 'true';
      const correctFuncProcess = await checkFuncProcessId();
      if (!correctFuncProcess) {
        stopDesignTimeApi();
        await startDesignTimeApi(projectPath);
      }
      return;
    }

    try {
      window.showInformationMessage(
        localize('azureFunctions.designTimeApi', 'Starting workflow design-time API, which might take a few seconds.'),
        'OK'
      );
      ext.outputChannel.appendLog('Starting Design Time Api');

      const designTimeDirectory: Uri | undefined = await getOrCreateDesignTimeDirectory(designTimeDirectoryName, projectPath);
      const settingsFileContent = getLocalSettingsSchema(true, projectPath);

      if (designTimeDirectory) {
        await createJsonFile(designTimeDirectory, hostFileName, hostFileContent);
        await createJsonFile(designTimeDirectory, localSettingsFileName, settingsFileContent);
        await addOrUpdateLocalAppSettings(
          actionContext,
          designTimeDirectory.fsPath,
          {
            [appKindSetting]: logicAppKind,
            [ProjectDirectoryPath]: projectPath,
            [workerRuntimeKey]: WorkerRuntime.Node,
          },
          true
        );
        await updateFuncIgnore(projectPath, [`${designTimeDirectoryName}/`]);
        const cwd: string = designTimeDirectory.fsPath;
        const portArgs = `--port ${ext.designTimePort}`;
        startDesignTimeProcess(ext.outputChannel, cwd, getFunctionsCommand(), 'host', 'start', portArgs);
        await waitForDesignTimeStartUp(url, new Date().getTime());
        ext.pinnedBundleVersion = false;
        const hostfilepath: Uri = Uri.file(path.join(cwd, hostFileName));
        const data = JSON.parse(fs.readFileSync(hostfilepath.fsPath, 'utf-8'));
        if (data.extensionBundle) {
          const versionWithoutSpaces = data.extensionBundle.version.replace(/\s+/g, '');
          const rangeWithoutSpaces = defaultVersionRange.replace(/\s+/g, '');
          if (data.extensionBundle.id === extensionBundleId && versionWithoutSpaces === rangeWithoutSpaces) {
            ext.currentBundleVersion = ext.latestBundleVersion;
          } else if (data.extensionBundle.id === extensionBundleId && versionWithoutSpaces !== rangeWithoutSpaces) {
            ext.currentBundleVersion = extractPinnedVersion(data.extensionBundle.version) ?? data.extensionBundle.version;
            ext.pinnedBundleVersion = true;
          }
        }
        actionContext.telemetry.properties.startDesignTimeApi = 'true';
      } else {
        throw new Error(localize('DesignTimeDirectoryError', 'Failed to create design-time directory.'));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : error;
      const viewOutput: MessageItem = { title: localize('viewOutput', 'View output') };
      const message = localize('DesignTimeError', "Can't start the background design-time process.") + errorMessage;
      actionContext.telemetry.properties.startDesignTimeApiError = errorMessage;

      window.showErrorMessage(message, viewOutput).then(async (result) => {
        if (result === viewOutput) {
          ext.outputChannel.show();
        }
      });
    }
  });
}

function extractPinnedVersion(input: string): string | null {
  // Regular expression to match the format "[1.24.58]"
  const regex = /^\[(\d{1}\.\d{1,2}\.\d{1,2})\]$/;
  const match = input.match(regex);

  if (match) {
    // Extracted time part is in the first capturing group
    return match[1];
  }
  return null;
}

export async function checkFuncProcessId(): Promise<boolean> {
  let correctId = false;
  if (os.platform() === Platform.windows) {
    await pstree(ext.designChildProcess.pid, (_err, children) => {
      children.forEach((p) => {
        if (p.PID === ext.designChildFuncProcessId && (p.COMMAND || p.COMM) === 'func.exe') {
          correctId = true;
        }
      });
    });
    await delay(1000);
  } else {
    await find_process('pid', ext.designChildProcess.pid).then((list) => {
      if (list.length > 0) {
        if (list[0].name === 'func' || list[0].name.includes('func')) {
          correctId = true;
        }
      }
    });
  }
  return correctId;
}

export async function getOrCreateDesignTimeDirectory(designTimeDirectory: string, projectRoot: string): Promise<Uri | undefined> {
  const directory: string = designTimeDirectory + path.sep;
  if (projectRoot.includes(designTimeDirectoryName)) {
    return Uri.file(projectRoot);
  }

  const designTimeDirectoryUri: Uri = Uri.file(path.join(projectRoot, directory));
  if (!fs.existsSync(designTimeDirectoryUri.fsPath)) {
    await workspace.fs.createDirectory(designTimeDirectoryUri);
  }
  return designTimeDirectoryUri;
}

export async function waitForDesignTimeStartUp(url: string, initialTime: number): Promise<void> {
  while (!(await isDesignTimeUp(url)) && new Date().getTime() - initialTime < designerApiLoadTimeout) {
    await delay(2000);
  }
  if (await isDesignTimeUp(url)) {
    ext.designChildFuncProcessId = await findChildProcess(ext.designChildProcess.pid);
    return Promise.resolve();
  }
  return Promise.reject();
}

export async function isDesignTimeUp(url: string): Promise<boolean> {
  try {
    await axios.get(url);
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

export function startDesignTimeProcess(
  outputChannel: IAzExtOutputChannel | undefined,
  workingDirectory: string | undefined,
  command: string,
  ...args: string[]
): void {
  let cmdOutput = '';
  let cmdOutputIncludingStderr = '';
  const formattedArgs: string = args.join(' ');

  const options: cp.SpawnOptions = {
    cwd: workingDirectory || os.tmpdir(),
    shell: true,
  };

  ext.designChildProcess = cp.spawn(command, args, options);

  if (outputChannel) {
    outputChannel.appendLog(
      localize('runningCommand', 'Running command: "{0} {1}" with pid: "{2}"...', command, formattedArgs, ext.designChildProcess.pid)
    );
  }

  ext.designChildProcess.stdout.on('data', (data: string | Buffer) => {
    data = data.toString();
    cmdOutput = cmdOutput.concat(data);
    cmdOutputIncludingStderr = cmdOutputIncludingStderr.concat(data);
    const languageWorkerText = 'Failed to start a new language worker for runtime: node';
    if (outputChannel) {
      outputChannel.append(data);
    }
    if (data.toLowerCase().includes(languageWorkerText.toLowerCase())) {
      ext.outputChannel.appendLog(
        'Language worker issue found when launching func most likely due to a conflicting port. Restarting design-time process.'
      );
      stopDesignTimeApi();
      startDesignTimeApi(path.dirname(workingDirectory));
    }
  });

  ext.designChildProcess.stderr.on('data', (data: string | Buffer) => {
    data = data.toString();
    cmdOutputIncludingStderr = cmdOutputIncludingStderr.concat(data);
    const portUnavailableText = 'is unavailable. Close the process using that port, or specify another port using';
    if (outputChannel) {
      outputChannel.append(data);
    }
    if (data.toLowerCase().includes(portUnavailableText.toLowerCase())) {
      ext.outputChannel.appendLog('Conflicting port found when launching func. Restarting design-time process.');
      stopDesignTimeApi();
      startDesignTimeApi(path.dirname(workingDirectory));
    }
  });
}

export function stopDesignTimeApi(): void {
  ext.outputChannel.appendLog('Stopping Design Time Api');
  ext.designTimePort = undefined;
  if (ext.designChildProcess === null || ext.designChildProcess === undefined) {
    return;
  }

  if (os.platform() === Platform.windows) {
    cp.exec(`taskkill /pid ${ext.designChildFuncProcessId} /t /f`);
    cp.exec(`taskkill /pid ${ext.designChildProcess.pid} /t /f`);
  } else {
    cp.spawn('kill', ['-9'].concat(`${ext.designChildProcess.pid}`));
  }
  ext.designChildProcess = undefined;
  ext.designChildFuncProcessId = undefined;
}

export async function promptStartDesignTimeOption(context: IActionContext) {
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const workspaceFolder = await getWorkspaceFolder(context, undefined, true);
    const projectPath = await tryGetLogicAppProjectRoot(context, workspaceFolder);
    const autoStartDesignTime = !!getWorkspaceSetting<boolean>(autoStartDesignTimeSetting);
    const showStartDesignTimeMessage = !!getWorkspaceSetting<boolean>(showStartDesignTimeMessageSetting);

    if (projectPath) {
      if (!fs.existsSync(path.join(projectPath, localSettingsFileName))) {
        const settingsFileContent = getLocalSettingsSchema(false, projectPath);
        const projectUri: Uri = Uri.file(projectPath);
        await createJsonFile(projectUri, localSettingsFileName, settingsFileContent);
      }

      if (autoStartDesignTime) {
        startDesignTimeApi(projectPath);
      } else if (showStartDesignTimeMessage) {
        const message = localize(
          'startDesignTimeApi',
          'Always start the background design-time process at launch? The workflow designer will open faster.'
        );
        const confirm = { title: localize('yesRecommended', 'Yes (Recommended)') };
        let result: MessageItem;
        do {
          result = await context.ui.showWarningMessage(message, confirm, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
          if (result === confirm) {
            await updateGlobalSetting(autoStartDesignTimeSetting, true);
            startDesignTimeApi(projectPath);
          } else if (result === DialogResponses.learnMore) {
            await openUrl('https://learn.microsoft.com/en-us/azure/azure-functions/functions-develop-local');
          } else if (result === DialogResponses.dontWarnAgain) {
            await updateGlobalSetting(showStartDesignTimeMessageSetting, false);
          }
        } while (result === DialogResponses.learnMore);
      }
    }
  }
}

/**
 * Creates a JSON file in the specified directory with the given file name and content.
 * If the file already exists, it will not be overwritten.
 * @param {Uri} directory - The directory where the file will be created.
 * @param {string} fileName - The name of the file to be created.
 * @param {hostFileContent | ILocalSettingsJson}fileContent - The content of the file to be created.
 * @returns A Promise that resolves when the file is created successfully.
 */
export async function createJsonFile(
  directory: Uri,
  fileName: string,
  fileContent: typeof hostFileContent | ILocalSettingsJson
): Promise<void> {
  const filePath: Uri = Uri.file(path.join(directory.fsPath, fileName));

  // Create file
  if (!fs.existsSync(filePath.fsPath)) {
    await writeFormattedJson(filePath.fsPath, fileContent);
  }
}
