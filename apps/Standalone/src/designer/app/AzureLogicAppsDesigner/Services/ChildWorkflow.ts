import type { ArmResources } from '../Models/Arm';
import type { Workflow } from '../Models/Workflow';
import { hybridApiVersion, HybridAppUtility } from '../Utilities/HybridAppUtilities';
import type { HttpClient } from './HttpClient';
import type { ListDynamicValue } from '@microsoft/logic-apps-shared';
import { hasProperty, getPropertyValue } from '@microsoft/logic-apps-shared';

export interface DynamicCallServiceOptions {
  apiVersion: string;
  baseUrl: string;
  siteResourceId: string;
  httpClient: HttpClient;
  isHybrid?: boolean;
}

interface ChildWorkflowServiceOptions extends DynamicCallServiceOptions {
  workflowName: string;
}

export class ChildWorkflowService {
  private _workflowsRequestSchema: Record<string, any> | undefined;

  constructor(private readonly options: ChildWorkflowServiceOptions) {
    const { apiVersion, baseUrl, httpClient, siteResourceId, workflowName } = this.options;

    if (!apiVersion) {
      throw new Error('apiVersion required');
    }
    if (!baseUrl) {
      throw new Error('baseUrl required');
    }
    if (!siteResourceId) {
      throw new Error('siteResourceId required');
    }
    if (!workflowName) {
      throw new Error('workflowName required');
    }
    if (!httpClient) {
      throw new Error('httpClient required');
    }
  }

  public async getWorkflowsWithRequestTrigger(): Promise<ListDynamicValue[]> {
    const { workflowName } = this.options;

    if (this._workflowsRequestSchema === undefined) {
      this._workflowsRequestSchema = await this._getWorkflowsWithSingleRequestTrigger();
    }

    const workflows = Object.keys(this._workflowsRequestSchema);
    return workflows
      .filter((workflow) => workflow.toLowerCase() !== workflowName.toLowerCase())
      .map((workflow) => ({ value: workflow, displayName: workflow }));
  }

  public async getWorkflowTriggerSchema(workflowName: string): Promise<Record<string, any>> {
    const normalizedName = workflowName.toLowerCase();
    if (this._workflowsRequestSchema?.[normalizedName]) {
      return this._workflowsRequestSchema[normalizedName];
    }

    try {
      const workflowUrl = `${this.options.siteResourceId}/workflows/${workflowName}`;
      const workflowContent = await this._getWorkflowContent(workflowUrl);
      const {
        definition: { triggers },
      } = workflowContent;
      const schema = getTriggerSchema(triggers);

      if (this._workflowsRequestSchema === undefined) {
        this._workflowsRequestSchema = {};
      }

      this._workflowsRequestSchema[normalizedName] = schema;

      return schema;
    } catch {
      // TODO(psamband): Log error but do not throw.
      return {};
    }
  }

  public async getLogicAppSwagger(workflowId: string): Promise<Record<string, any>> {
    if (hasProperty(this._workflowsRequestSchema ?? {}, workflowId)) {
      return getPropertyValue(this._workflowsRequestSchema, workflowId);
    }

    try {
      const { baseUrl, httpClient } = this.options;
      const workflowContent = await httpClient.get<any>({
        uri: `${baseUrl}${workflowId}`,
        queryParameters: { 'api-version': '2019-05-01' },
      });
      const schema = getTriggerSchema(workflowContent.properties?.definition?.triggers ?? {});

      if (this._workflowsRequestSchema === undefined) {
        this._workflowsRequestSchema = {};
      }

      this._workflowsRequestSchema[workflowId] = schema;

      return schema;
    } catch {
      // TODO(psamband): Log error but do not throw.
      return {};
    }
  }

  private async _getWorkflowsWithSingleRequestTrigger(): Promise<Record<string, any>> {
    const workflowsInApp = await this._listWorkflows();
    const workflowsWithSingleRequestTrigger: Record<string, any> = {};

    // Create an array of promises for all workflow content fetches
    const workflowPromises = workflowsInApp.map(async (workflow) => {
      const { id } = workflow;
      const workflowContent = await this._getWorkflowContent(id);

      if (workflowContent !== undefined && hasSingleRequestTrigger(workflowContent?.definition?.triggers)) {
        const workflowName = id.split('/').slice(-1)[0];
        return {
          name: workflowName.toLowerCase(),
          triggerSchema: getTriggerSchema(workflowContent.definition.triggers),
        };
      }
      return null;
    });

    // Await all promises in parallel, allowing partial failures
    const results = await Promise.allSettled(workflowPromises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        workflowsWithSingleRequestTrigger[result.value.name] = result.value.triggerSchema;
      }
    }

    return workflowsWithSingleRequestTrigger;
  }

  private async _listWorkflows(): Promise<Workflow[]> {
    const { apiVersion, baseUrl, siteResourceId, httpClient, isHybrid } = this.options;

    // Compose the logicApp resource ID when hybrid
    const resourceId = isHybrid ? HybridAppUtility.getHybridAppBaseRelativeUrl(siteResourceId) : siteResourceId;

    const response = await httpClient.get<ArmResources<Workflow>>({
      uri: `${baseUrl}${resourceId}/workflows`,
      queryParameters: { 'api-version': isHybrid ? hybridApiVersion : apiVersion },
    });

    return response.value;
  }

  private async _getWorkflowContent(resourceId: string): Promise<any> {
    const { apiVersion, baseUrl, httpClient, isHybrid } = this.options;
    const response = await httpClient.get<Workflow>({
      uri: `${baseUrl}${resourceId}`,
      queryParameters: { 'api-version': isHybrid ? hybridApiVersion : apiVersion },
    });
    if (response?.properties?.health?.state.toLowerCase() === 'healthy') {
      return response.properties.files ? response.properties.files['workflow.json'] : undefined;
    }

    return undefined;
  }
}

function hasSingleRequestTrigger(triggers: Record<string, any>): boolean {
  const triggerKeys = Object.keys(triggers || {});

  if (triggerKeys.length !== 1) {
    return false;
  }

  const { kind, type } = triggers[triggerKeys[0]];
  return type.toLowerCase() === 'request' && kind.toLowerCase() === 'http';
}

function getTriggerSchema(triggers: Record<string, any>): any {
  const trigger = triggers[Object.keys(triggers)[0]];
  return trigger.inputs && trigger.inputs.schema ? trigger.inputs.schema : {};
}
