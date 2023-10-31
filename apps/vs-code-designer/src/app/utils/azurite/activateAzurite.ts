/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
  azuriteBinariesLocationSetting,
  azuriteExtensionPrefix,
  azuriteLocationSetting,
  defaultAzuritePathValue,
  extensionCommand,
  showAutoStartAzuriteWarning,
} from '../../../constants';
import { localize } from '../../../localize';
import { executeOnAzurite } from '../../azuriteExtension/executeOnAzuriteExt';
import { isFunctionProject } from '../verifyIsProject';
import { getWorkspaceSetting, updateGlobalSetting, updateWorkspaceSetting } from '../vsCodeConfig/settings';
import { DialogResponses, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import type { MessageItem } from 'vscode';

/**
 * Prompts user to set azurite.location and Start Azurite.
 * If azurite extension location was not set:
 * Overrides default Azurite location to new default location.
 * User can specify location.
 */
export async function activateAzurite(context: IActionContext): Promise<void> {
  if (vscode.workspace.workspaceFolders.length > 0 && (await isFunctionProject(vscode.workspace.workspaceFolders[0].uri.fsPath))) {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const workspacePath = workspaceFolder.uri.fsPath;

    const globalAzuriteLocationSetting: string = getWorkspaceSetting<string>(azuriteLocationSetting, workspacePath, azuriteExtensionPrefix);
    context.telemetry.properties.globalAzuriteLocation = globalAzuriteLocationSetting;

    const azuriteLocationExtSetting: string = getWorkspaceSetting<string>(azuriteBinariesLocationSetting);

    const showAutoStartAzuriteWarningSetting = !!getWorkspaceSetting<boolean>(showAutoStartAzuriteWarning);

    const autoStartAzuriteKey = 'autoStartAzurite';
    const autoStartAzurite = !!getWorkspaceSetting<boolean>(autoStartAzuriteKey);
    context.telemetry.properties.autoStartAzurite = `${autoStartAzurite}`;

    if (showAutoStartAzuriteWarningSetting) {
      const enableMessage: MessageItem = { title: localize('enableAutoStart', 'Enable AutoStart') };

      const result = await context.ui.showWarningMessage(
        localize('autoStartAzuriteTitle', 'Configure Azurite to autostart on project launch?'),
        enableMessage,
        DialogResponses.no,
        DialogResponses.dontWarnAgain
      );

      if (result == DialogResponses.dontWarnAgain) {
        await updateGlobalSetting(showAutoStartAzuriteWarning, false);
      } else if (result == enableMessage) {
        await updateGlobalSetting(showAutoStartAzuriteWarning, false);
        await updateGlobalSetting(autoStartAzuriteKey, true);

        // User has not configured workspace azurite.location.
        if (!azuriteLocationExtSetting) {
          const defaultAzuriteDir = defaultAzuritePathValue;
          const azuriteDir = await context.ui.showInputBox({
            placeHolder: localize('configureAzuriteLocation', 'Azurite Location'),
            prompt: localize('configureWebhookEndpointPrompt', 'Configure Azurite Workspace location folder path'),
            value: defaultAzuriteDir,
          });

          if (azuriteDir) {
            await updateGlobalSetting(azuriteBinariesLocationSetting, azuriteDir);
          } else {
            await updateGlobalSetting(azuriteBinariesLocationSetting, defaultAzuriteDir);
          }
        }
      }
    }

    if (getWorkspaceSetting<boolean>(autoStartAzuriteKey)) {
      const azuriteWorkspaceSetting = getWorkspaceSetting<string>(azuriteBinariesLocationSetting);
      await updateWorkspaceSetting(azuriteLocationSetting, azuriteWorkspaceSetting, workspacePath, azuriteExtensionPrefix);
      await executeOnAzurite(context, extensionCommand.azureAzuriteStart);
      context.telemetry.properties.azuriteStart = 'true';
      context.telemetry.properties.azuriteLocation = azuriteWorkspaceSetting;
    }
  }
}