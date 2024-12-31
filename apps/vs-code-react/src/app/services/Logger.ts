import type { ILoggerService, LogEntry, TelemetryEvent } from '@microsoft/logic-apps-shared';
import { guid } from '@microsoft/logic-apps-shared';
import { ExtensionCommand, type MessageToVsix } from '@microsoft/vscode-extension-logic-apps';
type traceStart = Pick<TelemetryEvent, 'action' | 'actionModifier' | 'name' | 'source'>;

interface LoggerContext {
  designerVersion: string;
  dataMapperVersion?: number;
}

/**
 * Starts measuring the duration of an event and returns its unique identifier.
 * @param eventName - A string denoting the name of the trace event to start.
 * @returns A string serving as a unique identifier to end the trace later.
 */
export class LoggerService implements ILoggerService {
  private sendMsgToVsix: (msg: MessageToVsix) => void;
  private inProgressTraces = new Map<string, { data: Record<string, any>; startTimestamp: number }>();
  private context: LoggerContext;

  /**
   * Initializes a new instance of the DataMapperLoggerService.
   * @param sendMsgToVsix - A callback function for sending messages to a VSIX extension.
   * @param context - An object specifying the environment or context in which the logger operates.
   */
  constructor(sendMsgToVsix: (msg: MessageToVsix) => void, context: LoggerContext) {
    this.sendMsgToVsix = sendMsgToVsix;
    this.context = context;
  }

  /**
   * Logs a telemetry event with a specified name and supplementary data.
   * @param name - A string identifying the name of the event.
   * @param data - A record of key-value pairs providing additional details for the event.
   */
  public log = (entry: Omit<LogEntry, 'timestamp'>) => {
    this.sendMsgToVsix({
      command: ExtensionCommand.logTelemetry,
      data: { ...entry, timestamp: Date.now(), args: [...(entry.args ?? []), this.context] },
    });
  };

  /**
   * Provides methods for logging telemetry events and measuring trace durations within a data mapper context.
   * @remarks
   * This service sends messages to a VSIX extension to record both one-off telemetry events and longer-duration
   * trace operations. Each operation logs a timestamp, relevant context, and optional custom data.
   */

  public startTrace = (eventData: traceStart): string => {
    const id = guid();
    const startTimestamp = Date.now();
    this.sendMsgToVsix({
      command: ExtensionCommand.logTelemetry,
      data: { ...eventData, timestamp: startTimestamp, actionModifier: 'start', duration: 0, data: { id, context: this.context } },
    });

    this.inProgressTraces.set(id, { data: eventData, startTimestamp });
    return id;
  };

  /**
   * Ends a previously started trace event and logs the total measured duration.
   * @param id - The unique identifier returned by the startTrace method.
   * @param eventName - The name used to identify the trace event.
   * @param data - Additional custom data to attach to the trace event log.
   */
  public endTrace = (id: string, eventData?: Pick<TelemetryEvent, 'data'> | undefined) => {
    const traceData = this.inProgressTraces.get(id);
    const endTimestamp = Date.now();
    if (!traceData) {
      return;
    }
    this.inProgressTraces.delete(id);
    this.sendMsgToVsix({
      command: ExtensionCommand.logTelemetry,
      data: {
        ...traceData.data,
        timestamp: endTimestamp,
        actionModifier: 'end',
        duration: endTimestamp - traceData.startTimestamp,
        data: { ...eventData?.data, context: this.context, id },
      },
    });
  };
}
